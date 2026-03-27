import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  if (typeof window === "undefined") {
    return {} as ReturnType<typeof createBrowserClient>;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      "[Supabase] Missing env vars — NEXT_PUBLIC_SUPABASE_URL:",
      url ?? "(undefined)",
      "| NEXT_PUBLIC_SUPABASE_ANON_KEY:",
      key ? "(set)" : "(undefined)"
    );
    return {} as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(url, key);
}