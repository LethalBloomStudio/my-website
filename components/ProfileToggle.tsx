import Link from "next/link";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

export default async function ProfileToggle() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) return null;

  const { data: profile } = await supabase
    .from("public_profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const username = profile?.username?.toLowerCase();

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/settings/profile"
        className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 text-sm text-neutral-100 hover:bg-neutral-900"
      >
        Edit Private Profile
      </Link>

      <Link
        href={username ? `/u/${username}` : "/settings/profile"}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
      >
        View Public Profile
      </Link>
    </div>
  );
}
