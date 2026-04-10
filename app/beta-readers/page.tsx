"use client";

/* eslint-disable react-hooks/set-state-in-effect */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { useDeactivationGuard } from "@/lib/useDeactivationGuard";
import { GENRE_OPTIONS } from "@/lib/profileOptions";

type ReaderProfile = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  beta_reader_level: "bloom" | "forge" | "lethal";
  reads_genres: string[];
  feedback_areas: string | null;
  feedback_strengths: string | null;
};

type ManuscriptForInvite = {
  id: string;
  title: string;
  totalSlots: number;
  activeGrantCount: number;
  readerAlreadyHasAccess: boolean;
  pendingInvitation: boolean;
};

const LEVELS = [
  { value: "", label: "All levels" },
  { value: "bloom", label: "Bloom" },
  { value: "forge", label: "Forge" },
  { value: "lethal", label: "Lethal" },
];

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  bloom: "Encouraging, supportive feedback — great for early drafts.",
  forge: "Balanced critique — detailed notes with constructive honesty.",
  lethal: "Direct, editorial-level feedback — no-holds-barred analysis.",
};


function levelColor(level: string) {
  if (level === "bloom") return "border-[rgba(59,130,246,0.6)] bg-[rgba(59,130,246,0.12)] text-[#60a5fa]";
  if (level === "forge") return "border-[rgba(202,160,0,0.6)] bg-[rgba(202,160,0,0.12)] text-[#f5c518]";
  if (level === "lethal") return "border-[rgba(220,38,38,0.6)] bg-[rgba(220,38,38,0.12)] text-[#f87171]";
  return "border-neutral-700 bg-neutral-900/40 text-neutral-400";
}

function BetaReadersPageInner() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  useDeactivationGuard(supabase);
  const searchParams = useSearchParams();

  const initLevel = searchParams.get("level") ?? "";
  const initGenres = searchParams.get("genres") ?? "";

  const [profiles, setProfiles] = useState<ReaderProfile[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [_isYouth, setIsYouth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState(initLevel);
  const [genreFilter, setGenreFilter] = useState(initGenres);
  const [searchQuery, setSearchQuery] = useState("");

  // Invite modal state
  const [visibleCount, setVisibleCount] = useState(15);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [inviteTarget, setInviteTarget] = useState<ReaderProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myManuscripts, setMyManuscripts] = useState<ManuscriptForInvite[]>([]);
  const [loadingManuscripts, setLoadingManuscripts] = useState(false);
  const [invitingSentTo, setInvitingSentTo] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const sortedGenreOptions = useMemo(
    () => ["", ...([...GENRE_OPTIONS].sort((a, b) => a.localeCompare(b)))],
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id ?? null;
    setCurrentUserId(uid);

    const [profilesRes, ownerRes] = await Promise.all([
      fetch("/api/beta-reader-profiles"),
      fetch("/api/owner-profiles"),
    ]);

    if (!profilesRes.ok) {
      setMsg("Failed to load beta readers.");
      setLoading(false);
      return;
    }

    const { profiles, isYouth: viewerIsYouth } = await profilesRes.json() as {
      profiles: ReaderProfile[];
      isYouth: boolean;
    };

    setProfiles(profiles);
    setIsYouth(viewerIsYouth);

    if (ownerRes.ok) {
      const { ids } = await ownerRes.json() as { ids: string[] };
      setAdminUserIds(new Set(ids));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openInviteModal(reader: ReaderProfile) {
    setInviteTarget(reader);
    setInviteMsg(null);
    setMyManuscripts([]);
    setLoadingManuscripts(true);

    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id ?? null;
    if (!uid) {
      setInviteMsg("You must be signed in to invite readers.");
      setLoadingManuscripts(false);
      return;
    }
    setCurrentUserId(uid);

    const { data: mData } = await supabase
      .from("manuscripts")
      .select("id, title")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false });
    const manuscripts = (mData as Array<{ id: string; title: string }> | null) ?? [];

    if (manuscripts.length === 0) {
      setMyManuscripts([]);
      setLoadingManuscripts(false);
      return;
    }

    const manuscriptIds = manuscripts.map((m) => m.id);

    const [slotRes, grantRes, inviteRes] = await Promise.all([
      supabase
        .from("bloom_coin_ledger")
        .select("metadata")
        .eq("user_id", uid)
        .eq("reason", "extra_reader_slot"),
      supabase
        .from("manuscript_access_grants")
        .select("manuscript_id, reader_id")
        .in("manuscript_id", manuscriptIds),
      supabase
        .from("manuscript_invitations")
        .select("manuscript_id, status")
        .in("manuscript_id", manuscriptIds)
        .eq("reader_id", reader.user_id)
        .eq("status", "pending"),
    ]);

    const extraSlotsByManuscript: Record<string, number> = {};
    ((slotRes.data as Array<{ metadata: Record<string, string> }> | null) ?? []).forEach((row) => {
      const mid = row.metadata?.manuscript_id;
      if (mid) extraSlotsByManuscript[mid] = (extraSlotsByManuscript[mid] ?? 0) + 1;
    });

    const grantsByManuscript: Record<string, string[]> = {};
    ((grantRes.data as Array<{ manuscript_id: string; reader_id: string }> | null) ?? []).forEach((row) => {
      if (!grantsByManuscript[row.manuscript_id]) grantsByManuscript[row.manuscript_id] = [];
      grantsByManuscript[row.manuscript_id].push(row.reader_id);
    });

    const pendingInviteSet = new Set(
      ((inviteRes.data as Array<{ manuscript_id: string }> | null) ?? []).map((r) => r.manuscript_id)
    );

    setMyManuscripts(
      manuscripts.map((m) => ({
        id: m.id,
        title: m.title,
        totalSlots: 3 + (extraSlotsByManuscript[m.id] ?? 0),
        activeGrantCount: (grantsByManuscript[m.id] ?? []).length,
        readerAlreadyHasAccess: (grantsByManuscript[m.id] ?? []).includes(reader.user_id),
        pendingInvitation: pendingInviteSet.has(m.id),
      })),
    );
    setLoadingManuscripts(false);
  }

  async function sendInvite(manuscript: ManuscriptForInvite) {
    if (!inviteTarget || !currentUserId) return;
    setInvitingSentTo(manuscript.id);
    setInviteMsg(null);

    const { error } = await supabase
      .from("manuscript_invitations")
      .insert({ manuscript_id: manuscript.id, reader_id: inviteTarget.user_id, invited_by: currentUserId });

    if (error && error.code !== "23505") {
      setInviteMsg(error.message);
      setInvitingSentTo(null);
      return;
    }

    const readerLabel = inviteTarget.pen_name || (inviteTarget.username ? `@${inviteTarget.username}` : "Reader");

    setMyManuscripts((prev) =>
      prev.map((m) =>
        m.id === manuscript.id ? { ...m, pendingInvitation: true } : m,
      ),
    );
    setInvitingSentTo(null);
    setInviteMsg(`Invitation sent to ${readerLabel} for "${manuscript.title}". Awaiting their response.`);
  }

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(15);
  }, [levelFilter, genreFilter, searchQuery]);

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

  const visible = profiles.filter((p) => {
    if (levelFilter && p.beta_reader_level !== levelFilter) return false;
    if (genreFilter && !(p.reads_genres ?? []).includes(genreFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesUsername = (p.username ?? "").toLowerCase().includes(q);
      const matchesPenName = (p.pen_name ?? "").toLowerCase().includes(q);
      if (!matchesUsername && !matchesPenName) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Find Beta Readers</h1>
            <p className="mt-2 text-sm text-neutral-300">
              Browse readers available to beta read your manuscript. Filter by feedback level and genre.
            </p>
          </div>
          <Link
            href="/manuscripts"
            className="inline-flex h-9 items-center rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-4 text-sm text-neutral-300 hover:border-[rgba(120,120,120,0.5)] hover:text-neutral-100 transition"
          >
            Back to manuscripts
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or pen name…"
            className="h-9 min-w-[220px] rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          />

          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setLevelFilter(l.value)}
                className={`inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition ${
                  levelFilter === l.value
                    ? "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] text-white"
                    : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:border-[rgba(120,120,120,0.5)] hover:text-neutral-100"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="h-9 rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 text-sm text-neutral-200 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          >
            <option value="">All genres</option>
            {sortedGenreOptions.filter(Boolean).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Level description */}
        {levelFilter && LEVEL_DESCRIPTIONS[levelFilter] && (
          <p className="mt-4 text-xs text-neutral-400 italic">{LEVEL_DESCRIPTIONS[levelFilter]}</p>
        )}

        {msg && (
          <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4 text-sm text-neutral-200">{msg}</div>
        )}

        {/* Results */}
        <section className="mt-8">
          {loading ? (
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6 text-sm text-neutral-300">Loading...</div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6 text-sm text-neutral-300">
              No beta readers found matching those filters.
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs text-neutral-500">{visible.length} reader{visible.length !== 1 ? "s" : ""} found</p>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.slice(0, visibleCount).map((p) => (
                  <li
                    key={p.user_id}
                    className="section-card beta-reader-card rounded-2xl border border-[rgba(120,120,120,0.45)] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.3)] flex flex-col gap-3"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      {p.avatar_url ? (
                        <Image
                          src={p.avatar_url}
                          alt={p.pen_name || p.username || "Reader"}
                          width={44}
                          height={44}
                         
                          className="h-11 w-11 rounded-full border border-[rgba(120,120,120,0.4)] object-cover shrink-0"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 text-sm font-semibold text-[rgba(210,210,210,0.8)]">
                          {(p.pen_name || p.username || "R")[0].toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-100">
                          {p.pen_name || (p.username ? `@${p.username}` : "Reader")}
                        </p>
                        {p.username && (
                          <p className="text-xs text-neutral-500">@{p.username}</p>
                        )}
                      </div>
                      <span className={`ml-auto shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${levelColor(p.beta_reader_level)}`}>
                        {p.beta_reader_level}
                      </span>
                    </div>

                    {/* Bio */}
                    {p.bio && (
                      <p className="text-xs leading-relaxed text-neutral-300 line-clamp-3">{p.bio}</p>
                    )}

                    {/* Reads genres */}
                    {(p.reads_genres ?? []).length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Reads</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.reads_genres.slice(0, 6).map((g) => (
                            <span
                              key={g}
                              className={`rounded-lg border px-2 py-0.5 text-[11px] ${
                                genreFilter === g
                                  ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.18)] text-[rgba(210,210,210,0.9)]"
                                  : "border-neutral-800 bg-neutral-900/40 text-neutral-400"
                              }`}
                            >
                              {g}
                            </span>
                          ))}
                          {p.reads_genres.length > 6 && (
                            <span className="text-[11px] text-neutral-500">+{p.reads_genres.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Feedback style from level */}
                    {LEVEL_DESCRIPTIONS[p.beta_reader_level] && (
                      <p className="text-xs text-neutral-400">
                        Style: <span className="text-neutral-200">{LEVEL_DESCRIPTIONS[p.beta_reader_level]}</span>
                      </p>
                    )}
                    {p.feedback_strengths && (
                      <p className="text-xs text-neutral-400 line-clamp-2">Strengths: <span className="text-neutral-300">{p.feedback_strengths}</span></p>
                    )}

                    {/* Actions */}
                    <div className="mt-auto flex flex-col gap-1.5">
                      {p.user_id === currentUserId ? (
                        <Link
                          href="/profile"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.6)] bg-[rgba(120,120,120,0.12)] px-3 text-xs font-medium text-white hover:bg-[rgba(120,120,120,0.22)] transition"
                        >
                          View profile
                        </Link>
                      ) : p.username ? (
                        <Link
                          href={`/u/${p.username}`}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.6)] bg-[rgba(120,120,120,0.12)] px-3 text-xs font-medium text-white hover:bg-[rgba(120,120,120,0.22)] transition"
                        >
                          View profile
                        </Link>
                      ) : null}
                      {p.user_id !== currentUserId && (
                        <button
                          onClick={() => void openInviteModal(p)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-xs font-medium text-neutral-200 hover:border-[rgba(120,120,120,0.5)] hover:text-white transition"
                        >
                          Invite to Project
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Sentinel for infinite scroll */}
        {!loading && visible.length > visibleCount && (
          <div ref={sentinelRef} className="py-6 text-center">
            <span className="text-xs text-neutral-600">Loading more…</span>
          </div>
        )}
        {!loading && visible.length > 0 && visible.length <= visibleCount && (
          <p className="mt-4 text-center text-xs text-neutral-700">All readers shown</p>
        )}
      </div>

      {/* Invite modal */}
      {inviteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setInviteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.4)] bg-[rgba(18,18,18,0.98)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-100">Invite to Project</h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Select a manuscript to invite{" "}
                  <span className="text-[rgba(210,210,210,0.9)]">
                    {inviteTarget.pen_name || (inviteTarget.username ? `@${inviteTarget.username}` : "this reader")}
                  </span>{" "}
                  to beta read.
                </p>
              </div>
              <button
                onClick={() => setInviteTarget(null)}
                className="shrink-0 rounded-lg p-1 text-neutral-500 hover:text-neutral-200 transition"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Feedback message */}
            {inviteMsg && (
              <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${inviteMsg.startsWith("Invitation sent") ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300" : "border-red-700/50 bg-red-950/40 text-red-300"}`}>
                {inviteMsg}
              </div>
            )}

            {/* Manuscript list */}
            <div className="mt-5">
              {loadingManuscripts ? (
                <p className="text-sm text-neutral-400">Loading your projects…</p>
              ) : myManuscripts.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  You don&apos;t have any manuscripts yet.{" "}
                  <Link href="/manuscripts/new" className="text-[rgba(210,210,210,0.8)] hover:underline">Create one →</Link>
                </p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {myManuscripts.map((m) => {
                    const slotsAvailable = m.totalSlots - m.activeGrantCount;
                    const full = slotsAvailable <= 0;
                    return (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-100">{m.title}</p>
                          <p className={`mt-0.5 text-[11px] ${full ? "text-amber-400/80" : "text-neutral-500"}`}>
                            {m.activeGrantCount}/{m.totalSlots} slots filled
                            {!full && <span className="ml-1 text-emerald-400/70">· {slotsAvailable} available</span>}
                          </p>
                        </div>
                        {m.readerAlreadyHasAccess ? (
                          <span className="shrink-0 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                            Access granted
                          </span>
                        ) : m.pendingInvitation ? (
                          <span className="shrink-0 rounded-lg border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                            Invitation pending
                          </span>
                        ) : full ? (
                          <span className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 text-[11px] text-neutral-500">
                            Slots full
                          </span>
                        ) : (
                          <button
                            onClick={() => void sendInvite(m)}
                            disabled={invitingSentTo === m.id}
                            className="shrink-0 inline-flex h-8 items-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.18)] px-3 text-xs font-medium text-white hover:bg-[rgba(120,120,120,0.28)] disabled:opacity-50 transition"
                          >
                            {invitingSentTo === m.id ? "Sending…" : "Send Invitation"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <button
              onClick={() => setInviteTarget(null)}
              className="mt-5 w-full rounded-lg border border-neutral-700 bg-neutral-900/60 py-2 text-sm text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function BetaReadersPage() {
  return <Suspense><BetaReadersPageInner /></Suspense>;
}
