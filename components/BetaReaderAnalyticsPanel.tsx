"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/Supabase/browser";
import {
  computeBetaReaderAnalytics,
  type BetaReaderAnalytics,
  type ChapterRow,
  type CompletionRow,
  type ExitReasonRow,
  type FeedbackRow,
} from "@/lib/manuscript/betaReaderAnalytics";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0 text-[rgba(120,120,120,0.9)]">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function pct(n: number | null): string {
  if (n == null) return "-";
  return `${Math.round(n * 100)}%`;
}

function readerLabel(n: number): string {
  if (n === 0) return "no readers yet";
  return `based on ${n} reader${n === 1 ? "" : "s"} so far`;
}

export default function BetaReaderAnalyticsPanel({
  manuscriptId,
  onClose,
}: {
  manuscriptId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<BetaReaderAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const [chaptersRes, completionsRes, feedbackRes, grantsRes, requestsRes, exitReasonsRes] = await Promise.all([
        supabase.from("manuscript_chapters").select("id, chapter_order, chapter_type").eq("manuscript_id", manuscriptId),
        supabase.from("chapter_read_completions").select("chapter_id, reader_id, completed_at").eq("manuscript_id", manuscriptId),
        supabase.from("line_feedback").select("chapter_id, reader_id, created_at").eq("manuscript_id", manuscriptId),
        supabase.from("manuscript_access_grants").select("reader_id").eq("manuscript_id", manuscriptId),
        supabase
          .from("manuscript_access_requests")
          .select("requester_id, status")
          .eq("manuscript_id", manuscriptId)
          .in("status", ["approved", "disabled", "left"]),
        supabase.from("manuscript_reader_exit_reasons").select("reason_category, initiated_by").eq("manuscript_id", manuscriptId),
      ]);

      if (cancelled) return;

      const firstError = [chaptersRes, completionsRes, feedbackRes, grantsRes, requestsRes, exitReasonsRes].find((r) => r.error)?.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setAnalytics(
        computeBetaReaderAnalytics({
          chapters: (chaptersRes.data as ChapterRow[] | null) ?? [],
          completions: (completionsRes.data as CompletionRow[] | null) ?? [],
          feedback: (feedbackRes.data as FeedbackRow[] | null) ?? [],
          exitReasons: (exitReasonsRes.data as ExitReasonRow[] | null) ?? [],
          grantedReaderIds: ((grantsRes.data as Array<{ reader_id: string }> | null) ?? []).map((r) => r.reader_id),
          requestedReaderIds: ((requestsRes.data as Array<{ requester_id: string }> | null) ?? []).map((r) => r.requester_id),
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, manuscriptId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Beta reader analytics"
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[rgba(120,120,120,0.55)] bg-neutral-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Beta Reader Analytics</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-2 py-1 text-xs text-neutral-400 hover:text-white transition"
          >
            Close
          </button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-neutral-500">
          These numbers reflect this manuscript&apos;s entire engagement history to date, not just a recent window. Treat them as signals worth noticing, not a verdict: a single reader can still move a trend when there are only a few readers so far.
        </p>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : analytics ? (
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-neutral-200">Completion &amp; drop-off</h3>
              {analytics.completion.populationSize === 0 ? (
                <p className="mt-1 text-xs italic text-neutral-500">No readers have had access yet.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-neutral-300">
                    <span className="font-semibold text-white">{pct(analytics.completion.finishedPct)}</span> finished the manuscript{" "}
                    <span className="text-neutral-500">({readerLabel(analytics.completion.populationSize)})</span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Of those who haven&apos;t finished: {analytics.completion.dropOff.early} early, {analytics.completion.dropOff.middle} mid, {analytics.completion.dropOff.late} late
                    {analytics.completion.dropOff.noEngagement > 0 ? `, ${analytics.completion.dropOff.noEngagement} with no recorded engagement yet` : ""}.
                  </p>
                </>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-neutral-200">Engagement trajectory</h3>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-sm font-semibold text-white">{analytics.engagementTrend.verdict}</span>
                <Sparkline data={analytics.engagementTrend.series} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Feedback density across chapters, {readerLabel(analytics.engagementTrend.contributingReaders)}.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-neutral-200">Reading velocity</h3>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-sm font-semibold text-white">{analytics.readingVelocity.verdict}</span>
                <Sparkline data={analytics.readingVelocity.series} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Approximate, based on time between chapters where readers left feedback, {readerLabel(analytics.readingVelocity.contributingReaders)}.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-neutral-200">Return behavior</h3>
              {analytics.returnBehavior.contributingReaders === 0 ? (
                <p className="mt-1 text-xs italic text-neutral-500">No readers have gone quiet for a stretch yet.</p>
              ) : (
                <p className="mt-1 text-sm text-neutral-300">
                  Of readers who went quiet for two weeks or more: <span className="font-semibold text-white">{analytics.returnBehavior.resumed}</span> came back,{" "}
                  <span className="font-semibold text-white">{analytics.returnBehavior.hasntReturned}</span> haven&apos;t yet{" "}
                  <span className="text-neutral-500">({readerLabel(analytics.returnBehavior.contributingReaders)})</span>.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-neutral-200">Exit reasons</h3>
              {analytics.exitReasons.total === 0 ? (
                <p className="mt-1 text-xs italic text-neutral-500">No readers have left or been removed yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {analytics.exitReasons.byCategory.map((row) => (
                    <li key={`${row.initiatedBy}-${row.category}`} className="flex items-center justify-between gap-3 text-xs text-neutral-300">
                      <span>
                        {row.category} <span className="text-neutral-500">({row.initiatedBy === "owner" ? "you removed" : "reader left"})</span>
                      </span>
                      <span className="font-semibold text-white">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
