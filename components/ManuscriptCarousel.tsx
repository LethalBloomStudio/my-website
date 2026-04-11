"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";

type Manuscript = {
  id: string;
  title: string;
  genre: string | null;
  word_count: number;
  chapter_count: number;
  cover_url: string | null;
  visibility: string;
  description: string | null;
};

type Props = {
  manuscripts: Manuscript[];
  isOwner?: boolean;
  highlightedId?: string | null;
  onSetHighlight?: (id: string | null) => Promise<void>;
  onSaveBlurb?: (manuscriptId: string, blurb: string) => Promise<void>;
};

export default function ManuscriptCarousel({ manuscripts, isOwner, highlightedId, onSetHighlight, onSaveBlurb }: Props) {
  const [index, setIndex] = useState(0);
  const [localHighlighted, setLocalHighlighted] = useState(highlightedId ?? null);
  const [highlightPending, startHighlightTransition] = useTransition();
  const [blurbPending, startBlurbTransition] = useTransition();
  const [editingBlurb, setEditingBlurb] = useState(false);
  const [blurbDraft, setBlurbDraft] = useState("");
  const [blurbExpanded, setBlurbExpanded] = useState(true);

  if (manuscripts.length === 0) {
    return <p className="text-sm text-neutral-400">No manuscripts yet.</p>;
  }

  const m = manuscripts[index];
  const isHighlighted = localHighlighted === m.id;

  function handleHighlight() {
    if (!onSetHighlight) return;
    const next = isHighlighted ? null : m.id;
    setLocalHighlighted(next);
    startHighlightTransition(() => onSetHighlight(next));
  }

  function startEditBlurb() {
    setBlurbDraft(m.description ?? "");
    setEditingBlurb(true);
  }

  function saveBlurb() {
    if (!onSaveBlurb) return;
    setEditingBlurb(false);
    // Update local copy so it reflects immediately
    // eslint-disable-next-line react-hooks/immutability
    m.description = blurbDraft;
    startBlurbTransition(() => onSaveBlurb(m.id, blurbDraft));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-[rgba(120,120,120,0.6)] transition">
        <div className="flex gap-5 p-4 items-start">
          {/* Book cover */}
          <Link href={isOwner ? `/manuscripts/${m.id}/details` : `/manuscripts/${m.id}`} className="shrink-0">
            <div className="relative w-56 rounded border border-neutral-700 overflow-hidden shadow-md" style={{ aspectRatio: "2/3" }}>
              {m.cover_url ? (
                <Image
                  src={m.cover_url}
                  alt={`${m.title} cover`}
                  fill
                 
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/60 text-[10px] text-neutral-500">
                  No Cover
                </div>
              )}
            </div>
          </Link>

          {/* Info */}
          <div className="min-w-0 flex flex-col flex-1 pt-1 gap-3">
            <div className="space-y-2">
              {isHighlighted && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-yellow-500">Featured</p>
              )}
              <Link href={isOwner ? `/manuscripts/${m.id}/details` : `/manuscripts/${m.id}`} className="group">
                <p className="font-medium text-white group-hover:underline leading-snug">{m.title}</p>
              </Link>
              <p className="text-xs text-neutral-400">{m.genre ?? "Uncategorized"}</p>
              <p className="text-xs text-neutral-500">
                {m.chapter_count} {m.chapter_count === 1 ? "chapter" : "chapters"}
              </p>
              <p className="text-xs text-neutral-500">{m.word_count.toLocaleString()} words</p>
              <p className="text-xs text-neutral-600">{m.visibility === "public" ? "Public" : "Private"}</p>

              {/* Blurb */}
              <div className="pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-1">Blurb</div>
                {editingBlurb ? (
                  <div className="space-y-2">
                    <textarea
                      value={blurbDraft}
                      onChange={(e) => setBlurbDraft(e.target.value)}
                      rows={4}
                      placeholder="Write a short blurb to tell readers what this book is about…"
                      className="w-full rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-600 resize-none focus:outline-none focus:border-[rgba(120,120,120,0.7)]"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingBlurb(false)}
                        className="rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1 text-xs text-neutral-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveBlurb}
                        disabled={blurbPending}
                        className="rounded border border-[rgba(120,120,120,0.7)] bg-[rgba(120,120,120,0.2)] px-2 py-1 text-xs text-neutral-200 hover:bg-[rgba(120,120,120,0.35)] transition"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {m.description ? (
                      <>
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={startEditBlurb}
                            aria-label="Edit blurb"
                            className="w-full text-left cursor-pointer group bg-transparent border-0 p-0"
                          >
                            <p className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed group-hover:text-white transition">
                              {m.description}
                            </p>
                          </button>
                        ) : (
                          <p className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">
                            {m.description}
                          </p>
                        )}
                      </>
                    ) : (
                      isOwner ? (
                        <button
                          type="button"
                          onClick={startEditBlurb}
                          aria-label="Add a blurb"
                          className="w-full text-left cursor-pointer group bg-transparent border-0 p-0"
                        >
                          <p className="text-xs text-neutral-500 italic border border-dashed border-neutral-700 rounded px-2 py-1.5 group-hover:border-neutral-500 group-hover:text-neutral-300 transition">Click to add a blurb…</p>
                        </button>
                      ) : (
                        <p className="text-xs text-neutral-600 italic">No blurb yet.</p>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Feature button — right aligned */}
            {isOwner && (
              <div className="flex justify-end">
                <button
                  onClick={handleHighlight}
                  disabled={highlightPending}
                  title={isHighlighted ? "Remove highlight" : "Highlight this manuscript"}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
                    isHighlighted
                      ? "border-yellow-600 bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60"
                      : "border-neutral-700 bg-neutral-900/60 text-neutral-400 hover:border-yellow-600 hover:text-yellow-400"
                  }`}
                >
                  ★ {isHighlighted ? "Featured" : "Feature"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {manuscripts.length > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => { setIndex((i) => (i - 1 + manuscripts.length) % manuscripts.length); setEditingBlurb(false); setBlurbExpanded(false); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:border-[rgba(120,120,120,0.6)] hover:text-white transition"
            aria-label="Previous manuscript"
          >
            &#8592;
          </button>
          <span className="text-xs text-neutral-500">{index + 1} / {manuscripts.length}</span>
          <button
            onClick={() => { setIndex((i) => (i + 1) % manuscripts.length); setEditingBlurb(false); setBlurbExpanded(false); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:border-[rgba(120,120,120,0.6)] hover:text-white transition"
            aria-label="Next manuscript"
          >
            &#8594;
          </button>
        </div>
      )}
    </div>
  );
}
