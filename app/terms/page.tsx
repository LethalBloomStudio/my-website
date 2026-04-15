import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the Terms of Service for Lethal Bloom Studio — the rules and agreements that govern your use of our creative writing platform.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-300">
      <h1 className="mb-2 text-3xl font-light text-neutral-100" style={{ letterSpacing: "-0.01em" }}>
        Terms of Service
      </h1>
      <p className="mb-10 text-sm text-neutral-500">Last updated: April 2026</p>

      <section className="space-y-6 text-sm font-light leading-7" aria-labelledby="intro-heading">
        <p>
          Welcome to Lethal Bloom Studio. By creating an account or using our platform at{" "}
          <strong className="text-neutral-200">lethalbloomstudio.com</strong>, you agree to these
          Terms of Service. Please read them carefully.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="eligibility-heading">
        <h2 id="eligibility-heading" className="text-lg font-semibold text-neutral-100">Eligibility</h2>
        <p>
          You must be at least 13 years old to use Lethal Bloom Studio. Users under 18 must have
          verifiable parental or guardian consent before accessing the platform. We reserve the
          right to suspend or terminate accounts that do not meet these requirements.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-lg font-semibold text-neutral-100">Your Account</h2>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>You are responsible for keeping your account credentials secure.</li>
          <li>You may not share your account with others or create multiple accounts to evade moderation.</li>
          <li>You must provide accurate information when creating your account.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="content-heading">
        <h2 id="content-heading" className="text-lg font-semibold text-neutral-100">Your Content</h2>
        <p>
          You retain ownership of all manuscripts, chapters, and creative work you upload to Lethal
          Bloom Studio. By uploading content, you grant us a limited, non-exclusive license to
          store, display, and deliver that content to other users in accordance with your privacy
          settings.
        </p>
        <p>
          You are solely responsible for the content you post. You agree not to upload content that:
        </p>
        <ul className="list-inside list-disc space-y-2 text-neutral-400">
          <li>Infringes on the intellectual property rights of others</li>
          <li>Contains illegal material, including content that sexually exploits minors</li>
          <li>Constitutes harassment, hate speech, or targeted abuse of other users</li>
          <li>Is intentionally deceptive or designed to manipulate others</li>
        </ul>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="conduct-heading">
        <h2 id="conduct-heading" className="text-lg font-semibold text-neutral-100">Community Conduct</h2>
        <p>
          Lethal Bloom Studio is a community for writers and readers who take their craft seriously.
          We expect all users to treat each other with respect. Harassment, bullying, impersonation,
          or abuse of any kind toward other users, authors, or platform staff is not tolerated
          and may result in permanent account suspension.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-semibold text-neutral-100">Payments and Subscriptions</h2>
        <p>
          Some features of Lethal Bloom Studio require a paid subscription. By subscribing, you
          authorize us to charge your payment method on a recurring basis until you cancel.
          Subscriptions may be canceled at any time through your account settings. Refunds are
          handled on a case-by-case basis. Contact us at{" "}
          <a
            href="mailto:support@lethalbloomstudio.com"
            className="text-neutral-300 underline underline-offset-2 hover:text-white"
          >
            support@lethalbloomstudio.com
          </a>{" "}
          if you have a billing concern.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="termination-heading">
        <h2 id="termination-heading" className="text-lg font-semibold text-neutral-100">Termination</h2>
        <p>
          We reserve the right to suspend or permanently terminate accounts that violate these
          Terms of Service, engage in harmful conduct, or otherwise threaten the safety or integrity
          of our community. You may also delete your own account at any time through your account
          settings.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="disclaimer-heading">
        <h2 id="disclaimer-heading" className="text-lg font-semibold text-neutral-100">Disclaimer of Warranties</h2>
        <p>
          Lethal Bloom Studio is provided &quot;as is&quot; without warranties of any kind. We do not
          guarantee uninterrupted access to the platform and are not liable for any loss of data or
          content resulting from service outages or technical issues.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="changes-heading">
        <h2 id="changes-heading" className="text-lg font-semibold text-neutral-100">Changes to These Terms</h2>
        <p>
          We may update these Terms of Service from time to time. When we do, we will update the
          &quot;Last updated&quot; date at the top of this page. Continued use of the platform after changes
          constitutes your acceptance of the updated terms.
        </p>
      </section>

      <section className="mt-10 space-y-6 text-sm font-light leading-7" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-lg font-semibold text-neutral-100">Contact Us</h2>
        <p>
          Questions about these terms? Reach us at{" "}
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
