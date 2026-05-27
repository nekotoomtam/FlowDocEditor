import { DEFAULT_FONT_KEY } from "@/font-registry"
import { defaultTextMeasurer, type TextMeasurer } from "@/layout"
import { paginateDocument } from "@/pagination"
import {
  createBrowserFontkitMeasurer,
  loadBrowserFontBuffers,
  type BrowserFontBufferMap,
} from "./browserFontkitMeasurer"
import { tryBuildBrowserPaginationPartialResponse } from "./browserPaginationWorkerStrategy"
import type {
  BrowserPaginationWorkerMeasurerStatus,
  BrowserPaginationWorkerRequest,
  BrowserPaginationWorkerResponse,
} from "./browserPaginationWorkerTypes"

interface WorkerMeasurerState {
  measurer: TextMeasurer
  status: BrowserPaginationWorkerMeasurerStatus
}

let measurerPromise: Promise<WorkerMeasurerState> | null = null

async function resolveWorkerMeasurer(): Promise<WorkerMeasurerState> {
  if (!measurerPromise) {
    measurerPromise = loadBrowserFontBuffers()
      .then(async (fontBuffers: BrowserFontBufferMap) => {
        const defaultFontBuffer = fontBuffers[DEFAULT_FONT_KEY] ?? null
        if (!defaultFontBuffer) return { measurer: defaultTextMeasurer, status: "fallback" as const }
        const measurer = await createBrowserFontkitMeasurer(defaultFontBuffer, fontBuffers)
        return measurer
          ? { measurer, status: "fontkit" as const }
          : { measurer: defaultTextMeasurer, status: "fallback" as const }
      })
      .catch(() => ({ measurer: defaultTextMeasurer, status: "fallback" as const }))
  }
  return measurerPromise
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type BrowserPaginationWorkerScope = typeof self & {
  onmessage: ((event: MessageEvent<BrowserPaginationWorkerRequest>) => void) | null
  postMessage: (message: BrowserPaginationWorkerResponse) => void
}

const workerScope = self as BrowserPaginationWorkerScope

workerScope.onmessage = (event: MessageEvent<BrowserPaginationWorkerRequest>) => {
  const request = event.data
  if (request?.type !== "paginate") return

  void (async () => {
    try {
      const { measurer, status } = await resolveWorkerMeasurer()
      const partialResponse = tryBuildBrowserPaginationPartialResponse(request, measurer, status)
      if (partialResponse) workerScope.postMessage(partialResponse)
      const paginated = paginateDocument(request.doc, measurer)
      const response: BrowserPaginationWorkerResponse = {
        type: "success",
        requestId: request.requestId,
        paginated,
        measurerStatus: status,
      }
      workerScope.postMessage(response)
    } catch (error) {
      const response: BrowserPaginationWorkerResponse = {
        type: "error",
        requestId: request.requestId,
        message: errorMessage(error),
      }
      workerScope.postMessage(response)
    }
  })()
}

export {}
