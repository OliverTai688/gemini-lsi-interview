// app/api/admin/invites/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/guards";
import { newInviteToken } from "@/lib/invites";

export const runtime = "nodejs";

// -------------------------
// GET：所有受訪者與他們的訪談進度
// -------------------------
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          sessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              completedAt: true,
              progressStep: true,
              summary: true,
              _count: { select: { turns: true } },
              turns: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    invites: invites.map((invite) => {
      const session = invite.user.sessions[0];
      return {
        id: invite.id,
        label: invite.label,
        participantName: invite.user.name,
        createdAt: invite.createdAt.toISOString(),
        firstOpenedAt: invite.firstOpenedAt?.toISOString() ?? null,
        lastOpenedAt: invite.lastOpenedAt?.toISOString() ?? null,
        revoked: !!invite.revokedAt,
        // 舊資料沒有存加密的 token → 只能重新產生
        canCopyLink: !!invite.tokenEnc,
        session: session
          ? {
              id: session.id,
              completed: !!session.completedAt,
              progressStep: session.progressStep,
              hasSummary: session.summary !== null,
              turnCount: session._count.turns,
              lastTurnAt: session.turns[0]?.createdAt.toISOString() ?? null,
            }
          : null,
      };
    }),
  });
}

// -------------------------
// POST：建立一位受訪者的專屬連結
// 之後可以用 GET /api/admin/invites/[inviteId] 再取得同一條連結
// -------------------------
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const label = body.label?.trim().slice(0, 100);
  if (!label) {
    return NextResponse.json({ error: "Label required" }, { status: 400 });
  }

  const session = await auth();
  const { token, tokenHash, tokenEnc } = newInviteToken();

  const invite = await prisma.invite.create({
    data: {
      tokenHash,
      tokenEnc,
      label,
      createdByEmail: session?.user?.email || null,
      user: { create: {} },
    },
  });

  await logAdmin("invite.create", label);

  return NextResponse.json({ id: invite.id, label: invite.label, token });
}
