// 瀏覽器端：把 Blob 直傳到 R2
// 流程：POST /api/session/[id]/assets → PUT uploadUrl → PATCH /api/assets/[assetId]

import { baseMime, type AssetKind } from "@/lib/assets";

export type UploadMeta = {
  kind: AssetKind;
  durationMs?: number;
  startedAt?: Date;
  groupId?: string;
  seq?: number;
  title?: string;
};

const RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function uploadAsset(
  sessionId: string,
  blob: Blob,
  meta: UploadMeta
): Promise<string> {
  const contentType = baseMime(blob.type);

  const created = await withRetry(async () => {
    const res = await fetch(`/api/session/${sessionId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...meta,
        startedAt: meta.startedAt?.toISOString(),
        contentType,
        sizeBytes: blob.size,
      }),
    });
    if (!res.ok) throw new Error(`Create asset failed: ${res.status}`);
    return (await res.json()) as { assetId: string; uploadUrl: string };
  });

  await withRetry(async () => {
    const res = await fetch(created.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  });

  await withRetry(async () => {
    const res = await fetch(`/api/assets/${created.assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs: meta.durationMs }),
    });
    if (!res.ok) throw new Error(`Confirm asset failed: ${res.status}`);
  });

  return created.assetId;
}
