// app/api/participant/start/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";

export const runtime = "nodejs";

// -------------------------
// POST：受訪者從歡迎頁按下「開始 / 繼續訪談」
// 記下稱呼與錄音同意，並回傳這位受訪者的那一場訪談（沒有就建立）
// -------------------------
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (!guard.isGuest) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      consent?: boolean;
    };
    const name = body.name?.trim().slice(0, 100);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: guard.userId },
    });

    if (!name && !user.name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    if (!body.consent && !user.recordingConsentAt) {
      return NextResponse.json({ error: "Consent required" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || user.name,
        onboardingCompleted: true,
        recordingConsentAt: user.recordingConsentAt ?? new Date(),
      },
    });

    const session =
      (await prisma.session.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, completedAt: true },
      })) ??
      // 不設標題：研究者給的代號只在後台顯示，不給受訪者看
      (await prisma.session.create({
        data: { userId: user.id },
        select: { id: true, completedAt: true },
      }));

    return NextResponse.json({
      sessionId: session.id,
      completed: !!session.completedAt,
    });
  } catch (err) {
    console.error("POST /api/participant/start error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
