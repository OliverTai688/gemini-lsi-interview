//app/session/[id]/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Mic,
  MicOff,
  Loader2,
  FileText,
  Sparkles,
  ChevronLeft,
  PenLine,
  ImagePlus,
  FolderOpen,
  CircleCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";

import {
  createBlob,
  decode,
  decodeAudioData,
} from "@/lib/audio-utils";
import { ASSET_RULES, baseMime } from "@/lib/assets";
import { uploadAsset } from "@/lib/asset-upload";
import { toJpegBase64 } from "@/lib/image-utils";
import {
  AUDIO_MIME_TYPES,
  SegmentedRecorder,
} from "@/lib/segmented-recorder";
import Whiteboard from "@/components/Whiteboard";
import ConsentDialog from "@/components/ConsentDialog";

// 訪談錄音每 60 秒切一段上傳 → 分頁當掉最多損失最後一段
const RECORDING_SEGMENT_MS = 60_000;

// Gemini Live 的連線有時間上限，中途斷線時自動重連；連續失敗這麼多次就停下來請使用者手動再試
const MAX_RECONNECTS = 3;
const RECONNECT_DELAY_MS = 1500;

// -------------------------
// 型別
// -------------------------
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type Status = "idle" | "connecting" | "connected" | "error";

type TranscriptResponse = {
  title?: string;
  messages?: {
    role: "user" | "model" | "assistant";
    content: string;
    timestamp: string;
  }[];
  completed?: boolean;
  isOwner?: boolean;
};

// -------------------------
export default function LiveInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  // 受訪者（邀請連結）看到的是精簡版：沒有返回列表、沒有 AI 總結
  const { data: authSession } = useSession();
  const isGuest = !!authSession?.user?.isGuest;
  const isAdmin = !!authSession?.user?.isAdmin;

  // -------------------------
  // State
  // -------------------------
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [textInput, setTextInput] = useState("");

  const [currentInput, setCurrentInput] = useState("");
  const [currentOutput, setCurrentOutput] = useState("");

  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  // 訪談連線中的混音（麥克風 + AI 語音）→ 白板錄影時當音軌
  const [mixStream, setMixStream] = useState<MediaStream | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");

  // 錄音 / 錄影同意：還沒同意過的人，第一次開始訪談或開白板前要先同意
  const [consented, setConsented] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const afterConsentRef = useRef<(() => void) | null>(null);

  const [notFound, setNotFound] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  // 使用者是否希望訪談保持連線（true 時斷線會自動重連）
  const wantLiveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  // -------------------------
  // Refs
  // -------------------------
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const sessionPromiseRef = useRef<Promise<Session> | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputRef = useRef("");
  const currentOutputRef = useRef("");
  const messagesRef = useRef<ChatMessage[]>([]);

  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<SegmentedRecorder | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // 這一回合雙方各自開始說話的時間 → 對回錄音位置
  const userStartedAtRef = useRef<string | null>(null);
  const aiStartedAtRef = useRef<string | null>(null);

  const buildContextHistory = (msgs: ChatMessage[]) => {
  return msgs
    .map(m => {
      const speaker = m.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${m.content}`;
    })
    .join("\n");
};


  // keep messages ref sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // -------------------------
  // 載入舊 transcript
  // -------------------------
  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/session/${id}/transcript`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data: TranscriptResponse = await res.json();

        // 管理者看別人的訪談 → 只能看逐字稿，不能進到訪談現場
        if (data.isOwner === false) {
          router.replace(`/session/${id}/transcript`);
          return;
        }
        // 已結束的訪談 → 先到完成頁（那裡可以選擇繼續補充）
        if (data.completed) {
          router.replace(`/session/${id}/done`);
          return;
        }

        setSessionTitle(data.title || t.invitePage.brand);

        const loaded =
          data.messages?.map((m) => ({
            role: m.role === "model" ? "assistant" : (m.role as "user" | "assistant"),
            content: m.content,
            timestamp: m.timestamp,
          })) ?? [];

        setMessages(loaded);
      } catch (err) {
        console.error("Failed to fetch transcript:", err);
      }
    };

    fetchTranscript();
  }, [id, router, t.invitePage.brand]);

  // -------------------------
  // 是否已同意錄音
  // -------------------------
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setConsented(!!data?.user?.recordingConsentAt))
      .catch((err) => console.error("Failed to load consent:", err));
  }, []);

  const withConsent = (action: () => void) => {
    if (consented) {
      action();
      return;
    }
    afterConsentRef.current = action;
    setConsentOpen(true);
  };

  // -------------------------
  // Scroll bottom
  // -------------------------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentOutput]);

  // -------------------------
  // 素材上傳（R2）
  // -------------------------
  const trackUpload = useCallback((upload: Promise<unknown>) => {
    setPendingUploads((n) => n + 1);
    upload
      .catch((err) => {
        console.error("Asset upload failed:", err);
        setUploadNotice(t.sessionPage.uploadFailed);
      })
      .finally(() => setPendingUploads((n) => n - 1));
  }, [t.sessionPage.uploadFailed]);

  // 還有素材在上傳時，離開頁面前先提醒
  useEffect(() => {
    if (pendingUploads === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingUploads]);

  // 把畫面（白板 / 圖片）送給 AI 訪談員
  const sendImageToAI = useCallback((jpegBase64: string) => {
    sessionPromiseRef.current?.then((session) => {
      session.sendRealtimeInput({
        video: { data: jpegBase64, mimeType: "image/jpeg" },
      });
    });
  }, []);

  const handleImageSelected = async (file: File) => {
    const rule = ASSET_RULES.IMAGE;
    if (!rule.types[baseMime(file.type)] || file.size > rule.maxBytes) {
      setUploadNotice(t.sessionPage.imageInvalid);
      return;
    }
    setUploadNotice("");

    trackUpload(
      uploadAsset(id, file, {
        kind: "IMAGE",
        startedAt: new Date(),
        title: file.name,
      })
    );

    if (status === "connected") {
      try {
        const bitmap = await createImageBitmap(file);
        sendImageToAI(toJpegBase64(bitmap, bitmap.width, bitmap.height, 1024, 0.8));
      } catch (err) {
        console.error("Failed to send image to AI:", err);
      }
    }
  };

  // -------------------------
  // 停止音訊管線
  // -------------------------
  const stopAudioProcessing = useCallback(() => {
    // 先停錄音（最後一段會在背景上傳），再關音軌
    void recorderRef.current?.stop();
    recorderRef.current = null;
    recDestRef.current = null;
    setMixStream(null);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== "closed") {
      inputAudioContextRef.current.close().catch(console.error);
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== "closed") {
      outputAudioContextRef.current.close().catch(console.error);
    }

    audioSourcesRef.current.forEach((s) => s.stop());
    audioSourcesRef.current.clear();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
  }, []);

  // -------------------------
  const stopConversation = useCallback(async () => {
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (err) {
        console.error("Error closing session:", err);
      }
      sessionPromiseRef.current = null;
    }

    stopAudioProcessing();
    setStatus("idle");
  }, [stopAudioProcessing]);

  // -------------------------
  // Toggle Live Session
  // -------------------------
  // forceStart：自動重連時使用，不看目前的 status 直接建立連線
  const handleToggleConversation = useCallback(async (forceStart = false) => {
    // 正在連線 → 停止
    if (!forceStart && (status === "connected" || status === "connecting")) {
      wantLiveRef.current = false;
      await stopConversation();
      return;
    }

    // idle → 建立
    if (forceStart || status === "idle" || status === "error") {
      if (sessionPromiseRef.current) return;

      wantLiveRef.current = true;
      if (!forceStart) reconnectAttemptsRef.current = 0;
      setUploadNotice("");
      setStatus("connecting");

      setCurrentInput("");
      setCurrentOutput("");
      currentInputRef.current = "";
      currentOutputRef.current = "";
      userStartedAtRef.current = null;
      aiStartedAtRef.current = null;

      try {
        // 向後端要一次性的短效 token（長效 API key 不會出現在瀏覽器）
        const tokenRes = await fetch(`/api/session/${id}/live-token`, {
          method: "POST",
        });
        if (!tokenRes.ok) {
          console.error("Failed to get live token:", tokenRes.status);
          setUploadNotice(t.sessionPage.connectFailed);
          setReconnecting(false);
          setStatus("error");
          return;
        }
        const { token } = (await tokenRes.json()) as { token: string };

        const ai = new GoogleGenAI({
          apiKey: token,
          httpOptions: { apiVersion: "v1alpha" },
        });

        sessionPromiseRef.current = ai.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-09-2025",

          callbacks: {
           onopen: async () => {
  setStatus("connected");
  setReconnecting(false);

  // --- 1) 建立 AudioContext ---
  const inCtx = new AudioContext({ sampleRate: 16000 });
  const outCtx = new AudioContext({ sampleRate: 24000 });

  inputAudioContextRef.current = inCtx;
  outputAudioContextRef.current = outCtx;
  nextStartTimeRef.current = 0;

 // --- 2) 注入完整歷史（最關鍵）---
try {
  const historyText = messagesRef.current
    .map((m) => {
      const speaker = m.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${m.content}`;
    })
    .join("\n");

  if (historyText.trim().length > 0) {
    sessionPromiseRef.current?.then((session) => {
      session.sendRealtimeInput({
        text:
          `${t.system.prompt}\n\n` +
          `# Conversation History\n` +
          `${historyText}\n\n` +
          `# Continue the Interview\n` +
          `請延續上述脈絡繼續語音對話。`,
      });
    });
  }
} catch (err) {
  console.error("Failed to send history preload:", err);
}


  // --- 3) 麥克風 Audio Pipeline ---
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    // 沒有麥克風權限 → 關掉連線並告訴使用者怎麼處理
    console.error("Microphone unavailable:", err);
    wantLiveRef.current = false;
    setUploadNotice(t.sessionPage.micDenied);
    sessionPromiseRef.current?.then((session) => session.close());
    return;
  }
  mediaStreamRef.current = stream;

  // --- 4) 錄音：麥克風 + AI 語音混成一軌，分段上傳 R2 ---
  try {
    const recDest = outCtx.createMediaStreamDestination();
    outCtx.createMediaStreamSource(stream).connect(recDest);
    recDestRef.current = recDest;
    setMixStream(recDest.stream);

    const recordingId = crypto.randomUUID();
    const recorder = new SegmentedRecorder(recDest.stream, {
      mimeTypes: AUDIO_MIME_TYPES,
      segmentMs: RECORDING_SEGMENT_MS,
      audioBitsPerSecond: 48_000,
      onSegment: (segment) => {
        trackUpload(
          uploadAsset(id, segment.blob, {
            kind: "INTERVIEW_AUDIO",
            groupId: recordingId,
            seq: segment.seq,
            startedAt: segment.startedAt,
            durationMs: segment.durationMs,
          })
        );
      },
    });
    recorder.start();
    recorderRef.current = recorder;
  } catch (err) {
    console.error("Failed to start recording:", err);
  }

  const source = inCtx.createMediaStreamSource(stream);
  mediaStreamSourceRef.current = source;

  const proc = inCtx.createScriptProcessor(4096, 1, 1);
  scriptProcessorRef.current = proc;

  proc.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const pcmBlob = createBlob(inputData);

    sessionPromiseRef.current?.then((session) => {
      session.sendRealtimeInput({ media: pcmBlob });
    });
  };

  source.connect(proc);
  proc.connect(inCtx.destination);
},


            onmessage: async (message: LiveServerMessage) => {
              // 使用者語音文字
              const userText = message.serverContent?.inputTranscription?.text;
              if (userText) {
                userStartedAtRef.current ??= new Date().toISOString();
                currentInputRef.current += userText;
                setCurrentInput(currentInputRef.current);
              }

              // AI 文字
              const aiText = message.serverContent?.outputTranscription?.text;
              if (aiText) {
                currentOutputRef.current += aiText;
                setCurrentOutput(currentOutputRef.current);
              }

              // AI 語音
              const base64Audio =
                message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

              if (base64Audio && outputAudioContextRef.current) {
                aiStartedAtRef.current ??= new Date().toISOString();

                const audioCtx = outputAudioContextRef.current;

                nextStartTimeRef.current = Math.max(
                  nextStartTimeRef.current,
                  audioCtx.currentTime
                );

                const audioBuffer = await decodeAudioData(
                  decode(base64Audio),
                  audioCtx,
                  24000,
                  1
                );

                const s = audioCtx.createBufferSource();
                s.buffer = audioBuffer;
                s.connect(audioCtx.destination);
                // 同時送進錄音混音
                if (recDestRef.current) s.connect(recDestRef.current);

                s.addEventListener("ended", () => {
                  audioSourcesRef.current.delete(s);
                });

                s.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;

                audioSourcesRef.current.add(s);
              }

              // 回合結束
              if (message.serverContent?.turnComplete) {
                const fullInput = currentInputRef.current.trim();
                const fullOutput = currentOutputRef.current.trim();

                const timestamp = new Date().toISOString();

                setMessages((prev) => {
  const newMessages: ChatMessage[] = [];

  if (fullInput) {
    newMessages.push({
      role: "user",
      content: fullInput,
      timestamp,
    });
  }

  if (fullOutput) {
    newMessages.push({
      role: "assistant",
      content: fullOutput,
      timestamp,
    });
  }

  return [...prev, ...newMessages];
});


                const userStartedAt = userStartedAtRef.current;
                const aiStartedAt = aiStartedAtRef.current;

                // 完成了一個回合 = 連線是健康的
                reconnectAttemptsRef.current = 0;

                // reset
                currentInputRef.current = "";
                currentOutputRef.current = "";
                userStartedAtRef.current = null;
                aiStartedAtRef.current = null;
                setCurrentInput("");
                setCurrentOutput("");

                // 存 DB
                try {
                  await fetch(`/api/session/${id}/live-turn`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userText: fullInput,
                      aiText: fullOutput,
                      userStartedAt,
                      aiStartedAt,
                      endedAt: timestamp,
                    }),
                  });
                } catch (err) {
                  console.error("Failed to save live turn:", err);
                }
              }

              // 模型被打斷 → 停止所有正在播放
              if (message.serverContent?.interrupted) {
                audioSourcesRef.current.forEach((s) => s.stop());
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }
            },

            onerror: (e: ErrorEvent) => {
              console.error("Live session error:", e);
              setStatus("error");
              stopAudioProcessing();
            },

            onclose: () => {
              sessionPromiseRef.current = null;
              stopAudioProcessing();

              // 不是使用者自己停的 → 自動重連（重連時會把逐字稿帶回去接續）
              if (
                wantLiveRef.current &&
                reconnectAttemptsRef.current < MAX_RECONNECTS
              ) {
                reconnectAttemptsRef.current += 1;
                setReconnecting(true);
                setStatus("connecting");
                setReconnectNonce((n) => n + 1);
                return;
              }

              setReconnecting(false);
              setStatus(wantLiveRef.current ? "error" : "idle");
              wantLiveRef.current = false;
            },
          },

          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: t.system.prompt, // <── 你指定的 system prompt
          },
        });
      } catch (err) {
        console.error("Failed to start live conversation:", err);
        setStatus("error");
        stopAudioProcessing();
      }
    }
  }, [id, status, stopConversation, stopAudioProcessing, trackUpload, t.system.prompt, t.sessionPage.connectFailed, t.sessionPage.micDenied]);

  // -------------------------
  // 自動重連
  // -------------------------
  const toggleRef = useRef(handleToggleConversation);
  useEffect(() => {
    toggleRef.current = handleToggleConversation;
  }, [handleToggleConversation]);

  useEffect(() => {
    if (reconnectNonce === 0) return;
    const timer = setTimeout(() => {
      if (wantLiveRef.current) void toggleRef.current(true);
    }, RECONNECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reconnectNonce]);

  // -------------------------
  // 離開頁面時關掉連線與麥克風
  // -------------------------
  useEffect(() => {
    return () => {
      wantLiveRef.current = false;
      sessionPromiseRef.current
        ?.then((session) => session.close())
        .catch(() => {});
      sessionPromiseRef.current = null;
      stopAudioProcessing();
    };
  }, [stopAudioProcessing]);

  // -------------------------
  // 訪談進行中不要讓螢幕休眠（手機螢幕一關，麥克風就停了）
  // -------------------------
  useEffect(() => {
    if (status !== "connected" || !("wakeLock" in navigator)) return;

    let cancelled = false;
    let lock: WakeLockSentinel | null = null;

    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    // 切回這個分頁時要重新取得
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [status]);

  // -------------------------
  // 結束訪談
  // -------------------------
  const endInterview = async () => {
    setEnding(true);
    try {
      wantLiveRef.current = false;
      await stopConversation();

      const res = await fetch(`/api/session/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(`Complete failed: ${res.status}`);

      router.push(`/session/${id}/done`);
    } catch (err) {
      console.error("Failed to end interview:", err);
      setEnding(false);
      setEndOpen(false);
    }
  };

  // -------------------------
  // Text 模式
  // -------------------------
  const sendTextMessage = async () => {
    if (!textInput.trim()) return;

    const msg: ChatMessage = {
      role: "user",
      content: textInput,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, msg]);
    setTextInput("");

    try {
      await fetch(`/api/session/${id}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.content }),
      });
    } catch (err) {
      console.error("Failed to send text:", err);
    }
  };

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const isProcessing = status === "connecting";

  if (notFound) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-600">{t.sessionPage.notFound}</p>
        {!isGuest && (
          <Button variant="outline" onClick={() => router.push("/home")}>
            {t.sessionPage.back}
          </Button>
        )}
      </div>
    );
  }

  // -------------------------
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            {!isGuest && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/home")}
                  className="text-gray-600 hover:text-black"
                >
                  <ChevronLeft className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t.sessionPage.back}</span>
                </Button>

                <div className="hidden sm:block h-6 w-px bg-gray-200" />
              </>
            )}

            <h1 className="text-lg font-light truncate">{sessionTitle}</h1>
          </div>

          {/* 小螢幕只顯示圖示 */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              title={t.sessionPage.materials}
              aria-label={t.sessionPage.materials}
              onClick={() => router.push(`/session/${id}/materials`)}
            >
              <FolderOpen className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t.sessionPage.materials}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              title={t.sessionPage.fullTranscript}
              aria-label={t.sessionPage.fullTranscript}
              onClick={() => router.push(`/session/${id}/transcript`)}
            >
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t.sessionPage.fullTranscript}</span>
            </Button>

            {/* AI 總結只給研究者 */}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                title={t.sessionPage.generateSummary}
                aria-label={t.sessionPage.generateSummary}
                onClick={() => router.push(`/session/${id}/summary`)}
              >
                <Sparkles className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t.sessionPage.generateSummary}</span>
              </Button>
            )}

            {messages.length > 0 && (
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                title={t.sessionPage.endInterview}
                aria-label={t.sessionPage.endInterview}
                onClick={() => setEndOpen(true)}
              >
                <CircleCheck className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t.sessionPage.endInterview}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {messages.length === 0 && !currentOutput ? (
            <div className="flex flex-col items-center py-20 text-center">
              <Mic className="w-8 h-8 text-gray-400 mb-4" />
              <h3 className="text-lg font-light">
                {t.sessionPage.startTitle}
              </h3>
              <p className="text-sm text-gray-500">
                {t.sessionPage.startSubtitle}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <Card
                    className={`max-w-[75%] rounded-2xl p-4 shadow-sm ${
                      msg.role === "user"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-black border-gray-200"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`text-xs mt-2 ${
                        msg.role === "user" ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </Card>
                </div>
              ))}

              {/* 即時 output */}
              {currentOutput && (
                <div className="flex justify-start">
                  <Card className="max-w-[75%] p-4 rounded-2xl shadow-sm bg-white">
                    <p className="text-sm whitespace-pre-wrap">{currentOutput}</p>
                    <p className="text-xs mt-2 text-gray-500">...</p>
                  </Card>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input */}
      <footer className="border-t border-gray-200 bg-white min-h-[150px]">
        <div className="max-w-4xl mx-auto px-6 py-4">

          {/* Live toggle */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="flex items-center gap-6">
            <Button
              variant="outline"
              className="rounded-full w-11 h-11 p-0"
              title={t.sessionPage.whiteboard}
              aria-label={t.sessionPage.whiteboard}
              onClick={() => withConsent(() => setWhiteboardOpen(true))}
            >
              <PenLine className="w-5 h-5" />
            </Button>

            <Button
              size="lg"
              disabled={isProcessing}
              onClick={() =>
                // 停止不需要同意；開始錄之前才需要
                status === "connected"
                  ? handleToggleConversation()
                  : withConsent(() => void handleToggleConversation())
              }
              className={`rounded-full w-16 h-16 shadow-lg transition-all active:scale-95 ${
                status === "connected"
                  ? "bg-red-500 animate-pulse"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : status === "connected" ? (
                <MicOff className="w-6 h-6 text-white" />
              ) : (
                <Mic className="w-6 h-6 text-white" />
              )}
            </Button>

            <Button
              variant="outline"
              className="rounded-full w-11 h-11 p-0"
              title={t.sessionPage.uploadImage}
              aria-label={t.sessionPage.uploadImage}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus className="w-5 h-5" />
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept={Object.keys(ASSET_RULES.IMAGE.types).join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImageSelected(file);
              }}
            />
            </div>

            <span className="text-xs text-gray-500">
              {status === "connected"
                ? t.sessionPage.liveStatus.connected
                : status === "connecting"
                ? reconnecting
                  ? t.sessionPage.reconnecting
                  : t.sessionPage.liveStatus.connecting
                : status === "error"
                ? t.sessionPage.liveStatus.error
                : t.sessionPage.liveStatus.idle}
            </span>

            <span className="text-xs text-gray-400">
              {pendingUploads > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t.sessionPage.uploading}
                </span>
              ) : uploadNotice ? (
                <span className="text-red-500">{uploadNotice}</span>
              ) : (
                t.sessionPage.recordingNotice
              )}
            </span>
          </div>

          {/* Text mode */}
          {/* <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder={t.sessionPage.textPlaceholder}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendTextMessage();
                }
              }}
              className="flex-1"
            />

            <Button
              disabled={!textInput.trim()}
              onClick={sendTextMessage}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              Send
            </Button>
          </div> */}
        </div>
      </footer>

      {/* 結束訪談確認 */}
      <Dialog open={endOpen} onOpenChange={(open) => !ending && setEndOpen(open)}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-light text-black">
              {t.sessionPage.endConfirmTitle}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {t.sessionPage.endConfirmBody}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)} disabled={ending}>
              {t.sessionPage.endCancel}
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={endInterview}
              disabled={ending}
            >
              {ending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t.sessionPage.endConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConsentDialog
        open={consentOpen}
        onCancel={() => {
          afterConsentRef.current = null;
          setConsentOpen(false);
        }}
        onAgreed={() => {
          setConsented(true);
          setConsentOpen(false);
          afterConsentRef.current?.();
          afterConsentRef.current = null;
        }}
      />

      {whiteboardOpen && (
        <Whiteboard
          sessionId={id}
          audioStream={mixStream}
          onFrame={status === "connected" ? sendImageToAI : undefined}
          onClose={() => setWhiteboardOpen(false)}
        />
      )}
    </div>
  );
}
