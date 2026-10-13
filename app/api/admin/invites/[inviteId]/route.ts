// app/api/admin/invites/[inviteId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";
import { decryptInviteToken, newInviteToken } from "@/lib/invites";
import { logAdmin } from "@/lib/admin-log";
import { deleteObjects } from "@/lib/r2";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ inviteId: string }> };

// -------------------------
// GET：再取得這位受訪者的連結（複製用）
// -------------------------
export async function GET(req: Request, context: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { inviteId } = await context.params;
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  const token = invite?.tokenEnc ? decryptInviteToken(invite.tokenEnc) : null;
  if (!invite || !token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAdmin("invite.copyLink", invite.label);
  return NextResponse.json({ token });
}

// -------------------------
// PATCH：{ action: "regenerate" | "revoke" | "restore" }
// -------------------------
export async function PATCH(req: Request, context: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { inviteId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (body.action) {
    // 換一條新連結；舊連結立即失效
    case "regenerate": {
      const { token, tokenHash, tokenEnc } = newInviteToken();
      await prisma.invite.update({
        where: { id: inviteId },
        data: { tokenHash, tokenEnc, revokedAt: null },
      });
      await logAdmin("invite.regenerate", invite.label);
      return NextResponse.json({ ok: true, token });
    }
    case "revoke":
      await prisma.invite.update({
        where: { id: inviteId },
        data: { revokedAt: new Date() },
      });
      await logAdmin("invite.revoke", invite.label);
      return NextResponse.json({ ok: true });
    case "restore":
      await prisma.invite.update({
        where: { id: inviteId },
        data: { revokedAt: null },
      });
      await logAdmin("invite.restore", invite.label);
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

// -------------------------
// DELETE：刪除這位受訪者與所有資料（訪談、逐字稿、R2 素材）
// -------------------------
export async function DELETE(req: Request, context: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { inviteId } = await context.params;
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const assets = await prisma.asset.findMany({
      where: { session: { userId: invite.userId } },
      select: { objectKey: true },
    });
    if (assets.length > 0) {
      await deleteObjects(assets.map((a) => a.objectKey));
    }

    // Invite / Session / Turn / Asset 都由 cascade 帶走
    await prisma.user.delete({ where: { id: invite.userId } });
    await logAdmin("invite.delete", invite.label);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/invites/[inviteId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
