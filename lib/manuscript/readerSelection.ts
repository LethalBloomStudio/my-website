export type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type CaretPoint = {
  offset: number;
};

export type DragSelectionResult = {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  rects: SelectionRect[];
};

export type StoredFeedbackSelection = {
  start: number;
  end: number;
  text: string;
  top: number;
  left: number;
  rects: SelectionRect[];
};

type ReaderCharElement = HTMLElement & {
  dataset: DOMStringMap & {
    readerOffset?: string;
    readerEnd?: string;
  };
};

function getVisibleText(root: HTMLElement): string {
  return root.dataset.readerVisibleText ?? "";
}

function getReaderChars(root: HTMLElement): ReaderCharElement[] {
  return Array.from(root.querySelectorAll<ReaderCharElement>("[data-reader-char='1']"));
}

function getOffsetsFromElement(el: ReaderCharElement): { start: number; end: number } | null {
  const start = Number(el.dataset.readerOffset);
  const end = Number(el.dataset.readerEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function rectDistance(rect: DOMRect, clientX: number, clientY: number): number {
  const dx =
    clientX < rect.left ? rect.left - clientX :
    clientX > rect.right ? clientX - rect.right :
    0;
  const dy =
    clientY < rect.top ? rect.top - clientY :
    clientY > rect.bottom ? clientY - rect.bottom :
    0;
  return dy * 100000 + dx;
}

function getClosestCharAtPoint(root: HTMLElement, clientX: number, clientY: number): { el: ReaderCharElement; rect: DOMRect } | null {
  const chars = getReaderChars(root);
  let best: { el: ReaderCharElement; rect: DOMRect; score: number } | null = null;

  for (const el of chars) {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    const score = rectDistance(rect, clientX, clientY);
    if (!best || score < best.score) {
      best = { el, rect, score };
    }
  }

  return best ? { el: best.el, rect: best.rect } : null;
}

function mergeRects(rects: DOMRect[]): DOMRect[] {
  if (rects.length === 0) return [];
  const sorted = [...rects].sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const merged: DOMRect[] = [];

  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(rect);
      continue;
    }

    const sameLine = Math.abs(last.top - rect.top) < 2 && Math.abs(last.height - rect.height) < 2;
    const touching = rect.left <= last.right + 2;
    if (sameLine && touching) {
      merged[merged.length - 1] = new DOMRect(
        Math.min(last.left, rect.left),
        Math.min(last.top, rect.top),
        Math.max(last.right, rect.right) - Math.min(last.left, rect.left),
        Math.max(last.bottom, rect.bottom) - Math.min(last.top, rect.top),
      );
      continue;
    }

    merged.push(rect);
  }

  return merged;
}

function getRectsForOffsets(root: HTMLElement, start: number, end: number): SelectionRect[] {
  const rootRect = root.getBoundingClientRect();
  const rects = getReaderChars(root)
    .map((el) => {
      const offsets = getOffsetsFromElement(el);
      if (!offsets) return null;
      if (offsets.end <= start || offsets.start >= end) return null;
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      return rect;
    })
    .filter((rect): rect is DOMRect => !!rect);

  return mergeRects(rects).map((rect) => ({
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
  }));
}

function trimSelectionText(visibleText: string, start: number, end: number): { start: number; end: number; text: string } | null {
  if (end <= start) return null;
  const rawText = visibleText.slice(start, end);
  const trimmedText = rawText.trim();
  if (!trimmedText) return null;

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const trailingWhitespace = rawText.length - rawText.trimEnd().length;
  const nextStart = start + leadingWhitespace;
  const nextEnd = end - trailingWhitespace;
  if (nextEnd <= nextStart) return null;

  return {
    start: nextStart,
    end: nextEnd,
    text: visibleText.slice(nextStart, nextEnd),
  };
}

function buildSelectionFromOffsets(root: HTMLElement, startOffset: number, endOffset: number): DragSelectionResult | null {
  const visibleText = getVisibleText(root);
  const trimmed = trimSelectionText(visibleText, Math.min(startOffset, endOffset), Math.max(startOffset, endOffset));
  if (!trimmed) return null;

  const rects = getRectsForOffsets(root, trimmed.start, trimmed.end);
  if (rects.length === 0) return null;

  const anchorRect = rects[rects.length - 1];
  return {
    text: trimmed.text,
    start: trimmed.start,
    end: trimmed.end,
    x: anchorRect.left + anchorRect.width / 2,
    y: anchorRect.top,
    rects,
  };
}

function findNearestExcerptIndex(text: string, excerpt: string, targetOffset?: number): number {
  if (!excerpt) return -1;
  if (targetOffset == null) return text.indexOf(excerpt);

  const matches: number[] = [];
  let fromIndex = 0;
  while (fromIndex <= text.length) {
    const idx = text.indexOf(excerpt, fromIndex);
    if (idx === -1) break;
    matches.push(idx);
    fromIndex = idx + 1;
  }
  if (matches.length === 0) return -1;

  let bestIdx = matches[0];
  let bestDistance = Math.abs(matches[0] - targetOffset);
  for (const idx of matches) {
    const distance = Math.abs(idx - targetOffset);
    if (distance < bestDistance) {
      bestIdx = idx;
      bestDistance = distance;
    }
  }
  return bestIdx;
}

export function getCaretPointFromClientPoint(root: HTMLElement, clientX: number, clientY: number): CaretPoint | null {
  const closest = getClosestCharAtPoint(root, clientX, clientY);
  if (!closest) return null;
  const offsets = getOffsetsFromElement(closest.el);
  if (!offsets) return null;
  const midpoint = closest.rect.left + closest.rect.width / 2;
  return {
    offset: clientX <= midpoint ? offsets.start : offsets.end,
  };
}

export function buildDragSelection(root: HTMLElement, startOffset: number, endOffset: number, _viewportWidth: number): DragSelectionResult | null {
  return buildSelectionFromOffsets(root, startOffset, endOffset);
}

export function buildStoredFeedbackSelection(
  root: HTMLElement,
  excerpt: string | null | undefined,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined,
): StoredFeedbackSelection | null {
  const expected = (excerpt ?? "").trim();
  if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset) {
    const selection = buildSelectionFromOffsets(root, startOffset, endOffset);
    if (selection && (!expected || selection.text === expected)) {
      const anchorRect = selection.rects[selection.rects.length - 1];
      return {
        start: selection.start,
        end: selection.end,
        text: selection.text,
        top: anchorRect.top,
        left: anchorRect.left + anchorRect.width,
        rects: selection.rects,
      };
    }
  }

  if (!expected) return null;

  const visibleText = getVisibleText(root);
  const matchIndex = findNearestExcerptIndex(
    visibleText,
    expected,
    typeof startOffset === "number" ? Math.max(0, startOffset) : undefined,
  );
  if (matchIndex === -1) return null;

  const selection = buildSelectionFromOffsets(root, matchIndex, matchIndex + expected.length);
  if (!selection || selection.text !== expected) return null;

  const anchorRect = selection.rects[selection.rects.length - 1];
  return {
    start: selection.start,
    end: selection.end,
    text: selection.text,
    top: anchorRect.top,
    left: anchorRect.left + anchorRect.width,
    rects: selection.rects,
  };
}
