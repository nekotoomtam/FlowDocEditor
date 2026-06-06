import { useEffect, useMemo, useState } from "react"
import type { EditorExportFeedback } from "./EditorToolbar"

export function useExportFeedbackElapsed(exportFeedback: EditorExportFeedback | null): number | null {
  const [exportFeedbackTick, setExportFeedbackTick] = useState(0)

  useEffect(() => {
    if (!exportFeedback) return
    const intervalId = window.setInterval(() => setExportFeedbackTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [exportFeedback])

  return useMemo(() => (
    exportFeedback ? Date.now() - exportFeedback.startedAt : null
  ), [exportFeedback, exportFeedbackTick])
}
