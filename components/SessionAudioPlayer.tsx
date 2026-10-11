// components/SessionAudioPlayer.tsx
// 把分段的訪談錄音當成一條連續的音軌來播放
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AssetDTO } from "@/lib/assets";

// 轉寫文字會比實際開口晚一點到 → 跳到某句話時往前多播一點
const SEEK_PREROLL_MS = 1500;

type Props = {
  segments: AssetDTO[];
  label: string;
  /** 要求跳到某個實際時間點（epoch ms）；nonce 變了就會再跳一次 */
  seekTo?: { at: number; nonce: number } | null;
};

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 這個實際時間點落在哪一段、該段的第幾秒 */
export function locateInSegments(segments: AssetDTO[], at: number) {
  let found: { index: number; offsetSec: number } | null = null;
  segments.forEach((seg, index) => {
    if (!seg.startedAt) return;
    const start = Date.parse(seg.startedAt);
    if (start <= at) {
      const durationSec = (seg.durationMs ?? 0) / 1000;
      found = { index, offsetSec: Math.min((at - start) / 1000, durationSec) };
    }
  });
  return found as { index: number; offsetSec: number } | null;
}

export default function SessionAudioPlayer({ segments, label, seekTo }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [index, setIndex] = useState(0);
  const [positionSec, setPositionSec] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 換段之後要套用的位置 / 是否接著播
  const pendingRef = useRef<{ offsetSec: number; play: boolean } | null>(null);

  // 每一段在整條音軌上的起點（秒）
  const { offsets, totalSec } = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const seg of segments) {
      offsets.push(acc);
      acc += (seg.durationMs ?? 0) / 1000;
    }
    return { offsets, totalSec: acc };
  }, [segments]);

  const jump = (nextIndex: number, offsetSec: number, play: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (nextIndex === index) {
      audio.currentTime = offsetSec;
      setPositionSec(offsetSec);
      if (play) void audio.play();
      return;
    }
    pendingRef.current = { offsetSec, play };
    setPositionSec(offsetSec);
    setIndex(nextIndex);
  };

  const handleLoaded = () => {
    const audio = audioRef.current;
    const pending = pendingRef.current;
    if (!audio || !pending) return;
    pendingRef.current = null;
    audio.currentTime = pending.offsetSec;
    if (pending.play) void audio.play();
  };

  const handleEnded = () => {
    if (index < segments.length - 1) jump(index + 1, 0, true);
    else setPlaying(false);
  };

  const seekGlobal = (globalSec: number) => {
    let target = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= globalSec) target = i;
    }
    jump(target, globalSec - offsets[target], playing);
  };

  useEffect(() => {
    if (!seekTo) return;
    const located = locateInSegments(segments, seekTo.at - SEEK_PREROLL_MS)
      ?? locateInSegments(segments, seekTo.at);
    if (located) jump(located.index, located.offsetSec, true);
    // 只在 nonce 變動時觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekTo?.nonce]);

  if (segments.length === 0) return null;

  const globalSec = (offsets[index] ?? 0) + positionSec;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 px-4 py-3">
      <Button
        size="sm"
        className="rounded-full w-9 h-9 p-0 bg-orange-500 text-white hover:bg-orange-600"
        aria-label={label}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>

      <div className="flex-1">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <input
          type="range"
          min={0}
          max={Math.max(totalSec, 0.1)}
          step={0.1}
          value={Math.min(globalSec, totalSec)}
          onChange={(e) => seekGlobal(Number(e.target.value))}
          className="w-full accent-orange-500"
        />
      </div>

      <span className="text-xs tabular-nums text-gray-500">
        {formatClock(globalSec)} / {formatClock(totalSec)}
      </span>

      <audio
        ref={audioRef}
        src={segments[index]?.url}
        preload="metadata"
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={(e) => setPositionSec(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
      />
    </div>
  );
}
