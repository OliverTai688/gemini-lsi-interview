import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guards";

export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { name } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: guard.userId },
      data: {
        name: name.trim(),
        onboardingCompleted: true,    // ⭐ 加上這個！
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: "Profile update failed", detail: String(err) },
      { status: 500 }
    );
  }
}
