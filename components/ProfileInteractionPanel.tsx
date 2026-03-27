"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import Link from "next/link";
import ProseTextarea from "@/components/ProseTextarea";

export default function ProfileInteractionPanel({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const supabase = supabaseBrowser();
  const [msg, setMsg] = useState<string | null>(null);
  const [messageAllowed, setMessageAllowed] = useState<boolean | null>(null);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        setMessageAllowed(false);
        return;
      }
      const [{ data: myAcc }, { data: targetAcc }] = await Promise.all([
        supabase.from("accounts").select("age_category, blacklisted, messaging_suspended_until").eq("user_id", me).maybeSingle(),
        supabase.from("accounts").select("age_category").eq("user_id", targetUserId).maybeSingle(),
      ]);
      const myAge = (myAcc as { age_category?: string | null } | null)?.age_category ?? null;
      const targetAge = (targetAcc as { age_category?: string | null } | null)?.age_category ?? null;
      const blacklisted = Boolean((myAcc as { blacklisted?: boolean } | null)?.blacklisted);
      const suspendedUntil = (myAcc as { messaging_suspended_until?: string | null } | null)?.messaging_suspended_until;
      const suspended = suspendedUntil ? new Date(suspendedUntil).getTime() > Date.now() : false;
      setMessageAllowed(!blacklisted && !suspended && myAge === "adult_18_plus" && targetAge === "adult_18_plus");
    })();
  }, [supabase, targetUserId]);

  async function requireProfileComplete() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setMsg("Please sign in first.");
      return null;
    }

    const { data: profile } = await supabase
      .from("public_profiles")
      .select("profile_complete")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const complete = Boolean((profile as { profile_complete?: boolean } | null)?.profile_complete);
    if (!complete) {
      setMsg("Complete your profile before contacting other profiles.");
      return null;
    }

    return auth.user.id;
  }

  async function addFriend() {
    setMsg(null);
    const senderId = await requireProfileComplete();
    if (!senderId) return;

    const { error } = await supabase.from("profile_friend_requests").insert({
      sender_id: senderId,
      receiver_id: targetUserId,
      status: "pending",
    });

    setMsg(error ? error.message : "Friend request sent.");
  }

  async function blockProfile() {
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setMsg("Please sign in first.");

    const { error } = await supabase.from("profile_blocks").upsert({
      blocker_id: auth.user.id,
      blocked_id: targetUserId,
    });

    setMsg(error ? error.message : "Profile blocked.");
  }

  async function reportProfile() {
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setMsg("Please sign in first.");

    const { error } = await supabase.from("profile_reports").insert({
      reporter_id: auth.user.id,
      reported_id: targetUserId,
      reason: "user_report",
      details: "Reported from public profile page.",
      status: "pending_owner_review",
    });

    setMsg(error ? error.message : "Report submitted for review.");
  }

  async function sendContactRequest() {
    setMsg(null);
    const senderId = await requireProfileComplete();
    if (!senderId) return;
    if (q1.trim().length < 10 || q2.trim().length < 10 || q3.trim().length < 10) {
      setMsg("Please answer all three get-to-know-me questions.");
      return;
    }

    const { error } = await supabase.from("profile_contact_requests").insert({
      sender_id: senderId,
      receiver_id: targetUserId,
      question_1: q1.trim(),
      question_2: q2.trim(),
      question_3: q3.trim(),
      status: "pending",
    });

    if (!error) {
      setQ1("");
      setQ2("");
      setQ3("");
    }
    setMsg(error ? error.message : "Contact request sent.");
  }

  return (
    <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/20 p-5">
      <h2 className="text-lg font-semibold">Connect</h2>
      <div className="flex flex-wrap gap-2">
        {messageAllowed ? (
          <Link href={`/messages?with=${encodeURIComponent(targetUserId)}`} className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm">
            Message
          </Link>
        ) : (
          <button className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm opacity-60" disabled>
            Message (Adults only)
          </button>
        )}
        <button onClick={addFriend} className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm">
          Add Friend
        </button>
        <button onClick={blockProfile} className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm">
          Block
        </button>
        <button onClick={reportProfile} className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm">
          Report
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-neutral-300">Get to know me questions (required before contact)</p>
        <ProseTextarea
          rows={2}
          placeholder="What are you currently writing and why?"
          value={q1}
          onChange={setQ1}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
        />
        <ProseTextarea
          rows={2}
          placeholder="What kind of feedback helps you most?"
          value={q2}
          onChange={setQ2}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
        />
        <ProseTextarea
          rows={2}
          placeholder="What are your writing goals right now?"
          value={q3}
          onChange={setQ3}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
        />
        <button
          onClick={sendContactRequest}
          className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm"
        >
          Send Contact Request
        </button>
      </div>

      {msg ? <p className="text-sm text-neutral-300">{msg}</p> : null}
    </section>
  );
}
