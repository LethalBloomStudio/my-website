"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unused-expressions */

export const dynamic = "force-dynamic";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ManuscriptLayout, { DetailRow } from "@/components/ManuscriptLayout";
import OutOfCoinsModal from "@/components/OutOfCoinsModal";
import ExitReasonModal, { OWNER_REMOVE_REASONS } from "@/components/ExitReasonModal";
import BetaReaderAnalyticsPanel from "@/components/BetaReaderAnalyticsPanel";
import ProfileImageUpload from "@/components/ProfileImageUpload";
import ProseTextarea from "@/components/ProseTextarea";
import ChapterEditor from "@/components/ChapterEditor";
import FormatPicker from "@/components/FormatPicker";
import { FORMATS, type FormatId } from "@/lib/format/manuscriptFormats";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { countWords } from "@/lib/format/normalizeManuscript";
import { normalizeChapterText, chapterTextToPlainText, chapterTextToPreviewHtml, sanitizeChapterHtml } from "@/lib/format/chapterNormalize";
import { createRangeFromTextOffsets, extractVisibleText } from "@/lib/manuscript/readerSelection";
import { resolveFeedbackAnchor } from "@/lib/manuscript/feedbackAnchor";
import { shiftFeedbackOffsets } from "@/lib/manuscript/feedbackOffsets";
import { genreOptionsForAgeCategory, WRITER_LEVELS, FEEDBACK_PREFERENCE_OPTIONS } from "@/lib/profileOptions";
import { hasYouthAudienceCategory } from "@/lib/manuscriptAudience";
import { getPromotionState } from "@/lib/promotionState";
import { getGiftState } from "@/lib/giftState";
import NotesPanel from "@/components/NotesPanel";

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
  stage: "alpha" | "beta" | null;
  format_id: string | null;
};

type Chapter = {
  id: string;
  chapter_order: number;
  title: string;
  content: string;
  is_private: boolean;
  created_at: string;
  chapter_type: "chapter" | "prologue" | "epilogue" | "trigger_page";
};

type AcceptedReader = {
  user_id: string;
  avatar_url: string | null;
  pen_name: string | null;
  username: string | null;
  disabled?: boolean;
  left?: boolean;
  suspended?: boolean;
  exitReason?: {
    initiatedBy: "reader" | "owner";
    category: string;
    detail: string | null;
    at: string;
  };
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
  start_offset?: number | null;
  end_offset?: number | null;
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

const CHAPTER_UPDATE_CATEGORIES = [
  "Fixed typos/grammar",
  "Revised dialogue",
  "Added scene",
  "Removed scene",
  "Rewrote section",
  "Changed pacing/structure",
  "Other",
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
  const filterParam = searchParams?.get("filter") ?? null;
  const urlParamsApplied = useRef<string>("");

  const [loading, setLoading] = useState(true);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteProjectModal, setDeleteProjectModal] = useState(false);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const [coverUrl, setCoverUrl] = useState("");
  const [manuscriptTitle, setManuscriptTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedFeedback, setRequestedFeedback] = useState<"bloom" | "forge" | "lethal">("bloom");
  const [stage, setStage] = useState<"alpha" | "beta">("beta");
  const [profileFeedbackPreference, setProfileFeedbackPreference] = useState<string>("gentle");
  const [potentialTriggers, setPotentialTriggers] = useState("");
  const [copyrightInfo, setCopyrightInfo] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [isMatureContent, setIsMatureContent] = useState(false);
  const [isPotentiallyTriggering, setIsPotentiallyTriggering] = useState(false);
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
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);
  const [readerSlots, setReaderSlots] = useState(3);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const [readerCanScrollLeft, setReaderCanScrollLeft] = useState(false);
  const [readerCanScrollRight, setReaderCanScrollRight] = useState(false);
  const [showUploadPurchasePrompt, setShowUploadPurchasePrompt] = useState(false);
  const [coinConfirm, setCoinConfirm] = useState<{ amount: number; label: string; onConfirm: () => void } | null>(null);
  const [rewardModal, setRewardModal] = useState<{ reader: AcceptedReader } | null>(null);
  const [rewardAmount, setRewardAmount] = useState<5 | 10>(5);
  const [rewardReason, setRewardReason] = useState("");
  const [removeReaderModal, setRemoveReaderModal] = useState<{ readerId: string } | null>(null);
  const [removeReaderSubmitting, setRemoveReaderSubmitting] = useState(false);
  const [exitTooltip, setExitTooltip] = useState<{ reader: AcceptedReader; x: number; y: number } | null>(null);
  const [enableReaderConfirm, setEnableReaderConfirm] = useState<{ readerId: string } | null>(null);
  const [chapterUpdateModal, setChapterUpdateModal] = useState(false);
  const [chapterUpdateCategories, setChapterUpdateCategories] = useState<string[]>([]);
  const [chapterUpdateNote, setChapterUpdateNote] = useState("");
  const [chapterUpdateSubmitting, setChapterUpdateSubmitting] = useState(false);
  const [lastChapterUpdate, setLastChapterUpdate] = useState<{ categories: string[]; note: string | null; created_at: string } | null>(null);
  const [lastChapterUpdateLoading, setLastChapterUpdateLoading] = useState(false);
  const [authorUserId, setAuthorUserId] = useState<string | null>(null);
  const [manuscriptLedger, setManuscriptLedger] = useState<{ id: string; delta: number; reason: string; created_at: string; metadata?: Record<string, unknown> }[]>([]);
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
  const chapterChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const feedbackChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [onlineReaderIds, setOnlineReaderIds] = useState<Set<string>>(new Set());
  const replyTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const replyingRef = useRef<Set<string>>(new Set());
  const [feedbackFilter, setFeedbackFilter] = useState<"unresolved" | "agreed" | "disagreed" | "all">("unresolved");
  const [overviewFeedbackFilter, setOverviewFeedbackFilter] = useState<"unresolved" | "agreed" | "disagreed" | "all">("unresolved");
  const [overviewExpandedIds, setOverviewExpandedIds] = useState<Set<string>>(new Set());
  const [feedbackNames, setFeedbackNames] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const feedbackIdsRef = useRef<string[]>([]);
  // Feedback ids whose replies were marked read locally this session. A later
  // GET /api/feedback/unread-replies can resolve with a stale pre-write count;
  // these ids are suppressed from that refetch so the optimistic clear isn't
  // clobbered by a race with the mark-read POST.
  const clearedReplyFeedbackIdsRef = useRef<Set<string>>(new Set());
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
  const [highlightedReplyId, setHighlightedReplyId] = useState<string | null>(null);
  const hasScrolledToReplyRef = useRef<string | null>(null);
  const [unreadReplyCounts, setUnreadReplyCounts] = useState<Record<string, number>>({});
  const [editorOffsetY, setEditorOffsetY] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [ownerPenName, setOwnerPenName] = useState("");
  const [isRowLayout, setIsRowLayout] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const floatingCardRef = useRef<HTMLDivElement>(null);
  const chapterSectionRef = useRef<HTMLElement>(null);
  const [chapterSectionH, setChapterSectionH] = useState(0);
  const prevMarkerInfosRef = useRef<Record<string, unknown>>({});
  const overviewFeedbackSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    feedbackIdsRef.current = feedbackItems.map((f) => f.id);
  }, [feedbackItems]);

  async function refreshFeedbackReplies() {
    const ids = feedbackIdsRef.current;
    if (ids.length === 0) {
      setFeedbackReplies([]);
      return;
    }
    const { data } = await supabase
      .from("line_feedback_replies")
      .select("id, feedback_id, replier_id, body, created_at")
      .in("feedback_id", ids)
      .order("created_at", { ascending: true });
    const fetched = (data as FeedbackReply[] | null) ?? [];
    setFeedbackReplies((prev) => {
      const merged = [...prev];
      for (const r of fetched) {
        if (!merged.some((p) => p.id === r.id)) merged.push(r);
      }
      return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }

  async function refreshFeedbackItems() {
    if (!manuscriptId) return;
    const { data: fbData, error: fbError } = await supabase
      .from("line_feedback")
      .select("id, reader_id, chapter_id, selection_excerpt, comment_text, created_at, resolved, author_response, start_offset, end_offset")
      .eq("manuscript_id", manuscriptId)
      .order("created_at", { ascending: false });
    if (fbError) return;

    const rows = (fbData as LineFeedback[] | null) ?? [];
    setFeedbackItems(rows);

    const readerIds = Array.from(new Set(rows.map((f) => f.reader_id)));
    if (readerIds.length === 0) {
      setFeedbackNames({});
      return;
    }

    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("user_id, pen_name, username")
      .in("user_id", readerIds);
    const nextNames: Record<string, string> = {};
    ((profiles as { user_id: string; pen_name: string | null; username: string | null }[] | null) ?? []).forEach((p) => {
      nextNames[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Reader");
    });
    setFeedbackNames(nextNames);
  }
  const [navH, setNavH] = useState(0);
  type MarkerInfo = { top: number; left: number; highlightRects: { top: number; left: number; width: number; height: number }[] };
  const [markerInfos, setMarkerInfos] = useState<Record<string, MarkerInfo>>({});
  // The chapter text actually in the live .chapter-editor DOM right now,
  // shared by the workspace card filter/sort below so they never disagree
  // with marker placement about what's actually on screen. null means "not
  // computed yet for the current chapter" - callers must treat that as
  // pending, not as "not found."
  const [editorChapterDomText, setEditorChapterDomText] = useState<string | null>(null);
  const markerOffsets = useMemo(() => {
    const entries = Object.entries(markerInfos)
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const groups: { ids: string[] }[] = [];
    for (const entry of entries) {
      const last = groups[groups.length - 1];
      const lastEntry = last ? entries.find((candidate) => candidate.id === last.ids[last.ids.length - 1]) : null;
      if (last && lastEntry && Math.abs(lastEntry.top - entry.top) <= 14 && Math.abs(lastEntry.left - entry.left) <= 26) {
        last.ids.push(entry.id);
      } else {
        groups.push({ ids: [entry.id] });
      }
    }
    const offsets: Record<string, number> = {};
    for (const group of groups) {
      const spacing = 16;
      const start = -((group.ids.length - 1) * spacing) / 2;
      group.ids.forEach((id, index) => {
        offsets[id] = start + index * spacing;
      });
    }
    return offsets;
  }, [markerInfos]);

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterEditorTitle, setChapterEditorTitle] = useState("");
  const [chapterEditorContent, setChapterEditorContent] = useState("");
  const [chapterType, setChapterType] = useState<"chapter" | "prologue" | "epilogue" | "trigger_page">("chapter");
  const [formatId, setFormatId] = useState<FormatId>("minimal");
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);
  // Only allow a drag to start when mousedown originated on the row's grip handle,
  // not anywhere on the row (which also contains the chapter-select button).
  const dragArmedFromHandle = useRef(false);
  const [reorderUndo, setReorderUndo] = useState<{
    manuscriptId: string;
    label: string;
    previousUpdates: Array<{ id: string; chapter_order: number; title: string }>;
  } | null>(null);
  const reorderUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedChapterIdRef = useRef<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [rewardToast, setRewardToast] = useState<string | null>(null);
  // Track the last content/title/type that was actually saved to DB to avoid unnecessary writes
  const lastSavedContent = useRef<string>("");
  const lastSavedTitle = useRef<string>("");
  const lastSavedChapterType = useRef<"chapter" | "prologue" | "epilogue" | "trigger_page">("chapter");
  // Track last-saved manuscript info to drive auto-save
  const infoAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedInfo = useRef<string>("");
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

  // Keep line_feedback start_offset/end_offset in sync with chapter content edits so
  // highlight markers don't drift onto a later occurrence of the same text after a save.
  async function syncFeedbackOffsetsForChapterSave(chapterId: string, oldContent: string, newContent: string) {
    if (oldContent === newContent) return;
    const items = feedbackItems.filter(
      (f) => f.chapter_id === chapterId && f.start_offset != null && f.end_offset != null
    ) as Array<{ id: string; start_offset: number; end_offset: number }>;
    if (items.length === 0) return;

    const toVisible = (text: string) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = chapterTextToPreviewHtml(text);
      return extractVisibleText(tmp);
    };
    const shifted = shiftFeedbackOffsets(toVisible(oldContent), toVisible(newContent), items);

    const changed = shifted.filter((s) => {
      const orig = items.find((i) => i.id === s.id)!;
      return orig.start_offset !== s.start_offset || orig.end_offset !== s.end_offset;
    });
    if (changed.length === 0) return;

    await Promise.all(
      changed.map((c) =>
        supabase.from("line_feedback").update({ start_offset: c.start_offset, end_offset: c.end_offset }).eq("id", c.id)
      )
    );
    setFeedbackItems((prev) =>
      prev.map((f) => {
        const c = changed.find((c) => c.id === f.id);
        return c ? { ...f, start_offset: c.start_offset, end_offset: c.end_offset } : f;
      })
    );
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedChapterId) return;
    const contentChanged = chapterEditorContent !== lastSavedContent.current;
    const titleChanged = chapterEditorTitle !== lastSavedTitle.current;
    const typeChanged = chapterType !== lastSavedChapterType.current;
    if (!contentChanged && !titleChanged && !typeChanged) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("idle");

    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        if (!chapterEditorContent.trim()) return;
        const oldContent = lastSavedContent.current;
        setAutoSaveStatus("saving");
        const { error } = await supabase
          .from("manuscript_chapters")
          .update({
            title: chapterEditorTitle.trim() || "Untitled Chapter",
            content: chapterEditorContent.trim(),
            chapter_type: chapterType,
          })
          .eq("id", selectedChapterId);
        if (error) {
          setAutoSaveStatus("error");
        } else {
          lastSavedContent.current = chapterEditorContent;
          lastSavedTitle.current = chapterEditorTitle;
          lastSavedChapterType.current = chapterType;
          // Update local chapters state so sidebar labels reflect the saved type.
          // content must be included so the useEffect([chapters, selectedChapterId])
          // that re-reads from this array doesn't overwrite the editor with stale DB content.
          setChapters((prev) => prev.map((c) => c.id === selectedChapterId ? { ...c, title: chapterEditorTitle.trim() || "Untitled Chapter", chapter_type: chapterType, content: chapterEditorContent } : c));
          setAutoSaveStatus("saved");
          setTimeout(() => setAutoSaveStatus("idle"), 3000);
          void syncFeedbackOffsetsForChapterSave(selectedChapterId, oldContent, chapterEditorContent.trim());
        }
      })();
    }, 2000);

    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [chapterEditorContent, chapterEditorTitle, chapterType, selectedChapterId, supabase]);

  // ── Auto-save manuscript info fields ──────────────────────────────────────
  useEffect(() => {
    if (!manuscript) return;
    if (!lastSavedInfo.current) return; // baseline not yet set (still loading)
    const allCats = [...selectedCategories, ...(isMatureContent ? ["Mature Content"] : []), ...(isPotentiallyTriggering ? ["Potentially Triggering Content"] : [])];
    const current = JSON.stringify({
      title: manuscriptTitle.trim(),
      description: description.trim(),
      categories: allCats,
      potentialTriggers: potentialTriggers.trim(),
      copyrightInfo: copyrightInfo.trim(),
      stage,
      requestedFeedback,
    });
    if (current === lastSavedInfo.current) return;
    if (!manuscriptTitle.trim() || selectedCategories.length === 0) return;

    if (infoAutoSaveTimer.current) clearTimeout(infoAutoSaveTimer.current);
    infoAutoSaveTimer.current = setTimeout(() => {
      void (async () => {
        const payload = {
          title: manuscriptTitle.trim(),
          description: description.trim(),
          stage,
          requested_feedback: requestedFeedback,
          potential_triggers: potentialTriggers.trim(),
          copyright_info: copyrightInfo.trim(),
          categories: allCats,
          genre: selectedCategories[0] ?? null,
        };
        const { error } = await supabase.from("manuscripts").update(payload).eq("id", manuscript.id);
        if (!error) {
          lastSavedInfo.current = current;
          setSaveToast(true);
        }
      })();
    }, 1500);
    return () => { if (infoAutoSaveTimer.current) clearTimeout(infoAutoSaveTimer.current); };
  }, [manuscriptTitle, description, selectedCategories, isMatureContent, isPotentiallyTriggering, potentialTriggers, copyrightInfo, stage, requestedFeedback, manuscript, supabase]);

  function friendlyDbError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("row-level security") || m.includes("permission denied")) {
      return "Permission blocked by database policy. Run the manuscript policy SQL fix, then retry.";
    }
    return message;
  }

  async function replyToFeedback(feedbackId: string) {
    if (replyingRef.current.has(feedbackId)) return;
    replyingRef.current.add(feedbackId);
    const body = (replyDrafts[feedbackId] ?? "").trim();
    if (!body || !authorUserId) { replyingRef.current.delete(feedbackId); return; }
    const res = await fetch("/api/manuscript/feedback/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: feedbackId, body }),
    });
    const json = (await res.json()) as { ok?: boolean; reply?: FeedbackReply; error?: string };
    replyingRef.current.delete(feedbackId);
    if (!res.ok || json.error) return setMsg(json.error ?? "Failed to submit reply.");
    setReplyDrafts((p) => ({ ...p, [feedbackId]: "" }));
    const ta = replyTextareaRefs.current.get(feedbackId);
    if (ta) { ta.style.height = "auto"; }
    if (json.reply) setFeedbackReplies((p) => [...p, json.reply!].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    void refreshFeedbackReplies();
  }

  async function resolveFeedback(feedbackId: string, response: "agree" | "disagree") {
    const { error } = await supabase.from("line_feedback").update({ resolved: true, author_response: response }).eq("id", feedbackId);
    if (error) return setMsg(error.message);
    if (selectedFeedbackId === feedbackId) { setSelectedFeedbackId(null); }
    setFeedbackItems((prev) => prev.map((f) => f.id === feedbackId ? { ...f, resolved: true, author_response: response } : f));
    // Clear the reader's own "Your feedback on X" notification now that the
    // author has responded - best-effort, doesn't block/fail the resolve
    // action if it errors. Server-side because notification_read_keys can
    // only be written by the reader themselves via RLS, not the owner.
    void fetch("/api/manuscript/feedback/mark-resolved-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: feedbackId }),
    }).catch((err) => console.error("Failed to clear reader's feedback notification:", err));
  }

  async function undoResolveFeedback(feedbackId: string) {
    const { error } = await supabase.from("line_feedback").update({ resolved: false, author_response: null }).eq("id", feedbackId);
    if (error) return setMsg(error.message);
    setFeedbackItems((prev) => prev.map((f) => f.id === feedbackId ? { ...f, resolved: false, author_response: null } : f));
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
        setStage(ms.stage === "alpha" ? "alpha" : "beta");
        setPotentialTriggers(ms.potential_triggers ?? "");
        setCopyrightInfo(ms.copyright_info ?? "");
        const rawCats = ms.categories && ms.categories.length > 0 ? ms.categories : ms.genre ? [ms.genre] : [];
        setIsMatureContent(rawCats.includes("Mature Content"));
        setIsPotentiallyTriggering(rawCats.includes("Potentially Triggering Content"));
        const genreCats = rawCats.filter((c: string) => c !== "Mature Content" && c !== "Potentially Triggering Content");
        setSelectedCategories(genreCats);
        lastSavedInfo.current = JSON.stringify({
          title: (ms.title ?? "").trim(),
          description: (ms.description ?? "").trim(),
          categories: rawCats,
          potentialTriggers: (ms.potential_triggers ?? "").trim(),
          copyrightInfo: (ms.copyright_info ?? "").trim(),
          stage: ms.stage === "alpha" ? "alpha" : "beta",
          requestedFeedback: ms.requested_feedback === "forge" || ms.requested_feedback === "lethal" || ms.requested_feedback === "bloom" ? ms.requested_feedback : "bloom",
        });
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
      .select("age_category, subscription_status, bloom_coins, active_promotion_id, promotion_expires_at, active_gift_membership_id, gift_access_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    const accountRow = (account as { age_category?: string | null; subscription_status?: string | null; bloom_coins?: number | null; active_promotion_id?: string | null; promotion_expires_at?: string | null; active_gift_membership_id?: string | null; gift_access_expires_at?: string | null } | null);
    const promoState = getPromotionState(accountRow);
    if (promoState.shouldClearPromotion) {
      await supabase
        .from("accounts")
        .update({ active_promotion_id: null, promotion_expires_at: null })
        .eq("user_id", userId);
    }
    const normalizedAccountRow = promoState.shouldClearPromotion && accountRow
      ? { ...accountRow, active_promotion_id: null, promotion_expires_at: null }
      : accountRow;
    const ageCategory = normalizedAccountRow?.age_category;
    setProfileAgeCategory(ageCategory === "youth_13_17" ? "youth_13_17" : "adult_18_plus");
    setCoinBalance(Number(normalizedAccountRow?.bloom_coins ?? 0));

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
    // memberTier is based on subscription_status OR an active promotion
    // writer_level is the user's self-selected writing experience - unrelated to subscription
    const subscription = (normalizedAccountRow?.subscription_status ?? "").toLowerCase().trim();
    const onActivePromo = promoState.shouldClearPromotion ? false : promoState.onActivePromo;
    const { onActiveGift } = getGiftState(normalizedAccountRow);
    setMemberTier(
      subscription === "lethal" || subscription.includes("lethal") || onActivePromo || onActiveGift ? "lethal" :
      subscription === "forge" || subscription.includes("forge") ? "forge" :
      "bloom"
    );

    const { data, error } = await supabase
      .from("manuscripts")
      .select(
        "id, owner_id, created_at, title, visibility, genre, categories, age_rating, cover_url, description, requested_feedback, potential_triggers, copyright_info, format_id, stage",
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
      .select("id, chapter_order, title, content, is_private, created_at, chapter_type")
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
      const exitedIds = readerIds.filter((id) => disabledSet.has(id) || leftSet.has(id));
      const [{ data: profileRows }, conductRes, { data: exitReasonRows }] = await Promise.all([
        supabase.from("public_profiles").select("user_id, avatar_url, pen_name, username").in("user_id", readerIds),
        fetch("/api/manuscript/reader-conduct-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: readerIds }),
        }).then((r) => r.json() as Promise<{ suspended?: string[] }>),
        exitedIds.length > 0
          ? supabase
              .from("manuscript_reader_exit_reasons")
              .select("reader_id, initiated_by, reason_category, reason_detail, created_at")
              .eq("manuscript_id", manuscriptId)
              .in("reader_id", exitedIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as { reader_id: string; initiated_by: string; reason_category: string; reason_detail: string | null; created_at: string }[] }),
      ]);
      const byUserId = new Map<string, AcceptedReader>();
      ((profileRows as AcceptedReader[] | null) ?? []).forEach((row) => byUserId.set(row.user_id, row));
      const suspendedSet = new Set(conductRes.suspended ?? []);
      const exitReasonByReader = new Map<string, AcceptedReader["exitReason"]>();
      (exitReasonRows as Array<{ reader_id: string; initiated_by: string; reason_category: string; reason_detail: string | null; created_at: string }> | null ?? []).forEach((row) => {
        if (exitReasonByReader.has(row.reader_id)) return; // rows are ordered newest-first; keep only the most recent
        exitReasonByReader.set(row.reader_id, {
          initiatedBy: row.initiated_by === "owner" ? "owner" : "reader",
          category: row.reason_category,
          detail: row.reason_detail,
          at: row.created_at,
        });
      });
      setAcceptedReaders(
        readerIds.map((id) => ({
          ...(byUserId.get(id) ?? { user_id: id, avatar_url: null, pen_name: null, username: null }),
          disabled: disabledSet.has(id),
          left: leftSet.has(id),
          suspended: suspendedSet.has(id),
          exitReason: exitReasonByReader.get(id),
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

    // Fetch coin activity - author spends on this manuscript
    const { data: ledgerRows } = await supabase
      .from("bloom_coin_ledger")
      .select("id, delta, reason, created_at, metadata")
      .eq("user_id", userId)
      .filter("metadata->>manuscript_id", "eq", manuscriptId)
      .order("created_at", { ascending: false })
      .limit(20);
    const lRows = (ledgerRows as { id: string; delta: number; reason: string; created_at: string; metadata?: Record<string, unknown> }[] | null) ?? [];
    setManuscriptLedger(lRows);

    // Fetch reader chapter completions for this manuscript (coins earned by readers)
    const { data: completionRows } = await supabase
      .from("chapter_read_completions")
      .select("chapter_id, reader_id, coins_awarded, completed_at")
      .eq("manuscript_id", manuscriptId)
      .order("completed_at", { ascending: false })
      .limit(50);
    const cRows = (completionRows as { chapter_id: string; reader_id: string; coins_awarded: number; completed_at: string }[] | null) ?? [];
    setReaderCompletions(cRows);

    // Resolve names for all involved reader IDs (completions + reward recipients)
    const rewardRecipientIds = lRows
      .filter((e) => e.reason === "reader_reward" && typeof e.metadata?.reader_id === "string")
      .map((e) => e.metadata!.reader_id as string);
    const completionReaderIds = Array.from(new Set([...cRows.map((c) => c.reader_id), ...rewardRecipientIds]));
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
      .select("id, reader_id, chapter_id, selection_excerpt, comment_text, created_at, resolved, author_response, start_offset, end_offset")
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
        supabase.from("line_feedback_replies").select("id, feedback_id, replier_id, body, created_at").in("feedback_id", fbIds).order("created_at", { ascending: true }),
        supabase.from("public_profiles").select("user_id, pen_name, username")
          .in("user_id", Array.from(new Set(fbRows.map((f) => f.reader_id)))),
      ]);
      setFeedbackReplies((repRes.data as FeedbackReply[] | null) ?? []);
      const unreadRes = await fetch(`/api/feedback/unread-replies?feedback_ids=${fbIds.join(",")}`);
      if (unreadRes.ok) {
        const unreadData = await unreadRes.json() as { unread: Record<string, number> };
        const merged = { ...unreadData.unread };
        for (const id of clearedReplyFeedbackIdsRef.current) delete merged[id];
        setUnreadReplyCounts(merged);
      }
      const nm: Record<string, string> = {};
      ((profRes.data as { user_id: string; pen_name: string | null; username: string | null }[] | null) ?? []).forEach((p) => {
        nm[p.user_id] = p.pen_name || (p.username ? `@${p.username}` : "Reader");
      });
      setFeedbackNames(nm);
    } else {
      setFeedbackReplies([]);
      setUnreadReplyCounts({});
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
    setStage(row.stage === "alpha" ? "alpha" : "beta");
    setPotentialTriggers(row.potential_triggers ?? "");
    setCopyrightInfo(row.copyright_info ?? "");
    if (row.format_id && row.format_id in FORMATS) {
      setFormatId(row.format_id as FormatId);
    } else if (manuscriptId) {
      const saved = localStorage.getItem(`lbs-format-${manuscriptId}`);
      if (saved && saved in FORMATS) setFormatId(saved as FormatId);
    }
    const rawCats2 = row.categories && row.categories.length > 0 ? row.categories : row.genre ? [row.genre] : [];
    setIsMatureContent(rawCats2.includes("Mature Content"));
    setIsPotentiallyTriggering(rawCats2.includes("Potentially Triggering Content"));
    const genreCats2 = rawCats2.filter((c: string) => c !== "Mature Content" && c !== "Potentially Triggering Content");
    setSelectedCategories(genreCats2);
    lastSavedInfo.current = JSON.stringify({
      title: (row.title ?? "").trim(),
      description: (row.description ?? "").trim(),
      categories: rawCats2,
      potentialTriggers: (row.potential_triggers ?? "").trim(),
      copyrightInfo: (row.copyright_info ?? "").trim(),
      stage: row.stage === "alpha" ? "alpha" : "beta",
      requestedFeedback: row.requested_feedback === "forge" || row.requested_feedback === "lethal" || row.requested_feedback === "bloom" ? row.requested_feedback : "bloom",
    });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load is a component function; only re-run when manuscript changes
  }, [manuscriptId, supabase]);


  // Apply ?chapter=&feedback= URL params after load; re-applies when params change (handles
  // same-page navigation from notification links without a full remount)
  useEffect(() => {
    if (loading) return;
    const chapterParam = searchParams?.get("chapter");
    const feedbackParam = searchParams?.get("feedback");
    const replyParam = searchParams?.get("reply");
    if (!chapterParam && !feedbackParam && !filterParam) return;
    const paramKey = `${chapterParam ?? ""}|${feedbackParam ?? ""}|${filterParam ?? ""}|${replyParam ?? ""}`;
    if (urlParamsApplied.current === paramKey) return;
    urlParamsApplied.current = paramKey;
    if (replyParam) setSelectedReplyId(replyParam);
    if (filterParam === "agreed" || filterParam === "disagreed" || filterParam === "unresolved" || filterParam === "all") {
      setOverviewFeedbackFilter(filterParam);
    }
    if (chapterParam) {
      const exists = chapters.some((c) => c.id === chapterParam);
      if (exists) {
        setSelectedChapterId(chapterParam);
        if (feedbackParam) {
          setSelectedFeedbackId(feedbackParam);
        }
      }
    } else if (feedbackParam) {
      // Chapterless feedback (e.g. a manuscript-level comment) has no chapter
      // marker to navigate to - select it, auto-expand its thread in the
      // beta-reader feedback list below, and scroll that section into view.
      setSelectedFeedbackId(feedbackParam);
      setOverviewExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(feedbackParam);
        return next;
      });
      overviewFeedbackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, chapters, searchParams]);

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
    setExitTooltip(null);
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

  // Presence — track which accepted readers are currently viewing the manuscript
  useEffect(() => {
    if (!manuscriptId) return;
    if (presenceChannelRef.current) void supabase.removeChannel(presenceChannelRef.current);
    const ch = supabase
      .channel(`manuscript-presence:${manuscriptId}`)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, { user_id: string }[]>;
        const ids = new Set(
          Object.values(state).flatMap((presences) => presences.map((p) => p.user_id))
        );
        setOnlineReaderIds(ids);
      })
      .subscribe();
    presenceChannelRef.current = ch;
    return () => {
      if (presenceChannelRef.current) void supabase.removeChannel(presenceChannelRef.current);
    };
  }, [manuscriptId, supabase]);

  // Display-only stable partition: online readers first, offline readers after,
  // each group keeping acceptedReaders's existing relative order. Re-sorts live
  // as onlineReaderIds changes, so readers can visibly shift position as they
  // come online/offline - intentional. acceptedReaders itself is untouched.
  const sortedAcceptedReaders = useMemo(
    () => [...acceptedReaders].sort((a, b) => {
      const aOnline = onlineReaderIds.has(a.user_id);
      const bOnline = onlineReaderIds.has(b.user_id);
      return aOnline === bOnline ? 0 : aOnline ? -1 : 1;
    }),
    [acceptedReaders, onlineReaderIds],
  );

  // Realtime - live feedback replies
  // No polling: realtime INSERT events handle all live updates
  useEffect(() => {
    if (!authorUserId || !manuscriptId) return;

    if (replyChannelRef.current) void supabase.removeChannel(replyChannelRef.current);
    const ch = supabase
      .channel(`feedback-replies-${manuscriptId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_feedback_replies" }, (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as FeedbackReply;
        if (!feedbackIdsRef.current.includes(r.feedback_id)) return;
        setFeedbackReplies((prev) => {
          const next = prev.some((p) => p.id === r.id) ? prev : [...prev, r];
          return [...next].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
        if (r.replier_id !== authorUserId) {
          setUnreadReplyCounts((prev) => ({ ...prev, [r.feedback_id]: (prev[r.feedback_id] ?? 0) + 1 }));
        }
      })
      .subscribe();
    replyChannelRef.current = ch;

    return () => {
      if (replyChannelRef.current) void supabase.removeChannel(replyChannelRef.current);
    };
  }, [authorUserId, manuscriptId, supabase]);

  // Realtime - new feedback items from readers appear live without reload
  useEffect(() => {
    if (!manuscriptId || !authorUserId) return;
    if (feedbackChannelRef.current) void supabase.removeChannel(feedbackChannelRef.current);
    const ch = supabase
      .channel(`line-feedback-${manuscriptId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "line_feedback", filter: `manuscript_id=eq.${manuscriptId}` },
        async (payload: { new: Record<string, unknown> }) => {
          const f = payload.new as LineFeedback;
          setFeedbackItems((prev) => prev.some((p) => p.id === f.id) ? prev : [f, ...prev]);
          setFeedbackNames((prev) => {
            if (prev[f.reader_id]) return prev;
            void supabase
              .from("public_profiles")
              .select("user_id, pen_name, username")
              .eq("user_id", f.reader_id)
              .maybeSingle()
              .then((result: { data: unknown }) => {
                if (result.data) {
                  const p = result.data as { user_id: string; pen_name: string | null; username: string | null };
                  setFeedbackNames((n) => ({ ...n, [p.user_id]: p.pen_name || (p.username ? `@${p.username}` : "Reader") }));
                }
              });
            return prev;
          });
        },
      )
      .subscribe();
    feedbackChannelRef.current = ch;
    return () => { if (feedbackChannelRef.current) void supabase.removeChannel(feedbackChannelRef.current); };
  }, [manuscriptId, authorUserId, supabase]);

  // Live chapter list — syncs additions from other tabs (e.g. chapters/new page)
  useEffect(() => {
    if (!manuscriptId) return;
    if (chapterChannelRef.current) void supabase.removeChannel(chapterChannelRef.current);

    const ch = supabase
      .channel(`manuscript-chapters-${manuscriptId}-owner`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "manuscript_chapters", filter: `manuscript_id=eq.${manuscriptId}` },
        (payload: { new: Record<string, unknown> }) => {
          const c = payload.new as Chapter;
          setChapters((prev) => prev.some((p) => p.id === c.id) ? prev : [...prev, c].sort((a, b) => a.chapter_order - b.chapter_order));
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "manuscript_chapters", filter: `manuscript_id=eq.${manuscriptId}` },
        (payload: { new: Record<string, unknown> }) => {
          const c = payload.new as Chapter;
          setChapters((prev) => prev.map((p) => p.id === c.id ? c : p).sort((a, b) => a.chapter_order - b.chapter_order));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "manuscript_chapters", filter: `manuscript_id=eq.${manuscriptId}` },
        (payload: { old: Record<string, unknown> }) => {
          const old = payload.old as { id: string };
          setChapters((prev) => prev.filter((p) => p.id !== old.id));
        })
      .subscribe();

    chapterChannelRef.current = ch;
    return () => { if (chapterChannelRef.current) void supabase.removeChannel(chapterChannelRef.current); };
  }, [manuscriptId, supabase]);

  // Realtime subscription - keep coin balance live as coins are earned/spent anywhere
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

  // Realtime subscription - keep chapter completion coin log live
  useEffect(() => {
    if (!manuscriptId) return;
    const channel = supabase
      .channel(`chapter-completions-${manuscriptId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chapter_read_completions", filter: `manuscript_id=eq.${manuscriptId}` },
        async (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { chapter_id: string; reader_id: string; coins_awarded: number; completed_at: string };
          setReaderCompletions((prev) => {
            const already = prev.some((c) => c.chapter_id === row.chapter_id && c.reader_id === row.reader_id);
            if (already) return prev;
            return [row, ...prev];
          });
          // Resolve name for this reader if not already known
          setReaderNames((prev) => {
            if (prev[row.reader_id]) return prev;
            void supabase
              .from("public_profiles")
              .select("user_id, pen_name, username")
              .eq("user_id", row.reader_id)
              .maybeSingle()
              .then((result: { data: unknown }) => {
                if (result.data) {
                  const p = result.data as { user_id: string; pen_name: string | null; username: string | null };
                  setReaderNames((n) => ({ ...n, [p.user_id]: p.pen_name || (p.username ? `@${p.username}` : "Reader") }));
                }
              });
            return prev;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [manuscriptId, supabase]);

  useEffect(() => {
    // Only sync the editor when the selected chapter actually changes.
    // When `chapters` updates in-place (auto-save writeback or realtime event on the
    // same chapter), skip all editor state setters — the user may be mid-keystroke and
    // overwriting chapterEditorContent would jump the cursor and discard typed text.
    const chapterIdChanged = selectedChapterId !== prevSelectedChapterIdRef.current;
    prevSelectedChapterIdRef.current = selectedChapterId ?? null;
    if (!chapterIdChanged) return;

    const selected = chapters.find((c) => c.id === selectedChapterId) ?? null;
    if (selected) {
      const normalized = normalizeChapterText(selected.content);
      setChapterEditorTitle(selected.title);
      setChapterEditorContent(normalized);
      setChapterType((selected.chapter_type as "chapter" | "prologue" | "epilogue" | "trigger_page") ?? "chapter");
      lastSavedContent.current = normalized;
      lastSavedTitle.current = selected.title;
      lastSavedChapterType.current = (selected.chapter_type as "chapter" | "prologue" | "epilogue" | "trigger_page") ?? "chapter";
      setAutoSaveStatus("idle");
      return;
    }
    if (selectedChapterId && chapters.length > 0) {
      const fallback = chapters[0];
      const normalized = normalizeChapterText(fallback.content);
      setSelectedChapterId(fallback.id);
      setChapterEditorTitle(fallback.title);
      setChapterEditorContent(normalized);
      setChapterType((fallback.chapter_type as "chapter" | "prologue" | "epilogue" | "trigger_page") ?? "chapter");
      lastSavedContent.current = normalized;
      lastSavedTitle.current = fallback.title;
      lastSavedChapterType.current = (fallback.chapter_type as "chapter" | "prologue" | "epilogue" | "trigger_page") ?? "chapter";
      setAutoSaveStatus("idle");
    }
  }, [chapters, selectedChapterId]);


  // Scroll page to bring the selected marker into view
  useEffect(() => {
    if (!selectedFeedbackId) return;
    const info = markerInfos[selectedFeedbackId];
    const wrapper = editorWrapperRef.current;
    if (info && wrapper) {
      const markerDocY = wrapper.getBoundingClientRect().top + window.scrollY + info.top;
      window.scrollTo({ top: Math.max(0, markerDocY - window.innerHeight * 0.35), behavior: "smooth" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: markerInfos scroll is handled by the effect below; this only triggers on selection change
  }, [selectedFeedbackId]);

  // When "Show me" navigates to a chapter, markerInfos populates after render -
  // re-trigger the scroll once the selected feedback's marker appears for the first time.
  useEffect(() => {
    if (!selectedFeedbackId) { prevMarkerInfosRef.current = {}; return; }
    const info = markerInfos[selectedFeedbackId];
    const prevInfo = prevMarkerInfosRef.current[selectedFeedbackId];
    if (info && !prevInfo) {
      const wrapper = editorWrapperRef.current;
      if (wrapper) {
        const markerDocY = wrapper.getBoundingClientRect().top + window.scrollY + (info as { top: number }).top;
        window.scrollTo({ top: Math.max(0, markerDocY - window.innerHeight * 0.35), behavior: "smooth" });
      }
    }
    prevMarkerInfosRef.current = markerInfos;
  }, [markerInfos, selectedFeedbackId]);

  // Scroll to and briefly highlight the specific reply a "new reply" notification
  // pointed at, once its parent card is expanded and the reply has loaded.
  useEffect(() => {
    if (!selectedReplyId || hasScrolledToReplyRef.current === selectedReplyId) return;
    const el = document.getElementById(`reply-${selectedReplyId}`);
    if (!el) return;
    hasScrolledToReplyRef.current = selectedReplyId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedReplyId(selectedReplyId);
    const t = setTimeout(() => setHighlightedReplyId(null), 2500);
    return () => clearTimeout(t);
  }, [selectedReplyId, feedbackReplies, selectedFeedbackId, overviewExpandedIds]);

  // Track chapter section height
  useEffect(() => {
    const el = chapterSectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setChapterSectionH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedChapterId]);

  // Measure how far the editor wrapper is below the right column top
  // so inline feedback cards can be absolutely positioned to match marker Y
  useEffect(() => {
    function measure() {
      const wrapper = editorWrapperRef.current;
      const col = rightColumnRef.current;
      if (!wrapper || !col) return;
      const rowLayout = window.innerWidth >= 1024;
      setIsRowLayout(rowLayout);
      setEditorOffsetY(rowLayout ? wrapper.getBoundingClientRect().top - col.getBoundingClientRect().top : 0);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (chapterSectionRef.current) ro.observe(chapterSectionRef.current);
    return () => ro.disconnect();
  }, [selectedChapterId, markerInfos]);

  // Compute inline marker positions from the Range API - runs after the editor DOM has settled
  function recomputeMarkers() {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const editorEl = wrapper.querySelector(".chapter-editor") as HTMLElement | null;
    if (!editorEl || !selectedChapterId) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const editorText = extractVisibleText(editorEl);
    setEditorChapterDomText(editorText);
    const newInfos: Record<string, MarkerInfo> = {};
    for (const f of feedbackItems) {
      if (f.chapter_id !== selectedChapterId) continue;
      if (!f.selection_excerpt || f.resolved || !!f.author_response) continue;
      const anchor = resolveFeedbackAnchor(f.selection_excerpt, f.start_offset, f.end_offset, editorText);
      if (anchor.status === "not-found") continue;
      const range = createRangeFromTextOffsets(editorEl, anchor.start, anchor.end);
      if (!range) continue;
      const clientRects = Array.from(range.getClientRects());
      if (!clientRects.length) continue;
      const lastRect = clientRects[clientRects.length - 1];
      newInfos[f.id] = {
        // Keep the card close to the marker line without drifting too high above it.
        top: lastRect.top - wrapperRect.top - 1,
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

  // Reset only on an actual chapter switch (not on every feedbackItems update
  // while staying on the same chapter) so the workspace card filter/sort see
  // "pending" instead of the previous chapter's stale editor text.
  useEffect(() => {
    setEditorChapterDomText(null);
  }, [selectedChapterId]);

  useEffect(() => {
    // Wait one frame for the editor DOM to paint before measuring
    const id = requestAnimationFrame(recomputeMarkers);
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: recomputeMarkers is a component function; all data deps are listed
  }, [selectedChapterId, feedbackItems]);

  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => recomputeMarkers());
    ro.observe(wrapper);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: recomputeMarkers is a component function; selectedChapterId determines when to reattach the observer
  }, [selectedChapterId]);

  // Click anywhere outside the feedback aside and marker buttons to deselect
  useEffect(() => {
    if (!selectedFeedbackId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (rightColumnRef.current?.contains(target)) return;
      if (floatingCardRef.current?.contains(target)) return;
      if (target.closest("[data-feedback-marker]")) return;
      setSelectedFeedbackId(null);
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectedFeedbackId]);

  // Mark replies as read and clear unread indicator when a feedback box is opened
  useEffect(() => {
    if (!selectedFeedbackId) return;
    let priorCount: number | undefined;
    setUnreadReplyCounts((prev) => {
      if (!prev[selectedFeedbackId]) return prev;
      priorCount = prev[selectedFeedbackId];
      const next = { ...prev };
      delete next[selectedFeedbackId];
      return next;
    });
    clearedReplyFeedbackIdsRef.current.add(selectedFeedbackId);
    fetch("/api/feedback/mark-replies-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: selectedFeedbackId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`mark-replies-read responded ${res.status}`);
      })
      .catch((err) => {
        console.error("Failed to persist read state for feedback replies", selectedFeedbackId, err);
        clearedReplyFeedbackIdsRef.current.delete(selectedFeedbackId);
        if (priorCount) {
          setUnreadReplyCounts((prev) => ({ ...prev, [selectedFeedbackId]: priorCount! }));
        }
      });
  }, [selectedFeedbackId]);

  function categoryLimit(nextCategories: string[]) {
    if (profileAgeCategory === "youth_13_17") return 2;
    return hasYouthAudienceCategory(nextCategories, null) ? 2 : 5;
  }

  async function nextChapterOrder() {
    // Query fresh rather than reading the client's in-memory `chapters` array,
    // which can be stale (e.g. a second "Add chapter" click before the first
    // insert's response has landed) and hand out a duplicate chapter_order.
    const { data } = await supabase
      .from("manuscript_chapters")
      .select("chapter_order")
      .eq("manuscript_id", manuscript?.id ?? manuscriptId)
      .order("chapter_order", { ascending: false })
      .limit(1);
    const rows = (data as { chapter_order: number }[] | null) ?? [];
    return (rows[0]?.chapter_order ?? 0) + 1;
  }

  function isDefaultChapterTitle(title: string, chapterOrder: number) {
    return title.trim().toLowerCase() === `chapter ${chapterOrder}`;
  }

  // 1-based chapter number among chapter_type='chapter' entries, sorted by chapter_order
  function chapterNumFor(chapterId: string, typeOverride?: "chapter" | "prologue" | "epilogue" | "trigger_page"): number {
    const list = chapters
      .map(c => (c.id === chapterId && typeOverride) ? { ...c, chapter_type: typeOverride } : c)
      .filter(c => c.chapter_type === "chapter")
      .sort((a, b) => a.chapter_order - b.chapter_order);
    const idx = list.findIndex(c => c.id === chapterId);
    return idx === -1 ? 1 : idx + 1;
  }

  function chapterDisplayLabel(chapter: Chapter) {
    if (chapter.chapter_type === "prologue") return chapter.title.trim() ? `Prologue: ${chapter.title}` : "Prologue";
    if (chapter.chapter_type === "epilogue") return chapter.title.trim() ? `Epilogue: ${chapter.title}` : "Epilogue";
    if (chapter.chapter_type === "trigger_page") return chapter.title.trim() ? `Trigger Page: ${chapter.title}` : "Trigger Page";
    const num = chapterNumFor(chapter.id);
    if (!chapter.title.trim() || chapter.title.trim().toLowerCase() === `chapter ${num}`) {
      return `Chapter ${num}`;
    }
    return `Chapter ${num}: ${chapter.title}`;
  }

  async function addChapter() {
    if (!manuscript) return;
    const order = await nextChapterOrder();
    const isLethalMember = memberTier === "lethal";
    // Trigger pages don't count toward the free chapter limit; prologues and chapters do
    const nonTriggerCount = chapters.filter((c) => (c.chapter_type ?? "chapter") !== "trigger_page").length;
    const chapterCost = !isLethalMember && nonTriggerCount >= freeChapterLimit ? 10 : 0;
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
    const newChapterNum = chapters.filter((c) => c.chapter_type === "chapter").length + 1;
    const defaultTitle = `Chapter ${newChapterNum}`;
    const { data, error } = await supabase
      .from("manuscript_chapters")
      .insert({
        manuscript_id: manuscript.id,
        chapter_order: order,
        title: defaultTitle,
        content: "",
        is_private: true,
      })
      .select("id, chapter_order, title, content, is_private, created_at, chapter_type")
      .single();
    if (error) return setMsg(friendlyDbError(error.message));

    const newChapter = data as Chapter;
    setChapters((prev) => [...prev, newChapter]);
    setSelectedChapterId(newChapter.id);
    setChapterEditorTitle(defaultTitle);
    setChapterEditorContent("");
    setMsg(chapterCost > 0 ? `${defaultTitle} added as draft. Charged ${chapterCost} Bloom Coins.` : `${defaultTitle} added as draft.`);
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
    if (memberTier === "lethal") {
      // Lethal Members get slots free - persist a delta-0 ledger entry so the
      // count survives page reloads and shows correctly on the invite page.
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { error } = await supabase.from("bloom_coin_ledger").insert({
        user_id: uid,
        delta: 0,
        reason: "extra_reader_slot",
        metadata: { manuscript_id: manuscript.id },
      });
      if (!error) setReaderSlots((s) => s + 1);
      return;
    }
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
    // Record receipt in reader's ledger via server route (needs admin client)
    await fetch("/api/manuscript/reward-reader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manuscript_id: manuscript.id,
        reader_id: reader.user_id,
        amount: rewardAmount,
        reward_reason: rewardReason,
      }),
    });
    // Notify reader
    await supabase.from("system_notifications").insert({
      user_id: reader.user_id,
      title: "You received a Bloom Coin reward! ✿",
      body: `${manuscript.title || "An author"} rewarded you ${rewardAmount} Bloom Coins for: ${rewardReason}.`,
    });
    setRewardModal(null);
    setRewardReason("");
    setRewardAmount(5);
    setRewardToast(`✿ ${rewardAmount} Bloom Coins sent to ${reader.pen_name || reader.username || "reader"}`);
    setTimeout(() => setRewardToast(null), 3000);
  }

  function toggleChapterUpdateCategory(cat: string) {
    setChapterUpdateCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function loadLastChapterUpdate(chapterId: string) {
    setLastChapterUpdateLoading(true);
    const { data } = await supabase
      .from("chapter_updates")
      .select("categories, note, created_at")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastChapterUpdate((data as { categories: string[]; note: string | null; created_at: string } | null) ?? null);
    setLastChapterUpdateLoading(false);
  }

  async function submitChapterUpdate() {
    if (!selectedChapter || !authorUserId) return;
    if (chapterUpdateCategories.length === 0 && !chapterUpdateNote.trim()) {
      setMsg("Select at least one category or add a note.");
      return;
    }
    setChapterUpdateSubmitting(true);
    const trimmedNote = chapterUpdateNote.trim();
    const { data: inserted, error } = await supabase
      .from("chapter_updates")
      .insert({
        chapter_id: selectedChapter.id,
        author_id: authorUserId,
        categories: chapterUpdateCategories,
        note: trimmedNote || null,
      })
      .select("id")
      .single();
    if (error) {
      setChapterUpdateSubmitting(false);
      return setMsg(friendlyDbError(error.message));
    }

    const chapterLabel = chapterType === "prologue" ? "Prologue" : chapterType === "epilogue" ? "Epilogue" : chapterType === "trigger_page" ? "Trigger Page" : `Chapter ${chapterNumFor(selectedChapter.id)}`;
    const manuscriptTitle = manuscript?.title || "your manuscript";
    const authorLabel = ownerPenName || "The author";
    const title = chapterUpdateCategories.length > 0
      ? `${authorLabel} updated ${chapterLabel} of "${manuscriptTitle}": ${chapterUpdateCategories.join(", ")}`
      : `${authorLabel} updated ${chapterLabel} of "${manuscriptTitle}"`;
    const readerIds = Array.from(new Set(
      feedbackItems.filter((f) => f.chapter_id === selectedChapter.id).map((f) => f.reader_id)
    ));
    if (readerIds.length > 0) {
      await supabase.from("system_notifications").insert(
        readerIds.map((reader_id) => ({
          user_id: reader_id,
          category: "chapter_update",
          title,
          body: trimmedNote,
          metadata: { manuscript_id: manuscriptId, chapter_id: selectedChapter.id, chapter_update_id: (inserted as { id: string }).id },
        }))
      );
    }

    setChapterUpdateSubmitting(false);
    setChapterUpdateModal(false);
    setChapterUpdateCategories([]);
    setChapterUpdateNote("");
    setMsg("Readers who left feedback on this chapter will see a new update tag.");
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
    const oldContent = lastSavedContent.current;
    setManualSaving(true);
    const { error } = await supabase
      .from("manuscript_chapters")
      .update({
        title: chapterEditorTitle.trim() || "Untitled Chapter",
        content: chapterEditorContent.trim(),
        chapter_type: chapterType,
      })
      .eq("id", selectedChapterId);
    setManualSaving(false);
    if (error) return setMsg(friendlyDbError(error.message));
    lastSavedContent.current = chapterEditorContent;
    lastSavedTitle.current = chapterEditorTitle;
    lastSavedChapterType.current = chapterType;
    setChapters((prev) => prev.map((c) => c.id === selectedChapterId ? { ...c, title: chapterEditorTitle.trim() || "Untitled Chapter", chapter_type: chapterType } : c));
    setAutoSaveStatus("saved");
    setTimeout(() => setAutoSaveStatus("idle"), 3000);
    void syncFeedbackOffsetsForChapterSave(selectedChapterId, oldContent, chapterEditorContent.trim());
    // Show prominent toast
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  }

  async function setChapterVisibility(chapterId: string, makePublic: boolean) {
    const { error } = await supabase.from("manuscript_chapters").update({ is_private: !makePublic }).eq("id", chapterId);
    if (error) return setMsg(friendlyDbError(error.message));
    setMsg(makePublic ? "Chapter published." : "Chapter set to private draft.");
    await load();
  }

  async function moveChapter(fromChapterId: string, toChapterId: string) {
    if (!manuscript) return;
    if (fromChapterId === toChapterId) return;
    const ordered = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
    const fromIndex = ordered.findIndex((c) => c.id === fromChapterId);
    const toIndex = ordered.findIndex((c) => c.id === toChapterId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Compute old chapter numbers (rank among type='chapter') before reorder
    let oldNum = 0;
    const oldChapterNums = new Map<string, number>();
    for (const c of ordered) { if (c.chapter_type === "chapter") oldChapterNums.set(c.id, ++oldNum); }

    // Compute new chapter numbers after reorder
    let newNum = 0;
    const newChapterNums = new Map<string, number>();
    for (const c of reordered) { if (c.chapter_type === "chapter") newChapterNums.set(c.id, ++newNum); }

    const previousById = new Map<string, Chapter>();
    ordered.forEach((c) => previousById.set(c.id, c));

    const updates = reordered
      .map((c, i) => {
        const newOrder = i + 1;
        const prev = previousById.get(c.id);
        if (!prev) return null;
        // Only auto-rename real chapters (not prologues or trigger pages)
        let nextTitle = prev.title;
        if (c.chapter_type === "chapter") {
          const wasNum = oldChapterNums.get(c.id) ?? 0;
          const isNum = newChapterNums.get(c.id) ?? 0;
          if (prev.title.trim().toLowerCase() === `chapter ${wasNum}`) {
            nextTitle = `Chapter ${isNum}`;
          }
        }
        const orderChanged = prev.chapter_order !== newOrder;
        const titleChanged = prev.title !== nextTitle;
        if (!orderChanged && !titleChanged) return null;
        return { id: c.id, chapter_order: newOrder, title: nextTitle };
      })
      .filter(Boolean) as Array<{ id: string; chapter_order: number; title: string }>;

    if (updates.length === 0) return;

    // Snapshot of what these same rows held before the move, so an undo can
    // restore them exactly via the same atomic RPC.
    const previousUpdates = updates.map((u) => {
      const prev = previousById.get(u.id)!;
      return { id: u.id, chapter_order: prev.chapter_order, title: prev.title };
    });

    // Optimistic update - reflect order instantly in the sidebar
    const updatesById = new Map(updates.map((u) => [u.id, u]));
    setChapters(reordered.map((c, i) => {
      const u = updatesById.get(c.id);
      return u ? { ...c, chapter_order: i + 1, title: u.title } : { ...c, chapter_order: i + 1 };
    }));

    // Also update the open chapter's title ref/state if it was renamed
    if (selectedChapterId) {
      const renamed = updatesById.get(selectedChapterId);
      if (renamed && renamed.title !== chapterEditorTitle) {
        setChapterEditorTitle(renamed.title);
        lastSavedTitle.current = renamed.title;
      }
    }

    // Single atomic RPC call - either every row in `updates` lands, or none do.
    // (Replaces N independent Promise.all() writes, which could partially fail.)
    const { error } = await supabase.rpc("reorder_manuscript_chapters", {
      p_manuscript_id: manuscript.id,
      p_updates: updates,
    });

    if (error) {
      setMsg(friendlyDbError(error.message));
      await load(); // safe to fully resync - the RPC guarantees nothing partial was written
      return;
    }

    const movedLabel = moved.chapter_type === "prologue" ? "Prologue"
      : moved.chapter_type === "epilogue" ? "Epilogue"
      : moved.chapter_type === "trigger_page" ? "Trigger Page"
      : `Chapter ${newChapterNums.get(moved.id) ?? toIndex + 1}`;
    if (reorderUndoTimer.current) clearTimeout(reorderUndoTimer.current);
    setReorderUndo({ manuscriptId: manuscript.id, label: movedLabel, previousUpdates });
    reorderUndoTimer.current = setTimeout(() => setReorderUndo(null), 8000);
  }

  async function undoReorder() {
    if (!reorderUndo) return;
    if (reorderUndoTimer.current) clearTimeout(reorderUndoTimer.current);
    const { manuscriptId: undoManuscriptId, previousUpdates } = reorderUndo;
    setReorderUndo(null);

    const revertById = new Map(previousUpdates.map((u) => [u.id, u]));
    setChapters((prev) =>
      prev
        .map((c) => {
          const r = revertById.get(c.id);
          return r ? { ...c, chapter_order: r.chapter_order, title: r.title } : c;
        })
        .sort((a, b) => a.chapter_order - b.chapter_order)
    );

    const { error } = await supabase.rpc("reorder_manuscript_chapters", {
      p_manuscript_id: undoManuscriptId,
      p_updates: previousUpdates,
    });
    if (error) {
      setMsg(friendlyDbError(error.message));
      await load();
    } else {
      setMsg("Reorder undone.");
    }
  }

  async function setWholeVisibility(nextVisibility: "private" | "public") {
    if (!manuscript) return;
    const { data, error } = await supabase
      .from("manuscripts")
      .update({ visibility: nextVisibility })
      .eq("id", manuscript.id)
      .select("id, visibility");
    if (error) return setMsg(friendlyDbError(error.message));
    if (!data || data.length === 0) {
      return setMsg("Publish failed — the manuscript wasn't updated. This may be a permissions issue; contact support.");
    }

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
        // Only readers who came through the request/approve flow have a
        // manuscript_access_requests row to flip to "disabled". Invite-path
        // readers (manuscript_invitations, accepted directly) have no such
        // row - deleting their grant here would strand them, since the
        // republish branch below only restores readers found via that
        // "disabled" status. Scope the status flip and grant delete to
        // readers who actually have a request row; leave invite-path grants
        // intact - manuscript_chapters.is_private (set above) already blocks
        // their reads until republish.
        const { data: requestRows } = await supabase
          .from("manuscript_access_requests")
          .select("requester_id")
          .eq("manuscript_id", manuscript.id)
          .in("requester_id", activeReaderIds);
        const requestPathIds = ((requestRows as Array<{ requester_id: string }> | null) ?? []).map(
          (r) => r.requester_id
        );
        if (requestPathIds.length > 0) {
          await supabase
            .from("manuscript_access_requests")
            .update({ status: "disabled" })
            .eq("manuscript_id", manuscript.id)
            .in("requester_id", requestPathIds);
          await supabase
            .from("manuscript_access_grants")
            .delete()
            .eq("manuscript_id", manuscript.id)
            .in("reader_id", requestPathIds);
        }
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
      categories: [...selectedCategories, ...(isMatureContent ? ["Mature Content"] : []), ...(isPotentiallyTriggering ? ["Potentially Triggering Content"] : [])],
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
    // Upsert (not update): invite-path readers never got a request row in
    // the first place, so a plain update would silently no-op here and
    // then the grant delete below would wipe their access with no trace.
    const { error } = await supabase
      .from("manuscript_access_requests")
      .upsert(
        { manuscript_id: manuscript.id, requester_id: readerId, status: newStatus },
        { onConflict: "manuscript_id,requester_id" }
      );
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

  async function submitRemoveReader(category: string, detail: string) {
    if (!manuscript || !removeReaderModal) return;
    const readerId = removeReaderModal.readerId;
    setRemoveReaderSubmitting(true);
    await supabase.from("manuscript_reader_exit_reasons").insert({
      manuscript_id: manuscript.id,
      reader_id: readerId,
      initiated_by: "owner",
      reason_category: category,
      reason_detail: detail || null,
    });
    await toggleReaderAccess(readerId, false, false);
    setRemoveReaderSubmitting(false);
    setRemoveReaderModal(null);
  }

  async function performAcceptRequest(userId: string) {
    if (!manuscript) return;
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

  async function acceptRequest(userId: string) {
    if (!manuscript) return;
    const activeCount = acceptedReaders.filter((r) => !r.disabled && !r.left).length;
    if (activeCount < readerSlots) {
      await performAcceptRequest(userId);
      return;
    }

    // Slots are full - prompt to purchase one instead of just refusing.
    // Don't recurse into acceptRequest() after adding the slot: readerSlots
    // is stale in this closure until the next render, so the recheck above
    // would still see the old count and loop back into this same prompt.
    if (memberTier === "lethal") {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { error } = await supabase.from("bloom_coin_ledger").insert({
        user_id: uid,
        delta: 0,
        reason: "extra_reader_slot",
        metadata: { manuscript_id: manuscript.id },
      });
      if (error) { setMsg(friendlyDbError(error.message)); return; }
      setReaderSlots((s) => s + 1);
      await performAcceptRequest(userId);
      return;
    }

    setCoinConfirm({
      amount: 15,
      label: "add a reader slot so you can accept this reader",
      onConfirm: () => void (async () => {
        const charge = await spendBloomCoins(15, "extra_reader_slot", { manuscript_id: manuscript.id });
        if (!charge.ok) { setShowUploadPurchasePrompt(true); return; }
        setReaderSlots((s) => s + 1);
        await performAcceptRequest(userId);
      })(),
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
  const activeReaderCount = acceptedReaders.filter((r) => !r.left && !r.disabled).length;
  const openReaderSlots = Math.max(0, readerSlots - activeReaderCount);
  const displayedWordCount = chapters.reduce((sum, c) => sum + countWords(c.content ?? ""), 0);
  const selectedChapter = selectedChapterId ? chapters.find((c) => c.id === selectedChapterId) ?? null : null;
  const nonTriggerCount = chapters.filter((c) => (c.chapter_type ?? "chapter") !== "trigger_page").length;
  const nextChapterCost = !isLethalMember && nonTriggerCount >= freeChapterLimit ? 10 : 0;

  const detailItems = [
    { label: "Author", value: `You${manuscript?.created_at ? ` · ${new Date(manuscript.created_at).toLocaleDateString()}` : ""}` },
    { label: "Visibility", value: manuscript?.visibility === "public" ? "Public" : "Draft" },
    { label: "Age rating", value: manuscript?.age_rating === "teen_safe" ? "Teen-safe" : "Adult" },
    { label: "Word count", value: displayedWordCount ? `${displayedWordCount.toLocaleString()} words` : "-" },
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
        onDragStart={(e) => {
          if (isParentView || !dragArmedFromHandle.current) {
            e.preventDefault();
            return;
          }
          setDragChapterId(chapter.id);
        }}
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
          dragArmedFromHandle.current = false;
          setDragChapterId(null);
          setDragOverChapterId(null);
        }}
        className={`flex items-stretch gap-1 ${draggingOver ? "outline outline-1 outline-[rgba(120,120,120,0.5)] rounded-lg" : ""}`}
      >
        {!isParentView && (
          <span
            role="presentation"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            onMouseDown={() => { dragArmedFromHandle.current = true; }}
            onMouseUp={() => { dragArmedFromHandle.current = false; }}
            onMouseLeave={() => { dragArmedFromHandle.current = false; }}
            className="flex shrink-0 cursor-grab items-center px-0.5 text-neutral-600 hover:text-neutral-300 active:cursor-grabbing"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2.5" cy="2.5" r="1.5" /><circle cx="7.5" cy="2.5" r="1.5" />
              <circle cx="2.5" cy="8" r="1.5" /><circle cx="7.5" cy="8" r="1.5" />
              <circle cx="2.5" cy="13.5" r="1.5" /><circle cx="7.5" cy="13.5" r="1.5" />
            </svg>
          </span>
        )}
        <button
          onClick={() => setSelectedChapterId(chapter.id)}
          className={`chapter-btn block w-full min-w-0 text-left rounded-lg border px-3 py-2 transition ${
            isActive
              ? "active-chapter !border-[rgba(120,120,120,0.85)] !bg-[rgba(120,120,120,0.15)] !text-white shadow-[0_12px_26px_rgba(120,120,120,0.18)]"
              : "!border-neutral-800 !bg-neutral-950/40 !text-neutral-200 hover:!border-[rgba(120,120,120,0.4)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              {chapter.chapter_type === "prologue" ? "Prologue" : chapter.chapter_type === "epilogue" ? "Epilogue" : chapter.chapter_type === "trigger_page" ? "Trigger Page" : `Chapter ${chapterNumFor(chapter.id)}`}
            </span>
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

  function htmlToTextRuns(
    para: string,
    { TextRun }: { TextRun: typeof import("docx").TextRun }
  ): InstanceType<typeof import("docx").TextRun>[] {
    type Format = {
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      strike?: boolean;
      superScript?: boolean;
      subScript?: boolean;
    };

    const runs: InstanceType<typeof import("docx").TextRun>[] = [];

    function walk(node: ChildNode, format: Format) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (text) {
          runs.push(
            new TextRun({
              text,
              bold: format.bold,
              italics: format.italics,
              underline: format.underline ? {} : undefined,
              strike: format.strike,
              superScript: format.superScript,
              subScript: format.subScript,
            })
          );
        }
        return;
      }

      if (!(node instanceof HTMLElement)) return;

      const tag = node.tagName.toLowerCase();
      const next: Format = { ...format };
      if (tag === "strong" || tag === "b") next.bold = true;
      if (tag === "em" || tag === "i") next.italics = true;
      if (tag === "u") next.underline = true;
      if (tag === "s" || tag === "del" || tag === "strike") next.strike = true;
      if (tag === "sup") next.superScript = true;
      if (tag === "sub") next.subScript = true;

      for (const child of Array.from(node.childNodes)) walk(child, next);
    }

    const doc = new DOMParser().parseFromString(para, "text/html");
    for (const node of Array.from(doc.body.childNodes)) walk(node, {});

    return runs;
  }

  async function exportAsDocx() {
    if (!manuscript) return;
    setExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType } = await import("docx");
      const sorted = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
      let chNum = 0;
      const chapterNumbers = new Map<string, number>();
      for (const ch of sorted) { if (ch.chapter_type === "chapter") chapterNumbers.set(ch.id, ++chNum); }
      const children: InstanceType<typeof Paragraph>[] = [
        new Paragraph({ text: manuscript.title || "Untitled", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "" }),
      ];
      for (const ch of sorted) {
        const label = ch.chapter_type === "prologue" ? `Prologue: ${ch.title || "Untitled"}` :
          ch.chapter_type === "epilogue" ? `Epilogue: ${ch.title || "Untitled"}` :
          ch.chapter_type === "trigger_page" ? `Trigger Page: ${ch.title || "Untitled"}` :
          `Chapter ${chapterNumbers.get(ch.id) ?? ""}: ${ch.title || "Untitled"}`;
        children.push(new Paragraph({ text: label, heading: HeadingLevel.HEADING_1 }));
        const blocks = (ch.content ?? "")
          .split(/\n\n/)
          .map((b) => b.replace(/^\t/, "").trim())
          .filter(Boolean);
        blocks.forEach((block, i) => {
          if (block === "***") {
            children.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "***", characterSpacing: 100 })],
            }));
            return;
          }
          const prev = blocks[i - 1];
          const noIndent = i === 0 || prev === "***";
          const segments = sanitizeChapterHtml(block).split("\n");
          const runs: InstanceType<typeof TextRun>[] = [];
          segments.forEach((segment, segIndex) => {
            if (segIndex > 0) runs.push(new TextRun({ break: 1 }));
            runs.push(...htmlToTextRuns(segment, { TextRun }));
          });
          children.push(
            noIndent
              ? new Paragraph({ children: runs })
              : new Paragraph({ indent: { firstLine: 720 }, children: runs })
          );
        });
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
    let htmlChNum = 0;
    const htmlChapterNumbers = new Map<string, number>();
    for (const ch of sorted) { if (ch.chapter_type === "chapter") htmlChapterNumbers.set(ch.id, ++htmlChNum); }
    const textAlign = (manuscript as unknown as { text_align?: string }).text_align || "left";
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${manuscript.title || "Untitled"}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;line-height:1.8;font-size:16px;}h1{font-size:2em;margin-bottom:0.2em;}h2{font-size:1.4em;margin-top:2em;page-break-before:always;}p{margin:0 0 0.55em 0;font-family:Georgia,serif;line-height:1.65;}</style></head><body>`;
    html += `<h1>${manuscript.title || "Untitled"}</h1>`;
    for (const ch of sorted) {
      const label = ch.chapter_type === "prologue" ? `Prologue: ${ch.title || "Untitled"}` :
        ch.chapter_type === "trigger_page" ? `Trigger Page: ${ch.title || "Untitled"}` :
        `Chapter ${htmlChapterNumbers.get(ch.id) ?? ""}: ${ch.title || "Untitled"}`;
      html += `<h2>${label}</h2>`;
      const blocks = (ch.content ?? "")
        .split(/\n\n/)
        .map((b) => b.replace(/^\t/, "").trim())
        .filter(Boolean);
      blocks.forEach((block, i) => {
        if (block === "***") {
          html += `<p style="text-align:center;text-indent:0;letter-spacing:0.3em;margin:1.25em 0">***</p>`;
          return;
        }
        const prev = blocks[i - 1];
        const noIndent = i === 0 || prev === "***";
        const content = sanitizeChapterHtml(block).replace(/\n/g, "<br>");
        html += `<p style="text-indent:${noIndent ? "0" : "2.5em"};text-align:${textAlign}">${content}</p>`;
      });
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
      {/* Reward toast */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-amber-600/60 bg-amber-950/90 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-sm font-medium text-amber-300 transition-all duration-300 ${rewardToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}>
        <span className="shrink-0" style={{ color: "#f59e0b" }}>✿</span>
        {rewardToast}
      </div>
      {/* Chapter reorder undo toast */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-blue-600/60 bg-blue-950/90 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-sm font-medium text-blue-200 transition-all duration-300 ${reorderUndo ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`}>
        <span>Moved &quot;{reorderUndo?.label ?? ""}&quot;.</span>
        <button
          onClick={() => void undoReorder()}
          className="shrink-0 rounded-md border border-blue-400/60 px-2 py-1 text-xs font-semibold text-blue-100 hover:bg-blue-900/60"
        >
          Undo
        </button>
      </div>
      <div className="mx-auto max-w-[1600px] px-6 py-12">
        <Link href="/manuscripts" className="mb-4 inline-flex items-center text-sm text-neutral-400 hover:text-white transition">
          ← Back to manuscripts
        </Link>
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
                <a
                  role="button"
                  onClick={() => setShowAnalyticsPanel(true)}
                  className="workspace-btn inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition"
                >
                  Statistics
                </a>
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
                  href="/beta-readers"
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
                <span className="text-xs text-neutral-200">{activeReaderCount}/{readerSlots} slots filled</span>
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
                  {sortedAcceptedReaders.map((reader) => {
                    const isOnline = onlineReaderIds.has(reader.user_id);
                    return (
                      <div key={reader.user_id} className="flex shrink-0 flex-col items-center gap-1.5 group">
                        <div
                          className="relative h-14 w-14"
                          onMouseEnter={(e) => {
                            if ((reader.left || reader.disabled) && !reader.suspended && reader.exitReason) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setExitTooltip({ reader, x: rect.left + rect.width / 2, y: rect.top });
                            }
                          }}
                          onMouseLeave={() => setExitTooltip(null)}
                        >
                          <div
                            className={`relative h-14 w-14 overflow-hidden rounded-full border-2 bg-neutral-900 transition ${reader.left || reader.disabled || reader.suspended ? "border-neutral-700 opacity-40 grayscale" : isOnline ? "border-emerald-400 shadow-[0_0_14px_4px_rgba(52,211,153,0.55)]" : "border-[rgba(120,120,120,0.6)] shadow-[0_0_10px_rgba(120,120,120,0.25)]"}`}
                          >
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
                              <button type="button" onClick={() => setRemoveReaderModal({ readerId: reader.user_id })} className="text-[9px] font-semibold uppercase tracking-wide text-white leading-none">
                                Disable
                              </button>
                            </div>
                          )}
                          {!isParentView && !reader.left && reader.disabled && !reader.suspended && !(manuscript.visibility === "private") && (
                            <button type="button" onClick={() => setEnableReaderConfirm({ readerId: reader.user_id })} className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition text-[9px] font-semibold uppercase tracking-wide text-white">
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
                    );
                  })}
                  {Array.from({ length: openReaderSlots }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex shrink-0 flex-col items-center gap-1.5">
                      <div className="h-14 w-14 rounded-lg border border-dashed border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.05)]" />
                      <p className="text-[10px] text-neutral-300">Open</p>
                    </div>
                  ))}
                  {!isParentView && (
                  <div className="flex shrink-0 flex-col items-center gap-1.5">
                    <button type="button" onClick={() => void addReaderSlot()} className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.08)] text-xl text-[rgba(120,120,120,0.7)] hover:border-[rgba(120,120,120,0.7)] hover:bg-[rgba(120,120,120,0.14)] transition" title={memberTier === "lethal" ? "Add a reader slot (free)" : "Add a reader slot for 15 Bloom Coins"}>+</button>
                    <p className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                      {memberTier === "lethal" ? (
                        <span className="opacity-70">(free)</span>
                      ) : (
                        <><span style={{ color: "#f59e0b" }}>✿</span><span>15 Bloom Coins</span></>
                      )}
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

                {/* Manuscript Stage */}
                <div className="flex gap-2 items-center">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-500">Manuscript Stage</p>
                  {(["alpha", "beta"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={isParentView}
                      onClick={() => !isParentView && setStage(s)}
                      className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                        stage === s
                          ? s === "alpha"
                            ? "border-amber-600/60 bg-amber-950/30 text-amber-300"
                            : "border-emerald-600/60 bg-emerald-950/30 text-emerald-300"
                          : "border-neutral-700 bg-neutral-950/30 text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                  <p className="text-[10px] text-neutral-600">
                    {stage === "alpha" ? "Early draft - rough and unpolished" : "Polished draft - ready for feedback"}
                  </p>
                </div>

                {/* Feedback & Content - 3 boxes side by side */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Requested Feedback</p>
                    <p className="text-sm text-neutral-200">
                      {FEEDBACK_PREFERENCE_OPTIONS.find((o) => o.value === profileFeedbackPreference)?.label ?? "Bloom"}
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Set via your <a href="/settings/profile" className="underline hover:text-neutral-300">profile settings</a></p>
                  </div>
                  <button
                    type="button"
                    disabled={isParentView}
                    onClick={() => !isParentView && setIsMatureContent((v) => !v)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${isMatureContent ? "border-amber-600/50 bg-amber-950/25" : "border-neutral-800 bg-neutral-950/30"} ${!isParentView ? "hover:bg-neutral-900/60 cursor-pointer" : "cursor-default"}`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Content Flag</p>
                    <p className={`mt-1 text-sm font-medium ${isMatureContent ? "text-amber-300" : "text-neutral-400"}`}>Mature Content</p>
                    <p className="mt-1 text-xs text-neutral-500">{isMatureContent ? "Flagged ✓" : isParentView ? "Not flagged" : "Click to flag"}</p>
                  </button>
                  <button
                    type="button"
                    disabled={isParentView}
                    onClick={() => !isParentView && setIsPotentiallyTriggering((v) => !v)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${isPotentiallyTriggering ? "border-rose-600/50 bg-rose-950/25" : "border-neutral-800 bg-neutral-950/30"} ${!isParentView ? "hover:bg-neutral-900/60 cursor-pointer" : "cursor-default"}`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">Content Warning</p>
                    <p className={`mt-1 text-sm font-medium ${isPotentiallyTriggering ? "text-rose-300" : "text-neutral-400"}`}>May Contain Triggering Content</p>
                    <p className="mt-1 text-xs text-neutral-500">{isPotentiallyTriggering ? "Flagged ✓" : isParentView ? "Not flagged" : "Click to flag"}</p>
                  </button>
                </div>

                {/* Editable: Categories */}
                <div ref={categoryMenuRef} className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-2">Categories</p>
                  {isParentView ? (
                    <p className="text-sm text-neutral-400">{selectedCategories.length ? selectedCategories.join(", ") : "Not set"}</p>
                  ) : (
                    <div className="msdWrap">
                      <button
                        type="button"
                        onClick={() => setCategoryOpen((v) => !v)}
                        className="msdTrigger"
                      >
                        <span className="msdValue">{selectedCategories.length > 0 ? selectedCategories.join(", ") : "Select categories…"}</span>
                        <span className="msdChevron">{categoryOpen ? "▲" : "▼"}</span>
                      </button>
                      {categoryOpen && (
                        <div className="msdMenu">
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
                                className={`msdItem w-full text-left rounded-lg transition ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-[rgba(120,120,120,0.15)]"}`}
                              >
                                <span className={`h-4 w-4 shrink-0 flex items-center justify-center rounded-sm border text-[10px] ${checked ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.35)] text-white" : "border-neutral-600"}`}>{checked ? "✓" : ""}</span>
                                <span>{g}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Editable: Summary - full width */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Summary</p>
                  <textarea
                    value={description}
                    onChange={isParentView ? undefined : (e) => setDescription(e.target.value)}
                    readOnly={isParentView}
                    rows={10}
                    placeholder="Write a summary or notes about this manuscript…"
                    className={`w-full rounded-lg border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 resize-y focus:outline-none focus:border-[rgba(120,120,120,0.7)] ${isParentView ? "cursor-default select-text" : ""}`}
                  />
                </div>

                {/* Editable: Copyright info */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400 mb-1">Copyright Info</p>
                  <textarea
                    value={copyrightInfo}
                    onChange={isParentView ? undefined : (e) => setCopyrightInfo(e.target.value)}
                    readOnly={isParentView}
                    rows={4}
                    placeholder="Copyright notice or ownership statement."
                    className={`w-full rounded-lg border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 resize-y focus:outline-none focus:border-[rgba(120,120,120,0.7)] ${isParentView ? "cursor-default select-text" : ""}`}
                  />
                </div>
              </div>
          </section>

              {/* Brainstorm Notes */}
              {manuscriptId && (
                <section className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.9)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
                  <NotesPanel defaultManuscriptId={manuscriptId} />
                </section>
              )}

              {/* Feedback from Beta Readers - manuscript overview */}
              <section ref={overviewFeedbackSectionRef} className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
                    Feedback from Beta Readers
                    {feedbackItems.length > 0 && (
                      <span className="ml-2 rounded-full bg-[rgba(120,120,120,0.2)] px-2 py-0.5 text-[10px] font-normal text-[rgba(210,210,210,0.8)]">{feedbackItems.length}</span>
                    )}
                  </h2>
                  <div className="flex gap-1.5">
                    {(["unresolved", "agreed", "disagreed", "all"] as const).map((opt) => (
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
                <div className="mb-4 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
                  <p className="text-xs font-semibold text-blue-200">Using Feedback Effectively</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-blue-400">
                    Conversation with your beta readers is a valuable part of the revision process, but keeping feedback organized matters just as much. Once a discussion has run its course, mark each piece of feedback as Agree or Disagree to close out the thread and reflect your final decision.
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-blue-400">
                    Your beta readers will only see that feedback has been resolved, not whether you agreed or disagreed. This keeps the conversation history clean for you while preserving a positive experience for your readers.
                  </p>
                </div>
                {(() => {
                  const overviewFiltered = feedbackItems.filter((f) => {
                    return overviewFeedbackFilter === "all" ? true :
                      overviewFeedbackFilter === "agreed" ? f.author_response === "agree" :
                      overviewFeedbackFilter === "disagreed" ? f.author_response === "disagree" :
                      !f.resolved && !f.author_response;
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
                        const chapterLabel = chapterObj ? (chapterObj.chapter_type === "prologue" ? `Prologue: ${chapterObj.title || "Untitled"}` : chapterObj.chapter_type === "trigger_page" ? `Trigger Page: ${chapterObj.title || "Untitled"}` : `Ch. ${chapterNumFor(chapterObj.id)}: ${chapterObj.title || "Untitled"}`) : null;
                        // Reflects last-SAVED chapter state (chapterObj.content), not the live
                        // editor buffer - this is a data-integrity question ("is this anchor
                        // still valid against what's actually persisted"), not a rendering
                        // question. Marker placement in the editor (recomputeMarkers) reads the
                        // live unsaved DOM instead, since that answers a different question
                        // ("where do I draw the highlight in what's on screen right now"). The
                        // two can briefly disagree while the author is mid-edit, until they save.
                        const excerptDetached = !!f.selection_excerpt && !!chapterObj &&
                          resolveFeedbackAnchor(f.selection_excerpt, f.start_offset, f.end_offset, chapterTextToPlainText(chapterObj.content ?? "")).status === "not-found";
                        const fReplies = feedbackReplies.filter((r) => r.feedback_id === f.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        const isExpanded = overviewExpandedIds.has(f.id);
                        const readerName = feedbackNames[f.reader_id] || "Reader";
                        const toggleExpand = () => setOverviewExpandedIds((prev) => {
                          const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n;
                        });
                        function showInChapter() {
                          if (!f.chapter_id) return;
                          setSelectedChapterId(f.chapter_id);
                          setSelectedFeedbackId(f.id);
                          setPreviewMode(false);
                        }
                        return (
                          <div key={f.id} className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <p className="text-xs font-medium text-[rgba(210,210,210,0.85)]">{readerName}</p>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                                {chapterLabel && <span className="rounded-lg bg-neutral-800 px-1.5 py-0.5">{chapterLabel}</span>}
                                {f.chapter_id && (
                                  <button
                                    type="button"
                                    onClick={showInChapter}
                                    className="rounded-lg border border-[rgba(120,120,120,0.4)] bg-[rgba(120,120,120,0.1)] px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-[rgba(120,120,120,0.2)] transition"
                                  >
                                    Show me
                                  </button>
                                )}
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
                            {/* Expand button - show when there are replies OR feedback is unresolved */}
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
                                  <div className="flex justify-end">
                                    <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-tr-sm bg-white chat-bubble-self border border-neutral-200 px-3 py-2">
                                      <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">{readerName}</p>
                                      <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                                    </div>
                                  </div>
                                  {fReplies.map((r) => {
                                    const isAuthorReply = r.replier_id === authorUserId;
                                    return (
                                      <div key={r.id} id={`reply-${r.id}`} className={`flex ${isAuthorReply ? "justify-start" : "justify-end"}`}>
                                        <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 transition-shadow ${isAuthorReply ? "rounded-tl-sm bg-neutral-100 chat-bubble-other border border-neutral-300" : "rounded-tr-sm bg-white chat-bubble-self border border-neutral-200"} ${highlightedReplyId === r.id ? "ring-2 ring-amber-400" : ""}`}>
                                          <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">{isAuthorReply ? "You" : readerName}</p>
                                          <p className="text-[11px] leading-relaxed text-neutral-800 break-words whitespace-pre-wrap">{r.body}</p>
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
                            {/* Undo resolved */}
                            {!isParentView && (f.resolved || !!f.author_response) && (
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className={`text-[10px] font-medium ${f.author_response === "agree" ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                                  {f.author_response === "agree" ? "✓ You agreed - conversation closed" : "✗ You disagreed - conversation closed"}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void undoResolveFeedback(f.id)}
                                  className="shrink-0 rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-400 hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-200 transition"
                                >
                                  Undo
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

              {/* Coin Activity - spending by this author + earnings by readers (hidden for parent) */}
              {!isParentView && <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Coin Activity</h2>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <span style={{ color: '#f59e0b' }}>✿</span>
                    <span className="font-semibold text-neutral-200">{coinBalance.toLocaleString()}</span>
                    <span>available</span>
                  </div>
                </div>

                {/* Reader earnings - running log of coins earned by readers from feedback on this manuscript */}
                <div className="mb-4">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Readers earned</p>
                  {readerCompletions.length === 0 ? (
                    <p className="text-[11px] italic text-neutral-600">No reader earnings yet on this manuscript.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {readerCompletions.map((c, i) => {
                        const chapterObj = chapters.find((ch) => ch.id === c.chapter_id);
                        const chapterLabel = chapterObj
                          ? chapterObj.chapter_type === "prologue" ? "Prologue"
                          : chapterObj.chapter_type === "trigger_page" ? "Trigger Page"
                          : `Ch. ${chapterNumFor(chapterObj.id)}`
                          : null;
                        const dateLabel = new Date(c.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                        return (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] px-3 py-1.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-neutral-300 truncate">{readerNames[c.reader_id] || "Reader"}</span>
                                {chapterLabel && (
                                  <span className="text-[10px] text-neutral-500 truncate">· {chapterLabel}</span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-600">{dateLabel}</span>
                            </div>
                            <span className="text-xs font-semibold text-emerald-400 shrink-0 ml-2">+{c.coins_awarded} <span style={{ color: '#f59e0b' }}>✿</span></span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Author rewards sent to readers */}
                {manuscriptLedger.some((e) => e.reason === "reader_reward") && (
                  <div className="mb-4">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Rewards you sent</p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {manuscriptLedger.filter((e) => e.reason === "reader_reward").map((entry) => {
                        const recipientId = entry.metadata?.reader_id as string | undefined;
                        const recipientName = recipientId ? (readerNames[recipientId] || "Reader") : "Reader";
                        const rewardReasonLabel = typeof entry.metadata?.reason === "string" ? entry.metadata.reason : null;
                        return (
                          <div key={entry.id} className="flex items-center justify-between rounded-lg border border-[rgba(120,120,120,0.2)] bg-[rgba(120,120,120,0.05)] px-3 py-1.5">
                            <div className="min-w-0">
                              <span className="text-xs text-neutral-300 truncate">Rewarded {recipientName}</span>
                              {rewardReasonLabel && (
                                <span className="ml-1.5 text-[10px] text-neutral-500 truncate">- {rewardReasonLabel}</span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-rose-400 shrink-0 ml-2">{entry.delta} <span style={{ color: '#f59e0b' }}>✿</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Other author spending on this manuscript (slots, chapters, etc.) */}
                {manuscriptLedger.some((e) => e.reason !== "reader_reward") && (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Your spending</p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {manuscriptLedger.filter((e) => e.reason !== "reader_reward").map((entry) => {
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
                            <span className="text-xs font-semibold text-rose-400 shrink-0 ml-2">{entry.delta} <span style={{ color: '#f59e0b' }}>✿</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {readerCompletions.length === 0 && manuscriptLedger.length === 0 && (
                  <p className="text-sm italic text-neutral-500">No coin activity on this manuscript yet.</p>
                )}
              </section>}
            </>
          )}

          {selectedChapterId && selectedChapter && (() => {
            // Shares recomputeMarkers' live editor DOM text (editorChapterDomText)
            // instead of re-deriving text from saved content. This deliberately
            // reintroduces a difference from excerptDetached's log (which must use
            // saved content - it has no live DOM for chapters other than the one
            // currently open) but eliminates a worse one: this card list and marker
            // placement are visible in the SAME view at the SAME time, so they must
            // agree with each other about the same chapter, or a marker can render
            // with no card behind it (or vice versa) - the exact class of bug this
            // whole pass exists to fix. null means "not measured yet for this
            // chapter" - treat as pending (include, don't warn), not not-found.
            const plainChapterText = editorChapterDomText;
            const fallbackSortStart = (item: LineFeedback): number => {
              if (!item.selection_excerpt || plainChapterText == null) return Infinity;
              const anchor = resolveFeedbackAnchor(item.selection_excerpt, item.start_offset, item.end_offset, plainChapterText);
              return anchor.status !== "not-found" ? anchor.start : Infinity;
            };
            const chapterFeedback = feedbackItems
              .filter((f) => f.chapter_id === selectedChapterId)
              .sort((a, b) => (a.start_offset ?? fallbackSortStart(a)) - (b.start_offset ?? fallbackSortStart(b)));
            const activeFeedback = chapterFeedback.find((f) => f.id === selectedFeedbackId) ?? null;
            const activeExcerpt = activeFeedback?.selection_excerpt ?? "";
            const previewHtml = chapterTextToPreviewHtml(chapterEditorContent);
            return (
              <div className="flex flex-col gap-4 items-start lg:flex-row lg:gap-6">
                {/* Chapter editor / preview */}
                <section ref={chapterSectionRef} className="min-w-0 flex-1 rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      {!isParentView ? (
                        <select
                          value={chapterType}
                          onChange={(e) => {
                            const t = e.target.value as "chapter" | "prologue" | "epilogue" | "trigger_page";
                            if (t === "trigger_page" && chapterType !== "trigger_page") {
                              const existingTriggerPages = chapters.filter(c => c.id !== selectedChapter.id && c.chapter_type === "trigger_page").length;
                              if (existingTriggerPages >= 1) {
                                setAlertModal("Each project can only have one Trigger Page.");
                                return;
                              }
                            }
                            const num = chapterNumFor(selectedChapter.id, t === "chapter" ? "chapter" : undefined);
                            setChapterType(t);
                            setChapterEditorTitle(
                              t === "prologue" ? "Prologue" :
                              t === "epilogue" ? "Epilogue" :
                              t === "trigger_page" ? "Trigger Page" :
                              `Chapter ${num}`
                            );
                          }}
                          className="mb-1 rounded border border-neutral-700 bg-neutral-900/60 px-2 py-0.5 text-xs uppercase tracking-wide text-[rgba(210,210,210,0.8)] focus:outline-none focus:border-[rgba(120,120,120,0.7)]"
                        >
                          <option value="chapter">Chapter</option>
                          <option value="prologue">Prologue</option>
                          <option value="epilogue">Epilogue</option>
                          <option value="trigger_page">Trigger Page</option>
                        </select>
                      ) : (
                        <p className="text-xs uppercase tracking-wide text-[rgba(210,210,210,0.6)]">
                          {chapterType === "prologue" ? "Prologue" : chapterType === "epilogue" ? "Epilogue" : chapterType === "trigger_page" ? "Trigger Page" : `Chapter ${chapterNumFor(selectedChapter.id)}`}
                        </p>
                      )}
                      <h2 className="text-lg font-semibold text-white">{chapterEditorTitle || "Untitled"}</h2>
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
                      <FormatPicker
                        value={formatId}
                        onChange={(id) => {
                          setFormatId(id);
                          if (manuscriptId) {
                            localStorage.setItem(`lbs-format-${manuscriptId}`, id);
                            void supabase.from("manuscripts").update({ format_id: id }).eq("id", manuscriptId);
                          }
                        }}
                      />
                    )}
                    {!previewMode && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-neutral-300">{chapterType === "prologue" ? "Prologue title" : chapterType === "trigger_page" ? "Trigger page title" : "Chapter title"}</div>
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
                            onClick={() => { setChapterUpdateCategories([]); setChapterUpdateNote(""); setLastChapterUpdate(null); setChapterUpdateModal(true); void loadLastChapterUpdate(selectedChapter.id); }}
                            className="h-11 rounded-lg border border-blue-600/50 bg-blue-600/15 px-4 text-sm font-semibold text-blue-200 hover:bg-blue-600/25"
                          >
                            Update
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
                        <div className="chapter-editor relative min-h-[44rem] overflow-y-auto rounded-xl border border-[rgba(120,120,120,0.28)] bg-[rgba(18,18,18,0.9)] px-4 py-4 md:px-8 md:py-8 shadow-[0_12px_34px_rgba(0,0,0,0.35)]">
                          {/* Owner watermark - tiled, same style as reader watermark */}
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
                          {/* Paragraphs - rendered with chapterTextToPreviewHtml for identical structure to ChapterEditor */}
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
                            format={FORMATS[formatId]}
                            placeholder="Begin your chapter here. Press Enter to start a new paragraph. Shift+Enter for a line break within a paragraph."
                            className="min-h-[44rem] rounded-xl border border-neutral-800 bg-[rgba(18,18,18,0.85)] px-4 py-4 md:px-8 md:py-8 text-neutral-100 focus:border-[rgba(120,120,120,0.5)]"
                          />
                          {/* Dotted amber underlines - always visible, same style as reader view.
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
                                  backgroundColor: isSelected ? "rgba(253,224,71,0.28)" : "rgba(253,224,71,0.08)",
                                  borderBottom: `2px dotted ${isSelected ? "rgba(253,224,71,1)" : "rgba(253,224,71,0.82)"}`,
                                  pointerEvents: "none",
                                  zIndex: 5,
                                }}
                              />
                            ));
                          })}
                          {/* Speech-bubble markers - same size and style as reader view */}
                          {Object.entries(markerInfos).map(([fid, info]) => {
                            const isSelected = selectedFeedbackId === fid;
                            const offsetX = markerOffsets[fid] ?? 0;
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
                                  top: info.top - 8,
                                  left: info.left + offsetX - 4,
                                  zIndex: 10,
                                }}
                                className={`flex h-[10px] w-[10px] items-center justify-center rounded-full shadow-sm transition-all ${
                                  isSelected
                                    ? "bg-yellow-300 text-yellow-950 scale-110 shadow-yellow-300/60"
                                    : "bg-yellow-300 text-yellow-950 hover:bg-yellow-200 hover:scale-105"
                                }`}
                              >
                                <svg width="6" height="6" viewBox="0 0 9 9" fill="currentColor">
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

                {/* Inline feedback column — each card floats at the same Y as its text marker */}
                {!previewMode && (
                  <div ref={rightColumnRef} className="chapter-feedback-aside w-full lg:w-72 lg:shrink-0 relative" style={{ minHeight: isRowLayout ? (chapterSectionH || undefined) : undefined }}>
                    {chapterFeedback.some((f) => (unreadReplyCounts[f.id] ?? 0) > 0) && (
                      <div className="mb-2 flex justify-end px-1">
                        <button
                          type="button"
                          onClick={() => {
                            const ids = chapterFeedback.filter((f) => (unreadReplyCounts[f.id] ?? 0) > 0).map((f) => f.id);
                            const priorCounts: Record<string, number> = {};
                            setUnreadReplyCounts((prev) => {
                              const next = { ...prev };
                              ids.forEach((id) => { if (next[id]) priorCounts[id] = next[id]; delete next[id]; });
                              return next;
                            });
                            ids.forEach((id) => clearedReplyFeedbackIdsRef.current.add(id));
                            void Promise.all(ids.map((id) => fetch("/api/feedback/mark-replies-read", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ feedback_id: id }),
                            }).then((res) => {
                              if (!res.ok) throw new Error(`mark-replies-read responded ${res.status}`);
                            }).catch((err) => {
                              console.error("Failed to persist read state for feedback replies", id, err);
                              clearedReplyFeedbackIdsRef.current.delete(id);
                              if (priorCounts[id]) {
                                setUnreadReplyCounts((prev) => ({ ...prev, [id]: priorCounts[id] }));
                              }
                            })));
                          }}
                          className="rounded-lg text-[10px] text-neutral-500 hover:text-neutral-300 transition"
                        >
                          Mark all read
                        </button>
                      </div>
                    )}
                    {/* Absolutely-positioned cards — each aligned to its marker in the editor */}
                    {(() => {
                      const filtered = chapterFeedback.filter((f) => {
                        if (f.resolved || !!f.author_response) return false;
                        if (!f.selection_excerpt) return true;
                        if (plainChapterText == null) return true; // pending - don't hide a possibly-healthy card
                        return resolveFeedbackAnchor(f.selection_excerpt, f.start_offset, f.end_offset, plainChapterText).status !== "not-found";
                      });
                      if (filtered.length === 0) return (
                        <p className="text-[11px] text-neutral-600 italic mt-2">No unresolved feedback on this chapter yet.</p>
                      );
                      const clusters: LineFeedback[][] = [];
                      for (const item of filtered) {
                        const info = markerInfos[item.id];
                        const last = clusters[clusters.length - 1];
                        const lastInfo = last ? markerInfos[last[0].id] : undefined;
                        if (info && last && lastInfo && Math.abs(lastInfo.top - info.top) <= 18) {
                          last.push(item);
                        } else {
                          clusters.push([item]);
                        }
                      }
                      return clusters.map((cluster) => {
                        const activeFeedback = cluster.find((item) => item.id === selectedFeedbackId) ?? cluster[0];
                        const activeIndex = cluster.findIndex((item) => item.id === activeFeedback.id);
                        const f = activeFeedback;
                        const info = markerInfos[f.id];
                        const isSelected = selectedFeedbackId === f.id;
                        const replies = feedbackReplies.filter((r) => r.feedback_id === f.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        const readerName = feedbackNames[f.reader_id] || "Reader";
                        const hasStack = cluster.length > 1;
                        const unreadReplyCount = unreadReplyCounts[f.id] ?? 0;
                        const moveInStack = (direction: -1 | 1) => {
                          const nextIndex = (activeIndex + direction + cluster.length) % cluster.length;
                          setSelectedFeedbackId(cluster[nextIndex].id);
                        };
                        // Resolved/unmatched feedback has no marker — render in normal flow at top of column
                        const cardStyle: React.CSSProperties = isRowLayout && info
                          ? { position: "absolute", top: editorOffsetY + info.top, left: 0, right: 0, zIndex: isSelected ? 20 : 10 }
                          : { position: "relative", zIndex: isSelected ? 20 : 10, marginBottom: 8 };
                        const isExpanded = isSelected;
                        return (
                          <div
                            key={f.id}
                            id={`feedback-card-${f.id}`}
                            style={cardStyle}
                            onClick={() => setSelectedFeedbackId(isSelected ? null : f.id)}
                            className={`group cursor-pointer rounded-lg border transition-all duration-200 ${
                              isExpanded
                                ? "border-[rgba(120,120,120,0.7)] bg-[rgba(20,20,20,0.97)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3"
                                : "border-[rgba(120,120,120,0.2)] bg-[rgba(20,20,20,0.70)] hover:border-[rgba(120,120,120,0.45)] hover:bg-[rgba(20,20,20,0.88)] shadow-[0_2px_8px_rgba(0,0,0,0.2)] px-2.5 py-1.5"
                            }`}
                          >
                            {/* Collapsed: single-line pill */}
                            {!isExpanded && (
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="shrink-0 text-[10px] font-semibold text-neutral-400">{readerName}</span>
                                  <span className="truncate text-[10px] italic text-neutral-500">&ldquo;{f.comment_text}&rdquo;</span>
                                </div>
                                {(hasStack || unreadReplyCount > 0) && (
                                  <div className="flex shrink-0 items-center gap-1">
                                    {hasStack && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); moveInStack(-1); }}
                                          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] text-[10px] text-neutral-300 transition hover:border-[rgba(120,120,120,0.6)] hover:text-white"
                                          title="Previous stacked feedback"
                                        >
                                          ‹
                                        </button>
                                        <span className="text-[9px] font-semibold text-neutral-500">{activeIndex + 1}/{cluster.length}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); moveInStack(1); }}
                                          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] text-[10px] text-neutral-300 transition hover:border-[rgba(120,120,120,0.6)] hover:text-white"
                                          title="Next stacked feedback"
                                        >
                                          ›
                                        </button>
                                      </>
                                    )}
                                    {unreadReplyCount > 0 && (
                                      <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-400">
                                        {unreadReplyCount === 1 ? "New reply" : `${unreadReplyCount} new`}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Expanded: full card */}
                            {isExpanded && (
                              <div ref={floatingCardRef}>
                            {/* Header */}
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <p className="text-[11px] font-medium text-[rgba(210,210,210,0.85)]">{readerName}</p>
                              <div className="flex items-center gap-1.5">
                                {hasStack && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); moveInStack(-1); }}
                                      className="rounded-lg px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-[rgba(120,120,120,0.2)] hover:text-neutral-200 transition"
                                      title="Previous stacked feedback"
                                    >
                                      ‹
                                    </button>
                                    <span className="text-[10px] text-neutral-500">{activeIndex + 1}/{cluster.length}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); moveInStack(1); }}
                                      className="rounded-lg px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-[rgba(120,120,120,0.2)] hover:text-neutral-200 transition"
                                      title="Next stacked feedback"
                                    >
                                      ›
                                    </button>
                                  </>
                                )}
                                <span className="text-[10px] text-neutral-500">{new Date(f.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>

                            {/* Excerpt */}
                            <blockquote className="border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
                              &ldquo;{f.selection_excerpt}&rdquo;
                            </blockquote>

                            {/* Chat thread */}
                            <div className="mt-2 rounded-lg bg-neutral-950/50 p-2 space-y-1.5">
                              <div className="flex justify-end">
                                <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-tr-sm bg-white chat-bubble-self border border-neutral-200 px-3 py-2">
                                  <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">{readerName}</p>
                                  <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                                </div>
                              </div>
                              {replies.map((r) => {
                                const isAuthorReply = r.replier_id === authorUserId;
                                return (
                                  <div key={r.id} id={`reply-${r.id}`} className={`flex ${isAuthorReply ? "justify-start" : "justify-end"}`}>
                                    <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 transition-shadow ${isAuthorReply ? "rounded-tl-sm bg-neutral-100 chat-bubble-other border border-neutral-300" : "rounded-tr-sm bg-white chat-bubble-self border border-neutral-200"} ${highlightedReplyId === r.id ? "ring-2 ring-amber-400" : ""}`}>
                                      <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">{isAuthorReply ? "You" : readerName}</p>
                                      <p className="text-[11px] leading-relaxed text-neutral-800 break-words whitespace-pre-wrap">{r.body}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Conversation closed + Undo */}
                            {(f.resolved || !!f.author_response) && (
                              <div className="mt-2 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <p className={`text-[10px] font-medium ${f.author_response === "agree" ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                                  {f.author_response === "agree" ? "✓ You agreed - conversation closed" : "✗ You disagreed - conversation closed"}
                                </p>
                                {!isParentView && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); void undoResolveFeedback(f.id); }}
                                    className="shrink-0 rounded-md border border-[rgba(120,120,120,0.3)] px-2 py-0.5 text-[10px] text-neutral-400 hover:border-[rgba(120,120,120,0.6)] hover:text-neutral-200 transition"
                                  >
                                    Undo
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Reply box */}
                            {isSelected && !isParentView && !f.resolved && !f.author_response && (
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

                            {/* Report button — parent view */}
                            {isParentView && (
                              <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setParentReportModal({ readerId: f.reader_id, readerName, feedbackExcerpt: `${f.selection_excerpt ? `"${f.selection_excerpt}" - ` : ""}${f.comment_text}` });
                                    setParentReportReason(""); setParentReportDone(false); setParentReportMsg(null);
                                  }}
                                  className="rounded-lg border border-orange-700/50 bg-orange-950/15 px-2.5 py-1 text-[11px] text-orange-400 hover:bg-orange-950/30 transition"
                                >
                                  Report this feedback
                                </button>
                              </div>
                            )}

                            {/* Agree / Disagree — author only */}
                            {!isParentView && !f.author_response && (
                              <div className="mt-2.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button type="button" onClick={(e) => { e.stopPropagation(); void resolveFeedback(f.id, "agree"); }}
                                  className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/40 transition"
                                  title="Agree - acknowledges feedback and removes it from this view">Agree</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); void resolveFeedback(f.id, "disagree"); }}
                                  className="rounded-lg border border-rose-700/60 bg-rose-900/20 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-900/40 transition"
                                  title="Disagree - acknowledges feedback and removes it from this view">Disagree</button>
                              </div>
                            )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
        </ManuscriptLayout>

        {alertModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setAlertModal(null)}>
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-3 text-base font-semibold text-white">Not Allowed</h2>
              <p className="mb-5 text-sm text-neutral-300">{alertModal}</p>
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="w-full rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.15)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.25)] transition"
              >
                OK
              </button>
            </div>
          </div>
        )}

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

        {exitTooltip && (
          <div
            className="pointer-events-none fixed z-[70] w-56 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-[rgba(120,120,120,0.5)] bg-neutral-950 px-3 py-2.5 text-xs shadow-2xl"
            style={{ left: exitTooltip.x, top: exitTooltip.y }}
          >
            <p className="font-semibold text-white">
              {exitTooltip.reader.exitReason!.initiatedBy === "owner" ? "Removed by you" : "Left the project"}
            </p>
            <p className="mt-0.5 text-neutral-500">
              {new Date(exitTooltip.reader.exitReason!.at).toLocaleDateString()}
            </p>
            <p className="mt-1.5 text-neutral-300">{exitTooltip.reader.exitReason!.category}</p>
            {exitTooltip.reader.exitReason!.detail && (
              <p className="mt-1 text-neutral-400 italic">&ldquo;{exitTooltip.reader.exitReason!.detail}&rdquo;</p>
            )}
          </div>
        )}

        {showAnalyticsPanel && (
          <BetaReaderAnalyticsPanel manuscriptId={manuscript.id} onClose={() => setShowAnalyticsPanel(false)} />
        )}

        {enableReaderConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Restore reader access"
              className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
            >
              <h2 className="text-base font-semibold text-white">Restore this reader&apos;s access?</h2>
              <p className="mt-2 text-sm text-neutral-400">They&apos;ll be able to view the manuscript and leave feedback again.</p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { void toggleReaderAccess(enableReaderConfirm.readerId, true, false); setEnableReaderConfirm(null); }}
                  className="btn-success h-9 flex-1 rounded-lg border px-3 text-sm font-medium text-white"
                >
                  Yes, restore access
                </button>
                <button
                  type="button"
                  onClick={() => setEnableReaderConfirm(null)}
                  className="h-9 flex-1 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {removeReaderModal && (
          <ExitReasonModal
            title="Remove this reader?"
            description="This is only ever visible to you, the reader won't see the reason you select."
            reasons={OWNER_REMOVE_REASONS}
            submitting={removeReaderSubmitting}
            onCancel={() => setRemoveReaderModal(null)}
            onSubmit={(category, detail) => void submitRemoveReader(category, detail)}
          />
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

        {chapterUpdateModal && selectedChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setChapterUpdateModal(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Flag chapter update"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-5 shadow-2xl"
            >
              <h2 className="mb-1 text-base font-semibold text-white">Flag update to readers</h2>
              <p className="mb-4 text-sm text-neutral-400">
                Readers who left feedback on this chapter will see a &quot;New updates&quot; tag.
              </p>

              {!lastChapterUpdateLoading && (
                <div className="mb-4 rounded-lg border border-blue-600/40 bg-blue-950/20 px-3 py-2 text-xs text-blue-200">
                  {lastChapterUpdate ? (
                    <>
                      <span className="font-semibold text-blue-300">Last update:</span>{" "}
                      {new Date(lastChapterUpdate.created_at).toLocaleString()}
                      {lastChapterUpdate.categories.length > 0 && ` — ${lastChapterUpdate.categories.join(", ")}`}
                      {lastChapterUpdate.note && ` — "${lastChapterUpdate.note}"`}
                    </>
                  ) : (
                    <span className="italic text-blue-300/70">No updates posted yet for this chapter.</span>
                  )}
                </div>
              )}

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">What changed?</p>
              <div className="mb-4 flex flex-wrap gap-2">
                {CHAPTER_UPDATE_CATEGORIES.map((cat) => {
                  const active = chapterUpdateCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleChapterUpdateCategory(cat)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                          : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.08)] text-neutral-300 hover:bg-[rgba(120,120,120,0.14)]"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Note (optional)</p>
              <textarea
                value={chapterUpdateNote}
                onChange={(e) => setChapterUpdateNote(e.target.value.slice(0, 200))}
                maxLength={200}
                rows={3}
                placeholder="Add any extra context for readers..."
                className="mb-1 w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-[rgba(120,120,120,0.7)]"
              />
              <p className="mb-4 text-right text-[10px] text-neutral-600">{chapterUpdateNote.length}/200</p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void submitChapterUpdate()}
                  disabled={chapterUpdateSubmitting || (chapterUpdateCategories.length === 0 && !chapterUpdateNote.trim())}
                  className="h-9 flex-1 rounded-lg border border-blue-600/60 bg-blue-600/20 px-3 text-sm font-medium text-blue-200 hover:bg-blue-600/30 disabled:opacity-40"
                >
                  Post update
                </button>
                <button
                  type="button"
                  onClick={() => setChapterUpdateModal(false)}
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
