"use client";

import { useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
};

type WrapOptions = {
  prefix: string;
  suffix: string;
  placeholder: string;
};

function wrapSelection(textarea: HTMLTextAreaElement, opts: WrapOptions) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);
  const next = `${opts.prefix}${selected || opts.placeholder}${opts.suffix}`;
  textarea.setRangeText(next, start, end, "end");
  textarea.focus();
}

function normalizeBlockSpacing(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textFromNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(textFromNode).join("");

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children}**`;
  if (tag === "em" || tag === "i") return `*${children}*`;
  if (tag === "code") return `\`${children}\``;
  if (tag === "a") return `[${children}](${node.getAttribute("href") ?? ""})`;

  if (tag === "h1") return `# ${children}\n\n`;
  if (tag === "h2") return `## ${children}\n\n`;
  if (tag === "h3") return `### ${children}\n\n`;
  if (tag === "blockquote") {
    return `${children
      .split("\n")
      .map((line) => (line.trim() ? `> ${line}` : ">"))
      .join("\n")}\n\n`;
  }

  if (tag === "li") return `- ${children}\n`;
  if (tag === "ul") return `${children}\n`;
  if (tag === "ol") {
    const items = Array.from(node.children).filter((n) => n.tagName.toLowerCase() === "li");
    if (items.length === 0) return `${children}\n`;
    return `${items
      .map((item, idx) => `${idx + 1}. ${normalizeBlockSpacing(textFromNode(item))}`)
      .join("\n")}\n\n`;
  }

  if (tag === "p" || tag === "div") return `${children}\n\n`;
  if (tag === "pre") return `\`\`\`\n${children}\n\`\`\`\n\n`;
  return children;
}

function htmlToMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result = Array.from(doc.body.childNodes).map(textFromNode).join("");
  return normalizeBlockSpacing(result);
}

function normalizeProseContent(raw: string): string {
  if (!raw.trim()) return raw;
  const normalized = raw.replace(/\r\n/g, "\n");
  const hasDoubleNewlines = /\n\s*\n/.test(normalized);
  const separator = hasDoubleNewlines ? /\n\s*\n/ : /\n/;
  return normalized
    .split(separator)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return null;
      return trimmed.startsWith("\t") ? trimmed : "\t" + trimmed;
    })
    .filter(Boolean)
    .join("\n\n");
}

export default function FormattedTextarea({ value, onChange, rows = 6, placeholder, className }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function apply(format: "bold" | "italic" | "h2" | "ul" | "ol" | "quote" | "link") {
    const textarea = ref.current;
    if (!textarea) return;

    if (format === "bold") wrapSelection(textarea, { prefix: "**", suffix: "**", placeholder: "bold text" });
    if (format === "italic") wrapSelection(textarea, { prefix: "*", suffix: "*", placeholder: "italic text" });
    if (format === "h2") wrapSelection(textarea, { prefix: "## ", suffix: "", placeholder: "Heading" });
    if (format === "ul") wrapSelection(textarea, { prefix: "- ", suffix: "", placeholder: "List item" });
    if (format === "ol") wrapSelection(textarea, { prefix: "1. ", suffix: "", placeholder: "List item" });
    if (format === "quote") wrapSelection(textarea, { prefix: "> ", suffix: "", placeholder: "Quoted text" });
    if (format === "link") wrapSelection(textarea, { prefix: "[", suffix: "](https://)", placeholder: "link text" });

    onChange(textarea.value);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const textarea = ref.current;
    if (!textarea) return;
    const html = e.clipboardData.getData("text/html");
    if (!html) return;

    const markdown = htmlToMarkdown(html);
    if (!markdown) return;

    e.preventDefault();
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    textarea.setRangeText(markdown, start, end, "end");
    onChange(textarea.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (e.key === "Tab") {
      e.preventDefault();
      const next = value.slice(0, start) + "\t" + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = start + 1;
        el.selectionEnd = start + 1;
      });
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const insert = "\n\n\t";
      const next = value.slice(0, start) + insert + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = start + insert.length;
        el.selectionEnd = start + insert.length;
      });
    }
  }

  function onBlur() {
    const normalized = normalizeProseContent(value);
    if (normalized !== value) onChange(normalized);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => apply("bold")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Bold</button>
        <button type="button" onClick={() => apply("italic")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Italic</button>
        <button type="button" onClick={() => apply("h2")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Heading</button>
        <button type="button" onClick={() => apply("ul")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Bullets</button>
        <button type="button" onClick={() => apply("ol")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Numbered</button>
        <button type="button" onClick={() => apply("quote")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Quote</button>
        <button type="button" onClick={() => apply("link")} className="h-8 rounded border border-neutral-700 bg-neutral-900/60 px-2 text-xs text-neutral-100">Link</button>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}
