// 各用途使用的模型（只在 server 端讀取）
// 都可以用環境變數覆蓋，換型號不用改程式、重新部署即可

/** 語音訪談員（Gemini Live API） */
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

/**
 * Live API 的版本。不設 = SDK 預設（v1beta，官方文件目前要求短效 token 用這個版本）。
 * 只有在連線被拒、需要退回舊版行為時才設成 v1alpha。
 */
export const LIVE_API_VERSION = process.env.GEMINI_LIVE_API_VERSION || undefined;

/** 訪談總結：每場一次，用較強的模型 */
export const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-6.1-sol";

/** 進度判斷：每回合一次、內容很短，用最便宜的模型 */
export const PROGRESS_MODEL = process.env.OPENAI_PROGRESS_MODEL || "gpt-6-luna";
