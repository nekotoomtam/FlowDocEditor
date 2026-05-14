import type { TextMeasurer } from "@/layout"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"

// Browser-side fontkit measurer. Mirrors the server-side createFontkitMeasurer
// in packages/core/src/layout/font-measurer.ts so that editor preview and
// server pagination compute identical glyph widths from the same .ttf bytes.

const WIDTH_CACHE_LIMIT = 8000

export function resolveBrowserFontUrl(key: string = DEFAULT_FONT_KEY): string {
  return `/fonts/${resolveFontFileName(key)}`
}

export async function loadBrowserFontBuffer(
  url: string = resolveBrowserFontUrl(),
): Promise<Uint8Array | null> {
  if (typeof fetch === "undefined") return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch {
    return null
  }
}

export async function createBrowserFontkitMeasurer(
  fontBuffer: Uint8Array | null,
): Promise<TextMeasurer | null> {
  if (!fontBuffer) return null

  let font: unknown
  try {
    const mod = await import("@pdf-lib/fontkit")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fontkit = (mod as any).default ?? mod
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BufferCtor = (globalThis as any).Buffer
    const bufferLike = BufferCtor ? BufferCtor.from(fontBuffer) : fontBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    font = (fontkit as any).create(bufferLike)
  } catch {
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layoutFn: (text: string) => { advanceWidth: number } = (font as any).layout.bind(font)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unitsPerEm: number = (font as any).unitsPerEm

  const widthCache = new Map<string, number>()

  return {
    measureText(text, _fontFamilyKey, fontSize) {
      if (!text) return { width: 0 }
      const cacheKey = JSON.stringify([fontSize, text])
      const cached = widthCache.get(cacheKey)
      if (cached !== undefined) return { width: cached }
      try {
        const run = layoutFn(text)
        const width = (run.advanceWidth / unitsPerEm) * fontSize
        if (widthCache.size < WIDTH_CACHE_LIMIT) widthCache.set(cacheKey, width)
        return { width }
      } catch {
        return { width: text.length * fontSize * 0.5 }
      }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}
