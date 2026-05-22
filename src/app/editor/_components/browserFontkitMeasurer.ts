import type { TextMeasurer } from "@/layout"
import type { FontVariantKey } from "@/font-registry"
import { DEFAULT_FONT_KEY, listRuntimeFontVariantRequests, resolveFontFileName, resolveFontVariantCacheKey } from "@/font-registry"

// Browser-side fontkit measurer. Mirrors the server-side createFontkitMeasurer
// in packages/core/src/layout/font-measurer.ts so that editor preview and
// server pagination compute identical glyph widths from the same .ttf bytes.

const WIDTH_CACHE_LIMIT = 8000

type BrowserFont = {
  layout(text: string): { advanceWidth: number }
  unitsPerEm: number
}

export type BrowserFontBufferMap = Record<string, Uint8Array | null | undefined>

export function resolveBrowserFontUrl(key: string = DEFAULT_FONT_KEY, variant: FontVariantKey = "regular"): string {
  return `/fonts/${resolveFontFileName(key, variant)}`
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

export async function loadBrowserFontBuffers(): Promise<BrowserFontBufferMap> {
  const entries = await Promise.all(
    listRuntimeFontVariantRequests().map(async (request) => [
      request.cacheKey,
      await loadBrowserFontBuffer(resolveBrowserFontUrl(request.fontFamilyKey, request.variant)),
    ] as const),
  )
  return Object.fromEntries(entries)
}

async function createBrowserFont(fontBuffer: Uint8Array | null | undefined): Promise<BrowserFont | null> {
  if (!fontBuffer) return null
  try {
    const mod = await import("@pdf-lib/fontkit")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fontkit = (mod as any).default ?? mod
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BufferCtor = (globalThis as any).Buffer
    const bufferLike = BufferCtor ? BufferCtor.from(fontBuffer) : fontBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fontkit as any).create(bufferLike) as BrowserFont
  } catch {
    return null
  }
}

export async function createBrowserFontkitMeasurer(
  fontBuffer: Uint8Array | null,
  fontBuffersByKey: BrowserFontBufferMap = {},
): Promise<TextMeasurer | null> {
  const defaultFont = await createBrowserFont(fontBuffer)
  const fontsByKey = new Map<string, BrowserFont>()

  if (defaultFont) fontsByKey.set(DEFAULT_FONT_KEY, defaultFont)
  for (const [key, buffer] of Object.entries(fontBuffersByKey)) {
    const font = await createBrowserFont(buffer)
    if (font) fontsByKey.set(key, font)
  }

  if (!defaultFont && fontsByKey.size === 0) return null

  const widthCache = new Map<string, number>()

  return {
    measureText(text, fontFamilyKey, fontSize, fontVariant = "regular") {
      if (!text) return { width: 0 }
      const variantKey = resolveFontVariantCacheKey(fontFamilyKey, fontVariant)
      const regularKey = resolveFontVariantCacheKey(fontFamilyKey, "regular")
      const cacheKey = JSON.stringify([variantKey, fontSize, text])
      const cached = widthCache.get(cacheKey)
      if (cached !== undefined) return { width: cached }
      const font = fontsByKey.get(variantKey) ?? fontsByKey.get(regularKey) ?? defaultFont ?? fontsByKey.get(DEFAULT_FONT_KEY)
      if (!font) return { width: text.length * fontSize * 0.5 }
      try {
        const run = font.layout(text)
        const width = (run.advanceWidth / font.unitsPerEm) * fontSize
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
