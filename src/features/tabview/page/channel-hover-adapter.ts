import { PAGE_CONSTANTS } from "./constants";
import type { RouteGeneration, IdempotentDisposer } from "./types";

function onceDisposer(cleanup: () => void): IdempotentDisposer {
  let disposed: boolean = false;
  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanup();
  };
}

interface MetadataAttachment {
  readonly generation: RouteGeneration;
  readonly metadata: HTMLElement;
  readonly uploadInfo: HTMLElement;
  readonly dispose: IdempotentDisposer;
}

export class ChannelHoverAdapter {
  private static instance: ChannelHoverAdapter | null = null;
  private currentGeneration: RouteGeneration | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private currentAttachment: MetadataAttachment | null = null;
  private checkResizeDeadline: number = 0;

  public static getInstance(): ChannelHoverAdapter {
    if (!ChannelHoverAdapter.instance) {
      ChannelHoverAdapter.instance = new ChannelHoverAdapter();
    }
    return ChannelHoverAdapter.instance;
  }

  public activateRoute(generation: RouteGeneration): void {
    this.currentGeneration = generation;
  }

  public attachMetadata(
    metadata: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    if (
      this.currentAttachment &&
      this.currentAttachment.metadata === metadata &&
      this.currentAttachment.generation === generation
    ) {
      return this.currentAttachment.dispose;
    }

    if (this.currentAttachment) {
      this.currentAttachment.dispose();
      this.currentAttachment = null;
    }

    const uploadInfo =
      metadata.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.UPLOAD_INFO_CONTAINER) ||
      metadata.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.UPLOAD_INFO);
    if (!uploadInfo) {
      return (): void => {};
    }

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
        if (this.currentGeneration === null || !this.currentAttachment || this.currentAttachment.generation !== this.currentGeneration) {
          return;
        }
        if (Date.now() > this.checkResizeDeadline) {
          return;
        }
        for (let i = 0; i < entries.length; i++) {
          const target = entries[i].target as HTMLElement;
          if (target && entries[i].contentRect.width > 0) {
            const targetMetadata =
              target.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA) ?? metadata;
            if (targetMetadata && targetMetadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER)) {
              const isOverflowing =
                target.scrollWidth > target.clientWidth + PAGE_CONSTANTS.HOVER.OVERFLOW_TOLERANCE_PX;
              if (isOverflowing) {
                targetMetadata.classList.add(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
              }
            }
            break;
          }
        }
      });
    }

    const handleMouseEnter = (evt: Event): void => {
      const target = evt.currentTarget as HTMLElement | null;
      const targetMetadata =
        target?.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA) ?? metadata;
      if (targetMetadata) {
        targetMetadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
        this.checkResizeDeadline = Date.now() + PAGE_CONSTANTS.TIMEOUTS.HOVER_RESIZE_DEADLINE_MS;
        targetMetadata.classList.add(PAGE_CONSTANTS.CLASSES.METADATA_HOVER);
      }
    };

    const handleMouseLeave = (evt: Event): void => {
      const target = evt.currentTarget as HTMLElement | null;
      const targetMetadata =
        target?.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA) ?? metadata;
      if (targetMetadata) {
        targetMetadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
        targetMetadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER);
      }
    };

    const opt: AddEventListenerOptions = { passive: true, capture: false };
    uploadInfo.addEventListener("pointerenter", handleMouseEnter, opt);
    uploadInfo.addEventListener("pointerleave", handleMouseLeave, opt);
    this.resizeObserver.observe(uploadInfo);

    const disposer = onceDisposer((): void => {
      uploadInfo.removeEventListener("pointerenter", handleMouseEnter, opt);
      uploadInfo.removeEventListener("pointerleave", handleMouseLeave, opt);
      this.resizeObserver?.unobserve(uploadInfo);
      metadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER);
      metadata.classList.remove(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED);
      if (this.currentAttachment?.uploadInfo === uploadInfo) {
        this.currentAttachment = null;
      }
    });

    this.currentAttachment = {
      generation,
      metadata,
      uploadInfo,
      dispose: disposer
    };

    return disposer;
  }


  public deactivateRoute(generation: RouteGeneration): void {
    if (this.currentAttachment && this.currentAttachment.generation === generation) {
      this.currentAttachment.dispose();
      this.currentAttachment = null;
    }
    if (this.currentGeneration === generation) {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      this.currentGeneration = null;
    }
  }

  public destroy(): void {
    if (this.currentAttachment) {
      this.currentAttachment.dispose();
      this.currentAttachment = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.currentGeneration = null;
    this.checkResizeDeadline = 0;
  }
}
