//api/session/[id]/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireOwnedSession } from "@/lib/guards";
import { deleteObjects } from "@/lib/r2";
import { logAdmin } from "@/lib/admin-log";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireOwnedSession(id, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      turns: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(session);
}

// 刪除訪談：先清 R2 上的素材，再刪資料列（Turn / Asset 由 cascade 帶走）
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireOwnedSession(id, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  try {
    const assets = await prisma.asset.findMany({
      where: { sessionId: id },
      select: { objectKey: true },
    });

    if (assets.length > 0) {
      await deleteObjects(assets.map((a) => a.objectKey));
    }

    await prisma.session.delete({ where: { id } });
    if (!guard.isOwner) await logAdmin("session.delete", guard.session.title ?? id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/session/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
