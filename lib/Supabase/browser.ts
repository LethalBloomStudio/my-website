import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  // During SSR/build, window is undefined. Return a safe stub so useMemo
  // initializations don't throw — useEffect (where Supabase is actually
  // called) never runs server-side, so the stub is never accessed.
  if (typeof window === "undefined") {
    return {} as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}