"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Props = {
  initialMessage: string | null;
  initialActive: boolean;
  isAdmin: boolean;
  audience?: "adult" | "youth";
};

export default function CommunityAnnouncementBanner({
  initialMessage,
  initialActive,
  isAdmin,
  audience = "adult",
}: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [draft, setDraft] = useState(initialMessage ?? "");
  const [isActive, setIsActive] = useState(initialActive && !!initialMessage);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const showBanner = isActive && message.trim().length > 0;
  const marqueeText = Array.from({ length: 4 }, () => message.trim()).filter(Boolean).join("   ✦   ");

  async function saveAnnouncement(nextActive: boolean) {
    setSaving(true);
    setMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMsg("You must be signed in as an admin.");
        return;
      }

      const res = await fetch("/api/admin/community-announcement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audience,
          message: draft,
          is_active: nextActive,
        }),
      });

      const json = await res.json() as { ok?: boolean; error?: string; announcement?: { message: string; is_active: boolean } };
      if (!res.ok || !json.ok || !json.announcement) {
        setMsg(json.error ?? "Unable to update the community announcement.");
        return;
      }

      setMessage(json.announcement.message);
      setDraft(json.announcement.message);
      setIsActive(json.announcement.is_active);
      setMsg(nextActive ? "Community announcement updated." : "Community announcement hidden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {showBanner ? (
        <div className="overflow-hidden rounded-2xl border border-violet-700/40 bg-violet-950/40 px-4 py-3 backdrop-blur-sm">
          <div className="community-announcement-marquee">
            <div className="community-announcement-marquee__track">
              <span className="community-announcement-marquee__copy">{marqueeText}</span>
              <span className="community-announcement-marquee__copy" aria-hidden="true">{marqueeText}</span>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="rounded-2xl border border-[rgba(120,120,120,0.28)] bg-[rgba(18,18,18,0.92)] p-4">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Admin Community Announcement</p>
            <p className="mt-1 text-xs text-neutral-400">
              This banner appears under Recent Uploads and above the discussion board/community feed for everyone who can view this page.
            </p>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write the community announcement text here..."
            className="w-full resize-none rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void saveAnnouncement(true)}
              disabled={saving || !draft.trim()}
              className="rounded-lg border border-violet-700/40 bg-violet-950/30 px-4 py-2 text-sm font-medium text-violet-200 transition hover:bg-violet-900/40 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Publish Banner"}
            </button>
            <button
              onClick={() => void saveAnnouncement(false)}
              disabled={saving || (!isActive && !message.trim())}
              className="rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-4 py-2 text-sm text-neutral-300 transition hover:text-white disabled:opacity-40"
            >
              Hide Banner
            </button>
          </div>
          {msg ? <p className="mt-3 text-xs text-neutral-400">{msg}</p> : null}
        </div>
      ) : null}

      <style jsx>{`
        .community-announcement-marquee {
          overflow: hidden;
          white-space: nowrap;
        }

        .community-announcement-marquee__track {
          display: inline-flex;
          min-width: 100%;
          animation: community-marquee 24s linear infinite;
        }

        .community-announcement-marquee__copy {
          flex: 0 0 auto;
          padding-right: 2rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: rgb(221 214 254);
        }

        @keyframes community-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
