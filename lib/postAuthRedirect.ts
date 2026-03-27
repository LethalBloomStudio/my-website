import type { SupabaseClient } from "@supabase/supabase-js";

type UsernameRow = { username?: string | null } | null;

export async function resolvePostAuthPath(_supabase: SupabaseClient, _userId: string): Promise<string> {
  return "/profile";
}

