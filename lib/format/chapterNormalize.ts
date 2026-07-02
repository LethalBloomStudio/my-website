// Relative + explicit extension (not the "@/..." alias used elsewhere in the
// app) so this file's own test can import it under node --test, which needs
// this module resolvable without going through Next.js's webpack aliasing.
import { extractVisibleTextFromHtml } from "../manuscript/readerSelection.ts";

/**
 * Strips inline styles, class/id attributes, and non-whitelisted tags from
 * chapter HTML, preserving only the safe inline formatting tags writers use.
 * Whitelist: <strong>, <em>, <u>, <s>, <sup>, <sub>, <br>
 */
export function sanitizeChapterHtml(html: string): string {
  return html
    // Normalize common tag aliases to canonical forms
    .replace(/<b(\s[^>]*)?\/?>/gi, "<strong>").replace(/<\/b>/gi, "</strong>")
    .replace(/<i(\s[^>]*)?\/?>/gi, "<em>").replace(/<\/i>/gi, "</em>")
    .replace(/<(?:del|strike)(\s[^>]*)?\/?>/gi, "<s>").replace(/<\/(?:del|strike)>/gi, "</s>")
    // Strip attributes (inline styles, class, id, etc.) from allowed tags
    .replace(/<(strong|em|u|s|sup|sub)\s[^>]*>/gi, "<$1>")
    // Normalise <br> variants
    .replace(/<br(\s[^>]*)?\/?>/gi, "<br>")
    // Remove all remaining tags (keeps their text content)
    .replace(/<(?!\/?(?:strong|em|u|s|sup|sub|br)\b)[^>]+>/gi, "");
}

function processPastedInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";

  const style = node.getAttribute("style") ?? "";
  const inlineStyleCarrier = ["span", "b", "strong", "i", "em", "u", "s", "del", "strike", "sup", "sub"].includes(tag);
  const bold = tag === "b" || tag === "strong" || (inlineStyleCarrier && /font-weight\s*:\s*(bold|[6-9]\d\d)/i.test(style));
  const italic = tag === "i" || tag === "em" || (inlineStyleCarrier && /font-style\s*:\s*italic/i.test(style));
  const underline = tag === "u" || (inlineStyleCarrier && /text-decoration[^;:]*:\s*[^;]*\bunderline\b/i.test(style));
  const strike = ["s", "del", "strike"].includes(tag) || (inlineStyleCarrier && /text-decoration[^;:]*:\s*[^;]*\bline-through\b/i.test(style));
  const sup = tag === "sup" || (inlineStyleCarrier && /vertical-align\s*:\s*super/i.test(style));
  const sub = tag === "sub" || (inlineStyleCarrier && /vertical-align\s*:\s*sub/i.test(style));

  let content = Array.from(node.childNodes).map(processPastedInlineNode).join("");
  if (!content) return "";

  if (sub) content = `<sub>${content}</sub>`;
  if (sup) content = `<sup>${content}</sup>`;
  if (strike) content = `<s>${content}</s>`;
  if (underline) content = `<u>${content}</u>`;
  if (italic) content = `<em>${content}</em>`;
  if (bold) content = `<strong>${content}</strong>`;

  return content;
}

function readPastedInlineChildren(node: ParentNode): string {
  return Array.from(node.childNodes).map(processPastedInlineNode).join("");
}

const PASTED_BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li"]);

function processPastedBlockElement(el: Element, out: string[]) {
  const tag = el.tagName.toLowerCase();
  if (["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
    const raw = readPastedInlineChildren(el).trim();
    const content = raw.replace(/\n(?!\n)/g, " ").trim();
    if (content) out.push(content);
    return;
  }

  if (tag === "li") {
    const raw = readPastedInlineChildren(el).trim();
    const content = raw.replace(/\n(?!\n)/g, " ").trim();
    if (content) out.push(content);
    return;
  }

  if (tag === "ul" || tag === "ol") {
    for (const child of Array.from(el.children)) processPastedBlockElement(child, out);
    return;
  }

  const hasNestedBlocks = Array.from(el.children).some((child) => PASTED_BLOCK_TAGS.has(child.tagName.toLowerCase()));
  if (hasNestedBlocks) {
    for (const child of Array.from(el.children)) processPastedBlockElement(child, out);
    return;
  }

  if (tag === "div") {
    const divPieces = readPastedInlineChildren(el)
      .split(/\n{1,2}/)
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (divPieces.length > 0) {
      out.push(...divPieces);
    }
    return;
  }

  if (tag === "span") {
    const spanPieces = readPastedInlineChildren(el)
      .split(/\n{2,}/)
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (spanPieces.length > 0) {
      out.push(...spanPieces);
    }
    return;
  }

  const content = processPastedInlineNode(el).trim();
  if (!content) return;

  const pieces = content
    .split(/\n{2,}/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (pieces.length > 0) {
    out.push(...pieces);
  }
}

/**
 * Sanitizes rich HTML pasted into the chapter editor while preserving the
 * inline emphasis users expect to keep from Docs/Word/email.
 */
export function sanitizePastedChapterHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const paragraphs: string[] = [];

  for (const child of Array.from(doc.body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) paragraphs.push(text);
      continue;
    }

    if (child instanceof Element) {
      processPastedBlockElement(child, paragraphs);
    }
  }

  return paragraphs.join("\n\n");
}

/**
 * Normalizes raw chapter text into clean fiction manuscript format.
 *
 * Rules applied (formatting only — prose, voice, and structure are preserved):
 *  - Underscore italics (_word_) → asterisk italics (*word*)
 *  - Scene separator lines (---, ***, * * *, ###, ~~~, etc.) → ***
 *  - Multiple consecutive spaces within a line → single space
 *  - Each paragraph gets a leading tab indent
 *  - Paragraphs separated by a blank line (double newline)
 *  - Old content with only single newlines: each line becomes its own paragraph
 *  - Scene breaks (***) are not indented — they stand alone between paragraphs
 */
export function normalizeChapterText(raw: string): string {
  if (!raw.trim()) return raw;

  let text = raw.replace(/\r\n/g, "\n");

  // Normalize underscore italic markers to asterisk (Word / Google Docs style)
  text = text.replace(/_([^_\n]+)_/g, "*$1*");

  // Normalize scene separator lines to ***
  // Matches lines containing only separator characters: - * ~ # = and spaces/tabs
  text = text.replace(/^[ \t]*[-*~#=][ \t*~#=-]{2,}[ \t]*$/gm, "***");

  // Collapse multiple spaces within a line (preserve newlines)
  text = text.replace(/[^\S\n]{2,}/g, " ");

  // Detect paragraph structure
  const hasDoubleNewlines = /\n[ \t]*\n/.test(text);
  const separator = hasDoubleNewlines ? /\n[ \t]*\n/ : /\n/;

  const blocks = text
    .split(separator)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      // Scene separators stand alone — no indent
      if (block === "***") return "***";
      // All other paragraphs get a leading tab indent
      return block.startsWith("\t") ? block : "\t" + block;
    })
    .join("\n\n");
}

/**
 * Converts the chapter plain-text format (as stored by ChapterEditor's domToText)
 * into the exact same HTML that ChapterEditor renders in the DOM.
 *
 * Handles:
 *  - First paragraph and post-scene-break paragraphs → data-no-indent="1"
 *  - Scene breaks (***) → data-scene-break="1"
 *  - Soft breaks (\n within a block) → <br>
 *
 * Use this to render a read-only preview that is pixel-identical to the editor view.
 */
function splitChapterBlocks(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/\n\n/)
    .map((b) => b.replace(/^\t/, "").trim())
    .filter(Boolean);
}

export function chapterTextToPreviewHtml(text: string): string {
  const blocks = splitChapterBlocks(text);
  if (!blocks.length) return "";
  return blocks
    .map((b, i) => {
      if (b === "***") return `<p data-scene-break="1">***</p>`;
      const html = sanitizeChapterHtml(b).replace(/\n/g, "<br>");
      const prev = blocks[i - 1];
      const noIndent = i === 0 || prev === "***";
      return noIndent ? `<p data-no-indent="1">${html}</p>` : `<p>${html}</p>`;
    })
    .join("");
}

/**
 * Twin of chapterTextToPreviewHtml that produces the plain text a reader's
 * browser actually ends up with once that HTML is rendered - same block
 * split, same per-block sanitize/soft-break handling, but projected through
 * extractVisibleTextFromHtml (tags -> nothing, <br> -> one space) instead of
 * wrapped in markup, and joined with NO separator between paragraphs, since
 * that's what chapterTextToPreviewHtml's own join("") produces in the DOM -
 * there is no whitespace between adjacent <p> elements to inherit.
 *
 * Use this (not a raw extractVisibleTextFromHtml(rawContent) call) wherever
 * matching logic can't reach a live DOM to read from directly - e.g. a list
 * spanning many chapters at once, most of which have no mounted DOM. Where a
 * live DOM the reader/editor is genuinely showing right now is available,
 * prefer extractVisibleText(container) directly instead of this function, so
 * there's one fewer implementation of "what does the reader actually see."
 */
export function chapterTextToPlainText(text: string): string {
  const blocks = splitChapterBlocks(text);
  return blocks
    .map((b) => {
      if (b === "***") return "***";
      return extractVisibleTextFromHtml(sanitizeChapterHtml(b).replace(/\n/g, "<br>"));
    })
    .join("");
}
