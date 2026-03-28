"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [signedIn, setSignedIn] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isAdult, setIsAdult] = useState(false);
  const [isYouth, setIsYouth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshCounts(uid: string) {
      const [friendReq, contactReq, unreadMessages, unreadNotifs] = await Promise.all([
        supabase.from("profile_friend_requests").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "pending"),
        supabase.from("profile_contact_requests").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "pending"),
        supabase.from("direct_messages").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "sent"),
        supabase.from("system_notifications").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("is_read", false),
      ]);
      if (cancelled) return;
      setMsgCount((friendReq.count ?? 0) + (contactReq.count ?? 0) + (unreadMessages.count ?? 0));
      setNotifCount(unreadNotifs.count ?? 0);
    }

    async function check() {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id ?? null;
      if (cancelled) return;
      if (!userId) { setSignedIn(false); setMsgCount(0); setNotifCount(0); return; }
      setSignedIn(true);
      const { data: acc } = await supabase
        .from("accounts")
        .select("is_deactivated, age_category, parental_consent, is_admin")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const a = acc as { is_deactivated?: boolean; age_category?: string; parental_consent?: boolean; is_admin?: boolean } | null;
      setIsDeactivated(!!a?.is_deactivated);
      setIsLocked(a?.age_category === "youth_13_17" && !a?.parental_consent);
      setIsAdult(a?.age_category === "adult_18_plus");
      setIsYouth(a?.age_category === "youth_13_17");
      setIsAdmin(!!a?.is_admin);

      if (!a?.is_deactivated && a?.age_category !== "youth_13_17") {
        await refreshCounts(userId);
      }

      if (realtimeChannel) { void supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
      if (userId && !cancelled && !a?.is_deactivated) {
        realtimeChannel = supabase
          .channel(`mobile-nav-badge-${userId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${userId}` },
            () => { if (!cancelled && userId) void refreshCounts(userId); })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${userId}` },
            () => { if (!cancelled && userId) void refreshCounts(userId); })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_notifications", filter: `user_id=eq.${userId}` },
            () => { if (!cancelled && userId) void refreshCounts(userId); })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "system_notifications", filter: `user_id=eq.${userId}` },
            () => { if (!cancelled && userId) void refreshCounts(userId); })
          .subscribe();
      }
    }

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user?: unknown } | null) => {
      if (!session?.user) {
        setSignedIn(false);
        setIsDeactivated(false);
        setMsgCount(0);
        setNotifCount(0);
      } else {
        void check();
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); if (realtimeChannel) void supabase.removeChannel(realtimeChannel); };
  }, [supabase]);

  const showAuthNav = signedIn && !isDeactivated && !isLocked;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  function close() { setOpen(false); }

  const drawer = open && mounted ? createPortal(
    <nav className="mobileDrawer">
      <Link href="/" className="mobileNavLink" onClick={close}>Home</Link>
      <Link href="/pricing" className="mobileNavLink" onClick={close}>Pricing</Link>
      <Link href="/help" className="mobileNavLink" onClick={close}>Help</Link>

      {showAuthNav && (
        <>
          <div className="mobileNavDivider" />
          <Link href="/discover" className="mobileNavLink" onClick={close}>Discover</Link>
          <Link href="/beta-readers" className="mobileNavLink" onClick={close}>Beta Readers</Link>
          <Link href="/manuscripts" className="mobileNavLink" onClick={close}>Manuscripts</Link>
          <Link href="/wallet" className="mobileNavLink" onClick={close}>Wallet</Link>
          <Link href="/messages" className="mobileNavLink" onClick={close}>
            Messages
            {msgCount > 0 && <span className="notifBadge" style={{ marginLeft: "8px" }}>{msgCount > 99 ? "99+" : msgCount}</span>}
          </Link>
          <Link href="/notifications" className="mobileNavLink" onClick={close}>
            Notifications
            {notifCount > 0 && <span className="notifBadge" style={{ marginLeft: "8px" }}>{notifCount > 99 ? "99+" : notifCount}</span>}
          </Link>
          {(isYouth || isAdmin) && (
            <Link href="/youth-community" className="mobileNavLink" onClick={close}>Youth Community</Link>
          )}
          {isAdult && (
            <Link href="/community" className="mobileNavLink" onClick={close}>Community</Link>
          )}
        </>
      )}
    </nav>,
    document.body
  ) : null;

  return (
    <div className="mobileNavWrap">
      <button
        className="hamburger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={open}
        style={{ position: "relative" }}
      >
        {(msgCount + notifCount) > 0 && (
          <span className="notifBadge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>
            {(msgCount + notifCount) > 99 ? "99+" : (msgCount + notifCount)}
          </span>
        )}
        <span className={`hamburgerBar${open ? " open" : ""}`} />
        <span className={`hamburgerBar${open ? " open" : ""}`} />
        <span className={`hamburgerBar${open ? " open" : ""}`} />
      </button>
      {drawer}
    </div>
  );
}
