// app/api/session/[id]/live-turn/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type LiveTurnBody = {
  userText: string;
  aiText: string;
  audioBase64?: string | null; // AI 語音（可選）
};

export async function POST(req: Request, context: any) {
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

    // 建立 user turn
    let userTurnId: string | null = null;
    if (userText) {
      const userTurn = await prisma.turn.create({
        data: {
          sessionId,
          speaker: "user",
          text: userText,
          replied: true, // live 模式就直接視為已處理
        },
      });
      userTurnId = userTurn.id;
    }

    // 建立 AI turn（包含 audioBase64）
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
