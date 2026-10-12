// app/api/admin/export/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";
import { logAdmin } from "@/lib/admin-log";

export const runtime = "nodejs";

// -------------------------
// GET：匯出所有受訪者的文字資料（逐字稿、總結、素材清單）成一個 JSON 檔
// 錄音 / 影片 / 圖片檔本身不在裡面，只列出素材 id 與種類
// -------------------------
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          name: true,
          recordingConsentAt: true,
          sessions: {
            orderBy: { createdAt: "asc" },
            include: {
              turns: { orderBy: { createdAt: "asc" } },
              assets: {
                where: { status: "READY" },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const data = {
    exportedAt: new Date().toISOString(),
    participants: invites.map((invite) => ({
      label: invite.label,
      participantName: invite.user.name,
      createdAt: invite.createdAt,
      firstOpenedAt: invite.firstOpenedAt,
      recordingConsentAt: invite.user.recordingConsentAt,
      revoked: !!invite.revokedAt,
      sessions: invite.user.sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        progressStep: session.progressStep,
        summary: session.summary,
        turns: session.turns.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text,
          createdAt: turn.createdAt,
          startedAt: turn.startedAt,
          endedAt: turn.endedAt,
        })),
        assets: session.assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
          durationMs: asset.durationMs,
          startedAt: asset.startedAt,
          title: asset.title,
        })),
      })),
    })),
  };

  await logAdmin("export.all", `${invites.length} participants`);

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="life-story-export-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
