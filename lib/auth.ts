//lib/auth.ts
export const runtime = "nodejs";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: { strategy: "jwt" },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    /** ────────────────────────────────
     * JWT：把 DB user 資料塞進 token
     ─────────────────────────────────**/
    async jwt({ token }) {
  // 若 token 無 email → 直接回傳
  if (!token.email) return token;

  // 查詢最新 DB 資料
  const dbUser = await prisma.user.findUnique({
    where: { email: token.email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      onboardingCompleted: true,
    },
  });

  if (!dbUser) return token;

  token.id = dbUser.id;
  token.email = dbUser.email;
  token.name = dbUser.name;
  token.image = dbUser.image;
  token.onboardingCompleted = dbUser.onboardingCompleted;

  return token;
},

    /** ────────────────────────────────
     * session：把 token 帶到前端
     ─────────────────────────────────**/
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.image as string | null;
        session.user.onboardingCompleted =
          token.onboardingCompleted as boolean;
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
