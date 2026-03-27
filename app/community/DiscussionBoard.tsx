"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

// ─── Types ───────────────────────────────────────────────────────────────────

type PostType = "discussion" | "poll" | "challenge" | "prompt" | "recommendation" | "qa" | "giveaway";

type AuthorInfo = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

type DiscussionPost = {
  id: string;
  author_id: string;
  type: PostType;
  title: string;
  content: string | null;
  poll_options: string[] | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  comment_count: number;
  user_vote: number | null;
  poll_votes: Record<number, number>;
  author: AuthorInfo | null;
  coin_prize: number | null;
  ends_at: string | null;
  winner_id: string | null;
  winner_drawn: boolean;
  winner_name: string | null;
};

type DiscussionComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  reply_to_id: string | null;
  reply_to_author_id: string | null;
  created_at: string;
  like_count: number;
  user_liked: boolean;
  author: AuthorInfo | null;
  reply_to_name: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const POST_CATEGORIES: {
  type: PostType;
  label: string;
  emoji: string;
  description: string;
  placeholder: string;
}[] = [
  { type: "discussion", label: "Discussion", emoji: "💬", description: "Start an open conversation with the community", placeholder: "Share your thoughts, questions, or ideas…" },
  { type: "poll", label: "Poll", emoji: "📊", description: "Ask the community a question with multiple choice answers", placeholder: "What would you like to ask?" },
  { type: "challenge", label: "Reading Challenge", emoji: "📚", description: "Set a reading or writing challenge for the community", placeholder: "Describe the challenge and any rules…" },
  { type: "prompt", label: "Writing Prompt", emoji: "✍️", description: "Share a creative writing prompt for writers to respond to", placeholder: "Write your prompt here…" },
  { type: "recommendation", label: "Recommendation", emoji: "📖", description: "Share a book recommendation or ask for suggestions", placeholder: "Tell us about the book or what you're looking for…" },
  { type: "qa", label: "Q&A Session", emoji: "❓", description: "Open a Q&A — let the community ask you anything", placeholder: "Set the topic or theme for this Q&A…" },
  { type: "giveaway", label: "Bloom Coin Giveaway", emoji: "🎁", description: "Award Bloom Coins to a random winner who likes + comments", placeholder: "Describe what this giveaway is for…" },
];

const TYPE_COLORS: Record<PostType, string> = {
  discussion: "border-slate-400/60 bg-slate-700/20 text-slate-700",
  poll: "border-blue-500/60 bg-blue-950/20 text-blue-700",
  challenge: "border-emerald-500/60 bg-emerald-950/20 text-emerald-700",
  prompt: "border-purple-500/60 bg-purple-950/20 text-purple-700",
  recommendation: "border-sky-500/60 bg-sky-950/20 text-sky-700",
  qa: "border-rose-500/60 bg-rose-950/20 text-rose-700",
  giveaway: "border-amber-400/60 bg-amber-950/20 text-amber-600",
};

const CARD_COLORS: Record<PostType, string> = {
  discussion: "border-slate-500/80 bg-gradient-to-br from-slate-700/30 via-slate-800/15 to-neutral-900/10",
  poll: "border-blue-700/80 bg-gradient-to-br from-blue-800/30 via-blue-900/15 to-neutral-900/10",
  challenge: "border-emerald-600/80 bg-gradient-to-br from-emerald-800/30 via-emerald-900/15 to-neutral-900/10",
  prompt: "border-purple-700/80 bg-gradient-to-br from-purple-800/30 via-purple-900/15 to-neutral-900/10",
  recommendation: "border-sky-600/80 bg-gradient-to-br from-sky-800/30 via-sky-900/15 to-neutral-900/10",
  qa: "border-rose-700/80 bg-gradient-to-br from-rose-800/30 via-rose-900/15 to-neutral-900/10",
  giveaway: "border-amber-400/80 bg-gradient-to-br from-amber-700/30 via-amber-900/15 to-neutral-900/10",
};

const TRIGGER_LABELS: Record<string, string> = {
  poaching: "Poaching or soliciting members to leave the platform",
  offsite_contact: "Requesting off-platform contact (email, phone number)",
  social_media: "Sharing external social media handles or links",
  fiverr: "Soliciting freelance or paid services outside the platform",
  external_link: "Sharing external file or document links",
  solicitation: "Soliciting paid work or collaboration outside the platform",
  secrecy: "Attempting to conceal communication from moderators",
  cursing: "Use of prohibited language (youth accounts)",
  foul_language: "Severely offensive language (youth accounts)",
  sexual_language: "Sexual or explicit language (youth accounts)",
};

// ─── Small shared components ──────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ url, name, size = 28 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    <Image src={url} alt={name} width={size} height={size} unoptimized
      className="rounded-full object-cover shrink-0 border border-[rgba(120,120,120,0.3)]"
      style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-[rgba(120,120,120,0.15)] text-neutral-400 shrink-0 border border-[rgba(120,120,120,0.2)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#f87171" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

// ─── Comment row ─────────────────────────────────────────────────────────────

function CommentRow({
  comment, currentUserId, onLike, onReply, isReplying,
}: {
  comment: DiscussionComment;
  currentUserId: string | null;
  onLike: () => void;
  onReply: () => void;
  isReplying: boolean;
}) {
  const name = comment.author?.pen_name ?? comment.author?.username ?? "Member";
  const username = comment.author?.username;
  return (
    <div className="flex items-start gap-2">
      {username ? (
        <Link href={`/u/${username}`} className="shrink-0 mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} size={24} /></Link>
      ) : (
        <div className="mt-0.5"><Avatar url={comment.author?.avatar_url ?? null} name={name} size={24} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {username ? (
            <Link href={`/u/${username}`} className="text-xs font-semibold text-neutral-200 hover:text-white transition">{name}</Link>
          ) : (
            <span className="text-xs font-semibold text-neutral-200">{name}</span>
          )}
          {comment.reply_to_name && (
            <span className="text-[11px] text-neutral-600">↩ {comment.reply_to_name}</span>
          )}
          <span className="text-[10px] text-neutral-600">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-300 leading-relaxed break-words">{comment.content}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button onClick={onLike} disabled={!currentUserId}
            className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${comment.user_liked
              ? "border-rose-700/40 bg-rose-950/20 text-rose-400 hover:bg-rose-950/30"
              : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-500 hover:border-[rgba(120,120,120,0.45)] hover:text-neutral-300 disabled:cursor-default"}`}>
            <Heart filled={comment.user_liked} />
            {comment.like_count > 0 && <span>{comment.like_count}</span>}
          </button>
          {currentUserId && (
            <button onClick={onReply}
              className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${isReplying
                ? "border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.15)] text-neutral-200"
                : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-500 hover:border-[rgba(120,120,120,0.45)] hover:text-neutral-300"}`}>
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reply input ──────────────────────────────────────────────────────────────

function ReplyInput({ replyToName, value, onChange, onSubmit, onCancel, submitting }: {
  replyToName: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-neutral-500">↩ Replying to <span className="text-neutral-300">{replyToName}</span></p>
      <textarea value={value} onChange={e => onChange(e.target.value)} autoFocus rows={2}
        placeholder={`Reply to ${replyToName}…`}
        className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none" />
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={!value.trim() || submitting}
          className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
          {submitting ? "Posting…" : "Reply"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] px-3 py-1 text-xs text-neutral-500 hover:text-neutral-300 transition">Cancel</button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DiscussionBoard({ currentUserId, community = "adult" }: { currentUserId: string | null; community?: "adult" | "youth" }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const searchParams = useSearchParams();
  const deepLinkPostId = searchParams.get("post");

  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isAdmin, setIsAdmin] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Comments per post (lazy-loaded on expand)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, DiscussionComment[]>>({});
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<{ postId: string; commentId: string; authorName: string } | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [violationModal, setViolationModal] = useState<{ message: string; triggers: string[]; consequence: string } | null>(null);

  // Post creator
  const [showCreator, setShowCreator] = useState(false);
  const [creatorStep, setCreatorStep] = useState<"category" | "form">("category");
  const [creatorType, setCreatorType] = useState<PostType | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [formCoinPrize, setFormCoinPrize] = useState(50);
  const [formDuration, setFormDuration] = useState(24); // hours
  const [submittingPost, setSubmittingPost] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Edit / delete
  const [editingPost, setEditingPost] = useState<{ id: string; title: string; content: string } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Live countdown ticker (updates every second)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Admin check ──
  useEffect(() => {
    if (!currentUserId) return;
    fetch("/api/owner-profiles")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.ids) setIsAdmin((data.ids as string[]).includes(currentUserId)); });
  }, [currentUserId]);

  // ── Load posts ──
  async function loadPosts() {
    setLoading(true);
    const { data: postRows } = await supabase
      .from("discussion_posts")
      .select("id, author_id, type, title, content, poll_options, created_at, coin_prize, ends_at, winner_id, winner_drawn")
      .eq("community", community)
      .order("created_at", { ascending: false });

    if (!postRows || postRows.length === 0) { setPosts([]); setLoading(false); return; }

    const rows = postRows as { id: string; author_id: string; type: PostType; title: string; content: string | null; poll_options: string[] | null; created_at: string; coin_prize: number | null; ends_at: string | null; winner_id: string | null; winner_drawn: boolean }[];
    const postIds = rows.map(r => r.id);
    const winnerIds = rows.map(r => r.winner_id).filter(Boolean) as string[];
    const authorIds = [...new Set([...rows.map(r => r.author_id), ...winnerIds])];

    const [{ data: likesData }, { data: commentsData }, { data: votesData }, { data: profileData }] = await Promise.all([
      supabase.from("discussion_post_likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("discussion_comments").select("post_id").in("post_id", postIds),
      supabase.from("discussion_poll_votes").select("post_id, user_id, option_index").in("post_id", postIds),
      supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", authorIds),
    ]);

    const likes = (likesData as { post_id: string; user_id: string }[] | null) ?? [];
    const commentsList = (commentsData as { post_id: string }[] | null) ?? [];
    const votes = (votesData as { post_id: string; user_id: string; option_index: number }[] | null) ?? [];
    const profileMap = new Map(((profileData as AuthorInfo[] | null) ?? []).map(p => [p.user_id, p]));

    const commentCountByPost: Record<string, number> = {};
    for (const c of commentsList) commentCountByPost[c.post_id] = (commentCountByPost[c.post_id] ?? 0) + 1;

    const built: DiscussionPost[] = rows.map(r => {
      const postLikes = likes.filter(l => l.post_id === r.id);
      const postVotes = votes.filter(v => v.post_id === r.id);
      const pollVoteCounts: Record<number, number> = {};
      for (const v of postVotes) pollVoteCounts[v.option_index] = (pollVoteCounts[v.option_index] ?? 0) + 1;
      return {
        id: r.id, author_id: r.author_id, type: r.type, title: r.title,
        content: r.content, poll_options: r.poll_options, created_at: r.created_at,
        like_count: postLikes.length,
        user_liked: currentUserId ? postLikes.some(l => l.user_id === currentUserId) : false,
        comment_count: commentCountByPost[r.id] ?? 0,
        user_vote: currentUserId ? (postVotes.find(v => v.user_id === currentUserId)?.option_index ?? null) : null,
        poll_votes: pollVoteCounts,
        author: profileMap.get(r.author_id) ?? null,
        coin_prize: r.coin_prize ?? null,
        ends_at: r.ends_at ?? null,
        winner_id: r.winner_id ?? null,
        winner_drawn: r.winner_drawn ?? false,
        winner_name: r.winner_id ? (profileMap.get(r.winner_id)?.pen_name ?? profileMap.get(r.winner_id)?.username ?? null) : null,
      };
    });

    setPosts(built);
    setLoading(false);
  }

  useEffect(() => { void loadPosts(); }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand and scroll to a deep-linked post (from notification reply link)
  useEffect(() => {
    if (!deepLinkPostId || loading) return;
    const exists = posts.some(p => p.id === deepLinkPostId);
    if (!exists) return;
    setExpandedPostId(deepLinkPostId);
    setTimeout(() => {
      const el = document.getElementById(`discussion-post-${deepLinkPostId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [deepLinkPostId, loading, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-draw expired giveaways whenever posts load
  useEffect(() => {
    const expired = posts.filter(p => p.type === "giveaway" && !p.winner_drawn && p.ends_at && new Date(p.ends_at) <= new Date());
    for (const p of expired) void drawGiveaway(p.id);
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Infinite scroll ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisibleCount(n => n + PAGE_SIZE); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Realtime: new posts ──
  useEffect(() => {
    const channel = supabase
      .channel(`discussion-posts-realtime-${community}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "discussion_posts", filter: `community=eq.${community}` }, async (payload) => {
        const row = payload.new as { id: string; author_id: string; type: PostType; title: string; content: string | null; poll_options: string[] | null; created_at: string; coin_prize?: number | null; ends_at?: string | null };
        const { data: prof } = await supabase
          .from("public_profiles")
          .select("user_id, username, pen_name, avatar_url")
          .eq("user_id", row.author_id)
          .maybeSingle();
        const newPost: DiscussionPost = {
          id: row.id, author_id: row.author_id, type: row.type,
          title: row.title, content: row.content, poll_options: row.poll_options,
          created_at: row.created_at,
          like_count: 0, user_liked: false, comment_count: 0,
          user_vote: null, poll_votes: {},
          author: (prof as AuthorInfo | null),
          coin_prize: row.coin_prize ?? null, ends_at: row.ends_at ?? null,
          winner_id: null, winner_drawn: false, winner_name: null,
        };
        setPosts(prev => [newPost, ...prev]);
        setVisibleCount(n => n + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  // ── Realtime: new comments ──
  useEffect(() => {
    const channel = supabase
      .channel("discussion-comments-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "discussion_comments" }, async (payload) => {
        const row = payload.new as { id: string; post_id: string; author_id: string; content: string; parent_id: string | null; reply_to_id: string | null; reply_to_author_id: string | null; created_at: string };
        // Skip if this user posted it (already added optimistically)
        if (row.author_id === currentUserId) return;

        const authorIds = [row.author_id, row.reply_to_author_id].filter(Boolean) as string[];
        const { data: profileData } = await supabase
          .from("public_profiles")
          .select("user_id, username, pen_name, avatar_url")
          .in("user_id", authorIds);

        const profileMap = new Map(((profileData as AuthorInfo[] | null) ?? []).map(p => [p.user_id, p]));
        const replyAuthor = row.reply_to_author_id ? profileMap.get(row.reply_to_author_id) : null;

        const newComment: DiscussionComment = {
          ...row,
          like_count: 0, user_liked: false,
          author: profileMap.get(row.author_id) ?? null,
          reply_to_name: replyAuthor ? (replyAuthor.pen_name ?? replyAuthor.username) : null,
        };

        // Append to comments if that post is loaded
        setComments(prev => {
          if (!(row.post_id in prev)) return prev;
          // Deduplicate by id
          const existing = prev[row.post_id] ?? [];
          if (existing.some(c => c.id === row.id)) return prev;
          return { ...prev, [row.post_id]: [...existing, newComment] };
        });

        // Always bump the post's comment count
        setPosts(prev => prev.map(p => p.id === row.post_id ? { ...p, comment_count: p.comment_count + 1 } : p));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, currentUserId]);

  // ── Load comments when post expands ──
  useEffect(() => {
    if (!expandedPostId || comments[expandedPostId]) return;
    setLoadingComments(true);
    (async () => {
      const { data: commentRows } = await supabase
        .from("discussion_comments")
        .select("id, post_id, author_id, content, parent_id, reply_to_id, reply_to_author_id, created_at")
        .eq("post_id", expandedPostId)
        .order("created_at", { ascending: true });

      if (!commentRows || commentRows.length === 0) {
        setComments(prev => ({ ...prev, [expandedPostId]: [] }));
        setLoadingComments(false);
        return;
      }

      const rows = commentRows as { id: string; post_id: string; author_id: string; content: string; parent_id: string | null; reply_to_id: string | null; reply_to_author_id: string | null; created_at: string }[];
      const authorIds = [...new Set([
        ...rows.map(r => r.author_id),
        ...rows.map(r => r.reply_to_author_id).filter(Boolean) as string[],
      ])];

      const [{ data: likesData }, { data: profileData }] = await Promise.all([
        supabase.from("discussion_comment_likes").select("comment_id, user_id").in("comment_id", rows.map(r => r.id)),
        supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", authorIds),
      ]);

      const likes = (likesData as { comment_id: string; user_id: string }[] | null) ?? [];
      const profileMap = new Map(((profileData as AuthorInfo[] | null) ?? []).map(p => [p.user_id, p]));

      const built: DiscussionComment[] = rows.map(r => {
        const replyAuthor = r.reply_to_author_id ? profileMap.get(r.reply_to_author_id) : null;
        return {
          ...r,
          like_count: likes.filter(l => l.comment_id === r.id).length,
          user_liked: currentUserId ? likes.some(l => l.comment_id === r.id && l.user_id === currentUserId) : false,
          author: profileMap.get(r.author_id) ?? null,
          reply_to_name: replyAuthor ? (replyAuthor.pen_name ?? replyAuthor.username) : null,
        };
      });

      setComments(prev => ({ ...prev, [expandedPostId]: built }));
      setLoadingComments(false);
    })();
  }, [expandedPostId, supabase, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──
  async function togglePostLike(postId: string) {
    if (!currentUserId) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.user_liked) {
      await supabase.from("discussion_post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_liked: false, like_count: p.like_count - 1 } : p));
    } else {
      await supabase.from("discussion_post_likes").insert({ post_id: postId, user_id: currentUserId });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_liked: true, like_count: p.like_count + 1 } : p));
    }
  }

  async function toggleCommentLike(postId: string, commentId: string) {
    if (!currentUserId) return;
    const c = (comments[postId] ?? []).find(c => c.id === commentId);
    if (!c) return;
    if (c.user_liked) {
      await supabase.from("discussion_comment_likes").delete().eq("comment_id", commentId).eq("user_id", currentUserId);
    } else {
      await supabase.from("discussion_comment_likes").insert({ comment_id: commentId, user_id: currentUserId });
      if (c.author_id && c.author_id !== currentUserId) {
        const likerName = (() => {
          // Look up current user's profile from any loaded comment author info
          for (const postComments of Object.values(comments)) {
            const mine = postComments.find(x => x.author_id === currentUserId);
            if (mine?.author) return mine.author.pen_name ?? mine.author.username ?? "Someone";
          }
          return "Someone";
        })();
        await supabase.from("system_notifications").insert({
          user_id: c.author_id,
          title: "Someone liked your comment",
          body: `${likerName} liked your comment on the discussion board.`,
          metadata: { post_id: postId, community },
        });
      }
    }
    setComments(prev => ({
      ...prev,
      [postId]: (prev[postId] ?? []).map(x => x.id === commentId
        ? { ...x, user_liked: !x.user_liked, like_count: x.like_count + (x.user_liked ? -1 : 1) }
        : x),
    }));
  }

  async function votePoll(postId: string, optionIndex: number) {
    if (!currentUserId) return;
    const post = posts.find(p => p.id === postId);
    if (!post || post.user_vote !== null) return;
    await supabase.from("discussion_poll_votes").insert({ post_id: postId, user_id: currentUserId, option_index: optionIndex });
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p, user_vote: optionIndex,
      poll_votes: { ...p.poll_votes, [optionIndex]: (p.poll_votes[optionIndex] ?? 0) + 1 },
    } : p));
  }

  async function submitComment(postId: string) {
    if (!currentUserId) return;
    const draftKey = replyingTo ? `reply:${replyingTo.commentId}` : postId;
    const content = (commentDrafts[draftKey] ?? "").trim();
    if (!content) return;
    setSubmittingComment(true);
    setCommentError(null);

    let parentId: string | null = null;
    let replyToId: string | null = null;
    let replyToAuthorId: string | null = null;
    let replyToName: string | null = null;

    if (replyingTo) {
      const target = (comments[postId] ?? []).find(c => c.id === replyingTo.commentId);
      parentId = target?.parent_id ?? replyingTo.commentId;
      replyToId = replyingTo.commentId;
      replyToAuthorId = target?.author_id ?? null;
      replyToName = replyingTo.authorName;
    }

    const post = posts.find(p => p.id === postId);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/discussion/submit-comment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        post_id: postId,
        content,
        parent_id: parentId,
        reply_to_id: replyToId,
        reply_to_author_id: replyToAuthorId,
        post_author_id: post?.author_id ?? currentUserId,
      }),
    });

    const json = await res.json() as { ok?: boolean; comment?: { id: string; post_id: string; author_id: string; content: string; parent_id: string | null; reply_to_id: string | null; reply_to_author_id: string | null; created_at: string }; error?: string; consequence?: string; triggers?: string[] };

    if (!res.ok || !json.ok) {
      if (json.triggers && json.consequence) {
        // Policy violation — show acknowledgment modal
        setViolationModal({ message: json.error ?? "Comment blocked.", triggers: json.triggers, consequence: json.consequence });
      } else {
        setCommentError(json.error ?? "Failed to post comment.");
      }
      setSubmittingComment(false);
      return;
    }

    const row = json.comment!;
    const { data: prof } = await supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").eq("user_id", currentUserId).maybeSingle();
    const author = prof as AuthorInfo | null;
    const newComment: DiscussionComment = { ...row, like_count: 0, user_liked: false, author, reply_to_name: replyToName };
    setComments(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), newComment] }));
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
    setCommentDrafts(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
    setReplyingTo(null);

    // Notify the person being replied to
    if (replyToAuthorId && replyToAuthorId !== currentUserId) {
      const replierName = author?.pen_name ?? author?.username ?? "Someone";
      await supabase.from("system_notifications").insert({
        user_id: replyToAuthorId,
        title: "Someone replied to your comment",
        body: `${replierName} replied to your comment on the discussion board.`,
        metadata: { post_id: postId, community },
      });
    }

    setSubmittingComment(false);
  }

  // ── Giveaway draw ──
  async function drawGiveaway(postId: string) {
    const res = await fetch("/api/draw-giveaway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId }),
    });
    if (res.ok) {
      const data = await res.json() as { winner_id?: string | null; winner_name?: string };
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, winner_drawn: true, winner_id: data.winner_id ?? null, winner_name: data.winner_name ?? null }
        : p));
    }
  }

  // ── Edit post ──
  async function submitEdit() {
    if (!editingPost) return;
    setEditSubmitting(true);
    const { error } = await supabase
      .from("discussion_posts")
      .update({ title: editingPost.title.trim(), content: editingPost.content.trim() || null })
      .eq("id", editingPost.id);
    if (!error) {
      setPosts(prev => prev.map(p => p.id === editingPost.id
        ? { ...p, title: editingPost.title.trim(), content: editingPost.content.trim() || null }
        : p));
      setEditingPost(null);
    }
    setEditSubmitting(false);
  }

  // ── Delete post ──
  async function confirmDelete() {
    if (!deletingPostId) return;
    if (isAdmin) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const postToDelete = posts.find(p => p.id === deletingPostId);
      await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: "delete", delete_table: "discussion_posts", delete_column: "id", delete_value: deletingPostId }),
      });
      await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: "audit", action: "delete_discussion_post", target_type: "discussion_post", target_id: deletingPostId, notes: `Deleted post: "${postToDelete?.title ?? deletingPostId}"` }),
      });
    } else {
      await supabase.from("discussion_posts").delete().eq("id", deletingPostId);
    }
    setPosts(prev => prev.filter(p => p.id !== deletingPostId));
    setDeletingPostId(null);
  }

  // ── Post creator ──
  function openCreator() {
    setCreatorStep("category"); setCreatorType(null);
    setFormTitle(""); setFormContent("");
    setPollOptions(["", ""]); setFormCoinPrize(50); setFormDuration(24);
    setPostError(null);
    setShowCreator(true);
  }

  async function submitPost() {
    if (!currentUserId || !creatorType || !formTitle.trim()) return;
    if (creatorType === "poll" && pollOptions.filter(o => o.trim()).length < 2) {
      setPostError("Add at least 2 poll options."); return;
    }
    setSubmittingPost(true); setPostError(null);

    const payload: Record<string, unknown> = {
      author_id: currentUserId, type: creatorType,
      title: formTitle.trim(), content: formContent.trim() || null,
      community,
    };
    if (creatorType === "poll") payload.poll_options = pollOptions.filter(o => o.trim());
    if (creatorType === "giveaway") {
      payload.coin_prize = formCoinPrize;
      payload.ends_at = new Date(Date.now() + formDuration * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from("discussion_posts")
      .insert(payload)
      .select("id, author_id, type, title, content, poll_options, created_at, coin_prize, ends_at, winner_id, winner_drawn")
      .single();

    if (error) { setPostError(error.message); setSubmittingPost(false); return; }

    if (data) {
      const row = data as { id: string; author_id: string; type: PostType; title: string; content: string | null; poll_options: string[] | null; created_at: string; coin_prize: number | null; ends_at: string | null; winner_id: string | null; winner_drawn: boolean };
      const { data: prof } = await supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").eq("user_id", currentUserId).maybeSingle();
      const newPost: DiscussionPost = {
        ...row, like_count: 0, user_liked: false, comment_count: 0,
        user_vote: null, poll_votes: {}, author: (prof as AuthorInfo | null),
        coin_prize: row.coin_prize ?? null, ends_at: row.ends_at ?? null,
        winner_id: null, winner_drawn: false, winner_name: null,
      };
      setPosts(prev => [newPost, ...prev]);
      setShowCreator(false);
    }
    setSubmittingPost(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const visiblePosts = posts.slice(0, visibleCount);
  const hasMore = posts.length > visibleCount;

  return (
    <>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Discussion Board</h2>
        {isAdmin && (
          <button onClick={openCreator}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.1)] px-3 text-xs font-medium text-neutral-300 hover:text-white transition">
            + New Post
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(n => <div key={n} className="h-28 rounded-xl border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)] px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">No discussions yet.</p>
          {isAdmin && <p className="mt-1 text-xs text-neutral-600">Create the first post to get the community talking.</p>}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {visiblePosts.map(post => {
              const cat = POST_CATEGORIES.find(c => c.type === post.type);
              const authorName = post.author?.pen_name ?? post.author?.username ?? "Admin";
              const isExpanded = expandedPostId === post.id;
              const postComments = comments[post.id] ?? [];
              const topLevel = postComments.filter(c => !c.parent_id);
              const repliesByParent: Record<string, DiscussionComment[]> = {};
              for (const c of postComments) {
                if (c.parent_id) {
                  if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
                  repliesByParent[c.parent_id].push(c);
                }
              }
              const totalPollVotes = Object.values(post.poll_votes).reduce((a, b) => a + b, 0);

              return (
                <div key={post.id} id={`discussion-post-${post.id}`} className={`rounded-xl border overflow-hidden ${CARD_COLORS[post.type]}`}>

                  {/* Post body */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      {post.author?.username ? (
                        <Link href={`/u/${post.author.username}`} className="shrink-0 mt-0.5">
                          <Avatar url={post.author.avatar_url ?? null} name={authorName} size={34} />
                        </Link>
                      ) : (
                        <div className="mt-0.5"><Avatar url={post.author?.avatar_url ?? null} name={authorName} size={34} /></div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[post.type]}`}>
                            {cat?.emoji} {cat?.label}
                          </span>
                          <span className="text-[10px] text-neutral-600">{timeAgo(post.created_at)}</span>
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-neutral-100 leading-snug">{post.title}</p>
                        {post.author?.username ? (
                          <Link href={`/u/${post.author.username}`} className="text-[11px] text-neutral-500 hover:text-neutral-300 transition">by {authorName}</Link>
                        ) : (
                          <span className="text-[11px] text-neutral-500">by {authorName}</span>
                        )}
                      </div>
                    </div>

                    {post.content && (
                      <p className="mt-3 text-sm text-neutral-300 leading-relaxed">{post.content}</p>
                    )}

                    {/* Giveaway */}
                    {post.type === "giveaway" && (() => {
                      const endsAt = post.ends_at ? new Date(post.ends_at).getTime() : null;
                      const msLeft = endsAt ? endsAt - now : null;
                      const ended = msLeft !== null && msLeft <= 0;

                      function countdownLabel() {
                        if (!msLeft || msLeft <= 0) return null;
                        const totalSecs = Math.floor(msLeft / 1000);
                        const days = Math.floor(totalSecs / 86400);
                        const hrs = Math.floor((totalSecs % 86400) / 3600);
                        const mins = Math.floor((totalSecs % 3600) / 60);
                        const secs = totalSecs % 60;
                        if (days > 0) return `${days}d ${hrs}h ${mins}m`;
                        if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
                        return `${mins}m ${secs}s`;
                      }

                      // Trigger draw when countdown hits zero
                      if (ended && !post.winner_drawn) void drawGiveaway(post.id);

                      return (
                        <div className="mt-3 rounded-lg border border-amber-400 bg-amber-950/20 p-3 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🎁</span>
                              <div>
                                <p className="text-sm font-semibold text-amber-300">
                                  <span style={{ color: "#f59e0b" }}>✿</span> {post.coin_prize} Bloom Coins
                                </p>
                                <p className="text-[11px] text-white">Like + Comment to enter the drawing</p>
                              </div>
                            </div>
                            {!ended && msLeft !== null && (
                              <div className="text-right">
                                <p className="text-[10px] text-neutral-500 uppercase tracking-wide">Ends in</p>
                                <p className="text-sm font-mono font-semibold text-amber-400">{countdownLabel()}</p>
                              </div>
                            )}
                            {ended && !post.winner_drawn && (
                              <span className="text-xs text-neutral-500 animate-pulse">Drawing winner…</span>
                            )}
                          </div>
                          {post.winner_drawn && (
                            post.winner_id ? (
                              <div className="flex items-center gap-1.5 rounded-md bg-amber-900/20 border border-amber-700/20 px-2.5 py-1.5">
                                <span className="text-base">🏆</span>
                                <p className="text-xs text-amber-300 font-medium">
                                  Winner: {post.winner_name ?? "Member"}
                                  {post.winner_id === currentUserId && <span className="ml-1 text-amber-400">(You!)</span>}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-600">No qualifying entries — no winner selected.</p>
                            )
                          )}
                        </div>
                      );
                    })()}

                    {/* Poll */}
                    {post.type === "poll" && post.poll_options && (
                      <div className="mt-3 space-y-2">
                        {post.poll_options.map((option, idx) => {
                          const voteCount = post.poll_votes[idx] ?? 0;
                          const pct = totalPollVotes > 0 ? Math.round((voteCount / totalPollVotes) * 100) : 0;
                          const voted = post.user_vote !== null;
                          const isMyVote = post.user_vote === idx;
                          return (
                            <button key={idx}
                              onClick={() => !voted && currentUserId ? void votePoll(post.id, idx) : undefined}
                              disabled={voted || !currentUserId}
                              className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition ${isMyVote
                                ? "border-blue-600/60 bg-blue-950/30 text-blue-300"
                                : voted
                                  ? "border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] text-neutral-400 cursor-default"
                                  : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] text-neutral-200 hover:border-[rgba(120,120,120,0.5)] hover:bg-[rgba(120,120,120,0.14)]"
                              }`}>
                              {voted && (
                                <span className="absolute inset-y-0 left-0 bg-blue-900/20 transition-all" style={{ width: `${pct}%` }} />
                              )}
                              <span className="relative flex items-center justify-between gap-2">
                                <span>{option}</span>
                                {voted && <span className="text-[11px] text-neutral-200">{pct}% · {voteCount}</span>}
                              </span>
                            </button>
                          );
                        })}
                        <p className="text-[10px] text-neutral-600">{totalPollVotes} vote{totalPollVotes !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex items-center gap-1 border-t border-[rgba(120,120,120,0.15)] px-3 py-2">
                    <button onClick={() => void togglePostLike(post.id)} disabled={!currentUserId}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${post.user_liked ? "text-rose-400 hover:text-rose-300" : "text-neutral-500 hover:text-neutral-300 disabled:cursor-default"}`}>
                      <Heart filled={post.user_liked} />
                      <span>{post.like_count > 0 ? post.like_count : "Like"}</span>
                    </button>
                    <button
                      onClick={() => { setExpandedPostId(isExpanded ? null : post.id); setReplyingTo(null); setCommentError(null); }}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition ${isExpanded ? "text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{post.comment_count > 0 ? post.comment_count : "Comment"}</span>
                    </button>
                    {isAdmin && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => setEditingPost({ id: post.id, title: post.title, content: post.content ?? "" })}
                          title="Edit post"
                          className="rounded px-2 py-1 text-[11px] text-neutral-600 hover:text-neutral-300 transition">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingPostId(post.id)}
                          title="Delete post"
                          className="rounded px-2 py-1 text-[11px] text-neutral-600 hover:text-red-400 transition">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Comments */}
                  {isExpanded && (
                    <div className="border-t border-[rgba(120,120,120,0.15)] px-4 py-4 space-y-4">
                      {loadingComments ? (
                        <p className="text-xs text-neutral-600">Loading…</p>
                      ) : (
                        <>
                          {/* Thread groups */}
                          {topLevel.length === 0 && !replyingTo && (
                            <p className="text-xs text-neutral-600">No comments yet. Be the first!</p>
                          )}
                          {topLevel.map(comment => {
                            const replies = repliesByParent[comment.id] ?? [];
                            const commentAuthorName = comment.author?.pen_name ?? comment.author?.username ?? "Member";
                            // Is the active reply target inside this thread?
                            const replyInThisThread = replyingTo?.postId === post.id && (
                              replyingTo.commentId === comment.id || replies.some(r => r.id === replyingTo.commentId)
                            );
                            return (
                              <div key={comment.id} className="space-y-2">
                                <CommentRow comment={comment} currentUserId={currentUserId}
                                  onLike={() => void toggleCommentLike(post.id, comment.id)}
                                  onReply={() => setReplyingTo(replyingTo?.commentId === comment.id ? null : { postId: post.id, commentId: comment.id, authorName: commentAuthorName })}
                                  isReplying={replyingTo?.commentId === comment.id} />

                                {/* Replies — indented with left border */}
                                {(replies.length > 0 || replyInThisThread) && (
                                  <div className="ml-8 pl-3 border-l border-[rgba(120,120,120,0.15)] space-y-2">
                                    {replies.map(reply => {
                                      const replyAuthorName = reply.author?.pen_name ?? reply.author?.username ?? "Member";
                                      return (
                                        <CommentRow key={reply.id} comment={reply} currentUserId={currentUserId}
                                          onLike={() => void toggleCommentLike(post.id, reply.id)}
                                          onReply={() => setReplyingTo(replyingTo?.commentId === reply.id ? null : { postId: post.id, commentId: reply.id, authorName: replyAuthorName })}
                                          isReplying={replyingTo?.commentId === reply.id} />
                                      );
                                    })}
                                    {replyInThisThread && (
                                      <ReplyInput
                                        replyToName={replyingTo!.authorName}
                                        value={commentDrafts[`reply:${replyingTo!.commentId}`] ?? ""}
                                        onChange={v => setCommentDrafts(prev => ({ ...prev, [`reply:${replyingTo!.commentId}`]: v }))}
                                        onSubmit={() => void submitComment(post.id)}
                                        onCancel={() => setReplyingTo(null)}
                                        submitting={submittingComment} />
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* New top-level comment */}
                          {!replyingTo && currentUserId && (
                            <div className="pt-1 border-t border-[rgba(120,120,120,0.1)]">
                              {commentError && expandedPostId === post.id && (
                                <p className="mb-2 rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">{commentError}</p>
                              )}
                              <textarea
                                value={commentDrafts[post.id] ?? ""}
                                onChange={e => { setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value })); setCommentError(null); }}
                                placeholder="Add a comment…" rows={2}
                                className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.55)] focus:outline-none" />
                              <div className="mt-1.5 flex justify-end">
                                <button onClick={() => void submitComment(post.id)}
                                  disabled={!(commentDrafts[post.id] ?? "").trim() || submittingComment}
                                  className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition">
                                  {submittingComment ? "Posting…" : "Post"}
                                </button>
                              </div>
                            </div>
                          )}
                          {!currentUserId && (
                            <p className="text-xs text-neutral-600">Sign in to comment.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && <div ref={sentinelRef} className="py-4 text-center"><span className="text-xs text-neutral-600">Loading more…</span></div>}
          {!hasMore && posts.length > 0 && <p className="mt-3 text-center text-xs text-neutral-700">All posts shown</p>}
        </>
      )}

      {/* ── Edit post modal ── */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setEditingPost(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-neutral-100 mb-4">Edit Post</h2>
            <div className="space-y-3">
              <input value={editingPost.title} onChange={e => setEditingPost(prev => prev ? { ...prev, title: e.target.value } : null)}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
              <textarea value={editingPost.content} onChange={e => setEditingPost(prev => prev ? { ...prev, content: e.target.value } : null)} rows={4}
                className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => void submitEdit()} disabled={editSubmitting || !editingPost.title.trim()}
                className="flex-1 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.3)] disabled:opacity-40 transition">
                {editSubmitting ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditingPost(null)} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deletingPostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setDeletingPostId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-neutral-100">Delete this post?</h2>
            <p className="mt-2 text-sm text-neutral-400">This will permanently remove the post and all its comments. This cannot be undone.</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setDeletingPostId(null)} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition">Cancel</button>
              <button onClick={() => void confirmDelete()} className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post creator modal ── */}
      {showCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowCreator(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>

            {creatorStep === "category" ? (
              <>
                <h2 className="text-base font-semibold text-neutral-100">What would you like to post?</h2>
                <p className="mt-1 text-xs text-neutral-500">Choose a format to get started.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {POST_CATEGORIES.map(cat => (
                    <button key={cat.type} onClick={() => { setCreatorType(cat.type); setCreatorStep("form"); }}
                      className="flex flex-col items-start gap-1 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] p-3 text-left hover:border-[rgba(120,120,120,0.6)] hover:bg-[rgba(120,120,120,0.12)] transition">
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="text-sm font-semibold text-neutral-200">{cat.label}</span>
                      <span className="text-[11px] text-neutral-500 leading-snug">{cat.description}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowCreator(false)} className="mt-4 w-full rounded-lg border border-[rgba(120,120,120,0.25)] py-2 text-sm text-neutral-500 hover:text-neutral-300 transition">Cancel</button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setCreatorStep("category")} className="text-neutral-500 hover:text-neutral-300 transition">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  </button>
                  <h2 className="text-base font-semibold text-neutral-100">
                    {POST_CATEGORIES.find(c => c.type === creatorType)?.emoji}{" "}
                    {POST_CATEGORIES.find(c => c.type === creatorType)?.label}
                  </h2>
                </div>

                <div className="space-y-3">
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Title *"
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
                  <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={4}
                    placeholder={POST_CATEGORIES.find(c => c.type === creatorType)?.placeholder}
                    className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />

                  {creatorType === "giveaway" && (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide">Bloom Coin Prize</p>
                        <div className="flex flex-wrap gap-2">
                          {[10, 25, 50, 100, 250, 500].map(amt => (
                            <button key={amt} type="button"
                              onClick={() => setFormCoinPrize(amt)}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${formCoinPrize === amt
                                ? "border-amber-600/60 bg-amber-900/30 text-amber-300"
                                : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-400 hover:text-neutral-200"}`}>
                              <span style={{ color: "#f59e0b" }}>✿</span> {amt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wide">Duration</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "1 hour", hours: 1 },
                            { label: "6 hours", hours: 6 },
                            { label: "12 hours", hours: 12 },
                            { label: "1 day", hours: 24 },
                            { label: "3 days", hours: 72 },
                            { label: "7 days", hours: 168 },
                          ].map(({ label, hours }) => (
                            <button key={hours} type="button"
                              onClick={() => setFormDuration(hours)}
                              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${formDuration === hours
                                ? "border-amber-600/60 bg-amber-900/30 text-amber-300"
                                : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-400 hover:text-neutral-200"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-neutral-600">
                        One random user who both likes and comments will be selected as the winner when the timer ends.
                      </p>
                    </div>
                  )}

                  {creatorType === "poll" && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Poll Options</p>
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, i) => i === idx ? e.target.value : o))}
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none" />
                          {pollOptions.length > 2 && (
                            <button onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))} className="text-neutral-600 hover:text-red-400 transition">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {pollOptions.length < 6 && (
                        <button onClick={() => setPollOptions(prev => [...prev, ""])} className="text-xs text-neutral-500 hover:text-neutral-300 transition">+ Add option</button>
                      )}
                    </div>
                  )}
                </div>

                {postError && <p className="mt-2 text-xs text-red-400">{postError}</p>}

                <div className="mt-5 flex gap-2">
                  <button onClick={() => void submitPost()} disabled={submittingPost || !formTitle.trim()}
                    className="flex-1 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.3)] disabled:opacity-40 transition">
                    {submittingPost ? "Posting…" : "Post to Discussion Board"}
                  </button>
                  <button onClick={() => setShowCreator(false)} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Policy violation acknowledgment modal ── */}
      {violationModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-red-700/60 bg-neutral-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-900/40 text-lg text-red-400">⚠</span>
              <h2 className="text-lg font-semibold text-red-300">Community Policy Violation</h2>
            </div>

            <p className="text-sm text-neutral-200 leading-relaxed">{violationModal.message}</p>

            {violationModal.triggers.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">
                  Reason{violationModal.triggers.length > 1 ? "s" : ""} for violation
                </p>
                <ul className="space-y-1">
                  {violationModal.triggers.map((t) => (
                    <li key={t} className="text-sm text-neutral-300 flex items-start gap-2">
                      <span className="mt-0.5 text-red-400 shrink-0">•</span>
                      <span>{TRIGGER_LABELS[t] ?? t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-xs text-neutral-400 leading-relaxed">
              Your comment was not posted. This violation has been logged and reviewed by the admin team. Repeated violations may result in suspension or a permanent community ban.
            </div>

            <button
              onClick={async () => {
                await fetch("/api/messages/acknowledge-violation", { method: "POST" });
                setViolationModal(null);
              }}
              className="mt-5 w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 active:bg-red-800"
            >
              I understand and acknowledge this violation
            </button>
          </div>
        </div>
      )}
    </>
  );
}
