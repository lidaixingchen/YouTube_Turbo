import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { LangueUtil } from "../../i18n";
import { StorageUtil } from "../../core/storage";
import { Modal } from "../../ui/modal/modal";

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
  private static isInitialized = false;

  public static async downloadCurrentVideo(): Promise<void> {
    const language = LangueUtil.getLanguage();
    const downloadingConfirm = StorageUtil.getValue(StorageUtil.keys.youtube.downloadingConfirm, false);
    const executeDownload = (): void => {
      const url = "https://www.grabshorts.com/" + LangueUtil.getLang() + "/yt?s=40&url=" + window.location.href;
      openInTab(url);
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

  public static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    Toolbar.registerActions([
      {
        id: "download",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_download",
        defaultTitle: "Download",
        icon: "download",
        order: 60,
        dismissOnExecute: true,
        onClick: () => {
          this.downloadCurrentVideo();
        }
      },
      {
        id: "shorts_download",
        slot: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
        titleKey: "action_download",
        defaultTitle: "Download Shorts",
        icon: "shortDownload",
        order: 10,
        onClick: () => {
          this.downloadCurrentVideo();
        }
      },
      {
        id: "watch_download",
        slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
        titleKey: "action_download",
        defaultTitle: "Download Video",
        icon: "download",
        order: 10,
        onClick: () => {
          this.downloadCurrentVideo();
        }
      }
    ]);
  }
}
