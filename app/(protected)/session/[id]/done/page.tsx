// app/session/[id]/done/page.tsx
// 訪談結束後的頁面：致謝、回顧、補充、刪除自己的資料
"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FileText, FolderOpen, Loader2, Mic, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/context/LanguageContext";

export default function DonePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const text = t.donePage;

  const [busy, setBusy] = useState<"continue" | "delete" | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  const continueInterview = async () => {
    setBusy("continue");
    try {
      const res = await fetch(`/api/session/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: false }),
      });
      if (!res.ok) throw new Error(`Reopen failed: ${res.status}`);
      router.push(`/session/${id}`);
    } catch (err) {
      console.error("Failed to reopen interview:", err);
      setBusy(null);
    }
  };

  const deleteInterview = async () => {
    if (!window.confirm(text.deleteConfirm)) return;

    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/session/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setDeleted(true);
    } catch (err) {
      console.error("Failed to delete interview:", err);
      setError(text.deleteFailed);
    } finally {
      setBusy(null);
    }
  };

  if (deleted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-5">
        <Card className="w-full max-w-md border-gray-200 p-8 text-center">
          <p className="text-base text-gray-800">{text.deleted}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-xl px-5 py-12 space-y-6">
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
          <h1 className="mb-2 text-2xl font-light">{text.title}</h1>
          <p className="text-base text-gray-700">{text.body}</p>
        </div>

        <Card className="gap-3 border-gray-200 p-5">
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={() => router.push(`/session/${id}/transcript`)}
          >
            <FileText className="mr-2 h-4 w-4" />
            {text.transcript}
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={() => router.push(`/session/${id}/materials`)}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            {text.materials}
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={continueInterview}
            disabled={busy !== null}
          >
            {busy === "continue" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mic className="mr-2 h-4 w-4" />
            )}
            {text.continue}
          </Button>

          <p className="text-xs text-gray-500">{text.saveLinkNote}</p>
        </Card>

        <Card className="gap-3 border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-800">{text.deleteTitle}</h2>
          <p className="text-sm text-gray-600">{text.deleteBody}</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            variant="outline"
            className="h-10 self-start text-red-600 hover:text-red-700"
            onClick={deleteInterview}
            disabled={busy !== null}
          >
            {busy === "delete" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {text.deleting}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {text.deleteButton}
              </>
            )}
          </Button>
        </Card>
      </div>
    </div>
  );
}
