"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const PAGE_SIZE = 15;

type AnnouncementType =
  | "update" | "manuscript" | "beta" | "poll"
  | "challenge" | "prompt" | "qa" | "recommendation";

const TYPE_LABELS: Record<AnnouncementType, { label: string; emoji: string }> = {
  update:         { label: "General Update",       emoji: "📢" },
  manuscript:     { label: "Manuscript Update",    emoji: "📖" },
  beta:           { label: "Beta Reading",          emoji: "👥" },
  poll:           { label: "Poll",                  emoji: "📊" },
  challenge:      { label: "Bloom Coin Challenge",  emoji: "✿"  },
  prompt:         { label: "Writing Prompt",        emoji: "✍️" },
  qa:             { label: "Q&A Session",           emoji: "❓" },
  recommendation: { label: "Recommendation",        emoji: "🌟" },
};

const TYPE_BADGE: Record<AnnouncementType, string> = {
  update:         "border-slate-400/60 bg-slate-700/20 text-slate-700",
  manuscript:     "border-emerald-500/60 bg-emerald-950/20 text-emerald-700",
  beta:           "border-blue-500/60 bg-blue-950/20 text-blue-700",
  poll:           "border-sky-500/60 bg-sky-950/20 text-sky-700",
  challenge:      "border-amber-400/60 bg-amber-950/20 text-amber-600",
  prompt:         "border-purple-500/60 bg-purple-950/20 text-purple-700",
  qa:             "border-rose-500/60 bg-rose-950/20 text-rose-700",
  recommendation: "border-orange-500/60 bg-orange-950/20 text-orange-700",
};

const CARD_BORDER: Record<AnnouncementType, string> = {
  update:         "border-slate-500/80",
  manuscript:     "border-emerald-600/80",
  beta:           "border-blue-700/80",
  poll:           "border-sky-600/80",
  challenge:      "border-amber-400/80",
  prompt:         "border-purple-700/80",
  qa:             "border-rose-700/80",
  recommendation: "border-orange-600/80",
};

type Author = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

type FeedItem = {
  id: string;
  user_id: string;
  type: AnnouncementType;
  title: string | null;
  content: string | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  author: Author | null;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Avatar({ url, name, size = 22 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <Image src={url} alt={name} width={size} height={size}
        className="rounded-full object-cover shrink-0 border border-[rgba(120,120,120,0.3)]"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="flex items-center justify-center rounded-full bg-[rgba(120,120,120,0.15)] text-neutral-400 shrink-0 font-medium border border-[rgba(120,120,120,0.2)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

async function buildItems(
  supabase: ReturnType<typeof supabaseBrowser>,
  rows: { id: string; user_id: string; type: string | null; title: string | null; content: string | null; created_at: string }[],
  viewerId: string | null
): Promise<FeedItem[]> {
  if (rows.length === 0) return [];

  const annIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [{ data: likesData }, { data: profileData }] = await Promise.all([
    supabase.from("profile_announcement_likes").select("announcement_id, user_id").in("announcement_id", annIds),
    supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", userIds),
  ]);

  const likes = (likesData as { announcement_id: string; user_id: string }[] | null) ?? [];
  const profileMap = new Map(((profileData as Author[] | null) ?? []).map((p) => [p.user_id, p]));

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    type: (r.type as AnnouncementType) || "update",
    title: r.title,
    content: r.content,
    created_at: r.created_at,
    like_count: likes.filter((l) => l.announcement_id === r.id).length,
    user_liked: viewerId ? likes.some((l) => l.announcement_id === r.id && l.user_id === viewerId) : false,
    author: profileMap.get(r.user_id) ?? null,
  }));
}

export default function CommunityFeed({ viewerId, audience = "adult" }: { viewerId: string | null; audience?: "adult" | "youth" }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const allowedUserIdsRef = useRef<string[] | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setItems([]);
      cursorRef.current = null;

      const idsRes = await fetch(`/api/audience-user-ids?audience=${audience}`);
      const allowedIds: string[] = idsRes.ok ? await idsRes.json() as string[] : [];
      allowedUserIdsRef.current = allowedIds;

      if (allowedIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase
        .from("profile_announcements")
        .select("id, user_id, type, title, content, created_at")
        .in("user_id", allowedIds)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const rows = (data as { id: string; user_id: string; type: string | null; title: string | null; content: string | null; created_at: string }[] | null) ?? [];
      const built = await buildItems(supabase, rows, viewerId);
      setItems(built);
      hasMoreRef.current = rows.length === PAGE_SIZE;
      setHasMore(rows.length === PAGE_SIZE);
      cursorRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
      setLoading(false);
    })();
  }, [supabase, viewerId, audience]);

  // IntersectionObserver uses refs for loadingMore/hasMore so it never needs
  // to be rebuilt when those values change — no cascade re-triggering.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMoreRef.current || !hasMoreRef.current || !cursorRef.current) return;
        const allowedIds = allowedUserIdsRef.current;
        if (!allowedIds || allowedIds.length === 0) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);

        const { data } = await supabase
          .from("profile_announcements")
          .select("id, user_id, type, title, content, created_at")
          .in("user_id", allowedIds)
          .order("created_at", { ascending: false })
          .lt("created_at", cursorRef.current!)
          .limit(PAGE_SIZE);

        const rows = (data as { id: string; user_id: string; type: string | null; title: string | null; content: string | null; created_at: string }[] | null) ?? [];
        const built = await buildItems(supabase, rows, viewerId);
        setItems((prev) => [...prev, ...built]);
        hasMoreRef.current = rows.length === PAGE_SIZE;
        setHasMore(rows.length === PAGE_SIZE);
        cursorRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [supabase, viewerId]);

  // Realtime: new announcement → prepend
  useEffect(() => {
    const channel = supabase
      .channel(`community-feed-realtime-${audience}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profile_announcements" }, async (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as { id: string; user_id: string; type: string | null; title: string | null; content: string | null; created_at: string };
        if (allowedUserIdsRef.current && !allowedUserIdsRef.current.includes(row.user_id)) return;
        const { data: prof } = await supabase
          .from("public_profiles").select("user_id, username, pen_name, avatar_url")
          .eq("user_id", row.user_id).maybeSingle();
        setItems((prev) => [{
          id: row.id, user_id: row.user_id,
          type: (row.type as AnnouncementType) || "update",
          title: row.title, content: row.content,
          created_at: row.created_at,
          like_count: 0, user_liked: false,
          author: (prof as Author | null),
        }, ...prev]);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleLike(id: string) {
    if (!viewerId) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.user_liked) {
      await supabase.from("profile_announcement_likes").delete().eq("announcement_id", id).eq("user_id", viewerId);
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, user_liked: false, like_count: i.like_count - 1 } : i));
    } else {
      await supabase.from("profile_announcement_likes").insert({ announcement_id: id, user_id: viewerId });
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, user_liked: true, like_count: i.like_count + 1 } : i));
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="h-16 rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)] px-4 py-8 text-center">
        <p className="text-xs text-neutral-600">No announcements yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((item) => {
          const displayName = item.author?.pen_name ?? item.author?.username ?? "Member";
          const username = item.author?.username;
          const cat = TYPE_LABELS[item.type] ?? TYPE_LABELS.update;
          const badgeClass = TYPE_BADGE[item.type] ?? TYPE_BADGE.update;
          const _borderClass = CARD_BORDER[item.type] ?? CARD_BORDER.update;
          const preview = item.content ? (item.content.length > 100 ? item.content.slice(0, 100).trimEnd() + "…" : item.content) : null;

          return (
            <div key={item.id} className="rounded-lg border border-black bg-white px-2.5 py-2">
              {/* Author + badge + timestamp on one line */}
              <div className="flex items-center gap-2 min-w-0">
                {username ? (
                  <Link href={`/u/${username}`} className="shrink-0">
                    <Avatar url={item.author?.avatar_url ?? null} name={displayName} size={18} />
                  </Link>
                ) : (
                  <Avatar url={item.author?.avatar_url ?? null} name={displayName} size={18} />
                )}
                {username ? (
                  <Link href={`/u/${username}`} className="text-[11px] font-medium text-neutral-700 hover:text-neutral-900 transition truncate shrink-0">
                    {displayName}
                  </Link>
                ) : (
                  <span className="text-[11px] font-medium text-neutral-700 truncate shrink-0">{displayName}</span>
                )}
                <span className={`shrink-0 inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                  {cat.emoji} {cat.label}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-neutral-400">{timeAgo(item.created_at)}</span>
              </div>

              {/* Title + preview */}
              {(item.title || preview) && (
                <div className="mt-1 pl-[26px]">
                  {item.title && <p className="text-[11px] font-semibold text-neutral-800 leading-snug">{item.title}</p>}
                  {preview && <p className="text-[11px] text-neutral-500 leading-snug truncate">{preview}</p>}
                </div>
              )}

              {/* Like */}
              <div className="mt-1 pl-[22px] flex items-center">
                <button onClick={() => void toggleLike(item.id)} disabled={!viewerId}
                  title={viewerId ? (item.user_liked ? "Unlike" : "Like") : "Sign in to like"}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                    item.user_liked ? "text-rose-500 hover:text-rose-600" : "text-neutral-400 hover:text-neutral-600 disabled:cursor-default"
                  }`}>
                  {item.user_liked ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#f87171" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  )}
                  <span>{item.like_count > 0 ? item.like_count : "Like"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} className="py-2 text-center">
        {loadingMore && <span className="text-[11px] text-neutral-600">Loading more…</span>}
        {!hasMore && items.length > 0 && <span className="text-[11px] text-neutral-700">All caught up</span>}
      </div>
    </>
  );
}
