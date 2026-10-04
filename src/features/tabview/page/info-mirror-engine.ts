import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { fixInlineExpanderMethods } from "./expander-fixer";
import type { PolymerElementInstance } from "./types";

type PolymerDataSignal = NonNullable<
  NonNullable<NonNullable<PolymerElementInstance["signalProxy"]>["signalCache"]>["data"]
>;
type PolymerDataSignalSetter = NonNullable<PolymerDataSignal["setWithPath"]>;

interface DataReflectionBinding {
  readonly mirrorEl: HTMLElement;
  readonly observer: MutationObserver;
  readonly dataSignal: PolymerDataSignal | null;
  readonly lifecycleToken: object;
}

interface DataSignalPatchRecord {
  readonly signal: PolymerDataSignal;
  readonly originalSetWithPath: PolymerDataSignalSetter;
  readonly wrappedSetWithPath: PolymerDataSignalSetter;
  readonly previousPatched: boolean | undefined;
  readonly sources: Set<HTMLElement>;
}

function incrementDataChangeCounter(sourceEl: HTMLElement): void {
  const current: number = Number(sourceEl.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER) || "0") + 1;
  sourceEl.setAttribute(
    PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER,
    String(current > PAGE_CONSTANTS.THRESHOLDS.MAX_CHANGE_COUNTER ? 1 : current)
  );
}

export class InfoMirrorEngine {
  private static instance: InfoMirrorEngine | null = null;
  private mirrorNodeCache: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private sourceNodeCache: WeakMap<HTMLElement, WeakRef<HTMLElement>> = new WeakMap();
  private lastSyncedDataMap: WeakMap<HTMLElement, unknown> = new WeakMap();
  private dataReflectionBindings: Map<HTMLElement, DataReflectionBinding> = new Map();
  private dataSignalPatchRecords: Map<PolymerDataSignal, DataSignalPatchRecord> = new Map();
  private templateContainer: HTMLElement | null = null;
  private aythlContainer: HTMLElement | null = null;
  private extraContentObserver: MutationObserver | null = null;
  private isFixing: boolean = false;
  private pendingInfoFix: boolean = false;
  private pendingMicrotask: boolean = false;
  private pendingSyncQueue: Set<HTMLElement> = new Set();
  private lifecycleToken: object = {};

  public static getInstance(): InfoMirrorEngine {
    if (!InfoMirrorEngine.instance) {
      InfoMirrorEngine.instance = new InfoMirrorEngine();
    }
    return InfoMirrorEngine.instance;
  }

  /**
   * 监听 extra-content 容器的子节点动态注入
   */
  public observeExtraContent(metadataElement: HTMLElement): void {
    if (!this.extraContentObserver) {
      this.extraContentObserver = new MutationObserver(() => {
        if (!this.isFixing) {
          this.scheduleInfoFix();
        }
      });
    }
    this.extraContentObserver.disconnect();
    const extraContentContainer =
      metadataElement.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.EXTRA_CONTENT_CONTAINER);

    if (extraContentContainer) {
      this.extraContentObserver.observe(extraContentContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  public disconnectExtraContent(): void {
    if (this.extraContentObserver) {
      this.extraContentObserver.disconnect();
      this.extraContentObserver = null;
    }
  }

  public destroy(): void {
    this.lifecycleToken = {};
    this.disconnectExtraContent();
    const bindings: Array<[HTMLElement, DataReflectionBinding]> = Array.from(this.dataReflectionBindings.entries());
    for (let i = 0; i < bindings.length; i++) {
      this.releaseDataReflection(bindings[i][0], bindings[i][1]);
    }
    this.pendingSyncQueue.clear();
    this.pendingInfoFix = false;
    this.pendingMicrotask = false;
    this.isFixing = false;
    this.mirrorNodeCache = new WeakMap();
    this.sourceNodeCache = new WeakMap();
    this.lastSyncedDataMap = new WeakMap();
    this.templateContainer = null;
    this.aythlContainer = null;
  }

  /**
   * 获取或初始化 noscript 模板沙盒
   */
  public getOrCreateTemplateSandbox(): HTMLElement {
    if (!this.templateContainer || !this.templateContainer.isConnected) {
      let ns = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEMPLATE_SANDBOX);
      if (!ns) {
        ns = document.createElement(PAGE_CONSTANTS.TAGS.NOSCRIPT);
        ns.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.NS_TEMPLATE, "");
        const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
        flexy?.appendChild(ns);
      }
      this.templateContainer = ns;
    }
    return this.templateContainer;
  }

  /**
   * 获取或初始化 aythl 镜像暂存沙盒
   */
  public getOrCreateAythlSandbox(flexy: HTMLElement): HTMLElement {
    if (!this.aythlContainer || !this.aythlContainer.isConnected) {
      let ns = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.AYTHL_SANDBOX);
      if (!ns) {
        ns = document.createElement(PAGE_CONSTANTS.TAGS.NOSCRIPT);
        ns.id = PAGE_CONSTANTS.IDS.AYTHL;
        flexy.insertBefore(ns, flexy.firstChild);
      }
      this.aythlContainer = ns;
    }
    return this.aythlContainer;
  }

  /**
   * 确保并获取主视频描述的镜像节点，支持自愈发现与数据初始化
   */
  public ensureMainDescription(): HTMLElement | null {
    let mirrorNode = document.querySelector<HTMLElement>(
      `${PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER}]`
    );

    const nativeNode = document.querySelector<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.NATIVE_DESCRIPTION_CANDIDATES
    );

    if (!mirrorNode && nativeNode) {
      const sandbox = this.getOrCreateTemplateSandbox();
      mirrorNode = document.createElement(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
      mirrorNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER, "");
      mirrorNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER_FRONT, "");
      mirrorNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO, "");
      mirrorNode.classList.add(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
      sandbox.appendChild(mirrorNode);
      nativeNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER_BACK, "");
    }

    if (mirrorNode && nativeNode) {
      this.bindDataReflection(nativeNode, mirrorNode);
      this.sourceNodeCache.set(mirrorNode, new WeakRef(nativeNode));

      const rawCnt = PolymerHelper.insp(nativeNode);
      const lastData = this.lastSyncedDataMap.get(mirrorNode);
      if (rawCnt?.data && rawCnt.data !== lastData) {
        this.syncElementData(mirrorNode, rawCnt.data);
      }
      const inlineExpander = mirrorNode.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
      if (inlineExpander) {
        const inlineCnt = PolymerHelper.insp(inlineExpander);
        if (inlineCnt) {
          fixInlineExpanderMethods(inlineCnt);
        }
      }
    }

    return mirrorNode;
  }

  /**
   * SPA 路由切歌时同步主描述数据
   */
  public syncMainDescriptionData(): void {
    if (this.isFixing) {
      return;
    }
    this.isFixing = true;
    try {
      this.ensureMainDescription();
      const metadata = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
      if (metadata) {
        this.observeExtraContent(metadata);
      }
      this.runInfoFixInternal();
    } finally {
      this.isFixing = false;
    }
  }

  /**
   * 执行 extra-content 与主描述的镜像与同步
   */
  public runInfoFix(): void {
    if (this.isFixing) {
      return;
    }
    this.isFixing = true;
    try {
      this.runInfoFixInternal();
    } finally {
      this.isFixing = false;
    }
  }

  /**
   * 微任务批处理调度：聚合高频属性突变，避免单帧内重复执行镜像
   */
  public scheduleInfoFix(): void {
    this.pendingInfoFix = true;
    this.schedulePendingWork();
  }

  /**
   * 批处理排队单个镜像节点数据刷新
   */
  private scheduleMirrorSync(sourceEl: HTMLElement, mirrorEl: HTMLElement): void {
    const currentSrcCnt = PolymerHelper.insp(sourceEl);
    if (!currentSrcCnt?.data) {
      return;
    }

    this.pendingSyncQueue.add(mirrorEl);
    this.schedulePendingWork();
  }

  private schedulePendingWork(): void {
    if (this.pendingMicrotask) {
      return;
    }
    this.pendingMicrotask = true;
    const lifecycleToken: object = this.lifecycleToken;
    queueMicrotask(() => {
      if (this.lifecycleToken !== lifecycleToken) {
        return;
      }
      this.pendingMicrotask = false;
      const shouldFixInfo: boolean = this.pendingInfoFix;
      this.pendingInfoFix = false;
      try {
        if (shouldFixInfo) {
          this.runInfoFix();
        }
      } finally {
        this.flushPendingSyncs();
      }
    });
  }

  /**
   * 清空并执行待同步队列
   */
  private flushPendingSyncs(): void {
    if (this.pendingSyncQueue.size === 0) {
      return;
    }
    const elements: HTMLElement[] = Array.from(this.pendingSyncQueue);
    this.pendingSyncQueue.clear();

    for (let i = 0; i < elements.length; i++) {
      const mirrorEl = elements[i];
      const srcWeakRef = this.sourceNodeCache.get(mirrorEl);
      const srcEl = srcWeakRef?.deref();
      if (!srcEl || !srcEl.isConnected) {
        continue;
      }
      const binding: DataReflectionBinding | undefined = this.dataReflectionBindings.get(srcEl);
      if (!binding || binding.mirrorEl !== mirrorEl || binding.lifecycleToken !== this.lifecycleToken) {
        continue;
      }
      const srcCnt = PolymerHelper.insp(srcEl);
      if (srcCnt?.data) {
        this.syncElementData(mirrorEl, srcCnt.data);
      }
    }
  }

  /**
   * 就地安全更新 Polymer 数据模型，消除 DOM 树插拔与回流
   */
  private syncElementData(mirrorEl: HTMLElement, srcData: unknown): void {
    if (!srcData || typeof srcData !== "object") {
      return;
    }
    const mirrorCnt = PolymerHelper.insp(mirrorEl);
    if (!mirrorCnt) {
      return;
    }
    const clonedData: Record<string, unknown> = Object.assign({}, srcData as Record<string, unknown>);
    if (typeof mirrorCnt.set === "function") {
      mirrorCnt.set("data", clonedData);
    } else {
      mirrorCnt.data = clonedData;
    }
    if (typeof mirrorCnt.notifyPath === "function") {
      mirrorCnt.notifyPath("data");
    }
    this.lastSyncedDataMap.set(mirrorEl, srcData);
  }

  private runInfoFixInternal(): void {
    const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!tabInfo || !flexy) {
      return;
    }

    const mainInfoRenderer = this.ensureMainDescription();
    const sourceElements = this.queryExtraContentSources();
    const mirrorElements: HTMLElement[] = [];
    const sandbox = this.getOrCreateAythlSandbox(flexy);
    let isTopologyChanged = false;

    for (let i = 0; i < sourceElements.length; i++) {
      const srcEl = sourceElements[i];
      const srcCnt = PolymerHelper.insp(srcEl);
      const tagName = (typeof srcCnt?.is === "string" ? srcCnt.is : srcEl.tagName.toLowerCase());
      let mirrorEl = this.mirrorNodeCache.get(srcEl);

      if (!mirrorEl || !mirrorEl.isConnected) {
        mirrorEl = document.createElement(tagName);
        sandbox.appendChild(mirrorEl);
        this.mirrorNodeCache.set(srcEl, mirrorEl);
        isTopologyChanged = true;
      }

      this.bindDataReflection(srcEl, mirrorEl);
      const lastData = this.lastSyncedDataMap.get(mirrorEl);
      if (srcCnt?.data && srcCnt.data !== lastData) {
        this.syncElementData(mirrorEl, srcCnt.data);
      }

      mirrorElements.push(mirrorEl);
    }

    const activeSources: Set<HTMLElement> = new Set(sourceElements);
    if (mainInfoRenderer) {
      const mainSource = this.sourceNodeCache.get(mainInfoRenderer)?.deref();
      if (mainSource) {
        activeSources.add(mainSource);
      }
    }
    for (const [sourceEl, binding] of this.dataReflectionBindings) {
      if (!activeSources.has(sourceEl)) {
        this.releaseDataReflection(sourceEl, binding);
      }
    }

    const expectedChildren = [mainInfoRenderer, ...mirrorElements].filter(Boolean) as HTMLElement[];
    const currentChildren = Array.from(tabInfo.children);

    if (!isTopologyChanged) {
      if (
        currentChildren.length !== expectedChildren.length ||
        currentChildren.some((el, idx) => el !== expectedChildren[idx])
      ) {
        isTopologyChanged = true;
      }
    }

    if (isTopologyChanged && expectedChildren.length > 0) {
      this.assignTabInfoChildren(tabInfo, mainInfoRenderer, mirrorElements);
      this.notifyRefreshCount(mirrorElements);
    }
  }

  /**
   * 查询所有待镜像的 extra-content 子源节点（扁平化单遍扫描）
   */
  private queryExtraContentSources(): HTMLElement[] {
    const rawElements = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.EXTRA_CONTENT_SOURCES);
    const result: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    for (let i = 0; i < rawElements.length; i++) {
      const el = rawElements[i];
      if (!el || el.closest(PAGE_CONSTANTS.TAGS.NOSCRIPT) || el.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)) {
        continue;
      }

      let targetEl: HTMLElement | null = null;
      const directCnt = PolymerHelper.insp(el);
      if (directCnt?.data) {
        targetEl = el;
      } else {
        const children = el.querySelectorAll<HTMLElement>("*");
        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          if (PolymerHelper.insp(child)?.data) {
            targetEl = child;
            break;
          }
        }
      }

      const finalEl = targetEl || (directCnt ? el : null);
      if (finalEl && !seen.has(finalEl)) {
        seen.add(finalEl);
        result.push(finalEl);
      }
    }
    return result;
  }

  /**
   * 采用无闪烁 DocumentFragment 方式装配子节点
   */
  private assignTabInfoChildren(
    container: HTMLElement,
    mainNode: HTMLElement | null,
    nextSiblings: HTMLElement[]
  ): void {
    const fragment = document.createDocumentFragment();
    if (mainNode) {
      fragment.appendChild(mainNode);
    }
    for (let i = 0; i < nextSiblings.length; i++) {
      fragment.appendChild(nextSiblings[i]);
    }
    container.replaceChildren(fragment);
  }

  /**
   * 建立原生与镜像节点间的数据变动监听通道
   */
  private bindDataReflection(sourceEl: HTMLElement, mirrorEl: HTMLElement): void {
    const srcCnt: PolymerElementInstance | null = PolymerHelper.insp(sourceEl);
    const dataSignal: PolymerDataSignal | null = srcCnt?.signalProxy?.signalCache?.data ?? null;
    const previousMirrorSource: HTMLElement | undefined = this.sourceNodeCache.get(mirrorEl)?.deref();
    if (previousMirrorSource && previousMirrorSource !== sourceEl) {
      const previousBinding: DataReflectionBinding | undefined = this.dataReflectionBindings.get(previousMirrorSource);
      if (previousBinding?.mirrorEl === mirrorEl) {
        this.releaseDataReflection(previousMirrorSource, previousBinding);
      }
    }

    const existingBinding: DataReflectionBinding | undefined = this.dataReflectionBindings.get(sourceEl);
    if (existingBinding?.mirrorEl === mirrorEl && existingBinding.dataSignal === dataSignal) {
      this.sourceNodeCache.set(mirrorEl, new WeakRef(sourceEl));
      return;
    }
    if (existingBinding) {
      this.releaseDataReflection(sourceEl, existingBinding);
    }

    sourceEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED, "1");
    const cProto = srcCnt ? Object.getPrototypeOf(srcCnt) : null;

    // 1. 传统 Polymer 属性观察器拦截
    if (cProto && !(cProto instanceof Node) && !cProto._dataChangedObserver && typeof cProto._createPropertyObserver === "function") {
      cProto._dataChangedObserver = function (this: PolymerElementInstance): void {
        const node = this.hostElement || (this as unknown as HTMLElement);
        if (node instanceof HTMLElement && node.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED)) {
          incrementDataChangeCounter(node);
        }
      };
      cProto._createPropertyObserver("data", "_dataChangedObserver", undefined);
    }

    this.bindDataSignal(sourceEl, dataSignal);

    const lifecycleToken: object = this.lifecycleToken;
    let binding: DataReflectionBinding;
    const observer: MutationObserver = new MutationObserver((mutations: MutationRecord[]): void => {
      if (this.lifecycleToken !== lifecycleToken || this.dataReflectionBindings.get(sourceEl) !== binding) {
        return;
      }
      let shouldRefresh: boolean = false;
      for (let i = 0; i < mutations.length; i++) {
        const m: MutationRecord = mutations[i];
        if (m.attributeName === PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER) {
          shouldRefresh = true;
          break;
        }
      }

      if (shouldRefresh) {
        this.scheduleMirrorSync(sourceEl, mirrorEl);
      }
    });

    binding = { mirrorEl, observer, dataSignal, lifecycleToken };
    this.dataReflectionBindings.set(sourceEl, binding);
    this.sourceNodeCache.set(mirrorEl, new WeakRef(sourceEl));
    observer.observe(sourceEl, {
      attributes: true,
      attributeFilter: [
        PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER
      ]
    });
  }

  private bindDataSignal(sourceEl: HTMLElement, dataSignal: PolymerDataSignal | null): void {
    if (!dataSignal || typeof dataSignal.setWithPath !== "function") {
      return;
    }

    let patchRecord: DataSignalPatchRecord | undefined = this.dataSignalPatchRecords.get(dataSignal);
    if (!patchRecord) {
      if (dataSignal.__patched) {
        return;
      }
      const originalSetWithPath: PolymerDataSignalSetter = dataSignal.setWithPath;
      const previousPatched: boolean | undefined = dataSignal.__patched;
      const sources: Set<HTMLElement> = new Set();
      const engine: InfoMirrorEngine = this;
      const wrappedSetWithPath: PolymerDataSignalSetter = function (this: unknown, ...args: unknown[]): unknown {
        const result = originalSetWithPath.apply(this, args);
        for (const boundSource of sources) {
          const binding: DataReflectionBinding | undefined = engine.dataReflectionBindings.get(boundSource);
          if (binding?.dataSignal === dataSignal && boundSource.isConnected) {
            incrementDataChangeCounter(boundSource);
          }
        }
        return result;
      };
      patchRecord = {
        signal: dataSignal,
        originalSetWithPath,
        wrappedSetWithPath,
        previousPatched,
        sources
      };
      dataSignal.setWithPath = wrappedSetWithPath;
      dataSignal.__patched = true;
      this.dataSignalPatchRecords.set(dataSignal, patchRecord);
    }
    patchRecord.sources.add(sourceEl);
  }

  private releaseDataReflection(sourceEl: HTMLElement, binding: DataReflectionBinding): void {
    if (this.dataReflectionBindings.get(sourceEl) !== binding) {
      return;
    }

    binding.observer.disconnect();
    this.dataReflectionBindings.delete(sourceEl);
    sourceEl.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED);
    sourceEl.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER);

    if (binding.dataSignal) {
      const patchRecord: DataSignalPatchRecord | undefined = this.dataSignalPatchRecords.get(binding.dataSignal);
      if (patchRecord) {
        patchRecord.sources.delete(sourceEl);
        if (patchRecord.sources.size === 0) {
          if (binding.dataSignal.setWithPath === patchRecord.wrappedSetWithPath) {
            binding.dataSignal.setWithPath = patchRecord.originalSetWithPath;
            if (patchRecord.previousPatched === undefined) {
              delete binding.dataSignal.__patched;
            } else {
              binding.dataSignal.__patched = patchRecord.previousPatched;
            }
          }
          this.dataSignalPatchRecords.delete(binding.dataSignal);
        }
      }
    }

    const mirrorSource: HTMLElement | undefined = this.sourceNodeCache.get(binding.mirrorEl)?.deref();
    if (mirrorSource === sourceEl) {
      this.sourceNodeCache.delete(binding.mirrorEl);
    }
  }

  /**
   * 递增刷新计数器触发全局双向同步
   */
  private notifyRefreshCount(mirrorElements: HTMLElement[]): void {
    for (let i = 0; i < mirrorElements.length; i++) {
      const mirrorEl = mirrorElements[i];
      const current = Number(mirrorEl.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT) || "0") + 1;
      const countVal = String(current > PAGE_CONSTANTS.THRESHOLDS.MAX_CHANGE_COUNTER ? 1 : current);
      mirrorEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT, countVal);

      const srcWeakRef = this.sourceNodeCache.get(mirrorEl);
      const srcEl = srcWeakRef?.deref();
      if (srcEl && srcEl.isConnected) {
        srcEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT, countVal);
      }
    }
  }
}

