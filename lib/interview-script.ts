// 訪談腳本的題目順序（對應 messages/system.ts 裡的 JSON 腳本）
// client / server 共用：進度條顯示、以及判斷目前談到哪一題

export const INTERVIEW_PARTS = [
  { id: "A", zh: "人生章節", en: "Life chapters" },
  { id: "B", zh: "人生關鍵場景", en: "Key scenes" },
  { id: "C", zh: "未來劇本", en: "Future script" },
] as const;

export const INTERVIEW_STEPS = [
  { id: "A1", zh: "人生章節", en: "Life chapters" },
  { id: "B1", zh: "高潮片段", en: "High point" },
  { id: "B2", zh: "低潮片段", en: "Low point" },
  { id: "B3", zh: "轉折點", en: "Turning point" },
  { id: "B4", zh: "童年快樂記憶", en: "Positive childhood memory" },
  { id: "B5", zh: "童年負面記憶", en: "Negative childhood memory" },
  { id: "B6", zh: "成人階段的鮮明記憶", en: "Vivid adult memory" },
  { id: "B7", zh: "宗教／靈性經驗", en: "Religious / spiritual experience" },
  { id: "B8", zh: "智慧時刻", en: "Wisdom event" },
  { id: "C1", zh: "人生的下一章", en: "The next chapter" },
  { id: "C2", zh: "夢想與計畫", en: "Dreams and plans" },
  { id: "C3", zh: "人生專案", en: "Life project" },
] as const;

export type InterviewStepId = (typeof INTERVIEW_STEPS)[number]["id"];

export function stepIndex(id?: string | null) {
  return INTERVIEW_STEPS.findIndex((step) => step.id === id);
}
