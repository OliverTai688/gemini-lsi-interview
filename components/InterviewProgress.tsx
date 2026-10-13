// components/InterviewProgress.tsx
// 訪談進度：三個部分 + 目前談到哪一題
"use client";

import React from "react";

import { useLanguage } from "@/context/LanguageContext";
import {
  INTERVIEW_PARTS,
  INTERVIEW_STEPS,
  stepIndex,
} from "@/lib/interview-script";

export default function InterviewProgress({ step }: { step: string | null }) {
  const { t, lang } = useLanguage();
  const name = (item: { zh: string; en: string }) =>
    lang === "zh-TW" ? item.zh : item.en;

  const index = stepIndex(step);
  const current = index >= 0 ? INTERVIEW_STEPS[index] : null;
  const percent = current ? ((index + 1) / INTERVIEW_STEPS.length) * 100 : 0;

  return (
    <div
      className="border-b border-gray-200 bg-gray-50"
      role="progressbar"
      aria-label={t.sessionPage.progress}
      aria-valuemin={0}
      aria-valuemax={INTERVIEW_STEPS.length}
      aria-valuenow={index + 1}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {INTERVIEW_PARTS.map((part) => {
              const active = current?.id.startsWith(part.id);
              return (
                <span
                  key={part.id}
                  className={`truncate ${
                    active ? "font-medium text-orange-600" : "text-gray-500"
                  }`}
                >
                  {name(part)}
                </span>
              );
            })}
          </div>

          <span className="shrink-0 text-gray-600">
            {current
              ? `${name(current)} · ${index + 1}/${INTERVIEW_STEPS.length}`
              : t.sessionPage.progressNotStarted}
          </span>
        </div>

        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
