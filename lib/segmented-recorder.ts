// 瀏覽器端：把一條 MediaStream 錄成一段一段「各自可獨立播放」的檔案
// 每 segmentMs 換一個新的 MediaRecorder（新的先開、舊的才停 → 段與段之間不漏音）
// 分段的目的：訪談中途分頁當掉 / 斷網時，最多只損失最後一段

import { baseMime } from "@/lib/assets";

export type RecordedSegment = {
  blob: Blob;
  seq: number;
  startedAt: Date;
  durationMs: number;
};

type Options = {
  mimeTypes: string[];
  segmentMs?: number;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  onSegment: (segment: RecordedSegment) => void;
};

/** 回傳這個瀏覽器支援的第一個格式（Chrome/Firefox → webm，Safari → mp4） */
export function pickMimeType(candidates: string[]) {
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

// mp4 優先：有完整的時長與 seek 資訊，受訪者下載後也比較好用
export const VIDEO_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export class SegmentedRecorder {
  private mimeType: string;
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: { rec: MediaRecorder; finish: () => Promise<void> } | null =
    null;

  constructor(private stream: MediaStream, private opts: Options) {
    const mimeType = pickMimeType(opts.mimeTypes);
    if (!mimeType) throw new Error("MediaRecorder: no supported mime type");
    this.mimeType = mimeType;
  }

  start() {
    if (this.current) return;
    this.startOne();
    if (this.opts.segmentMs) {
      this.timer = setInterval(() => this.rotate(), this.opts.segmentMs);
    }
  }

  /** 停止錄製；最後一段交給 onSegment 之後才 resolve */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const cur = this.current;
    this.current = null;
    await cur?.finish();
  }

  private rotate() {
    const old = this.current;
    this.startOne();
    void old?.finish();
  }

  private startOne() {
    const rec = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: this.opts.audioBitsPerSecond,
      videoBitsPerSecond: this.opts.videoBitsPerSecond,
    });

    const chunks: Blob[] = [];
    const seq = this.seq++;
    const startedAt = new Date();
    const t0 = performance.now();
    let endedAt: number | null = null;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: baseMime(this.mimeType) });
        if (blob.size > 0) {
          this.opts.onSegment({
            blob,
            seq,
            startedAt,
            durationMs: Math.round((endedAt ?? performance.now()) - t0),
          });
        }
        resolve();
      };
    });

    rec.start();

    this.current = {
      rec,
      finish: () => {
        endedAt ??= performance.now();
        // 音軌被關掉時 recorder 會自己停，這裡不能再 stop 一次
        if (rec.state !== "inactive") rec.stop();
        return stopped;
      },
    };
  }
}
