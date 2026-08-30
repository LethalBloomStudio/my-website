"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function BookClubSlateForm({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/submit-book-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle_id: cycleId, book_title: title, book_author: author }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setTitle("");
      setAuthor("");
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
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
