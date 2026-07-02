// Single source of truth for "does this feedback excerpt still match the chapter
// text." Pure text in, text out - no DOM dependency, so it runs identically in
// the browser (fed extractVisibleText(container)) and anywhere with only a raw
// HTML string (fed extractVisibleTextFromHtml(chapter.content)).
//
// Consolidates what used to be five independent, disagreeing implementations
// (buildStoredFeedbackRange, two copies of findExcerptRange, the whitespace-
// collapsed card filters, and the tab/dbl-newline-stripped detached checks).

export type AnchorMethod = "offset-exact" | "offset-normalized" | "nearest-raw" | "nearest-normalized" | "none";

export type AnchorResult =
  | { status: "anchored"; start: number; end: number; matchedText: string; method: "offset-exact" }
  | {
      status: "anchored-fuzzy";
      start: number;
      end: number;
      matchedText: string;
      method: "offset-normalized" | "nearest-raw" | "nearest-normalized";
    }
  | { status: "not-found"; method: "none" };

// Below this length, a whole-document fuzzy search is too ambiguous to trust
// regardless of distance - see the audit: p50 excerpt length among the rows
// that only pass via whitespace-collapsed matching was ~22 chars, and the
// short end of that distribution is where occurrence counts spike (a 4-char
// excerpt can occur dozens of times in one chapter).
const MIN_EXCERPT_LENGTH_FOR_WHOLE_DOC_SEARCH = 20;

// When multiple occurrences exist and we must pick by proximity to the stored
// offset, only accept the nearest one if it's decisively closer than the
// runner-up. Verified against real data: of 131 multi-occurrence rows in the
// audited dataset, only 2 survive the length gate above, and both score well
// under this threshold (~0.04 and ~0.16) - so this ratio is a cheap safety net
// for future rows, not a lever that changes today's outcomes.
const AMBIGUITY_RATIO = 1 / 3;

// Local window (chars each side of the stored offset) searched by tier 2
// before falling back to a whole-document search. Generous enough to absorb
// a sentence's worth of insertion/deletion plus whitespace drift, small enough
// to stay meaningfully "local."
const OFFSET_WINDOW_PAD = 200;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function allOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + 1;
  }
  return positions;
}

// Builds a whitespace-collapsed copy of `raw` alongside a parallel array
// mapping each character of the normalized string back to its origin index in
// `raw`, so a match found in normalized-space can still be converted into
// exact raw offsets for highlighting/Range placement.
function buildNormalizedWithMap(raw: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  let lastWasSpace = true; // treat leading whitespace as already-consumed
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalized += " ";
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      normalized += ch;
      map.push(i);
      lastWasSpace = false;
    }
  }
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }
  return { normalized, map };
}

// Picks the occurrence nearest `referenceOffset`, but refuses to guess when
// there's a competing occurrence too close in distance to confidently prefer
// one over the other. Returns null (caller falls through) when ambiguous or
// when there's no reference point to disambiguate multiple candidates at all.
function pickNearest(positions: number[], referenceOffset: number | null): number | null {
  if (positions.length === 0) return null;
  if (positions.length === 1) return positions[0];
  if (referenceOffset == null) return null;

  const sorted = [...positions].sort(
    (a, b) => Math.abs(a - referenceOffset) - Math.abs(b - referenceOffset),
  );
  const nearestDist = Math.abs(sorted[0] - referenceOffset);
  const secondDist = Math.abs(sorted[1] - referenceOffset);

  if (secondDist === 0) return nearestDist === 0 ? sorted[0] : null;
  return nearestDist / secondDist <= AMBIGUITY_RATIO ? sorted[0] : null;
}

export function resolveFeedbackAnchor(
  excerpt: string,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined,
  chapterText: string,
): AnchorResult {
  if (!excerpt) return { status: "not-found", method: "none" };

  const hasOffsets = typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset;

  // Tier 1: offset-exact - the sliced region matches the stored excerpt byte for byte.
  if (hasOffsets) {
    const slice = chapterText.slice(startOffset as number, endOffset as number);
    if (slice === excerpt) {
      return { status: "anchored", start: startOffset as number, end: endOffset as number, matchedText: slice, method: "offset-exact" };
    }

    // Tier 2: offset-normalized - same region (plus a local pad), whitespace differences ignored.
    const normExcerpt = normalizeWhitespace(excerpt);
    if (normExcerpt) {
      const winStart = Math.max(0, (startOffset as number) - OFFSET_WINDOW_PAD);
      const winEnd = Math.min(chapterText.length, (endOffset as number) + OFFSET_WINDOW_PAD);
      const windowText = chapterText.slice(winStart, winEnd);
      const { normalized: normWindow, map } = buildNormalizedWithMap(windowText);
      const normOccurrences = allOccurrences(normWindow, normExcerpt);
      const picked = pickNearest(
        normOccurrences,
        (startOffset as number) - winStart,
      );
      if (picked != null) {
        const rawStart = winStart + map[picked];
        const rawEndInWindow = map[Math.min(picked + normExcerpt.length - 1, map.length - 1)] + 1;
        const rawEnd = winStart + rawEndInWindow;
        return {
          status: "anchored-fuzzy",
          start: rawStart,
          end: rawEnd,
          matchedText: chapterText.slice(rawStart, rawEnd),
          method: "offset-normalized",
        };
      }
    }
  }

  // Below this point we search the whole document, which is only trustworthy
  // for excerpts long enough to be unambiguous.
  const trimmedExcerpt = excerpt.trim();
  if (trimmedExcerpt.length < MIN_EXCERPT_LENGTH_FOR_WHOLE_DOC_SEARCH) {
    return { status: "not-found", method: "none" };
  }

  const referenceOffset = hasOffsets ? (startOffset as number) : null;

  // Tier 3: nearest-raw - exact substring, anywhere in the document.
  const rawOccurrences = allOccurrences(chapterText, excerpt);
  const rawPicked = pickNearest(rawOccurrences, referenceOffset);
  if (rawPicked != null) {
    const start = rawPicked;
    const end = rawPicked + excerpt.length;
    return { status: "anchored-fuzzy", start, end, matchedText: chapterText.slice(start, end), method: "nearest-raw" };
  }

  // Tier 4: nearest-normalized - whitespace-collapsed substring, anywhere in the document.
  const normExcerptWhole = normalizeWhitespace(excerpt);
  if (normExcerptWhole) {
    const { normalized: normChapter, map: fullMap } = buildNormalizedWithMap(chapterText);
    const normOccurrences = allOccurrences(normChapter, normExcerptWhole);
    const rawStartsByNormIdx = new Map(normOccurrences.map((normIdx) => [fullMap[normIdx], normIdx]));
    const picked = pickNearest([...rawStartsByNormIdx.keys()], referenceOffset);
    if (picked != null) {
      const normIdx = rawStartsByNormIdx.get(picked) as number;
      const start = picked;
      const end = fullMap[Math.min(normIdx + normExcerptWhole.length - 1, fullMap.length - 1)] + 1;
      return {
        status: "anchored-fuzzy",
        start,
        end,
        matchedText: chapterText.slice(start, end),
        method: "nearest-normalized",
      };
    }
  }

  return { status: "not-found", method: "none" };
}
