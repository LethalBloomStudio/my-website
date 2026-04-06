import NewsletterSection from "@/components/NewsletterSection";
import FeedbackButton from "@/components/FeedbackButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.18)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)] sm:p-8">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lethal Bloom Studio</h1>
          <p className="mt-4 text-xl leading-8 text-neutral-200">Writing is solitary. Revision shouldn&apos;t be.</p>
          <p className="mt-4 max-w-4xl text-base leading-8 text-neutral-300">
            Lethal Bloom Studio offers a secure, structured space where writers share chapters, receive meaningful critique, and develop their work with intention. It&apos;s a place for honest feedback, steady growth, and manuscripts moving steadily toward publication.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.13)] p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">How it Works</h2>

          <div className="mt-4 space-y-5 text-sm leading-7 text-neutral-300 sm:text-base">
            <p>
              Share your story and start gathering feedback right away. Every writer can upload one manuscript for free, including the first three chapters, along with three complimentary reader spots. It&apos;s a simple way to introduce your work to the community and receive thoughtful critiques that help strengthen your draft.
            </p>
            <p>
              To unlock additional chapters, manuscripts, or reader spots, Bloom Coins are required. Bloom Coins are Lethal Bloom Studio&apos;s community credit system, designed to give every writer a fair and flexible path forward. Earn coins by providing meaningful feedback to fellow writers, or purchase them in $1, $3, or $5 options if time is limited.
            </p>
            <p>
              Writing at a fast pace or already have a completed book ready for feedback and need to upload your entire manuscript? Monthly subscribers receive unlimited manuscript uploads, chapters, and reader spots, making it easy to keep momentum and move your work forward without limits.
            </p>
            <p>
              However you participate, the goal remains the same: writers supporting writers while bringing their stories to life!
            </p>
          </div>
        </section>

        <NewsletterSection />

        <FeedbackButton />

        <p className="mt-6 text-xs text-neutral-500">(c) {new Date().getFullYear()} Lethal Bloom Studio. All rights reserved.</p>
      </div>
    </main>
  );
}