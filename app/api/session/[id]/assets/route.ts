// app/api/session/[id]/assets/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireOwnedSession } from "@/lib/guards";
import { presignUpload } from "@/lib/r2";
import {
  ASSET_RULES,
  baseMime,
  isAssetKind,
  type AssetDTO,
} from "@/lib/assets";

export const runtime = "nodejs";

type CreateAssetBody = {
  kind?: unknown;
  contentType?: string;
  sizeBytes?: number;
  durationMs?: number;
  startedAt?: string;
  groupId?: string;
  seq?: number;
  title?: string;
};

const int = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

// -------------------------
// POST：登記一個素材並取得 R2 直傳網址
// 流程：POST（拿 uploadUrl）→ 瀏覽器 PUT 到 R2 → PATCH /api/assets/[assetId] 確認
// -------------------------
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as CreateAssetBody;

    if (!isAssetKind(body.kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const rule = ASSET_RULES[body.kind];
    const contentType = baseMime(body.contentType ?? "");
    const ext = rule.types[contentType];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported contentType for ${body.kind}` },
        { status: 400 }
      );
    }
    const sizeBytes = int(body.sizeBytes);
    if (sizeBytes !== null && sizeBytes > rule.maxBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const startedAt = body.startedAt ? new Date(body.startedAt) : null;
    const objectKey = `sessions/${sessionId}/${body.kind.toLowerCase()}/${randomUUID()}.${ext}`;

    const asset = await prisma.asset.create({
      data: {
        sessionId,
        kind: body.kind,
        objectKey,
        contentType,
        durationMs: int(body.durationMs),
        startedAt:
          startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
        groupId: body.groupId?.slice(0, 64) || null,
        seq: int(body.seq),
        title: body.title?.trim().slice(0, 200) || null,
      },
    });

    const uploadUrl = await presignUpload(objectKey, contentType);

    return NextResponse.json({ assetId: asset.id, uploadUrl, contentType });
  } catch (err) {
    console.error("POST /assets error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// -------------------------
// GET：這場訪談所有已上傳完成的素材
// url 指向 /api/assets/[id]，每次存取時才驗證身分並轉址到短效 R2 網址
// -------------------------
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  const assets = await prisma.asset.findMany({
    where: { sessionId, status: "READY" },
    orderBy: [{ startedAt: "asc" }, { seq: "asc" }, { createdAt: "asc" }],
  });

  const result: AssetDTO[] = assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    url: `/api/assets/${a.id}`,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    durationMs: a.durationMs,
    startedAt: a.startedAt?.toISOString() ?? null,
    groupId: a.groupId,
    seq: a.seq,
    title: a.title,
    createdAt: a.createdAt.toISOString(),
  }));

  return NextResponse.json({ assets: result });
}
