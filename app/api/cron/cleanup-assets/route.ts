// app/api/cron/cleanup-assets/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObjects } from "@/lib/r2";

export const runtime = "nodejs";

// 上傳到一半就中斷的素材：超過這個時間還是 PENDING 就清掉
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

// -------------------------
// GET：給排程器呼叫（Vercel Cron、GitHub Actions、cron-job.org…）
// 需要 Authorization: Bearer <CRON_SECRET>
// -------------------------
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stale = await prisma.asset.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) },
      },
      select: { id: true, objectKey: true },
      take: BATCH,
    });

    if (stale.length > 0) {
      // 檔案可能已經傳上去、只是沒確認 → R2 那邊也要刪（不存在的 key 不會報錯）
      await deleteObjects(stale.map((a) => a.objectKey));
      await prisma.asset.deleteMany({
        where: { id: { in: stale.map((a) => a.id) }, status: "PENDING" },
      });
    }

    return NextResponse.json({ ok: true, removed: stale.length });
  } catch (err) {
    console.error("GET /api/cron/cleanup-assets error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
