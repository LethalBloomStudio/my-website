// Shared row used by BookClubHostChecklist and the member-facing "Rate
// book on X" line -- kept as one component so both stay visually
// identical rather than two hand-copied checkbox rows drifting apart.
export default function BookClubChecklistItem({ done, label, sub }: { done: boolean; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold bookclub-chip ${done ? "bookclub-chip-active" : ""}`}>
        {done && <span className="text-emerald-400">✓</span>}
      </span>
      <span className={done ? "text-neutral-300" : "text-neutral-500"}>{label}</span>
      {sub && <span className="ml-auto text-[10px] text-neutral-600">{sub}</span>}
    </div>
  );
}
