import { describe, expect, it } from "vitest"
import {
  absoluteInlineEditIndex,
  buildContinuationBackspaceInput,
  buildSplitEditInput,
  getContinuationEditState,
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
})
