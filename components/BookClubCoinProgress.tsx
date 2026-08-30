type HostProgress = {
  replyCount: number;
  likeCount: number;
  groupPostCount: number;
  repliesNeeded: number;
  likesNeeded: number;
  groupPostsNeeded: number;
  alreadyReleased: boolean;
};

function ThresholdRow({ label, have, need }: { label: string; have: number; need: number }) {
  const met = have >= need;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={met ? "text-neutral-300" : "text-neutral-500"}>{label}</span>
      <span className={met ? "text-emerald-400" : "text-neutral-500"}>{Math.min(have, need)}/{need}</span>
    </div>
  );
}

// Member view: a running coin total (checkmark + reply-reward + clean-sweep
// coins earned so far -- released to spendable balance when they rate the
// book at month-end, this is a preview, not a claim it's already spendable).
// Host view: the member coin framing doesn't apply to them (they earn 0
// from those mechanics), so this shows progress toward their own flat
// 250-coin gate instead.
export default function BookClubCoinProgress({
  isHost,
  coinTotal,
  hostProgress,
}: {
  isHost: boolean;
  coinTotal: number;
  hostProgress: HostProgress | null;
}) {
  if (isHost) {
    if (!hostProgress) return null;
    if (hostProgress.alreadyReleased) {
      return (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Host reward</p>
          <p className="mt-1 text-sm text-emerald-400">Released.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Host reward -- 250 Bloom Coins at month end</p>
        <p className="text-[11px] text-neutral-600">Hit all three by the time the month closes, released when you rate the book.</p>
        <div className="space-y-1 pt-1">
          <ThresholdRow label="Replies to members' answers" have={hostProgress.replyCount} need={hostProgress.repliesNeeded} />
          <ThresholdRow label="Likes given" have={hostProgress.likeCount} need={hostProgress.likesNeeded} />
          <ThresholdRow label="Group Thoughts posts" have={hostProgress.groupPostCount} need={hostProgress.groupPostsNeeded} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Bloom Coins earned this month</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-medium text-neutral-100">
        <span style={{ color: "#f59e0b" }}>✿</span>
        {coinTotal.toLocaleString()}
      </p>
      <p className="text-[11px] text-neutral-600">Released to your balance when you rate the book at month end.</p>
    </div>
  );
}
