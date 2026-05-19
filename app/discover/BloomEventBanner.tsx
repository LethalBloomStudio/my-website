"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { ALL_MANUSCRIPT_CATEGORIES, YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";

type BloomEvent = {
  id: string;
  title: string;
  categories: string[];
  start_date: string;
  end_date: string;
  coin_reward: number;
  status: "active" | "inactive";
  created_at: string;
};

type Props = {
  isYouth: boolean;
};

export default function BloomEventBanner({ isYouth }: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [activeEvent, setActiveEvent] = useState<BloomEvent | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [durationWeeks, setDurationWeeks] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const categoryOptions = useMemo(
    () =>
      [...(isYouth ? YOUTH_ALLOWED_CATEGORIES : ALL_MANUSCRIPT_CATEGORIES)].sort((a, b) =>
        a.localeCompare(b),
      ),
    [isYouth],
  );

  useEffect(() => {
    async function fetchActiveEvent() {
      const today = new Date().toISOString().split("T")[0]!;
      const { data } = await supabase
        .from("bloom_events")
        .select("*")
        .eq("status", "active")
        .gte("end_date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveEvent(data as BloomEvent | null);
      setLoadingEvent(false);
    }
    void fetchActiveEvent();
  }, [supabase]);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [categoryMenuOpen]);

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= 3) return prev;
      return [...prev, cat];
    });
  }

  async function publishEvent() {
    if (!title.trim() || selectedCategories.length === 0) return;
    setSaving(true);
    setMsg(null);

    // Compute dates — end_date must be exactly 1/2/3/4 weeks from start_date
    const now = new Date();
    const startStr = now.toISOString().split("T")[0]!;
    const end = new Date(now);
    end.setDate(end.getDate() + durationWeeks * 7);
    const endStr = end.toISOString().split("T")[0]!;

    // Deactivate any existing active event first
    await supabase.from("bloom_events").update({ status: "inactive" }).eq("status", "active");

    const { data, error } = await supabase
      .from("bloom_events")
      .insert({
        title: title.trim(),
        categories: selectedCategories,
        start_date: startStr,
        end_date: endStr,
        coin_reward: 10,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      setMsg(error.message);
    } else {
      setActiveEvent(data as BloomEvent);
      setTitle("");
      setSelectedCategories([]);
      setDurationWeeks(1);
      setMsg("Bloom Event published.");
    }
    setSaving(false);
  }

  async function deactivateEvent() {
    if (!activeEvent) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("bloom_events")
      .update({ status: "inactive" })
      .eq("id", activeEvent.id);
    if (error) {
      setMsg(error.message);
    } else {
      setActiveEvent(null);
      setMsg("Bloom Event deactivated.");
    }
    setSaving(false);
  }

  if (loadingEvent) return null;

  return (
    <div className="mt-6 space-y-1">
      {/* Active event display banner */}
      {activeEvent && (
        <div className="overflow-hidden rounded-xl border border-amber-700/40 bg-amber-950/40 px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-base" style={{ color: "#f59e0b" }}>✿</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-200">{activeEvent.title}</p>
              {activeEvent.categories.length > 0 && (
                <p className="mt-0.5 text-xs text-amber-400/80">
                  {activeEvent.categories.join(" · ")}
                  {" · "}
                  Ends {new Date(activeEvent.end_date).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin panel */}
      <div className="rounded-xl border border-[rgba(120,120,120,0.24)] bg-[rgba(18,18,18,0.92)] px-3 py-2.5">
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Admin · Bloom Event
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Set a time-limited event with up to 3 categories. Only one event can be active at a time.
          </p>
        </div>

        {/* Current active event summary + deactivate */}
        {activeEvent && (
          <div className="mb-3 rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2">
            <p className="text-xs font-medium text-amber-300">
              Active:{" "}
              <span className="font-normal text-amber-100">{activeEvent.title}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {activeEvent.categories.join(", ") || "—"} · Ends{" "}
              {new Date(activeEvent.end_date).toLocaleDateString()}
            </p>
            <button
              onClick={() => void deactivateEvent()}
              disabled={saving}
              className="mt-2 rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-300 transition hover:text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Deactivate Event"}
            </button>
          </div>
        )}

        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title…"
          className="w-full rounded-lg border border-[rgba(120,120,120,0.32)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
        />

        {/* Category multi-select */}
        <div className="relative mt-3" ref={categoryMenuRef}>
          <p className="mb-1.5 text-[11px] text-neutral-400">
            Categories{" "}
            <span className={selectedCategories.length >= 3 ? "text-amber-400" : "text-neutral-600"}>
              ({selectedCategories.length}/3)
            </span>
          </p>
          <button
            type="button"
            onClick={() => setCategoryMenuOpen((o) => !o)}
            className="w-full rounded-lg border border-[rgba(120,120,120,0.32)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-left text-sm focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          >
            <span className={selectedCategories.length > 0 ? "text-neutral-100" : "text-neutral-500"}>
              {selectedCategories.length > 0 ? selectedCategories.join(" · ") : "Select categories…"}
            </span>
          </button>
          {categoryMenuOpen && (
            <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[rgba(120,120,120,0.32)] bg-neutral-900 py-1 shadow-xl">
              {categoryOptions.map((cat) => {
                const selected = selectedCategories.includes(cat);
                const atMax = !selected && selectedCategories.length >= 3;
                return (
                  <li key={cat}>
                    <button
                      type="button"
                      onClick={() => { if (!atMax) toggleCategory(cat); }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-sm transition ${
                        selected
                          ? "bg-amber-950/30 text-amber-200"
                          : atMax
                          ? "cursor-not-allowed text-neutral-600"
                          : "text-neutral-300 hover:bg-[rgba(120,120,120,0.12)] hover:text-neutral-100"
                      }`}
                    >
                      <span>{cat}</span>
                      {selected && <span className="text-xs text-amber-400">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Duration */}
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] text-neutral-400">Duration</p>
          <div className="flex gap-2">
            {([1, 2, 3, 4] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setDurationWeeks(w)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  durationWeeks === w
                    ? "border-amber-600/70 bg-amber-950/40 text-amber-200"
                    : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>

        {/* Publish */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void publishEvent()}
            disabled={saving || !title.trim() || selectedCategories.length === 0}
            className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-900/40 disabled:opacity-40"
          >
            {saving ? "Saving…" : activeEvent ? "Replace & Publish" : "Publish Event"}
          </button>
        </div>

        {msg && <p className="mt-2 text-[11px] text-neutral-400">{msg}</p>}
      </div>
    </div>
  );
}
