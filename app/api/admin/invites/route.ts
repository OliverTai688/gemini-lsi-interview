// app/api/admin/invites/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
        session: session
          ? {
              id: session.id,
              completed: !!session.completedAt,
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
// token 只在這次回應出現一次，之後無法再取得（只能重新產生）
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
  const { token, tokenHash } = newInviteToken();

  const invite = await prisma.invite.create({
    data: {
      tokenHash,
      label,
      createdByEmail: session?.user?.email || null,
      user: { create: {} },
    },
  });

  return NextResponse.json({ id: invite.id, label: invite.label, token });
}
