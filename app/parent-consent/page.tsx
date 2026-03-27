import Link from "next/link";

export default function ParentConsentPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-amber-900 bg-amber-950/20 p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-200">Parental approval required</p>
        <h1 className="text-3xl font-semibold">We need a parent or guardian to approve this account</h1>
        <p className="text-neutral-200">
          This youth account is locked until a parent or guardian confirms consent. We’ve emailed the approval link to
          the address you provided during sign-up.
        </p>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-neutral-100">
          <li>Ask your parent/guardian to open the approval email and follow the link.</li>
          <li>If they can’t find it, resend the invite from the account page once consent is enabled by support.</li>
          <li>After approval, sign back in to continue.</li>
        </ol>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-amber-700 bg-amber-900/50 px-4 text-sm font-medium text-amber-50 hover:bg-amber-900/70"
          >
            Sign back in later
          </Link>
          <Link
            href="/help"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Get help
          </Link>
        </div>
      </div>
    </main>
  );
}
