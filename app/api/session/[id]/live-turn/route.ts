// app/api/session/[id]/live-turn/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type LiveTurnBody = {
  userText: string;
  aiText: string;
  audioBase64?: string | null;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;

  try {
    const body = (await req.json()) as LiveTurnBody;
    const userText = body.userText?.trim();
    const aiText = body.aiText?.trim();

    if (!userText && !aiText) {
      return NextResponse.json(
        { error: "userText or aiText required" },
        { status: 400 }
      );
    }

    // --- user turn ---
    let userTurnId: string | null = null;
    if (userText) {
      const userTurn = await prisma.turn.create({
        data: {
          sessionId,
          speaker: "user",
          text: userText,
          replied: true,
        },
      });
      userTurnId = userTurn.id;
    }

    // --- assistant turn ---
    let aiTurnId: string | null = null;
    if (aiText) {
      const aiTurn = await prisma.turn.create({
        data: {
          sessionId,
          speaker: "assistant",
          text: aiText,
          audioBase64: body.audioBase64 ?? null,
          replied: true,
        },
      });
      aiTurnId = aiTurn.id;
    }

    return NextResponse.json({
      ok: true,
      userTurnId,
      aiTurnId,
    });
  } catch (err) {
    console.error("POST /live-turn error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
