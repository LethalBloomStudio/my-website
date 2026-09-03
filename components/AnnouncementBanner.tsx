"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type Props = {
  initialMessage: string | null;
  initialActive: boolean;
  canEdit: boolean;
  // Where the edit form POSTs. Must return { ok, announcement: { message, is_active } }
  // on success, matching /api/admin/community-announcement and
  // /api/book-club/cycle-banner's response shape.
  saveEndpoint: string;
  // Extra fields merged into the POST body alongside { message, is_active }
  // (e.g. { audience: "adult" } or { cycle_id }).
  extraBody?: Record<string, unknown>;
  // Shown (still as a marquee) when there's no active custom message set.
  // Omit to fall back to rendering nothing, like the original Community-only
  // behavior.
  fallbackMessage?: string;
  editorLabel?: string;
  editorHelpText?: string;
  editorPlaceholder?: string;
};

export default function AnnouncementBanner({
  initialMessage,
  initialActive,
  canEdit,
  saveEndpoint,
  extraBody,
  fallbackMessage,
  editorLabel = "Admin Community Announcement",
  editorHelpText = "This banner appears under Recent Uploads and above the discussion board/community feed for everyone who can view this page.",
  editorPlaceholder = "Write the community announcement text here...",
}: Props) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [draft, setDraft] = useState(initialMessage ?? "");
  const [isActive, setIsActive] = useState(initialActive && !!initialMessage);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const showCustom = isActive && message.trim().length > 0;
  const displayText = showCustom ? message.trim() : (fallbackMessage ?? "").trim();
  const showBanner = displayText.length > 0;
  const marqueeText = Array.from({ length: 4 }, () => displayText).filter(Boolean).join("   ✦   ");

  async function saveAnnouncement(nextActive: boolean) {
    setSaving(true);
    setMsg(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMsg("You must be signed in to do that.");
        return;
      }

      const res = await fetch(saveEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: draft,
          is_active: nextActive,
          ...extraBody,
        }),
      });

      const json = await res.json() as { ok?: boolean; error?: string; announcement?: { message: string; is_active: boolean } };
      if (!res.ok || !json.ok || !json.announcement) {
        setMsg(json.error ?? "Unable to update the banner.");
        return;
      }

      setMessage(json.announcement.message);
      setDraft(json.announcement.message);
      setIsActive(json.announcement.is_active);
      setMsg(nextActive ? "Banner updated." : "Banner hidden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      {showBanner ? (
        <div className="overflow-hidden rounded-xl border border-violet-700/40 bg-violet-950/40 px-3 py-1 backdrop-blur-sm">
          <div className="announcement-marquee">
            <div className="announcement-marquee__track">
              <span className="announcement-marquee__copy">{marqueeText}</span>
              <span className="announcement-marquee__copy" aria-hidden="true">{marqueeText}</span>
            </div>
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="rounded-xl border border-[rgba(120,120,120,0.24)] bg-[rgba(18,18,18,0.92)] px-3 py-2.5">
          <div className="mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{editorLabel}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{editorHelpText}</p>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={editorPlaceholder}
            className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.32)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => void saveAnnouncement(true)}
              disabled={saving || !draft.trim()}
              className="rounded-lg border border-violet-700/40 bg-violet-950/30 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-900/40 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Publish Banner"}
            </button>
            <button
              onClick={() => void saveAnnouncement(false)}
              disabled={saving || (!isActive && !message.trim())}
              className="rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-300 transition hover:text-white disabled:opacity-40"
            >
              Hide Banner
            </button>
          </div>
          {msg ? <p className="mt-2 text-[11px] text-neutral-400">{msg}</p> : null}
        </div>
      ) : null}

      <style jsx>{`
        .announcement-marquee {
          overflow: hidden;
          white-space: nowrap;
        }

        .announcement-marquee__track {
          display: inline-flex;
          min-width: 100%;
          animation: announcement-marquee-scroll 58s linear infinite;
        }

        .announcement-marquee__copy {
          flex: 0 0 auto;
          padding-right: 1.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1.05;
          color: rgb(221 214 254);
        }

        @keyframes announcement-marquee-scroll {
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
