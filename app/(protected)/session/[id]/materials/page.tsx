// app/session/[id]/materials/page.tsx
// 素材庫：這場訪談的白板說明、圖片、錄音，集中瀏覽 / 下載 / 刪除
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Mic,
  PenLine,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SessionAudioPlayer from "@/components/SessionAudioPlayer";
import { useLanguage } from "@/context/LanguageContext";
import { groupWhiteboardClips, type AssetDTO } from "@/lib/assets";

function formatDuration(ms: number | null) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function MaterialsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { t, lang } = useLanguage();
  const text = t.materialsPage;

  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${id}/assets`);
      if (!res.ok) throw new Error(`Fetch assets failed: ${res.status}`);
      const data: { assets?: AssetDTO[] } = await res.json();
      setAssets(data.assets ?? []);
    } catch (err) {
      console.error("Failed to fetch assets:", err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchAssets();
  }, [id, fetchAssets]);

  const clips = useMemo(() => groupWhiteboardClips(assets), [assets]);
  const images = useMemo(
    () => assets.filter((a) => a.kind === "IMAGE" && !a.groupId),
    [assets]
  );
  const audioSegments = useMemo(
    () => assets.filter((a) => a.kind === "INTERVIEW_AUDIO"),
    [assets]
  );

  const formatDateTime = (ms: number) =>
    new Date(ms).toLocaleString(lang === "zh-TW" ? "zh-TW" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // 刪除一個素材，或整段白板（影片 + 完成圖 + 筆畫 + 插入的圖片）
  const removeAssets = async (key: string, assetIds: string[]) => {
    if (!window.confirm(text.deleteConfirm)) return;

    setBusyKey(key);
    setError("");
    try {
      for (const assetId of assetIds) {
        const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to delete asset:", err);
      setError(text.deleteFailed);
    } finally {
      // 不論成功與否都以伺服器上的狀態為準
      await fetchAssets();
      setBusyKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/session/${id}`)}
            className="text-gray-600 hover:text-black"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {text.back}
          </Button>

          <div className="h-6 w-px bg-gray-200" />

          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-600" />
            <h1 className="text-lg font-light">{text.title}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {assets.length === 0 && (
          <Card className="p-12 text-center border-gray-200">
            <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-900 font-light">{text.empty}</h3>
          </Card>
        )}

        {/* 白板說明 */}
        {clips.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-base font-medium mb-4">
              <PenLine className="w-4 h-4 text-orange-600" />
              {text.whiteboards}
              <span className="text-sm font-normal text-gray-500">{clips.length}</span>
            </h2>

            <div className="grid gap-6 sm:grid-cols-2">
              {clips.map((clip) => (
                <Card key={clip.key} className="overflow-hidden border-gray-200 p-0 gap-0">
                  {clip.video ? (
                    <video
                      controls
                      preload="none"
                      src={clip.video.url}
                      poster={clip.snapshot?.url}
                      className="w-full aspect-video bg-white border-b border-gray-200"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={clip.snapshot!.url}
                      alt={clip.title || t.transcriptPage.whiteboard}
                      className="w-full aspect-video object-contain border-b border-gray-200"
                    />
                  )}

                  <div className="p-4">
                    <p className="text-sm font-medium truncate">
                      {clip.title || t.transcriptPage.whiteboard}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDateTime(clip.at)}
                      {clip.video?.durationMs
                        ? ` · ${formatDuration(clip.video.durationMs)}`
                        : ""}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {clip.video && (
                        <Button asChild variant="outline" size="sm">
                          <a href={`${clip.video.url}?download=1`}>
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            {text.downloadVideo}
                          </a>
                        </Button>
                      )}
                      {clip.snapshot && (
                        <Button asChild variant="outline" size="sm">
                          <a href={`${clip.snapshot.url}?download=1`}>
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            {text.downloadImage}
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-gray-500 hover:text-red-500"
                        disabled={busyKey !== null}
                        onClick={() => removeAssets(clip.key, clip.assetIds)}
                      >
                        {busyKey === clip.key ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {text.delete}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 圖片 */}
        {images.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-base font-medium mb-4">
              <ImageIcon className="w-4 h-4 text-gray-700" />
              {text.images}
              <span className="text-sm font-normal text-gray-500">{images.length}</span>
            </h2>

            <div className="grid gap-6 grid-cols-2 sm:grid-cols-3">
              {images.map((image) => (
                <Card key={image.id} className="overflow-hidden border-gray-200 p-0 gap-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.title || t.transcriptPage.image}
                    loading="lazy"
                    className="w-full aspect-square object-cover border-b border-gray-200"
                  />
                  <div className="p-3">
                    <p className="text-xs font-medium truncate">
                      {image.title || t.transcriptPage.image}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <Button asChild variant="outline" size="sm">
                        <a href={`${image.url}?download=1`} aria-label={text.download}>
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={text.delete}
                        className="ml-auto text-gray-500 hover:text-red-500"
                        disabled={busyKey !== null}
                        onClick={() => removeAssets(image.id, [image.id])}
                      >
                        {busyKey === image.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 訪談錄音 */}
        {audioSegments.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-base font-medium mb-4">
              <Mic className="w-4 h-4 text-gray-700" />
              {text.recording}
            </h2>

            <SessionAudioPlayer segments={audioSegments} label={text.recording} />

            <div className="flex flex-wrap gap-2 mt-4">
              {audioSegments.map((segment, index) => (
                <Button key={segment.id} asChild variant="outline" size="sm">
                  <a href={`${segment.url}?download=1`}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    {text.segment.replace("{n}", String(index + 1))}
                    <span className="ml-1.5 text-gray-400">
                      {formatDuration(segment.durationMs)}
                    </span>
                  </a>
                </Button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
