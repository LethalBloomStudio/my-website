"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5MB

// Lets a submitter edit their own book after adding it to the slate --
// title/author/cover only, never cycle/slot/ownership. Editing resets any
// votes already cast for it (book_club_edit_book_option deletes them
// server-side) -- warned here via a styled confirm modal (matching
// ReportModal.tsx's pattern, the established site-wide confirm-dialog
// look) before saving, plus a standing note while the form is open.
export default function BookClubEditBookOptionButton({
  optionId,
  initialTitle,
  initialAuthor,
  initialCoverUrl,
  voteCount,
  votingHasBegun,
}: {
  optionId: string;
  initialTitle: string;
  initialAuthor: string;
  initialCoverUrl: string | null;
  voteCount: number;
  votingHasBegun: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState(initialAuthor);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(initialCoverUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadCover(): Promise<string | null> {
    if (!coverFile) return initialCoverUrl;
    if (coverFile.size > MAX_COVER_BYTES) {
      setError("Cover image is too large. Please choose a file under 5MB.");
      return null;
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setError("Please sign in to upload a cover.");
      return null;
    }
    const ext = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from("book-club-covers")
      .upload(path, coverFile, { upsert: true, contentType: coverFile.type || "image/jpeg" });
    if (uploadErr) {
      setError("Cover upload failed: " + uploadErr.message);
      return null;
    }
    const { data } = supabase.storage.from("book-club-covers").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave() {
    setConfirming(false);
    setLoading(true);
    setError(null);
    try {
      const coverImageUrl = await uploadCover();
      if (coverFile && !coverImageUrl) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/book-club/edit-book-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId, book_title: title, book_author: author, cover_image_url: coverImageUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border px-2 py-1 text-[11px] font-medium transition bookclub-chip"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-left">
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Book title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Author</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Cover image (optional)</label>
        <div className="flex items-center gap-3">
          {coverPreviewUrl ? (
            <Image src={coverPreviewUrl} alt="Cover preview" width={40} height={54} className="h-14 w-10 rounded object-cover border border-neutral-700" />
          ) : (
            <div className="flex h-14 w-10 items-center justify-center rounded border border-dashed border-neutral-700 bg-neutral-950 text-[8px] text-neutral-600 text-center">
              No cover
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setCoverFile(file);
              setCoverPreviewUrl(file ? URL.createObjectURL(file) : initialCoverUrl ?? "");
            }}
            className="flex-1 text-xs text-neutral-400"
          />
        </div>
      </div>
      {votingHasBegun && (
        <p className="text-[11px] text-amber-400">
          Voting has begun for this cycle. Editing this book will reset its vote count to zero{voteCount > 0 ? ` (currently ${voteCount})` : ""}.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={loading || !title.trim() || !author.trim()}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
        >
          {loading ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={loading}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition bookclub-chip disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,120,120,0.5)] bg-neutral-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Save changes to this book?</h2>
            {votingHasBegun ? (
              <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2.5 text-sm text-amber-300 leading-relaxed">
                Voting has begun for this cycle. If you change this book&apos;s title, author, or cover, its vote count will reset to zero.
                {voteCount > 0 && ` It currently has ${voteCount} vote${voteCount === 1 ? "" : "s"}.`}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">You&apos;re about to update this book&apos;s title, author, or cover.</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className="rounded-lg border border-[rgba(120,120,120,0.65)] bg-[rgba(120,120,120,0.2)] px-4 py-1.5 text-sm text-white hover:border-[rgba(120,120,120,0.9)] transition"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
