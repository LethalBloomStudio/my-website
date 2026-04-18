"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import BetaReadersNavButton from "@/components/BetaReadersNavButton";
import ManuscriptButton from "@/components/ManuscriptButton";
import WalletNavButton from "@/components/WalletNavButton";
import NotificationButton from "@/components/NotificationButton";

export default function AuthGatedNav() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [signedIn, setSignedIn] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [isLocked, setIsLocked] = useState(false); // youth without parental consent
  const [isAdult, setIsAdult] = useState(false);
  const [isYouth, setIsYouth] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (cancelled) return;
      if (!userId) {
        setSignedIn(false);
        setReady(true);
        return;
      }
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
      setReady(true);
    }

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user?: unknown } | null) => {
      if (!session?.user) {
        setSignedIn(false);
        setIsDeactivated(false);
        setReady(true);
      } else {
        void check();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!ready || !signedIn || isDeactivated || isLocked) return null;

  return (
    <>
      <Link href="/discover" className="tab">
        Discover
      </Link>
      {isAdmin && (
        <Link href="/beta-readers?view=youth" className="iconTab" aria-label="Youth Beta Readers" data-tip="Youth Beta Readers">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <path d="M19 3l1.2 2.5 2.8.4-2 2 .5 2.8L19 9.4l-2.5 1.3.5-2.8-2-2 2.8-.4z" />
          </svg>
        </Link>
      )}
      <BetaReadersNavButton />
      <ManuscriptButton />
      <WalletNavButton />
      {(isYouth || isAdmin) && (
        <Link href="/youth-community" className="iconTab" aria-label="Youth Community" title="Youth Community" data-tip="Youth Community">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </Link>
      )}
      {isAdult && (
        <Link href="/community" className="iconTab" aria-label="Community" title="Community" data-tip="Community">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </Link>
      )}
      <NotificationButton />
    </>
  );
}
