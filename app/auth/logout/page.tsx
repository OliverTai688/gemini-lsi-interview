"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LogoutPage() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(true);
  const [counter, setCounter] = useState(2);

  useEffect(() => {
    // 1. 執行登出（不自動 redirect）
    signOut({ redirect: false }).finally(() => {
      setIsProcessing(false);
    });

    // 2. 倒數 2 秒後跳轉
    const timer = setInterval(() => {
      setCounter((c) => {
        if (c <= 1) {
          router.push("/auth/login");
          router.refresh();
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Card className="p-10 text-center border-gray-200 shadow-sm">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
              ) : (
                <LogOut className="w-7 h-7 text-gray-600" />
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-light text-black mb-2">
            已成功登出
          </h1>

          {/* Subtitle */}
          <p className="text-sm text-gray-500 mb-6">
            期待你再次使用 Interview AI
          </p>

          {/* Redirect Notice */}
          <p className="text-xs text-gray-400 mb-6">
            {isProcessing
              ? "正在處理中..."
              : `將在 ${counter} 秒後自動返回登入頁`}
          </p>

          {/* Button */}
          <Button
            onClick={() => router.push("/auth/login")}
            className="w-full bg-orange-500 text-white hover:bg-orange-600"
          >
            返回登入頁
          </Button>
        </Card>
      </div>
    </div>
  );
}
