import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "生命故事訪談 Life Story Interview",
  description: "由 AI 訪談員陪你進行的生命故事語音訪談",
  // 邀請連結與訪談內容都不該被搜尋引擎收錄
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
         <SessionProvider>
        <LanguageProvider>
          {children}
        </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
