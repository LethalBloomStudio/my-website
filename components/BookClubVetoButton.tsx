"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESET_REASONS = [
  "Not a good fit for this month's theme or pace",
  "Contains content inappropriate for the group",
  "Too long or too short for a 4-week discussion window",
  "Duplicate or very similar to another submission",
  "We've already read this as a group before",
];

// Host-only: remove someone else's slate submission with a reason. Deletes
// the book_club_book_options row outright (book_club_veto_book RPC), which
// frees both the slot and the submitter's one-book-per-person check, so
// they can submit a different book right away -- and notifies them why.
// Reason UI mirrors ReportModal.tsx's established preset-checkboxes +
// "Other" free-text pattern rather than inventing a new one.
export default function BookClubVetoButton({ optionId, bookTitle }: { optionId: string; bookTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePreset(reason: string) {
    setSelected((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));
  }

  const canSubmit = selected.length > 0 || (showOther && other.trim().length > 0);

  async function handleSubmit() {
    const parts = [...selected];
    if (showOther && other.trim()) parts.push(other.trim());
    if (parts.length === 0) return;
    const reason = parts.join(" | ");

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/veto-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId, reason }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-700/50 bg-red-950/20 px-2 py-1 text-[11px] font-medium text-red-300 transition hover:opacity-80"
      >
        Veto
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Veto &ldquo;{bookTitle}&rdquo;?</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Select at least one reason. Whoever submitted this book will be notified and can submit a different one instead.
            </p>

            <div className="mt-4 space-y-2">
              {PRESET_REASONS.map((reason) => (
                <label
                  key={reason}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm transition hover:border-[rgba(120,120,120,0.5)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(reason)}
                    onChange={() => togglePreset(reason)}
                    className="mt-0.5 shrink-0 accent-[#787878]"
                  />
                  <span className="text-neutral-200">{reason}</span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-sm transition hover:border-[rgba(120,120,120,0.5)]">
                <input
                  type="checkbox"
                  checked={showOther}
                  onChange={() => setShowOther((v) => !v)}
                  className="mt-0.5 shrink-0 accent-[#787878]"
                />
                <span className="text-neutral-200">Other</span>
              </label>
              {showOther && (
                <textarea
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  placeholder="Describe the reason..."
                  rows={3}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
                />
              )}
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={loading || !canSubmit}
                className="rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-1.5 text-sm text-red-300 transition hover:opacity-80 disabled:opacity-40"
              >
                {loading ? "Vetoing..." : "Veto Book"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
