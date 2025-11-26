// app/api/session/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // ★ 你的 NextAuth server session

// -------------------------
// POST /api/session  → 建立 Session（需要 userId）
// -------------------------
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 取得 userId
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = body?.title || null;

    // ★ 建立 session 時綁定 userId
    const newSession = await prisma.session.create({
      data: {
        title,
        userId: user.id,
      },
    });

    return NextResponse.json({
      id: newSession.id,
      title: newSession.title,
      created_at: newSession.createdAt.toISOString(),
      message_count: 0,
    });
  } catch (err) {
    console.error("POST /api/session error:", err);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

// -------------------------
// GET /api/session  → 取得登入者的所有 sessions
// -------------------------
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 找出登入者
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { sessions: [] }
      );
    }

    // ★ 只查詢自己的 sessions
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // 計算每個 session 的 turns 數量
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (s) => {
        const count = await prisma.turn.count({
          where: { sessionId: s.id },
        });

        return {
          id: s.id,
          title: s.title,
          created_at: s.createdAt.toISOString(),
          message_count: count,
        };
      })
    );

    return NextResponse.json({ sessions: sessionsWithCounts });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
