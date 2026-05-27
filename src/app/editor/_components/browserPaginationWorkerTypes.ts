import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"

export type BrowserPaginationWorkerMeasurerStatus = "fontkit" | "fallback"

export interface BrowserPaginationWorkerVisibleWindow {
  pageIndex: number
  marginPages: number
}

export interface BrowserPaginationWorkerPartialCoverage {
  startPageIndex: number
  endPageIndex: number
  requestedPageIndex: number
}

export interface BrowserPaginationWorkerRequest {
  type: "paginate"
  requestId: number
  doc: DocumentNode
  visibleWindow?: BrowserPaginationWorkerVisibleWindow
}

export type BrowserPaginationWorkerResponse =
  | {
    type: "partial"
    requestId: number
    paginated: PaginatedDocument
    coverage: BrowserPaginationWorkerPartialCoverage
    measurerStatus?: BrowserPaginationWorkerMeasurerStatus
  }
  | {
    type: "success"
    requestId: number
    paginated: PaginatedDocument
    measurerStatus: BrowserPaginationWorkerMeasurerStatus
  }
  | {
    type: "error"
    requestId: number
    message: string
  }
