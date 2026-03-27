import assert from "node:assert";
import { describe, it } from "node:test";
import {
  normalizeManuscriptText,
  parseManuscriptForPreview,
  sanitizePastedHtml,
} from "../lib/format/normalizeManuscript";

describe("sanitizePastedHtml", () => {
  it("strips script/style and keeps text", () => {
    const html = '<p>Hello</p><script>alert(1)</script><style>.x{}</style><div>World</div>';
    assert.equal(sanitizePastedHtml(html).trim(), "Hello\nWorld");
  });

  it("decodes common entities and turns br into newlines", () => {
    const html = "Hi&nbsp;there<br>line2 &amp; more";
    assert.equal(sanitizePastedHtml(html), "Hi there\nline2 & more");
  });
});

describe("normalizeManuscriptText", () => {
  it("collapses multiple blank lines and trims edges", () => {
    const raw = "\n\nLine one\n\n\nLine two\n\n";
    const { text, cleaned } = normalizeManuscriptText(raw);
    assert.equal(text, "Line one\n\nLine two");
    assert.equal(cleaned, true);
  });

  it("keeps intentional double spaces but trims longer runs", () => {
    const raw = "Word   word    word";
    const { text } = normalizeManuscriptText(raw);
    assert.equal(text, "Word  word  word");
  });

  it("normalizes tabs to two spaces", () => {
    const raw = "\tIndented";
    const { text } = normalizeManuscriptText(raw);
    assert.equal(text, "  Indented");
  });
});

describe("parseManuscriptForPreview", () => {
  it("creates paragraphs and scene breaks", () => {
    const text = "Line one\n\n***\n\nLine two";
    const nodes = parseManuscriptForPreview(text);
    assert.equal(nodes.length, 3);
    assert.deepStrictEqual(nodes[0], { type: "paragraph", text: "Line one" });
    assert.deepStrictEqual(nodes[1], { type: "scene-break", marker: "***" });
    assert.deepStrictEqual(nodes[2], { type: "paragraph", text: "Line two" });
  });

  it("ignores trailing blank lines", () => {
    const text = "Para\n\n";
    const nodes = parseManuscriptForPreview(text);
    assert.equal(nodes.length, 1);
  });
});
