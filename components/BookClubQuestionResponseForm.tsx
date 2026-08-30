"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Mirrors ORIGINAL_MAX_WORDS's style in BloomCircleSubmissionForm.tsx --
// a local, easily-adjustable constant, duplicated (not shared) with the
// matching check in app/api/book-club/submit-response/route.ts.
const RESPONSE_MIN_WORDS = 150;

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function BookClubQuestionResponseForm({
  questionId,
  initialBody,
}: {
  questionId: string;
  initialBody: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(!!initialBody);

  const words = countWords(body);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/book-club/submit-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, body }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        rows={4}
        placeholder={`Your answer (at least ${RESPONSE_MIN_WORDS} words)...`}
        className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${words < RESPONSE_MIN_WORDS ? "text-neutral-500" : "text-emerald-400"}`}>
          {words} / {RESPONSE_MIN_WORDS} words
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || words < RESPONSE_MIN_WORDS}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
        >
          {saving ? "Saving..." : saved ? "Update answer" : "Submit answer"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
