"use client";

import { useState } from "react";

const SUGGESTIONS = [
  "Make it easier to find beta readers",
  "Improve the feedback / comment experience",
  "Add more manuscript organisation tools",
  "Better notifications and activity updates",
  "Improve mobile experience",
  "More ways to earn Bloom Coins",
  "Clearer pricing and coin costs",
  "Better profile customisation options",
  "More community features (forums, groups, etc.)",
  "Something else (see my note below)",
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function close() {
    setOpen(false);
    setSelected(new Set());
    setCustomText("");
    setDone(false);
    setError(null);
  }

  async function submit() {
    if (selected.size === 0 && !customText.trim()) {
      setError("Please choose at least one option or write your own feedback.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestions: Array.from(selected), custom_text: customText }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setSubmitting(false);
    if (!res.ok || json.error) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
  }

  return (
    <>
      <div className="mt-4 text-center">
        <p className="text-sm text-neutral-400">
          We&apos;re always looking to improve your experience.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-[rgba(120,120,120,0.8)] hover:bg-[rgba(120,120,120,0.2)]"
        >
          Share your feedback
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
            className="w-full max-w-lg rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
          >
            {done ? (
              <div className="text-center py-4">
                <p className="text-lg font-semibold text-neutral-100">Thank you!</p>
                <p className="mt-2 text-sm text-neutral-400">Your feedback has been received. We appreciate you helping us improve.</p>
                <button
                  onClick={close}
                  className="mt-5 rounded-lg border border-[rgba(120,120,120,0.6)] bg-[rgba(120,120,120,0.18)] px-6 py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.28)] transition"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 id="feedback-modal-title" className="text-lg font-semibold text-neutral-100">Help us improve</h2>
                <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                  What would make Lethal Bloom Studio better for you? Select all that apply.
                </p>

                <ul className="mt-4 space-y-2">
                  {SUGGESTIONS.map((s) => {
                    const active = selected.has(s);
                    return (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => toggle(s)}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition flex items-center gap-3 ${
                            active
                              ? "border-red-700/60 bg-red-950/30 text-neutral-100"
                              : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.5)] hover:bg-[rgba(120,120,120,0.12)]"
                          }`}
                        >
                          <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${active ? "border-red-500 bg-red-500/20 text-red-400" : "border-neutral-600 text-transparent"}`}>✓</span>
                          {s}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4">
                  <label className="block space-y-1">
                    <span className="sr-only">Additional feedback (optional)</span>
                    <textarea
                      rows={3}
                      placeholder="Anything else on your mind? (optional)"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      className="w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[rgba(120,120,120,0.6)] focus:outline-none resize-none"
                    />
                  </label>
                </div>

                {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={close}
                    className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 transition hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void submit()}
                    disabled={submitting}
                    className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white transition hover:border-[rgba(120,120,120,0.9)] disabled:opacity-40"
                  >
                    {submitting ? "Sending…" : "Submit feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
