import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { resolveRuntimeFontPath } from "../../../api/runtimeFont"
import { createBrowserFontkitMeasurer } from "../browserFontkitMeasurer"

// Phase A parity gate. The browser fontkit measurer must produce numerically
// identical glyph widths to the server fontkit measurer when given the same
// font bytes. Any non-zero delta here indicates a divergence that will surface
// as edit/show layout drift in the editor.

const FONT_PATH = resolveRuntimeFontPath()
const FONT_AVAILABLE = existsSync(FONT_PATH)

describe.skipIf(!FONT_AVAILABLE)("browser/server fontkit measurer parity", () => {
  it("produces identical widths for representative strings across font sizes", async () => {
    const fontBuffer = new Uint8Array(readFileSync(FONT_PATH))
    const serverMeasurer = createFontkitMeasurer(fontBuffer)
    const browserMeasurer = await createBrowserFontkitMeasurer(fontBuffer)
    if (!browserMeasurer) {
      throw new Error("Expected browser fontkit measurer to initialize from test font bytes")
    }

    const cases: Array<{ fontSize: number; text: string }> = [
      { fontSize: 10, text: "สวัสดีครับ เอกสารราชการไทย 12345" },
      { fontSize: 10, text: "เลขที่ 1234567890 กขคงจ ฉบับทดสอบ" },
      { fontSize: 12, text: "การวัดข้อความไทยผสม English และตัวเลข 123" },
      { fontSize: 12, text: "ก".repeat(80) },
      { fontSize: 14, text: "A".repeat(90) },
      { fontSize: 16, text: " " },
      { fontSize: 16, text: "  " },
      { fontSize: 16, text: "Hello  world" },
      { fontSize: 18, text: "" },
      { fontSize: 11, text: "ก่อนหน้าและหลัง" },
    ]

    for (const { fontSize, text } of cases) {
      const serverWidth = serverMeasurer.measureText(text, "default", fontSize).width
      const browserWidth = browserMeasurer.measureText(text, "default", fontSize).width
      expect(browserWidth, `parity mismatch for "${text}" @ ${fontSize}pt`).toBe(serverWidth)
    }
  })

  it("produces identical line heights", async () => {
    const fontBuffer = new Uint8Array(readFileSync(FONT_PATH))
    const serverMeasurer = createFontkitMeasurer(fontBuffer)
    const browserMeasurer = await createBrowserFontkitMeasurer(fontBuffer)
    if (!browserMeasurer) {
      throw new Error("Expected browser fontkit measurer to initialize from test font bytes")
    }

    for (const fontSize of [10, 12, 14, 16, 18, 24]) {
      for (const ratio of [1.0, 1.2, 1.35, 1.5]) {
        const serverHeight = serverMeasurer.measureLineHeight("default", fontSize, ratio)
        const browserHeight = browserMeasurer.measureLineHeight("default", fontSize, ratio)
        expect(browserHeight).toBe(serverHeight)
      }
    }
  })

  it("returns null when font buffer is unavailable so callers can keep their existing fallback", async () => {
    const browserMeasurer = await createBrowserFontkitMeasurer(null)
    expect(browserMeasurer).toBeNull()
  })
})
