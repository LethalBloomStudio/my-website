"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type BlockedUser = {
  blocked_id: string;
  pen_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export default function BlockedUsersPanel() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchBlocked() {
    setLoading(true);
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setLoading(false); return; }

    const { data: blockRows, error } = await supabase
      .from("profile_blocks")
      .select("blocked_id")
      .eq("blocker_id", uid);

    if (error) { setMsg(error.message); setLoading(false); return; }

    const ids = (blockRows ?? []).map((r: { blocked_id: string }) => r.blocked_id);
    if (ids.length === 0) { setBlocked([]); setLoading(false); setLoaded(true); return; }

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, pen_name, username, avatar_url")
      .in("user_id", ids);

    setBlocked(
      ids.map((id: string) => {
        const p = ((profiles ?? []) as { user_id: string; pen_name: string | null; username: string | null; avatar_url: string | null }[]).find((x) => x.user_id === id);
        return {
          blocked_id: id,
          pen_name: p?.pen_name ?? null,
          username: p?.username ?? null,
          avatar_url: p?.avatar_url ?? null,
        };
      })
    );
    setLoading(false);
    setLoaded(true);
  }

  function toggle() {
    if (!open && !loaded) fetchBlocked();
    setOpen((v) => !v);
  }

  async function unblock(blockedId: string) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { error } = await supabase
      .from("profile_blocks")
      .delete()
      .eq("blocker_id", uid)
      .eq("blocked_id", blockedId);
    if (error) { setMsg(error.message); return; }
    setBlocked((prev) => prev.filter((u) => u.blocked_id !== blockedId));
  }

  return (
    <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] overflow-hidden">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-neutral-200">Blocked Users</span>
        <span className="text-neutral-500 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[rgba(120,120,120,0.25)] px-5 pb-5 pt-4">
          {msg && <p className="mb-3 text-sm text-red-300">{msg}</p>}
          {loading ? (
            <p className="text-sm text-neutral-400">Loading...</p>
          ) : blocked.length === 0 ? (
            <p className="text-sm text-neutral-400">No blocked users.</p>
          ) : (
            <ul className="space-y-3">
              {blocked.map((u) => {
                const displayName = u.pen_name || (u.username ? `@${u.username}` : "Unknown user");
                return (
                  <li key={u.blocked_id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt={displayName}
                        width={32}
                        height={32}
                       
                        className="h-8 w-8 rounded-full border border-neutral-700 object-cover shrink-0"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-xs text-neutral-300">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="flex-1 truncate text-sm text-neutral-200">{displayName}</span>
                    <button
                      onClick={() => void unblock(u.blocked_id)}
                      className="shrink-0 rounded-lg border border-[rgba(120,120,120,0.55)] bg-[rgba(120,120,120,0.12)] px-3 py-1 text-xs text-white hover:bg-[rgba(120,120,120,0.22)] transition"
                    >
                      Unblock
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
