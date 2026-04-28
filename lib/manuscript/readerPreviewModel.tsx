import React from "react";
import { sanitizeChapterHtml } from "@/lib/format/chapterNormalize";

type ReaderInlineNode =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "tag"; tag: "strong" | "em" | "u" | "s" | "sup" | "sub"; children: ReaderInlineNode[] };

export type ReaderPreviewBlock = {
  key: string;
  kind: "paragraph" | "scene-break";
  noIndent: boolean;
  nodes: ReaderInlineNode[];
  textStart: number;
  textEnd: number;
};

export type ReaderPreviewModel = {
  blocks: ReaderPreviewBlock[];
  visibleText: string;
};

type OpenTag = ReaderInlineNode & { type: "tag" };

function pushNode(target: ReaderInlineNode[], node: ReaderInlineNode) {
  target.push(node);
}

function parseInlineMarkup(html: string): ReaderInlineNode[] {
  const root: ReaderInlineNode[] = [];
  const stack: OpenTag[] = [];
  const tokenRegex = /(<\/?(?:strong|em|u|s|sup|sub|br)>)/gi;
  const parts = html.split(tokenRegex).filter(Boolean);

  function currentChildren() {
    return stack.length > 0 ? stack[stack.length - 1].children : root;
  }

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "<br>") {
      pushNode(currentChildren(), { type: "break" });
      continue;
    }
    const openMatch = lower.match(/^<(strong|em|u|s|sup|sub)>$/);
    if (openMatch) {
      const tagNode: OpenTag = { type: "tag", tag: openMatch[1] as OpenTag["tag"], children: [] };
      pushNode(currentChildren(), tagNode);
      stack.push(tagNode);
      continue;
    }
    const closeMatch = lower.match(/^<\/(strong|em|u|s|sup|sub)>$/);
    if (closeMatch) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === closeMatch[1]) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }
    if (part) {
      pushNode(currentChildren(), { type: "text", text: part });
    }
  }

  return root;
}

function nodesToVisibleText(nodes: ReaderInlineNode[]): string {
  let output = "";
  for (const node of nodes) {
    if (node.type === "text") output += node.text;
    else if (node.type === "break") output += "\n";
    else output += nodesToVisibleText(node.children);
  }
  return output;
}

export function buildReaderPreviewModel(text: string): ReaderPreviewModel {
  if (!text.trim()) {
    return { blocks: [], visibleText: "" };
  }

  const rawBlocks = text
    .split(/\n\n/)
    .map((block) => block.replace(/^\t/, "").trim())
    .filter(Boolean);

  let runningOffset = 0;
  let visibleText = "";
  const blocks: ReaderPreviewBlock[] = rawBlocks.map((block, index) => {
    const prev = rawBlocks[index - 1];
    const noIndent = index === 0 || prev === "***";
    const nodes =
      block === "***"
        ? [{ type: "text", text: "***" } satisfies ReaderInlineNode]
        : parseInlineMarkup(sanitizeChapterHtml(block).replace(/\n/g, "<br>"));
    const blockText = nodesToVisibleText(nodes);
    const previewBlock: ReaderPreviewBlock = {
      key: `reader-block-${index}`,
      kind: block === "***" ? "scene-break" : "paragraph",
      noIndent,
      nodes,
      textStart: runningOffset,
      textEnd: runningOffset + blockText.length,
    };
    runningOffset += blockText.length;
    visibleText += blockText;
    return previewBlock;
  });

  return { blocks, visibleText };
}

type RenderState = {
  nextOffset: number;
};

function renderInlineNodes(nodes: ReaderInlineNode[], keyPrefix: string, state: RenderState): React.ReactNode[] {
  const rendered: React.ReactNode[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const key = `${keyPrefix}-${i}`;
    if (node.type === "text") {
      const chars = Array.from(node.text);
      chars.forEach((char, charIndex) => {
        const offset = state.nextOffset;
        state.nextOffset += 1;
        rendered.push(
          <span
            key={`${key}-char-${charIndex}`}
            data-reader-char="1"
            data-reader-offset={offset}
            data-reader-end={offset + 1}
            className="reader-char whitespace-pre-wrap"
          >
            {char === " " ? "\u00A0" : char}
          </span>,
        );
      });
      continue;
    }

    if (node.type === "break") {
      const offset = state.nextOffset;
      state.nextOffset += 1;
      rendered.push(
        <span
          key={`${key}-break`}
          data-reader-break="1"
          data-reader-offset={offset}
          className="pointer-events-none inline-block h-0 w-0 overflow-hidden align-top"
          aria-hidden="true"
        />,
      );
      rendered.push(<br key={`${key}-br`} />);
      continue;
    }

    const children = renderInlineNodes(node.children, `${key}-${node.tag}`, state);
    const Tag = node.tag;
    rendered.push(<Tag key={`${key}-tag`}>{children}</Tag>);
  }

  return rendered;
}

export function renderReaderPreviewBlocks(model: ReaderPreviewModel): React.ReactNode {
  const state: RenderState = { nextOffset: 0 };

  return model.blocks.map((block) => {
    const className =
      block.kind === "scene-break"
        ? "my-[1.25em] text-center tracking-[0.3em] text-[rgba(255,160,160,0.55)]"
        : `${block.noIndent ? "indent-0" : "indent-[var(--ms-para-indent)]"} whitespace-pre-wrap [text-align:var(--ms-text-align)]`;

    return (
      <p key={block.key} className={className} data-reader-block={block.kind}>
        {renderInlineNodes(block.nodes, block.key, state)}
      </p>
    );
  });
}
