"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

export const dynamic = "force-dynamic";

import React, { Suspense } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ManuscriptLayout, { DetailRow as _DetailRow } from "@/components/ManuscriptLayout";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import { hasYouthAudienceCategory } from "@/lib/manuscriptAudience";
import { sanitizeChapterHtml } from "@/lib/format/chapterNormalize";
import { useTheme } from "@/components/ThemeProvider";
import NotesPanel from "@/components/NotesPanel";

type Manuscript = {
  id: string;
  owner_id: string;
  title: string;
  genre: string | null;
  categories: string[] | null;
  age_rating: "teen_safe" | "adult";
  content: string;
  cover_url: string | null;
  description: string | null;
  requested_feedback: string | null;
  potential_triggers: string | null;
  copyright_info: string | null;
  visibility: "private" | "public";
  word_count?: number | null;
  chapter_count?: number | null;
  created_at?: string | null;
};
type Chapter = { id: string; title: string; chapter_order: number; content: string; is_private: boolean; chapter_type?: "chapter" | "prologue" | "trigger_page" };
type AccessGrant = { id: string; reader_id: string };
type LineFeedback = {
  id: string;
  reader_id: string;
  selection_excerpt: string;
  comment_text: string;
  chapter_id: string | null;
  start_offset: number | null;
  end_offset: number | null;
  word_count: number;
  coins_awarded: number;
  created_at: string;
  resolved?: boolean;
  author_response?: "agree" | "disagree" | null;
};
type FeedbackReply = { id: string; feedback_id: string; replier_id: string; body: string; created_at: string };
type ReaderMarkerInfo = { top: number; left: number; highlightRects: { top: number; left: number; width: number; height: number }[] };

function PageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const manuscriptId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const fromParam = searchParams.get("from");
  const backHref = fromParam === "discover" ? "/discover" : fromParam === "details" ? `/manuscripts/${manuscriptId}/details` : fromParam === "parent" ? "/manage-youth" : "/manuscripts";
  const backLabel = fromParam === "discover" ? "Back to discover" : fromParam === "details" ? "Back to book page" : fromParam === "parent" ? "Back to Youth Accounts" : "Back to manuscripts";
  const chapterParam = searchParams.get("chapter");
  const feedbackParam = searchParams.get("feedback");

  const { theme } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string>("Reader");
  const [myAge, setMyAge] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(chapterParam);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [feedback, setFeedback] = useState<LineFeedback[]>([]);
  const [ownerAllFeedback, setOwnerAllFeedback] = useState<LineFeedback[]>([]);
  const [myAllFeedback, setMyAllFeedback] = useState<LineFeedback[]>([]);
  const [myChapterFeedback, setMyChapterFeedback] = useState<LineFeedback[]>([]);
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const replyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const replyTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [expandedFeedbackIds, setExpandedFeedbackIds] = useState<Set<string>>(new Set());
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [ownerFeedbackFilter, setOwnerFeedbackFilter] = useState<"unresolved" | "resolved" | "all">("unresolved");
  const [names, setNames] = useState<Record<string, string>>({});
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [ages, setAges] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null);
  const [editFeedbackDraft, setEditFeedbackDraft] = useState("");
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(feedbackParam);
  const [selectedOwnerFeedbackId, setSelectedOwnerFeedbackId] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [myRequestStatus, setMyRequestStatus] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ text: string; start: number; end: number; x: number; y: number } | null>(null);
  const [lineEditDraft, setLineEditDraft] = useState("");
  const [submittingLineEdit, setSubmittingLineEdit] = useState(false);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const [copyWarning, setCopyWarning] = useState(false);
  const [copyConsequence, setCopyConsequence] = useState<{ consequence: string; message: string; strike: number } | null>(null);
  const [feedbackViolation, setFeedbackViolation] = useState<{ message: string; consequence: string } | null>(null);
  // Parent view state
  const [isParentView, setIsParentView] = useState(fromParam === "parent");
  const [_parentPendingRequests, setParentPendingRequests] = useState<
    { id: string; requester_id: string; created_at: string; name: string; username: string | null }[]
  >([]);
  const [parentDisabled, setParentDisabled] = useState(false);
  const [parentDisabledReason, setParentDisabledReason] = useState<string | null>(null);
  const [parentDisableModal, setParentDisableModal] = useState(false);
  const [parentDisableReason, setParentDisableReason] = useState("");
  const [parentDisableSubmitting, setParentDisableSubmitting] = useState(false);
  const [parentReportModal, setParentReportModal] = useState<{ userId: string; name: string } | null>(null);
  const [parentReportReason, setParentReportReason] = useState("");
  const [parentReportSubmitting, setParentReportSubmitting] = useState(false);
  const [parentActionMsg, setParentActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [_manuscriptConduct, setManuscriptConduct] = useState<{
    manuscript_conduct_strikes: number;
    manuscript_suspended_until: string | null;
    manuscript_blacklisted: boolean;
    manuscript_lifetime_suspension_count: number;
  } | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const cardAreaRef = useRef<HTMLDivElement>(null);
  const chapterSectionRef = useRef<HTMLElement>(null);
  const [markerTops, setMarkerTops] = useState<Record<string, number>>({});
  const [clickedMarkerTop, setClickedMarkerTop] = useState<number | null>(null);
  const [chapterHeight, setChapterHeight] = useState(0);
  const [navH, setNavH] = useState(0);
  const [readerMarkerInfos, setReaderMarkerInfos] = useState<Record<string, ReaderMarkerInfo>>({});

  function handleSelectionUp() {
    if (!canLeaveLineEdits) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { setPendingSelection(null); return; }
    const text = sel.toString().trim();
    if (!text || !textContainerRef.current) { setPendingSelection(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const preRange = document.createRange();
    preRange.setStart(textContainerRef.current, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const centerX = rect.left + (rect.right - rect.left) / 2;
    // Clamp so the 288px-wide popup (w-72) stays within the viewport
    const clampedX = Math.min(Math.max(centerX, 152), window.innerWidth - 152);
    setPendingSelection({ text, start, end: start + text.length, x: clampedX, y: rect.top });
  }

  const PARENT_DISABLE_REASONS = [
    "Inappropriate content",
    "Safety concern",
    "Content needs review",
    "Temporary pause requested",
    "Other parental concern",
  ];

  const PARENT_REPORT_REASONS = [
    "Inappropriate messages or comments",
    "Harassment or bullying",
    "Soliciting personal information",
    "Sharing adult content with a minor",
    "Other concerning behavior",
  ];

  async function handleParentDisable() {
    if (!parentDisableReason || !manuscriptId) return;
    setParentDisableSubmitting(true);
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: manuscriptId, action: "disable", reason: parentDisableReason }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setParentDisableSubmitting(false);
    setParentDisableModal(false);
    setParentDisableReason("");
    if (json.ok) {
      setParentDisabled(true);
      setParentDisabledReason(parentDisableReason);
      setParentActionMsg({ ok: true, text: "Manuscript has been disabled and unpublished. A notification has been sent to your child." });
    } else {
      setParentActionMsg({ ok: false, text: json.error ?? "Failed to disable manuscript." });
    }
  }

  async function handleParentReinstate() {
    if (!manuscriptId) return;
    setParentDisableSubmitting(true);
    const res = await fetch("/api/manage-youth/disable-manuscript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: manuscriptId, action: "reinstate" }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setParentDisableSubmitting(false);
    if (json.ok) {
      setParentDisabled(false);
      setParentDisabledReason(null);
      setParentActionMsg({ ok: true, text: "Manuscript reinstated. A notification has been sent to your child." });
    } else {
      setParentActionMsg({ ok: false, text: json.error ?? "Failed to reinstate manuscript." });
    }
  }

  async function handleParentReport() {
    if (!parentReportModal || !parentReportReason || !manuscript) return;
    setParentReportSubmitting(true);
    const res = await fetch("/api/manage-youth/report-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youth_user_id: manuscript.owner_id,
        reported_user_id: parentReportModal.userId,
        reason: parentReportReason,
      }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setParentReportSubmitting(false);
    setParentReportModal(null);
    setParentReportReason("");
    if (json.ok) {
      setParentActionMsg({ ok: true, text: `Report submitted against ${parentReportModal.name}. An admin will review it and the user's access has been temporarily restricted.` });
    } else {
      setParentActionMsg({ ok: false, text: json.error ?? "Failed to submit report." });
    }
  }

  function triggerCopyWarning() {
    setCopyWarning(true);
    setCopyConsequence(null);
    void fetch("/api/manuscript/copy-attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscript_id: manuscriptId, manuscript_title: manuscript?.title }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json() as { consequence: string; message: string; strike: number };
        setCopyConsequence(data);
      } else {
        // Already suspended or blacklisted — redirect immediately
        router.replace("/manuscripts");
      }
    });
  }

  async function submitLineEdit() {
    if (!pendingSelection || !lineEditDraft.trim() || !userId) return;
    setSubmittingLineEdit(true);
    const wordCount = lineEditDraft.trim().split(/\s+/).filter(Boolean).length;
    const res = await fetch("/api/manuscript/feedback/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manuscript_id: manuscriptId,
        chapter_id: activeChapter?.id ?? null,
        selection_excerpt: pendingSelection.text,
        comment_text: lineEditDraft.trim(),
        start_offset: pendingSelection.start,
        end_offset: pendingSelection.end,
        word_count: wordCount,
        manuscript_owner_id: manuscript?.owner_id ?? null,
      }),
    });
    const json = await res.json() as { ok?: boolean; feedback?: LineFeedback; error?: string; consequence?: string };
    setSubmittingLineEdit(false);
    if (!res.ok) {
      if (json.consequence) {
        setFeedbackViolation({ message: json.error ?? "Feedback blocked due to a policy violation.", consequence: json.consequence });
      } else {
        setMsg(json.error ?? "Failed to submit feedback.");
      }
      return;
    }
    const inserted = json.feedback;
    setPendingSelection(null);
    setLineEditDraft("");
    if (inserted) {
      const newItem = inserted as LineFeedback;
      setMyChapterFeedback((prev) => [newItem, ...prev]);
      setMyAllFeedback((prev) => [newItem, ...prev]);
      setFeedback((prev) => [newItem, ...prev]);

      // Bloom coin check — beta readers earn 5 coins after 200 words of feedback per chapter
      // Trigger pages never award coins
      const chId = activeChapter?.id;
      const isBetaReader = manuscript && userId !== manuscript.owner_id &&
        grants.some((g) => g.reader_id === userId);
      const isTriggerPage = activeChapter?.chapter_type === "trigger_page";
      if (isBetaReader && chId && !completedChapterIds.has(chId) && !isTriggerPage) {
        const existingWords = myChapterFeedback.reduce((sum, f) => sum + (f.word_count ?? 0), 0);
        const totalWords = existingWords + wordCount;
        if (totalWords >= 200) {
          const { data: result } = await supabase.rpc("award_chapter_coins", {
            p_chapter_id: chId,
            p_manuscript_id: manuscriptId,
          });
          const res = result as { success: boolean; coins_awarded?: number; new_balance?: number } | null;
          if (res?.success) {
            setCompletedChapterIds((prev) => new Set([...prev, chId]));
            setCoinToast({ coins: res.coins_awarded ?? 5, newBalance: res.new_balance ?? 0 });
          }
        }
      }
    }
  }

  const [completedChapterIds, setCompletedChapterIds] = useState<Set<string>>(new Set());
  const [coinToast, setCoinToast] = useState<{ coins: number; newBalance: number } | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function leaveProject() {
    if (!manuscriptId || !userId) return;
    if (!confirm("Leave this project? You can request to rejoin later if you change your mind.")) return;
    setLeaving(true);
    await supabase
      .from("manuscript_access_requests")
      .update({ status: "left" })
      .eq("manuscript_id", manuscriptId)
      .eq("requester_id", userId);
    await supabase
      .from("manuscript_access_grants")
      .delete()
      .eq("manuscript_id", manuscriptId)
      .eq("reader_id", userId);
    router.push("/manuscripts");
  }

  async function requestAccess() {
    if (!manuscriptId || !userId) return;
    setRequesting(true);

    // Check if a prior request exists
    const { data: existing } = await supabase
      .from("manuscript_access_requests")
      .select("id, status")
      .eq("manuscript_id", manuscriptId)
      .eq("requester_id", userId)
      .maybeSingle();

    const existingRow = existing as { id: string; status: string } | null;

    let shouldNotify = false;

    if (!existingRow) {
      // No prior request — insert fresh
      const { error } = await supabase.from("manuscript_access_requests").insert({
        manuscript_id: manuscriptId,
        requester_id: userId,
      });
      setRequesting(false);
      if (error) { setMsg(error.message); return; }
      shouldNotify = true;
    } else if (existingRow.status === "left" || existingRow.status === "denied") {
      // Reader previously left or was denied — reset to pending so author sees it again
      const { error } = await supabase
        .from("manuscript_access_requests")
        .update({ status: "pending" })
        .eq("id", existingRow.id);
      setRequesting(false);
      if (error) { setMsg(error.message); return; }
      setMyRequestStatus("pending");
      shouldNotify = true;
    } else {
      // Already pending, approved, or disabled — treat as already sent
      setRequesting(false);
    }

    // No system_notification here — the manuscript_access_requests row already creates
    // an actionable accept/decline notification for the author in the notifications feed.

    setRequestSent(true);
  }

  async function _refreshMyChapterFeedback() {
    if (!chapterId || !manuscriptId || !userId) return;
    const { data } = await supabase
      .from("line_feedback")
      .select("id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response")
      .eq("manuscript_id", manuscriptId)
      .eq("chapter_id", chapterId)
      .eq("reader_id", userId)
      .order("created_at", { ascending: false });
    setMyChapterFeedback((data as LineFeedback[]) ?? []);
  }

  async function _deleteLineFeedback(id: string) {
    if (!confirm("Delete this feedback? This cannot be undone.")) return;
    const { error } = await supabase.from("line_feedback").delete().eq("id", id);
    if (error) return setMsg(error.message);
    setFeedback((prev) => prev.filter((f) => f.id !== id));
    setMyChapterFeedback((prev) => prev.filter((f) => f.id !== id));
  }

  async function saveLineFeedbackEdit(id: string) {
    const text = editFeedbackDraft.trim();
    if (!text) return;
    const res = await fetch("/api/manuscript/feedback/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback_id: id,
        comment_text: text,
        manuscript_owner_id: manuscript?.owner_id ?? null,
      }),
    });
    const json = await res.json() as { ok?: boolean; comment_text?: string; word_count?: number; error?: string; consequence?: string };
    if (!res.ok) {
      if (json.consequence) {
        setFeedbackViolation({ message: json.error ?? "Feedback blocked due to a policy violation.", consequence: json.consequence });
      } else {
        setMsg(json.error ?? "Failed to save edit.");
      }
      return;
    }
    const updatedText = json.comment_text ?? text;
    const updatedWordCount = json.word_count ?? text.split(/\s+/).filter(Boolean).length;
    setFeedback((prev) => prev.map((f) => f.id === id ? { ...f, comment_text: updatedText, word_count: updatedWordCount } : f));
    setMyChapterFeedback((prev) => prev.map((f) => f.id === id ? { ...f, comment_text: updatedText, word_count: updatedWordCount } : f));
    setEditingFeedbackId(null);
    setEditFeedbackDraft("");
  }

  async function resolveFeedback(id: string, response: "agree" | "disagree") {
    const { error } = await supabase
      .from("line_feedback")
      .update({ resolved: true, author_response: response })
      .eq("id", id);
    if (error) return setMsg(error.message);
    setFeedback((prev) => prev.map((f) => f.id === id ? { ...f, resolved: true, author_response: response } : f));
    setSelectedFeedbackId(null);
  }

  async function replyToFeedback(f: LineFeedback) {
    const body = (replyDrafts[f.id] ?? "").trim();
    if (!body || !userId || !manuscript) return;
    if (adultReplyBlockedForFeedback(f.reader_id)) return;
    const res = await fetch("/api/manuscript/feedback/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: f.id, body }),
    });
    const json = (await res.json()) as { ok?: boolean; reply?: FeedbackReply; error?: string };
    if (!res.ok || json.error) return setMsg(json.error ?? "Failed to submit reply.");
    setReplyDrafts((p) => ({ ...p, [f.id]: "" }));
    const ta = replyTextareaRefs.current.get(f.id);
    if (ta) { ta.style.height = "auto"; }
    if (json.reply) setReplies((prev) => [...prev, json.reply!]);
  }

  /**
   * Range API helpers for absolute-positioned overlay markers (same approach as details/page.tsx).
   */
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

  function recomputeReaderMarkers(markerFeedback: LineFeedback[]) {
    const container = textContainerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newInfos: Record<string, ReaderMarkerInfo> = {};
    for (const f of markerFeedback) {
      if (!f.selection_excerpt) continue;
      const range = findExcerptRange(container, f.selection_excerpt);
      if (!range) continue;
      const clientRects = Array.from(range.getClientRects());
      if (!clientRects.length) continue;
      const lastRect = clientRects[clientRects.length - 1];
      newInfos[f.id] = {
        top: lastRect.top - containerRect.top - 4,
        left: lastRect.right - containerRect.left + 1,
        highlightRects: clientRects.map((r) => ({
          top: r.top - containerRect.top,
          left: r.left - containerRect.left,
          width: r.width,
          height: r.height,
        })),
      };
    }
    setReaderMarkerInfos(newInfos);
  }

  /**
   * Renders a paragraph (which may contain inline HTML like <strong>, <em>) with
   * only a dotted-underline span (for scroll targeting) — no inline button.
   * The actual speech-bubble buttons are rendered as absolute overlays via Range API.
   */
  function renderParagraphContent(
    html: string,
    markerItems: LineFeedback[],
  ): React.ReactNode {
    // Derive plain text (tag-stripped) for excerpt position searching
    const plainText = html.replace(/<[^>]+>/g, "");

    // Find non-overlapping positions of each excerpt in the plain text
    const found: { start: number; end: number; id: string }[] = [];
    for (const f of markerItems) {
      if (!f.selection_excerpt) continue;
      const idx = plainText.indexOf(f.selection_excerpt);
      if (idx === -1) continue;
      found.push({ start: idx, end: idx + f.selection_excerpt.length, id: f.id });
    }
    if (found.length === 0) return <span dangerouslySetInnerHTML={{ __html: html }} />;

    found.sort((a, b) => a.start - b.start);
    const clean: typeof found = [];
    let lastEnd = -1;
    for (const item of found) {
      if (item.start >= lastEnd) { clean.push(item); lastEnd = item.end; }
    }

    // Map a plain-text character offset → index in the HTML string
    function plainToHtmlIdx(target: number): number {
      let plain = 0;
      let i = 0;
      while (i < html.length) {
        if (html[i] === "<") {
          while (i < html.length && html[i] !== ">") i++;
          i++;
        } else {
          if (plain === target) return i;
          plain++;
          i++;
        }
      }
      return html.length;
    }

    const parts: React.ReactNode[] = [];
    let lastHtmlIdx = 0;

    for (const item of clean) {
      const startH = plainToHtmlIdx(item.start);
      const endH   = plainToHtmlIdx(item.end);

      // Text before this excerpt
      if (startH > lastHtmlIdx) {
        parts.push(
          <span key={`pre-${item.id}`} dangerouslySetInnerHTML={{ __html: html.slice(lastHtmlIdx, startH) }} />
        );
      }

      // The excerpt — id used for scroll targeting; underline + bubble rendered as absolute overlays
      const excerptHtml = html.slice(startH, endH);
      parts.push(
        <span key={item.id} id={`text-marker-${item.id}`} className="inline">
          <span dangerouslySetInnerHTML={{ __html: excerptHtml }} />
        </span>
      );

      lastHtmlIdx = endH;
    }

    // Remaining text after all excerpts
    if (lastHtmlIdx < html.length) {
      parts.push(
        <span key="tail" dangerouslySetInnerHTML={{ __html: html.slice(lastHtmlIdx) }} />
      );
    }

    return <>{parts}</>;
  }

  function friendlyDbError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("row-level security") || m.includes("permission denied")) {
      return "Permission blocked by database policy. Run the manuscript policy SQL fix, then retry.";
    }
    return message;
  }

  const isOwner = !!(manuscript && userId && manuscript.owner_id === userId);
  const hasGrant = grants.some((g) => g.reader_id === userId);
  const canRead = isOwner || hasGrant || isParentView;

  const canLeaveLineEdits = canRead && !isParentView && !isOwner;
  const displayCategories =
    manuscript?.categories && manuscript.categories.length > 0
      ? manuscript.categories
      : manuscript?.genre
      ? [manuscript.genre]
      : [];
  const youthAudienceCategory = hasYouthAudienceCategory(manuscript?.categories, manuscript?.genre);
  const adultReplyBlockedForFeedback = (readerId: string) =>
    youthAudienceCategory && myAge === "adult_18_plus" && ages[readerId] === "youth_13_17";
  const activeChapter = chapterId ? (chapters.find((c) => c.id === chapterId) ?? null) : null;
  const activeText = activeChapter?.content ?? "";
  const manuscriptParagraphs = useMemo(
    () =>
      activeText
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n/)
        .map((block) => sanitizeChapterHtml(block.trim()))
        .filter(Boolean),
    [activeText],
  );
  const _feedbackByParagraph = useMemo(() => {
    const map: Record<number, LineFeedback[]> = {};
    for (const f of feedback) {
      let targetIdx = 0;
      if (f.selection_excerpt) {
        const found = manuscriptParagraphs.findIndex((p) => p.includes(f.selection_excerpt));
        if (found >= 0) {
          targetIdx = found;
        } else if (f.start_offset != null) {
          let charCount = 0;
          for (let i = 0; i < manuscriptParagraphs.length; i++) {
            charCount += manuscriptParagraphs[i].length + 2;
            if (f.start_offset < charCount) { targetIdx = i; break; }
          }
        }
      }
      if (!map[targetIdx]) map[targetIdx] = [];
      map[targetIdx].push(f);
    }
    return map;
  }, [feedback, manuscriptParagraphs]);

  // Sum word counts across all chapters for the "About" section
  const displayedWordCount = chapters.length > 0
    ? chapters.reduce((sum, c) => sum + (c.content ?? "").trim().split(/\s+/).filter(Boolean).length, 0)
    : typeof manuscript?.word_count === "number" && manuscript.word_count > 0
    ? manuscript.word_count
    : 0;

  async function load() {
    if (!manuscriptId) {
      setMsg("Missing manuscript id.");
      setLoading(false);
      return;
    }

    // ── Parent view: fetch all data via server API (bypasses RLS on private manuscripts) ──
    if (fromParam === "parent") {
      if (!manuscript) setLoading(true);
      setMsg(null);
      setIsParentView(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        setUserId(auth.user?.id ?? null);
        const params = new URLSearchParams({ manuscript_id: manuscriptId });
        if (chapterId) params.set("chapter_id", chapterId);
        const res = await fetch(`/api/manage-youth/manuscript-workspace?${params.toString()}`);
        if (!res.ok) {
          const json = await res.json() as { error?: string };
          setMsg(json.error ?? "Failed to load manuscript.");
          setLoading(false);
          return;
        }
        type WsData = {
          manuscript: Manuscript & { parent_disabled?: boolean; parent_disabled_reason?: string | null };
          chapters: Chapter[];
          grants: { id: string; reader_id: string }[];
          pendingRequests: { id: string; requester_id: string; created_at: string; name: string; username: string | null }[];
          chapterFeedback: LineFeedback[];
          ownerAllFeedback: LineFeedback[];
          replies: FeedbackReply[];
          names: Record<string, string>;
          usernames: Record<string, string>;
          ages: Record<string, string>;
          parentDisabled: boolean;
          parentDisabledReason: string | null;
        };
        const data = await res.json() as WsData;
        setManuscript(data.manuscript);
        setChapters(data.chapters);
        setGrants(data.grants);
        setFeedback(data.chapterFeedback);
        setOwnerAllFeedback(data.ownerAllFeedback);
        setMyAllFeedback([]);
        setMyChapterFeedback([]);
        setReplies(data.replies);
        setNames(data.names);
        setUsernames(data.usernames);
        setAges(data.ages);
        setParentDisabled(data.parentDisabled);
        setParentDisabledReason(data.parentDisabledReason);
        setParentPendingRequests(data.pendingRequests);
      } catch {
        setMsg("Failed to load manuscript.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Only show the full loading screen on initial load; subsequent calls refresh silently
    if (!manuscript) setLoading(true);
    setMsg(null);
    let fRows: LineFeedback[] = [];

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);
      let viewerAgeCategory: string | null = null;
      let conductRow: { age_category?: string | null; manuscript_conduct_strikes?: number | null; manuscript_suspended_until?: string | null; manuscript_blacklisted?: boolean | null; manuscript_lifetime_suspension_count?: number | null } | null = null;
      if (uid) {
        const [{ data: meAcct }, { data: myProf }] = await Promise.all([
          supabase.from("accounts").select("age_category, manuscript_conduct_strikes, manuscript_suspended_until, manuscript_blacklisted, manuscript_lifetime_suspension_count, parent_report_restricted").eq("user_id", uid).maybeSingle(),
          supabase.from("public_profiles").select("pen_name, username").eq("user_id", uid).maybeSingle(),
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conductRow = meAcct as any;
        setManuscriptConduct({
          manuscript_conduct_strikes: conductRow?.manuscript_conduct_strikes ?? 0,
          manuscript_suspended_until: conductRow?.manuscript_suspended_until ?? null,
          manuscript_blacklisted: !!conductRow?.manuscript_blacklisted,
          manuscript_lifetime_suspension_count: conductRow?.manuscript_lifetime_suspension_count ?? 0,
        });
        viewerAgeCategory = conductRow?.age_category ?? null;
        setMyAge(viewerAgeCategory);
        const prof = myProf as { pen_name?: string | null; username?: string | null } | null;
        setMyDisplayName(prof?.pen_name?.trim() || (prof?.username ? `@${prof.username}` : "Reader"));
      }

      const { data: m, error: me } = await supabase
        .from("manuscripts")
        .select(
          "id, owner_id, title, genre, categories, age_rating, content, cover_url, description, requested_feedback, potential_triggers, copyright_info, visibility, word_count, chapter_count, created_at",
        )
        .eq("id", manuscriptId)
        .single();
      if (me) {
        setMsg(friendlyDbError(me.message));
        return;
      }
      const row = m as Manuscript;
      setManuscript(row);

      // Cross-age access rules (non-owner viewers only)
      let localParentView = false;
      if (uid !== row.owner_id) {
        // Check if viewer is a confirmed parent of the manuscript owner
        const { data: parentLink } = await supabase
          .from("youth_links")
          .select("id")
          .eq("parent_user_id", uid ?? "")
          .eq("child_user_id", row.owner_id)
          .eq("status", "active")
          .maybeSingle();
        localParentView = !!parentLink;
        setIsParentView(localParentView);

        const { data: ownerAcct } = await supabase
          .from("accounts")
          .select("age_category")
          .eq("user_id", row.owner_id)
          .maybeSingle();
        const ownerAgeCategory = (ownerAcct as { age_category?: string | null } | null)?.age_category ?? null;

        // Adults cannot view youth-owned manuscripts — EXCEPT confirmed parents
        if (!localParentView && ownerAgeCategory === "youth_13_17" && viewerAgeCategory !== "youth_13_17") {
          setMsg("This manuscript is not available.");
          setLoading(false);
          return;
        }

        // Youth can only access adult-owned manuscripts that are in MG or YA categories
        // Only restrict when the owner is confirmed adult — null means we couldn't fetch (RLS) and should not block
        if (viewerAgeCategory === "youth_13_17" && ownerAgeCategory === "adult_18_plus") {
          const manuscriptCategories = (row.categories && row.categories.length > 0
            ? row.categories
            : row.genre ? [row.genre] : []) as string[];
          const YOUTH_ALLOWED = ["YA Fantasy","YA Contemporary","YA Romance","YA Dystopian","MG Fantasy","MG Adventure"];
          const hasYouthCategory = manuscriptCategories.some((c) => YOUTH_ALLOWED.includes(c));
          if (!hasYouthCategory) {
            setMsg("This manuscript is not available for youth accounts.");
            setLoading(false);
            return;
          }
        }
      }

      // Block check — if either party has blocked the other, deny access for non-owners
      if (uid && uid !== row.owner_id) {
        const { data: blockRow } = await supabase
          .from("profile_friend_requests")
          .select("status")
          .or(
            `and(sender_id.eq.${uid},receiver_id.eq.${row.owner_id}),and(sender_id.eq.${row.owner_id},receiver_id.eq.${uid})`
          )
          .eq("status", "blocked")
          .maybeSingle();
        if (blockRow) {
          setMsg("This manuscript is not available.");
          setLoading(false);
          return;
        }
      }

      // Set parent-disabled state
      const msRow = row as Manuscript & { parent_disabled?: boolean; parent_disabled_reason?: string | null };
      setParentDisabled(!!msRow.parent_disabled);
      setParentDisabledReason(msRow.parent_disabled_reason ?? null);

      const { data: g } = await supabase.from("manuscript_access_grants").select("id, reader_id").eq("manuscript_id", manuscriptId);
      const gRows = (g as AccessGrant[]) ?? [];
      setGrants(gRows);
      const ownerView = uid === row.owner_id;
      const viewerCanRead = ownerView || localParentView || gRows.some((x) => x.reader_id === uid);

      // If user is a beta reader (not owner, not parent) and is restricted, block access
      if (uid && !ownerView && !localParentView && gRows.some((x) => x.reader_id === uid)) {
        // Manuscript conduct restriction
        const isMsBlocked =
          conductRow?.manuscript_blacklisted ||
          (conductRow?.manuscript_suspended_until &&
            new Date(conductRow.manuscript_suspended_until).getTime() > Date.now());
        // Parent report restriction
        const isParentReportBlocked = !!(conductRow as (typeof conductRow & { parent_report_restricted?: boolean | null }) | null)?.parent_report_restricted;
        if (isMsBlocked || isParentReportBlocked) {
          router.replace("/manuscripts");
          return;
        }
      }

      if (uid && !viewerCanRead) {
        const { data: req } = await supabase
          .from("manuscript_access_requests")
          .select("id, status")
          .eq("manuscript_id", manuscriptId)
          .eq("requester_id", uid)
          .maybeSingle();
        if (req) {
          const reqRow = req as { id: string; status: string };
          setMyRequestStatus(reqRow.status);
          // Only mark as "sent" for statuses that show a pending message
          if (reqRow.status !== "left") setRequestSent(true);
        }
      }

      const ownerOrParentView = ownerView || localParentView;

      if (viewerCanRead || ownerView) {
        const chapterQuery = supabase
          .from("manuscript_chapters")
          .select("id, title, chapter_order, content, is_private, chapter_type")
          .eq("manuscript_id", manuscriptId)
          .order("chapter_order", { ascending: true });
        if (!ownerOrParentView && !gRows.some((x) => x.reader_id === uid)) {
          chapterQuery.eq("is_private", false);
        }
        const { data: c } = await chapterQuery;
        const cRows = (c as Chapter[]) ?? [];
        setChapters(cRows);
      } else {
        setChapters([]);
      }

      if (viewerCanRead || ownerView) {
        if (ownerOrParentView) {
          // Owner: fetch all feedback for this chapter so the sidebar shows every reader's notes
          const q = supabase
            .from("line_feedback")
            .select(
              "id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response",
            )
            .eq("manuscript_id", manuscriptId)
            .order("created_at", { ascending: false });
          if (chapterId) q.eq("chapter_id", chapterId);
          else q.is("chapter_id", null);
          const { data: f, error: fError } = await q;
          if (fError) { setMsg(`Feedback load error: ${fError.message}. Run supabase/run_in_sql_editor.sql in your Supabase SQL editor.`); setLoading(false); return; }
          fRows = (f as LineFeedback[]) ?? [];
          setFeedback(fRows);
          setMyAllFeedback([]);
          setMyChapterFeedback([]);

          // Owner: also fetch ALL feedback across every chapter for the overview log
          const { data: allF } = await supabase
            .from("line_feedback")
            .select("id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response")
            .eq("manuscript_id", manuscriptId)
            .order("created_at", { ascending: false });
          setOwnerAllFeedback((allF as LineFeedback[]) ?? []);

          const allIds = fRows.map((x) => x.id);
          if (allIds.length) {
            const { data: rep } = await supabase.from("line_feedback_replies").select("id, feedback_id, replier_id, body, created_at").in("feedback_id", allIds);
            setReplies((rep as FeedbackReply[]) ?? []);
          } else {
            setReplies([]);
          }
        } else if (uid) {
          // Load chapter completions for this reader
          const { data: completions } = await supabase
            .from("chapter_read_completions")
            .select("chapter_id")
            .eq("manuscript_id", manuscriptId)
            .eq("reader_id", uid);
          setCompletedChapterIds(new Set(
            ((completions as { chapter_id: string }[] | null) ?? []).map((c) => c.chapter_id)
          ));

          // Non-owner reader: only fetch their own feedback — never load other readers' data
          const { data: myF, error: fError } = await supabase
            .from("line_feedback")
            .select("id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response")
            .eq("manuscript_id", manuscriptId)
            .eq("reader_id", uid)
            .order("created_at", { ascending: false });
          if (fError) { setMsg(`Feedback load error: ${fError.message}.`); setLoading(false); return; }
          const myFRows = (myF as LineFeedback[]) ?? [];
          fRows = myFRows;
          setFeedback([]);
          setMyAllFeedback(myFRows);
          const myChapterRows = chapterId
            ? myFRows.filter((f) => f.chapter_id === chapterId)
            : myFRows.filter((f) => f.chapter_id === null);
          setMyChapterFeedback(myChapterRows);

          if (myFRows.length) {
            const { data: rep } = await supabase.from("line_feedback_replies").select("id, feedback_id, replier_id, body, created_at").in("feedback_id", myFRows.map((x) => x.id));
            setReplies((rep as FeedbackReply[]) ?? []);
          } else {
            setReplies([]);
          }
        }
      } else if (uid) {
        // No grant and not the owner, but still fetch the user's own past feedback
        // so they can always see what they personally wrote (DB RLS already enforces this).
        setFeedback([]);
        const { data: myF } = await supabase
          .from("line_feedback")
          .select("id, reader_id, selection_excerpt, comment_text, chapter_id, start_offset, end_offset, word_count, coins_awarded, created_at, resolved, author_response")
          .eq("manuscript_id", manuscriptId)
          .eq("reader_id", uid)
          .order("created_at", { ascending: false });
        const myFRows = (myF as LineFeedback[]) ?? [];
        fRows = myFRows;
        setMyAllFeedback(myFRows);
        const myChapterRows = chapterId
          ? myFRows.filter((f) => f.chapter_id === chapterId)
          : myFRows.filter((f) => f.chapter_id === null);
        setMyChapterFeedback(myChapterRows);
        if (myFRows.length) {
          const { data: rep } = await supabase.from("line_feedback_replies").select("id, feedback_id, replier_id, body, created_at").in("feedback_id", myFRows.map((x) => x.id));
          setReplies((rep as FeedbackReply[]) ?? []);
        } else {
          setReplies([]);
        }
      } else {
        setFeedback([]);
        setMyAllFeedback([]);
        setReplies([]);
      }

      const idSet = Array.from(new Set([row.owner_id, ...gRows.map((x) => x.reader_id), ...fRows.map((x) => x.reader_id)]));
      if (idSet.length) {
        const [{ data: p }, { data: a }] = await Promise.all([
          supabase.from("public_profiles").select("user_id, pen_name, username").in("user_id", idSet),
          supabase.from("accounts").select("user_id, age_category").in("user_id", idSet),
        ]);
        const n: Record<string, string> = {};
        const u: Record<string, string> = {};
        (p ?? []).forEach((r: { user_id: string; pen_name: string | null; username: string | null }) => {
          n[r.user_id] = r.pen_name || (r.username ? `@${r.username}` : "Writer");
          if (r.username) u[r.user_id] = r.username;
        });
        setNames(n);
        setUsernames(u);
        const ag: Record<string, string> = {};
        (a ?? []).forEach((r: { user_id: string; age_category: string | null }) => {
          ag[r.user_id] = r.age_category ?? "";
        });
        setAges(ag);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load manuscript.";
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscriptId, chapterId]);

  // Measure text-marker positions so feedback cards align with their text
  useEffect(() => {
    if (!activeChapter) { setMarkerTops({}); setChapterHeight(0); return; }
    const section = chapterSectionRef.current;
    if (!section) return;
    const sectionTop = section.getBoundingClientRect().top;
    const tops: Record<string, number> = {};
    const items = (isOwner || isParentView ? feedback : myChapterFeedback).filter((f) => !f.resolved);
    for (const f of items) {
      const el = document.getElementById(`text-marker-${f.id}`);
      if (el) tops[f.id] = el.getBoundingClientRect().top - sectionTop;
    }
    setMarkerTops(tops);
    setChapterHeight(section.offsetHeight);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapter?.id, myChapterFeedback, feedback, isOwner]);

  // Recompute Range-API absolute marker positions when chapter or feedback changes
  useEffect(() => {
    const markerFeedback = (!isOwner ? myChapterFeedback : feedback).filter((f) => !f.resolved);
    const id = requestAnimationFrame(() => recomputeReaderMarkers(markerFeedback));
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapter?.id, myChapterFeedback, feedback, isOwner]);

  // Recompute on resize (e.g. window resize or font load)
  useEffect(() => {
    const container = textContainerRef.current;
    if (!container) return;
    const markerFeedback = (!isOwner ? myChapterFeedback : feedback).filter((f) => !f.resolved);
    const ro = new ResizeObserver(() => recomputeReaderMarkers(markerFeedback));
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapter?.id, myChapterFeedback, feedback, isOwner]);

  // When a feedback card is selected, scroll the page to show the text marker
  // then align the sidebar card beside it
  useEffect(() => {
    if (!selectedFeedbackId) return;
    const info = readerMarkerInfos[selectedFeedbackId];
    const container = textContainerRef.current;
    if (info && container) {
      const markerDocY = container.getBoundingClientRect().top + window.scrollY + info.top;
      const targetScrollY = markerDocY - window.innerHeight * 0.35;
      window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "smooth" });
    } else {
      const markerEl = document.getElementById(`text-marker-${selectedFeedbackId}`);
      if (markerEl) {
        const rect = markerEl.getBoundingClientRect();
        const targetScrollY = window.scrollY + rect.top - window.innerHeight * 0.35;
        window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "smooth" });
      }
    }
    // After page scroll animation, align sidebar card beside the marker
    setTimeout(() => {
      const cardEl = document.getElementById(`feedback-item-${selectedFeedbackId}`);
      const container = asideRef.current;
      if (cardEl && container) {
        // Marker lands at ~35% from viewport top; aside sticky top = navH + 12
        const markerViewportY = window.innerHeight * 0.35;
        const desiredRelativeTop = Math.max(0, markerViewportY - navH - 12);
        container.scrollTop = cardEl.offsetTop - desiredRelativeTop;
      }
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeedbackId]);

  // Auto-dismiss coin toast after 5 seconds
  useEffect(() => {
    if (!coinToast) return;
    const t = setTimeout(() => setCoinToast(null), 5000);
    return () => clearTimeout(t);
  }, [coinToast]);

  // Realtime + polling — live feedback replies
  useEffect(() => {
    if (!userId || !manuscriptId) return;

    async function refreshReplies() {
      const allIds = [...feedback.map((f) => f.id), ...myAllFeedback.map((f) => f.id)];
      const ids = Array.from(new Set(allIds));
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("line_feedback_replies")
        .select("id, feedback_id, replier_id, body, created_at")
        .in("feedback_id", ids);
      if (data) setReplies(data as FeedbackReply[]);
    }

    if (replyChannelRef.current) void supabase.removeChannel(replyChannelRef.current);
    const ch = supabase
      .channel(`feedback-replies-${manuscriptId}-reader`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "line_feedback_replies" }, (payload: { new: Record<string, unknown> }) => {
        const r = payload.new as FeedbackReply;
        setReplies((prev) => prev.some((p) => p.id === r.id) ? prev : [...prev, r]);
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
  }, [userId, manuscriptId, supabase, feedback.length, myAllFeedback.length]);

  // Click anywhere outside the feedback column (and not on a marker bubble) to deselect
  useEffect(() => {
    if (!selectedFeedbackId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (asideRef.current?.contains(target)) return;
      if (target.closest("[data-feedback-marker]")) return;
      setSelectedFeedbackId(null);
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectedFeedbackId]);

  // Measure navbar height so the fixed chapter reader sits flush below it.
  // useLayoutEffect fires synchronously before the browser paints, so navH is
  // set before the first frame — the fixed panel never flashes at top:0.
  useLayoutEffect(() => {
    const nav = document.querySelector(".navWrap") as HTMLElement | null;
    if (!nav) return;
    const update = () => setNavH(nav.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  // (body scroll lock removed — chapter now uses normal page scroll)

  async function _reply(f: LineFeedback) {
    const body = (replyDrafts[f.id] ?? "").trim();
    if (!body || !userId || !manuscript) return;
    if (adultReplyBlockedForFeedback(f.reader_id)) {
      return setMsg("Adults cannot reply to youth feedback on YA/MG manuscripts.");
    }
    const res = await fetch("/api/manuscript/feedback/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: f.id, body }),
    });
    const json = (await res.json()) as { ok?: boolean; reply?: FeedbackReply; error?: string };
    if (!res.ok || json.error) return setMsg(json.error ?? "Failed to submit reply.");
    setReplyDrafts((p) => ({ ...p, [f.id]: "" }));
    if (json.reply) setReplies((prev) => [...prev, json.reply!]);
  }

  if (loading) return <main className="mx-auto max-w-[1600px] px-6 py-12 text-neutral-100">Loading...</main>;
  if (!manuscript) return <main className="mx-auto max-w-[1600px] px-6 py-12 text-neutral-100">Not available</main>;

  const shownWordCount = displayedWordCount > 0
    ? displayedWordCount
    : (typeof manuscript.word_count === "number" ? manuscript.word_count : 0);
  const shownChapterCount = chapters.length > 0
    ? chapters.length
    : (typeof manuscript.chapter_count === "number" ? manuscript.chapter_count : 0);

  const detailItems = [
    {
      label: "Author",
      value: usernames[manuscript.owner_id] ? (
        <Link
          href={`/u/${usernames[manuscript.owner_id]}`}
          className="text-[rgba(210,210,210,0.9)] hover:underline"
        >
          {names[manuscript.owner_id] || "Author"}
        </Link>
      ) : (names[manuscript.owner_id] || "Author"),
    },
    { label: "Status", value: manuscript.visibility === "public" ? "Public" : "Private" },
    { label: "Age rating", value: manuscript.age_rating === "teen_safe" ? "Teen-safe" : "Adult" },
    { label: "Chapters", value: shownChapterCount > 0 ? `${shownChapterCount} chapter${shownChapterCount !== 1 ? "s" : ""}` : "—" },
    { label: "Word count", value: shownWordCount > 0 ? `${shownWordCount.toLocaleString()} words` : "—" },
    { label: "Uploaded", value: manuscript.created_at ? new Date(manuscript.created_at).toLocaleString() : "—" },
    {
      label: "Genre / categories",
      value: displayCategories.length ? displayCategories.join(", ") : "Uncategorized",
    },
    ...(manuscript.description ? [{ label: "Description", value: manuscript.description, multiline: true }] : []),
  ];
  if (activeChapter) {
    detailItems.push({
      label: "Viewing",
      value: `Chapter ${activeChapter.chapter_order}: ${activeChapter.title}`,
    });
  }

  return (
    <main className={`mx-auto px-6 py-12 text-neutral-100 ${chapterId ? (isOwner ? "max-w-7xl" : "max-w-[1600px]") : "max-w-6xl"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.16)] px-3 text-sm font-medium text-white hover:border-[rgba(120,120,120,0.9)] hover:bg-[rgba(120,120,120,0.24)]"
        >
          {backLabel}
        </Link>
        {hasGrant && !isOwner && (
          <button
            onClick={() => void leaveProject()}
            disabled={leaving}
            className="inline-flex h-9 items-center justify-center rounded-full border border-neutral-600/60 bg-neutral-800/20 px-4 text-sm text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800/35 disabled:opacity-50 transition"
          >
            {leaving ? "Leaving…" : "Leave project"}
          </button>
        )}
      </div>
      {msg ? (
        <div className="mt-4 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] p-3 text-sm text-neutral-100">
          {msg}
        </div>
      ) : null}

      {/* Parent view banner */}
      {isParentView && (
        <div className="mb-4 rounded-xl border border-violet-700/50 bg-violet-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-300">Parent View — Read Only</p>
            <p className="text-xs text-violet-400/80 mt-0.5">You are viewing your child&apos;s manuscript workspace. All actions are disabled.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {parentDisabled ? (
              <button
                onClick={() => void handleParentReinstate()}
                disabled={parentDisableSubmitting}
                className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50 transition"
              >
                {parentDisableSubmitting ? "Reinstating…" : "Reinstate Manuscript"}
              </button>
            ) : (
              <button
                onClick={() => { setParentDisableModal(true); setParentActionMsg(null); }}
                className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-950/50 transition"
              >
                Disable Manuscript
              </button>
            )}
          </div>
        </div>
      )}

      {parentDisabled && isParentView && (
        <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
          This manuscript is currently disabled. Reason: {parentDisabledReason ?? "Not specified"}
        </div>
      )}

      {parentDisabled && isOwner && !isParentView && (
        <div className="mb-4 rounded-xl border border-amber-700/50 bg-amber-950/20 px-4 py-4">
          <p className="text-sm font-semibold text-amber-300">Manuscript Disabled by Parent</p>
          <p className="mt-1 text-xs text-amber-400/80">
            Your parent account has temporarily disabled this manuscript.{parentDisabledReason ? ` Reason: ${parentDisabledReason}.` : ""} It can only be reinstated by your parent account.
          </p>
        </div>
      )}

      {parentActionMsg && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${parentActionMsg.ok ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300" : "border-red-700/50 bg-red-950/20 text-red-300"}`}>
          {parentActionMsg.text}
        </div>
      )}

      {/* Copy attempt warning modal */}
      {copyWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="relative w-full max-w-md rounded-2xl border border-red-800/60 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-semibold text-red-400">Copying is disabled</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  Copying content from another writer&apos;s manuscript is a violation of Lethal Bloom Studio&apos;s community guidelines and may constitute copyright infringement.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  This action has been flagged and reported to our moderation team. Repeated violations may result in account suspension or permanent removal from the platform.
                </p>
                {copyConsequence && (
                  <div className={`mt-4 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                    copyConsequence.consequence === "blacklisted"
                      ? "border-red-700/60 bg-red-950/40 text-red-300"
                      : copyConsequence.consequence === "suspended_3_days"
                      ? "border-orange-700/60 bg-orange-950/40 text-orange-300"
                      : "border-yellow-700/60 bg-yellow-950/40 text-yellow-300"
                  }`}>
                    {copyConsequence.message}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setCopyWarning(false);
                if (copyConsequence?.consequence === "suspended_3_days" || copyConsequence?.consequence === "blacklisted") {
                  router.replace("/manuscripts");
                }
              }}
              className="mt-5 w-full rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition"
            >
              I understand and acknowledge this violation
            </button>
          </div>
        </div>
      )}

      {/* Feedback violation modal */}
      {feedbackViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="relative w-full max-w-md rounded-2xl border border-red-800/60 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-semibold text-red-400">Feedback blocked</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  Your feedback contained content that violates Lethal Bloom Studio&apos;s community guidelines. Feedback must remain writing-focused and on-platform.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  This violation has been flagged and reported to our moderation team. Repeated violations may result in account suspension or permanent removal from the platform.
                </p>
                <div className={`mt-4 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  feedbackViolation.consequence === "blacklisted"
                    ? "border-red-700/60 bg-red-950/40 text-red-300"
                    : feedbackViolation.consequence === "suspended_3_days"
                    ? "border-orange-700/60 bg-orange-950/40 text-orange-300"
                    : "border-yellow-700/60 bg-yellow-950/40 text-yellow-300"
                }`}>
                  {feedbackViolation.message}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const consequence = feedbackViolation?.consequence;
                setFeedbackViolation(null);
                if (consequence === "suspended_3_days" || consequence === "blacklisted") {
                  router.replace("/manuscripts");
                }
              }}
              className="mt-5 w-full rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition"
            >
              I understand and acknowledge this violation
            </button>
          </div>
        </div>
      )}

      {/* Parent — disable manuscript modal */}
      {parentDisableModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Disable Manuscript?</h2>
            <p className="text-sm text-neutral-400 mb-4">This will unpublish the manuscript and block all access until you reinstate it. Your child will be notified.</p>
            <div className="space-y-2 mb-5">
              {PARENT_DISABLE_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setParentDisableReason(r)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${parentDisableReason === r ? "border-amber-600/70 bg-amber-950/30 text-amber-200" : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.5)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setParentDisableModal(false); setParentDisableReason(""); }} className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-400 hover:text-white transition">Cancel</button>
              <button
                onClick={() => void handleParentDisable()}
                disabled={!parentDisableReason || parentDisableSubmitting}
                className="flex-1 rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition"
              >
                {parentDisableSubmitting ? "Disabling…" : "Confirm Disable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent — report user modal */}
      {parentReportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[rgba(120,120,120,0.45)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-neutral-100 mb-1">Report {parentReportModal.name}</h2>
            <p className="text-sm text-neutral-400 mb-4">Select the reason for your report. An admin will review it. The user&apos;s access will be temporarily restricted while the report is under review.</p>
            <div className="space-y-2 mb-5">
              {PARENT_REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setParentReportReason(r)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${parentReportReason === r ? "border-red-600/70 bg-red-950/30 text-red-200" : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.06)] text-neutral-300 hover:border-[rgba(120,120,120,0.5)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setParentReportModal(null); setParentReportReason(""); }} className="flex-1 rounded-lg border border-[rgba(120,120,120,0.4)] px-4 py-2 text-sm text-neutral-400 hover:text-white transition">Cancel</button>
              <button
                onClick={() => void handleParentReport()}
                disabled={!parentReportReason || parentReportSubmitting}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition"
              >
                {parentReportSubmitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canRead ? (
        <ManuscriptLayout
          title={manuscript.title}
          coverUrl={manuscript.cover_url}
          categories={displayCategories}
          chapters={[]}
          emptyChaptersText="Access required to view chapters."
          details={detailItems}
          description={manuscript.description}
          rightHeader={
            <div className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5">
              {myRequestStatus === "left" ? (
                <>
                  <p className="text-sm font-medium text-neutral-200">You left this project.</p>
                  <p className="mt-1 text-xs text-neutral-400">You can request to rejoin — the author will be able to approve your access again.</p>
                  <button
                    onClick={() => void requestAccess()}
                    disabled={requesting}
                    className="mt-4 rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.32)] disabled:opacity-50 transition"
                  >
                    {requesting ? "Sending…" : "Request to Rejoin"}
                  </button>
                </>
              ) : requestSent ? (
                <>
                  <p className="text-sm font-medium text-neutral-200">Access request pending.</p>
                  <p className="mt-1 text-xs text-neutral-400">Your request has been sent. Chapters will unlock once the author approves it.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-neutral-200">This manuscript is private.</p>
                  <p className="mt-1 text-xs text-neutral-400">Request access from the author to read the chapters.</p>
                  {myAge === "youth_13_17" && !youthAudienceCategory ? (
                    <p className="mt-2 text-xs text-neutral-400">Youth profiles can only view YA/MG manuscripts.</p>
                  ) : null}
                  <button
                    onClick={() => void requestAccess()}
                    disabled={requesting || !userId}
                    className="mt-4 rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgba(120,120,120,0.32)] disabled:opacity-50 transition"
                  >
                    {requesting ? "Sending…" : !userId ? "Sign in to request access" : "Request Access"}
                  </button>
                </>
              )}
            </div>
          }
        >
          <></>
        </ManuscriptLayout>
      ) : (
        <>
        <ManuscriptLayout
          title={manuscript.title}
          coverUrl={manuscript.cover_url}
          categories={displayCategories}
          chapters={chapters}
          activeChapterId={chapterId}
          onSelectChapter={(id) => setChapterId(id)}
          details={[]}
          description={null}
          hideDefaultSections={true}
          onCoverClick={activeChapter ? () => setChapterId(null) : undefined}
          compactSidebar={!!chapterId}
          completedChapterIds={completedChapterIds}
        >
          {!activeChapter && (
            <section className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.9)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
              <h2 className="text-sm font-semibold text-neutral-100">About this Manuscript</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                {detailItems.map((d, idx) => (
                  <div
                    key={`${d.label}-${idx}`}
                    className={`rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2 ${d.multiline ? "w-full" : "min-w-[160px] flex-1"}`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-neutral-400">{d.label}</p>
                    <div className={`mt-1 text-sm text-neutral-100 ${d.multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>
                      {d.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {/* Brainstorm Notes — visible to any logged-in user in overview mode */}
          {!activeChapter && userId && manuscriptId && (
            <section className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.9)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
              <NotesPanel defaultManuscriptId={manuscriptId} />
            </section>
          )}

          {!activeChapter && (isOwner || isParentView) && (
            <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
                  Beta Reading Feedback
                  {ownerAllFeedback.length > 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(120,120,120,0.2)] px-2 py-0.5 text-[10px] font-normal text-[rgba(210,210,210,0.8)]">{ownerAllFeedback.length}</span>
                  )}
                </h2>
                <div className="flex gap-1.5">
                  {(["unresolved", "resolved", "all"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOwnerFeedbackFilter(opt)}
                      className={`rounded-lg border px-3 py-1 text-[10px] font-medium transition ${
                        ownerFeedbackFilter === opt
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
                const ownerFiltered = ownerAllFeedback.filter((f) =>
                  ownerFeedbackFilter === "all" ? true :
                  ownerFeedbackFilter === "resolved" ? (f.resolved || !!f.author_response) :
                  !f.resolved && !f.author_response
                );
                const selectedOwnerFeedback = selectedOwnerFeedbackId ? ownerAllFeedback.find((f) => f.id === selectedOwnerFeedbackId) ?? null : null;
                return ownerFiltered.length === 0 ? (
                <p className="text-sm text-neutral-500 italic">No {ownerFeedbackFilter !== "all" ? ownerFeedbackFilter : ""} feedback received yet.</p>
              ) : (
                <div className="flex gap-4 items-start">
                  {/* Compact list */}
                  <div className={`${selectedOwnerFeedback ? "w-2/5 shrink-0" : "w-full"} max-h-[560px] overflow-y-auto pr-1 space-y-2`}>
                    {ownerFiltered.map((f) => {
                      const chapterObj = f.chapter_id ? chapters.find((c) => c.id === f.chapter_id) : null;
                      const chapterLabel = chapterObj ? `Ch. ${chapterObj.chapter_order}: ${chapterObj.title || "Untitled"}` : null;
                      const isSelected = selectedOwnerFeedbackId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setSelectedOwnerFeedbackId(isSelected ? null : f.id)}
                          className={`w-full text-left rounded-lg border p-3 transition ${
                            isSelected
                              ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.18)]"
                              : f.resolved
                              ? "border-neutral-700/50 opacity-60 hover:opacity-80 hover:bg-[rgba(120,120,120,0.06)]"
                              : "border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] hover:bg-[rgba(120,120,120,0.13)] hover:border-[rgba(120,120,120,0.5)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <p className="text-xs font-medium text-[rgba(210,210,210,0.85)]">{names[f.reader_id] || "Reader"}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                              {chapterLabel && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{chapterLabel}</span>}
                              <span>{new Date(f.created_at).toLocaleDateString()}</span>
                              {f.resolved && <span className="text-neutral-600">resolved</span>}
                            </div>
                          </div>
                          {f.selection_excerpt && (
                            <p className="text-[11px] italic text-neutral-500 line-clamp-1">&ldquo;{f.selection_excerpt}&rdquo;</p>
                          )}
                          <p className="mt-0.5 text-xs text-neutral-300 line-clamp-2">{f.comment_text}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Detail panel */}
                  {selectedOwnerFeedback && (() => {
                    const f = selectedOwnerFeedback;
                    const feedbackReplies = replies.filter((r) => r.feedback_id === f.id);
                    const chapterObj = f.chapter_id ? chapters.find((c) => c.id === f.chapter_id) : null;
                    const chapterLabel = chapterObj ? `Ch. ${chapterObj.chapter_order}: ${chapterObj.title || "Untitled"}` : null;
                    return (
                      <div className="flex-1 min-w-0 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.1)] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-[rgba(210,210,210,0.9)]">{names[f.reader_id] || "Reader"}</p>
                            {isParentView && f.reader_id !== manuscript?.owner_id && (
                              <button
                                onClick={() => setParentReportModal({ userId: f.reader_id, name: names[f.reader_id] || "this user" })}
                                className="rounded-lg border border-red-800/40 bg-red-950/20 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-950/40 transition"
                              >
                                Report
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {chapterLabel && (
                              <button
                                type="button"
                                onClick={() => setChapterId(f.chapter_id)}
                                className="rounded-lg bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700 transition"
                              >
                                {chapterLabel}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedOwnerFeedbackId(null)}
                              className="text-neutral-500 hover:text-white transition text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {f.selection_excerpt && (
                          <blockquote className="border-l-2 border-[rgba(120,120,120,0.5)] pl-3 text-xs italic text-neutral-400">
                            &ldquo;{f.selection_excerpt}&rdquo;
                          </blockquote>
                        )}
                        <p className="text-sm leading-relaxed text-neutral-200">{f.comment_text}</p>
                        {f.author_response ? (
                          <p className={`text-[11px] font-medium ${f.author_response === "agree" ? "text-emerald-400" : "text-rose-400"}`}>
                            {f.author_response === "agree" ? "✓ You agreed with this feedback" : "✗ You disagreed with this feedback"}
                          </p>
                        ) : isOwner && !f.resolved && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => void resolveFeedback(f.id, "agree")}
                              className="flex-1 rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-950/50 transition"
                            >
                              ✓ Agree
                            </button>
                            <button
                              onClick={() => void resolveFeedback(f.id, "disagree")}
                              className="flex-1 rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/50 transition"
                            >
                              ✗ Disagree
                            </button>
                          </div>
                        )}
                        {feedbackReplies.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-neutral-500">Replies</p>
                            {feedbackReplies.map((r) => (
                              <div key={r.id} className={`rounded-lg px-2.5 py-2 text-[11px] ${r.replier_id === manuscript?.owner_id ? "bg-[rgba(120,120,120,0.12)]" : "bg-[rgba(255,255,255,0.04)]"}`}>
                                <span className="font-semibold text-[rgba(210,210,210,0.7)] mr-1">{names[r.replier_id] || "User"}:</span>
                                <span className="text-neutral-300">{r.body}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
              })()}
            </section>
          )}
          {!activeChapter && myAllFeedback.length > 0 && (
            <section className="rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-5 shadow-[0_20px_46px_rgba(0,0,0,0.35)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
                  Your Feedback
                  <span className="ml-2 rounded-full bg-[rgba(120,120,120,0.2)] px-2 py-0.5 text-[10px] font-normal text-[rgba(210,210,210,0.8)]">{myAllFeedback.length}</span>
                </h2>
                <div className="flex gap-1.5">
                  {(["unresolved", "resolved", "all"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFeedbackFilter(f)}
                      className={`rounded-lg border px-3 py-1 text-[10px] font-medium transition ${
                        feedbackFilter === f
                          ? "border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.22)] text-neutral-100"
                          : "border-[rgba(120,120,120,0.35)] bg-[rgba(120,120,120,0.07)] text-neutral-400 hover:bg-[rgba(120,120,120,0.14)] hover:text-neutral-200"
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[480px] overflow-y-auto pr-1 space-y-4">
                {myAllFeedback.filter((f) =>
                  feedbackFilter === "all" ? true :
                  feedbackFilter === "resolved" ? (f.resolved || !!f.author_response) :
                  !f.resolved && !f.author_response
                ).map((f) => {
                  const chapterObj = f.chapter_id ? chapters.find((c) => c.id === f.chapter_id) : null;
                  const chapterLabel = chapterObj ? `Ch. ${chapterObj.chapter_order}: ${chapterObj.title || "Untitled"}` : null;
                  const fReplies = replies.filter((r) => r.feedback_id === f.id);
                  const isExpanded = expandedFeedbackIds.has(f.id);
                  const canReply = !f.resolved && !f.author_response;
                  const toggleExpand = () => setExpandedFeedbackIds((prev) => {
                    const n = new Set(prev);
                    if (n.has(f.id)) { n.delete(f.id); } else { n.add(f.id); }
                    return n;
                  });
                  return (
                    <div key={f.id} className="rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <p className="text-xs font-medium text-[rgba(210,210,210,0.85)]">You</p>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                          {chapterLabel && (
                            <button
                              type="button"
                              onClick={() => setChapterId(f.chapter_id)}
                              className="rounded-lg bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700 transition"
                            >
                              {chapterLabel}
                            </button>
                          )}
                          <span>{new Date(f.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {f.selection_excerpt && (
                        <blockquote className="mt-2 border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-xs italic text-neutral-400">
                          &ldquo;{f.selection_excerpt}&rdquo;
                        </blockquote>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-200">{f.comment_text}</p>
                      {(f.resolved || !!f.author_response) && (
                        <p className="mt-2 text-[11px] font-medium text-neutral-400">✓ Resolved</p>
                      )}
                      {/* Expand replies */}
                      {(fReplies.length > 0 || canReply) && (
                        <button
                          type="button"
                          onClick={toggleExpand}
                          className="mt-2 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-3 py-1 text-[10px] text-neutral-300 hover:bg-[rgba(120,120,120,0.2)] transition"
                        >
                          {isExpanded ? "Hide conversation" : fReplies.length > 0 ? `View ${fReplies.length} ${fReplies.length === 1 ? "reply" : "replies"}` : "Reply"}
                        </button>
                      )}

                      {/* Expanded conversation thread */}
                      {isExpanded && (
                        <div className="mt-2">
                          <div className="rounded-lg bg-neutral-950/50 p-2 space-y-1.5">
                            {/* Reader's original comment — RIGHT (it's theirs) */}
                            <div className="flex justify-end">
                              <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-tr-sm bg-white px-3 py-2">
                                <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">You</p>
                                <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                              </div>
                            </div>
                            {f.author_response && (
                              <p className={`text-[10px] font-medium text-center ${f.author_response === "agree" ? "text-emerald-400" : "text-rose-400"}`}>
                                {f.author_response === "agree" ? "✓ Author agreed — conversation closed" : "✗ Author disagreed — conversation closed"}
                              </p>
                            )}
                            {/* Reply bubbles */}
                            {fReplies.map((r) => {
                              const isMe = r.replier_id === userId;
                              return (
                                <div key={r.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 ${isMe ? "rounded-tr-sm bg-white" : "rounded-tl-sm bg-neutral-100"}`}>
                                    <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">
                                      {names[r.replier_id] || (r.replier_id === manuscript?.owner_id ? "Author" : "You")}
                                    </p>
                                    <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{r.body}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Reply box — only if not resolved */}
                          {canReply && (
                            <div className="mt-2 flex gap-1.5">
                              <textarea
                                rows={1}
                                placeholder="Reply… (Enter to send)"
                                value={replyDrafts[f.id] ?? ""}
                                ref={(el) => { if (el) replyTextareaRefs.current.set(f.id, el); else replyTextareaRefs.current.delete(f.id); }}
                                onChange={(e) => setReplyDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 96) + "px"; }}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void replyToFeedback(f); } }}
                                className="flex-1 resize-none overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.5)] focus:outline-none"
                              />
                              <button
                                onClick={() => void replyToFeedback(f)}
                                disabled={!(replyDrafts[f.id] ?? "").trim()}
                                className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-[11px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
                              >
                                Send
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {activeChapter && (
            <div className="flex flex-col gap-4 items-start pb-16 lg:flex-row">
              {/* Chapter text — full page scroll, no internal scrollbox */}
              <section ref={chapterSectionRef} className="w-full min-w-0 flex-1 rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[rgba(210,210,210,0.6)]">Chapter {activeChapter.chapter_order}</p>
                    <h2 className="text-lg font-semibold text-neutral-50">{activeChapter.title}</h2>
                  </div>
                  <button
                    onClick={() => setChapterId(null)}
                    className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-sm text-neutral-200 hover:bg-[rgba(120,120,120,0.22)] transition"
                  >
                    ✕ Close
                  </button>
                </div>
                {!isOwner && !isParentView && (
                  <style>{`
                    @media print { .chapter-protected { display: none !important; } }
                  `}</style>
                )}
                <div
                  ref={textContainerRef}
                  onMouseUp={handleSelectionUp}
                  onClick={(e) => {
                    if (selectedFeedbackId && !(e.target as HTMLElement).closest("button")) {
                      setSelectedFeedbackId(null);
                    }
                  }}
                  onContextMenu={(e) => { if (!isOwner && !isParentView) { e.preventDefault(); triggerCopyWarning(); } }}
                  onCopy={(e) => { if (!isOwner && !isParentView) { e.preventDefault(); triggerCopyWarning(); } }}
                  onCut={(e) => { if (!isOwner && !isParentView) e.preventDefault(); }}
                  onKeyDown={(e) => {
                    if (isOwner || isParentView) return;
                    const ctrl = e.ctrlKey || e.metaKey;
                    if (ctrl && ["c","C","a","A","s","S","p","P","u","U"].includes(e.key)) {
                      e.preventDefault();
                      triggerCopyWarning();
                    }
                    if (e.key === "PrintScreen") {
                      setMsg("Screenshots are not permitted. This session is watermarked and monitored.");
                    }
                  }}
                  tabIndex={(isOwner || isParentView) ? undefined : 0}
                  className={`chapter-ms-font relative rounded-xl border border-[rgba(120,120,120,0.28)] bg-[rgba(18,18,18,0.9)] px-8 py-8 text-[17px] leading-[1.9] text-white shadow-[0_12px_34px_rgba(0,0,0,0.35)]${(!isOwner && !isParentView) ? " chapter-protected" : ""}`}
                >
                  {/* Watermark overlay — non-owners only */}
                  {!isOwner && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                    >
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
                              color: theme === "day" ? "rgba(180,180,185,0.10)" : "rgba(25,25,27,0.85)",
                              whiteSpace: "nowrap",
                              letterSpacing: "0.04em",
                              userSelect: "none",
                              pointerEvents: "none",
                            }}
                          >
                            <span style={{ display: "block" }}>Owner: {names[manuscript.owner_id] || "Author"} · {manuscript.created_at ? new Date(manuscript.created_at).toLocaleDateString() : ""}</span>
                            <span style={{ display: "block" }}>Access Granted: {myDisplayName} · {new Date().toLocaleDateString()}</span>
                          </span>
                        ))
                      )}
                    </div>
                  )}

                  {manuscriptParagraphs.length === 0 ? (
                    <p className="text-sm text-neutral-400">No manuscript text yet.</p>
                  ) : (
                    <div className="relative z-[1] space-y-4">
                      {(() => {
                        const markerFeedback = (!isOwner ? myChapterFeedback : feedback).filter((f) => !f.resolved);
                        return manuscriptParagraphs.map((para, idx) => {
                          const plainPara = para.replace(/<[^>]+>/g, "");
                          const paraFeedbacks = markerFeedback.filter((f) => f.selection_excerpt && (para.includes(f.selection_excerpt) || plainPara.includes(f.selection_excerpt)));

                          return (
                            <div key={idx} id={`para-${idx}`} className="relative">
                              <p
                                className="chapter-ms-font whitespace-pre-line [text-indent:1.5rem] m-0 mb-3"
                                style={{ letterSpacing: "0.01em" }}
                              >
                                {paraFeedbacks.length > 0
                                  ? renderParagraphContent(para, paraFeedbacks)
                                  : <span dangerouslySetInnerHTML={{ __html: para }} />
                                }
                              </p>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* Absolute-positioned dotted underline highlights */}
                  {Object.entries(readerMarkerInfos).flatMap(([fid, info]) => {
                    const isSelected = selectedFeedbackId === fid;
                    return info.highlightRects.map((r, i) => (
                      <div key={`${fid}-hl-${i}`} style={{
                        position: "absolute", top: r.top, left: r.left, width: r.width, height: r.height,
                        backgroundColor: isSelected ? "rgba(251,191,36,0.18)" : "transparent",
                        borderBottom: `2px dotted ${isSelected ? "rgba(251,191,36,0.95)" : "rgba(251,191,36,0.45)"}`,
                        pointerEvents: "none", zIndex: 5,
                      }} />
                    ));
                  })}

                  {/* Absolute-positioned speech-bubble marker buttons */}
                  {Object.entries(readerMarkerInfos).map(([fid, info]) => {
                    const isSelected = selectedFeedbackId === fid;
                    return (
                      <button key={fid} data-feedback-marker="1" type="button" title="View feedback"
                        onClick={(e) => { e.stopPropagation(); setSelectedFeedbackId(isSelected ? null : fid); setClickedMarkerTop(null); }}
                        style={{ position: "absolute", top: info.top, left: info.left, zIndex: 10 }}
                        className={`flex h-[20px] w-[20px] items-center justify-center rounded-full shadow-sm transition-all ${
                          isSelected ? "bg-amber-400 text-amber-950 scale-110 shadow-amber-400/50"
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
              </section>

              {/* Feedback column — sticky alongside the chapter text (hidden for owner) */}
              {canRead && !isOwner && (
                <div
                  ref={asideRef}
                  className="chapter-feedback-aside w-full lg:w-72 lg:shrink-0 rounded-2xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.92)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden"
                  style={{ position: "sticky", top: navH + 12, maxHeight: `calc(100vh - ${navH + 24}px)` }}
                >
                  {/* Total word count for this reader's feedback + coin progress */}
                  {canLeaveLineEdits && !isOwner && (
                    <div className="shrink-0 px-3 py-2 border-b border-[rgba(120,120,120,0.2)]">
                      {(() => {
                        const totalWords = myChapterFeedback.reduce((sum, f) => sum + (f.word_count ?? 0), 0);
                        const isCompleted = activeChapter ? completedChapterIds.has(activeChapter.id) : false;
                        if (isCompleted) {
                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-neutral-500">Feedback words</span>
                              <span className="text-[11px] font-semibold text-emerald-400">✓ Coins earned</span>
                            </div>
                          );
                        }
                        const pct = Math.min(100, Math.round((totalWords / 200) * 100));
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-neutral-500">Feedback words</span>
                              <span className="text-[11px] font-semibold text-[rgba(210,210,210,0.8)]">
                                {totalWords} / 200
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-neutral-800">
                              <div
                                className="h-1 rounded-full bg-[rgba(120,120,120,0.7)] transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {totalWords > 0 && (
                              <p className="mt-1 text-[10px] text-neutral-600">
                                {totalWords >= 200 ? "Threshold met!" : `${200 - totalWords} words to earn 5 coins`}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Submission form pinned at top when text is highlighted */}
                  {pendingSelection && canLeaveLineEdits && (
                    <div className="shrink-0 p-3 border-b border-[rgba(120,120,120,0.2)]">
                      <blockquote className="mb-2 border-l-2 border-[rgba(120,120,120,0.6)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
                        &ldquo;{pendingSelection.text}&rdquo;
                      </blockquote>
                      <textarea
                        rows={3}
                        placeholder="Your feedback on this selection..."
                        value={lineEditDraft}
                        onChange={(e) => setLineEditDraft(e.target.value)}
                        onPaste={(e) => { e.preventDefault(); setPasteBlocked(true); setTimeout(() => setPasteBlocked(false), 3000); }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
                      />
                      {pasteBlocked && (
                        <p className="mt-1 text-xs text-amber-400">Pasting is not allowed — feedback must be typed manually.</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={submitLineEdit}
                          disabled={submittingLineEdit || !lineEditDraft.trim()}
                          className="flex-1 rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[rgba(120,120,120,0.3)] disabled:opacity-40 transition"
                        >
                          {submittingLineEdit ? "Saving…" : "Submit"}
                        </button>
                        <button
                          onClick={() => { setPendingSelection(null); setLineEditDraft(""); }}
                          className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Card area — running log, always visible */}
                  <div ref={cardAreaRef} className="flex-1 overflow-y-auto">
                  {(() => {
                    const chapterFeedbackSource = !isOwner ? myChapterFeedback : feedback;
                    const plainActiveText = activeText.replace(/<[^>]+>/g, "");
                    const allFeedback = chapterFeedbackSource
                      .filter((f) => !f.resolved)
                      .sort((a, b) => {
                        // Prefer stored start_offset; fall back to text search position
                        const ia = (a.start_offset ?? 0) > 0
                          ? a.start_offset!
                          : (a.selection_excerpt ? plainActiveText.indexOf(a.selection_excerpt) : Infinity);
                        const ib = (b.start_offset ?? 0) > 0
                          ? b.start_offset!
                          : (b.selection_excerpt ? plainActiveText.indexOf(b.selection_excerpt) : Infinity);
                        return ia - ib;
                      });

                    if (allFeedback.length === 0 && !pendingSelection) {
                      return (
                        <p className="p-4 text-[11px] italic text-neutral-600 select-none">
                          {canLeaveLineEdits ? "Highlight any text — a single punctuation mark, word, sentence, or paragraph — to leave feedback." : "No feedback on this chapter yet."}
                        </p>
                      );
                    }

                    return (
                      <div className="p-3 space-y-3">
                        {allFeedback.map((f) => {
                          const isSelected = selectedFeedbackId === f.id;
                          const cardReplies = replies.filter((r) => r.feedback_id === f.id);

                          if (!isSelected) {
                            return (
                              <div
                                key={f.id}
                                id={`feedback-item-${f.id}`}
                                className="cursor-pointer rounded-lg border border-[rgba(120,120,120,0.3)] bg-[rgba(120,120,120,0.07)] p-2.5 hover:border-[rgba(120,120,120,0.6)] transition"
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest("button,textarea")) return;
                                  setClickedMarkerTop(null);
                                  setSelectedFeedbackId(f.id);
                                  document.getElementById(`text-marker-${f.id}`)?.scrollIntoView({ behavior: "instant", block: "nearest" });
                                }}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-[11px] font-medium text-[rgba(210,210,210,0.8)]">{names[f.reader_id] || "Reader"}</p>
                                  <span className="text-[10px] text-neutral-500">{new Date(f.created_at).toLocaleDateString()}</span>
                                </div>
                                {f.selection_excerpt && (
                                  <blockquote className="mt-1 border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
                                    &ldquo;{f.selection_excerpt}&rdquo;
                                  </blockquote>
                                )}
                                <p className="mt-1 text-[11px] leading-relaxed text-neutral-300 line-clamp-2">{f.comment_text}</p>
                                {cardReplies.length > 0 && (
                                  <p className="mt-1 text-[10px] text-neutral-500">{cardReplies.length} repl{cardReplies.length === 1 ? "y" : "ies"}</p>
                                )}
                              </div>
                            );
                          }

                          // Expanded card (selected) — inline in the list
                          return (
                            <div
                              key={f.id}
                              id={`feedback-item-${f.id}`}
                              className="rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.14)] p-2.5 shadow-[0_8px_24px_rgba(120,120,120,0.15)]"
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest("button,textarea")) return;
                                setSelectedFeedbackId(null);
                              }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-[11px] font-medium text-[rgba(210,210,210,0.8)]">{names[f.reader_id] || "Reader"}</p>
                                <div className="flex gap-1 shrink-0 items-center">
                                  {f.reader_id === userId && (
                                    <button
                                      onClick={() => { setEditingFeedbackId(f.id); setEditFeedbackDraft(f.comment_text); }}
                                      className="rounded-lg px-1.5 py-0.5 text-[10px] text-[rgba(210,210,210,0.7)] hover:bg-[rgba(120,120,120,0.2)] transition"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedFeedbackId(null); }}
                                    className="rounded-lg px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-[rgba(120,120,120,0.2)] hover:text-neutral-200 transition"
                                    title="Close"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                              {f.selection_excerpt && !manuscriptParagraphs.some((p) => p.includes(f.selection_excerpt)) ? (
                                <p className="mt-1 text-[11px] italic text-amber-500/70">⚠ Original text has been edited or removed.</p>
                              ) : (
                                <blockquote className="mt-1 border-l-2 border-[rgba(120,120,120,0.5)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
                                  &ldquo;{f.selection_excerpt}&rdquo;
                                </blockquote>
                              )}
                              {editingFeedbackId === f.id ? (
                                <div className="mt-1.5">
                                  <textarea
                                    rows={3}
                                    value={editFeedbackDraft}
                                    onChange={(e) => setEditFeedbackDraft(e.target.value)}
                                    className="w-full rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.5)] focus:outline-none"
                                  />
                                  <div className="mt-1 flex gap-1">
                                    <button
                                      onClick={() => void saveLineFeedbackEdit(f.id)}
                                      disabled={!editFeedbackDraft.trim()}
                                      className="flex-1 rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-2 py-1 text-[10px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => { setEditingFeedbackId(null); setEditFeedbackDraft(""); }}
                                      className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-[10px] text-neutral-300 hover:border-neutral-500 transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-1.5 rounded-lg bg-neutral-950/50 p-2 space-y-1.5">
                                  <div className={`flex ${f.reader_id === userId ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 ${f.reader_id === userId ? "rounded-tr-sm bg-white" : "rounded-tl-sm bg-neutral-100"}`}>
                                      <p className="text-[10px] font-semibold text-neutral-500 mb-0.5">{names[f.reader_id] || "Reader"}</p>
                                      <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{f.comment_text}</p>
                                    </div>
                                  </div>
                                  {f.author_response && (
                                    <p className={`text-[10px] font-medium text-center ${f.author_response === "agree" ? "text-emerald-400" : "text-rose-400"}`}>
                                      {f.author_response === "agree" ? "✓ Author agreed" : "✗ Author disagreed"}
                                    </p>
                                  )}
                                  {cardReplies.map((r) => {
                                    const isMe = r.replier_id === userId;
                                    return (
                                      <div key={r.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                        <div className={`max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 ${isMe ? "rounded-tr-sm bg-white" : "rounded-tl-sm bg-neutral-100"}`}>
                                          <p className="text-[10px] font-semibold mb-0.5 text-neutral-500">
                                            {names[r.replier_id] || (r.replier_id === manuscript?.owner_id ? "Author" : "Reader")}
                                          </p>
                                          <p className="text-[11px] leading-relaxed text-neutral-800 break-words">{r.body}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {!f.resolved && (isOwner || f.reader_id === userId) && (
                                isOwner && adultReplyBlockedForFeedback(f.reader_id) ? (
                                  <p className="mt-2 text-[10px] italic text-neutral-600">
                                    Replies to feedback from youth readers are disabled on youth-category manuscripts.
                                  </p>
                                ) : (
                                  <div className="mt-2 flex gap-1.5">
                                    <textarea
                                      rows={1}
                                      placeholder="Reply… (Enter to send)"
                                      value={replyDrafts[f.id] ?? ""}
                                      ref={(el) => { if (el) replyTextareaRefs.current.set(f.id, el); else replyTextareaRefs.current.delete(f.id); }}
                                      onChange={(e) => setReplyDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                                      onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 96) + "px"; }}
                                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void replyToFeedback(f); } }}
                                      className="flex-1 resize-none overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.5)] focus:outline-none"
                                    />
                                    <button
                                      onClick={() => replyToFeedback(f)}
                                      disabled={!(replyDrafts[f.id] ?? "").trim()}
                                      className="rounded-lg border border-[rgba(120,120,120,0.5)] bg-[rgba(120,120,120,0.12)] px-3 py-1.5 text-[11px] text-white hover:bg-[rgba(120,120,120,0.22)] disabled:opacity-40 transition"
                                    >
                                      Send
                                    </button>
                                  </div>
                                )
                              )}
                              {isOwner && !f.author_response && (
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    onClick={() => void resolveFeedback(f.id, "agree")}
                                    className="flex-1 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-900/40 transition"
                                  >
                                    ✓ Agree
                                  </button>
                                  <button
                                    onClick={() => void resolveFeedback(f.id, "disagree")}
                                    className="flex-1 rounded-lg border border-rose-700/60 bg-rose-950/40 px-2 py-1 text-[10px] font-medium text-rose-400 hover:bg-rose-900/40 transition"
                                  >
                                    ✗ Disagree
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  </div>
                </div>
            )}
          </div>
          )}
        </ManuscriptLayout>

        </>
      )}

      {/* Floating inline feedback popup — appears right beside highlighted text */}
      {/* Bloom coin earned toast */}
      {coinToast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-900 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(120,120,120,0.18)] text-xl">🪙</div>
          <div>
            <p className="text-sm font-semibold text-neutral-100">+{coinToast.coins} Bloom Coins earned!</p>
            <p className="text-xs text-neutral-400">New balance: {coinToast.newBalance.toLocaleString()} coins</p>
          </div>
          <button
            onClick={() => setCoinToast(null)}
            className="ml-1 shrink-0 text-neutral-500 hover:text-neutral-300 transition"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {pendingSelection && canLeaveLineEdits && (
        <div
          className="feedback-inline-popup fixed z-50 w-72 rounded-xl border border-[rgba(120,120,120,0.6)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-3"
          style={{
            top: pendingSelection.y + 24,
            left: pendingSelection.x,
            transform: "translateX(-50%)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <blockquote className="mb-2 border-l-2 border-[rgba(120,120,120,0.6)] pl-2 text-[11px] italic text-neutral-400 line-clamp-2">
            &ldquo;{pendingSelection.text}&rdquo;
          </blockquote>
          <textarea
            autoFocus
            rows={3}
            placeholder="Your feedback on this selection..."
            value={lineEditDraft}
            onChange={(e) => setLineEditDraft(e.target.value)}
            onPaste={(e) => { e.preventDefault(); setPasteBlocked(true); setTimeout(() => setPasteBlocked(false), 3000); }}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-[rgba(120,120,120,0.6)] focus:outline-none"
          />
          {pasteBlocked && (
            <p className="mt-1 text-xs text-amber-400">Pasting is not allowed — feedback must be typed manually.</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitLineEdit}
              disabled={submittingLineEdit || !lineEditDraft.trim()}
              className="flex-1 rounded-lg border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[rgba(120,120,120,0.3)] disabled:opacity-40 transition"
            >
              {submittingLineEdit ? "Saving…" : "Submit"}
            </button>
            <button
              onClick={() => { setPendingSelection(null); setLineEditDraft(""); }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

export default function Page() {
  return <Suspense><PageInner /></Suspense>;
}
