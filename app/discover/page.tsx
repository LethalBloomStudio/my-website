"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { useDeactivationGuard } from "@/lib/useDeactivationGuard";
import { genreOptionsForAgeCategory } from "@/lib/profileOptions";
import { YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";
import FeaturedCarousel from "./FeaturedCarousel";

type Manuscript = {
  id: string;
  owner_id: string;
  title: string;
  genre: string | null;
  categories: string[] | null;
  word_count: number;
  requested_feedback: string | null;
  age_rating: string;
  created_at: string;
  cover_url?: string | null;
  description?: string | null;
  stage?: "alpha" | "beta" | null;
};

type Profile = {
  user_id: string;
  pen_name: string | null;
  username: string | null;
  writer_level: "bloom" | "forge" | "lethal" | null;
  beta_reader_level: "bloom" | "forge" | "lethal" | null;
  feedback_preference: string | null;
};

function formatLevel(value: string | null | undefined) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeFeedbackLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "bloom" || v === "forge" || v === "lethal") return v;
  if (v === "gentle") return "bloom";
  if (v === "balanced") return "forge";
  if (v === "direct") return "lethal";
  return null;
}

function formatRequestedFeedback(value: string | null | undefined) {
  const level = normalizeFeedbackLevel(value);
  if (!level) return "-";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export default function DiscoverPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  useDeactivationGuard(supabase);
  const [items, setItems] = useState<Manuscript[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [writerLevelFilter, setWriterLevelFilter] = useState("");
  const [feedbackFilter, setFeedbackFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [isYouth, setIsYouth] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chapterCountChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sortedCategoryOptions = useMemo(
    () => [...genreOptionsForAgeCategory(isYouth ? "youth_13_17" : null)].sort((a, b) => a.localeCompare(b)),
    [isYouth],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const res = await fetch("/api/discover-manuscripts");
      if (!res.ok) {
        setMsg("Failed to load manuscripts.");
        setLoading(false);
        return;
      }

      const { manuscripts, isYouth: viewerIsYouth } = await res.json() as {
        manuscripts: Manuscript[];
        isYouth: boolean;
      };

      setIsYouth(viewerIsYouth);
      setItems(manuscripts);

      const manuscriptIds = manuscripts.map((r) => r.id);

      if (manuscriptIds.length > 0) {
        const [chapterRes, profileRes] = await Promise.all([
          supabase
            .from("manuscript_chapters")
            .select("manuscript_id")
            .in("manuscript_id", manuscriptIds)
            .eq("is_private", false)
            .eq("chapter_type", "chapter"),
          supabase
            .from("public_profiles")
            .select("user_id, pen_name, username, writer_level, beta_reader_level, feedback_preference")
            .in("user_id", Array.from(new Set(manuscripts.map((r) => r.owner_id)))),
        ]);

        const counts: Record<string, number> = {};
        ((chapterRes.data as Array<{ manuscript_id: string }> | null) ?? []).forEach((r) => {
          counts[r.manuscript_id] = (counts[r.manuscript_id] ?? 0) + 1;
        });
        setChapterCounts(counts);

        const map: Record<string, Profile> = {};
        ((profileRes.data as Profile[]) ?? []).forEach((p) => {
          map[p.user_id] = p;
        });
        setProfiles(map);
      } else {
        setChapterCounts({});
        setProfiles({});
      }

      setLoading(false);
    })();
  }, [supabase]);

  // Real-time: update chapter counter when manuscripts.chapter_count changes
  useEffect(() => {
    if (items.length === 0) return;
    if (chapterCountChannelRef.current) {
      void supabase.removeChannel(chapterCountChannelRef.current);
    }
    const tracked = new Set(items.map((m) => m.id));
    chapterCountChannelRef.current = supabase
      .channel("discover-manuscript-chapter-counts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "manuscripts" },
        (payload) => {
          const updated = payload.new as { id: string; chapter_count?: number };
          if (updated.chapter_count != null && tracked.has(updated.id)) {
            setChapterCounts((prev) => ({ ...prev, [updated.id]: updated.chapter_count! }));
          }
        }
      )
      .subscribe();
    return () => {
      if (chapterCountChannelRef.current) {
        void supabase.removeChannel(chapterCountChannelRef.current);
        chapterCountChannelRef.current = null;
      }
    };
  }, [items, supabase]);

  // Reset visible count whenever filters change
  useEffect(() => {
    // This intentionally resets the visible window when filters change
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(15);
  }, [query, categoryFilter, writerLevelFilter, feedbackFilter]);

  // Load more when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((n) => n + 15); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const normalized = query.trim().toLowerCase();
  const filtered = items.filter((m) => {
    const profile = profiles[m.owner_id];
    const writerName = profile?.pen_name || (profile?.username ? `@${profile.username}` : "Writer");

    const categories = (m.categories && m.categories.length > 0 ? m.categories : m.genre ? [m.genre] : []) as string[];
    if (isYouth && !categories.some((c) => YOUTH_ALLOWED_CATEGORIES.includes(c))) return false;
    if (categoryFilter && !categories.includes(categoryFilter)) return false;
    if (writerLevelFilter && profile?.writer_level !== writerLevelFilter) return false;
    const resolvedFeedback = normalizeFeedbackLevel(profile?.feedback_preference) ?? normalizeFeedbackLevel(m.requested_feedback);
    if (feedbackFilter && resolvedFeedback !== feedbackFilter) return false;
    if (!normalized) return true;

    return (
      m.title.toLowerCase().includes(normalized) ||
      categories.join(" ").toLowerCase().includes(normalized) ||
      writerName.toLowerCase().includes(normalized)
    );
  }).sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return bTime - aTime;
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
        <p className="mt-2 text-neutral-300">Search books by category and writer level.</p>

        <FeaturedCarousel />

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <label className="md:col-span-2 flex flex-col gap-1">
            <span className="sr-only">Search by title or author</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title/author..."
              aria-label="Search by title or author"
              className="h-11 rounded-lg border border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.14)] px-4 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sr-only">Filter by category</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="h-11 rounded-lg px-3 text-sm">
              <option value="">All categories</option>
              {sortedCategoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sr-only">Filter by writer level</span>
            <select value={writerLevelFilter} onChange={(e) => setWriterLevelFilter(e.target.value)} aria-label="Filter by writer level" className="h-11 rounded-lg px-3 text-sm">
              <option value="">Writer lvl</option>
              <option value="bloom">Bloom</option>
              <option value="forge">Forge</option>
              <option value="lethal">Lethal</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sr-only">Filter by desired feedback type</span>
            <select value={feedbackFilter} onChange={(e) => setFeedbackFilter(e.target.value)} aria-label="Filter by desired feedback type" className="h-11 rounded-lg px-3 text-sm">
              <option value="">Desired feedback</option>
              <option value="bloom">Bloom</option>
              <option value="forge">Forge</option>
              <option value="lethal">Lethal</option>
            </select>
          </label>
        </div>

        {msg ? (
          <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-4 text-sm text-white">
            {msg}
          </div>
        ) : null}

        <section className="mt-8 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
          {loading ? (
            <p className="text-sm text-neutral-300">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-neutral-300">No manuscripts match your filters.</p>
          ) : (
            <ul className="space-y-3">
              {filtered.slice(0, visibleCount).map((m) => {
                const profile = profiles[m.owner_id];
                const writerName = profile?.pen_name || (profile?.username ? `@${profile.username}` : "Writer");
                const categories = (m.categories && m.categories.length > 0 ? m.categories : m.genre ? [m.genre] : []) as string[];
                return (
                  <li key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
                    <div className="grid gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
                      <div className="flex gap-3 rounded-lg border border-neutral-800 bg-neutral-950/35 p-3">
                        {m.cover_url ? (
                          <Image
                            src={m.cover_url}
                            alt={`${m.title} cover`}
                            width={80}
                            height={112}
                           
                            className="h-28 w-20 rounded-lg border border-neutral-700 object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-20 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950/40 text-[10px] text-neutral-500">
                            No Cover
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <Link href={m.owner_id === userId ? `/manuscripts/${m.id}/details` : `/manuscripts/${m.id}?from=discover`} className="text-lg font-medium text-white hover:underline">
                              {m.title}
                            </Link>
                            {m.stage && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                m.stage === "alpha"
                                  ? "bg-amber-950/50 text-amber-300 border border-amber-600/40"
                                  : "bg-emerald-950/50 text-emerald-300 border border-emerald-600/40"
                              }`}>
                                {m.stage}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-neutral-300">by {writerName}</p>
                          <p className="mt-1 text-xs text-neutral-400">
                            {(categories.length > 0 ? categories.join(", ") : "Uncategorized")}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">
                            {chapterCounts[m.id] ?? 0} chapters | {m.word_count} words | {m.age_rating}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">
                            Writer: {formatLevel(profile?.writer_level)}
                          </p>
                          <p className="mt-1 text-xs text-neutral-400">
                            Desired feedback: <span className="text-neutral-200">{formatRequestedFeedback(profiles[m.owner_id]?.feedback_preference ?? m.requested_feedback)}</span>
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Uploaded: {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-neutral-800 bg-neutral-950/35 p-3">
                        <p className="text-sm text-neutral-300">
                          {m.description?.trim() ? m.description : "No description provided."}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Sentinel for infinite scroll */}
        {!loading && filtered.length > visibleCount && (
          <div ref={sentinelRef} className="py-6 text-center">
            <span role="status" className="text-xs text-neutral-600">Loading more…</span>
          </div>
        )}
        {!loading && filtered.length > 0 && filtered.length <= visibleCount && (
          <p className="mt-4 text-center text-xs text-neutral-400">All manuscripts shown</p>
        )}
      </div>
    </main>
  );
}
