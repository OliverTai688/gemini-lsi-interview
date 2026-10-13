// app/api/session/[id]/live-turn/route.ts
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedSession } from "@/lib/guards";
import { updateProgress } from "@/lib/progress";

export const runtime = "nodejs";

type LiveTurnBody = {
  userText: string;
  aiText: string;
  // 這一回合各自開始說話、以及回合結束的時間（ISO）→ 對回錄音位置
  userStartedAt?: string | null;
  aiStartedAt?: string | null;
  endedAt?: string | null;
  // 這個瀏覽器分頁的識別碼（見 live-token）
  clientId?: string;
};

function toDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

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

    const userStartedAt = toDate(body.userStartedAt);
    const aiStartedAt = toDate(body.aiStartedAt);
    const endedAt = toDate(body.endedAt);
    // 兩筆的 createdAt 錯開 1ms，確保逐字稿排序時 user 在前
    const now = Date.now();

    // --- user turn ---
    let userTurnId: string | null = null;
    if (userText) {
      const userTurn = await prisma.turn.create({
        data: {
          sessionId,
          speaker: "user",
          text: userText,
          replied: true,
          createdAt: new Date(now),
          startedAt: userStartedAt,
          endedAt: aiStartedAt ?? endedAt,
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
          replied: true,
          createdAt: new Date(now + 1),
          startedAt: aiStartedAt,
          endedAt,
        },
      });
      aiTurnId = aiTurn.id;
    }

    // 同一場訪談在另一個裝置開始了 → 這一回合照樣存，但請這邊停下來
    const current = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { activeClientId: true },
    });
    const superseded =
      !!body.clientId &&
      !!current?.activeClientId &&
      current.activeClientId !== body.clientId;

    // 回應送出後再判斷訪談進度，不拖慢存檔
    after(() => updateProgress(sessionId));

    return NextResponse.json({
      ok: true,
      userTurnId,
      aiTurnId,
      superseded,
    });
  } catch (err) {
    console.error("POST /live-turn error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
