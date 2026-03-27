"use client";

import { useState, useEffect, useMemo } from "react";
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

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (cancelled) return;
      if (!userId) { setSignedIn(false); return; }
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
    }

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user?: unknown } | null) => {
      if (!session?.user) {
        setSignedIn(false);
        setIsDeactivated(false);
      } else {
        void check();
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const showAuthNav = signedIn && !isDeactivated && !isLocked;

  function close() { setOpen(false); }

  return (
    <div className="mobileNavWrap">
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

      {open && (
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
              <Link href="/messages" className="mobileNavLink" onClick={close}>Messages</Link>
              <Link href="/notifications" className="mobileNavLink" onClick={close}>Notifications</Link>
              {(isYouth || isAdmin) && (
                <Link href="/youth-community" className="mobileNavLink" onClick={close}>Youth Community</Link>
              )}
              {isAdult && (
                <Link href="/community" className="mobileNavLink" onClick={close}>Community</Link>
              )}
            </>
          )}
        </nav>
      )}
    </div>
  );
}
