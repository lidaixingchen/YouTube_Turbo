import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { LangueUtil } from "../../i18n";
import { StorageUtil } from "../../core/storage";
import { commonUtil } from "../../core/dom-adapter";
import { Modal } from "../../ui/modal/modal";

export class VideoDownloadService {
  private static isInitialized = false;

  public static async downloadCurrentVideo(): Promise<void> {
    const language = LangueUtil.getLanguage();
    const downloadingConfirm = StorageUtil.getValue(StorageUtil.keys.youtube.downloadingConfirm, false);
    const executeDownload = (): void => {
      const url = "https://www.grabshorts.com/" + LangueUtil.getLang() + "/yt?s=40&url=" + window.location.href;
      commonUtil.openInTab(url);
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
        icon: "shortDownload",
        order: 10,
        onClick: () => {
          this.downloadCurrentVideo();
        }
      }
    ]);
  }
}
