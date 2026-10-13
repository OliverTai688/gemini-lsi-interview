import NextAuth from "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    onboardingCompleted?: boolean;
    /** 受訪者登入時所用連結的雜湊 */
    inviteHash?: string;
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      onboardingCompleted?: boolean;
      /** 用邀請連結進來的受訪者 */
      isGuest?: boolean;
      /** email 列在 ADMIN_EMAILS 裡 */
      isAdmin?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    onboardingCompleted?: boolean;
    isGuest?: boolean;
    isAdmin?: boolean;
    inviteHash?: string;
  }
}
