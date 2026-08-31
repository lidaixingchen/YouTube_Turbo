import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import type { PolymerElementInstance } from "./types";

export class InfoMirrorEngine {
  private static instance: InfoMirrorEngine | null = null;
  private mirrorNodeCache: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private sourceNodeCache: WeakMap<HTMLElement, WeakRef<HTMLElement>> = new WeakMap();
  private dummyNode: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.NOSCRIPT);
  private templateContainer: HTMLElement | null = null;
  private aythlContainer: HTMLElement | null = null;

  public static getInstance(): InfoMirrorEngine {
    if (!InfoMirrorEngine.instance) {
      InfoMirrorEngine.instance = new InfoMirrorEngine();
    }
    return InfoMirrorEngine.instance;
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
   * 执行 extra-content 与主描述的镜像与同步
   */
  public runInfoFix(): void {
    const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const mainInfoRenderer = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TYT_INFO_RENDERER);

    if (!tabInfo || !flexy) {
      return;
    }

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
        isTopologyChanged = true;
      }

      const mirrorCnt = PolymerHelper.insp(mirrorEl);
      if (mirrorCnt && srcCnt?.data && mirrorCnt.data !== srcCnt.data) {
        // 利用虚拟占位节点保证深层 Polymer 干净重置
        mirrorEl.replaceWith(this.dummyNode);
        mirrorCnt.data = Object.assign({}, srcCnt.data);
        this.dummyNode.replaceWith(mirrorEl);
      }

      mirrorElements.push(mirrorEl);
    }

    // 检查 DOM 现有子节点排布是否需要实际变动 (Dirty Checking)
    if (!isTopologyChanged) {
      const currentChildren = Array.from(tabInfo.children);
      const expectedChildren = [mainInfoRenderer, ...mirrorElements].filter(Boolean) as HTMLElement[];
      if (
        currentChildren.length !== expectedChildren.length ||
        currentChildren.some((el, idx) => el !== expectedChildren[idx])
      ) {
        isTopologyChanged = true;
      }
    }

    if (isTopologyChanged) {
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
      let el: HTMLElement | null = rawElements[i];
      const cnt = PolymerHelper.insp(el);
      if (cnt && typeof cnt.is === "string") {
        const targetTag = cnt.is;
        while (el && el instanceof HTMLElement) {
          const matched = Array.from(el.querySelectorAll<HTMLElement>(targetTag)).filter(
            (candidate) => Boolean(PolymerHelper.insp(candidate)?.data)
          );
          if (matched.length > 0) {
            result.push(matched[0]);
            break;
          }
          el = el.parentElement;
        }
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
      let shouldRefresh = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (
          m.attributeName === PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT ||
          m.attributeName === PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER
        ) {
          shouldRefresh = true;
          break;
        }
      }

      if (shouldRefresh) {
        const currentSrcCnt = PolymerHelper.insp(sourceEl);
        const currentMirCnt = PolymerHelper.insp(mirrorEl);
        if (currentSrcCnt?.data && currentMirCnt) {
          mirrorEl.replaceWith(this.dummyNode);
          currentMirCnt.data = Object.assign({}, currentSrcCnt.data);
          this.dummyNode.replaceWith(mirrorEl);
        }
      }
    });

    observer.observe(sourceEl, {
      attributes: true,
      attributeFilter: [
        PAGE_CONSTANTS.ATTRIBUTES.TYT_CLONE_REFRESH_COUNT,
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
