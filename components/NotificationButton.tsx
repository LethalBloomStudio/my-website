"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function NotificationButton() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadCount() {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || !mounted) {
        if (mounted) setCount(0);
        return;
      }

      const { data: manuscripts } = await supabase
        .from("manuscripts")
        .select("id")
        .eq("owner_id", userId);
      const manuscriptIds = ((manuscripts as Array<{ id: string }> | null) ?? []).map((m) => m.id);

      // Fetch read keys from DB so reads on other devices are reflected here
      let dbReadKeys: string[] = [];
      try {
        const rkRes = await fetch("/api/notifications/read-keys");
        if (rkRes.ok) {
          const rkData = (await rkRes.json()) as { keys: string[] };
          dbReadKeys = rkData.keys ?? [];
        }
      } catch { /* fall back to localStorage only */ }

      const localReadKeys =
        typeof window === "undefined"
          ? []
          : (() => {
              try {
                const raw = window.localStorage.getItem(`notif_read_keys_${userId}`);
                const parsed = raw ? (JSON.parse(raw) as (string | { key: string; readAt: number })[]) : [];
                return Array.isArray(parsed) ? parsed.map((e) => (typeof e === "string" ? e : e.key)) : [];
              } catch {
                return [];
              }
            })();
      const readKeySet = new Set([...dbReadKeys, ...localReadKeys]);

      const pendingFriendRequestsPromise = supabase
        .from("profile_friend_requests")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending");

      const systemUpdatesPromise = supabase
        .from("system_notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .neq("category", "messages");

      const moderationFlagsPromise = supabase
        .from("manuscript_moderation_flags")
        .select("id")
        .eq("owner_id", userId);

      const ownerFeedbackPromise =
        manuscriptIds.length > 0
          ? supabase.from("line_feedback").select("id").in("manuscript_id", manuscriptIds)
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null });
      const myFeedbackPromise = supabase.from("line_feedback").select("id").eq("reader_id", userId);
      const accessRequestsPromise =
        manuscriptIds.length > 0
          ? supabase
              .from("manuscript_access_requests")
              .select("id")
              .in("manuscript_id", manuscriptIds)
              .eq("status", "pending")
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null });
      const pendingInvitationsPromise = supabase
        .from("manuscript_invitations")
        .select("*", { count: "exact", head: true })
        .eq("reader_id", userId)
        .eq("status", "pending");

      const [moderationFlags, systemUpdates, ownerFeedback, myFeedback, accessRequests, pendingInvitations, pendingFriendRequests] = await Promise.all([
        moderationFlagsPromise,
        systemUpdatesPromise,
        ownerFeedbackPromise,
        myFeedbackPromise,
        accessRequestsPromise,
        pendingInvitationsPromise,
        pendingFriendRequestsPromise,
      ]);

      const ownerFeedbackIds = ((ownerFeedback.data as Array<{ id: string }> | null) ?? []).map((f) => f.id);
      const myFeedbackIds = ((myFeedback.data as Array<{ id: string }> | null) ?? []).map((f) => f.id);
      const allFeedbackIds = Array.from(new Set([...ownerFeedbackIds, ...myFeedbackIds]));

      let replyIds: string[] = [];
      if (allFeedbackIds.length > 0) {
        const replies = await supabase
          .from("line_feedback_replies")
          .select("id")
          .in("feedback_id", allFeedbackIds)
          .neq("replier_id", userId);
        replyIds = ((replies.data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
      }

      const localKeys: string[] = [
        ...ownerFeedbackIds.map((id) => `feedback-${id}`),
        ...replyIds.map((id) => `reply-${id}`),
        ...(((accessRequests.data as Array<{ id: string }> | null) ?? []).map((r) => `request-${r.id}`)),
        ...(((moderationFlags.data as Array<{ id: string }> | null) ?? []).map((m) => `mod-${m.id}`)),
      ];
      const unreadLocal = localKeys.filter((k) => !readKeySet.has(k)).length;

      const total = unreadLocal + (systemUpdates.count ?? 0) + (pendingInvitations.error ? 0 : (pendingInvitations.count ?? 0)) + (pendingFriendRequests.count ?? 0);

      if (mounted) setCount(total);
    }

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      await loadCount();
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || !mounted) return;

      realtimeChannel = supabase
        .channel(`notif-badge:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "system_notifications", filter: `user_id=eq.${userId}` },
          (payload: { new: Record<string, unknown> }) => { if (mounted && (payload.new as { category?: string })?.category !== "messages") void loadCount(); }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "system_notifications", filter: `user_id=eq.${userId}` },
          () => { if (mounted) void loadCount(); }
        )
        .subscribe();
    }

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (realtimeChannel) { void supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
      void init();
    });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadCount();
    }, 90000);

    function onStorage(ev: StorageEvent) {
      if (ev.key && ev.key.startsWith("notif_read_keys_")) {
        loadCount();
      }
    }
    function onBadgeRefresh() { void loadCount(); }
    window.addEventListener("storage", onStorage);
    window.addEventListener("notif-badge-refresh", onBadgeRefresh);

    return () => {
      mounted = false;
      clearInterval(timer);
      sub.subscription.unsubscribe();
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("notif-badge-refresh", onBadgeRefresh);
    };
  }, [supabase]);

  return (
    <Link href="/notifications" className="iconTab" aria-label="Notifications" title="Notifications" data-tip="Notifications">
      {count > 0 ? <span className="notifBadge">{count > 99 ? "99+" : count}</span> : null}
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </Link>
  );
}
