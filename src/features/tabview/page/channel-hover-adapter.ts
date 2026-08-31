import { PAGE_CONSTANTS } from "./constants";
import { ObserverRegistry } from "./observer-registry";

export class ChannelHoverAdapter {
  private static instance: ChannelHoverAdapter | null = null;
  private currentUploadInfo: HTMLElement | null = null;
  private checkResizeDeadline: number = 0;
  private isBound: boolean = false;

  public static getInstance(): ChannelHoverAdapter {
    if (!ChannelHoverAdapter.instance) {
      ChannelHoverAdapter.instance = new ChannelHoverAdapter();
    }
    return ChannelHoverAdapter.instance;
  }

  public activate(): void {
    if (this.isBound) {
      return;
    }
    this.isBound = true;

    ObserverRegistry.getInstance().registerChannelHoverObserver((entries: ResizeObserverEntry[]) => {
      if (Date.now() > this.checkResizeDeadline) {
        return;
      }
      for (let i = 0; i < entries.length; i++) {
        const target = entries[i].target as HTMLElement;
        if (target && entries[i].contentRect.width > 0) {
          const metadata = target.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
          if (metadata && metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER)) {
            const isOverflowing =
              target.scrollWidth > target.clientWidth + PAGE_CONSTANTS.HOVER.OVERFLOW_TOLERANCE_PX;
            if (isOverflowing) {
              metadata.classList.add(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
            }
          }
          break;
        }
      }
    });

    this.bindHoverEvents();
  }

  public onNavigateFinish(): void {
    this.bindHoverEvents();
  }

  public bindHoverEvents(): void {
    const uploadInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.UPLOAD_INFO);
    if (!uploadInfo || this.currentUploadInfo === uploadInfo) {
      return;
    }

    this.unbindCurrentEvents();
    this.currentUploadInfo = uploadInfo;

    const opt: AddEventListenerOptions = { passive: true, capture: false };
    uploadInfo.addEventListener("pointerenter", this.handleMouseEnter, opt);
    uploadInfo.addEventListener("pointerleave", this.handleMouseLeave, opt);

    ObserverRegistry.getInstance().observeChannelHover(uploadInfo);
  }

  private handleMouseEnter = (evt: Event): void => {
    const target = evt.currentTarget as HTMLElement | null;
    const metadata = target?.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (metadata) {
      metadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
      this.checkResizeDeadline = Date.now() + PAGE_CONSTANTS.TIMEOUTS.HOVER_RESIZE_DEADLINE_MS;
      metadata.classList.add(PAGE_CONSTANTS.CLASSES.METADATA_HOVER);
    }
  };

  private handleMouseLeave = (evt: Event): void => {
    const target = evt.currentTarget as HTMLElement | null;
    const metadata = target?.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (metadata) {
      metadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
      metadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER);
    }
  };

  private unbindCurrentEvents(): void {
    if (this.currentUploadInfo) {
      const opt: AddEventListenerOptions = { passive: true, capture: false };
      this.currentUploadInfo.removeEventListener("pointerenter", this.handleMouseEnter, opt);
      this.currentUploadInfo.removeEventListener("pointerleave", this.handleMouseLeave, opt);
      ObserverRegistry.getInstance().unobserveChannelHover(this.currentUploadInfo);
      this.currentUploadInfo = null;
    }
  }

  public destroy(): void {
    this.unbindCurrentEvents();
    ObserverRegistry.getInstance().clearChannelHoverObserver();
    this.isBound = false;
  }
}
