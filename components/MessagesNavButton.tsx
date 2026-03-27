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

    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || !mounted) {
        if (mounted) setVisible(false);
        return;
      }

      const { data: account } = await supabase
        .from("accounts")
        .select("age_category, is_deactivated")
        .eq("user_id", userId)
        .maybeSingle();

      const acc = account as { age_category?: string | null; is_deactivated?: boolean } | null;
      if (acc?.age_category === "youth_13_17" || acc?.is_deactivated) {
        if (mounted) {
          setVisible(false);
          setCount(0);
        }
        return;
      }

      const [friendReq, contactReq, unreadMessages] = await Promise.all([
        supabase
          .from("profile_friend_requests")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", userId)
          .eq("status", "pending"),
        supabase
          .from("profile_contact_requests")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", userId)
          .eq("status", "pending"),
        supabase
          .from("direct_messages")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", userId)
          .eq("status", "sent"),
      ]);

      const total = (friendReq.count ?? 0) + (contactReq.count ?? 0) + (unreadMessages.count ?? 0);
      if (mounted) {
        setVisible(true);
        setCount(total);
      }
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
      }
    }, 90000);

    return () => {
      mounted = false;
      clearInterval(timer);
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!visible) return null;

  return (
    <Link href="/messages" className="iconTab" aria-label="Messages" title="Messages" data-tip="Messages">
      {count > 0 ? <span className="notifBadge">{count > 99 ? "99+" : count}</span> : null}
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </Link>
  );
}
