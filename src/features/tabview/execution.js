  const executionScript = (communicationKey, initialLocaleData) => {
    const DEBUG_5084 = false;
    const DEBUG_5085 = false;
    const DEBUG_handleNavigateFactory = false;
    const TAB_AUTO_SWITCH_TO_COMMENTS = false;
    if (typeof trustedTypes !== "undefined" && trustedTypes.defaultPolicy === null) {
      let s = (s2) => s2;
      trustedTypes.createPolicy("default", { createHTML: s, createScriptURL: s, createScript: s });
    }
    const defaultPolicy = typeof trustedTypes !== "undefined" && trustedTypes.defaultPolicy || { createHTML: (s) => s };
    function createHTML(s) {
      return defaultPolicy.createHTML(s);
    }
    let trustHTMLErr = null;
    try {
      document.createElement("div").innerHTML = createHTML("1");
    } catch (e) {
      trustHTMLErr = e;
    }
    if (trustHTMLErr) {
      trustHTMLErr();
    }
    try {
      const pageLocaleData = (typeof initialLocaleData === "object" && initialLocaleData !== null) ? initialLocaleData : {
        locale: "en",
        direction: "ltr",
        messages: {
          tab_info: "Info",
          tab_videos: "Videos",
          tab_playlist: "Playlist"
        }
      };
      let getWord = function(tag) {
        const key = "tab_" + tag;
        return (pageLocaleData.messages && (pageLocaleData.messages[key] || pageLocaleData.messages[tag])) || tag;
      }, getTabsHTML = function() {
        const sTabBtnVideos = `${svgElm(16, 16, 90, 90, svgVideos)}<span>${getWord("videos")}</span>`;
        const sTabBtnInfo = `${svgElm(16, 16, 60, 60, svgInfo)}<span>${getWord("info")}</span>`;
        const sTabBtnPlayList = `${svgElm(16, 16, 20, 20, svgPlayList)}<span>${getWord("playlist")}</span>`;
        let str1 = `
        <paper-ripple class="style-scope yt-icon-button">
            <div id="background" class="style-scope paper-ripple" style="opacity:0;"></div>
            <div id="waves" class="style-scope paper-ripple"></div>
        </paper-ripple>
        `;
        let str_fbtns = `
    <div class="font-size-right">
    <div class="font-size-btn font-size-plus" tyt-di="8rdLQ">
    <svg width="12" height="12" viewbox="0 0 50 50" preserveAspectRatio="xMidYMid meet" 
    stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size">
      <path d="M12 25H38M25 12V38"/>
    </svg>
    </div><div class="font-size-btn font-size-minus" tyt-di="8rdLQ">
    <svg width="12" height="12" viewbox="0 0 50 50" preserveAspectRatio="xMidYMid meet"
    stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size">
      <path d="M12 25h26"/>
    </svg>
    </div>
    </div>
    `.replace(/[\r\n]+/g, "");
        const str_tabs = [
          `<a id="tab-btn1" tyt-di="q9Kjc" tyt-tab-content="#tab-info" class="tab-btn${(hiddenTabsByUserCSS & 1) === 1 ? " tab-btn-hidden" : ""}">${sTabBtnInfo}${str1}${str_fbtns}</a>`,
          `<a id="tab-btn3" tyt-di="q9Kjc" tyt-tab-content="#tab-comments" class="tab-btn${(hiddenTabsByUserCSS & 2) === 2 ? " tab-btn-hidden" : ""}">${svgElm(16, 16, 120, 120, svgComments)}<span id="tyt-cm-count"></span>${str1}${str_fbtns}</a>`,
          `<a id="tab-btn4" tyt-di="q9Kjc" tyt-tab-content="#tab-videos" class="tab-btn${(hiddenTabsByUserCSS & 4) === 4 ? " tab-btn-hidden" : ""}">${sTabBtnVideos}${str1}${str_fbtns}</a>`,
          `<a id="tab-btn5" tyt-di="q9Kjc" tyt-tab-content="#tab-list" class="tab-btn tab-btn-hidden">${sTabBtnPlayList}${str1}${str_fbtns}</a>`
        ].join("");
        let addHTML = `
        <div id="right-tabs">
            <tabview-view-pos-thead></tabview-view-pos-thead>
            <header>
                <div id="material-tabs">
                    ${str_tabs}
                </div>
            </header>
            <div class="tab-content">
                <div id="tab-info" class="tab-content-cld tab-content-hidden" tyt-hidden userscript-scrollbar-render></div>
                <div id="tab-comments" class="tab-content-cld tab-content-hidden" tyt-hidden userscript-scrollbar-render></div>
                <div id="tab-videos" class="tab-content-cld tab-content-hidden" tyt-hidden userscript-scrollbar-render></div>
                <div id="tab-list" class="tab-content-cld tab-content-hidden" tyt-hidden userscript-scrollbar-render></div>
            </div>
        </div>
        `;
        return addHTML;
      }, getLang = function() {
        return pageLocaleData.locale || "en";
      }, getLangForPage = function() {
        pageLang = pageLocaleData.locale || "en";
      }, isTheater = function() {
        const ytdFlexyElm = elements.flexy;
        return ytdFlexyElm && ytdFlexyElm.hasAttribute000("theater");
      }, ytBtnSetTheater = function() {
        if (!isTheater()) {
          const sizeBtn = document.querySelector("ytd-watch-flexy #ytd-player button.ytp-size-button");
          if (sizeBtn)
            sizeBtn.click();
        }
      }, ytBtnCancelTheater = function() {
        if (isTheater()) {
          const sizeBtn = document.querySelector("ytd-watch-flexy #ytd-player button.ytp-size-button");
          if (sizeBtn)
            sizeBtn.click();
        }
      }, getSuitableElement = function(selector) {
        const elements2 = document.querySelectorAll(selector);
        let j = -1, h = -1;
        for (let i = 0, l = elements2.length; i < l; i++) {
          let d = elements2[i].getElementsByTagName("*").length;
          if (d > h) {
            h = d;
            j = i;
          }
        }
        return j >= 0 ? elements2[j] : null;
      }, ytBtnExpandChat = function() {
        const dom = getSuitableElement("ytd-live-chat-frame#chat");
        const cnt = insp(dom);
        if (cnt && typeof cnt.collapsed === "boolean") {
          if (typeof cnt.setCollapsedState === "function") {
            cnt.setCollapsedState({
              setLiveChatCollapsedStateAction: {
                collapsed: false
              }
            });
            if (cnt.collapsed === false)
              return;
          }
          cnt.collapsed = false;
          if (cnt.collapsed === false)
            return;
          if (cnt.isHiddenByUser === true && cnt.collapsed === true) {
            cnt.isHiddenByUser = false;
            cnt.collapsed = false;
          }
        }
        let button = document.querySelector("ytd-live-chat-frame#chat[collapsed] > .ytd-live-chat-frame#show-hide-button");
        if (button) {
          button = button.querySelector000("div.yt-spec-touch-feedback-shape") || button.querySelector000("ytd-toggle-button-renderer");
          if (button)
            button.click();
        }
      }, ytBtnCollapseChat = function() {
        const dom = getSuitableElement("ytd-live-chat-frame#chat");
        const cnt = insp(dom);
        if (cnt && typeof cnt.collapsed === "boolean") {
          if (typeof cnt.setCollapsedState === "function") {
            cnt.setCollapsedState({
              setLiveChatCollapsedStateAction: {
                collapsed: true
              }
            });
            if (cnt.collapsed === true)
              return;
          }
          cnt.collapsed = true;
          if (cnt.collapsed === true)
            return;
          if (cnt.isHiddenByUser === false && cnt.collapsed === false) {
            cnt.isHiddenByUser = true;
            cnt.collapsed = true;
          }
        }
        let button = document.querySelector("ytd-live-chat-frame#chat:not([collapsed]) > .ytd-live-chat-frame#show-hide-button");
        if (button) {
          button = button.querySelector000("div.yt-spec-touch-feedback-shape") || button.querySelector000("ytd-toggle-button-renderer");
          if (button)
            button.click();
        }
      }, ytBtnEgmPanelCore = function(arr) {
        if (!arr)
          return;
        if (!("length" in arr))
          arr = [arr];
        const ytdFlexyElm = elements.flexy;
        if (!ytdFlexyElm)
          return;
        let actions = [];
        for (const entry of arr) {
          if (!entry)
            continue;
          let panelId = entry.panelId;
          let toHide = entry.toHide;
          let toShow = entry.toShow;
          if (toHide === true && !toShow) {
            actions.push({
              "hideEngagementPanelEndpoint": {
                "panelIdentifier": panelId
              }
            });
          } else if (toShow === true && !toHide) {
            actions.push({
              "showEngagementPanelEndpoint": {
                "panelIdentifier": panelId
              }
            });
          }
        }
        if (actions.length > 0) {
          const cnt = insp(ytdFlexyElm);
          cnt.resolveCommand(
            {
              "signalServiceEndpoint": {
                "signal": "CLIENT_SIGNAL",
                "actions": actions
              }
            },
            {},
            false
          );
        }
        actions = null;
      }, getPanelIdentifier = function(panelElm) {
        const cnt = insp(panelElm);
        const panelIdentifier = (cnt.data || 0).panelIdentifier;
        if (panelIdentifier && typeof panelIdentifier === "string") {
          return panelIdentifier;
        }
        const tag = ((cnt.data || 0).identifier || 0).tag;
        if (tag && typeof tag === "string") {
          return tag;
        }
        const targetId = (cnt.data || 0).targetId;
        if (targetId && typeof targetId === "string") {
          return targetId;
        }
        const id = panelElm.getAttribute000("target-id") || "";
        return id;
      }, ytBtnCloseEngagementPanels = function() {
        const actions = [];
        for (const panelElm of document.querySelectorAll(
          `ytd-watch-flexy[tyt-tab] #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[target-id][visibility]:not([hidden])`
        )) {
          if (panelElm.getAttribute("visibility") == "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED" && !panelElm.closest("[hidden]")) {
            const pid = getPanelIdentifier(panelElm);
            actions.push({
              panelId: pid,
              toHide: true
            });
          }
        }
        ytBtnEgmPanelCore(actions);
      }, ytBtnOpenPlaylist = function() {
        const cnt = insp(elements.playlist);
        if (cnt && typeof cnt.collapsed === "boolean") {
          cnt.collapsed = false;
        }
      }, ytBtnClosePlaylist = function() {
        const cnt = insp(elements.playlist);
        if (cnt && typeof cnt.collapsed === "boolean") {
          cnt.collapsed = true;
        }
      };
      let executionFinished = 0;
      if (typeof CustomElementRegistry === "undefined")
        return;
      if (CustomElementRegistry.prototype.define000)
        return;
      if (typeof CustomElementRegistry.prototype.define !== "function")
        return;
      const HTMLElement_ = HTMLElement.prototype.constructor;
      const qsOne = (elm, selector) => {
        return HTMLElement_.prototype.querySelector.call(elm, selector);
      };
      const qsAll = (elm, selector) => {
        return HTMLElement_.prototype.querySelectorAll.call(elm, selector);
      };
      const defineProperties = (p, o) => {
        if (!p) {
          return;
        }
        for (const k of Object.keys(o)) {
          if (!o[k]) {
            delete o[k];
          }
        }
        return Object.defineProperties(p, o);
      };
      const replaceChildrenPolyfill = function replaceChildren(...new_children) {
        let el = this.firstChild;
        while (el) {
          const next = el.nextSibling;
          el.remove();
          el = next;
        }
        this.append(...new_children);
      };
      const pdsBaseDF = Object.getOwnPropertyDescriptors(DocumentFragment.prototype);
      if (pdsBaseDF.replaceChildren) {
        defineProperties(DocumentFragment.prototype, {
          replaceChildren000: pdsBaseDF.replaceChildren
        });
      } else {
        DocumentFragment.prototype.replaceChildren000 = replaceChildrenPolyfill;
      }
      const pdsBaseNode = Object.getOwnPropertyDescriptors(Node.prototype);
      if (!pdsBaseNode.appendChild000 && !pdsBaseNode.insertBefore000) {
        defineProperties(Node.prototype, {
          appendChild000: pdsBaseNode.appendChild,
          insertBefore000: pdsBaseNode.insertBefore
        });
      }
      const pdsBaseElement = Object.getOwnPropertyDescriptors(Element.prototype);
      if (!pdsBaseElement.setAttribute000 && !pdsBaseElement.querySelector000) {
        const nPdsElement = {
          setAttribute000: pdsBaseElement.setAttribute,
          getAttribute000: pdsBaseElement.getAttribute,
          hasAttribute000: pdsBaseElement.hasAttribute,
          removeAttribute000: pdsBaseElement.removeAttribute,
          querySelector000: pdsBaseElement.querySelector
        };
        if (pdsBaseElement.replaceChildren) {
          nPdsElement.replaceChildren000 = pdsBaseElement.replaceChildren;
        } else {
          Element.prototype.replaceChildren000 = replaceChildrenPolyfill;
        }
        defineProperties(Element.prototype, nPdsElement);
      }
      Element.prototype.setAttribute111 = function(p, v) {
        v = `${v}`;
        if (this.getAttribute000(p) === v)
          return;
        this.setAttribute000(p, v);
      };
      Element.prototype.incAttribute111 = function(p) {
        let v = +this.getAttribute000(p) || 0;
        v = v > 1e9 ? v + 1 : 9;
        this.setAttribute000(p, `${v}`);
        return v;
      };
      Element.prototype.assignChildren111 = function(previousSiblings, node, nextSiblings) {
        let nodeList = [];
        for (let t = this.firstChild; t instanceof Node; t = t.nextSibling) {
          if (t === node)
            continue;
          nodeList.push(t);
        }
        inPageRearrange = true;
        if (node.parentNode === this) {
          let fm = new DocumentFragment();
          if (nodeList.length > 0) {
            fm.replaceChildren000(...nodeList);
          }
          if (previousSiblings && previousSiblings.length > 0) {
            fm.replaceChildren000(...previousSiblings);
            this.insertBefore000(fm, node);
          }
          if (nextSiblings && nextSiblings.length > 0) {
            fm.replaceChildren000(...nextSiblings);
            this.appendChild000(fm);
          }
          fm.replaceChildren000();
          fm = null;
        } else {
          if (!previousSiblings)
            previousSiblings = [];
          if (!nextSiblings)
            nextSiblings = [];
          this.replaceChildren000(...previousSiblings, node, ...nextSiblings);
        }
        inPageRearrange = false;
        if (nodeList.length > 0) {
          for (const t of nodeList) {
            if (t instanceof Element && t.isConnected === false)
              t.remove();
          }
        }
        nodeList.length = 0;
        nodeList = null;
      };
      let secondaryInnerHold = 0;
      const secondaryInnerFn = (cb) => {
        if (secondaryInnerHold) {
          secondaryInnerHold++;
          let err, r;
          try {
            r = cb();
          } catch (e) {
            err = e;
          }
          secondaryInnerHold--;
          if (err)
            throw err;
          return r;
        } else {
          const ea = document.querySelector("#secondary-inner");
          const eb = document.querySelector("secondary-wrapper#secondary-inner-wrapper");
          if (ea && eb) {
            secondaryInnerHold++;
            let err, r;
            ea.id = "secondary-inner-";
            eb.id = "secondary-inner";
            try {
              r = cb();
            } catch (e) {
              err = e;
            }
            ea.id = "secondary-inner";
            eb.id = "secondary-inner-wrapper";
            secondaryInnerHold--;
            if (err)
              throw err;
            return r;
          } else {
            return cb();
          }
        }
      };
      const DISABLE_FLAGS_SHADYDOM_FREE = true;
      (() => {
        let e = "undefined" != typeof unsafeWindow ? unsafeWindow : void 0 instanceof Window ? void 0 : window;
        if (!e._ytConfigHacks) {
          let r = function(t2) {
            o(), t2 && e.removeEventListener("DOMContentLoaded", r, false);
          };
          let t = 4;
          class n extends Set {
            add(e2) {
              if (t <= 0)
                return void 0;
              "function" == typeof e2 && super.add(e2);
            }
          }
          let a = (async () => {
          })().constructor, i = e._ytConfigHacks = new n(), l = () => {
            let t2 = e.ytcsi.originalYtcsi;
            t2 && (e.ytcsi = t2, l = null);
          }, c = null, o = () => {
            if (t >= 1) {
              let n2 = (e.yt || 0).config_ || (e.ytcfg || 0).data_ || 0;
              if ("string" == typeof n2.INNERTUBE_API_KEY && "object" == typeof n2.EXPERIMENT_FLAGS)
                for (let a2 of (--t <= 0 && l && l(), c = true, i))
                  a2(n2);
            }
          }, f = 1, d = (t2) => {
            if (t2 = t2 || e.ytcsi)
              return e.ytcsi = new Proxy(t2, { get: (e2, t3, n2) => "originalYtcsi" === t3 ? e2 : (o(), c && --f <= 0 && l && l(), e2[t3]) }), true;
          };
          d() || Object.defineProperty(e, "ytcsi", {
            get() {
            },
            set: (t2) => (t2 && (delete e.ytcsi, d(t2)), true),
            enumerable: false,
            configurable: true
          });
          let { addEventListener: s, removeEventListener: y } = Document.prototype;
          new a((e2) => {
            if ("undefined" != typeof AbortSignal)
              s.call(
                document,
                "yt-page-data-fetched",
                e2,
                { once: true }
              ), s.call(document, "yt-navigate-finish", e2, { once: true }), s.call(
                document,
                "spfdone",
                e2,
                { once: true }
              );
            else {
              let t2 = () => {
                e2(), y.call(document, "yt-page-data-fetched", t2, false), y.call(document, "yt-navigate-finish", t2, false), y.call(document, "spfdone", t2, false);
              };
              s.call(document, "yt-page-data-fetched", t2, false), s.call(document, "yt-navigate-finish", t2, false), s.call(document, "spfdone", t2, false);
            }
          }).then(o), new a((e2) => {
            if ("undefined" != typeof AbortSignal)
              s.call(
                document,
                "yt-action",
                e2,
                { once: true, capture: true }
              );
            else {
              let t2 = () => {
                e2(), y.call(document, "yt-action", t2, true);
              };
              s.call(document, "yt-action", t2, true);
            }
          }).then(o), a.resolve().then(() => {
            "loading" !== document.readyState ? r() : e.addEventListener("DOMContentLoaded", r, false);
          });
        }
      })();
      let configOnce = false;
      window._ytConfigHacks.add((config_) => {
        if (configOnce)
          return;
        configOnce = true;
        const EXPERIMENT_FLAGS = config_.EXPERIMENT_FLAGS || 0;
        const EXPERIMENTS_FORCED_FLAGS = config_.EXPERIMENTS_FORCED_FLAGS || 0;
        for (const flags of [EXPERIMENT_FLAGS, EXPERIMENTS_FORCED_FLAGS]) {
          if (flags) {
            flags.web_watch_chat_hide_button_killswitch = false;
            flags.web_watch_theater_chat = false;
            flags.suppress_error_204_logging = true;
            flags.kevlar_watch_grid = false;
            if (DISABLE_FLAGS_SHADYDOM_FREE) {
              flags.enable_shadydom_free_scoped_node_methods = false;
              flags.enable_shadydom_free_scoped_query_methods = false;
              flags.enable_shadydom_free_scoped_readonly_properties_batch_one = false;
              flags.enable_shadydom_free_parent_node = false;
              flags.enable_shadydom_free_children = false;
              flags.enable_shadydom_free_last_child = false;
            }
          }
        }
      });
      const mWeakRef = typeof WeakRef === "function" ? (o) => o ? new WeakRef(o) : null : (o) => o || null;
      const kRef = (wr) => wr && wr.deref ? wr.deref() : wr;
      const Promise = (async () => {
      })().constructor;
      const delayPn = (delay) => new Promise((fn) => setTimeout(fn, delay));
      const insp = (o) => o ? o.polymerController || o.inst || o || 0 : o || 0;
      const setTimeout_ = setTimeout.bind(window);
      const PromiseExternal = ((resolve_, reject_) => {
        const h = (resolve, reject) => {
          resolve_ = resolve;
          reject_ = reject;
        };
        return class PromiseExternal extends Promise {
          constructor(cb = h) {
            super(cb);
            if (cb === h) {
              this.resolve = resolve_;
              this.reject = reject_;
            }
          }
        };
      })();
      var nextBrowserTick = void 0 !== nextBrowserTick && nextBrowserTick.version >= 2 ? nextBrowserTick : (() => {
        "use strict";
        const e = "undefined" != typeof self ? self : "undefined" != typeof global ? global : void 0;
        let t = true;
        if (!function n2(s2) {
          return s2 ? t = false : e.postMessage && !e.importScripts && e.addEventListener ? (e.addEventListener("message", n2, false), e.postMessage("$$", "*"), e.removeEventListener("message", n2, false), t) : void 0;
        }())
          return void 0;
        const n = (async () => {
        })().constructor;
        let s = null;
        const o = /* @__PURE__ */ new Map(), { floor: r, random: i } = Math;
        let l;
        do {
          l = `$nextBrowserTick$${(i() + 8).toString().slice(2)}$`;
        } while (l in e);
        const a = l, c = a.length + 9;
        e[a] = 1;
        e.addEventListener("message", (e2) => {
          if (0 !== o.size) {
            const t2 = (e2 || 0).data;
            if ("string" == typeof t2 && t2.length === c && e2.source === (e2.target || 1)) {
              const e3 = o.get(t2);
              e3 && ("p" === t2[0] && (s = null), o.delete(t2), e3());
            }
          }
        }, false);
        const d = (t2 = o) => {
          if (t2 === o) {
            if (s)
              return s;
            let t3;
            do {
              t3 = `p${a}${r(314159265359 * i() + 314159265359).toString(36)}`;
            } while (o.has(t3));
            return s = new n((e2) => {
              o.set(t3, e2);
            }), e.postMessage(t3, "*"), t3 = null, s;
          }
          {
            let n2;
            do {
              n2 = `f${a}${r(314159265359 * i() + 314159265359).toString(36)}`;
            } while (o.has(n2));
            o.set(n2, t2), e.postMessage(n2, "*");
          }
        };
        return d.version = 2, d;
      })();
      const isPassiveArgSupport = typeof IntersectionObserver === "function";
      const bubblePassive = isPassiveArgSupport ? { capture: false, passive: true } : false;
      const capturePassive = isPassiveArgSupport ? { capture: true, passive: true } : true;
      class Attributer {
        constructor(list) {
          this.list = list;
          this.flag = 0;
        }
        makeString() {
          let k = 1;
          let s = "";
          let i = 0;
          while (this.flag >= k) {
            if (this.flag & k) {
              s += this.list[i];
            }
            i++;
            k <<= 1;
          }
          return s;
        }
      }
      const mLoaded = new Attributer("icp");
      const wrSelfMap = /* @__PURE__ */ new WeakMap();
      const elements = new Proxy({
        related: null,
        comments: null,
        infoExpander: null
      }, {
        get(target, prop) {
          return kRef(target[prop]);
        },
        set(target, prop, value) {
          if (value) {
            let wr = wrSelfMap.get(value);
            if (!wr) {
              wr = mWeakRef(value);
              wrSelfMap.set(value, wr);
            }
            target[prop] = wr;
          } else {
            target[prop] = null;
          }
          return true;
        }
      });
      const getMainInfo = () => {
        const infoExpander = elements.infoExpander;
        if (!infoExpander)
          return null;
        const mainInfo = infoExpander.matches("[tyt-main-info]") ? infoExpander : infoExpander.querySelector000("[tyt-main-info]");
        return mainInfo || null;
      };
      const asyncWrap = (asyncFn) => {
        return () => {
          Promise.resolve().then(asyncFn);
        };
      };
      let pageType = null;
      let pageLang = pageLocaleData.locale || "en";
      const svgComments = `<path d="M80 27H12A12 12 90 0 0 0 39v42a12 12 90 0 0 12 12h12v20a2 2 90 0 0 3.4 2L47 93h33a12 
  12 90 0 0 12-12V39a12 12 90 0 0-12-12zM20 47h26a2 2 90 1 1 0 4H20a2 2 90 1 1 0-4zm52 28H20a2 2 90 1 1 0-4h52a2 2 90 
  1 1 0 4zm0-12H20a2 2 90 1 1 0-4h52a2 2 90 1 1 0 4zm36-58H40a12 12 90 0 0-12 12v6h52c9 0 16 7 16 16v42h0v4l7 7a2 2 90 
  0 0 3-1V71h2a12 12 90 0 0 12-12V17a12 12 90 0 0-12-12z"/>`.trim();
      const svgVideos = `<path d="M89 10c0-4-3-7-7-7H7c-4 0-7 3-7 7v70c0 4 3 7 7 7h75c4 0 7-3 7-7V10zm-62 2h13v10H27V12zm-9 
  66H9V68h9v10zm0-56H9V12h9v10zm22 56H27V68h13v10zm-3-25V36c0-2 2-3 4-2l12 8c2 1 2 4 0 5l-12 8c-2 1-4 0-4-2zm25 
  25H49V68h13v10zm0-56H49V12h13v10zm18 56h-9V68h9v10zm0-56h-9V12h9v10z"/>`.trim();
      const svgInfo = `<path d="M30 0C13.3 0 0 13.3 0 30s13.3 30 30 30 30-13.3 30-30S46.7 0 30 0zm6.2 46.6c-1.5.5-2.6 
  1-3.6 1.3a10.9 10.9 0 0 1-3.3.5c-1.7 0-3.3-.5-4.3-1.4a4.68 4.68 0 0 1-1.6-3.6c0-.4.2-1 .2-1.5a20.9 20.9 90 0 1 
  .3-2l2-6.8c.1-.7.3-1.3.4-1.9a8.2 8.2 90 0 0 .3-1.6c0-.8-.3-1.4-.7-1.8s-1-.5-2-.5a4.53 4.53 0 0 0-1.6.3c-.5.2-1 
  .2-1.3.4l.6-2.1c1.2-.5 2.4-1 3.5-1.3s2.3-.6 3.3-.6c1.9 0 3.3.6 4.3 1.3s1.5 2.1 1.5 3.5c0 .3 0 .9-.1 1.6a10.4 10.4 
  90 0 1-.4 2.2l-1.9 6.7c-.2.5-.2 1.1-.4 1.8s-.2 1.3-.2 1.6c0 .9.2 1.6.6 1.9s1.1.5 2.1.5a6.1 6.1 90 0 0 1.5-.3 9 9 90 
  0 0 1.4-.4l-.6 2.2zm-3.8-35.2a1 1 0 010 8.6 1 1 0 010-8.6z"/>`.trim();
      const svgPlayList = `<path d="M0 3h12v2H0zm0 4h12v2H0zm0 4h8v2H0zm16 0V7h-2v4h-4v2h4v4h2v-4h4v-2z"/>`.trim();
      const svgDiag1 = `<svg stroke="currentColor" fill="none"><path d="M8 2h2v2M7 5l3-3m-6 8H2V8m0 2l3-3"/></svg>`;
      const svgDiag2 = `<svg stroke="currentColor" fill="none"><path d="M7 3v2h2M7 5l3-3M5 9V7H3m-1 3l3-3"/></svg>`;
      const getGMT = () => {
        let m = new Date("2023-01-01T00:00:00Z");
        return m.getDate() === 1 ? `+${m.getHours()}` : `-${24 - m.getHours()}`;
      };
      const svgElm = (w, h, vw, vh, p, m) => `<svg${m ? ` class=${m}` : ""} width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">${p}</svg>`;
      let hiddenTabsByUserCSS = 0;
      let bridge = null;
      if (typeof RuntimeBridge !== "undefined" && communicationKey) {
        bridge = RuntimeBridge.create(communicationKey, "page");
        bridge.on("TAB_VISIBILITY_CHANGE", (data) => {
          if (data && typeof data.hiddenTabs === "number") {
            hiddenTabsByUserCSS = data.hiddenTabs;
            const tabBtn1 = document.querySelector("#tab-btn1");
            const tabBtn3 = document.querySelector("#tab-btn3");
            const tabBtn4 = document.querySelector("#tab-btn4");
            if (tabBtn1) tabBtn1.classList.toggle("tab-btn-hidden", (hiddenTabsByUserCSS & 1) === 1);
            if (tabBtn3) tabBtn3.classList.toggle("tab-btn-hidden", (hiddenTabsByUserCSS & 2) === 2);
            if (tabBtn4) tabBtn4.classList.toggle("tab-btn-hidden", (hiddenTabsByUserCSS & 4) === 4);
          }
        });
      }
      const _locks = {};
      const lockGet = new Proxy(
        _locks,
        {
          get(target, prop) {
            return target[prop] || 0;
          },
          set(target, prop, val) {
            return true;
          }
        }
      );
      const lockSet = new Proxy(
        _locks,
        {
          get(target, prop) {
            if (target[prop] > 1e9)
              target[prop] = 9;
            return target[prop] = (target[prop] || 0) + 1;
          },
          set(target, prop, val) {
            return true;
          }
        }
      );
      const videosElementProvidedPromise = new PromiseExternal();
      const navigateFinishedPromise = new PromiseExternal();
      let isRightTabsInserted = false;
      const rightTabsProvidedPromise = new PromiseExternal();
      const infoExpanderElementProvidedPromise = new PromiseExternal();
      const pluginsDetected = {};
      const pluginDetectObserver = new MutationObserver((mutations) => {
        let changeOnRoot = false;
        let newPlugins = [];
        const attributeChangedSet = /* @__PURE__ */ new Set();
        for (const mutation of mutations) {
          if (mutation.target === document)
            changeOnRoot = true;
          let detected = "";
          switch (mutation.attributeName) {
            case "data-ytlstm-new-layout":
            case "data-ytlstm-overlay-text-shadow":
            case "data-ytlstm-theater-mode":
              detected = "external.ytlstm";
              attributeChangedSet.add(detected);
              break;
          }
          if (detected && !pluginsDetected[detected]) {
            pluginsDetected[detected] = true;
            newPlugins.push(detected);
          }
        }
        if (elements.flexy && attributeChangedSet.has("external.ytlstm")) {
          elements.flexy.setAttribute(
            "tyt-external-ytlstm",
            document.querySelector("[data-ytlstm-theater-mode]") ? "1" : "0"
          );
        }
        if (changeOnRoot) {
          pluginDetectObserver.observe(document.body, { attributes: true });
        }
        for (const detected of newPlugins) {
          const pluginItem = plugin[`${detected}`];
          if (pluginItem) {
            pluginItem.activate();
          } else {
          }
        }
      });
      pluginDetectObserver.observe(document.documentElement, { attributes: true });
      if (document.body)
        pluginDetectObserver.observe(document.body, { attributes: true });
      navigateFinishedPromise.then(() => {
        pluginDetectObserver.observe(document.documentElement, { attributes: true });
        if (document.body)
          pluginDetectObserver.observe(document.body, { attributes: true });
      });
      const funcCanCollapse = function(s) {
        const content = this.content || this.$.content;
        this.canToggle = this.shouldUseNumberOfLines && (this.alwaysCollapsed || this.collapsed || this.isToggled === false) ? this.alwaysToggleable || this.isToggled || content && content.offsetHeight < content.scrollHeight : this.alwaysToggleable || this.isToggled || content && content.scrollHeight > this.collapsedHeight;
      };
      const aoChatAttrChangeFn = async (lockId) => {
        if (lockGet["aoChatAttrAsyncLock"] !== lockId)
          return;
        const chatElm = elements.chat;
        const ytdFlexyElm = elements.flexy;
        if (chatElm && ytdFlexyElm) {
          const isChatCollapsed = chatElm.hasAttribute000("collapsed");
          if (isChatCollapsed) {
            ytdFlexyElm.setAttribute111("tyt-chat-collapsed", "");
          } else {
            ytdFlexyElm.removeAttribute000("tyt-chat-collapsed");
          }
          ytdFlexyElm.setAttribute111("tyt-chat", isChatCollapsed ? "-" : "+");
        }
      };
      const aoPlayListAttrChangeFn = async (lockId) => {
        if (lockGet["aoPlayListAttrAsyncLock"] !== lockId)
          return;
        const playlistElm = elements.playlist;
        const ytdFlexyElm = elements.flexy;
        let doAttributeChange = 0;
        if (playlistElm && ytdFlexyElm) {
          if (playlistElm.closest("[hidden]")) {
            doAttributeChange = 2;
          } else if (playlistElm.hasAttribute000("collapsed")) {
            doAttributeChange = 2;
          } else {
            doAttributeChange = 1;
          }
        } else if (ytdFlexyElm) {
          doAttributeChange = 2;
        }
        if (doAttributeChange === 1) {
          if (ytdFlexyElm.getAttribute000("tyt-playlist-expanded") !== "") {
            ytdFlexyElm.setAttribute111("tyt-playlist-expanded", "");
          }
        } else if (doAttributeChange === 2) {
          if (ytdFlexyElm.hasAttribute000("tyt-playlist-expanded")) {
            ytdFlexyElm.removeAttribute000("tyt-playlist-expanded");
          }
        }
      };
      const aoChat = new MutationObserver(() => {
        Promise.resolve(lockSet["aoChatAttrAsyncLock"]).then(aoChatAttrChangeFn).catch(console.warn);
      });
      const aoPlayList = new MutationObserver(() => {
        Promise.resolve(lockSet["aoPlayListAttrAsyncLock"]).then(aoPlayListAttrChangeFn).catch(console.warn);
      });
      const aoComment = new MutationObserver(async (mutations) => {
        const commentsArea = elements.comments;
        const ytdFlexyElm = elements.flexy;
        if (!commentsArea)
          return;
        let bfHidden = false;
        let bfCommentsVideoId = false;
        let bfCommentDisabled = false;
        for (const mutation of mutations) {
          if (mutation.attributeName === "hidden" && mutation.target === commentsArea) {
            bfHidden = true;
          } else if (mutation.attributeName === "tyt-comments-video-id" && mutation.target === commentsArea) {
            bfCommentsVideoId = true;
          } else if (mutation.attributeName === "tyt-comments-data-status" && mutation.target === commentsArea) {
            bfCommentDisabled = true;
          }
        }
        if (bfHidden) {
          if (!commentsArea.hasAttribute000("hidden")) {
            Promise.resolve(commentsArea).then(eventMap["settingCommentsVideoId"]).catch(console.warn);
          }
          Promise.resolve(lockSet["removeKeepCommentsScrollerLock"]).then(removeKeepCommentsScroller).catch(console.warn);
        }
        if ((bfHidden || bfCommentsVideoId || bfCommentDisabled) && ytdFlexyElm) {
          const commentsDataStatus = +commentsArea.getAttribute000("tyt-comments-data-status");
          if (commentsDataStatus === 2) {
            ytdFlexyElm.setAttribute111("tyt-comment-disabled", "");
          } else if (commentsDataStatus === 1) {
            ytdFlexyElm.removeAttribute000("tyt-comment-disabled");
          }
          Promise.resolve(lockSet["checkCommentsShouldBeHiddenLock"]).then(eventMap["checkCommentsShouldBeHidden"]).catch(console.warn);
          const lockId = lockSet["rightTabReadyLock01"];
          await rightTabsProvidedPromise.then();
          if (lockGet["rightTabReadyLock01"] !== lockId)
            return;
          if (elements.comments !== commentsArea)
            return;
          if (commentsArea.isConnected === false)
            return;
          if (commentsArea.closest("#tab-comments")) {
            const shouldTabVisible = !commentsArea.closest("[hidden]");
            document.querySelector('[tyt-tab-content="#tab-comments"]').classList.toggle("tab-btn-hidden", !shouldTabVisible);
          }
        }
      });
      const ioComment = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target;
          const cnt = insp(target);
          if (entry.isIntersecting && target instanceof HTMLElement_ && typeof cnt.calculateCanCollapse === "function") {
            lockSet["removeKeepCommentsScrollerLock"];
            cnt.calculateCanCollapse(true);
            target.setAttribute111("io-intersected", "");
            const ytdFlexyElm = elements.flexy;
            if (ytdFlexyElm && !ytdFlexyElm.hasAttribute000("keep-comments-scroller")) {
              ytdFlexyElm.setAttribute111("keep-comments-scroller", "");
            }
          } else if (target.hasAttribute000("io-intersected")) {
            target.removeAttribute000("io-intersected");
          }
        }
      }, {
        threshold: [0],
        rootMargin: "32px"
      });
      let bFixForResizedTabLater = false;
      let lastRoRightTabsWidth = 0;
      const roRightTabs = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        const width = Math.round(entry.borderBoxSize.inlineSize);
        if (lastRoRightTabsWidth !== width) {
          lastRoRightTabsWidth = width;
          if ((tabAStatus & 2) === 2) {
            bFixForResizedTabLater = false;
            Promise.resolve(1).then(eventMap["fixForTabDisplay"]);
          } else {
            bFixForResizedTabLater = true;
          }
        }
      });
      const switchToTab = (activeLink) => {
        if (typeof activeLink === "string") {
          activeLink = document.querySelector(`a[tyt-tab-content="${activeLink}"]`) || null;
        }
        const ytdFlexyElm = elements.flexy;
        const links = document.querySelectorAll("#material-tabs a[tyt-tab-content]");
        for (const link of links) {
          const content = document.querySelector(link.getAttribute000("tyt-tab-content"));
          if (link && content) {
            if (link !== activeLink) {
              link.classList.remove("active");
              content.classList.add("tab-content-hidden");
              if (!content.hasAttribute000("tyt-hidden")) {
                content.setAttribute111("tyt-hidden", "");
              }
            } else {
              link.classList.add("active");
              if (content.hasAttribute000("tyt-hidden")) {
                content.removeAttribute000("tyt-hidden");
              }
              content.classList.remove("tab-content-hidden");
            }
          }
        }
        const switchingTo = activeLink ? activeLink.getAttribute000("tyt-tab-content") : "";
        if (switchingTo) {
          lastTab = lastPanel = switchingTo;
        }
        if (ytdFlexyElm.getAttribute000("tyt-chat") === "")
          ytdFlexyElm.removeAttribute000("tyt-chat");
        ytdFlexyElm.setAttribute111("tyt-tab", switchingTo);
        if (switchingTo) {
          bFixForResizedTabLater = false;
          Promise.resolve(0).then(eventMap["fixForTabDisplay"]);
        }
      };
      let tabAStatus = 0;
      const calculationFn = (r = 0, flag) => {
        const ytdFlexyElm = elements.flexy;
        if (!ytdFlexyElm)
          return r;
        if (flag & 1) {
          r |= 1;
          if (!ytdFlexyElm.hasAttribute000("theater"))
            r -= 1;
        }
        if (flag & 2) {
          r |= 2;
          if (!ytdFlexyElm.getAttribute000("tyt-tab"))
            r -= 2;
        }
        if (flag & 4) {
          r |= 4;
          if (ytdFlexyElm.getAttribute000("tyt-chat") !== "-")
            r -= 4;
        }
        if (flag & 8) {
          r |= 8;
          if (ytdFlexyElm.getAttribute000("tyt-chat") !== "+")
            r -= 8;
        }
        if (flag & 16) {
          r |= 16;
          if (!ytdFlexyElm.hasAttribute000("is-two-columns_"))
            r -= 16;
        }
        if (flag & 32) {
          r |= 32;
          if (!ytdFlexyElm.hasAttribute000("tyt-egm-panel_"))
            r -= 32;
        }
        if (flag & 64) {
          r |= 64;
          if (!document.fullscreenElement)
            r -= 64;
        }
        if (flag & 128) {
          r |= 128;
          if (!ytdFlexyElm.hasAttribute000("tyt-playlist-expanded"))
            r -= 128;
        }
        if (flag & 4096) {
          r |= 4096;
          if (ytdFlexyElm.getAttribute("tyt-external-ytlstm") !== "1")
            r -= 4096;
        }
        return r;
      };
      const updateChatLocation498 = function() {
        if (this.is !== "ytd-watch-grid") {
          secondaryInnerFn(() => {
            this.updatePageMediaQueries();
            this.schedulePlayerSizeUpdate_();
          });
        }
      };
      const mirrorNodeWS = /* @__PURE__ */ new WeakMap();
      const dummyNode = document.createElement("noscript");
      const __j4836__ = Symbol();
      const __j5744__ = Symbol();
      const __j5733__ = Symbol();
      const monitorDataChangedByDOMMutation = async function(mutations) {
        const nodeWR = this;
        const node = kRef(nodeWR);
        if (!node)
          return;
        const cnt = insp(node);
        const __lastChanged__ = cnt[__j5733__];
        const val = cnt.data ? cnt.data[__j4836__] || 1 : 0;
        if (__lastChanged__ !== val) {
          cnt[__j5733__] = val > 0 ? cnt.data[__j4836__] = Date.now() : 0;
          await Promise.resolve();
          attributeInc(node, "tyt-data-change-counter");
        }
      };
      const moChangeReflection = function(mutations) {
        const nodeWR = this;
        const node = kRef(nodeWR);
        if (!node)
          return;
        const originElement = kRef(node[__j5744__] || null) || null;
        if (!originElement)
          return;
        const cnt = insp(node);
        const oriCnt = insp(originElement);
        if (mutations) {
          let bfDataChangeCounter = false;
          for (const mutation of mutations) {
            if (mutation.attributeName === "tyt-clone-refresh-count" && mutation.target === originElement) {
              bfDataChangeCounter = true;
            } else if (mutation.attributeName === "tyt-data-change-counter" && mutation.target === originElement) {
              bfDataChangeCounter = true;
            }
          }
          if (bfDataChangeCounter && oriCnt.data) {
            node.replaceWith(dummyNode);
            cnt.data = Object.assign({}, oriCnt.data);
            dummyNode.replaceWith(node);
          }
        }
      };
      const attributeInc = (elm, prop) => {
        let v = (+elm.getAttribute000(prop) || 0) + 1;
        if (v > 1e9)
          v = 9;
        elm.setAttribute000(prop, v);
        return v;
      };
      const isChannelId = (x) => {
        if (typeof x === "string" && x.length === 24) {
          return /UC[-_a-zA-Z0-9+=.]{22}/.test(x);
        }
        return false;
      };
      const infoFix = (lockId) => {
        if (lockId !== null && lockGet["infoFixLock"] !== lockId)
          return;
        const infoExpander = elements.infoExpander;
        const infoContainer = (infoExpander ? infoExpander.parentNode : null) || document.querySelector("#tab-info");
        const ytdFlexyElm = elements.flexy;
        if (!infoContainer || !ytdFlexyElm)
          return;
        if (infoExpander) {
          const match = infoExpander.matches("#tab-info > [class]") || infoExpander.matches("#tab-info > [tyt-main-info]");
          if (!match)
            return;
        }
        const requireElements = [...document.querySelectorAll('ytd-watch-metadata.ytd-watch-flexy div[slot="extra-content"] > *, ytd-watch-metadata.ytd-watch-flexy #extra-content > *')].filter((elm) => {
          return typeof elm.is == "string";
        }).map((elm) => {
          const is = elm.is;
          while (elm instanceof HTMLElement_) {
            const q = [...elm.querySelectorAll(is)].filter((e) => insp(e).data);
            if (q.length >= 1)
              return q[0];
            elm = elm.parentNode;
          }
        }).filter((elm) => !!elm && typeof elm.is === "string");
        const source = requireElements.map((entry) => {
          const inst = insp(entry);
          return {
            data: inst.data,
            tag: inst.is,
            elm: entry
          };
        });
        let noscript_ = document.querySelector("noscript#aythl");
        if (!noscript_) {
          noscript_ = document.createElement("noscript");
          noscript_.id = "aythl";
          inPageRearrange = true;
          ytdFlexyElm.insertBefore000(noscript_, ytdFlexyElm.firstChild);
          inPageRearrange = false;
        }
        const noscript = noscript_;
        let requiredUpdate = false;
        const mirrorElmSet = /* @__PURE__ */ new Set();
        const targetParent = infoContainer;
        for (const { data, tag, elm: s } of source) {
          let mirrorNode = mirrorNodeWS.get(s);
          mirrorNode = mirrorNode ? kRef(mirrorNode) : mirrorNode;
          if (!mirrorNode) {
            const cnt = insp(s);
            const cProto = cnt.constructor.prototype;
            const element = document.createElement(tag);
            noscript.appendChild(element);
            mirrorNode = element;
            mirrorNode[__j5744__] = mWeakRef(s);
            const nodeWR = mWeakRef(mirrorNode);
            new MutationObserver(moChangeReflection.bind(nodeWR)).observe(s, { attributes: true, attributeFilter: ["tyt-clone-refresh-count", "tyt-data-change-counter"] });
            s.jy8432 = 1;
            if (!(cProto instanceof Node) && !cProto._dataChanged496 && typeof cProto._createPropertyObserver === "function") {
              cProto._dataChanged496 = function() {
                const cnt2 = this;
                const node = cnt2.hostElement || cnt2;
                if (node.jy8432) {
                  attributeInc(node, "tyt-data-change-counter");
                }
              };
              cProto._createPropertyObserver("data", "_dataChanged496", void 0);
            } else if (!(cProto instanceof Node) && !cProto._dataChanged496 && cProto.useSignals === true && insp(s).signalProxy) {
              const dataSignal = cnt?.signalProxy?.signalCache?.data;
              if (dataSignal && typeof dataSignal.setWithPath === "function" && !dataSignal.setWithPath573 && !dataSignal.controller573) {
                dataSignal.controller573 = mWeakRef(cnt);
                dataSignal.setWithPath573 = dataSignal.setWithPath;
                dataSignal.setWithPath = function() {
                  const cnt2 = kRef(this.controller573 || null) || null;
                  cnt2 && typeof cnt2._dataChanged496k === "function" && Promise.resolve(cnt2).then(cnt2._dataChanged496k).catch(console.warn);
                  return this.setWithPath573(...arguments);
                };
                cProto._dataChanged496 = function() {
                  const cnt2 = this;
                  const node = cnt2.hostElement || cnt2;
                  if (node.jy8432) {
                    attributeInc(node, "tyt-data-change-counter");
                  }
                };
                cProto._dataChanged496k = (cnt2) => cnt2._dataChanged496();
              }
            }
            if (!cProto._dataChanged496) {
              new MutationObserver(monitorDataChangedByDOMMutation.bind(mirrorNode[__j5744__])).observe(s, { attributes: true, childList: true, subtree: true });
            }
            mirrorNodeWS.set(s, nodeWR);
            requiredUpdate = true;
          } else {
            if (mirrorNode.parentNode !== targetParent) {
              requiredUpdate = true;
            }
          }
          if (!requiredUpdate) {
            const cloneNodeCnt = insp(mirrorNode);
            if (cloneNodeCnt.data !== data) {
              requiredUpdate = true;
            }
          }
          mirrorElmSet.add(mirrorNode);
          source.mirrored = mirrorNode;
        }
        const mirroElmArr = [...mirrorElmSet];
        mirrorElmSet.clear();
        if (!requiredUpdate) {
          let e = infoExpander ? -1 : 0;
          for (let n = targetParent.firstChild; n instanceof Node; n = n.nextSibling) {
            let target = e < 0 ? infoExpander : mirroElmArr[e];
            e++;
            if (n !== target) {
              requiredUpdate = true;
              break;
            }
          }
          if (!requiredUpdate && e !== mirroElmArr.length + 1)
            requiredUpdate = true;
        }
        if (requiredUpdate) {
          if (infoExpander) {
            targetParent.assignChildren111(null, infoExpander, mirroElmArr);
          } else {
            targetParent.replaceChildren000(...mirroElmArr);
          }
          for (const mirrorElm of mirroElmArr) {
            const j = attributeInc(mirrorElm, "tyt-clone-refresh-count");
            const oriElm = kRef(mirrorElm[__j5744__] || null) || null;
            if (oriElm) {
              oriElm.setAttribute111("tyt-clone-refresh-count", j);
            }
          }
        }
        mirroElmArr.length = 0;
        source.length = 0;
      };
      const layoutFix = (lockId) => {
        if (lockGet["layoutFixLock"] !== lockId)
          return;
        const secondaryWrapper = document.querySelector("#secondary-inner.style-scope.ytd-watch-flexy > secondary-wrapper");
        if (secondaryWrapper) {
          const secondaryInner = secondaryWrapper.parentNode;
          const chatContainer = document.querySelector("#columns.style-scope.ytd-watch-flexy [tyt-chat-container]");
          if (secondaryInner.firstChild !== secondaryInner.lastChild || chatContainer && !chatContainer.closest("secondary-wrapper")) {
            let w = [];
            let w2 = [];
            for (let node = secondaryInner.firstChild; node instanceof Node; node = node.nextSibling) {
              if (node === chatContainer && chatContainer) {
              } else if (node === secondaryWrapper) {
                for (let node2 = secondaryWrapper.firstChild; node2 instanceof Node; node2 = node2.nextSibling) {
                  if (node2 === chatContainer && chatContainer) {
                  } else {
                    if (node2.id === "right-tabs" && chatContainer) {
                      w2.push(chatContainer);
                    }
                    w2.push(node2);
                  }
                }
              } else {
                w.push(node);
              }
            }
            inPageRearrange = true;
            secondaryWrapper.replaceChildren000(...w, ...w2);
            inPageRearrange = false;
            const chatElm = elements.chat;
            const chatCnt = insp(chatElm);
            if (chatCnt && typeof chatCnt.urlChanged === "function" && secondaryWrapper.contains(chatElm)) {
              if (typeof chatCnt.urlChangedAsync12 === "function") {
                DEBUG_5085 && void 0;
                chatCnt.urlChanged();
              } else {
                DEBUG_5085 && void 0;
                setTimeout(() => chatCnt.urlChanged(), 136);
              }
            }
          }
        }
      };
      let lastPanel = "";
      let lastTab = "";
      const aoEgmPanels = new MutationObserver(() => {
        Promise.resolve(lockSet["updateEgmPanelsLock"]).then(updateEgmPanels).catch(console.warn);
      });
      const removeKeepCommentsScroller = async (lockId) => {
        if (lockGet["removeKeepCommentsScrollerLock"] !== lockId)
          return;
        await Promise.resolve();
        if (lockGet["removeKeepCommentsScrollerLock"] !== lockId)
          return;
        const ytdFlexyFlm = elements.flexy;
        if (ytdFlexyFlm) {
          ytdFlexyFlm.removeAttribute000("keep-comments-scroller");
        }
      };
      const updateEgmPanels = async (lockId) => {
        if (lockId !== lockGet["updateEgmPanelsLock"])
          return;
        await navigateFinishedPromise.then().catch(console.warn);
        if (lockId !== lockGet["updateEgmPanelsLock"])
          return;
        const ytdFlexyElm = elements.flexy;
        if (!ytdFlexyElm)
          return;
        let newVisiblePanels = [];
        let newHiddenPanels = [];
        let allVisiblePanels = [];
        for (const panelElm of document.querySelectorAll("[tyt-egm-panel][target-id][visibility]")) {
          const visibility = panelElm.getAttribute000("visibility");
          if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN" || panelElm.closest("[hidden]")) {
            if (panelElm.hasAttribute000("tyt-visible-at")) {
              panelElm.removeAttribute000("tyt-visible-at");
              newHiddenPanels.push(panelElm);
            }
          } else if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED" && !panelElm.closest("[hidden]")) {
            let visibleAt = panelElm.getAttribute000("tyt-visible-at");
            if (!visibleAt) {
              panelElm.setAttribute111("tyt-visible-at", Date.now());
              newVisiblePanels.push(panelElm);
            }
            allVisiblePanels.push(panelElm);
          }
        }
        if (newVisiblePanels.length >= 1 && allVisiblePanels.length >= 2) {
          const targetVisible = newVisiblePanels[newVisiblePanels.length - 1];
          const actions = [];
          for (const panelElm of allVisiblePanels) {
            if (panelElm === targetVisible)
              continue;
            const pid = getPanelIdentifier(panelElm);
            actions.push({
              panelId: pid,
              toHide: true
            });
          }
          if (actions.length >= 1) {
            ytBtnEgmPanelCore(actions);
          }
        }
        if (allVisiblePanels.length >= 1) {
          ytdFlexyElm.setAttribute111("tyt-egm-panel_", "");
        } else {
          ytdFlexyElm.removeAttribute000("tyt-egm-panel_");
        }
        newVisiblePanels.length = 0;
        newVisiblePanels = null;
        newHiddenPanels.length = 0;
        newHiddenPanels = null;
        allVisiblePanels.length = 0;
        allVisiblePanels = null;
      };
      const checkElementExist = (css, exclude) => {
        for (const p of document.querySelectorAll(css)) {
          if (!p.closest(exclude))
            return p;
        }
        return null;
      };
      let fixInitialTabStateK = 0;
      const { handleNavigateFactory } = (() => {
        let isLoadStartListened = false;
        function findLcComment(lc) {
          if (arguments.length === 1) {
            let element = document.querySelector(`#tab-comments ytd-comments ytd-comment-renderer #header-author a[href*="lc=${lc}"]`);
            if (element) {
              let commentRendererElm = closestFromAnchor.call(element, "ytd-comment-renderer");
              if (commentRendererElm && lc) {
                return {
                  lc,
                  commentRendererElm
                };
              }
            }
          } else if (arguments.length === 0) {
            let element = document.querySelector(`#tab-comments ytd-comments ytd-comment-renderer > #linked-comment-badge span:not(:empty)`);
            if (element) {
              let commentRendererElm = closestFromAnchor.call(element, "ytd-comment-renderer");
              if (commentRendererElm) {
                let header = _querySelector.call(commentRendererElm, "#header-author");
                if (header) {
                  let anchor = _querySelector.call(header, 'a[href*="lc="]');
                  if (anchor) {
                    let href = anchor.getAttribute("href") || "";
                    let m = /[&?]lc=([\w_.-]+)/.exec(href);
                    if (m) {
                      lc = m[1];
                    }
                  }
                }
              }
              if (commentRendererElm && lc) {
                return {
                  lc,
                  commentRendererElm
                };
              }
            }
          }
          return null;
        }
        function lcSwapFuncA(targetLcId, currentLcId) {
          let done = 0;
          try {
            let r1 = findLcComment(currentLcId).commentRendererElm;
            let r2 = findLcComment(targetLcId).commentRendererElm;
            if (typeof insp(r1).data.linkedCommentBadge === "object" && typeof insp(r2).data.linkedCommentBadge === "undefined") {
              let p = Object.assign({}, insp(r1).data.linkedCommentBadge);
              if (((p || 0).metadataBadgeRenderer || 0).trackingParams) {
                delete p.metadataBadgeRenderer.trackingParams;
              }
              const v1 = findContentsRenderer(r1);
              const v2 = findContentsRenderer(r2);
              if (v1.parent === v2.parent && (v2.parent.nodeName === "YTD-COMMENTS" || v2.parent.nodeName === "YTD-ITEM-SECTION-RENDERER")) {
              } else {
                return false;
              }
              if (v2.index >= 0) {
                if (v2.parent.nodeName === "YTD-COMMENT-REPLIES-RENDERER") {
                  if (lcSwapFuncB(targetLcId, currentLcId, p)) {
                    done = 1;
                  }
                  done = 1;
                } else {
                  const v2pCnt = insp(v2.parent);
                  const v2Conents = (v2pCnt.data || 0).contents || 0;
                  if (!v2Conents)
                    ;
                  v2pCnt.data = Object.assign({}, v2pCnt.data, { contents: [].concat([v2Conents[v2.index]], v2Conents.slice(0, v2.index), v2Conents.slice(v2.index + 1)) });
                  if (lcSwapFuncB(targetLcId, currentLcId, p)) {
                    done = 1;
                  }
                }
              }
            }
          } catch (e) {
          }
          return done === 1;
        }
        function lcSwapFuncB(targetLcId, currentLcId, _p) {
          let done = 0;
          try {
            let r1 = findLcComment(currentLcId).commentRendererElm;
            let r1cnt = insp(r1);
            let r2 = findLcComment(targetLcId).commentRendererElm;
            let r2cnt = insp(r2);
            const r1d = r1cnt.data;
            let p = Object.assign({}, _p);
            r1d.linkedCommentBadge = null;
            delete r1d.linkedCommentBadge;
            let q = Object.assign({}, r1d);
            q.linkedCommentBadge = null;
            delete q.linkedCommentBadge;
            r1cnt.data = Object.assign({}, q);
            r2cnt.data = Object.assign({}, r2cnt.data, { linkedCommentBadge: p });
            done = 1;
          } catch (e) {
          }
          return done === 1;
        }
        const loadStartFx = async (evt) => {
          let media = (evt || 0).target || 0;
          if (media.nodeName === "VIDEO" || media.nodeName === "AUDIO") {
          } else
            return;
          const newMedia = media;
          const media1 = common.getMediaElement(0);
          const media2 = common.getMediaElements(2);
          if (media1 !== null && media2.length > 0) {
            if (newMedia !== media1 && media1.paused === false) {
              if (isVideoPlaying(media1)) {
                Promise.resolve(newMedia).then((video) => video.paused === false && video.pause()).catch(console.warn);
              }
            } else if (newMedia === media1) {
              for (const s of media2) {
                if (s.paused === false) {
                  Promise.resolve(s).then((s2) => s2.paused === false && s2.pause()).catch(console.warn);
                  break;
                }
              }
            } else {
              Promise.resolve(media1).then((video1) => video1.paused === false && video1.pause()).catch(console.warn);
            }
          }
        };
        const getBrowsableEndPoint = (req) => {
          let valid = false;
          let endpoint = req ? req.command : null;
          if (endpoint && (endpoint.commandMetadata || 0).webCommandMetadata && endpoint.watchEndpoint) {
            let videoId = endpoint.watchEndpoint.videoId;
            let url = endpoint.commandMetadata.webCommandMetadata.url;
            if (typeof videoId === "string" && typeof url === "string" && url.indexOf("lc=") > 0) {
              let m = /^\/watch\?v=([\w_-]+)&lc=([\w_.-]+)$/.exec(url);
              if (m && m[1] === videoId) {
                let targetLc = findLcComment(m[2]);
                let currentLc = targetLc ? findLcComment() : null;
                if (targetLc && currentLc) {
                  let done = targetLc.lc === currentLc.lc ? 1 : lcSwapFuncA(targetLc.lc, currentLc.lc) ? 1 : 0;
                  if (done === 1) {
                    common.xReplaceState(history.state, url);
                    return;
                  }
                }
              }
            }
          }
          if (endpoint && (endpoint.commandMetadata || 0).webCommandMetadata && endpoint.browseEndpoint && isChannelId(endpoint.browseEndpoint.browseId)) {
            valid = true;
          } else if (endpoint && (endpoint.browseEndpoint || endpoint.searchEndpoint) && !endpoint.urlEndpoint && !endpoint.watchEndpoint) {
            if (endpoint.browseEndpoint && endpoint.browseEndpoint.browseId === "FEwhat_to_watch") {
              const playerMedia = common.getMediaElement(1);
              if (playerMedia && playerMedia.paused === false)
                valid = true;
            } else if (endpoint.commandMetadata && endpoint.commandMetadata.webCommandMetadata) {
              let meta = endpoint.commandMetadata.webCommandMetadata;
              if (meta && meta.url && meta.webPageType) {
                valid = true;
              }
            }
          }
          if (!valid)
            endpoint = null;
          return endpoint;
        };
        const shouldUseMiniPlayer = () => {
          const isSubTypeExist = document.querySelector("ytd-page-manager#page-manager > ytd-browse[page-subtype]");
          if (isSubTypeExist)
            return true;
          const movie_player = [...document.querySelectorAll("#movie_player")].filter((e) => !e.closest("[hidden]"))[0];
          if (movie_player) {
            const media = qsOne(movie_player, "video[class], audio[class]");
            if (media && media.currentTime > 3 && media.duration - media.currentTime > 3 && media.paused === false) {
              return true;
            }
          }
          return false;
        };
        const conditionFulfillment = (req) => {
          const command = req ? req.command : null;
          DEBUG_handleNavigateFactory && void 0;
          if (!command)
            return;
          if (command && (command.commandMetadata || 0).webCommandMetadata && command.watchEndpoint) {
          } else if (command && (command.commandMetadata || 0).webCommandMetadata && command.browseEndpoint && isChannelId(command.browseEndpoint.browseId)) {
          } else if (command && (command.browseEndpoint || command.searchEndpoint) && !command.urlEndpoint && !command.watchEndpoint) {
          } else {
            return false;
          }
          DEBUG_handleNavigateFactory && void 0;
          if (!shouldUseMiniPlayer())
            return false;
          DEBUG_handleNavigateFactory && void 0;
          if (pageType !== "watch")
            return false;
          DEBUG_handleNavigateFactory && void 0;
          return true;
        };
        let u38 = 0;
        const fixChannelAboutPopup = async (t38) => {
          let promise = new PromiseExternal();
          const f = () => {
            promise && promise.resolve();
            promise = null;
          };
          document.addEventListener("yt-navigate-finish", f, false);
          await promise.then();
          promise = null;
          document.removeEventListener("yt-navigate-finish", f, false);
          if (t38 !== u38)
            return;
          setTimeout(() => {
            const currentAbout = [...document.querySelectorAll("ytd-about-channel-renderer")].filter((e) => !e.closest("[hidden]"))[0];
            let okay = false;
            if (!currentAbout)
              okay = true;
            else {
              const popupContainer = currentAbout.closest("ytd-popup-container");
              if (popupContainer) {
                const cnt = insp(popupContainer);
                let arr = null;
                try {
                  arr = cnt.handleGetOpenedPopupsAction_();
                } catch (e) {
                }
                if (arr && arr.length === 0)
                  okay = true;
              } else {
                okay = false;
              }
            }
            if (okay) {
              const descriptionModel = [...document.querySelectorAll("yt-description-preview-view-model")].filter((e) => !e.closest("[hidden]"))[0];
              if (descriptionModel) {
                const button = [...descriptionModel.querySelectorAll("button")].filter((e) => !e.closest("[hidden]") && `${e.textContent}`.trim().length > 0)[0];
                if (button) {
                  button.click();
                }
              }
            }
          }, 80);
        };
        const handleNavigateFactory2 = (handleNavigate) => {
          return function(req) {
            if (u38 > 1e9)
              u38 = 9;
            const t38 = ++u38;
            const $this = this;
            const $arguments = arguments;
            let endpoint = null;
            if (conditionFulfillment(req)) {
              endpoint = getBrowsableEndPoint(req);
              DEBUG_handleNavigateFactory && void 0;
            }
            DEBUG_handleNavigateFactory && void 0;
            if (!endpoint || !shouldUseMiniPlayer())
              return handleNavigate.apply($this, $arguments);
            const ytdAppElm = document.querySelector("ytd-app");
            const ytdAppCnt = insp(ytdAppElm);
            let object = null;
            try {
              object = ytdAppCnt.data.response.currentVideoEndpoint.watchEndpoint || null;
            } catch (e) {
              object = null;
            }
            DEBUG_handleNavigateFactory && void 0;
            if (typeof object !== "object")
              object = null;
            const once = { once: true };
            if (object !== null && !("playlistId" in object)) {
              DEBUG_handleNavigateFactory && void 0;
              let wObject = mWeakRef(object);
              const N = 3;
              let count = 0;
              Object.defineProperty(kRef(wObject) || {}, "playlistId", {
                get() {
                  DEBUG_handleNavigateFactory && void 0;
                  count++;
                  if (count === N) {
                    delete this.playlistId;
                  }
                  return "*";
                },
                set(value) {
                  DEBUG_handleNavigateFactory && void 0;
                  delete this.playlistId;
                  this.playlistId = value;
                },
                enumerable: false,
                configurable: true
              });
              let playlistClearout = null;
              let timeoutid = 0;
              Promise.race([
                new Promise((r) => {
                  timeoutid = setTimeout(r, 4e3);
                }),
                new Promise((r) => {
                  playlistClearout = () => {
                    if (timeoutid > 0) {
                      clearTimeout(timeoutid);
                      timeoutid = 0;
                    }
                    r();
                  };
                  document.addEventListener("yt-page-type-changed", playlistClearout, once);
                })
              ]).then(() => {
                if (timeoutid !== 0) {
                  playlistClearout && document.removeEventListener("yt-page-type-changed", playlistClearout, once);
                  timeoutid = 0;
                }
                playlistClearout = null;
                count = N - 1;
                let object2 = kRef(wObject);
                wObject = null;
                return object2 ? object2.playlistId : null;
              }).catch(console.warn);
            }
            if (!isLoadStartListened) {
              isLoadStartListened = true;
              document.addEventListener("loadstart", loadStartFx, true);
            }
            const endpointURL = `${endpoint?.commandMetadata?.webCommandMetadata?.url || ""}`;
            if (endpointURL && endpointURL.endsWith("/about") && /\/channel\/UC[-_a-zA-Z0-9+=.]{22}\/about/.test(endpointURL)) {
              fixChannelAboutPopup(t38);
            }
            handleNavigate.apply($this, $arguments);
          };
        };
        return { handleNavigateFactory: handleNavigateFactory2 };
      })();
      const common = (() => {
        let mediaModeLock = 0;
        const _getMediaElement = (i) => {
          if (mediaModeLock === 0) {
            let e = document.querySelector(".video-stream.html5-main-video") || document.querySelector("#movie_player video, #movie_player audio") || document.querySelector("body video[src], body audio[src]");
            if (e) {
              if (e.nodeName === "VIDEO")
                mediaModeLock = 1;
              else if (e.nodeName === "AUDIO")
                mediaModeLock = 2;
            }
          }
          if (!mediaModeLock)
            return null;
          if (mediaModeLock === 1) {
            switch (i) {
              case 1:
                return "ytd-player#ytd-player video[src]";
              case 2:
                return 'ytd-browse[role="main"] video[src]';
              case 0:
              default:
                return "#movie_player video[src]";
            }
          } else if (mediaModeLock === 2) {
            switch (i) {
              case 1:
                return "ytd-player#ytd-player audio.video-stream.html5-main-video[src]";
              case 2:
                return 'ytd-browse[role="main"] audio.video-stream.html5-main-video[src]';
              case 0:
              default:
                return "#movie_player audio.video-stream.html5-main-video[src]";
            }
          }
          return null;
        };
        return {
          xReplaceState(s, u) {
            try {
              history.replaceState(s, "", u);
            } catch (e) {
            }
            if (s.endpoint) {
              try {
                const ytdAppElm = document.querySelector("ytd-app");
                const ytdAppCnt = insp(ytdAppElm);
                ytdAppCnt.replaceState(s.endpoint, "", u);
              } catch (e) {
              }
            }
          },
          getMediaElement(i) {
            let s = _getMediaElement(i) || "";
            if (s)
              return document.querySelector(s);
            return null;
          },
          getMediaElements(i) {
            let s = _getMediaElement(i) || "";
            if (s)
              return document.querySelectorAll(s);
            return [];
          }
        };
      })();
      let inPageRearrange = false;
      let tmpLastVideoId = "";
      const getCurrentVideoId = () => {
        const ytdFlexyElm = elements.flexy;
        const ytdFlexyCnt = insp(ytdFlexyElm);
        if (ytdFlexyCnt && typeof ytdFlexyCnt.videoId === "string")
          return ytdFlexyCnt.videoId;
        if (ytdFlexyElm && typeof ytdFlexyElm.videoId === "string")
          return ytdFlexyElm.videoId;
        return "";
      };
      const holdInlineExpanderAlwaysExpanded = (inlineExpanderCnt) => {
        if (inlineExpanderCnt.alwaysShowExpandButton === true)
          inlineExpanderCnt.alwaysShowExpandButton = false;
        if (typeof (inlineExpanderCnt.collapseLabel || 0) === "string")
          inlineExpanderCnt.collapseLabel = "";
        if (typeof (inlineExpanderCnt.expandLabel || 0) === "string")
          inlineExpanderCnt.expandLabel = "";
        if (inlineExpanderCnt.showCollapseButton === true)
          inlineExpanderCnt.showCollapseButton = false;
        if (inlineExpanderCnt.showExpandButton === true)
          inlineExpanderCnt.showExpandButton = false;
        if (inlineExpanderCnt.expandButton instanceof HTMLElement_) {
          inlineExpanderCnt.expandButton = null;
          inlineExpanderCnt.expandButton.remove();
        }
      };
      const fixInlineExpanderDisplay = (inlineExpanderCnt) => {
        try {
          inlineExpanderCnt.updateIsAttributedExpanded();
        } catch (e) {
        }
        try {
          inlineExpanderCnt.updateIsFormattedExpanded();
        } catch (e) {
        }
        try {
          inlineExpanderCnt.updateTextOnSnippetTypeChange();
        } catch (e) {
        }
        try {
          inlineExpanderCnt.updateStyles();
        } catch (e) {
        }
      };
      const setExpand = (cnt) => {
        if (typeof cnt.set === "function") {
          cnt.set("isExpanded", true);
          if (typeof cnt.isExpandedChanged === "function")
            cnt.isExpandedChanged();
        } else if (cnt.isExpanded === false) {
          cnt.isExpanded = true;
          if (typeof cnt.isExpandedChanged === "function")
            cnt.isExpandedChanged();
        }
      };
      const cloneMethods = {
        updateTextOnSnippetTypeChange() {
          if (this.isResetMutation === false)
            this.isResetMutation = true;
          if (this.isExpanded === true)
            this.isExpanded = false;
          setExpand(this, true);
          if (this.isResetMutation === false)
            this.isResetMutation = true;
          try {
          } catch (e) {
          }
        },
        collapse() {
        },
        computeExpandButtonOffset() {
          return 0;
        },
        dataChanged() {
        }
      };
      const fixInlineExpanderMethods = (inlineExpanderCnt) => {
        if (inlineExpanderCnt && !inlineExpanderCnt.__$idncjk8487$__) {
          inlineExpanderCnt.__$idncjk8487$__ = true;
          inlineExpanderCnt.dataChanged = cloneMethods.dataChanged;
          inlineExpanderCnt.updateTextOnSnippetTypeChange = cloneMethods.updateTextOnSnippetTypeChange;
          if (typeof inlineExpanderCnt.collapse === "function") {
            inlineExpanderCnt.collapse = cloneMethods.collapse;
          }
          if (typeof inlineExpanderCnt.computeExpandButtonOffset === "function") {
            inlineExpanderCnt.computeExpandButtonOffset = cloneMethods.computeExpandButtonOffset;
          }
          if (typeof inlineExpanderCnt.isResetMutation === "boolean") {
            inlineExpanderCnt.isResetMutation = true;
          }
          if (typeof inlineExpanderCnt.collapseLabel === "string") {
            inlineExpanderCnt.collapseLabel = "";
          }
          fixInlineExpanderDisplay(inlineExpanderCnt);
        }
      };
      const fixInlineExpanderContent = () => {
        const mainInfo = getMainInfo();
        if (!mainInfo)
          return;
        const inlineExpanderElm = mainInfo.querySelector("ytd-text-inline-expander");
        const inlineExpanderCnt = insp(inlineExpanderElm);
        fixInlineExpanderMethods(inlineExpanderCnt);
      };
      const plugin = {
        "minibrowser": {
          activated: false,
          toUse: true,
          activate() {
            if (this.activated)
              return;
            const isPassiveArgSupport2 = typeof IntersectionObserver === "function";
            if (!isPassiveArgSupport2)
              return;
            this.activated = true;
            const ytdAppElm = document.querySelector("ytd-app");
            const ytdAppCnt = insp(ytdAppElm);
            if (!ytdAppCnt)
              return;
            const cProto = ytdAppCnt.constructor.prototype;
            if (!cProto.handleNavigate)
              return;
            if (cProto.handleNavigate.__ma355__)
              return;
            cProto.handleNavigate = handleNavigateFactory(cProto.handleNavigate);
            cProto.handleNavigate.__ma355__ = 1;
          }
        },
        "autoExpandInfoDesc": {
          activated: false,
          toUse: false,
          mo: null,
          promiseReady: new PromiseExternal(),
          moFn(lockId) {
            if (lockGet["autoExpandInfoDescAttrAsyncLock"] !== lockId)
              return;
            const mainInfo = getMainInfo();
            if (!mainInfo)
              return;
            switch (((mainInfo || 0).nodeName || "").toLowerCase()) {
              case "ytd-expander":
                if (mainInfo.hasAttribute000("collapsed")) {
                  let success = false;
                  try {
                    insp(mainInfo).handleMoreTap(new Event("tap"));
                    success = true;
                  } catch (e) {
                  }
                  if (success)
                    mainInfo.setAttribute111("tyt-no-less-btn", "");
                }
                break;
              case "ytd-expandable-video-description-body-renderer":
                const inlineExpanderElm = mainInfo.querySelector("ytd-text-inline-expander");
                const inlineExpanderCnt = insp(inlineExpanderElm);
                if (inlineExpanderCnt && inlineExpanderCnt.isExpanded === false) {
                  setExpand(inlineExpanderCnt, true);
                }
                break;
            }
          },
          activate() {
            if (this.activated)
              return;
            this.moFn = this.moFn.bind(this);
            this.mo = new MutationObserver(() => {
              Promise.resolve(lockSet["autoExpandInfoDescAttrAsyncLock"]).then(this.moFn).catch(console.warn);
            });
            this.activated = true;
            this.promiseReady.resolve();
          },
          async onMainInfoSet(mainInfo) {
            await this.promiseReady.then();
            if (mainInfo.nodeName.toLowerCase() === "ytd-expander") {
              this.mo.observe(mainInfo, { attributes: true, attributeFilter: ["collapsed", "attr-8ifv7"] });
            } else {
              this.mo.observe(mainInfo, { attributes: true, attributeFilter: ["attr-8ifv7"] });
            }
            mainInfo.incAttribute111("attr-8ifv7");
          }
        },
        "fullChannelNameOnHover": {
          activated: false,
          toUse: true,
          mo: null,
          ro: null,
          promiseReady: new PromiseExternal(),
          checkResize: 0,
          mouseEnterFn(evt) {
            const target = evt ? evt.target : null;
            if (!(target instanceof HTMLElement_))
              return;
            const metaDataElm = target.closest("ytd-watch-metadata");
            metaDataElm.classList.remove("tyt-metadata-hover-resized");
            this.checkResize = Date.now() + 300;
            metaDataElm.classList.add("tyt-metadata-hover");
          },
          mouseLeaveFn(evt) {
            const target = evt ? evt.target : null;
            if (!(target instanceof HTMLElement_))
              return;
            const metaDataElm = target.closest("ytd-watch-metadata");
            metaDataElm.classList.remove("tyt-metadata-hover-resized");
            metaDataElm.classList.remove("tyt-metadata-hover");
          },
          moFn(lockId) {
            if (lockGet["fullChannelNameOnHoverAttrAsyncLock"] !== lockId)
              return;
            const uploadInfo = document.querySelector("#primary.ytd-watch-flexy ytd-watch-metadata #upload-info");
            if (!uploadInfo)
              return;
            const evtOpt = { passive: true, capture: false };
            uploadInfo.removeEventListener("pointerenter", this.mouseEnterFn, evtOpt);
            uploadInfo.removeEventListener("pointerleave", this.mouseLeaveFn, evtOpt);
            uploadInfo.addEventListener("pointerenter", this.mouseEnterFn, evtOpt);
            uploadInfo.addEventListener("pointerleave", this.mouseLeaveFn, evtOpt);
          },
          async onNavigateFinish() {
            await this.promiseReady.then();
            const uploadInfo = document.querySelector("#primary.ytd-watch-flexy ytd-watch-metadata #upload-info");
            if (!uploadInfo)
              return;
            this.mo.observe(uploadInfo, { attributes: true, attributeFilter: ["hidden", "attr-3wb0k"] });
            uploadInfo.incAttribute111("attr-3wb0k");
            this.ro.observe(uploadInfo);
          },
          activate() {
            if (this.activated)
              return;
            const isPassiveArgSupport2 = typeof IntersectionObserver === "function";
            if (!isPassiveArgSupport2)
              return;
            this.activated = true;
            this.mouseEnterFn = this.mouseEnterFn.bind(this);
            this.mouseLeaveFn = this.mouseLeaveFn.bind(this);
            this.moFn = this.moFn.bind(this);
            this.mo = new MutationObserver(() => {
              Promise.resolve(lockSet["fullChannelNameOnHoverAttrAsyncLock"]).then(this.moFn).catch(console.warn);
            });
            this.ro = new ResizeObserver((mutations) => {
              if (Date.now() > this.checkResize)
                return;
              for (const mutation of mutations) {
                const uploadInfo = mutation.target;
                if (uploadInfo && mutation.contentRect.width > 0 && mutation.contentRect.height > 0) {
                  const metaDataElm = uploadInfo.closest("ytd-watch-metadata");
                  if (metaDataElm.classList.contains("tyt-metadata-hover")) {
                    metaDataElm.classList.add("tyt-metadata-hover-resized");
                  }
                  break;
                }
              }
            });
            this.promiseReady.resolve();
          }
        },
        "external.ytlstm": {
          activated: false,
          toUse: true,
          activate() {
            if (this.activated)
              return;
            this.activated = true;
            document.documentElement.classList.add("external-ytlstm");
          }
        }
      };
      if (sessionStorage.__$tmp_UseAutoExpandInfoDesc$__)
        plugin.autoExpandInfoDesc.toUse = true;
      const __attachedSymbol__ = Symbol();
      const makeInitAttached = (tag) => {
        const inPageRearrange_ = inPageRearrange;
        inPageRearrange = false;
        for (const elm of document.querySelectorAll(`${tag}`)) {
          const cnt = insp(elm) || 0;
          if (typeof cnt.attached498 === "function" && !elm[__attachedSymbol__])
            Promise.resolve(elm).then(eventMap[`${tag}::attached`]).catch(console.warn);
        }
        inPageRearrange = inPageRearrange_;
      };
      const getGeneralChatElement = async () => {
        for (let i = 2; i-- > 0; ) {
          let t = document.querySelector("#columns.style-scope.ytd-watch-flexy ytd-live-chat-frame#chat");
          if (t instanceof Element)
            return t;
          if (i > 0) {
            await delayPn(200);
          }
        }
        return null;
      };
      const nsTemplateObtain = () => {
        let nsTemplate = document.querySelector("ytd-watch-flexy noscript[ns-template]");
        if (!nsTemplate) {
          nsTemplate = document.createElement("noscript");
          nsTemplate.setAttribute("ns-template", "");
          document.querySelector("ytd-watch-flexy").appendChild(nsTemplate);
        }
        return nsTemplate;
      };
      const isPageDOM = (elm, selector) => {
        if (!elm || !(elm instanceof Element) || !elm.nodeName)
          return false;
        if (!elm.closest(selector))
          return false;
        if (elm.isConnected !== true)
          return false;
        return true;
      };
      const invalidFlexyParent = (hostElement) => {
        if (hostElement instanceof HTMLElement) {
          const hasFlexyParent = HTMLElement.prototype.closest.call(hostElement, "ytd-watch-flexy");
          if (!hasFlexyParent)
            return true;
          const currentFlexy = elements.flexy;
          if (currentFlexy && currentFlexy !== hasFlexyParent)
            return true;
        }
        return false;
      };
      let headerMutationObserver = null;
      let headerMutationTmpNode = null;
      const eventMap = {
        "ceHack": () => {
          mLoaded.flag |= 2;
          document.documentElement.setAttribute111("tabview-loaded", mLoaded.makeString());
          retrieveCE("ytd-watch-flexy").then(eventMap["ytd-watch-flexy::defined"]).catch(console.warn);
          retrieveCE("ytd-expander").then(eventMap["ytd-expander::defined"]).catch(console.warn);
          retrieveCE("ytd-watch-next-secondary-results-renderer").then(eventMap["ytd-watch-next-secondary-results-renderer::defined"]).catch(console.warn);
          retrieveCE("ytd-comments-header-renderer").then(eventMap["ytd-comments-header-renderer::defined"]).catch(console.warn);
          retrieveCE("ytd-live-chat-frame").then(eventMap["ytd-live-chat-frame::defined"]).catch(console.warn);
          retrieveCE("ytd-comments").then(eventMap["ytd-comments::defined"]).catch(console.warn);
          retrieveCE("ytd-engagement-panel-section-list-renderer").then(eventMap["ytd-engagement-panel-section-list-renderer::defined"]).catch(console.warn);
          retrieveCE("ytd-watch-metadata").then(eventMap["ytd-watch-metadata::defined"]).catch(console.warn);
          retrieveCE("ytd-playlist-panel-renderer").then(eventMap["ytd-playlist-panel-renderer::defined"]).catch(console.warn);
          retrieveCE("ytd-expandable-video-description-body-renderer").then(eventMap["ytd-expandable-video-description-body-renderer::defined"]).catch(console.warn);
        },
        "fixForTabDisplay": (isResize) => {
          bFixForResizedTabLater = false;
          for (const element of document.querySelectorAll("[io-intersected]")) {
            const cnt = insp(element);
            if (element instanceof HTMLElement_ && typeof cnt.calculateCanCollapse === "function") {
              try {
                cnt.calculateCanCollapse(true);
              } catch (e) {
              }
            }
          }
          if (!isResize && lastTab === "#tab-info") {
            for (const element of document.querySelectorAll("#tab-info ytd-video-description-infocards-section-renderer, #tab-info yt-chip-cloud-renderer, #tab-info ytd-horizontal-card-list-renderer, #tab-info yt-horizontal-list-renderer")) {
              const cnt = insp(element);
              if (element instanceof HTMLElement_ && typeof cnt.notifyResize === "function") {
                try {
                  cnt.notifyResize();
                } catch (e) {
                }
              }
            }
            for (const element of document.querySelectorAll("#tab-info ytd-text-inline-expander")) {
              const cnt = insp(element);
              if (element instanceof HTMLElement_ && typeof cnt.resize === "function") {
                cnt.resize(false);
              }
              fixInlineExpanderDisplay(cnt);
            }
          }
          if (!isResize && typeof lastTab === "string" && lastTab.startsWith("#tab-")) {
            const tabContent = document.querySelector(".tab-content-cld:not(.tab-content-hidden)");
            if (tabContent) {
              const renderers = tabContent.querySelectorAll("yt-chip-cloud-renderer");
              for (const renderer of renderers) {
                const cnt = insp(renderer);
                if (typeof cnt.notifyResize === "function") {
                  try {
                    cnt.notifyResize();
                  } catch (e) {
                  }
                }
              }
            }
          }
        },
        "ytd-watch-flexy::defined": (cProto) => {
          if (!cProto.updateChatLocation498 && typeof cProto.updateChatLocation === "function" && cProto.updateChatLocation.length === 0) {
            cProto.updateChatLocation498 = cProto.updateChatLocation;
            cProto.updateChatLocation = updateChatLocation498;
          }
          if (!cProto.isTwoColumnsChanged498_ && typeof cProto.isTwoColumnsChanged_ === "function" && cProto.isTwoColumnsChanged_.length === 2) {
            cProto.isTwoColumnsChanged498_ = cProto.isTwoColumnsChanged_;
            cProto.isTwoColumnsChanged_ = function(arg1, arg2, ...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.isTwoColumnsChanged498_(arg1, arg2, ...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.defaultTwoColumnLayoutChanged498 && typeof cProto.defaultTwoColumnLayoutChanged === "function" && cProto.defaultTwoColumnLayoutChanged.length === 0) {
            cProto.defaultTwoColumnLayoutChanged498 = cProto.defaultTwoColumnLayoutChanged;
            cProto.defaultTwoColumnLayoutChanged = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.defaultTwoColumnLayoutChanged498(...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.updatePlayerLocation498 && typeof cProto.updatePlayerLocation === "function" && cProto.updatePlayerLocation.length === 0) {
            cProto.updatePlayerLocation498 = cProto.updatePlayerLocation;
            cProto.updatePlayerLocation = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.updatePlayerLocation498(...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.updateCinematicsLocation498 && typeof cProto.updateCinematicsLocation === "function" && cProto.updateCinematicsLocation.length === 0) {
            cProto.updateCinematicsLocation498 = cProto.updateCinematicsLocation;
            cProto.updateCinematicsLocation = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.updateCinematicsLocation498(...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.updatePanelsLocation498 && typeof cProto.updatePanelsLocation === "function" && cProto.updatePanelsLocation.length === 0) {
            cProto.updatePanelsLocation498 = cProto.updatePanelsLocation;
            cProto.updatePanelsLocation = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.updatePanelsLocation498(...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.swatcherooUpdatePanelsLocation498 && typeof cProto.swatcherooUpdatePanelsLocation === "function" && cProto.swatcherooUpdatePanelsLocation.length === 6) {
            cProto.swatcherooUpdatePanelsLocation498 = cProto.swatcherooUpdatePanelsLocation;
            cProto.swatcherooUpdatePanelsLocation = function(arg1, arg2, arg3, arg4, arg5, arg6, ...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.swatcherooUpdatePanelsLocation498(arg1, arg2, arg3, arg4, arg5, arg6, ...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.updateErrorScreenLocation498 && typeof cProto.updateErrorScreenLocation === "function" && cProto.updateErrorScreenLocation.length === 0) {
            cProto.updateErrorScreenLocation498 = cProto.updateErrorScreenLocation;
            cProto.updateErrorScreenLocation = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.updateErrorScreenLocation498(...args);
                return r2;
              });
              return r;
            };
          }
          if (!cProto.updateFullBleedElementLocations498 && typeof cProto.updateFullBleedElementLocations === "function" && cProto.updateFullBleedElementLocations.length === 0) {
            cProto.updateFullBleedElementLocations498 = cProto.updateFullBleedElementLocations;
            cProto.updateFullBleedElementLocations = function(...args) {
              const r = secondaryInnerFn(() => {
                const r2 = this.updateFullBleedElementLocations498(...args);
                return r2;
              });
              return r;
            };
          }
        },
        "ytd-watch-next-secondary-results-renderer::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-watch-next-secondary-results-renderer::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-watch-next-secondary-results-renderer::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          makeInitAttached("ytd-watch-next-secondary-results-renderer");
        },
        "ytd-watch-next-secondary-results-renderer::attached": (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (hostElement instanceof HTMLElement_ && hostElement.matches("#columns #related ytd-watch-next-secondary-results-renderer") && !hostElement.matches("#right-tabs ytd-watch-next-secondary-results-renderer, [hidden] ytd-watch-next-secondary-results-renderer")) {
            elements.related = hostElement.closest("#related");
            hostElement.setAttribute111("tyt-videos-list", "");
          }
        },
        "ytd-watch-next-secondary-results-renderer::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-videos-list")) {
            elements.related = null;
            hostElement.removeAttribute000("tyt-videos-list");
          }
        },
        "settingCommentsVideoId": (hostElement) => {
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          const cnt = insp(hostElement);
          const commentsArea = elements.comments;
          if (commentsArea !== hostElement || hostElement.isConnected !== true || cnt.isAttached !== true || !cnt.data || cnt.hidden !== false)
            return;
          const ytdFlexyElm = elements.flexy;
          const ytdFlexyCnt = ytdFlexyElm ? insp(ytdFlexyElm) : null;
          if (ytdFlexyCnt && ytdFlexyCnt.videoId) {
            hostElement.setAttribute111("tyt-comments-video-id", ytdFlexyCnt.videoId);
          } else {
            hostElement.removeAttribute000("tyt-comments-video-id");
          }
        },
        "checkCommentsShouldBeHidden": (lockId) => {
          if (lockGet["checkCommentsShouldBeHiddenLock"] !== lockId)
            return;
          const commentsArea = elements.comments;
          const ytdFlexyElm = elements.flexy;
          if (commentsArea && ytdFlexyElm && !commentsArea.hasAttribute000("hidden")) {
            const ytdFlexyCnt = insp(ytdFlexyElm);
            if (typeof ytdFlexyCnt.videoId === "string") {
              const commentsVideoId = commentsArea.getAttribute("tyt-comments-video-id");
              if (commentsVideoId && commentsVideoId !== ytdFlexyCnt.videoId) {
                commentsArea.setAttribute111("hidden", "");
              }
            }
          }
        },
        "ytd-comments::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-comments::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-comments::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          cProto._createPropertyObserver("data", "_dataChanged498", void 0);
          cProto._dataChanged498 = function() {
            Promise.resolve(this.hostElement).then(eventMap["ytd-comments::_dataChanged498"]).catch(console.warn);
          };
          makeInitAttached("ytd-comments");
        },
        "ytd-comments::_dataChanged498": (hostElement) => {
          if (!hostElement.hasAttribute000("tyt-comments-area"))
            return;
          let commentsDataStatus = 0;
          const cnt = insp(hostElement);
          const data = cnt ? cnt.data : null;
          const contents = data ? data.contents : null;
          if (data) {
            if (contents && contents.length === 1 && contents[0].messageRenderer) {
              commentsDataStatus = 2;
            }
            if (contents && contents.length > 1 && contents[0].commentThreadRenderer) {
              commentsDataStatus = 1;
            }
          }
          if (commentsDataStatus) {
            hostElement.setAttribute111("tyt-comments-data-status", commentsDataStatus);
          } else {
            hostElement.removeAttribute000("tyt-comments-data-status");
          }
          Promise.resolve(hostElement).then(eventMap["settingCommentsVideoId"]).catch(console.warn);
        },
        "ytd-comments::attached": async (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (!hostElement || hostElement.id !== "comments")
            return;
          elements.comments = hostElement;
          Promise.resolve(hostElement).then(eventMap["settingCommentsVideoId"]).catch(console.warn);
          aoComment.observe(hostElement, { attributes: true });
          hostElement.setAttribute111("tyt-comments-area", "");
          const lockId = lockSet["rightTabReadyLock02"];
          await rightTabsProvidedPromise.then();
          if (lockGet["rightTabReadyLock02"] !== lockId)
            return;
          if (elements.comments !== hostElement)
            return;
          if (hostElement.isConnected === false)
            return;
          DEBUG_5085 && void 0;
          if (hostElement && !hostElement.closest("#right-tabs")) {
            document.querySelector("#tab-comments").assignChildren111(null, hostElement, null);
          } else {
            const shouldTabVisible = elements.comments && elements.comments.closest("#tab-comments") && !elements.comments.closest("[hidden]");
            document.querySelector('[tyt-tab-content="#tab-comments"]').classList.toggle("tab-btn-hidden", !shouldTabVisible);
            Promise.resolve(lockSet["removeKeepCommentsScrollerLock"]).then(removeKeepCommentsScroller).catch(console.warn);
          }
          TAB_AUTO_SWITCH_TO_COMMENTS && switchToTab("#tab-comments");
        },
        "ytd-comments::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-comments-area")) {
            hostElement.removeAttribute000("tyt-comments-area");
            aoComment.disconnect();
            aoComment.takeRecords();
            elements.comments = null;
            document.querySelector('[tyt-tab-content="#tab-comments"]').classList.add("tab-btn-hidden");
            Promise.resolve(lockSet["removeKeepCommentsScrollerLock"]).then(removeKeepCommentsScroller).catch(console.warn);
          }
        },
        "ytd-comments-header-renderer::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-comments-header-renderer::attached"]).catch(console.warn);
              Promise.resolve(this.hostElement).then(eventMap["ytd-comments-header-renderer::dataChanged"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-comments-header-renderer::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          if (!cProto.dataChanged498 && typeof cProto.dataChanged === "function") {
            cProto.dataChanged498 = cProto.dataChanged;
            cProto.dataChanged = function() {
              Promise.resolve(this.hostElement).then(eventMap["ytd-comments-header-renderer::dataChanged"]).catch(console.warn);
              return this.dataChanged498();
            };
          }
          makeInitAttached("ytd-comments-header-renderer");
        },
        "ytd-comments-header-renderer::attached": (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (!hostElement || !hostElement.classList.contains("ytd-item-section-renderer"))
            return;
          const targetElement = document.querySelector("[tyt-comments-area] ytd-comments-header-renderer");
          if (hostElement === targetElement) {
            hostElement.setAttribute111("tyt-comments-header-field", "");
          } else {
            const parentNode = hostElement.parentNode;
            if (parentNode instanceof HTMLElement_ && parentNode.querySelector("[tyt-comments-header-field]")) {
              hostElement.setAttribute111("tyt-comments-header-field", "");
            }
          }
        },
        "ytd-comments-header-renderer::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("field-of-cm-count")) {
            hostElement.removeAttribute000("field-of-cm-count");
            const cmCount = document.querySelector("#tyt-cm-count");
            if (cmCount && !document.querySelector("#tab-comments ytd-comments-header-renderer[field-of-cm-count]")) {
              cmCount.textContent = "";
            }
          }
          if (hostElement.hasAttribute000("tyt-comments-header-field")) {
            hostElement.removeAttribute000("tyt-comments-header-field");
          }
        },
        "ytd-comments-header-renderer::dataChanged": (hostElement) => {
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          const ytdFlexyElm = elements.flexy;
          let b = false;
          const cnt = insp(hostElement);
          if (cnt && hostElement.closest("#tab-comments") && document.querySelector("#tab-comments ytd-comments-header-renderer") === hostElement) {
            b = true;
          } else if (hostElement instanceof HTMLElement_ && hostElement.parentNode instanceof HTMLElement_ && hostElement.parentNode.querySelector("[tyt-comments-header-field]")) {
            b = true;
          }
          if (b) {
            hostElement.setAttribute111("tyt-comments-header-field", "");
            ytdFlexyElm && ytdFlexyElm.removeAttribute000("tyt-comment-disabled");
          }
          if (hostElement.hasAttribute000("tyt-comments-header-field") && hostElement.isConnected === true) {
            if (!headerMutationObserver) {
              headerMutationObserver = new MutationObserver(eventMap["ytd-comments-header-renderer::deferredCounterUpdate"]);
            }
            headerMutationObserver.observe(hostElement.parentNode, { subtree: false, childList: true });
            if (!headerMutationTmpNode)
              headerMutationTmpNode = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            const tmpNode = headerMutationTmpNode;
            hostElement.insertAdjacentElement("afterend", tmpNode);
            tmpNode.remove();
          }
        },
        "ytd-comments-header-renderer::deferredCounterUpdate": () => {
          const nodes = document.querySelectorAll("#tab-comments ytd-comments-header-renderer[class]");
          if (nodes.length === 1) {
            const hostElement = nodes[0];
            const cnt = insp(hostElement);
            const data = cnt.data;
            if (!data)
              return;
            let ez = "";
            if (data.commentsCount && data.commentsCount.runs && data.commentsCount.runs.length >= 1) {
              let max = -1;
              const z = data.commentsCount.runs.map((e) => {
                let c = e.text.replace(/\D+/g, "").length;
                if (c > max)
                  max = c;
                return [e.text, c];
              }).filter((a) => a[1] === max);
              if (z.length >= 1) {
                ez = z[0][0];
              }
            } else if (data.countText && data.countText.runs && data.countText.runs.length >= 1) {
              let max = -1;
              const z = data.countText.runs.map((e) => {
                let c = e.text.replace(/\D+/g, "").length;
                if (c > max)
                  max = c;
                return [e.text, c];
              }).filter((a) => a[1] === max);
              if (z.length >= 1) {
                ez = z[0][0];
              }
            }
            const cmCount = document.querySelector("#tyt-cm-count");
            if (ez) {
              hostElement.setAttribute111("field-of-cm-count", "");
              cmCount && (cmCount.textContent = ez.trim());
            } else {
              hostElement.removeAttribute000("field-of-cm-count");
              cmCount && (cmCount.textContent = "");
            }
          }
        },
        "ytd-expander::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-expander::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-expander::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          if (!cProto.calculateCanCollapse498 && typeof cProto.calculateCanCollapse === "function") {
            cProto.calculateCanCollapse498 = cProto.calculateCanCollapse;
            cProto.calculateCanCollapse = funcCanCollapse;
          }
          if (!cProto.childrenChanged498 && typeof cProto.childrenChanged === "function") {
            cProto.childrenChanged498 = cProto.childrenChanged;
            cProto.childrenChanged = function() {
              Promise.resolve(this.hostElement).then(eventMap["ytd-expander::childrenChanged"]).catch(console.warn);
              return this.childrenChanged498();
            };
          }
          makeInitAttached("ytd-expander");
        },
        "ytd-expander::childrenChanged": (hostElement) => {
          if (hostElement instanceof Node && hostElement.hasAttribute000("hidden") && hostElement.hasAttribute000("tyt-main-info") && hostElement.firstElementChild) {
            hostElement.removeAttribute("hidden");
          }
        },
        "ytd-expandable-video-description-body-renderer::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-expandable-video-description-body-renderer::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-expandable-video-description-body-renderer::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          makeInitAttached("ytd-expandable-video-description-body-renderer");
        },
        "ytd-expandable-video-description-body-renderer::attached": async (hostElement) => {
          if (hostElement instanceof HTMLElement_ && isPageDOM(hostElement, "[tyt-info-renderer]") && !hostElement.matches("[tyt-main-info]")) {
            elements.infoExpander = hostElement;
            infoExpanderElementProvidedPromise.resolve();
            hostElement.setAttribute111("tyt-main-info", "");
            if (plugin.autoExpandInfoDesc.toUse) {
              plugin.autoExpandInfoDesc.onMainInfoSet(hostElement);
            }
            const lockId = lockSet["rightTabReadyLock03"];
            await rightTabsProvidedPromise.then();
            if (lockGet["rightTabReadyLock03"] !== lockId)
              return;
            if (elements.infoExpander !== hostElement)
              return;
            if (hostElement.isConnected === false)
              return;
            elements.infoExpander.classList.add("tyt-main-info");
            const infoExpander = elements.infoExpander;
            const inlineExpanderElm = infoExpander.querySelector("ytd-text-inline-expander");
            if (inlineExpanderElm) {
              const mo = new MutationObserver(() => {
                const p = document.querySelector("#tab-info ytd-text-inline-expander");
                sessionStorage.__$tmp_UseAutoExpandInfoDesc$__ = p && p.hasAttribute("is-expanded") ? "1" : "";
                if (p)
                  fixInlineExpanderContent();
              });
              mo.observe(inlineExpanderElm, { attributes: ["is-expanded", "attr-6v8qu", "hidden"], subtree: true });
              inlineExpanderElm.incAttribute111("attr-6v8qu");
              const cnt = insp(inlineExpanderElm);
              if (cnt)
                fixInlineExpanderDisplay(cnt);
            }
            if (infoExpander && !infoExpander.closest("#right-tabs")) {
              document.querySelector("#tab-info").assignChildren111(null, infoExpander, null);
            } else {
              if (document.querySelector('[tyt-tab-content="#tab-info"]')) {
                const shouldTabVisible = elements.infoExpander && elements.infoExpander.closest("#tab-info");
                document.querySelector('[tyt-tab-content="#tab-info"]').classList.toggle("tab-btn-hidden", !shouldTabVisible);
              }
            }
            Promise.resolve(lockSet["infoFixLock"]).then(infoFix).catch(console.warn);
          }
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (isPageDOM(hostElement, "#tab-info [tyt-main-info]")) {
          } else if (!hostElement.closest("#tab-info")) {
            const bodyRenderer = hostElement;
            let bodyRendererNew = document.querySelector("ytd-expandable-video-description-body-renderer[tyt-info-renderer]");
            if (!bodyRendererNew) {
              bodyRendererNew = document.createElement("ytd-expandable-video-description-body-renderer");
              bodyRendererNew.setAttribute("tyt-info-renderer", "");
              nsTemplateObtain().appendChild(bodyRendererNew);
            }
            const cnt = insp(bodyRendererNew);
            cnt.data = Object.assign({}, insp(bodyRenderer).data);
            const inlineExpanderElm = bodyRendererNew.querySelector("ytd-text-inline-expander");
            const inlineExpanderCnt = insp(inlineExpanderElm);
            fixInlineExpanderMethods(inlineExpanderCnt);
            elements.infoExpanderRendererBack = bodyRenderer;
            elements.infoExpanderRendererFront = bodyRendererNew;
            bodyRenderer.setAttribute("tyt-info-renderer-back", "");
            bodyRendererNew.setAttribute("tyt-info-renderer-front", "");
          }
        },
        "ytd-expandable-video-description-body-renderer::detached": async (hostElement) => {
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-main-info")) {
            DEBUG_5084 && void 0;
            elements.infoExpander = null;
            hostElement.removeAttribute000("tyt-main-info");
          }
        },
        "ytd-expander::attached": async (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (hostElement instanceof HTMLElement_ && hostElement.matches("[tyt-comments-area] #contents ytd-expander#expander") && !hostElement.matches("[hidden] ytd-expander#expander")) {
            hostElement.setAttribute111("tyt-content-comment-entry", "");
            ioComment.observe(hostElement);
          }
        },
        "ytd-expander::detached": (hostElement) => {
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-content-comment-entry")) {
            ioComment.unobserve(hostElement);
            hostElement.removeAttribute000("tyt-content-comment-entry");
          } else if (hostElement.hasAttribute000("tyt-main-info")) {
            DEBUG_5084 && void 0;
            elements.infoExpander = null;
            hostElement.removeAttribute000("tyt-main-info");
          }
        },
        "ytd-live-chat-frame::defined": (cProto) => {
          let lastDomAction = 0;
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              lastDomAction = Date.now();
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-live-chat-frame::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              lastDomAction = Date.now();
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-live-chat-frame::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          if (typeof cProto.urlChanged === "function" && !cProto.urlChanged66 && !cProto.urlChangedAsync12 && cProto.urlChanged.length === 0) {
            cProto.urlChanged66 = cProto.urlChanged;
            let ath = 0;
            cProto.urlChangedAsync12 = async function() {
              await this.__urlChangedAsyncT689__;
              const t = ath = (ath & 1073741823) + 1;
              const chatframe = this.chatframe || (this.$ || 0).chatframe || 0;
              if (chatframe instanceof HTMLIFrameElement) {
                if (chatframe.contentDocument === null) {
                  await Promise.resolve("#").catch(console.warn);
                  if (t !== ath)
                    return;
                }
                await new Promise((resolve) => setTimeout_(resolve, 1)).catch(console.warn);
                if (t !== ath)
                  return;
                const isBlankPage = !this.data || this.collapsed;
                const p1 = new Promise((resolve) => setTimeout_(resolve, 706)).catch(console.warn);
                const p2 = new Promise((resolve) => {
                  new IntersectionObserver((entries, observer) => {
                    for (const entry of entries) {
                      const rect = entry.boundingClientRect || 0;
                      if (isBlankPage || rect.width > 0 && rect.height > 0) {
                        observer.disconnect();
                        resolve("#");
                        break;
                      }
                    }
                  }).observe(chatframe);
                }).catch(console.warn);
                await Promise.race([p1, p2]);
                if (t !== ath)
                  return;
              }
              this.urlChanged66();
            };
            cProto.urlChanged = function() {
              const t = this.__urlChangedAsyncT688__ = (this.__urlChangedAsyncT688__ & 1073741823) + 1;
              nextBrowserTick(() => {
                if (t !== this.__urlChangedAsyncT688__)
                  return;
                this.urlChangedAsync12();
              });
            };
          }
          makeInitAttached("ytd-live-chat-frame");
        },
        "ytd-live-chat-frame::attached": async (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (!hostElement || hostElement.id !== "chat")
            return;
          const lockId = lockSet["ytdLiveAttachedLock"];
          const chatElem = await getGeneralChatElement();
          if (lockGet["ytdLiveAttachedLock"] !== lockId)
            return;
          if (chatElem === hostElement) {
            elements.chat = chatElem;
            aoChat.observe(chatElem, { attributes: true });
            const isFlexyReady = elements.flexy instanceof Element;
            chatElem.setAttribute111("tyt-active-chat-frame", isFlexyReady ? "CF" : "C");
            const chatContainer = chatElem ? chatElem.closest("#chat-container") || chatElem : null;
            if (chatContainer && !chatContainer.hasAttribute000("tyt-chat-container")) {
              for (const p2 of document.querySelectorAll("[tyt-chat-container]")) {
                p2.removeAttribute000("[tyt-chat-container]");
              }
              chatContainer.setAttribute111("tyt-chat-container", "");
            }
            const cnt = insp(hostElement);
            const q = cnt.__urlChangedAsyncT688__;
            const p = cnt.__urlChangedAsyncT689__ = new PromiseExternal();
            setTimeout_(() => {
              if (p !== cnt.__urlChangedAsyncT689__)
                return;
              if (cnt.isAttached === true && hostElement.isConnected === true) {
                p.resolve();
                if (q === cnt.__urlChangedAsyncT688__) {
                  cnt.urlChanged();
                }
              }
            }, 320);
            Promise.resolve(lockSet["layoutFixLock"]).then(layoutFix);
          } else {
          }
        },
        "ytd-live-chat-frame::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-active-chat-frame")) {
            aoChat.disconnect();
            aoChat.takeRecords();
            hostElement.removeAttribute000("tyt-active-chat-frame");
            elements.chat = null;
            const ytdFlexyElm = elements.flexy;
            if (ytdFlexyElm) {
              ytdFlexyElm.removeAttribute000("tyt-chat-collapsed");
              ytdFlexyElm.setAttribute111("tyt-chat", "");
            }
          }
        },
        "ytd-engagement-panel-section-list-renderer::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-engagement-panel-section-list-renderer::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-engagement-panel-section-list-renderer::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          makeInitAttached("ytd-engagement-panel-section-list-renderer");
        },
        "ytd-engagement-panel-section-list-renderer::bindTarget": (hostElement) => {
          if (hostElement.matches("#panels.ytd-watch-flexy > ytd-engagement-panel-section-list-renderer[target-id][visibility]")) {
            hostElement.setAttribute111("tyt-egm-panel", "");
            Promise.resolve(lockSet["updateEgmPanelsLock"]).then(updateEgmPanels).catch(console.warn);
            aoEgmPanels.observe(hostElement, { attributes: true, attributeFilter: ["visibility", "hidden"] });
          }
        },
        "ytd-engagement-panel-section-list-renderer::attached": (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (!hostElement.matches("#panels.ytd-watch-flexy > ytd-engagement-panel-section-list-renderer"))
            return;
          if (hostElement.getAttribute("target-id") === null && hostElement.hasAttribute("visibility") && hostElement.matches('#panels.ytd-watch-flexy > ytd-engagement-panel-section-list-renderer[visibility*="ENGAGEMENT_PANEL_VISIBILITY_"]')) {
            let tid = "";
            try {
              tid = crypto.randomUUID();
            } catch {
              tid = Date.now().toString(36) + "-" + Math.random().toString(36).substring(2);
            }
            hostElement.setAttribute000("target-id", "tid051-" + tid);
          }
          if (hostElement.hasAttribute000("target-id") && hostElement.hasAttribute000("visibility")) {
            Promise.resolve(hostElement).then(eventMap["ytd-engagement-panel-section-list-renderer::bindTarget"]).catch(console.warn);
          } else {
            hostElement.setAttribute000("tyt-egm-panel-jclmd", "");
            moEgmPanelReady.observe(hostElement, { attributes: true, attributeFilter: ["visibility", "target-id"] });
          }
        },
        "ytd-engagement-panel-section-list-renderer::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
          if (hostElement.hasAttribute000("tyt-egm-panel")) {
            hostElement.removeAttribute000("tyt-egm-panel");
            Promise.resolve(lockSet["updateEgmPanelsLock"]).then(updateEgmPanels).catch(console.warn);
          } else if (hostElement.hasAttribute000("tyt-egm-panel-jclmd")) {
            hostElement.removeAttribute000("tyt-egm-panel-jclmd");
            moEgmPanelReadyClearFn();
          }
        },
        "ytd-watch-metadata::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-watch-metadata::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-watch-metadata::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          makeInitAttached("ytd-watch-metadata");
        },
        "ytd-watch-metadata::attached": (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          if (plugin.fullChannelNameOnHover.activated)
            plugin.fullChannelNameOnHover.onNavigateFinish();
        },
        "ytd-watch-metadata::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
        },
        "ytd-playlist-panel-renderer::defined": (cProto) => {
          if (!cProto.attached498 && typeof cProto.attached === "function") {
            cProto.attached498 = cProto.attached;
            cProto.attached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-playlist-panel-renderer::attached"]).catch(console.warn);
              return this.attached498();
            };
          }
          if (!cProto.detached498 && typeof cProto.detached === "function") {
            cProto.detached498 = cProto.detached;
            cProto.detached = function() {
              if (!inPageRearrange)
                Promise.resolve(this.hostElement).then(eventMap["ytd-playlist-panel-renderer::detached"]).catch(console.warn);
              return this.detached498();
            };
          }
          makeInitAttached("ytd-playlist-panel-renderer");
        },
        "ytd-playlist-panel-renderer::attached": (hostElement) => {
          if (invalidFlexyParent(hostElement))
            return;
          DEBUG_5084 && void 0;
          if (hostElement instanceof Element)
            hostElement[__attachedSymbol__] = true;
          if (!(hostElement instanceof HTMLElement_) || !(hostElement.classList.length > 0) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== true)
            return;
          elements.playlist = hostElement;
          aoPlayList.observe(hostElement, { attributes: true, attributeFilter: ["hidden", "collapsed", "attr-1y6nu"] });
          hostElement.incAttribute111("attr-1y6nu");
        },
        "ytd-playlist-panel-renderer::detached": (hostElement) => {
          DEBUG_5084 && void 0;
          if (!(hostElement instanceof HTMLElement_) || hostElement.closest("noscript"))
            return;
          if (hostElement.isConnected !== false)
            return;
        },
        "_yt_playerProvided": () => {
          mLoaded.flag |= 4;
          document.documentElement.setAttribute111("tabview-loaded", mLoaded.makeString());
        },
        "relatedElementProvided": (target) => {
          if (target.closest("[hidden]"))
            return;
          elements.related = target;
          videosElementProvidedPromise.resolve();
        },
        "onceInfoExpanderElementProvidedPromised": () => {
          const ytdFlexyElm = elements.flexy;
          if (ytdFlexyElm) {
            ytdFlexyElm.setAttribute111("hide-default-text-inline-expander", "");
          }
        },
        "refreshSecondaryInner": (lockId) => {
          if (lockGet["refreshSecondaryInnerLock"] !== lockId)
            return;
          const ytdFlexyElm = elements.flexy;
          if (ytdFlexyElm && ytdFlexyElm.matches("ytd-watch-flexy[theater][full-bleed-player]:not([full-bleed-no-max-width-columns])")) {
            ytdFlexyElm.setAttribute111("full-bleed-no-max-width-columns", "");
          }
          const related = elements.related;
          if (related && related.isConnected && !related.closest("#right-tabs #tab-videos")) {
            document.querySelector("#tab-videos").assignChildren111(null, related, null);
          }
          const infoExpander = elements.infoExpander;
          if (infoExpander && infoExpander.isConnected && !infoExpander.closest("#right-tabs #tab-info")) {
            document.querySelector("#tab-info").assignChildren111(null, infoExpander, null);
          } else {
          }
          const commentsArea = elements.comments;
          if (commentsArea) {
            const isConnected = commentsArea.isConnected;
            if (isConnected && !commentsArea.closest("#right-tabs #tab-comments")) {
              const tab = document.querySelector("#tab-comments");
              tab.assignChildren111(null, commentsArea, null);
            } else {
            }
          }
        },
        "yt-navigate-finish": (evt) => {
          const ytdAppElm = document.querySelector("ytd-page-manager#page-manager.style-scope.ytd-app");
          const ytdAppCnt = insp(ytdAppElm);
          pageType = ytdAppCnt ? (ytdAppCnt.data || 0).page : null;
          if (!document.querySelector("ytd-watch-flexy #player"))
            return;
          const flexyArr = [...document.querySelectorAll("ytd-watch-flexy")].filter((e) => !e.closest("[hidden]") && e.querySelector("#player"));
          if (flexyArr.length === 1) {
            elements.flexy = flexyArr[0];
            if (isRightTabsInserted) {
              Promise.resolve(lockSet["refreshSecondaryInnerLock"]).then(eventMap["refreshSecondaryInner"]).catch(console.warn);
              Promise.resolve(lockSet["removeKeepCommentsScrollerLock"]).then(removeKeepCommentsScroller).catch(console.warn);
            } else {
              navigateFinishedPromise.resolve();
              if (plugin.minibrowser.toUse)
                plugin.minibrowser.activate();
              if (plugin.autoExpandInfoDesc.toUse)
                plugin.autoExpandInfoDesc.activate();
              if (plugin.fullChannelNameOnHover.toUse)
                plugin.fullChannelNameOnHover.activate();
            }
            const chat = elements.chat;
            if (chat instanceof Element) {
              chat.setAttribute111("tyt-active-chat-frame", "CF");
            }
            const infoExpander = elements.infoExpander;
            if (infoExpander && infoExpander.closest("#right-tabs")) {
              Promise.resolve(lockSet["infoFixLock"]).then(infoFix).catch(console.warn);
            }
            Promise.resolve(lockSet["layoutFixLock"]).then(layoutFix);
            if (plugin.fullChannelNameOnHover.activated)
              plugin.fullChannelNameOnHover.onNavigateFinish();
          }
        },
        "onceInsertRightTabs": () => {
          const related = elements.related;
          let rightTabs = document.querySelector("#right-tabs");
          if (!document.querySelector("#right-tabs") && related) {
            getLangForPage();
            let docTmp = document.createElement("template");
            docTmp.innerHTML = createHTML(getTabsHTML());
            let newElm = docTmp.content.firstElementChild;
            if (newElm !== null) {
              inPageRearrange = true;
              related.parentNode.insertBefore000(newElm, related);
              inPageRearrange = false;
            }
            rightTabs = newElm;
            rightTabs.querySelector('[tyt-tab-content="#tab-comments"]').classList.add("tab-btn-hidden");
            const secondaryWrapper = document.createElement("secondary-wrapper");
            secondaryWrapper.classList.add("tabview-secondary-wrapper");
            secondaryWrapper.id = "secondary-inner-wrapper";
            const secondaryInner = document.querySelector("#secondary-inner.style-scope.ytd-watch-flexy");
            inPageRearrange = true;
            secondaryWrapper.replaceChildren000(...secondaryInner.childNodes);
            secondaryInner.insertBefore000(secondaryWrapper, secondaryInner.firstChild);
            inPageRearrange = false;
            rightTabs.querySelector("#material-tabs").addEventListener("click", eventMap["tabs-btn-click"], true);
            inPageRearrange = true;
            if (!rightTabs.closest("secondary-wrapper"))
              secondaryWrapper.appendChild000(rightTabs);
            inPageRearrange = false;
          }
          if (rightTabs) {
            isRightTabsInserted = true;
            const ioTabBtns = new IntersectionObserver((entries) => {
              for (const entry of entries) {
                const rect = entry.boundingClientRect;
                entry.target.classList.toggle("tab-btn-visible", rect.width && rect.height);
              }
            }, { rootMargin: "0px" });
            for (const btn of document.querySelectorAll(".tab-btn[tyt-tab-content]")) {
              ioTabBtns.observe(btn);
            }
            if (!related.closest("#right-tabs")) {
              document.querySelector("#tab-videos").assignChildren111(null, related, null);
            }
            const infoExpander = elements.infoExpander;
            if (infoExpander && !infoExpander.closest("#right-tabs")) {
              document.querySelector("#tab-info").assignChildren111(null, infoExpander, null);
            }
            const commentsArea = elements.comments;
            if (commentsArea && !commentsArea.closest("#right-tabs")) {
              document.querySelector("#tab-comments").assignChildren111(null, commentsArea, null);
            }
            rightTabsProvidedPromise.resolve();
            roRightTabs.disconnect();
            roRightTabs.observe(rightTabs);
            const ytdFlexyElm = elements.flexy;
            const aoFlexy = new MutationObserver(eventMap["aoFlexyFn"]);
            aoFlexy.observe(ytdFlexyElm, { attributes: true });
            Promise.resolve(lockSet["fixInitialTabStateLock"]).then(eventMap["fixInitialTabStateFn"]).catch(console.warn);
            ytdFlexyElm.incAttribute111("attr-7qlsy");
          }
        },
        "aoFlexyFn": () => {
          Promise.resolve(lockSet["checkCommentsShouldBeHiddenLock"]).then(eventMap["checkCommentsShouldBeHidden"]).catch(console.warn);
          Promise.resolve(lockSet["refreshSecondaryInnerLock"]).then(eventMap["refreshSecondaryInner"]).catch(console.warn);
          Promise.resolve(lockSet["tabsStatusCorrectionLock"]).then(eventMap["tabsStatusCorrection"]).catch(console.warn);
          const videoId = getCurrentVideoId();
          if (videoId !== tmpLastVideoId) {
            tmpLastVideoId = videoId;
            Promise.resolve(lockSet["updateOnVideoIdChangedLock"]).then(eventMap["updateOnVideoIdChanged"]).catch(console.warn);
          }
        },
        "twoColumnChanged10": (lockId) => {
          if (lockId !== lockGet["twoColumnChanged10Lock"])
            return;
          for (const continuation of document.querySelectorAll("#tab-videos ytd-watch-next-secondary-results-renderer ytd-continuation-item-renderer")) {
            if (continuation.closest("[hidden]"))
              continue;
            const cnt = insp(continuation);
            if (typeof cnt.showButton === "boolean") {
              if (cnt.showButton === false)
                continue;
              cnt.showButton = false;
              const behavior = cnt.ytRendererBehavior || cnt;
              if (typeof behavior.invalidate === "function") {
                behavior.invalidate(false);
              }
            }
          }
        },
        "tabsStatusCorrection": (lockId) => {
          if (lockId !== lockGet["tabsStatusCorrectionLock"])
            return;
          const ytdFlexyElm = elements.flexy;
          if (!ytdFlexyElm)
            return;
          const p = tabAStatus;
          const q = calculationFn(p, 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 4096);
          let resetForPanelDisappeared = false;
          if (p !== q) {
            let actioned = false;
            let special = 0;
            if (plugin["external.ytlstm"].activated) {
              if (q & 64) {
              } else if ((p & (1 | 2 | 4 | 8 | 16 | 4096)) === (1 | 0 | 0 | 8 | 16 | 4096) && (q & (1 | 2 | 4 | 8 | 16 | 4096)) === (1 | 0 | 4 | 0 | 16 | 4096)) {
                special = 3;
              } else if ((q & (1 | 16)) === (1 | 16) && document.querySelector("[data-ytlstm-theater-mode]")) {
                special = 1;
              } else if ((q & (1 | 8 | 16)) === (1 | 8 | 16) && document.querySelector('[is-two-columns_][theater][tyt-chat="+"]')) {
                special = 2;
              }
            }
            if (special) {
            } else if ((p & 128) === 0 && (q & 128) === 128) {
              lastPanel = "playlist";
            } else if ((p & 8) === 0 && (q & 8) === 8) {
              lastPanel = "chat";
            } else if (((p & 4) == 4 && (q & (4 | 8)) == (0 | 0) || (p & 8) == 8 && (q & (4 | 8)) === (0 | 0)) && lastPanel === "chat") {
              lastPanel = lastTab || "";
              resetForPanelDisappeared = true;
            } else if ((p & (4 | 8)) === 8 && (q & (4 | 8)) === 4 && lastPanel === "chat") {
              lastPanel = lastTab || "";
              resetForPanelDisappeared = true;
            } else if ((p & 128) === 128 && (q & 128) === 0 && lastPanel === "playlist") {
              lastPanel = lastTab || "";
              resetForPanelDisappeared = true;
            }
            tabAStatus = q;
            if (special) {
              if (special === 1) {
                if (ytdFlexyElm.getAttribute("tyt-chat") !== "+") {
                  ytBtnExpandChat();
                }
                if (ytdFlexyElm.getAttribute("tyt-tab")) {
                  switchToTab(null);
                }
              } else if (special === 2) {
                ytBtnCollapseChat();
              } else if (special === 3) {
                ytBtnCancelTheater();
                if (lastTab) {
                  switchToTab(lastTab);
                }
              }
              return;
            }
            let bFixForResizedTab = false;
            if ((q ^ 2) === 2 && bFixForResizedTabLater) {
              bFixForResizedTab = true;
            }
            if ((p & 16) === 16 & (q & 16) === 0) {
              Promise.resolve(lockSet["twoColumnChanged10Lock"]).then(eventMap["twoColumnChanged10"]).catch(console.warn);
            }
            if ((p & 2) === 2 ^ (q & 2) === 2 && (q & 2) === 2) {
              bFixForResizedTab = true;
            }
            if ((p & 2) === 0 && (q & 2) === 2 && (p & 128) === 128 && (q & 128) === 128) {
              lastPanel = lastTab || "";
              ytBtnClosePlaylist();
              actioned = true;
            }
            if ((p & (8 | 128)) === (0 | 128) && (q & (8 | 128)) === (8 | 128) && lastPanel === "chat") {
              lastPanel = lastTab || "";
              ytBtnClosePlaylist();
              actioned = true;
            }
            if ((p & (1 | 2 | 4 | 8 | 16 | 32 | 64 | 128)) === (1 | 2 | 0 | 8 | 16) && (q & (1 | 2 | 4 | 8 | 16 | 32 | 64 | 128)) === (0 | 2 | 0 | 8 | 16)) {
              lastPanel = lastTab || "";
              ytBtnCollapseChat();
              actioned = true;
            }
            if ((p & (2 | 128)) === (2 | 0) && (q & (2 | 128)) === (2 | 128) && lastPanel === "playlist") {
              switchToTab(null);
              actioned = true;
            }
            if ((p & (8 | 128)) === (8 | 0) && (q & (8 | 128)) === (8 | 128) && lastPanel === "playlist") {
              lastPanel = lastTab || "";
              ytBtnCollapseChat();
              actioned = true;
            }
            if ((p & (1 | 16 | 128)) == (1 | 16) && (q & (1 | 16 | 128)) == (1 | 16 | 128)) {
              ytBtnCancelTheater();
              actioned = true;
            }
            if ((p & (1 | 16 | 128)) == (16 | 128) && (q & (1 | 16 | 128)) == (1 | 16 | 128)) {
              lastPanel = lastTab || "";
              ytBtnClosePlaylist();
              actioned = true;
            }
            if ((q & 64) === 64) {
              actioned = false;
            } else if ((p & 64) == 64 && (q & 64) === 0) {
              if ((q & 32) === 32) {
                ytBtnCloseEngagementPanels();
              }
              if ((q & (2 | 8)) === (2 | 8)) {
                if (lastPanel === "chat") {
                  switchToTab(null);
                  actioned = true;
                } else if (lastPanel) {
                  ytBtnCollapseChat();
                  actioned = true;
                }
              }
            } else if ((p & (1 | 2 | 8 | 16 | 32)) === (1 | 0 | 0 | 16 | 0) && (q & (1 | 2 | 8 | 16 | 32)) === (1 | 0 | 8 | 16 | 0)) {
              ytBtnCancelTheater();
              actioned = true;
            } else if ((p & (1 | 16 | 32)) === (0 | 16 | 0) && (q & (1 | 16 | 32)) === (0 | 16 | 32) && (q & (2 | 8)) > 0) {
              if (q & 2) {
                switchToTab(null);
                actioned = true;
              }
              if (q & 8) {
                ytBtnCollapseChat();
                actioned = true;
              }
            } else if ((p & (1 | 16 | 8 | 2)) === (16 | 8) && (q & (1 | 16 | 8 | 2)) === 16 && (q & 128) === 0) {
              if (lastTab) {
                switchToTab(lastTab);
                actioned = true;
              }
            } else if ((p & 1) === 0 && (q & 1) === 1) {
              if ((q & 32) === 32) {
                ytBtnCloseEngagementPanels();
              }
              if ((p & 9) === 8 && (q & 9) === 9) {
                ytBtnCollapseChat();
              }
              switchToTab(null);
              actioned = true;
            } else if ((p & 3) === 1 && (q & 3) === 3) {
              ytBtnCancelTheater();
              actioned = true;
            } else if ((p & 10) === 2 && (q & 10) === 10) {
              switchToTab(null);
              actioned = true;
            } else if ((p & (8 | 32)) === (0 | 32) && (q & (8 | 32)) === (8 | 32)) {
              ytBtnCloseEngagementPanels();
              actioned = true;
            } else if ((p & (2 | 32)) === (0 | 32) && (q & (2 | 32)) === (2 | 32)) {
              ytBtnCloseEngagementPanels();
              actioned = true;
            } else if ((p & (2 | 8)) === (0 | 8) && (q & (2 | 8)) === (2 | 8)) {
              ytBtnCollapseChat();
              actioned = true;
            } else if ((p & 1) === 1 && (q & (1 | 32)) === (0 | 0)) {
              if (lastPanel === "chat") {
                ytBtnExpandChat();
                actioned = true;
              } else if (lastPanel === lastTab && lastTab) {
                switchToTab(lastTab);
                actioned = true;
              }
            }
            if (!actioned && (q & 128) === 128) {
              lastPanel = "playlist";
              if ((q & 2) === 2) {
                switchToTab(null);
                actioned = true;
              }
            }
            let shouldDoAutoFix = false;
            if ((p & 2) === 2 && (q & (2 | 128)) === (0 | 128)) {
            } else if ((p & 8) === 8 && (q & (8 | 128)) === (0 | 128)) {
            } else if (!actioned && (p & (1 | 16)) === 16 && (q & (1 | 16 | 8 | 2 | 32 | 64)) === (16 | 0 | 0)) {
              shouldDoAutoFix = true;
            } else if ((q & (1 | 2 | 4 | 8 | 16 | 32 | 64 | 128)) === (4 | 16)) {
              shouldDoAutoFix = true;
            }
            if (shouldDoAutoFix) {
              if (lastPanel === "chat") {
                ytBtnExpandChat();
                actioned = true;
              } else if (lastPanel === "playlist") {
                ytBtnOpenPlaylist();
                actioned = true;
              } else if (lastTab) {
                switchToTab(lastTab);
                actioned = true;
              } else if (resetForPanelDisappeared) {
                Promise.resolve(lockSet["fixInitialTabStateLock"]).then(eventMap["fixInitialTabStateFn"]).catch(console.warn);
                actioned = true;
              }
            }
            if (bFixForResizedTab) {
              bFixForResizedTabLater = false;
              Promise.resolve(0).then(eventMap["fixForTabDisplay"]).catch(console.warn);
            }
            if ((p & 16) === 16 ^ (q & 16) === 16) {
              Promise.resolve(lockSet["infoFixLock"]).then(infoFix).catch(console.warn);
              Promise.resolve(lockSet["removeKeepCommentsScrollerLock"]).then(removeKeepCommentsScroller).catch(console.warn);
              Promise.resolve(lockSet["layoutFixLock"]).then(layoutFix).catch(console.warn);
            }
          }
        },
        "updateOnVideoIdChanged": (lockId) => {
          if (lockId !== lockGet["updateOnVideoIdChangedLock"])
            return;
          const videoId = tmpLastVideoId;
          if (!videoId)
            return;
          const bodyRenderer = elements.infoExpanderRendererBack;
          const bodyRendererNew = elements.infoExpanderRendererFront;
          if (bodyRendererNew && bodyRenderer) {
            insp(bodyRendererNew).data = insp(bodyRenderer).data;
          }
          Promise.resolve(lockSet["infoFixLock"]).then(infoFix).catch(console.warn);
        },
        "fixInitialTabStateFn": async (lockId) => {
          if (lockGet["fixInitialTabStateLock"] !== lockId)
            return;
          const delayTime = fixInitialTabStateK > 0 ? 200 : 1;
          await delayPn(delayTime);
          if (lockGet["fixInitialTabStateLock"] !== lockId)
            return;
          const kTab = document.querySelector("[tyt-tab]");
          const qTab = !kTab || kTab.getAttribute("tyt-tab") === "" ? checkElementExist("ytd-watch-flexy[is-two-columns_]", "[hidden]") : null;
          if (checkElementExist("ytd-playlist-panel-renderer#playlist", "[hidden], [collapsed]")) {
            DEBUG_5085 && void 0;
            switchToTab(null);
          } else if (checkElementExist("ytd-live-chat-frame#chat", "[hidden], [collapsed]")) {
            DEBUG_5085 && void 0;
            switchToTab(null);
            if (checkElementExist("ytd-watch-flexy[theater]", "[hidden]")) {
              ytBtnCollapseChat();
            }
          } else if (qTab) {
            const hasTheater = qTab.hasAttribute("theater");
            if (!hasTheater) {
              DEBUG_5085 && void 0;
              const btn0 = document.querySelector(".tab-btn-visible");
              if (btn0) {
                switchToTab(btn0);
              } else {
                switchToTab(null);
              }
            } else {
              DEBUG_5085 && void 0;
              switchToTab(null);
            }
          } else {
            DEBUG_5085 && void 0;
          }
          fixInitialTabStateK++;
        },
        "tabs-btn-click": (evt) => {
          const target = evt.target;
          if (target instanceof HTMLElement_ && target.classList.contains("tab-btn") && target.hasAttribute000("tyt-tab-content")) {
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            const activeLink = target;
            switchToTab(activeLink);
          }
        }
      };
      Promise.all([videosElementProvidedPromise, navigateFinishedPromise]).then(eventMap["onceInsertRightTabs"]).catch(console.warn);
      Promise.all([navigateFinishedPromise, infoExpanderElementProvidedPromise]).then(eventMap["onceInfoExpanderElementProvidedPromised"]).catch(console.warn);
      const isCustomElementsProvided = typeof customElements !== "undefined" && typeof (customElements || 0).whenDefined === "function";
      const promiseForCustomYtElementsReady = isCustomElementsProvided ? Promise.resolve(0) : new Promise((callback) => {
        const EVENT_KEY_ON_REGISTRY_READY = "ytI-ce-registry-created";
        if (typeof customElements === "undefined") {
          if (!("__CE_registry" in document)) {
            Object.defineProperty(document, "__CE_registry", {
              get() {
              },
              set(nv) {
                if (typeof nv == "object") {
                  delete this.__CE_registry;
                  this.__CE_registry = nv;
                  this.dispatchEvent(new CustomEvent(EVENT_KEY_ON_REGISTRY_READY));
                }
                return true;
              },
              enumerable: false,
              configurable: true
            });
          }
          let eventHandler = (evt) => {
            document.removeEventListener(EVENT_KEY_ON_REGISTRY_READY, eventHandler, false);
            const f = callback;
            callback = null;
            eventHandler = null;
            f();
          };
          document.addEventListener(EVENT_KEY_ON_REGISTRY_READY, eventHandler, false);
        } else {
          callback();
        }
      });
      const _retrieveCE = async (nodeName) => {
        try {
          isCustomElementsProvided || await promiseForCustomYtElementsReady;
          await customElements.whenDefined(nodeName);
        } catch (e) {
        }
      };
      const retrieveCE = async (nodeName) => {
        try {
          isCustomElementsProvided || await promiseForCustomYtElementsReady;
          await customElements.whenDefined(nodeName);
          const dummy = document.querySelector(nodeName) || document.createElement(nodeName);
          const cProto = insp(dummy).constructor.prototype;
          return cProto;
        } catch (e) {
        }
      };
      const moOverallRes = {
        _yt_playerProvided: () => (window || 0)._yt_player || 0 || 0
      };
      let promiseWaitNext = null;
      const moOverall = new MutationObserver(() => {
        if (promiseWaitNext) {
          promiseWaitNext.resolve();
          promiseWaitNext = null;
        }
        if (typeof moOverallRes._yt_playerProvided === "function") {
          const r = moOverallRes._yt_playerProvided();
          if (r) {
            moOverallRes._yt_playerProvided = r;
            eventMap._yt_playerProvided();
          }
        }
      });
      moOverall.observe(document, { subtree: true, childList: true });
      const moEgmPanelReady = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target;
          if (!target.hasAttribute000("tyt-egm-panel-jclmd"))
            continue;
          if (target.hasAttribute000("target-id") && target.hasAttribute000("visibility")) {
            target.removeAttribute000("tyt-egm-panel-jclmd");
            moEgmPanelReadyClearFn();
            Promise.resolve(target).then(eventMap["ytd-engagement-panel-section-list-renderer::bindTarget"]).catch(console.warn);
          }
        }
      });
      const moEgmPanelReadyClearFn = () => {
        if (document.querySelector("[tyt-egm-panel-jclmd]") === null) {
          moEgmPanelReady.takeRecords();
          moEgmPanelReady.disconnect();
        }
      };
      document.addEventListener("yt-navigate-finish", eventMap["yt-navigate-finish"], false);
      document.addEventListener("animationstart", (evt) => {
        const f = eventMap[evt.animationName];
        if (typeof f === "function")
          f(evt.target);
      }, capturePassive);
      mLoaded.flag |= 1;
      document.documentElement.setAttribute111("tabview-loaded", mLoaded.makeString());
      promiseForCustomYtElementsReady.then(eventMap["ceHack"]).catch(console.warn);
      executionFinished = 1;
    } catch (e) {
    }
  };

  const STYLE_ENGINE_CONSTANTS = {
    PREFIX: "yt-style-",
    FALLBACK_CONTAINER_SELECTOR: "head, body, html"
  };

