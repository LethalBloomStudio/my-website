import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/referral-correction?scope=lookup_user&q=<username-or-user-id>
export async function GET(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");
  const q = (searchParams.get("q") ?? "").trim();

  if (scope === "lookup_user") {
    if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

    let userId: string | null = null;

    if (UUID_RE.test(q)) {
      userId = q;
    } else {
      const cleanUsername = q.toLowerCase().replace(/^@+/, "");
      const { data: profile } = await supabase
        .from("public_profiles")
        .select("user_id")
        .ilike("username", cleanUsername)
        .maybeSingle();
      userId = (profile as { user_id: string } | null)?.user_id ?? null;
    }

    if (!userId) return NextResponse.json({ referral: null });

    const { data: referralData } = await supabase
      .from("referrals")
      .select([
        "id", "referred_user_id", "referrer_user_id", "referral_username_input",
        "status", "referrer_reward_coins", "referred_reward_coins", "verified_at", "created_at",
        "referred_email_snapshot", "referred_name_snapshot", "referred_username_snapshot", "referred_pen_name_snapshot",
        "referrer_email_snapshot", "referrer_name_snapshot", "referrer_username_snapshot", "referrer_pen_name_snapshot",
        "correction_original_referrer_username", "correction_new_referrer_username",
        "corrected_at", "corrected_by", "correction_coins_awarded",
      ].join(", "))
      .eq("referred_user_id", userId)
      .maybeSingle();

    if (!referralData) return NextResponse.json({ referral: null });

    type RawReferral = {
      id: string;
      referred_user_id: string;
      referrer_user_id: string | null;
      referral_username_input: string;
      status: string;
      referrer_reward_coins: number;
      referred_reward_coins: number;
      verified_at: string | null;
      created_at: string;
      referred_email_snapshot: string | null;
      referred_name_snapshot: string | null;
      referred_username_snapshot: string | null;
      referred_pen_name_snapshot: string | null;
      referrer_email_snapshot: string | null;
      referrer_name_snapshot: string | null;
      referrer_username_snapshot: string | null;
      referrer_pen_name_snapshot: string | null;
      correction_original_referrer_username: string | null;
      correction_new_referrer_username: string | null;
      corrected_at: string | null;
      corrected_by: string | null;
      correction_coins_awarded: number | null;
    };

    const r = referralData as RawReferral;
    const userIds = [r.referred_user_id, ...(r.referrer_user_id ? [r.referrer_user_id] : [])];

    const [{ data: accs }, { data: profiles }] = await Promise.all([
      supabase.from("accounts").select("user_id, full_name, email, referral_access_disabled").in("user_id", userIds),
      supabase.from("public_profiles").select("user_id, username, pen_name").in("user_id", userIds),
    ]);

    const accMap: Record<string, { full_name: string | null; email: string | null; referral_access_disabled: boolean | null }> = {};
    ((accs ?? []) as { user_id: string; full_name: string | null; email: string | null; referral_access_disabled: boolean | null }[])
      .forEach(a => { accMap[a.user_id] = a; });

    const profileMap: Record<string, { username: string | null; pen_name: string | null }> = {};
    ((profiles ?? []) as { user_id: string; username: string | null; pen_name: string | null }[])
      .forEach(p => { profileMap[p.user_id] = { username: p.username, pen_name: p.pen_name }; });

    let correctedByName: string | null = null;
    if (r.corrected_by) {
      const { data: adminAcc } = await supabase.from("accounts").select("full_name").eq("user_id", r.corrected_by).maybeSingle();
      correctedByName = (adminAcc as { full_name: string | null } | null)?.full_name ?? null;
    }

    return NextResponse.json({
      referral: {
        ...r,
        referred_name: accMap[r.referred_user_id]?.full_name ?? r.referred_name_snapshot ?? null,
        referred_email: accMap[r.referred_user_id]?.email ?? r.referred_email_snapshot ?? null,
        referred_username: profileMap[r.referred_user_id]?.username ?? r.referred_username_snapshot ?? null,
        referred_pen_name: profileMap[r.referred_user_id]?.pen_name ?? r.referred_pen_name_snapshot ?? null,
        referred_referral_access_disabled: accMap[r.referred_user_id]?.referral_access_disabled ?? false,
        referrer_name: r.referrer_user_id
          ? (accMap[r.referrer_user_id]?.full_name ?? r.referrer_name_snapshot ?? null)
          : (r.referrer_name_snapshot ?? null),
        referrer_email: r.referrer_user_id
          ? (accMap[r.referrer_user_id]?.email ?? r.referrer_email_snapshot ?? null)
          : (r.referrer_email_snapshot ?? null),
        referrer_username: r.referrer_user_id
          ? (profileMap[r.referrer_user_id]?.username ?? r.referrer_username_snapshot ?? null)
          : (r.referrer_username_snapshot ?? null),
        referrer_pen_name: r.referrer_user_id
          ? (profileMap[r.referrer_user_id]?.pen_name ?? r.referrer_pen_name_snapshot ?? null)
          : (r.referrer_pen_name_snapshot ?? null),
        referrer_referral_access_disabled: r.referrer_user_id
          ? (accMap[r.referrer_user_id]?.referral_access_disabled ?? false)
          : false,
        corrected_by_name: correctedByName,
      },
    });
  }

  return NextResponse.json({ error: "Unknown scope" }, { status: 400 });
}

// POST /api/admin/referral-correction
// Body: { referral_id: string, correct_referrer_username: string }
export async function POST(req: Request) {
  const adminId = await verifyAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const body = await req.json() as { referral_id?: string; correct_referrer_username?: string };

  if (!body.referral_id || !body.correct_referrer_username) {
    return NextResponse.json({ error: "referral_id and correct_referrer_username are required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("apply_referral_correction", {
    p_referral_id: body.referral_id,
    p_correct_referrer_username: body.correct_referrer_username,
    p_admin_id: adminId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type CorrectionResult = {
    ok?: boolean;
    error?: string;
    referrer_username?: string;
    coins_to_referrer?: number;
    coins_to_referred?: number;
    total_coins?: number;
  };

  const result = data as CorrectionResult;
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action: "referral_correction",
    target_type: "referral",
    target_id: body.referral_id,
    new_value: {
      correct_referrer_username: body.correct_referrer_username,
      coins_to_referrer: result.coins_to_referrer,
      coins_to_referred: result.coins_to_referred,
    },
    notes: "Admin applied referral correction",
  });

  return NextResponse.json(result);
}
