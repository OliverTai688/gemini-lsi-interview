//context/LanguageContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("lang") as Language | null;
    if (saved) setLangState(saved);
  }, []);

  const setLang = (lang: Language) => {
    localStorage.setItem("lang", lang);
    setLangState(lang);
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
