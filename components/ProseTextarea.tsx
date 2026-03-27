"use client";

import { useRef, useState } from "react";

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

/** Returns the start, end, and text content of the line the cursor is on. */
function getLineAt(text: string, pos: number) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const rawEnd = text.indexOf("\n", pos);
  const lineEnd = rawEnd === -1 ? text.length : rawEnd;
  return { lineStart, lineEnd, content: text.slice(lineStart, lineEnd) };
}

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  name?: string;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Optional custom normalizer. Defaults to the built-in prose normalizer. */
  normalize?: (raw: string) => string;
};

/**
 * Textarea with automatic fiction manuscript formatting:
 * - Enter → new paragraph (blank line + tab indent)
 * - Shift+Enter → plain line break
 * - Tab → tab indent
 * - Blank line between paragraphs is protected: typing on it redirects to the
 *   next paragraph; Backspace on it merges back to the previous paragraph
 * - On paste → immediately normalizes pasted content
 * - On blur → normalizes existing content
 */
export default function ProseTextarea({ value, onChange, defaultValue, name, rows = 4, placeholder, className, normalize }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const isControlled = value !== undefined;

  const [internalValue, setInternalValue] = useState(isControlled ? "" : (defaultValue ?? ""));

  const currentValue = isControlled ? (value as string) : internalValue;
  const setValue = isControlled ? (onChange as (v: string) => void) : setInternalValue;
  const applyNormalize = normalize ?? normalizeProseContent;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    // ── Paragraph separator (Enter) ──────────────────────────────────────────
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const insert = "\n\n\t";
      const next = currentValue.slice(0, start) + insert + currentValue.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        el.selectionStart = start + insert.length;
        el.selectionEnd = start + insert.length;
      });
      return;
    }

    // ── Tab indent ────────────────────────────────────────────────────────────
    if (e.key === "Tab") {
      e.preventDefault();
      const next = currentValue.slice(0, start) + "\t" + currentValue.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        el.selectionStart = start + 1;
        el.selectionEnd = start + 1;
      });
      return;
    }

    // ── Blank-line protection ─────────────────────────────────────────────────
    // If the cursor is sitting on the blank separator line between paragraphs,
    // intercept keys so the gap stays untouchable.
    const { lineStart, lineEnd, content: lineContent } = getLineAt(currentValue, start);
    const onBlankLine = lineContent.trim() === "" && lineStart > 0;

    if (onBlankLine) {
      // Backspace: remove the blank line — cursor goes to end of previous paragraph
      if (e.key === "Backspace") {
        e.preventDefault();
        // Delete from end of previous line (lineStart - 1) through end of blank line
        const removeFrom = lineStart - 1; // the \n that precedes this blank line
        const removeTo = lineEnd;          // end of blank line (before next \n)
        const next = currentValue.slice(0, removeFrom) + currentValue.slice(removeTo);
        setValue(next);
        requestAnimationFrame(() => {
          el.selectionStart = removeFrom;
          el.selectionEnd = removeFrom;
        });
        return;
      }

      // Delete: skip forward into next paragraph
      if (e.key === "Delete") {
        e.preventDefault();
        const nextLineStart = lineEnd < currentValue.length ? lineEnd + 1 : lineEnd;
        requestAnimationFrame(() => {
          el.selectionStart = nextLineStart;
          el.selectionEnd = nextLineStart;
        });
        return;
      }

      // Any printable character: redirect to the start of the next paragraph
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        e.preventDefault();
        const nextLineStart = lineEnd < currentValue.length ? lineEnd + 1 : lineEnd;
        // Skip the leading \t of the next paragraph so character lands after indent
        const insertAt =
          currentValue[nextLineStart] === "\t" ? nextLineStart + 1 : nextLineStart;
        const next =
          currentValue.slice(0, insertAt) + e.key + currentValue.slice(insertAt);
        setValue(next);
        requestAnimationFrame(() => {
          el.selectionStart = insertAt + 1;
          el.selectionEnd = insertAt + 1;
        });
        return;
      }
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const rect = el.getBoundingClientRect();
    const clickY = e.clientY - rect.top - paddingTop + el.scrollTop;
    const lineIndex = Math.floor(clickY / lineHeight);

    const lines = currentValue.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    if (lines[lineIndex].trim() !== "" || lineIndex === 0) return;

    // Click landed on a blank separator line — block it
    e.preventDefault();
    el.focus();

    // Build char offset for the start of this line
    let charOffset = 0;
    for (let i = 0; i < lineIndex; i++) charOffset += lines[i].length + 1;
    const lineStart = charOffset;
    const lineEnd = lineStart + lines[lineIndex].length;

    const prevPos = lineStart - 1;
    const nextLineStart = lineEnd < currentValue.length ? lineEnd + 1 : lineEnd;
    const nextPos = currentValue[nextLineStart] === "\t" ? nextLineStart + 1 : nextLineStart;
    // Upper half → go to end of previous paragraph; lower half → start of next
    const midY = (lineIndex + 0.5) * lineHeight;
    const newPos = clickY < midY ? prevPos : nextPos;
    el.selectionStart = newPos;
    el.selectionEnd = newPos;
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const plain = e.clipboardData.getData("text/plain");
    if (!plain) return;
    e.preventDefault();
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const normalized = applyNormalize(plain);
    const next = currentValue.slice(0, start) + normalized + currentValue.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.selectionStart = start + normalized.length;
      el.selectionEnd = start + normalized.length;
    });
  }

  function handleBlur() {
    const normalized = applyNormalize(currentValue);
    if (normalized !== currentValue) {
      setValue(normalized);
    }
  }

  return (
    <>
      {!isControlled && name && (
        <input type="hidden" name={name} value={currentValue} readOnly />
      )}
      <textarea
        ref={ref}
        rows={rows}
        value={currentValue}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}
