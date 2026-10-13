// app/session/[id]/transcript/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  Download,
  Copy,
  Check,
  Loader2,
  User,
  Bot,
  Sparkles,
  MessageSquare,
  Play,
  PenLine,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/context/LanguageContext";
import {
  assetTime,
  groupWhiteboardClips,
  type AssetDTO,
  type WhiteboardClip,
} from "@/lib/assets";
import SessionAudioPlayer, {
  locateInSegments,
} from "@/components/SessionAudioPlayer";

// ----------- Types -----------
type TranscriptMessage = {
  role: "user" | "model";
  content: string;
  timestamp: string;
  startedAt?: string | null;
};

// 逐字稿時間軸上的項目：訊息、白板說明、上傳的圖片
type TimelineItem =
  | { type: "message"; at: number; message: TranscriptMessage; index: number }
  | { type: "whiteboard"; at: number; clip: WhiteboardClip }
  | { type: "image"; at: number; asset: AssetDTO };

type TranscriptResponse = {
  title: string | null;
  messages: TranscriptMessage[];
  completed?: boolean;
  isOwner?: boolean;
};

// ----------- Component -----------
export default function TranscriptPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { t, lang } = useLanguage(); // ⭐ 多語系導入

  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | "all" | null>(null);

  const [assets, setAssets] = useState<AssetDTO[]>([]);

  // 管理者看別人的訪談 → 返回後台；自己的訪談 → 返回訪談頁（已結束則回完成頁）
  const { data: authSession } = useSession();
  const isAdmin = !!authSession?.user?.isAdmin;
  const [viewer, setViewer] = useState({ isOwner: true, completed: false });
  const backHref = !viewer.isOwner
    ? "/admin"
    : viewer.completed
      ? `/session/${id}/done`
      : `/session/${id}`;
  const [seekTo, setSeekTo] = useState<{ at: number; nonce: number } | null>(null);

  useEffect(() => {
    if (id) fetchTranscript();
  }, [id]);

  const fetchTranscript = async () => {
    setIsLoading(true);

    try {
      const [res, assetsRes] = await Promise.all([
        fetch(`/api/session/${id}/transcript`),
        fetch(`/api/session/${id}/assets`),
      ]);
      const data: TranscriptResponse = await res.json();

      setTranscript(data.messages ?? []);
      setSessionTitle(data.title || t.invitePage.brand);
      setViewer({ isOwner: data.isOwner !== false, completed: !!data.completed });

      if (assetsRes.ok) {
        const assetData: { assets?: AssetDTO[] } = await assetsRes.json();
        setAssets(assetData.assets ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch transcript:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const audioSegments = useMemo(
    () => assets.filter((a) => a.kind === "INTERVIEW_AUDIO"),
    [assets]
  );

  // 訊息 + 白板說明 + 圖片，依時間排成一條時間軸
  const timeline = useMemo(() => {
    const items: TimelineItem[] = transcript.map((message, index) => ({
      type: "message",
      at: Date.parse(message.timestamp),
      message,
      index,
    }));

    for (const a of assets) {
      if (a.kind === "IMAGE" && !a.groupId) {
        items.push({ type: "image", at: assetTime(a), asset: a });
      }
    }
    for (const clip of groupWhiteboardClips(assets)) {
      items.push({ type: "whiteboard", at: clip.at, clip });
    }

    return items.sort((a, b) => a.at - b.at);
  }, [transcript, assets]);

  const canPlayFrom = (m: TranscriptMessage) =>
    !!m.startedAt && !!locateInSegments(audioSegments, Date.parse(m.startedAt));

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString(
      lang === "zh-TW" ? "zh-TW" : "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    );
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatTranscriptForExport = () => {
    let text = `${sessionTitle}\n${t.transcriptPage.title}\nGenerated: ${new Date().toLocaleString()}\n`;
    text += `${"=".repeat(60)}\n\n`;

    transcript.forEach((m) => {
      const speaker = m.role === "user" ? t.transcriptPage.user : t.transcriptPage.ai;
      const timestamp = formatTime(m.timestamp);
      text += `[${timestamp}] ${speaker}\n${m.content}\n\n`;
    });

    return text;
  };

  const copyAllTranscript = async () => {
    const text = formatTranscriptForExport();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex("all");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const downloadTxt = () => {
    const text = formatTranscriptForExport();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `${sessionTitle.replace(/[^a-z0-9]/gi, "_")}_transcript.txt`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const getWordCount = () =>
    transcript.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0);

  const getDuration = () => {
    if (transcript.length < 2) return "N/A";
    const start = new Date(transcript[0].timestamp).getTime();
    const end = new Date(transcript[transcript.length - 1].timestamp).getTime();
    const mins = Math.floor((end - start) / 1000 / 60);
    return `${mins} min`;
  };

  // ------------------
  // Loading UI
  // ------------------
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // ------------------
  // MAIN UI
  // ------------------
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(backHref)}
              className="text-gray-600 hover:text-black"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {viewer.isOwner ? t.transcriptPage.back : t.transcriptPage.backAdmin}
            </Button>

            <div className="h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-600" />
              <h1 className="text-lg font-light">{t.transcriptPage.title}</h1>
            </div>
          </div>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/session/${id}/summary`)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Summary
            </Button>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Session Info */}
        <h2 className="text-2xl font-light mb-3">{sessionTitle}</h2>

        <div className="flex items-center gap-6 text-sm text-gray-500 mb-8">
          <span>{transcript.length} {t.transcriptPage.stats.messages}</span> •
          <span>{getWordCount()} {t.transcriptPage.stats.words}</span> •
          <span>{t.transcriptPage.stats.duration}: {getDuration()}</span>
        </div>

        {audioSegments.length > 0 && (
          <div className="mb-6">
            <SessionAudioPlayer
              segments={audioSegments}
              label={t.transcriptPage.recording}
              seekTo={seekTo}
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 mb-6">
          <Button variant="outline" size="sm" onClick={copyAllTranscript}>
            {copiedIndex === "all" ? (
              <>
                <Check className="w-4 h-4 mr-2 text-green-500" />
                {t.transcriptPage.copied}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                {t.transcriptPage.copyAll}
              </>
            )}
          </Button>

          <Button size="sm" className="bg-orange-500 text-white" onClick={downloadTxt}>
            <Download className="w-4 h-4 mr-2" />
            {t.transcriptPage.downloadTxt}
          </Button>
        </div>

        {/* Messages */}
        {timeline.length === 0 ? (
          <Card className="p-12 text-center border-gray-200">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-900 font-light mb-2">{t.transcriptPage.noMessages}</h3>

            {viewer.isOwner && (
              <Button className="bg-orange-500 text-white"
                onClick={() => router.push(`/session/${id}`)}
              >
                {t.transcriptPage.goInterview}
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-0">
            {timeline.map((item) => {
              if (item.type === "whiteboard") {
                const { video, snapshot, title } = item.clip;
                return (
                  <div key={`wb-${item.clip.key}`} className="border-b py-6 px-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-100">
                          <PenLine className="text-orange-600 w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {title || t.transcriptPage.whiteboard}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(new Date(item.at).toISOString())}
                          </p>
                        </div>
                      </div>

                      {(video ?? snapshot) && (
                        <a
                          href={`${(video ?? snapshot)!.url}?download=1`}
                          className="inline-flex items-center text-xs text-gray-600 hover:text-black"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          {t.transcriptPage.download}
                        </a>
                      )}
                    </div>

                    <div className="ml-11 max-w-2xl">
                      {video ? (
                        <video
                          controls
                          preload="none"
                          src={video.url}
                          poster={snapshot?.url}
                          className="w-full rounded-lg border border-gray-200 bg-white"
                        />
                      ) : (
                        snapshot && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={snapshot.url}
                            alt={title || t.transcriptPage.whiteboard}
                            className="w-full rounded-lg border border-gray-200"
                          />
                        )
                      )}
                    </div>
                  </div>
                );
              }

              if (item.type === "image") {
                return (
                  <div key={`img-${item.asset.id}`} className="border-b py-6 px-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black">
                        <ImageIcon className="text-white w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {item.asset.title || t.transcriptPage.image}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatTime(new Date(item.at).toISOString())}
                        </p>
                      </div>
                    </div>

                    <div className="ml-11 max-w-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.asset.url}
                        alt={item.asset.title || t.transcriptPage.image}
                        loading="lazy"
                        className="w-full rounded-lg border border-gray-200"
                      />
                    </div>
                  </div>
                );
              }

              const { message: m, index: idx } = item;
              return (
              <div key={idx} className="group border-b hover:bg-gray-50 transition-colors">
                <div className="py-6 px-6">
                  <div className="flex justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          m.role === "user" ? "bg-black" : "bg-gray-200"
                        }`}
                      >
                        {m.role === "user" ? (
                          <User className="text-white w-4 h-4" />
                        ) : (
                          <Bot className="text-gray-600 w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium">
                          {m.role === "user"
                            ? t.transcriptPage.user
                            : t.transcriptPage.ai}
                        </p>
                        <p className="text-xs text-gray-500">{formatTime(m.timestamp)}</p>
                      </div>
                    </div>

                    <div className="flex items-center">
                    {canPlayFrom(m) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() =>
                          setSeekTo({ at: Date.parse(m.startedAt!), nonce: Date.now() })
                        }
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        <span className="text-xs">{t.transcriptPage.playFromHere}</span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => copyToClipboard(m.content, idx)}
                    >
                      {copiedIndex === idx ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                          <span className="text-xs text-green-500">{t.transcriptPage.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          <span className="text-xs">{t.transcriptPage.copyAll}</span>
                        </>
                      )}
                    </Button>
                    </div>
                  </div>

                  <div className="ml-11">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {transcript.length > 0 && (
          <div className="mt-8 pt-6 border-t text-center text-xs text-gray-500">
            {t.transcriptPage.end} • {transcript.length} {t.transcriptPage.stats.messages}
          </div>
        )}
      </main>
    </div>
  );
}
