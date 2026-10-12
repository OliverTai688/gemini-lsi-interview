// 受訪者專屬連結（只在 server 端使用）
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { prisma } from "@/lib/prisma";

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// 加密金鑰由 AUTH_SECRET 衍生：單有資料庫還原不出連結
function linkKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing env AUTH_SECRET");
  return createHash("sha256").update(`invite-link:${secret}`).digest();
}

function encryptInviteToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", linkKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** 還原出連結裡的 token；AUTH_SECRET 換過、或資料損毀時回傳 null */
export function decryptInviteToken(tokenEnc: string) {
  try {
    const raw = Buffer.from(tokenEnc, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", linkKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * 產生新的連結 token。
 * tokenHash：登入時比對用；tokenEnc：讓後台之後還能再複製同一條連結
 */
export function newInviteToken() {
  const token = randomBytes(24).toString("base64url");
  return {
    token,
    tokenHash: hashInviteToken(token),
    tokenEnc: encryptInviteToken(token),
  };
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
