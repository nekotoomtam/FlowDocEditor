import type { TextMeasurer } from "@/layout"
import { tryPaginateDocumentBodyBasicsVisibleWindow } from "@/pagination"
import type {
  BrowserPaginationWorkerMeasurerStatus,
  BrowserPaginationWorkerRequest,
  BrowserPaginationWorkerResponse,
} from "./browserPaginationWorkerTypes"

export function tryBuildBrowserPaginationPartialResponse(
  request: BrowserPaginationWorkerRequest,
  measurer: TextMeasurer,
  measurerStatus: BrowserPaginationWorkerMeasurerStatus,
): BrowserPaginationWorkerResponse | null {
  if (!request.visibleWindow) return null

  const partial = tryPaginateDocumentBodyBasicsVisibleWindow(request.doc, measurer, {
    pageIndex: request.visibleWindow.pageIndex,
    marginPages: request.visibleWindow.marginPages,
  })
  if (partial.status !== "supported" || partial.coverage.completedDocument) return null

  return {
    type: "partial",
    requestId: request.requestId,
    paginated: partial.paginated,
    coverage: {
      startPageIndex: partial.coverage.startPageIndex,
      endPageIndex: partial.coverage.endPageIndex,
      requestedPageIndex: partial.coverage.requestedPageIndex,
    },
    measurerStatus,
  }
}
