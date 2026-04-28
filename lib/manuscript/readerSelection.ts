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

  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(node, nodeOffset);
  return {
    offset: prefix.toString().length,
    node: node as Text,
    nodeOffset,
  };
}

export function createRangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startNodeOffset = 0;
  let endNodeOffset = 0;
  let current: Node | null;

  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const length = textNode.textContent?.length ?? 0;
    if (!startNode && currentOffset + length >= start) {
      startNode = textNode;
      startNodeOffset = Math.max(0, start - currentOffset);
    }
    if (!endNode && currentOffset + length >= end) {
      endNode = textNode;
      endNodeOffset = Math.max(0, end - currentOffset);
      break;
    }
    currentOffset += length;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}

export function readTextFromOffsets(root: HTMLElement, start: number, end: number): string | null {
  const text = root.textContent ?? "";
  if (start < 0 || end <= start || end > text.length) return null;
  return text.slice(start, end);
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

  const fullText = root.textContent ?? "";
  const rawText = fullText.slice(start, end);
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
