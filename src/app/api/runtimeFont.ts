import fs from "node:fs"
import path from "node:path"
import type { FontVariantKey } from "@/font-registry"
import { DEFAULT_FONT_KEY, listRuntimeFontVariantRequests, resolveFontFileName, resolveFontVariantCacheKey } from "@/font-registry"

export const RUNTIME_FONT_RESPONSE_HEADER = "X-FlowDoc-Font"
export const RUNTIME_FONT_FALLBACK_VALUE = "fallback"

const RUNTIME_FONT_DIR = ["public", "fonts"] as const
const fontCache = new Map<string, Uint8Array | null>()

export function resolveRuntimeFontPath(
  key: string = DEFAULT_FONT_KEY,
  variant: FontVariantKey = "regular",
  cwd: string = process.cwd(),
): string {
  return path.join(cwd, ...RUNTIME_FONT_DIR, resolveFontFileName(key, variant))
}

export function loadRuntimeFontSync(key: string = DEFAULT_FONT_KEY, variant: FontVariantKey = "regular"): Uint8Array | null {
  const cacheKey = resolveFontVariantCacheKey(key, variant)
  if (fontCache.has(cacheKey)) return fontCache.get(cacheKey)!

  const fontPath = resolveRuntimeFontPath(key, variant)
  try {
    const buf = new Uint8Array(fs.readFileSync(fontPath))
    fontCache.set(cacheKey, buf)
    return buf
  } catch (err) {
    console.error(
      `[FlowDoc] runtime font "${key}" (${variant}) not found at "${fontPath}" — using Helvetica fallback. ` +
      `Thai text layout and export rendering will be incorrect. Error: ${err}`,
    )
    fontCache.set(cacheKey, null)
    return null
  }
}

export function loadRuntimeFontMapSync(): Record<string, Uint8Array | null> {
  return Object.fromEntries(
    listRuntimeFontVariantRequests().map((request) => [
      request.cacheKey,
      loadRuntimeFontSync(request.fontFamilyKey, request.variant),
    ]),
  )
}

export function runtimeFontFallbackHeaders(usingFallback: boolean): Record<string, string> {
  return usingFallback ? { [RUNTIME_FONT_RESPONSE_HEADER]: RUNTIME_FONT_FALLBACK_VALUE } : {}
}

export function resetRuntimeFontCacheForTests(): void {
  fontCache.clear()
}
