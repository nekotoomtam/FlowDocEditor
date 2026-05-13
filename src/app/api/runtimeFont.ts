import fs from "node:fs"
import path from "node:path"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "@/font-registry"

export const RUNTIME_FONT_RESPONSE_HEADER = "X-FlowDoc-Font"
export const RUNTIME_FONT_FALLBACK_VALUE = "fallback"

const RUNTIME_FONT_DIR = ["public", "fonts"] as const
const fontCache = new Map<string, Uint8Array | null>()

export function resolveRuntimeFontPath(key: string = DEFAULT_FONT_KEY, cwd: string = process.cwd()): string {
  return path.join(cwd, ...RUNTIME_FONT_DIR, resolveFontFileName(key))
}

export function loadRuntimeFontSync(key: string = DEFAULT_FONT_KEY): Uint8Array | null {
  if (fontCache.has(key)) return fontCache.get(key)!

  const fontPath = resolveRuntimeFontPath(key)
  try {
    const buf = new Uint8Array(fs.readFileSync(fontPath))
    fontCache.set(key, buf)
    return buf
  } catch (err) {
    console.error(
      `[FlowDoc] runtime font "${key}" not found at "${fontPath}" — using Helvetica fallback. ` +
      `Thai text layout and export rendering will be incorrect. Error: ${err}`,
    )
    fontCache.set(key, null)
    return null
  }
}

export function runtimeFontFallbackHeaders(usingFallback: boolean): Record<string, string> {
  return usingFallback ? { [RUNTIME_FONT_RESPONSE_HEADER]: RUNTIME_FONT_FALLBACK_VALUE } : {}
}

export function resetRuntimeFontCacheForTests(): void {
  fontCache.clear()
}
