// app/api/session/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guards";

// -------------------------
// POST /api/session  → 建立 Session（綁定登入者）
// -------------------------
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const title = body?.title || null;

    const newSession = await prisma.session.create({
      data: {
        title,
        userId: guard.userId,
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
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  try {
    const sessions = await prisma.session.findMany({
      where: { userId: guard.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { turns: true } },
      },
    });

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        created_at: s.createdAt.toISOString(),
        message_count: s._count.turns,
      })),
    });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
