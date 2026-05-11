import { describe, expect, it } from "vitest"
import {
  absoluteInlineEditIndex,
  buildContinuationBackspaceInput,
  buildInlineEditSliceKey,
  buildSplitEditInput,
  getContinuationEditState,
  inlineEditTextareaCaretColor,
  inlineEditTextareaTextColor,
  shouldUseInlineEditDocumentLayer,
  shouldUseInlineEditDocumentVisual,
  shouldUseNativeInlineEditEnter,
  shouldUseNativeTableCellBoundaryBackspace,
  shouldUseInlineEditSvgVisual,
} from "../ParagraphTextSurface"
import type { PageFragment } from "@/pagination"

function makeFragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    lines: [],
    ...overrides,
  }
}

describe("ParagraphTextSurface continuation editing", () => {
  it("uses the full text and absolute caret for a first paragraph fragment", () => {
    const state = getContinuationEditState("Hello world", makeFragment({ continuesFrom: false }), 6)

    expect(state.continuationCharStart).toBeNull()
    expect(state.preText).toBe("")
    expect(state.editText).toBe("Hello world")
    expect(state.adjustedInitialCaret).toBe(6)
  })

  it("uses only continuation text and makes the caret relative to the fragment", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 8)

    expect(state.continuationCharStart).toBe(6)
    expect(state.preText).toBe("Hello ")
    expect(state.editText).toBe("world")
    expect(state.adjustedInitialCaret).toBe(2)
  })

  it("clamps a continuation caret before the fragment start to zero", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 3)

    expect(state.adjustedInitialCaret).toBe(0)
  })

  it("supports reconstructing the full paragraph text after editing a continuation", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 11)

    expect(state.preText + "there").toBe("Hello there")
  })

  it("falls back to full-text editing when a continuation fragment has no segment offset", () => {
    const state = getContinuationEditState("Hello world", makeFragment({ continuesFrom: true }), 4)

    expect(state.continuationCharStart).toBeNull()
    expect(state.preText).toBe("")
    expect(state.editText).toBe("Hello world")
    expect(state.adjustedInitialCaret).toBe(4)
  })

  it("maps continuation textarea caret positions to absolute paragraph offsets", () => {
    expect(absoluteInlineEditIndex("Hello ", 2, 5)).toBe(8)
    expect(absoluteInlineEditIndex("Hello ", null, 5)).toBe(11)
  })

  it("splits continuation edit text at the absolute caret offset", () => {
    const input = buildSplitEditInput("Hello ", "wide world", 4, 4)

    expect(input.text).toBe("Hello wide world")
    expect(input.splitIndex).toBe("Hello wide".length)
  })

  it("deletes selected local text before splitting a continuation edit", () => {
    const input = buildSplitEditInput("Hello ", "wide world", 4, 10)

    expect(input.text).toBe("Hello wide")
    expect(input.splitIndex).toBe("Hello wide".length)
  })

  it("snaps paragraph splits away from the middle of a grapheme", () => {
    const input = buildSplitEditInput("", "Aก้B", 2, 2)

    expect(input.text).toBe("Aก้B")
    expect(input.splitIndex).toBe(1)
  })

  it("deletes whole graphemes when a split selection touches the middle of one", () => {
    const input = buildSplitEditInput("", "Aก้B", 2, 3)

    expect(input.text).toBe("AB")
    expect(input.splitIndex).toBe(1)
  })

  it("backspaces across a continuation boundary without merging paragraphs", () => {
    const input = buildContinuationBackspaceInput("Hello ", "world")

    expect(input).toEqual({
      text: "Helloworld",
      caretIndex: "Hello".length,
    })
  })

  it("backspaces whole graphemes across a continuation boundary", () => {
    const input = buildContinuationBackspaceInput("Aก้", "B")

    expect(input).toEqual({
      text: "AB",
      caretIndex: 1,
    })
  })

  it("leaves first-fragment start backspace for paragraph merge handling", () => {
    expect(buildContinuationBackspaceInput("", "Hello")).toBeNull()
  })

  it("keys inline edit slices by stable fragment identity and continuation start", () => {
    const fragment = makeFragment({ fragmentIndex: 1, lineStart: 4, lineEnd: 6 })

    expect(buildInlineEditSliceKey(fragment, 25)).toBe(buildInlineEditSliceKey({ ...fragment, lineEnd: 8 }, 25))
    expect(buildInlineEditSliceKey(fragment, 25)).not.toBe(buildInlineEditSliceKey(fragment, 30))
    expect(buildInlineEditSliceKey(fragment, 25)).not.toBe(buildInlineEditSliceKey({ ...fragment, pageIndex: 1 }, 25))
  })

  it("lets inline textareas keep native multiline Enter editing", () => {
    expect(shouldUseNativeInlineEditEnter()).toBe(true)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "")).toBe(true)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "Hello")).toBe(false)
    expect(shouldUseNativeTableCellBoundaryBackspace(false, "")).toBe(false)
  })
})

describe("ParagraphTextSurface inline edit visual parity", () => {
  it("uses SVG text as the edit visual only when the snapshot is fresh", () => {
    expect(shouldUseInlineEditSvgVisual(true, true)).toBe(true)
    expect(shouldUseInlineEditSvgVisual(true, false)).toBe(false)
    expect(shouldUseInlineEditSvgVisual(false, true)).toBe(false)
  })

  it("keeps textarea text visible while visual lines are stale", () => {
    expect(inlineEditTextareaTextColor(false)).toBe("#1e40af")
    expect(inlineEditTextareaTextColor(true)).toBe("transparent")
  })

  it("uses document visual only for fresh collapsed non-composition editing", () => {
    expect(shouldUseInlineEditDocumentVisual(true, true, true, false)).toBe(true)
    expect(shouldUseInlineEditDocumentVisual(true, false, true, false)).toBe(false)
    expect(shouldUseInlineEditDocumentVisual(true, true, false, false)).toBe(false)
    expect(shouldUseInlineEditDocumentVisual(true, true, true, true)).toBe(false)
  })

  it("falls back to visible textarea text when custom caret geometry is missing", () => {
    expect(shouldUseInlineEditDocumentLayer(true, true)).toBe(true)
    expect(shouldUseInlineEditDocumentLayer(true, false)).toBe(false)
    expect(inlineEditTextareaTextColor(shouldUseInlineEditDocumentLayer(true, false))).toBe("#1e40af")
  })

  it("hides the native textarea caret only when a custom caret is available", () => {
    expect(inlineEditTextareaCaretColor(false)).toBe("#1e40af")
    expect(inlineEditTextareaCaretColor(true)).toBe("transparent")
  })
})
