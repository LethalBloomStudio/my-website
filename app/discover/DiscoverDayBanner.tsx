"use client";

const LABELS: Record<number, string> = {
  1: "New Arrivals",
  2: "The Originals",
  3: "Most Tipped",
  4: "Underdog Day",
  5: "Undiscovered",
  6: "Most Read",
  0: "Shuffled",
};

const COPY: Record<number, string> = {
  1: "Fresh blood. See who just arrived.",
  2: "Still here. Still waiting.",
  3: "The ones readers can't stop coming back to.",
  4: "Find the ones the crowd slept on.",
  5: "Nobody's read these yet. Be the first.",
  6: "Everyone's talking about these. Find out why.",
  0: "Fate shuffled the deck today.",
};

export default function DiscoverDayBanner({ sortDay }: { sortDay: number }) {
  const label = LABELS[sortDay];
  const copy = COPY[sortDay];
  if (!label || !copy) return null;

  return (
    <p className="mt-2 text-sm">
      <span className="text-neutral-300">{label}</span>
      <span className="text-neutral-500 italic"> — {copy}</span>
    </p>
  );
}
