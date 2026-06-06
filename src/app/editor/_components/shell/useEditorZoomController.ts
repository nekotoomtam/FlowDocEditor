import { useCallback, useState } from "react"
import { ZOOM_STEP } from "./editorShellConstants"
import type { ZoomMode } from "./editorShellTypes"
import { clampScale } from "./editorShellZoom"

export function useEditorZoomController(initialScale = 0.6) {
  const [scale, setScale] = useState(initialScale)
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")

  const handleCanvasScaleChange = useCallback((nextScale: number) => {
    setScale(clampScale(nextScale))
  }, [])

  const setManualScale = useCallback((nextScale: number) => {
    setZoomMode("manual")
    setScale(clampScale(nextScale))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomMode("manual")
    setScale((current) => clampScale(Math.round((current + ZOOM_STEP) * 100) / 100))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomMode("manual")
    setScale((current) => clampScale(Math.round((current - ZOOM_STEP) * 100) / 100))
  }, [])

  const zoomByWheel = useCallback((deltaY: number) => {
    setZoomMode("manual")
    const direction = deltaY < 0 ? 1 : -1
    setScale((current) => clampScale(Math.round((current + direction * ZOOM_STEP) * 100) / 100))
  }, [])

  const resetZoom = useCallback(() => {
    setManualScale(1)
  }, [setManualScale])

  const fitZoom = useCallback(() => {
    setZoomMode("fit")
  }, [])

  return {
    scale,
    zoomMode,
    handleCanvasScaleChange,
    setManualScale,
    zoomIn,
    zoomOut,
    zoomByWheel,
    resetZoom,
    fitZoom,
  }
}
