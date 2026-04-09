"use client";

import { useRouter } from "next/navigation";

type Props = {
  onClose: () => void;
};

export default function OutOfCoinsModal({ onClose }: Props) {
  const router = useRouter();

  function go(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl leading-none" style={{ color: "#f59e0b" }}>✿</span>
          <h2 className="text-base font-semibold text-white">You&apos;re out of Bloom Coins</h2>
        </div>
        <p className="mt-2 text-sm text-neutral-300 leading-relaxed">
          You don&apos;t have enough Bloom Coins to complete this action. Find new projects to beta read and earn coins, or purchase a pack to top up your balance.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => go("/discover")}
            className="h-10 w-full rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.28)] transition"
          >
            Find projects to beta read
          </button>
          <button
            type="button"
            onClick={() => go("/wallet")}
            className="h-10 w-full rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.28)] transition"
          >
            Purchase a Bloom Coin pack
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full rounded-lg border border-[rgba(120,120,120,0.3)] bg-transparent px-4 text-sm text-neutral-400 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
