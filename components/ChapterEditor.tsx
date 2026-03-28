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
      // Don't escape — content may contain inline HTML formatting (<strong>, <em>, <u>, <s>)
      const html = b.replace(/\n/g, "<br>");
      const prev = blocks[i - 1];
      const noIndent = i === 0 || prev === "***";
      return noIndent ? `<p data-no-indent="1">${html}</p>` : `<p>${html}</p>`;
    })
    .join("");
}

// Walk a DOM node and reconstruct clean inline-formatted HTML
function readNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  const children = Array.from(node.childNodes).map(readNode).join("");
  switch (tag) {
    case "strong": case "b": return `<strong>${children}</strong>`;
    case "em":     case "i": return `<em>${children}</em>`;
    case "u":               return `<u>${children}</u>`;
    case "s": case "del": case "strike": return `<s>${children}</s>`;
    default: return children; // strip span, div, etc. but keep their text
  }
}

function readPara(p: Element): string {
  return Array.from(p.childNodes).map(readNode).join("").replace(/\n$/, "");
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

// ── Google Docs / HTML paste sanitizer ───────────────────────────────────────

function processInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  const style = node.getAttribute("style") ?? "";
  const bold      = tag === "b" || tag === "strong" || /font-weight\s*:\s*(bold|[6-9]\d\d)/i.test(style);
  const italic    = tag === "i" || tag === "em"     || /font-style\s*:\s*italic/i.test(style);
  const underline = tag === "u"                     || /text-decoration[^;:]*:\s*[^;]*\bunderline\b/i.test(style);
  const strike    = ["s","del","strike"].includes(tag) || /text-decoration[^;:]*:\s*[^;]*\bline-through\b/i.test(style);
  let content = Array.from(node.childNodes).map(processInlineNode).join("");
  if (!content) return "";
  if (strike)    content = `<s>${content}</s>`;
  if (underline) content = `<u>${content}</u>`;
  if (italic)    content = `<em>${content}</em>`;
  if (bold)      content = `<strong>${content}</strong>`;
  return content;
}

function processBlockElement(el: Element, out: string[]) {
  const tag = el.tagName.toLowerCase();
  if (["p","h1","h2","h3","h4","h5","h6"].includes(tag)) {
    const c = Array.from(el.childNodes).map(processInlineNode).join("").trim();
    if (c) out.push(c);
  } else if (tag === "li") {
    const c = Array.from(el.childNodes).map(processInlineNode).join("").trim();
    if (c) out.push(c);
  } else if (tag === "ul" || tag === "ol") {
    for (const child of Array.from(el.children)) processBlockElement(child, out);
  } else if (tag === "div") {
    const hasBlocks = Array.from(el.children).some((c) =>
      ["p","h1","h2","h3","h4","h5","h6","ul","ol","li","div"].includes(c.tagName.toLowerCase())
    );
    if (hasBlocks) {
      for (const child of Array.from(el.children)) processBlockElement(child, out);
    } else {
      const c = Array.from(el.childNodes).map(processInlineNode).join("").trim();
      if (c) out.push(c);
    }
  }
}

function sanitizeGoogleDocsHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const paragraphs: string[] = [];
  for (const child of Array.from(doc.body.children)) processBlockElement(child, paragraphs);
  return paragraphs.join("\n\n");
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

  function execFormat(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    if (ref.current) emit(ref.current);
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

    const isMod = e.ctrlKey || e.metaKey;

    // Formatting shortcuts — intercept before browser/OS handles them
    if (isMod && (e.key === "b" || e.key === "B")) { e.preventDefault(); document.execCommand("bold", false); emit(el); return; }
    if (isMod && (e.key === "i" || e.key === "I")) { e.preventDefault(); document.execCommand("italic", false); emit(el); return; }
    if (isMod && (e.key === "u" || e.key === "U")) { e.preventDefault(); document.execCommand("underline", false); emit(el); return; }

    // Enter → new paragraph
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ensureParagraphWrap(el);
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const curP = currentParagraph(el);
      if (!curP) return;
      const isSceneBreak = curP.hasAttribute("data-scene-break");
      const after = document.createRange();
      after.setStart(range.startContainer, range.startOffset);
      after.setEnd(curP, curP.childNodes.length);
      const frag = after.extractContents();
      const newP = document.createElement("p");
      newP.appendChild(frag);
      if (!newP.textContent?.trim() && !newP.querySelector("br")) newP.innerHTML = "<br>";
      if (!curP.textContent?.trim() && !curP.querySelector("br")) curP.innerHTML = "<br>";
      if (isSceneBreak) newP.setAttribute("data-no-indent", "1");
      curP.after(newP);
      placeCaretAt(newP, false);
      emit(el);
      return;
    }

    if (e.key === "Enter" && e.shiftKey) {
      setTimeout(() => { if (ref.current) emit(ref.current); }, 0);
      return;
    }

    if (e.key === "Tab") { e.preventDefault(); return; }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;

    // Try HTML first (Google Docs, Word, etc.)
    const htmlData = e.clipboardData.getData("text/html");
    if (htmlData) {
      const sanitized = sanitizeGoogleDocsHtml(htmlData);
      if (sanitized.trim()) {
        insertParsedBlocks(el, sanitized);
        return;
      }
    }

    // Fall back to plain text
    const plain = e.clipboardData.getData("text/plain");
    if (!plain) return;
    insertParsedBlocks(el, applyNorm(plain));
  }

  function insertParsedBlocks(el: HTMLElement, text: string) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const blocks = parseBlocks(text);
    if (!blocks.length) return;

    const curP = currentParagraph(el);

    if (!curP) {
      blocks.forEach((block, i) => {
        const p = document.createElement("p");
        if (block === "***") { p.setAttribute("data-scene-break", "1"); p.textContent = "***"; }
        else {
          if (i === 0) p.setAttribute("data-no-indent", "1");
          p.innerHTML = block;
        }
        el.appendChild(p);
      });
      emit(el);
      return;
    }

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(curP, curP.childNodes.length);
    const afterFrag = afterRange.extractContents();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(afterFrag);
    const afterHtml = Array.from(tempDiv.childNodes).map(readNode).join("").replace(/\n$/, "");

    const [first, ...rest] = blocks;
    const prefix = readPara(curP).trimEnd();
    curP.innerHTML = prefix + (first ?? "");
    if (!curP.textContent) curP.innerHTML = "<br>";

    let lastP: HTMLElement = curP;
    let prevBlock = first ?? "";
    for (const block of rest) {
      const p = document.createElement("p");
      if (block === "***") { p.setAttribute("data-scene-break", "1"); p.textContent = "***"; }
      else {
        if (prevBlock === "***") p.setAttribute("data-no-indent", "1");
        p.innerHTML = block;
      }
      lastP.after(p);
      lastP = p;
      prevBlock = block;
    }

    if (afterHtml.trim()) {
      lastP.innerHTML = (lastP.innerHTML ?? "") + afterHtml;
    } else if (!lastP.textContent) {
      lastP.innerHTML = "<br>";
    }

    placeCaretAt(lastP, !afterHtml.trim());
    emit(el);
  }

  const btnBase = "px-2 py-0.5 rounded text-sm border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500 transition select-none";

  return (
    <div className="flex flex-col gap-0">
      {/* Formatting toolbar */}
      <div className="flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-neutral-700 bg-neutral-900/80 px-3 py-2">
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("bold"); }} className={`${btnBase} font-bold`} title="Bold (Ctrl+B)">B</button>
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("italic"); }} className={`${btnBase} italic`} title="Italic (Ctrl+I)">I</button>
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("underline"); }} className={`${btnBase} underline`} title="Underline (Ctrl+U)">U</button>
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("strikeThrough"); }} className={`${btnBase} line-through`} title="Strikethrough">S</button>
        <div className="w-px bg-neutral-700 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("superscript"); }} className={btnBase} title="Superscript">x²</button>
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("subscript"); }} className={btnBase} title="Subscript">x₂</button>
        <div className="w-px bg-neutral-700 mx-1" />
        <button onMouseDown={(e) => { e.preventDefault(); execFormat("removeFormat"); }} className={btnBase} title="Clear formatting">✕ Format</button>
      </div>

      {/* Editor */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={handleInput}
        data-placeholder={placeholder ?? ""}
        className={`chapter-editor rounded-t-none ${className ?? ""}`}
      />
    </div>
  );
}
