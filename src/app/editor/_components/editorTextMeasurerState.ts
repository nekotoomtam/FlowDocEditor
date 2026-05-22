import type { TextMeasurer } from "@/layout"
import {
  createBrowserFontkitMeasurer,
  loadBrowserFontBuffers,
  type BrowserFontBufferMap,
} from "./browserFontkitMeasurer"
import { DEFAULT_FONT_KEY } from "@/font-registry"

export type EditorTextMeasurerStatus = "loading" | "fontkit" | "fallback"

export interface EditorTextMeasurerState {
  status: EditorTextMeasurerStatus
  measurer: TextMeasurer
}

export function isEditorTextMeasurerReady(status: EditorTextMeasurerStatus): boolean {
  return status !== "loading"
}

export async function resolveBrowserEditorTextMeasurer(
  fallbackMeasurer: TextMeasurer,
  loadFontBuffers: () => Promise<BrowserFontBufferMap | null> = loadBrowserFontBuffers,
  createFontkitMeasurer: (fontBuffer: Uint8Array | null, fontBuffersByKey?: BrowserFontBufferMap) => Promise<TextMeasurer | null> = createBrowserFontkitMeasurer,
): Promise<EditorTextMeasurerState> {
  const fontBuffers = await loadFontBuffers().catch(() => null)
  const defaultFontBuffer = fontBuffers?.[DEFAULT_FONT_KEY] ?? null
  if (!defaultFontBuffer) return { status: "fallback", measurer: fallbackMeasurer }

  const fontkitMeasurer = await createFontkitMeasurer(defaultFontBuffer, fontBuffers ?? undefined).catch(() => null)
  if (!fontkitMeasurer) return { status: "fallback", measurer: fallbackMeasurer }

  return { status: "fontkit", measurer: fontkitMeasurer }
}
