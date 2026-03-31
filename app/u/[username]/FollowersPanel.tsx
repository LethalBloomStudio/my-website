"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Follower = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

export default function FollowersPanel({
  initialCount,
  followers,
  profileUserId,
}: {
  initialCount: number;
  followers: Follower[];
  profileUserId: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [open, setOpen] = useState(false);
  const supabase = useMemo(() => supabaseBrowser(), []);

  useEffect(() => {
    const ch = supabase
      .channel(`followers:${profileUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profile_follows", filter: `following_id=eq.${profileUserId}` },
        () => setCount((n) => n + 1)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profile_follows", filter: `following_id=eq.${profileUserId}` },
        () => setCount((n) => Math.max(0, n - 1))
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [profileUserId, supabase]);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-300 hover:border-[rgba(120,120,120,0.7)] hover:text-neutral-100 transition"
      >
        {count} {count === 1 ? "Follower" : "Followers"}
        {count > 0 && <span className="ml-1.5 text-xs opacity-60">{open ? "▲" : "▼"}</span>}
      </button>

      {open && followers.length > 0 && (
        <div className="mt-3 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">Who&apos;s Following You</p>
          <div className="flex flex-wrap gap-3 max-h-64 overflow-y-auto">
            {followers.map((f) => {
              const avatar = f.avatarUrl ? (
                <Image
                  src={f.avatarUrl}
                  alt={f.name}
                  width={44}
                  height={44}
                 
                  className="h-11 w-11 rounded-full border border-neutral-700 object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-sm font-medium text-neutral-300">
                  {f.name.charAt(0).toUpperCase()}
                </span>
              );

              return (
                <div key={f.userId} className="relative group">
                  {f.username ? (
                    <Link href={`/u/${f.username}`} className="block">
                      {avatar}
                    </Link>
                  ) : (
                    <div>{avatar}</div>
                  )}
                  {/* Name tooltip on hover */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900 px-2 py-1 text-xs text-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {f.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && followers.length === 0 && (
        <p className="mt-2 text-xs text-neutral-500">No followers yet.</p>
      )}
    </div>
  );
}
