export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import GoLethalButton from "./GoLethalButton";
import CreateBloomButton from "./CreateBloomButton";

export default async function PricingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  let isYouth = false;
  if (user) {
    const { data: acct } = await supabase
      .from("accounts")
      .select("age_category")
      .eq("user_id", user.id)
      .maybeSingle();
    isYouth = (acct as { age_category?: string } | null)?.age_category === "youth_13_17";
  }

  return (
    <main className="pricing-page min-h-screen bg-neutral-950">
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px" }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 44, margin: 0, letterSpacing: -0.5 }}>Pricing</h1>
        <p style={{ marginTop: 10, fontSize: 18, opacity: 0.85 }}>
          Earn Bloom Coins by giving feedback, or subscribe for unlimited uploads.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* Bloom */}
        <div className="pricing-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 24 }}>Bloom Member</h2>
            <span className="rounded-full border border-[rgba(59,130,246,0.6)] bg-[rgba(59,130,246,0.12)] px-3 py-1.5 text-xs text-[#60a5fa] h-fit">Free</span>
          </div>

          <p style={subStyle}>Start posting and earning. No card required.</p>

          <h3 style={h3Style}>What you get</h3>
          <ul style={ulStyle}>
            <li>Upload <b>1 manuscript free</b></li>
            <li>Upload your <b>first 3 chapters free</b></li>
            <li>Up to <b>3 free beta reader slots</b></li>
          </ul>

          <h3 style={h3Style}>Earn Bloom Coins</h3>
          <ul style={ulStyle}>
            <li><b>200+ words</b> of feedback on a chapter → <b>5 Coins</b></li>
            <li>Standard rate: <b>10 Coins</b> per chapter upload</li>
          </ul>

          <h3 style={h3Style}>Costs</h3>
          <ul style={ulStyle}>
            <li>Each chapter after your first 3: <b>10 Coins</b></li>
            <li>Second manuscript + 1 chapter: <b>15 Coins</b></li>
            <li>Extra beta reader slots: <b>15 Coins each</b></li>
          </ul>

          {isYouth ? (
            <p style={{ marginTop: 16, fontSize: 13, color: "rgba(180,180,180,0.8)" }}>
              Subscription changes must be made by your parent or guardian from their account.
            </p>
          ) : user ? (
            <p style={{ marginTop: 16, fontSize: 13, color: "rgba(180,180,180,0.8)" }}>
              You already have a Bloom account.
            </p>
          ) : (
            <CreateBloomButton />
          )}
        </div>

        {/* Pro */}
        <div className="pricing-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 24 }}>Lethal Member</h2>
            <span className="rounded-full border border-[rgba(220,38,38,0.6)] bg-[rgba(220,38,38,0.12)] px-3 py-1.5 text-xs text-[#f87171] h-fit">
              $10 / mo or $100 / yr
            </span>
          </div>

          <p style={subStyle}>Unlimited uploads. Built for writers who move fast.</p>

          <h3 style={h3Style}>Everything unlimited</h3>
          <ul style={ulStyle}>
            <li><b>Unlimited manuscript</b> uploads</li>
            <li><b>Unlimited chapter</b> uploads</li>
            <li><b>Unlimited beta reader slots</b> on every manuscript</li>
          </ul>

          <h3 style={h3Style}>Subscription options</h3>
          <ul style={ulStyle}>
            <li><b>$10/month</b> subscription</li>
            <li><b>$100/year</b> subscription</li>
          </ul>

          <h3 style={h3Style}>Bonus</h3>
          <ul style={ulStyle}>
            <li>Purchase Bloom Coins to reward beta readers who leave exceptional feedback</li>
            <li>Send coin rewards directly to readers from your manuscript workspace</li>
            <li><b>$1.00 = 100 Bloom Coins</b></li>
          </ul>

          {isYouth ? (
            <p style={{ marginTop: 16, fontSize: 13, color: "rgba(180,180,180,0.8)" }}>
              Subscription changes must be made by your parent or guardian from their account.
            </p>
          ) : (
            <GoLethalButton />
          )}
          <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
            Cancel anytime.
          </p>
        </div>
      </section>

      {/* Coins Banner */}
      <section style={{ marginTop: 18 }}>
        <div className="pricing-card">
          <h2 style={{ margin: 0, fontSize: 22 }}>
            <span className="bloom-coin-icon">✿&#xFE0E;</span> Bloom Coins
          </h2>
          <p style={{ margin: "8px 0 0", lineHeight: 1.65, fontSize: 15 }}>
            Bloom Coins are the platform&apos;s internal currency, earned by leaving meaningful feedback on other writers&apos; work, received as rewards from admin announcements, or purchased directly from your wallet. Spend them to upload additional chapters, open extra manuscript slots, or add more beta reader seats. The more you engage with the community, the more you earn.
          </p>
        </div>
      </section>

      {/* Direct coin purchase */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>Buy Bloom Coins</h2>
        <p style={{ margin: "0 0 12px", opacity: 0.85 }}>
          Use your wallet to purchase coins instantly, starting at $1.00 for 100 coins.
        </p>
        <Link href="/wallet" className="wallet-btn">
          Go to Wallet
        </Link>
      </section>

      {/* Parents & Youth Accounts */}
      <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6" style={{ marginTop: 28 }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">For Parents: Youth Accounts</h2>
            <p className="mt-1 text-sm text-neutral-400">
              A safe, supervised writing community for young readers and writers ages 13–17.
            </p>
          </div>

        </div>

        <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.65, opacity: 0.85 }}>
          If you have a child who loves reading and writing, Lethal Bloom Studio gives you the tools to add them to your account so they can participate in the community safely, with you in control. Youth profiles are linked directly to your parent account, giving you full visibility into their activity without restricting their creativity.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] p-4">
            <p className="text-sm font-semibold text-neutral-100">Free Youth Account</p>
            <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
              Add your child at no extra cost. They get access to the MG and YA writing community, can leave feedback, earn Bloom Coins, and upload manuscripts, all while you retain full parental oversight from your account.
            </p>
            <p className="mt-2 text-xs text-neutral-500">No additional charge · Included with your account</p>
          </div>
          <div className="rounded-lg border border-violet-700/40 bg-violet-950/10 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-100">Unlimited Youth Account</p>
              <span className="text-xs font-bold text-violet-400">+$5 / mo</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
              Upgrade your child&apos;s account to Unlimited for just $5/month, half the standard Lethal Member rate. They get unlimited manuscript uploads, unlimited chapter uploads, and unlimited beta reader slots, all under your parental supervision.
            </p>
            <p className="mt-2 text-xs text-neutral-500">$5/mo added to your subscription · Cancel anytime</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">What parents control</p>
          <ul className="space-y-1.5 text-sm text-neutral-300">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Add and remove youth accounts from your profile at any time</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Manage their subscription tier, free or unlimited</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Purchase and send Bloom Coins directly to your child&apos;s wallet</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>View their linked manuscripts in read-only mode from the Manage Youth page</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Receive notifications when your child requests coins</li>
          </ul>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Built-in safety for youth profiles</p>
          <ul className="space-y-1.5 text-sm text-neutral-300">
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Youth profiles only appear to other youth; adults cannot view their profile or manuscripts</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Direct messaging between youth and adult accounts is disabled</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Youth are restricted to MG and YA categories in Discover and on their profiles</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Youth can only request to read adult manuscripts in the MG or YA categories</li>
            <li className="flex items-start gap-2"><span className="mt-0.5 text-neutral-400 shrink-0">✓</span>Subscription changes and Bloom Coin purchases require parent approval</li>
          </ul>
        </div>

        <p className="mt-4 text-xs text-neutral-500 leading-relaxed">
          Removing a linked youth account ends the +$5/mo add-on charge and returns your subscription to its standard rate. When a youth member turns 18, their account is automatically upgraded to a full adult profile and the parent link is removed.
        </p>
      </section>

      {/* FAQ */}
      <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6" style={{ marginTop: 28 }}>
        <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
        <div className="mt-4 space-y-3">

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">What counts as 200 words of feedback?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">Feedback must be a genuine, chapter-specific response of 200 or more words. This means engaging with the actual content, noting what worked, what didn&apos;t, and why. Strong feedback might address pacing, character voice, clarity, dialogue, tension, world-building, or emotional impact. It should reference specific moments from the chapter, not speak in vague generalities. The goal is to give the writer something they can actually use to improve their work. Feedback that meets the word count but is clearly padded, off-topic, or copy-pasted will not be rewarded. Quality and specificity are what count.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Do Bloom Coins expire?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">No. Bloom Coins never expire. Any coins you earn through feedback, claim from announcements, or purchase from your wallet remain in your account indefinitely. You can spend them at your own pace with no time pressure.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">How much does it cost to upload additional chapters?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">Bloom Members receive their first 3 chapters free. Each chapter uploaded after that costs 10 Bloom Coins. Lethal Members have unlimited chapter uploads included in their subscription at no additional coin cost.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">How much does it cost to add more beta reader slots?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">Each manuscript comes with 3 free beta reader slots. Additional slots can be unlocked for 15 Bloom Coins each. Lethal Members receive all reader slots free. There is no limit on how many extra slots you can add.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Can I get a refund on purchased Bloom Coins?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">Bloom Coin purchases are non-refundable. Coins are credited to your account immediately upon purchase and can be used right away. If you have a billing concern, please reach out to us through the Help page.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Are there any hidden fees?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">No. The only costs on Lethal Bloom Studio are the optional Lethal Member subscription, Bloom Coin packages you choose to purchase, and coin costs for certain actions like extra chapter uploads and additional reader slots. Everything else is free to use.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Can Bloom Coins be used to pay for a Lethal membership?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">No. Bloom Coins are an in-platform currency used for uploads and reader slots. The Lethal Member subscription is billed separately in real currency at $10 per month or $100 per year.</p>
          </details>

          <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Can I transfer Bloom Coins to another user?</summary>
            <p className="mt-3 text-sm text-neutral-300 leading-relaxed">Bloom Coins are tied to your account and cannot be directly transferred to another user. However, when you send a reader reward to a beta reader for their feedback, coins are credited to them directly as part of that transaction.</p>
          </details>

        </div>
      </section>

    </div>
    </main>
  );
}

const h3Style: React.CSSProperties = { margin: "16px 0 8px", fontSize: 14, opacity: 0.9, textTransform: "uppercase", letterSpacing: 0.8 };
const ulStyle: React.CSSProperties = { margin: 0, paddingLeft: 18, lineHeight: 1.7 };
const subStyle: React.CSSProperties = { marginTop: 10, opacity: 0.88, lineHeight: 1.5 };
