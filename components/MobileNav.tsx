"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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

    function getReadKeySet(uid: string): Set<string> {
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(`notif_read_keys_${uid}`) : null;
        const parsed = raw ? (JSON.parse(raw) as (string | { key: string })[]) : [];
        return new Set(Array.isArray(parsed) ? parsed.map((e) => (typeof e === "string" ? e : e.key)) : []);
      } catch { return new Set(); }
    }

    async function refreshCounts(uid: string) {
      const { data: manuscripts } = await supabase.from("manuscripts").select("id").eq("owner_id", uid);
      const manuscriptIds = ((manuscripts as Array<{ id: string }> | null) ?? []).map((m) => m.id);

      let dbReadKeys: string[] = [];
      try {
        const rkRes = await fetch("/api/notifications/read-keys");
        if (rkRes.ok) {
          const rkData = (await rkRes.json()) as { keys: string[] };
          dbReadKeys = rkData.keys ?? [];
        }
      } catch {
        dbReadKeys = [];
      }

      const [friendReq, contactReq, unreadMessages, systemUpdates, ownerFeedback, accessRequests, pendingInvitations] = await Promise.all([
        supabase.from("profile_friend_requests").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "pending"),
        supabase.from("profile_contact_requests").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "pending"),
        supabase.from("direct_messages").select("*", { count: "exact", head: true }).eq("receiver_id", uid).eq("status", "sent"),
        supabase
          .from("system_notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("is_read", false)
          .neq("category", "messages")
          .not("title", "like", "New message from%"),
        manuscriptIds.length > 0
          ? supabase.from("line_feedback").select("id").in("manuscript_id", manuscriptIds)
          : Promise.resolve({ data: [] as Array<{ id: string }> }),
        manuscriptIds.length > 0
          ? supabase.from("manuscript_access_requests").select("id").in("manuscript_id", manuscriptIds).eq("status", "pending")
          : Promise.resolve({ data: [] as Array<{ id: string }> }),
        supabase.from("manuscript_invitations").select("*", { count: "exact", head: true }).eq("reader_id", uid).eq("status", "pending"),
      ]);
      if (cancelled) return;

      const localReadKeys = Array.from(getReadKeySet(uid));
      const readKeySet = new Set([...dbReadKeys, ...localReadKeys]);
      const ownerFeedbackIds = ((ownerFeedback.data as Array<{ id: string }> | null) ?? []).map((f) => f.id);
      const accessIds = ((accessRequests.data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
      const localKeys = [
        ...ownerFeedbackIds.map((id) => `feedback-${id}`),
        ...accessIds.map((id) => `request-${id}`),
      ];
      const unreadLocal = localKeys.filter((k) => !readKeySet.has(k)).length;

      setMsgCount((friendReq.count ?? 0) + (contactReq.count ?? 0) + (unreadMessages.count ?? 0));
      setNotifCount(unreadLocal + (systemUpdates.count ?? 0) + (pendingInvitations.count ?? 0));
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

    function onStorage(ev: StorageEvent) {
      if (ev.key?.startsWith("notif_read_keys_") && userId) void refreshCounts(userId);
    }
    function onBadgeRefresh() { if (userId) void refreshCounts(userId); }
    window.addEventListener("storage", onStorage);
    window.addEventListener("notif-badge-refresh", onBadgeRefresh);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("notif-badge-refresh", onBadgeRefresh);
    };
  }, [supabase]);

  const showAuthNav = signedIn && !isDeactivated && !isLocked;
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Close drawer on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    const t = setTimeout(() => {
      window.addEventListener("mousedown", handleOutside);
      window.addEventListener("touchstart", handleOutside);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  function close() { setOpen(false); }

  const drawer = open && mounted ? createPortal(
    <nav className="mobileDrawer" ref={drawerRef}>
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
          <Link href="/messages" className="mobileNavLink" onClick={close} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Messages
            {msgCount > 0 && <span className="notifBadge" style={{ position: "relative", top: "auto", right: "auto" }}>{msgCount > 99 ? "99+" : msgCount}</span>}
          </Link>
          <Link href="/notifications" className="mobileNavLink" onClick={close} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Notifications
            {notifCount > 0 && <span className="notifBadge" style={{ position: "relative", top: "auto", right: "auto" }}>{notifCount > 99 ? "99+" : notifCount}</span>}
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
      <div style={{ position: "relative", display: "inline-flex" }}>
        <button
          className="hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <span className={`hamburgerBar${open ? " open" : ""}`} />
          <span className={`hamburgerBar${open ? " open" : ""}`} />
          <span className={`hamburgerBar${open ? " open" : ""}`} />
        </button>
        {(msgCount + notifCount) > 0 && (
          <span className="notifBadge">
            {(msgCount + notifCount) > 99 ? "99+" : (msgCount + notifCount)}
          </span>
        )}
      </div>
      {drawer}
    </div>
  );
}
