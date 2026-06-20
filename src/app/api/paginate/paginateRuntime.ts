import type { TextMeasurer } from "@/layout"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { DEFAULT_FONT_KEY } from "@/font-registry"
import { loadRuntimeFontMapSync, loadRuntimeFontSync } from "../runtimeFont"

export interface RuntimePaginationMeasurer {
  measurer: TextMeasurer
  fontFallback: boolean
}

let cachedRuntimePaginationMeasurer: RuntimePaginationMeasurer | null = null

export function getRuntimePaginationMeasurer(): RuntimePaginationMeasurer {
  if (cachedRuntimePaginationMeasurer) return cachedRuntimePaginationMeasurer

  const fontBuffer = loadRuntimeFontSync(DEFAULT_FONT_KEY)
  cachedRuntimePaginationMeasurer = {
    measurer: createFontkitMeasurer(fontBuffer, loadRuntimeFontMapSync()),
    fontFallback: fontBuffer === null,
  }
  return cachedRuntimePaginationMeasurer
}

export function resetRuntimePaginationMeasurerForTests(): void {
  cachedRuntimePaginationMeasurer = null
}
