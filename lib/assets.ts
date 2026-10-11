// 素材種類的共用規則（client / server 都會用到，不要 import server-only 的東西）

export const ASSET_KINDS = [
  "INTERVIEW_AUDIO",
  "WHITEBOARD_VIDEO",
  "WHITEBOARD_SNAPSHOT",
  "WHITEBOARD_STROKES",
  "IMAGE",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

const MB = 1024 * 1024;

// contentType → 副檔名
export const ASSET_RULES: Record<
  AssetKind,
  { maxBytes: number; types: Record<string, string> }
> = {
  INTERVIEW_AUDIO: {
    maxBytes: 50 * MB,
    types: { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" },
  },
  WHITEBOARD_VIDEO: {
    maxBytes: 500 * MB,
    types: { "video/mp4": "mp4", "video/webm": "webm" },
  },
  WHITEBOARD_SNAPSHOT: {
    maxBytes: 10 * MB,
    types: { "image/png": "png" },
  },
  WHITEBOARD_STROKES: {
    maxBytes: 20 * MB,
    types: { "application/json": "json" },
  },
  IMAGE: {
    maxBytes: 15 * MB,
    types: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    },
  },
};

export function isAssetKind(v: unknown): v is AssetKind {
  return typeof v === "string" && (ASSET_KINDS as readonly string[]).includes(v);
}

/** "video/webm;codecs=vp9,opus" → "video/webm" */
export function baseMime(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

/** API 回給前端的素材 */
export type AssetDTO = {
  id: string;
  kind: AssetKind;
  url: string;
  contentType: string;
  sizeBytes: number | null;
  durationMs: number | null;
  startedAt: string | null;
  groupId: string | null;
  seq: number | null;
  title: string | null;
  createdAt: string;
};
