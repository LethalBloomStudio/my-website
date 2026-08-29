const CYCLE_LENGTH_WEEKS = 4;

export default function BookClubWeeklyProgress({ earnedWeeks }: { earnedWeeks: number[] }) {
  const earned = new Set(earnedWeeks);
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: CYCLE_LENGTH_WEEKS }, (_, i) => i + 1).map((week) => (
        <div
          key={week}
          className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-medium ${
            earned.has(week)
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
              : "border-neutral-700 bg-neutral-900 text-neutral-500"
          }`}
          title={`Week ${week}${earned.has(week) ? " — checkmark earned" : ""}`}
        >
          {week}
        </div>
      ))}
    </div>
  );
}
