"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function FollowButton({
  viewerId,
  profileUserId,
  initialFollowing,
}: {
  viewerId: string;
  profileUserId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    if (following) {
      await supabase
        .from("profile_follows")
        .delete()
        .eq("follower_id", viewerId)
        .eq("following_id", profileUserId);
      setFollowing(false);
    } else {
      await supabase
        .from("profile_follows")
        .insert({ follower_id: viewerId, following_id: profileUserId });
      setFollowing(true);
    }
    setLoading(false);
    router.refresh();
  }

  if (following) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        className="group rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-200 hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.22)] transition disabled:opacity-50"
      >
        {loading ? "..." : (
          <>
            <span className="group-hover:hidden">Following ✓</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition disabled:opacity-50"
    >
      {loading ? "..." : "Follow"}
    </button>
  );
}
