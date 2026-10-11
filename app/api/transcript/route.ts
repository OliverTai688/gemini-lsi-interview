//app/api/transcript/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireOwnedSession } from "@/lib/guards";

export async function POST(req: Request) {
  const { sessionId, speaker, text } = await req.json();

  if (!sessionId || !speaker || !text) {
    return NextResponse.json(
      { error: "Missing fields" },
      { status: 400 }
    );
  }

  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  const turn = await prisma.turn.create({
    data: {
      sessionId,
      speaker,
      text,
    },
  });

  return NextResponse.json(turn);
}
