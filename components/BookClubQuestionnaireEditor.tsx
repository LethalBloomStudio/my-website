"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Preset = { id: string; prompt: string; category: string | null };
type ExistingQuestion = { week_number: number; prompt: string; source: "custom" | "preset"; preset_id: string | null };
type Draft = { mode: "custom" | "preset"; text: string; presetId: string };

// Matches CYCLE_LENGTH_WEEKS in the cycle engine (28-day cycle / 7-day
// weeks) -- the schema itself allows up to 5 (book_club_questionnaire_
// questions.week_number check), leaving room if that ever changes.
const CYCLE_LENGTH_WEEKS = 4;

export default function BookClubQuestionnaireEditor({
  cycleId,
  existingQuestions,
  currentWeek,
}: {
  cycleId: string;
  existingQuestions: ExistingQuestion[];
  currentWeek: number | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => {
    const initial: Record<number, Draft> = {};
    for (let w = 1; w <= CYCLE_LENGTH_WEEKS; w++) {
      const existing = existingQuestions.find((q) => q.week_number === w);
      initial[w] = existing
        ? { mode: existing.source, text: existing.source === "custom" ? existing.prompt : "", presetId: existing.preset_id ?? "" }
        : { mode: "custom", text: "", presetId: "" };
    }
    return initial;
  });
  const [savingWeek, setSavingWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedWeeks, setSavedWeeks] = useState<Set<number>>(new Set(existingQuestions.map((q) => q.week_number)));

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

  async function handleSave(week: number) {
    const draft = drafts[week];
    setSavingWeek(week);
    setError(null);
    try {
      const res = await fetch("/api/book-club/create-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id: cycleId,
          week_number: week,
          prompt: draft.mode === "custom" ? draft.text : undefined,
          preset_id: draft.mode === "preset" ? draft.presetId : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSavedWeeks((prev) => new Set(prev).add(week));
    } catch {
      setError("Something went wrong.");
    } finally {
      setSavingWeek(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="text-sm font-medium text-neutral-200">Weekly questions (only you can see future weeks)</p>
      {Array.from({ length: CYCLE_LENGTH_WEEKS }, (_, i) => i + 1).map((week) => {
        const draft = drafts[week];
        const locked = currentWeek !== null && week <= currentWeek;
        return (
          <div key={week} className="space-y-2 border-t border-neutral-800 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-400">Week {week}</p>
              {locked ? (
                <span className="text-[11px] text-neutral-500">Locked -- this week has started</span>
              ) : (
                savedWeeks.has(week) && <span className="text-[11px] text-emerald-400">Saved</span>
              )}
            </div>
            {locked ? (
              <p className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400">
                {draft.mode === "custom" ? draft.text : presets.find((p) => p.id === draft.presetId)?.prompt || draft.text || "No question set."}
              </p>
            ) : (
              <>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDrafts((d) => ({ ...d, [week]: { ...d[week], mode: "custom" } }))}
                    className={`rounded-md px-2 py-1 ${draft.mode === "custom" ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800 text-neutral-300"}`}
                  >
                    Write my own
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrafts((d) => ({ ...d, [week]: { ...d[week], mode: "preset" } }))}
                    className={`rounded-md px-2 py-1 ${draft.mode === "preset" ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800 text-neutral-300"}`}
                  >
                    Pick from library
                  </button>
                </div>
                {draft.mode === "custom" ? (
                  <textarea
                    value={draft.text}
                    onChange={(e) => setDrafts((d) => ({ ...d, [week]: { ...d[week], text: e.target.value } }))}
                    rows={2}
                    placeholder="This week's discussion question..."
                    className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
                  />
                ) : (
                  <select
                    value={draft.presetId}
                    onChange={(e) => setDrafts((d) => ({ ...d, [week]: { ...d[week], presetId: e.target.value } }))}
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
                <button
                  type="button"
                  onClick={() => handleSave(week)}
                  disabled={savingWeek === week || (draft.mode === "custom" ? !draft.text.trim() : !draft.presetId)}
                  className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
                >
                  {savingWeek === week ? "Saving..." : "Save week"}
                </button>
              </>
            )}
          </div>
        );
      })}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
