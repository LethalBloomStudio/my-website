"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function AuthButton() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [label, setLabel] = useState("Sign in");
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [_isYouth, setIsYouth] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setSignedIn(false);
        setLabel("Sign in");
        setLoading(false);
        return;
      }

      const session = data.session;

      if (!session?.user) {
        setSignedIn(false);
        setLabel("Sign in");
        setLoading(false);
        return;
      }

      const userId = session.user.id;

      const [{ data: profile }, { data: account }] = await Promise.all([
        supabase.from("public_profiles").select("username, pen_name").eq("user_id", userId).maybeSingle(),
        supabase.from("accounts").select("is_admin, age_category").eq("user_id", userId).maybeSingle(),
      ]);
      const acct = account as { is_admin?: boolean; age_category?: string } | null;
      setIsAdmin(!!acct?.is_admin);
      setIsYouth(acct?.age_category === "youth_13_17");

      if (cancelled) return;

      const emailHandle = session.user.email?.split("@")[0] ?? null;
      const p = profile as { username?: string | null; pen_name?: string | null } | null;
      const metadata = (session.user.user_metadata ?? {}) as { full_name?: unknown };
      const metadataName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : null;
      const name =
        p?.pen_name?.trim() ||
        (p?.username ? `@${p.username}` : null) ||
        metadataName ||
        emailHandle ||
        "Account";

      setSignedIn(true);
      setLabel(name);
      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user?: unknown } | null) => {
      if (!session?.user) {
        setSignedIn(false);
        setLabel("Sign in");
        setOpen(false);
        setLoading(false);
        return;
      }
      load();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);


  useEffect(() => {
    if (!open) return;
    function handler(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    // setTimeout so the click that opened the menu doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener("click", handler, true);
      document.addEventListener("touchend", handler, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler, true);
      document.removeEventListener("touchend", handler, true);
    };
  }, [open]);

  function handleClick() {
    if (!signedIn) {
      router.push("/sign-in");
      return;
    }

    setOpen((v) => !v);
  }

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    setSignedIn(false);
    setLabel("Sign in");
    router.push("/sign-in");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`tab ${signedIn ? "tabCta" : ""}`}
        aria-label={signedIn ? "Open account menu" : "Sign in"}
        title={signedIn ? "Open account menu" : "Sign in"}
      >
        {loading ? "..." : label}
      </button>

      {signedIn && open ? (
        <>
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-lg border border-[rgba(120,120,120,0.75)] bg-[#111111] p-1 shadow-xl">
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-[rgba(120,120,120,0.35)]"
              onClick={() => setOpen(false)}
            >
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Admin</span>
              Dashboard
            </Link>
          )}
          <Link
            href="/profile"
            className="block rounded-md px-3 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.35)]"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/account"
            className="block rounded-md px-3 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.35)]"
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          <Link
            href="/subscription"
            className="block rounded-md px-3 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.35)]"
            onClick={() => setOpen(false)}
          >
            Subscription
          </Link>
          <Link
            href="/manage-youth"
            className="block rounded-md px-3 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.35)]"
            onClick={() => setOpen(false)}
          >
            Manage Youth
          </Link>
          <Link
            href="/sign-in"
            onClick={(e) => {
              e.preventDefault();
              void handleSignOut();
            }}
            className="block rounded-md px-3 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.35)]"
          >
            Sign out
          </Link>
        </div>
        </>
      ) : null }

    </div>
  );
}
