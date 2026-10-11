import { systemPrompt } from "./system";

export default {
  system: {
    prompt: systemPrompt,
  },

  home: {
    title: "Life Story 訪談",
    subtitle: "你的訪談紀錄",

    newSessionButton: "新增 AI 訪談",

    dialog: {
      title: "建立新的 AI 訪談",
      label: "AI 訪談標題",
      placeholder: "例如：宇星的 Life Story 訪談",
      creating: "建立中...",
      createButton: "建立 AI 訪談",
    },

    empty: {
      title: "還沒有任何 AI 訪談",
      description: "建立你的第一個 AI 訪談來開始吧",
      button: "建立第一個 AI 訪談"
    },

    sessionCard: {
      untitled: "未命名 AI 訪談",
      justNow: "剛剛",
      messages: "則訊息",
    }
  },

  sessionPage: {
    back: "返回",
    fullTranscript: "完整逐字稿",
    generateSummary: "產生訪談總結",
    startTitle: "開始你的訪談",
    startSubtitle: "按下麥克風開始",
    sending: "傳送中...",
    textPlaceholder: "輸入文字訊息（非語音模式）...",

    liveStatus: {
      connected: "聆聽中… 點擊停止",
      connecting: "連線中...",
      error: "發生錯誤，點擊重新連線",
      idle: "點擊開始語音訪談"
    },

    whiteboard: "白板說明",
    uploadImage: "上傳圖片",
    recordingNotice: "訪談進行時會全程錄音並儲存",
    uploading: "素材上傳中…",
    uploadFailed: "部分素材上傳失敗",
    imageInvalid: "僅支援 15MB 以內的 JPG / PNG / WebP / GIF 圖片",
  },

  whiteboard: {
    title: "白板說明",
    titlePlaceholder: "標題（選填）",
    recording: "錄製中",
    noMic: "無法取得麥克風，影片將沒有聲音",
    aiWatching: "AI 訪談員看得到白板",
    pen: "畫筆",
    eraser: "橡皮擦",
    undo: "復原",
    clear: "清空",
    insertImage: "插入圖片",
    finish: "完成並儲存",
    discard: "捨棄",
    discardConfirm: "確定要捨棄這段白板錄製嗎？",
    saving: "儲存中…",
    saveFailed: "儲存失敗",
    retry: "重試",
  },

  summaryPage: {
    back: "返回",
    regenerate: "重新產生",
    downloadJson: "下載 JSON",
    loading: "載入總結中...",
    empty: "尚未產生訪談總結",
    generateNow: "立即產生總結",

    title: "生命故事總結",

    sections: {
      life_theme: "敘事主題（Life Theme）",
      motifs: "重複動機與母題（Motifs）",
      turning_points: "轉折點（Turning Points）",
      high_points: "生命高峰（High Points）",
      low_points: "生命低谷（Low Points）",
      future_script: "未來敘事（Future Script）",
      psychological_insights: "心理洞察（Psychological Insights）",
      strengths: "優勢（Strengths）",
      growth_edges: "成長邊緣（Growth Edges）",
      action_items: "行動建議（Action Items）",
    }
  },

  transcriptPage: {
    back: "返回訪談頁面",
    title: "完整逐字稿",
    noMessages: "目前尚無訊息",
    goInterview: "前往訪談",

    stats: {
      messages: "則訊息",
      words: "字",
      duration: "訪談時長",
    },

    copyAll: "複製全部",
    copied: "已複製！",
    downloadTxt: "下載 TXT",

    user: "使用者",
    ai: "AI 訪談員",

    end: "逐字稿結束",

    recording: "訪談錄音",
    playFromHere: "從這裡播放",
    whiteboard: "白板說明",
    image: "圖片",
    download: "下載",
  }

};
