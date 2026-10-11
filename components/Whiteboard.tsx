// components/Whiteboard.tsx
// 白板：開啟就開始錄製（畫布畫面 + 解說音訊 → 影片），完成後連同完成圖、筆畫資料一起存到 R2
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Eraser,
  Eye,
  ImagePlus,
  Loader2,
  MicOff,
  Pencil,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import { ASSET_RULES, baseMime } from "@/lib/assets";
import { uploadAsset, type UploadMeta } from "@/lib/asset-upload";
import { toJpegBase64 } from "@/lib/image-utils";
import {
  SegmentedRecorder,
  VIDEO_MIME_TYPES,
  type RecordedSegment,
} from "@/lib/segmented-recorder";

// 畫布固定 720p → 錄出來的影片尺寸穩定
const W = 1280;
const H = 720;

const COLORS = ["#111827", "#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7"];
const WIDTHS = [3, 6, 12];

const AI_FRAME_INTERVAL_MS = 2000;
const AI_FRAME_WIDTH = 768;
const MAX_RECORDING_MS = 20 * 60 * 1000;

// -------------------------
// 型別（也是存到 R2 的筆畫 JSON 格式；t = 距離錄製開始的毫秒數）
// -------------------------
type Tool = "pen" | "eraser";
type Point = [x: number, y: number, t: number];

type StrokeOp = {
  type: "stroke";
  t: number;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
};

// index → 對應同一個 groupId、seq 相同的 IMAGE 素材
type ImageOp = {
  type: "image";
  t: number;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Op = StrokeOp | ImageOp;
type LogEvent = Op | { type: "undo"; t: number } | { type: "clear"; t: number };

type UploadTask = { blob: Blob; meta: UploadMeta; done: boolean };

type Phase = "recording" | "saving" | "error";

type Props = {
  sessionId: string;
  /** 訪談連線中的混音（麥克風 + AI 語音）；沒有的話白板自己開麥克風 */
  audioStream?: MediaStream | null;
  /** 訪談連線中時，把白板畫面送給 AI 訪談員 */
  onFrame?: (jpegBase64: string) => void;
  onClose: () => void;
  onSaved?: () => void;
};

// -------------------------
// 繪圖
// -------------------------
function applyStrokeStyle(ctx: CanvasRenderingContext2D, op: StrokeOp) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = op.width;
  ctx.strokeStyle = op.color;
  ctx.globalCompositeOperation =
    op.tool === "eraser" ? "destination-out" : "source-over";
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  op: StrokeOp,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  applyStrokeStyle(ctx, op);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  // 長度為 0 的線段不會被畫出來 → 單點也要能留下一個點
  ctx.lineTo(x0 === x1 && y0 === y1 ? x1 + 0.01 : x1, y1);
  ctx.stroke();
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// -------------------------
export default function Whiteboard({
  sessionId,
  audioStream,
  onFrame,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLanguage();

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [title, setTitle] = useState("");

  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);
  const [notice, setNotice] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const opsRef = useRef<Op[]>([]); // 目前畫面上有的東西（復原 / 清空後會變）
  const logRef = useRef<LogEvent[]>([]); // 完整事件紀錄（可重播繪製過程）
  const imagesRef = useRef<{ file: File; bitmap: ImageBitmap }[]>([]);
  const drawingRef = useRef<StrokeOp | null>(null);
  const dirtyRef = useRef(false);

  const recorderRef = useRef<SegmentedRecorder | null>(null);
  const videoRef = useRef<RecordedSegment | null>(null);
  const startedAtRef = useRef<Date>(new Date());
  const t0Ref = useRef(0);
  const groupIdRef = useRef("");
  const tasksRef = useRef<UploadTask[]>([]);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const now = () => Math.round(performance.now() - t0Ref.current);
  const inkCtx = () => inkRef.current!.getContext("2d")!;

  // -------------------------
  // 掛載：建立畫布、開始錄製
  // -------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const ink = document.createElement("canvas");
    ink.width = W;
    ink.height = H;
    inkRef.current = ink;

    groupIdRef.current = crypto.randomUUID();
    t0Ref.current = performance.now();
    startedAtRef.current = new Date();

    // 每一格都重新合成（白底 + 筆跡層）→ 畫面靜止時錄影也會持續出格
    let raf = 0;
    const paint = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(ink, 0, 0);
      raf = requestAnimationFrame(paint);
    };
    paint();

    let cancelled = false;
    let ownMic: MediaStream | null = null;
    let videoTracks: MediaStreamTrack[] = [];

    (async () => {
      let audio = audioStream ?? null;
      if (!audio) {
        try {
          ownMic = await navigator.mediaDevices.getUserMedia({ audio: true });
          audio = ownMic;
        } catch (err) {
          console.error("Whiteboard: microphone unavailable:", err);
        }
      }

      if (cancelled) {
        ownMic?.getTracks().forEach((track) => track.stop());
        return;
      }
      setHasAudio(!!audio);

      try {
        videoTracks = canvas.captureStream(30).getVideoTracks();
        const stream = new MediaStream([
          ...videoTracks,
          ...(audio?.getAudioTracks() ?? []),
        ]);

        const recorder = new SegmentedRecorder(stream, {
          mimeTypes: VIDEO_MIME_TYPES,
          videoBitsPerSecond: 1_500_000,
          audioBitsPerSecond: 64_000,
          onSegment: (segment) => {
            videoRef.current = segment;
          },
        });
        recorder.start();
        recorderRef.current = recorder;

        // 時間軸從真正開始錄的那一刻起算
        t0Ref.current = performance.now();
        startedAtRef.current = new Date();
      } catch (err) {
        console.error("Whiteboard: failed to start recording:", err);
      }
    })();

    const aiFrameTimer = setInterval(() => {
      if (!dirtyRef.current || !onFrameRef.current) return;
      dirtyRef.current = false;
      onFrameRef.current(toJpegBase64(canvas, W, H, AI_FRAME_WIDTH));
    }, AI_FRAME_INTERVAL_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(aiFrameTimer);
      void recorderRef.current?.stop();
      recorderRef.current = null;
      videoTracks.forEach((track) => track.stop());
      ownMic?.getTracks().forEach((track) => track.stop());
    };
    // 只在掛載時跑一次：audioStream 以開啟當下的為準
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------
  // 重畫（復原 / 清空之後）
  // -------------------------
  const redraw = useCallback(() => {
    const ctx = inkCtx();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);

    for (const op of opsRef.current) {
      if (op.type === "image") {
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(imagesRef.current[op.index].bitmap, op.x, op.y, op.w, op.h);
        continue;
      }
      for (let i = 0; i < op.points.length; i++) {
        const [x0, y0] = op.points[Math.max(0, i - 1)];
        const [x1, y1] = op.points[i];
        drawLine(ctx, op, x0, y0, x1, y1);
      }
    }
    dirtyRef.current = true;
  }, []);

  // -------------------------
  // 指標事件
  // -------------------------
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * W) / rect.width,
      ((e.clientY - rect.top) * H) / rect.height,
    ] as const;
  };

  const commitStroke = () => {
    const op = drawingRef.current;
    if (!op) return;
    drawingRef.current = null;
    opsRef.current.push(op);
    logRef.current.push(op);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "recording") return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const [x, y] = toCanvas(e);
    const op: StrokeOp = {
      type: "stroke",
      t: now(),
      tool,
      color,
      width: tool === "eraser" ? width * 4 : width,
      points: [[x, y, now()]],
    };
    drawingRef.current = op;
    drawLine(inkCtx(), op, x, y, x, y);
    dirtyRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const op = drawingRef.current;
    if (!op) return;

    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
      const [x, y] = toCanvas(ev);
      const [px, py] = op.points[op.points.length - 1];
      drawLine(inkCtx(), op, px, py, x, y);
      op.points.push([x, y, now()]);
    }
    dirtyRef.current = true;
  };

  // -------------------------
  // 工具列動作
  // -------------------------
  const undo = () => {
    if (opsRef.current.length === 0) return;
    opsRef.current.pop();
    logRef.current.push({ type: "undo", t: now() });
    redraw();
  };

  const clear = () => {
    if (opsRef.current.length === 0) return;
    opsRef.current = [];
    logRef.current.push({ type: "clear", t: now() });
    redraw();
  };

  const insertImage = async (file: File) => {
    const rule = ASSET_RULES.IMAGE;
    if (!rule.types[baseMime(file.type)] || file.size > rule.maxBytes) {
      setNotice(t.sessionPage.imageInvalid);
      return;
    }
    setNotice("");

    try {
      const bitmap = await createImageBitmap(file);
      // 置中、最多佔畫布 70%
      const scale = Math.min((W * 0.7) / bitmap.width, (H * 0.7) / bitmap.height, 1);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;

      const op: ImageOp = {
        type: "image",
        t: now(),
        index: imagesRef.current.length,
        x: (W - w) / 2,
        y: (H - h) / 2,
        w,
        h,
      };
      imagesRef.current.push({ file, bitmap });
      opsRef.current.push(op);
      logRef.current.push(op);
      redraw();
    } catch (err) {
      console.error("Whiteboard: failed to load image:", err);
      setNotice(t.sessionPage.imageInvalid);
    }
  };

  // -------------------------
  // 儲存
  // -------------------------
  const runUploads = useCallback(async () => {
    setPhase("saving");
    try {
      // 重試時只補傳還沒成功的
      await Promise.all(
        tasksRef.current
          .filter((task) => !task.done)
          .map(async (task) => {
            await uploadAsset(sessionId, task.blob, task.meta);
            task.done = true;
          })
      );
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Whiteboard: save failed:", err);
      setPhase("error");
    }
  }, [sessionId, onSaved, onClose]);

  const finish = useCallback(async () => {
    if (phase !== "recording") return;
    commitStroke();

    // 什麼都沒畫 → 不存
    if (logRef.current.length === 0) {
      onClose();
      return;
    }

    setPhase("saving");
    const canvas = canvasRef.current!;
    const durationMs = now();

    await recorderRef.current?.stop();
    recorderRef.current = null;

    const snapshot = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    const strokes = new Blob(
      [
        JSON.stringify({
          version: 1,
          width: W,
          height: H,
          durationMs,
          events: logRef.current,
        }),
      ],
      { type: "application/json" }
    );

    const common = {
      groupId: groupIdRef.current,
      startedAt: startedAtRef.current,
      title: title.trim() || undefined,
    };

    const tasks: UploadTask[] = [];
    const video = videoRef.current;
    if (video) {
      tasks.push({
        blob: video.blob,
        meta: { ...common, kind: "WHITEBOARD_VIDEO", durationMs: video.durationMs },
        done: false,
      });
    }
    if (snapshot) {
      tasks.push({
        blob: snapshot,
        meta: { ...common, kind: "WHITEBOARD_SNAPSHOT" },
        done: false,
      });
    }
    tasks.push({
      blob: strokes,
      meta: { ...common, kind: "WHITEBOARD_STROKES", durationMs },
      done: false,
    });
    imagesRef.current.forEach(({ file }, index) => {
      tasks.push({
        blob: file,
        meta: { ...common, kind: "IMAGE", seq: index, title: file.name },
        done: false,
      });
    });

    tasksRef.current = tasks;
    await runUploads();
  }, [phase, title, onClose, runUploads]);

  const discard = () => {
    if (logRef.current.length > 0 && !window.confirm(t.whiteboard.discardConfirm)) {
      return;
    }
    onClose();
  };

  // -------------------------
  // 計時；到上限自動完成
  // -------------------------
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      const ms = now();
      setElapsedMs(ms);
      if (ms >= MAX_RECORDING_MS) void finishRef.current();
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const busy = phase !== "recording";

  // -------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[min(1100px,calc((100vh-13rem)*16/9))] rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-light">{t.whiteboard.title}</h2>

            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {t.whiteboard.recording} {formatElapsed(elapsedMs)}
            </span>

            {!hasAudio && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <MicOff className="h-3.5 w-3.5" />
                {t.whiteboard.noMic}
              </span>
            )}

            {onFrame && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Eye className="h-3.5 w-3.5" />
                {t.whiteboard.aiWatching}
              </span>
            )}
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.whiteboard.titlePlaceholder}
            maxLength={200}
            disabled={busy}
            className="h-8 max-w-56 text-sm"
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2">
          <Button
            size="sm"
            variant={tool === "pen" ? "default" : "outline"}
            onClick={() => setTool("pen")}
            disabled={busy}
            title={t.whiteboard.pen}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={tool === "eraser" ? "default" : "outline"}
            onClick={() => setTool("eraser")}
            disabled={busy}
            title={t.whiteboard.eraser}
          >
            <Eraser className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-6 w-px bg-gray-200" />

          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              disabled={busy}
              onClick={() => {
                setColor(c);
                setTool("pen");
              }}
              className={`h-6 w-6 rounded-full border-2 ${
                color === c && tool === "pen" ? "border-orange-500" : "border-white"
              } ring-1 ring-gray-200`}
              style={{ backgroundColor: c }}
            />
          ))}

          <div className="mx-1 h-6 w-px bg-gray-200" />

          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`${w}px`}
              disabled={busy}
              onClick={() => setWidth(w)}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${
                width === w ? "bg-gray-200" : "hover:bg-gray-100"
              }`}
            >
              <span
                className="rounded-full bg-gray-900"
                style={{ width: w + 2, height: w + 2 }}
              />
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-gray-200" />

          <Button size="sm" variant="outline" onClick={undo} disabled={busy} title={t.whiteboard.undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={busy} title={t.whiteboard.clear}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title={t.whiteboard.insertImage}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={Object.keys(ASSET_RULES.IMAGE.types).join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void insertImage(file);
            }}
          />

          {notice && <span className="text-xs text-red-500">{notice}</span>}
        </div>

        {/* Canvas */}
        <div className="bg-gray-100 p-3">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={commitStroke}
            onPointerCancel={commitStroke}
            className="block h-auto w-full touch-none cursor-crosshair rounded-lg border border-gray-200 bg-white"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3">
          {phase === "error" && (
            <span className="mr-auto text-sm text-red-500">{t.whiteboard.saveFailed}</span>
          )}

          <Button variant="outline" size="sm" onClick={discard} disabled={phase === "saving"}>
            <X className="mr-2 h-4 w-4" />
            {t.whiteboard.discard}
          </Button>

          {phase === "error" ? (
            <Button
              size="sm"
              className="bg-orange-500 text-white hover:bg-orange-600"
              onClick={() => void runUploads()}
            >
              {t.whiteboard.retry}
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-orange-500 text-white hover:bg-orange-600"
              onClick={() => void finish()}
              disabled={phase === "saving"}
            >
              {phase === "saving" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.whiteboard.saving}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t.whiteboard.finish}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
