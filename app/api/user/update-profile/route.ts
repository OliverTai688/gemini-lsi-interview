import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        name: name.trim(),
        onboardingCompleted: true,    // ⭐ 加上這個！
      },
    });

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Profile update failed", detail: err.message },
      { status: 500 }
    );
  }
}
