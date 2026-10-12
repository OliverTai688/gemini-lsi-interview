// app/admin/page.tsx
// 研究者後台：建立受訪者的專屬連結、查看每位受訪者的進度與訪談內容
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Ban,
  Check,
  Copy,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

type InviteRow = {
  id: string;
  label: string;
  participantName: string | null;
  createdAt: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  revoked: boolean;
  session: {
    id: string;
    completed: boolean;
    hasSummary: boolean;
    turnCount: number;
    lastTurnAt: string | null;
  } | null;
};

type StatusKey = "notOpened" | "opened" | "inProgress" | "completed" | "revoked";

const STATUS_STYLE: Record<StatusKey, string> = {
  notOpened: "bg-gray-100 text-gray-600",
  opened: "bg-blue-50 text-blue-700",
  inProgress: "bg-orange-50 text-orange-700",
  completed: "bg-green-50 text-green-700",
  revoked: "bg-red-50 text-red-600",
};

function statusOf(row: InviteRow): StatusKey {
  if (row.revoked) return "revoked";
  if (row.session?.completed) return "completed";
  if ((row.session?.turnCount ?? 0) > 0) return "inProgress";
  if (row.firstOpenedAt) return "opened";
  return "notOpened";
}

// LINE 內建瀏覽器拿不到麥克風；加上這個參數，從 LINE 點開時會改用外部瀏覽器
const inviteUrl = (token: string) =>
  `${window.location.origin}/i/${token}?openExternalBrowser=1`;

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { t, lang } = useLanguage();
  const text = t.adminPage;

  const isAdmin = !!session?.user?.isAdmin;

  const [rows, setRows] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  // 剛產生的連結：只會出現這一次
  const [freshLink, setFreshLink] = useState<{ label: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (!res.ok) throw new Error(`Fetch invites failed: ${res.status}`);
      const data: { invites: InviteRow[] } = await res.json();
      setRows(data.invites);
    } catch (err) {
      console.error("Failed to fetch invites:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchRows();
  }, [isAdmin, fetchRows]);

  const createInvite = async () => {
    if (!label.trim()) return;

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error(`Create invite failed: ${res.status}`);
      const data = (await res.json()) as { label: string; token: string };

      setCreateOpen(false);
      setLabel("");
      setCopied(false);
      setFreshLink({ label: data.label, url: inviteUrl(data.token) });
      await fetchRows();
    } catch (err) {
      console.error("Failed to create invite:", err);
      setError(text.actionFailed);
    } finally {
      setCreating(false);
    }
  };

  const runAction = async (
    row: InviteRow,
    action: "regenerate" | "revoke" | "restore" | "delete"
  ) => {
    if (action === "regenerate" && !window.confirm(text.regenerateConfirm)) return;
    if (
      action === "delete" &&
      !window.confirm(text.deleteConfirm.replace("{label}", row.label))
    ) {
      return;
    }

    setBusyId(row.id);
    setError("");
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/invites/${row.id}`, { method: "DELETE" })
          : await fetch(`/api/admin/invites/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
      if (!res.ok) throw new Error(`${action} failed: ${res.status}`);

      if (action === "regenerate") {
        const data = (await res.json()) as { token: string };
        setCopied(false);
        setFreshLink({ label: row.label, url: inviteUrl(data.token) });
      }
    } catch (err) {
      console.error("Invite action failed:", err);
      setError(text.actionFailed);
    } finally {
      await fetchRows();
      setBusyId(null);
    }
  };

  const copyLink = async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink.url);
      setCopied(true);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatDateTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(lang === "zh-TW" ? "zh-TW" : "en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  // -------------------------
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-600">{text.forbidden}</p>
        <Button variant="outline" onClick={() => router.push("/home")}>
          {text.backHome}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-black">{text.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{text.subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="outline" onClick={() => router.push("/home")}>
              {text.backHome}
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              {text.newInvite}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center border-gray-200">
            <p className="text-gray-600">{text.empty}</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{text.columns.participant}</th>
                  <th className="px-4 py-3 font-medium">{text.columns.status}</th>
                  <th className="px-4 py-3 font-medium">{text.columns.progress}</th>
                  <th className="px-4 py-3 font-medium">{text.columns.lastActivity}</th>
                  <th className="px-4 py-3 font-medium text-right">{text.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = statusOf(row);
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id} className="border-t border-gray-200 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-black">{row.label}</p>
                        {row.participantName && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {text.calledAs}：{row.participantName}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLE[state]}`}
                        >
                          {text.status[state]}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-gray-700 whitespace-nowrap">
                          {row.session?.turnCount ?? 0} {text.turns}
                        </p>
                        {row.session && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                            <a
                              href={`/session/${row.session.id}/transcript`}
                              className="inline-flex items-center text-gray-600 hover:text-orange-600"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              {text.transcript}
                            </a>
                            <a
                              href={`/session/${row.session.id}/materials`}
                              className="inline-flex items-center text-gray-600 hover:text-orange-600"
                            >
                              <FolderOpen className="w-3.5 h-3.5 mr-1" />
                              {text.materials}
                            </a>
                            <a
                              href={`/session/${row.session.id}/summary`}
                              className="inline-flex items-center text-gray-600 hover:text-orange-600"
                            >
                              <Sparkles className="w-3.5 h-3.5 mr-1" />
                              {text.summary}
                              {row.session.hasSummary && (
                                <Check className="w-3 h-3 ml-0.5 text-green-600" />
                              )}
                            </a>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateTime(row.session?.lastTurnAt ?? row.lastOpenedAt)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-2 mr-1" />}
                          <Button
                            variant="ghost"
                            size="sm"
                            title={text.regenerate}
                            aria-label={text.regenerate}
                            disabled={busy}
                            onClick={() => runAction(row, "regenerate")}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          {row.revoked ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={text.restore}
                              aria-label={text.restore}
                              disabled={busy}
                              onClick={() => runAction(row, "restore")}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={text.revoke}
                              aria-label={text.revoke}
                              disabled={busy}
                              onClick={() => runAction(row, "revoke")}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title={text.delete}
                            aria-label={text.delete}
                            className="text-gray-500 hover:text-red-500"
                            disabled={busy}
                            onClick={() => runAction(row, "delete")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* 新增受訪者 */}
      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-light text-black">
              {text.newInvite}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="invite-label" className="text-sm text-gray-700">
              {text.labelLabel}
            </Label>
            <Input
              id="invite-label"
              value={label}
              maxLength={100}
              placeholder={text.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createInvite()}
            />
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={createInvite}
              disabled={creating || !label.trim()}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {text.creating}
                </>
              ) : (
                text.create
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 剛產生的連結 */}
      <Dialog open={!!freshLink} onOpenChange={(open) => !open && setFreshLink(null)}>
        <DialogContent className="bg-white border-gray-200 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-light text-black">
              {text.linkReadyTitle}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              <span className="block font-medium text-black mb-1">{freshLink?.label}</span>
              {text.linkReadyBody}
            </DialogDescription>
          </DialogHeader>

          <Input
            readOnly
            value={freshLink?.url ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setFreshLink(null)}>
              {text.close}
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={copyLink}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {text.copied}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  {text.copy}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
