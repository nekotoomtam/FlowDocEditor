import type { CSSProperties } from "react"

export function editorShellRootStyle({
  dragActive,
  resizeActive,
  minHeightResizeActive,
  marginResizeSide,
  headerFooterReservedResizeActive,
}: {
  dragActive: boolean
  resizeActive: boolean
  minHeightResizeActive: boolean
  marginResizeSide: "top" | "right" | "bottom" | "left" | null
  headerFooterReservedResizeActive: boolean
}): CSSProperties {
  return {
    fontFamily: "monospace",
    background: "#f9fafb",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    cursor: dragActive
      ? "grabbing"
      : resizeActive
        ? "col-resize"
        : minHeightResizeActive
          ? "row-resize"
          : marginResizeSide
            ? marginResizeSide === "left" || marginResizeSide === "right" ? "ew-resize" : "ns-resize"
            : headerFooterReservedResizeActive
              ? "ns-resize"
              : "default",
    userSelect: dragActive || resizeActive || minHeightResizeActive || Boolean(marginResizeSide) || headerFooterReservedResizeActive
      ? "none"
      : undefined,
  }
}
