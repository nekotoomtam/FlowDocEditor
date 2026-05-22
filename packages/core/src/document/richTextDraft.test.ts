import { describe, expect, it } from "vitest"
import type { InlineNode, ParagraphNode, TextRun } from "../schema"
import { pt } from "../schema"
import {
  applyRichTextDraftStyleCommand,
  createRichTextDraft,
  getRichTextDraftPlainText,
  replaceRichTextDraftSelection,
  replaceRichTextDraftSelectionWithFragments,
} from "./richTextDraft"

function paragraph(children: InlineNode[]): ParagraphNode {
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
    children,
  }
}

function textRun(id: string, text: string, style?: TextRun["style"]): TextRun {
  return style
    ? { id, type: "text", text, style }
    : { id, type: "text", text }
}

function textRunSummary(node: ParagraphNode): unknown[] {
  return node.children.map((child) =>
    child.type === "text"
      ? { type: "text", text: child.text, style: child.style }
      : child,
  )
}

describe("rich text draft proof lane", () => {
  it("keeps draft plain text as a projection of paragraph children", () => {
    const draft = createRichTextDraft(paragraph([
      textRun("t1", "A"),
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      textRun("t2", "B"),
    ]), { anchorOffset: 20, focusOffset: 20 })

    expect(getRichTextDraftPlainText(draft)).toBe("AB")
    expect(draft.selection).toEqual({ anchorOffset: 2, focusOffset: 2 })
  })

  it("applies collapsed pending style to the first typed character, then lets boundary inheritance continue", () => {
    const base = createRichTextDraft(paragraph([textRun("t1", "A")]), {
      anchorOffset: 1,
      focusOffset: 1,
    })

    const pending = applyRichTextDraftStyleCommand(base, { fontWeight: "bold" })
    const firstInsert = replaceRichTextDraftSelection(pending, "x")
    const secondInsert = replaceRichTextDraftSelection(firstInsert, "y")

    expect(pending.pendingStyle).toEqual({ fontWeight: "bold" })
    expect(firstInsert.pendingStyle).toBeUndefined()
    expect(textRunSummary(firstInsert.paragraph)).toEqual([
      { type: "text", text: "A", style: undefined },
      { type: "text", text: "x", style: { fontWeight: "bold" } },
    ])
    expect(textRunSummary(secondInsert.paragraph)).toEqual([
      { type: "text", text: "A", style: undefined },
      { type: "text", text: "xy", style: { fontWeight: "bold" } },
    ])
    expect(secondInsert.selection).toEqual({ anchorOffset: 3, focusOffset: 3 })
  })

  it("bases pending style on the caret-adjacent authored run style", () => {
    const base = createRichTextDraft(paragraph([
      textRun("t1", "A"),
      textRun("t2", "B", { textColor: "DC2626" }),
    ]), { anchorOffset: 1, focusOffset: 1 })

    const pending = applyRichTextDraftStyleCommand(base, { fontWeight: "bold" })
    const inserted = replaceRichTextDraftSelection(pending, "x")

    expect(pending.pendingStyle).toEqual({ fontWeight: "bold" })
    expect(textRunSummary(inserted.paragraph)).toEqual([
      { type: "text", text: "A", style: undefined },
      { type: "text", text: "x", style: { fontWeight: "bold" } },
      { type: "text", text: "B", style: { textColor: "DC2626" } },
    ])
  })

  it("applies style commands to selected ranges without creating pending style", () => {
    const base = createRichTextDraft(paragraph([textRun("t1", "Hello")]), {
      anchorOffset: 1,
      focusOffset: 4,
    })

    const styled = applyRichTextDraftStyleCommand(base, { textDecoration: "underline" })

    expect(styled.pendingStyle).toBeUndefined()
    expect(styled.selection).toEqual({ anchorOffset: 1, focusOffset: 4 })
    expect(textRunSummary(styled.paragraph)).toEqual([
      { type: "text", text: "H", style: undefined },
      { type: "text", text: "ell", style: { textDecoration: "underline" } },
      { type: "text", text: "o", style: undefined },
    ])
  })

  it("replaces a selection with sanitized rich fragments", () => {
    const base = createRichTextDraft(paragraph([
      textRun("t1", "Alpha "),
      textRun("t2", "Beta", { fontStyle: "italic" }),
      textRun("t3", " Gamma", { textColor: "2563EB" }),
    ]), { anchorOffset: 6, focusOffset: 10 })

    const replaced = replaceRichTextDraftSelectionWithFragments(base, [
      { text: "Bold", style: { fontWeight: "bold" } },
      { text: " plain" },
    ])

    expect(getRichTextDraftPlainText(replaced)).toBe("Alpha Bold plain Gamma")
    expect(replaced.selection).toEqual({ anchorOffset: 16, focusOffset: 16 })
    expect(textRunSummary(replaced.paragraph)).toEqual([
      { type: "text", text: "Alpha ", style: undefined },
      { type: "text", text: "Bold", style: { fontWeight: "bold" } },
      { type: "text", text: " plain", style: undefined },
      { type: "text", text: " Gamma", style: { textColor: "2563EB" } },
    ])
  })

  it("preserves inline objects while replacing selected text with rich fragments", () => {
    const base = createRichTextDraft(paragraph([
      textRun("t1", "A"),
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      textRun("t2", "B"),
    ]), { anchorOffset: 0, focusOffset: 2 })

    const replaced = replaceRichTextDraftSelectionWithFragments(base, [
      { text: "X", style: { textColor: "DC2626" } },
    ])

    expect(getRichTextDraftPlainText(replaced)).toBe("X")
    expect(textRunSummary(replaced.paragraph)).toEqual([
      { type: "text", text: "X", style: { textColor: "DC2626" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ])
  })
})
