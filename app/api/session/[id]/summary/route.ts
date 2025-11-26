import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateSummary } from "@/lib/ai"; // 你之後會實作

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await prisma.session.findUnique({
    where: { id: params.id },
    include: {
      turns: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const text = session.turns.map(t => `${t.speaker}: ${t.text}`).join("\n");

  const summary = await generateSummary(text);

  const updated = await prisma.session.update({
    where: { id: params.id },
    data: { summary },
  });

  return NextResponse.json(updated);
}
