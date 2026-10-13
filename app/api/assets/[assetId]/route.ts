// app/api/assets/[assetId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedAsset } from "@/lib/guards";
import { deleteObjects, headObject, presignRead } from "@/lib/r2";
import { ASSET_RULES } from "@/lib/assets";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ assetId: string }> };

// -------------------------
// GET：驗證擁有者後，轉址到短效的 R2 讀取網址
// 可直接當 <audio> / <video> / <img> 的 src；?download=1 → 下載
// -------------------------
export async function GET(req: Request, context: Ctx) {
  const { assetId } = await context.params;
  const guard = await requireOwnedAsset(assetId, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  const { asset } = guard;
  if (asset.status !== "READY") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const download = new URL(req.url).searchParams.has("download");
  const ext = ASSET_RULES[asset.kind].types[asset.contentType] ?? "bin";
  const filename = `${asset.title || asset.kind.toLowerCase()}-${asset.id}.${ext}`;

  const url = await presignRead(asset.objectKey, download ? filename : undefined);

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}

// -------------------------
// PATCH：瀏覽器 PUT 完成後呼叫 → 確認檔案真的在 R2 上、檢查大小
// -------------------------
export async function PATCH(req: Request, context: Ctx) {
  const { assetId } = await context.params;
  const guard = await requireOwnedAsset(assetId);
  if (!guard.ok) return guard.response;

  const { asset } = guard;

  try {
    const head = await headObject(asset.objectKey);
    if (!head) {
      return NextResponse.json(
        { error: "Object not uploaded yet" },
        { status: 409 }
      );
    }

    // 預簽 PUT 沒辦法限制大小，所以上傳後在這裡擋
    if (head.sizeBytes > ASSET_RULES[asset.kind].maxBytes) {
      await deleteObjects([asset.objectKey]);
      await prisma.asset.delete({ where: { id: asset.id } });
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      durationMs?: number;
    };
    const durationMs =
      typeof body.durationMs === "number" && body.durationMs >= 0
        ? Math.round(body.durationMs)
        : asset.durationMs;

    await prisma.asset.update({
      where: { id: asset.id },
      data: { status: "READY", sizeBytes: head.sizeBytes, durationMs },
    });

    return NextResponse.json({ ok: true, sizeBytes: head.sizeBytes });
  } catch (err) {
    console.error("PATCH /api/assets/[assetId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// -------------------------
// DELETE：刪除單一素材（R2 物件 + 資料列）
// -------------------------
export async function DELETE(req: Request, context: Ctx) {
  const { assetId } = await context.params;
  const guard = await requireOwnedAsset(assetId, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  try {
    await deleteObjects([guard.asset.objectKey]);
    await prisma.asset.delete({ where: { id: guard.asset.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/assets/[assetId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
