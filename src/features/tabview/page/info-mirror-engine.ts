import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { fixInlineExpanderMethods } from "./expander-fixer";
import type { PolymerElementInstance } from "./types";

export class InfoMirrorEngine {
  private static instance: InfoMirrorEngine | null = null;
  private mirrorNodeCache: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private sourceNodeCache: WeakMap<HTMLElement, WeakRef<HTMLElement>> = new WeakMap();
  private lastSyncedDataMap: WeakMap<HTMLElement, unknown> = new WeakMap();
  private dummyNode: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.NOSCRIPT);
  private templateContainer: HTMLElement | null = null;
  private aythlContainer: HTMLElement | null = null;
  private extraContentObserver: MutationObserver | null = null;
  private isFixing: boolean = false;

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
          this.runInfoFix();
        }
      });
    }
    this.extraContentObserver.disconnect();
    const extraContentContainer =
      metadataElement.querySelector<HTMLElement>('div[slot="extra-content"], #extra-content');

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
    this.disconnectExtraContent();
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
      'ytd-watch-metadata ytd-expandable-video-description-body-renderer:not([tyt-info-renderer]), #below ytd-expandable-video-description-body-renderer:not([tyt-info-renderer]), ytd-expandable-video-description-body-renderer:not([tyt-info-renderer]):not([tyt-main-info])'
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

      const mirrorCnt = PolymerHelper.insp(mirrorNode);
      const rawCnt = PolymerHelper.insp(nativeNode);
      const lastData = this.lastSyncedDataMap.get(mirrorNode);
      if (mirrorCnt && rawCnt?.data && rawCnt.data !== lastData) {
        mirrorNode.replaceWith(this.dummyNode);
        mirrorCnt.data = Object.assign({}, rawCnt.data);
        this.dummyNode.replaceWith(mirrorNode);
        this.lastSyncedDataMap.set(mirrorNode, rawCnt.data);
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
        this.bindDataReflection(srcEl, mirrorEl);
        this.mirrorNodeCache.set(srcEl, mirrorEl);
        this.sourceNodeCache.set(mirrorEl, new WeakRef(srcEl));
        if (srcCnt?.data) {
          const mirrorCnt = PolymerHelper.insp(mirrorEl);
          if (mirrorCnt) {
            mirrorCnt.data = Object.assign({}, srcCnt.data);
          }
          this.lastSyncedDataMap.set(mirrorEl, srcCnt.data);
        }
        isTopologyChanged = true;
      } else {
        const mirrorCnt = PolymerHelper.insp(mirrorEl);
        const lastData = this.lastSyncedDataMap.get(mirrorEl);
        if (mirrorCnt && srcCnt?.data && srcCnt.data !== lastData) {
          mirrorEl.replaceWith(this.dummyNode);
          mirrorCnt.data = Object.assign({}, srcCnt.data);
          this.dummyNode.replaceWith(mirrorEl);
          this.lastSyncedDataMap.set(mirrorEl, srcCnt.data);
        }
      }

      mirrorElements.push(mirrorEl);
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
   * 查询所有待镜像的 extra-content 子源节点
   */
  private queryExtraContentSources(): HTMLElement[] {
    const rawElements = Array.from(
      document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.EXTRA_CONTENT_SOURCES)
    );

    const result: HTMLElement[] = [];
    for (let i = 0; i < rawElements.length; i++) {
      const el = rawElements[i];
      if (!el || el.closest("noscript") || el.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)) {
        continue;
      }

      const cnt = PolymerHelper.insp(el);
      const is = (typeof cnt?.is === "string" ? cnt.is : el.tagName.toLowerCase());
      let matchedDeepEl: HTMLElement | null = null;

      let cur: HTMLElement | null = el;
      while (cur && cur instanceof HTMLElement) {
        const queryList = Array.from(cur.querySelectorAll<HTMLElement>(is)).filter(
          (candidate) => Boolean(PolymerHelper.insp(candidate)?.data)
        );
        if (queryList.length > 0) {
          matchedDeepEl = queryList[0];
          break;
        }
        if (PolymerHelper.insp(cur)?.data) {
          matchedDeepEl = cur;
          break;
        }
        cur = cur.parentElement;
      }

      const finalEl = matchedDeepEl || (cnt?.data ? el : null);
      if (finalEl && !result.includes(finalEl)) {
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
    sourceEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED, "1");

    const srcCnt = PolymerHelper.insp(sourceEl);
    const cProto = srcCnt ? Object.getPrototypeOf(srcCnt) : null;

    // 1. 传统 Polymer 属性观察器拦截
    if (cProto && !(cProto instanceof Node) && !cProto._dataChangedObserver && typeof cProto._createPropertyObserver === "function") {
      cProto._dataChangedObserver = function (this: PolymerElementInstance): void {
        const node = this.hostElement || (this as unknown as HTMLElement);
        if (node instanceof HTMLElement && node.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED)) {
          const current = Number(node.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER) || "0") + 1;
          node.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER, String(current > 1e9 ? 1 : current));
        }
      };
      cProto._createPropertyObserver("data", "_dataChangedObserver", undefined);
    }

    // 2. YouTube Polymer Signals 拦截
    const dataSignal = srcCnt?.signalProxy?.signalCache?.data;
    if (dataSignal && typeof dataSignal.setWithPath === "function" && !dataSignal.__patched) {
      dataSignal.__patched = true;
      const rawSetWithPath = dataSignal.setWithPath;
      dataSignal.setWithPath = function (this: unknown, ...args: unknown[]): unknown {
        const result = rawSetWithPath.apply(this, args);
        if (sourceEl.isConnected) {
          const current = Number(sourceEl.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER) || "0") + 1;
          sourceEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER, String(current > 1e9 ? 1 : current));
        }
        return result;
      };
    }

    // 3. MutationObserver 触发镜像数据刷新
    const observer = new MutationObserver((mutations) => {
      if (this.isFixing) {
        return;
      }
      let shouldRefresh = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.attributeName === PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER) {
          shouldRefresh = true;
          break;
        }
      }

      if (shouldRefresh) {
        const currentSrcCnt = PolymerHelper.insp(sourceEl);
        const currentMirCnt = PolymerHelper.insp(mirrorEl);
        const lastData = this.lastSyncedDataMap.get(mirrorEl);
        if (currentSrcCnt?.data && currentMirCnt && currentSrcCnt.data !== lastData) {
          this.isFixing = true;
          try {
            mirrorEl.replaceWith(this.dummyNode);
            currentMirCnt.data = Object.assign({}, currentSrcCnt.data);
            this.dummyNode.replaceWith(mirrorEl);
            this.lastSyncedDataMap.set(mirrorEl, currentSrcCnt.data);
          } finally {
            this.isFixing = false;
          }
        }
      }
    });

    observer.observe(sourceEl, {
      attributes: true,
      attributeFilter: [
        PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER
      ]
    });
  }

  /**
   * 递增刷新计数器触发全局双向同步
   */
  private notifyRefreshCount(mirrorElements: HTMLElement[]): void {
    for (let i = 0; i < mirrorElements.length; i++) {
      const mirrorEl = mirrorElements[i];
      const current = Number(mirrorEl.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT) || "0") + 1;
      const countVal = String(current > 1e9 ? 1 : current);
      mirrorEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT, countVal);

      const srcWeakRef = this.sourceNodeCache.get(mirrorEl);
      const srcEl = srcWeakRef?.deref();
      if (srcEl && srcEl.isConnected) {
        srcEl.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT, countVal);
      }
    }
  }
}
