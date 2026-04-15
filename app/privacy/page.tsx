import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Lethal Bloom Studio collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-300">
      <h1 className="mb-2 text-3xl font-light text-neutral-100" style={{ letterSpacing: "-0.01em" }}>
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm text-neutral-500">Last updated: April 2026</p>

      <section className="space-y-6 text-sm font-light leading-7" aria-labelledby="intro-heading">
        <p>
          Lethal Bloom Studio (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy.
          This Privacy Policy explains how we collect, use, and safeguard your information when you
          use our platform at{" "}
          <strong className="text-neutral-200">lethalbloomstudio.com</strong>.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="collect-heading">
        <h2 id="collect-heading" className="text-lg font-semibold text-neutral-100">Information We Collect</h2>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>
            <strong className="text-neutral-300">Account information:</strong> email address,
            username, display name, and profile details you provide when signing up.
          </li>
          <li>
            <strong className="text-neutral-300">Content you upload:</strong> manuscripts,
            chapters, comments, feedback, and messages you create on the platform.
          </li>
          <li>
            <strong className="text-neutral-300">Usage data:</strong> pages visited, features
            used, and activity on the platform (e.g., last active time) to help us improve the
            experience.
          </li>
          <li>
            <strong className="text-neutral-300">Payment information:</strong> processed securely
            through Stripe. We do not store your card details directly.
          </li>
          <li>
            <strong className="text-neutral-300">Youth account data:</strong> for users under 18,
            we collect parent or guardian contact information to fulfill our parental consent
            requirements.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="use-heading">
        <h2 id="use-heading" className="text-lg font-semibold text-neutral-100">How We Use Your Information</h2>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>To provide, operate, and maintain the Lethal Bloom Studio platform</li>
          <li>To process payments and manage subscriptions</li>
          <li>To communicate with you about your account and platform updates</li>
          <li>To enforce our community guidelines and Terms of Service</li>
          <li>To improve platform features based on usage patterns</li>
          <li>To comply with legal obligations, including youth safety requirements</li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="share-heading">
        <h2 id="share-heading" className="text-lg font-semibold text-neutral-100">Information Sharing</h2>
        <p>
          We do not sell your personal information. We share data only with trusted service
          providers necessary to operate the platform, including our authentication provider
          (Supabase) and payment processor (Stripe), and only as required to deliver the service
          or comply with the law.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="retention-heading">
        <h2 id="retention-heading" className="text-lg font-semibold text-neutral-100">Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. When you delete your account,
          we remove your personal information within a reasonable timeframe, except where retention
          is required by law or for legitimate safety purposes (e.g., moderation records).
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="rights-heading">
        <h2 id="rights-heading" className="text-lg font-semibold text-neutral-100">Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate information</li>
          <li>Request deletion of your account and associated data</li>
          <li>Withdraw consent where processing is based on consent</li>
        </ul>
        <p>
          To exercise these rights, contact us at{" "}
          <a
            href="mailto:support@lethalbloomstudio.com"
            className="text-neutral-300 underline underline-offset-2 hover:text-white"
          >
            support@lethalbloomstudio.com
          </a>
          .
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="youth-heading">
        <h2 id="youth-heading" className="text-lg font-semibold text-neutral-100">Youth Privacy (COPPA)</h2>
        <p>
          Lethal Bloom Studio takes the privacy of younger users seriously. Users under 13 may only
          use the platform with verified parental consent. We require parents or guardians to
          approve accounts for users under 18 and provide tools for parents to monitor and manage
          their child&apos;s activity on the platform.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="changes-heading">
        <h2 id="changes-heading" className="text-lg font-semibold text-neutral-100">Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will update the
          &quot;Last updated&quot; date at the top of this page. Continued use of the platform after changes
          constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-lg font-semibold text-neutral-100">Contact Us</h2>
        <p>
          Questions about this Privacy Policy? Reach out at{" "}
          <a
            href="mailto:support@lethalbloomstudio.com"
            className="text-neutral-300 underline underline-offset-2 hover:text-white"
          >
            support@lethalbloomstudio.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
