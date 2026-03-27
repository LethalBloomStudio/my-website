/**
 * Manuscript normalization utilities
 *
 * Goals:
 * - Preserve author wording exactly; only adjust whitespace/structure for display.
 * - Make pasted content orderly: normalize line endings, collapse runaway blank lines, clean indentation.
 * - Detect scene breaks ("***", "#", etc.) and keep them explicit.
 * - Sanitize any pasted HTML to plain text to prevent unsafe markup injection.
 */

export type SceneNode =
  | { type: "paragraph"; text: string }
  | { type: "scene-break"; marker: string };

/**
 * Strip and normalize HTML pasted from Word/Docs/Email.
 * We intentionally keep only text content while converting block separators to newlines.
 * Rationale: pasted rich text often brings inline styles/scripts that can break layout or be unsafe.
 */
export function sanitizePastedHtml(html: string): string {
  // Drop script/style tags entirely
  const withoutDanger = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Replace block-level tags with newlines to preserve rough structure
  const blockToNl = withoutDanger.replace(/<(\/?(p|div|br|li|ul|ol|h[1-6]))[^>]*>/gi, (match) => {
    if (/^<br/i.test(match)) return "\n";
    if (/^<\//.test(match)) return "\n";
    return "\n";
  });

  // Remove remaining tags but keep text
  const stripped = blockToNl.replace(/<[^>]+>/g, "");

  // Decode a few common entities
  return stripped
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

export function normalizeManuscriptText(raw: string) {
  let text = raw.replace(/\r\n/g, "\n");
  const original = text;

  // Split into lines for whitespace cleanup.
  const lines = text
    .split("\n")
    // Trim trailing spaces – they add noise when wrapped.
    .map((line) => line.replace(/\s+$/g, ""))
    // Tabs to two spaces for predictable indentation.
    .map((line) => line.replace(/\t/g, "  "))
    // Collapse excessive internal spaces while keeping intentional double-spaces.
    .map((line) => line.replace(/ {3,}/g, "  "));

  // Trim leading/trailing blank lines to avoid accidental giant gaps.
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const cleanedLines: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      // Collapse multiple blank lines into a single blank line (paragraph gap).
      if (cleanedLines.at(-1)?.trim() === "") continue;
      cleanedLines.push("");
    } else {
      // Remove left padding unless the line is intentionally indented (two spaces only).
      const trimmedLeft = line.replace(/^ {3,}/, "  ");
      cleanedLines.push(trimmedLeft);
    }
  }

  text = cleanedLines.join("\n");
  return { text, cleaned: text !== original };
}

/**
 * Parse normalized manuscript text into semantic nodes for rendering.
 * We keep paragraphs intact and mark scene breaks explicitly.
 */
export function parseManuscriptForPreview(text: string): SceneNode[] {
  const lines = text.split("\n");
  const nodes: SceneNode[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    nodes.push({ type: "paragraph", text: buffer.join(" ").trim() });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isScene = line === "***" || line === "#" || line === "---" || line === "—" || line === "— • —";
    if (isScene) {
      flushParagraph();
      nodes.push({ type: "scene-break", marker: line });
      continue;
    }
    if (line === "") {
      flushParagraph();
      continue;
    }
    buffer.push(rawLine.trimStart());
  }
  flushParagraph();
  return nodes;
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
