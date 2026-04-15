"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const DELETE_REASONS = [
  "I'm not using the platform anymore",
  "I found another platform that fits my needs better",
  "I have concerns about privacy or data use",
  "I had a negative experience with the community",
  "I created this account by mistake",
  "I'm taking an extended break from writing",
  "The features don't match what I was looking for",
  "I have a duplicate account I no longer need",
  "Other",
] as const;

type Props = {
  isDeactivated: boolean;
  isYouth: boolean;
  linkedYouthCount: number;
};

export default function AccountDangerZone({ isDeactivated, isYouth: _isYouth, linkedYouthCount }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Deactivate modal
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Delete modal - two steps
  const [deleteStep, setDeleteStep] = useState<"closed" | "reason" | "confirm">("closed");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteOtherText, setDeleteOtherText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeactivate(action: "deactivate" | "reactivate") {
    setDeactivateLoading(true);
    setDeactivateError(null);
    try {
      const res = await fetch("/api/account/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json();
        setDeactivateError(d.error ?? "Something went wrong.");
        setDeactivateLoading(false);
        return;
      }
      setDeactivateOpen(false);
      router.refresh();
    } catch {
      setDeactivateError("Something went wrong.");
      setDeactivateLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteReason) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const reason = deleteReason === "Other" && deleteOtherText.trim()
        ? `Other: ${deleteOtherText.trim()}`
        : deleteReason;
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error ?? "Something went wrong.");
        setDeleteLoading(false);
        return;
      }
      await supabase.auth.signOut();
      window.location.replace("/sign-in?deleted=1");
    } catch {
      setDeleteError("Something went wrong.");
      setDeleteLoading(false);
    }
  }

  const overlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4";
  const modal = "relative w-full max-w-lg rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-900 p-6 shadow-2xl";

  return (
    <>
      <div className="danger-zone-card mt-10 rounded-xl border border-red-900/40 bg-red-950/10 p-6">
        <h2 className="text-base font-semibold text-neutral-100">Account Actions</h2>
        <p className="mt-1 text-sm text-neutral-100">These actions affect your account and everything connected to it.</p>

        <div className="mt-5 flex flex-wrap gap-3">
          {/* Deactivate / Reactivate */}
          <button
            onClick={() => setDeactivateOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-amber-700/50 bg-amber-900/15 px-4 text-sm font-medium text-amber-300 hover:bg-amber-900/25 transition"
          >
            {isDeactivated ? "Reactivate Account" : "Deactivate Account"}
          </button>

          <button
            onClick={() => setDeleteStep("reason")}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-red-700/50 bg-red-900/15 px-4 text-sm font-medium text-red-400 hover:bg-red-900/25 transition"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* ── Deactivate modal ── */}
      {deactivateOpen && (
        <div className={overlay}>
          <div className={modal}>
            <h3 className="text-lg font-semibold text-neutral-100">
              {isDeactivated ? "Reactivate your account?" : "Deactivate your account?"}
            </h3>

            {isDeactivated ? (
              <div className="mt-4 space-y-2 text-sm text-neutral-300">
                <p>Reactivating will restore your account to its normal state:</p>
                <ul className="mt-2 space-y-1.5 pl-4">
                  <li className="list-disc">Your manuscripts will become visible again</li>
                  <li className="list-disc">You will appear in Discover and beta reader searches</li>
                  <li className="list-disc">Friends can message you again</li>
                  {linkedYouthCount > 0 && (
                    <li className="list-disc">
                      {linkedYouthCount} linked youth account{linkedYouthCount > 1 ? "s" : ""} will also be reactivated
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="mt-4 space-y-2 text-sm text-neutral-300">
                <p>While deactivated, the following will apply:</p>
                <ul className="mt-2 space-y-1.5 pl-4">
                  <li className="list-disc">All your manuscripts will be hidden from Discover and readers</li>
                  <li className="list-disc">Your profile will not appear in beta reader searches</li>
                  <li className="list-disc">Friends will not be able to message you</li>
                  <li className="list-disc">Your Bloom Coins balance is preserved</li>
                  <li className="list-disc">Your account data is fully retained and reversible</li>
                  {linkedYouthCount > 0 && (
                    <li className="list-disc text-amber-300">
                      {linkedYouthCount} linked youth account{linkedYouthCount > 1 ? "s" : ""} will also be deactivated
                    </li>
                  )}
                </ul>
                <p className="mt-3 text-neutral-400">You can reactivate at any time from this page.</p>
              </div>
            )}

            {deactivateError && (
              <p className="mt-3 text-sm text-red-400">{deactivateError}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => handleDeactivate(isDeactivated ? "reactivate" : "deactivate")}
                disabled={deactivateLoading}
                className={`flex-1 h-10 rounded-lg text-sm font-medium transition ${
                  isDeactivated
                    ? "bg-emerald-700 text-white hover:bg-emerald-600"
                    : "bg-amber-700 text-white hover:bg-amber-600"
                } disabled:opacity-50`}
              >
                {deactivateLoading ? "Saving…" : isDeactivated ? "Yes, Reactivate" : "Yes, Deactivate"}
              </button>
              <button
                onClick={() => { setDeactivateOpen(false); setDeactivateError(null); }}
                disabled={deactivateLoading}
                className="flex-1 h-10 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal step 1: select reason ── */}
      {deleteStep === "reason" && (
        <div className={overlay}>
          <div className={modal}>
            <h3 className="text-lg font-semibold text-neutral-100">Why are you leaving?</h3>
            <p className="mt-1 text-sm text-neutral-400">Select the reason that best describes why you want to delete your account.</p>

            <div className="mt-4 space-y-2">
              {DELETE_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5 hover:bg-[rgba(120,120,120,0.12)] transition">
                  <input
                    type="radio"
                    name="delete_reason"
                    value={r}
                    checked={deleteReason === r}
                    onChange={() => setDeleteReason(r)}
                    className="mt-0.5 accent-red-500"
                  />
                  <span className="text-sm text-neutral-200">{r}</span>
                </label>
              ))}
              {deleteReason === "Other" && (
                <textarea
                  value={deleteOtherText}
                  onChange={(e) => setDeleteOtherText(e.target.value)}
                  placeholder="Please tell us more (optional)…"
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none resize-none"
                />
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { if (deleteReason) setDeleteStep("confirm"); }}
                disabled={!deleteReason}
                className="flex-1 h-10 rounded-lg bg-red-700 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 transition"
              >
                Continue
              </button>
              <button
                onClick={() => { setDeleteStep("closed"); setDeleteReason(""); setDeleteOtherText(""); setDeleteError(null); }}
                className="flex-1 h-10 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal step 2: final confirm ── */}
      {deleteStep === "confirm" && (
        <div className={overlay}>
          <div className={modal}>
            <h3 className="text-lg font-semibold text-red-400">This cannot be undone.</h3>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">
              Permanently deleting your account will remove everything associated with it:
            </p>
            <ul className="mt-3 space-y-1.5 pl-4 text-sm text-neutral-400">
              <li className="list-disc">All manuscripts, chapters, and uploaded content</li>
              <li className="list-disc">All feedback you have given and received</li>
              <li className="list-disc">Your Bloom Coins balance (non-refundable)</li>
              <li className="list-disc">Your public profile, followers, and friends</li>
              <li className="list-disc">All messages and notifications</li>
              {linkedYouthCount > 0 && (
                <li className="list-disc text-red-400">
                  {linkedYouthCount} linked youth account{linkedYouthCount > 1 ? "s" : ""} will be deactivated and unlinked
                </li>
              )}
            </ul>
            <p className="mt-4 text-sm font-medium text-red-400">
              Your account cannot be reinstated after deletion.
            </p>

            {deleteError && (
              <p className="mt-3 text-sm text-red-400">{deleteError}</p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 h-10 rounded-lg bg-red-700 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition"
              >
                {deleteLoading ? "Deleting…" : "Delete My Account"}
              </button>
              <button
                onClick={() => { setDeleteStep("closed"); setDeleteReason(""); setDeleteOtherText(""); setDeleteError(null); }}
                disabled={deleteLoading}
                className="flex-1 h-10 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
