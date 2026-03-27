import Stripe from "stripe";

// Lazy singleton — not instantiated at module evaluation time so the build
// never fails when STRIPE_SECRET_KEY is only available at runtime (e.g. Vercel).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

// Coin packages — must match WalletTabs PACKAGES
export const COIN_PACKAGES = {
  starter_100: { coins: 100, amount: 100, label: "Bloom Pack — 100 Bloom Coins" },   // $1.00
  writer_350:  { coins: 350, amount: 300, label: "Forge Pack — 350 Bloom Coins" },   // $3.00
  studio_600:  { coins: 600, amount: 500, label: "Lethal Pack — 600 Bloom Coins" },  // $5.00
} as const;

export type CoinPackageId = keyof typeof COIN_PACKAGES;

// Subscription plans
export const SUBSCRIPTION_PLANS = {
  lethal_member: {
    label: "Lethal Member — Monthly",
    amount: 1000,   // $10.00
    interval: "month" as const,
  },
  lethal_member_annual: {
    label: "Lethal Member — Annual",
    amount: 10000,  // $100.00
    interval: "year" as const,
  },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;
