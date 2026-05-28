import { describe, expect, it } from "vitest"
import {
  createEditorPreviewPlaceholderLayoutState,
  isEditorPreviewLayoutFull,
  markEditorPreviewLayoutFull,
  markEditorPreviewLayoutPartial,
  markEditorPreviewLayoutSettling,
  markEditorPreviewLayoutSettlingFromCurrent,
  shouldBlockEditorPreviewCanvas,
} from "../editorPreviewLayoutStatus"

describe("editor preview layout status", () => {
  it("starts as a blocking placeholder shell", () => {
    const state = createEditorPreviewPlaceholderLayoutState()

    expect(state).toEqual({
      status: "placeholder",
      blocksCanvas: true,
      generation: null,
    })
    expect(shouldBlockEditorPreviewCanvas(state)).toBe(true)
  })

  it("tracks settling as either blocking or non-blocking", () => {
    expect(markEditorPreviewLayoutSettling(1, { blocksCanvas: true })).toMatchObject({
      status: "settling",
      blocksCanvas: true,
      generation: 1,
    })
    expect(markEditorPreviewLayoutSettling(2, { blocksCanvas: false })).toMatchObject({
      status: "settling",
      blocksCanvas: false,
      generation: 2,
    })
  })

  it("keeps settling non-blocking once a usable canvas is already visible", () => {
    expect(markEditorPreviewLayoutSettlingFromCurrent(
      3,
      markEditorPreviewLayoutFull(2),
    )).toEqual({
      status: "settling",
      blocksCanvas: false,
      generation: 3,
    })

    expect(markEditorPreviewLayoutSettlingFromCurrent(
      4,
      createEditorPreviewPlaceholderLayoutState(),
    )).toEqual({
      status: "settling",
      blocksCanvas: true,
      generation: 4,
    })
  })

  it("marks partial and full layouts as non-blocking while only full is export-ready", () => {
    const partial = markEditorPreviewLayoutPartial(3)
    const full = markEditorPreviewLayoutFull(4)

    expect(shouldBlockEditorPreviewCanvas(partial)).toBe(false)
    expect(shouldBlockEditorPreviewCanvas(full)).toBe(false)
    expect(isEditorPreviewLayoutFull(partial.status)).toBe(false)
    expect(isEditorPreviewLayoutFull(full.status)).toBe(true)
  })
})
