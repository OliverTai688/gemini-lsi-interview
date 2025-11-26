'use client';

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 等待 session 讀取中
    if (status === "loading") return;

    // 未登入 → 去 login
    if (!session?.user) {
      router.replace("/auth/login");
      return;
    }

    // 已登入但未 onboarding → 只能去 onboarding
    if (!session.user.onboardingCompleted) {
      if (!pathname.startsWith("/auth/onboarding")) {
        router.replace("/auth/onboarding");
      }
      return;
    }

    // 已完成 onboarding → 禁止再去 onboarding
    if (session.user.onboardingCompleted && pathname.startsWith("/auth/onboarding")) {
      router.replace("/");
      return;
    }
  }, [session, status, pathname, router]);

  // Loading 狀態（避免閃爍）
  if (status === "loading" || !session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return <>{children}</>;
}
