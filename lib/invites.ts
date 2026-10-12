// 受訪者專屬連結（只在 server 端使用）
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 產生新的連結 token；資料庫只存 hash，原始 token 只在建立當下回傳一次 */
export function newInviteToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

/** 用連結裡的 token 找出有效（未停用）的邀請 */
export async function findActiveInvite(token: string) {
  if (!token || token.length > 200) return null;

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: true },
  });
  if (!invite || invite.revokedAt) return null;

  return invite;
}
