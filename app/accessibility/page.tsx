import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility",
  description:
    "Lethal Bloom Studio's commitment to web accessibility for all users, including those with disabilities.",
};

export default function AccessibilityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-300">
      <h1 className="mb-2 text-3xl font-light text-neutral-100" style={{ letterSpacing: "-0.01em" }}>
        Accessibility Statement
      </h1>
      <p className="mb-10 text-sm text-neutral-500">Last updated: April 2026</p>

      <section className="space-y-6 text-sm font-light leading-7" aria-labelledby="commitment-heading">
        <h2 id="commitment-heading" className="text-lg font-semibold text-neutral-100">Our Commitment</h2>
        <p>
          Lethal Bloom Studio is committed to ensuring digital accessibility for people with
          disabilities. We continually improve the user experience for everyone and apply relevant
          accessibility standards as we build and update our platform.
        </p>
        <p>
          We aim to conform to the{" "}
          <strong className="text-neutral-200">Web Content Accessibility Guidelines (WCAG) 2.1, Level AA</strong>,
          published by the World Wide Web Consortium (W3C). These guidelines explain how to make
          web content more accessible to people with disabilities, and are the basis for the
          Americans with Disabilities Act (ADA) web accessibility requirements.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="measures-heading">
        <h2 id="measures-heading" className="text-lg font-semibold text-neutral-100">Measures We Take</h2>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>All pages include a skip-to-main-content link for keyboard users</li>
          <li>All form inputs have visible labels, not just placeholder text</li>
          <li>Error messages are announced immediately to screen readers via live regions</li>
          <li>All images include meaningful alternative text</li>
          <li>All interactive elements have visible focus indicators</li>
          <li>Page sections use landmark roles and headings to aid navigation</li>
          <li>Decorative icons are hidden from assistive technology with <code>aria-hidden</code></li>
          <li>Color alone is not used as the only means of conveying information</li>
          <li>The site is operable by keyboard without requiring a mouse</li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="known-heading">
        <h2 id="known-heading" className="text-lg font-semibold text-neutral-100">Known Limitations</h2>
        <p>
          We are actively working to improve accessibility across all pages. Some areas of the
          platform (particularly user-generated content and third-party embeds) may not yet
          fully meet our accessibility goals. We are committed to addressing these gaps over time.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-lg font-semibold text-neutral-100">Contact Us</h2>
        <p>
          If you experience any difficulty accessing content on Lethal Bloom Studio, or if you
          have suggestions for improvement, please contact us:
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
          <li>
            We aim to respond to accessibility feedback within{" "}
            <strong className="text-neutral-300">2 business days</strong>.
          </li>
        </ul>
        <p>
          If you are not satisfied with our response, you may contact the{" "}
          <a
            href="https://www.ada.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-300 underline underline-offset-2 hover:text-white"
          >
            U.S. Department of Justice ADA Information Line
          </a>{" "}
          at 1-800-514-0301 (voice) or 1-800-514-0383 (TTY).
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="tech-heading">
        <h2 id="tech-heading" className="text-lg font-semibold text-neutral-100">Technical Approach</h2>
        <p>
          Lethal Bloom Studio is built with semantic HTML5, ARIA landmarks and labels where
          needed, and tested against the following assistive technologies:
        </p>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>NVDA screen reader (Windows)</li>
          <li>VoiceOver (macOS and iOS)</li>
          <li>Keyboard-only navigation</li>
          <li>Browser zoom up to 200%</li>
        </ul>
      </section>
    </main>
  );
}
