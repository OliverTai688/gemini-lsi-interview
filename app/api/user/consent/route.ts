import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";

// POST：記錄使用者同意訪談錄音 / 錄影的時間（已同意過就維持原本的時間）
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  await prisma.user.updateMany({
    where: { id: guard.userId, recordingConsentAt: null },
    data: { recordingConsentAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
