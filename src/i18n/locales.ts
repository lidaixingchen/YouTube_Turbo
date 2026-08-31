export interface LocaleDictionary {
  direction?: "ltr" | "rtl";
  messages: Record<string, string>;
}

    export const DICTIONARIES: Record<string, LocaleDictionary> = {
      "en": {
        direction: "ltr",
        messages: {
          function_setting_title: "Setting",
          function_is_comment_table_open: "Enable video details page interface optimization.",
          function_is_theme_progress_bar_open: "Enable video playback progress bar beautification.",
          function_is_speed_control_open: "Enable video fast forward (playback speed selectable).",
          function_is_mark_or_remove_ad_open: "Enable page ad labeling.",
          function_is_youtube_downloading_open: "Enable YouTube video downloading.",
          function_is_four_column_grid_open: "Enable 4-column video grid layout on Home and Subscriptions.",
          download_confirm_message: "Downloading YouTube videos will redirect to third-party websites, which may contain ads. If you don't need this download feature, you can disable it in the settings.",
          download_enter_text: "OK",
          download_cancel_text: "Cancel",
          tab_info: "Info",
          tab_videos: "Videos",
          tab_playlist: "Playlist"
        }
      },
      "zh-CN": {
        direction: "ltr",
        messages: {
          function_setting_title: "设置",
          function_is_comment_table_open: "启用视频详情页面界面优化。",
          function_is_theme_progress_bar_open: "启用视频播放进度条美化。",
          function_is_speed_control_open: "启用视频快进（播放速度可选择）。",
          function_is_mark_or_remove_ad_open: "启用页面广告标记。",
          function_is_youtube_downloading_open: "启用YouTube视频下载。",
          function_is_four_column_grid_open: "启用首页/订阅页一行4个视频排版。",
          download_confirm_message: "下载YouTube视频将跳转到第三方网站，这些网站可能包含广告。如果您不需要此下载功能，可以在设置中禁用它。",
          download_enter_text: "确定",
          download_cancel_text: "取消",
          tab_info: "资讯",
          tab_videos: "视频",
          tab_playlist: "播放列表"
        }
      },
      "zh-TW": {
        direction: "ltr",
        messages: {
          function_setting_title: "設定",
          function_is_comment_table_open: "啟用影片詳情頁面介面優化。",
          function_is_theme_progress_bar_open: "啟用影片播放進度條美化。",
          function_is_speed_control_open: "啟用影片快轉（播放速度可選擇）。",
          function_is_mark_or_remove_ad_open: "啟用頁面廣告標記。",
          function_is_youtube_downloading_open: "啟用YouTube影片下載。",
          function_is_four_column_grid_open: "啟用首頁/訂閱頁一行4個影片排版。",
          download_confirm_message: "下載YouTube影片將跳轉到第三方網站，這些網站可能包含廣告。如果您不需要此下載功能，可以在設定中禁用它。",
          download_enter_text: "確定",
          download_cancel_text: "取消",
          tab_info: "資訊",
          tab_videos: "影片",
          tab_playlist: "播放清單"
        }
      },
      "ja": {
        direction: "ltr",
        messages: {
          function_setting_title: "設定",
          function_is_comment_table_open: "動画詳細ページのインターフェース最適化を有効にする。",
          function_is_theme_progress_bar_open: "動画再生の進行状況バーの装飾を有効にする。",
          function_is_speed_control_open: "動画の早送り（再生速度選択可能）を有効にする。",
          function_is_mark_or_remove_ad_open: "ページ広告のラベリングを有効にする。",
          function_is_youtube_downloading_open: "YouTube動画のダウンロードを有効にする。",
          function_is_four_column_grid_open: "ホーム/登録チャンネルで動画を1行4列で表示する。",
          download_confirm_message: "YouTube動画のダウンロードはサードパーティのウェブサイトにリダイレクトされ、広告が含まれている可能性があります。このダウンロード機能が不要な場合は、設定で無効にできます。",
          download_enter_text: "OK",
          download_cancel_text: "キャンセル",
          tab_info: "情報",
          tab_videos: "動画",
          tab_playlist: "再生リスト"
        }
      },
      "ko": {
        direction: "ltr",
        messages: {
          function_setting_title: "설정",
          function_is_comment_table_open: "동영상 상세 페이지 인터페이스 최적화 활성화.",
          function_is_theme_progress_bar_open: "동영상 재생 진행 바 장식 활성화.",
          function_is_speed_control_open: "동영상 빨리감기(재생 속도 선택 가능) 활성화.",
          function_is_mark_or_remove_ad_open: "페이지 광고 라벨링 활성화.",
          function_is_youtube_downloading_open: "YouTube 동영상 다운로드 활성화.",
          function_is_four_column_grid_open: "홈/구독 페이지에서 동영상을 한 줄에 4개씩 표시합니다.",
          download_confirm_message: "YouTube 동영상을 다운로드하면 제3자 웹사이트로 리디렉션되며, 광고가 포함될 수 있습니다. 이 다운로드 기능이 필요하지 않은 경우 설정에서 비활성화할 수 있습니다.",
          download_enter_text: "확인",
          download_cancel_text: "취소",
          tab_info: "정보",
          tab_videos: "동영상",
          tab_playlist: "재생목록"
        }
      },
      "ru": {
        direction: "ltr",
        messages: {
          function_setting_title: "Настройки",
          function_is_comment_table_open: "Включить оптимизацию интерфейса страницы деталей видео.",
          function_is_theme_progress_bar_open: "Включить улучшение панели прогресса воспроизведения видео.",
          function_is_speed_control_open: "Включить перемотку видео (выбор скорости воспроизведения).",
          function_is_mark_or_remove_ad_open: "Включить маркировку рекламы на странице.",
          function_is_youtube_downloading_open: "Включить загрузку видео с YouTube.",
          function_is_four_column_grid_open: "Включить отображение 4 видео в ряд на главной и в подписках.",
          download_confirm_message: "Загрузка видео с YouTube перенаправит вас на сторонние сайты, которые могут содержать рекламу. Если вам не нужна эта функция загрузки, вы можете отключить её в настройках.",
          download_enter_text: "ОК",
          download_cancel_text: "Отмена",
          tab_info: "Описание",
          tab_videos: "Видео",
          tab_playlist: "Плейлист"
        }
      },
      "fr": {
        direction: "ltr",
        messages: {
          function_setting_title: "Paramètres",
          function_is_comment_table_open: "Activer l’optimisation de l’interface de la page de détails de la vidéo.",
          function_is_theme_progress_bar_open: "Activer l’embellissement de la barre de progression de la vidéo.",
          function_is_speed_control_open: "Activer l’avance rapide de la vidéo (vitesse de lecture sélectionnable).",
          function_is_mark_or_remove_ad_open: "Activer l’étiquetage des publicités sur la page.",
          function_is_youtube_downloading_open: "Activer le téléchargement de vidéos YouTube.",
          function_is_four_column_grid_open: "Activer la disposition en grille de 4 vidéos par ligne sur l'Accueil et les Abonnements.",
          download_confirm_message: "Le téléchargement de vidéos YouTube redirigera vers des sites tiers pouvant contenir des publicités. Si vous n'avez pas besoin de cette fonctionnalité, vous pouvez la désactiver dans les paramètres.",
          download_enter_text: "OK",
          download_cancel_text: "Annuler",
          tab_info: "Info",
          tab_videos: "Vidéos",
          tab_playlist: "Playlist"
        }
      },
      "de": {
        direction: "ltr",
        messages: {
          function_setting_title: "Einstellungen",
          function_is_comment_table_open: "Optimierung der Videodetailseite aktivieren.",
          function_is_theme_progress_bar_open: "Verschönerung der Wiedergabeleiste aktivieren.",
          function_is_speed_control_open: "Video-Schnellvorlauf aktivieren (Wiedergabegeschwindigkeit wählbar).",
          function_is_mark_or_remove_ad_open: "Seitenwerbung markieren aktivieren.",
          function_is_youtube_downloading_open: "YouTube-Video-Download aktivieren.",
          function_is_four_column_grid_open: "4-Spalten-Videoraster auf Startseite und Abos aktivieren.",
          download_confirm_message: "Das Herunterladen von YouTube-Videos leitet zu Websites Dritter weiter, die Werbung enthalten können.",
          download_enter_text: "OK",
          download_cancel_text: "Abbrechen",
          tab_info: "Info",
          tab_videos: "Videos",
          tab_playlist: "Playlist"
        }
      },
      "id": {
        direction: "ltr",
        messages: {
          function_setting_title: "Pengaturan",
          function_is_comment_table_open: "Aktifkan pengoptimalan antarmuka halaman detail video.",
          function_is_theme_progress_bar_open: "Aktifkan pempercantik bilah progres pemutaran video.",
          function_is_speed_control_open: "Aktifkan percepatan video (kecepatan pemutaran dapat dipilih).",
          function_is_mark_or_remove_ad_open: "Aktifkan pelabelan iklan di halaman.",
          function_is_youtube_downloading_open: "Aktifkan pengunduhan video YouTube.",
          function_is_four_column_grid_open: "Aktifkan tata letak kisi 4 video per baris di Beranda dan Langganan.",
          download_confirm_message: "Mengunduh video YouTube akan mengarahkan ke situs web pihak ketiga yang mungkin berisi iklan. Jika Anda tidak memerlukan fitur unduhan ini, Anda dapat menonaktifkannya di pengaturan.",
          download_enter_text: "OK",
          download_cancel_text: "Batal",
          tab_info: "Info",
          tab_videos: "Video",
          tab_playlist: "Daftar Putar"
        }
      },
      "pt": {
        direction: "ltr",
        messages: {
          function_setting_title: "Configurações",
          function_is_comment_table_open: "Ativar otimização da interface da página de detalhes do vídeo.",
          function_is_theme_progress_bar_open: "Ativar embelezamento da barra de progresso do vídeo.",
          function_is_speed_control_open: "Ativar avanço rápido do vídeo (velocidade de reprodução selecionável).",
          function_is_mark_or_remove_ad_open: "Ativar rotulagem de anúncios na página.",
          function_is_youtube_downloading_open: "Ativar o download de vídeos do YouTube.",
          function_is_four_column_grid_open: "Ativar layout de grade de 4 vídeos por linha na Página Inicial e Inscrições.",
          download_confirm_message: "O download de vídeos do YouTube redirecionará para sites de terceiros, que podem conter anúncios. Se você não precisar desse recurso, poderá desativá-lo nas configurações.",
          download_enter_text: "OK",
          download_cancel_text: "Cancelar",
          tab_info: "Info",
          tab_videos: "Vídeos",
          tab_playlist: "Playlist"
        }
      },
      "tr": {
        direction: "ltr",
        messages: {
          function_setting_title: "Ayarlar",
          function_is_comment_table_open: "Video detay sayfası arayüz optimizasyonunu etkinleştir.",
          function_is_theme_progress_bar_open: "Video oynatma ilerleme çubuğu güzelleştirmesini etkinleştir.",
          function_is_speed_control_open: "Video hızlı oynatmayı etkinleştir (oynatma hızı seçilebilir).",
          function_is_mark_or_remove_ad_open: "Sayfadaki reklam etiketlemesini etkinleştir.",
          function_is_youtube_downloading_open: "YouTube video indirmeyi etkinleştir.",
          function_is_four_column_grid_open: "Ana Sayfa ve Abonelikler'de satır başına 4 video düzenini etkinleştirin.",
          download_confirm_message: "YouTube videolarını indirmek, reklam içerebilecek üçüncü taraf sitelere yönlendirme yapacaktır. Bu indirme özelliğine ihtiyacınız yoksa, ayarlardan devre dışı bırakabilirsiniz.",
          download_enter_text: "Tamam",
          download_cancel_text: "İptal",
          tab_info: "Bilgi",
          tab_videos: "Videolar",
          tab_playlist: "Oynatma Listesi"
        }
      },
      "ar": {
        direction: "rtl",
        messages: {
          function_setting_title: "الإعدادات",
          function_is_comment_table_open: "تفعيل تحسين واجهة صفحة تفاصيل الفيديو.",
          function_is_theme_progress_bar_open: "تفعيل تجميل شريط تقدم تشغيل الفيديو.",
          function_is_speed_control_open: "تفعيل التقديم السريع للفيديو.",
          function_is_mark_or_remove_ad_open: "تفعيل تمييز الإعلانات في الصفحة.",
          function_is_youtube_downloading_open: "تفعيل تنزيل مقاطع فيديو YouTube.",
          function_is_four_column_grid_open: "تفعيل تخطيط 4 مقاطع فيديو في كل صف.",
          download_confirm_message: "سيؤدي تنزيل مقاطع فيديو YouTube إلى إعادة التوجيه لمواقع جهات خارجية.",
          download_enter_text: "موافق",
          download_cancel_text: "إلغاء",
          tab_info: "معلومات",
          tab_videos: "فيديوهات",
          tab_playlist: "قائمة التشغيل"
        }
      }
    };;
