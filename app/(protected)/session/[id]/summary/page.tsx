//app/session/[id]/summary/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

type Summary = {
  life_theme: string | null;
  motifs: string[];
  turning_points: string[];
  high_points: string[];
  low_points: string[];
  future_script: string[];
  psychological_insights: string[];
  strengths: string[];
  growth_edges: string[];
  action_items: string[];
};

export default function SummaryPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useLanguage();     // 🔥 引用語系

  const [summary, setSummary] = useState<Summary | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadSummary() {
    try {
      setLoading(true);
      const res = await fetch(`/api/session/${id}/summary`);
      const data = await res.json();

      if (data.error) {
        setErrorMsg(data.error);
        setSummary(null);
      } else {
        setSummary(data.summary);
        setTitle(data.session_title ?? t.summaryPage.title);
      }
    } catch {
      setErrorMsg("Failed to load summary.");
    } finally {
      setLoading(false);
    }
  }

  async function regenerateSummary() {
    setRefreshLoading(true);

    try {
      const res = await fetch(`/api/session/${id}/summary`, { method: "POST" });
      const data = await res.json();

      if (data.summary) {
        setSummary(data.summary);
        setErrorMsg("");
      } else {
        setErrorMsg("AI did not return a summary.");
      }
    } catch {
      setErrorMsg("Failed to regenerate summary.");
    } finally {
      setRefreshLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadSummary();
  }, [id]);

  const downloadJson = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}_summary.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-6 text-center">
        <p className="text-gray-600 mb-4">
          {errorMsg || t.summaryPage.empty}
        </p>
        <Button onClick={regenerateSummary} disabled={refreshLoading}>
          {refreshLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {t.summaryPage.generateNow}
        </Button>
      </div>
    );
  }

  // 🔥 Section 元件支援語系
  function Section({
    field,
    data,
  }: {
    field: keyof typeof t.summaryPage.sections;
    data: string[];
  }) {
    if (!data || data.length === 0) return null;
    return (
      <Card className="p-6 mb-6">
        <h3 className="text-gray-600 uppercase text-sm font-medium mb-3">
          {t.summaryPage.sections[field]}
        </h3>
        {data.map((p, i) => (
          <p key={i} className="mb-2 text-gray-900">
            {i + 1}. {p}
          </p>
        ))}
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push(`/session/${id}`)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t.summaryPage.back}
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={regenerateSummary}
              disabled={refreshLoading}
              variant="outline"
            >
              {refreshLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {t.summaryPage.regenerate}
            </Button>

            <Button className="bg-orange-500 text-white" onClick={downloadJson}>
              <Download className="w-4 h-4 mr-2" /> {t.summaryPage.downloadJson}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-light mb-6">{title}</h1>

        {summary.life_theme && (
          <Card className="p-6 mb-6">
            <h3 className="text-gray-600 uppercase text-sm font-medium mb-3">
              {t.summaryPage.sections.life_theme}
            </h3>
            <p className="text-gray-900">{summary.life_theme}</p>
          </Card>
        )}

        <Section field="motifs" data={summary.motifs} />
        <Section field="turning_points" data={summary.turning_points} />
        <Section field="high_points" data={summary.high_points} />
        <Section field="low_points" data={summary.low_points} />
        <Section field="future_script" data={summary.future_script} />
        <Section
          field="psychological_insights"
          data={summary.psychological_insights}
        />
        <Section field="strengths" data={summary.strengths} />
        <Section field="growth_edges" data={summary.growth_edges} />
        <Section field="action_items" data={summary.action_items} />
      </main>
    </div>
  );
}
