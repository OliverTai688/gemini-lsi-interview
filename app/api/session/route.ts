//app/api/session/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// -------------------------
// POST /api/session
// -------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = body?.title || null;

    const session = await prisma.session.create({
      data: {
        title,
      },
    });

    return NextResponse.json({
      id: session.id,
      title: session.title,
      created_at: session.createdAt.toISOString(),
      message_count: 0,
    });
  } catch (err) {
    console.error("POST /api/session error:", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

// -------------------------
// GET /api/session
// -------------------------
export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Manually compute message_count via turns relation
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session) => {
        const count = await prisma.turn.count({
          where: { sessionId: session.id },
        });

        return {
          id: session.id,
          title: session.title,
          created_at: session.createdAt.toISOString(),
          message_count: count,
        };
      })
    );

    return NextResponse.json({ sessions: sessionsWithCounts });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
