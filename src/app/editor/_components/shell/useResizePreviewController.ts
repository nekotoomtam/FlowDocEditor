import { useCallback, useEffect, useRef } from "react"
import type { ResizeDrag } from "../editorInteractionTypes"

export function useResizePreviewController(scale: number) {
  const resizePreviewRef = useRef<HTMLDivElement | null>(null)
  const resizePreviewFrameRef = useRef<number | null>(null)
  const pendingResizePreviewRef = useRef<ResizeDrag | null>(null)

  const renderResizePreview = useCallback((drag: ResizeDrag | null) => {
    const element = resizePreviewRef.current
    if (!element) return
    if (!drag || drag.committed) {
      element.style.display = "none"
      return
    }

    const previewY = drag.type === "table-column" ? drag.tableFragY : drag.rowFragY
    const previewHeight = drag.type === "table-column" ? drag.tableFragHeight : drag.rowFragHeight
    const leftPx = drag.svgLeft + drag.currentDocX * scale
    const topPx = drag.svgTop + previewY * scale
    element.style.display = "block"
    element.style.height = `${Math.max(previewHeight * scale, 8)}px`
    element.style.transform = `translate3d(${leftPx - 1}px, ${topPx}px, 0)`
  }, [scale])

  const scheduleResizePreview = useCallback((drag: ResizeDrag | null) => {
    pendingResizePreviewRef.current = drag
    if (typeof requestAnimationFrame === "undefined") {
      renderResizePreview(drag)
      return
    }
    if (resizePreviewFrameRef.current !== null) return
    resizePreviewFrameRef.current = requestAnimationFrame(() => {
      resizePreviewFrameRef.current = null
      renderResizePreview(pendingResizePreviewRef.current)
    })
  }, [renderResizePreview])

  const hideResizePreview = useCallback(() => {
    pendingResizePreviewRef.current = null
    if (resizePreviewFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(resizePreviewFrameRef.current)
      resizePreviewFrameRef.current = null
    }
    renderResizePreview(null)
  }, [renderResizePreview])

  useEffect(() => () => hideResizePreview(), [hideResizePreview])

  return {
    resizePreviewRef,
    scheduleResizePreview,
    hideResizePreview,
  }
}
