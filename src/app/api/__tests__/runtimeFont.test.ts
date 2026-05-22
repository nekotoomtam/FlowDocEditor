import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_FONT_KEY, listRuntimeFontKeys, listRuntimeFontVariantRequests, resolveFontFileName } from "@/font-registry"
import {
  loadRuntimeFontMapSync,
  loadRuntimeFontSync,
  resetRuntimeFontCacheForTests,
  resolveRuntimeFontPath,
} from "../runtimeFont"

describe("runtime font contract", () => {
  it("requires the default runtime font at the public font path", () => {
    const fontPath = resolveRuntimeFontPath(DEFAULT_FONT_KEY)

    expect(resolveFontFileName(DEFAULT_FONT_KEY)).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(fontPath.replaceAll("\\", "/")).toMatch(/\/public\/fonts\/Sarabun\/Sarabun-Regular\.ttf$/)
    expect(existsSync(fontPath)).toBe(true)
    expect(readFileSync(fontPath).byteLength).toBeGreaterThan(0)

    resetRuntimeFontCacheForTests()
    const font = loadRuntimeFontSync(DEFAULT_FONT_KEY)
    expect(font).not.toBeNull()
    expect(font!.byteLength).toBeGreaterThan(0)
  })

  it("loads the first selectable font catalog from public fonts", () => {
    resetRuntimeFontCacheForTests()

    const fontMap = loadRuntimeFontMapSync()
    const requests = listRuntimeFontVariantRequests()

    expect(Object.keys(fontMap)).toEqual(requests.map((request) => request.cacheKey))
    for (const request of requests) {
      const font = fontMap[request.cacheKey]
      const fontPath = resolveRuntimeFontPath(request.fontFamilyKey, request.variant).replaceAll("\\", "/")
      expect(fontPath).toContain("/public/fonts/")
      expect(font, request.cacheKey).not.toBeNull()
      expect(font!.byteLength, request.cacheKey).toBeGreaterThan(0)
    }
  })

  it("keeps runtime font keys limited to the active catalog", () => {
    expect(listRuntimeFontKeys()).toEqual(["sarabun", "notoSansThai"])
  })
})
