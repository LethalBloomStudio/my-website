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
export function chapterTextToPreviewHtml(text: string): string {
  if (!text.trim()) return "";
  const blocks = text
    .split(/\n\n/)
    .map((b) => b.replace(/^\t/, "").trim())
    .filter(Boolean);
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
