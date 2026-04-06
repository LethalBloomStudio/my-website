"use client";

import { FORMATS, FORMAT_ORDER, type FormatId } from "@/lib/format/manuscriptFormats";

export default function FormatPicker({
  value,
  onChange,
}: {
  value: FormatId;
  onChange: (id: FormatId) => void;
}) {
  const current = FORMATS[value];

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-neutral-400">Format:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FormatId)}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
      >
        {FORMAT_ORDER.map((id) => (
          <option key={id} value={id}>
            {FORMATS[id].label}
          </option>
        ))}
      </select>
      <span className="hidden text-xs text-neutral-500 sm:block">{current.description}</span>
    </div>
  );
}
