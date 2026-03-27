"use client";

import { useMemo } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function SignOutButton() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.replace("/sign-in");
  }

  return (
    <button
      onClick={handleSignOut}
      className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-700/60 bg-amber-900/30 px-4 text-sm font-medium text-amber-100 hover:bg-amber-900/50 transition"
    >
      Sign out
    </button>
  );
}
