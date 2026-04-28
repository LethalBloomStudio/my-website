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

type ParagraphMeta = {
  element: HTMLElement;
  isSceneBreak: boolean;
  storageStart: number;
  storageLength: number;
  visualLength: number;
};

type DomPoint = {
  node: Node;
  offset: number;
};

function paragraphElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "P",
  );
}

function isSceneBreakParagraph(paragraph: HTMLElement): boolean {
  return paragraph.dataset.sceneBreak === "1";
}

function countVisualText(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (!(node instanceof HTMLElement)) return 0;
  if (node.tagName === "BR") return 1;
  let total = 0;
  for (const child of Array.from(node.childNodes)) total += countVisualText(child);
  return total;
}

function buildParagraphMap(root: HTMLElement): ParagraphMeta[] {
  const paragraphs = paragraphElements(root);
  const metas: ParagraphMeta[] = [];
  let storageCursor = 0;
  paragraphs.forEach((paragraph, index) => {
    const sceneBreak = isSceneBreakParagraph(paragraph);
    const visualLength = countVisualText(paragraph);
    const storageLength = sceneBreak ? visualLength : visualLength + 1;
    metas.push({
      element: paragraph,
      isSceneBreak: sceneBreak,
      storageStart: storageCursor,
      storageLength,
      visualLength,
    });
    storageCursor += storageLength;
    if (index < paragraphs.length - 1) storageCursor += 2;
  });
  return metas;
}

function paragraphForNode(node: Node, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.tagName === "P" && current.parentElement === root) return current;
    current = current.parentNode;
  }
  return null;
}

function countVisualOffsetInParagraph(paragraph: HTMLElement, targetNode: Node, targetOffset: number): number | null {
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
        total += countVisualText(children[i]);
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

  return walk(paragraph) ? total : null;
}

function domPointForVisualOffset(paragraph: HTMLElement, visualOffset: number): DomPoint {
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

  const point = walk(paragraph);
  if (point) return point;
  return { node: paragraph, offset: paragraph.childNodes.length };
}

function storageOffsetFromDomPoint(root: HTMLElement, node: Node, nodeOffset: number): number | null {
  const paragraph = paragraphForNode(node, root);
  if (!paragraph) return null;
  const map = buildParagraphMap(root);
  const meta = map.find((entry) => entry.element === paragraph);
  if (!meta) return null;
  const visualOffset = countVisualOffsetInParagraph(paragraph, node, nodeOffset);
  if (visualOffset == null) return null;
  return meta.storageStart + (meta.isSceneBreak ? visualOffset : visualOffset + 1);
}

function paragraphMetaForStorageOffset(map: ParagraphMeta[], offset: number): { meta: ParagraphMeta; localOffset: number } | null {
  for (const meta of map) {
    const end = meta.storageStart + meta.storageLength;
    if (offset <= end) {
      return { meta, localOffset: offset - meta.storageStart };
    }
  }
  const last = map[map.length - 1];
  if (!last) return null;
  return { meta: last, localOffset: last.storageLength };
}

function createRangeFromStorageOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const map = buildParagraphMap(root);
  if (!map.length || end <= start) return null;

  const startMeta = paragraphMetaForStorageOffset(map, start);
  const endMeta = paragraphMetaForStorageOffset(map, end);
  if (!startMeta || !endMeta) return null;

  const startVisual = Math.max(0, Math.min(startMeta.meta.visualLength, startMeta.localOffset - (startMeta.meta.isSceneBreak ? 0 : 1)));
  const endVisual = Math.max(0, Math.min(endMeta.meta.visualLength, endMeta.localOffset - (endMeta.meta.isSceneBreak ? 0 : 1)));

  const startPoint = domPointForVisualOffset(startMeta.meta.element, startVisual);
  const endPoint = domPointForVisualOffset(endMeta.meta.element, endVisual);
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function manuscriptTextFromStorageOffsets(root: HTMLElement, start: number, end: number): string | null {
  const map = buildParagraphMap(root);
  if (!map.length || end <= start) return null;
  const remainingStart = start;
  const remainingEnd = end;
  let output = "";

  for (let index = 0; index < map.length; index += 1) {
    const meta = map[index];
    const paragraphText = meta.element.textContent ?? "";
    const storageText = meta.isSceneBreak ? paragraphText : `\t${paragraphText}`;
    const blockStart = meta.storageStart;
    const blockEnd = blockStart + meta.storageLength;

    if (remainingEnd <= blockStart) break;
    if (remainingStart < blockEnd && remainingEnd > blockStart) {
      const sliceStart = Math.max(0, remainingStart - blockStart);
      const sliceEnd = Math.min(storageText.length, remainingEnd - blockStart);
      output += storageText.slice(sliceStart, sliceEnd);
    }

    const separatorStart = blockEnd;
    const separatorEnd = separatorStart + (index < map.length - 1 ? 2 : 0);
    if (remainingEnd > separatorStart && remainingStart < separatorEnd) {
      const separatorSliceStart = Math.max(0, remainingStart - separatorStart);
      const separatorSliceEnd = Math.min(2, remainingEnd - separatorStart);
      output += "\n\n".slice(separatorSliceStart, separatorSliceEnd);
    }
  }

  return output || null;
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
  const offset = storageOffsetFromDomPoint(root, node, nodeOffset);
  if (offset == null) return null;
  return {
    offset,
    node: node as Text,
    nodeOffset,
  };
}

export function createRangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  return createRangeFromStorageOffsets(root, start, end);
}

export function readTextFromOffsets(root: HTMLElement, start: number, end: number): string | null {
  return manuscriptTextFromStorageOffsets(root, start, end);
}

export function buildStoredFeedbackRange(
  root: HTMLElement,
  excerpt: string | null | undefined,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined,
): Range | null {
  if (typeof startOffset === "number" && typeof endOffset === "number" && endOffset > startOffset) {
    const exactRange = createRangeFromStorageOffsets(root, startOffset, endOffset);
    if (exactRange) {
      const exactText = manuscriptTextFromStorageOffsets(root, startOffset, endOffset) ?? "";
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
          const adjustedRange = createRangeFromStorageOffsets(root, adjustedStart, adjustedEnd);
          const adjustedText = manuscriptTextFromStorageOffsets(root, adjustedStart, adjustedEnd) ?? "";
          if (adjustedRange && adjustedText === expected) {
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

  const rawText = manuscriptTextFromStorageOffsets(root, start, end);
  if (!rawText) return null;
  const trimmedText = rawText.trim();
  if (!trimmedText) return null;

  const leadingWhitespace = rawText.length - rawText.trimStart().length;
  const trailingWhitespace = rawText.length - rawText.trimEnd().length;
  start += leadingWhitespace;
  end -= trailingWhitespace;
  if (end <= start) return null;

  const range = createRangeFromStorageOffsets(root, start, end);
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
