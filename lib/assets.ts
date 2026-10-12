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

/** 一次白板說明 = 影片 + 完成圖 + 筆畫（+ 插入的圖片），共用同一個 groupId */
export type WhiteboardClip = {
  key: string;
  at: number; // epoch ms
  title: string | null;
  video?: AssetDTO;
  snapshot?: AssetDTO;
  strokes?: AssetDTO;
  /** 這一組的所有素材 id（刪除整段白板時用） */
  assetIds: string[];
};

export const assetTime = (a: AssetDTO) => Date.parse(a.startedAt ?? a.createdAt);

export function groupWhiteboardClips(assets: AssetDTO[]): WhiteboardClip[] {
  const clips = new Map<string, WhiteboardClip>();

  for (const a of assets) {
    const inGroup = a.kind !== "INTERVIEW_AUDIO" && (a.kind !== "IMAGE" || !!a.groupId);
    if (!inGroup) continue;

    const key = a.groupId ?? a.id;
    const clip =
      clips.get(key) ??
      ({ key, at: assetTime(a), title: null, assetIds: [] } as WhiteboardClip);

    clip.assetIds.push(a.id);
    if (a.kind === "WHITEBOARD_VIDEO") clip.video = a;
    if (a.kind === "WHITEBOARD_SNAPSHOT") clip.snapshot = a;
    if (a.kind === "WHITEBOARD_STROKES") clip.strokes = a;
    // 插入白板的圖片 title 是檔名，不拿來當白板標題
    if (a.kind !== "IMAGE") clip.title ??= a.title;
    clips.set(key, clip);
  }

  return [...clips.values()]
    .filter((c) => c.video || c.snapshot)
    .sort((a, b) => a.at - b.at);
}
