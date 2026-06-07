import { useEffect, useLayoutEffect, useState } from "react"
import { createBrowserTextMeasurer } from "../browserTextMeasurer"
import { resolveBrowserEditorTextMeasurer, type EditorTextMeasurerStatus } from "../editorTextMeasurerState"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  finishFlowDocPerfSpan,
  recordFlowDocPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"
import type { TextMeasurer } from "@/layout"

export function useEditorTextMeasurerController() {
  const [editorTextMeasurer, setEditorTextMeasurer] = useState<TextMeasurer>(() => createBrowserTextMeasurer())
  const [editorTextMeasurerStatus, setEditorTextMeasurerStatus] = useState<EditorTextMeasurerStatus>("loading")
  const [fontReadyVersion, setFontReadyVersion] = useState(0)

  useLayoutEffect(() => {
    let cancelled = false
    const startedAt = startWysiwygPerfSpan()
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:font-readiness-start",
      startMs: startedAt,
    })
    const fallbackMeasurer = createBrowserTextMeasurer()
    resolveBrowserEditorTextMeasurer(fallbackMeasurer, undefined, undefined, (event) => {
      recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        name: `pre-pagination:${event.name}`,
        startMs: event.startMs,
        durationMs: event.durationMs,
        detail: event.detail,
      })
    }).then((next) => {
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:font-readiness", startedAt, {
        status: next.status,
        cancelled,
      })
      if (cancelled) return
      setEditorTextMeasurer(next.measurer)
      setEditorTextMeasurerStatus(next.status)
      setFontReadyVersion((version) => version + 1)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return
    void document.fonts.ready.then(() => setFontReadyVersion((version) => version + 1))
  }, [])

  return {
    editorTextMeasurer,
    editorTextMeasurerStatus,
    fontReadyVersion,
  }
}
