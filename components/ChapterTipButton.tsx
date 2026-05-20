"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";

// Must match the tip_reason enum values exactly (set in DB migration).
const TIP_REASONS = [
  "Beautifully Written",
  "Couldn't Put It Down",
  "Masterful Storytelling",
  "Emotionally Devastating",
  "Left Me Speechless",
  "Obsessed With This Story",
  "Obsessed With FMC",
  "Obsessed With the MMC",
  "This Chapter Broke Me",
  "I Need More Immediately",
] as const;

type TipReason = (typeof TIP_REASONS)[number];

type Props = {
  chapterId: string;
};

export default function ChapterTipButton({ chapterId }: Props) {
  const supabase = supabaseBrowser();

  const [usedReasons, setUsedReasons] = useState<Set<TipReason>>(new Set());
  const [loadingReasons, setLoadingReasons] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<TipReason | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<5 | 10 | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  // Fetch which reasons this reader has already used on this chapter.
  // RLS on chapter_tips filters to auth.uid() automatically.
  useEffect(() => {
    let cancelled = false;
    setLoadingReasons(true);
    supabase
      .from("chapter_tips")
      .select("reason")
      .eq("chapter_id", chapterId)
      .then(({ data }: { data: Array<{ reason: string }> | null }) => {
        if (cancelled) return;
        setUsedReasons(new Set((data ?? []).map((r) => r.reason as TipReason)));
        setLoadingReasons(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allUsed = !loadingReasons && usedReasons.size >= TIP_REASONS.length;

  function openModal() {
    setSelectedReason(null);
    setSelectedAmount(null);
    setFlash(null);
    setOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setSelectedReason(null);
    setSelectedAmount(null);
    setFlash(null);
  }

  async function handleSubmit() {
    if (!selectedReason || !selectedAmount || submitting) return;
    setSubmitting(true);
    setFlash(null);

    try {
      const { data, error } = await supabase.rpc("send_chapter_tip", {
        p_chapter_id: chapterId,
        p_reason: selectedReason,
        p_coin_amount: selectedAmount,
      });

      if (error) {
        setFlash({ ok: false, msg: error.message ?? "Something went wrong. Please try again." });
        return;
      }

      if (!data?.success) {
        if (data?.reason === "insufficient_balance") {
          setFlash({ ok: false, msg: "You don't have enough Bloom Coins for this tip." });
        } else if (data?.reason === "already_used_reason") {
          // Shouldn't reach here normally (pre-flight check in UI), but handle gracefully.
          setUsedReasons((prev) => new Set([...prev, selectedReason as TipReason]));
          setSelectedReason(null);
          setFlash({ ok: false, msg: "You've already used that reason on this chapter." });
        } else {
          setFlash({ ok: false, msg: "Something went wrong. Please try again." });
        }
        return;
      }

      // Success — optimistically mark this reason as used and show confirmation.
      setUsedReasons((prev) => new Set([...prev, selectedReason as TipReason]));
      setFlash({ ok: true, msg: `✿ ${selectedAmount} Bloom Coins sent!` });
      setTimeout(closeModal, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setFlash({ ok: false, msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* ── Tip trigger button ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={allUsed ? undefined : openModal}
        disabled={allUsed || loadingReasons}
        title={
          allUsed
            ? "You've used all tip reasons on this chapter"
            : loadingReasons
            ? "Loading…"
            : "Tip this chapter"
        }
        className={`rounded-lg border px-3 py-1.5 text-sm transition ${
          allUsed || loadingReasons
            ? "cursor-not-allowed border-[rgba(120,120,120,0.18)] bg-transparent text-neutral-600"
            : "border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] text-neutral-200 hover:bg-[rgba(120,120,120,0.22)]"
        }`}
      >
        {allUsed ? (
          "All tips sent"
        ) : (
          <>
            <span style={{ color: "#f59e0b" }}>✿</span>
            {" Tip"}
          </>
        )}
      </button>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl" style={{ color: "#f59e0b" }}>✿</span>
              <h2 className="flex-1 text-base font-semibold text-white">Tip this chapter</h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="shrink-0 text-neutral-500 hover:text-white transition disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            {/* Reason section */}
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Reason</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TIP_REASONS.map((reason) => {
                const used = usedReasons.has(reason);
                const isSelected = selectedReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    disabled={used || submitting}
                    onClick={() => {
                      if (used || submitting) return;
                      setSelectedReason(reason);
                      setFlash(null);
                    }}
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                      used
                        ? "cursor-not-allowed border-[rgba(120,120,120,0.15)] text-neutral-700 opacity-40"
                        : isSelected
                        ? "border-[rgba(245,158,11,0.6)] bg-[rgba(245,158,11,0.1)] text-amber-300"
                        : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"
                    }`}
                  >
                    <span className="block leading-snug">{reason}</span>
                    {used && (
                      <span className="mt-0.5 block text-[9px] text-neutral-700">Already sent</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Amount section */}
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Amount</p>
            <div className="flex gap-2 mb-4">
              {([5, 10] as const).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  disabled={submitting}
                  onClick={() => setSelectedAmount(amount)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition ${
                    selectedAmount === amount
                      ? "btn-success border-green-700 text-white"
                      : "border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"
                  }`}
                >
                  <span style={{ color: "#f59e0b" }}>✿</span> {amount}
                </button>
              ))}
            </div>

            {/* Flash message */}
            {flash && (
              <div
                className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                  flash.ok
                    ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-300"
                    : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.1)] text-neutral-300"
                }`}
              >
                {flash.msg}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!selectedReason || !selectedAmount || submitting}
                className="btn-success h-9 flex-1 rounded-lg border px-3 text-sm font-medium text-white disabled:opacity-40"
              >
                {submitting ? "Sending…" : "Send Tip"}
              </button>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="h-9 flex-1 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-50"
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
