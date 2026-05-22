import fontkit from "@pdf-lib/fontkit"
import { DEFAULT_FONT_KEY, resolveFontVariantCacheKey } from "../font-registry"
import type { TextMeasurer } from "./types"

// Node.js only — ไม่ export จาก layout/index.ts
// ใช้ใน /api/paginate และ /api/export เพื่อ accurate font metrics

type FontkitFont = {
  layout(text: string): { advanceWidth: number }
  unitsPerEm: number
}

export type FontBufferMap = Record<string, Uint8Array | null | undefined>

function createFont(buffer: Uint8Array | null | undefined): FontkitFont | null {
  if (!buffer) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fontkit as any).create(Buffer.from(buffer)) as FontkitFont
  } catch {
    return null
  }
}

export function createFontkitMeasurer(fontBuffer: Uint8Array | null, fontBuffersByKey: FontBufferMap = {}): TextMeasurer {
  const defaultFont = createFont(fontBuffer)
  const fontsByKey = new Map<string, FontkitFont>()

  if (defaultFont) fontsByKey.set(DEFAULT_FONT_KEY, defaultFont)
  for (const [key, buffer] of Object.entries(fontBuffersByKey)) {
    const font = createFont(buffer)
    if (font) fontsByKey.set(key, font)
  }

  if (!defaultFont && fontsByKey.size === 0) {
    return {
      measureText: (text, _key, fontSize) => ({ width: text.length * fontSize * 0.5 }),
      measureLineHeight: (_key, fontSize, ratio) => fontSize * ratio,
    }
  }

  return {
    measureText(text, fontFamilyKey, fontSize, fontVariant = "regular") {
      if (!text) return { width: 0 }
      const variantKey = resolveFontVariantCacheKey(fontFamilyKey, fontVariant)
      const regularKey = resolveFontVariantCacheKey(fontFamilyKey, "regular")
      const font = fontsByKey.get(variantKey) ?? fontsByKey.get(regularKey) ?? defaultFont ?? fontsByKey.get(DEFAULT_FONT_KEY)
      if (!font) return { width: text.length * fontSize * 0.5 }
      try {
        const run = font.layout(text)
        return { width: (run.advanceWidth / font.unitsPerEm) * fontSize }
      } catch {
        return { width: text.length * fontSize * 0.5 }
      }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}
