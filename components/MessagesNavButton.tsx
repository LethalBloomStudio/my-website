"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function MessagesNavButton() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let userId: string | null = null;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    type GroupConversationUnreadRow = {
      unread_count?: number | null;
    };

    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      userId = auth.session?.user?.id ?? null;
      if (!userId || !mounted) {
        if (mounted) setVisible(false);
        return;
      }

      const { data: account } = await supabase
        .from("accounts")
        .select("age_category, is_deactivated")
        .eq("user_id", userId)
        .maybeSingle();

      const acc = account as {
        age_category?: string | null;
        is_deactivated?: boolean;
      } | null;

      if (acc?.age_category === "youth_13_17" || acc?.is_deactivated) {
        if (mounted) {
          setVisible(false);
          setCount(0);
        }
        return;
      }

      if (mounted) setVisible(true);
      await refreshCount(userId);

      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      if (userId && mounted) {
        realtimeChannel = supabase
          .channel(`msg-badge-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "direct_messages",
              filter: `receiver_id=eq.${userId}`,
            },
            () => {
              if (mounted) void refreshCount(userId!);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "direct_messages",
              filter: `receiver_id=eq.${userId}`,
            },
            () => {
              if (mounted) void refreshCount(userId!);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "group_messages",
            },
            () => {
              if (mounted) void refreshCount(userId!);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "group_message_members",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              if (mounted) void refreshCount(userId!);
            }
          )
          .subscribe();
      }
    }

    async function refreshCount(uid: string) {
      const [{ count: directCount }, { data: groupRows }] = await Promise.all([
        supabase
          .from("direct_messages")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", uid)
          .eq("status", "sent"),
        supabase.rpc("get_group_message_conversations", { p_user_id: uid }),
      ]);

      const groupUnreadCount = ((groupRows as GroupConversationUnreadRow[] | null) ?? []).reduce(
        (sum, row) => sum + Math.max(0, row.unread_count ?? 0),
        0
      );

      if (mounted) setCount((directCount ?? 0) + groupUnreadCount);
    }

    void load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    function onBadgeRefresh() {
      if (userId) void refreshCount(userId);
    }
    window.addEventListener("notif-badge-refresh", onBadgeRefresh);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
      window.removeEventListener("notif-badge-refresh", onBadgeRefresh);
    };
  }, [supabase]);

  if (!visible) return null;

  return (
    <Link
      href="/messages"
      className="iconTab"
      aria-label="Messages"
      title="Messages"
      data-tip="Messages"
    >
      {count > 0 ? (
        <span className="notifBadge">{count > 99 ? "99+" : count}</span>
      ) : null}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </Link>
  );
}
