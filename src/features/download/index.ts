import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { LangueUtil } from "../../i18n";
import { StorageUtil } from "../../core/storage";
import { Modal } from "../../ui/modal/modal";
import { DOWNLOAD_CONSTANTS } from "./constants";

function openInTab(
  url: string,
  options: { active?: boolean; insert?: boolean; setParent?: boolean } = { active: true, insert: true, setParent: true }
): void {
  if (typeof GM_openInTab === "function") {
    GM_openInTab(url, options);
  } else if (typeof GM !== "undefined" && typeof (GM as { openInTab?: (u: string, o?: object) => void }).openInTab === "function") {
    (GM as { openInTab: (u: string, o?: object) => void }).openInTab(url, options);
  } else {
    window.open(url, "_blank");
  }
}

export class VideoDownloadService {
  private static unregisterFn: (() => void) | null = null;

  public static async downloadCurrentVideo(): Promise<void> {
    const targetVideoUrl: string = window.location.href;
    const language = LangueUtil.getLanguage();
    const downloadingConfirm = StorageUtil.getValue(StorageUtil.keys.youtube.downloadingConfirm, false);
    const executeDownload = (): void => {
      const serviceUrl: URL = new URL(
        `/${encodeURIComponent(LangueUtil.getLang())}/${DOWNLOAD_CONSTANTS.SERVICE_PATH}`,
        DOWNLOAD_CONSTANTS.SERVICE_ORIGIN
      );
      serviceUrl.searchParams.set(DOWNLOAD_CONSTANTS.SOURCE_PARAMETER, DOWNLOAD_CONSTANTS.SOURCE_VALUE);
      serviceUrl.searchParams.set(DOWNLOAD_CONSTANTS.VIDEO_URL_PARAMETER, targetVideoUrl);
      openInTab(serviceUrl.toString());
    };

    if (downloadingConfirm) {
      executeDownload();
    } else {
      const confirmed = await Modal.confirm({
        title: language.content.function_setting_title,
        content: language.content.download_confirm_message,
        okText: language.content.download_enter_text,
        cancelText: language.content.download_cancel_text,
        direction: language.direction
      });
      if (confirmed) {
        StorageUtil.setValue(StorageUtil.keys.youtube.downloadingConfirm, true);
        executeDownload();
      }
    }
  }

  public static enable(): void {
    if (this.unregisterFn) return;

    this.unregisterFn = Toolbar.registerActions([
      {
        id: "download",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_download",
        defaultTitle: "Download",
        icon: "download",
        order: 60,
        dismissOnExecute: true,
        onClick: (): Promise<void> => this.downloadCurrentVideo()
      },
      {
        id: "shorts_download",
        slot: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
        titleKey: "action_download",
        defaultTitle: "Download Shorts",
        icon: "shortDownload",
        order: 10,
        onClick: (): Promise<void> => this.downloadCurrentVideo()
      },
      {
        id: "watch_download",
        slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
        titleKey: "action_download",
        defaultTitle: "Download Video",
        icon: "download",
        order: 10,
        onClick: (): Promise<void> => this.downloadCurrentVideo()
      }
    ]);
  }

  public static disable(): void {
    if (this.unregisterFn) {
      this.unregisterFn();
      this.unregisterFn = null;
    }
  }

  public static init(): void {
    this.enable();
  }
}
