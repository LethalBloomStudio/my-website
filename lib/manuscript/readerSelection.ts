export type CaretPoint = {
  offset: number;
  node: Text;
  nodeOffset: number;
};

export type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type DragSelectionResult = {
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  rects: SelectionRect[];
};

type DocWithCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node | null; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

type DomPoint = {
  node: Node;
  offset: number;
};

function countVisibleText(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (!(node instanceof HTMLElement)) return 0;
  if (node.tagName === "BR") return 1;
  let total = 0;
  for (const child of Array.from(node.childNodes)) total += countVisibleText(child);
  return total;
}

function visibleOffsetFromDomPoint(root: HTMLElement, targetNode: Node, targetOffset: number): number | null {
  let total = 0;

  function walk(node: Node): boolean {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += targetOffset;
        return true;
      }
      if (node instanceof HTMLElement && node.tagName === "BR") {
        total += Math.min(1, targetOffset);
        return true;
      }
      const children = Array.from(node.childNodes);
      for (let i = 0; i < Math.min(targetOffset, children.length); i += 1) {
        total += countVisibleText(children[i]);
      }
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return false;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      total += 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  }

  return walk(root) ? total : null;
}

function domPointFromVisibleOffset(root: HTMLElement, visualOffset: number): DomPoint {
  let remaining = Math.max(0, visualOffset);

  function walk(node: Node): DomPoint | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) return { node, offset: remaining };
      remaining -= len;
      return null;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      const parent = node.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
      if (remaining === 0) return { node: parent, offset: index };
      if (remaining === 1) {
        remaining = 0;
        return { node: parent, offset: index + 1 };
      }
      remaining -= 1;
      return null;
    }
    for (const child of Array.from(node.childNodes)) {
      const point = walk(child);
      if (point) return point;
    }
    return null;
  }

  const point = walk(root);
  if (point) return point;
  return { node: root, offset: root.childNodes.length };
}

function visibleTextFromOffsets(root: HTMLElement, start: number, end: number): string {
  const range = createRangeFromTextOffsets(root, start, end);
  return range?.toString() ?? "";
}

function getCharacterRect(node: Text, startOffset: number, endOffset: number): DOMRect | null {
  if (startOffset < 0 || endOffset > node.length || endOffset <= startOffset) return null;
  const range = document.createRange();
  range.setStart(node, startOffset);
  range.setEnd(node, endOffset);
  const rect = range.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

function adjustTextOffsetToClick(node: Text, offset: number, clientX: number, clientY: number): number {
  const textLength = node.length;
  const nextOffset = Math.max(0, Math.min(textLength, offset));

  const afterRect = nextOffset < textLength ? getCharacterRect(node, nextOffset, nextOffset + 1) : null;
  if (
    afterRect &&
    clientY >= afterRect.top - 2 &&
    clientY <= afterRect.bottom + 2 &&
    clientX >= afterRect.left &&
    clientX <= afterRect.right
  ) {
    const midpoint = afterRect.left + afterRect.width / 2;
    return clientX > midpoint ? nextOffset + 1 : nextOffset;
  }

  const beforeRect = nextOffset > 0 ? getCharacterRect(node, nextOffset - 1, nextOffset) : null;
  if (
    beforeRect &&
    clientY >= beforeRect.top - 2 &&
    clientY <= beforeRect.bottom + 2 &&
    clientX >= beforeRect.left &&
    clientX <= beforeRect.right
  ) {
    const midpoint = beforeRect.left + beforeRect.width / 2;
    return clientX < midpoint ? nextOffset - 1 : nextOffset;
  }

  return nextOffset;
}

export function getCaretPointFromClientPoint(root: HTMLElement, clientX: number, clientY: number): CaretPoint | null {
  const docWithCaret = document as DocWithCaret;
  const caretPos = docWithCaret.caretPositionFromPoint?.(clientX, clientY) ?? null;
  const caretRange = !caretPos ? docWithCaret.caretRangeFromPoint?.(clientX, clientY) ?? null : null;
  const node = caretPos?.offsetNode ?? caretRange?.startContainer ?? null;
  const rawNodeOffset = caretPos?.offset ?? caretRange?.startOffset ?? 0;
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  const nodeOffset = adjustTextOffsetToClick(node as Text, rawNodeOffset, clientX, clientY);
  const offset = visibleOffsetFromDomPoint(root, node, nodeOffset);
  if (offset == null) return null;
  return {
    offset,
    node: node as Text,
    nodeOffset,
  };
}

export function createRangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  if (end <= start) return null;
  const startPoint = domPointFromVisibleOffset(root, start);
  const endPoint = domPointFromVisibleOffset(root, end);
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

export function readTextFromOffsets(root: HTMLElement, start: number, end: number): string | null {
  if (end <= start) return null;
  return visibleTextFromOffsets(root, start, end) || null;
}

export function buildStoredFeedbackRange(
  root: HTMLElement,
  excerpt: string | null | undefined,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined,
): Range | null {
  if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset) {
    const exactRange = createRangeFromTextOffsets(root, startOffset, endOffset);
    if (exactRange) {
      const exactText = exactRange.toString();
      const expected = (excerpt ?? "").trim();
      if (!expected || exactText === expected) {
        return exactRange;
      }
      if (exactText.trim() === expected) {
        const leadingWhitespace = exactText.length - exactText.trimStart().length;
        const trailingWhitespace = exactText.length - exactText.trimEnd().length;
        const adjustedStart = startOffset + leadingWhitespace;
        const adjustedEnd = endOffset - trailingWhitespace;
        if (adjustedEnd > adjustedStart) {
          const adjustedRange = createRangeFromTextOffsets(root, adjustedStart, adjustedEnd);
          if (adjustedRange && adjustedRange.toString() === expected) {
            return adjustedRange;
          }
        }
      }
    }
  }
  return null;
}

export function buildDragSelection(root: HTMLElement, startOffset: number, endOffset: number, viewportWidth: number): DragSelectionResult | null {
  let start = Math.min(startOffset, endOffset);
  let end = Math.max(startOffset, endOffset);
  if (end <= start) return null;

  const rawText = visibleTextFromOffsets(root, start, end);
  const trimmedText = rawText.trim();
  if (!trimmedText) return null;

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const trailingWhitespace = rawText.length - rawText.trimEnd().length;
  start += leadingWhitespace;
  end -= trailingWhitespace;
  if (end <= start) return null;

  const range = createRangeFromTextOffsets(root, start, end);
  if (!range) return null;

  const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
  const anchorRect = clientRects[clientRects.length - 1] ?? range.getBoundingClientRect();
  if (!anchorRect.width && !anchorRect.height) return null;

  const rootRect = root.getBoundingClientRect();
  const centerX = anchorRect.left + (anchorRect.right - anchorRect.left) / 2;
  const clampedX = Math.min(Math.max(centerX, 152), viewportWidth - 152);

  return {
    text: trimmedText,
    start,
    end,
    x: clampedX,
    y: anchorRect.top,
    rects: clientRects.map((rect) => ({
      top: rect.top - rootRect.top,
      left: rect.left - rootRect.left,
      width: rect.width,
      height: rect.height,
    })),
  };
}
