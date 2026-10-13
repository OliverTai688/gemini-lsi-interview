// app/api/session/[id]/complete/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedSession } from "@/lib/guards";

// -------------------------
// POST：受訪者結束訪談（{ completed: false } → 回頭繼續補充）
// -------------------------
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { completed?: boolean };
  const completed = body.completed !== false;

  await prisma.session.update({
    where: { id: sessionId },
    data: { completedAt: completed ? new Date() : null },
  });

  return NextResponse.json({ ok: true, completed });
}
