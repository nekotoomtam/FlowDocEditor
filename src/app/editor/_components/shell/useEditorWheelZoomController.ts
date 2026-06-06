import { useCallback, useEffect, type RefObject, type WheelEvent as ReactWheelEvent } from "react"

function shouldIgnoreWheelZoomTarget(target: HTMLElement | null): boolean {
  const tag = target?.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true
}

export function useEditorWheelZoomController({
  editorRootRef,
  zoomByWheel,
}: {
  editorRootRef: RefObject<HTMLDivElement | null>
  zoomByWheel: (deltaY: number) => void
}) {
  useEffect(() => {
    const root = editorRootRef.current
    if (!root) return
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      if (shouldIgnoreWheelZoomTarget(target)) return
      event.preventDefault()
      zoomByWheel(event.deltaY)
    }
    root.addEventListener("wheel", handleWheel, { passive: false })
    return () => root.removeEventListener("wheel", handleWheel)
  }, [editorRootRef, zoomByWheel])

  const handleWheelCapture = useCallback((_event: ReactWheelEvent<HTMLDivElement>) => {
    // The native listener above owns ctrl/meta wheel zoom with passive:false.
  }, [])

  return {
    handleWheelCapture,
  }
}
