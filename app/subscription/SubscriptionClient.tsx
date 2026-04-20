"use client";

import { useState } from "react";

type Plan = "lethal_member" | "lethal_member_annual" | "youth_lethal_member";

export default function SubscriptionClient({
  currentStatus,
  youthLethalMode = false,
  onActivePromo = false,
  promotionExpiresAt = null,
}: {
  currentStatus: string;
  youthLethalMode?: boolean;
  onActivePromo?: boolean;
  promotionExpiresAt?: string | null;
}) {
  const isFree = !currentStatus || currentStatus === "free";
  const isMonthly = currentStatus === "lethal" || currentStatus === "lethal_member";
  const isAnnual = currentStatus === "lethal_annual" || currentStatus === "lethal_member_annual";
  const isLethal = isMonthly || isAnnual;
  const isPromoOnly = onActivePromo && (isFree || (!isMonthly && !isAnnual));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [_confirmCancel, _setConfirmCancel] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(youthLethalMode ? "youth_lethal_member" : "lethal_member");

  async function handleSubscribe() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "subscription", plan: selectedPlan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) { setMsg(data.error ?? "Failed to start checkout."); setLoading(false); return; }
      window.location.href = data.url;
    } catch {
      setMsg("Something went wrong.");
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) { setMsg(data.error ?? "Could not open billing portal."); setLoading(false); return; }
      window.location.href = data.url;
    } catch {
      setMsg("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan status banner */}
      <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">Current plan</p>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              {isPromoOnly
                ? "Lethal Member - Promotional Access"
                : isFree
                ? "Bloom Member"
                : isAnnual
                ? "Lethal Member - Annual"
                : "Lethal Member - Monthly"}
            </p>
            <p className="mt-0.5 text-sm text-neutral-400">
              {isPromoOnly
                ? `Free promotional access · no charge${promotionExpiresAt ? ` · expires ${new Date(promotionExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}`
                : isFree
                ? "Free tier - limited uploads, earn coins to unlock more"
                : isAnnual
                ? "$100/year · billed annually · cancel anytime"
                : "$10/month · billed monthly · cancel anytime"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              isPromoOnly
                ? "border border-violet-700/50 bg-violet-950/30 text-violet-400"
                : isLethal
                ? "border border-emerald-700/50 bg-emerald-950/30 text-emerald-400"
                : "border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.1)] text-neutral-400"
            }`}
          >
            {isPromoOnly ? "Promo" : isFree ? "Free" : "Active"}
          </span>
        </div>
      </div>

      {/* Upgrade options (free users without promo) */}
      {isFree && !isPromoOnly && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            {youthLethalMode ? "Activate Youth Lethal" : "Upgrade to Lethal Member"}
          </h2>

          {youthLethalMode ? (
            /* Youth Lethal: single fixed plan, no annual option */
            <div className="rounded-xl border border-red-700/40 bg-red-950/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-100">Youth Lethal Member</span>
                <span className="text-xs text-red-400 font-bold">$10 / mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Approved by your parent or guardian · billed monthly to your account · cancel anytime
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Monthly */}
              <button
                type="button"
                onClick={() => setSelectedPlan("lethal_member")}
                className={`rounded-xl border p-4 text-left transition ${
                  selectedPlan === "lethal_member"
                    ? "border-violet-600/60 bg-violet-950/20"
                    : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] hover:border-[rgba(120,120,120,0.55)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-100">Monthly</span>
                  {selectedPlan === "lethal_member" && (
                    <span className="text-xs text-violet-400">Selected</span>
                  )}
                </div>
                <p className="mt-1 text-xl font-bold text-neutral-100">
                  $10<span className="text-sm font-normal text-neutral-400">/mo</span>
                </p>
                <p className="mt-1 text-xs text-neutral-400">Billed monthly · cancel anytime</p>
              </button>

              {/* Annual */}
              <button
                type="button"
                onClick={() => setSelectedPlan("lethal_member_annual")}
                className={`rounded-xl border p-4 text-left transition ${
                  selectedPlan === "lethal_member_annual"
                    ? "border-violet-600/60 bg-violet-950/20"
                    : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] hover:border-[rgba(120,120,120,0.55)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-100">Annual</span>
                  <span className="rounded-lg bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-800/40">
                    Save $20
                  </span>
                </div>
                <p className="mt-1 text-xl font-bold text-neutral-100">
                  $100<span className="text-sm font-normal text-neutral-400">/yr</span>
                </p>
                <p className="mt-1 text-xs text-neutral-400">Billed once · cancel anytime</p>
              </button>
            </div>
          )}

          {/* What you get */}
          <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
              What you get
            </p>
            <ul className="space-y-2 text-sm text-neutral-300">
              {[
                "Unlimited manuscript uploads",
                "Unlimited chapter uploads",
                "Unlimited beta reader slots on every manuscript",
                "Purchase Bloom Coins to reward readers",
                "Send coin rewards directly from your manuscript workspace",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-violet-400">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={loading}
            className="h-11 w-full rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-950"
          >
            {loading ? "Processing..." : youthLethalMode ? "Subscribe - $10/mo" : `Subscribe - ${selectedPlan === "lethal_member_annual" ? "$100/yr" : "$10/mo"}`}
          </button>
          <p className="text-center text-xs text-neutral-500">Cancel anytime. No hidden fees.</p>
        </div>
      )}

      {/* Promotional access info */}
      {isPromoOnly && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            Promotional Access
          </h2>
          <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Access</span>
              <span className="text-sm text-neutral-200">Lethal Member (full access)</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Billing</span>
              <span className="text-sm text-violet-400">Free — no charge during promotion</span>
            </div>
            {promotionExpiresAt && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-400">Expires</span>
                <span className="text-sm text-neutral-200">
                  {new Date(promotionExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            You are not being charged. When your promotional period ends, you can choose to subscribe to keep your Lethal Member benefits.
          </p>
        </div>
      )}

      {/* Active subscription management (paid subscribers only) */}
      {isLethal && !isPromoOnly && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            Manage Subscription
          </h2>

          <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Plan</span>
              <span className="text-sm text-neutral-200">
                {isAnnual ? "Lethal Member Annual" : "Lethal Member Monthly"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Billing</span>
              <span className="text-sm text-neutral-200">
                {isAnnual ? "$100 / year" : "$10 / month"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-400">Status</span>
              <span className="text-sm text-emerald-700 dark:text-emerald-400">Active</span>
            </div>
          </div>

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          {/* Manage via Stripe portal (cancel, switch plan, update payment) */}
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={loading}
            className="h-9 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.14)] px-4 text-sm text-neutral-200 hover:bg-[rgba(120,120,120,0.24)] transition disabled:opacity-50"
          >
            {loading ? "Opening…" : "Manage billing / Cancel subscription"}
          </button>
          <p className="text-xs text-neutral-500">
            Switch plans, update payment method, or cancel - all handled securely through Stripe.
          </p>
        </div>
      )}
    </div>
  );
}
