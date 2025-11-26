// app/auth/error/ErrorDisplay.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ERROR_MESSAGES = {
  Configuration: '伺服器配置錯誤，請聯絡管理員',
  AccessDenied: '您沒有權限存取此資源',
  Verification: '驗證連結已過期或無效',
  OAuthSignin: 'OAuth 登入過程發生錯誤',
  OAuthCallback: 'OAuth 回調處理失敗',
  OAuthCreateAccount: '無法建立帳號，請稍後再試',
  EmailCreateAccount: 'Email 帳號建立失敗',
  Callback: '登入回調處理錯誤',
  OAuthAccountNotLinked: '此 Email 已被其他登入方式使用',
  EmailSignin: 'Email 登入失敗',
  CredentialsSignin: '帳號或密碼錯誤',
  SessionRequired: '需要登入才能存取',
  Default: '發生未知錯誤，請稍後再試',
};

export default function ErrorDisplay() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);

  const errorType = searchParams.get('error') || 'Default';
  const customMessage = searchParams.get('message');
  
  const errorMessage = customMessage || ERROR_MESSAGES[errorType as keyof typeof ERROR_MESSAGES] || ERROR_MESSAGES.Default;
  const isCriticalError = ['Configuration', 'OAuthCreateAccount'].includes(errorType);

  // 自動倒數返回（可選功能）
  useEffect(() => {
    if (!isCriticalError) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            router.push('/auth/login');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isCriticalError, router]);

  const handleRetry = () => {
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Card className="border border-gray-200 bg-white shadow-sm">
          <div className="p-8">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                ${isCriticalError ? 'bg-red-100' : 'bg-orange-100'}
              `}>
                {isCriticalError ? (
                  <XCircle className="w-8 h-8 text-red-500" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-orange-500" />
                )}
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-light text-black mb-2">
                登入發生錯誤
              </h2>
              <p className="text-sm text-gray-500">
                請查看以下錯誤資訊
              </p>
            </div>

            {/* Error Message */}
            <div className="mb-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 text-center leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>

            {/* Error Code */}
            {errorType !== 'Default' && !customMessage && (
              <div className="mb-6">
                <p className="text-xs text-gray-400 text-center">
                  錯誤代碼: {errorType}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                onClick={handleRetry}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white h-11"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入頁
              </Button>

              {!isCriticalError && (
                <p className="text-xs text-gray-500 text-center">
                  {countdown > 0 ? `${countdown} 秒後自動返回...` : '正在返回...'}
                </p>
              )}

              {isCriticalError && (
                <Button 
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="w-full border-gray-300 text-gray-700 hover:border-gray-400"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  重新整理頁面
                </Button>
              )}
            </div>

            {isCriticalError && (
              <p className="text-xs text-gray-500 text-center mt-4">
                如果問題持續發生，請聯絡技術支援
              </p>
            )}
          </div>
        </Card>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            需要協助？請聯絡{' '}
            <a 
              href="mailto:support@example.com" 
              className="text-orange-500 hover:text-orange-600 underline"
            >
              support@example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}