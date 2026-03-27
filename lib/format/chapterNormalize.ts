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
