"use client";

import { useMemo, useState } from "react";
import { WRITER_LEVELS } from "@/lib/profileOptions";

const WRITER_DESCRIPTIONS: Record<string, { title: string; text: string }> = {
  bloom: {
    title: "Bloom Writer",
    text:
      "You’re at the beginning of something powerful. You’re learning the craft, finding your voice, and open to guidance. You value encouragement with direction and feedback that helps you grow without crushing your spark.",
  },
  forge: {
    title: "Forge Writer",
    text:
      "You know your tools. You’ve written, revised, scrapped, and started again. You’re sharpening your style and pushing your limits. You want honest critique that challenges you and helps refine your edge.",
  },
  lethal: {
    title: "Lethal Writer",
    text:
      "You write with precision and intent. You understand structure, pacing, and emotional impact. You welcome direct, surgical feedback and aren’t afraid to dismantle your work to make it stronger. You aim to hit hard and leave a mark.",
  },
};

const READER_DESCRIPTIONS: Record<string, { title: string; text: string }> = {
  bloom: {
    title: "Bloom Reader",
    text:
      "New to beta reading but thoughtful and engaged. Focuses on overall impressions, emotional reactions, clarity, and encouragement. Great for early drafts and writers who want a supportive first pass.",
  },
  forge: {
    title: "Forge Reader",
    text:
      "Experienced in craft and structure. Provides balanced feedback on pacing, character arcs, plot logic, and consistency. Honest, constructive, and specific. Ideal for writers refining their work.",
  },
  lethal: {
    title: "Lethal Reader",
    text:
      "Highly analytical and fearless. Offers deep structural critique, identifies narrative weaknesses, and challenges every assumption. Direct, precise, and uncompromising. Best for writers ready for rigorous, high-impact feedback.",
  },
};

export default function LevelSelectWithDescription({
  name,
  label,
  defaultValue,
  mode,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  mode: "writer" | "reader";
}) {
  const [selected, setSelected] = useState((defaultValue || "bloom").toLowerCase());
  const content = useMemo(() => {
    const map = mode === "writer" ? WRITER_DESCRIPTIONS : READER_DESCRIPTIONS;
    return map[selected] ?? map.bloom;
  }, [mode, selected]);

  return (
    <label className="block">
      <div className="text-sm text-neutral-300">{label}</div>
      <select
        name={name}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-neutral-100"
      >
        {WRITER_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <div className="mt-3 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] p-3">
        <div className="text-sm font-semibold text-white">{content.title}</div>
        <p className="mt-1 text-sm text-neutral-200">{content.text}</p>
      </div>
    </label>
  );
}
