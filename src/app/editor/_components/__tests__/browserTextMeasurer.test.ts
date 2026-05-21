import { afterEach, describe, expect, it, vi } from "vitest"
import { createBrowserTextMeasurer } from "../browserTextMeasurer"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createBrowserTextMeasurer", () => {
  it("caches canvas text widths by text, font key, and font size", () => {
    const measureText = vi.fn((text: string) => ({ width: text.length * 7 }))
    const context = {
      font: "",
      measureText,
    }
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => context),
      })),
    })

    const measurer = createBrowserTextMeasurer()

    expect(measurer.measureText("Alpha", "default", 12).width).toBe(35)
    expect(measurer.measureText("Alpha", "default", 12).width).toBe(35)
    expect(measurer.measureText("Alpha", "default", 14).width).toBe(35)
    expect(measurer.measureText("Alpha", "serif", 12).width).toBe(35)
    expect(measurer.measureText("Beta", "default", 12).width).toBe(28)

    expect(measureText).toHaveBeenCalledTimes(4)
  })

  it("returns zero for empty text without hitting canvas", () => {
    const measureText = vi.fn(() => ({ width: 10 }))
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({ font: "", measureText })),
      })),
    })

    const measurer = createBrowserTextMeasurer()

    expect(measurer.measureText("", "default", 12).width).toBe(0)
    expect(measureText).not.toHaveBeenCalled()
  })
})
