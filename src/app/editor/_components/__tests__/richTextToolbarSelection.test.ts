import { describe, expect, it } from "vitest"
import {
  areRichTextToolbarSelectionsEqual,
  resolveRichTextToolbarSelectionSnapshot,
  shouldDebounceRichTextToolbarSelection,
} from "../richTextToolbarSelection"

describe("rich text toolbar selection helpers", () => {
  it("projects active WYSIWYG text selection into toolbar snapshots", () => {
    expect(resolveRichTextToolbarSelectionSnapshot("p1", {
      anchorOffset: 1,
      focusOffset: 4,
    })).toEqual({
      nodeId: "p1",
      anchorOffset: 1,
      focusOffset: 4,
    })
    expect(resolveRichTextToolbarSelectionSnapshot(null, {
      anchorOffset: 1,
      focusOffset: 4,
    })).toBeNull()
    expect(resolveRichTextToolbarSelectionSnapshot("p1", null)).toBeNull()
  })

  it("compares toolbar snapshots including their paragraph identity", () => {
    expect(areRichTextToolbarSelectionsEqual(null, null)).toBe(true)
    expect(areRichTextToolbarSelectionsEqual(
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
    )).toBe(true)
    expect(areRichTextToolbarSelectionsEqual(
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      { nodeId: "p2", anchorOffset: 1, focusOffset: 4 },
    )).toBe(false)
  })

  it("debounces active selection snapshots", () => {
    expect(shouldDebounceRichTextToolbarSelection(null)).toBe(false)
    expect(shouldDebounceRichTextToolbarSelection({
      nodeId: "p1",
      anchorOffset: 2,
      focusOffset: 2,
    })).toBe(true)
    expect(shouldDebounceRichTextToolbarSelection({
      nodeId: "p1",
      anchorOffset: 2,
      focusOffset: 5,
    })).toBe(true)
  })
})
