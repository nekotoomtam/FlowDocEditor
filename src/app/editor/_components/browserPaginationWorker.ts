import { DEFAULT_FONT_KEY } from "@/font-registry"
import { defaultTextMeasurer, type TextMeasurer } from "@/layout"
import { paginateDocument, paginateDocumentWithProfile } from "@/pagination"
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

function workerNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

function roundWorkerMs(value: number): number {
  return Math.round(value * 10) / 10
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
    const receivedAt = workerNowMs()
    try {
      const measurerStartedAt = workerNowMs()
      const { measurer, status } = await resolveWorkerMeasurer()
      const measurerEndedAt = workerNowMs()
      const partialStartedAt = workerNowMs()
      const partialResponse = tryBuildBrowserPaginationPartialResponse(request, measurer, status)
      const partialEndedAt = workerNowMs()
      if (partialResponse) workerScope.postMessage(partialResponse)
      const computeStartedAt = workerNowMs()
      const profileResult = request.profilePagination
        ? paginateDocumentWithProfile(request.doc, measurer, undefined, undefined, { paginationProfileSource: "browser" })
        : null
      const paginated = profileResult?.paginated ?? paginateDocument(request.doc, measurer)
      const computeEndedAt = workerNowMs()
      const responseBuildStartedAt = workerNowMs()
      const workerTiming = {
        receivedAtMs: roundWorkerMs(receivedAt),
        resolveMeasurerMs: roundWorkerMs(measurerEndedAt - measurerStartedAt),
        ...(partialResponse ? { partialResponseMs: roundWorkerMs(partialEndedAt - partialStartedAt) } : {}),
        computeStartAfterReceiveMs: roundWorkerMs(computeStartedAt - receivedAt),
        computeMs: roundWorkerMs(computeEndedAt - computeStartedAt),
        responseBuildMs: 0,
        totalBeforeSuccessPostMs: 0,
      }
      const response: BrowserPaginationWorkerResponse = {
        type: "success",
        requestId: request.requestId,
        paginated,
        measurerStatus: status,
        paginationProfile: profileResult?.paginationProfile,
        workerTiming,
      }
      const responseBuildEndedAt = workerNowMs()
      workerTiming.responseBuildMs = roundWorkerMs(responseBuildEndedAt - responseBuildStartedAt)
      workerTiming.totalBeforeSuccessPostMs = roundWorkerMs(responseBuildEndedAt - receivedAt)
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
