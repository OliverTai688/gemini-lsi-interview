// app/api/session/[id]/live-token/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { requireOwnedSession } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 這個 token 開出來的連線最久能用多久（超過會被 Gemini 中斷，使用者再按一次即可重連）
const SESSION_TTL_MS = 60 * 60 * 1000;
// 拿到 token 之後多久內必須連上
const CONNECT_WINDOW_MS = 60 * 1000;

// -------------------------
// POST：簽發一次性的 Gemini Live 短效 token
// 長效的 GOOGLE_API_KEY 只留在 server，瀏覽器只拿得到這個 token
// -------------------------
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const guard = await requireOwnedSession(sessionId);
  if (!guard.ok) return guard.response;

  try {
    // Ephemeral token 目前只在 v1alpha 提供
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY!,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + SESSION_TTL_MS).toISOString(),
        newSessionExpireTime: new Date(now + CONNECT_WINDOW_MS).toISOString(),
      },
    });

    if (!token.name) throw new Error("Empty token");

    // 最後開始訪談的那個分頁才是「現場」；其他裝置下次存檔時會被告知已被接手
    const body = (await req.json().catch(() => ({}))) as { clientId?: string };
    if (body.clientId) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { activeClientId: body.clientId.slice(0, 64) },
      });
    }

    return NextResponse.json({ token: token.name });
  } catch (err) {
    console.error("POST /live-token error:", err);
    return NextResponse.json(
      { error: "Failed to create live token" },
      { status: 502 }
    );
  }
}
