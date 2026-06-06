import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import { finishFlowDocPerfSpan, startWysiwygPerfSpan } from "../wysiwygPerformance"

export function createBrowserPaginationWorker(): Worker | null {
  if (typeof Worker === "undefined") return null
  const startedAt = startWysiwygPerfSpan()
  try {
    const worker = new Worker(new URL("../browserPaginationWorker.ts", import.meta.url), { type: "module" })
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-create", startedAt, {
      source: "document-preview-worker",
    })
    return worker
  } catch (error) {
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-create", startedAt, {
      source: "document-preview-worker",
      failed: true,
      message: error instanceof Error ? error.message : String(error),
    })
    console.error("browser pagination worker unavailable:", error)
    return null
  }
}
