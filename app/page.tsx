import FeedbackButton from "@/components/FeedbackButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center sm:pt-32">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Lethal Bloom Studio</h1>
        <p className="mt-5 text-xl leading-8 text-neutral-300 max-w-xl mx-auto">
          Writing is solitary. Revision shouldn&apos;t be.
        </p>
        <p className="mt-4 text-base leading-7 text-neutral-400 max-w-2xl mx-auto">
          A secure, structured space where writers share chapters, receive meaningful critique, and develop their work with intention — from first draft to publication-ready.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a
            href="/sign-up"
            className="inline-flex items-center rounded-xl border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[rgba(120,120,120,0.3)] hover:border-[rgba(120,120,120,0.9)]"
          >
            Get Started Free
          </a>
          <a
            href="/discover"
            className="inline-flex items-center rounded-xl border border-[rgba(120,120,120,0.35)] bg-transparent px-6 py-3 text-sm font-semibold text-neutral-400 transition hover:text-white hover:border-[rgba(120,120,120,0.6)]"
          >
            Browse Manuscripts
          </a>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight mb-8">How It Works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Upload Your Work",
              body: "Every writer gets one free manuscript with three chapters and three reader spots — no credit card needed. Share your story and start gathering feedback right away.",
            },
            {
              step: "02",
              title: "Receive Real Feedback",
              body: "Beta readers leave line-by-line comments directly on your chapters. Choose a feedback style that matches where your manuscript is in the revision process.",
            },
            {
              step: "03",
              title: "Grow Together",
              body: "Give feedback to earn Bloom Coins. Use coins to unlock more chapters, reader spots, or manuscripts — or subscribe for unlimited access.",
            },
          ].map(({ step, title, body }) => (
            <div key={step} className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.09)] p-6">
              <p className="text-xs font-semibold tracking-widest text-neutral-600 mb-3">{step}</p>
              <h3 className="text-base font-semibold text-neutral-100 mb-2">{title}</h3>
              <p className="text-sm leading-6 text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feedback Styles ── */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight mb-2">Choose Your Feedback Style</h2>
        <p className="text-center text-sm text-neutral-500 mb-8">Tell beta readers exactly what kind of critique you need.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.07)] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#60a5fa] mb-2">Bloom</p>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Encouraging &amp; Supportive</h3>
            <p className="text-sm leading-6 text-neutral-400">Ideal for early drafts. Readers focus on strengths and gentle suggestions that build confidence alongside craft.</p>
          </div>
          <div className="rounded-2xl border border-[rgba(202,160,0,0.35)] bg-[rgba(202,160,0,0.07)] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#f5c518] mb-2">Forge</p>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Balanced &amp; Constructive</h3>
            <p className="text-sm leading-6 text-neutral-400">Detailed notes with honest critique. Readers highlight what works and what needs work — structured feedback for serious revision.</p>
          </div>
          <div className="rounded-2xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.07)] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#f87171] mb-2">Lethal</p>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Direct &amp; Editorial</h3>
            <p className="text-sm leading-6 text-neutral-400">No-holds-barred analysis. Readers treat your manuscript like a professional editor — line by line, nothing glossed over.</p>
          </div>
        </div>
      </section>

      {/* ── Bloom Coins ── */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-2xl border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.09)] p-8 sm:flex sm:items-start sm:gap-10">
          <div className="shrink-0 text-4xl text-center mb-6 sm:mb-0 sm:pt-1 bloom-coin-icon">✿</div>
          <div>
            <h2 className="text-xl font-semibold text-neutral-100 mb-2">Bloom Coins — Community Credit</h2>
            <p className="text-sm leading-7 text-neutral-400">
              Earn coins by giving meaningful feedback to other writers. Spend them to unlock additional chapters, reader spots, or manuscripts. Need more right away? Purchase packs starting at $1 — or subscribe monthly for unlimited access with no limits on uploads, chapters, or readers.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/pricing"
                className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-[rgba(120,120,120,0.8)] hover:bg-[rgba(120,120,120,0.2)]"
              >
                See pricing
              </a>
              <a
                href="/beta-readers"
                className="inline-flex items-center rounded-lg border border-[rgba(120,120,120,0.3)] px-4 py-2 text-sm font-medium text-neutral-400 transition hover:text-neutral-200 hover:border-[rgba(120,120,120,0.55)]"
              >
                Browse beta readers
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-5xl px-6 pb-20 text-center">
        <div className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.09)] px-8 py-12">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100 mb-3">Ready to share your story?</h2>
          <p className="text-sm text-neutral-500 mb-7 max-w-md mx-auto">
            Join a community of writers supporting each other — one chapter at a time.
          </p>
          <a
            href="/sign-up"
            className="inline-flex items-center rounded-xl border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[rgba(120,120,120,0.3)] hover:border-[rgba(120,120,120,0.9)]"
          >
            Create your free account
          </a>
        </div>
      </section>

      <FeedbackButton />

      <div className="pb-10 text-center">
        <p className="text-xs text-neutral-600">&copy; {new Date().getFullYear()} Lethal Bloom Studio. All rights reserved.</p>
      </div>

    </main>
  );
}
