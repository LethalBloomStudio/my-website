"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import ReportModal from "@/components/ReportModal";

export default function ReportButton({
  viewerId,
  profileUserId,
  targetName,
  isParentProfile = false,
}: {
  viewerId: string;
  profileUserId: string;
  targetName: string;
  isParentProfile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = supabaseBrowser();

  async function submitReport(reason: string) {
    setOpen(false);
    await supabase.from("profile_reports").insert({
      reporter_id: viewerId,
      reported_id: profileUserId,
      reason,
    });

    // Permanently block both directions
    await supabase
      .from("profile_friend_requests")
      .upsert(
        { sender_id: viewerId, receiver_id: profileUserId, status: "blocked" },
        { onConflict: "sender_id,receiver_id" }
      );
    await supabase
      .from("profile_friend_requests")
      .update({ status: "blocked" })
      .eq("sender_id", profileUserId)
      .eq("receiver_id", viewerId);

    setDone(true);
  }

  if (isParentProfile) return null;

  if (done) {
    return (
      <span className="mt-2 inline-block rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-4 py-1.5 text-xs text-neutral-400">
        Report submitted
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/40 px-3 py-1.5 text-xs text-neutral-400 hover:border-[rgba(120,120,120,0.5)] hover:text-neutral-400 transition"
        title="Report this user"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 1v14M3 1h9l-2 4 2 4H3"/>
        </svg>
        Report
      </button>
      {open && (
        <ReportModal
          targetName={targetName}
          onSubmit={(reason) => void submitReport(reason)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
