// 訪談進度：每回合結束後，請模型判斷目前談到腳本的哪一題（只在 server 端使用）
// 失敗不影響訪談本身，進度條只是不更新
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { INTERVIEW_STEPS, stepIndex } from "@/lib/interview-script";

const RECENT_TURNS = 8;

export async function updateProgress(sessionId: string) {
  try {
    const turns = await prisma.turn.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: RECENT_TURNS,
      select: { speaker: true, text: true },
    });
    if (turns.length === 0) return;

    const dialogue = turns
      .reverse()
      .map((t) => `${t.speaker === "user" ? "受訪者" : "訪談員"}：${t.text}`)
      .join("\n");

    const prompt = `你在協助追蹤一場「生命故事訪談」目前進行到訪談腳本的哪一題。

腳本的題目依序為：
${INTERVIEW_STEPS.map((s) => `${s.id} ${s.zh}`).join("\n")}

以下是最近的對話（由舊到新）。請判斷訪談員最後正在問、或受訪者正在回答的是哪一題。
只輸出 JSON，不要有其他文字：{"step":"題號"}
如果還在開場寒暄、或無法判斷，輸出：{"step":null}

對話：
${dialogue}`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const match = (response.output_text ?? "").match(/\{[\s\S]*\}/);
    if (!match) return;

    const step = (JSON.parse(match[0]) as { step?: unknown }).step;
    if (typeof step !== "string" || stepIndex(step) < 0) return;

    await prisma.session.update({
      where: { id: sessionId },
      data: { progressStep: step },
    });
  } catch (err) {
    console.error("updateProgress failed:", err);
  }
}
