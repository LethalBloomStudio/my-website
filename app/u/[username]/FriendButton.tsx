"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type FriendStatus = "none" | "pending_sent" | "pending_received" | "accepted" | "unfriended" | "blocked";

export default function FriendButton({
  viewerId,
  profileUserId,
  initialStatus,
  isAdminProfile = false,
  isParentProfile = false,
  ownerAgeCategory = null,
  viewerAgeCategory = null,
}: {
  viewerId: string;
  profileUserId: string;
  initialStatus: FriendStatus;
  isAdminProfile?: boolean;
  isParentProfile?: boolean;
  ownerAgeCategory?: string | null;
  viewerAgeCategory?: string | null;
}) {
  const [status, setStatus] = useState<FriendStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowser();

  const isCrossAge =
    (viewerAgeCategory === "adult_18_plus" && ownerAgeCategory === "youth_13_17") ||
    (viewerAgeCategory === "youth_13_17" && ownerAgeCategory === "adult_18_plus");

  async function sendRequest() {
    if (isCrossAge) return;
    setLoading(true);
    const { data: existing } = await supabase
      .from("profile_friend_requests")
      .select("sender_id, receiver_id, status")
      .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${profileUserId}),and(sender_id.eq.${profileUserId},receiver_id.eq.${viewerId})`)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("profile_friend_requests")
        .update({ status: "pending", sender_id: viewerId, receiver_id: profileUserId })
        .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${profileUserId}),and(sender_id.eq.${profileUserId},receiver_id.eq.${viewerId})`);
    } else {
      await supabase.from("profile_friend_requests").insert({ sender_id: viewerId, receiver_id: profileUserId, status: "pending" });
    }
    setStatus("pending_sent");
    setLoading(false);
  }

  async function cancelRequest() {
    setLoading(true);
    await supabase.from("profile_friend_requests").delete().eq("sender_id", viewerId).eq("receiver_id", profileUserId);
    setStatus("none");
    setLoading(false);
  }

  async function acceptRequest() {
    setLoading(true);
    await supabase.from("profile_friend_requests").update({ status: "accepted" }).eq("sender_id", profileUserId).eq("receiver_id", viewerId);
    setStatus("accepted");
    setLoading(false);
  }

  async function denyRequest() {
    setLoading(true);
    await supabase.from("profile_friend_requests").update({ status: "denied" }).eq("sender_id", profileUserId).eq("receiver_id", viewerId);
    setStatus("none");
    setLoading(false);
  }

  async function unfriend() {
    if (!confirm("Remove this person from your friends? You can re-add them later.")) return;
    setLoading(true);
    await supabase
      .from("profile_friend_requests")
      .update({ status: "unfriended" })
      .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${profileUserId}),and(sender_id.eq.${profileUserId},receiver_id.eq.${viewerId})`);
    setStatus("unfriended");
    setLoading(false);
  }

  async function refriend() {
    setLoading(true);
    await supabase
      .from("profile_friend_requests")
      .update({ status: "accepted" })
      .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${profileUserId}),and(sender_id.eq.${profileUserId},receiver_id.eq.${viewerId})`);
    setStatus("accepted");
    setLoading(false);
  }

  if (status === "accepted") {
    if (isAdminProfile || isParentProfile) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-4 py-1.5 text-sm text-neutral-400 cursor-default select-none">
          Friends ✓
        </span>
      );
    }
    return (
      <button onClick={unfriend} disabled={loading} className="group rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-200 hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.22)] transition disabled:opacity-50">
        {loading ? "..." : (<><span className="group-hover:hidden">Friends ✓</span><span className="hidden group-hover:inline">Unfriend</span></>)}
      </button>
    );
  }

  if (status === "pending_sent") {
    return (
      <button onClick={cancelRequest} disabled={loading} className="rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-400 hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.22)] hover:text-neutral-200 transition disabled:opacity-50">
        {loading ? "..." : "Request Sent — Cancel"}
      </button>
    );
  }

  if (status === "pending_received") {
    return (
      <div className="flex gap-2">
        <button onClick={acceptRequest} disabled={loading} className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition disabled:opacity-50">{loading ? "..." : "Accept"}</button>
        <button onClick={denyRequest} disabled={loading} className="rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-300 hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.22)] transition disabled:opacity-50">{loading ? "..." : "Deny"}</button>
      </div>
    );
  }

  if (status === "unfriended") {
    return (
      <button onClick={refriend} disabled={loading} className="rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-4 py-1.5 text-sm text-neutral-200 hover:border-[rgba(120,120,120,0.8)] transition disabled:opacity-50">
        {loading ? "..." : "Re-add Friend"}
      </button>
    );
  }

  if (status === "blocked") {
    return <span className="inline-block rounded-lg border border-red-900/40 bg-red-950/10 px-4 py-1.5 text-sm text-red-900/60 cursor-not-allowed">Blocked</span>;
  }

  if (isCrossAge) return null;

  return (
    <button onClick={sendRequest} disabled={loading} className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition disabled:opacity-50">
      {loading ? "..." : "Add Friend"}
    </button>
  );
}
