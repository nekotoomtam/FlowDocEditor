import { describe, expect, it } from "vitest"
import { normalizeDocument, updateParagraphText } from "@/document"
import { defaultTextMeasurer, measureParagraph, type WordBreaker } from "@/layout"
import { pt, type DocumentNode, type ParagraphNode } from "@/schema"
import {
  normalizeWysiwygPlainTextInput,
  WYSIWYG_TAB_REPLACEMENT,
} from "../useWysiwygTextSession"
import { getPlainParagraphTextFromDocument } from "../wysiwygTextCommit"

// Phase B whitespace matrix. Each test row corresponds to a numbered row in
// docs/WYSIWYG_WHITESPACE_MATRIX.md. The top-line rule is "Preserve 1:1
// (Word-like)" with one declared transformation: Tab -> 3 spaces on input.

function makeSingleParagraphDoc(paragraphId: string, text: string): DocumentNode {
  const paragraph: ParagraphNode = {
    id: paragraphId,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.35,
      spacingBefore: pt(0),
      spacingAfter: pt(6),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${paragraphId}-text`, type: "text", text }],
  }

  return normalizeDocument({
    version: 1,
    document: {
      id: "whitespace-parity-doc",
      sections: [{
        id: "section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [paragraphId] },
          [paragraphId]: paragraph,
        },
      }],
    },
  })
}

function roundTripText(initialText: string, replacementText: string): string {
  const doc = makeSingleParagraphDoc("p", initialText)
  const next = normalizeDocument(updateParagraphText(doc, "p", replacementText))
  return getPlainParagraphTextFromDocument(next, "p") ?? ""
}

const whitespaceBreaker: WordBreaker = {
  segment(text: string): string[] {
    return text.match(/\s+|\S+/g) ?? []
  },
}

function measuredLineTexts(text: string, availableWidth = 200): string[] {
  const paragraph = makeSingleParagraphDoc("p", text).document.sections[0].nodes.p as ParagraphNode
  return measureParagraph(paragraph, availableWidth, defaultTextMeasurer, whitespaceBreaker)
    .lines
    .map((line) => line.text)
}

describe("WYSIWYG whitespace matrix (Phase B)", () => {
  it("row 1: preserves a single space between words", () => {
    expect(normalizeWysiwygPlainTextInput("a b")).toBe("a b")
    expect(roundTripText("", "a b")).toBe("a b")
  })

  it("row 2: preserves double space between words", () => {
    expect(normalizeWysiwygPlainTextInput("a  b")).toBe("a  b")
    expect(roundTripText("", "a  b")).toBe("a  b")
  })

  it("row 3: preserves leading spaces at paragraph start", () => {
    expect(normalizeWysiwygPlainTextInput("  a")).toBe("  a")
    expect(roundTripText("", "  a")).toBe("  a")
  })

  it("row 4: preserves trailing spaces at paragraph end", () => {
    expect(normalizeWysiwygPlainTextInput("a  ")).toBe("a  ")
    expect(roundTripText("", "a  ")).toBe("a  ")
  })

  it("row 5: preserves trailing space at a potential wrap point", () => {
    // A long sentence with a trailing space before the wrap candidate.
    const input = "lorem ipsum dolor sit amet "
    expect(normalizeWysiwygPlainTextInput(input)).toBe(input)
    expect(roundTripText("", input)).toBe(input)
  })

  it("row 6: converts Tab to 3 spaces on input", () => {
    expect(WYSIWYG_TAB_REPLACEMENT).toBe("   ")
    expect(normalizeWysiwygPlainTextInput("a\tb")).toBe("a   b")
    expect(normalizeWysiwygPlainTextInput("\t")).toBe("   ")
    expect(normalizeWysiwygPlainTextInput("a\t\tb")).toBe("a      b")
    expect(roundTripText("", normalizeWysiwygPlainTextInput("name\tage"))).toBe("name   age")
  })

  it("row 7: preserves Thai + space + Latin mix", () => {
    const input = "ไทย abc"
    expect(normalizeWysiwygPlainTextInput(input)).toBe(input)
    expect(roundTripText("", input)).toBe(input)
  })

  it("row 8: preserves spaces around ZWJ sequences", () => {
    // ZWJ = U+200D. A space, ZWJ-joined token, and a trailing space all survive.
    const input = "a ‍ b"
    expect(normalizeWysiwygPlainTextInput(input)).toBe(input)
    expect(roundTripText("", input)).toBe(input)
  })

  it("row 9: preserves a run of 5+ consecutive spaces", () => {
    const input = "x     y"
    expect(normalizeWysiwygPlainTextInput(input)).toBe(input)
    expect(roundTripText("", input)).toBe(input)
  })

  it("row 10: keeps inline newline as-is (single paragraph, no structural split)", () => {
    expect(normalizeWysiwygPlainTextInput("a\nb")).toBe("a\nb")
    expect(roundTripText("", "a\nb")).toBe("a\nb")
  })

  it("row 11: normalizes CRLF to LF on paste", () => {
    expect(normalizeWysiwygPlainTextInput("a\r\nb")).toBe("a\nb")
    expect(roundTripText("", normalizeWysiwygPlainTextInput("a\r\nb"))).toBe("a\nb")
  })

  it("row 12: normalizes CR to LF on paste (legacy mac-style line endings)", () => {
    expect(normalizeWysiwygPlainTextInput("a\rb")).toBe("a\nb")
    expect(roundTripText("", normalizeWysiwygPlainTextInput("a\rb"))).toBe("a\nb")
  })

  it("does not collapse, trim, or otherwise mutate a complex whitespace pattern", () => {
    const input = "  alpha   beta   ไทย  สวัสดี    end  "
    expect(normalizeWysiwygPlainTextInput(input)).toBe(input)
    expect(roundTripText("", input)).toBe(input)
  })

  it("composes Tab normalization with CRLF normalization", () => {
    expect(normalizeWysiwygPlainTextInput("a\tb\r\nc\td")).toBe("a   b\nc   d")
  })

  it("documents current visual policy: interior spaces render, line-edge spaces are not in measured line text", () => {
    expect(measuredLineTexts("a  b")).toEqual(["a  b"])
    expect(measuredLineTexts("  a")).toEqual(["a"])
    expect(measuredLineTexts("a  ")).toEqual(["a"])
  })

  it("documents current visual policy: wrap-boundary spaces are break candidates, not rendered line suffixes", () => {
    expect(measuredLineTexts("alpha beta gamma", 42)).toEqual(["alpha", "beta", "gamma"])
    expect(measuredLineTexts("alpha  beta", 42)).toEqual(["alpha", "beta"])
  })
})
