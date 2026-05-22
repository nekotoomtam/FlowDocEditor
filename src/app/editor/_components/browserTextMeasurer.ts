import { resolveFontCssFamily, resolveFontVariantEntry } from "@/font-registry"
import { defaultTextMeasurer } from "@/layout"
import type { TextMeasurer } from "@/layout"

const CANVAS_WIDTH_CACHE_LIMIT = 8000

export function createBrowserTextMeasurer(): TextMeasurer {
  if (typeof document === "undefined") return defaultTextMeasurer

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return defaultTextMeasurer

  const widthCache = new Map<string, number>()

  return {
    measureText(text, fontFamilyKey, fontSize, fontVariant = "regular") {
      if (!text) return { width: 0 }
      const cacheKey = JSON.stringify([fontFamilyKey, fontVariant, fontSize, text])
      const cached = widthCache.get(cacheKey)
      if (cached !== undefined) return { width: cached }
      const family = resolveFontCssFamily(fontFamilyKey)
      const variant = resolveFontVariantEntry(fontFamilyKey, fontVariant)
      context.font = `${variant.fontStyle} ${variant.fontWeight} ${fontSize}px "${family}", sans-serif`
      const width = context.measureText(text).width
      if (widthCache.size < CANVAS_WIDTH_CACHE_LIMIT) widthCache.set(cacheKey, width)
      return { width }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}
