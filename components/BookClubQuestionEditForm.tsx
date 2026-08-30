"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Preset = { id: string; prompt: string; category: string | null };

// Single-week counterpart to BookClubQuestionnaireEditor's per-week UI --
// reached from a week's dropdown Edit link instead of embedded inline, and
// navigates back to the cycle view on save instead of toggling a local
// read-only state.
export default function BookClubQuestionEditForm({
  cycleId,
  weekNumber,
  initialSource,
  initialPrompt,
  initialPresetId,
}: {
  cycleId: string;
  weekNumber: number;
  initialSource: "custom" | "preset";
  initialPrompt: string;
  initialPresetId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [mode, setMode] = useState<"custom" | "preset">(initialSource);
  const [text, setText] = useState(initialSource === "custom" ? initialPrompt : "");
  const [presetId, setPresetId] = useState(initialPresetId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("book_club_question_presets").select("id, prompt, category").order("category");
      if (!cancelled) setPresets((data ?? []) as Preset[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/create-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id: cycleId,
          week_number: weekNumber,
          prompt: mode === "custom" ? text : undefined,
          preset_id: mode === "preset" ? presetId : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(`/book-club/cycle/${cycleId}`);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`rounded-md px-2 py-1 ${mode === "custom" ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800 text-neutral-300"}`}
        >
          Write my own
        </button>
        <button
          type="button"
          onClick={() => setMode("preset")}
          className={`rounded-md px-2 py-1 ${mode === "preset" ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800 text-neutral-300"}`}
        >
          Pick from library
        </button>
      </div>

      {mode === "custom" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="This week's discussion question..."
          className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
        />
      ) : (
        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
        >
          <option value="">Choose a question...</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.prompt}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || (mode === "custom" ? !text.trim() : !presetId)}
          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/book-club/cycle/${cycleId}`)}
          disabled={saving}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
