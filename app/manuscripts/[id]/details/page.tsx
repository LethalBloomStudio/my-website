"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unused-expressions */

export const dynamic = "force-dynamic";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ManuscriptLayout, { DetailRow } from "@/components/ManuscriptLayout";
import OutOfCoinsModal from "@/components/OutOfCoinsModal";
import ProfileImageUpload from "@/components/ProfileImageUpload";
import ProseTextarea from "@/components/ProseTextarea";
import ChapterEditor from "@/components/ChapterEditor";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { countWords } from "@/lib/format/normalizeManuscript";
import { normalizeChapterText, chapterTextToPreviewHtml } from "@/lib/format/chapterNormalize";
import { genreOptionsForAgeCategory, WRITER_LEVELS, FEEDBACK_PREFERENCE_OPTIONS } from "@/lib/profileOptions";
import { hasYouthAudienceCategory } from "@/lib/manuscriptAudience";

type Manuscript = {
  id: string;
  owner_id: string;
  created_at: string;
  title: string;
  visibility: "private" | "public";
  genre: string | null;
  categories: string[] | null;
  age_rating: "teen_safe" | "adult";
  cover_url: string | null;
  description: string | null;
  requested_feedback: string | null;
  potential_triggers: string | null;
  copyright_info: string | null;
};

type Chapter = {
  id: string;
  chapter_order: number;
  title: string;
  content: string;
  is_private: boolean;
  created_at: string;
};

type AcceptedReader = {
  user_id: string;
  avatar_url: string | null;
  pen_name: string | null;
  username: string | null;
  disabled?: boolean;
  left?: boolean;
  suspended?: boolean;
};

type PendingRequest = {
  user_id: string;
  avatar_url: string | null;
  pen_name: string | null;
  username: string | null;
  isYouth?: boolean;
};

type LineFeedback = {
  id: string;
  reader_id: string;
  chapter_id: string | null;
  selection_excerpt: string;
  comment_text: string;
  created_at: string;
  resolved: boolean;
  author_response?: "agree" | "disagree" | null;
};
type FeedbackReply = { id: string; feedback_id: string; replier_id: string; body: string; created_at: string };

const REWARD_REASONS = [
  "Amazing feedback",
  "Very detailed feedback",
  "Incredibly helpful notes",
  "Caught critical errors",
  "Exceptional line edits",
  "Above and beyond effort",
] as const;

const PARENT_DISABLE_REASONS = [
  "Inappropriate content",
  "Safety concern",
  "Content needs review",
  "Temporary pause requested",
  "Other parental concern",
] as const;

export default function ManuscriptDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const manuscriptId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const isParentView = searchParams?.get("from") === "parent";
  const urlParamsApplied = useRef(false);

  const [loading, setLoading] = useState(true);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteProjectModal, setDeleteProjectModal] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const [coverUrl, setCoverUrl] = useState("");
  const [manuscriptTitle, setManuscriptTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedFeedback, setRequestedFeedback] = useState<"bloom" | "forge" | "lethal">("bloom");
  const [profileFeedbackPreference, setProfileFeedbackPreference] = useState<string>("gentle");
  const [potentialTriggers, setPotentialTriggers] = useState("");
  const [copyrightInfo, setCopyrightInfo] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileAgeCategory, setProfileAgeCategory] = useState<"youth_13_17" | "adult_18_plus">("adult_18_plus");
  const [memberTier, setMemberTier] = useState<"bloom" | "forge" | "lethal">("bloom");
  const [coinBalance, setCoinBalance] = useState(0);
  const [freeChapterLimit, setFreeChapterLimit] = useState(3);
  const [manuscriptSequence, setManuscriptSequence] = useState(1);
  const [acceptedReaders, setAcceptedReaders] = useState<AcceptedReader[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [parentDisabled, setParentDisabled] = useState(false);
  const [parentDisabledReason, setParentDisabledReason] = useState<string | null>(null);
  const [parentDisableModal, setParentDisableModal] = useState(false);
  const [parentDisableReason, setParentDisableReason] = useState("");
  const [parentDisableSubmitting, setParentDisableSubmitting] = useState(false);
  const [parentActionMsg, setParentActionMsg] = useState<string | null>(null);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [readerSlots, setReaderSlots] = useState(3);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const [readerCanScrollLeft, setReaderCanScrollLeft] = useState(false);
  const [readerCanScrollRight, setReaderCanScrollRight] = useState(false);
  const [showUploadPurchasePrompt, setShowUploadPurchasePrompt] = useState(false);
  const [coinConfirm, setCoinConfirm] = useState<{ amount: number; label: string; onConfirm: () => void } | null>(null);
  const [rewardModal, setRewardModal] = useState<{ reader: AcceptedReader } | null>(null);
  const [rewardAmount, setRewardAmount] = useState<5 | 10>(5);
  const [rewardReason, setRewardReason] = useState("");
  const [authorUserId, setAuthorUserId] = useState<string | null>(null);
  const [manuscriptLedger, setManuscriptLedger] = useState<{ id: string; delta: number; reason: string; created_at: string }[]>([]);
  const [readerCompletions, setReaderCompletions] = useState<{ chapter_id: string; reader_id: string; coins_awarded: number; completed_at: string }[]>([]);
  const [readerNames, setReaderNames] = useState<Record<string, string>>({});
  const [feedbackItems, setFeedbackItems] = useState<LineFeedback[]>([]);
  const [feedbackReplies, setFeedbackReplies] = useState<FeedbackReply[]>([]);
  const [parentReportModal, setParentReportModal] = useState<{ readerId: string; readerName: string; feedbackExcerpt: string } | null>(null);
  const [parentReportReason, setParentReportReason] = useState("");
  const [parentReportSubmitting, setParentReportSubmitting] = useState(false);
  const [parentReportDone, setParentReportDone] = useState(false);
  const [parentReportMsg, setParentReportMsg] = useState<string | null>(null);
  const replyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const replyTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [feedbackFilter, setFeedbackFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const [overviewFeedbackFilter, setOverviewFeedbackFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const [overviewExpandedIds, setOverviewExpandedIds] = useState<Set<string>>(new Set());
  const [feedbackNames, setFeedbackNames] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [ownerPenName, setOwnerPenName] = useState("");
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const feedbackAsideRef = useRef<HTMLElement>(null);
  const [navH, setNavH] = useState(0);
  type MarkerInfo = { top: number; left: number; highlightRects: { top: number; left: number; width: number; height: number }[] };
  const [markerInfos, setMarkerInfos] = useState<Record<string, MarkerInfo>>({});

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterEditorTitle, setChapterEditorTitle] = useState("");
  const [chapterEditorContent, setChapterEditorContent] = useState("");
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  // Track the last content/title that was actually saved to DB to avoid unnecessary writes
  const lastSavedContent = useRef<string>("");
  const lastSavedTitle = useRef<string>("");
  const genreOptions = genreOptionsForAgeCategory(profileAgeCategory);
  const sortedGenreOptions = useMemo(() => [...genreOptions].sort((a, b) => a.localeCompare(b)), [genreOptions]);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Navbar height (keeps the sticky aside flush below the nav) ────────────
  useLayoutEffect(() => {
    const nav = document.querySelector(".navWrap") as HTMLElement | null;
    if (!nav) return;
    const update = () => setNavH(nav.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChapterId) return;
    const contentChanged = chapterEditorContent !== lastSavedContent.current;
    const titleChanged = chapterEditorTitle !== lastSavedTitle.current;
    if (!contentChanged && !titleChanged) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("idle");

    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        if (!chapterEditorContent.trim()) return;
        setAutoSaveStatus("saving");
        const { error } = await supabase
          .from("manuscript_chapters")
          .update({
            title: chapterEditorTitle.trim() || "Untitled Chapter",
            content: chapterEditorContent.trim(),
          })
          .eq("id", selectedChapterId);
        if (error) {
          setAutoSaveStatus("error");
        } else {
          lastSavedContent.current = chapterEditorContent;
          lastSavedTitle.current = chapterEditorTitle;
          setAutoSaveStatus("saved");
          // Fade back to idle after 3 seconds
          setTimeout(() => setAutoSaveStatus("idle"), 3000);
        }
      })();
    }, 2000);

    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterEditorContent, chapterEditorTitle, selectedChapterId]);

  function friendlyDbError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("row-level security") || m.includes("permission denied")) {
      return "Permission blocked by database policy. Run the manuscript policy SQL fix, then retry.";
    }
    return message;
  }

  async function replyToFeedback(feedbackId: string) {
    const body = (replyDrafts[feedbackId] ?? "").trim();
    if (!body || !authorUserId) return;
    const res = await fetch("/api/manuscript/feedback/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: feedbackId, body }),
    });
    const json = (await res.json()) as { ok?: boolean; reply?: FeedbackReply; error?: string };
    if (!res.ok || json.error) return setMsg(json.error ?? "Failed to submit reply.");
    setReplyDrafts((p) => ({ ...p, [feedbackId]: "" }));
    const ta = replyTextareaRefs.current.get(feedbackId);
    if (ta) { ta.style.height = "auto"; }
    if (json.reply) setFeedbackReplies((p) => [...p, json.reply!]);
  }

  async function resolveFeedback(feedbackId: string, response: "agree" | "disagree") {
    const { error } = await supabase.from("line_feedback").update({ resolved: true, author_response: response }).eq("id", feedbackId);
    if (error) return setMsg(error.message);
    if (selectedFeedbackId === feedbackId) { setSelectedFeedbackId(null); }
    setFeedbackItems((prev) => prev.map((f) => f.id === feedbackId ? { ...f, resolved: true, author_response: response } : f));
  }

  async function submitParentReport() {
    if (!parentReportModal || !parentReportReason || !authorUserId) return;
    setParentReportSubmitting(true);
    setParentReportMsg(null);
    try {
      const res = await fetch("/api/manage-youth/report-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youth_user_id: authorUserId,
          reported_user_id: parentReportModal.readerId,
          reason: parentReportReason,
          feedback_excerpt: parentReportModal.feedbackExcerpt,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        setParentReportDone(true);
        setParentReportMsg("Report submitted. The user has been restricted pending admin review.");
      } else {
        setParentReportMsg(json.error ?? "Failed to submit report.");
      }
    } finally {
      setParentReportSubmitting(false);
    }
  }

  async function handleParentDisable() {
    if (!manuscript || !parentDisableReason) return;
    setParentDisableSubmitting(true);
    setParentActionMsg(null);
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: manuscript.id, action: "disable", reason: parentDisableReason }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setParentDisableSubmitting(false);
    if (!res.ok || json.error) { setParentActionMsg(json.error ?? "Failed."); return; }
    setParentDisabled(true);
    setParentDisabledReason(parentDisableReason);
    setParentDisableModal(false);
    setParentDisableReason("");
    setParentActionMsg("Manuscript disabled.");
  }

  async function handleParentReinstate() {
    if (!manuscript) return;
    setParentDisableSubmitting(true);
    setParentActionMsg(null);
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: manuscript.id, action: "reinstate" }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setParentDisableSubmitting(false);
    if (!res.ok || json.error) { setParentActionMsg(json.error ?? "Failed."); return; }
    setParentDisabled(false);
    setParentDisabledReason(null);
    setParentActionMsg("Manuscript reinstated.");
  }

  async function load() {
    if (!manuscriptId) {
      setMsg("Missing manuscript id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg(null);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      router.push("/sign-in");
      return;
    }

    // Parent view: load all workspace data via server API (bypasses RLS)
    if (isParentView) {
      try {
        const res = await fetch(`/api/manage-youth/manuscript-workspace?manuscript_id=${manuscriptId}`);
        if (!res.ok) {
          const json = await res.json() as { error?: string };
          setMsg(json.error ?? "Failed to load manuscript.");
          setLoading(false);
          return;
        }
        const d = await res.json() as {
          manuscript: Manuscript & { parent_disabled?: boolean; parent_disabled_reason?: string | null };
          chapters: Chapter[];
          acceptedReaders: AcceptedReader[];
          pendingRequests: PendingRequest[];
          ownerAllFeedback: LineFeedback[];
          allReplies: FeedbackReply[];
          names: Record<string, string>;
          parentDisabled: boolean;
          parentDisabledReason: string | null;
        };
        const ms = d.manuscript;
        setManuscript(ms);
        setManuscriptTitle(ms.title ?? "");
        setCoverUrl(ms.cover_url ?? "");
        setDescription(ms.description ?? "");
        setRequestedFeedback(
          ms.requested_feedback === "forge" || ms.requested_feedback === "lethal" || ms.requested_feedback === "bloom"
            ? ms.requested_feedback : "bloom"
        );
        setPotentialTriggers(ms.potential_triggers ?? "");
        setCopyrightInfo(ms.copyright_info ?? "");
        setSelectedCategories(
          ms.categories && ms.categories.length > 0 ? ms.categories : ms.genre ? [ms.genre] : []
        );
        setChapters(d.chapters);
        setAcceptedReaders(d.acceptedReaders);
        setReaderSlots(Math.max(3, d.acceptedReaders.length));
        setPendingRequests(d.pendingRequests);
        setFeedbackItems(d.ownerAllFeedback);
        setFeedbackReplies(d.allReplies);
        const nm: Record<string, string> = {};
        Object.entries(d.names).forEach(([uid, name]) => { nm[uid] = name; });
        setFeedbackNames(nm);
        setAuthorUserId(ms.owner_id);
        setParentDisabled(d.parentDisabled);
        setParentDisabledReason(d.parentDisabledReason);
      } catch {
        setMsg("Failed to load manuscript.");
      }
      setLoading(false);
      return;
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("age_category, subscription_status, bloom_coins")
      .eq("user_id", userId)
      .maybeSingle();
    const accountRow = (account as { age_category?: string | null; subscription_status?: string | null; bloom_coins?: number | null } | null);
    const ageCategory = accountRow?.age_category;
    setProfileAgeCategory(ageCategory === "youth_13_17" ? "youth_13_17" : "adult_18_plus");
    setCoinBalance(Number(accountRow?.bloom_coins ?? 0));

    const { data: profile } = await supabase
      .from("public_profiles")
      .select("writer_level, feedback_preference, pen_name, username")
      .eq("user_id", userId)
      .maybeSingle();
    const profRow = profile as { writer_level?: string | null; feedback_preference?: string | null; pen_name?: string | null; username?: string | null } | null;
    const writerLevel = profRow?.writer_level;
    const feedbackPref = profRow?.feedback_preference ?? "gentle";
    setOwnerPenName(profRow?.pen_name || (profRow?.username ? `@${profRow.username}` : "Author"));
    setProfileFeedbackPreference(feedbackPref);
    const subscription = (accountRow?.subscription_status ?? "").toLowerCase();
    const lethalFromSubscription = subscription.includes("lethal");
    setMemberTier(writerLevel === "lethal" || lethalFromSubscription ? "lethal" : writerLevel === "forge" ? "forge" : "bloom");

    const { data, error } = await supabase
      .from("manuscripts")
      .select(
        "id, owner_id, created_at, title, visibility, genre, categories, age_rating, cover_url, description, requested_feedback, potential_triggers, copyright_info",
      )
      .eq("id", manuscriptId)
      .single();
    if (error) {
      setMsg(friendlyDbError(error.message));
      setLoading(false);
      return;
    }

    const row = data as Manuscript;
    if (row.owner_id !== userId) {
      setMsg("Only the author can edit manuscript details.");
      setLoading(false);
      return;
    }

    const { data: allManuscripts } = await supabase
      .from("manuscripts")
      .select("id, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    const ordered = (allManuscripts as Array<{ id: string; created_at: string }> | null) ?? [];
    const idx = ordered.findIndex((m) => m.id === manuscriptId);
    const sequence = idx >= 0 ? idx + 1 : 1;
    setManuscriptSequence(sequence);
    setFreeChapterLimit(sequence === 1 ? 3 : 1);

    const { data: chapterData } = await supabase
      .from("manuscript_chapters")
      .select("id, chapter_order, title, content, is_private, created_at")
      .eq("manuscript_id", manuscriptId)
      .order("chapter_order", { ascending: true });

    // Use manuscript_access_grants as source of truth for active readers,
    // and manuscript_access_requests for disabled/left status only
    const [{ data: acceptedRequestRows }, { data: grantRows }] = await Promise.all([
      supabase
        .from("manuscript_access_requests")
        .select("requester_id, status")
        .eq("manuscript_id", manuscriptId)
        .in("status", ["approved", "disabled", "left"]),
      supabase
        .from("manuscript_access_grants")
        .select("reader_id")
        .eq("manuscript_id", manuscriptId),
    ]);
    const requestRows = (acceptedRequestRows as Array<{ requester_id: string; status: string }> | null) ?? [];
    const activeGrantIds = new Set(((grantRows as Array<{ reader_id: string }> | null) ?? []).map((g) => g.reader_id));
    // Merge: any reader in grants OR in requests(approved/disabled/left)
    const allReaderIds = new Set([
      ...activeGrantIds,
      ...requestRows.map((r) => r.requester_id),
    ]);
    const readerIds = Array.from(allReaderIds);
    const disabledSet = new Set(requestRows.filter((r) => r.status === "disabled").map((r) => r.requester_id));
    const leftSet = new Set(requestRows.filter((r) => r.status === "left").map((r) => r.requester_id));
    if (readerIds.length > 0) {
      const [{ data: profileRows }, conductRes] = await Promise.all([
        supabase.from("public_profiles").select("user_id, avatar_url, pen_name, username").in("user_id", readerIds),
        fetch("/api/manuscript/reader-conduct-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: readerIds }),
        }).then((r) => r.json() as Promise<{ suspended?: string[] }>),
      ]);
      const byUserId = new Map<string, AcceptedReader>();
      ((profileRows as AcceptedReader[] | null) ?? []).forEach((row) => byUserId.set(row.user_id, row));
      const suspendedSet = new Set(conductRes.suspended ?? []);
      setAcceptedReaders(
        readerIds.map((id) => ({
          ...(byUserId.get(id) ?? { user_id: id, avatar_url: null, pen_name: null, username: null }),
          disabled: disabledSet.has(id),
          left: leftSet.has(id),
          suspended: suspendedSet.has(id),
        })),
      );
    } else {
      setAcceptedReaders([]);
    }

    // Fetch pending access requests
    const { data: pendingRows } = await supabase
      .from("manuscript_access_requests")
      .select("requester_id")
      .eq("manuscript_id", manuscriptId)
      .eq("status", "pending");
    const pendingIds = ((pendingRows as Array<{ requester_id: string }> | null) ?? []).map((r) => r.requester_id);
    if (pendingIds.length > 0) {
      const [{ data: pendingProfiles }, { data: pendingAccts }] = await Promise.all([
        supabase.from("public_profiles").select("user_id, avatar_url, pen_name, username").in("user_id", pendingIds),
        supabase.from("accounts").select("user_id, age_category").in("user_id", pendingIds),
      ]);
      const youthSet = new Set(
        ((pendingAccts as Array<{ user_id: string; age_category: string | null }> | null) ?? [])
          .filter((a) => a.age_category === "youth_13_17")
          .map((a) => a.user_id)
      );
      const pendingByUserId = new Map<string, PendingRequest>();
      ((pendingProfiles as PendingRequest[] | null) ?? []).forEach((row) =>
        pendingByUserId.set(row.user_id, { ...row, isYouth: youthSet.has(row.user_id) })
      );
      setPendingRequests(
        pendingIds.map((id) => pendingByUserId.get(id) ?? { user_id: id, avatar_url: null, pen_name: null, username: null, isYouth: youthSet.has(id) }),
      );
    } else {
      setPendingRequests([]);
    }

    const { data: slotRows } = await supabase
      .from("bloom_coin_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "extra_reader_slot")
      .filter("metadata->>manuscript_id", "eq", manuscriptId);
    setReaderSlots(3 + ((slotRows as Array<{ id: string }> | null)?.length ?? 0));

    setAuthorUserId(userId);

    // Fetch coin activity — author spends on this manuscript
    const { data: ledgerRows } = await supabase
      .from("bloom_coin_ledger")
      .select("id, delta, reason, created_at")
      .eq("user_id", userId)
      .filter("metadata->>manuscript_id", "eq", manuscriptId)
      .order("created_at", { ascending: false })
      .limit(20);
    setManuscriptLedger((ledgerRows as { id: string; delta: number; reason: string; created_at: string }[] | null) ?? []);

    // Fetch reader chapter completions for this manuscript (coins earned by readers)
    const { data: completionRows } = await supabase
      .from("chapter_read_completions")
      .select("chapter_id, reader_id, coins_awarded, completed_at")
      .eq("manuscript_id", manuscriptId)
      .order("completed_at", { ascending: false })
      .limit(50);
    const cRows = (completionRows as { chapter_id: string; reader_id: string; coins_awarded: number; completed_at: string }[] | null) ?? [];
    setReaderCompletions(cRows);

    // Fetch names for readers who have completions
    const completionReaderIds = Array.from(new Set(cRows.map((c) => c.reader_id)));
    if (completionReaderIds.length > 0) {
      const { data: rProfiles } = await supabase
        .from("public_profiles")
        .select("user_id, pen_name, username")
        .in("user_id", completionReaderIds);
      const rn: Record<string, string> = {};
      ((rProfiles as { user_id: string; pen_name: string | null; username: string | null }[] | null) ?? []).forEach((p) => {
        rn[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Reader");
      });
      setReaderNames(rn);
    } else {
      setReaderNames({});
    }

    // Fetch line feedback for this manuscript
    const { data: fbData, error: fbError } = await supabase
      .from("line_feedback")
      .select("id, reader_id, chapter_id, selection_excerpt, comment_text, created_at, resolved, author_response")
      .eq("manuscript_id", manuscriptId)
      .order("created_at", { ascending: false });
    if (fbError) {
      setMsg(`Failed to load feedback: ${fbError.message}. If this mentions a missing column, run the SQL in supabase/run_in_sql_editor.sql against your database.`);
      setLoading(false);
      return;
    }
    const fbRows = (fbData as LineFeedback[] | null) ?? [];
    setFeedbackItems(fbRows);

    if (fbRows.length > 0) {
      const fbIds = fbRows.map((f) => f.id);
      const [repRes, profRes] = await Promise.all([
        supabase.from("line_feedback_replies").select("id, feedback_id, replier_id, body, created_at").in("feedback_id", fbIds),
        supabase.from("public_profiles").select("user_id, pen_name, username")
          .in("user_id", Array.from(new Set(fbRows.map((f) => f.reader_id)))),
      ]);
      setFeedbackReplies((repRes.data as FeedbackReply[] | null) ?? []);
      const nm: Record<string, string> = {};
      ((profRes.data as { user_id: string; pen_name: string | null; username: string | null }[] | null) ?? []).forEach((p) => {
        nm[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Reader");
      });
      setFeedbackNames(nm);
    } else {
      setFeedbackReplies([]);
      setFeedbackNames({});
    }

    setManuscript(row);
    setManuscriptTitle(row.title ?? "");
    setCoverUrl(row.cover_url ?? "");
    setDescription(row.description ?? "");
    setRequestedFeedback(
      row.requested_feedback === "forge" || row.requested_feedback === "lethal" || row.requested_feedback === "bloom"
        ? row.requested_feedback
        : "bloom",
    );
    setPotentialTriggers(row.potential_triggers ?? "");
    setCopyrightInfo(row.copyright_info ?? "");
    setSelectedCategories(
      row.categories && row.categories.length > 0
        ? row.categories
        : row.genre
          ? [row.genre]
          : [],
    );
    const chapterRows = (chapterData as Chapter[]) ?? [];
    setChapters(chapterRows);
    setSelectedChapterId((prev) => {
      if (prev && chapterRows.some((c) => c.id === prev)) return prev;
      return null;
    });
    if (chapterRows.length === 0) {
      setChapterEditorTitle("");
      setChapterEditorContent("");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscriptId]);

  // Apply ?chapter=&feedback= URL params once after initial load
  useEffect(() => {
    if (loading || urlParamsApplied.current) return;
    const chapterParam = searchParams?.get("chapter");
    const feedbackParam = searchParams?.get("feedback");
    if (!chapterParam && !feedbackParam) return;
    urlParamsApplied.current = true;
    if (chapterParam) {
      const exists = chapters.some((c) => c.id === chapterParam);
      if (exists) {
        setSelectedChapterId(chapterParam);
        if (feedbackParam) {
          setSelectedFeedbackId(feedbackParam);
        }
      }
    }
  }, [loading, chapters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parent view: always show chapters in read-only preview mode
  useEffect(() => {
    if (isParentView && selectedChapterId) setPreviewMode(true);
  }, [isParentView, selectedChapterId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(e.target as Node)) setCategoryOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);



  // Slot width (w-14 = 56px) + gap-3 (12px) = 68px per card
  const READER_CARD_WIDTH = 68;

  function scrollReaders(dir: "left" | "right") {
    const el = readerScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -READER_CARD_WIDTH : READER_CARD_WIDTH, behavior: "smooth" });
  }

  function onReaderScroll() {
    const el = readerScrollRef.current;
    if (!el) return;
    setReaderCanScrollLeft(el.scrollLeft > 4);
    setReaderCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    const el = readerScrollRef.current;
    if (!el) return;
    onReaderScroll();
    const ro = new ResizeObserver(() => onReaderScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setTimeout(() => onReaderScroll(), 50);
  }, [readerSlots, acceptedReaders.length]);

  // Realtime + polling — live feedback replies
  useEffect(() => {
    if (!authorUserId || !manuscriptId) return;

    async function refreshReplies() {
      const ids = feedbackItems.map((f) => f.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("line_feedback_replies")
        .select("id, feedback_id, replier_id, body, created_at")
        .in("feedback_id", ids);
      if (data) setFeedbackReplies(data as FeedbackReply[]);
    }

    if (replyChannelRef.current) void supabase.removeChannel(replyChannelRef.current);
    const ch = supabase
      .channel(`feedback-replies-${manuscriptId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_feedback_replies" }, (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as FeedbackReply;
        setFeedbackReplies((prev) => prev.some((p) => p.id === r.id) ? prev : [...prev, r]);
      })
      .subscribe();
    replyChannelRef.current = ch;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshReplies();
    }, 10000);

    return () => {
      if (replyChannelRef.current) void supabase.removeChannel(replyChannelRef.current);
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorUserId, manuscriptId, supabase, feedbackItems.length]);

  // Realtime subscription — keep coin balance live as coins are earned/spent anywhere
  useEffect(() => {
    if (!authorUserId) return;
    const channel = supabase
      .channel(`wallet-balance-${authorUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "accounts", filter: `user_id=eq.${authorUserId}` },
        (payload: { new: Record<string, unknown> }) => {
          const newBalance = (payload.new as { bloom_coins?: number }).bloom_coins;
          if (typeof newBalance === "number") setCoinBalance(newBalance);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authorUserId, supabase]);

  useEffect(() => {
    const selected = chapters.find((c) => c.id === selectedChapterId) ?? null;
    if (selected) {
      const normalized = normalizeChapterText(selected.content);
      setChapterEditorTitle(selected.title);
      setChapterEditorContent(normalized);
      lastSavedContent.current = normalized;
      lastSavedTitle.current = selected.title;
      setAutoSaveStatus("idle");
      return;
    }
    if (selectedChapterId && chapters.length > 0) {
      const fallback = chapters[0];
      const normalized = normalizeChapterText(fallback.content);
      setSelectedChapterId(fallback.id);
      setChapterEditorTitle(fallback.title);
      setChapterEditorContent(normalized);
      lastSavedContent.current = normalized;
      lastSavedTitle.current = fallback.title;
      setAutoSaveStatus("idle");
    }
  }, [chapters, selectedChapterId]);


  // Scroll page to the text marker, then align the sidebar card beside it
  useEffect(() => {
    if (!selectedFeedbackId) return;
    const info = markerInfos[selectedFeedbackId];
    const wrapper = editorWrapperRef.current;
    const aside = feedbackAsideRef.current;
    const cardEl = document.getElementById(`feedback-card-${selectedFeedbackId}`);

    if (info && wrapper) {
      // Absolute document Y of the marker
      const markerDocY = wrapper.getBoundingClientRect().top + window.scrollY + info.top;
      // Scroll page so the marker lands ~30% from the top of the viewport
      const targetScrollY = markerDocY - window.innerHeight * 0.3;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "smooth" });

      // After scroll completes, align the sidebar card
      // Marker will be at ~30% from viewport top; aside sticky top = navH + 12
      if (aside && cardEl) {
        const markerViewportY = window.innerHeight * 0.3;
        const asideViewportTop = navH + 12;
        const desiredRelativeTop = Math.max(0, markerViewportY - asideViewportTop);
        setTimeout(() => {
          aside.scrollTop = cardEl.offsetTop - desiredRelativeTop;
        }, 350); // after smooth scroll animation (~300ms)
      }
    } else {
      cardEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedbackId]);

  // Find the DOM Range for an excerpt inside a root element using a TreeWalker
  function findExcerptRange(root: HTMLElement, excerpt: string): Range | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);
    const fullText = textNodes.map((t) => t.textContent ?? "").join("");
    const idx = fullText.indexOf(excerpt);
    if (idx === -1) return null;
    let cumul = 0;
    let startNode: Text | null = null, startOff = 0, endNode: Text | null = null, endOff = 0;
    for (const t of textNodes) {
      const len = (t.textContent ?? "").length;
      if (!startNode && cumul + len > idx) { startNode = t; startOff = idx - cumul; }
      if (!endNode && cumul + len >= idx + excerpt.length) { endNode = t; endOff = idx + excerpt.length - cumul; break; }
      cumul += len;
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range;
  }

  // Compute inline marker positions from the Range API — runs after the editor DOM has settled
  function recomputeMarkers() {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const editorEl = wrapper.querySelector(".chapter-editor") as HTMLElement | null;
    if (!editorEl) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const newInfos: Record<string, MarkerInfo> = {};
    for (const f of feedbackItems) {
      if (!f.selection_excerpt || f.resolved || !!f.author_response) continue;
      const range = findExcerptRange(editorEl, f.selection_excerpt);
      if (!range) continue;
      const clientRects = Array.from(range.getClientRects());
      if (!clientRects.length) continue;
      const lastRect = clientRects[clientRects.length - 1];
      newInfos[f.id] = {
        // Place the bubble just above the text ascender (superscript position)
        // so it sits in the line-height gap and doesn't cover any words
        top: lastRect.top - wrapperRect.top - 4,
        left: lastRect.right - wrapperRect.left + 1,
        highlightRects: clientRects.map((r) => ({
          top: r.top - wrapperRect.top,
          left: r.left - wrapperRect.left,
          width: r.width,
          height: r.height,
        })),
      };
    }
    setMarkerInfos(newInfos);
  }

  useEffect(() => {
    // Wait one frame for the editor DOM to paint before measuring
    const id = requestAnimationFrame(recomputeMarkers);
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapterId, feedbackItems]);

  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => recomputeMarkers());
    ro.observe(wrapper);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapterId]);

  // Click anywhere outside the feedback aside and marker buttons to deselect
  useEffect(() => {
    if (!selectedFeedbackId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (feedbackAsideRef.current?.contains(target)) return;
      if (target.closest("[data-feedback-marker]")) return;
      setSelectedFeedbackId(null);
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectedFeedbackId]);

  function categoryLimit(nextCategories: string[]) {
    if (profileAgeCategory === "youth_13_17") return 2;
    return hasYouthAudienceCategory(nextCategories, null) ? 2 : 5;
  }

  function nextChapterOrder() {
    return (chapters[chapters.length - 1]?.chapter_order ?? 0) + 1;
  }

  function isDefaultChapterTitle(title: string, chapterOrder: number) {
    return title.trim().toLowerCase() === `chapter ${chapterOrder}`;
  }

  function chapterDisplayLabel(chapter: Chapter) {
    if (!chapter.title.trim() || isDefaultChapterTitle(chapter.title, chapter.chapter_order)) {
      return `Chapter ${chapter.chapter_order}`;
    }
    return `Chapter ${chapter.chapter_order}: ${chapter.title}`;
  }

  function highlightExcerpt(text: string, excerpt: string): React.ReactNode {
    if (!excerpt) return <>{text}</>;
    const idx = text.indexOf(excerpt);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-[rgba(120,120,120,0.4)] px-0.5 text-[#e9e6ff] not-italic">{text.slice(idx, idx + excerpt.length)}</mark>
        {text.slice(idx + excerpt.length)}
      </>
    );
  }

  async function addChapter() {
    if (!manuscript) return;
    const order = nextChapterOrder();
    const isLethalMember = memberTier === "lethal";
    const chapterCost = !isLethalMember && chapters.length >= freeChapterLimit ? 10 : 0;
    if (chapterCost > 0) {
      setCoinConfirm({ amount: chapterCost, label: "add a new chapter", onConfirm: () => void doAddChapter(order, chapterCost) });
      return;
    }
    await doAddChapter(order, 0);
  }

  async function doAddChapter(order: number, chapterCost: number) {
    if (!manuscript) return;
    if (chapterCost > 0) {
      const chargeResult = await spendBloomCoins(chapterCost, "extra_chapter_upload", {
        manuscript_id: manuscript.id,
        chapter_order: order,
      });
      if (!chargeResult.ok) {
        setShowUploadPurchasePrompt(true);
        return;
      }
    }
    const defaultTitle = `Chapter ${order}`;
    const { data, error } = await supabase
      .from("manuscript_chapters")
      .insert({
        manuscript_id: manuscript.id,
        chapter_order: order,
        title: defaultTitle,
        content: "",
        is_private: true,
      })
      .select("id, chapter_order, title, content, is_private, created_at")
      .single();
    if (error) return setMsg(friendlyDbError(error.message));

    const newChapter = data as Chapter;
    setChapters((prev) => [...prev, newChapter]);
    setSelectedChapterId(newChapter.id);
    setChapterEditorTitle(defaultTitle);
    setChapterEditorContent("");
    setMsg(chapterCost > 0 ? `Chapter ${order} added as draft. Charged ${chapterCost} Bloom Coins.` : `Chapter ${order} added as draft.`);
  }

  async function spendBloomCoins(amount: number, reason: string, metadata: Record<string, unknown>) {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return { ok: false as const, error: "Please sign in." };
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

  async function addReaderSlot() {
    if (!manuscript) return;
    setCoinConfirm({ amount: 15, label: "add a reader slot", onConfirm: () => void doAddReaderSlot() });
  }

  async function doAddReaderSlot() {
    if (!manuscript) return;
    const charge = await spendBloomCoins(15, "extra_reader_slot", { manuscript_id: manuscript.id });
    if (!charge.ok) { setShowUploadPurchasePrompt(true); return; }
    setReaderSlots((s) => s + 1);
  }

  async function sendReaderReward() {
    if (!rewardModal || !manuscript) return;
    const reader = rewardModal.reader;
    if (!rewardReason) { setMsg("Please select a reason for the reward."); return; }
    // Charge author
    const charge = await spendBloomCoins(rewardAmount, "reader_reward", {
      manuscript_id: manuscript.id,
      reader_id: reader.user_id,
      reason: rewardReason,
    });
    if (!charge.ok) { setShowUploadPurchasePrompt(true); return; }
    // Credit reader
    const { data: readerAcc } = await supabase.from("accounts").select("bloom_coins").eq("user_id", reader.user_id).maybeSingle();
    const readerBalance = Number((readerAcc as { bloom_coins?: number | null } | null)?.bloom_coins ?? 0);
    await supabase.from("accounts").update({ bloom_coins: readerBalance + rewardAmount }).eq("user_id", reader.user_id);
    // Notify reader
    await supabase.from("system_notifications").insert({
      user_id: reader.user_id,
      title: "You received a Bloom Coin reward! ✿",
      body: `${manuscript.title || "An author"} rewarded you ${rewardAmount} Bloom Coins for: ${rewardReason}.`,
    });
    setRewardModal(null);
    setRewardReason("");
    setRewardAmount(5);
    setMsg(`Rewarded ${reader.pen_name || reader.username || "reader"} ${rewardAmount} Bloom Coins.`);
  }

  async function deleteChapter(chapterId: string) {
    const { error } = await supabase.from("manuscript_chapters").delete().eq("id", chapterId);
    if (error) return setMsg(friendlyDbError(error.message));
    setMsg("Chapter deleted.");
    if (selectedChapterId === chapterId) {
      setSelectedChapterId(null);
      setChapterEditorTitle("");
      setChapterEditorContent("");
    }
    await load();
  }

  async function deleteManuscript() {
    if (!manuscript) return;
    setDeletingProject(true);
    const { error } = await supabase.from("manuscripts").delete().eq("id", manuscript.id);
    if (error) {
      setMsg(friendlyDbError(error.message));
      setDeletingProject(false);
      setDeleteProjectModal(false);
      return;
    }
    router.replace("/manuscripts");
  }

  async function saveSelectedChapter() {
    if (!selectedChapterId) return;
    if (!chapterEditorContent.trim()) return setMsg("Chapter content is required.");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setManualSaving(true);
    const { error } = await supabase
      .from("manuscript_chapters")
      .update({
        title: chapterEditorTitle.trim() || "Untitled Chapter",
        content: chapterEditorContent.trim(),
      })
      .eq("id", selectedChapterId);
    setManualSaving(false);
    if (error) return setMsg(friendlyDbError(error.message));
    lastSavedContent.current = chapterEditorContent;
    lastSavedTitle.current = chapterEditorTitle;
    setAutoSaveStatus("saved");
    setTimeout(() => setAutoSaveStatus("idle"), 3000);
    // Show prominent toast
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
    await load();
  }

  async function setChapterVisibility(chapterId: string, makePublic: boolean) {
    const { error } = await supabase.from("manuscript_chapters").update({ is_private: !makePublic }).eq("id", chapterId);
    if (error) return setMsg(friendlyDbError(error.message));
    setMsg(makePublic ? "Chapter published." : "Chapter set to private draft.");
    await load();
  }

  async function moveChapter(fromChapterId: string, toChapterId: string) {
    if (fromChapterId === toChapterId) return;
    const ordered = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
    const fromIndex = ordered.findIndex((c) => c.id === fromChapterId);
    const toIndex = ordered.findIndex((c) => c.id === toChapterId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const previousById = new Map<string, Chapter>();
    ordered.forEach((c) => previousById.set(c.id, c));

    const updates = reordered
      .map((c, i) => {
        const newOrder = i + 1;
        const prev = previousById.get(c.id);
        if (!prev) return null;
        const autoTitle = isDefaultChapterTitle(prev.title, prev.chapter_order);
        const nextTitle = autoTitle ? `Chapter ${newOrder}` : prev.title;
        const orderChanged = prev.chapter_order !== newOrder;
        const titleChanged = prev.title !== nextTitle;
        if (!orderChanged && !titleChanged) return null;
        return { id: c.id, chapter_order: newOrder, title: nextTitle };
      })
      .filter(Boolean) as Array<{ id: string; chapter_order: number; title: string }>;

    if (updates.length === 0) return;

    const results = await Promise.all(
      updates.map((u) =>
        supabase.from("manuscript_chapters").update({ chapter_order: u.chapter_order, title: u.title }).eq("id", u.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setMsg(friendlyDbError(failed.error.message));
      return;
    }
    setMsg("Chapter order updated.");
    await load();
  }

  async function setWholeVisibility(nextVisibility: "private" | "public") {
    if (!manuscript) return;
    const { error } = await supabase.from("manuscripts").update({ visibility: nextVisibility }).eq("id", manuscript.id);
    if (error) return setMsg(friendlyDbError(error.message));

    if (nextVisibility === "public") {
      // Publish: make all chapters visible
      const { error: chapterError } = await supabase
        .from("manuscript_chapters")
        .update({ is_private: false })
        .eq("manuscript_id", manuscript.id);
      if (chapterError) return setMsg(friendlyDbError(chapterError.message));

      // Re-enable previously-disabled readers
      const disabledIds = acceptedReaders.filter((r) => r.disabled && !r.left).map((r) => r.user_id);
      if (disabledIds.length > 0) {
        await supabase
          .from("manuscript_access_requests")
          .update({ status: "approved" })
          .eq("manuscript_id", manuscript.id)
          .in("requester_id", disabledIds);
        await Promise.all(
          disabledIds.map((readerId) =>
            supabase
              .from("manuscript_access_grants")
              .upsert({ manuscript_id: manuscript.id, reader_id: readerId }, { onConflict: "manuscript_id,reader_id" })
          )
        );
        // Notify re-enabled readers
        const title = manuscript.title || "Untitled manuscript";
        await Promise.all(
          disabledIds.map((readerId) =>
            supabase.from("system_notifications").insert({
              user_id: readerId,
              title: "Book republished",
              body: `"${title}" has been republished. Your reader access has been restored.`,
            })
          )
        );
      }

      setMsg("Whole manuscript published.");
    } else {
      // Unpublish: make all chapters private
      const { error: chapterError } = await supabase
        .from("manuscript_chapters")
        .update({ is_private: true })
        .eq("manuscript_id", manuscript.id);
      if (chapterError) return setMsg(friendlyDbError(chapterError.message));

      // Disable all accepted (non-left) readers
      const activeReaderIds = acceptedReaders
        .filter((r) => !r.left && !r.disabled)
        .map((r) => r.user_id);
      if (activeReaderIds.length > 0) {
        await supabase
          .from("manuscript_access_requests")
          .update({ status: "disabled" })
          .eq("manuscript_id", manuscript.id)
          .in("requester_id", activeReaderIds);
        await supabase
          .from("manuscript_access_grants")
          .delete()
          .eq("manuscript_id", manuscript.id)
          .in("reader_id", activeReaderIds);
        // Notify affected readers
        const title = manuscript.title || "Untitled manuscript";
        await Promise.all(
          activeReaderIds.map((readerId) =>
            supabase.from("system_notifications").insert({
              user_id: readerId,
              title: "Book unpublished",
              body: `"${title}" has been unpublished by the author. Your access has been temporarily disabled until the book is republished.`,
            })
          )
        );
      }

      setMsg("Manuscript unpublished. All chapters set to private and accepted readers notified.");
    }

    await load();
  }

  async function saveManuscriptInfo() {
    if (!manuscript) return;
    if (!manuscriptTitle.trim()) {
      setMsg("Title is required.");
      return;
    }
    if (selectedCategories.length === 0) {
      setMsg("Please choose at least one category.");
      return;
    }
    const limit = categoryLimit(selectedCategories);
    if (selectedCategories.length > limit) {
      setMsg(`You can select up to ${limit} categories for this manuscript.`);
      return;
    }
    const payload = {
      title: manuscriptTitle.trim(),
      description: description.trim(),
      cover_url: coverUrl || null,
      requested_feedback: requestedFeedback,
      potential_triggers: potentialTriggers.trim(),
      copyright_info: copyrightInfo.trim(),
      categories: selectedCategories,
      genre: selectedCategories[0] ?? null,
    };

    let updateResult = await supabase.from("manuscripts").update(payload).eq("id", manuscript.id);

    if (updateResult.error?.message?.toLowerCase().includes("could not find the 'categories' column")) {
      updateResult = await supabase
        .from("manuscripts")
        .update({
          title: payload.title,
          description: payload.description,
          cover_url: payload.cover_url,
          requested_feedback: payload.requested_feedback,
          potential_triggers: payload.potential_triggers,
          copyright_info: payload.copyright_info,
          genre: payload.genre,
        })
        .eq("id", manuscript.id);
    }

    const { error } = updateResult;
    if (error) return setMsg(friendlyDbError(error.message));
    setMsg("Manuscript info saved.");
    await load();
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

  async function handleCoverUploaded(url: string) {
    setCoverUrl(url);
    if (!manuscript) return;
    const { error } = await supabase.from("manuscripts").update({ cover_url: url }).eq("id", manuscript.id);
    if (error) {
      setMsg(`Cover uploaded but failed to save: ${friendlyDbError(error.message)}`);
      return;
    }
    setMsg("Cover updated.");
  }

  async function handleCoverFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !manuscript) return;
    setCoverUploading(true);
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) { setCoverUploading(false); return; }
    const ext = (file.name.split(".").pop()?.toLowerCase() || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("manuscript-covers")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (uploadErr) { setMsg(uploadErr.message); setCoverUploading(false); return; }
    const { data } = supabase.storage.from("manuscript-covers").getPublicUrl(path);
    await handleCoverUploaded(data.publicUrl);
    setCoverUploading(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  async function handleTitleSave(newTitle: string) {
    if (!manuscript) return;
    setManuscriptTitle(newTitle);
    const { error } = await supabase.from("manuscripts").update({ title: newTitle }).eq("id", manuscript.id);
    if (error) setMsg(`Title save failed: ${friendlyDbError(error.message)}`);
    else setMsg("Title updated.");
  }

  async function toggleReaderAccess(readerId: string, currentlyDisabled: boolean, currentlyLeft?: boolean) {
    if (!manuscript) return;
    // Determine new status: left or disabled readers both go to "approved" on re-enable
    const enabling = currentlyDisabled || currentlyLeft;
    const newStatus = enabling ? "approved" : "disabled";
    const { error } = await supabase
      .from("manuscript_access_requests")
      .update({ status: newStatus })
      .eq("manuscript_id", manuscript.id)
      .eq("requester_id", readerId);
    if (error) { setMsg(friendlyDbError(error.message)); return; }
    if (enabling) {
      // Re-enable: restore access grant
      await supabase
        .from("manuscript_access_grants")
        .upsert({ manuscript_id: manuscript.id, reader_id: readerId }, { onConflict: "manuscript_id,reader_id" });
    } else {
      // Disable: remove grant so reader view is locked
      await supabase
        .from("manuscript_access_grants")
        .delete()
        .eq("manuscript_id", manuscript.id)
        .eq("reader_id", readerId);
    }
    setAcceptedReaders((prev) =>
      prev.map((r) => r.user_id === readerId ? { ...r, disabled: !enabling, left: false } : r)
    );
  }

  async function acceptRequest(userId: string) {
    if (!manuscript) return;
    const activeCount = acceptedReaders.filter((r) => !r.disabled && !r.left).length;
    if (activeCount >= readerSlots) {
      setMsg(`All ${readerSlots} reader slots are filled. Add a slot first.`);
      return;
    }
    const { error } = await supabase
      .from("manuscript_access_requests")
      .update({ status: "approved" })
      .eq("manuscript_id", manuscript.id)
      .eq("requester_id", userId);
    if (error) { setMsg(friendlyDbError(error.message)); return; }
    await supabase
      .from("manuscript_access_grants")
      .upsert({ manuscript_id: manuscript.id, reader_id: userId }, { onConflict: "manuscript_id,reader_id" });
    const req = pendingRequests.find((r) => r.user_id === userId);
    setAcceptedReaders((prev) => {
      const exists = prev.some((r) => r.user_id === userId);
      if (exists) {
        return prev.map((r) => r.user_id === userId ? { ...r, disabled: false, left: false } : r);
      }
      return req ? [...prev, { ...req, disabled: false, left: false }] : prev;
    });
    setPendingRequests((prev) => prev.filter((r) => r.user_id !== userId));
    await supabase.from("system_notifications").insert({
      user_id: userId,
      title: "Beta reader request accepted",
      body: `Your request to read "${manuscript.title || "Untitled manuscript"}" has been accepted.`,
    });
  }

  async function denyRequest(userId: string) {
    if (!manuscript) return;
    const { error } = await supabase
      .from("manuscript_access_requests")
      .delete()
      .eq("manuscript_id", manuscript.id)
      .eq("requester_id", userId);
    if (error) { setMsg(friendlyDbError(error.message)); return; }
    setPendingRequests((prev) => prev.filter((r) => r.user_id !== userId));
  }

  async function payForAdditionalManuscriptUpload() {
    if (memberTier === "lethal") {
      router.push("/manuscripts/new");
      return;
    }
    if (coinBalance < 15) {
      setShowUploadPurchasePrompt(true);
      return;
    }
    const charge = await spendBloomCoins(15, "manuscript_upload_unlock", {
      source_manuscript_id: manuscript?.id ?? null,
    });
    if (!charge.ok) {
      setShowUploadPurchasePrompt(true);
      return;
    }
    setShowUploadPurchasePrompt(false);
    setMsg("Additional manuscript upload unlocked.");
    router.push("/manuscripts/new");
  }

  const isLethalMember = memberTier === "lethal";
  const displayCategories =
    selectedCategories.length > 0
      ? selectedCategories
      : manuscript?.categories && manuscript.categories.length > 0
        ? manuscript.categories
        : manuscript?.genre
          ? [manuscript.genre]
          : [];
  const displayedWordCount = chapters.reduce((sum, c) => sum + countWords(c.content ?? ""), 0);
  const selectedChapter = selectedChapterId ? chapters.find((c) => c.id === selectedChapterId) ?? null : null;
  const nextChapterCost = !isLethalMember && chapters.length >= freeChapterLimit ? 10 : 0;

  const detailItems = [
    { label: "Author", value: `You${manuscript?.created_at ? ` · ${new Date(manuscript.created_at).toLocaleDateString()}` : ""}` },
    { label: "Visibility", value: manuscript?.visibility === "public" ? "Public" : "Draft" },
    { label: "Age rating", value: manuscript?.age_rating === "teen_safe" ? "Teen-safe" : "Adult" },
    { label: "Word count", value: displayedWordCount ? `${displayedWordCount.toLocaleString()} words` : "—" },
  ];
  if (selectedChapter) {
    detailItems.push({
      label: "Selected chapter",
      value: chapterDisplayLabel(selectedChapter),
    });
  }

  const sidebarFooter = isParentView ? null : (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-3">
      <button
        onClick={() => void addChapter()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.18)] px-3 py-2 text-sm font-medium text-white hover:border-[rgba(120,120,120,0.9)] hover:bg-[rgba(120,120,120,0.26)]"
      >
        Add chapter{nextChapterCost > 0 ? <><span className="ml-1.5 text-base leading-none" style={{ color: "#f59e0b" }}>✿</span><span className="ml-1 text-xs font-normal opacity-80">{nextChapterCost} Bloom Coins</span></> : <span className="ml-1 text-xs font-normal opacity-70">(free)</span>}
      </button>
      <p className="mt-2 text-[11px] text-neutral-400">
        Manuscript #{manuscriptSequence}. Free chapters: {freeChapterLimit}. Lethal members unlock all chapters for free.
      </p>
    </div>
  );

  const renderChapterItem = (chapter: Chapter, isActive: boolean) => {
    const draggingOver = !isParentView && dragOverChapterId === chapter.id && dragChapterId !== chapter.id;
    return (
      <div
        draggable={!isParentView}
        onDragStart={isParentView ? undefined : () => setDragChapterId(chapter.id)}
        onDragOver={isParentView ? undefined : (e) => {
          e.preventDefault();
          setDragOverChapterId(chapter.id);
        }}
        onDrop={isParentView ? undefined : (e) => {
          e.preventDefault();
          if (dragChapterId) void moveChapter(dragChapterId, chapter.id);
          setDragChapterId(null);
          setDragOverChapterId(null);
        }}
        onDragEnd={isParentView ? undefined : () => {
          if (dragChapterId && dragOverChapterId && dragChapterId !== dragOverChapterId) {
            void moveChapter(dragChapterId, dragOverChapterId);
          }
          setDragChapterId(null);
          setDragOverChapterId(null);
        }}
        className={draggingOver ? "outline outline-1 outline-[rgba(120,120,120,0.5)] rounded-lg" : ""}
      >
        <button
          onClick={() => setSelectedChapterId(chapter.id)}
          className={`chapter-btn block w-full text-left rounded-lg border px-3 py-2 transition ${
            isActive
              ? "active-chapter !border-[rgba(120,120,120,0.85)] !bg-[rgba(120,120,120,0.15)] !text-white shadow-[0_12px_26px_rgba(120,120,120,0.18)]"
              : "!border-neutral-800 !bg-neutral-950/40 !text-neutral-200 hover:!border-[rgba(120,120,120,0.4)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Chapter {chapter.chapter_order}</span>
            <span
              className={`text-[10px] uppercase tracking-wide ${
                chapter.is_private ? "text-amber-200" : "text-emerald-200"
              }`}
            >
              {chapter.is_private ? "Draft" : "Published"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-neutral-400">{chapter.title || "Untitled chapter"}</p>
        </button>
      </div>
    );
  };

  async function exportAsDocx() {
    if (!manuscript) return;
    setExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = await import("docx");
      const sorted = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
      const children: InstanceType<typeof Paragraph>[] = [
        new Paragraph({ text: manuscript.title || "Untitled", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "" }),
      ];
      for (const ch of sorted) {
        children.push(new Paragraph({ text: `Chapter ${ch.chapter_order}: ${ch.title || "Untitled"}`, heading: HeadingLevel.HEADING_1 }));
        const paras = (ch.content ?? "").split(/\n+/).filter((p) => p.trim());
        for (const para of paras) {
          children.push(new Paragraph({ children: [new TextRun({ text: para })] }));
        }
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${manuscript.title || "manuscript"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
      setExportModal(false);
    }
  }

  function exportAsHtml() {
    if (!manuscript) return;
    setExporting(true);
    const sorted = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${manuscript.title || "Untitled"}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;line-height:1.8;font-size:16px;}h1{font-size:2em;margin-bottom:0.2em;}h2{font-size:1.4em;margin-top:2em;page-break-before:always;}p{text-indent:1.5em;margin:0.4em 0;}</style></head><body>`;
    html += `<h1>${manuscript.title || "Untitled"}</h1>`;
    for (const ch of sorted) {
      html += `<h2>Chapter ${ch.chapter_order}: ${ch.title || "Untitled"}</h2>`;
      const paras = (ch.content ?? "").split(/\n+/).filter((p) => p.trim());
      for (const para of paras) {
        html += `<p>${para.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      }
    }
    html += `</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${manuscript.title || "manuscript"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    setExportModal(false);
  }

  if (loading) return <main className="mx-auto max-w-[1600px] px-6 py-12 bg-neutral-950 text-neutral-100">Loading...</main>;
  if (!manuscript) return <main className="mx-auto max-w-[1600px] px-6 py-12 bg-neutral-950 text-neutral-100">Not available</main>;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Manual save toast */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-950/90 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-sm font-medium text-emerald-300 transition-all duration-300 ${saveToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}>
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        Chapter saved
      </div>
      <div className="mx-auto max-w-[1600px] px-6 py-12">
        {/* Hidden file input for cover uploads triggered by clicking the cover in the sidebar */}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleCoverFileSelected(e)}
        />
        <ManuscriptLayout
          title={manuscriptTitle || "Untitled manuscript"}
          coverUrl={coverUrl || manuscript.cover_url}
          categories={displayCategories}
          chapters={chapters}
          activeChapterId={selectedChapterId}
          onSelectChapter={(id) => setSelectedChapterId(id)}
          onCoverClick={selectedChapterId ? () => setSelectedChapterId(null) : isParentView ? undefined : () => coverInputRef.current?.click()}
          coverClickLabel={selectedChapterId ? "← Back to manuscript" : isParentView ? undefined : coverUploading ? "Uploading..." : "Click to change cover"}
          titleEditable={!selectedChapterId && !isParentView}
          onTitleSave={(t) => void handleTitleSave(t)}
          details={[]}
          hideDefaultSections={true}
          compactSidebar={!!selectedChapterId}
          sidebarFooter={sidebarFooter}
          renderChapterItem={renderChapterItem}
          rightHeader={
            isParentView ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-purple-400">Viewing as parent · Read only</p>
                  <h1 className="text-xl font-semibold text-white">{manuscriptTitle || "Untitled manuscript"}</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/manage-youth"
                    className="workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                  >
                    ← Back to Youth Accounts
                  </Link>
                  {pendingRequests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPendingPanel(true)}
                      className="relative workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                    >
                      <span className="notifBadge">{pendingRequests.length > 99 ? "99+" : pendingRequests.length}</span>
                      Pending beta readers
                    </button>
                  )}
                  {parentDisabled ? (
                    <button
                      type="button"
                      onClick={() => void handleParentReinstate()}
                      disabled={parentDisableSubmitting}
                      className="btn-success inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition disabled:opacity-50"
                      style={{ background: '#16a34a', borderColor: '#15803d', color: '#ffffff' }}
                    >
                      Reinstate Manuscript
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setParentDisableReason(""); setParentDisableModal(true); }}
                      className="btn-danger inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold transition"
                    >
                      Disable Manuscript
                    </button>
                  )}
                </div>
                {parentDisabled && (
                  <div className="w-full rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                    This manuscript is currently disabled.{parentDisabledReason ? ` Reason: ${parentDisabledReason}` : ""}
                  </div>
                )}
                {parentActionMsg && (
                  <div className="w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-200">
                    {parentActionMsg}
                  </div>
                )}
              </div>
            ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Manuscript workspace</p>
                <h1 className="text-xl font-semibold text-white">{manuscriptTitle || "Untitled manuscript"}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/manuscripts"
                  className="workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Back to manuscripts
                </Link>
                <Link
                  href={`/manuscripts/${manuscript.id}?from=details`}
                  className="workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Open reader view
                </Link>
                <a
                  role="button"
                  onClick={() => setExportModal(true)}
                  className="workspace-btn inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Export Manuscript
                </a>
                <Link
                  href={`/beta-readers?level=${encodeURIComponent(requestedFeedback)}${displayCategories.length ? `&genres=${encodeURIComponent(displayCategories[0])}` : ""}`}
                  className="workspace-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Find beta readers
                </Link>
                <button
                  type="button"
                  onClick={() => setShowPendingPanel(true)}
                  className="relative inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  {pendingRequests.length > 0 && (
                    <span className="notifBadge">{pendingRequests.length > 99 ? "99+" : pendingRequests.length}</span>
                  )}
                  Pending beta readers
                </button>
                {/* Live wallet balance */}
                <div className="workspace-btn inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium">
                  <span className="text-base leading-none" style={{ color: "#f59e0b" }}>✿</span>
                  <span>{coinBalance.toLocaleString()} Bloom Coins</span>
                </div>
                <button
                  type="button"
                  onClick={() => void setWholeVisibility(manuscript.visibility === "public" ? "private" : "public")}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition ${manuscript.visibility === "public" ? "btn-danger" : "btn-success"}`}
                  style={manuscript.visibility === "public" ? { backgroundColor: "#dc2626", borderColor: "#b91c1c", color: "#ffffff" } : { backgroundColor: "#16a34a", borderColor: "#15803d", color: "#ffffff" }}
                >
                  {manuscript.visibility === "public" ? "Unpublish" : "Publish all"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteProjectModal(true)}
                  title="Delete project"
                  className="btn-red inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:opacity-90"
                  style={{ background: "#dc2626", border: "1px solid #dc2626" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
            )
          }
          topContent={
            <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Accepted readers</h2>
                <span className="text-xs text-neutral-200">{acceptedReaders.length}/{readerSlots} slots filled</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollReaders("left")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.18)] transition"
                >
                  ‹
                </button>
                <div
                  ref={readerScrollRef}
                  onScroll={onReaderScroll}
                  className="flex w-0 flex-1 gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {Array.from({ length: readerSlots }).map((_, i) => {
                    const reader = acceptedReaders[i];
                    return reader ? (
                      <div key={reader.user_id} className="flex shrink-0 flex-col items-center gap-1.5 group">
                        <div className="relative h-14 w-14">
                          <div className={`relative h-14 w-14 overflow-hidden rounded-full border-2 bg-neutral-900 transition ${reader.left || reader.disabled || reader.suspended ? "border-neutral-700 opacity-40 grayscale" : "border-[rgba(120,120,120,0.6)] shadow-[0_0_10px_rgba(120,120,120,0.25)]"}`}>
                            {reader.avatar_url ? (
                              <Image src={reader.avatar_url} alt={reader.pen_name || reader.username || "Reader"} fill sizes="56px" className="object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[rgba(210,210,210,0.8)]">
                                {(reader.pen_name || reader.username || "R")[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          {!isParentView && !reader.left && !reader.disabled && !reader.suspended && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition">
                              <button type="button" onClick={() => { setRewardModal({ reader }); setRewardReason(""); setRewardAmount(5); }} className="text-[9px] font-semibold uppercase tracking-wide leading-none text-white">
                                <span style={{ color: "#f59e0b" }}>✿</span> Reward
                              </button>
                              <button type="button" onClick={() => void toggleReaderAccess(reader.user_id, !!reader.disabled, false)} className="text-[9px] font-semibold uppercase tracking-wide text-white leading-none">
                                Disable
                              </button>
                            </div>
                          )}
                          {!isParentView && !reader.left && reader.disabled && !reader.suspended && !(manuscript.visibility === "private") && (
                            <button type="button" onClick={() => void toggleReaderAccess(reader.user_id, true, false)} className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition text-[9px] font-semibold uppercase tracking-wide text-white">
                              Enable
                            </button>
                          )}
                        </div>
                        <Link href={reader.username ? `/u/${reader.username}` : "#"} className={`max-w-[60px] truncate text-center text-[10px] transition hover:text-white ${reader.left || reader.disabled || reader.suspended ? "text-neutral-500 line-through" : "text-neutral-200"}`}>
                          {reader.pen_name || reader.username || "Reader"}
                        </Link>
                        {reader.left && <span className="text-[9px] text-red-500/70">Left project</span>}
                        {reader.suspended && <span className="text-[9px] text-amber-500/80">Suspended</span>}
                      </div>
                    ) : (
                      <div key={`empty-${i}`} className="flex shrink-0 flex-col items-center gap-1.5">
                        <div className="h-14 w-14 rounded-lg border border-dashed border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.05)]" />
                        <p className="text-[10px] text-neutral-300">Open</p>
                      </div>
                    );
                  })}
                  {!isParentView && (
                  <div className="flex shrink-0 flex-col items-center gap-1.5">
                    <button type="button" onClick={() => void addReaderSlot()} className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.08)] text-xl text-[rgba(120,120,120,0.7)] hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.14)] transition" title="Add a reader slot for 15 Bloom Coins">+</button>
                    <p className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                      <span style={{ color: "#f59e0b" }}>✿</span>
                      <span>15 Bloom Coins</span>
                    </p>
                  </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => scrollReaders("right")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.18)] transition"
                >
                  ›
                </button>
              </div>
            </section>
          }
        >
          {msg ? (
            <div className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.1)] p-3 text-sm text-neutral-100">
              {msg}
            </div>
          ) : null}

          {!selectedChapterId && (
            <>
              <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
              <div className="space-y-3">
                {/* Static info row */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {detailItems.map((d, idx) => (
                    <DetailRow key={`${d.label}-${idx}`} label={d.label} value={d.value} />
                  ))}
                </div>

                {/* Read-only: Requested feedback (mirrors profile setting) */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Requested Feedback</p>
                  <p className="text-sm text-neutral-200">
                    {FEEDBACK_PREFERENCE_OPTIONS.find((o) => o.value === profileFeedbackPreference)?.label ?? "Bloom"}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">Set via your <a href="/settings/profile" className="underline hover:text-neutral-300">profile settings</a></p>
                </div>

                {/* Editable: Categories */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Categories</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedCategories.length === 0 && <span className="text-sm text-neutral-500">Not set</span>}
                    {selectedCategories.map((cat) => (
                      <span key={cat} className="flex items-center gap-1 rounded-full border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.1)] px-2 py-0.5 text-xs text-neutral-200">
                        {cat}
                        {!isParentView && (
                          <button onClick={() => setSelectedCategories((prev) => prev.filter((c) => c !== cat))} className="text-neutral-400 hover:text-white leading-none">×</button>
                        )}
                      </span>
                    ))}
                  </div>
                  {!isParentView && (
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !selectedCategories.includes(val)) setSelectedCategories((prev) => [...prev, val]);
                    }}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-[rgba(120,120,120,0.7)]"
                  >
                    <option value="">Add a category…</option>
                    {genreOptionsForAgeCategory(profileAgeCategory).filter((g) => !selectedCategories.includes(g)).sort().map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  )}
                </div>

                {/* Editable: Summary — full width */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Summary</p>
                  <textarea
                    value={description}
                    onChange={isParentView ? undefined : (e) => setDescription(e.target.value)}
                    readOnly={isParentView}
                    rows={5}
                    placeholder="Write a summary or notes about this manuscript…"
                    className={`w-full rounded-lg border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 resize-y focus:outline-none focus:border-[rgba(120,120,120,0.7)] ${isParentView ? "cursor-default select-text" : ""}`}
                  />
                </div>
              </div>
          </section>

              {/* Feedback from Beta Readers — manuscript overview */}
              <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
                    Feedback from Beta Readers
                    {feedbackItems.length > 0 && (
                      <span className="ml-2 rounded-full bg-[rgba(120,120,120,0.2)] px-2 py-0.5 text-[10px] font-normal text-[rgba(210,210,210,0.8)]">{feedbackItems.length}</span>
                    )}
                  </h2>
                  <div className="flex gap-1.5">
                    {(["unresolved", "resolved", "all"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setOverviewFeedbackFilter(opt)}
                        className={`rounded-lg border px-3 py-1 text-[10px] font-medium transition ${
                          overviewFeedbackFilter === opt
                            ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.22)] text-neutral-100"
                            : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] text-neutral-400 hover:bg-[rgba(120,120,120,0.14)] hover:text-neutral-200"
                        }`}
                      >
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const overviewFiltered = feedbackItems.filter((f) => {
                    const chObj = f.chapter_id ? chapters.find((c) => c.id === f.chapter_id) : null;
                    const detached = !!f.selection_excerpt && !!chObj && !(chObj.content ?? "").includes(f.selection_excerpt);
                    const isResolved = f.resolved || !!f.author_response || detached;
                    return overviewFeedbackFilter === "all" ? true :
                      overviewFeedbackFilter === "resolved" ? isResolved : !isResolved;
                  });
                  return overviewFiltered.length === 0 ? (
                    <p className="text-sm italic text-neutral-500">
                      {feedbackItems.length === 0
                        ? "No feedback has been left yet. Once your beta readers start leaving comments, they will appear here."
                        : `No ${overviewFeedbackFilter !== "all" ? overviewFeedbackFilter : ""} feedback.`}
                    </p>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto pr-1 space-y-4">
                      {overviewFiltered.map((f) => {
                        const chapterObj = f.chapter_id ? chapters.find((c) => c.id === f.chapter_id) : null;
                        const chapterLabel = chapterObj ? `Ch. ${chapterObj.chapter_order}: ${chapterObj.title || "Untitled"}` : null;
                        const excerptDetached = !!f.selection_excerpt && !!chapterObj && !(chapterObj.content ?? "").includes(f.selection_excerpt);
                        const fReplies = feedbackReplies.filter((r) => r.feedback_id === f.id);
                        const isExpanded = overviewExpandedIds.has(f.id);
                        const readerName = feedbackNames[f.reader_id] || "Reader";
                        const toggleExpand = () => setOverviewExpandedIds((prev) => {
                          const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n;
                        });
                        return (
                          <div key={f.id} className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <p className="text-xs font-medium text-[rgba(210,210,210,0.85)]">{readerName}</p>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                                {chapterLabel && <span className="rounded-lg bg-neutral-800 px-1.5 py-0.5">{chapterLabel}</span>}
                                <span>{new Date(f.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            {excerptDetached ? (
                              <p className="mt-2 text-[11px] italic text-amber-500/70">⚠ The original text this comment was left on has since been edited or removed.</p>
                            ) : f.selection_excerpt ? (
                              <blockquote className="mt-2 border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-xs italic text-neutral-400">
                                &ldquo;{f.selection_excerpt}&rdquo;
                              </blockquote>
                            ) : null}
                            <p className="mt-1.5 text-sm leading-relaxed text-neutral-200">{f.comment_text}</p>
                            {f.author_response && (
                              <p className={`mt-2 text-[11px] font-medium ${f.author_response === "agree" ? "text-emerald-400" : "text-rose-400"}`}>
                                {f.author_response === "agree" ? "✓ You agreed with this feedback" : "✗ You disagreed with this feedback"}
                              </p>
                            )}
                            {/* Expand button — show when there are replies OR feedback is unresolved */}
                            {(fReplies.length > 0 || !f.resolved && !f.author_response) && (
                              <button
                                type="button"
                                onClick={toggleExpand}
                                className="mt-2 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-3 py-1 text-[10px] text-neutral-300 hover:bg-[rgba(120,120,120,0.2)] transition"
                              >
                                {isExpanded ? "Hide conversation" : fReplies.length > 0 ? `View ${fReplies.length} ${fReplies.length === 1 ? "reply" : "replies"}` : "Reply"}
                              </button>
                            )}
                            {/* Expanded conversation thread + reply box */}
                            {isExpanded && (
                              <div className="mt-2">
                                <div className="rounded-lg bg-neutral-950/50 p-2 space-y-1.5">
                                  {/* Reader's original comment */}
                                  <div className="flex justify-start">
                                    <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-2">
                                      <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">{readerName}</p>
                                      <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                                    </div>
                                  </div>
                                  {fReplies.map((r) => {
                                    const isAuthorReply = r.replier_id === authorUserId;
                                    return (
                                      <div key={r.id} className={`flex ${isAuthorReply ? "justify-end" : "justify-start"}`}>
                                        <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 ${isAuthorReply ? "rounded-tr-sm bg-white" : "rounded-tl-sm bg-neutral-100"}`}>
                                          <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">{isAuthorReply ? "You" : readerName}</p>
                                          <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{r.body}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Reply input */}
                                {!isParentView && !f.resolved && !f.author_response && (
                                  <div className="mt-2 flex gap-1.5">
                                    <textarea
                                      rows={1}
                                      placeholder="Reply… (Enter to send)"
                                      value={replyDrafts[f.id] ?? ""}
                                      ref={(el) => { if (el) replyTextareaRefs.current.set(f.id, el); else replyTextareaRefs.current.delete(f.id); }}
                                      onChange={(e) => setReplyDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                                      onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 96) + "px"; }}
                                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void replyToFeedback(f.id); } }}
                                      className="flex-1 resize-none overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.5)] focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void replyToFeedback(f.id)}
                                      disabled={!(replyDrafts[f.id] ?? "").trim()}
                                      className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-[11px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
                                    >
                                      Send
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Agree / Disagree buttons */}
                            {!isParentView && !f.resolved && !f.author_response && (
                              <div className="mt-2.5 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void resolveFeedback(f.id, "agree")}
                                  className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/40 transition"
                                >
                                  Agree
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void resolveFeedback(f.id, "disagree")}
                                  className="rounded-lg border border-rose-700/60 bg-rose-900/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-900/40 transition"
                                >
                                  Disagree
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              {/* Coin Activity — spending by this author + earnings by readers (hidden for parent) */}
              {!isParentView && <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Coin Activity</h2>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <span>🪙</span>
                    <span className="font-semibold text-neutral-200">{coinBalance.toLocaleString()}</span>
                    <span>available</span>
                  </div>
                </div>

                {/* Reader earnings — coins earned by readers from this manuscript */}
                {readerCompletions.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Readers earned</p>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                      {readerCompletions.map((c, i) => {
                        const chapterObj = chapters.find((ch) => ch.id === c.chapter_id);
                        return (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] px-3 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-neutral-300 truncate">{readerNames[c.reader_id] || "Reader"}</span>
                              {chapterObj && (
                                <span className="text-[10px] text-neutral-600 truncate">Ch. {chapterObj.chapter_order}</span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-emerald-400 shrink-0 ml-2">+{c.coins_awarded} 🪙</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Author spends on this manuscript */}
                {manuscriptLedger.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Your spending</p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {manuscriptLedger.map((entry) => {
                        const label = entry.reason === "extra_reader_slot"
                          ? "Extra reader slot"
                          : entry.reason === "extra_chapter_upload"
                          ? "Extra chapter upload"
                          : entry.reason === "manuscript_upload_unlock"
                          ? "Manuscript upload unlock"
                          : entry.reason.replace(/_/g, " ");
                        return (
                          <div key={entry.id} className="flex items-center justify-between rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] px-3 py-1.5">
                            <span className="text-xs text-neutral-300 capitalize">{label}</span>
                            <span className="text-xs font-semibold text-rose-400 shrink-0 ml-2">{entry.delta} 🪙</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : readerCompletions.length === 0 ? (
                  <p className="text-sm italic text-neutral-500">No coin activity on this manuscript yet.</p>
                ) : null}
              </section>}
            </>
          )}

          {selectedChapterId && selectedChapter && (() => {
            const plainChapterText = chapterEditorContent.replace(/<[^>]+>/g, "");
            const chapterFeedback = feedbackItems
              .filter((f) => f.chapter_id === selectedChapterId)
              .sort((a, b) => {
                const ia = a.selection_excerpt ? plainChapterText.indexOf(a.selection_excerpt) : Infinity;
                const ib = b.selection_excerpt ? plainChapterText.indexOf(b.selection_excerpt) : Infinity;
                return ia - ib;
              });
            const activeFeedback = chapterFeedback.find((f) => f.id === selectedFeedbackId) ?? null;
            const activeExcerpt = activeFeedback?.selection_excerpt ?? "";
            const previewHtml = chapterTextToPreviewHtml(chapterEditorContent);
            return (
              <div className="flex gap-6 items-start">
                {/* Chapter editor / preview */}
                <section className="min-w-0 flex-1 rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[rgba(210,210,210,0.6)]">Chapter {selectedChapter.chapter_order}</p>
                      <h2 className="text-lg font-semibold text-white">{selectedChapter.title || "Untitled chapter"}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-300">
                        {countWords(chapterEditorContent)} words
                      </span>
                      <button
                        type="button"
                        onClick={() => { setSelectedChapterId(null); setSelectedFeedbackId(null); }}
                        className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-sm text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] transition"
                      >
                        ← Back to manuscript info
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {!previewMode && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-neutral-300">Chapter title</div>
                          <input
                            value={chapterEditorTitle}
                            onChange={(e) => setChapterEditorTitle(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100"
                          />
                        </div>
                        <div className="flex flex-wrap shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => void setChapterVisibility(selectedChapter.id, true)}
                            className={`h-11 rounded-lg border px-4 text-sm font-semibold ${
                              selectedChapter.is_private
                                ? "border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.14)] text-white"
                                : "border-neutral-800 bg-neutral-900/50 text-neutral-200"
                            }`}
                          >
                            Publish
                          </button>
                          <button
                            type="button"
                            onClick={() => void setChapterVisibility(selectedChapter.id, false)}
                            className={`h-11 rounded-lg border px-4 text-sm font-semibold ${
                              selectedChapter.is_private
                                ? "border-neutral-800 bg-neutral-900/50 text-neutral-200"
                                : "border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.14)] text-white"
                            }`}
                          >
                            Draft
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteChapter(selectedChapter.id)}
                            className="h-11 rounded-lg border border-neutral-600/70 bg-neutral-800/30 px-4 text-sm font-semibold text-neutral-100 hover:bg-neutral-800/50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      {previewMode ? (
                        <div className="chapter-editor relative min-h-[44rem] overflow-y-auto rounded-xl border border-[rgba(120,120,120,0.28)] bg-[rgba(18,18,18,0.9)] px-8 py-8 shadow-[0_12px_34px_rgba(0,0,0,0.35)]">
                          {/* Owner watermark — tiled, same style as reader watermark */}
                          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                            {Array.from({ length: 16 }).map((_, row) =>
                              Array.from({ length: 3 }).map((_, col) => (
                                <span
                                  key={`${row}-${col}`}
                                  style={{
                                    position: "absolute",
                                    top: `${row * 7 + (col * 11 % 5)}%`,
                                    left: `${col * 35 + (row * 7 % 12) - 5}%`,
                                    transform: "rotate(-30deg)",
                                    fontSize: "26px",
                                    fontFamily: "sans-serif",
                                    fontWeight: 600,
                                    color: "rgba(25,25,27,0.85)",
                                    whiteSpace: "nowrap",
                                    letterSpacing: "0.04em",
                                    userSelect: "none",
                                    pointerEvents: "none",
                                  }}
                                >
                                  <span style={{ display: "block" }}>
                                    {ownerPenName} · Uploaded: {selectedChapter.created_at ? new Date(selectedChapter.created_at).toLocaleDateString() : ""}
                                  </span>
                                </span>
                              ))
                            )}
                          </div>
                          {/* Paragraphs — rendered with chapterTextToPreviewHtml for identical structure to ChapterEditor */}
                          {previewHtml ? (
                            <div className="relative z-[1]" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                          ) : (
                            <p className="relative z-[1] text-sm text-neutral-400">No content yet.</p>
                          )}
                        </div>
                      ) : (
                        <div ref={editorWrapperRef} className="relative">
                          <ChapterEditor
                            value={chapterEditorContent}
                            onChange={setChapterEditorContent}
                            normalize={normalizeChapterText}
                            placeholder="Begin your chapter here. Press Enter to start a new paragraph. Shift+Enter for a line break within a paragraph."
                            className="min-h-[44rem] rounded-xl border border-neutral-800 bg-[rgba(18,18,18,0.85)] px-8 py-8 text-neutral-100 focus:border-[rgba(120,120,120,0.5)]"
                          />
                          {/* Dotted amber underlines — always visible, same style as reader view.
                              Dim (0.45 opacity) when idle, bright (0.95) + bg fill when selected. */}
                          {Object.entries(markerInfos).flatMap(([fid, info]) => {
                            const isSelected = selectedFeedbackId === fid;
                            return info.highlightRects.map((r, i) => (
                              <div
                                key={`${fid}-${i}`}
                                style={{
                                  position: "absolute",
                                  top: r.top,
                                  left: r.left,
                                  width: r.width,
                                  height: r.height,
                                  backgroundColor: isSelected ? "rgba(251,191,36,0.18)" : "transparent",
                                  borderBottom: `2px dotted ${isSelected ? "rgba(251,191,36,0.95)" : "rgba(251,191,36,0.45)"}`,
                                  pointerEvents: "none",
                                  zIndex: 5,
                                }}
                              />
                            ));
                          })}
                          {/* Speech-bubble markers — same size and style as reader view */}
                          {Object.entries(markerInfos).map(([fid, info]) => {
                            const isSelected = selectedFeedbackId === fid;
                            return (
                              <button
                                key={fid}
                                id={`editor-marker-${fid}`}
                                data-feedback-marker="1"
                                type="button"
                                title="View feedback"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFeedbackId(isSelected ? null : fid);
                                }}
                                style={{
                                  position: "absolute",
                                  top: info.top,
                                  left: info.left,
                                  zIndex: 10,
                                }}
                                className={`flex h-[20px] w-[20px] items-center justify-center rounded-full shadow-sm transition-all ${
                                  isSelected
                                    ? "bg-amber-400 text-amber-950 scale-110 shadow-amber-400/50"
                                    : "bg-amber-400/85 text-amber-950 hover:bg-amber-400 hover:scale-105"
                                }`}
                              >
                                <svg width="10" height="10" viewBox="0 0 9 9" fill="currentColor">
                                  <path d="M1 1h7v5H6L4 8V6H1V1z"/>
                                </svg>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {!previewMode && (
                        <div className="mt-2 flex items-center justify-between gap-4">
                          <p className="text-xs text-neutral-500">
                            Enter starts a new paragraph. Shift+Enter for a line break within a paragraph. Scene breaks: type *** on its own line.
                          </p>
                          <p className={`shrink-0 text-xs transition-opacity ${
                            autoSaveStatus === "idle" ? "opacity-0" :
                            autoSaveStatus === "saving" ? "text-neutral-400 opacity-100" :
                            autoSaveStatus === "saved" ? "text-emerald-400 opacity-100" :
                            "text-neutral-400 opacity-100"
                          }`}>
                            {autoSaveStatus === "saving" && "Saving…"}
                            {autoSaveStatus === "saved" && "Saved automatically"}
                            {autoSaveStatus === "error" && "Auto-save failed"}
                          </p>
                        </div>
                      )}
                    </div>

                    {!previewMode && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void saveSelectedChapter()}
                          disabled={manualSaving}
                          className="h-11 rounded-lg border border-[rgba(120,120,120,0.8)] bg-[rgba(120,120,120,0.2)] px-4 text-sm font-semibold text-white hover:bg-[rgba(120,120,120,0.28)] disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                          {manualSaving ? "Saving…" : "Save chapter"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setChapterEditorContent(selectedChapter.content)}
                          className="h-11 rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-sm text-neutral-200 hover:border-[rgba(120,120,120,0.65)]"
                        >
                          Reset changes
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Feedback aside — always visible when chapter is open */}
                <aside ref={feedbackAsideRef} className="w-72 shrink-0 rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] overflow-y-auto" style={{ position: "sticky", top: navH + 12, maxHeight: `calc(100vh - ${navH + 24}px)` }}>
                  <div className="mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                      Reader Feedback
                      {chapterFeedback.length > 0 && (
                        <span className="ml-2 rounded-full bg-[rgba(120,120,120,0.2)] px-2 py-0.5 text-[10px] font-normal text-[rgba(210,210,210,0.8)]">
                          {chapterFeedback.length}
                        </span>
                      )}
                    </h3>
                    <div className="mt-2 flex gap-1">
                      {(["unresolved", "resolved", "all"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFeedbackFilter(opt)}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium transition ${
                            feedbackFilter === opt
                              ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.22)] text-neutral-100"
                              : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-500 hover:text-neutral-300"
                          }`}
                        >
                          {opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const filtered = chapterFeedback.filter((f) =>
                      feedbackFilter === "all" ? true :
                      feedbackFilter === "resolved" ? (f.resolved || !!f.author_response) :
                      !f.resolved && !f.author_response
                    );
                    return filtered.length === 0 ? (
                    <p className="text-xs text-neutral-500 italic">No {feedbackFilter !== "all" ? feedbackFilter : ""} feedback on this chapter yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((f) => {
                        const isSelected = selectedFeedbackId === f.id;
                        const replies = feedbackReplies.filter((r) => r.feedback_id === f.id);
                        const readerName = feedbackNames[f.reader_id] || "Reader";
                        return (
                          <div
                            key={f.id}
                            id={`feedback-card-${f.id}`}
                            onClick={() => {
                              setSelectedFeedbackId(isSelected ? null : f.id);
                            }}
                            className={`cursor-pointer rounded-lg border p-3 transition ${
                              isSelected
                                ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.14)]"
                                : "border-[rgba(120,120,120,0.25)] bg-[rgba(120,120,120,0.05)] hover:border-[rgba(120,120,120,0.45)] hover:bg-[rgba(120,120,120,0.09)]"
                            } ${selectedFeedbackId && !isSelected ? "opacity-40" : ""}`}
                          >
                            {/* Header */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <p className="text-[11px] font-medium text-[rgba(210,210,210,0.85)]">{readerName}</p>
                              <span className="text-[10px] text-neutral-500">{new Date(f.created_at).toLocaleDateString()}</span>
                            </div>

                            {/* Excerpt */}
                            <blockquote className="border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
                              &ldquo;{f.selection_excerpt}&rdquo;
                            </blockquote>

                            {/* Chat thread */}
                            <div className="mt-2 rounded-lg bg-neutral-950/50 p-2 space-y-1.5">
                              {/* Reader's original comment — LEFT */}
                              <div className="flex justify-start">
                                <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-2">
                                  <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">{readerName}</p>
                                  <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                                </div>
                              </div>
                              {/* Reply bubbles */}
                              {replies.map((r) => {
                                const isAuthorReply = r.replier_id === authorUserId;
                                return (
                                  <div key={r.id} className={`flex ${isAuthorReply ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 ${isAuthorReply ? "rounded-tr-sm bg-white" : "rounded-tl-sm bg-neutral-100"}`}>
                                      <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">
                                        {isAuthorReply ? "You" : readerName}
                                      </p>
                                      <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{r.body}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Reply box — visible when this card is expanded (author only) */}
                            {isSelected && !isParentView && (
                              <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  rows={1}
                                  placeholder="Reply… (Enter to send)"
                                  value={replyDrafts[f.id] ?? ""}
                                  ref={(el) => { if (el) replyTextareaRefs.current.set(f.id, el); else replyTextareaRefs.current.delete(f.id); }}
                                  onChange={(e) => setReplyDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                                  onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 96) + "px"; }}
                                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void replyToFeedback(f.id); } }}
                                  className="flex-1 resize-none overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.5)] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void replyToFeedback(f.id); }}
                                  disabled={!(replyDrafts[f.id] ?? "").trim()}
                                  className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-[11px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
                                >
                                  Send
                                </button>
                              </div>
                            )}

                            {/* Report button — parent view only */}
                            {isParentView && (
                              <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setParentReportModal({
                                      readerId: f.reader_id,
                                      readerName: readerName,
                                      feedbackExcerpt: `${f.selection_excerpt ? `"${f.selection_excerpt}" — ` : ""}${f.comment_text}`,
                                    });
                                    setParentReportReason("");
                                    setParentReportDone(false);
                                    setParentReportMsg(null);
                                  }}
                                  className="rounded-lg border border-orange-700/50 bg-orange-950/15 px-2.5 py-1 text-[11px] text-orange-400 hover:bg-orange-950/30 transition"
                                >
                                  Report this feedback
                                </button>
                              </div>
                            )}

                            {/* Agree / Disagree buttons (author only) */}
                            {!isParentView && !f.author_response && (
                            <div className="mt-2.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void resolveFeedback(f.id, "agree"); }}
                                className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/40 transition"
                                title="Agree — acknowledges feedback and removes it from this view"
                              >
                                Agree
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void resolveFeedback(f.id, "disagree"); }}
                                className="rounded-lg border border-rose-700/60 bg-rose-900/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-900/40 transition"
                                title="Disagree — acknowledges feedback and removes it from this view"
                              >
                                Disagree
                              </button>
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                  })()}
                </aside>
              </div>
            );
          })()}
        </ManuscriptLayout>

        {showPendingPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowPendingPanel(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Pending beta readers"
              className="w-full max-w-md rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white">
                  Pending beta readers{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPendingPanel(false)}
                  className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-2 py-1 text-xs text-neutral-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-neutral-500 italic">No pending requests.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {pendingRequests.map((req) => (
                    <div key={req.user_id} className={`rounded-lg border px-3 py-2.5 ${req.isYouth ? "border-amber-700/40 bg-amber-950/10" : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)]"}`}>
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-neutral-700 bg-neutral-900">
                          {req.avatar_url ? (
                            <Image src={req.avatar_url} alt={req.pen_name || req.username || "Reader"} fill sizes="40px" className="object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-400">
                              {(req.pen_name || req.username || "R")[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-neutral-100 truncate">
                              {req.pen_name || (req.username ? `@${req.username}` : "Anonymous")}
                            </p>
                            {req.isYouth && (
                              <span className="shrink-0 rounded-lg border border-amber-600/50 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                                Youth (13–17)
                              </span>
                            )}
                          </div>
                          {req.username && req.pen_name && (
                            <p className="text-[11px] text-neutral-500 truncate">@{req.username}</p>
                          )}
                        </div>
                        {!isParentView && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void acceptRequest(req.user_id)}
                            className="rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-900/60 transition"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void denyRequest(req.user_id)}
                            className="rounded-lg border border-red-700/60 bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-900/40 transition"
                          >
                            Deny
                          </button>
                        </div>
                        )}
                      </div>
                      {isParentView && (
                        <p className="mt-2 text-[11px] text-neutral-400 leading-relaxed italic">
                          Only your child can approve or deny reader requests.
                        </p>
                      )}
                      {!isParentView && req.isYouth && (
                        <p className="mt-2 text-[11px] text-amber-300/80 leading-relaxed">
                          This reader is a youth profile (ages 13–17). Direct messaging is disabled between accounts. Standard feedback and coin reward rules apply.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rewardModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Reward reader Bloom Coins"
              className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl" style={{ color: "#f59e0b" }}>✿</span>
                <h2 className="text-base font-semibold text-white">Reward Bloom Coins</h2>
              </div>
              <p className="text-sm text-neutral-400 mb-4">
                Rewarding <span className="font-semibold text-neutral-200">{rewardModal.reader.pen_name || rewardModal.reader.username || "this reader"}</span>
              </p>

              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Amount</p>
              <div className="flex gap-2 mb-4">
                {([5, 10] as const).map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRewardAmount(amt)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition ${rewardAmount === amt ? "btn-success border-green-700 text-white" : "border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"}`}
                  >
                    <span style={{ color: "#f59e0b" }}>✿</span> {amt}
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Reason</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {REWARD_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRewardReason(r)}
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${rewardReason === r ? "border-[rgba(245,158,11,0.6)] bg-[rgba(245,158,11,0.1)] text-amber-300" : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <p className="text-xs text-neutral-500 mb-4">Your balance: {coinBalance.toLocaleString()} Bloom Coins</p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void sendReaderReward()}
                  disabled={!rewardReason}
                  className="btn-success h-9 flex-1 rounded-lg border px-3 text-sm font-medium text-white disabled:opacity-40"
                >
                  Send Reward
                </button>
                <button
                  type="button"
                  onClick={() => setRewardModal(null)}
                  className="h-9 flex-1 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {coinConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm Bloom Coin spend"
              className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl" style={{ color: "#f59e0b" }}>✿</span>
                <h2 className="text-base font-semibold text-white">Spend Bloom Coins?</h2>
              </div>
              <p className="mt-2 text-sm text-neutral-300">
                You are about to spend <span className="font-semibold text-white">{coinConfirm.amount} Bloom Coins</span> to {coinConfirm.label}.
              </p>
              <p className="mt-1 text-xs text-neutral-500">Current balance: {coinBalance.toLocaleString()} Bloom Coins</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { coinConfirm.onConfirm(); setCoinConfirm(null); }}
                  className="btn-success h-9 flex-1 rounded-lg border px-3 text-sm font-medium text-white"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setCoinConfirm(null)}
                  className="h-9 flex-1 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showUploadPurchasePrompt && <OutOfCoinsModal onClose={() => setShowUploadPurchasePrompt(false)} />}
      </div>

      {/* Parent disable manuscript modal */}
      {isParentView && parentDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setParentDisableModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Disable manuscript"
            className="w-full max-w-lg rounded-xl border border-red-900/60 bg-neutral-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-950/60 border border-red-800/50">
                <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Disable this manuscript?</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  This is a parental oversight action. Please read carefully before continuing.
                </p>
              </div>
            </div>

            {/* What this does */}
            <div className="mb-4 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-400">What will happen</p>
              <ul className="space-y-1.5 text-sm text-neutral-300">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400">•</span>
                  <span>The manuscript will be <strong className="text-white">unpublished immediately</strong>. Your child&apos;s beta readers will lose access.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400">•</span>
                  <span>Your child will be <strong className="text-white">notified</strong> that you have disabled their manuscript and why.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-400">•</span>
                  <span>Only <strong className="text-white">you</strong> can reinstate it. Your child cannot re-publish until you do.</span>
                </li>
              </ul>
            </div>

            {/* Talk to your child */}
            <div className="mb-4 rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-1">A note before you proceed</p>
              <p className="text-sm text-amber-200 leading-relaxed">
                We encourage you to <strong className="font-bold parent-note-emphasis">talk to your child</strong> about your concerns before or after disabling their manuscript. Open communication helps them understand your reasoning and builds trust.
              </p>
            </div>

            {/* Reason selection */}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Select a reason</p>
            <div className="space-y-2 mb-5">
              {PARENT_DISABLE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setParentDisableReason(r)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${parentDisableReason === r ? "border-red-600/60 bg-red-950/30 text-red-300" : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>

            {parentActionMsg && (
              <p className="mb-3 text-xs text-red-400">{parentActionMsg}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleParentDisable()}
                disabled={!parentDisableReason || parentDisableSubmitting}
                className="flex-1 h-10 rounded-lg border px-3 text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#dc2626", borderColor: "#b91c1c" }}
              >
                {parentDisableSubmitting ? "Disabling…" : "Yes, disable this manuscript"}
              </button>
              <button
                type="button"
                onClick={() => { setParentDisableModal(false); setParentDisableReason(""); }}
                className="flex-1 h-10 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteProjectModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-[rgba(18,18,18,0.98)] p-7 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-950/50 border border-red-900/50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Delete &ldquo;{manuscript?.title || "this manuscript"}&rdquo;?</h2>
            <p className="mt-2 text-sm text-neutral-300">
              This will permanently delete the entire project including all chapters, feedback, and reader access.
            </p>
            <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3">
              <p className="text-sm font-semibold text-red-400">⚠ This action cannot be undone.</p>
              <p className="mt-1 text-xs text-neutral-400">Once deleted, the manuscript will be removed from Discover, the community, and all beta reader feeds. There is no way to recover it.</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void deleteManuscript()}
                disabled={deletingProject}
                className="btn-red flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "#dc2626", border: "1px solid #dc2626" }}
              >
                {deletingProject ? "Deleting…" : "Yes, delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteProjectModal(false)}
                disabled={deletingProject}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {exportModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.97)] p-7 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-white">Export Manuscript</h2>
            <p className="mb-6 text-sm text-neutral-400">Choose a format to download all {chapters.length} chapter{chapters.length !== 1 ? "s" : ""} as a single document.</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => void exportAsDocx()}
                disabled={exporting}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-4 py-3 text-left text-sm text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-50 transition"
              >
                <span className="block font-medium">Word Document (.docx)</span>
                <span className="block text-xs text-neutral-400 mt-0.5">Opens in Microsoft Word, LibreOffice, or import to Google Docs</span>
              </button>
              <button
                onClick={exportAsHtml}
                disabled={exporting}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.12)] px-4 py-3 text-left text-sm text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-50 transition"
              >
                <span className="block font-medium">Google Docs (.html)</span>
                <span className="block text-xs text-neutral-400 mt-0.5">Open in Google Docs via File → Open, then select the downloaded file</span>
              </button>
            </div>
            <button
              onClick={() => setExportModal(false)}
              disabled={exporting}
              className="mt-5 w-full rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:text-white transition"
            >
              Cancel
            </button>
            {exporting && <p className="mt-3 text-center text-xs text-neutral-500">Generating document…</p>}
          </div>
        </div>
      )}
      {/* Parent report modal */}
      {isParentView && parentReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !parentReportDone && setParentReportModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-white">Report feedback from {parentReportModal.readerName}</h2>
              <p className="mt-1 text-xs text-neutral-400">Submitting this report will immediately restrict the user from messaging and beta reading until an admin reviews it.</p>
            </div>

            {parentReportModal.feedbackExcerpt && (
              <div className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Feedback</p>
                <p className="text-xs text-neutral-300 line-clamp-4">{parentReportModal.feedbackExcerpt}</p>
              </div>
            )}

            {!parentReportDone && (
              <>
                <div>
                  <p className="text-xs font-semibold text-neutral-400 mb-2">Reason for report</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      "Inappropriate feedback content",
                      "Grooming or predatory behavior",
                      "Harassment or bullying",
                      "Solicitation or off-platform contact",
                      "Sexual or explicit content",
                      "Other concerning behavior",
                    ].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setParentReportReason(r)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                          parentReportReason === r
                            ? "border-orange-600/60 bg-orange-950/20 text-orange-300"
                            : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {parentReportMsg && <p className="text-sm text-red-400">{parentReportMsg}</p>}

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setParentReportModal(null)}
                    className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!parentReportReason || parentReportSubmitting}
                    onClick={() => void submitParentReport()}
                    className="rounded-lg border border-orange-700/60 bg-orange-950/20 px-4 py-1.5 text-sm text-orange-300 hover:bg-orange-950/40 disabled:opacity-50 transition"
                  >
                    {parentReportSubmitting ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              </>
            )}

            {parentReportDone && (
              <>
                <p className="text-sm text-emerald-300">{parentReportMsg}</p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setParentReportModal(null)}
                    className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
