import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/Supabase/supabaseServer";
import { isOwnerEmail } from "@/lib/ownerAccess";
import { resolveAppeal, updateMessageFlagStatus } from "./actions";

type Flag = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content_excerpt: string | null;
  triggers: string[] | null;
  consequence: string;
  status: string;
  created_at: string;
};

type Appeal = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  conduct_strikes: number | null;
  blacklisted: boolean | null;
  messaging_suspended_until: string | null;
};

export const dynamic = "force-dynamic";

export default async function ModerationPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/sign-in");
  const { data: ownerAdmin } = await supabase
    .from("owner_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownerAdmin && !isOwnerEmail(user.email)) redirect("/account");

  const [{ data: flags, error: flagsError }, { data: appeals, error: appealsError }] = await Promise.all([
    supabase
      .from("message_moderation_flags")
      .select("id, sender_id, receiver_id, content_excerpt, triggers, consequence, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("accounts")
      .select("user_id, full_name, email, conduct_strikes, blacklisted, messaging_suspended_until")
      .eq("appeal_requested", true)
      .order("updated_at", { ascending: false }),
  ]);

  const error = flagsError?.message || appealsError?.message || params.error || null;
  const moderationFlags = (flags as Flag[] | null) ?? [];
  const appealRows = (appeals as Appeal[] | null) ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Moderation Inbox</h1>

        {params.saved ? (
          <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] p-4 text-sm text-white">
            Saved.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
          <h2 className="text-lg font-semibold">Appeal Requests</h2>
          {appealRows.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-300">No pending appeals.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {appealRows.map((a) => (
                <li key={a.user_id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                  <p className="text-sm text-neutral-100">{a.full_name || a.email || a.user_id}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Strikes: {a.conduct_strikes ?? 0} | {a.blacklisted ? "Blacklisted" : "Not blacklisted"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Suspension:{" "}
                    {a.messaging_suspended_until ? new Date(a.messaging_suspended_until).toLocaleString() : "None"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <form action={resolveAppeal}>
                      <input type="hidden" name="user_id" value={a.user_id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="h-9 rounded-lg border border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] px-3 text-sm text-white hover:bg-[rgba(120,120,120,0.3)]">
                        Approve Appeal
                      </button>
                    </form>
                    <form action={resolveAppeal}>
                      <input type="hidden" name="user_id" value={a.user_id} />
                      <input type="hidden" name="decision" value="deny" />
                      <button className="h-9 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-200 hover:bg-neutral-800">
                        Deny Appeal
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
          <h2 className="text-lg font-semibold">Message Flags</h2>
          {moderationFlags.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-300">No message flags.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {moderationFlags.map((f) => (
                <li key={f.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                  <p className="text-sm text-neutral-100">
                    {new Date(f.created_at).toLocaleString()} | Consequence: {f.consequence}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Sender: {f.sender_id.slice(0, 8)}... | Receiver: {f.receiver_id.slice(0, 8)}...
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">Triggers: {(f.triggers ?? []).join(", ") || "-"}</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-neutral-200">{f.content_excerpt || "-"}</p>
                  <div className="mt-3 flex gap-2">
                    <form action={updateMessageFlagStatus}>
                      <input type="hidden" name="flag_id" value={f.id} />
                      <input type="hidden" name="status" value="reviewed_owner_warning_sent" />
                      <button className="h-9 rounded-lg border border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] px-3 text-sm text-white hover:bg-[rgba(120,120,120,0.3)]">
                        Mark Reviewed
                      </button>
                    </form>
                    <form action={updateMessageFlagStatus}>
                      <input type="hidden" name="flag_id" value={f.id} />
                      <input type="hidden" name="status" value="owner_escalated" />
                      <button className="h-9 rounded-lg border border-neutral-600/80 bg-neutral-800/30 px-3 text-sm text-neutral-100 hover:bg-neutral-800/50">
                        Escalate
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
