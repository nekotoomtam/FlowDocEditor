import { describe, expect, it } from "vitest"
import type { TextMeasurer } from "@/layout"
import {
  isEditorTextMeasurerReady,
  resolveBrowserEditorTextMeasurer,
} from "../editorTextMeasurerState"

const fallbackMeasurer: TextMeasurer = {
  measureText: () => ({ width: 12 }),
  measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => fontSize * lineHeightRatio,
}

const fontkitMeasurer: TextMeasurer = {
  measureText: () => ({ width: 24 }),
  measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => fontSize * lineHeightRatio,
}

describe("editor text measurer state", () => {
  it("keeps initial layout gated while the browser measurer is loading", () => {
    expect(isEditorTextMeasurerReady("loading")).toBe(false)
    expect(isEditorTextMeasurerReady("fontkit")).toBe(true)
    expect(isEditorTextMeasurerReady("fallback")).toBe(true)
  })

  it("resolves to the browser fontkit measurer when the font buffer is available", async () => {
    const state = await resolveBrowserEditorTextMeasurer(
      fallbackMeasurer,
      async () => new Uint8Array([1, 2, 3]),
      async () => fontkitMeasurer,
    )

    expect(state.status).toBe("fontkit")
    expect(state.measurer).toBe(fontkitMeasurer)
  })

  it("settles to the existing fallback when font loading or fontkit setup fails", async () => {
    const missingFontState = await resolveBrowserEditorTextMeasurer(
      fallbackMeasurer,
      async () => null,
      async () => fontkitMeasurer,
    )
    const failedFontkitState = await resolveBrowserEditorTextMeasurer(
      fallbackMeasurer,
      async () => new Uint8Array([1, 2, 3]),
      async () => null,
    )

    expect(missingFontState).toEqual({ status: "fallback", measurer: fallbackMeasurer })
    expect(failedFontkitState).toEqual({ status: "fallback", measurer: fallbackMeasurer })
  })
})
