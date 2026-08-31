"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5MB

export default function BookClubSlateForm({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct-to-Supabase-Storage, same mechanics as ProfileImageUpload.tsx /
  // manuscript-covers -- upload first, then submit the resulting public URL
  // alongside the rest of the form. No base64 fallback.
  async function uploadCover(): Promise<string | null> {
    if (!coverFile) return null;
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let coverImageUrl: string | null = null;
      if (coverFile) {
        coverImageUrl = await uploadCover();
        if (!coverImageUrl) {
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/book-club/submit-book-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: cycleId, book_title: title, book_author: author, cover_image_url: coverImageUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setAuthor("");
      setCoverFile(null);
      setCoverPreviewUrl("");
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 bookclub-card">
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Book title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Author</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Cover image (optional)</label>
        <div className="flex items-center gap-3">
          {coverPreviewUrl ? (
            <Image src={coverPreviewUrl} alt="Cover preview" width={48} height={64} className="h-16 w-12 rounded object-cover border border-neutral-700" />
          ) : (
            <div className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-neutral-700 bg-neutral-950 text-[9px] text-neutral-600 text-center">
              No cover
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setCoverFile(file);
              setCoverPreviewUrl(file ? URL.createObjectURL(file) : "");
            }}
            className="flex-1 text-xs text-neutral-400"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
      >
        {loading ? "Adding..." : "Add to slate"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
