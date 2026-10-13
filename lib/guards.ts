import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Denied = { ok: false; response: NextResponse };

type Options = {
  /** 管理者（ADMIN_EMAILS）也可以存取別人的資料；只給「讀取 / 後台管理」類的 API 用 */
  allowAdmin?: boolean;
};

function deny(error: string, status: number): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** 必須登入 */
export async function requireUser(): Promise<
  { ok: true; userId: string; isAdmin: boolean; isGuest: boolean } | Denied
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return deny("Unauthorized", 401);
  return {
    ok: true,
    userId,
    isAdmin: !!session.user.isAdmin,
    isGuest: !!session.user.isGuest,
  };
}

/** 必須是管理者 */
export async function requireAdmin() {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!user.isAdmin) return deny("Forbidden", 403);
  return user;
}

/**
 * 必須登入，而且這個訪談 Session 屬於登入者。
 * 不是自己的一律回 404（不洩漏該 id 是否存在）。
 */
export async function requireOwnedSession(
  sessionId: string,
  options: Options = {}
): Promise<
  | {
      ok: true;
      userId: string;
      isAdmin: boolean;
      isOwner: boolean;
      session: { id: string; title: string | null; completedAt: Date | null };
    }
  | Denied
> {
  const user = await requireUser();
  if (!user.ok) return user;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, completedAt: true, userId: true },
  });

  const isOwner = session?.userId === user.userId;
  if (!session || !(isOwner || (options.allowAdmin && user.isAdmin))) {
    return deny("Not found", 404);
  }

  return {
    ok: true,
    userId: user.userId,
    isAdmin: user.isAdmin,
    isOwner,
    session: {
      id: session.id,
      title: session.title,
      completedAt: session.completedAt,
    },
  };
}

/** 必須登入，而且這個素材所屬的 Session 屬於登入者 */
export async function requireOwnedAsset(assetId: string, options: Options = {}) {
  const user = await requireUser();
  if (!user.ok) return user;

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { session: { select: { userId: true } } },
  });

  const isOwner = asset?.session.userId === user.userId;
  if (!asset || !(isOwner || (options.allowAdmin && user.isAdmin))) {
    return deny("Not found", 404);
  }

  return { ok: true as const, userId: user.userId, asset };
}
