// app/api/invite/[token]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findActiveInvite } from "@/lib/invites";

export const runtime = "nodejs";

// -------------------------
// GET：邀請連結的歡迎頁用（不需登入；連結本身就是憑證）
// -------------------------
export async function GET(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  const invite = await findActiveInvite(token);
  if (!invite) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  const session = await prisma.session.findFirst({
    where: { userId: invite.userId },
    orderBy: { createdAt: "desc" },
    select: { completedAt: true, _count: { select: { turns: true } } },
  });

  return NextResponse.json({
    valid: true,
    name: invite.user.name,
    consented: !!invite.user.recordingConsentAt,
    started: (session?._count.turns ?? 0) > 0,
    completed: !!session?.completedAt,
  });
}
