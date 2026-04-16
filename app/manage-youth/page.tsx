"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/Supabase/browser";

type YouthLink = {
  id: string;
  child_email: string;
  child_name: string;
  child_dob: string;
  child_user_id: string | null;
  subscription_tier: "free" | "unlimited";
  status: "pending" | "active" | "revoked";
  invite_expires_at: string;
  created_at: string;
};

type ChildProfile = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

type ChildManuscript = {
  id: string;
  title: string;
  created_at: string;
  genre: string | null;
  parent_disabled?: boolean;
  parent_disabled_reason?: string | null;
};

export default function ManageYouthPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [ageCategory, setAgeCategory] = useState<string | null>(null);
  const [parentName, setParentName] = useState("Parent");
  const [links, setLinks] = useState<YouthLink[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ChildProfile>>({});
  const [manuscripts, setManuscripts] = useState<Record<string, ChildManuscript[]>>({});
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmUpgradeId, setConfirmUpgradeId] = useState<string | null>(null);
  const [confirmDowngradeId, setConfirmDowngradeId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDisableMs, setConfirmDisableMs] = useState<{ id: string; title: string; childId: string } | null>(null);
  const [disableMsReason, setDisableMsReason] = useState("");
  const [disableMsSubmitting, setDisableMsSubmitting] = useState(false);

  const DISABLE_REASONS = [
    "Inappropriate content",
    "Safety concern",
    "Content needs review",
    "Temporary pause requested",
    "Other parental concern",
  ];

  // Add form fields
  const [childName, setChildName] = useState("");
  const [childEmail, setChildEmail] = useState("");
  const [childDob, setChildDob] = useState("");
  const [tier, setTier] = useState<"free" | "unlimited">("free");

useEffect(() => {
  async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const [{ data: acct }, { data: prof }] = await Promise.all([
        supabase.from("accounts").select("age_category").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("public_profiles")
          .select("pen_name, username")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const cat = (acct as { age_category?: string } | null)?.age_category ?? null;
      setAgeCategory(cat);

      const p = prof as { pen_name?: string | null; username?: string | null } | null;
      setParentName(
        p?.pen_name?.trim() || (p?.username ? `@${p.username}` : "Parent")
      );

      if (cat === "adult_18_plus") await loadLinks(user.id);
      setLoading(false);
    }

    void init();
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLinks(uid: string) {
    const { data } = await supabase
      .from("youth_links")
      .select("*")
      .eq("parent_user_id", uid)
      .neq("status", "revoked")
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as YouthLink[];
    setLinks(rows);

    const activeIds = rows
      .filter((r) => r.child_user_id && r.status === "active")
      .map((r) => r.child_user_id!);

    if (activeIds.length > 0) {
      const { data: profs } = await supabase
        .from("public_profiles")
        .select("user_id, username, pen_name, avatar_url")
        .in("user_id", activeIds);

      const profMap: Record<string, ChildProfile> = {};
      (profs ?? []).forEach((p: ChildProfile) => {
        profMap[p.user_id] = p;
      });
      setProfiles(profMap);
    }
  }

  async function loadChildManuscripts(childId: string) {
    if (manuscripts[childId] !== undefined) return;
    setManuscripts((prev) => ({ ...prev, [childId]: [] }));

    const res = await fetch(
      `/api/manage-youth/manuscripts?child_user_id=${encodeURIComponent(childId)}`
    );
    const json = (await res.json()) as { manuscripts?: ChildManuscript[]; error?: string };
    if (json.manuscripts) {
      setManuscripts((prev) => ({ ...prev, [childId]: json.manuscripts! }));
    }
  }

  function toggleChild(childId: string) {
    if (expandedChild === childId) {
      setExpandedChild(null);
    } else {
      setExpandedChild(childId);
      void loadChildManuscripts(childId);
    }
  }

  function validateDob(dob: string): { age: number; valid: boolean } {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return { age, valid: age >= 13 && age <= 17 };
  }

  async function disableManuscript(id: string, childId: string, reason: string) {
    setDisableMsSubmitting(true);
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: id, action: "disable", reason }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setDisableMsSubmitting(false);
    setConfirmDisableMs(null);
    setDisableMsReason("");
    if (json.ok) {
      setMsgOk(true);
      setMsg("Manuscript disabled. Your child has been notified.");
      setManuscripts((prev) => ({
        ...prev,
        [childId]: (prev[childId] ?? []).map((m) =>
          m.id === id ? { ...m, parent_disabled: true, parent_disabled_reason: reason } : m
        ),
      }));
    } else {
      setMsgOk(false);
      setMsg(json.error ?? "Failed to disable manuscript.");
    }
  }

  async function reinstateManuscript(id: string, childId: string) {
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: id, action: "reinstate" }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (json.ok) {
      setMsgOk(true);
      setMsg("Manuscript reinstated. Your child has been notified.");
      setManuscripts((prev) => ({
        ...prev,
        [childId]: (prev[childId] ?? []).map((m) =>
          m.id === id ? { ...m, parent_disabled: false, parent_disabled_reason: null } : m
        ),
      }));
    } else {
      setMsgOk(false);
      setMsg(json.error ?? "Failed to reinstate manuscript.");
    }
  }

  async function submitAddChild(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!childName.trim()) return setMsg("Child's name is required.");
    if (!childEmail.trim()) return setMsg("Child's email is required.");
    if (!childDob) return setMsg("Child's date of birth is required.");

    const { age } = validateDob(childDob);
    if (age < 13)
      return setMsg("Your child must be at least 13 years old to create an account.");
    if (age > 17)
      return setMsg(
        "Youth accounts are for ages 13–17. If your child is 18 or older, they can create a standard account at sign-up."
      );

    setSubmitting(true);
    try {
      const res = await fetch("/api/manage-youth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_name: childName.trim(),
          child_email: childEmail.trim(),
          child_dob: childDob,
          subscription_tier: tier,
          parent_user_id: userId,
          parent_name: parentName,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setMsgOk(false);
        return setMsg(json.error ?? "Failed to send invite.");
      }

      setMsgOk(true);
      setMsg(`Invite sent to ${childEmail.trim()}.`);
      setShowAddForm(false);
      setChildName("");
      setChildEmail("");
      setChildDob("");
      setTier("free");
      if (userId) await loadLinks(userId);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendInvite(link: YouthLink) {
    setMsg(null);
    const res = await fetch("/api/manage-youth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        child_name: link.child_name,
        child_email: link.child_email,
        child_dob: link.child_dob,
        subscription_tier: link.subscription_tier,
        parent_user_id: userId,
        parent_name: parentName,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setMsgOk(!!json.ok);
    setMsg(json.ok ? "Invite resent successfully." : (json.error ?? "Failed to resend."));
    if (json.ok && userId) await loadLinks(userId);
  }

  async function removeLink(id: string) {
    await fetch("/api/manage-youth/remove-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_id: id }),
    });
    if (userId) await loadLinks(userId);
  }

  async function updateTier(id: string, newTier: "free" | "unlimited") {
    await fetch("/api/manage-youth/update-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_id: id, tier: newTier }),
    });
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, subscription_tier: newTier } : l))
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-neutral-400">Loading…</div>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-6 py-16 space-y-4">
          <h1 className="text-2xl font-semibold">Manage Youth Accounts</h1>
          <p className="text-sm text-neutral-400">You must be signed in to manage youth accounts.</p>
          <Link
            href="/sign-in"
            className="inline-block rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-4 py-2 text-sm text-white hover:bg-[rgba(120,120,120,0.22)] transition"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (ageCategory !== "adult_18_plus") {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-6 py-16 space-y-4">
          <h1 className="text-2xl font-semibold">Manage Youth Accounts</h1>
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-6">
            <p className="text-sm text-amber-300">
              This feature is only available to adult members (18+). Youth profiles cannot create
              or manage child accounts.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage Youth Accounts</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Add and oversee youth accounts linked to your profile. You have read-only access to
            your child&apos;s manuscripts and will be notified when they post new content.
          </p>
        </div>

        {msg && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              msgOk
                ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300"
                : "border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] text-neutral-300"
            }`}
          >
            {msg}
          </div>
        )}

        {/* Linked youth profiles */}
        <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Linked Youth Profiles</h2>
            <button
              type="button"
              onClick={() => {
                setShowAddForm((v) => !v);
                setMsg(null);
              }}
              className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] transition"
            >
              {showAddForm ? "Cancel" : "+ Add Child"}
            </button>
          </div>

          {links.length === 0 && !showAddForm && (
            <p className="text-sm text-neutral-400">
              No youth accounts linked yet. Click &quot;+ Add Child&quot; to get started.
            </p>
          )}

          {/* Add child form */}
          {showAddForm && (
            <form
              onSubmit={submitAddChild}
              className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-neutral-100">Add a Child Account</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Child&apos;s Full Name
                  </label>
                  <input
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Child&apos;s Email
                  </label>
                  <input
                    type="email"
                    value={childEmail}
                    onChange={(e) => setChildEmail(e.target.value)}
                    placeholder="child@example.com"
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Date of Birth{" "}
                    <span className="text-neutral-600">(private - never shown publicly)</span>
                  </label>
                  <input
                    type="date"
                    value={childDob}
                    onChange={(e) => setChildDob(e.target.value)}
                    max={new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .split("T")[0]}
                    className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-[rgba(120,120,120,0.8)]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Subscription Tier
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTier("free")}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        tier === "free"
                          ? "border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.25)] text-white"
                          : "border-[rgba(120,120,120,0.3)] bg-neutral-900/40 text-neutral-400 hover:border-[rgba(120,120,120,0.5)]"
                      }`}
                    >
                      Bloom Member{" "}
                      <span className="opacity-60">$0/mo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTier("unlimited")}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        tier === "unlimited"
                          ? "border-violet-600/80 bg-violet-950/30 text-violet-300"
                          : "border-[rgba(120,120,120,0.3)] bg-neutral-900/40 text-neutral-400 hover:border-[rgba(120,120,120,0.5)]"
                      }`}
                    >
                      Lethal Member{" "}
                      <span className="opacity-60">+$5/mo</span>
                    </button>
                  </div>
                </div>
              </div>

              {tier === "unlimited" && (
                <p className="text-xs text-amber-400/80">
                  The +$5/mo unlimited add-on will be added to your next billing cycle.
                </p>
              )}

              <p className="text-xs text-neutral-500 leading-relaxed">
                An invite email will be sent to your child. They click the link to set up their
                account, which will be automatically linked to yours. Their date of birth is stored
                securely and never shown publicly.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.18)] px-5 py-2 text-sm font-medium text-neutral-100 hover:bg-[rgba(120,120,120,0.28)] disabled:opacity-50 transition"
              >
                {submitting ? "Sending invite…" : "Send Invite"}
              </button>
            </form>
          )}

          {/* Youth link cards */}
          <div className="space-y-3">
            {links.map((link) => {
              const profile = link.child_user_id ? profiles[link.child_user_id] : null;
              const isExpanded = expandedChild === link.child_user_id;
              const childMss = link.child_user_id ? manuscripts[link.child_user_id] : null;
              const isExpired =
                link.status === "pending" &&
                new Date(link.invite_expires_at).getTime() < Date.now();

              return (
                <div
                  key={link.id}
                  className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] overflow-hidden"
                >
                  <div className="px-4 py-4 flex flex-wrap items-start gap-3">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-neutral-900/60 text-sm font-bold text-neutral-300">
                      {link.child_name.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-neutral-100">{link.child_name}</span>

                        {link.status === "active" ? (
                          <span className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                            Active
                          </span>
                        ) : isExpired ? (
                          <span className="rounded-lg border border-red-700/60 bg-red-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
                            Invite Expired
                          </span>
                        ) : (
                          <span className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                            Invite Pending
                          </span>
                        )}

                        <span
                          className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            link.subscription_tier === "unlimited"
                              ? "border-violet-700/60 bg-violet-950/30 text-violet-400"
                              : "border-neutral-700 bg-neutral-950/30 text-neutral-400"
                          }`}
                        >
                          {link.subscription_tier === "unlimited" ? "Lethal Member" : "Bloom Member"}
                        </span>
                      </div>

                      <p className="mt-0.5 text-xs text-neutral-400">{link.child_email}</p>
                      {profile?.username && (
                        <p className="mt-0.5 text-xs text-neutral-500">@{profile.username}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {link.subscription_tier === "free" ? (
                        <button
                          type="button"
                          onClick={() => setConfirmUpgradeId(link.id)}
                          className="rounded-lg border border-violet-700/50 bg-violet-950/20 px-2.5 py-1 text-[11px] text-violet-400 hover:bg-violet-950/40 transition"
                        >
                          Upgrade +$5/mo
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDowngradeId(link.id)}
                          className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-[11px] text-neutral-400 hover:bg-[rgba(120,120,120,0.16)] transition"
                        >
                          Downgrade
                        </button>
                      )}

                      {(link.status === "pending" || isExpired) && (
                        <button
                          type="button"
                          onClick={() => void resendInvite(link)}
                          className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-[rgba(120,120,120,0.16)] transition"
                        >
                          Resend Invite
                        </button>
                      )}

                      {link.status === "active" && link.child_user_id && (
                        <button
                          type="button"
                          onClick={() => toggleChild(link.child_user_id!)}
                          className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-[rgba(120,120,120,0.16)] transition"
                        >
                          {isExpanded ? "Hide Manuscripts" : "View Manuscripts"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(link.id)}
                        className="rounded-lg border border-red-700/40 bg-red-950/10 px-2.5 py-1 text-[11px] text-red-400 hover:bg-red-950/20 transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Read-only manuscript view */}
                  {isExpanded && link.child_user_id && (
                    <div className="border-t border-[rgba(120,120,120,0.2)] bg-[rgba(0,0,0,0.2)] px-4 py-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
                        Manuscripts - Read Only
                      </h4>
                      {!childMss || childMss === undefined ? (
                        <p className="text-xs text-neutral-500">Loading…</p>
                      ) : childMss.length === 0 ? (
                        <p className="text-xs text-neutral-500">No manuscripts uploaded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {childMss.map((ms) => (
                            <div
                              key={ms.id}
                              className="rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.06)] px-3 py-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <Link
                                    href={`/manuscripts/${ms.id}/details?from=parent`}
                                    className="text-sm font-medium text-neutral-200 hover:text-white hover:underline"
                                  >
                                    {ms.title}
                                  </Link>
                                  <p className="mt-0.5 text-xs text-neutral-500">
                                    {ms.genre ?? "Uncategorized"} ·{" "}
                                    {new Date(ms.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {ms.parent_disabled ? (
                                    <button
                                      type="button"
                                      onClick={() => void reinstateManuscript(ms.id, link.child_user_id!)}
                                      className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-950/40 transition"
                                    >
                                      Reinstate
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDisableMs({ id: ms.id, title: ms.title, childId: link.child_user_id! })}
                                      className="rounded-lg border border-amber-700/40 bg-amber-950/10 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-950/25 transition"
                                    >
                                      Disable
                                    </button>
                                  )}
                                  {ms.parent_disabled && (
                                    <span className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                              </div>
                              {ms.parent_disabled && ms.parent_disabled_reason && (
                                <p className="mt-1 text-[10px] text-amber-500/70">Reason: {ms.parent_disabled_reason}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Plan info */}
        <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6 space-y-4">
          <h2 className="text-base font-semibold">Youth Account Plans</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.08)] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-100">Bloom Member</p>
                <span className="text-xs font-bold text-neutral-400">$0/mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                Child earns and spends Bloom Coins like a standard Bloom Member. First 3 chapters
                free per manuscript, additional chapters cost 10 coins each. Up to 3 reader slots
                per manuscript.
              </p>
            </div>
            <div className="rounded-lg border border-violet-700/40 bg-violet-950/10 px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-100">Lethal Member</p>
                <span className="text-xs font-bold text-violet-400">+$5 / mo</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                Unlimited manuscript and chapter uploads. Unlimited beta reader slots. Billed as
                an add-on to your subscription at half the standard rate.
              </p>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Subscription changes take effect on your next billing cycle.
          </p>
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-800/40 bg-amber-950/10 px-4 py-3">
              <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
                <span className="font-semibold">Removing a linked account:</span> If you remove a
                child&apos;s account from your profile, the +$5/mo charge for that profile is
                removed and your subscription returns to the standard $10/mo rate on your next
                billing cycle. The child&apos;s account remains active but will no longer be
                connected to yours. <span className="font-semibold">This action is permanent - a removed youth account cannot be relinked.</span>
              </p>
            </div>
            <div className="rounded-lg border border-blue-800/40 bg-blue-950/10 px-4 py-3">
              <p className="text-xs text-blue-700 dark:text-blue-300/90 leading-relaxed">
                <span className="font-semibold">When a child turns 18:</span> The youth account is
                automatically removed from your profile on their 18th birthday. Their account is
                immediately upgraded to a full adult account with all restrictions lifted and
                complete platform access granted. The +$5/mo charge for that profile stops at the
                same time.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.14)] p-6">
          <h2 className="text-base font-semibold mb-4">How It Works</h2>
          <ol className="space-y-3 text-sm text-neutral-300 list-decimal pl-5">
            <li>
              Enter your child&apos;s name, date of birth, and email address. Their birth date is
              stored securely and never shown publicly.
            </li>
            <li>
              An invite email is sent to your child. They click the link to finish setting up
              their account, which is automatically linked to yours.
            </li>
            <li>
              Youth accounts follow all platform safety rules: direct messaging is disabled,
              content is restricted to YA and MG categories, and you receive a notification every
              time they publish.
            </li>
            <li>
              You have read-only access to your child&apos;s manuscripts from this page. You can
              remove the link at any time - the child&apos;s account remains active but is no
              longer connected to yours, and the additional subscription charge stops.
            </li>
            <li>
              When a child turns 18, the link is automatically removed, their account becomes a
              full adult account with no restrictions, and the +$5/mo charge ends.
            </li>
          </ol>
        </section>
      </div>
    </main>

      {/* Upgrade confirmation modal */}
      {confirmUpgradeId && (() => {
        const target = links.find((l) => l.id === confirmUpgradeId);
        if (!target) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-white">Upgrade to Lethal Member?</h2>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                This will add{" "}
                <span className="font-semibold text-neutral-200">$5/mo</span> for{" "}
                <span className="font-semibold text-neutral-200">{target.child_name}</span> to your
                subscription. The charge will appear on your next billing cycle.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmUpgradeId(null)}
                  className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void updateTier(confirmUpgradeId, "unlimited"); setConfirmUpgradeId(null); }}
                  className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition"
                >
                  Confirm upgrade
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Downgrade confirmation modal */}
      {confirmDowngradeId && (() => {
        const target = links.find((l) => l.id === confirmDowngradeId);
        if (!target) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-white">Downgrade to Bloom Member?</h2>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                <span className="font-semibold text-neutral-200">{target.child_name}</span> will lose
                their Lethal Member benefits - unlimited manuscripts, chapters, and reader slots - and
                revert to the free Bloom Member tier. The{" "}
                <span className="font-semibold text-neutral-200">$5/mo</span> add-on charge will be
                removed from your next billing cycle.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDowngradeId(null)}
                  className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void updateTier(confirmDowngradeId, "free"); setConfirmDowngradeId(null); }}
                  className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition"
                >
                  Confirm downgrade
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Remove confirmation modal */}
      {confirmRemoveId && (() => {
        const target = links.find((l) => l.id === confirmRemoveId);
        if (!target) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-white">Remove linked account?</h2>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                You are about to remove{" "}
                <span className="font-semibold text-neutral-200">{target.child_name}</span> from your
                profile. Their account will remain active but will no longer be connected to yours.
              </p>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                {target.subscription_tier === "unlimited"
                  ? <>
                      Their Lethal Member access was provided at a discounted rate of{" "}
                      <span className="font-semibold text-neutral-200">$5/mo</span> through your
                      account. Once removed, they will lose that access and revert to the free Bloom
                      Member tier. The $5/mo charge will be removed from your next billing cycle.
                    </>
                  : <>
                      Their free Bloom Member account was linked to your profile. Once removed, they
                      will retain their free account but will no longer qualify for the discounted{" "}
                      <span className="font-semibold text-neutral-200">$5/mo</span> Lethal Member
                      rate that is only available through a linked parent account.
                    </>
                }
              </p>
              <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2.5">
                <p className="text-xs text-red-400 leading-relaxed font-medium">
                  This action is permanent. A removed youth account cannot be relinked.
                </p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveId(null)}
                  className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void removeLink(confirmRemoveId); setConfirmRemoveId(null); }}
                  className="rounded-lg border border-red-800/60 bg-red-950/20 px-4 py-1.5 text-sm text-red-400 hover:bg-red-950/40 transition"
                >
                  Remove account
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Disable manuscript modal */}
      {confirmDisableMs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Disable &ldquo;{confirmDisableMs.title}&rdquo;?</h2>
            <p className="text-sm text-neutral-400 mb-4">This will unpublish the manuscript and block all access until you reinstate it. Select a reason:</p>
            <div className="space-y-2 mb-5">
              {DISABLE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDisableMsReason(r)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${disableMsReason === r ? "border-amber-600/70 bg-amber-950/30 text-amber-200" : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.5)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setConfirmDisableMs(null); setDisableMsReason(""); }} className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition">
                Cancel
              </button>
              <button
                type="button"
                disabled={!disableMsReason || disableMsSubmitting}
                onClick={() => void disableManuscript(confirmDisableMs.id, confirmDisableMs.childId, disableMsReason)}
                className="rounded-lg border border-amber-700/60 bg-amber-950/20 px-4 py-1.5 text-sm text-amber-300 hover:bg-amber-950/40 disabled:opacity-50 transition"
              >
                {disableMsSubmitting ? "Disabling…" : "Confirm Disable"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
