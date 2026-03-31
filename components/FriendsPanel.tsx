"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

type Friend = {
  userId: string;
  penName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
};

type Props = {
  friends: Friend[];
  profileUserId: string;
  viewerUserId?: string | null;
};

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <Image src={url} alt={name} width={size} height={size}
        className="rounded-full object-cover border border-[rgba(120,120,120,0.4)]"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="flex items-center justify-center rounded-full bg-[rgba(120,120,120,0.2)] border border-[rgba(120,120,120,0.35)] text-neutral-300 font-medium"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function FriendsPanel({ friends, profileUserId, viewerUserId }: Props) {
  const isOwnList = viewerUserId === profileUserId;
  const [open, setOpen] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    if (!isOwnList) return;
    try {
      const res = await fetch("/api/friends/favorites");
      if (!res.ok) return;
      const { favorites } = await res.json() as { favorites: string[] };
      setStarred(new Set(favorites));
    } catch {
      // ignore
    }
  }, [isOwnList]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  async function toggleStar(userId: string) {
    if (togglingId) return;
    setTogglingId(userId);
    // Optimistic update
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
    try {
      await fetch("/api/friends/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendUserId: userId }),
      });
    } catch {
      // On failure, reload the real state from the server
      void loadFavorites();
    } finally {
      setTogglingId(null);
    }
  }

  // Sort: starred first, then alphabetical by display name
  const sorted = [...friends].sort((a, b) => {
    const aStarred = starred.has(a.userId) ? 0 : 1;
    const bStarred = starred.has(b.userId) ? 0 : 1;
    if (aStarred !== bStarred) return aStarred - bStarred;
    const aName = a.penName || a.username || "";
    const bName = b.penName || b.username || "";
    return aName.localeCompare(bName);
  });

  return (
    <>
      {/* Friends button — always visible, styled like social icons */}
      <button
        onClick={() => setOpen(true)}
        title="Friends"
        className="friends-panel-btn flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-110"
        style={{ background: "#ffffff", border: "2px solid #000000" }}
      >
        {/* Person with checkmark — confirmed friends */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="black" d="M9 12c2.21 0 4-1.79 4-4S11.21 4 9 4 5 5.79 5 8s1.79 4 4 4zm-7 8v-1c0-2.76 3.13-5 7-5s7 2.24 7 5v1H2z"/>
          <path fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 11l1.5 1.5L21 9"/>
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(120,120,120,0.2)]">
              <h2 className="text-sm font-semibold text-neutral-100">Friends</h2>
              <button onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-[rgba(120,120,120,0.15)] transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* List */}
            <div className="max-h-[60vh] overflow-y-auto">
              {friends.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-500">No friends yet.</p>
              ) : (
                <ul className="divide-y divide-[rgba(120,120,120,0.12)]">
                  {sorted.map(f => {
                    const displayName = f.penName || (f.username ? `@${f.username}` : "Friend");
                    const isStarred = starred.has(f.userId);
                    const profileHref = f.username ? `/u/${f.username.toLowerCase()}` : null;
                    return (
                      <li key={f.userId} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(120,120,120,0.06)] transition">
                        {profileHref ? (
                          <Link href={profileHref} className="shrink-0" onClick={() => setOpen(false)}>
                            <Avatar url={f.avatarUrl} name={displayName} />
                          </Link>
                        ) : (
                          <Avatar url={f.avatarUrl} name={displayName} />
                        )}
                        <div className="min-w-0 flex-1">
                          {profileHref ? (
                            <Link href={profileHref} onClick={() => setOpen(false)}
                              className="block text-sm font-medium text-neutral-200 hover:text-white transition truncate">
                              {displayName}
                            </Link>
                          ) : (
                            <span className="block text-sm font-medium text-neutral-200 truncate">{displayName}</span>
                          )}
                          {isOwnList && isStarred && (
                            <p className="text-[10px] text-amber-400 uppercase tracking-wide">Favorite</p>
                          )}
                        </div>
                        {isOwnList && (
                          <button
                            onClick={() => void toggleStar(f.userId)}
                            disabled={togglingId === f.userId}
                            title={isStarred ? "Remove from favorites" : "Add to favorites"}
                            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full transition hover:scale-110 hover:bg-[rgba(120,120,120,0.15)] disabled:opacity-50"
                          >
                            {isStarred ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {isOwnList && starred.size > 0 && (
              <div className="border-t border-[rgba(120,120,120,0.2)] px-5 py-2">
                <p className="text-[10px] text-neutral-600">★ Favorites stay at the top of your list</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
