"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Call this inside a useEffect (or pass the supabase client and let it self-manage).
 * If the current user's account is deactivated, redirects to /account.
 */
export function useDeactivationGuard(supabase: SupabaseClient) {
  const router = useRouter();

  useEffect(() => {
    async function check() {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId) return;
      const { data: acc } = await supabase
        .from("accounts")
        .select("is_deactivated")
        .eq("user_id", userId)
        .maybeSingle();
      if ((acc as { is_deactivated?: boolean } | null)?.is_deactivated) {
        router.replace("/account");
      }
    }
    void check();
  }, [supabase, router]);
}
