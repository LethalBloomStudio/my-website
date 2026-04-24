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
  receiver_id?: string;
  conversation_id?: string;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_avatar_url?: string | null;
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

type FriendOption = {
  userId: string;
  penName: string;
  avatarUrl: string | null;
};

type GroupParticipant = {
  user_id: string;
  label: string;
  avatar_url: string | null;
};

type GroupConversation = {
  id: string;
  title: string;
  unreadCount: number;
  lastMessageAt: number;
  memberCount: number;
  participants: GroupParticipant[];
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
  const groupId = searchParams.get("group") ?? "";
  const isGroupChat = !!groupId;
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
const [targetIsYouth, setTargetIsYouth] = useState(false);
const [_excludedFromMessaging, setExcludedFromMessaging] = useState<string[]>([]);
const [msg, setMsg] = useState<string | null>(null);
const [status, setStatus] = useState<ModerationStatus>(null);
const [now] = useState(() => Date.now());
  const [recipientInput, setRecipientInput] = useState("");
  const [groupRecipientInput, setGroupRecipientInput] = useState("");
  const [groupTitleInput, setGroupTitleInput] = useState("");
  const [groupDraftMembers, setGroupDraftMembers] = useState<GroupParticipant[]>([]);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupComposerOpen, setGroupComposerOpen] = useState(false);
  const [withUserLabel, setWithUserLabel] = useState<string>("");
  const [withUserAvatar, setWithUserAvatar] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState<string>("");
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [hasLeftGroup, setHasLeftGroup] = useState(false);
  const [groupConversations, setGroupConversations] = useState<GroupConversation[]>([]);
  const [friendOptions, setFriendOptions] = useState<FriendOption[]>([]);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [hiddenFriends, setHiddenFriends] = useState<Friend[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Friend[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [hideConfirmTarget, setHideConfirmTarget] = useState<{ userId: string; name: string } | null>(null);
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
  const forceScrollToBottomRef = useRef(false);
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
    const [hiddenThreadsRes, blockedReqRes, acceptedReqRes, statusRes] = await Promise.all([
      supabase
        .from("hidden_message_threads")
        .select("partner_id, hidden_at")
        .eq("user_id", signedInUserId),
      supabase
        .from("profile_friend_requests")
        .select("sender_id, receiver_id, status")
        .or(`sender_id.eq.${signedInUserId},receiver_id.eq.${signedInUserId}`)
        .eq("status", "blocked"),
      supabase
        .from("profile_friend_requests")
        .select("sender_id, receiver_id, status")
        .or(`sender_id.eq.${signedInUserId},receiver_id.eq.${signedInUserId}`)
        .eq("status", "accepted"),
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
    const acceptedRows = (acceptedReqRes.data as FriendRequest[] | null) ?? [];

    const hiddenMap = new Map<string, number>();
    for (const row of hiddenRows) {
      hiddenMap.set(row.partner_id, new Date(row.hidden_at).getTime());
    }

    const blockedIds = Array.from(new Set(blockedRows.map((r) => r.sender_id === signedInUserId ? r.receiver_id : r.sender_id)));
    const acceptedIds = Array.from(new Set(
      acceptedRows.map((r) => r.sender_id === signedInUserId ? r.receiver_id : r.sender_id)
    )).filter((id) => !blockedIds.includes(id) && !excluded.includes(id));

    // Fetch conversation partners + supporting data in parallel
    // Uses an RPC to get distinct partners - avoids the PostgREST 1000-row cap
    // that caused old conversations to disappear.
    const [blockedProfilesRes, partnersRes, groupConversationsRes, groupMembersRes, acceptedProfilesRes] = await Promise.all([
      blockedIds.length > 0
        ? supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", blockedIds)
        : Promise.resolve({ data: [] }),
      supabase.rpc("get_conversation_partners", { p_user_id: signedInUserId }),
      supabase.rpc("get_group_message_conversations", { p_user_id: signedInUserId }),
      supabase
        .from("group_message_members")
        .select("conversation_id, user_id, left_at")
        .is("left_at", null),
      acceptedIds.length > 0
        ? supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", acceptedIds)
        : Promise.resolve({ data: [] }),
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
    setFriendOptions(
      (((acceptedProfilesRes.data as PublicProfile[] | null) ?? []).map((p) => ({
        userId: p.user_id,
        penName: p.pen_name || (p.username ? `@${p.username}` : "Friend"),
        avatarUrl: p.avatar_url ?? null,
      }))).sort((a, b) => a.penName.localeCompare(b.penName))
    );

    type GroupConversationRow = {
      conversation_id: string;
      title: string;
      unread_count: number;
      last_message_at: string | null;
      member_count: number;
    };

    const groupRows = (groupConversationsRes.data as GroupConversationRow[] | null) ?? [];
    const activeMemberships = ((groupMembersRes.data as Array<{ conversation_id: string; user_id: string; left_at: string | null }> | null) ?? []);
    const conversationIds = Array.from(new Set(groupRows.map((row) => row.conversation_id)));
    const memberIds = Array.from(new Set(activeMemberships.map((row) => row.user_id)));
    const { data: groupProfilesRes } = memberIds.length > 0
      ? await supabase.from("public_profiles").select("user_id, username, pen_name, avatar_url").in("user_id", memberIds)
      : { data: [] as PublicProfile[] };
    const profileMap = new Map(
      (((groupProfilesRes as unknown as PublicProfile[]) ?? []) as PublicProfile[]).map((profile) => [profile.user_id, profile])
    );
    const participantMap = new Map<string, GroupParticipant[]>();
    for (const membership of activeMemberships) {
      if (!conversationIds.includes(membership.conversation_id)) continue;
      const profile = profileMap.get(membership.user_id);
      const next = participantMap.get(membership.conversation_id) ?? [];
      next.push({
        user_id: membership.user_id,
        label: profile?.pen_name || (profile?.username ? `@${profile.username}` : "User"),
        avatar_url: profile?.avatar_url ?? null,
      });
      participantMap.set(membership.conversation_id, next);
    }

    setGroupConversations(
      groupRows.map((row) => ({
        id: row.conversation_id,
        title: row.title,
        unreadCount: row.unread_count ?? 0,
        lastMessageAt: row.last_message_at ? new Date(row.last_message_at).getTime() : 0,
        memberCount: row.member_count ?? (participantMap.get(row.conversation_id)?.length ?? 0),
        participants: (participantMap.get(row.conversation_id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
      }))
    );

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

  async function loadGroupChat(targetGroupId: string) {
    activeTargetRef.current = targetGroupId;
    setTargetIsYouth(false);
    setMessages([]);
    setHasLeftGroup(false);

    const threadRes = await fetch(`/api/messages/thread?group=${encodeURIComponent(targetGroupId)}`);
    const json = (await threadRes.json()) as {
      messages?: Msg[];
      error?: string;
      hasMore?: boolean;
      conversation?: { id: string; title: string } | null;
      participants?: GroupParticipant[];
      hasLeft?: boolean;
    };

    if (activeTargetRef.current !== targetGroupId) return;
    if (!threadRes.ok) {
      setMsg(json.error ?? "Failed to load group chat.");
      return;
    }

    setGroupLabel(json.conversation?.title ?? "Group chat");
    setGroupParticipants(json.participants ?? []);
    setMessages(json.messages ?? []);
    setHasMoreMessages(json.hasMore ?? false);
    setHasLeftGroup(!!json.hasLeft);
    setGroupConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === targetGroupId
          ? {
              ...conversation,
              unreadCount: 0,
              title: json.conversation?.title ?? conversation.title,
              participants: json.participants ?? conversation.participants,
            }
          : conversation
      )
    );
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
      } else if (groupId) {
        initialScrollDoneRef.current = false;
        await loadGroupChat(groupId);
      } else {
        setMessages([]);
        setWithUserLabel("");
        setWithUserAvatar(null);
        setGroupLabel("");
        setGroupParticipants([]);
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
    if (!withUser && !groupId) {
      setMessages([]);
      setWithUserLabel("");
      setWithUserAvatar(null);
      setGroupLabel("");
      setGroupParticipants([]);
      setHasLeftGroup(false);
      return;
    }
    if (groupId) {
      const cachedGroup = groupConversations.find((conversation) => conversation.id === groupId);
      if (cachedGroup) {
        setGroupLabel(cachedGroup.title);
        setGroupParticipants(cachedGroup.participants);
      }
      void loadGroupChat(groupId);
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
  }, [withUser, groupId]);

  // Realtime: new messages + typing indicator
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setOtherTyping(false);
    if (!myId || !withUser || groupId) return;

    const chanName = ["dm", ...[myId, withUser].sort()].join(":");
    const ch = supabase
      .channel(chanName, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload: { new: Record<string, unknown> }) => {
        const m = payload.new as Msg;
        if (
          (m.sender_id === withUser && m.receiver_id === myId) ||
          (m.sender_id === myId && m.receiver_id === withUser)
        ) {
          const container = messagesContainerRef.current;
          if (container) {
            const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            forceScrollToBottomRef.current = distFromBottom < 150;
          }
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
  }, [myId, withUser, groupId, supabase]);

  useEffect(() => {
    if (groupId && channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!myId || !groupId) return;

    const ch = supabase
      .channel(`group:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `conversation_id=eq.${groupId}` }, (payload: { new: Record<string, unknown> }) => {
        const m = payload.new as Msg;
        const container = messagesContainerRef.current;
        if (container) {
          const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          forceScrollToBottomRef.current = distFromBottom < 150;
        }
        if (m.sender_id !== myId) {
          void loadGroupChat(groupId);
        }
      })
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [groupId, myId, supabase]);

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
      forceScrollToBottomRef.current = false;
      return;
    }
    if (forceScrollToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      forceScrollToBottomRef.current = false;
      return;
    }
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distFromBottom < 150) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  async function loadOlderMessages() {
    if ((!withUser && !groupId) || loadingOlder || !hasMoreMessages) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const query = groupId
        ? `/api/messages/thread?group=${encodeURIComponent(groupId)}&before=${encodeURIComponent(oldest.created_at)}`
        : `/api/messages/thread?with=${encodeURIComponent(withUser)}&before=${encodeURIComponent(oldest.created_at)}`;
      const res = await fetch(query);
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
  }, [withUser, groupId, hasMoreMessages, loadingOlder, messages]);
 

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

  const groupFriendResults = friendOptions.filter((friend) => {
    if (groupDraftMembers.some((member) => member.user_id === friend.userId)) return false;
    if (!groupRecipientInput.trim()) return true;
    const query = groupRecipientInput.trim().toLowerCase();
    return friend.penName.toLowerCase().includes(query);
  }).slice(0, 8);

  function addGroupMember(target: { user_id: string; label: string; avatar_url: string | null }) {
    if (target.user_id === myId) {
      setMsg("You're already in the group.");
      return;
    }
    if (groupDraftMembers.some((member) => member.user_id === target.user_id)) {
      setMsg("That user is already selected.");
      return;
    }
    setMsg(null);
    setGroupDraftMembers((prev) => [...prev, target]);
    setGroupRecipientInput("");
  }

  async function send() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setMsg(null);
    if (youthLocked) { sendingRef.current = false; return setMsg("Messaging is unavailable for youth profiles."); }
    if (!withUser && !groupId) { sendingRef.current = false; return setMsg("No recipient selected."); }
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
        body: JSON.stringify(groupId ? { group_id: groupId, content: text } : { to_user_id: withUser, content: text }),
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
      forceScrollToBottomRef.current = true;
      setMessages((prev) => (prev.some((p) => p.id === json.message!.id) ? prev : [...prev, json.message!]));
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
      const sentAt = Date.now();
      if (groupId) {
        setGroupConversations((prev) =>
          prev
            .map((conversation) =>
              conversation.id === groupId
                ? { ...conversation, lastMessageAt: sentAt, unreadCount: 0 }
                : conversation
            )
            .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        );
      } else {
        // Keep sidebar in sync - bump existing entry or add new conversation
        setFriends((prev) => {
          const exists = prev.find((f) => f.userId === withUser);
          if (exists) {
            return [{ ...exists, lastMessageAt: sentAt }, ...prev.filter((f) => f.userId !== withUser)];
          }
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

  async function addGroupMemberFromInput() {
    setMsg(null);
    if (youthLocked) return setMsg("Messaging is unavailable for youth profiles.");
    const raw = groupRecipientInput.trim();
    if (!raw) return setMsg("Enter a username to add to the group.");
    const normalized = raw.startsWith("@") ? raw.slice(1) : raw;

    const { data: profile, error } = await supabase
      .from("public_profiles")
      .select("user_id, username, pen_name, avatar_url")
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
    if (targetAge === "youth_13_17") return setMsg("You cannot add youth profiles to a group chat.");
    addGroupMember({
      user_id: target.user_id,
      label: target.pen_name || (target.username ? `@${target.username}` : "User"),
      avatar_url: target.avatar_url ?? null,
    });
  }

  async function createGroupChat() {
    if (groupSubmitting) return;
    setMsg(null);
    if (groupDraftMembers.length < 2) {
      return setMsg("Add at least two other users to start a group chat.");
    }
    setGroupSubmitting(true);
    try {
      const res = await fetch("/api/messages/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: groupTitleInput.trim(),
          user_ids: groupDraftMembers.map((member) => member.user_id),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        conversation?: { id: string; title: string; participants: GroupParticipant[] };
      };
      if (!res.ok || !json.conversation) {
        setMsg(json.error ?? "Failed to create group chat.");
        return;
      }
      const participantCount = json.conversation.participants.length;
      setGroupConversations((prev) => [
        {
          id: json.conversation!.id,
          title: json.conversation!.title,
          unreadCount: 0,
          lastMessageAt: Date.now(),
          memberCount: participantCount,
          participants: json.conversation!.participants,
        },
        ...prev,
      ]);
      setGroupDraftMembers([]);
      setGroupTitleInput("");
      setGroupRecipientInput("");
      setGroupComposerOpen(false);
      router.push(`/messages?group=${encodeURIComponent(json.conversation.id)}`);
    } finally {
      setGroupSubmitting(false);
    }
  }

  async function leaveGroupChat() {
    if (!groupId) return;
    const res = await fetch("/api/messages/group/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      setMsg(json.error ?? "Failed to leave group chat.");
      return;
    }
    setGroupConversations((prev) => prev.filter((conversation) => conversation.id !== groupId));
    router.replace("/messages");
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

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setGroupComposerOpen((prev) => !prev)}
                  disabled={youthLocked}
                  className="flex h-9 w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 text-left text-xs text-neutral-300 transition hover:border-neutral-700 hover:text-white disabled:opacity-50"
                >
                  <span>{groupDraftMembers.length > 0 ? `New group (${groupDraftMembers.length})` : "New group chat"}</span>
                  <span className="text-[10px] text-neutral-500">{groupComposerOpen ? "Hide" : "Open"}</span>
                </button>

                {groupComposerOpen ? (
                  <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900/20 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Build Group</p>
                      <p className="text-[10px] text-neutral-600">Add 2+ people</p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={groupRecipientInput}
                        onChange={(e) => setGroupRecipientInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void addGroupMemberFromInput()}
                        placeholder="Add @username"
                        disabled={youthLocked}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 text-sm"
                      />
                      <button
                        onClick={() => void addGroupMemberFromInput()}
                        disabled={youthLocked}
                        className="h-9 rounded-lg border border-neutral-700 px-3 text-xs disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-1.5">
                      <p className="px-1 text-[10px] uppercase tracking-wide text-neutral-500">
                        {groupRecipientInput.trim() ? "Matching friends" : "Pick from friends"}
                      </p>
                      <div className="mt-1 max-h-24 space-y-1 overflow-y-auto pr-1">
                        {groupFriendResults.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-neutral-500">
                            {friendOptions.length === 0
                              ? "No accepted friends available yet."
                              : "No friends match that name."}
                          </p>
                        ) : (
                          groupFriendResults.map((friend) => (
                            <button
                              key={friend.userId}
                              type="button"
                              onClick={() => addGroupMember({
                                user_id: friend.userId,
                                label: friend.penName,
                                avatar_url: friend.avatarUrl,
                              })}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] text-neutral-300 transition hover:bg-[rgba(120,120,120,0.16)] hover:text-white"
                            >
                              <Avatar name={friend.penName} url={friend.avatarUrl} />
                              <span className="truncate">{friend.penName}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <input
                      value={groupTitleInput}
                      onChange={(e) => setGroupTitleInput(e.target.value)}
                      placeholder="Group name (optional)"
                      disabled={youthLocked}
                      className="mt-2 h-9 w-full rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 text-sm"
                    />
                    <div className="mt-2 max-h-16 overflow-y-auto">
                      {groupDraftMembers.length === 0 ? (
                        <p className="text-[11px] text-neutral-500">Add at least two members to start a group.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 pr-1">
                          {groupDraftMembers.map((member) => (
                            <span key={member.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-[11px] text-neutral-200">
                              <span className="max-w-[120px] truncate">{member.label}</span>
                              <button
                                type="button"
                                onClick={() => setGroupDraftMembers((prev) => prev.filter((item) => item.user_id !== member.user_id))}
                                className="text-neutral-500 hover:text-white transition"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupComposerOpen(false);
                          setGroupRecipientInput("");
                        }}
                        className="h-8 flex-1 rounded-lg border border-neutral-800 px-3 text-[11px] text-neutral-400 transition hover:text-white"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => void createGroupChat()}
                        disabled={youthLocked || groupSubmitting}
                        className="h-8 flex-1 rounded-lg border border-neutral-700 px-3 text-[11px] disabled:opacity-50"
                      >
                        {groupSubmitting ? "Creating..." : "Create group"}
                      </button>
                    </div>
                  </div>
                ) : null}
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
                        onClick={() => setHideConfirmTarget({ userId: f.userId, name: f.penName })}
                        title="Hide conversation"
                        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-400 transition"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <p className="text-sm font-medium text-neutral-100">Groups</p>
                <div className="mt-3 space-y-2">
                  {sidebarLoading ? (
                    <>
                      {[1, 2].map((i) => (
                        <div key={`group-skel-${i}`} className="h-10 rounded-lg bg-neutral-800/50 animate-pulse" />
                      ))}
                    </>
                  ) : groupConversations.length === 0 ? (
                    <p className="text-xs text-neutral-400">No group chats yet.</p>
                  ) : (
                    groupConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => {
                          initialScrollDoneRef.current = false;
                          router.push(`/messages?group=${encodeURIComponent(conversation.id)}`);
                          setGroupLabel(conversation.title);
                          setGroupParticipants(conversation.participants);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                          groupId === conversation.id
                            ? "border-[rgba(120,120,120,0.9)] bg-[rgba(120,120,120,0.25)]"
                            : "border-neutral-800 bg-neutral-900/40"
                        }`}
                      >
                        <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-[11px] font-semibold text-neutral-200">
                          {Math.min(conversation.memberCount, 99)}
                          {conversation.unreadCount > 0 && groupId !== conversation.id && (
                            <span className="msgUnreadBadge absolute -right-1 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-[#ef4444] px-1 py-px text-[9px] font-bold leading-none ring-1 ring-neutral-900">
                              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-neutral-200">{conversation.title}</span>
                          <span className="block truncate text-[10px] text-neutral-500">
                            {conversation.participants.map((participant) => participant.label).join(", ")}
                          </span>
                        </span>
                        {conversation.lastMessageAt > 0 && (
                          <span className="shrink-0 text-[10px] text-neutral-500">
                            {new Date(conversation.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Hidden conversations */}
              {hiddenFriends.length > 0 && (
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/10 p-3">
                  <button
                    onClick={() => setShowHidden((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300 transition"
                  >
                    <span>Hidden Conversations ({hiddenFriends.length})</span>
                    <span>{showHidden ? "▲" : "▼"}</span>
                  </button>
                  {showHidden && (
                    <div className="mt-2 space-y-2">
                      {hiddenFriends.map((f) => (
                        <div key={f.userId} className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/20 px-3 py-2 text-sm">
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
          {!isGroupChat && withUser && blockedUsers.some((f) => f.userId === withUser) ? (
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
          ) : !isGroupChat && targetIsYouth ? (
            <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              <p className="text-sm font-semibold text-neutral-100">Messaging unavailable</p>
              <p className="mt-2 text-sm text-neutral-400">Direct messaging between adult and youth profiles is disabled for safety. This applies to all youth accounts, including linked profiles.</p>
            </section>
          ) : (!withUser && !groupId) || youthLocked ? (
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-300">
                    {isGroupChat ? "Group chat:" : "Chatting with:"} <span className="text-white">{isGroupChat ? (groupLabel || "Group chat") : (withUserLabel || "Selected user")}</span>
                  </p>
                  {isGroupChat ? (
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {groupParticipants.map((participant) => participant.label).join(", ")}
                    </p>
                  ) : null}
                </div>
                {isGroupChat ? (
                  <button
                    onClick={() => void leaveGroupChat()}
                    className="text-xs text-amber-300 hover:text-amber-200 transition border border-amber-800/50 rounded-lg px-2 py-0.5"
                  >
                    Leave group
                  </button>
                ) : null}
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
                  <p className="text-sm text-neutral-300">{hasLeftGroup ? "You left this group chat." : "No messages yet."}</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex items-end gap-2 ${m.sender_id === myId ? "justify-end" : "justify-start"}`}>
                      {m.sender_id !== myId && renderAvatar(isGroupChat ? (m.sender_avatar_url ?? null) : peerAvatar, isGroupChat ? (m.sender_name || "User") : (withUserLabel || "User"))}
                      <div
                        className={`rounded-lg p-3 text-sm ${
                          m.sender_id === myId
                            ? "ml-auto max-w-[75%] border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)]"
                            : "mr-auto max-w-[75%] border border-neutral-800 bg-neutral-900/40"
                        }`}
                      >
                        {isGroupChat && m.sender_id !== myId ? (
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{m.sender_name || "User"}</p>
                        ) : null}
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
                  disabled={youthLocked || hasLeftGroup}
                  className="msg-input flex-1 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 resize-none overflow-y-auto min-h-[72px] max-h-48"
                  style={{ lineHeight: "1.5" }}
                />
                <div ref={emojiPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojis((v) => !v)}
                    disabled={youthLocked || hasLeftGroup}
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
                  disabled={blocked || youthLocked || hasLeftGroup}
                  className="h-11 rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              {!isGroupChat ? (
                <p className={`mt-1 shrink-0 text-xs text-neutral-300 italic flex items-center gap-1 transition-opacity duration-200 ${otherTyping ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                  {withUserLabel} is typing
                  <span className="flex items-center gap-[3px] ml-0.5">
                    <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1 w-1 rounded-full bg-neutral-300 animate-bounce [animation-delay:300ms]" />
                  </span>
                </p>
              ) : hasLeftGroup ? (
                <p className="mt-1 shrink-0 text-xs text-neutral-400 italic">
                  You left this group. You can still review earlier messages, but you will not receive future ones.
                </p>
              ) : null}
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

      {hideConfirmTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Hide conversation?</h2>
            <p className="text-sm text-neutral-400 mb-4">
              This will remove <span className="text-neutral-200">{hideConfirmTarget.name}</span> from your visible conversation list.
              If they send you a new message later, the conversation will automatically appear again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setHideConfirmTarget(null)}
                className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const target = hideConfirmTarget;
                  setHideConfirmTarget(null);
                  if (target) await hideConversation(target.userId);
                }}
                className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-600"
              >
                Hide
              </button>
            </div>
          </div>
        </div>
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
