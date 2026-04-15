import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Lethal Bloom Studio - a creative writing platform built for authors, beta readers, and storytellers who take their craft seriously.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-300">
      <h1 className="mb-2 text-3xl font-light text-neutral-100" style={{ letterSpacing: "-0.01em" }}>
        About Lethal Bloom Studio
      </h1>
      <p className="mb-10 text-sm text-neutral-500">A home for writers who mean it.</p>

      <section className="space-y-6 text-sm font-light leading-7" aria-labelledby="mission-heading">
        <h2 id="mission-heading" className="text-lg font-semibold text-neutral-100">Our Mission</h2>
        <p>
          Lethal Bloom Studio exists to give writers a real place to grow. Not a social media feed
          dressed up as a writing platform, but a focused workspace where manuscripts get honest
          feedback, beta readers do serious work, and authors at every stage can sharpen their craft.
        </p>
        <p>
          We believe that great stories take time, feedback, and a community that respects the
          writing process. That&apos;s what we&apos;re building here.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="what-heading">
        <h2 id="what-heading" className="text-lg font-semibold text-neutral-100">What We Offer</h2>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>Upload full manuscripts and share chapters with beta readers</li>
          <li>Collect line-level feedback directly on your writing</li>
          <li>Connect with a community of serious authors and readers</li>
          <li>Track your writing progress and manage your creative projects</li>
          <li>A safe, moderated space with tools for youth writers and their guardians</li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="community-heading">
        <h2 id="community-heading" className="text-lg font-semibold text-neutral-100">Our Community</h2>
        <p>
          Lethal Bloom Studio is home to writers of all backgrounds: debut novelists, seasoned
          authors, genre fiction fans, literary writers, and everyone in between. What we share is a
          commitment to the work. Every feature we build is in service of that.
        </p>
        <p>
          We take community safety seriously. Our platform includes moderation tools, a youth safety
          program with parental consent and guardian oversight, and clear conduct standards that
          protect every member.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-lg font-semibold text-neutral-100">Get in Touch</h2>
        <p>
          We&apos;re a small, independent team and we read every message we receive. Whether you have
          feedback, a question, or just want to say hello, reach out anytime.
        </p>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>
            <strong className="text-neutral-300">Email:</strong>{" "}
            <a
              href="mailto:support@lethalbloomstudio.com"
              className="text-neutral-300 underline underline-offset-2 hover:text-white"
            >
              support@lethalbloomstudio.com
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
