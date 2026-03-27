"use client";

import { useEffect, useRef } from "react";
import { normalizeChapterText } from "@/lib/format/chapterNormalize";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  normalize?: (raw: string) => string;
};

// ── Text ↔ DOM helpers ────────────────────────────────────────────────────────

function parseBlocks(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/\n\n/)
    .map((b) => b.replace(/^\t/, "").trim())
    .filter(Boolean);
}

function textToHtml(text: string): string {
  const blocks = parseBlocks(text);
  if (!blocks.length) return "";
  return blocks
    .map((b, i) => {
      if (b === "***") return `<p data-scene-break="1">***</p>`;
      const esc = b
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      // No indent: first paragraph or paragraph immediately after a scene break
      const prev = blocks[i - 1];
      const noIndent = i === 0 || prev === "***";
      return noIndent ? `<p data-no-indent="1">${esc}</p>` : `<p>${esc}</p>`;
    })
    .join("");
}

function readPara(p: Element): string {
  let t = "";
  for (const n of Array.from(p.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? "";
    else if (n instanceof HTMLElement) t += n.tagName === "BR" ? "\n" : (n.textContent ?? "");
  }
  return t.replace(/\n$/, ""); // browsers append trailing \n to contenteditable blocks
}

function domToText(el: HTMLElement): string {
  const blocks: string[] = [];
  for (const child of Array.from(el.children)) {
    if (child.tagName !== "P") continue;
    const t = readPara(child).trim();
    if (t) blocks.push(t === "***" ? "***" : "\t" + t);
  }
  return blocks.join("\n\n");
}

// ── Caret utilities ───────────────────────────────────────────────────────────

function saveCaret(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(root);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().length;
}

function restoreCaret(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let rem = offset;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length ?? 0;
    if (rem <= len) {
      const r = document.createRange();
      r.setStart(node, rem);
      r.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      return;
    }
    rem -= len;
  }
  // fallback: end of content
  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(r);
}

function currentParagraph(el: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  let node: Node | null = sel.getRangeAt(0).startContainer;
  while (node && node !== el) {
    if (node instanceof HTMLElement && node.tagName === "P") return node;
    node = node.parentNode;
  }
  return null;
}

function placeCaretAt(p: HTMLElement, atEnd = false) {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  if (atEnd) {
    let last: Text | null = null;
    while (walker.nextNode()) last = walker.currentNode as Text;
    if (last) { r.setStart(last, last.length); }
    else { r.selectNodeContents(p); r.collapse(false); }
  } else {
    const first = walker.nextNode() as Text | null;
    if (first) { r.setStart(first, 0); }
    else { r.setStart(p, 0); }
  }
  r.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

// ── Ensure paragraphs ─────────────────────────────────────────────────────────
// Browsers insert text directly into the contenteditable div when the editor is
// empty. This helper wraps any such loose nodes into a <p> so the Enter handler
// always has a paragraph to split.
function ensureParagraphWrap(el: HTMLElement) {
  const loose: Node[] = [];
  for (const child of Array.from(el.childNodes)) {
    const isP = child instanceof HTMLElement && child.tagName === "P";
    if (!isP) loose.push(child);
  }
  if (!loose.length) return;
  const p = document.createElement("p");
  p.setAttribute("data-no-indent", "1");
  for (const node of loose) p.appendChild(node);
  if (!p.textContent?.trim() && !p.querySelector("br")) p.innerHTML = "<br>";
  el.insertBefore(p, el.firstChild);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChapterEditor({ value, onChange, placeholder, className, normalize }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");
  const applyNorm = normalize ?? normalizeChapterText;

  // Sync external value → DOM (skip when we emitted the value ourselves)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    const focused = el === document.activeElement || el.contains(document.activeElement);
    const offset = focused ? saveCaret(el) : -1;
    el.innerHTML = textToHtml(value);
    lastEmitted.current = value;
    if (focused && offset >= 0) restoreCaret(el, offset);
  }, [value]);

  function emit(el: HTMLElement) {
    const t = domToText(el);
    lastEmitted.current = t;
    onChange(t);
  }

  function handleInput() {
    const el = ref.current;
    if (!el) return;
    ensureParagraphWrap(el);
    emit(el);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    // Enter → new paragraph <p>
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Wrap any loose text nodes before splitting
      ensureParagraphWrap(el);
      const range = sel.getRangeAt(0);
      range.deleteContents();

      const curP = currentParagraph(el);
      if (!curP) return;

      const isSceneBreak = curP.hasAttribute("data-scene-break");

      // Extract everything after the cursor into a new <p>
      const after = document.createRange();
      after.setStart(range.startContainer, range.startOffset);
      after.setEnd(curP, curP.childNodes.length);
      const frag = after.extractContents();

      const newP = document.createElement("p");
      newP.appendChild(frag);
      if (!newP.textContent?.trim() && !newP.querySelector("br")) {
        newP.innerHTML = "<br>";
      }
      if (!curP.textContent?.trim() && !curP.querySelector("br")) {
        curP.innerHTML = "<br>";
      }

      // Paragraph immediately after a scene break gets no indent
      if (isSceneBreak) {
        newP.setAttribute("data-no-indent", "1");
      }

      curP.after(newP);
      placeCaretAt(newP, false);
      emit(el);
      return;
    }

    // Shift+Enter → let browser insert <br>, then emit
    if (e.key === "Enter" && e.shiftKey) {
      setTimeout(() => { if (ref.current) emit(ref.current); }, 0);
      return;
    }

    // Tab → no-op (indentation is handled by CSS text-indent)
    if (e.key === "Tab") {
      e.preventDefault();
      return;
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const plain = e.clipboardData.getData("text/plain");
    if (!plain) return;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const normalized = applyNorm(plain);
    const blocks = parseBlocks(normalized);
    if (!blocks.length) return;

    const curP = currentParagraph(el);

    if (!curP) {
      blocks.forEach((block, i) => {
        const p = document.createElement("p");
        if (block === "***") { p.setAttribute("data-scene-break", "1"); p.textContent = "***"; }
        else {
          if (i === 0) p.setAttribute("data-no-indent", "1");
          p.textContent = block;
        }
        el.appendChild(p);
      });
      emit(el);
      return;
    }

    // Split current paragraph at cursor
    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(curP, curP.childNodes.length);
    const afterText = afterRange.extractContents().textContent ?? "";

    // First block merges with text already in current paragraph
    const [first, ...rest] = blocks;
    const prefix = curP.textContent?.trimEnd() ?? "";
    curP.textContent = prefix + (first ?? "");
    if (!curP.textContent) curP.innerHTML = "<br>";

    let lastP: HTMLElement = curP;
    let prevBlock = first ?? "";
    for (const block of rest) {
      const p = document.createElement("p");
      if (block === "***") { p.setAttribute("data-scene-break", "1"); p.textContent = "***"; }
      else {
        if (prevBlock === "***") p.setAttribute("data-no-indent", "1");
        p.textContent = block;
      }
      lastP.after(p);
      lastP = p;
      prevBlock = block;
    }

    if (afterText.trim()) {
      lastP.textContent = (lastP.textContent ?? "") + afterText;
    } else if (!lastP.textContent) {
      lastP.innerHTML = "<br>";
    }

    placeCaretAt(lastP, !afterText.trim());
    emit(el);
  }

  function handleBlur() {
    const el = ref.current;
    if (!el) return;
    const current = domToText(el);
    const normalized = applyNorm(current);
    if (normalized !== current) {
      el.innerHTML = textToHtml(normalized);
      lastEmitted.current = normalized;
      onChange(normalized);
    }
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onInput={handleInput}
      onBlur={handleBlur}
      data-placeholder={placeholder ?? ""}
      className={`chapter-editor ${className ?? ""}`}
    />
  );
}
