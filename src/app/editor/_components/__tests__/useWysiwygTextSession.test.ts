import { describe, expect, it } from "vitest"
import {
  INACTIVE_WYSIWYG_TEXT_SESSION,
  applyWysiwygTextClipboardCut,
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  changeWysiwygTextSessionDraft,
  clampWysiwygTextOffset,
  describeWysiwygTextSessionAccessibility,
  getWysiwygTextSelectedText,
  isWysiwygTextSessionLayoutFresh,
  markWysiwygTextLayoutFresh,
  moveWysiwygTextSessionCaret,
  normalizeWysiwygPlainTextInput,
  startWysiwygTextSessionState,
} from "../useWysiwygTextSession"

describe("clampWysiwygTextOffset", () => {
  it("clamps offsets to the current draft text", () => {
    expect(clampWysiwygTextOffset("abc", -1)).toBe(0)
    expect(clampWysiwygTextOffset("abc", 99)).toBe(3)
    expect(clampWysiwygTextOffset("abc", 1.8)).toBe(1)
    expect(clampWysiwygTextOffset("abc", null)).toBeNull()
  })
})

describe("applyWysiwygTextInputText", () => {
  it("inserts multi-character browser input at the current caret", () => {
    expect(applyWysiwygTextInputText("Alpha", 5, " beta")).toEqual({
      text: "Alpha beta",
      caretOffset: 10,
      selection: { anchorOffset: 10, focusOffset: 10 },
    })
  })

  it("replaces the active selection with browser input text", () => {
    expect(applyWysiwygTextInputText("Alpha", 4, "X", { anchorOffset: 1, focusOffset: 4 })).toEqual({
      text: "AXa",
      caretOffset: 2,
      selection: { anchorOffset: 2, focusOffset: 2 },
    })
  })

  it("ignores empty browser input text", () => {
    expect(applyWysiwygTextInputText("Alpha", 5, "")).toBeNull()
  })

  it("normalizes pasted CRLF text before replacing the active selection", () => {
    expect(applyWysiwygTextInputText("AxxB", 3, "หนึ่ง\r\nสอง\rสาม", {
      anchorOffset: 1,
      focusOffset: 3,
    })).toEqual({
      text: "Aหนึ่ง\nสอง\nสามB",
      caretOffset: 14,
      selection: { anchorOffset: 14, focusOffset: 14 },
    })
  })
})

describe("WYSIWYG text clipboard helpers", () => {
  it("normalizes plain-text clipboard line endings", () => {
    expect(normalizeWysiwygPlainTextInput("A\r\nB\rC\nD")).toBe("A\nB\nC\nD")
  })

  it("reads selected text from forward and backward selections", () => {
    expect(getWysiwygTextSelectedText("Alpha beta", 10, {
      anchorOffset: 6,
      focusOffset: 10,
    })).toBe("beta")
    expect(getWysiwygTextSelectedText("Alpha beta", 6, {
      anchorOffset: 10,
      focusOffset: 6,
    })).toBe("beta")
  })

  it("cuts selected text as one draft change and collapses at the removed range", () => {
    expect(applyWysiwygTextClipboardCut("Alpha beta", 10, {
      anchorOffset: 6,
      focusOffset: 10,
    })).toEqual({
      selectedText: "beta",
      change: {
        text: "Alpha ",
        caretOffset: 6,
        selection: { anchorOffset: 6, focusOffset: 6 },
      },
    })
  })

  it("does not cut collapsed selections", () => {
    expect(applyWysiwygTextClipboardCut("Alpha", 5, {
      anchorOffset: 5,
      focusOffset: 5,
    })).toBeNull()
  })
})

describe("WYSIWYG text session state", () => {
  it("starts from paragraph text without mutating document state", () => {
    const state = startWysiwygTextSessionState(INACTIVE_WYSIWYG_TEXT_SESSION, {
      nodeId: "p1",
      text: "Alpha",
      caretOffset: 2,
      pageIndex: 1,
    })

    expect(state).toMatchObject({
      nodeId: "p1",
      pageIndex: 1,
      baseText: "Alpha",
      draftText: "Alpha",
      caretOffset: 2,
      dirtyVersion: 0,
      layoutVersion: 0,
    })
    expect(state.selection).toEqual({ anchorOffset: 2, focusOffset: 2 })
    expect(isWysiwygTextSessionLayoutFresh(state)).toBe(true)
  })

  it("tracks draft changes separately from layout freshness", () => {
    const active = startWysiwygTextSessionState(INACTIVE_WYSIWYG_TEXT_SESSION, {
      nodeId: "p1",
      text: "Alpha",
      caretOffset: 5,
    })

    const changed = changeWysiwygTextSessionDraft(active, {
      text: "Alpha!",
      caretOffset: 6,
    })

    expect(changed.baseText).toBe("Alpha")
    expect(changed.draftText).toBe("Alpha!")
    expect(changed.dirtyVersion).toBe(1)
    expect(changed.layoutVersion).toBe(0)
    expect(isWysiwygTextSessionLayoutFresh(changed)).toBe(false)

    const fresh = markWysiwygTextLayoutFresh(changed)
    expect(fresh.layoutVersion).toBe(1)
    expect(isWysiwygTextSessionLayoutFresh(fresh)).toBe(true)
  })

  it("ignores draft changes while inactive", () => {
    expect(changeWysiwygTextSessionDraft(INACTIVE_WYSIWYG_TEXT_SESSION, {
      text: "ignored",
      caretOffset: 3,
    })).toBe(INACTIVE_WYSIWYG_TEXT_SESSION)
  })

  it("describes caret and selection state for assistive technology", () => {
    const active = startWysiwygTextSessionState(INACTIVE_WYSIWYG_TEXT_SESSION, {
      nodeId: "p1",
      text: "Alpha beta",
      caretOffset: 5,
    })

    expect(describeWysiwygTextSessionAccessibility(active)).toBe(
      "Editing paragraph text. Caret at 5 of 10.",
    )

    const selected = moveWysiwygTextSessionCaret(active, 10, {
      anchorOffset: 6,
      focusOffset: 10,
    })

    expect(describeWysiwygTextSessionAccessibility(selected)).toBe(
      "Editing paragraph text. 4 characters selected, 6 to 10 of 10.",
    )
    expect(describeWysiwygTextSessionAccessibility(INACTIVE_WYSIWYG_TEXT_SESSION)).toBeNull()
  })

  it("restarts the same paragraph as a fresh draft session", () => {
    const active = startWysiwygTextSessionState(INACTIVE_WYSIWYG_TEXT_SESSION, {
      nodeId: "p1",
      text: "Alpha",
    })
    const changed = changeWysiwygTextSessionDraft(active, {
      text: "Alpha!",
      caretOffset: 6,
    })

    const restarted = startWysiwygTextSessionState(changed, {
      nodeId: "p1",
      text: "Alpha!",
      caretOffset: 6,
    })

    expect(restarted.dirtyVersion).toBe(0)
    expect(restarted.layoutVersion).toBe(0)
    expect(isWysiwygTextSessionLayoutFresh(restarted)).toBe(true)
  })

  it("moves the caret without dirtying the draft layout", () => {
    const active = startWysiwygTextSessionState(INACTIVE_WYSIWYG_TEXT_SESSION, {
      nodeId: "p1",
      text: "Alpha",
      caretOffset: 5,
    })

    const moved = moveWysiwygTextSessionCaret(active, 2)

    expect(moved.caretOffset).toBe(2)
    expect(moved.dirtyVersion).toBe(0)
    expect(moved.layoutVersion).toBe(0)
  })
})

describe("applyWysiwygTextInputKey", () => {
  it("inserts printable text and newlines at the collapsed caret", () => {
    expect(applyWysiwygTextInputKey("Alpha", 5, { key: "!" })).toEqual({
      text: "Alpha!",
      caretOffset: 6,
      selection: { anchorOffset: 6, focusOffset: 6 },
    })
    expect(applyWysiwygTextInputKey("Alpha", 2, { key: "Enter" })).toEqual({
      text: "Al\npha",
      caretOffset: 3,
      selection: { anchorOffset: 3, focusOffset: 3 },
    })
  })

  it("deletes whole graphemes around the caret", () => {
    expect(applyWysiwygTextInputKey("Aก้B", 3, { key: "Backspace" })).toEqual({
      text: "AB",
      caretOffset: 1,
      selection: { anchorOffset: 1, focusOffset: 1 },
    })
    expect(applyWysiwygTextInputKey("Aก้B", 1, { key: "Delete" })).toEqual({
      text: "AB",
      caretOffset: 1,
      selection: { anchorOffset: 1, focusOffset: 1 },
    })
  })

  it("moves the caret with navigation keys without changing text", () => {
    expect(applyWysiwygTextInputKey("Aก้B", 3, { key: "ArrowLeft" })).toEqual({
      text: "Aก้B",
      caretOffset: 1,
      selection: { anchorOffset: 1, focusOffset: 1 },
    })
    expect(applyWysiwygTextInputKey("Aก้B", 1, { key: "ArrowRight" })).toEqual({
      text: "Aก้B",
      caretOffset: 3,
      selection: { anchorOffset: 3, focusOffset: 3 },
    })
    expect(applyWysiwygTextInputKey("Alpha", 3, { key: "Home" })?.caretOffset).toBe(0)
    expect(applyWysiwygTextInputKey("Alpha", 3, { key: "End" })?.caretOffset).toBe(5)
  })

  it("replaces selected text with printable input or delete", () => {
    const selection = { anchorOffset: 1, focusOffset: 4 }
    expect(applyWysiwygTextInputKey("Alpha", 4, { key: "x" }, selection)).toEqual({
      text: "Axa",
      caretOffset: 2,
      selection: { anchorOffset: 2, focusOffset: 2 },
    })
    expect(applyWysiwygTextInputKey("Alpha", 4, { key: "Backspace" }, selection)).toEqual({
      text: "Aa",
      caretOffset: 1,
      selection: { anchorOffset: 1, focusOffset: 1 },
    })
  })

  it("extends selection with shifted navigation", () => {
    expect(applyWysiwygTextInputKey("Alpha", 2, { key: "ArrowRight", shiftKey: true })).toEqual({
      text: "Alpha",
      caretOffset: 3,
      selection: { anchorOffset: 2, focusOffset: 3 },
    })
  })

  it("preserves the selection anchor across repeated shifted navigation", () => {
    const first = applyWysiwygTextInputKey("Aก้B", 0, { key: "ArrowRight", shiftKey: true })
    expect(first).toEqual({
      text: "Aก้B",
      caretOffset: 1,
      selection: { anchorOffset: 0, focusOffset: 1 },
    })

    const second = applyWysiwygTextInputKey(
      first?.text ?? "",
      first?.caretOffset ?? null,
      { key: "ArrowRight", shiftKey: true },
      first?.selection,
    )
    expect(second).toEqual({
      text: "Aก้B",
      caretOffset: 3,
      selection: { anchorOffset: 0, focusOffset: 3 },
    })

    expect(applyWysiwygTextInputKey(
      second?.text ?? "",
      second?.caretOffset ?? null,
      { key: "ArrowLeft", shiftKey: true },
      second?.selection,
    )).toEqual({
      text: "Aก้B",
      caretOffset: 1,
      selection: { anchorOffset: 0, focusOffset: 1 },
    })
  })

  it("extends backward selections from focus and collapses unshifted arrows to range edges", () => {
    const first = applyWysiwygTextInputKey("Aก้B", 4, { key: "ArrowLeft", shiftKey: true })
    expect(first).toEqual({
      text: "Aก้B",
      caretOffset: 3,
      selection: { anchorOffset: 4, focusOffset: 3 },
    })

    const second = applyWysiwygTextInputKey(
      first?.text ?? "",
      first?.caretOffset ?? null,
      { key: "ArrowLeft", shiftKey: true },
      first?.selection,
    )
    expect(second).toEqual({
      text: "Aก้B",
      caretOffset: 1,
      selection: { anchorOffset: 4, focusOffset: 1 },
    })

    expect(applyWysiwygTextInputKey("Aก้B", second?.caretOffset ?? null, { key: "ArrowLeft" }, second?.selection))
      .toEqual({
        text: "Aก้B",
        caretOffset: 1,
        selection: { anchorOffset: 1, focusOffset: 1 },
      })
    expect(applyWysiwygTextInputKey("Aก้B", second?.caretOffset ?? null, { key: "ArrowRight" }, second?.selection))
      .toEqual({
        text: "Aก้B",
        caretOffset: 4,
        selection: { anchorOffset: 4, focusOffset: 4 },
      })
  })

  it("keeps the existing anchor for shifted Home and End navigation", () => {
    expect(applyWysiwygTextInputKey(
      "Alpha beta",
      6,
      { key: "End", shiftKey: true },
      { anchorOffset: 2, focusOffset: 6 },
    )).toEqual({
      text: "Alpha beta",
      caretOffset: 10,
      selection: { anchorOffset: 2, focusOffset: 10 },
    })
    expect(applyWysiwygTextInputKey(
      "Alpha beta",
      6,
      { key: "Home", shiftKey: true },
      { anchorOffset: 8, focusOffset: 6 },
    )).toEqual({
      text: "Alpha beta",
      caretOffset: 0,
      selection: { anchorOffset: 8, focusOffset: 0 },
    })
  })

  it("ignores modified keys and composition", () => {
    expect(applyWysiwygTextInputKey("Alpha", 5, { key: "b", ctrlKey: true })).toBeNull()
    expect(applyWysiwygTextInputKey("Alpha", 5, { key: "ก", isComposing: true })).toBeNull()
    expect(applyWysiwygTextInputKey("Alpha", 5, { key: "PageUp" })).toBeNull()
  })
})
