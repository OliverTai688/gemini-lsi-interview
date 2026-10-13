import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // NextAuth server-side session

export async function GET() {
  const session = await auth();

  if (!session?.user?.id)
    return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  return NextResponse.json({ user });
}
