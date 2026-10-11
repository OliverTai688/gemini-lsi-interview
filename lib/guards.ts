import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Denied = { ok: false; response: NextResponse };

function deny(error: string, status: number): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** 必須登入 */
export async function requireUser(): Promise<
  { ok: true; userId: string } | Denied
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return deny("Unauthorized", 401);
  return { ok: true, userId };
}

/**
 * 必須登入，而且這個訪談 Session 屬於登入者。
 * 不是自己的一律回 404（不洩漏該 id 是否存在）。
 */
export async function requireOwnedSession(sessionId: string): Promise<
  | { ok: true; userId: string; session: { id: string; title: string | null } }
  | Denied
> {
  const user = await requireUser();
  if (!user.ok) return user;

  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId: user.userId },
    select: { id: true, title: true },
  });
  if (!session) return deny("Not found", 404);

  return { ok: true, userId: user.userId, session };
}

/** 必須登入，而且這個素材所屬的 Session 屬於登入者 */
export async function requireOwnedAsset(assetId: string) {
  const user = await requireUser();
  if (!user.ok) return user;

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, session: { userId: user.userId } },
  });
  if (!asset) return deny("Not found", 404);

  return { ok: true as const, userId: user.userId, asset };
}
