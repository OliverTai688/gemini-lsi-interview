"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Calendar,
  MessageSquare,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

// -------------------------
type SessionType = {
  id: string;
  title: string | null;
  created_at: string;
  message_count: number;
};
// -------------------------

export default function HomePage() {
  const { t } = useLanguage();
  const text = t.home; // 🔥 建議建立捷徑，避免 t.home.xxx 一直寫

  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<SessionType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch("/api/session");
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!newSessionTitle.trim()) return;

    setCreating(true);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSessionTitle }),
      });

      const newSession: SessionType = await response.json();
      setSessions((prev) => [newSession, ...prev]);
      setNewSessionTitle("");
      setIsDialogOpen(false);
      window.location.href = `/session/${newSession.id}`;
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/session/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`Delete failed: ${response.status}`);

      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
      setDeleteError(text.deleteDialog.failed);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / 1000 / 60 / 60
    );

    if (diffInHours < 24) {
      return diffInHours < 1
        ? text.sessionCard.justNow
        : `${diffInHours}h ago`;
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-light tracking-tight text-black">
                {text.title}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {text.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white shadow-sm">
                    <Plus className="w-4 h-4 mr-2" />
                    {text.newSessionButton}
                  </Button>
                </DialogTrigger>

                {/* Dialog content */}
                <DialogContent className="bg-white border-gray-200 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-light text-black">
                      {text.dialog.title}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="text-sm text-gray-700">
                        {text.dialog.label}
                      </Label>
                      <Input
                        id="title"
                        placeholder={text.dialog.placeholder}
                        value={newSessionTitle}
                        onChange={(e) => setNewSessionTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createSession()}
                        className="border-gray-300 focus:border-orange-500 focus:ring-orange-500"
                      />
                    </div>

                    <Button
                      onClick={createSession}
                      disabled={creating || !newSessionTitle.trim()}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {text.dialog.creating}
                        </>
                      ) : (
                        text.dialog.createButton
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main list */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {sessions.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-gray-400" />
            </div>

            <h3 className="text-lg font-light text-black mb-2">
              {text.empty.title}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {text.empty.description}
            </p>

            <Button
              onClick={() => setIsDialogOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {text.empty.button}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="border border-gray-200 hover:border-orange-500 transition-all cursor-pointer group bg-white"
                onClick={() => (window.location.href = `/session/${session.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-normal text-black group-hover:text-orange-500 transition-colors truncate">
                        {session.title || text.sessionCard.untitled}
                      </h3>

                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center text-xs text-gray-500">
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          {formatDate(session.created_at)}
                        </div>

                        <div className="flex items-center text-xs text-gray-500">
                          <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          {session.message_count} {text.sessionCard.messages}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      title={text.deleteDialog.button}
                      aria-label={text.deleteDialog.button}
                      className="ml-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError("");
                        setDeleteTarget(session);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>

                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* 刪除確認 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="bg-white border-gray-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-light text-black">
              {text.deleteDialog.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              <span className="block font-medium text-black mb-1">
                {deleteTarget?.title || text.sessionCard.untitled}
              </span>
              {text.deleteDialog.description}
            </DialogDescription>
          </DialogHeader>

          {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {text.deleteDialog.cancel}
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={deleteSession}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {text.deleteDialog.deleting}
                </>
              ) : (
                text.deleteDialog.confirm
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
