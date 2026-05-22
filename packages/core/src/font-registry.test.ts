import { describe, expect, it } from "vitest"
import {
  DEFAULT_FONT_KEY,
  listRuntimeFontVariantRequests,
  listSelectableFontEntries,
  normalizeFontFamilyKey,
  resolveDocxFontName,
  resolveFontCssFamily,
  resolveFontExportSupport,
  resolveFontFileName,
  resolveFontVariantCacheKey,
  resolveFontVariantEntry,
  resolveFontVariantKeyForStyle,
} from "./font-registry"

describe("font registry", () => {
  it("keeps the selectable font catalog intentionally small", () => {
    expect(listSelectableFontEntries().map((entry) => entry.key)).toEqual([
      "sarabun",
      "notoSansThai",
    ])
  })

  it("resolves regular font files and target names for the first two catalog families", () => {
    expect(resolveFontFileName("sarabun")).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(resolveFontCssFamily("sarabun")).toBe("FlowDocSarabun")
    expect(resolveDocxFontName("sarabun")).toBe("Sarabun")

    expect(resolveFontFileName("notoSansThai")).toBe("Noto_Sans_Thai/static/NotoSansThai-Regular.ttf")
    expect(resolveFontCssFamily("notoSansThai")).toBe("FlowDocNotoSansThai")
    expect(resolveDocxFontName("notoSansThai")).toBe("Noto Sans Thai")
  })

  it("resolves the default system font to Sarabun", () => {
    expect(DEFAULT_FONT_KEY).toBe("sarabun")
    expect(resolveFontFileName(DEFAULT_FONT_KEY)).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(resolveFontFileName("unknown-font-key")).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(resolveDocxFontName(DEFAULT_FONT_KEY)).toBe("Sarabun")
  })

  it("maps old implicit font keys to the Sarabun default", () => {
    expect(resolveFontFileName("default")).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(resolveFontCssFamily("default")).toBe("FlowDocSarabun")
    expect(resolveDocxFontName("default")).toBe("Sarabun")

    expect(resolveFontFileName("thSarabun")).toBe("Sarabun/Sarabun-Regular.ttf")
    expect(resolveDocxFontName("thSarabun")).toBe("Sarabun")
    expect(normalizeFontFamilyKey("default")).toBe("sarabun")
    expect(normalizeFontFamilyKey("thSarabun")).toBe("sarabun")
  })

  it("exposes Sarabun variants for later rich text work", () => {
    expect(resolveFontVariantEntry("sarabun", "bold").fileName).toBe("Sarabun/Sarabun-Bold.ttf")
    expect(resolveFontVariantEntry("sarabun", "italic").fileName).toBe("Sarabun/Sarabun-Italic.ttf")
    expect(resolveFontVariantEntry("sarabun", "boldItalic").fileName).toBe("Sarabun/Sarabun-BoldItalic.ttf")
  })

  it("maps paragraph font style props to runtime variant cache keys", () => {
    expect(resolveFontVariantKeyForStyle("normal", "normal")).toBe("regular")
    expect(resolveFontVariantKeyForStyle("bold", "normal")).toBe("bold")
    expect(resolveFontVariantKeyForStyle("normal", "italic")).toBe("italic")
    expect(resolveFontVariantKeyForStyle("bold", "italic")).toBe("boldItalic")
    expect(resolveFontVariantCacheKey("sarabun", "boldItalic")).toBe("sarabun:boldItalic")
    expect(resolveFontVariantCacheKey("notoSansThai", "italic")).toBe("notoSansThai")
  })

  it("lists runtime font variant files that are available in the active catalog", () => {
    expect(listRuntimeFontVariantRequests().map((request) => request.cacheKey)).toEqual([
      "sarabun",
      "sarabun:bold",
      "sarabun:italic",
      "sarabun:boldItalic",
      "notoSansThai",
      "notoSansThai:bold",
    ])
  })

  it("marks export support separately for PDF and DOCX", () => {
    expect(resolveFontExportSupport("sarabun")).toEqual({
      pdf: "embedded",
      docx: "embedded-variants",
    })
    expect(resolveFontExportSupport("notoSansThai")).toEqual({
      pdf: "embedded",
      docx: "embedded-variants",
    })
  })
})
