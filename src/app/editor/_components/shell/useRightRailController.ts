import { useCallback, useState, type PointerEvent } from "react"
import {
  RIGHT_RAIL_COLLAPSED_WIDTH,
  RIGHT_RAIL_CONTENT_HIDE_THRESHOLD,
  RIGHT_RAIL_MIN_WIDTH,
  resolveRightRailPreviewWidth,
  resolveRightRailResize,
  resolveRightRailResizeStartWidth,
} from "../rightRailResize"
import type { RightRailMode, RightRailResizeDrag } from "./editorShellTypes"

export function useRightRailController() {
  const [rightRailMode, setRightRailMode] = useState<RightRailMode>("page")
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false)
  const [rightRailWidth, setRightRailWidth] = useState(RIGHT_RAIL_MIN_WIDTH)
  const [rightRailResizeDrag, setRightRailResizeDrag] = useState<RightRailResizeDrag | null>(null)
  const [rightRailResizeHandleHover, setRightRailResizeHandleHover] = useState(false)

  const rightRailDisplayWidth = rightRailCollapsed
    ? RIGHT_RAIL_COLLAPSED_WIDTH
    : rightRailResizeDrag?.previewWidth ?? rightRailWidth
  const rightRailContentVisible = !rightRailCollapsed && rightRailDisplayWidth >= RIGHT_RAIL_CONTENT_HIDE_THRESHOLD
  const rightRailResizeHandleActive = rightRailResizeHandleHover || Boolean(rightRailResizeDrag)

  const openRightRailMode = useCallback((mode: RightRailMode) => {
    setRightRailResizeDrag(null)
    setRightRailCollapsed(false)
    setRightRailMode(mode)
  }, [])

  const startRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startWidth = resolveRightRailResizeStartWidth({ collapsed: rightRailCollapsed, width: rightRailWidth })
    setRightRailResizeDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      previewWidth: startWidth,
    })
  }, [rightRailCollapsed, rightRailWidth])

  const moveRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setRightRailResizeDrag((drag) => {
      if (!drag || drag.pointerId !== event.pointerId) return drag
      const rawWidth = drag.startWidth + (drag.startX - event.clientX)
      return { ...drag, previewWidth: resolveRightRailPreviewWidth(rawWidth) }
    })
  }, [])

  const finishRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setRightRailResizeDrag((drag) => {
      if (!drag || drag.pointerId !== event.pointerId) return drag
      const next = resolveRightRailResize(drag.previewWidth)
      setRightRailCollapsed(next.collapsed)
      if (!next.collapsed) setRightRailWidth(next.width)
      return null
    })
  }, [])

  return {
    rightRailMode,
    setRightRailMode,
    rightRailCollapsed,
    setRightRailCollapsed,
    rightRailWidth,
    rightRailResizeDrag,
    setRightRailResizeDrag,
    rightRailResizeHandleHover,
    setRightRailResizeHandleHover,
    rightRailDisplayWidth,
    rightRailContentVisible,
    rightRailResizeHandleActive,
    openRightRailMode,
    startRightRailResize,
    moveRightRailResize,
    finishRightRailResize,
  }
}
