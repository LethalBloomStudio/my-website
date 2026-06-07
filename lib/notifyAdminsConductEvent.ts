import type { SupabaseClient } from "@supabase/supabase-js";

type ConductConsequence = "suspended_3_days" | "blacklisted";

type Params = {
  adminClient: SupabaseClient;
  violatorId: string;
  consequence: ConductConsequence;
  strikeNumber: number;
  triggerSource: "copy_attempt" | "feedback" | "discussion";
  manuscriptId: string | null;
  manuscriptTitle?: string | null;
};

export async function notifyAdminsConductEvent({
  adminClient,
  violatorId,
  consequence,
  strikeNumber,
  triggerSource,
  manuscriptId,
  manuscriptTitle,
}: Params): Promise<void> {
  const [{ data: admins }, { data: profile }, { data: acct }] = await Promise.all([
    adminClient.from("accounts").select("user_id").eq("is_admin", true),
    adminClient.from("public_profiles").select("pen_name, username").eq("user_id", violatorId).maybeSingle(),
    adminClient.from("accounts").select("email").eq("user_id", violatorId).maybeSingle(),
  ]);

  const adminIds = ((admins ?? []) as { user_id: string }[]).map(a => a.user_id);
  if (adminIds.length === 0) return;

  const profileRow = profile as { pen_name?: string | null; username?: string | null } | null;
  const userLabel =
    profileRow?.pen_name?.trim() ||
    (profileRow?.username ? `@${profileRow.username}` : null) ||
    (acct as { email?: string | null } | null)?.email ||
    violatorId.slice(0, 8);

  const isBlacklisted = consequence === "blacklisted";

  const triggerLabel =
    triggerSource === "copy_attempt"
      ? "copy-protection violation"
      : triggerSource === "feedback"
      ? "feedback policy violation"
      : "discussion policy violation";

  const manuscriptContext = manuscriptTitle
    ? ` on "${manuscriptTitle}"`
    : manuscriptId
    ? ` (manuscript ${manuscriptId.slice(0, 8)}…)`
    : "";

  const notifTitle = isBlacklisted
    ? "User Blacklisted from Manuscript Reading"
    : "User Suspended from Manuscript Reading (3 days)";

  const notifBody = isBlacklisted
    ? `${userLabel} has been permanently blacklisted from manuscript reading after a ${triggerLabel}${manuscriptContext}.`
    : `${userLabel} has been suspended from manuscript reading for 3 days after a ${triggerLabel}${manuscriptContext}.`;

  await adminClient.from("system_notifications").insert(
    adminIds.map(adminId => ({
      user_id: adminId,
      category: "conduct_alert",
      severity: isBlacklisted ? "critical" : "warning",
      title: notifTitle,
      body: notifBody,
      dedupe_key: `conduct-alert-${violatorId}-strike-${strikeNumber}`,
      metadata: {
        violator_id: violatorId,
        consequence,
        trigger_source: triggerSource,
        manuscript_id: manuscriptId ?? null,
      },
    }))
  );
}
