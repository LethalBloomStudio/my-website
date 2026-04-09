import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolvePostAuthPath(_supabase: SupabaseClient, _userId: string): Promise<string> {
  return "/profile";
}
