"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { useDeactivationGuard } from "@/lib/useDeactivationGuard";
import ReportModal from "@/components/ReportModal";
import NotesPanel from "@/components/NotesPanel";

type Msg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
};

type ModerationStatus = {
  age_category?: string | null;
  conduct_strikes: number | null;
  messaging_suspended_until: string | null;
  blacklisted: boolean | null;
  appeal_requested: boolean | null;
  has_unacknowledged_violation?: boolean | null;
  lifetime_suspension_count?: number | null;
  parent_report_restricted?: boolean | null;
} | null;

type AppealStatus = {
  id: string;
  status: string;
  admin_note: string | null;
  created_at: string;
} | null;

type FriendRequest = {
  sender_id: string;
  receiver_id: string;
  status: string;
};

type HiddenThreadRow = {
  partner_id: string;
  hidden_at: string;
};

type PublicProfile = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

type Friend = {
  userId: string;
  penName: string;
  avatarUrl: string | null;
  lastMessageAt: number; // unix ms, 0 if never messaged
  unreadCount: number;
};


const TRIGGER_LABELS: Record<string, string> = {
  solicitation: "Soliciting other members for paid work or external opportunities",
  social_media: "Sharing external social media handles or links (youth accounts)",
  cursing: "Use of prohibited language (youth accounts)",
  foul_language: "Severely offensive language (youth accounts)",
  sexual_language: "Sexual or explicit language (youth accounts)",
};

function Avatar({ name, url, size = 7 }: { name: string; url: string | null; size?: number }) {
  const cls = `h-${size} w-${size} rounded-full border border-neutral-700 object-cover`;
  const fallbackCls = `flex h-${size} w-${size} items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/60 text-xs text-neutral-300`;
  return url ? (
    <Image src={url} alt={`${name} avatar`} width={28} height={28} className={cls} />
  ) : (
    <span className={fallbackCls}>{name.charAt(0).toUpperCase()}</span>
  );
}

function MessagesPageInner() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  useDeactivationGuard(supabase);
  const searchParams = useSearchParams();
  const withUser = searchParams.get("with") ?? "";
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
const [targetIsYouth, setTargetIsYouth] = useState(false);
const [_excludedFromMessaging, setExcludedFromMessaging] = useState<string[]>([]);
const [msg, setMsg] = useState<string | null>(null);
const [status, setStatus] = useState<ModerationStatus>(null);
const [now] = useState(() => Date.now());
  const [recipientInput, setRecipientInput] = useState("");
  const [withUserLabel, setWithUserLabel] = useState<string>("");
  const [withUserAvatar, setWithUserAvatar] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [hiddenFriends, setHiddenFriends] = useState<Friend[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Friend[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string } | null>(null);
  const [violationModal, setViolationModal] = useState<{ message: string; triggers: string[]; consequence: string } | null>(null);
  const [latestAppeal, setLatestAppeal] = useState<AppealStatus>(null);
  const [appealModal, setAppealModal] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealMsg, setAppealMsg] = useState<string | null>(null);
  const [prAppealModal, setPrAppealModal] = useState(false);
  const [prAppealReason, setPrAppealReason] = useState("");
  const [prAppealSubmitting, setPrAppealSubmitting] = useState(false);
  const [prAppealMsg, setPrAppealMsg] = useState<string | null>(null);
  const [prAppealSubmitted, setPrAppealSubmitted] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [myManuscripts, setMyManuscripts] = useState<{ id: string; title: string }[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inboxChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);

  const EMOJIS = [
    "😀","😂","😍","🥰","😎","😢","😡","🤔","😴","🤯",
    "👍","👎","👏","🙌","🤝","🙏","💪","👀","🫶","❤️",
    "🔥","✨","🎉","💯","😭","😅","🤣","😇","🥳","😏",
    "😬","🤦","🤷","💀","👻","🎶","📚","✍️","💬","🌹",
    "🌙","⭐","🎭","🖊️","📖","🌸","🦋","🌊","☕","🍀",
  ];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojis(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const blocked =
    !!status?.blacklisted ||
    (!!status?.messaging_suspended_until && new Date(status.messaging_suspended_until).getTime() > now);
  const youthLocked = status?.age_category === "youth_13_17";

  const sidebarLoadedRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const excludedRef = useRef<string[]>([]);
  const activeTargetRef = useRef<string>("");
  const hiddenFriendsRef = useRef<Friend[]>([]);

  async function loadSidebar(signedInUserId: string) {
    const [hiddenThreadsRes, blockedReqRes, statusRes] = await Promise.all([
      supabase
        .from("hidden_message_threads")
        .select("partner_id, hidden_at")
        .eq("user_id", signedInUserId),
      supabase
        .from("profile_friend_requests")
        .select("sender_id, receiver_id, status")
        .or(`sender_id.eq.${signedInUserId},receiver_id.eq.${signedInUserId}`)
        .eq("status", "blocked"),
      fetch("/api/messages/status"),
    ]);

    const statusJson = (await statusRes.json()) as {
      status?: ModerationStatus;
      pendingViolation?: { message: string; triggers: string[]; consequence: string } | null;
      latestAppeal?: AppealStatus;
      excludedFromMessaging?: string[];
    };
    if (statusRes.ok) {
      setStatus(statusJson.status ?? null);
      setLatestAppeal(statusJson.latestAppeal ?? null);
      const excl = statusJson.excludedFromMessaging ?? [];
      setExcludedFromMessaging(excl);
      excludedRef.current = excl;
      if (statusJson.pendingViolation) setViolationModal(statusJson.pendingViolation);
    }

    if (statusJson.status?.age_category === "youth_13_17") {
      setMessages([]);
      setWithUserLabel("");
      return;
    }

    const excluded = statusJson.excludedFromMessaging ?? [];

    const hiddenRows = (hiddenThreadsRes.data as HiddenThreadRow[] | null) ?? [];
    const blockedRows = (blockedReqRes.data as FriendRequest[] | null) ?? [];

    const hiddenMap = new Map<string, number>();
    for (const row of hiddenRows) {
      hiddenMap.set(row.partner_id, new Date(row.hidden_at).getTime());
    }

    const blockedIds = Array.from(new Set(blockedRows.map((r) => r.sender_id === signedInUserId ? r.receiver_id : r.sender_id)));

    // Fetch conversation partners + supporting data in parallel
    // Uses an RPC to get distinct partners - avoids the PostgREST 1000-row cap
    // that caused old conversations to disappear.
    const [blockedProfilesRes, partnersRes] = await Promise.all([
      blockedIds.length > 0
        ? supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", blockedIds)
        : Promise.resolve({ data: [] }),
      supabase.rpc("get_conversation_partners", { p_user_id: signedInUserId }),
    ]);

    type PartnerRow = { partner_id: string; last_message_at: string; unread_count: number };
    const partnerRows = (partnersRes.data as PartnerRow[] | null) ?? [];

    const lastMsgMap = new Map<string, number>();
    const unreadMap = new Map<string, number>();
    const conversationPartnerIds: string[] = [];
    for (const row of partnerRows) {
      lastMsgMap.set(row.partner_id, new Date(row.last_message_at).getTime());
      unreadMap.set(row.partner_id, row.unread_count);
      conversationPartnerIds.push(row.partner_id);
    }

    // Filter out blocked and age-restricted users from conversation list.
    // Hidden threads stay hidden until a newer message arrives after hidden_at.
    const activeConversationIds = conversationPartnerIds.filter((id) => {
      if (blockedIds.includes(id) || excluded.includes(id)) return false;
      const hiddenAt = hiddenMap.get(id);
      const lastMessageAt = lastMsgMap.get(id) ?? 0;
      return !hiddenAt || lastMessageAt > hiddenAt;
    });

    const hiddenConversationIds = conversationPartnerIds.filter((id) => {
      if (blockedIds.includes(id) || excluded.includes(id)) return false;
      const hiddenAt = hiddenMap.get(id);
      const lastMessageAt = lastMsgMap.get(id) ?? 0;
      return !!hiddenAt && lastMessageAt <= hiddenAt;
    });

    // Fetch profiles for all conversation partners regardless of friend status
    const [profilesRes, hiddenProfilesRes] = await Promise.all([
      activeConversationIds.length > 0
        ? supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", activeConversationIds)
        : Promise.resolve({ data: [] }),
      hiddenConversationIds.length > 0
        ? supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", hiddenConversationIds)
        : Promise.resolve({ data: [] }),
    ]);

    const mapped: Friend[] = ((profilesRes.data as PublicProfile[] | null) ?? []).map((p) => ({
      userId: p.user_id,
      penName: p.pen_name || (p.username ? `@${p.username}` : "User"),
      avatarUrl: p.avatar_url ?? null,
      lastMessageAt: lastMsgMap.get(p.user_id) ?? 0,
      unreadCount: unreadMap.get(p.user_id) ?? 0,
    }));
    mapped.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    setFriends(mapped);

    const nextHiddenFriends = ((hiddenProfilesRes.data as PublicProfile[] | null) ?? []).map((p) => ({
      userId: p.user_id, penName: p.pen_name || (p.username ? `@${p.username}` : "Friend"),
      avatarUrl: p.avatar_url ?? null, lastMessageAt: lastMsgMap.get(p.user_id) ?? 0, unreadCount: unreadMap.get(p.user_id) ?? 0,
    }));
    hiddenFriendsRef.current = nextHiddenFriends;
    setHiddenFriends(nextHiddenFriends);

    setBlockedUsers(((blockedProfilesRes.data as PublicProfile[] | null) ?? []).map((p) => ({
      userId: p.user_id, penName: p.pen_name || (p.username ? `@${p.username}` : "Friend"),
      avatarUrl: p.avatar_url ?? null, lastMessageAt: 0, unreadCount: 0,
    })));

    sidebarLoadedRef.current = true;
    setSidebarLoading(false);
  }

  async function markAsRead(senderId: string) {
    const receiverId = myIdRef.current;
    if (!receiverId) return;
    await supabase
      .from("direct_messages")
      .update({ status: "read" })
      .eq("sender_id", senderId)
      .eq("receiver_id", receiverId)
      .eq("status", "sent");
    // Clear the message system notification for this sender
    await supabase
      .from("system_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", receiverId)
      .eq("is_read", false)
      .like("dedupe_key", `dm-thread-${senderId}-%`);
    window.dispatchEvent(new CustomEvent("notif-badge-refresh"));
    // Clear unread badge in sidebar
    setFriends((prev) =>
      prev.map((f) => f.userId === senderId ? { ...f, unreadCount: 0 } : f)
    );
  }

  async function loadChat(targetId: string, currentExcluded: string[]) {
    activeTargetRef.current = targetId;
    if (currentExcluded.includes(targetId)) {
      setTargetIsYouth(true);
      setMessages([]);
      return;
    }
    setTargetIsYouth(false);
    setMessages([]);

    const [profileRes, threadRes] = await Promise.all([
      supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").eq("user_id", targetId).maybeSingle(),
      fetch(`/api/messages/thread?with=${encodeURIComponent(targetId)}`),
    ]);

    if (activeTargetRef.current !== targetId) return;

    const p = (profileRes.data as PublicProfile | null) ?? null;
    setWithUserLabel(p?.pen_name || (p?.username ? `@${p.username}` : "Selected user"));
    setWithUserAvatar(p?.avatar_url ?? null);

    const json = (await threadRes.json()) as { messages?: Msg[]; error?: string; hasMore?: boolean };
    if (!threadRes.ok) { setMsg(json.error ?? "Failed to load messages."); return; }
    setMessages(json.messages ?? []);
    setHasMoreMessages(json.hasMore ?? false);
    void markAsRead(targetId);
  }

  // Initial load: auth + sidebar + first chat
  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      setMyId(auth.user?.id ?? null);
      myIdRef.current = auth.user?.id ?? null;
      if (!auth.user) return;

      const [selfProfile] = await Promise.all([
        supabase.from("public_profiles").select("avatar_url").eq("user_id", auth.user.id).maybeSingle(),
      ]);
      setMyAvatarUrl((selfProfile.data as { avatar_url: string | null } | null)?.avatar_url ?? null);

      // Load user's manuscripts for the notes project selector
      const { data: msData } = await supabase
        .from("manuscripts")
        .select("id, title")
        .eq("owner_id", auth.user.id)
        .order("created_at", { ascending: false });
      setMyManuscripts((msData as { id: string; title: string }[] | null) ?? []);

      await loadSidebar(auth.user.id);

      if (withUser) {
        initialScrollDoneRef.current = false;
        await loadChat(withUser, excludedRef.current);
      } else {
        setMessages([]);
        setWithUserLabel("");
        setWithUserAvatar(null);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: runs once on mount; loadSidebar/loadChat are component functions, not reactive deps
  }, []);

  // Inbox watcher - updates sidebar unread badge when a message arrives from
  // someone other than the currently open conversation
  useEffect(() => {
    if (!myId) return;
    if (inboxChannelRef.current) void supabase.removeChannel(inboxChannelRef.current);
    inboxChannelRef.current = supabase
      .channel(`inbox-badge-${myId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${myId}` },
        (payload: { new: Record<string, unknown> }) => {
          const m = payload.new as { sender_id: string; receiver_id: string; status: string; created_at?: string };
          const lastMessageAt = m.created_at ? new Date(m.created_at).getTime() : Date.now();
          const revealHidden = hiddenFriendsRef.current.find((f) => f.userId === m.sender_id);
          if (revealHidden) {
            setHiddenFriends((prev) => {
              const next = prev.filter((f) => f.userId !== m.sender_id);
              hiddenFriendsRef.current = next;
              return next;
            });
            setFriends((prev) => {
              const existing = prev.find((f) => f.userId === m.sender_id);
              const nextFriend = existing
                ? { ...existing, lastMessageAt, unreadCount: existing.unreadCount + (m.sender_id !== withUser ? 1 : 0) }
                : {
                    ...revealHidden,
                    lastMessageAt,
                    unreadCount: m.sender_id !== withUser ? 1 : 0,
                  };
              return [nextFriend, ...prev.filter((f) => f.userId !== m.sender_id)];
            });
            return;
          }
          // If the message is from someone other than the open chat, bump their badge
          if (m.sender_id !== withUser) {
            setFriends((prev) => {
              const existing = prev.find((f) => f.userId === m.sender_id);
              if (!existing) return prev;
              return [
                { ...existing, unreadCount: existing.unreadCount + 1, lastMessageAt },
                ...prev.filter((f) => f.userId !== m.sender_id),
              ];
            });
          }
        }
      )
      .subscribe();
    return () => {
      if (inboxChannelRef.current) void supabase.removeChannel(inboxChannelRef.current);
    };
  }, [myId, withUser, supabase]);

  // When switching chats, only reload the messages - sidebar stays cached
  useEffect(() => {
    if (!sidebarLoadedRef.current) return; // initial load handles this
    initialScrollDoneRef.current = false;
    if (!withUser) {
      setMessages([]);
      setWithUserLabel("");
      setWithUserAvatar(null);
      return;
    }
    // Optimistically set label from cached friends list before fetch completes
    const cached = friends.find((f) => f.userId === withUser);
    if (cached) {
      setWithUserLabel(cached.penName);
      setWithUserAvatar(cached.avatarUrl);
    }
    void loadChat(withUser, excludedRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only reload chat when conversation changes; friends is read optimistically and loadChat is a component function
  }, [withUser]);

  // Realtime: new messages + typing indicator
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setOtherTyping(false);
    if (!myId || !withUser) return;

    const chanName = ["dm", ...[myId, withUser].sort()].join(":");
    const ch = supabase
      .channel(chanName, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload: { new: Record<string, unknown> }) => {
        const m = payload.new as Msg;
        if (
          (m.sender_id === withUser && m.receiver_id === myId) ||
          (m.sender_id === myId && m.receiver_id === withUser)
        ) {
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id === withUser) {
            setOtherTyping(false);
            void markAsRead(withUser);
          }
        }
      })
      .on("broadcast", { event: "typing" }, () => {
        setOtherTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: markAsRead is a component function; all reactive data deps are listed
  }, [myId, withUser, supabase]);

  // Scroll to bottom on initial load; for subsequent updates (realtime) only
  // scroll if the user is already near the bottom so scrolling up through
  // history doesn't get interrupted.
  useEffect(() => {
    if (messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!initialScrollDoneRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDoneRef.current = true;
      return;
    }
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 150) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  async function loadOlderMessages() {
    if (!withUser || loadingOlder || !hasMoreMessages) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/messages/thread?with=${encodeURIComponent(withUser)}&before=${encodeURIComponent(oldest.created_at)}`);
      const json = (await res.json()) as { messages?: Msg[]; hasMore?: boolean; error?: string };
      if (!res.ok || !json.messages) { setLoadingOlder(false); return; }
      // Preserve scroll position when prepending older messages
      const container = messagesContainerRef.current;
      const prevHeight = container?.scrollHeight ?? 0;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = json.messages!.filter((m) => !existingIds.has(m.id));
        return [...newOnes, ...prev];
      });
      setHasMoreMessages(json.hasMore ?? false);
      // Restore scroll so the view doesn't jump
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  // Detect scroll to top → load older messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    function onScroll() {
      if (container!.scrollTop < 80 && hasMoreMessages && !loadingOlder) {
        void loadOlderMessages();
      }
    }
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadOlderMessages is a component function; all data it closes over is listed in deps
  }, [withUser, hasMoreMessages, loadingOlder, messages]);

  const peerAvatar =
    withUserAvatar ??
    friends.find((f) => f.userId === withUser)?.avatarUrl ??
    hiddenFriends.find((f) => f.userId === withUser)?.avatarUrl ??
    blockedUsers.find((f) => f.userId === withUser)?.avatarUrl ??
    null;

  const renderAvatar = (url: string | null, label: string) =>
    url ? (
      <Image
        src={url}
        alt={label}
        width={32}
        height={32}
       
        className="h-8 w-8 rounded-full border border-neutral-800 object-cover"
      />
    ) : (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/50 text-xs font-semibold text-neutral-300">
        {label.charAt(0).toUpperCase()}
      </div>
    );

  async function send() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setMsg(null);
    if (youthLocked) { sendingRef.current = false; return setMsg("Messaging is unavailable for youth profiles."); }
    if (!withUser) { sendingRef.current = false; return setMsg("No recipient selected."); }
    if (text.trim().length < 1) { sendingRef.current = false; return; }
    if (status?.blacklisted) { sendingRef.current = false; return setMsg("Messaging is blocked while your account is blacklisted."); }

    if (status?.messaging_suspended_until) {
      const until = new Date(status.messaging_suspended_until);
      if (until.getTime() > now) {
        sendingRef.current = false;
        return setMsg(`Messaging is suspended until ${until.toLocaleString()}.`);
      }
    }

    let res: Response;
    try {
      res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user_id: withUser, content: text }),
      });
    } catch {
      setMsg("Message failed to send. Check your connection and try again.");
      sendingRef.current = false;
      return;
    }
    const json = (await res.json()) as { error?: string; message?: Msg; triggers?: string[]; consequence?: string };
    if (!res.ok) {
      if (json.triggers && json.consequence) {
        // Violation - show acknowledgment modal, refresh status so UI reflects new suspension/blacklist
        setViolationModal({ message: json.error ?? "Message blocked.", triggers: json.triggers, consequence: json.consequence });
        const statusRes = await fetch("/api/messages/status");
        if (statusRes.ok) {
          const s = (await statusRes.json()) as { status?: ModerationStatus };
          setStatus(s.status ?? null);
        }
      } else {
        setMsg(json.error ?? "Message blocked.");
      }
      sendingRef.current = false;
      return;
    }
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (json.message) {
      setMessages((prev) => (prev.some((p) => p.id === json.message!.id) ? prev : [...prev, json.message!]));
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
      // Keep sidebar in sync - bump existing entry or add new conversation
      const sentAt = Date.now();
      setFriends((prev) => {
        const exists = prev.find((f) => f.userId === withUser);
        if (exists) {
          return [{ ...exists, lastMessageAt: sentAt }, ...prev.filter((f) => f.userId !== withUser)];
        }
        // New conversation - add from currently loaded label/avatar
        return [{ userId: withUser, penName: withUserLabel || "User", avatarUrl: withUserAvatar, lastMessageAt: sentAt, unreadCount: 0 }, ...prev];
      });
      setHiddenFriends((prev) => prev.filter((f) => f.userId !== withUser));
      hiddenFriendsRef.current = hiddenFriendsRef.current.filter((f) => f.userId !== withUser);
      await supabase
        .from("hidden_message_threads")
        .delete()
        .eq("user_id", myId)
        .eq("partner_id", withUser);
    }
    sendingRef.current = false;
  }

  async function submitAppeal() {
    if (appealReason.trim().length < 20) {
      setAppealMsg("Please provide more detail (at least 20 characters).");
      return;
    }
    setAppealSubmitting(true);
    setAppealMsg(null);
    const res = await fetch("/api/messages/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: appealReason.trim() }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setAppealSubmitting(false);
    if (!res.ok) {
      setAppealMsg(json.error ?? "Failed to submit appeal.");
      return;
    }
    setAppealModal(false);
    setAppealReason("");
    // Refresh status to reflect pending appeal
    const statusRes = await fetch("/api/messages/status");
    if (statusRes.ok) {
      const s = (await statusRes.json()) as { status?: ModerationStatus; latestAppeal?: AppealStatus };
      setStatus(s.status ?? null);
      setLatestAppeal(s.latestAppeal ?? null);
    }
  }

  async function submitPrAppeal() {
    if (prAppealReason.trim().length < 20) {
      setPrAppealMsg("Please provide more detail (at least 20 characters).");
      return;
    }
    setPrAppealSubmitting(true);
    setPrAppealMsg(null);
    const res = await fetch("/api/parent-report/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: prAppealReason.trim() }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setPrAppealSubmitting(false);
    if (!res.ok) {
      setPrAppealMsg(json.error ?? "Failed to submit appeal.");
      return;
    }
    setPrAppealModal(false);
    setPrAppealReason("");
    setPrAppealSubmitted(true);
  }

  async function hideConversation(userId: string) {
    if (!myId) return;
    if (!confirm("Hide this conversation from your list? It will come back automatically if a new message arrives.")) return;
    const hiddenAt = new Date().toISOString();
    await supabase
      .from("hidden_message_threads")
      .upsert({ user_id: myId, partner_id: userId, hidden_at: hiddenAt, updated_at: hiddenAt }, { onConflict: "user_id,partner_id" });
    const moved = friends.find((f) => f.userId === userId);
    setFriends((prev) => prev.filter((f) => f.userId !== userId));
    if (moved) {
      setHiddenFriends((prev) => {
        if (prev.some((f) => f.userId === userId)) return prev;
        const next = [...prev, { ...moved, unreadCount: 0 }];
        hiddenFriendsRef.current = next;
        return next;
      });
    }
    if (withUser === userId) router.replace("/messages");
  }

  async function unhideConversation(userId: string) {
    if (!myId) return;
    await supabase
      .from("hidden_message_threads")
      .delete()
      .eq("user_id", myId)
      .eq("partner_id", userId);
    setHiddenFriends((prev) => {
      const next = prev.filter((f) => f.userId !== userId);
      hiddenFriendsRef.current = next;
      return next;
    });
    await loadSidebar(myId!);
  }

  function reportUser(userId: string) {
    const friend =
      friends.find((f) => f.userId === userId) ??
      hiddenFriends.find((f) => f.userId === userId);
    setReportTarget({ userId, name: friend?.penName ?? "this user" });
  }

  async function submitReport(reason: string) {
    if (!reportTarget) return;
    const { userId } = reportTarget;
    setReportTarget(null);

    const { error } = await supabase.from("profile_reports").insert({
      reporter_id: myId,
      reported_id: userId,
      reason,
    });
    if (error) { setMsg(error.message); return; }

    // Permanently block - upsert the relationship to "blocked"
    await supabase
      .from("profile_friend_requests")
      .upsert(
        { sender_id: myId, receiver_id: userId, status: "blocked" },
        { onConflict: "sender_id,receiver_id" }
      );
    // Also update the reverse row if it exists
    await supabase
      .from("profile_friend_requests")
      .update({ status: "blocked" })
      .eq("sender_id", userId)
      .eq("receiver_id", myId);

    // Move from active/hidden to blocked in local state
    const moved =
      friends.find((f) => f.userId === userId) ??
      hiddenFriends.find((f) => f.userId === userId);
    setFriends((prev) => prev.filter((f) => f.userId !== userId));
    setHiddenFriends((prev) => {
      const next = prev.filter((f) => f.userId !== userId);
      hiddenFriendsRef.current = next;
      return next;
    });
    if (moved) setBlockedUsers((prev) =>
      prev.some((f) => f.userId === userId) ? prev : [...prev, { ...moved, unreadCount: 0 }]
    );
    if (withUser === userId) router.replace("/messages");
    setMsg("Report submitted. This user has been permanently blocked.");
  }

  async function startChatFromInput() {
    setMsg(null);
    if (youthLocked) return setMsg("Messaging is unavailable for youth profiles.");
    const raw = recipientInput.trim();
    if (!raw) return setMsg("Enter a username.");
    const normalized = raw.startsWith("@") ? raw.slice(1) : raw;

    const { data: profile, error } = await supabase
      .from("public_profiles")
      .select("user_id, username, pen_name")
      .eq("username", normalized.toLowerCase())
      .maybeSingle();

    if (error) return setMsg(error.message);
    const target = (profile as PublicProfile | null) ?? null;
    if (!target?.user_id) return setMsg("User not found.");

    const { data: targetAccount } = await supabase
      .from("accounts")
      .select("age_category")
      .eq("user_id", target.user_id)
      .maybeSingle();
    const targetAge = (targetAccount as { age_category?: string | null } | null)?.age_category ?? null;
    if (targetAge === "youth_13_17") return setMsg("You cannot message youth profiles.");

    router.push(`/messages?with=${encodeURIComponent(target.user_id)}`);
    setRecipientInput("");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>

        <div className="mt-6 grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)_280px]">
          {/* ── Sidebar ── */}
          <aside className="space-y-4">
            {/* Conversations list */}
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4">
              <p className="text-sm font-medium text-neutral-100">Conversations</p>

              <div className="mt-3 flex gap-2">
                <input
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void startChatFromInput()}
                  placeholder="Open @username"
                  disabled={youthLocked}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 text-sm"
                />
                <button
                  onClick={startChatFromInput}
                  disabled={youthLocked}
                  className="h-10 rounded-lg border border-neutral-700 px-3 text-xs disabled:opacity-50"
                >
                  Open
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {sidebarLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 rounded-lg bg-neutral-800/50 animate-pulse" />
                    ))}
                  </>
                ) : friends.length === 0 ? (
                  <p className="text-xs text-neutral-400">No conversations yet.</p>
                ) : (
                  friends.map((f) => (
                    <div
                      key={f.userId}
                      className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition ${
                        withUser === f.userId
                          ? "border-[rgba(120,120,120,0.9)] bg-[rgba(120,120,120,0.25)]"
                          : "border-neutral-800 bg-neutral-900/40"
                      }`}
                    >
                      <button
                        onClick={() => {
                          initialScrollDoneRef.current = false;
                          router.push(`/messages?with=${encodeURIComponent(f.userId)}`);
                          setWithUserLabel(f.penName);
                          setWithUserAvatar(f.avatarUrl);
                          void loadChat(f.userId, excludedRef.current);
                        }}
                        disabled={youthLocked}
                        className="flex flex-1 min-w-0 items-center gap-2 rounded-lg text-left disabled:opacity-50"
                      >
                        <div className="relative shrink-0">
                          <Avatar name={f.penName} url={f.avatarUrl} />
                          {f.unreadCount > 0 && withUser !== f.userId && (
                            <span className="msgUnreadBadge absolute -right-1 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-[#ef4444] px-1 py-px text-[9px] font-bold leading-none ring-1 ring-neutral-900">
                              {f.unreadCount > 99 ? "99+" : f.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="flex-1 text-neutral-200">{f.penName}</span>
                        {f.lastMessageAt > 0 && (
                          <span className="shrink-0 text-[10px] text-neutral-500">
                            {new Date(f.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => void reportUser(f.userId)}
                        title="Report"
                        className="ml-1 shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-600 hover:text-amber-500 transition"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M3 1v14M3 1h9l-2 4 2 4H3"/></svg>
                      </button>
                      <button
                        onClick={() => void hideConversation(f.userId)}
                        title="Hide conversation"
                        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-400 transition"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Hidden conversations */}
              {hiddenFriends.length > 0 && (
                <div className="mt-3 border-t border-neutral-800 pt-3">
                  <button
                    onClick={() => setShowHidden((v) => !v)}
                    className="flex w-full items-center justify-between text-xs text-neutral-500 hover:text-neutral-300 transition"
                  >
                    <span>Hidden Conversations ({hiddenFriends.length})</span>
                    <span>{showHidden ? "▲" : "▼"}</span>
                  </button>
                  {showHidden && (
                    <div className="mt-2 space-y-2">
                      {hiddenFriends.map((f) => (
                        <div key={f.userId} className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 py-2 text-sm">
                          <button
                            onClick={() => router.push(`/messages?with=${encodeURIComponent(f.userId)}`)}
                            className="flex flex-1 min-w-0 items-center gap-2 rounded-lg text-left opacity-70 hover:opacity-100 transition"
                          >
                            <Avatar name={f.penName} url={f.avatarUrl} />
                            <span className="flex-1 truncate text-neutral-400">{f.penName}</span>
                          </button>
                          <button
                            onClick={() => void unhideConversation(f.userId)}
                            title="Show conversation again"
                            className="shrink-0 rounded-lg border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500 hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-200 transition"
                          >
                            Show
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Blocked users - permanent, no undo */}
              {blockedUsers.length > 0 && (
                <div className="mt-3 border-t border-red-900/40 pt-3">
                  <p className="text-xs text-red-900/80 font-medium">Blocked ({blockedUsers.length})</p>
                  <div className="mt-2 space-y-2">
                    {blockedUsers.map((f) => (
                      <div key={f.userId} className="flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-950/10 px-3 py-2 text-sm opacity-50">
                        <Avatar name={f.penName} url={f.avatarUrl} />
                        <span className="flex-1 truncate text-neutral-500">{f.penName}</span>
                        <span className="shrink-0 text-[10px] text-red-900/70">Blocked</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Main panel ── */}
          {withUser && blockedUsers.some((f) => f.userId === withUser) ? (
            <section className="flex h-[600px] flex-col rounded-xl border border-neutral-800 bg-[rgba(120,120,120,0.05)] p-4">
              <div className="mb-3 shrink-0 flex items-center gap-3">
                <p className="flex-1 text-sm text-neutral-400">
                  Blocked: <span className="text-neutral-300">{withUserLabel || "Selected user"}</span>
                </p>
                <button onClick={() => router.replace("/messages")} className="text-xs text-neutral-300 hover:text-white transition border border-[rgba(120,120,120,0.4)] rounded-lg px-2 py-0.5">Close</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 opacity-60">
                {messages.length === 0 ? (
                  <p className="text-sm text-neutral-500">No messages.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-end gap-2 ${m.sender_id === myId ? "justify-end" : "justify-start"}`}
                    >
                      {m.sender_id !== myId && renderAvatar(peerAvatar, withUserLabel || "User")}
                      <div
                        className={`rounded-lg p-3 text-sm ${
                          m.sender_id === myId
                            ? "ml-auto max-w-[75%] border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)]"
                            : "mr-auto max-w-[75%] border border-neutral-800 bg-neutral-900/40"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-xs text-neutral-300">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                      {m.sender_id === myId && renderAvatar(myAvatarUrl, "You")}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <p className="mt-3 shrink-0 text-xs text-neutral-400 italic">
                This user has been permanently blocked due to a report.
              </p>
            </section>
          ) : targetIsYouth ? (
            <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <p className="text-sm font-semibold text-neutral-100">Messaging unavailable</p>
              <p className="mt-2 text-sm text-neutral-400">Direct messaging between adult and youth profiles is disabled for safety. This applies to all youth accounts, including linked profiles.</p>
            </section>
          ) : !withUser || youthLocked ? (
            <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <h2 className="text-lg font-semibold">Chat Rules</h2>
              {youthLocked ? (
                <p className="mt-3 text-sm text-amber-300">Messaging is unavailable for youth profiles.</p>
              ) : null}
              <div className="mt-3 space-y-4 text-sm text-neutral-300">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Community Guidelines</p>
                  <ul className="space-y-1.5">
                    <li>• We&apos;re all adults here - keep things appropriate and respectful for our community.</li>
                    <li>• No soliciting other members for paid work, freelance opportunities, or external projects.</li>
                    <li>• No bullying, harassment, hate speech, or targeted negativity toward other members.</li>
                    <li>• Treat every writer with the same respect you&apos;d want for yourself and your work.</li>
                    <li>• Keep feedback and conversations constructive - we&apos;re here to support each other&apos;s growth.</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Strike System</p>
                  <ul className="space-y-1.5">
                    <li>• <span className="text-neutral-200">Strike 1:</span> Friendly reminder of community guidelines.</li>
                    <li>• <span className="text-neutral-200">Strike 2:</span> Second reminder - one more violation triggers a suspension.</li>
                    <li>• <span className="text-neutral-200">Strike 3:</span> 3-day messaging suspension.</li>
                    <li>• Appeals may be submitted.</li>
                  </ul>
                </div>
              </div>
              <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm space-y-1">
                <p className="text-neutral-100">Conduct strikes: {status?.conduct_strikes ?? 0} / 3</p>
                <p className="text-neutral-200">
                  Status:{" "}
                  {status?.blacklisted
                    ? <span className="text-red-400 font-medium">Blacklisted</span>
                    : status?.messaging_suspended_until &&
                      new Date(status.messaging_suspended_until).getTime() > now
                    ? <span className="text-amber-400 font-medium">Suspended until {new Date(status.messaging_suspended_until).toLocaleString()}</span>
                    : <span className="text-emerald-400">Active</span>}
                </p>
                {(status?.lifetime_suspension_count ?? 0) > 0 && (
                  <p className="text-neutral-400 text-xs">Total suspensions on record: {status?.lifetime_suspension_count}. Repeated violations may result in a permanent ban.</p>
                )}
              </div>

              {/* Parent report restriction */}
              {status?.parent_report_restricted && (
                <div className="mt-4 rounded-lg border border-red-700/50 bg-red-950/20 p-4">
                  <p className="text-sm font-semibold text-red-300 mb-1">Account Restricted - Parent Report</p>
                  <p className="text-xs text-neutral-300 mb-3">Your account has been temporarily restricted from messaging and beta reading following a report from a parent account. An admin will review the report. If you believe this is in error, you may submit an appeal.</p>
                  {prAppealSubmitted ? (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                      <span>⏳</span>
                      <span>Appeal submitted and pending admin review.</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setPrAppealModal(true); setPrAppealMsg(null); }}
                      className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-3 py-2 text-sm text-neutral-300 hover:text-white hover:border-[rgba(120,120,120,0.7)] transition"
                    >
                      Submit an appeal
                    </button>
                  )}
                </div>
              )}

              {/* Appeal section - only when suspended or blacklisted */}
              {(status?.blacklisted || (status?.messaging_suspended_until && new Date(status.messaging_suspended_until).getTime() > now)) && (
                <div className="mt-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] p-4">
                  <p className="text-sm font-semibold text-neutral-100 mb-1">Submit an Appeal</p>
                  <p className="text-xs text-neutral-400 mb-3">If you believe your suspension was issued in error, you may submit a written appeal. An admin will review it and respond via your notifications.</p>

                  {latestAppeal?.status === "pending" ? (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                      <span>⏳</span>
                      <span>Appeal pending, under admin review since {new Date(latestAppeal.created_at).toLocaleDateString()}.</span>
                    </div>
                  ) : latestAppeal?.status === "denied" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                        <span>✕</span>
                        <span>Appeal denied.{latestAppeal.admin_note ? ` Admin note: ${latestAppeal.admin_note}` : ""}</span>
                      </div>
                      <button
                        onClick={() => { setAppealModal(true); setAppealMsg(null); }}
                        className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-3 py-2 text-sm text-neutral-300 hover:text-white hover:border-[rgba(120,120,120,0.7)] transition"
                      >
                        Submit a new appeal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAppealModal(true); setAppealMsg(null); }}
                      className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-3 py-2 text-sm text-neutral-300 hover:text-white hover:border-[rgba(120,120,120,0.7)] transition"
                    >
                      Submit an appeal
                    </button>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="flex flex-col w-full rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4">
              <div className="mb-3 shrink-0 flex items-center gap-3">
                <p className="flex-1 text-sm text-neutral-300">Chatting with: <span className="text-white">{withUserLabel || "Selected user"}</span></p>
                <button
                  onClick={() => router.replace("/messages")}
                  className="text-xs text-neutral-300 hover:text-white transition border border-[rgba(120,120,120,0.4)] rounded-lg px-2 py-0.5"
                >
                  Close
                </button>
              </div>

              <div ref={messagesContainerRef} className="h-[460px] overflow-y-auto space-y-3 pr-1">
                {/* Load older messages indicator */}
                {hasMoreMessages && (
                  <div className="flex justify-center py-2">
                    {loadingOlder ? (
                      <span className="text-xs text-neutral-500">Loading older messages…</span>
                    ) : (
                      <button
                        onClick={() => void loadOlderMessages()}
                        className="text-xs text-neutral-400 hover:text-neutral-200 transition"
                      >
                        ↑ Load older messages
                      </button>
                    )}
                  </div>
                )}
                {messages.length === 0 ? (
                  <p className="text-sm text-neutral-300">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex items-end gap-2 ${m.sender_id === myId ? "justify-end" : "justify-start"}`}>
                      {m.sender_id !== myId && renderAvatar(peerAvatar, withUserLabel || "User")}
                      <div
                        className={`rounded-lg p-3 text-sm ${
                          m.sender_id === myId
                            ? "ml-auto max-w-[75%] border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)]"
                            : "mr-auto max-w-[75%] border border-neutral-800 bg-neutral-900/40"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words hyphens-auto">{m.body}</p>
                        <p className="mt-1 text-xs text-neutral-300">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                      {m.sender_id === myId && renderAvatar(myAvatarUrl, "You")}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-4 shrink-0 flex gap-2 relative">
                <textarea
                  ref={inputRef}
                  value={text}
                  rows={2}
                  onChange={(e) => {
                    setText(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                    if (channelRef.current) {
                      const now = Date.now();
                      if (now - lastTypingRef.current > 2000) {
                        lastTypingRef.current = now;
                        void channelRef.current.send({ type: "broadcast", event: "typing", payload: {} });
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (inputRef.current) inputRef.current.style.height = "auto";
                      void send();
                    }
                  }}
                  placeholder="Type a message... (Shift+Enter for new line)"
                  disabled={youthLocked}
                  className="msg-input flex-1 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 resize-none overflow-y-auto min-h-[72px] max-h-48"
                  style={{ lineHeight: "1.5" }}
                />
                <div ref={emojiPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojis((v) => !v)}
                    disabled={youthLocked}
                    className="h-11 w-11 rounded-lg border border-neutral-700 text-lg disabled:opacity-50 hover:border-[rgba(120,120,120,0.6)] transition"
                    title="Emoji"
                  >
                    😊
                  </button>
                  {showEmojis && (
                    <div className="absolute bottom-13 right-0 z-50 w-72 rounded-xl border border-[rgba(120,120,120,0.45)] bg-neutral-900 p-3 shadow-xl">
                      <div className="grid grid-cols-10 gap-1">
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-[rgba(120,120,120,0.2)] transition"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={send}
                  disabled={blocked || youthLocked}
                  className="h-11 rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className={`mt-1 shrink-0 text-xs text-neutral-300 italic flex items-center gap-1 transition-opacity duration-200 ${otherTyping ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                {withUserLabel} is typing
                <span className="flex items-center gap-[3px] ml-0.5">
                  <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:300ms]" />
                </span>
              </p>
              {msg ? <p className="mt-2 shrink-0 text-sm text-red-300">{msg}</p> : null}
            </section>
          )}

          {/* ── Notes panel ── */}
          <div className="hidden lg:block rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4 sticky top-20 h-[634px] overflow-hidden">
            <NotesPanel manuscripts={myManuscripts} />
          </div>
        </div>
      </div>
      {reportTarget && (
        <ReportModal
          targetName={reportTarget.name}
          onSubmit={(reason) => void submitReport(reason)}
          onCancel={() => setReportTarget(null)}
        />
      )}

      {appealModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Submit an Appeal</h2>
            <p className="text-sm text-neutral-400 mb-4">Explain why you believe your suspension or blacklist should be lifted. Be honest and specific - vague appeals are less likely to be approved.</p>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Describe the situation, why you believe the action was an error, and how you intend to follow platform rules going forward..."
              rows={6}
              className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)] resize-none"
            />
            {appealMsg && <p className="mt-2 text-sm text-red-400">{appealMsg}</p>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setAppealModal(false); setAppealReason(""); setAppealMsg(null); }}
                className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitAppeal()}
                disabled={appealSubmitting}
                className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-600 disabled:opacity-50"
              >
                {appealSubmitting ? "Submitting…" : "Submit Appeal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {prAppealModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Appeal Parent Report Restriction</h2>
            <p className="text-sm text-neutral-400 mb-4">Explain why you believe this restriction was issued in error. An admin will review your appeal and respond via your notifications.</p>
            <textarea
              value={prAppealReason}
              onChange={(e) => setPrAppealReason(e.target.value)}
              placeholder="Describe why you believe this report is inaccurate and how you have followed platform rules..."
              rows={5}
              className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)] resize-none"
            />
            {prAppealMsg && <p className="mt-2 text-sm text-red-400">{prAppealMsg}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setPrAppealModal(false); setPrAppealReason(""); setPrAppealMsg(null); }} className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-400 hover:text-white transition">
                Cancel
              </button>
              <button
                onClick={() => void submitPrAppeal()}
                disabled={prAppealSubmitting}
                className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-600 disabled:opacity-50 transition"
              >
                {prAppealSubmitting ? "Submitting…" : "Submit Appeal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {violationModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-red-700/60 bg-neutral-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-900/40 text-lg text-red-400">⚠</span>
              <h2 className="text-lg font-semibold text-red-300">Message Policy Violation</h2>
            </div>

            <p className="text-sm text-neutral-200 leading-relaxed">{violationModal.message}</p>

            {violationModal.triggers.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">Reason{violationModal.triggers.length > 1 ? "s" : ""} for violation</p>
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
              Your message was not delivered. This violation has been logged and reviewed by the admin team. Repeated violations may result in suspension or a permanent messaging ban.
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
    </main>
  );
}

export default function MessagesPage() {
  return <Suspense><MessagesPageInner /></Suspense>;
}
