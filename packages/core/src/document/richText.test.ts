import { describe, expect, it } from "vitest"
import type { InlineNode, ParagraphNode, TextRun } from "../schema"
import { pt } from "../schema"
import {
  applyTextRunStyleRangeToParagraph,
  deleteTextRunRangeFromParagraph,
  getTextRunParagraphText,
  getTextRunStyleRangeState,
  hasTextRunStyle,
  isTextRunOnlyParagraph,
  mergeAdjacentTextRuns,
  replaceTextRunParagraphTextInParagraph,
  replaceTextRunRangeInParagraph,
  resolveTextRunStyle,
  resolveTextRunParagraphTextReplacement,
  splitTextRunsAtOffset,
} from "./richText"

function paragraph(run: TextRun): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "sarabun",
      textColor: "111827",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      strikethrough: false,
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [run],
  }
}

function textRunSummary(node: ParagraphNode): unknown[] {
  return node.children.map((child) =>
    child.type === "text"
      ? { type: "text", text: child.text, style: child.style }
      : child,
  )
}

function textRunIdSummary(node: ParagraphNode): unknown[] {
  return node.children.map((child) =>
    child.type === "text"
      ? { id: child.id, type: "text", text: child.text, style: child.style }
      : child,
  )
}

describe("rich text helpers", () => {
  it("resolves text run style by cascading run overrides over paragraph defaults", () => {
    const run: TextRun = {
      id: "t1",
      type: "text",
      text: "Styled",
      style: {
        fontSize: pt(18),
        fontFamilyKey: "notoSansThai",
        fontWeight: "bold",
        textDecoration: "underline",
      },
    }

    expect(resolveTextRunStyle(paragraph(run), run)).toEqual({
      fontSize: pt(18),
      fontFamilyKey: "notoSansThai",
      textColor: "111827",
      fontWeight: "bold",
      fontStyle: "normal",
      textDecoration: "underline",
      strikethrough: false,
    })
  })

  it("detects authored run style", () => {
    expect(hasTextRunStyle({ id: "t1", type: "text", text: "Plain" })).toBe(false)
    expect(hasTextRunStyle({ id: "t2", type: "text", text: "Styled", style: { fontWeight: "bold" } })).toBe(true)
  })

  it("recognizes text-run-only paragraphs and rejects inline-object paragraphs", () => {
    const textOnly = paragraph({ id: "t1", type: "text", text: "A" })
    textOnly.children = [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B" },
    ]
    const withField = paragraph({ id: "t1", type: "text", text: "A" })
    withField.children = [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ]

    expect(isTextRunOnlyParagraph(textOnly)).toBe(true)
    expect(getTextRunParagraphText(textOnly)).toBe("AB")
    expect(isTextRunOnlyParagraph(withField)).toBe(false)
    expect(getTextRunParagraphText(withField)).toBeNull()
  })

  it("merges only adjacent text runs with identical authored style", () => {
    const children: InlineNode[] = [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B", style: { fontWeight: "bold" } },
      { id: "f1", type: "fieldRef", key: "customer.name" },
      { id: "t3", type: "text", text: "C", style: { fontWeight: "bold" } },
      { id: "t4", type: "text", text: "D", style: { fontStyle: "italic" } },
    ]

    expect(mergeAdjacentTextRuns(children)).toEqual([
      { id: "t1", type: "text", text: "AB", style: { fontWeight: "bold" } },
      { id: "f1", type: "fieldRef", key: "customer.name" },
      { id: "t3", type: "text", text: "C", style: { fontWeight: "bold" } },
      { id: "t4", type: "text", text: "D", style: { fontStyle: "italic" } },
    ])
  })

  it("applies style to a paragraph range and merges matching adjacent runs", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B" },
      { id: "t3", type: "text", text: "C", style: { fontWeight: "bold" } },
    ]

    const updated = applyTextRunStyleRangeToParagraph(node, 1, 2, { fontWeight: "bold" })

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "ABC", style: { fontWeight: "bold" } },
    ])
  })

  it("normalizes reversed and clamped style ranges", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello" })

    const updated = applyTextRunStyleRangeToParagraph(node, 99, -5, { textDecoration: "underline" })

    expect(updated).not.toBeNull()
    expect(textRunIdSummary(updated!)).toEqual([
      { id: "t1", type: "text", text: "Hello", style: { textDecoration: "underline" } },
    ])
  })

  it("keeps the source id on the first surviving split segment", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello" })

    const updated = applyTextRunStyleRangeToParagraph(node, 1, 4, { fontWeight: "bold" })

    expect(updated).not.toBeNull()
    expect(updated!.children[0]).toMatchObject({ id: "t1", type: "text", text: "H" })
    expect(updated!.children[1]).toMatchObject({ type: "text", text: "ell", style: { fontWeight: "bold" } })
    expect(updated!.children[1]?.id).not.toBe("t1")
    expect(updated!.children[2]).toMatchObject({ type: "text", text: "o" })
    expect(updated!.children[2]?.id).not.toBe("t1")
  })

  it("returns null when a paragraph range style patch is already applied", () => {
    const node = paragraph({
      id: "t1",
      type: "text",
      text: "Hello",
      style: { fontWeight: "bold" },
    })

    expect(applyTextRunStyleRangeToParagraph(node, 1, 4, { fontWeight: "bold" })).toBeNull()
    expect(applyTextRunStyleRangeToParagraph(node, 1, 4, {})).toBeNull()
  })

  it("deletes text across text runs while preserving later run styles", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Alpha " })
    node.children = [
      { id: "t1", type: "text", text: "Alpha ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "Beta ", style: { fontStyle: "italic" } },
      { id: "t3", type: "text", text: "Gamma", style: { textColor: "2563EB" } },
    ]

    const updated = deleteTextRunRangeFromParagraph(node, 6, 11)

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "Alpha ", style: { fontWeight: "bold" } },
      { type: "text", text: "Gamma", style: { textColor: "2563EB" } },
    ])
  })

  it("normalizes reversed delete ranges and treats collapsed/out-of-range deletes as no-ops", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello" })

    const updated = deleteTextRunRangeFromParagraph(node, 4, 1)

    expect(updated).not.toBeNull()
    expect(textRunIdSummary(updated!)).toEqual([
      { id: "t1", type: "text", text: "Ho", style: undefined },
    ])
    expect(deleteTextRunRangeFromParagraph(node, 2, 2)).toBeNull()
    expect(deleteTextRunRangeFromParagraph(node, 8, 12)).toBeNull()
  })

  it("leaves a single empty styled run when deleting all text", () => {
    const node = paragraph({
      id: "t1",
      type: "text",
      text: "Styled",
      style: { textColor: "DC2626" },
    })

    const updated = deleteTextRunRangeFromParagraph(node, 0, 6)

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "", style: { textColor: "DC2626" } },
    ])
  })

  it("inserts at a run boundary using the previous run style", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A", style: { textColor: "DC2626" } })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { textColor: "DC2626" } },
      { id: "t2", type: "text", text: "B" },
    ]

    const updated = replaceTextRunRangeInParagraph(node, 1, 1, "x")

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "Ax", style: { textColor: "DC2626" } },
      { type: "text", text: "B", style: undefined },
    ])
  })

  it("treats collapsed empty replacements and invalid ranges as no-ops", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello" })

    expect(replaceTextRunRangeInParagraph(node, 2, 2, "")).toBeNull()
    expect(replaceTextRunRangeInParagraph(node, Number.NaN, 2, "X")).toBeNull()
  })

  it("inserts collapsed replacement before an inline object at the current text offset", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ]

    const updated = replaceTextRunRangeInParagraph(node, 1, 1, "x")

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "Ax", style: { fontWeight: "bold" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { type: "text", text: "B", style: undefined },
    ])
  })

  it("preserves inline objects while replacing surrounding text", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A" })
    node.children = [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ]

    const updated = replaceTextRunRangeInParagraph(node, 0, 2, "X", {
      style: { textDecoration: "underline" },
    })

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "X", style: { textDecoration: "underline" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ])
  })

  it("computes and applies whole-paragraph text replacements without stripping unchanged styles", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello " })
    node.children = [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ]

    expect(resolveTextRunParagraphTextReplacement("Hello world", "Hello wide world")).toEqual({
      start: 7,
      end: 7,
      text: "ide w",
    })

    const updated = replaceTextRunParagraphTextInParagraph(node, "Hello wide world")

    expect(updated).not.toBeNull()
    expect(textRunSummary(updated!)).toEqual([
      { type: "text", text: "Hello wide ", style: { fontWeight: "bold" } },
      { type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
  })

  it("splits text runs at an offset and keeps both sides editable", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } })

    if (!isTextRunOnlyParagraph(node)) throw new Error("expected text-run-only paragraph")
    const result = splitTextRunsAtOffset(node, 2)

    expect(result.before.map((child) =>
      child.type === "text" ? { type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { type: "text", text: "He", style: { fontWeight: "bold" } },
    ])
    expect(result.after.map((child) =>
      child.type === "text" ? { type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { type: "text", text: "llo", style: { fontWeight: "bold" } },
    ])
  })

  it("splits at paragraph boundaries with one editable empty run on the empty side", () => {
    const node = paragraph({ id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } })

    if (!isTextRunOnlyParagraph(node)) throw new Error("expected text-run-only paragraph")
    const start = splitTextRunsAtOffset(node, 0)
    const end = splitTextRunsAtOffset(node, 5)

    expect(start.before.map((child) =>
      child.type === "text" ? { type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { type: "text", text: "", style: { fontWeight: "bold" } },
    ])
    expect(start.after.map((child) =>
      child.type === "text" ? { id: child.id, type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } },
    ])
    expect(end.before.map((child) =>
      child.type === "text" ? { id: child.id, type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { id: "t1", type: "text", text: "Hello", style: { fontWeight: "bold" } },
    ])
    expect(end.after.map((child) =>
      child.type === "text" ? { type: "text", text: child.text, style: child.style } : child,
    )).toEqual([
      { type: "text", text: "", style: { fontWeight: "bold" } },
    ])
  })

  it("reports a non-mixed effective style state for a uniform range", () => {
    const node = paragraph({
      id: "t1",
      type: "text",
      text: "Bold",
      style: { fontWeight: "bold", fontSize: pt(16) },
    })

    const state = getTextRunStyleRangeState(node, 0, 4)

    expect(state?.fontWeight).toEqual({ value: "bold", mixed: false })
    expect(state?.fontSize).toEqual({ value: pt(16), mixed: false })
    expect(state?.textColor).toEqual({ value: "111827", mixed: false })
  })

  it("marks fields mixed when a range spans different effective run styles", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A" })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B", style: { fontStyle: "italic" } },
    ]

    const state = getTextRunStyleRangeState(node, 0, 2)

    expect(state?.fontWeight).toEqual({ value: "bold", mixed: true })
    expect(state?.fontStyle).toEqual({ value: "normal", mixed: true })
    expect(state?.fontFamilyKey).toEqual({ value: "sarabun", mixed: false })
  })

  it("uses the caret-adjacent run style for collapsed range state", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A" })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { textColor: "DC2626" } },
      { id: "t2", type: "text", text: "B" },
    ]

    const state = getTextRunStyleRangeState(node, 1, 1)

    expect(state?.textColor).toEqual({ value: "DC2626", mixed: false })
  })

  it("ignores inline objects when computing text range style state", () => {
    const node = paragraph({ id: "t1", type: "text", text: "A" })
    node.children = [
      { id: "t1", type: "text", text: "A", style: { textDecoration: "underline" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B", style: { textDecoration: "underline" } },
    ]

    const state = getTextRunStyleRangeState(node, 0, 2)

    expect(state?.textDecoration).toEqual({ value: "underline", mixed: false })
  })
})
