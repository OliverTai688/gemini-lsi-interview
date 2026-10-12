import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";

// GET：最近的後台操作紀錄
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const logs = await prisma.adminLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      adminEmail: log.adminEmail,
      action: log.action,
      target: log.target,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
