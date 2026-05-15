import type { TextMeasurer } from "@/layout"
import { createBrowserFontkitMeasurer, loadBrowserFontBuffer } from "./browserFontkitMeasurer"

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
  loadFontBuffer: () => Promise<Uint8Array | null> = loadBrowserFontBuffer,
  createFontkitMeasurer: (fontBuffer: Uint8Array | null) => Promise<TextMeasurer | null> = createBrowserFontkitMeasurer,
): Promise<EditorTextMeasurerState> {
  const fontBuffer = await loadFontBuffer().catch(() => null)
  if (!fontBuffer) return { status: "fallback", measurer: fallbackMeasurer }

  const fontkitMeasurer = await createFontkitMeasurer(fontBuffer).catch(() => null)
  if (!fontkitMeasurer) return { status: "fallback", measurer: fallbackMeasurer }

  return { status: "fontkit", measurer: fontkitMeasurer }
}
