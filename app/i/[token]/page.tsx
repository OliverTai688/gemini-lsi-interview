// app/i/[token]/page.tsx
// 受訪者專屬連結的歡迎頁：說明 → 稱呼 → 同意 → 開始訪談（免登入）
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle, Check, Loader2, Mic, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

type InviteInfo = {
  valid: boolean;
  name?: string | null;
  consented?: boolean;
  started?: boolean;
  completed?: boolean;
};

type MicState = "idle" | "testing" | "ok" | "silent" | "denied";

// LINE / Facebook / Instagram 等 App 的內建瀏覽器常常拿不到麥克風
const IN_APP_BROWSER = /Line\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger/i;

const MIC_TEST_MS = 4000;

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const text = t.invitePage;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  // 第一次畫面是載入中，不會用到這個值，所以不會有 hydration 不一致
  const [inApp] = useState(
    () => typeof navigator !== "undefined" && IN_APP_BROWSER.test(navigator.userAgent)
  );
  const [micState, setMicState] = useState<MicState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const stopMicTestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data: InviteInfo) => {
        setInfo(data);
        if (data.name) setName(data.name);
      })
      .catch(() => setInfo({ valid: false }));

    return () => stopMicTestRef.current?.();
  }, [token]);

  // -------------------------
  // 麥克風測試：收幾秒的音量，確認有聲音進來
  // -------------------------
  const testMic = async () => {
    stopMicTestRef.current?.();
    setMicState("testing");
    setMicLevel(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Mic test failed:", err);
      setMicState("denied");
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let peak = 0;
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let max = 0;
      for (const v of samples) max = Math.max(max, Math.abs(v - 128) / 128);
      peak = Math.max(peak, max);
      setMicLevel(max);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const stop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
      stopMicTestRef.current = null;
    };
    const timer = setTimeout(() => {
      stop();
      setMicLevel(0);
      setMicState(peak > 0.05 ? "ok" : "silent");
    }, MIC_TEST_MS);

    stopMicTestRef.current = stop;
  };

  // -------------------------
  // 開始 / 繼續訪談
  // -------------------------
  const start = async () => {
    const returning = !!info?.name && !!info?.consented;

    if (!returning && name.trim().length < 1) {
      setError(text.nameError);
      return;
    }

    setStarting(true);
    setError("");
    stopMicTestRef.current?.();

    try {
      const result = await signIn("invite", { token, redirect: false });
      if (result?.error) throw new Error(result.error);

      const res = await fetch("/api/participant/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), consent: returning || agreed }),
      });
      if (!res.ok) throw new Error(`Start failed: ${res.status}`);

      const data = (await res.json()) as { sessionId: string; completed: boolean };

      // 整頁重新載入，讓登入狀態確實生效
      window.location.assign(
        data.completed
          ? `/session/${data.sessionId}/done`
          : `/session/${data.sessionId}`
      );
    } catch (err) {
      console.error("Failed to start interview:", err);
      setError(text.startFailed);
      setStarting(false);
    }
  };

  // -------------------------
  // 畫面
  // -------------------------
  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-light">{text.brand}</span>
          </div>
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  );

  if (!info) {
    return shell(
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!info.valid) {
    return shell(
      <Card className="border-gray-200 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h1 className="mb-2 text-xl font-light">{text.invalidTitle}</h1>
        <p className="text-sm text-gray-600">{text.invalidBody}</p>
      </Card>
    );
  }

  const returning = !!info.name && !!info.consented;
  const canStart = returning || (name.trim().length >= 1 && agreed);

  return shell(
    <div className="space-y-5">
      {inApp && (
        <Card className="gap-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {text.inAppTitle}
          </div>
          <p className="text-sm text-amber-800">{text.inAppBody}</p>
        </Card>
      )}

      <div>
        <h1 className="mb-3 text-2xl font-light">
          {returning
            ? text.welcomeBack.replace("{name}", info.name ?? "")
            : text.welcome}
        </h1>

        {returning ? (
          <p className="text-base text-gray-700">
            {info.completed
              ? text.completedNote
              : info.started
                ? text.startedNote
                : text.intro}
          </p>
        ) : (
          <>
            <p className="mb-4 text-base text-gray-700">{text.intro}</p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
              {text.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!returning && (
        <>
          <Card className="gap-3 border-gray-200 p-5">
            <Label htmlFor="name" className="text-sm text-gray-800">
              {text.nameLabel}
            </Label>
            <Input
              id="name"
              value={name}
              maxLength={100}
              placeholder={text.namePlaceholder}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className="h-11 text-base"
            />
          </Card>

          <Card className="gap-3 border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-800">{text.consentTitle}</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
              {t.consent.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-lg bg-gray-50 p-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-orange-500"
              />
              <span className="text-sm text-gray-900">{text.consentCheckbox}</span>
            </label>
          </Card>
        </>
      )}

      {/* 麥克風測試（選用） */}
      {!info.completed && (
        <Card className="gap-3 border-gray-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={testMic}
              disabled={micState === "testing" || starting}
            >
              <Mic className="mr-2 h-4 w-4" />
              {text.micTest}
            </Button>

            <span
              className={`text-sm ${
                micState === "ok"
                  ? "text-green-600"
                  : micState === "denied" || micState === "silent"
                    ? "text-red-500"
                    : "text-gray-500"
              }`}
            >
              {micState === "testing" && text.micTesting}
              {micState === "ok" && (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  {text.micOk}
                </span>
              )}
              {micState === "silent" && text.micSilent}
              {micState === "denied" && text.micDenied}
            </span>
          </div>

          {micState === "testing" && (
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-orange-500 transition-[width] duration-75"
                style={{ width: `${Math.min(100, micLevel * 300)}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        onClick={start}
        disabled={!canStart || starting}
        className="h-12 w-full bg-orange-500 text-base text-white hover:bg-orange-600"
      >
        {starting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {text.starting}
          </>
        ) : info.completed ? (
          text.viewCompleted
        ) : returning && info.started ? (
          text.resume
        ) : (
          text.start
        )}
      </Button>
    </div>
  );
}
