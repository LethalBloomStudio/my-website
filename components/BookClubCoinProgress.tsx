// Member view: a running coin total (checkmark + reply-reward + clean-sweep
// coins earned so far -- released to spendable balance when they rate the
// book at month-end, this is a preview, not a claim it's already spendable).
// Host view lives in BookClubHostChecklist instead -- the member coin
// framing doesn't apply to them (they earn 0 from these mechanics).
export default function BookClubCoinProgress({ coinTotal }: { coinTotal: number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 bookclub-card">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Bloom Coins earned this month</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-medium text-neutral-100">
        <span style={{ color: "#f59e0b" }}>✿</span>
        {coinTotal.toLocaleString()}
      </p>
      <p className="text-[11px] text-neutral-600">Released to your balance when you rate the book at month end.</p>
    </div>
  );
}
