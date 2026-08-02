import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserClient | null = null;

function isInvalidRefreshTokenError(message: string | undefined) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

function createSafeBrowserClient(url: string, key: string): BrowserClient {
  const client = createBrowserClient(url, key);
  const getSession = client.auth.getSession.bind(client.auth);

  client.auth.getSession = async (...args: Parameters<typeof getSession>) => {
    const result = await getSession(...args);
    if (!result.error || !isInvalidRefreshTokenError(result.error.message)) {
      return result;
    }

    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      // Best effort cleanup. We still want the app to recover to a signed-out state.
    }

    return {
      data: { session: null },
      error: null,
    };
  };

  return client;
}

export function supabaseBrowser() {
  if (typeof window === "undefined") {
    return {} as BrowserClient;
  }

  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      "[Supabase] Missing env vars - NEXT_PUBLIC_SUPABASE_URL:",
      url ?? "(undefined)",
      "| NEXT_PUBLIC_SUPABASE_ANON_KEY:",
      key ? "(set)" : "(undefined)"
    );
    return {} as BrowserClient;
  }

  browserClient = createSafeBrowserClient(url, key);
  return browserClient;
}
