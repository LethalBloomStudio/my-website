"use client";

export const dynamic = "force-dynamic";

import type React from "react";
import { Suspense } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ManuscriptLayout from "@/components/ManuscriptLayout";
import OutOfCoinsModal from "@/components/OutOfCoinsModal";
import ProfileImageUpload from "@/components/ProfileImageUpload";
import ProseTextarea from "@/components/ProseTextarea";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { ageCategoryFromDob } from "@/lib/contentPolicy";
import { genreOptionsForAgeCategory } from "@/lib/profileOptions";
import { hasYouthAudienceCategory } from "@/lib/manuscriptAudience";

const REQUESTED_FEEDBACK_DESCRIPTIONS: Record<"bloom" | "forge" | "lethal", string> = {
  bloom: "Encouraging, supportive feedback focused on clarity, flow, and what is already working.",
  forge: "Balanced, craft-focused critique that highlights strengths while pushing revisions forward.",
  lethal: "Direct, rigorous feedback with sharp line and structure notes to strengthen the manuscript fast.",
};

function NewManuscriptInner() {
  type Visibility = "private" | "public";
  type FeedbackLevel = "bloom" | "forge" | "lethal";
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();
  const [title, setTitle] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [coverUrl, setCoverUrl] = useState("");
  const [description, setDescription] = useState("");
  const [requestedFeedback, setRequestedFeedback] = useState<FeedbackLevel>("bloom");
  const [potentialTriggers, setPotentialTriggers] = useState("");
  const [isMatureContent, setIsMatureContent] = useState(false);
  const [isPotentiallyTriggering, setIsPotentiallyTriggering] = useState(false);
  const [copyrightInfo, setCopyrightInfo] = useState("");
  const [profileAgeCategory, setProfileAgeCategory] = useState<"youth_13_17" | "adult_18_plus">("adult_18_plus");
  const [memberTier, setMemberTier] = useState<"bloom" | "forge" | "lethal">("bloom");
  const [coinBalance, setCoinBalance] = useState(0);
  const [manuscriptCount, setManuscriptCount] = useState(0);
  const [showPurchasePrompt, setShowPurchasePrompt] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const genreOptions = genreOptionsForAgeCategory(profileAgeCategory);
  const sortedGenreOptions = useMemo(() => [...genreOptions].sort((a, b) => a.localeCompare(b)), [genreOptions]);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  function friendlyDbError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("row-level security") || m.includes("permission denied")) {
      return "Permission blocked by database policy. Run the manuscript policy SQL fix, then retry.";
    }
    return message;
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("accounts")
        .select("age_category, dob, bloom_coins, subscription_status")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      const row = data as { age_category?: string | null; dob?: string | null; bloom_coins?: number | null; subscription_status?: string | null } | null;
      const inferred =
        row?.age_category === "youth_13_17" || row?.age_category === "adult_18_plus"
          ? row.age_category
          : ageCategoryFromDob(row?.dob ?? null);
      setProfileAgeCategory(inferred);
      setCoinBalance(Number(row?.bloom_coins ?? 0));

      const { data: profile } = await supabase.from("public_profiles").select("writer_level, feedback_preference").eq("user_id", auth.user.id).maybeSingle();
      const writerLevel = (profile as { writer_level?: string | null; feedback_preference?: string | null } | null)?.writer_level;
      const profileFeedback = (profile as { writer_level?: string | null; feedback_preference?: string | null } | null)?.feedback_preference;
      const subscription = (row?.subscription_status ?? "").toLowerCase();
      const lethalFromSubscription = subscription.includes("lethal");
      setMemberTier(writerLevel === "lethal" || lethalFromSubscription ? "lethal" : writerLevel === "forge" ? "forge" : "bloom");

      // Map profile feedback_preference to manuscript requested_feedback values
      const feedbackMap: Record<string, FeedbackLevel> = { gentle: "bloom", balanced: "forge", direct: "lethal" };
      const mappedFeedback = profileFeedback ? (feedbackMap[profileFeedback] ?? "bloom") : "bloom";
      setRequestedFeedback(mappedFeedback);

      const { count } = await supabase.from("manuscripts").select("id", { count: "exact", head: true }).eq("owner_id", auth.user.id);
      setManuscriptCount(Number(count ?? 0));
    })();
  }, [supabase]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(e.target as Node)) setCategoryOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function categoryLimit(nextCategories: string[]) {
    if (profileAgeCategory === "youth_13_17") return 2;
    return hasYouthAudienceCategory(nextCategories, null) ? 2 : 5;
  }

  async function spendBloomCoins(amount: number, reason: string, metadata: Record<string, unknown>) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return { ok: false as const, error: "Please log in." };
    if (amount <= 0) return { ok: true as const };

    const nextBalance = coinBalance - amount;
    if (nextBalance < 0) {
      return { ok: false as const, error: `You need ${amount} Bloom Coins. Current balance: ${coinBalance}.` };
    }

    const { data: updated, error: updateError } = await supabase
      .from("accounts")
      .update({ bloom_coins: nextBalance })
      .eq("user_id", uid)
      .eq("bloom_coins", coinBalance)
      .select("user_id")
      .maybeSingle();
    if (updateError || !updated) {
      return { ok: false as const, error: "Could not charge Bloom Coins. Please refresh and try again." };
    }

    const { error: ledgerError } = await supabase.from("bloom_coin_ledger").insert({
      user_id: uid,
      delta: -amount,
      reason,
      metadata,
    });
    if (ledgerError) {
      return { ok: false as const, error: ledgerError.message };
    }

    setCoinBalance(nextBalance);
    return { ok: true as const };
  }

  async function submit() {
    setMsg(null);
    setShowPurchasePrompt(false);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setMsg("Please log in.");

    if (!title.trim()) return setMsg("Please add a title.");
    if (selectedCategories.length === 0) return setMsg("Please choose at least one category.");
    const limit = categoryLimit(selectedCategories);
    if (selectedCategories.length > limit) {
      return setMsg(`You can select up to ${limit} categories for this manuscript.`);
    }
    const youthAudienceCategory = hasYouthAudienceCategory(selectedCategories, null);
    const ageRating = profileAgeCategory === "youth_13_17" || youthAudienceCategory ? "teen_safe" : "adult";

    const isLethalMember = memberTier === "lethal";
    const hasPrepaidUnlock = searchParams.get("unlock") === "paid";
    const needsPaidManuscriptUnlock = !isLethalMember && manuscriptCount >= 1 && !hasPrepaidUnlock;
    if (needsPaidManuscriptUnlock && coinBalance < 10) {
      setShowPurchasePrompt(true);
      return setMsg("Your first manuscript is free. Additional manuscripts require 10 Bloom Coins and include 1 chapter.");
    }

    const contentWarnings: string[] = [];
    if (isMatureContent) contentWarnings.push("Mature Content");
    if (isPotentiallyTriggering) contentWarnings.push("Potentially Triggering Content");
    const allCategories = [...selectedCategories, ...contentWarnings];

    const payload = {
      owner_id: auth.user.id,
      title,
      genre: selectedCategories[0] ?? null,
      categories: allCategories,
      description,
      requested_feedback: requestedFeedback,
      potential_triggers: potentialTriggers,
      copyright_info: copyrightInfo,
      cover_url: coverUrl || null,
      age_rating: ageRating,
      visibility,
      word_count: 0,
      content: "",
    };

    let insertResult = await supabase.from("manuscripts").insert(payload).select("id").single();

    if (insertResult.error?.message?.toLowerCase().includes("could not find the 'categories' column")) {
      const fallbackPayload = {
        owner_id: payload.owner_id,
        title: payload.title,
        genre: payload.genre,
        description: payload.description,
        requested_feedback: payload.requested_feedback,
        potential_triggers: payload.potential_triggers,
        copyright_info: payload.copyright_info,
        cover_url: payload.cover_url,
        age_rating: payload.age_rating,
        visibility: payload.visibility,
        word_count: 0,
        content: "",
      };
      insertResult = await supabase.from("manuscripts").insert(fallbackPayload).select("id").single();
    }

    const { data: inserted, error } = insertResult;

    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }

    if (inserted?.id) {
      if (needsPaidManuscriptUnlock) {
        const charge = await spendBloomCoins(10, "manuscript_unlock", {
          manuscript_id: inserted.id,
          included_free_chapters: 1,
        });
        if (!charge.ok) {
          setShowPurchasePrompt(true);
          await supabase.from("manuscripts").delete().eq("id", inserted.id);
          setMsg(charge.error);
          return;
        }
      }
      router.push(`/manuscripts/${inserted.id}/details`);
      return;
    }

    setMsg("Posted.");
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) return prev.filter((c) => c !== category);
      const next = [...prev, category];
      const limit = categoryLimit(next);
      if (next.length > limit) {
        setMsg(
          profileAgeCategory === "youth_13_17" || hasYouthAudienceCategory(next, null)
            ? "You can select up to 2 categories for this manuscript."
            : "You can select up to 5 categories for this manuscript.",
        );
        return prev;
      }
      return next;
    });
  }

  const detailItems = [
    { label: "Visibility", value: visibility === "public" ? "Public" : "Private" },
    { label: "Categories", value: selectedCategories.length ? selectedCategories.join(", ") : "Not set" },
    { label: "Requested feedback", value: requestedFeedback },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <ManuscriptLayout
          title={title.trim() || "Untitled manuscript"}
          coverUrl={coverUrl || null}
          categories={selectedCategories}
          chapters={[]}
          activeChapterId={null}
          details={detailItems}
          emptyChaptersText="Chapters will appear after you save your manuscript."
          rightHeader={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">New manuscript</p>
                <h1 className="text-xl font-semibold text-white">{title.trim() || "Untitled manuscript"}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/manuscripts"
                  className="workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Back to manuscripts
                </Link>
                <div className="workspace-btn inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium">
                  <span className="text-base leading-none" style={{ color: "#f59e0b" }}>✿</span>
                  <span>{coinBalance.toLocaleString()} Bloom Coins</span>
                </div>
              </div>
            </div>
          }
        >
          <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <div className="mb-5 border-b border-[rgba(120,120,120,0.2)] pb-4">
              <p className="text-sm text-neutral-300">
                Age category: {profileAgeCategory === "youth_13_17" ? "Youth 13-17" : "Adult 18+"}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {memberTier === "lethal"
                  ? "Lethal members: unlimited manuscripts and chapter uploads."
                  : manuscriptCount === 0
                    ? "First manuscript is free and includes 3 free chapters."
                    : "Additional manuscripts cost 10 Bloom Coins each and include 1 chapter."}{" "}
                Balance: {coinBalance} Bloom Coins.
              </p>
              {searchParams.get("unlock") === "paid" && memberTier !== "lethal" ? (
                <p className="mt-1 text-xs text-neutral-300">
                  Additional manuscript upload already unlocked with Bloom Coins for this session.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4">
              <label className="block">
                <div className="text-sm text-neutral-300">Book cover</div>
                <p className="mt-1 text-xs text-neutral-500">Recommended size: 600 × 900 px (2:3 ratio). JPG or PNG.</p>
                <div className="mt-2">
                  <ProfileImageUpload
                    name="cover_url"
                    initialUrl={coverUrl}
                    bucket="manuscript-covers"
                    uploadButtonLabel="Upload cover"
                    previewAlt="Book cover preview"
                    onUploadedUrl={setCoverUrl}
                  />
                </div>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Title</div>
                <input
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                  placeholder="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Categories</div>
                <div ref={categoryMenuRef} className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setCategoryOpen((v) => !v)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-left text-sm text-neutral-200"
                  >
                    {selectedCategories.length > 0 ? selectedCategories.join(", ") : "Select up to 5 categories"}
                  </button>
                  {categoryOpen ? (
                    <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
                      {sortedGenreOptions.map((g) => {
                        const checked = selectedCategories.includes(g);
                        const limit = categoryLimit(checked ? selectedCategories : [...selectedCategories, g]);
                        const disabled = !checked && selectedCategories.length >= limit;
                        return (
                          <button
                            key={g}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleCategory(g)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition ${
                              checked
                                ? "bg-[rgba(120,120,120,0.2)] text-neutral-100"
                                : disabled
                                ? "cursor-not-allowed text-neutral-600"
                                : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                            }`}
                          >
                            <span>{g}</span>
                            {checked && <span className="text-xs text-neutral-400">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                    <p className="text-xs text-neutral-500">
                      Selected: {selectedCategories.length}/{categoryLimit(selectedCategories)}
                      {selectedCategories.length > 0 ? ` - ${selectedCategories.join(", ")}` : ""}
                    </p>
                    {profileAgeCategory !== "youth_13_17" && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Up to 5 categories, or up to 2 when YA/MG is selected.
                      </p>
                    )}
                  </div>
                </div>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Age Category</div>
                <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200">
                  {profileAgeCategory === "youth_13_17" || hasYouthAudienceCategory(selectedCategories, null)
                    ? "Youth 13-17 (Restricted)"
                    : "Adult 18+"}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Set automatically from your profile and selected categories (YA/MG are youth-accessible).
                </p>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Publish setting</div>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                >
                  <option value="private">Save as Draft (Private)</option>
                  <option value="public">Publish Now (Public)</option>
                </select>
                <p className="mt-2 text-xs text-neutral-500">
                  Drafts are private. Published manuscripts can appear in Discover.
                </p>
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Book description</div>
                <ProseTextarea
                  rows={4}
                  value={description}
                  onChange={setDescription}
                  placeholder="What readers should know about your book..."
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                />
              </label>

              <div className="block">
                <div className="text-sm text-neutral-300">Feedback &amp; Content</div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Requested Feedback</p>
                    <p className="mt-1 text-sm font-medium capitalize text-neutral-200">{requestedFeedback}</p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-400">{REQUESTED_FEEDBACK_DESCRIPTIONS[requestedFeedback]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMatureContent((v) => !v)}
                    className={`rounded-lg border px-4 py-3 text-left transition ${isMatureContent ? "border-amber-600/50 bg-amber-950/25" : "border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/60"}`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Content Flag</p>
                    <p className={`mt-1 text-sm font-medium ${isMatureContent ? "text-amber-300" : "text-neutral-400"}`}>Mature Content</p>
                    <p className="mt-1 text-xs text-neutral-500">{isMatureContent ? "Flagged ✓" : "Click to flag"}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPotentiallyTriggering((v) => !v)}
                    className={`rounded-lg border px-4 py-3 text-left transition ${isPotentiallyTriggering ? "border-rose-600/50 bg-rose-950/25" : "border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/60"}`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Content Warning</p>
                    <p className={`mt-1 text-sm font-medium ${isPotentiallyTriggering ? "text-rose-300" : "text-neutral-400"}`}>May Contain Triggering Content</p>
                    <p className="mt-1 text-xs text-neutral-500">{isPotentiallyTriggering ? "Flagged ✓" : "Click to flag"}</p>
                  </button>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Requested feedback is set from your profile. To change it, update your{" "}
                  <Link href="/profile" className="text-neutral-300 underline hover:text-white">profile settings</Link>.
                </p>
              </div>

              <label className="block">
                <div className="text-sm text-neutral-300">Potential triggers</div>
                <ProseTextarea
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                  value={potentialTriggers}
                  onChange={setPotentialTriggers}
                  placeholder="List sensitive themes/content warnings."
                />
              </label>

              <label className="block">
                <div className="text-sm text-neutral-300">Copyright info</div>
                <ProseTextarea
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
                  value={copyrightInfo}
                  onChange={setCopyrightInfo}
                  placeholder="Copyright notice or ownership statement."
                />
              </label>

              <button
                onClick={submit}
                className="inline-flex h-11 w-48 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] px-4 text-sm font-medium text-white hover:bg-[#606060]"
              >
                {visibility === "public" ? "Publish" : "Save Draft"}
              </button>

              {msg && (
                <p className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm text-neutral-200">
                  {msg}
                </p>
              )}
            </div>
          </section>
        </ManuscriptLayout>

        {showPurchasePrompt && <OutOfCoinsModal onClose={() => setShowPurchasePrompt(false)} />}
      </div>
    </main>
  );
}

export default function NewManuscript() {
  return (
    <Suspense>
      <NewManuscriptInner />
    </Suspense>
  );
}
