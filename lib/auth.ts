//lib/auth.ts
export const runtime = "nodejs";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { findActiveInvite } from "@/lib/invites";

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: { strategy: "jwt" },

  providers: [
    // 研究者 / 管理者：Google 登入
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // 受訪者：用專屬連結裡的 token 登入（免帳號）
    Credentials({
      id: "invite",
      name: "Invite link",
      credentials: { token: {} },
      async authorize(credentials) {
        const invite = await findActiveInvite(String(credentials?.token ?? ""));
        if (!invite) return null;

        const now = new Date();
        await prisma.invite.update({
          where: { id: invite.id },
          data: {
            firstOpenedAt: invite.firstOpenedAt ?? now,
            lastOpenedAt: now,
          },
        });

        return {
          id: invite.user.id,
          name: invite.user.name,
          email: null,
          // 記下是用哪一條連結登入的：連結被重新產生後，舊的登入狀態要失效
          inviteHash: invite.tokenHash,
        };
      },
    }),
  ],

  callbacks: {
    /** ────────────────────────────────
     * JWT：把 DB user 資料塞進 token
     ─────────────────────────────────**/
    async jwt({ token, user }) {
      // 剛登入時 user 才有值；之後一律用 token.sub（= DB user id）
      if (user?.id) token.sub = user.id;
      if (user?.inviteHash) token.inviteHash = user.inviteHash;
      if (!token.sub) return token;

      // 查詢最新 DB 資料
      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          onboardingCompleted: true,
          invite: { select: { revokedAt: true, tokenHash: true } },
        },
      });

      // 帳號已被刪除、邀請連結已停用、或連結已被重新產生（登入時用的是舊連結）→ 登出
      if (!dbUser || dbUser.invite?.revokedAt) return null;
      if (dbUser.invite && token.inviteHash !== dbUser.invite.tokenHash) return null;

      token.id = dbUser.id;
      token.email = dbUser.email;
      token.name = dbUser.name;
      token.image = dbUser.image;
      token.onboardingCompleted = dbUser.onboardingCompleted;
      token.isGuest = !!dbUser.invite;
      token.isAdmin = isAdminEmail(dbUser.email);

      return token;
    },

    /** ────────────────────────────────
     * session：把 token 帶到前端
     ─────────────────────────────────**/
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = (token.email ?? "") as string;
        session.user.name = token.name as string | null;
        session.user.image = token.image as string | null;
        session.user.onboardingCompleted =
          token.onboardingCompleted as boolean;
        session.user.isGuest = !!token.isGuest;
        session.user.isAdmin = !!token.isAdmin;
      }
      return session;
    },

    /** ────────────────────────────────
     * signIn：允許登入
     ─────────────────────────────────**/
    async signIn() {
      return true;
    },

    /** ────────────────────────────────
     * redirect：決定 OAuth 完成後導向哪裡
     ─────────────────────────────────**/
    async redirect({ url, baseUrl }) {
      const onboardingUrl = `${baseUrl}/auth/onboarding`;

      // Google callback 會先 redirect 回 /
      if (url === baseUrl || url === `${baseUrl}/`) {
        // 交由 middleware 做判斷
        return onboardingUrl;
      }

      // Allows relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      // Fallback
      return baseUrl;
    },
  },
});
