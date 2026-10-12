// app/api/session/[id]/progress/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedSession } from "@/lib/guards";

// GET：目前談到訪談腳本的哪一題（每回合結束後由 lib/progress.ts 更新）
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId, { allowAdmin: true });
  if (!guard.ok) return guard.response;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { progressStep: true },
  });

  return NextResponse.json({ progressStep: session?.progressStep ?? null });
}
