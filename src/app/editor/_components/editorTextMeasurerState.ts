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

export interface EditorTextMeasurerTraceEvent {
  name: string
  startMs: number
  durationMs: number
  detail?: Record<string, unknown>
}

export type EditorTextMeasurerTrace = (event: EditorTextMeasurerTraceEvent) => void

let defaultBrowserEditorTextMeasurerPromise: Promise<EditorTextMeasurerState> | null = null

export function isEditorTextMeasurerReady(status: EditorTextMeasurerStatus): boolean {
  return status !== "loading"
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function finishTrace(
  trace: EditorTextMeasurerTrace | undefined,
  name: string,
  startedAt: number,
  detail: Record<string, unknown> = {},
): void {
  if (!trace) return
  trace({
    name,
    startMs: startedAt,
    durationMs: Math.max(0, nowMs() - startedAt),
    ...(Object.keys(detail).length > 0 ? { detail } : {}),
  })
}

async function resolveBrowserEditorTextMeasurerUncached(
  fallbackMeasurer: TextMeasurer,
  loadFontBuffers: () => Promise<BrowserFontBufferMap | null>,
  createFontkitMeasurer: (fontBuffer: Uint8Array | null, fontBuffersByKey?: BrowserFontBufferMap) => Promise<TextMeasurer | null>,
  trace?: EditorTextMeasurerTrace,
): Promise<EditorTextMeasurerState> {
  const loadStartedAt = nowMs()
  const fontBuffers = await loadFontBuffers().catch(() => null)
  const fontEntries = Object.values(fontBuffers ?? {})
  finishTrace(trace, "fontkit:main-font-buffers-load", loadStartedAt, {
    fontCount: fontEntries.length,
    loadedFontCount: fontEntries.filter(Boolean).length,
  })

  const defaultFontBuffer = fontBuffers?.[DEFAULT_FONT_KEY] ?? null
  if (!defaultFontBuffer) return { status: "fallback", measurer: fallbackMeasurer }

  const createStartedAt = nowMs()
  const fontkitMeasurer = await createFontkitMeasurer(defaultFontBuffer, fontBuffers ?? undefined).catch(() => null)
  finishTrace(trace, "fontkit:main-measurer-create", createStartedAt, {
    status: fontkitMeasurer ? "fontkit" : "fallback",
  })
  if (!fontkitMeasurer) return { status: "fallback", measurer: fallbackMeasurer }

  return { status: "fontkit", measurer: fontkitMeasurer }
}

export async function resolveBrowserEditorTextMeasurer(
  fallbackMeasurer: TextMeasurer,
  loadFontBuffers: () => Promise<BrowserFontBufferMap | null> = loadBrowserFontBuffers,
  createFontkitMeasurer: (fontBuffer: Uint8Array | null, fontBuffersByKey?: BrowserFontBufferMap) => Promise<TextMeasurer | null> = createBrowserFontkitMeasurer,
  trace?: EditorTextMeasurerTrace,
): Promise<EditorTextMeasurerState> {
  const usesDefaultFontPipeline =
    loadFontBuffers === loadBrowserFontBuffers &&
    createFontkitMeasurer === createBrowserFontkitMeasurer

  if (!usesDefaultFontPipeline) {
    return resolveBrowserEditorTextMeasurerUncached(
      fallbackMeasurer,
      loadFontBuffers,
      createFontkitMeasurer,
      trace,
    )
  }

  if (!defaultBrowserEditorTextMeasurerPromise) {
    defaultBrowserEditorTextMeasurerPromise = resolveBrowserEditorTextMeasurerUncached(
      fallbackMeasurer,
      loadFontBuffers,
      createFontkitMeasurer,
      trace,
    )
  } else {
    const startedAt = nowMs()
    finishTrace(trace, "fontkit:main-measurer-promise-reuse", startedAt)
  }

  return defaultBrowserEditorTextMeasurerPromise
}
