import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Returns manuscripts, reports, stats, access requests, audit log,
// announcements, feature flags, and moderation notes for the admin dashboard.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const supabase = adminClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data } = await supabase.from("accounts").select("is_admin").eq("user_id", user.id).maybeSingle();
  const acc = data as { is_admin?: boolean } | null;
  return acc?.is_admin ? user.id : null;
}

export async function GET(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "all";

  const result: Record<string, unknown> = {};

  if (scope === "all" || scope === "manuscripts") {
    const { data: msData } = await supabase
      .from("manuscripts")
      .select("id, title, visibility, genre, categories, age_rating, is_featured, admin_hidden, admin_note, created_at, owner_id")
      .order("created_at", { ascending: false });
    const rows = (msData ?? []) as { owner_id: string; [k: string]: unknown }[];
    const ownerIds = [...new Set(rows.map(r => r.owner_id))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("public_profiles").select("user_id, pen_name, username").in("user_id", ownerIds)
      : { data: [] };
    const ownerMap: Record<string, string | null> = {};
    ((owners ?? []) as { user_id: string; pen_name: string | null; username: string | null }[]).forEach(o => {
      ownerMap[o.user_id] = o.pen_name ?? (o.username ? `@${o.username}` : null);
    });
    result.manuscripts = rows.map(r => ({ ...r, owner_name: ownerMap[r.owner_id] ?? null }));
  }

  if (scope === "all" || scope === "reports") {
    const { data: rData } = await supabase
      .from("content_reports")
      .select("id, created_at, reporter_id, target_type, target_id, target_user_id, category, details, evidence_url, status, resolved_at, resolution_note")
      .order("created_at", { ascending: false });
    const rows = (rData ?? []) as { reporter_id: string | null; target_user_id: string | null; [k: string]: unknown }[];
    const ids = [...new Set([...rows.map(r => r.reporter_id), ...rows.map(r => r.target_user_id)].filter(Boolean))] as string[];
    const { data: accs } = ids.length ? await supabase.from("accounts").select("user_id, full_name").in("user_id", ids) : { data: [] };
    const nameMap: Record<string, string | null> = {};
    ((accs ?? []) as { user_id: string; full_name: string | null }[]).forEach(a => { nameMap[a.user_id] = a.full_name; });
    result.reports = rows.map(r => ({
      ...r,
      reporter_name: r.reporter_id ? (nameMap[r.reporter_id] ?? null) : null,
      target_user_name: r.target_user_id ? (nameMap[r.target_user_id] ?? null) : null,
    }));
  }

  if (scope === "all" || scope === "stats") {
    const [usersRes, msRes, reportsRes, flagsRes] = await Promise.all([
      supabase.from("accounts").select(
        "user_id, account_status, created_at, messaging_suspended_until, manuscript_suspended_until, blacklisted, manuscript_blacklisted, lifetime_suspension_count, manuscript_lifetime_suspension_count",
        { count: "exact" }
      ),
      supabase.from("manuscripts").select("id", { count: "exact" }),
      supabase.from("content_reports").select("id", { count: "exact" }).eq("status", "pending"),
      supabase.from("manuscript_moderation_flags").select("id", { count: "exact" }).eq("status", "pending_owner_review"),
    ]);
    type StatUser = {
      account_status: string;
      created_at: string;
      messaging_suspended_until: string | null;
      manuscript_suspended_until: string | null;
      blacklisted: boolean | null;
      manuscript_blacklisted: boolean | null;
      lifetime_suspension_count: number | null;
      manuscript_lifetime_suspension_count: number | null;
    };
    const allUsers = (usersRes.data ?? []) as StatUser[];
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const msgSuspended = allUsers.filter(u => u.messaging_suspended_until && u.messaging_suspended_until > now).length;
    const msSuspended = allUsers.filter(u => u.manuscript_suspended_until && u.manuscript_suspended_until > now).length;
    const msgBlacklisted = allUsers.filter(u => u.blacklisted).length;
    const msBlacklisted = allUsers.filter(u => u.manuscript_blacklisted).length;
    const totalLifetimeSuspensions = allUsers.reduce(
      (sum, u) => sum + (u.lifetime_suspension_count ?? 0) + (u.manuscript_lifetime_suspension_count ?? 0), 0
    );
    result.stats = {
      total_users: usersRes.count ?? 0,
      active_users: allUsers.filter(u => u.account_status === "active").length,
      new_signups_7d: allUsers.filter(u => u.created_at >= sevenDaysAgo).length,
      total_manuscripts: msRes.count ?? 0,
      pending_reports: reportsRes.count ?? 0,
      banned_users: allUsers.filter(u => u.account_status === "banned").length,
      suspended_users: msgSuspended + msSuspended,
      msg_suspended: msgSuspended,
      ms_suspended: msSuspended,
      msg_blacklisted: msgBlacklisted,
      ms_blacklisted: msBlacklisted,
      total_lifetime_suspensions: totalLifetimeSuspensions,
      flagged_content: flagsRes.count ?? 0,
    };
  }

  if (scope === "all" || scope === "requests") {
    const { data: reqData } = await supabase
      .from("read_requests")
      .select("id, requester_id, manuscript_id, status, created_at")
      .order("created_at", { ascending: false });
    const rows = (reqData ?? []) as { requester_id: string; manuscript_id: string; [k: string]: unknown }[];
    const rIds = [...new Set(rows.map(r => r.requester_id))];
    const mIds = [...new Set(rows.map(r => r.manuscript_id))];
    const [{ data: reqAccs }, { data: mss }] = await Promise.all([
      rIds.length ? supabase.from("accounts").select("user_id, full_name").in("user_id", rIds) : { data: [] },
      mIds.length ? supabase.from("manuscripts").select("id, title").in("id", mIds) : { data: [] },
    ]);
    const nameMap: Record<string, string | null> = {};
    ((reqAccs ?? []) as { user_id: string; full_name: string | null }[]).forEach(a => { nameMap[a.user_id] = a.full_name; });
    const titleMap: Record<string, string | null> = {};
    ((mss ?? []) as { id: string; title: string | null }[]).forEach(m => { titleMap[m.id] = m.title; });
    result.accessRequests = rows.map(r => ({
      ...r,
      requester_name: nameMap[r.requester_id] ?? null,
      manuscript_title: titleMap[r.manuscript_id] ?? null,
    }));
  }

  if (scope === "all" || scope === "audit") {
    const { data: auditData } = await supabase
      .from("admin_audit_log")
      .select("id, created_at, admin_id, action, target_type, target_id, old_value, new_value, notes")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (auditData ?? []) as { admin_id: string; [k: string]: unknown }[];
    const adminIds = [...new Set(rows.map(r => r.admin_id))];
    const { data: adminAccs } = adminIds.length ? await supabase.from("accounts").select("user_id, full_name").in("user_id", adminIds) : { data: [] };
    const adminMap: Record<string, string | null> = {};
    ((adminAccs ?? []) as { user_id: string; full_name: string | null }[]).forEach(a => { adminMap[a.user_id] = a.full_name; });
    result.auditLog = rows.map(r => ({ ...r, admin_name: adminMap[r.admin_id] ?? null }));
  }

  if (scope === "transactions") {
    const { data: txData } = await supabase
      .from("bloom_coin_ledger")
      .select("id, user_id, delta, reason, metadata, created_at")
      .eq("reason", "coin_purchase_mock")
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (txData ?? []) as { user_id: string; [k: string]: unknown }[];
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const { data: accs } = userIds.length
      ? await supabase.from("accounts").select("user_id, full_name, email").in("user_id", userIds)
      : { data: [] };
    const { data: profiles } = userIds.length
      ? await supabase.from("public_profiles").select("user_id, username").in("user_id", userIds)
      : { data: [] };
    const accMap: Record<string, { full_name: string | null; email: string | null }> = {};
    ((accs ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).forEach(a => { accMap[a.user_id] = { full_name: a.full_name, email: a.email }; });
    const usernameMap: Record<string, string | null> = {};
    ((profiles ?? []) as { user_id: string; username: string | null }[]).forEach(p => { usernameMap[p.user_id] = p.username; });
    result.transactions = rows.map(r => ({
      ...r,
      full_name: accMap[r.user_id]?.full_name ?? null,
      email: accMap[r.user_id]?.email ?? null,
      username: usernameMap[r.user_id] ?? null,
    }));
  }

  if (scope === "all" || scope === "announcements") {
    const { data } = await supabase.from("admin_announcements").select("id, title, body, is_active, created_at, reward_coins").order("created_at", { ascending: false });
    result.announcements = data ?? [];
  }

  if (scope === "all" || scope === "flags") {
    const { data } = await supabase.from("feature_flags").select("id, name, description, is_enabled, updated_at").order("name");
    result.featureFlags = data ?? [];
  }

  if (scope === "flagged") {
    const [{ data: mf }, { data: mmf }] = await Promise.all([
      supabase.from("manuscript_moderation_flags").select("id, manuscript_id, owner_id, reason, matched_terms, status, created_at").order("created_at", { ascending: false }),
      supabase.from("message_moderation_flags").select("id, content_excerpt, triggers, consequence, status, created_at, sender_id, receiver_id").order("created_at", { ascending: false }),
    ]);
    const mfRows = (mf ?? []) as { id: string; manuscript_id: string; owner_id: string | null; reason: string; matched_terms: string[]; status: string; created_at: string }[];
    const mmfRows = (mmf ?? []) as { id: string; content_excerpt: string; triggers: string[]; consequence: string; status: string; created_at: string; sender_id: string | null; receiver_id: string | null }[];

    // Resolve manuscript titles and owner info
    const msIds = [...new Set(mfRows.map(r => r.manuscript_id))];
    const ownerIds = [...new Set(mfRows.map(r => r.owner_id).filter(Boolean))] as string[];
    const senderIds = [...new Set(mmfRows.map(r => r.sender_id).filter(Boolean))] as string[];
    const allUserIds = [...new Set([...ownerIds, ...senderIds])];

    const [{ data: mss }, { data: flagAccs }, { data: flagProfiles }] = await Promise.all([
      msIds.length ? supabase.from("manuscripts").select("id, title").in("id", msIds) : { data: [] },
      allUserIds.length ? supabase.from("accounts").select("user_id, full_name").in("user_id", allUserIds) : { data: [] },
      allUserIds.length ? supabase.from("public_profiles").select("user_id, username").in("user_id", allUserIds) : { data: [] },
    ]);

    const msMap: Record<string, string | null> = {};
    ((mss ?? []) as { id: string; title: string | null }[]).forEach(m => { msMap[m.id] = m.title; });
    const flagNameMap: Record<string, string | null> = {};
    ((flagAccs ?? []) as { user_id: string; full_name: string | null }[]).forEach(a => { flagNameMap[a.user_id] = a.full_name; });
    const flagUsernameMap: Record<string, string | null> = {};
    ((flagProfiles ?? []) as { user_id: string; username: string | null }[]).forEach(p => { flagUsernameMap[p.user_id] = p.username; });

    result.manuscriptFlags = mfRows.map(r => ({
      ...r,
      title: msMap[r.manuscript_id] ?? null,
      owner_name: r.owner_id ? (flagNameMap[r.owner_id] ?? null) : null,
      owner_username: r.owner_id ? (flagUsernameMap[r.owner_id] ?? null) : null,
    }));
    result.messageFlags = mmfRows.map(r => ({
      ...r,
      sender_name: r.sender_id ? (flagNameMap[r.sender_id] ?? null) : null,
      sender_username: r.sender_id ? (flagUsernameMap[r.sender_id] ?? null) : null,
    }));
  }

  if (scope === "appeals") {
    const { data: apData } = await supabase
      .from("conduct_appeals")
      .select("id, user_id, reason, status, reviewed_by, reviewed_at, admin_note, created_at")
      .order("created_at", { ascending: false });
    const rows = (apData ?? []) as { id: string; user_id: string; reason: string; status: string; reviewed_by: string | null; reviewed_at: string | null; admin_note: string | null; created_at: string }[];

    const userIds = [...new Set(rows.map(r => r.user_id))];
    const reviewerIds = [...new Set(rows.map(r => r.reviewed_by).filter(Boolean))] as string[];
    const allIds = [...new Set([...userIds, ...reviewerIds])];

    const [{ data: accs }, { data: profiles }, { data: accountStatuses }, { data: flagData }, { data: msFlagData }] = await Promise.all([
      allIds.length ? supabase.from("accounts").select("user_id, full_name, email, conduct_strikes, manuscript_conduct_strikes, blacklisted, manuscript_blacklisted, messaging_suspended_until, manuscript_suspended_until, lifetime_suspension_count, manuscript_lifetime_suspension_count").in("user_id", allIds) : { data: [] },
      allIds.length ? supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", allIds) : { data: [] },
      userIds.length ? supabase.from("accounts").select("user_id, conduct_strikes, manuscript_conduct_strikes, blacklisted, manuscript_blacklisted, messaging_suspended_until, manuscript_suspended_until, lifetime_suspension_count, manuscript_lifetime_suspension_count").in("user_id", userIds) : { data: [] },
      userIds.length ? supabase.from("message_moderation_flags").select("id, sender_id, triggers, consequence, content_excerpt, created_at").in("sender_id", userIds).order("created_at", { ascending: false }) : { data: [] },
      userIds.length ? supabase.from("manuscript_moderation_flags").select("id, reader_id, triggers, consequence, content_excerpt, created_at").in("reader_id", userIds).order("created_at", { ascending: false }) : { data: [] },
    ]);

    type AccRow = { user_id: string; full_name: string | null; email: string | null; conduct_strikes: number | null; manuscript_conduct_strikes: number | null; blacklisted: boolean | null; manuscript_blacklisted: boolean | null; messaging_suspended_until: string | null; manuscript_suspended_until: string | null; lifetime_suspension_count: number | null; manuscript_lifetime_suspension_count: number | null };
    type ProfRow = { user_id: string; username: string | null; pen_name: string | null };
    type FlagRow = { id: string; sender_id?: string; reader_id?: string; triggers: string[]; consequence: string; content_excerpt: string | null; created_at: string };
    const accMap: Record<string, AccRow> = {};
    ((accs ?? []) as AccRow[]).forEach(a => { accMap[a.user_id] = a; });
    const profileMap: Record<string, ProfRow> = {};
    ((profiles ?? []) as ProfRow[]).forEach(p => { profileMap[p.user_id] = p; });
    const statusMap: Record<string, AccRow> = {};
    ((accountStatuses ?? []) as AccRow[]).forEach(a => { statusMap[a.user_id] = a; });
    // Group message flags by sender
    const flagMap: Record<string, FlagRow[]> = {};
    ((flagData ?? []) as FlagRow[]).forEach(f => {
      const uid = f.sender_id!;
      if (!flagMap[uid]) flagMap[uid] = [];
      flagMap[uid].push(f);
    });
    // Group manuscript flags by reader
    const msFlagMap: Record<string, FlagRow[]> = {};
    ((msFlagData ?? []) as FlagRow[]).forEach(f => {
      const uid = f.reader_id!;
      if (!msFlagMap[uid]) msFlagMap[uid] = [];
      msFlagMap[uid].push(f);
    });

    result.appeals = rows.map(r => {
      const userFlags = flagMap[r.user_id] ?? [];
      const userMsFlags = msFlagMap[r.user_id] ?? [];
      const triggeringFlag = userFlags.find(f => f.created_at <= r.created_at) ?? userFlags[0] ?? null;
      const triggeringMsFlag = userMsFlags.find(f => f.created_at <= r.created_at) ?? userMsFlags[0] ?? null;
      const st = statusMap[r.user_id];
      return {
        ...r,
        user_name: accMap[r.user_id]?.full_name ?? null,
        user_email: accMap[r.user_id]?.email ?? null,
        user_username: profileMap[r.user_id]?.username ?? null,
        user_pen_name: profileMap[r.user_id]?.pen_name ?? null,
        user_strikes: st?.conduct_strikes ?? null,
        user_ms_strikes: st?.manuscript_conduct_strikes ?? null,
        user_blacklisted: st?.blacklisted ?? null,
        user_ms_blacklisted: st?.manuscript_blacklisted ?? null,
        user_suspended_until: st?.messaging_suspended_until ?? null,
        user_ms_suspended_until: st?.manuscript_suspended_until ?? null,
        user_lifetime_suspensions: (st?.lifetime_suspension_count ?? 0) + (st?.manuscript_lifetime_suspension_count ?? 0),
        reviewer_name: r.reviewed_by ? (accMap[r.reviewed_by]?.full_name ?? null) : null,
        violation_triggers: triggeringFlag?.triggers ?? triggeringMsFlag?.triggers ?? [],
        violation_consequence: triggeringFlag?.consequence ?? triggeringMsFlag?.consequence ?? null,
        violation_excerpt: triggeringFlag?.content_excerpt ?? triggeringMsFlag?.content_excerpt ?? null,
        all_violations: userFlags.map(f => ({ id: f.id, triggers: f.triggers, consequence: f.consequence, content_excerpt: f.content_excerpt, created_at: f.created_at, type: "messaging" as const })),
        all_ms_violations: userMsFlags.map(f => ({ id: f.id, triggers: f.triggers, consequence: f.consequence, content_excerpt: f.content_excerpt, created_at: f.created_at, type: "manuscript" as const })),
      };
    });
  }

  if (scope === "parent_reports") {
    const { data: prData } = await supabase
      .from("parent_reports")
      .select("id, parent_user_id, youth_user_id, reported_user_id, reason, status, admin_note, cleared_at, auto_restored, created_at")
      .order("created_at", { ascending: false });

    const prRows = (prData ?? []) as {
      id: string; parent_user_id: string; youth_user_id: string; reported_user_id: string;
      reason: string; status: string; admin_note: string | null; cleared_at: string | null;
      auto_restored: boolean; created_at: string;
    }[];

    const allPrIds = [...new Set([
      ...prRows.map(r => r.parent_user_id),
      ...prRows.map(r => r.youth_user_id),
      ...prRows.map(r => r.reported_user_id),
    ])];

    const { data: prProfiles } = allPrIds.length
      ? await supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", allPrIds)
      : { data: [] };

    const prProfMap: Record<string, { username: string | null; pen_name: string | null }> = {};
    ((prProfiles ?? []) as { user_id: string; username: string | null; pen_name: string | null }[])
      .forEach(p => { prProfMap[p.user_id] = { username: p.username, pen_name: p.pen_name }; });

    const displayName = (uid: string) =>
      prProfMap[uid]?.pen_name?.trim() || (prProfMap[uid]?.username ? `@${prProfMap[uid].username}` : uid);

    result.parentReports = prRows.map(r => ({
      ...r,
      parent_name: displayName(r.parent_user_id),
      youth_name: displayName(r.youth_user_id),
      reported_name: displayName(r.reported_user_id),
    }));

    // Also fetch parent-report appeals
    const { data: praData } = await supabase
      .from("parent_report_appeals")
      .select("id, report_id, user_id, reason, status, admin_note, created_at")
      .order("created_at", { ascending: false });
    result.parentReportAppeals = praData ?? [];
  }

  if (scope === "deleted") {
    const { data } = await supabase
      .from("deleted_accounts")
      .select("id, user_id, email_snapshot, full_name_snapshot, username_snapshot, pen_name_snapshot, age_category, subscription_status, bloom_coins, reason, deleted_at")
      .order("deleted_at", { ascending: false });
    result.deletedAccounts = data ?? [];
  }

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  // Handle admin actions (update user, update manuscript, etc.)
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const body = await req.json() as {
    action: string;
    table: string;
    id_column: string;
    id_value: string;
    updates: Record<string, unknown>;
  };

  const { error } = await supabase
    .from(body.table)
    .update(body.updates)
    .eq(body.id_column, body.id_value);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
