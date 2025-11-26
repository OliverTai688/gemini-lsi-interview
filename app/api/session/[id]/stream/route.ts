import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const genai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function GET(req: Request, context: any) {
  const { id: sessionId } = await context.params;

  // 找最新未處理的 user turn
  const lastUserTurn = await prisma.turn.findFirst({
    where: { sessionId, speaker: "user", replied: false },
    orderBy: { createdAt: "desc" },
  });

  if (!lastUserTurn) {
    const idle = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ type: "idle" })}\n\n`);
        controller.close();
      },
    });
    return new NextResponse(idle, { headers: sseHeaders });
  }

  // 🚀 立即鎖住避免重複處理
  await prisma.turn.update({
    where: { id: lastUserTurn.id },
    data: { replied: true },
  });

  // === SSE Stream 開始 ===
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(`data: ${JSON.stringify({ type: "thinking" })}\n\n`);

      const responseStream = await genai.models.generateContentStream({
        model: "gemini-2.5-flash-tts",
        contents: [{ role: "user", parts: [{ text: lastUserTurn.text }] }],
      });

      let aiText = "";

      for await (const chunk of responseStream) {
        if (!chunk.text) continue;
        aiText += chunk.text;

        controller.enqueue(
          `data: ${JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: aiText,
              timestamp: new Date().toISOString(),
            },
          })}\n\n`
        );
      }

      // 儲存 AI 回覆
      await prisma.turn.create({
        data: {
          sessionId,
          speaker: "assistant",
          text: aiText,
        },
      });

      controller.enqueue(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
      controller.close();
    },
  });

  return new NextResponse(stream, { headers: sseHeaders });
}
