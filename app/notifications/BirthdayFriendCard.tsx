"use client";

import { useState } from "react";

const COIN_OPTIONS = [5, 10, 25, 50] as const;
type CoinOption = typeof COIN_OPTIONS[number];

type Props = {
  notifId: string | number;
  title: string;
  createdAt: string;
  birthdayUserId: string;
  birthdayUserName: string;
  birthdayUserUsername: string;
  isRead: boolean;
  onMarkRead: () => void;
};

export default function BirthdayFriendCard({
  title,
  createdAt,
  birthdayUserId,
  birthdayUserName,
  birthdayUserUsername,
  isRead,
  onMarkRead,
}: Props) {
  const [message, setMessage] = useState("");
  const [coinAmount, setCoinAmount] = useState<CoinOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = !!message.trim() || coinAmount !== null;

  async function handleSend() {
    if (!canSend || loading) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/birthday/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthday_user_id: birthdayUserId,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(coinAmount !== null ? { coin_amount: coinAmount } : {}),
      }),
    });

    const data = await res.json() as { ok?: boolean; error?: string; new_balance?: number };

    if (res.ok) {
      setSent(true);
      if (data.new_balance !== undefined && data.new_balance !== null) {
        window.dispatchEvent(new CustomEvent("bloom-coins-updated", { detail: { balance: data.new_balance } }));
      }
      if (!isRead) onMarkRead();
    } else {
      setError(
        data.error === "Insufficient Bloom Coins"
          ? "You don't have enough Bloom Coins for that gift."
          : (data.error ?? "Something went wrong. Please try again.")
      );
    }

    setLoading(false);
  }

  return (
    <li className="notification-item rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="text-sm font-medium text-neutral-100">{title}</p>
      <p className="mt-2 text-xs text-neutral-500">{new Date(createdAt).toLocaleString()}</p>

      {sent ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-400">
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="6" cy="6" r="5" /><path d="M3.5 6l2 2 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Sent to {birthdayUserName}!
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Coin gift options */}
          <div>
            <p className="mb-1.5 text-[11px] text-neutral-500">Gift Bloom Coins <span className="text-neutral-600">(optional)</span></p>
            <div className="flex gap-2 flex-wrap">
              {COIN_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCoinAmount(coinAmount === amt ? null : amt)}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-medium transition ${
                    coinAmount === amt
                      ? "border-amber-600 bg-amber-950/50 text-amber-300"
                      : "border-[rgba(120,120,120,0.35)] text-neutral-400 hover:border-amber-700/50 hover:text-amber-400"
                  }`}
                >
                  <span style={{ color: coinAmount === amt ? "#f59e0b" : undefined }}>✿</span>
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Birthday message */}
          <div>
            <p className="mb-1.5 text-[11px] text-neutral-500">Birthday message <span className="text-neutral-600">(optional)</span></p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Write a birthday message for ${birthdayUserName}…`}
              rows={2}
              maxLength={300}
              className="w-full resize-none rounded-lg border border-[rgba(120,120,120,0.35)] bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-[rgba(120,120,120,0.65)] focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void handleSend()}
              disabled={!canSend || loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-4 text-sm font-medium text-amber-400 hover:bg-amber-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Sending…" : `Send to ${birthdayUserName}`}
            </button>
            {!isRead && (
              <button
                onClick={onMarkRead}
                className="inline-flex h-8 items-center rounded-lg border border-neutral-800/60 px-3 text-xs text-neutral-500 hover:text-neutral-300 transition"
              >
                Mark as read
              </button>
            )}
            {birthdayUserUsername && (
              <a
                href={`/u/${birthdayUserUsername}`}
                className="inline-flex h-8 items-center rounded-lg border border-[rgba(120,120,120,0.3)] px-3 text-xs text-neutral-400 hover:text-white transition"
              >
                View Profile →
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
