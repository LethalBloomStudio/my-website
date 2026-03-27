"use client";

import { useState } from "react";

const PRESET_REASONS = [
  "Inappropriate or offensive content",
  "Poaching / soliciting members from other communities",
  "Requesting personal information",
  "Requesting contact outside the platform (social media, email, etc.)",
  "Using AI-generated messages",
];

export default function ReportModal({
  targetName,
  onSubmit,
  onCancel,
}: {
  targetName: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [showOther, setShowOther] = useState(false);

  function togglePreset(reason: string) {
    setSelected((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  }

  function handleSubmit() {
    const parts = [...selected];
    if (showOther && other.trim()) parts.push(other.trim());
    if (parts.length === 0) return;
    onSubmit(parts.join(" | "));
  }

  const canSubmit = selected.length > 0 || (showOther && other.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Report User</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Reporting <span className="text-neutral-200">{targetName}</span>. Select all that apply.
        </p>
        <div className="mt-3 rounded-lg border border-[rgba(120,120,120,0.6)] bg-[rgba(120,120,120,0.15)] px-3 py-2.5 text-xs text-red-500 leading-relaxed">
          <strong className="font-semibold">Please read before continuing:</strong> Submitting a report is permanent and cannot be undone. All communication between you and this user will be permanently disabled, and neither party will have access to each other&apos;s manuscripts or projects.
        </div>

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
              placeholder="Describe the issue..."
              rows={3}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
            />
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] disabled:opacity-40 transition"
          >
            Submit Report
          </button>
        </div>
      </div>
    </div>
  );
}
