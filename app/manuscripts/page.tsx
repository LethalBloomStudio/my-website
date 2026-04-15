"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { useDeactivationGuard } from "@/lib/useDeactivationGuard";

type Manuscript = {
  id: string;
  title: string;
  genre: string | null;
  word_count: number;
  age_rating: string;
  visibility: "private" | "public";
  created_at: string;
  cover_url: string | null;
};

type BetaManuscript = {
  id: string;
  title: string;
  genre: string | null;
  cover_url: string | null;
  owner_pen_name: string | null;
  owner_username: string | null;
};

type AppealStatus = {
  id: string;
  status: string;
  admin_note?: string | null;
  created_at: string;
} | null;

function CoverThumb({ url, title }: { url: string | null; title: string }) {
  return url ? (
    <Image
      src={url}
      alt={`${title} cover`}
      width={64}
      height={96}
     
      className="h-24 w-16 shrink-0 rounded-lg border border-neutral-700 object-cover"
    />
  ) : (
    <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950/40 text-[10px] text-neutral-500">
      No Cover
    </div>
  );
}

export default function ManuscriptsPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  useDeactivationGuard(supabase);
  const [items, setItems] = useState<Manuscript[]>([]);
  const [betaItems, setBetaItems] = useState<BetaManuscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [isYouth, setIsYouth] = useState(false);
  const [conduct, setConduct] = useState<{
    manuscript_conduct_strikes: number;
    manuscript_suspended_until: string | null;
    manuscript_blacklisted: boolean;
    manuscript_lifetime_suspension_count: number;
  } | null>(null);
  const [latestAppeal, setLatestAppeal] = useState<AppealStatus>(null);
  const [appealModal, setAppealModal] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealMsg, setAppealMsg] = useState<string | null>(null);
  const now = Date.now(); // eslint-disable-line react-hooks/purity

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setItems([]);
        setLoading(false);
        setMsg("Please sign in to view your manuscripts.");
        return;
      }

      const uid = auth.user.id;

      // Manuscript conduct status
      const { data: conductData } = await supabase
        .from("accounts")
        .select("age_category, manuscript_conduct_strikes, manuscript_suspended_until, manuscript_blacklisted, manuscript_lifetime_suspension_count")
        .eq("user_id", uid)
        .maybeSingle();
      const c = conductData as { age_category?: string | null; manuscript_conduct_strikes?: number | null; manuscript_suspended_until?: string | null; manuscript_blacklisted?: boolean | null; manuscript_lifetime_suspension_count?: number | null } | null;
      setIsYouth(c?.age_category === "youth_13_17");
      setConduct({
        manuscript_conduct_strikes: c?.manuscript_conduct_strikes ?? 0,
        manuscript_suspended_until: c?.manuscript_suspended_until ?? null,
        manuscript_blacklisted: !!c?.manuscript_blacklisted,
        manuscript_lifetime_suspension_count: c?.manuscript_lifetime_suspension_count ?? 0,
      });

      // Latest appeal
      const { data: appealData } = await supabase
        .from("conduct_appeals")
        .select("id, status, admin_note, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestAppeal((appealData as AppealStatus) ?? null);

      // Own manuscripts
      const { data, error } = await supabase
        .from("manuscripts")
        .select("id, title, genre, word_count, age_rating, visibility, created_at, cover_url")
        .eq("owner_id", uid)
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
      } else {
        setItems((data as Manuscript[]) ?? []);
      }

      // Manuscripts accepted to beta read (approved access grants, not own)
      const { data: grantRows } = await supabase
        .from("manuscript_access_grants")
        .select("manuscript_id")
        .eq("reader_id", uid);

      const grantedIds = (grantRows ?? []).map((r: { manuscript_id: string }) => r.manuscript_id);

      if (grantedIds.length > 0) {
        const { data: betaData } = await supabase
          .from("manuscripts")
          .select("id, title, genre, cover_url, owner_id")
          .in("id", grantedIds)
          .neq("owner_id", uid); // exclude own manuscripts

        const betaRows = (betaData as Array<{ id: string; title: string; genre: string | null; cover_url: string | null; owner_id: string }> | null) ?? [];

        if (betaRows.length > 0) {
          const ownerIds = [...new Set(betaRows.map((r) => r.owner_id))];
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("user_id, pen_name, username")
            .in("user_id", ownerIds);
          const profileMap = new Map(
            ((profiles as Array<{ user_id: string; pen_name: string | null; username: string | null }> | null) ?? [])
              .map((p) => [p.user_id, p])
          );
          setBetaItems(
            betaRows.map((r) => {
              const p = profileMap.get(r.owner_id);
              return {
                id: r.id,
                title: r.title,
                genre: r.genre,
                cover_url: r.cover_url,
                owner_pen_name: p?.pen_name ?? null,
                owner_username: p?.username ?? null,
              };
            })
          );
        }
      }

      setLoading(false);
    })();
  }, [supabase]);

  async function leaveProject(manuscriptId: string) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    // Mark request as "left" - slot stays filled, author cannot re-enable
    await supabase
      .from("manuscript_access_requests")
      .update({ status: "left" })
      .eq("manuscript_id", manuscriptId)
      .eq("requester_id", uid);
    // Remove grant (trigger also does this, belt-and-suspenders)
    await supabase
      .from("manuscript_access_grants")
      .delete()
      .eq("manuscript_id", manuscriptId)
      .eq("reader_id", uid);
    setBetaItems((prev) => prev.filter((m) => m.id !== manuscriptId));
  }

  async function submitAppeal() {
    if (appealReason.trim().length < 20) {
      setAppealMsg("Please provide more detail (at least 20 characters).");
      return;
    }
    setAppealSubmitting(true);
    setAppealMsg(null);
    const res = await fetch("/api/manuscript/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: appealReason.trim() }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setAppealSubmitting(false);
    if (!res.ok) {
      setAppealMsg(json.error ?? "Failed to submit appeal.");
      return;
    }
    setAppealModal(false);
    setAppealReason("");
    // Refresh appeal status
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const { data: appealData } = await supabase
        .from("conduct_appeals")
        .select("id, status, admin_note, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestAppeal((appealData as AppealStatus) ?? null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Manuscripts</h1>
            <p className="mt-2 text-neutral-300">Manage your uploaded drafts and chapters.</p>
          </div>
          <Link
            href="/manuscripts/new"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] px-4 text-sm font-medium text-white hover:bg-[#606060]"
          >
            Upload Manuscript
          </Link>
        </div>

        {msg ? (
          <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-4 text-sm text-white">
            {msg}
          </div>
        ) : null}

        {/* ── Own manuscripts ── */}
        <section className="section-card mt-8 rounded-xl border border-[rgba(120,120,120,0.45)] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-neutral-400">Your Manuscripts</h2>
          {loading ? (
            <p className="text-sm text-neutral-300">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-300">No manuscripts yet. Upload your first chapter.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((m) => (
                <li key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 hover:border-[rgba(120,120,120,0.6)]">
                  <Link href={`/manuscripts/${m.id}/details`} className="group block w-full text-left">
                    <div className="flex gap-3">
                      <CoverThumb url={m.cover_url} title={m.title} />
                      <div className="min-w-0">
                        <h3 className="text-lg font-medium text-white group-hover:underline">{m.title}</h3>
                        <p className="mt-1 text-sm text-neutral-300">
                          {m.genre ?? "Uncategorized"} | {m.word_count} words | {m.age_rating}
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          Status: {m.visibility === "public" ? "Published" : "Draft (Private)"}
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </Link>
                  <div className="mt-3">
                    <Link href={`/manuscripts/${m.id}/details`} className="mr-4 text-xs text-[rgba(210,210,210,1)] hover:underline">
                      Open Book Page
                    </Link>
                    <Link href={`/manuscripts/${m.id}`} className="text-xs text-[rgba(210,210,210,1)] hover:underline">
                      Open Reader View
                    </Link>
                    {m.visibility === "public" ? (
                      <Link href="/discover" className="ml-4 text-xs text-[rgba(210,210,210,1)] hover:underline">
                        Live on Discover
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Beta reading ── */}
        {!loading && (() => {
          const isMsBlocked = conduct && (
            conduct.manuscript_blacklisted ||
            (conduct.manuscript_suspended_until && new Date(conduct.manuscript_suspended_until).getTime() > now)
          );
          return (
            <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.9)] p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-neutral-400">Beta Reading</h2>
              {isMsBlocked ? (
                <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
                  Beta reading access is frozen while your manuscript privileges are{" "}
                  {conduct?.manuscript_blacklisted ? "blacklisted" : "suspended"}. Submit an appeal below to restore access.
                </div>
              ) : betaItems.length === 0 ? (
                <p className="text-sm text-neutral-300">None</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {betaItems.map((m) => (
                    <li key={m.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 hover:border-[rgba(120,120,120,0.6)]">
                      <Link href={`/manuscripts/${m.id}`} className="group block w-full text-left">
                        <div className="flex gap-3">
                          <CoverThumb url={m.cover_url} title={m.title} />
                          <div className="min-w-0">
                            <h3 className="text-lg font-medium text-white group-hover:underline">{m.title}</h3>
                            <p className="mt-1 text-sm text-neutral-300">{m.genre ?? "Uncategorized"}</p>
                          </div>
                        </div>
                      </Link>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <Link href={`/manuscripts/${m.id}`} className="text-xs text-[rgba(210,210,210,1)] hover:underline">
                          Open Reader View
                        </Link>
                        {(m.owner_pen_name || m.owner_username) && (
                          <span className="text-xs text-neutral-400">
                            by{" "}
                            <Link
                              href={m.owner_username ? `/u/${m.owner_username}` : "#"}
                              className="text-[rgba(210,210,210,0.85)] hover:underline"
                            >
                              {m.owner_pen_name || `@${m.owner_username}`}
                            </Link>
                          </span>
                        )}
                        <button
                          onClick={() => { if (confirm("Leave this project? Your slot will remain filled and the author cannot re-add you.")) void leaveProject(m.id); }}
                          className="ml-auto inline-flex items-center rounded-full border border-neutral-600/60 bg-neutral-800/20 px-3 py-1 text-xs text-neutral-400/70 hover:border-neutral-500 hover:text-neutral-300 transition"
                        >
                          Leave project
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })()}

        {/* Conduct status */}
        {!loading && conduct && (
          <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
            <h2 className="text-lg font-semibold">Platform Conduct Record</h2>
            <p className="mt-1 text-xs text-neutral-500">This record tracks violations across manuscript feedback{isYouth ? " and Youth Community participation" : ""}.</p>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-300">
              <li>• No off-platform contact requests in feedback or community posts.</li>
              <li>• No sharing external links, file services, or document platforms.</li>
              <li>• No soliciting paid work or freelance arrangements.</li>
              <li>• No attempts to conceal communication from moderators.</li>
              <li>• Copying manuscript content is a violation of community guidelines.</li>
              {isYouth && <li>• No sharing social media handles or platform links (Instagram, TikTok, Discord, etc.).</li>}
              {isYouth && <li>• No profanity, foul language, or sexual language.</li>}
              <li>• Repeated violations result in suspension or a permanent ban.</li>
            </ul>
            <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm space-y-1">
              <p className="text-neutral-100">Conduct strikes: {conduct.manuscript_conduct_strikes} / 3</p>
              <p className="text-neutral-200">
                Status:{" "}
                {conduct.manuscript_suspended_until && new Date(conduct.manuscript_suspended_until).getTime() > now
                  ? <span className="text-amber-400 font-medium">Suspended until {new Date(conduct.manuscript_suspended_until).toLocaleString()}</span>
                  : conduct.manuscript_blacklisted
                  ? <span className="text-red-400 font-medium">Blacklisted</span>
                  : <span className="text-emerald-400">Active</span>}
              </p>
              <p className="text-neutral-500 text-xs">Total suspensions on record: {conduct.manuscript_lifetime_suspension_count}. Repeated violations may result in a permanent ban.</p>
            </div>

            {/* Appeal - only when suspended or blacklisted */}
            {(conduct.manuscript_blacklisted || (conduct.manuscript_suspended_until && new Date(conduct.manuscript_suspended_until).getTime() > now)) && (
              <div className="mt-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] p-4">
                <p className="text-sm font-semibold text-neutral-100 mb-1">Submit an Appeal</p>
                <p className="text-xs text-neutral-400 mb-3">If you believe your suspension was issued in error, you may submit a written appeal. An admin will review it and respond via your notifications.</p>

                {latestAppeal?.status === "pending" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                    <span>⏳</span>
                    <span>Appeal pending, under admin review since {new Date(latestAppeal.created_at).toLocaleDateString()}.</span>
                  </div>
                ) : latestAppeal?.status === "denied" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                      <span>✕</span>
                      <span>Appeal denied.{latestAppeal.admin_note ? ` Admin note: ${latestAppeal.admin_note}` : ""}</span>
                    </div>
                    <button
                      onClick={() => { setAppealModal(true); setAppealMsg(null); }}
                      className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-3 py-2 text-sm text-neutral-300 hover:text-white hover:border-[rgba(120,120,120,0.7)] transition"
                    >
                      Submit a new appeal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAppealModal(true); setAppealMsg(null); }}
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-3 py-2 text-sm text-neutral-300 hover:text-white hover:border-[rgba(120,120,120,0.7)] transition"
                  >
                    Submit an appeal
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Appeal modal */}
      {appealModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Submit an Appeal</h2>
            <p className="text-sm text-neutral-400 mb-4">Explain why you believe your suspension or blacklist should be lifted. Be honest and specific, vague appeals are less likely to be approved.</p>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              placeholder="Describe the situation, why you believe the action was an error, and how you intend to follow platform rules going forward..."
              rows={6}
              className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)] resize-none"
            />
            {appealMsg && <p className="mt-2 text-sm text-red-400">{appealMsg}</p>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setAppealModal(false); setAppealReason(""); setAppealMsg(null); }}
                className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitAppeal()}
                disabled={appealSubmitting}
                className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-600 disabled:opacity-50"
              >
                {appealSubmitting ? "Submitting..." : "Submit Appeal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
