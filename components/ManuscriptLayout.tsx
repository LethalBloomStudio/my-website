"use client";

import Image from "next/image";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export type ChapterNavItem = {
  id: string;
  title: string;
  chapter_order: number;
  is_private?: boolean;
  chapter_type?: "chapter" | "prologue" | "epilogue" | "trigger_page";
};

export type DetailItem = {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
};

type ManuscriptLayoutProps<T extends ChapterNavItem = ChapterNavItem> = {
  title: string;
  coverUrl?: string | null;
  categories?: string[] | null;
  chapters?: T[];
  activeChapterId?: string | null;
  onSelectChapter?: (id: string) => void;
  details?: DetailItem[];
  children: React.ReactNode;
  emptyChaptersText?: string;
  sidebarFooter?: React.ReactNode;
  renderChapterItem?: (chapter: T, isActive: boolean) => React.ReactNode;
  rightHeader?: React.ReactNode;
  /** Renders between the header and the built-in description/details sections. */
  topContent?: React.ReactNode;
  sidebarPosition?: "left" | "right";
  description?: string | null;
  hideDefaultSections?: boolean;
  /** When true, narrows the sidebar so the editor gets more horizontal space. */
  compactSidebar?: boolean;
  onCoverClick?: () => void;
  /** Label shown under the cover when onCoverClick is set. Defaults to "← Back to manuscript". */
  coverClickLabel?: string;
  /** When true, the title becomes inline-editable on click. */
  titleEditable?: boolean;
  /** Called with the new title when the user saves an inline title edit. */
  onTitleSave?: (newTitle: string) => void;
  /** Set of chapter IDs the current reader has completed (earned coins for). */
  completedChapterIds?: Set<string>;
};

export default function ManuscriptLayout<T extends ChapterNavItem = ChapterNavItem>({
  title,
  coverUrl,
  categories = [],
  chapters = [],
  activeChapterId,
  onSelectChapter,
  details = [],
  children,
  emptyChaptersText = "No chapters yet.",
  sidebarFooter,
  renderChapterItem,
  rightHeader,
  topContent,
  sidebarPosition = "left",
  description,
  hideDefaultSections = false,
  compactSidebar = false,
  onCoverClick,
  coverClickLabel,
  titleEditable = false,
  onTitleSave,
  completedChapterIds,
}: ManuscriptLayoutProps<T>) {
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);

  // Map chapter IDs to their number among regular chapters only
  const chapterNumberMap = new Map<string, number>();
  let chNum = 0;
  for (const c of sortedChapters) {
    if (!c.chapter_type || c.chapter_type === "chapter") chapterNumberMap.set(c.id, ++chNum);
  }

  function chapterNavLabel(c: ChapterNavItem): string {
    if (c.chapter_type === "prologue") return "Prologue";
    if (c.chapter_type === "epilogue") return "Epilogue";
    if (c.chapter_type === "trigger_page") return "Trigger Page";
    return `Chapter ${chapterNumberMap.get(c.id) ?? c.chapter_order}`;
  }

  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Keep edit value in sync if title prop changes externally
  useEffect(() => {
    if (!editingTitle) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditTitleValue(title);
    }
  }, [title, editingTitle]);

  // Detect app/webview contexts so we can stack columns vertically there (prevents overlap).
  const [forceVerticalLayout, setForceVerticalLayout] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    function compute() {
      const ua = window.navigator.userAgent || "";
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any)?.standalone;
      const isWebView = /\bwv\b/i.test(ua) || /LethalBloomApp/i.test(ua);
      setForceVerticalLayout(isStandalone || isWebView);
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  function commitTitleEdit() {
    setEditingTitle(false);
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== title) onTitleSave?.(trimmed);
    else setEditTitleValue(title);
  }

  const sidebar = (
    <aside className={`w-full shrink-0 space-y-3 self-start md:sticky md:top-20 ${compactSidebar ? "md:w-[200px]" : "md:w-[240px]"}`}>
      <div
        className={`rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.95)] p-3 shadow-[0_10px_28px_rgba(0,0,0,0.35)] ${onCoverClick ? "cursor-pointer hover:border-[rgba(120,120,120,0.65)] hover:bg-[rgba(20,20,20,0.98)] transition" : ""}`}
        onClick={onCoverClick}
        title={onCoverClick ? (coverClickLabel ?? "Back to manuscript info") : undefined}
      >
        <div className="flex items-start gap-3">
          <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md border border-[rgba(120,120,120,0.3)] bg-[radial-gradient(circle_at_30%_20%,rgba(120,120,120,0.25),rgba(18,18,18,0.9))]">
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={`${title} cover`}
                fill
                sizes="80px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-[rgba(210,210,210,0.8)]">
                No cover
              </div>
            )}
          </div>
          <div className="min-w-0 flex flex-col gap-1.5">
            {titleEditable ? (
              editingTitle ? (
                <input
                  ref={titleInputRef}
                  autoFocus
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={commitTitleEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitTitleEdit(); }
                    if (e.key === "Escape") { setEditingTitle(false); setEditTitleValue(title); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-[rgba(120,120,120,0.5)] bg-neutral-900/60 px-1 py-0.5 text-sm font-semibold text-neutral-50 outline-none focus:border-[rgba(120,120,120,0.9)]"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTitle(true);
                    setEditTitleValue(title);
                    setTimeout(() => titleInputRef.current?.focus(), 0);
                  }}
                  className="group text-left text-sm font-semibold leading-snug text-neutral-50 hover:text-white"
                >
                  {title}
                  <span className="ml-1 text-[10px] text-[rgba(120,120,120,0.65)] opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
                </button>
              )
            ) : (
              <h1 className="text-sm font-semibold leading-snug text-neutral-50">{title}</h1>
            )}
            {categories && categories.filter((c) => c !== "Mature Content" && c !== "Potentially Triggering Content").length ? (
              <p className="text-[11px] text-[rgba(210,210,210,0.85)]">{categories.filter((c) => c !== "Mature Content" && c !== "Potentially Triggering Content").join(", ")}</p>
            ) : (
              <p className="text-[11px] text-[rgba(210,210,210,0.65)]">Uncategorized</p>
            )}
            {onCoverClick && (
              <p className="text-[10px] text-[rgba(120,120,120,0.7)] mt-auto pt-1">
                {coverClickLabel ?? "← Back to manuscript"}
              </p>
            )}
            {onCoverClick && coverClickLabel && !coverClickLabel.startsWith("←") && (
              <p className="text-[9px] text-neutral-600 pt-0.5">600 × 900 px recommended</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(18,18,18,0.9)] p-3 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-neutral-100">Chapters</h2>
          <span className="text-[10px] text-neutral-400">In order</span>
        </div>
        {sortedChapters.length > 0 ? (
          <ul className="mt-2 space-y-1.5 max-h-[60vh] overflow-auto pr-1">
            {sortedChapters.map((c) => (
              <li key={c.id}>
                {renderChapterItem ? (
                  renderChapterItem(c, c.id === activeChapterId)
                ) : (
                  <button
                    onClick={() => onSelectChapter?.(c.id)}
                    className={`chapter-btn w-full rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                      activeChapterId === c.id
                        ? "active-chapter !border !border-[rgba(120,120,120,0.8)] !bg-[rgba(120,120,120,0.18)] !text-white shadow-[0_12px_30px_rgba(120,120,120,0.2)]"
                        : "!border !border-neutral-800 !bg-neutral-950/40 !text-neutral-200 hover:!border-[rgba(120,120,120,0.45)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold">{chapterNavLabel(c)}</span>
                      {completedChapterIds?.has(c.id) && (
                        <span className="shrink-0 text-[10px] text-emerald-400" title="Chapter completed — coins earned">✓</span>
                      )}
                    </div>
                    <span className="block text-[11px] text-neutral-400 truncate">{c.title}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-neutral-400">{emptyChaptersText}</p>
        )}
        {sidebarFooter ? <div className="mt-2">{sidebarFooter}</div> : null}
      </div>
    </aside>
  );

  const mainContent = (
    <div className="min-w-0 flex-1 space-y-6">
      {rightHeader}
      {topContent}
      {!hideDefaultSections && description ? (
        <section className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.9)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
          <h2 className="text-sm font-semibold text-neutral-100">Description</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">{description}</p>
        </section>
      ) : null}
      {!hideDefaultSections && details.length > 0 ? (
        <section className="rounded-xl border border-[rgba(120,120,120,0.35)] bg-[rgba(20,20,20,0.9)] p-5 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
          <h2 className="text-sm font-semibold text-neutral-100">Details</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {details.map((d, idx) => (
              <DetailRow key={`${d.label}-${idx}`} label={d.label} value={d.value} multiline={d.multiline} />
            ))}
          </div>
        </section>
      ) : null}
      {children}
    </div>
  );

  const verticalStack = forceVerticalLayout;

  return (
    <section
      className={`manuscript-layout mt-6 flex gap-6 ${verticalStack ? "flex-col" : "flex-col md:flex-row"}`}
      style={verticalStack ? { flexDirection: "column" } : undefined}
    >
      {verticalStack ? (
        <>
          {sidebar}
          <div className="mt-3">{mainContent}</div>
        </>
      ) : sidebarPosition === "right" ? (
        <>
          {mainContent}
          {sidebar}
        </>
      ) : (
        <>
          {sidebar}
          {mainContent}
        </>
      )}
    </section>
  );
}

export function DetailRow({ label, value, multiline = false }: DetailItem) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
      <div className={`mt-1 text-sm text-neutral-100 ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""}`}>
        {value}
      </div>
    </div>
  );
}
