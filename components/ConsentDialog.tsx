// components/ConsentDialog.tsx
// 第一次錄音 / 錄影前的同意畫面
"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/context/LanguageContext";

type Props = {
  open: boolean;
  onCancel: () => void;
  /** 同意已寫入後端之後才會呼叫 */
  onAgreed: () => void;
};

export default function ConsentDialog({ open, onCancel, onAgreed }: Props) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const agree = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/user/consent", { method: "POST" });
      if (!res.ok) throw new Error(`Consent failed: ${res.status}`);
      onAgreed();
    } catch (err) {
      console.error("Failed to save consent:", err);
      setError(t.consent.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <DialogContent className="bg-white border-gray-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-light text-black">
            {t.consent.title}
          </DialogTitle>
        </DialogHeader>

        <ul className="list-disc space-y-2 pl-5 py-2 text-sm text-gray-700">
          {t.consent.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {t.consent.cancel}
          </Button>
          <Button
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={agree}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t.consent.agree}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
