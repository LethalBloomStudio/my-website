"use client";

import { useState } from "react";
import FeedbackButton from "@/components/FeedbackButton";

export default function Home() {

  return (
    <main id="main" className="min-h-screen">

      {/* ── Hero ── */}
      <section
        className="night-hero-bg bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_60%),#0a0814] px-6 py-24 text-center sm:py-32"
        aria-labelledby="hero-heading"
      >
        <span className="mb-6 inline-block rounded-full border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.12)] px-4 py-1 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-500">
          Now open to writers
        </span>
        <h1
          id="hero-heading"
          className="mx-auto max-w-3xl text-4xl font-light leading-tight text-neutral-100 sm:text-5xl lg:text-6xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          Writing is solitary.<br />
          <strong className="font-semibold text-white">Revision shouldn&apos;t be.</strong>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-base font-light leading-7 text-neutral-400">
          A secure, structured space where writers share chapters, receive meaningful critique, and develop their work with intention. Upload your first three chapters free.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/sign-up"
            className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-6 py-3 text-sm font-semibold text-white transition hover:border-[rgba(120,120,120,0.9)] hover:bg-[rgba(120,120,120,0.3)]"
          >
            Create Free Account
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.35)] bg-transparent px-6 py-3 text-sm font-medium text-neutral-400 transition hover:border-[rgba(120,120,120,0.6)] hover:text-white"
          >
            See how it works
          </a>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-neutral-600">
          <span className="font-bold text-emerald-500" aria-hidden="true">✓</span>
          No credit card required
        </p>
      </section>

      {/* ── Trust bar ── */}
      <div
        className="flex flex-wrap justify-center gap-x-8 gap-y-2 border-y border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-6 py-3"
        role="region"
        aria-label="Free tier summary"
      >
        {[
          "1 manuscript free",
          "First 3 chapters free",
          "3 free beta reader slots",
          "Earn coins by giving feedback",
          "No credit card required",
        ].map((item) => (
          <span key={item} className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="font-bold text-emerald-500" aria-hidden="true">✓</span>
            {item}
          </span>
        ))}
      </div>

      {/* ── Why we built this ── */}
      <section
        className="border-b border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.04)] px-6 py-20"
        aria-labelledby="founder-heading"
      >
        <div className="mx-auto max-w-2xl">
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-600">Why we built this</p>
          <h2
            id="founder-heading"
            className="mb-8 text-3xl font-light text-neutral-100"
            style={{ letterSpacing: "-0.01em" }}
          >
            The space we wish had <strong className="font-semibold text-white">existed.</strong>
          </h2>
          <div className="space-y-4 text-sm font-light leading-7 text-neutral-400">
            <p>
              Finding honest, craft-focused feedback is one of the hardest parts of being a writer. Lethal Bloom Studio was built to change that. It&apos;s a place for{" "}
              <strong className="font-medium text-neutral-200">honest feedback</strong>, steady growth, and manuscripts moving steadily toward publication.
            </p>
            <p>
              We&apos;re just getting started and we want you to be part of it from the beginning. Every writer can upload their first manuscript for free, including the first three chapters and three complimentary reader spots.
            </p>
            <p>
              However you participate, the goal remains the same:{" "}
              <strong className="font-medium text-neutral-200">writers supporting writers</strong> while bringing their stories to life.
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="mx-auto max-w-5xl px-6 py-20"
        aria-labelledby="how-heading"
      >
        <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-600">Simple process</p>
        <h2
          id="how-heading"
          className="mb-8 text-3xl font-light text-neutral-100"
          style={{ letterSpacing: "-0.01em" }}
        >
          How it <strong className="font-semibold text-white">works</strong>
        </h2>
        <div
          className="grid divide-y divide-[rgba(120,120,120,0.2)] overflow-hidden rounded-xl border border-[rgba(120,120,120,0.25)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:[&>*:not(:last-child)]:border-r lg:[&>*:not(:last-child)]:border-[rgba(120,120,120,0.2)] sm:[&>*:nth-child(1)]:border-r sm:[&>*:nth-child(1)]:border-[rgba(120,120,120,0.2)] sm:[&>*:nth-child(3)]:border-r sm:[&>*:nth-child(3)]:border-[rgba(120,120,120,0.2)] sm:[&>*:nth-child(2)]:border-b sm:[&>*:nth-child(2)]:border-[rgba(120,120,120,0.2)] sm:[&>*:nth-child(1)]:border-b sm:[&>*:nth-child(1)]:border-[rgba(120,120,120,0.2)]"
          role="list"
        >
          {[
            { num: "01", title: "Upload your manuscript", body: "Share your first three chapters free. No setup friction, no commitment needed to get started." },
            { num: "02", title: "Get beta readers", body: "Three complimentary reader spots connect your work with writers who give thoughtful, meaningful critique." },
            { num: "03", title: "Give feedback, earn coins", body: "Leave 200+ words of genuine critique on a chapter and earn 5 Bloom Coins to spend on your own work." },
            { num: "04", title: "Grow without limits", body: "Subscribe for $10/mo or $100/yr for unlimited uploads, chapters, and reader slots." },
          ].map(({ num, title, body }) => (
            <div key={num} className="bg-[rgba(120,120,120,0.06)] px-7 py-8" role="listitem">
              <span className="mb-3 block text-[0.7rem] font-medium tracking-widest text-neutral-600">{num}</span>
              <h3 className="mb-2 text-sm font-medium text-neutral-100">{title}</h3>
              <p className="text-xs font-light leading-6 text-neutral-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Free tier ── */}
      <section
        className="mx-auto max-w-5xl px-6 pb-20"
        aria-labelledby="free-heading"
      >
        <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-600">Free tier</p>
        <h2
          id="free-heading"
          className="mb-8 text-3xl font-light text-neutral-100"
          style={{ letterSpacing: "-0.01em" }}
        >
          Start posting and earning.{" "}
          <strong className="font-semibold text-white">No card required.</strong>
        </h2>
        <div className="mb-8 overflow-hidden rounded-xl border border-[rgba(120,120,120,0.5)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.12)] px-6 py-4">
            <h3 className="text-sm font-medium text-neutral-100">Bloom Member</h3>
            <span className="rounded-full border border-emerald-700/40 bg-emerald-950/30 px-3 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-emerald-400">
              Always free
            </span>
          </div>
          <div className="grid gap-3 bg-[rgba(120,120,120,0.04)] p-6 sm:grid-cols-2 day-white-bg">
            {[
              "Upload 1 manuscript free",
              "First 3 chapters free",
              "3 free beta reader slots",
              "Earn 5 coins per 200-word critique",
              "Purchase Bloom Coins from $1.00",
              "No credit card required",
            ].map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm font-light text-neutral-400">
                <span className="mt-px shrink-0 font-bold text-emerald-500" aria-hidden="true">✓</span>
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="text-center">
          <a
            href="/sign-up"
            className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-6 py-3 text-sm font-semibold text-white transition hover:border-[rgba(120,120,120,0.9)] hover:bg-[rgba(120,120,120,0.3)]"
          >
            Create Free Account
          </a>
          <p className="mt-3 text-xs text-neutral-600">
            Want unlimited?{" "}
            <a href="/pricing" className="text-neutral-400 underline underline-offset-2 transition hover:text-neutral-200">
              See Lethal Member at $10/mo
            </a>
          </p>
        </div>
      </section>

      {/* ── Bloom Coins ── */}
      <section
        className="border-y border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.04)] px-6 py-20"
        aria-labelledby="coins-heading"
      >
        <div className="mx-auto max-w-5xl">
          <span className="bloom-coin-icon mb-2 block text-2xl" aria-hidden="true">✿</span>
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-600">Bloom Coins</p>
          <h2
            id="coins-heading"
            className="mb-4 text-3xl font-light text-neutral-100"
            style={{ letterSpacing: "-0.01em" }}
          >
            The community <strong className="font-semibold text-white">credit system.</strong>
          </h2>
          <p className="mb-8 max-w-lg text-sm font-light leading-7 text-neutral-500">
            Earn coins by leaving meaningful feedback on other writers&apos; work. Spend them to upload additional chapters, open extra manuscript slots, or add more beta reader seats. The more you engage, the more you earn.
          </p>
          <div className="grid divide-y divide-[rgba(120,120,120,0.2)] overflow-hidden rounded-xl border border-[rgba(120,120,120,0.25)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:[&>*:not(:last-child)]:border-r lg:[&>*:not(:last-child)]:border-[rgba(120,120,120,0.2)]">
            {[
              { val: "5 coins", label: "earned per 200+ word critique you leave" },
              { val: "10 coins", label: "to upload a chapter beyond your free three" },
              { val: "$1.00", label: "= 100 Bloom Coins if you prefer to purchase" },
              { val: "Never", label: "expire. Use them at your own pace." },
            ].map(({ val, label }) => (
              <div key={val} className="bg-[rgba(120,120,120,0.08)] px-7 py-8">
                <div className="mb-1 text-2xl font-light tracking-tight text-neutral-100">{val}</div>
                <div className="text-xs font-light leading-5 text-neutral-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        className="mx-auto max-w-5xl px-6 py-20"
        aria-labelledby="faq-heading"
      >
        <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-widest text-neutral-600">Questions</p>
        <h2
          id="faq-heading"
          className="mb-8 text-3xl font-light text-neutral-100"
          style={{ letterSpacing: "-0.01em" }}
        >
          Good to know <strong className="font-semibold text-white">before you start.</strong>
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {[
            { q: "What genres are welcome?", a: "All genres are welcome, from literary fiction and memoir to fantasy, romance, and thriller. Writers of all experience levels participate." },
            { q: "What counts as meaningful feedback?", a: "200+ words that engage with the actual content of a chapter. Address pacing, character voice, tension, or dialogue while referencing specific moments from the work." },
            { q: "Is my writing protected?", a: "Yes. Your work is shared only with the readers you invite. Lethal Bloom Studio is a private, secure space, not a public forum." },
            { q: "Do Bloom Coins expire?", a: "No. Coins you earn, claim, or purchase remain in your account indefinitely. Spend them at your own pace with no time pressure." },
            { q: "Are there youth accounts?", a: "Yes. Writers ages 13–17 can join under a parent account at no extra cost, with full parental controls and a safe, supervised community." },
            { q: "Are there hidden fees?", a: "No. The only costs are the optional Lethal Member subscription and any Bloom Coins you choose to purchase. Everything else is free." },
          ].map(({ q, a }) => (
            <div key={q}>
              <h4 className="mb-1 text-sm font-bold text-neutral-100">{q}</h4>
              <p className="text-sm font-light leading-6 text-neutral-500">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section
        className="cta-section border-y border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.08)] px-6 py-24 text-center"
        aria-labelledby="cta-heading"
      >
        <h2
          id="cta-heading"
          className="mb-4 text-3xl font-light text-white"
          style={{ letterSpacing: "-0.02em" }}
        >
          Your manuscript deserves <strong className="font-semibold">honest eyes.</strong>
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm font-light leading-7 text-white/60">
          Upload your first three chapters free today. No credit card, no commitment. Just better feedback from writers who care about the craft.
        </p>
        <a
          href="/sign-up"
          className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-8 py-3 text-sm font-semibold text-white transition hover:border-[rgba(120,120,120,0.9)] hover:bg-[rgba(120,120,120,0.3)]"
        >
          Create Free Account
        </a>
        <p className="mt-3 text-xs text-white/30">Start in under 2 minutes</p>
      </section>

      {/* ── Newsletter (hidden) ── */}

      <FeedbackButton />

      {/* ── Footer ── */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[rgba(120,120,120,0.15)] bg-[rgba(120,120,120,0.04)] px-6 py-5">
        <p className="text-xs text-neutral-600">&copy; {new Date().getFullYear()} Lethal Bloom Studio. All rights reserved.</p>
        <nav className="flex flex-wrap gap-5" aria-label="Footer navigation">
          {[
            { label: "Pricing", href: "/pricing" },
            { label: "Help", href: "/help" },
            { label: "Accessibility", href: "/accessibility" },
          ].map(({ label, href }) => (
            <a key={href} href={href} className="text-xs text-neutral-600 transition hover:text-neutral-300">
              {label}
            </a>
          ))}
        </nav>
      </footer>

    </main>
  );
}
