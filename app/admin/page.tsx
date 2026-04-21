"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_status: string;
  is_admin: boolean;
  created_at: string;
  bloom_coins: number;
  subscription_status: string;
  status_reason: string | null;
  messaging_restricted: boolean;
  username: string | null;
  pen_name: string | null;
  last_active_at: string | null;
  age_category: string | null;
  parental_consent: boolean;
  conduct_strikes: number;
  lifetime_suspension_count: number;
  messaging_suspended_until: string | null;
  blacklisted: boolean;
  manuscript_conduct_strikes: number;
  manuscript_lifetime_suspension_count: number;
  manuscript_suspended_until: string | null;
  manuscript_blacklisted: boolean;
  active_promotion_id: string | null;
  promotion_expires_at: string | null;
};

type Promotion = {
  id: string;
  name: string;
  description: string | null;
  benefit: string;
  duration_days: number;
  applies_to: string;
  bonus_coins: number;
  max_users: number | null;
  status: string;
  enrolled_count: number;
  created_at: string;
  ended_at: string | null;
};

type Manuscript = {
  id: string;
  title: string | null;
  visibility: string;
  genre: string | null;
  categories: string[] | null;
  age_rating: string | null;
  is_featured: boolean;
  admin_hidden: boolean;
  admin_note: string | null;
  created_at: string;
  owner_id: string;
  owner_name: string | null;
};

type Report = {
  id: string;
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  target_type: string;
  target_id: string;
  target_user_id: string | null;
  target_user_name: string | null;
  category: string;
  details: string | null;
  evidence_url: string | null;
  status: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

type AuditEntry = {
  id: string;
  created_at: string;
  admin_id: string;
  admin_name: string | null;
  action: string;
  target_type: string;
  target_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  notes: string | null;
};

type PurchaseTransaction = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  delta: number;
  reason: string;
  metadata: { package_id?: string; price_cents?: number; currency?: string; announcement_id?: string; manuscript_id?: string; [k: string]: unknown } | null;
  created_at: string;
};

type ModNote = {
  id: string;
  created_at: string;
  admin_name: string | null;
  target_type: string;
  target_id: string;
  note: string;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
  reward_coins: number | null;
};

type FeatureFlag = {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  updated_at: string;
};

type Stats = {
  total_users: number;
  active_users: number;
  new_signups_7d: number;
  total_manuscripts: number;
  pending_reports: number;
  banned_users: number;
  suspended_users: number;
  msg_suspended: number;
  ms_suspended: number;
  msg_blacklisted: number;
  ms_blacklisted: number;
  total_lifetime_suspensions: number;
  flagged_content: number;
  total_referrals: number;
  verified_referrals: number;
  referrals_7d: number;
  heard_about_counts: Record<string, number>;
};

type ReferralEntry = {
  id: string;
  referred_user_id: string;
  referrer_user_id: string | null;
  referral_username_input: string;
  status: string;
  referrer_reward_coins: number;
  referred_reward_coins: number;
  verified_at: string | null;
  created_at: string;
  referred_name: string | null;
  referred_email: string | null;
  referred_username: string | null;
  referred_pen_name: string | null;
  referrer_name: string | null;
  referrer_email: string | null;
  referrer_username: string | null;
  referrer_pen_name: string | null;
  referred_referral_access_disabled: boolean;
  referrer_referral_access_disabled: boolean;
};

type ConductAppeal = {
  id: string;
  user_id: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_username: string | null;
  user_pen_name: string | null;
  user_strikes: number | null;
  user_ms_strikes: number | null;
  user_blacklisted: boolean | null;
  user_ms_blacklisted: boolean | null;
  user_suspended_until: string | null;
  user_ms_suspended_until: string | null;
  user_lifetime_suspensions: number;
  reviewer_name: string | null;
  violation_triggers: string[];
  violation_consequence: string | null;
  violation_excerpt: string | null;
  all_violations: { id: string; triggers: string[]; consequence: string; content_excerpt: string | null; created_at: string; type: "messaging" }[];
  all_ms_violations: { id: string; triggers: string[]; consequence: string; content_excerpt: string | null; created_at: string; type: "manuscript" }[];
};

type BillingEvent = {
  id: string;
  user_id: string | null;
  stripe_invoice_id: string;
  stripe_subscription_id: string | null;
  amount_cents: number;
  currency: string;
  billing_reason: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
};

type DeletedAccount = {
  id: string;
  user_id: string;
  email_snapshot: string | null;
  full_name_snapshot: string | null;
  username_snapshot: string | null;
  pen_name_snapshot: string | null;
  age_category: string | null;
  subscription_status: string | null;
  bloom_coins: number | null;
  reason: string;
  deleted_at: string;
};

type ParentReport = {
  id: string;
  parent_user_id: string;
  youth_user_id: string;
  reported_user_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  cleared_at: string | null;
  auto_restored: boolean;
  created_at: string;
  parent_name: string;
  youth_name: string;
  reported_name: string;
};

type ParentReportAppeal = {
  id: string;
  report_id: string | null;
  user_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

type Tab = "overview" | "users" | "content" | "reports" | "requests" | "flags" | "announcements" | "feature_flags" | "audit" | "transactions" | "referrals" | "appeals" | "deleted" | "parent_reports" | "feedback" | "promotions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _REPORT_CATEGORIES = [
  "Harassment",
  "Plagiarism",
  "Spam",
  "Abusive feedback",
  "Explicit content violation",
  "Hate speech",
  "Impersonation",
  "Other",
] as const;

function Badge({ label, color }: { label: string; color: "red" | "amber" | "green" | "neutral" | "blue" | "violet" }) {
  const cls = {
    red: "bg-red-900/40 text-red-400 badge-red",
    amber: "bg-amber-900/40 text-amber-400",
    green: "bg-emerald-900/40 text-emerald-400",
    neutral: "bg-neutral-800 text-neutral-400",
    blue: "bg-blue-900/40 text-blue-400",
    violet: "bg-violet-900/40 text-violet-400 badge-violet",
  }[color];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function statusColor(s: string): "red" | "amber" | "green" | "neutral" {
  if (s === "active") return "green";
  if (s === "suspended") return "amber";
  if (s === "banned") return "red";
  return "neutral";
}

function formatLastActive(ts: string | null): { label: string; color: string } {
  if (!ts) return { label: "Never", color: "text-neutral-600" };
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days === 0) return { label: "Today", color: "text-emerald-400" };
  if (days === 1) return { label: "Yesterday", color: "text-emerald-500" };
  if (days <= 7) return { label: `${days}d ago`, color: "text-emerald-600" };
  if (days <= 30) return { label: `${days}d ago`, color: "text-neutral-400" };
  if (days <= 90) return { label: `${days}d ago`, color: "text-amber-500" };
  return { label: `${days}d ago`, color: "text-red-500" };
}

function ageLabel(cat: string | null): string {
  if (cat === "youth_13_17") return "Youth (13–17)";
  if (cat === "adult_18_plus") return "Adult (18+)";
  return "Unknown";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PromoCountdown({ createdAt, durationDays, status }: { createdAt: string; durationDays: number; status: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const expiresAt = new Date(createdAt).getTime() + durationDays * 24 * 60 * 60 * 1000;
  const msLeft = expiresAt - now;

  if (msLeft <= 0) {
    return <span className="text-[10px] text-neutral-500">Enrollment period ended</span>;
  }

  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));

  const label = daysLeft > 0
    ? `${daysLeft}d ${hoursLeft}h remaining`
    : hoursLeft > 0
      ? `${hoursLeft}h ${minsLeft}m remaining`
      : `${minsLeft}m remaining`;

  const color = status === "paused" ? "text-amber-400" : daysLeft < 1 ? "text-red-400" : "text-emerald-400";

  return <span className={`text-[10px] font-medium ${color}`}>⏱ {label}</span>;
}

export default function AdminPage() {
  return <Suspense><AdminPageInner /></Suspense>;
}

function AdminPageInner() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    const valid: Tab[] = ["overview","users","content","reports","requests","flags","announcements","feature_flags","audit","transactions","referrals","appeals","deleted","parent_reports","feedback","promotions"];
    return valid.includes(t as Tab) ? (t as Tab) : "overview";
  });

  // Data
  const [users, setUsers] = useState<UserRow[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [transactions, setTransactions] = useState<PurchaseTransaction[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [appeals, setAppeals] = useState<ConductAppeal[]>([]);
  const [modNotes, setModNotes] = useState<ModNote[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [deletedAccounts, setDeletedAccounts] = useState<DeletedAccount[]>([]);
  const [parentReports, setParentReports] = useState<ParentReport[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<{ id: string; user_id: string | null; username: string | null; suggestions: string[]; custom_text: string | null; created_at: string }[]>([]);
  const [parentReportAppeals, setParentReportAppeals] = useState<ParentReportAppeal[]>([]);
  const [prClearModal, setPrClearModal] = useState<ParentReport | null>(null);
  const [prClearNote, setPrClearNote] = useState("");
  const [prClearLoading, setPrClearLoading] = useState(false);
  const [accessRequests, setAccessRequests] = useState<{ id: string; requester_name: string | null; manuscript_title: string | null; status: string; created_at: string }[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoName, setPromoName] = useState("");
  const [promoDesc, setPromoDesc] = useState("");
  const [promoDays, setPromoDays] = useState<number>(14);
  const [promoCustomDays, setPromoCustomDays] = useState("");
  const [promoBenefit, setPromoBenefit] = useState<"lethal_access" | "coins_only">("lethal_access");
  const [promoAppliesTo, setPromoAppliesTo] = useState<"new_signups" | "all_free" | "both" | "all_users">("new_signups");
  const [promoBonusCoins, setPromoBonusCoins] = useState(0);
  const [promoMaxUsers, setPromoMaxUsers] = useState<number | null>(null);
  const [promoCreating, setPromoCreating] = useState(false);

  // UI state
  const [msg, setMsg] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "admin" | "youth" | "adult" | "banned">("all");
  const [contentSearch, setContentSearch] = useState("");
  const [reportFilter, setReportFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [selectedManuscript, setSelectedManuscript] = useState<Manuscript | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [coinInput, setCoinInput] = useState("");
  const [coinConfirm, setCoinConfirm] = useState<{ userId: string; oldBalance: number; newBalance: number } | null>(null);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annRewardCoins, setAnnRewardCoins] = useState<0 | 5 | 10 | 25 | 50 | 75 | 100>(0);
  const [annConfirmOpen, setAnnConfirmOpen] = useState(false);
  const [editingManuscript, setEditingManuscript] = useState<Partial<Manuscript> | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { router.replace("/sign-in"); return; }

      const { data: acc } = await supabase.from("accounts").select("is_admin, full_name").eq("user_id", uid).maybeSingle();
      const a = acc as { is_admin?: boolean; full_name?: string | null } | null;
      if (!a?.is_admin) { router.replace("/"); return; }

      setAdminId(uid);
      setAdminName(a.full_name ?? null);
      await loadAll(uid);
      if (searchParams.get("tab") === "appeals") void loadAppeals();
      setLoading(false);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: runs once on mount; loadAll/loadAppeals are component functions, not reactive deps
  }, []);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function adminFetch(path: string, opts?: RequestInit) {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch(path, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return res.json();
  }

  function handleTabSelect(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "transactions" && transactions.length === 0) void loadTransactions();
    if (nextTab === "referrals" && referrals.length === 0) void loadReferrals();
    if (nextTab === "appeals") void loadAppeals();
    if (nextTab === "deleted") void loadDeletedAccounts();
    if (nextTab === "parent_reports") void loadParentReports();
    if (nextTab === "feedback") void loadFeedback();
    if (nextTab === "promotions") void loadPromotions();
  }

  async function loadAll(_uid?: string) {
    const data = await adminFetch("/api/admin/data?scope=all") as {
      manuscripts?: Manuscript[];
      reports?: Report[];
      stats?: Stats;
      accessRequests?: { id: string; requester_name: string | null; manuscript_title: string | null; status: string; created_at: string }[];
      auditLog?: AuditEntry[];
      announcements?: Announcement[];
      featureFlags?: FeatureFlag[];
      referrals?: ReferralEntry[];
    } | null;
    if (!data) return;
    if (data.manuscripts) setManuscripts(data.manuscripts);
    if (data.reports) setReports(data.reports);
    if (data.stats) setStats(data.stats);
    if (data.accessRequests) setAccessRequests(data.accessRequests);
    if (data.auditLog) setAuditLog(data.auditLog);
    if (data.announcements) setAnnouncements(data.announcements);
    if (data.featureFlags) setFeatureFlags(data.featureFlags);
    if (data.referrals) setReferrals(data.referrals);
    await loadUsers();
  }

  // ─── Audit helper ──────────────────────────────────────────────────────────

  async function audit(action: string, targetType: string, targetId: string, oldVal?: unknown, newVal?: unknown, notes?: string) {
    await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "audit", action, target_type: targetType, target_id: targetId, old_value: oldVal, new_value: newVal, notes }),
    });
  }

  async function adminUpdate(table: string, idCol: string, idVal: string, updates: Record<string, unknown>) {
    return adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "update", table, id_column: idCol, id_value: idVal, updates }),
    });
  }

  async function adminDelete(table: string, col: string, val: string) {
    return adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "delete", delete_table: table, delete_column: col, delete_value: val }),
    });
  }

  async function _adminInsert(table: string, row: Record<string, unknown>) {
    return adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "insert", insert_table: table, insert_row: row }),
    });
  }

  // ─── Loaders ───────────────────────────────────────────────────────────────

  async function loadUsers() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const users = (await res.json()) as UserRow[];
    setUsers(users);
  }

  async function loadManuscripts() {
    const data = await adminFetch("/api/admin/data?scope=manuscripts") as { manuscripts?: Manuscript[] } | null;
    if (data?.manuscripts) setManuscripts(data.manuscripts);
  }

  async function loadReports() {
    const data = await adminFetch("/api/admin/data?scope=reports") as { reports?: Report[] } | null;
    if (data?.reports) setReports(data.reports);
  }

  async function _loadAuditLog(_uid?: string | null) {
    const data = await adminFetch("/api/admin/data?scope=audit") as { auditLog?: AuditEntry[] } | null;
    if (data?.auditLog) setAuditLog(data.auditLog);
  }

  async function loadTransactions() {
    const data = await adminFetch("/api/admin/data?scope=transactions") as { transactions?: PurchaseTransaction[] } | null;
    if (data?.transactions) setTransactions(data.transactions);
    if ((data as { billingEvents?: BillingEvent[] } | null)?.billingEvents) setBillingEvents((data as { billingEvents?: BillingEvent[] }).billingEvents!);
  }

  async function loadReferrals() {
    const data = await adminFetch("/api/admin/data?scope=referrals") as { referrals?: ReferralEntry[] } | null;
    if (data?.referrals) setReferrals(data.referrals);
  }

  async function loadAppeals() {
    const data = await adminFetch("/api/admin/data?scope=appeals") as { appeals?: ConductAppeal[] } | null;
    if (data?.appeals) setAppeals(data.appeals);
  }

  async function loadAnnouncements() {
    const data = await adminFetch("/api/admin/data?scope=announcements") as { announcements?: Announcement[] } | null;
    if (data?.announcements) setAnnouncements(data.announcements);
  }

  async function loadFeatureFlags() {
    const data = await adminFetch("/api/admin/data?scope=flags") as { featureFlags?: FeatureFlag[] } | null;
    if (data?.featureFlags) setFeatureFlags(data.featureFlags);
  }

  async function _loadStats() {
    const data = await adminFetch("/api/admin/data?scope=stats") as { stats?: Stats } | null;
    if (data?.stats) setStats(data.stats);
  }

  async function loadAccessRequests() {
    const data = await adminFetch("/api/admin/data?scope=requests") as { accessRequests?: { id: string; requester_name: string | null; manuscript_title: string | null; status: string; created_at: string }[] } | null;
    if (data?.accessRequests) setAccessRequests(data.accessRequests);
  }

  async function loadDeletedAccounts() {
    const data = await adminFetch("/api/admin/data?scope=deleted") as { deletedAccounts?: DeletedAccount[] } | null;
    if (data?.deletedAccounts) setDeletedAccounts(data.deletedAccounts);
  }

  async function loadParentReports() {
    const data = await adminFetch("/api/admin/data?scope=parent_reports") as { parentReports?: ParentReport[]; parentReportAppeals?: ParentReportAppeal[] } | null;
    if (data?.parentReports) setParentReports(data.parentReports);
    if (data?.parentReportAppeals) setParentReportAppeals(data.parentReportAppeals);
  }

  async function loadFeedback() {
    const data = await adminFetch("/api/feedback") as { feedback?: { id: string; user_id: string | null; username: string | null; suggestions: string[]; custom_text: string | null; created_at: string }[] } | null;
    if (data?.feedback) setFeedbackEntries(data.feedback);
  }

  async function loadPromotions() {
    const data = await adminFetch("/api/admin/promotions") as { promotions?: Promotion[] } | null;
    if (data?.promotions) setPromotions(data.promotions);
  }

  async function createPromotion() {
    const days = promoDays === 0 ? Number(promoCustomDays) : promoDays;
    if (!promoName.trim()) { setMsg("Promotion name is required."); return; }
    if (promoBenefit === "lethal_access" && (!days || days < 1)) { setMsg("Enter a valid duration."); return; }
    if (promoBenefit === "coins_only" && promoBonusCoins < 1) { setMsg("Coins-only promotions require a bonus coin amount."); return; }
    setPromoCreating(true);
    const data = await adminFetch("/api/admin/promotions", {
      method: "POST",
      body: JSON.stringify({
        name: promoName.trim(),
        description: promoDesc.trim() || undefined,
        benefit: promoBenefit,
        duration_days: promoBenefit === "coins_only" ? 1 : days,
        applies_to: promoAppliesTo,
        bonus_coins: promoBonusCoins,
        max_users: promoMaxUsers,
      }),
    }) as { promotion?: Promotion; error?: string } | null;
    setPromoCreating(false);
    if (data?.promotion) {
      setPromotions((prev) => [data.promotion!, ...prev]);
      setPromoName(""); setPromoDesc(""); setPromoDays(14); setPromoCustomDays("");
      setPromoBenefit("lethal_access"); setPromoAppliesTo("new_signups"); setPromoBonusCoins(0); setPromoMaxUsers(null);
      setMsg("Promotion created.");
    } else {
      setMsg(data?.error ?? "Failed to create promotion.");
    }
  }

  async function applyPromoToAll(id: string) {
    setPromoLoading(true);
    const data = await adminFetch("/api/admin/promotions/apply", {
      method: "POST",
      body: JSON.stringify({ promotion_id: id }),
    }) as { ok?: boolean; applied?: number; message?: string; error?: string } | null;
    setPromoLoading(false);
    if (data?.ok) {
      setMsg(data.message ?? `Applied to ${data.applied ?? 0} users.`);
      void loadPromotions();
      void loadUsers();
    } else {
      setMsg(data?.error ?? "Failed to apply promotion.");
    }
  }

  async function managePromotion(id: string, action: "pause" | "resume" | "end" | "delete") {
    const data = await adminFetch("/api/admin/promotions/manage", {
      method: "POST",
      body: JSON.stringify({ promotion_id: id, action }),
    }) as { ok?: boolean; error?: string } | null;
    if (data?.ok) {
      void loadPromotions();
      void loadUsers();
      setMsg(`Promotion ${action}ed.`);
    } else {
      setMsg(data?.error ?? "Action failed.");
    }
  }

  async function clearParentReport() {
    if (!prClearModal) return;
    setPrClearLoading(true);
    const res = await adminFetch("/api/admin/clear-parent-report", {
      method: "POST",
      body: JSON.stringify({ report_id: prClearModal.id, admin_note: prClearNote.trim() || undefined }),
    }) as { ok?: boolean; auto_restored?: boolean } | null;
    setPrClearLoading(false);
    setPrClearModal(null);
    setPrClearNote("");
    if (res?.ok) {
      setMsg(res.auto_restored ? "Report cleared - access automatically restored." : "Report cleared. User has a pending appeal; access not auto-restored.");
      void loadParentReports();
    } else {
      setMsg("Failed to clear report.");
    }
  }

  // ─── User actions ──────────────────────────────────────────────────────────

  async function applyUserAction() {
    if (!selectedUser || !actionType) return;
    setActionLoading(true);
    const u = selectedUser;

    if (actionType === "reset_strikes") {
      await adminUpdate("accounts", "user_id", u.user_id, {
        conduct_strikes: 0,
        lifetime_suspension_count: 0,
        messaging_suspended_until: null,
        blacklisted: false,
        manuscript_conduct_strikes: 0,
        manuscript_lifetime_suspension_count: 0,
        manuscript_suspended_until: null,
        manuscript_blacklisted: false,
        has_unacknowledged_violation: false,
      });
      await audit("reset_suspension_totals", "user", u.user_id, {
        conduct_strikes: u.conduct_strikes,
        lifetime_suspension_count: u.lifetime_suspension_count,
        manuscript_conduct_strikes: u.manuscript_conduct_strikes,
        manuscript_lifetime_suspension_count: u.manuscript_lifetime_suspension_count,
      }, { conduct_strikes: 0, lifetime_suspension_count: 0, manuscript_conduct_strikes: 0, manuscript_lifetime_suspension_count: 0 }, actionReason ?? undefined);
    } else if (actionType === "delete") {
      const token = await getToken();
      const delRes = await fetch("/api/admin/action", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "delete_user", user_id: u.user_id }),
      });
      if (!delRes.ok) {
        const body = await delRes.json() as { error?: string };
        setMsg(`Delete failed: ${body.error ?? "Unknown error"}`);
        setActionLoading(false);
        return;
      }
      await audit("delete_user", "user", u.user_id, { email: u.email }, null, actionReason);
    } else if (actionType === "reset_username") {
      await adminUpdate("public_profiles", "user_id", u.user_id, { username: null });
      await audit("reset_username", "user", u.user_id, { username: u.username }, { username: null }, actionReason);
    } else if (actionType === "restrict_messaging") {
      const val = !u.messaging_restricted;
      await adminUpdate("accounts", "user_id", u.user_id, { messaging_restricted: val });
      await audit(val ? "restrict_messaging" : "unrestrict_messaging", "user", u.user_id, null, null, actionReason);
    } else if (actionType === "toggle_age_group") {
      const newCat = u.age_category === "youth_13_17" ? "adult_18_plus" : "youth_13_17";
      await adminUpdate("accounts", "user_id", u.user_id, { age_category: newCat });
      await audit("change_age_group", "user", u.user_id, { age_category: u.age_category }, { age_category: newCat }, undefined);
    } else if (actionType === "toggle_admin") {
      const val = !u.is_admin;
      await adminUpdate("accounts", "user_id", u.user_id, { is_admin: val });
      await audit(val ? "grant_admin" : "revoke_admin", "user", u.user_id, { is_admin: u.is_admin }, { is_admin: val }, actionReason);
      // Auto-friend the newly promoted admin with all users
      if (val) {
        await adminFetch("/api/admin/seed-friendships", {
          method: "POST",
          body: JSON.stringify({ admin_id: u.user_id }),
        });
      }
    } else {
      const newStatus = actionType === "suspend" ? "suspended" : actionType === "ban" ? "banned" : "active";
      await adminUpdate("accounts", "user_id", u.user_id, { account_status: newStatus, status_reason: actionReason || null, status_updated_at: new Date().toISOString() });
      await audit(`set_status_${newStatus}`, "user", u.user_id, { account_status: u.account_status }, { account_status: newStatus }, actionReason);
    }

    await loadUsers();
    setSelectedUser(null);
    setActionType(null);
    setActionReason("");
    setActionLoading(false);
    setMsg("Action applied successfully.");
  }

  async function applyCoinsChange() {
    if (!coinConfirm) return;
    setActionLoading(true);
    const { userId, oldBalance, newBalance } = coinConfirm;
    await adminUpdate("accounts", "user_id", userId, { bloom_coins: newBalance });
    await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({
        type: "ledger_insert",
        user_id: userId,
        delta: newBalance - oldBalance,
        reason: "admin_adjustment",
        metadata: { old_balance: oldBalance, new_balance: newBalance },
      }),
    });
    await audit("adjust_coins", "user", userId, { bloom_coins: oldBalance }, { bloom_coins: newBalance }, actionReason || undefined);
    setCoinConfirm(null);
    setCoinInput("");
    setActionType(null);
    setActionReason("");
    await loadUsers();
    setActionLoading(false);
    setMsg("Coin balance updated.");
  }

  async function addModNote(targetType: string, targetId: string) {
    if (!newNote.trim()) return;
    const result = await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "mod_note", target_type: targetType, target_id: targetId, notes: newNote.trim() }),
    }) as (ModNote & { admin_name: string | null }) | null;
    if (result) {
      setModNotes(prev => [{ ...result, admin_name: adminName }, ...prev]);
    }
    setNewNote("");
  }

  async function loadModNotes(targetId: string) {
    const rows = await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "load_mod_notes", target_id: targetId }),
    }) as ModNote[] | null;
    setModNotes(rows ?? []);
  }

  // ─── Manuscript actions ────────────────────────────────────────────────────

  async function applyManuscriptAction() {
    if (!selectedManuscript || !actionType) return;
    setActionLoading(true);
    const m = selectedManuscript;

    if (actionType === "hide") {
      await adminUpdate("manuscripts", "id", m.id, { admin_hidden: true, admin_note: actionReason || null });
      await audit("hide_manuscript", "manuscript", m.id, { admin_hidden: false }, { admin_hidden: true }, actionReason);
    } else if (actionType === "unhide") {
      await adminUpdate("manuscripts", "id", m.id, { admin_hidden: false });
      await audit("unhide_manuscript", "manuscript", m.id, { admin_hidden: true }, { admin_hidden: false }, actionReason);
    } else if (actionType === "feature") {
      await adminUpdate("manuscripts", "id", m.id, { is_featured: !m.is_featured });
      await audit(m.is_featured ? "unfeature_manuscript" : "feature_manuscript", "manuscript", m.id, null, null, undefined);
    } else if (actionType === "set_visibility") {
      await adminUpdate("manuscripts", "id", m.id, { visibility: actionReason });
      await audit("set_visibility", "manuscript", m.id, { visibility: m.visibility }, { visibility: actionReason }, undefined);
    } else if (actionType === "edit_meta" && editingManuscript) {
      const updates: Record<string, unknown> = {};
      if (editingManuscript.title !== undefined) updates.title = editingManuscript.title;
      if (editingManuscript.genre !== undefined) updates.genre = editingManuscript.genre;
      if (editingManuscript.age_rating !== undefined) updates.age_rating = editingManuscript.age_rating;
      await adminUpdate("manuscripts", "id", m.id, updates);
      await audit("edit_metadata", "manuscript", m.id, { title: m.title, genre: m.genre }, updates, undefined);
    }

    await loadManuscripts();
    setSelectedManuscript(null);
    setActionType(null);
    setActionReason("");
    setEditingManuscript(null);
    setActionLoading(false);
    setMsg("Manuscript updated.");
  }

  // ─── Report actions ────────────────────────────────────────────────────────

  async function resolveReport(r: Report, resolved: boolean) {
    await adminUpdate("content_reports", "id", r.id, {
      status: resolved ? "resolved" : "pending",
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? adminId : null,
      resolution_note: actionReason || null,
    });
    await audit(resolved ? "resolve_report" : "reopen_report", "report", r.id, { status: r.status }, { status: resolved ? "resolved" : "pending" }, actionReason);
    await loadReports();
    setSelectedReport(null);
    setActionReason("");
    setMsg("Report updated.");
  }

  // ─── Feature flags ─────────────────────────────────────────────────────────

  async function toggleFlag(flag: FeatureFlag) {
    await adminUpdate("feature_flags", "id", flag.id, { is_enabled: !flag.is_enabled, updated_at: new Date().toISOString(), updated_by: adminId });
    await audit(flag.is_enabled ? "disable_feature_flag" : "enable_feature_flag", "feature_flag", flag.name, { is_enabled: flag.is_enabled }, { is_enabled: !flag.is_enabled }, undefined);
    await loadFeatureFlags();
  }

  // ─── Announcement actions ──────────────────────────────────────────────────

  async function postAnnouncement() {
    if (!annTitle.trim() || !annBody.trim() || !adminId) return;
    // If coins are attached, show confirmation first
    if (annRewardCoins > 0 && !annConfirmOpen) {
      setAnnConfirmOpen(true);
      return;
    }
    setAnnConfirmOpen(false);
    await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({
        type: "announcement",
        admin_id: adminId,
        title: annTitle.trim(),
        body: annBody.trim(),
        reward_coins: annRewardCoins > 0 ? annRewardCoins : null,
      }),
    });
    await audit("post_announcement", "announcement", annTitle.trim(), null, { title: annTitle.trim(), reward_coins: annRewardCoins || null }, undefined);
    setAnnTitle(""); setAnnBody(""); setAnnRewardCoins(0);
    await loadAnnouncements();
    setMsg(`Announcement posted and notifications sent to all users${annRewardCoins > 0 ? ` with ${annRewardCoins} Bloom Coin reward` : ""}.`);
  }

  // ─── Filtered data ─────────────────────────────────────────────────────────

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    if (q && !u.email?.toLowerCase().includes(q) && !u.full_name?.toLowerCase().includes(q) && !u.username?.toLowerCase().includes(q) && !u.pen_name?.toLowerCase().includes(q)) return false;
    if (userFilter === "admin" && !u.is_admin) return false;
    if (userFilter === "youth" && u.age_category !== "youth_13_17") return false;
    if (userFilter === "adult" && u.age_category !== "adult_18_plus") return false;
    if (userFilter === "banned" && u.account_status !== "banned") return false;
    return true;
  });

  const filteredManuscripts = manuscripts.filter(m => {
    const q = contentSearch.toLowerCase();
    return !q || m.title?.toLowerCase().includes(q) || m.owner_name?.toLowerCase().includes(q) || m.genre?.toLowerCase().includes(q);
  });

  const filteredReports = reports.filter(r => reportFilter === "all" ? true : r.status === reportFilter);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <p className="text-neutral-400 text-sm">Loading admin dashboard…</p>
    </main>
  );

  const pendingAppealsCount = appeals.filter(a => a.status === "pending").length;
  const pendingParentReportsCount = parentReports.filter(r => r.status === "pending").length;
  const TAB_ICONS: Record<Tab, React.ReactNode> = {
    overview: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    users: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    content: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    reports: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
    requests: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
    flags: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    announcements: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    feature_flags: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3" fill="currentColor" stroke="none"/></svg>,
    audit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    transactions: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    referrals: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"/><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"/></svg>,
    appeals: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 6l3 8H0l3-8z"/><path d="M15 6l3 8H12l3-8z"/></svg>,
    deleted: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    parent_reports: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    feedback: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    promotions: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "content", label: "Manuscripts" },
    { id: "reports", label: `Reports${reports.filter(r => r.status === "pending").length ? ` (${reports.filter(r => r.status === "pending").length})` : ""}` },
    { id: "requests", label: "Access Requests" },
    { id: "flags", label: `Flagged${stats?.flagged_content ? ` (${stats.flagged_content})` : ""}` },
    { id: "announcements", label: "Announcements" },
    { id: "feature_flags", label: "Feature Flags" },
    { id: "audit", label: "Audit Log" },
    { id: "transactions", label: "Transactions" },
    { id: "referrals", label: "Referrals" },
    { id: "appeals", label: "Appeals", badge: pendingAppealsCount || undefined },
    { id: "deleted", label: "Deleted Accounts" },
    { id: "parent_reports", label: "Parent Reports", badge: pendingParentReportsCount || undefined },
    { id: "feedback", label: "User Feedback" },
    { id: "promotions", label: "Promotions" },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-[1700px] px-4 py-10 sm:px-6">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setNavOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm font-medium text-neutral-200 transition hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            {navOpen ? "Collapse Navigation" : "Expand Navigation"}
          </button>
          <span className="rounded-lg bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">Admin</span>
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        </div>

        {msg && (
          <div className="mb-5 rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-4 text-sm text-neutral-200 flex justify-between">
            {msg}
            <button onClick={() => setMsg(null)} className="text-neutral-500 hover:text-white">✕</button>
          </div>
        )}

        <div className="flex items-start gap-4 lg:gap-6">
          <aside className={`sticky top-6 shrink-0 rounded-2xl border border-[rgba(120,120,120,0.28)] bg-[rgba(18,18,18,0.96)] p-2 transition-[width] duration-200 ${navOpen ? "w-64" : "w-16"}`}>
            <div className={`mb-2 flex items-center ${navOpen ? "justify-between" : "justify-center"}`}>
              {navOpen ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Navigation</p>
                  <p className="mt-1 text-[11px] text-neutral-400">Admin sections</p>
                </div>
              ) : null}
              <button
                onClick={() => setNavOpen((open) => !open)}
                aria-label={navOpen ? "Collapse navigation" : "Expand navigation"}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(120,120,120,0.28)] bg-[rgba(120,120,120,0.08)] text-neutral-300 transition hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {navOpen ? (
                    <>
                      <line x1="15" y1="6" x2="9" y2="12" />
                      <line x1="15" y1="18" x2="9" y2="12" />
                    </>
                  ) : (
                    <>
                      <line x1="9" y1="6" x2="15" y2="12" />
                      <line x1="9" y1="18" x2="15" y2="12" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-1 overflow-y-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTabSelect(t.id)}
                  title={!navOpen ? t.label : undefined}
                  className={`relative flex w-full items-center rounded-xl border text-left text-sm font-medium transition ${navOpen ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"} ${tab === t.id ? "border-[rgba(120,120,120,0.78)] bg-[rgba(120,120,120,0.22)] text-white" : "border-[rgba(120,120,120,0.26)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.48)] hover:text-white"}`}
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-[rgba(120,120,120,0.16)] bg-[rgba(120,120,120,0.08)] text-neutral-200">
                    {TAB_ICONS[t.id]}
                  </span>
                  {navOpen ? <span className="pr-8">{t.label}</span> : null}
                  {t.badge ? (
                    <span className={`absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white ${navOpen ? "right-3 top-2.5" : "right-0.5 top-0.5"}`}>
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1 [&_.overflow-x-auto]:overflow-visible [&_table]:w-full [&_table]:table-fixed [&_th]:align-top [&_td]:align-top [&_th]:break-words [&_td]:break-words [&_td.whitespace-nowrap]:whitespace-normal [&_th.whitespace-nowrap]:whitespace-normal">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && stats && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Users", value: stats.total_users },
                { label: "Active Users", value: stats.active_users },
                { label: "New (7 days)", value: stats.new_signups_7d },
                { label: "Manuscripts", value: stats.total_manuscripts },
                { label: "Pending Reports", value: stats.pending_reports, warn: stats.pending_reports > 0 },
                { label: "Banned", value: stats.banned_users, warn: stats.banned_users > 0 },
                { label: "Flagged Content", value: stats.flagged_content, warn: stats.flagged_content > 0 },
                { label: "Lifetime Suspensions", value: stats.total_lifetime_suspensions },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-4 ${s.warn ? "border-amber-700/40 bg-amber-900/10" : "border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.9)]"}`}>
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">{s.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${s.warn ? "text-amber-400" : "text-white"}`}>{s.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Active suspension breakdown */}
            <div className="mb-8 rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.9)] p-5">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Active Suspensions &amp; Blacklists</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Messaging Suspended", value: stats.msg_suspended, color: "amber" },
                  { label: "Manuscript Suspended", value: stats.ms_suspended, color: "amber" },
                  { label: "Messaging Blacklisted", value: stats.msg_blacklisted, color: "red" },
                  { label: "Manuscript Blacklisted", value: stats.ms_blacklisted, color: "red" },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-xs text-neutral-500 mb-0.5">{s.label}</p>
                    <p className={`text-xl font-bold ${s.value > 0 ? (s.color === "red" ? "text-red-400" : "text-amber-400") : "text-neutral-600"}`}>
                      {s.value.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8 rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.9)] p-5">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Referral Program</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Total Referral Attempts", value: stats.total_referrals, color: "text-neutral-100" },
                  { label: "Verified Referrals", value: stats.verified_referrals, color: "text-emerald-300" },
                  { label: "Verified (7 days)", value: stats.referrals_7d, color: "text-amber-300" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-4 py-3">
                    <p className="text-xs text-neutral-500">{item.label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${item.color}`}>{item.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8 rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.9)] p-5">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">How Users Heard About Us</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "TikTok", key: "tiktok", color: "text-white" },
                  { label: "Threads", key: "threads", color: "text-white" },
                  { label: "Facebook", key: "facebook", color: "text-white" },
                  { label: "Instagram", key: "instagram", color: "text-white" },
                  { label: "Referral", key: "referral", color: "text-emerald-300" },
                  { label: "Unknown", key: "unknown", color: "text-neutral-400" },
                ].map((item) => (
                  <div key={item.key} className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-4 py-3">
                    <p className="text-xs text-neutral-500">{item.label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${item.color}`}>{(stats.heard_about_counts?.[item.key] ?? 0).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-neutral-600">Stats refresh on page load. Use the tabs above to take action.</p>

            <div className="mt-6 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-5">
              <h2 className="text-sm font-semibold text-neutral-100 mb-1">Admin Friend Backfill</h2>
              <p className="text-xs text-neutral-500 mb-4">Ensure all existing users are automatically friended with all admin profiles. Safe to run multiple times.</p>
              <button
                onClick={async () => {
                  const data = await adminFetch("/api/admin/seed-friendships");
                  if (data) setMsg(`Admin friendships seeded successfully.`);
                }}
                className="rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.12)] px-4 py-2 text-sm text-neutral-200 hover:text-white hover:bg-[rgba(120,120,120,0.22)] transition"
              >
                Run Backfill
              </button>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === "users" && (
          <div>
            <input type="text" placeholder="Search by name, email, username, or pen name…" value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)]" />

            <div className="mb-4 flex flex-wrap gap-2">
              {(["all", "admin", "youth", "adult", "banned"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setUserFilter(f)}
                  className={`h-8 rounded-lg border px-3 text-xs font-medium capitalize transition ${
                    userFilter === f
                      ? f === "banned" ? "border-red-700/70 bg-red-950/40 text-red-300"
                        : f === "admin" ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-300"
                        : f === "youth" ? "border-blue-700/70 bg-blue-950/40 text-blue-300"
                        : f === "adult" ? "border-neutral-500/70 bg-neutral-800/60 text-neutral-200"
                        : "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] text-white"
                      : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-400 hover:border-[rgba(120,120,120,0.5)] hover:text-neutral-200"
                  }`}
                >
                  {f === "all" ? "All Users" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Age Group</th>
                    <th className="px-4 py-3">Last Active</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Coins</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-neutral-500">No users found.</td></tr>}
                  {filteredUsers.map(u => (
                    <tr key={u.user_id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {u.username ? (
                            <Link href={`/u/${u.username}`} target="_blank" className="font-medium text-neutral-100 hover:text-white hover:underline">
                              {u.full_name || u.username}
                            </Link>
                          ) : (
                            <span className="font-medium text-neutral-100">{u.full_name || "-"}</span>
                          )}
                          {u.pen_name && <span className="text-xs text-neutral-400">&ldquo;{u.pen_name}&rdquo;</span>}
                          {u.username && <span className="text-xs text-neutral-500">@{u.username}</span>}
                          {u.is_admin && <span className="text-[10px] font-bold text-red-400 uppercase">Admin</span>}
                          {u.messaging_restricted && <span className="text-[10px] text-amber-400">Messaging restricted</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-xs">{u.email || "-"}</td>
                      <td className="px-4 py-3"><Badge label={u.account_status} color={statusColor(u.account_status)} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-medium ${u.age_category === "youth_13_17" ? "text-blue-400" : "text-neutral-300"}`}>
                            {ageLabel(u.age_category)}
                          </span>
                          {u.age_category === "youth_13_17" && (
                            <span className={`text-[10px] ${u.parental_consent ? "text-emerald-500" : "text-amber-500"}`}>
                              {u.parental_consent ? "Consent ✓" : "No consent"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => { const la = formatLastActive(u.last_active_at); return <span className={`text-xs ${la.color}`}>{la.label}</span>; })()}
                      </td>
                      <td className="px-4 py-3">{(() => {
                        const onPromo = u.active_promotion_id && u.promotion_expires_at && new Date(u.promotion_expires_at) > new Date();
                        if (u.subscription_status === "lethal") return <Badge label="lethal" color="red" />;
                        if (onPromo) return <Badge label="promotion" color="amber" />;
                        return <Badge label={u.subscription_status} color="violet" />;
                      })()}</td>
                      <td className="px-4 py-3 text-neutral-300 text-xs">{u.bloom_coins.toLocaleString()}</td>
                      <td className="px-4 py-3 text-neutral-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.username && (
                            <Link href={`/u/${u.username}`} target="_blank"
                              className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] px-2.5 py-1 text-xs text-neutral-400 hover:text-white transition">
                              Profile ↗
                            </Link>
                          )}
                          <button onClick={() => { setSelectedUser(u); setActionType(null); setActionReason(""); setNewNote(""); void loadModNotes(u.user_id); }}
                            className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-xs text-neutral-300 hover:text-white transition">
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-600">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}</p>
          </div>
        )}

        {/* ── CONTENT ── */}
        {tab === "content" && (
          <div>
            <input type="text" placeholder="Search by title, author, or genre…" value={contentSearch}
              onChange={e => setContentSearch(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)]" />

            <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Author</th>
                    <th className="px-4 py-3">Visibility</th>
                    <th className="px-4 py-3">Genre</th>
                    <th className="px-4 py-3">Flags</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredManuscripts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No manuscripts found.</td></tr>}
                  {filteredManuscripts.map(m => (
                    <tr key={m.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                      <td className="px-4 py-3">
                        <Link href={`/manuscripts/${m.id}`} target="_blank" className="font-medium text-neutral-100 hover:underline">
                          {m.title || "Untitled"}
                        </Link>
                        {m.is_featured && <span className="ml-2 text-[10px] text-amber-400 font-semibold">★ Featured</span>}
                        {m.admin_hidden && <span className="ml-2 text-[10px] text-red-400">Hidden</span>}
                      </td>
                      <td className="px-4 py-3 text-neutral-400 text-xs">{m.owner_name || "-"}</td>
                      <td className="px-4 py-3"><Badge label={m.visibility} color={m.visibility === "public" ? "green" : "neutral"} /></td>
                      <td className="px-4 py-3 text-neutral-400 text-xs">{m.genre || "-"}</td>
                      <td className="px-4 py-3">
                        {m.admin_note && <span className="text-xs text-amber-400" title={m.admin_note}>⚑ Note</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/manuscripts/${m.id}`} target="_blank"
                            className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] px-2.5 py-1 text-xs text-neutral-400 hover:text-white transition">
                            View ↗
                          </Link>
                          <button onClick={() => { setSelectedManuscript(m); setActionType(null); setActionReason(""); setEditingManuscript({ title: m.title, genre: m.genre, age_rating: m.age_rating }); void loadModNotes(m.id); }}
                            className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-xs text-neutral-300 hover:text-white transition">
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPORTS ── */}
        {tab === "reports" && (
          <div>
            <div className="flex gap-2 mb-5">
              {(["pending", "resolved", "all"] as const).map(f => (
                <button key={f} onClick={() => setReportFilter(f)}
                  className={`h-8 rounded-lg border px-3 text-xs font-medium transition ${reportFilter === f ? "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] text-white" : "border-[rgba(120,120,120,0.3)] bg-transparent text-neutral-400 hover:text-white"}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredReports.length === 0 && <p className="text-sm text-neutral-500">No reports.</p>}
              {filteredReports.map(r => (
                <div key={r.id} className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge label={r.status} color={r.status === "pending" ? "amber" : "green"} />
                        <Badge label={r.category} color="neutral" />
                        <Badge label={r.target_type} color="blue" />
                      </div>
                      <p className="text-sm text-neutral-100">Reported by: <span className="font-medium">{r.reporter_name || "Anonymous"}</span></p>
                      {r.target_user_name && <p className="text-xs text-neutral-400">Target user: {r.target_user_name}</p>}
                      <p className="text-xs text-neutral-400">Target ID: <code className="text-neutral-300">{r.target_id}</code></p>
                      {r.details && <p className="mt-1 text-sm text-neutral-300">{r.details}</p>}
                      {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">View evidence</a>}
                      <p className="mt-1 text-xs text-neutral-600">{new Date(r.created_at).toLocaleString()}</p>
                      {r.resolution_note && <p className="mt-1 text-xs text-emerald-400">Resolution: {r.resolution_note}</p>}
                    </div>
                    <button onClick={() => { setSelectedReport(r); setActionReason(""); }}
                      className="shrink-0 rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-xs text-neutral-300 hover:text-white transition">
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACCESS REQUESTS ── */}
        {tab === "requests" && (
          <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Manuscript</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {accessRequests.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No access requests.</td></tr>}
                {accessRequests.map(r => (
                  <tr key={r.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                    <td className="px-4 py-3 text-neutral-200">{r.requester_name || "-"}</td>
                    <td className="px-4 py-3 text-neutral-400">{r.manuscript_title || "-"}</td>
                    <td className="px-4 py-3"><Badge label={r.status} color={r.status === "approved" ? "green" : r.status === "pending" ? "amber" : "neutral"} /></td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && (
                        <button onClick={async () => {
                          await adminUpdate("manuscript_access_requests", "id", r.id, { status: "closed" });
                          await audit("close_access_request", "access_request", r.id, { status: "pending" }, { status: "closed" }, "Admin closed abandoned request");
                          await loadAccessRequests();
                        }} className="rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:text-red-400 hover:border-red-700/50 transition">
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── FLAGGED CONTENT ── */}
        {tab === "flags" && (
          <FlaggedContentTab adminFetch={adminFetch} onAudit={audit} onMsg={setMsg} />
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {tab === "announcements" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.95)] p-5">
              <h2 className="text-sm font-semibold text-neutral-100 mb-4">Post Site-Wide Announcement</h2>
              <div className="space-y-3">
                <input type="text" placeholder="Title" value={annTitle} onChange={e => setAnnTitle(e.target.value)}
                  className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)]" />
                <textarea placeholder="Body…" value={annBody} onChange={e => setAnnBody(e.target.value)} rows={4}
                  className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)] resize-none" />

                {/* Bloom Coin reward selector */}
                <div>
                  <p className="text-xs text-neutral-400 mb-2">Attach Bloom Coin reward <span className="text-neutral-600">(optional - admin sends from unlimited pool)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {([0, 5, 10, 25, 50, 75, 100] as const).map(amt => (
                      <button key={amt} type="button"
                        onClick={() => setAnnRewardCoins(amt)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${annRewardCoins === amt ? "border-amber-500 bg-amber-900/30 text-amber-300" : "border-[rgba(120,120,120,0.4)] bg-neutral-900/40 text-neutral-400 hover:text-neutral-200"}`}>
                        {amt === 0 ? "No reward" : <><span style={{ color: "#f59e0b" }}>✿</span> {amt}</>}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={() => void postAnnouncement()} disabled={!annTitle.trim() || !annBody.trim()}
                  className="btn-success h-9 rounded-lg border px-5 text-sm font-medium text-white disabled:opacity-40">
                  {annRewardCoins > 0 ? `Post with ✿ ${annRewardCoins} Coin Reward` : "Post Announcement"}
                </button>
              </div>

              {/* Confirmation modal for coin rewards */}
              {annConfirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                  <div className="w-full max-w-sm rounded-xl border border-amber-700/50 bg-neutral-950 p-6 shadow-2xl">
                    <h3 className="text-base font-semibold text-white mb-2">Confirm Coin Reward</h3>
                    <p className="text-sm text-neutral-300 mb-1">You are about to post an announcement with a <span className="text-amber-300 font-semibold"><span style={{ color: "#f59e0b" }}>✿</span> {annRewardCoins} Bloom Coin</span> reward claimable by every user.</p>
                    <p className="text-xs text-neutral-500 mb-5">Coins are distributed from the admin pool - no balance is deducted from your account.</p>
                    <div className="flex gap-3">
                      <button onClick={() => void postAnnouncement()}
                        className="flex-1 h-9 rounded-lg border border-amber-600 bg-amber-900/40 text-sm font-medium text-amber-200 hover:bg-amber-900/60 transition">
                        Confirm & Post
                      </button>
                      <button onClick={() => setAnnConfirmOpen(false)}
                        className="flex-1 h-9 rounded-lg border border-neutral-700 bg-neutral-900/60 text-sm text-neutral-300 hover:bg-neutral-800 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {announcements.map(a => (
              <div key={a.id} className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex gap-2 mb-1">
                      {(() => {
                        const hasCoin = (a.reward_coins ?? 0) > 0;
                        const expired = hasCoin && Date.now() > new Date(a.created_at).getTime() + 7 * 24 * 60 * 60 * 1000;
                        if (expired) return <Badge label="Expired" color="amber" />;
                        return <Badge label={a.is_active ? "Live" : "Hidden"} color={a.is_active ? "green" : "neutral"} />;
                      })()}
                      <span className="text-xs text-neutral-500">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="font-semibold text-neutral-100">{a.title}</p>
                    <p className="mt-1 text-sm text-neutral-400 whitespace-pre-wrap">{a.body}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={async () => { await adminUpdate("admin_announcements", "id", a.id, { is_active: !a.is_active }); await loadAnnouncements(); }}
                      className="rounded-lg border border-[rgba(120,120,120,0.4)] px-2.5 py-1 text-xs text-neutral-300 hover:text-white transition">
                      {a.is_active ? "Hide" : "Show"}
                    </button>
                    <button onClick={async () => { await adminDelete("admin_announcements", "id", a.id); await loadAnnouncements(); }}
                      className="rounded-lg border border-red-700/50 bg-red-900/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/40 transition">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FEATURE FLAGS ── */}
        {tab === "feature_flags" && (
          <div className="space-y-3">
            {featureFlags.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] px-5 py-4">
                <div>
                  <p className="font-medium text-neutral-100">{f.name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                  {f.description && <p className="text-xs text-neutral-500 mt-0.5">{f.description}</p>}
                  <p className="text-xs text-neutral-600 mt-0.5">Updated {new Date(f.updated_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => void toggleFlag(f)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors ${f.is_enabled ? "border-emerald-600 bg-emerald-600" : "border-neutral-600 bg-neutral-800"}`}>
                  <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${f.is_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {tab === "audit" && (
          <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No audit entries yet.</td></tr>}
                {auditLog.map(e => (
                  <tr key={e.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                    <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-neutral-300 text-xs">{e.admin_name || e.admin_id.slice(0, 8)}</td>
                    <td className="px-4 py-3"><code className="text-xs text-amber-400">{e.action}</code></td>
                    <td className="px-4 py-3 text-neutral-400 text-xs"><span className="text-neutral-500">{e.target_type}/</span>{e.target_id.slice(0, 12)}{e.target_id.length > 12 ? "…" : ""}</td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">{e.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab === "transactions" && (() => {
          const REASON_LABELS: Record<string, string> = {
            coin_purchase:          "Stripe Purchase",
            coin_purchase_mock:     "Mock Purchase",
            announcement_reward:    "Announcement Reward",
            chapter_feedback_reward:"Chapter Feedback Reward",
            giveaway_win:           "Giveaway Win",
            parent_gift:            "Parent Gift",
            featured_slot:          "Featured Slot",
            extra_reader_slot:      "Extra Reader Slot",
            admin_adjust:           "Admin Adjustment",
            admin_adjustment:       "Admin Adjustment",
            referral_referrer_bonus:"Referral Reward",
            referral_signup_bonus:  "Referral Signup Bonus",
          };
          const PACKAGE_LABELS: Record<string, string> = {
            starter_100: "Bloom Pack (100)",
            writer_350:  "Forge Pack (350)",
            studio_600:  "Lethal Pack (600)",
          };
          const earned = transactions.filter(t => t.delta > 0);
          const spent  = transactions.filter(t => t.delta < 0);
          const totalCoinRevenue = transactions.reduce((sum, t) => sum + (t.metadata?.price_cents ?? 0), 0);
          const totalSubRevenue  = billingEvents.reduce((sum, b) => sum + b.amount_cents, 0);
          const totalEarned  = earned.reduce((sum, t) => sum + t.delta, 0);
          const totalSpent   = spent.reduce((sum, t) => sum + Math.abs(t.delta), 0);

          const BILLING_REASON_LABELS: Record<string, string> = {
            subscription_create: "New Subscription",
            subscription_cycle:  "Monthly Renewal",
            subscription_update: "Plan Change",
            manual:              "Manual Charge",
          };

          return (
            <div>
              <div className="mb-4 flex flex-wrap gap-4">
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Coin Events</p>
                  <p className="mt-0.5 text-xl font-semibold text-white">{transactions.length.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Coin Pack Revenue</p>
                  <p className="mt-0.5 text-xl font-semibold text-emerald-300">${(totalCoinRevenue / 100).toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Subscription Revenue</p>
                  <p className="mt-0.5 text-xl font-semibold text-emerald-300">${(totalSubRevenue / 100).toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Total Revenue</p>
                  <p className="mt-0.5 text-xl font-semibold text-emerald-400">${((totalCoinRevenue + totalSubRevenue) / 100).toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Coins Issued</p>
                  <p className="mt-0.5 text-xl font-semibold text-amber-300">+{totalEarned.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Coins Spent</p>
                  <p className="mt-0.5 text-xl font-semibold text-red-400">-{totalSpent.toLocaleString()}</p>
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Detail</th>
                      <th className="px-4 py-3">Coins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No transactions yet.</td></tr>
                    )}
                    {transactions.map(tx => {
                      const isEarned = tx.delta > 0;
                      const label = REASON_LABELS[tx.reason] ?? tx.reason;
                      const detail = tx.metadata?.package_id
                        ? PACKAGE_LABELS[tx.metadata.package_id as string] ?? tx.metadata.package_id
                        : tx.metadata?.price_cents
                          ? `$${((tx.metadata.price_cents as number) / 100).toFixed(2)}`
                          : "-";
                      return (
                        <tr key={tx.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                          <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-neutral-100">{tx.full_name || tx.username || "-"}</p>
                            {tx.email && <p className="text-xs text-neutral-500">{tx.email}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-300 whitespace-nowrap">{label}</td>
                          <td className="px-4 py-3 text-xs text-neutral-400">{detail}</td>
                          <td className={`px-4 py-3 text-sm font-semibold ${isEarned ? "text-amber-300" : "text-red-400"}`}>
                            {isEarned ? "+" : ""}{tx.delta.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {transactions.length > 0 && (
                <p className="mt-2 text-xs text-neutral-400">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
              )}

              {/* ── Subscription Billing ── */}
              <div className="mt-8 mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Subscription Billing</h3>
                <button
                  onClick={async () => {
                    const res = await adminFetch("/api/admin/backfill-billing", { method: "POST" }) as { inserted?: number; skipped?: number } | null;
                    if (res) { setMsg(`Backfill complete: ${res.inserted ?? 0} inserted, ${res.skipped ?? 0} already existed.`); void loadTransactions(); }
                  }}
                  className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition"
                >
                  Backfill from Stripe
                </button>
              </div>
              <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingEvents.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-500">No subscription charges recorded yet. They will appear here after the next renewal.</td></tr>
                    )}
                    {billingEvents.map(b => (
                      <tr key={b.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                        <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-neutral-100">{b.full_name || b.username || "-"}</p>
                          {b.email && <p className="text-xs text-neutral-500">{b.email}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-300 whitespace-nowrap">
                          {BILLING_REASON_LABELS[b.billing_reason ?? ""] ?? b.billing_reason ?? "Subscription Charge"}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-400">
                          {b.period_start && b.period_end
                            ? `${new Date(b.period_start).toLocaleDateString()} – ${new Date(b.period_end).toLocaleDateString()}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-300">
                          ${(b.amount_cents / 100).toFixed(2)} {b.currency.toUpperCase()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {billingEvents.length > 0 && (
                <p className="mt-2 text-xs text-neutral-400">{billingEvents.length} billing event{billingEvents.length !== 1 ? "s" : ""}</p>
              )}
            </div>
          );
        })()}

        {/* ── APPEALS ── */}
        {tab === "referrals" && (() => {
          const verifiedCount = referrals.filter((r) => r.status === "verified").length;
          const invalidCount = referrals.length - verifiedCount;
          const referralUsageCount = referrals.reduce<Record<string, number>>((acc, r) => {
            const key = r.referrer_user_id ?? r.referrer_username ?? r.referrer_email ?? r.referral_username_input;
            if (!key) return acc;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <div>
              <div className="mb-4 flex flex-wrap gap-4">
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Referral Records</p>
                  <p className="mt-0.5 text-xl font-semibold text-white">{referrals.length.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Verified</p>
                  <p className="mt-0.5 text-xl font-semibold text-emerald-300">{verifiedCount.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-3">
                  <p className="text-xs text-neutral-500">Invalid</p>
                  <p className="mt-0.5 text-xl font-semibold text-red-300">{invalidCount.toLocaleString()}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Referred User</th>
                      <th className="px-4 py-3">Referrer</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reward</th>
                      <th className="px-4 py-3">Referral Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No referrals yet.</td></tr>
                    )}
                    {referrals.map((ref) => {
                      const referredLabel = ref.referred_pen_name || ref.referred_name || (ref.referred_username ? `@${ref.referred_username}` : ref.referred_user_id);
                      const referrerLabel = ref.referrer_pen_name || ref.referrer_name || (ref.referrer_username ? `@${ref.referrer_username}` : (ref.referrer_user_id ?? `@${ref.referral_username_input}`));
                      const referrerCountKey = ref.referrer_user_id ?? ref.referrer_username ?? ref.referrer_email ?? ref.referral_username_input;
                      const referrerCount = referrerCountKey ? (referralUsageCount[referrerCountKey] ?? 0) : 0;
                      return (
                        <tr key={ref.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                          <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(ref.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-neutral-100">{referredLabel}</p>
                            {ref.referred_email && <p className="text-xs text-neutral-500">{ref.referred_email}</p>}
                            {ref.referred_user_id ? (
                              <button
                                onClick={async () => {
                                  const disable = !ref.referred_referral_access_disabled;
                                  const ok = await adminUpdate("accounts", "user_id", ref.referred_user_id, { referral_access_disabled: disable });
                                  if (ok) {
                                    setMsg(disable ? "Referred user referral access disabled." : "Referred user referral access enabled.");
                                    await audit(
                                      disable ? "disable_referral_access" : "enable_referral_access",
                                      "user",
                                      ref.referred_user_id,
                                      { referral_access_disabled: !disable },
                                      { referral_access_disabled: disable }
                                    );
                                    await loadReferrals();
                                  } else {
                                    setMsg("Failed to update referred user referral access.");
                                  }
                                }}
                                className={`mt-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                                  ref.referred_referral_access_disabled
                                    ? "border-emerald-700/40 bg-emerald-950/10 text-emerald-300 hover:bg-emerald-950/30"
                                    : "border-red-700/40 bg-red-950/10 text-red-300 hover:bg-red-950/30"
                                }`}
                              >
                                {ref.referred_referral_access_disabled ? "Enable User" : "Disable User"}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-neutral-100">{referrerLabel}</p>
                            <p className="text-xs text-neutral-500">{ref.referrer_email ?? `input: @${ref.referral_username_input}`}</p>
                            <p className="mt-1 text-[11px] text-amber-300">Used {referrerCount.toLocaleString()} time{referrerCount === 1 ? "" : "s"}</p>
                          </td>
                          <td className="px-4 py-3">
                            {ref.status === "verified" ? (
                              <Badge label="Verified" color="green" />
                            ) : ref.status === "blocked" ? (
                              <Badge label="Blocked" color="red" />
                            ) : ref.status === "invalid_self" ? (
                              <Badge label="Invalid Self" color="amber" />
                            ) : (
                              <Badge label="Invalid Referrer" color="red" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-300">
                            {ref.status === "verified"
                              ? `${ref.referrer_reward_coins} to referrer / ${ref.referred_reward_coins} to signup`
                              : "No coins awarded"}
                          </td>
                          <td className="px-4 py-3">
                            {ref.referrer_user_id ? (
                              <button
                                onClick={async () => {
                                  const disable = !ref.referrer_referral_access_disabled;
                                  const ok = await adminUpdate("accounts", "user_id", ref.referrer_user_id!, { referral_access_disabled: disable });
                                  if (ok) {
                                    setMsg(disable ? "Referrer referral access disabled." : "Referrer referral access enabled.");
                                    await audit(
                                      disable ? "disable_referral_access" : "enable_referral_access",
                                      "user",
                                      ref.referrer_user_id!,
                                      { referral_access_disabled: !disable },
                                      { referral_access_disabled: disable }
                                    );
                                    await loadReferrals();
                                  } else {
                                    setMsg("Failed to update referrer referral access.");
                                  }
                                }}
                                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                                  ref.referrer_referral_access_disabled
                                    ? "border-emerald-700/40 bg-emerald-950/10 text-emerald-300 hover:bg-emerald-950/30"
                                    : "border-red-700/40 bg-red-950/10 text-red-300 hover:bg-red-950/30"
                                }`}
                              >
                                {ref.referrer_referral_access_disabled ? "Enable Referrer" : "Disable Referrer"}
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-500">No live referrer account</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {tab === "appeals" && (
          <AppealsTab
            appeals={appeals}
            adminFetch={adminFetch}
            onAudit={audit}
            onMsg={setMsg}
            onRefresh={loadAppeals}
          />
        )}

        {/* ── DELETED ACCOUNTS ── */}
        {tab === "deleted" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-100">Deleted Accounts</h2>
              <button
                onClick={() => void loadDeletedAccounts()}
                className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition"
              >
                Refresh
              </button>
            </div>

            {deletedAccounts.length === 0 ? (
              <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] p-8 text-center text-sm text-neutral-500">
                No deleted accounts on record.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.95)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                      <th className="px-4 py-3">Deleted</th>
                      <th className="px-4 py-3">Name / Email</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Age</th>
                      <th className="px-4 py-3">Subscription</th>
                      <th className="px-4 py-3">Coins</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedAccounts.map((d) => (
                      <tr key={d.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                        <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                          {new Date(d.deleted_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-neutral-100">{d.full_name_snapshot ?? "-"}</p>
                          {d.email_snapshot && <p className="text-xs text-neutral-500">{d.email_snapshot}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400">
                          {d.username_snapshot ? `@${d.username_snapshot}` : "-"}
                          {d.pen_name_snapshot && (
                            <p className="text-xs text-neutral-600">{d.pen_name_snapshot}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400">{ageLabel(d.age_category)}</td>
                        <td className="px-4 py-3 text-sm text-neutral-400 capitalize">{d.subscription_status ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-neutral-400">{d.bloom_coins?.toLocaleString() ?? "0"}</td>
                        <td className="px-4 py-3 text-sm text-neutral-300 max-w-xs">{d.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PARENT REPORTS ── */}
        {tab === "parent_reports" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-100">Parent Reports</h2>
              <button
                onClick={() => void loadParentReports()}
                className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition"
              >
                Refresh
              </button>
            </div>

            {parentReports.length === 0 ? (
              <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] p-8 text-center text-sm text-neutral-500">
                No parent reports on record.
              </div>
            ) : (
              <div className="space-y-3">
                {parentReports.map((r) => {
                  const appeal = parentReportAppeals.find(a => a.report_id === r.id);
                  return (
                    <div key={r.id} className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.95)] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {r.status === "pending" && <Badge label="Pending" color="amber" />}
                            {r.status === "cleared" && <Badge label={r.auto_restored ? "Cleared - Restored" : "Cleared - Appealing"} color={r.auto_restored ? "green" : "neutral"} />}
                            <span className="text-xs text-neutral-500">{new Date(r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-3">
                            <div>
                              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-0.5">Reporting Parent</p>
                              <p className="text-neutral-200">{r.parent_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-0.5">Linked Youth</p>
                              <p className="text-neutral-200">{r.youth_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-0.5">Reported User</p>
                              <p className="text-neutral-200">{r.reported_name}</p>
                            </div>
                          </div>
                          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Reason</p>
                          <p className="text-sm text-neutral-300 mb-2">{r.reason}</p>
                          {r.admin_note && (
                            <p className="text-xs text-neutral-500 italic">Admin note: {r.admin_note}</p>
                          )}
                          {appeal && (
                            <div className="mt-3 rounded-lg border border-blue-800/40 bg-blue-950/20 p-3">
                              <p className="text-xs font-semibold text-blue-400 mb-1">
                                Appeal from reported user{appeal.status === "pending" ? " - Pending Review" : ` - ${appeal.status}`}
                              </p>
                              <p className="text-sm text-neutral-300">{appeal.reason}</p>
                              {appeal.admin_note && <p className="text-xs text-neutral-500 mt-1 italic">{appeal.admin_note}</p>}
                            </div>
                          )}
                        </div>
                        {r.status === "pending" && (
                          <button
                            onClick={() => { setPrClearModal(r); setPrClearNote(""); }}
                            className="shrink-0 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900/40 transition"
                          >
                            Clear Report
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {prClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-1">Clear Parent Report</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Reported user: <span className="text-neutral-200">{prClearModal.reported_name}</span>
              {" · "}
              Reason: <span className="text-neutral-200">{prClearModal.reason}</span>
            </p>
            {parentReportAppeals.some(a => a.report_id === prClearModal.id && a.status === "pending") && (
              <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/15 p-3 text-xs text-amber-400">
                This user has a pending appeal. Clearing will NOT auto-restore access - they must resolve their appeal first.
              </div>
            )}
            <textarea
              value={prClearNote}
              onChange={e => setPrClearNote(e.target.value)}
              placeholder="Optional admin note..."
              rows={3}
              className="w-full rounded-lg border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-[rgba(120,120,120,0.6)] mb-4 resize-none"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPrClearModal(null)} className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-4 py-2 text-sm text-neutral-400 hover:text-white transition">
                Cancel
              </button>
              <button
                onClick={() => void clearParentReport()}
                disabled={prClearLoading}
                className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
              >
                {prClearLoading ? "Clearing…" : "Clear Report"}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* ── USER FEEDBACK ── */}
        {tab === "feedback" && (() => {
          // Tally how many times each suggestion was chosen
          const tally: Record<string, number> = {};
          for (const entry of feedbackEntries) {
            for (const s of entry.suggestions) {
              tally[s] = (tally[s] ?? 0) + 1;
            }
          }
          const tallySorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
          const maxCount = tallySorted[0]?.[1] ?? 1;

          return (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-100">User Feedback</h2>
                <button
                  onClick={() => void loadFeedback()}
                  className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition"
                >
                  Refresh
                </button>
              </div>

              {feedbackEntries.length === 0 ? (
                <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] p-8 text-center text-sm text-neutral-500">
                  No feedback submissions yet.
                </div>
              ) : (
                <>
                  {/* ── Tally summary ── */}
                  {tallySorted.length > 0 && (
                    <div className="mb-5 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-5">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">Response Tally - {feedbackEntries.length} submission{feedbackEntries.length !== 1 ? "s" : ""}</h3>
                      <div className="space-y-2">
                        {tallySorted.map(([label, count]) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="w-6 flex-shrink-0 text-right text-xs font-bold text-neutral-200">{count}</span>
                            <div className="flex-1">
                              <div className="mb-0.5 text-xs text-neutral-300">{label}</div>
                              <div className="h-1.5 w-full rounded-full bg-[rgba(120,120,120,0.15)]">
                                <div
                                  className="h-1.5 rounded-full bg-red-500/70"
                                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Individual submissions ── */}
                  <div className="space-y-3">
                    {feedbackEntries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.95)] p-5">
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <span className="text-xs text-neutral-500">
                            {new Date(entry.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-xs font-medium text-neutral-400">
                            {entry.username ? `@${entry.username}` : "Anonymous"}
                          </span>
                        </div>
                        {entry.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {entry.suggestions.map((s) => (
                              <span key={s} className="rounded-full border border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.12)] px-2.5 py-0.5 text-xs text-neutral-300">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {entry.custom_text && (
                          <p className="text-sm text-neutral-300 leading-relaxed border-t border-[rgba(120,120,120,0.15)] pt-3 mt-2">
                            &ldquo;{entry.custom_text}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── PROMOTIONS ── */}
        {tab === "promotions" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-100">Promotions</h2>
              <button onClick={() => void loadPromotions()} className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition">Refresh</button>
            </div>

            {/* Create form */}
            <div className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.95)] p-6 space-y-5">
              <h3 className="text-sm font-semibold text-neutral-200">Create New Promotion</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-neutral-400">Promotion Name *</label>
                  <input value={promoName} onChange={e => setPromoName(e.target.value)} placeholder="e.g. Spring Launch Special" className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-[rgba(120,120,120,0.7)]" />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-neutral-400">Description (shown to admins only)</label>
                  <input value={promoDesc} onChange={e => setPromoDesc(e.target.value)} placeholder="Internal note about this promotion" className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-[rgba(120,120,120,0.7)]" />
                </div>

                {promoBenefit === "lethal_access" && (
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-400">Duration</label>
                    <div className="flex flex-wrap gap-2">
                      {[3, 7, 14, 30, 60, 90, 0].map(d => (
                        <button key={d} type="button" onClick={() => setPromoDays(d)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${promoDays === d ? "border-red-700/60 bg-red-950/30 text-red-300" : "border-[rgba(120,120,120,0.35)] text-neutral-400 hover:text-white"}`}>
                          {d === 0 ? "Custom" : `${d}d`}
                        </button>
                      ))}
                    </div>
                    {promoDays === 0 && (
                      <input type="number" min={1} value={promoCustomDays} onChange={e => setPromoCustomDays(e.target.value)} placeholder="Number of days" className="mt-2 w-32 rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-1.5 text-sm text-neutral-100 focus:outline-none" />
                    )}
                  </div>
                )}

                <div className="sm:col-span-2 space-y-2">
                  <label className="text-xs text-neutral-400">Promotion Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      ["lethal_access", "Lethal Member Access", "Grants full Lethal tier benefits to free users for the duration of the promotion. Requires a duration."],
                      ["coins_only", "Bloom Coins Award", "Immediately awards bonus Bloom Coins to eligible users. No tier change. Works for all user types including current Lethal members."],
                    ] as const).map(([val, title, desc]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setPromoBenefit(val);
                          if (val === "coins_only") {
                            if (promoBonusCoins === 0) setPromoBonusCoins(50);
                            if (promoAppliesTo === "both") setPromoAppliesTo("all_users");
                          } else {
                            if (promoAppliesTo === "all_users") setPromoAppliesTo("both");
                          }
                        }}
                        className={`rounded-xl border p-4 text-left transition ${promoBenefit === val ? "border-violet-600 bg-violet-700/20 dark:bg-violet-950/40" : "border-[rgba(120,120,120,0.3)] bg-neutral-900/30 hover:border-[rgba(120,120,120,0.5)]"}`}
                      >
                        <div className={`text-sm font-semibold ${promoBenefit === val ? "text-violet-700 dark:text-violet-300" : "text-neutral-200"}`}>{title}</div>
                        <div className="mt-1 text-xs text-neutral-500 leading-relaxed">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-400">Applies To</label>
                  <div className="flex flex-col gap-2">
                    {(promoBenefit === "lethal_access"
                      ? [["new_signups", "New signups only"], ["all_free", "All current free members"], ["both", "Both new signups + existing free"]] as const
                      : [["new_signups", "New signups only"], ["all_free", "Current free members only"], ["all_users", "All users (free + Lethal)"]] as const
                    ).map(([val, label]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="appliesTo" value={val} checked={promoAppliesTo === val} onChange={() => setPromoAppliesTo(val as typeof promoAppliesTo)} className="accent-red-500" />
                        <span className="text-sm text-neutral-300">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-400">Bonus Bloom Coins on Enroll</label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 25, 50, 100, 250].map(c => (
                      <button key={c} type="button" onClick={() => setPromoBonusCoins(c)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${promoBonusCoins === c ? "border-amber-700/60 bg-amber-950/30 text-amber-300" : "border-[rgba(120,120,120,0.35)] text-neutral-400 hover:text-white"}`}>
                        {c === 0 ? "None" : <><span className="text-amber-400">✿</span> +{c}</>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-400">Max Users Cap</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={promoMaxUsers === null} onChange={() => setPromoMaxUsers(null)} className="accent-red-500" />
                      <span className="text-sm text-neutral-300">Unlimited</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={promoMaxUsers !== null} onChange={() => setPromoMaxUsers(100)} className="accent-red-500" />
                      <span className="text-sm text-neutral-300">Cap at</span>
                    </label>
                    {promoMaxUsers !== null && (
                      <input type="number" min={1} value={promoMaxUsers} onChange={e => setPromoMaxUsers(Number(e.target.value))} className="w-24 rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-2 py-1 text-sm text-neutral-100 focus:outline-none" />
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void createPromotion()}
                disabled={promoCreating}
                className="rounded-lg border border-red-700/60 bg-red-950/30 px-5 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950/50 disabled:opacity-40"
              >
                {promoCreating ? "Creating…" : "Create Promotion"}
              </button>
            </div>

            {/* Promotions list */}
            {promotions.length === 0 ? (
              <div className="rounded-xl border border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.06)] p-8 text-center text-sm text-neutral-500">
                No promotions yet. Create one above.
              </div>
            ) : (
              <div className="space-y-4">
                {promotions.map(p => {
                  const isActive = p.status === "active";
                  const isPaused = p.status === "paused";
                  const isEnded = p.status === "ended";
                  const appliesToLabel = p.applies_to === "new_signups" ? "New signups" : p.applies_to === "all_free" ? "All free members" : p.applies_to === "all_users" ? "All users" : "New signups + existing free";
                  return (
                    <div key={p.id} className={`rounded-xl border p-5 ${isActive ? "border-emerald-700/40 bg-emerald-950/10" : isPaused ? "border-amber-700/40 bg-amber-950/10" : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)]"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-100">{p.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isActive ? "bg-emerald-900/40 text-emerald-400" : isPaused ? "bg-amber-900/40 text-amber-400" : "bg-neutral-800 text-neutral-500"}`}>
                              {p.status}
                            </span>
                          </div>
                          {p.description && <p className="mt-0.5 text-xs text-neutral-500">{p.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                            {p.benefit === "coins_only"
                              ? <span className="text-amber-400 font-medium">Coins award only</span>
                              : <span>{p.duration_days} day{p.duration_days !== 1 ? "s" : ""} of Lethal access</span>
                            }
                            <span>{appliesToLabel}</span>
                            {p.bonus_coins > 0 && <span>+{p.bonus_coins} ✿ bonus</span>}
                            {p.max_users && <span>Cap: {p.max_users.toLocaleString()}</span>}
                            <span className="font-medium text-neutral-300">{p.enrolled_count.toLocaleString()} enrolled</span>
                          </div>
                          <p className="mt-1 flex items-center gap-3 text-[10px] text-neutral-600">
                            <span>Created {new Date(p.created_at).toLocaleDateString()}{p.ended_at ? ` · Ended ${new Date(p.ended_at).toLocaleDateString()}` : ""}</span>
                            {!isEnded && p.benefit !== "coins_only" && (
                              <PromoCountdown createdAt={p.created_at} durationDays={p.duration_days} status={p.status} />
                            )}
                          </p>
                        </div>
                        {!isEnded && (
                          <div className="flex flex-wrap gap-2">
                            {isActive && ["all_free", "both"].includes(p.applies_to) && (
                              <button
                                onClick={() => void applyPromoToAll(p.id)}
                                disabled={promoLoading}
                                className="rounded-lg border border-violet-700/50 bg-violet-950/20 px-3 py-1.5 text-xs text-violet-300 transition hover:bg-violet-950/40 disabled:opacity-40"
                              >
                                Apply to all free users
                              </button>
                            )}
                            {isActive && (
                              <button onClick={() => void managePromotion(p.id, "pause")} className="rounded-lg border border-amber-700/40 bg-amber-950/10 px-3 py-1.5 text-xs text-amber-400 transition hover:bg-amber-950/30">
                                Pause
                              </button>
                            )}
                            {isPaused && (
                              <button onClick={() => void managePromotion(p.id, "resume")} className="rounded-lg border border-emerald-700/40 bg-emerald-950/10 px-3 py-1.5 text-xs text-emerald-400 transition hover:bg-emerald-950/30">
                                Resume
                              </button>
                            )}
                            <button onClick={() => void managePromotion(p.id, "end")} className="rounded-lg border border-red-700/40 bg-red-950/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-950/30">
                              End
                            </button>
                          </div>
                        )}
                        {isEnded && (
                          <button onClick={() => void managePromotion(p.id, "delete")} className="rounded-lg border border-[rgba(120,120,120,0.3)] px-3 py-1.5 text-xs text-neutral-500 transition hover:text-red-400 hover:border-red-700/40">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
        </div>
      </div>

      {/* ── USER MANAGEMENT MODAL ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-10 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{selectedUser.full_name || "User"}</h2>
                  {selectedUser.username && (
                    <Link href={`/u/${selectedUser.username}`} target="_blank"
                      className="rounded-lg border border-[rgba(120,120,120,0.35)] px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white transition">
                      View Profile ↗
                    </Link>
                  )}
                </div>
                <p className="text-xs text-neutral-500">{selectedUser.email} {selectedUser.username ? `· @${selectedUser.username}` : ""}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-neutral-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge label={selectedUser.account_status} color={statusColor(selectedUser.account_status)} />
              {selectedUser.is_admin && <Badge label="Admin" color="red" />}
              {selectedUser.messaging_restricted && <Badge label="Msg Restricted" color="amber" />}
              <Badge label={ageLabel(selectedUser.age_category)} color={selectedUser.age_category === "youth_13_17" ? "violet" : "neutral"} />
              {selectedUser.age_category === "youth_13_17" && (
                <Badge label={selectedUser.parental_consent ? "Parental Consent ✓" : "No Parental Consent"} color={selectedUser.parental_consent ? "green" : "amber"} />
              )}
            </div>
            <div className="mb-5 text-xs text-neutral-500">
              Last active:{" "}
              {(() => { const la = formatLastActive(selectedUser.last_active_at); return <span className={la.color}>{la.label}</span>; })()}
              {selectedUser.last_active_at && (
                <span className="ml-1 text-neutral-600">({new Date(selectedUser.last_active_at).toLocaleDateString()})</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-5">
              {selectedUser.account_status === "active" && <>
                <button onClick={() => setActionType("suspend")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "suspend" ? "border-amber-600 bg-amber-600/20 text-amber-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-amber-600/60"}`}>Suspend</button>
                <button onClick={() => setActionType("ban")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "ban" ? "border-red-600 bg-red-600/20 text-red-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-red-600/60"}`}>Ban</button>
              </>}
              {(selectedUser.account_status === "suspended" || selectedUser.account_status === "banned") &&
                <button onClick={() => setActionType("reactivate")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition col-span-2 ${actionType === "reactivate" ? "border-emerald-600 bg-emerald-600/20 text-emerald-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-emerald-600/60"}`}>Reactivate</button>}
              <button onClick={() => setActionType("reset_username")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "reset_username" ? "border-blue-600 bg-blue-600/20 text-blue-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-blue-600/60"}`}>Reset Username</button>
              <button onClick={() => setActionType("restrict_messaging")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "restrict_messaging" ? "border-amber-600 bg-amber-600/20 text-amber-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300"}`}>{selectedUser.messaging_restricted ? "Unrestrict Messaging" : "Restrict Messaging"}</button>
              {!selectedUser.is_admin &&
                <button onClick={() => setActionType("toggle_admin")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "toggle_admin" ? "border-red-600 bg-red-600/20 text-red-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300"}`}>Grant Admin</button>}
              {selectedUser.is_admin &&
                <button onClick={() => setActionType("toggle_admin")} className={`rounded-lg border px-3 py-2 text-xs font-medium transition border-red-700/60 text-red-400`}>Revoke Admin</button>}
              <button
                onClick={() => setActionType("toggle_age_group")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "toggle_age_group" ? "border-blue-600 bg-blue-600/20 text-blue-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-blue-600/60"}`}>
                {selectedUser.age_category === "youth_13_17" ? "Change to Adult (18+)" : "Change to Youth (13–17)"}
              </button>
              <button
                onClick={() => { setActionType("adjust_coins"); setCoinInput(String(selectedUser.bloom_coins)); }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${actionType === "adjust_coins" ? "border-emerald-600 bg-emerald-600/20 text-emerald-300" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-emerald-600/60"}`}>
                Change Coins
              </button>
              <button
                onClick={() => setActionType("reset_strikes")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition col-span-2 ${actionType === "reset_strikes" ? "border-blue-500 bg-blue-700/40 text-blue-100" : "border-[rgba(120,120,120,0.4)] text-neutral-300 hover:border-blue-500/50"}`}>
                Reset Suspension Totals
              </button>
              <button onClick={() => setActionType("delete")} className="rounded-lg border border-red-900/60 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-900/20 transition col-span-2">Delete Account</button>
            </div>

            {actionType === "adjust_coins" && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-neutral-400">Current balance: <span className="font-semibold text-white">{selectedUser.bloom_coins.toLocaleString()} coins</span></p>
                <input
                  type="number"
                  min={0}
                  placeholder="New coin balance…"
                  value={coinInput}
                  onChange={e => setCoinInput(e.target.value)}
                  className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none"
                />
                <input type="text" placeholder="Reason (optional)" value={actionReason} onChange={e => setActionReason(e.target.value)}
                  className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none" />
                <button
                  disabled={coinInput === "" || isNaN(Number(coinInput)) || Number(coinInput) < 0}
                  onClick={() => setCoinConfirm({ userId: selectedUser.user_id, oldBalance: selectedUser.bloom_coins, newBalance: Number(coinInput) })}
                  className="h-9 w-full rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 text-sm font-medium text-emerald-300 disabled:opacity-40 transition hover:bg-emerald-900/30">
                  Review Change →
                </button>
              </div>
            )}

            {actionType && actionType !== "adjust_coins" && (
              <div className="mb-4 space-y-2">
                {actionType === "reset_strikes" && (
                  <div className="rounded-lg border border-blue-600/70 bg-blue-800/40 px-3 py-2.5 text-xs text-blue-100 space-y-1">
                    <p className="font-semibold">This will reset to zero:</p>
                    <p>Messaging - {selectedUser!.conduct_strikes} strike{selectedUser!.conduct_strikes !== 1 ? "s" : ""} · {selectedUser!.lifetime_suspension_count} lifetime suspension{selectedUser!.lifetime_suspension_count !== 1 ? "s" : ""}{selectedUser!.blacklisted ? " · blacklisted" : ""}{selectedUser!.messaging_suspended_until ? " · currently suspended" : ""}</p>
                    <p>Manuscript - {selectedUser!.manuscript_conduct_strikes} strike{selectedUser!.manuscript_conduct_strikes !== 1 ? "s" : ""} · {selectedUser!.manuscript_lifetime_suspension_count} lifetime suspension{selectedUser!.manuscript_lifetime_suspension_count !== 1 ? "s" : ""}{selectedUser!.manuscript_blacklisted ? " · blacklisted" : ""}{selectedUser!.manuscript_suspended_until ? " · currently suspended" : ""}</p>
                  </div>
                )}
                {(actionType !== "reactivate" && actionType !== "reset_username" && actionType !== "toggle_admin" && actionType !== "restrict_messaging" && actionType !== "toggle_age_group" && actionType !== "reset_strikes") && (
                  <input type="text" placeholder="Reason (optional)" value={actionReason} onChange={e => setActionReason(e.target.value)}
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none" />
                )}
                <button onClick={() => void applyUserAction()} disabled={actionLoading}
                  className="btn-danger h-9 w-full rounded-lg border px-3 text-sm font-medium text-white disabled:opacity-40">
                  {actionLoading ? "Processing…" : `Confirm: ${actionType.replace(/_/g, " ")}`}
                </button>
              </div>
            )}

            {/* Moderation notes */}
            <div className="border-t border-[rgba(120,120,120,0.2)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Internal Moderation Notes</p>
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {modNotes.length === 0 && <p className="text-xs text-neutral-600">No notes yet.</p>}
                {modNotes.map(n => (
                  <div key={n.id} className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-neutral-900/40 px-3 py-2">
                    <p className="text-xs text-neutral-300">{n.note}</p>
                    <p className="text-[10px] text-neutral-600 mt-1">{n.admin_name || "Admin"} · {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Add internal note…" value={newNote} onChange={e => setNewNote(e.target.value)}
                  className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 outline-none" />
                <button onClick={() => void addModNote("user", selectedUser.user_id)} disabled={!newNote.trim()}
                  className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 text-xs text-neutral-200 hover:text-white disabled:opacity-40 transition">
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COIN CHANGE CONFIRMATION MODAL ── */}
      {coinConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Confirm Coin Change</h3>
            <p className="text-sm text-neutral-400 mb-4">You are about to update this user&apos;s Bloom Coin balance:</p>
            <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-neutral-900/60 px-4 py-3 mb-4 flex items-center justify-between gap-4">
              <div className="text-center">
                <p className="text-xs text-neutral-500 mb-1">Current</p>
                <p className="text-xl font-semibold text-neutral-200">{coinConfirm.oldBalance.toLocaleString()}</p>
              </div>
              <span className="text-neutral-500 text-lg">→</span>
              <div className="text-center">
                <p className="text-xs text-neutral-500 mb-1">New</p>
                <p className={`text-xl font-semibold ${coinConfirm.newBalance > coinConfirm.oldBalance ? "text-emerald-300" : coinConfirm.newBalance < coinConfirm.oldBalance ? "text-red-300" : "text-neutral-200"}`}>
                  {coinConfirm.newBalance.toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-neutral-500 mb-1">Change</p>
                <p className={`text-sm font-semibold ${coinConfirm.newBalance >= coinConfirm.oldBalance ? "text-emerald-400" : "text-red-400"}`}>
                  {coinConfirm.newBalance >= coinConfirm.oldBalance ? "+" : ""}{(coinConfirm.newBalance - coinConfirm.oldBalance).toLocaleString()}
                </p>
              </div>
            </div>
            {actionReason && <p className="text-xs text-neutral-500 mb-4">Reason: <span className="text-neutral-300">{actionReason}</span></p>}
            <div className="flex gap-2">
              <button onClick={() => setCoinConfirm(null)} className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] py-2 text-sm text-neutral-300 hover:text-white transition">
                Cancel
              </button>
              <button onClick={() => void applyCoinsChange()} disabled={actionLoading}
                className="flex-1 rounded-lg border border-emerald-700/60 bg-emerald-950/30 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-40 transition">
                {actionLoading ? "Saving…" : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANUSCRIPT MANAGEMENT MODAL ── */}
      {selectedManuscript && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-10 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{selectedManuscript.title || "Untitled"}</h2>
                  <Link href={`/manuscripts/${selectedManuscript.id}`} target="_blank"
                    className="rounded-lg border border-[rgba(120,120,120,0.35)] px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white transition">
                    View ↗
                  </Link>
                </div>
                <p className="text-xs text-neutral-500">by {selectedManuscript.owner_name || "Unknown"}</p>
              </div>
              <button onClick={() => setSelectedManuscript(null)} className="text-neutral-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <Badge label={selectedManuscript.visibility} color={selectedManuscript.visibility === "public" ? "green" : "neutral"} />
              {selectedManuscript.is_featured && <Badge label="Featured" color="amber" />}
              {selectedManuscript.admin_hidden && <Badge label="Admin Hidden" color="red" />}
            </div>

            {/* Edit metadata */}
            <div className="mb-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Edit Metadata</p>
              <input type="text" placeholder="Title" value={editingManuscript?.title ?? ""} onChange={e => setEditingManuscript(p => ({ ...p, title: e.target.value }))}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none" />
              <input type="text" placeholder="Genre" value={editingManuscript?.genre ?? ""} onChange={e => setEditingManuscript(p => ({ ...p, genre: e.target.value }))}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none" />
              <input type="text" placeholder="Age rating" value={editingManuscript?.age_rating ?? ""} onChange={e => setEditingManuscript(p => ({ ...p, age_rating: e.target.value }))}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none" />
              <button onClick={() => { setActionType("edit_meta"); void applyManuscriptAction(); }}
                className="h-8 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.1)] px-3 text-xs text-neutral-200 hover:text-white transition">
                Save Metadata
              </button>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button onClick={() => { setActionType("feature"); void applyManuscriptAction(); }}
                className="rounded-lg border border-amber-700/50 bg-amber-900/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-900/30 transition">
                {selectedManuscript.is_featured ? "Unfeature" : "★ Feature"}
              </button>
              <button onClick={() => { setActionType(selectedManuscript.admin_hidden ? "unhide" : "hide"); void applyManuscriptAction(); }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${selectedManuscript.admin_hidden ? "border-emerald-700/50 bg-emerald-900/10 text-emerald-400 hover:bg-emerald-900/30" : "border-red-700/50 bg-red-900/10 text-red-400 hover:bg-red-900/30"}`}>
                {selectedManuscript.admin_hidden ? "Unhide" : "Hide"}
              </button>
              {["public", "private"].map(v => (
                <button key={v} onClick={() => { setActionReason(v); setActionType("set_visibility"); void applyManuscriptAction(); }}
                  className="rounded-lg border border-[rgba(120,120,120,0.4)] px-3 py-2 text-xs text-neutral-300 hover:text-white transition">
                  Set {v}
                </button>
              ))}
            </div>

            {/* Moderation notes */}
            <div className="border-t border-[rgba(120,120,120,0.2)] pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Internal Notes</p>
              <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                {modNotes.length === 0 && <p className="text-xs text-neutral-600">No notes yet.</p>}
                {modNotes.map(n => (
                  <div key={n.id} className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-neutral-900/40 px-3 py-2">
                    <p className="text-xs text-neutral-300">{n.note}</p>
                    <p className="text-[10px] text-neutral-600 mt-1">{n.admin_name || "Admin"} · {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Add internal note…" value={newNote} onChange={e => setNewNote(e.target.value)}
                  className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 outline-none" />
                <button onClick={() => void addModNote("manuscript", selectedManuscript.id)} disabled={!newNote.trim()}
                  className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 text-xs text-neutral-200 hover:text-white disabled:opacity-40">
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT REVIEW MODAL ── */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Review Report</h2>
              <button onClick={() => setSelectedReport(null)} className="text-neutral-500 hover:text-white text-lg">✕</button>
            </div>
            <div className="space-y-1 mb-4 text-sm">
              <div className="flex gap-2 flex-wrap mb-2">
                <Badge label={selectedReport.status} color={selectedReport.status === "pending" ? "amber" : "green"} />
                <Badge label={selectedReport.category} color="neutral" />
                <Badge label={selectedReport.target_type} color="blue" />
              </div>
              <p className="text-neutral-300"><span className="text-neutral-500">Reporter:</span> {selectedReport.reporter_name || "Anonymous"}</p>
              {selectedReport.target_user_name && <p className="text-neutral-300"><span className="text-neutral-500">Target user:</span> {selectedReport.target_user_name}</p>}
              <p className="text-neutral-300"><span className="text-neutral-500">Target ID:</span> <code className="text-xs">{selectedReport.target_id}</code></p>
              {selectedReport.details && <p className="text-neutral-300 mt-2">{selectedReport.details}</p>}
              {selectedReport.evidence_url && <a href={selectedReport.evidence_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline">View evidence ↗</a>}
            </div>
            <textarea placeholder="Resolution note…" value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
              className="mb-4 w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none resize-none" />
            <div className="flex gap-2">
              {selectedReport.status === "pending"
                ? <button onClick={() => void resolveReport(selectedReport, true)} className="btn-success flex-1 h-9 rounded-lg border px-3 text-sm font-medium text-white">Mark Resolved</button>
                : <button onClick={() => void resolveReport(selectedReport, false)} className="flex-1 h-9 rounded-lg border border-amber-700 bg-amber-900/20 px-3 text-sm font-medium text-amber-300">Reopen</button>}
              <button onClick={() => setSelectedReport(null)} className="flex-1 h-9 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Flagged Content sub-component ─────────────────────────────────────────────

function FlaggedContentTab({ adminFetch, onAudit, onMsg }: {
  adminFetch: (path: string, opts?: RequestInit) => Promise<unknown>;
  onAudit: (action: string, targetType: string, targetId: string, oldVal?: unknown, newVal?: unknown, notes?: string) => Promise<void>;
  onMsg: (msg: string) => void;
}) {
  const [flags, setFlags] = useState<{ id: string; manuscript_id: string; title: string | null; owner_id: string | null; owner_name: string | null; owner_username: string | null; reason: string; matched_terms: string[]; status: string; created_at: string }[]>([]);
  const [msgFlags, setMsgFlags] = useState<{ id: string; content_excerpt: string | null; triggers: string[]; consequence: string; status: string; created_at: string; sender_id: string | null; sender_name: string | null; sender_username: string | null }[]>([]);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: runs once on mount; adminFetch prop is stable at runtime
  }, []);

  async function load() {
    const data = await adminFetch("/api/admin/data?scope=flagged") as {
      manuscriptFlags?: { id: string; manuscript_id: string; title: string | null; owner_id: string | null; owner_name: string | null; owner_username: string | null; reason: string; matched_terms: string[]; status: string; created_at: string }[];
      messageFlags?: { id: string; content_excerpt: string | null; triggers: string[]; consequence: string; status: string; created_at: string; sender_id: string | null; sender_name: string | null; sender_username: string | null }[];
    } | null;
    if (data?.manuscriptFlags) setFlags(data.manuscriptFlags);
    if (data?.messageFlags) setMsgFlags(data.messageFlags);
  }

  async function resolveFlag(id: string, type: "manuscript" | "message") {
    const table = type === "manuscript" ? "manuscript_moderation_flags" : "message_moderation_flags";
    await adminFetch("/api/admin/action", {
      method: "POST",
      body: JSON.stringify({ type: "update", table, id_column: "id", id_value: id, updates: { status: "resolved" } }),
    });
    await onAudit("resolve_flag", type + "_flag", id, { status: "pending_owner_review" }, { status: "resolved" });
    onMsg("Flag resolved.");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Manuscript Flags</h2>
        {flags.length === 0 && <p className="text-sm text-neutral-500">No manuscript flags.</p>}
        {flags.map(f => (
          <div key={f.id} className="mb-3 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-100">{f.title || "Untitled manuscript"}</p>
                <p className="text-sm text-amber-400 mt-0.5 font-medium">
                  Violator: {f.owner_name || f.owner_username ? `${f.owner_name ?? ""}${f.owner_username ? ` (@${f.owner_username})` : ""}`.trim() : f.owner_id ?? "Unknown"}
                </p>
                <p className="text-sm text-neutral-400 mt-0.5">{f.reason}</p>
                {f.matched_terms.length > 0 && <p className="text-xs text-red-400 mt-1">Matched: {f.matched_terms.join(", ")}</p>}
                <p className="text-xs text-neutral-600 mt-1">{new Date(f.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Badge label={f.status} color={f.status === "resolved" ? "green" : "amber"} />
                {f.status !== "resolved" && (
                  <button onClick={() => void resolveFlag(f.id, "manuscript")}
                    className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-900/40 transition">
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Message Flags</h2>
        {msgFlags.length === 0 && <p className="text-sm text-neutral-500">No message flags.</p>}
        {msgFlags.map(f => (
          <div key={f.id} className="mb-3 rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-amber-400 font-medium mb-1">
                  Sender: {f.sender_name || f.sender_username ? `${f.sender_name ?? ""}${f.sender_username ? ` (@${f.sender_username})` : ""}`.trim() : f.sender_id ?? "Unknown"}
                </p>
                {f.content_excerpt && <p className="text-sm text-neutral-300 italic">&ldquo;{f.content_excerpt}&rdquo;</p>}
                {f.triggers.length > 0 && <p className="text-xs text-red-400 mt-1">Triggers: {f.triggers.join(", ")}</p>}
                <p className="text-xs text-neutral-500 mt-0.5">Consequence: {f.consequence}</p>
                <p className="text-xs text-neutral-600 mt-1">{new Date(f.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Badge label={f.status} color={f.status === "resolved" ? "green" : "amber"} />
                {f.status !== "resolved" && (
                  <button onClick={() => void resolveFlag(f.id, "message")}
                    className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-900/40 transition">
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Appeals Tab ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  poaching: "Poaching / soliciting members off-platform",
  offsite_contact: "Requesting off-platform contact (email, phone)",
  social_media: "Sharing external social media handles",
  fiverr: "Soliciting freelance/paid services",
  cursing: "Prohibited language (youth account)",
  foul_language: "Severely offensive language (youth account)",
  sexual_language: "Sexual or explicit language (youth account)",
};

function AppealsTab({ appeals, adminFetch, onAudit, onMsg, onRefresh }: {
  appeals: ConductAppeal[];
  adminFetch: (path: string, opts?: RequestInit) => Promise<unknown>;
  onAudit: (action: string, targetType: string, targetId: string, oldVal?: unknown, newVal?: unknown, notes?: string) => Promise<void>;
  onMsg: (msg: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  async function review(appealId: string, decision: "approved" | "denied") {
    setReviewing(appealId);
    const res = await adminFetch("/api/admin/review-appeal", {
      method: "POST",
      body: JSON.stringify({ appeal_id: appealId, decision, admin_note: noteInputs[appealId]?.trim() || undefined }),
    }) as { ok?: boolean; error?: string } | null;
    setReviewing(null);
    if ((res as { error?: string } | null)?.error) {
      onMsg((res as { error: string }).error);
      return;
    }
    await onAudit(`appeal_${decision}`, "conduct_appeal", appealId, { status: "pending" }, { status: decision, admin_note: noteInputs[appealId] ?? null });
    onMsg(`Appeal ${decision}.`);
    await onRefresh();
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const pending = appeals.filter(a => a.status === "pending");
  const history = appeals.filter(a => a.status !== "pending");

  const userLabel = (a: ConductAppeal) =>
    a.user_pen_name || (a.user_username ? `@${a.user_username}` : a.user_name) || a.user_email || a.user_id.slice(0, 8);

  const statusBadge = (status: string) => {
    if (status === "pending") return <span className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">Pending</span>;
    if (status === "approved") return <span className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Approved</span>;
    return <span className="rounded-lg border border-red-700/60 bg-red-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">Denied</span>;
  };

  return (
    <div className="space-y-8">
      {/* Pending */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Pending Appeals {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-900/40 px-2 py-0.5 text-xs text-amber-400">{pending.length}</span>}</h2>
        {pending.length === 0 && <p className="text-sm text-neutral-500">No pending appeals.</p>}
        {pending.map(a => (
          <div key={a.id} className="mb-4 rounded-xl border border-amber-700/30 bg-[rgba(18,18,18,0.95)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-neutral-100">{userLabel(a)}</p>
                {a.user_username && <p className="text-xs text-neutral-500">@{a.user_username}</p>}
                {a.user_email && <p className="text-xs text-neutral-500">{a.user_email}</p>}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {statusBadge(a.status)}
                {a.user_blacklisted && <span className="rounded-lg border border-red-700/60 bg-red-950/30 px-1.5 py-0.5 font-bold uppercase tracking-wide text-red-400">Msg Blacklisted</span>}
                {a.user_ms_blacklisted && <span className="rounded-lg border border-red-700/60 bg-red-950/30 px-1.5 py-0.5 font-bold uppercase tracking-wide text-red-400">MS Blacklisted</span>}
                {a.user_suspended_until && new Date(a.user_suspended_until).getTime() > now && (
                  <span className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-1.5 py-0.5 text-amber-300">Msg Suspended until {new Date(a.user_suspended_until).toLocaleDateString()}</span>
                )}
                {a.user_ms_suspended_until && new Date(a.user_ms_suspended_until).getTime() > now && (
                  <span className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-1.5 py-0.5 text-amber-300">MS Suspended until {new Date(a.user_ms_suspended_until).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
              <div className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] p-2">
                <p className="text-neutral-500">Msg Strikes</p>
                <p className="mt-0.5 text-lg font-semibold text-white">{a.user_strikes ?? 0}</p>
              </div>
              <div className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] p-2">
                <p className="text-neutral-500">MS Strikes</p>
                <p className="mt-0.5 text-lg font-semibold text-white">{a.user_ms_strikes ?? 0}</p>
              </div>
              <div className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] p-2">
                <p className="text-neutral-500">Total Suspensions</p>
                <p className="mt-0.5 text-lg font-semibold text-amber-300">{a.user_lifetime_suspensions}</p>
              </div>
              <div className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] p-2">
                <p className="text-neutral-500">Submitted</p>
                <p className="mt-0.5 text-sm font-medium text-white">{new Date(a.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Violation details */}
            {(a.all_violations.length > 0 || a.all_ms_violations.length > 0) && (
              <div className="mb-3 space-y-2">
                {a.all_violations.length > 0 && (
                  <div className="rounded-lg border border-red-800/30 bg-red-950/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-2">
                      Messaging Violations ({a.all_violations.length})
                    </p>
                    {a.violation_excerpt && a.all_violations[0] && (
                      <p className="text-xs text-neutral-400 italic mb-2 border-l-2 border-red-800/50 pl-2">&quot;{a.violation_excerpt}&quot;</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {(a.all_violations[0]?.triggers ?? []).map(t => (
                        <span key={t} className="rounded-lg border border-red-700/40 bg-red-900/20 px-2 py-0.5 text-xs text-red-300">
                          {TRIGGER_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                    {a.all_violations[0]?.consequence && (
                      <p className="text-xs text-neutral-500 mt-1">Most recent consequence: <span className="text-neutral-300">{a.all_violations[0].consequence.replace(/_/g, " ")}</span></p>
                    )}
                  </div>
                )}
                {a.all_ms_violations.length > 0 && (
                  <div className="rounded-lg border border-orange-800/30 bg-orange-950/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-400 mb-2">
                      Manuscript Violations ({a.all_ms_violations.length})
                    </p>
                    {a.all_ms_violations[0]?.content_excerpt && (
                      <p className="text-xs text-neutral-400 italic mb-2 border-l-2 border-orange-800/50 pl-2">&quot;{a.all_ms_violations[0].content_excerpt}&quot;</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {(a.all_ms_violations[0]?.triggers ?? []).map(t => (
                        <span key={t} className="rounded-lg border border-orange-700/40 bg-orange-900/20 px-2 py-0.5 text-xs text-orange-300">
                          {TRIGGER_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                    {a.all_ms_violations[0]?.consequence && (
                      <p className="text-xs text-neutral-500 mt-1">Most recent consequence: <span className="text-neutral-300">{a.all_ms_violations[0].consequence.replace(/_/g, " ")}</span></p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">User&apos;s Reason</p>
              <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">{a.reason}</p>
            </div>

            <input
              type="text"
              placeholder="Admin note (optional, shown to user)…"
              value={noteInputs[a.id] ?? ""}
              onChange={e => setNoteInputs(prev => ({ ...prev, [a.id]: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-[rgba(120,120,120,0.3)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-[rgba(120,120,120,0.6)]"
            />

            <div className="flex gap-3">
              <button
                onClick={() => void review(a.id, "approved")}
                disabled={reviewing === a.id}
                className="flex-1 rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 transition disabled:opacity-50"
              >
                {reviewing === a.id ? "…" : "Approve - Restore Access"}
              </button>
              <button
                onClick={() => void review(a.id, "denied")}
                disabled={reviewing === a.id}
                className="flex-1 rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/40 transition disabled:opacity-50"
              >
                {reviewing === a.id ? "…" : "Deny"}
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-600">Approving resets all conduct strikes to 0 and lifts all messaging, feedback, and manuscript restrictions. The user will be notified.</p>
          </div>
        ))}
      </div>

      {/* History log */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Appeal History</h2>
        {history.length === 0 && <p className="text-sm text-neutral-500">No resolved appeals yet.</p>}
        <div className="rounded-xl border border-[rgba(120,120,120,0.3)] bg-[rgba(18,18,18,0.95)] overflow-x-auto">
          {history.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(120,120,120,0.15)] text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total Suspensions</th>
                  <th className="px-4 py-3">Reviewed By</th>
                  <th className="px-4 py-3">Admin Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map(a => (
                  <tr key={a.id} className="border-b border-[rgba(120,120,120,0.08)] hover:bg-[rgba(120,120,120,0.04)]">
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-neutral-100">{userLabel(a)}</p>
                      {a.user_email && <p className="text-xs text-neutral-500">{a.user_email}</p>}
                    </td>
                    <td className="px-4 py-3">{statusBadge(a.status)}</td>
                    <td className="px-4 py-3 text-sm text-center text-amber-300 font-medium">{a.user_lifetime_suspensions}</td>
                    <td className="px-4 py-3 text-sm text-neutral-400">{a.reviewer_name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-neutral-400">{a.admin_note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
