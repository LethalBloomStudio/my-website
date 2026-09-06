"use client";

import { useState } from "react";

export const READER_LEAVE_REASONS = [
  "Schedule/time conflict, couldn't keep up with the pace",
  "Content wasn't the right fit for me (heat level, themes, tone)",
  "Feedback/vision didn't align with the author's direction",
  "Communication or responsiveness issues",
  "Personal reasons unrelated to the project",
  "Other",
];

export const OWNER_REMOVE_REASONS = [
  "Reader was unresponsive or inactive",
  "Feedback wasn't aligned with what I needed for this manuscript",
  "Conduct or communication concerns",
  "No longer needed additional readers on this project",
  "Other",
];

export default function ExitReasonModal({
  title,
  description,
  reasons,
  onSubmit,
  onCancel,
  submitting,
}: {
  title: string;
  description?: string;
  reasons: string[];
  onSubmit: (category: string, detail: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState("");

  const isOther = category === "Other";
  const canSubmit = !!category && (!isOther || detail.trim().length > 0);

  function handleSubmit() {
    if (!canSubmit || !category) return;
    onSubmit(category, isOther ? detail.trim() : "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}

        <div className="mt-4 space-y-2">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setCategory(r)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${category === r ? "border-[rgba(120,120,120,0.9)] bg-[rgba(120,120,120,0.22)] text-white" : "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:border-[rgba(120,120,120,0.5)]"}`}
            >
              {r}
            </button>
          ))}
        </div>

        {isOther && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Say more..."
            rows={3}
            className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          />
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-1 h-10 rounded-lg border px-3 text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: "#dc2626", borderColor: "#b91c1c" }}
          >
            {submitting ? "Submitting…" : "Continue"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-10 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
