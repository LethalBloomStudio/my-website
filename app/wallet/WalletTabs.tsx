"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WalletLedgerRow = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

type LinkedChild = { userId: string; name: string; balance: number; subscriptionTier: "free" | "unlimited" | "lethal_standalone" };

type WalletTabsProps = {
  displayName: string;
  balance: number;
  subscription: string;
  ledger: WalletLedgerRow[];
  isYouth?: boolean;
  parentUserId?: string | null;
  linkedChildren?: LinkedChild[];
  defaultChildId?: string | null;
};

type WalletTab = "purchases" | "history" | "tracking";

const REASON_LABELS: Record<string, string> = {
  feedback_reward: "Feedback reward",
  announcement_reward: "Admin announcement reward",
  admin_adjustment: "Admin coin adjustment",
  reader_reward: "Reader reward (sent)",
  coin_purchase_mock: "Bloom Coin purchase",
  extra_chapter_upload: "Extra chapter upload",
  extra_reader_slot: "Extra reader slot",
  parent_gift: "Bloom Coins from parent",
  manuscript_upload_unlock: "Manuscript upload unlock",
};

const PACKAGES = [
  { id: "starter_100" as const, label: "Bloom Pack", coins: 100, price: "$1" },
  { id: "writer_350" as const, label: "Forge Pack", coins: 350, price: "$3" },
  { id: "studio_600" as const, label: "Lethal Pack", coins: 600, price: "$5" },
];

export default function WalletTabs({
  displayName,
  balance,
  subscription,
  ledger,
  isYouth = false,
  parentUserId,
  linkedChildren = [],
  defaultChildId,
}: WalletTabsProps) {
  const _router = useRouter();
  const [tab, setTab] = useState<WalletTab>("purchases");

  // Purchase (self) state
  const [purchaseMsg, setPurchaseMsg] = useState<string | null>(null);
  const [buyingPackageId, setBuyingPackageId] = useState<string | null>(null);

  // Youth request state
  const [requestAmount, setRequestAmount] = useState<number>(100);
  const [requestMessage, setRequestMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  const [requestOk, setRequestOk] = useState(false);

  // Parent gift state
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    defaultChildId ?? linkedChildren[0]?.userId ?? null
  );
  const [giftingPackageId, setGiftingPackageId] = useState<string | null>(null);
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  const [giftOk, setGiftOk] = useState(false);

  const selectedChild = linkedChildren.find((c) => c.userId === selectedChildId) ?? linkedChildren[0] ?? null;

  const selectedTabStyle = {
    border: "2px solid #ffffff",
    background: "#787878",
    color: "#ffffff",
    fontWeight: 600,
  } as const;

  const unselectedTabStyle = {
    border: "1px solid rgba(120,120,120,0.9)",
    background: "#787878",
    color: "#ffffff",
    fontWeight: 400,
  } as const;

  const totals = useMemo(() => {
    const earned = ledger.filter((l) => l.delta > 0).reduce((sum, l) => sum + l.delta, 0);
    const spent = Math.abs(ledger.filter((l) => l.delta < 0).reduce((sum, l) => sum + l.delta, 0));
    return { earned, spent, net: earned - spent };
  }, [ledger]);

  const lethalChildCount = linkedChildren.filter((c) => c.subscriptionTier === "unlimited").length;

  async function purchase(packageId: "starter_100" | "writer_350" | "studio_600") {
    setPurchaseMsg(null);
    setBuyingPackageId(packageId);
    try {
      const res = await fetch("/api/wallet/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: packageId }),
      });
      const json = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !json.url) {
        setPurchaseMsg(json.error ?? "Purchase failed.");
        setBuyingPackageId(null);
      } else {
        window.location.href = json.url;
      }
    } catch {
      setPurchaseMsg("Purchase failed.");
      setBuyingPackageId(null);
    }
  }

  async function sendCoinRequest() {
    setRequestMsg(null);
    setRequestOk(false);
    if (!parentUserId) return setRequestMsg("No parent account linked.");
    setRequesting(true);
    try {
      const res = await fetch("/api/wallet/request-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: requestAmount, message: requestMessage.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setRequestOk(false);
        setRequestMsg(json.error ?? "Failed to send request.");
      } else {
        setRequestOk(true);
        setRequestMsg("Request sent! Your parent will be notified.");
        setRequestMessage("");
      }
    } catch {
      setRequestMsg("Failed to send request.");
    } finally {
      setRequesting(false);
    }
  }

  async function giftCoins(packageId: "starter_100" | "writer_350" | "studio_600") {
    if (!selectedChild) return;
    setGiftMsg(null);
    setGiftOk(false);
    setGiftingPackageId(packageId);
    try {
      const res = await fetch("/api/wallet/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: packageId, gift_to: selectedChild.userId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; url?: string };
      if (!res.ok || !json.url) {
        setGiftOk(false);
        setGiftMsg(json.error ?? "Gift failed.");
        setGiftingPackageId(null);
      } else {
        window.location.href = json.url;
      }
    } catch {
      setGiftMsg("Gift failed.");
      setGiftingPackageId(null);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-6">
        <div className="text-sm text-neutral-300">Account</div>
        <div className="mt-1 text-lg font-medium text-white">{displayName}</div>

        <div className="mt-5 text-sm text-neutral-300">Bloom Coin Balance</div>
        <div className="mt-1 text-4xl font-semibold text-white">{balance.toLocaleString()}</div>

        {!isYouth && (
          <>
            <div className="mt-5 text-sm text-neutral-300">Subscription</div>
            <div className="mt-1 capitalize text-neutral-100">{subscription}</div>

            {linkedChildren.length > 0 && (
              <div className="mt-5">
                <div className="text-sm text-neutral-300 mb-2">Linked youth accounts</div>
                <div className="rounded-xl border border-[rgba(120,120,120,0.3)] overflow-hidden">
                  {linkedChildren.map((c, i) => (
                    <div
                      key={c.userId}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                        i < linkedChildren.length - 1 ? "border-b border-[rgba(120,120,120,0.15)]" : ""
                      }`}
                    >
                      <div>
                        <p className="text-sm text-neutral-100">{c.name}</p>
                        <p className="text-xs text-neutral-500">
                          {c.subscriptionTier === "lethal_standalone"
                            ? "Youth Lethal · $10/mo"
                            : c.subscriptionTier === "unlimited"
                            ? "Lethal Member · +$5/mo"
                            : "Bloom Member · Free"}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          c.subscriptionTier === "unlimited"
                            ? "border-violet-700/60 bg-violet-950/30 text-violet-400"
                            : "border-neutral-700 bg-neutral-950/30 text-neutral-400"
                        }`}
                      >
                        {c.subscriptionTier === "unlimited" ? "Lethal" : "Bloom"}
                      </span>
                    </div>
                  ))}
                  {lethalChildCount > 0 && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[rgba(120,120,120,0.05)]">
                      <p className="text-xs text-neutral-400">Youth add-on total</p>
                      <p className="text-sm font-semibold text-neutral-200">+${lethalChildCount * 5}/mo</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Parent: gift-to-linked-youth section - always visible when children are linked */}
      {!isYouth && linkedChildren.length > 0 && selectedChild && (
        <section className="mt-6 rounded-xl border border-violet-700/70 bg-violet-950/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-violet-300">
                Send Bloom Coins to a linked youth account
              </p>
              <p className="mt-0.5 text-xs text-neutral-400">
                {selectedChild.name} · Current balance: {selectedChild.balance.toLocaleString()} coins
              </p>
            </div>
          </div>

          {linkedChildren.length > 1 && (
            <div className="mt-3">
              <label className="block text-xs text-neutral-400 mb-1">Select account</label>
              <select
                value={selectedChildId ?? ""}
                onChange={(e) => { setSelectedChildId(e.target.value); setGiftMsg(null); setGiftOk(false); }}
                className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none"
              >
                {linkedChildren.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name} · {c.subscriptionTier === "unlimited" ? "Lethal Member" : "Bloom Member"} · {c.balance.toLocaleString()} coins
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PACKAGES.map((p) => (
              <div
                key={p.label}
                className="rounded-lg border border-violet-800/60 bg-violet-950/40 p-4"
              >
                <p className="text-sm font-medium text-violet-200">{p.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {p.coins.toLocaleString()} Coins
                </p>
                <p className="mt-1 text-sm text-neutral-400">{p.price}</p>
                <button
                  className="mt-4 h-9 w-full rounded-lg border border-violet-600/60 bg-violet-900/30 text-sm text-violet-200 disabled:opacity-50 hover:bg-violet-900/50 transition"
                  onClick={() => void giftCoins(p.id)}
                  disabled={giftingPackageId !== null}
                >
                  {giftingPackageId === p.id ? "Sending…" : `Gift to ${selectedChild.name}`}
                </button>
              </div>
            ))}
          </div>

          {giftMsg && (
            <p className={`mt-3 text-sm ${giftOk ? "text-emerald-300" : "text-red-300"}`}>
              {giftMsg}
            </p>
          )}
        </section>
      )}

      <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab("purchases")}
            style={tab === "purchases" ? selectedTabStyle : unselectedTabStyle}
            className="h-9 rounded-lg px-3 text-sm"
          >
            {isYouth ? "Request Coins" : "Bloom Coin Purchases"}
          </button>
          <button
            onClick={() => setTab("history")}
            style={tab === "history" ? selectedTabStyle : unselectedTabStyle}
            className="h-9 rounded-lg px-3 text-sm"
          >
            Transaction History
          </button>
          <button
            onClick={() => setTab("tracking")}
            style={tab === "tracking" ? selectedTabStyle : unselectedTabStyle}
            className="h-9 rounded-lg px-3 text-sm"
          >
            Payout & Spend Tracking
          </button>
        </div>

        {tab === "purchases" ? (
          <div className="mt-5">
            {isYouth ? (
              /* Youth: request coins from parent */
              <div className="space-y-4">
                {requestOk ? (
                  /* Success confirmation - replaces the whole form */
                  <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-5">
                    <p className="text-base font-semibold text-emerald-300">Request sent!</p>
                    <p className="mt-2 text-sm text-emerald-200/80">
                      Your parent has been notified and will receive a prompt to send you{" "}
                      <span className="font-semibold">{requestAmount.toLocaleString()} Bloom Coins</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setRequestOk(false); setRequestMsg(null); }}
                      className="mt-4 h-9 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 text-sm text-emerald-300 hover:bg-emerald-900/30 transition"
                    >
                      Send another request
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-neutral-400">
                      Bloom Coin purchases are managed by your parent or guardian. You can send them a
                      request and they will be notified to purchase coins on your behalf.
                    </p>

                    {!parentUserId && (
                      <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2">
                        <p className="text-sm text-amber-300">No linked parent account found. Ask your parent to link your account from their Manage Youth page.</p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-neutral-400 mb-2">Select an amount to request</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {PACKAGES.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setRequestAmount(p.coins)}
                            className={`rounded-lg border p-4 text-left transition ${
                              requestAmount === p.coins
                                ? "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.22)]"
                                : "border-neutral-800 bg-neutral-900/40 hover:border-[rgba(120,120,120,0.5)]"
                            }`}
                          >
                            <p className="text-sm font-medium text-white">{p.label}</p>
                            <p className="mt-1 text-2xl font-semibold text-white">
                              {p.coins.toLocaleString()}
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">Bloom Coins</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Message to parent{" "}
                        <span className="text-neutral-600">(optional)</span>
                      </label>
                      <input
                        value={requestMessage}
                        onChange={(e) => setRequestMessage(e.target.value)}
                        placeholder="e.g. I need coins to upload my next chapter"
                        maxLength={200}
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.7)]"
                      />
                    </div>

                    {requestMsg && (
                      <div className="rounded-lg border border-red-700/50 bg-red-950/20 px-3 py-2">
                        <p className="text-sm text-red-300">{requestMsg}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void sendCoinRequest()}
                      disabled={requesting || !parentUserId}
                      className="h-10 rounded-lg border border-black bg-transparent px-6 text-sm font-medium text-black disabled:opacity-50 hover:bg-black/5 transition dark:border-[rgba(120,120,120,0.6)] dark:bg-[rgba(120,120,120,0.18)] dark:text-neutral-100 dark:hover:bg-[rgba(120,120,120,0.28)]"
                    >
                      {requesting ? "Sending request…" : `Request ${requestAmount.toLocaleString()} Coins`}
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Adult: normal purchase */
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PACKAGES.map((p) => (
                    <div
                      key={p.label}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
                    >
                      <p className="text-sm font-medium text-white">{p.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {p.coins.toLocaleString()} Bloom Coins
                      </p>
                      <p className="mt-1 text-sm text-neutral-300">{p.price}</p>
                      <button
                        className="mt-4 h-9 w-full rounded-lg border border-neutral-700 text-sm text-neutral-200 disabled:opacity-50"
                        onClick={() => void purchase(p.id)}
                        disabled={buyingPackageId !== null}
                      >
                        {buyingPackageId === p.id ? "Processing..." : "Buy"}
                      </button>
                    </div>
                  ))}
                </div>
                {purchaseMsg ? (
                  <p className="mt-3 text-sm text-neutral-200">{purchaseMsg}</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="mt-5">
            {ledger.length === 0 ? (
              <p className="text-sm text-neutral-300">No transactions yet.</p>
            ) : (
              <ul className="space-y-2">
                {ledger.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-neutral-100">
                          {REASON_LABELS[row.reason] ?? row.reason.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          {new Date(row.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          row.delta >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {row.delta >= 0 ? "+" : ""}
                        {row.delta}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "tracking" ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <p className="text-xs text-neutral-400">Total Earned</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">
                +{totals.earned.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <p className="text-xs text-neutral-400">Total Spent</p>
              <p className="mt-1 text-2xl font-semibold text-red-300">
                -{totals.spent.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
              <p className="text-xs text-neutral-400">Net</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {totals.net.toLocaleString()}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
