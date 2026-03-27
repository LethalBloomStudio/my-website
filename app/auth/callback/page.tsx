"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { resolvePostAuthPath } from "@/lib/postAuthRedirect";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [msg, setMsg] = useState("Finishing sign-in...");

  useEffect(() => {
    (async () => {
      try {
        // Supabase v2: for PKCE/email link flows, this will read the URL and set the session client-side.
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setMsg(error.message);
          return;
        }

        if (!data.session) {
          // If confirmations are enabled, sometimes the link confirms but doesn't create a session automatically.
          setMsg("Email confirmed. Please sign in.");
          router.replace("/sign-in");
          return;
        }

        const userId = data.session.user.id;
        const { data: account } = await supabase
          .from("accounts")
          .select("age_category, parental_consent")
          .eq("user_id", userId)
          .maybeSingle();
        const row = account as { age_category?: string | null; parental_consent?: boolean | null } | null;
        if (row?.age_category === "youth_13_17" && !row?.parental_consent) {
          await supabase.auth.signOut();
          setMsg("Parental authorization is pending. Please ask your parent/guardian to approve access.");
          router.replace("/sign-in");
          return;
        }

        const destination = await resolvePostAuthPath(supabase, userId);
        router.replace(destination);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Something went wrong.";
        setMsg(message);
      }
    })();
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-20">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <p className="text-sm text-neutral-200">{msg}</p>
        </section>
      </div>
    </main>
  );
}
