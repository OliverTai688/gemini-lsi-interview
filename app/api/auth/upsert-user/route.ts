import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();

  const {
    provider,
    providerAccountId,
    email,
    name,
    image,
    access_token,
    refresh_token,
    id_token,
  } = body;

  try {
    // 是否已有帳號（同 provider, providerAccountId）
    const existingAccount = await prisma.account.findFirst({
      where: { provider, providerAccountId },
      include: { user: true },
    });

    if (existingAccount) {
      return NextResponse.json({ user: existingAccount.user, isNew: false });
    }

    // 是否存在 user email
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // 建立新 User（第一次登入）
      user = await prisma.user.create({
        data: {
          email,
          name,
          image,
        },
      });
    }

    // 建立 Account（Google）
    await prisma.account.create({
      data: {
        userId: user.id,
        provider,
        providerAccountId,
        access_token,
        refresh_token,
        id_token,
      },
    });

    return NextResponse.json({ user, isNew: true });
  } catch (err: any) {
    console.error("UPSELL USER ERROR:", err);
    return NextResponse.json(
      { error: "Failed to upsert user", detail: err.message },
      { status: 500 }
    );
  }
}
