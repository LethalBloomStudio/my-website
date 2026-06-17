"use client";

const COPY: Record<number, string> = {
  1: "Fresh blood. See who just arrived.",
  2: "The originals. Still here. Still waiting.",
  3: "The ones readers can't stop coming back to.",
  4: "Underdog day. Find the ones the crowd slept on.",
  5: "Nobody's read these yet. Be the first.",
  6: "Everyone's talking about these. Find out why.",
  0: "Fate shuffled the deck today.",
};

export default function DiscoverDayBanner({ sortDay }: { sortDay: number }) {
  const copy = COPY[sortDay];
  if (!copy) return null;

  return (
    <p className="mt-6 text-sm italic text-neutral-400 border-l-2 border-neutral-700 pl-3">
      {copy}
    </p>
  );
}
