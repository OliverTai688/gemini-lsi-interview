// 後台操作紀錄（只在 server 端使用）
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 記一筆管理者操作；寫入失敗不影響原本的操作 */
export async function logAdmin(action: string, target?: string | null) {
  try {
    const session = await auth();
    await prisma.adminLog.create({
      data: {
        adminEmail: session?.user?.email || "unknown",
        action,
        target: target ?? null,
      },
    });
  } catch (err) {
    console.error("logAdmin failed:", err);
  }
}
