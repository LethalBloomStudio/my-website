// Pure aggregation for the manuscript owner's Beta Reader Analytics panel.
// Every metric here is a proxy signal derived from data collected for other
// purposes (coin-eligibility completions, feedback rows, exit-reason logs) -
// none of it is a direct "the reader did X at time Y" instrumentation event.
// See the panel's own intro copy for the "worth noticing, not a verdict" framing.

export type ChapterRow = { id: string; chapter_order: number; chapter_type: string };
export type CompletionRow = { chapter_id: string; reader_id: string; completed_at: string };
export type FeedbackRow = { chapter_id: string | null; reader_id: string; created_at: string };
export type ExitReasonRow = { reason_category: string; initiated_by: "reader" | "owner" };

export type BetaReaderAnalyticsInput = {
  chapters: ChapterRow[];
  completions: CompletionRow[];
  feedback: FeedbackRow[];
  exitReasons: ExitReasonRow[];
  grantedReaderIds: string[];
  requestedReaderIds: string[];
};

export type TrendVerdict = "Building" | "Steady" | "Declining" | "Speeding up" | "Slowing down" | "Not enough data";

export type BetaReaderAnalytics = {
  totalChapters: number;
  completion: {
    populationSize: number;
    finishedCount: number;
    finishedPct: number | null;
    dropOff: { early: number; middle: number; late: number; noEngagement: number };
  };
  engagementTrend: {
    verdict: TrendVerdict;
    series: number[];
    contributingReaders: number;
  };
  readingVelocity: {
    verdict: TrendVerdict;
    series: number[];
    contributingReaders: number;
  };
  returnBehavior: {
    resumed: number;
    hasntReturned: number;
    contributingReaders: number;
  };
  exitReasons: {
    byCategory: { category: string; initiatedBy: "reader" | "owner"; count: number }[];
    total: number;
  };
};

// ±15% between the first-third and last-third average counts a trend as
// "Building"/"Declining" (or the velocity equivalents) rather than "Steady".
const TREND_THRESHOLD = 0.15;
// A gap of 14+ days between a reader's own engagement timestamps counts as
// a "quiet stretch" for the return-behavior metric.
const QUIET_GAP_DAYS = 14;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function trendVerdict(series: number[], risingLabel: TrendVerdict, fallingLabel: TrendVerdict): TrendVerdict {
  const n = series.length;
  if (n < 3) return "Not enough data";
  const thirds = Math.max(1, Math.floor(n / 3));
  const firstAvg = average(series.slice(0, thirds));
  const lastAvg = average(series.slice(n - thirds));
  if (firstAvg === 0 && lastAvg === 0) return "Not enough data";
  if (firstAvg === 0) return risingLabel;
  const relChange = (lastAvg - firstAvg) / firstAvg;
  if (relChange >= TREND_THRESHOLD) return risingLabel;
  if (relChange <= -TREND_THRESHOLD) return fallingLabel;
  return "Steady";
}

export function computeBetaReaderAnalytics(input: BetaReaderAnalyticsInput): BetaReaderAnalytics {
  const orderedChapters = input.chapters
    .filter((c) => c.chapter_type !== "trigger_page")
    .sort((a, b) => a.chapter_order - b.chapter_order);
  const totalChapters = orderedChapters.length;
  const chapterIndexById = new Map<string, number>();
  orderedChapters.forEach((c, i) => chapterIndexById.set(c.id, i));

  const population = new Set<string>([...input.grantedReaderIds, ...input.requestedReaderIds]);

  // ─── Completion & drop-off ────────────────────────────────────────────────
  const maxIndexByReader = new Map<string, number>();
  for (const c of input.completions) {
    const idx = chapterIndexById.get(c.chapter_id);
    if (idx == null) continue;
    const prev = maxIndexByReader.get(c.reader_id);
    if (prev == null || idx > prev) maxIndexByReader.set(c.reader_id, idx);
  }
  const thirds = Math.max(1, Math.ceil(totalChapters / 3));
  let finishedCount = 0, early = 0, middle = 0, late = 0, noEngagement = 0;
  for (const readerId of population) {
    const maxIdx = maxIndexByReader.get(readerId);
    if (maxIdx == null) { noEngagement++; continue; }
    if (totalChapters > 0 && maxIdx >= totalChapters - 1) { finishedCount++; continue; }
    if (maxIdx < thirds) early++;
    else if (maxIdx < thirds * 2) middle++;
    else late++;
  }
  const populationSize = population.size;

  // ─── Engagement trajectory (feedback density per chapter) ─────────────────
  const densityByIndex = new Array<number>(totalChapters).fill(0);
  const feedbackReaders = new Set<string>();
  for (const f of input.feedback) {
    feedbackReaders.add(f.reader_id);
    if (!f.chapter_id) continue;
    const idx = chapterIndexById.get(f.chapter_id);
    if (idx == null) continue;
    densityByIndex[idx] += 1;
  }

  // ─── Reading velocity (approximate - see module header) ───────────────────
  const readerCompletionEvents = new Map<string, { idx: number; at: number }[]>();
  for (const c of input.completions) {
    const idx = chapterIndexById.get(c.chapter_id);
    if (idx == null) continue;
    const at = new Date(c.completed_at).getTime();
    if (Number.isNaN(at)) continue;
    const arr = readerCompletionEvents.get(c.reader_id) ?? [];
    arr.push({ idx, at });
    readerCompletionEvents.set(c.reader_id, arr);
  }
  const stepGaps: number[][] = [];
  let velocityContributors = 0;
  for (const events of readerCompletionEvents.values()) {
    if (events.length < 2) continue;
    events.sort((a, b) => a.idx - b.idx);
    velocityContributors++;
    for (let i = 0; i < events.length - 1; i++) {
      const gapHours = (events[i + 1].at - events[i].at) / (1000 * 60 * 60);
      if (gapHours < 0) continue;
      (stepGaps[i] ??= []).push(gapHours);
    }
  }
  const velocitySeries = stepGaps.map((g) => average(g));

  // ─── Return behavior (quiet-gap-then-resumed, not literal leave/rejoin) ───
  const quietGapMs = QUIET_GAP_DAYS * 24 * 60 * 60 * 1000;
  const eventsByReader = new Map<string, number[]>();
  const addEvent = (readerId: string, atStr: string) => {
    const at = new Date(atStr).getTime();
    if (Number.isNaN(at)) return;
    (eventsByReader.get(readerId) ?? eventsByReader.set(readerId, []).get(readerId)!).push(at);
  };
  for (const f of input.feedback) addEvent(f.reader_id, f.created_at);
  for (const c of input.completions) addEvent(c.reader_id, c.completed_at);

  const now = Date.now();
  let resumed = 0, hasntReturned = 0, returnContributors = 0;
  for (const raw of eventsByReader.values()) {
    if (raw.length < 2) continue;
    const timestamps = [...raw].sort((a, b) => a - b);
    let qualifies = false;
    let didResume = false;
    for (let i = 0; i < timestamps.length - 1; i++) {
      if (timestamps[i + 1] - timestamps[i] >= quietGapMs) {
        qualifies = true;
        didResume = true;
        break;
      }
    }
    if (!qualifies && now - timestamps[timestamps.length - 1] >= quietGapMs) {
      qualifies = true;
      didResume = false;
    }
    if (!qualifies) continue;
    returnContributors++;
    if (didResume) resumed++; else hasntReturned++;
  }

  // ─── Exit reason breakdown ─────────────────────────────────────────────────
  const byCategoryMap = new Map<string, { category: string; initiatedBy: "reader" | "owner"; count: number }>();
  for (const e of input.exitReasons) {
    const key = `${e.initiated_by}::${e.reason_category}`;
    const existing = byCategoryMap.get(key);
    if (existing) existing.count += 1;
    else byCategoryMap.set(key, { category: e.reason_category, initiatedBy: e.initiated_by, count: 1 });
  }

  return {
    totalChapters,
    completion: {
      populationSize,
      finishedCount,
      finishedPct: populationSize > 0 ? finishedCount / populationSize : null,
      dropOff: { early, middle, late, noEngagement },
    },
    engagementTrend: {
      verdict: trendVerdict(densityByIndex, "Building", "Declining"),
      series: densityByIndex,
      contributingReaders: feedbackReaders.size,
    },
    readingVelocity: {
      // A shrinking gap between completions means readers are moving faster
      // ("Speeding up"); a growing gap means they're slowing down.
      verdict: trendVerdict(velocitySeries, "Slowing down", "Speeding up"),
      series: velocitySeries,
      contributingReaders: velocityContributors,
    },
    returnBehavior: { resumed, hasntReturned, contributingReaders: returnContributors },
    exitReasons: {
      byCategory: Array.from(byCategoryMap.values()).sort((a, b) => b.count - a.count),
      total: input.exitReasons.length,
    },
  };
}
