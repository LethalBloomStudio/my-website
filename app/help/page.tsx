export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";

type AdminContact = {
  key: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

async function getAdminContacts(): Promise<AdminContact[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: accounts } = await supabase
        .from("accounts")
        .select("user_id")
        .eq("is_admin", true);

      if (accounts && accounts.length > 0) {
        const ids = accounts.map((a: { user_id: string }) => a.user_id);
        const { data: profiles } = await supabase
          .from("public_profiles")
          .select("user_id, username, pen_name, avatar_url")
          .in("user_id", ids);

        return accounts.map((a: { user_id: string }) => {
          const p = (profiles ?? []).find(
            (pr: { user_id: string }) => pr.user_id === a.user_id
          ) as { username?: string | null; pen_name?: string | null; avatar_url?: string | null } | undefined;

          const displayName =
            p?.pen_name?.trim() ||
            (p?.username ? `@${p.username}` : null) ||
            "Admin";

          return {
            key: a.user_id,
            displayName,
            username: p?.username ?? null,
            avatarUrl: p?.avatar_url ?? null,
          };
        });
      }
    }
  } catch {
    // fall through
  }

  return [];
}

export default async function HelpPage() {
  const admins = await getAdminContacts();
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isSignedIn = !!user;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Help & Support</h1>
        <p className="mt-2 text-neutral-300">
          Need help? You can reach our team directly on-site or by email.
        </p>

        {/* On-site contact */}
        <section className="mt-8 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6">
          <h2 className="text-lg font-semibold">Message Us On-Site</h2>
          <p className="mt-1 text-sm text-neutral-400">
            {isSignedIn
              ? "The fastest way to get help is to message an admin directly through their profile. Click a profile below to visit it and send a message."
              : "On-site messaging is available to registered members. Sign in or create a free account to message our team directly."}
          </p>

          {admins.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-300">No admin profiles available at this time.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {admins.map((admin) => {
                const avatar = admin.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={admin.avatarUrl}
                    alt={admin.displayName}
                    className="h-10 w-10 shrink-0 rounded-full border border-[rgba(120,120,120,0.4)] object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 text-sm font-bold text-neutral-300">
                    {admin.displayName.replace(/^@/, "").charAt(0).toUpperCase()}
                  </span>
                );

                const badge = (
                  <span className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                    Owner
                  </span>
                );

                if (isSignedIn && admin.username) {
                  return (
                    <li key={admin.key}>
                      <Link
                        href={`/u/${admin.username}`}
                        className="flex items-center gap-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.1)] px-4 py-3 transition hover:border-[rgba(120,120,120,0.55)] hover:bg-[rgba(120,120,120,0.18)]"
                      >
                        {avatar}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-neutral-100">{admin.displayName}</span>
                            {badge}
                          </div>
                          <p className="mt-0.5 text-xs text-neutral-400">Visit profile to send a message →</p>
                        </div>
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={admin.key}>
                    <div className="flex items-center gap-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.1)] px-4 py-3 opacity-60">
                      {avatar}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-neutral-100">{admin.displayName}</span>
                          {badge}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {isSignedIn ? "Profile not yet public." : "Sign in to send a message"}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!isSignedIn && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="h-9 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.28)] transition inline-flex items-center"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="h-9 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-4 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.28)] transition inline-flex items-center"
              >
                Create an account
              </Link>
              <span className="text-sm text-neutral-500">or email us below</span>
            </div>
          )}
        </section>

        {/* Email contact */}
        <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-6">
          <h2 className="text-lg font-semibold">Email Us</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Prefer email? You can reach us at either address below. Please include your username and a description of your issue.
          </p>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.1)] px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 text-sm font-bold text-neutral-300">
                S
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-100">Studio Support</p>
                <a
                  href="mailto:lethalbloomstudio@gmail.com?subject=Support%20Request"
                  className="mt-0.5 block text-sm text-[rgba(210,210,210,0.8)] underline underline-offset-2 hover:text-white"
                >
                  lethalbloomstudio@gmail.com
                </a>
              </div>
            </li>
            <li className="flex items-center gap-4 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.1)] px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 text-sm font-bold text-neutral-300">
                P
              </span>
              <div>
                <p className="text-sm font-medium text-neutral-100">Publishing Inquiries</p>
                <a
                  href="mailto:lethalbloompublishing@gmail.com?subject=Publishing%20Inquiry"
                  className="mt-0.5 block text-sm text-[rgba(210,210,210,0.8)] underline underline-offset-2 hover:text-white"
                >
                  lethalbloompublishing@gmail.com
                </a>
                <p className="mt-1 text-xs text-amber-400/80">We are not currently accepting new client projects at this time.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6">
          <h2 className="text-lg font-semibold">What To Include In A Support Request</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <li>Your account username.</li>
            <li>The page or feature where the issue occurred.</li>
            <li>Approximate date and time of the issue.</li>
            <li>Screenshots or short reproduction steps if available.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6">
          <h2 className="text-lg font-semibold">Disclaimers</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            <li>Response time can vary based on request volume.</li>
            <li>Platform safety and moderation decisions are subject to review.</li>
            <li>Do not share passwords, private keys, or sensitive financial data in support messages.</li>
            <li>Help content and policies may be updated as the platform grows.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6">
          <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
          <div className="mt-4 space-y-3">

            {/* About Manuscripts */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">About Manuscripts</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I upload a manuscript?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Go to your Manuscripts page and select &quot;New Manuscript.&quot; Fill in the title and any relevant details, then save. From there you can begin adding chapters one at a time. Bloom Members receive their first 3 chapters free. Additional chapters cost 10 Bloom Coins each. Lethal Members have unlimited chapter uploads included.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I find beta readers for my manuscript?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Visit the Find Beta Readers page to browse available readers. You can filter by feedback level and genre. Once you find someone whose style fits your work, click &quot;Invite to Project&quot; on their profile card and select the manuscript you want them to read. They will receive a notification and can accept or decline. Beta readers can also discover your manuscript and request access on their own, which you can then accept or deny from your manuscript settings.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I give feedback on a chapter?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">When you are granted access to a project, you can read all available chapters in that manuscript. Navigate to the chapter you want to respond to and use the feedback section to leave your response. Feedback must be 200 or more words and engage specifically with the content of that chapter. Address elements like pacing, voice, dialogue, clarity, or emotional impact and reference actual moments from the text.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I earn Bloom Coins?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">You earn Bloom Coins by leaving qualifying feedback on chapters you have been given access to read. A response of 200 or more words that engages genuinely with the chapter earns you 5 Bloom Coins. You can also earn coins through admin announcements that include rewards, or purchase them directly from your Wallet page.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I send a reward to a beta reader?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">After a beta reader submits feedback on your chapter, you can choose to send them a coin reward directly from your account as recognition for their time and effort. This is optional but encouraged as a way to support the community. The coins are deducted from your balance and credited to theirs immediately.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What are the different beta reader levels?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">There are three reader levels. Bloom readers provide encouraging, supportive feedback suited to early drafts. Forge readers offer balanced critique with detailed notes and constructive honesty. Lethal readers deliver direct, editorial-level feedback with no-holds-barred analysis. You can set your own reader level from your profile settings to reflect the style of feedback you give.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I control who can read my manuscript?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Your manuscript is private by default. You can invite specific readers by sending them an invitation through the Find Beta Readers page. Beta readers can also request access to your manuscript on their own, and you have the ability to accept or deny each request from your manuscript settings. Each manuscript comes with 3 reader slots, and you can unlock additional slots for 15 Bloom Coins each (free for Lethal Members). You can revoke access at any time from your manuscript settings.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can I export my manuscript?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. From your manuscript workspace, click &quot;Export Manuscript&quot; to download your full book. You can export as a Word document (.docx) or as an HTML file compatible with Google Docs. All chapters are included in order.</p>
                </details>

              </div>
            </details>

            {/* Safety of Manuscripts */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Safety of Manuscripts</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Who can see my manuscript?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Your manuscript and all its chapters are completely private by default. Only users you have explicitly invited or approved as beta readers can access your content. No one else on the platform, including other writers, can view your manuscript unless you grant them access.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Is my writing protected from being copied?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. The platform has several layers of copy protection in place. Copying and pasting text from chapter pages is disabled, and right-click options are restricted. Every chapter is also overlaid with a subtle watermark that identifies the manuscript owner and the specific reader who was granted access, along with the date. It is intentionally faint so it does not interrupt the reading experience, but it is present throughout the chapter. This means that if your content ever appears outside the platform, it can be traced back to the source.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can I remove a beta reader&apos;s access?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. You can revoke a beta reader&apos;s access to your manuscript at any time from your manuscript settings. Once removed, they will no longer be able to view your chapters. You are in full control of who has access and for how long.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What should I do if I think someone has shared my manuscript without permission?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Contact the admin team immediately through the message or email options above. Include as much detail as possible about where the content appeared and when you discovered it. Because our watermark system ties every chapter view to a specific reader, we can investigate and take appropriate action. We take unauthorized distribution of member content seriously.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Does the platform store my unpublished chapters securely?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. All manuscript and chapter data is stored securely and is never shared with third parties. Your drafts are not publicly indexed or accessible outside the platform. Only you and the readers you explicitly approve can access your content.</p>
                </details>

              </div>
            </details>

            {/* About Messaging */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">About Messaging</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can I message other users directly?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes, for adult members. Direct messaging is available to all members aged 18 and over. Youth accounts (ages 13–17) do not have access to the messaging feature as a safety measure. It is a great way to connect with beta readers, discuss feedback, or coordinate on a project.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Who can send me messages?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Any adult member (18+) of the platform can send you a message. Youth profiles cannot send or receive direct messages. If you receive unwanted messages, you can report the sender and the admin team will review the situation. Repeated or abusive contact may result in messaging restrictions for the other user.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What should I do if I receive an inappropriate or harassing message?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Do not engage with the sender. Use the report option on their profile or message to flag the content for admin review. You can also reach out directly to an admin through the contact options at the top of this page. All reports are handled confidentially and taken seriously. Harassment is a violation of our community guidelines and may result in account action.</p>
                </details>

              </div>
            </details>

            {/* Safety of Users */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Safety of Users</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I report a user or content?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">You can report a user or piece of content by visiting their profile or the relevant page and using the report option. Reports are reviewed by the admin team. Provide as much detail as possible including what happened and when. All reports are handled confidentially.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What happens after I submit a report?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Once a report is submitted, it is reviewed by the admin team. We assess the situation based on the information provided and any relevant platform history. Outcomes can range from a warning to a temporary restriction or permanent account action, depending on the severity. You will not be notified of the specific action taken, but every report is genuinely reviewed.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What counts as a violation of community guidelines?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Violations include harassment or abusive behavior toward other members, sharing another user&apos;s manuscript content without permission, submitting dishonest or low-effort feedback to game the coin system, impersonating another user, posting content that is hateful or discriminatory, and any other conduct that harms the experience or safety of the community. We expect all members to treat each other with respect.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Is my personal information kept private?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. Your personal account information is never shared with other users. Only the profile details you choose to make public, such as your pen name, username, and bio, are visible to others. We do not sell or share your data with third parties. If you have specific privacy concerns, reach out to the admin team directly.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What should I do if my account is compromised?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">If you believe your account has been accessed without your permission, contact the admin team immediately using the email or on-site contact above. Do not share your password or login credentials with anyone. We will never ask for your password in a support message. Change your password as soon as possible if you suspect unauthorized access.</p>
                </details>

              </div>
            </details>

            {/* Bloom Coins & Pricing */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Bloom Coins &amp; Pricing</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do Bloom Coins work?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Bloom Coins are the platform&apos;s internal currency. You earn them by leaving genuine, qualifying feedback on chapters, receiving them from admin reward announcements, or purchasing them directly from your Wallet page. Coins are spent to upload additional chapters, unlock extra manuscripts, or add more beta reader slots. They never expire.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How much does it cost to add extra beta reader slots?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Each manuscript comes with 3 free beta reader slots. Additional slots cost 15 Bloom Coins each. Lethal Members receive unlimited reader slots on every manuscript at no coin cost.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can I purchase Bloom Coins?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. You can purchase Bloom Coins directly from your Wallet page starting at $1.00 for 100 coins. Purchased coins are credited to your account immediately and can be spent right away. Coin purchases are non-refundable.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What is the Lethal Member subscription?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">The Lethal Member subscription is $10 per month or $100 per year and gives you unlimited manuscript uploads, unlimited chapter uploads, and unlimited beta reader slots on every manuscript. It is billed in real currency and can be cancelled at any time. Bloom Coins cannot be used to pay for the subscription.</p>
                </details>

              </div>
            </details>

            {/* Account & Profile */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Account &amp; Profile</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I set up my profile?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">After creating your account, visit your profile settings to add a pen name, bio, avatar, and preferred genres. You can also set your beta reader level to indicate the style of feedback you provide. A complete profile helps other writers know whether you are a good fit for their project.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can I change my username or pen name?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. You can update your pen name at any time from your profile settings. Your username may also be editable depending on your account status. If you run into any issues changing your username, reach out to the admin team for assistance.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I add a youth account for my child?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Adult members (18+) can set up a linked youth account for their child from their account settings. Look for the &quot;Manage Youth Accounts&quot; section and select the option to invite a young writer. You will enter your child&apos;s name, email address, date of birth, and optionally choose a membership tier for them. They will receive an email invite with a link to create their own username and password. Once they accept, both accounts are linked automatically and parental consent is confirmed. See the Youth Accounts section of this FAQ for more details on how the process works.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I delete my account?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">If you wish to delete your account, please contact the admin team directly through the message or email options at the top of this page. We will walk you through the process. Please note that account deletion is permanent and cannot be undone. Any Bloom Coins remaining in your account will be forfeited upon deletion.</p>
                </details>

              </div>
            </details>

            {/* Youth Accounts */}
            <details className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-100">Youth Accounts</summary>
              <div className="mt-3 space-y-2">

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What is the minimum age to create an account?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">You must be at least 13 years old to create an account on Lethal Bloom Studio. Users under the age of 18 are considered youth members and may have certain restrictions in place to ensure a safe experience on the platform.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Are there restrictions for users under 18?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. Youth accounts have content and interaction restrictions in place to maintain a safe environment. Certain mature or adult-flagged content may not be accessible to users under 18. If you believe a restriction has been applied in error, a parent or guardian can contact the admin team on your behalf.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can a parent or guardian add and manage a youth account?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. If you have an adult account (18+), you can set up a linked youth account for your child directly from your account. Go to the &quot;Manage Youth Accounts&quot; section in your account settings, enter your child&apos;s name, email address, and date of birth, and send them an invite. Your child will receive an email with a link to create their account. Once they set up their username and password, their account is automatically linked to yours. You can also reach out to the admin team with any concerns or requests about a youth account you manage.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How does my child accept the invite and set up their account?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">After you send the invite, your child will receive an email from Lethal Bloom Studio with a link to set up their account. The link is valid for 7 days. When they click it, they will see a page pre-filled with the name and details you entered. They just need to choose a username and a password to complete their account. Once they finish, their account will be linked to yours and both of you will receive a confirmation notification. If the invite expires before they accept it, you can send a new one from your account settings.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">What does linking a youth account to a parent account do?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">When a youth account is created through a parent&apos;s invite, the two accounts are automatically connected. This means parental consent is already confirmed when the account is created, so your child can use the platform right away without waiting for a separate approval step. Your child&apos;s account page will show your name as their linked parent or guardian. As the parent, your account will show the linked youth account so you are always aware of who it belongs to.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can youth members use the messaging feature?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">No. Direct messaging is disabled entirely for youth accounts (ages 13–17). Youth members cannot send or receive messages through the platform. This is a deliberate safety measure. If a youth member needs to contact an admin for support, a parent or guardian should reach out using the email or on-site contact options at the top of this page.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can youth members leave or receive feedback on chapters?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Youth members can read and leave feedback on chapters, but only on manuscripts categorized as Young Adult (YA) or Middle Grade (MG). They cannot access manuscripts outside of those categories. Adult members can read youth feedback on YA and MG manuscripts, but cannot directly reply to feedback left by a youth member on those projects, as an additional layer of protection.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can youth members purchase Bloom Coins?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Any Bloom Coin purchase involves a real money transaction and should be made with parental knowledge and consent for users under 18. We recommend that parents review the Pricing page and discuss coin purchases with their child before any transaction is made. Coin purchases are non-refundable.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Can youth members upload manuscripts?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. Youth members can upload manuscripts and chapters the same way any other member can. Bloom Members receive their first 3 chapters free, with additional chapters costing 10 Bloom Coins each. All manuscripts uploaded by youth members are private by default and follow the same access controls as adult accounts — only approved beta readers can view their content. Youth members are encouraged to have a parent or guardian involved when inviting readers to their project.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">Are there any content guidelines youth members must follow when uploading?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">Yes. All members, regardless of age, must follow the platform&apos;s content guidelines when uploading manuscripts and chapters. Youth members should not upload content that contains explicit or adult material. Manuscripts found to be in violation of these guidelines may be removed and the account may be subject to review. When in doubt, keep the content appropriate for a general audience.</p>
                </details>

                <details className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-neutral-200">How do I report a concern about a youth member&apos;s safety?</summary>
                  <p className="mt-2.5 text-sm text-neutral-300 leading-relaxed">If you have any concern about the safety of a young user on the platform, please contact the admin team immediately using the message or email options at the top of this page. Safety concerns involving youth members are handled as the highest priority and will be reviewed promptly.</p>
                </details>

              </div>
            </details>

          </div>
        </section>

      </div>
    </main>
  );
}
