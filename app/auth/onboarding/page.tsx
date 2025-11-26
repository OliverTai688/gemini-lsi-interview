//app/auth/onboarding/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, User, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from "next-auth/react";


const OnboardingPage = () => {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session?.user?.onboardingCompleted) {
      router.replace("/home");  // 用 replace() 不留下歷史紀錄
    }
  }, [session]);

  /** -------------------------
   * 狀態 1：還在讀取 session
   ------------------------- */
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  /** -------------------------
   * 狀態 2：使用者未登入 → middleware 會擋，但前端還是加一層保護
   ------------------------- */
  if (!session?.user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }




  /** -------------------------
   * 提交表單
   ------------------------- */
  const validateForm = () => {
    if (!name.trim()) {
      setError('請輸入您的姓名');
      return false;
    }
    if (name.trim().length < 2) {
      setError('姓名至少需要 2 個字元');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), onboardingCompleted: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '更新失敗，請重試');
      }

      // ⭐⭐⭐ 最重要：更新 JWT session，middleware 才會放你進首頁
      await update();

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || '發生錯誤，請稍後再試');
      setIsLoading(false);
    }
  };

  


  /** -------------------------
   * UI（修復 session）
   ------------------------- */
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500 mb-4">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-light text-black">Interview AI</h1>
        </div>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-light text-black mb-2">歡迎加入</h2>
              <p className="text-sm text-gray-500">請完成基本資料以開始使用</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">
                  <User className="w-3.5 h-3.5 inline mr-1" />
                  姓名 <span className="text-orange-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="請輸入您的姓名"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  disabled={isLoading}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="w-3.5 h-3.5 inline mr-1" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={session?.user?.email || ''}
                  disabled
                  className="bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !name.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    處理中...
                  </>
                ) : (
                  '開始使用'
                )}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingPage;
