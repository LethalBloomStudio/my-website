"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { useDeactivationGuard } from "@/lib/useDeactivationGuard";

type Manuscript = { id: string; title: string };
type Feedback = {
  id: string;
  manuscript_id: string;
  reader_id: string;
  comment_text: string;
  chapter_id: string | null;
  created_at: string;
};
type FeedbackReply = {
  id: string;
  feedback_id: string;
  replier_id: string;
  body: string;
  created_at: string;
};
type AccessRequest = {
  id: string;
  manuscript_id: string;
  requester_id: string;
  status: string;
  created_at: string;
};
type ModerationFlag = {
  id: string;
  manuscript_id: string;
  reason: string;
  matched_terms: string[];
  status: string;
  created_at: string;
};
type SystemNotification = {
  id: string;
  category: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  metadata?: { announcement_id?: string; reward_coins?: number; giveaway_post_id?: string; post_id?: string; community?: string; profile_username?: string; manuscript_id?: string; chapter_id?: string; feedback_id?: string } | null;
};
type ManuscriptInvitation = {
  id: string;
  manuscript_id: string;
  reader_id: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

type FriendRequestPayload = {
  senderId: string;
  penName: string;
  username: string | null;
  avatarUrl: string | null;
};

type FeedItem =
  | { key: string; type: "feedback"; created_at: string; payload: Feedback }
  | { key: string; type: "reply"; created_at: string; payload: FeedbackReply }
  | { key: string; type: "read_request"; created_at: string; payload: AccessRequest }
  | { key: string; type: "moderation"; created_at: string; payload: ModerationFlag }
  | { key: string; type: "admin"; created_at: string; payload: SystemNotification }
  | { key: string; type: "invitation"; created_at: string; payload: ManuscriptInvitation }
  | { key: string; type: "new_follower"; created_at: string; payload: { userId: string; name: string; username: string | null; avatarUrl: string | null } }
  | { key: string; type: "ann_like"; created_at: string; payload: { likerId: string; likerName: string; likerUsername: string | null; likerAvatar: string | null; announcementExcerpt: string; announcementId: string } }
  | { key: string; type: "followed_ann"; created_at: string; payload: { authorId: string; authorName: string; authorUsername: string | null; authorAvatar: string | null; content: string; announcementId: string } }
  | { key: string; type: "friend_request"; created_at: string; payload: FriendRequestPayload };

type Category = "all" | "manuscript" | "beta_reading" | "social" | "admin";

function getItemCategory(item: FeedItem, userId: string | null): "manuscript" | "beta_reading" | "social" | "admin" {
  const type = item.type;

  // Feedback: if the signed-in user left it → they are a beta reader; otherwise they own the manuscript
  if (type === "feedback") {
    return (item.payload as Feedback).reader_id === userId ? "beta_reading" : "manuscript";
  }

  // Manuscript-owner notifications
  if (type === "read_request" || type === "moderation") return "manuscript";

  // Beta reading notifications
  if (type === "invitation") return "beta_reading";

  // Social: followers, likes, announcements from followed users, friend requests
  if (type === "new_follower" || type === "ann_like" || type === "followed_ann" || type === "friend_request") return "social";

  // System / admin notifications - route by title
  if (type === "admin") {
    const n = item.payload as SystemNotification;
    const title = n.title ?? "";
    // Feedback reply notifications → beta_reading
    if (n.category === "feedback_reply") return "beta_reading";
    // Coin request from a linked youth account → social
    if ((n.metadata as { gift_link?: string } | null)?.gift_link) return "social";
    // Any discussion board notification (has post_id in metadata) → social
    if (n.metadata?.post_id) return "social";
    // Friend announcement notifications → social
    if (n.metadata?.profile_username) return "social";
    // Direct message notifications → social
    if (title.startsWith("New message from") || (n.metadata as { sender_id?: string } | null)?.sender_id) return "social";
    // Reader-side: accepted into a project, bloom coin reward, book published/unpublished
    if (
      title.includes("Bloom Coin") ||
      title.includes("bloom coin") ||
      title.includes("Beta reader request accepted") ||
      title.includes("Beta reader invitation") ||
      title.includes("Book republished") ||
      title.includes("Book unpublished")
    ) return "beta_reading";
    // Author-side: someone requested access, invitation response, parental actions
    if (
      title.includes("New beta reader request") ||
      title.includes("Invitation accepted") ||
      title.includes("Invitation declined") ||
      title.includes("Manuscript Disabled by Parent") ||
      title.includes("Manuscript Reinstated by Parent")
    ) return "manuscript";
    return "admin";
  }

  return "social";
}

export default function NotificationsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  useDeactivationGuard(supabase);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [manuscriptTitles, setManuscriptTitles] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string | null>>({});
  const [userUsernames, setUserUsernames] = useState<Record<string, string | null>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, Feedback>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clientReadKeys, setClientReadKeys] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "read">("unread");
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [claimConfirm, setClaimConfirm] = useState<{ announcementId?: string; giveawayPostId?: string; rewardCoins: number } | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [friendRequestAction, setFriendRequestAction] = useState<string | null>(null);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const catMenuRef = useRef<HTMLDivElement>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) setCatMenuOpen(false);
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) setTabMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  function loadClientReadKeys(uid: string) {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(`notif_read_keys_${uid}`);
      const parsed = raw ? (JSON.parse(raw) as (string | { key: string; readAt: number })[]) : [];
      if (!Array.isArray(parsed)) return [];
      const now = Date.now();
      // Normalise legacy plain-string entries (no timestamp) and prune entries older than 30 days
      const active = parsed
        .map((entry) => (typeof entry === "string" ? { key: entry, readAt: now } : entry))
        .filter((entry) => now - entry.readAt < THIRTY_DAYS_MS);
      // Persist pruned list back
      window.localStorage.setItem(`notif_read_keys_${uid}`, JSON.stringify(active));
      return active.map((e) => e.key);
    } catch {
      return [];
    }
  }

  function saveClientReadKeys(uid: string, keys: string[], existingEntries: { key: string; readAt: number }[] = []) {
    if (typeof window === "undefined") return;
    const now = Date.now();
    const existingMap = new Map(existingEntries.map((e) => [e.key, e.readAt]));
    const entries = keys.map((k) => ({ key: k, readAt: existingMap.get(k) ?? now }));
    // Persist to localStorage (fast, same-device cache)
    window.localStorage.setItem(`notif_read_keys_${uid}`, JSON.stringify(entries));
    // Persist to DB (survives across devices/browsers)
    void fetch("/api/notifications/read-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
  }

  function isItemRead(item: FeedItem) {
    if (item.type === "admin") return item.payload.is_read;
    if (item.type === "read_request") return item.payload.status !== "pending";
    if (item.type === "invitation") return item.payload.status !== "pending";
    if (item.type === "friend_request") return false; // always unread while pending
    return clientReadKeys.includes(item.key);
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    const { data: auth } = await supabase.auth.getSession();
    const signedInUserId = auth.session?.user?.id ?? null;
    setUserId(signedInUserId);
    if (signedInUserId) {
      const { data: acc } = await supabase.from("accounts").select("is_admin").eq("user_id", signedInUserId).maybeSingle();
      setIsAdmin(!!(acc as { is_admin?: boolean } | null)?.is_admin);
    }
    if (!signedInUserId) {
      setMsg("Please sign in to view notifications.");
      setLoading(false);
      return;
    }

    // Load read keys from DB first (cross-device persistence), merge with localStorage cache
    try {
      const rkRes = await fetch("/api/notifications/read-keys");
      if (rkRes.ok) {
        const rkData = (await rkRes.json()) as { keys: string[] };
        const localKeys = loadClientReadKeys(signedInUserId);
        const merged = Array.from(new Set([...rkData.keys, ...localKeys]));
        setClientReadKeys(merged);
      }
    } catch {
      // fallback to localStorage only
      setClientReadKeys(loadClientReadKeys(signedInUserId));
    }

    const { data: manuscripts, error: manuscriptsError } = await supabase
      .from("manuscripts")
      .select("id, title")
      .eq("owner_id", signedInUserId);
    if (manuscriptsError) {
      setMsg(manuscriptsError.message);
      setLoading(false);
      return;
    }

    const manuscriptRows = (manuscripts as Manuscript[] | null) ?? [];
    const manuscriptIds = manuscriptRows.map((m) => m.id);
    const manuscriptTitleMap: Record<string, string> = {};
    manuscriptRows.forEach((m) => {
      manuscriptTitleMap[m.id] = m.title;
    });

    // Load which announcement rewards and giveaway prizes this user has already claimed
    const [{ data: claimsData }, { data: giveawayClaimsData }] = await Promise.all([
      supabase.from("announcement_coin_claims").select("announcement_id").eq("user_id", signedInUserId),
      supabase.from("giveaway_claims").select("post_id").eq("user_id", signedInUserId),
    ]);
    const allClaimedIds = new Set([
      ...((claimsData ?? []) as { announcement_id: string }[]).map(c => c.announcement_id),
      ...((giveawayClaimsData ?? []) as { post_id: string }[]).map(c => c.post_id),
    ]);
    setClaimedIds(allClaimedIds);

    const [systemRes, modRes, feedbackRes, myFeedbackRes, accessRes, invitationsRes] = await Promise.all([
      supabase
        .from("system_notifications")
        .select("id, category, title, body, is_read, created_at, metadata")
        .eq("user_id", signedInUserId)
        .neq("category", "messages")
        .order("created_at", { ascending: false }),
      supabase
        .from("manuscript_moderation_flags")
        .select("id, manuscript_id, reason, matched_terms, status, created_at")
        .eq("owner_id", signedInUserId)
        .order("created_at", { ascending: false }),
      manuscriptIds.length > 0
        ? supabase
            .from("line_feedback")
            .select("id, manuscript_id, reader_id, comment_text, chapter_id, created_at")
            .in("manuscript_id", manuscriptIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("line_feedback")
        .select("id, manuscript_id, reader_id, comment_text, chapter_id, created_at")
        .eq("reader_id", signedInUserId)
        .order("created_at", { ascending: false }),
      manuscriptIds.length > 0
        ? supabase
            .from("manuscript_access_requests")
            .select("id, manuscript_id, requester_id, status, created_at")
            .in("manuscript_id", manuscriptIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("manuscript_invitations")
        .select("id, manuscript_id, reader_id, invited_by, status, created_at")
        .eq("reader_id", signedInUserId)
        .order("created_at", { ascending: false }),
    ]);

    const feedbackRowsRaw = (feedbackRes.data as Feedback[] | null) ?? [];
    const myFeedbackRows = (myFeedbackRes.data as Feedback[] | null) ?? [];
    const feedbackById = new Map<string, Feedback>();
    [...feedbackRowsRaw, ...myFeedbackRows].forEach((f) => {
      feedbackById.set(f.id, f);
    });
    const feedbackRows = Array.from(feedbackById.values());
    const feedbackIds = feedbackRows.map((f) => f.id);
    const feedbackLookup: Record<string, Feedback> = {};
    feedbackRows.forEach((f) => {
      feedbackLookup[f.id] = f;
    });
    setFeedbackMap(feedbackLookup);

    if (systemRes.error || modRes.error || feedbackRes.error || myFeedbackRes.error || accessRes.error) {
      setMsg(
        systemRes.error?.message ||
          modRes.error?.message ||
          feedbackRes.error?.message ||
          myFeedbackRes.error?.message ||
          accessRes.error?.message ||
          "Failed to load notifications."
      );
      setLoading(false);
      return;
    }
    // invitations table may not exist yet - silently skip if it errors

    // Social queries
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [followerRes, followingRes, myAnnsRes] = await Promise.all([
      supabase.from("profile_follows").select("follower_id, created_at").eq("following_id", signedInUserId).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(30),
      supabase.from("profile_follows").select("following_id").eq("follower_id", signedInUserId),
      supabase.from("profile_announcements").select("id, content").eq("user_id", signedInUserId).limit(20),
    ]);

    const myAnnRows = (myAnnsRes.data as { id: string; content: string }[] | null) ?? [];
    const myAnnIds = myAnnRows.map(a => a.id);
    const myAnnMap = new Map(myAnnRows.map(a => [a.id, a.content]));
    const followingIds = ((followingRes.data as { following_id: string }[] | null) ?? []).map(r => r.following_id);

    const [annLikesRes, followedAnnsRes] = await Promise.all([
      myAnnIds.length > 0
        ? supabase.from("profile_announcement_likes").select("announcement_id, user_id, created_at").in("announcement_id", myAnnIds).neq("user_id", signedInUserId).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      followingIds.length > 0
        ? supabase.from("profile_announcements").select("id, content, created_at, user_id").in("user_id", followingIds).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
    ]);

    const allUserIds = new Set<string>();
    if (signedInUserId) allUserIds.add(signedInUserId);
    feedbackRows.forEach((f) => allUserIds.add(f.reader_id));
    ((accessRes.data as AccessRequest[] | null) ?? []).forEach((r) => allUserIds.add(r.requester_id));
    if (!invitationsRes.error) {
      ((invitationsRes.data as ManuscriptInvitation[] | null) ?? []).forEach((inv) => allUserIds.add(inv.invited_by));
    }
    ((followerRes.data as { follower_id: string }[] | null) ?? []).forEach(r => allUserIds.add(r.follower_id));
    ((annLikesRes.data as { announcement_id: string; user_id: string; created_at: string }[] | null) ?? []).forEach(r => allUserIds.add(r.user_id));
    ((followedAnnsRes.data as { id: string; content: string; created_at: string; user_id: string }[] | null) ?? []).forEach(r => allUserIds.add(r.user_id));

    const nameMap: Record<string, string> = {};
    const avatarMap: Record<string, string | null> = {};
    const usernameMap: Record<string, string | null> = {};

    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("user_id, pen_name, username, avatar_url")
        .in("user_id", Array.from(allUserIds));
      (profiles ?? []).forEach((p: { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }) => {
        nameMap[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Reader");
        avatarMap[p.user_id] = p.avatar_url ?? null;
        usernameMap[p.user_id] = p.username ?? null;
      });
      setNames(nameMap);
      setUserAvatars(avatarMap);
      setUserUsernames(usernameMap);
    } else {
      setNames({});
      setUserAvatars({});
      setUserUsernames({});
    }

    // Only notify the manuscript author about incoming feedback - readers do not need
    // a notification for feedback they themselves submitted.
    const feedbackItems = (feedbackRowsRaw ?? []).map((payload) => ({
      key: `feedback-${payload.id}`,
      type: "feedback" as const,
      created_at: payload.created_at,
      payload,
    }));
    const requestItems = ((accessRes.data as AccessRequest[] | null) ?? []).map((payload) => ({
      key: `request-${payload.id}`,
      type: "read_request" as const,
      created_at: payload.created_at,
      payload,
    }));
    const moderationItems = ((modRes.data as ModerationFlag[] | null) ?? []).map((payload) => ({
      key: `mod-${payload.id}`,
      type: "moderation" as const,
      created_at: payload.created_at,
      payload,
    }));
    const adminItems = ((systemRes.data as SystemNotification[] | null) ?? []).map((payload) => ({
      key: `admin-${payload.id}`,
      type: "admin" as const,
      created_at: payload.created_at,
      payload,
    }));
    const invitationItems = invitationsRes.error
      ? []
      : ((invitationsRes.data as ManuscriptInvitation[] | null) ?? []).map((payload) => ({
          key: `invitation-${payload.id}`,
          type: "invitation" as const,
          created_at: payload.created_at,
          payload,
        }));

    const followerItems: FeedItem[] = ((followerRes.data as { follower_id: string; created_at: string }[] | null) ?? []).map(r => ({
      key: `follower-${r.follower_id}`,
      type: "new_follower" as const,
      created_at: r.created_at,
      payload: {
        userId: r.follower_id,
        name: nameMap[r.follower_id] ?? "Reader",
        username: usernameMap[r.follower_id] ?? null,
        avatarUrl: avatarMap[r.follower_id] ?? null,
      },
    }));

    const annLikeItems: FeedItem[] = ((annLikesRes.data as { announcement_id: string; user_id: string; created_at: string }[] | null) ?? []).map(r => ({
      key: `annlike-${r.announcement_id}-${r.user_id}`,
      type: "ann_like" as const,
      created_at: r.created_at,
      payload: {
        likerId: r.user_id,
        likerName: nameMap[r.user_id] ?? "Reader",
        likerUsername: usernameMap[r.user_id] ?? null,
        likerAvatar: avatarMap[r.user_id] ?? null,
        announcementExcerpt: (myAnnMap.get(r.announcement_id) ?? "").slice(0, 80),
        announcementId: r.announcement_id,
      },
    }));

    const followedAnnItems: FeedItem[] = ((followedAnnsRes.data as { id: string; content: string; created_at: string; user_id: string }[] | null) ?? []).map(r => ({
      key: `followed-ann-${r.id}`,
      type: "followed_ann" as const,
      created_at: r.created_at,
      payload: {
        authorId: r.user_id,
        authorName: nameMap[r.user_id] ?? "Author",
        authorUsername: usernameMap[r.user_id] ?? null,
        authorAvatar: avatarMap[r.user_id] ?? null,
        content: r.content,
        announcementId: r.id,
      },
    }));

    // Fetch pending friend requests before building the feed
    // Uses a server route so youth profiles (is_public = false) are returned
    let friendRequestItems: FeedItem[] = [];
    try {
      const frRes = await fetch("/api/friend-requests/pending");
      if (frRes.ok) {
        const frData = await frRes.json() as { requests: { senderId: string; penName: string; username: string | null; avatarUrl: string | null; createdAt: string }[] };
        friendRequestItems = (frData.requests ?? []).map((r) => ({
          key: `friend-request-${r.senderId}`,
          type: "friend_request" as const,
          created_at: r.createdAt,
          payload: {
            senderId: r.senderId,
            penName: r.penName,
            username: r.username,
            avatarUrl: r.avatarUrl,
          },
        }));
      }
    } catch {
      // non-fatal
    }

    // replyItems removed - feedback replies are now delivered via system_notifications (category: feedback_reply)
    const feed: FeedItem[] = [...feedbackItems, ...requestItems, ...moderationItems, ...adminItems, ...invitationItems, ...followerItems, ...annLikeItems, ...followedAnnItems, ...friendRequestItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const allManuscriptIds = Array.from(
      new Set([
        ...manuscriptIds,
        ...feedbackRows.map((f) => f.manuscript_id),
        ...((modRes.data as ModerationFlag[] | null) ?? []).map((m) => m.manuscript_id),
        ...((accessRes.data as AccessRequest[] | null) ?? []).map((r) => r.manuscript_id),
        ...(invitationsRes.error ? [] : ((invitationsRes.data as ManuscriptInvitation[] | null) ?? []).map((inv) => inv.manuscript_id)),
      ])
    );
    const missingIds = allManuscriptIds.filter((id) => !manuscriptTitleMap[id]);
    if (missingIds.length > 0) {
      const { data: extraTitles } = await supabase
        .from("manuscripts")
        .select("id, title")
        .in("id", missingIds);
      ((extraTitles as Manuscript[] | null) ?? []).forEach((m) => {
        manuscriptTitleMap[m.id] = m.title;
      });
    }
    // Delete admin notifications that have been read for 30+ days
    const thirtyDaysAgoAdmin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    void supabase
      .from("system_notifications")
      .delete()
      .eq("user_id", signedInUserId)
      .eq("is_read", true)
      .lt("read_at", thirtyDaysAgoAdmin);

    // Hide resolved requests/invitations older than 30 days, and always strip
    // any message-category notifications that slipped through (legacy data guard)
    const prunedFeed = feed.filter((item) => {
      if (item.type === "admin") {
        const n = item.payload as SystemNotification;
        if (n.category === "messages") return false;
        if (n.title?.startsWith("New message from")) return false;
        if ((n.metadata as { sender_id?: string } | null)?.sender_id) return false;
      }
      if (item.type === "read_request" && item.payload.status !== "pending") {
        return Date.now() - new Date(item.created_at).getTime() < 30 * 24 * 60 * 60 * 1000;
      }
      if (item.type === "invitation" && item.payload.status !== "pending") {
        return Date.now() - new Date(item.created_at).getTime() < 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    });

    setManuscriptTitles(manuscriptTitleMap);
    setItems(prunedFeed);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [supabase]);

  // Realtime: reload when a new system_notification is inserted for this user
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-page:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: Record<string, unknown> }) => { if ((payload.new as { category?: string })?.category !== "messages") void load(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load is a component function; subscription correctly restarts when userId/supabase change
  }, [userId, supabase]);

  useEffect(() => {
    if (!userId) {
      setClientReadKeys([]);
      return;
    }
    setClientReadKeys(loadClientReadKeys(userId));
  }, [userId]);

  async function markAllAsRead() {
    if (!userId) return;
    const unreadNonAdminKeys = items.filter((item) => item.type !== "admin" && item.type !== "invitation" && item.type !== "friend_request" && !isItemRead(item)).map((item) => item.key);
    const merged = Array.from(new Set([...clientReadKeys, ...unreadNonAdminKeys]));
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`notif_read_keys_${userId}`) : null;
    const existing: { key: string; readAt: number }[] = raw ? (JSON.parse(raw) as { key: string; readAt: number }[]) : [];
    saveClientReadKeys(userId, merged, existing);
    setClientReadKeys(merged);

    // Exclude admin notifications that have an unclaimed reward still within the 7-day window
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const unclaimedRewardIds = items
      .filter(item => {
        if (item.type !== "admin") return false;
        const meta = item.payload.metadata;
        const claimId = meta?.announcement_id ?? meta?.giveaway_post_id;
        if (!claimId || !meta?.reward_coins) return false;
        if (claimedIds.has(claimId)) return false;
        // Expired rewards should be marked read - don't protect them
        const age = nowMs - new Date(item.created_at).getTime();
        return age <= SEVEN_DAYS_MS;
      })
      .map(item => (item.payload as { id: string | number }).id);

    let query = supabase
      .from("system_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (unclaimedRewardIds.length > 0) {
      query = query.not("id", "in", `(${unclaimedRewardIds.join(",")})`);
    }

    const { error } = await query;
    setMsg(error ? error.message : "Marked notifications as read.");
    await load();
  }

  async function approveRequest(req: AccessRequest) {
    if (!userId) return;
    const { error: updateErr } = await supabase
      .from("manuscript_access_requests")
      .update({ status: "approved" })
      .eq("id", req.id);
    if (updateErr) { setMsg(updateErr.message); return; }
    const { error: grantErr } = await supabase
      .from("manuscript_access_grants")
      .insert({ manuscript_id: req.manuscript_id, reader_id: req.requester_id, granted_by: userId });
    if (grantErr && grantErr.code !== "23505") { setMsg(grantErr.message); return; }
    setActiveTab("read");
    await load();
  }

  async function denyRequest(req: AccessRequest) {
    const { error } = await supabase
      .from("manuscript_access_requests")
      .update({ status: "denied" })
      .eq("id", req.id);
    if (error) { setMsg(error.message); return; }
    setActiveTab("read");
    await load();
  }

  async function acceptInvitation(inv: ManuscriptInvitation) {
    setRespondingTo(inv.id);
    const { error } = await supabase
      .from("manuscript_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) { setMsg(error.message); setRespondingTo(null); return; }
    // Notify the author
    const manuscriptTitle = manuscriptTitles[inv.manuscript_id] ?? "your manuscript";
    const readerName = names[userId ?? ""] ?? "A reader";
    await supabase.from("system_notifications").insert({
      user_id: inv.invited_by,
      title: "Invitation accepted",
      body: `${readerName} accepted your invitation to beta read "${manuscriptTitle}".`,
    });
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
    setRespondingTo(null);
    setActiveTab("read");
    await load();
  }

  async function declineInvitation(inv: ManuscriptInvitation) {
    setRespondingTo(inv.id);
    const { error } = await supabase
      .from("manuscript_invitations")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) { setMsg(error.message); setRespondingTo(null); return; }
    // Notify the author
    const manuscriptTitle = manuscriptTitles[inv.manuscript_id] ?? "your manuscript";
    const readerName = names[userId ?? ""] ?? "A reader";
    await supabase.from("system_notifications").insert({
      user_id: inv.invited_by,
      title: "Invitation declined",
      body: `${readerName} declined your invitation to beta read "${manuscriptTitle}".`,
    });
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
    setRespondingTo(null);
    setActiveTab("read");
    await load();
  }

  async function acceptFriendRequest(senderId: string) {
    setFriendRequestAction(senderId);
    await supabase
      .from("profile_friend_requests")
      .update({ status: "accepted" })
      .eq("sender_id", senderId)
      .eq("receiver_id", userId ?? "");
    setItems((prev) => prev.filter((item) => item.key !== `friend-request-${senderId}`));
    setFriendRequestAction(null);
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
  }

  async function denyFriendRequest(senderId: string) {
    setFriendRequestAction(senderId);
    await supabase
      .from("profile_friend_requests")
      .update({ status: "denied" })
      .eq("sender_id", senderId)
      .eq("receiver_id", userId ?? "");
    setItems((prev) => prev.filter((item) => item.key !== `friend-request-${senderId}`));
    setFriendRequestAction(null);
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
  }

  async function claimCoins(announcementId: string, rewardCoins: number) {
    if (!userId || claimLoading) return;
    setClaimLoading(true);
    setClaimConfirm(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setClaimLoading(false); return; }
    const res = await fetch("/api/announcement/claim-coins", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ announcement_id: announcementId, reward_coins: rewardCoins }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; new_balance?: number };
    if (res.ok) {
      setClaimedIds(prev => new Set([...prev, announcementId]));
      setMsg(`✿ ${rewardCoins} Bloom Coins added to your wallet!`);
      window.dispatchEvent(new CustomEvent("bloom-coins-updated", { detail: { balance: data.new_balance } }));
      // Mark the corresponding notification as read automatically
      const notif = items.find(
        item => item.type === "admin" && item.payload.metadata?.announcement_id === announcementId
      );
      if (notif && !(notif.payload as { is_read?: boolean }).is_read) {
        await supabase
          .from("system_notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", (notif.payload as { id: string | number }).id)
          .eq("user_id", userId);
        window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
      }
      await load();
    } else {
      if (data.error === "Already claimed") setMsg("You already claimed this reward.");
      else if (data.error === "Claim window expired") setMsg("The 7-day claim window for this reward has expired.");
      else setMsg(data.error ?? "Failed to claim.");
    }
    setClaimLoading(false);
  }

  async function claimGiveaway(postId: string, rewardCoins: number) {
    if (!userId || claimLoading) return;
    setClaimLoading(true);
    setClaimConfirm(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setClaimLoading(false); return; }
    const res = await fetch("/api/giveaway/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ post_id: postId, reward_coins: rewardCoins }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; new_balance?: number };
    if (res.ok) {
      setClaimedIds(prev => new Set([...prev, postId]));
      setMsg(`🎉 ${rewardCoins} Bloom Coins added to your wallet!`);
      window.dispatchEvent(new CustomEvent("bloom-coins-updated", { detail: { balance: data.new_balance } }));
      const notif = items.find(
        item => item.type === "admin" && item.payload.metadata?.giveaway_post_id === postId
      );
      if (notif && !(notif.payload as { is_read?: boolean }).is_read) {
        await supabase
          .from("system_notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", (notif.payload as { id: string | number }).id)
          .eq("user_id", userId);
        window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
      }
      await load();
    } else {
      if (data.error === "Already claimed") setMsg("You already claimed this giveaway prize.");
      else if (data.error === "Claim window expired") setMsg("The 7-day claim window for this prize has expired.");
      else if (data.error === "You are not the winner of this giveaway") setMsg("You are not the winner of this giveaway.");
      else setMsg(data.error ?? "Failed to claim.");
    }
    setClaimLoading(false);
  }

  async function markOneAsRead(item: FeedItem) {
    if (!userId) return;
    if (item.type === "admin") {
      const { error } = await supabase
        .from("system_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", item.payload.id)
        .eq("user_id", userId)
        .eq("is_read", false);
      if (!error) window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
      setMsg(error ? error.message : null);
      setActiveTab("read");
      await load();
      return;
    }
    if (!clientReadKeys.includes(item.key)) {
      const next = [...clientReadKeys, item.key];
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(`notif_read_keys_${userId}`) : null;
      const existing: { key: string; readAt: number }[] = raw ? (JSON.parse(raw) as { key: string; readAt: number }[]) : [];
      saveClientReadKeys(userId, next, existing);
      setClientReadKeys(next);
      setActiveTab("read");
    }
  }

  const filteredByCategory = items.filter(item =>
    activeCategory === "all" || getItemCategory(item, userId) === activeCategory
  );
  const unreadCount = filteredByCategory.filter(item => !isItemRead(item)).length;
  const readCount = filteredByCategory.filter(item => isItemRead(item)).length;
  const visibleItems = filteredByCategory.filter(item =>
    activeTab === "all" ? true : activeTab === "unread" ? !isItemRead(item) : isItemRead(item)
  );

  const catCounts = {
    manuscript:   items.filter(i => getItemCategory(i, userId) === "manuscript"   && !isItemRead(i)).length,
    beta_reading: items.filter(i => getItemCategory(i, userId) === "beta_reading" && !isItemRead(i)).length,
    social:       items.filter(i => getItemCategory(i, userId) === "social"        && !isItemRead(i)).length,
    admin:        items.filter(i => getItemCategory(i, userId) === "admin"         && !isItemRead(i)).length,
  };
  const allUnreadCount = items.filter(i => !isItemRead(i)).length;

  // ── Per-category button color schemes ──────────────────────────────────────
  const CAT_BTN: Record<"manuscript" | "beta_reading" | "social" | "admin", string> = {
    manuscript:   "border-purple-600/70 bg-purple-950/30 text-purple-200 hover:bg-purple-900/40",
    beta_reading: "border-blue-600/70 bg-blue-950/30 text-blue-200 hover:bg-blue-900/40",
    social:       "border-pink-600/70 bg-pink-950/30 text-pink-200 hover:bg-pink-900/40",
    admin:        "border-amber-600/70 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40",
  };
  const CAT_MARK_READ: Record<"manuscript" | "beta_reading" | "social" | "admin", string> = {
    manuscript:   "border-purple-800/40 text-purple-400 hover:bg-purple-950/30",
    beta_reading: "border-blue-800/40 text-blue-400 hover:bg-blue-950/30",
    social:       "border-pink-800/40 text-pink-400 hover:bg-pink-950/30",
    admin:        "border-amber-800/40 text-amber-400 hover:bg-amber-950/30",
  };

  function renderItem(item: FeedItem) {
    const cat = getItemCategory(item, userId);

    if (item.type === "feedback") {
      const f = item.payload;
      const fromMe = f.reader_id === userId;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-sm font-medium text-neutral-100">
            {fromMe ? "Your feedback on" : "New feedback on"} {manuscriptTitles[f.manuscript_id] ?? "a manuscript"}
          </p>
          <p className="mt-1 text-sm text-neutral-300">{f.comment_text}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {fromMe ? "You" : `From ${names[f.reader_id] ?? "Reader"}`} | {new Date(f.created_at).toLocaleString()}
          </p>
          {!isItemRead(item) && (
            <button
              onClick={() => void markOneAsRead(item)}
              className={`mt-3 mr-2 inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
            >
              Mark as read
            </button>
          )}
          <Link
            href={
              fromMe
                ? `/manuscripts/${encodeURIComponent(f.manuscript_id)}${f.chapter_id ? `?chapter=${encodeURIComponent(f.chapter_id)}` : ""}`
                : `/manuscripts/${encodeURIComponent(f.manuscript_id)}/details?${f.chapter_id ? `chapter=${encodeURIComponent(f.chapter_id)}&` : ""}feedback=${encodeURIComponent(f.id)}`
            }
            onClick={() => void markOneAsRead(item)}
            className={`mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}
          >
            View Feedback
          </Link>
        </li>
      );
    }

    if (item.type === "reply") {
      const r = item.payload;
      const baseFeedback = feedbackMap[r.feedback_id];
      const manuscriptId = baseFeedback?.manuscript_id;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-sm font-medium text-neutral-100">
            New comment on feedback for {manuscriptId ? manuscriptTitles[manuscriptId] ?? "your manuscript" : "your manuscript"}
          </p>
          <p className="mt-1 text-sm text-neutral-300">{r.body}</p>
          <p className="mt-2 text-xs text-neutral-500">
            From {names[r.replier_id] ?? "Reader"} | {new Date(r.created_at).toLocaleString()}
          </p>
          {!isItemRead(item) && (
            <button
              onClick={() => void markOneAsRead(item)}
              className={`mt-3 mr-2 inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
            >
              Mark as read
            </button>
          )}
          {manuscriptId && (
            <Link
              href={`/manuscripts/${encodeURIComponent(manuscriptId)}${baseFeedback?.chapter_id ? `?chapter=${encodeURIComponent(baseFeedback.chapter_id)}` : ""}`}
              onClick={() => void markOneAsRead(item)}
              className={`mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}
            >
              View Comment
            </Link>
          )}
        </li>
      );
    }

    if (item.type === "read_request") {
      const r = item.payload;
      const requesterName = names[r.requester_id] ?? "A reader";
      const requesterAvatar = userAvatars[r.requester_id] ?? null;
      const requesterUsername = userUsernames[r.requester_id] ?? null;
      const profileHref = requesterUsername ? `/u/${requesterUsername}` : null;

      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-sm font-medium text-neutral-100">
            Read request for <span className="text-[rgba(210,210,210,0.9)]">{manuscriptTitles[r.manuscript_id] ?? "your manuscript"}</span>
          </p>

          {/* Requester profile row */}
          <div className="mt-3 flex items-center gap-3">
            {profileHref ? (
              <Link href={profileHref} className="flex items-center gap-2 group">
                {requesterAvatar ? (
                  <Image
                    src={requesterAvatar}
                    alt={requesterName}
                    width={36}
                    height={36}
                   
                    className="h-9 w-9 rounded-full border border-neutral-700 object-cover group-hover:border-[rgba(120,120,120,0.7)] transition"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-sm font-semibold text-neutral-300 group-hover:border-[rgba(120,120,120,0.7)] transition">
                    {requesterName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-neutral-200 group-hover:text-white group-hover:underline transition">
                  {requesterName}
                </span>
                <span className="text-xs text-[rgba(120,120,120,0.7)] group-hover:text-[rgba(120,120,120,0.9)] transition">
                  View profile →
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-sm font-semibold text-neutral-300">
                  {requesterName.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-neutral-200">{requesterName}</span>
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-neutral-500">{new Date(r.created_at).toLocaleString()}</p>
          {r.status === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => { void approveRequest(r); void markOneAsRead(item); }}
                className={`inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition ${CAT_BTN[cat]}`}
              >
                Approve
              </button>
              <button
                onClick={() => { void denyRequest(r); void markOneAsRead(item); }}
                className="inline-flex h-9 items-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-300 hover:border-neutral-600/60 hover:text-neutral-400 transition"
              >
                Deny
              </button>
              {!isItemRead(item) && (
                <button
                  onClick={() => void markOneAsRead(item)}
                  className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
                >
                  Mark as read
                </button>
              )}
            </div>
          ) : (
            <p className={`mt-2 text-xs font-medium ${r.status === "approved" ? "text-[rgba(120,120,120,0.9)]" : "text-neutral-500"}`}>
              {r.status === "approved" ? "Approved" : "Denied"}
            </p>
          )}
        </li>
      );
    }

    if (item.type === "moderation") {
      const m = item.payload;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-sm font-medium text-neutral-100">
            Moderation update for {manuscriptTitles[m.manuscript_id] ?? "your manuscript"}
          </p>
          <p className="mt-1 text-sm text-neutral-300">{m.reason}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Matched terms: {(m.matched_terms ?? []).join(", ") || "-"}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            {new Date(m.created_at).toLocaleString()} | {m.status}
          </p>
          {!isItemRead(item) && (
            <button
              onClick={() => void markOneAsRead(item)}
              className={`mt-3 mr-2 inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
            >
              Mark as read
            </button>
          )}
          <Link
            href={`/manuscripts/${encodeURIComponent(m.manuscript_id)}`}
            onClick={() => void markOneAsRead(item)}
            className={`mt-3 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}
          >
            Open Manuscript
          </Link>
        </li>
      );
    }

    if (item.type === "invitation") {
      const inv = item.payload;
      const authorName = names[inv.invited_by] ?? "An author";
      const manuscriptTitle = manuscriptTitles[inv.manuscript_id] ?? "a manuscript";
      const isPending = inv.status === "pending";
      const isResponding = respondingTo === inv.id;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-[rgba(120,120,120,0.3)] bg-neutral-900/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-neutral-100">Beta reading invitation</p>
            {!isPending && (
              <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium ${
                inv.status === "accepted"
                  ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-400"
                  : "border-neutral-700 bg-neutral-900/60 text-neutral-500"
              }`}>
                {inv.status === "accepted" ? "Accepted" : "Declined"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-300">
            <span className="text-[rgba(210,210,210,0.85)]">{authorName}</span> has invited you to beta read{" "}
            <span className="font-medium text-neutral-100">&ldquo;{manuscriptTitle}&rdquo;</span>.
          </p>
          <p className="mt-2 text-xs text-neutral-500">{new Date(inv.created_at).toLocaleString()}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/manuscripts/${encodeURIComponent(inv.manuscript_id)}`}
              className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}
            >
              View Manuscript
            </Link>
            {isPending && (
              <>
                <button
                  onClick={() => { void acceptInvitation(inv); void markOneAsRead(item); }}
                  disabled={isResponding}
                  className={`inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50 transition ${CAT_BTN[cat]}`}
                >
                  {isResponding ? "Saving…" : "Accept"}
                </button>
                <button
                  onClick={() => { void declineInvitation(inv); void markOneAsRead(item); }}
                  disabled={isResponding}
                  className="inline-flex h-9 items-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-400 hover:border-neutral-600/50 hover:text-neutral-400 disabled:opacity-50 transition"
                >
                  {isResponding ? "Saving…" : "Decline"}
                </button>
              </>
            )}
            {!isItemRead(item) && (
              <button
                onClick={() => void markOneAsRead(item)}
                className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
              >
                Mark as read
              </button>
            )}
          </div>
        </li>
      );
    }

    if (item.type === "new_follower") {
      const f = item.payload;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex items-center gap-3">
            {f.avatarUrl ? (
              <Image src={f.avatarUrl} alt={f.name} width={36} height={36} className="h-9 w-9 rounded-full border border-neutral-700 object-cover shrink-0" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-sm font-semibold text-neutral-300 shrink-0">{f.name.charAt(0).toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">
                {f.username ? <Link href={`/u/${f.username}`} className="hover:underline">{f.name}</Link> : f.name}{" "}
                started following you
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">{new Date(item.created_at).toLocaleString()}</p>
            </div>
          </div>
          {!isItemRead(item) && (
            <button onClick={() => void markOneAsRead(item)} className={`mt-3 inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}>
              Mark as read
            </button>
          )}
        </li>
      );
    }

    if (item.type === "ann_like") {
      const l = item.payload;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex items-center gap-3">
            {l.likerAvatar ? (
              <Image src={l.likerAvatar} alt={l.likerName} width={36} height={36} className="h-9 w-9 rounded-full border border-neutral-700 object-cover shrink-0" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-sm font-semibold text-neutral-300 shrink-0">{l.likerName.charAt(0).toUpperCase()}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">
                {l.likerUsername ? <Link href={`/u/${l.likerUsername}`} className="hover:underline">{l.likerName}</Link> : l.likerName}{" "}
                liked your announcement
              </p>
              {l.announcementExcerpt && <p className="mt-0.5 text-xs text-neutral-400 italic truncate">&ldquo;{l.announcementExcerpt}&rdquo;</p>}
              <p className="mt-0.5 text-xs text-neutral-500">{new Date(item.created_at).toLocaleString()}</p>
            </div>
          </div>
          {!isItemRead(item) && (
            <button onClick={() => void markOneAsRead(item)} className={`mt-3 inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}>
              Mark as read
            </button>
          )}
        </li>
      );
    }

    if (item.type === "followed_ann") {
      const a = item.payload;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex items-center gap-2.5 mb-2">
            {a.authorAvatar ? (
              <Image src={a.authorAvatar} alt={a.authorName} width={28} height={28} className="h-7 w-7 rounded-full border border-neutral-700 object-cover shrink-0" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-xs font-semibold text-neutral-300 shrink-0">{a.authorName.charAt(0).toUpperCase()}</span>
            )}
            <p className="text-sm font-medium text-neutral-100">
              {a.authorUsername ? <Link href={`/u/${a.authorUsername}`} className="hover:underline">{a.authorName}</Link> : a.authorName}{" "}
              posted an announcement
            </p>
          </div>
          <p className="text-sm text-neutral-300 line-clamp-2 whitespace-pre-line">{a.content}</p>
          <p className="mt-2 text-xs text-neutral-500">{new Date(item.created_at).toLocaleString()}</p>
          <div className="mt-3 flex gap-2 flex-wrap">
            {a.authorUsername && (
              <Link href={`/u/${a.authorUsername}`} onClick={() => void markOneAsRead(item)}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}>
                View Profile
              </Link>
            )}
            {!isItemRead(item) && (
              <button onClick={() => void markOneAsRead(item)} className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}>
                Mark as read
              </button>
            )}
          </div>
        </li>
      );
    }

    if (item.type === "friend_request") {
      const fr = item.payload;
      const isActing = friendRequestAction === fr.senderId;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300">Friend Request</p>
          <div className="mt-3 flex items-center gap-3">
            {fr.avatarUrl ? (
              <Image
                src={fr.avatarUrl}
                alt={fr.penName}
                width={36}
                height={36}
               
                className="h-9 w-9 shrink-0 rounded-full border border-neutral-700 object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-sm font-semibold text-neutral-300">
                {fr.penName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {fr.username ? (
                <Link href={`/u/${fr.username}`} className="text-sm font-medium text-neutral-100 hover:underline truncate block">
                  {fr.penName}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium text-neutral-100">{fr.penName}</p>
              )}
              <p className="mt-0.5 text-xs text-neutral-500">{new Date(item.created_at).toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { void acceptFriendRequest(fr.senderId); void markOneAsRead(item); }}
              disabled={!!friendRequestAction}
              className={`inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50 transition ${CAT_BTN[cat]}`}
            >
              {isActing ? "…" : "Accept"}
            </button>
            <button
              onClick={() => { void denyFriendRequest(fr.senderId); void markOneAsRead(item); }}
              disabled={!!friendRequestAction}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-300 hover:border-neutral-600/60 hover:text-neutral-400 disabled:opacity-50 transition"
            >
              {isActing ? "…" : "Deny"}
            </button>
            {!isItemRead(item) && (
              <button
                onClick={() => void markOneAsRead(item)}
                className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
              >
                Mark as read
              </button>
            )}
          </div>
        </li>
      );
    }

    // Feedback reply notification - author replied to beta reader's feedback
    if (item.type === "admin" && item.payload.category === "feedback_reply") {
      const n = item.payload;
      const manuscriptId = n.metadata?.manuscript_id as string | undefined;
      const chapterId = n.metadata?.chapter_id as string | undefined;
      const viewHref = manuscriptId
        ? `/manuscripts/${encodeURIComponent(manuscriptId)}${chapterId ? `?chapter=${encodeURIComponent(chapterId)}` : ""}`
        : null;
      return (
        <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-sm font-medium text-neutral-100">{n.title}</p>
          {n.body && <p className="mt-1 text-sm text-neutral-300">{n.body}</p>}
          <p className="mt-2 text-xs text-neutral-500">{new Date(n.created_at).toLocaleString()}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!isItemRead(item) && (
              <button
                onClick={() => void markOneAsRead(item)}
                className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
              >
                Mark as read
              </button>
            )}
            {viewHref && (
              <Link
                href={viewHref}
                onClick={() => void markOneAsRead(item)}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${CAT_BTN[cat]}`}
              >
                View Comment →
              </Link>
            )}
          </div>
        </li>
      );
    }

    const n = item.payload;
    const rewardCoins = n.metadata?.reward_coins;
    const announcementId = n.metadata?.announcement_id;
    const giveawayPostId = n.metadata?.giveaway_post_id;
    const claimId = giveawayPostId ?? announcementId;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const elapsedMs = rewardCoins && claimId ? now - new Date(item.created_at).getTime() : 0;
    const remainingMs = SEVEN_DAYS_MS - elapsedMs;
    const isExpired = !!(rewardCoins && claimId && remainingMs <= 0);
    const alreadyClaimed = !!(rewardCoins && claimId && claimedIds.has(claimId));
    const canClaim = !!(rewardCoins && claimId && !alreadyClaimed && !isExpired);

    function claimCountdownLabel(): { text: string; color: string } {
      if (remainingMs <= 0) return { text: "Reward expired", color: "text-neutral-600" };
      const totalMins = Math.floor(remainingMs / 60_000);
      const days = Math.floor(totalMins / 1440);
      const hours = Math.floor((totalMins % 1440) / 60);
      const mins = totalMins % 60;
      let text: string;
      if (days > 1) text = `${days}d ${hours}h left to claim`;
      else if (days === 1) text = `1d ${hours}h left to claim`;
      else if (hours > 0) text = `${hours}h ${mins}m left to claim`;
      else text = `${mins}m left to claim`;
      const color = days >= 3 ? "text-emerald-500" : days >= 1 ? "text-amber-400" : "text-red-400";
      return { text, color };
    }

    return (
      <li key={item.key} className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="text-sm font-medium text-neutral-100">
          {n.title.split("✿").map((part, i) =>
            i === 0 ? part : <span key={i}><span style={{ color: "#f59e0b" }}>✿</span>{part}</span>
          )}
        </p>
        <p className="mt-1 text-sm text-neutral-300">{n.body}</p>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <p className="text-xs text-neutral-500">{new Date(n.created_at).toLocaleString()}</p>
          {rewardCoins && claimId && (
            alreadyClaimed ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="6" cy="6" r="5" /><path d="M3.5 6l2 2 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Reward claimed
              </span>
            ) : (() => {
              const { text, color } = claimCountdownLabel();
              return (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="6" cy="6" r="5" /><path d="M6 3v3l2 1.5" strokeLinecap="round" />
                  </svg>
                  {text}
                </span>
              );
            })()
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {!isItemRead(item) && (
            <button
              onClick={() => void markOneAsRead(item)}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs transition ${CAT_MARK_READ[cat]}`}
            >
              Mark as read
            </button>
          )}
          {(n.metadata as { link?: string } | null)?.link && (
            <Link
              href={(n.metadata as { link: string }).link}
              onClick={() => void markOneAsRead(item)}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${CAT_BTN[cat]}`}
            >
              View Message →
            </Link>
          )}
          {n.title === "Someone replied to your comment" && n.metadata?.post_id && (
            <Link
              href={`/${n.metadata.community === "youth" ? "youth-community" : "community"}?post=${n.metadata.post_id}`}
              onClick={() => void markOneAsRead(item)}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${CAT_BTN[cat]}`}
            >
              Reply in Thread →
            </Link>
          )}
          {n.category === "conduct_appeal" && isAdmin && (
            <Link
              href="/admin?tab=appeals"
              onClick={() => void markOneAsRead(item)}
              className="inline-flex h-8 items-center rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 text-xs text-amber-300 hover:bg-amber-900/30 transition"
            >
              Go to Appeals →
            </Link>
          )}
          {(n.metadata as { gift_link?: string } | null)?.gift_link && (
            <Link
              href={(n.metadata as { gift_link: string }).gift_link}
              onClick={() => void markOneAsRead(item)}
              className="inline-flex h-8 items-center rounded-lg border border-violet-700/50 bg-violet-950/20 px-3 text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-900/30 transition"
            >
              Send Coins →
            </Link>
          )}
          {n.metadata?.profile_username && !rewardCoins && (
            <Link
              href={`/u/${n.metadata.profile_username}`}
              onClick={() => void markOneAsRead(item)}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${CAT_BTN[cat]}`}
            >
              View Announcement →
            </Link>
          )}
          {canClaim && (
            <button
              onClick={() => setClaimConfirm(giveawayPostId ? { giveawayPostId, rewardCoins: rewardCoins! } : { announcementId: announcementId!, rewardCoins: rewardCoins! })}
              disabled={claimLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 text-sm font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-50 transition"
            >
              <span style={{ color: "#f59e0b" }}>✿</span>
              {`Claim ${rewardCoins} Bloom Coins`}
            </button>
          )}
          {isExpired && !alreadyClaimed && (
            <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-800 px-3 text-xs text-neutral-600">
              <span style={{ color: "rgba(120,120,120,0.4)" }}>✿</span> Reward expired
            </span>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32 lg:px-6 lg:pt-16">
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-2 text-neutral-300">
          Feedback, line edit recommendations, comments, read requests, and admin updates.
        </p>

        {msg ? (
          <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4 text-sm text-neutral-200">
            {msg}
          </div>
        ) : null}

        {/* Filter bar - dropdown menus */}
        <div className="mt-6 flex items-center gap-3 flex-wrap">

          {/* Category dropdown */}
          <div className="relative" ref={catMenuRef}>
            <button
              onClick={() => { setCatMenuOpen(o => !o); setTabMenuOpen(false); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-4 text-sm font-medium text-neutral-100 transition hover:border-[rgba(120,120,120,0.65)] hover:bg-[rgba(120,120,120,0.18)]"
            >
              <span>
                {activeCategory === "all" ? "All" : activeCategory === "beta_reading" ? "Beta Reading" : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}
              </span>
              {(activeCategory === "all" ? allUnreadCount : catCounts[activeCategory as keyof typeof catCounts]) > 0 && (
                <span className="rounded-full bg-[rgba(120,120,120,0.35)] px-1.5 py-0.5 text-xs">
                  {activeCategory === "all" ? allUnreadCount : catCounts[activeCategory as keyof typeof catCounts]}
                </span>
              )}
              <svg className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${catMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {catMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-[rgba(120,120,120,0.35)] bg-neutral-900 shadow-2xl">
                {(["all", "manuscript", "beta_reading", "social", "admin"] as Category[]).map((cat) => {
                  const label = cat === "all" ? "All" : cat === "beta_reading" ? "Beta Reading" : cat.charAt(0).toUpperCase() + cat.slice(1);
                  const count = cat === "all" ? allUnreadCount : catCounts[cat as keyof typeof catCounts];
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setCatMenuOpen(false); }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm transition ${
                        activeCategory === cat
                          ? "bg-[rgba(120,120,120,0.18)] text-white"
                          : "text-neutral-300 hover:bg-[rgba(120,120,120,0.12)] hover:text-neutral-100"
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className="rounded-full bg-[rgba(120,120,120,0.3)] px-1.5 py-0.5 text-xs">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status dropdown */}
          <div className="relative" ref={tabMenuRef}>
            <button
              onClick={() => { setTabMenuOpen(o => !o); setCatMenuOpen(false); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-4 text-sm font-medium text-neutral-100 transition hover:border-[rgba(120,120,120,0.65)] hover:bg-[rgba(120,120,120,0.18)]"
            >
              <span>{activeTab === "all" ? "All" : activeTab === "unread" ? "Unread" : "Read"}</span>
              {activeTab !== "all" && (activeTab === "unread" ? unreadCount : readCount) > 0 && (
                <span className="rounded-full bg-[rgba(120,120,120,0.35)] px-1.5 py-0.5 text-xs">
                  {activeTab === "unread" ? unreadCount : readCount}
                </span>
              )}
              <svg className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${tabMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {tabMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[140px] overflow-hidden rounded-xl border border-[rgba(120,120,120,0.35)] bg-neutral-900 shadow-2xl">
                {([
                  { value: "all" as const, label: "All" },
                  { value: "unread" as const, label: "Unread", count: unreadCount },
                  { value: "read" as const, label: "Read", count: readCount },
                ]).map(({ value, label, count }) => (
                  <button
                    key={value}
                    onClick={() => { setActiveTab(value); setTabMenuOpen(false); }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-sm transition ${
                      activeTab === value
                        ? "bg-[rgba(120,120,120,0.18)] text-white"
                        : "text-neutral-300 hover:bg-[rgba(120,120,120,0.12)] hover:text-neutral-100"
                    }`}
                  >
                    {label}
                    {count != null && count > 0 && (
                      <span className="rounded-full bg-[rgba(120,120,120,0.25)] px-1.5 py-0.5 text-xs">{count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mark all as read */}
          <button
            className="inline-flex h-10 items-center rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 text-sm text-neutral-300 transition disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-[rgba(120,120,120,0.5)] enabled:hover:text-neutral-100"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </button>
        </div>

        <section className="mt-6 w-0 min-w-full">
          {loading ? (
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6 text-sm text-neutral-300">
              Loading...
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6 text-sm text-neutral-300">
              {activeTab === "unread" ? "No unread notifications." : activeTab === "read" ? "No read notifications yet." : "No notifications."}
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleItems.map((item) => renderItem(item))}
            </ul>
          )}
        </section>
      </div>

      {/* Claim coins confirmation modal */}
      {claimConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-900 p-6 shadow-2xl">
            <p className="text-base font-semibold text-neutral-100">
              Claim <span style={{ color: "#f59e0b" }}>✿</span> {claimConfirm.rewardCoins} Bloom Coins?
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              These coins will be added to your wallet. Each announcement reward can only be claimed once within 7 days of posting.
            </p>
            <div className="mt-5 flex gap-3 justify-end">
              <button
                onClick={() => setClaimConfirm(null)}
                disabled={claimLoading}
                className="inline-flex h-9 items-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => claimConfirm.giveawayPostId
                  ? void claimGiveaway(claimConfirm.giveawayPostId, claimConfirm.rewardCoins)
                  : void claimCoins(claimConfirm.announcementId!, claimConfirm.rewardCoins)
                }
                disabled={claimLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 text-sm font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-50 transition"
              >
                {claimLoading ? "Claiming…" : `Accept & Claim ${claimConfirm.rewardCoins} Coins`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
