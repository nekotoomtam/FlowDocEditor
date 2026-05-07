import { resolveFontCssFamily } from "@/font-registry"
import { defaultTextMeasurer } from "@/layout"
import type { TextMeasurer } from "@/layout"

export function createBrowserTextMeasurer(): TextMeasurer {
  if (typeof document === "undefined") return defaultTextMeasurer

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return defaultTextMeasurer

  return {
    measureText(text, fontFamilyKey, fontSize) {
      const family = resolveFontCssFamily(fontFamilyKey)
      context.font = `${fontSize}px "${family}", sans-serif`
      return { width: context.measureText(text).width }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}
