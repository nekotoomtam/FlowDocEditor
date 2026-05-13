import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"
import {
  loadRuntimeFontSync,
  resetRuntimeFontCacheForTests,
  resolveRuntimeFontPath,
} from "../runtimeFont"

describe("runtime font contract", () => {
  it("requires the default runtime font at the public font path", () => {
    const fontPath = resolveRuntimeFontPath(DEFAULT_FONT_KEY)

    expect(resolveFontFileName(DEFAULT_FONT_KEY)).toBe("THSarabun.ttf")
    expect(fontPath.replaceAll("\\", "/")).toMatch(/\/public\/fonts\/THSarabun\.ttf$/)
    expect(existsSync(fontPath)).toBe(true)
    expect(readFileSync(fontPath).byteLength).toBeGreaterThan(0)

    resetRuntimeFontCacheForTests()
    const font = loadRuntimeFontSync(DEFAULT_FONT_KEY)
    expect(font).not.toBeNull()
    expect(font!.byteLength).toBeGreaterThan(0)
  })

  it("keeps the legacy src font either absent or byte-identical to the runtime font", () => {
    const fontFileName = resolveFontFileName(DEFAULT_FONT_KEY)
    const runtimeFontPath = resolveRuntimeFontPath(DEFAULT_FONT_KEY)
    const legacyFontPath = path.join(process.cwd(), "src", "fonts", fontFileName)

    expect(existsSync(runtimeFontPath)).toBe(true)
    if (!existsSync(legacyFontPath)) return

    expect(readFileSync(legacyFontPath)).toEqual(readFileSync(runtimeFontPath))
  })
})
