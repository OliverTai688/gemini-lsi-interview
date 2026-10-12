//context/LanguageContext.tsx
"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import en from "@/messages/en";
import zh from "@/messages/zh-TW";

export type Language = "en" | "zh-TW";

const messages = {
  en,
  "zh-TW": zh,
};

type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof en; // 根據你的 messages 結構
};

const LanguageContext = createContext<LanguageContextType | null>(null);

// 語言存在 localStorage；沒選過的人依瀏覽器語言決定（中文 → 繁體中文）
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Language {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh-TW") return saved;
  } catch {
    // 無痕模式等情況下 localStorage 可能不能用
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

const getServerSnapshot = (): Language => "en";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLang = (lang: Language) => {
    try {
      localStorage.setItem("lang", lang);
    } catch {
      // 存不了就算了，這次選擇不會被記住
    }
    listeners.forEach((callback) => callback());
  };

  const t = messages[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider />");
  return ctx;
}
