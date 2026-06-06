import type { DragState } from "./editorReducer"

export type { DragState }

export interface StackResizeDrag {
  type: "stack"
  rowId: string
  leftStackId: string
  rightStackId: string
  pairX: number          // left stack x in doc coords
  pairWidth: number      // left + right stack width in doc coords
  gapWidthPt: number     // gap between the left and right stack fragments
  svgLeft: number        // SVG client left at drag start
  svgTop: number         // SVG client top at drag start
  pageKey: string
  rowFragY: number       // row top in doc coords
  rowFragHeight: number  // row height in doc coords
  currentDocX: number    // current drag position in doc coords
  leftShareOriginal: number
  rightShareOriginal: number
  totalShare: number     // leftShare + rightShare
  minWidthPt: number     // min column width in pt
  stackKind: "stack" | "flow-stack"
  committed?: boolean
}

export interface TableColumnResizeDrag {
  type: "table-column"
  tableId: string
  leftColIndex: number
  pairX: number          // left column x in rendered doc coords
  pairWidth: number      // left + right column rendered width in doc coords
  svgLeft: number        // SVG client left at drag start
  svgTop: number         // SVG client top at drag start
  pageKey: string
  tableFragY: number     // table fragment top in doc coords
  tableFragHeight: number // table fragment height in doc coords
  currentDocX: number    // current drag position in rendered doc coords
  pointerOffsetDocX: number
  leftWidthOriginal: number
  rightWidthOriginal: number
  pairWidthAuthored: number
  minWidthPt: number     // rendered min column width in pt
  committed?: boolean
}

export type ResizeDrag = StackResizeDrag | TableColumnResizeDrag

export interface MinHeightDrag {
  rowId: string
  rowFragY: number       // row top in doc coords
  svgTop: number         // SVG client top at drag start
  minPt: number          // natural content height
  currentMinHeight: number
  pageKey: string
  committed?: boolean
}

export interface MarginDrag {
  sectionIndex: number
  side: "top" | "right" | "bottom" | "left"
  pageWidthPt: number
  pageHeightPt: number
  currentMargins: { top: number; right: number; bottom: number; left: number }
  pageKey: string
  altKey: boolean        // true = single-side mode (no mirror)
  committed?: boolean
}

export interface MarginEditMode {
  sectionIndex: number
}

export interface HeaderFooterEditMode {
  sectionIndex: number
  zone: "header" | "footer"
}

export interface HeaderFooterReservedDrag {
  sectionIndex: number
  zone: "header" | "footer"
  pageKey: string
  pageHeightPt: number
  marginTopPt: number
  marginBottomPt: number
  currentReserved: { headerReserved: number; footerReserved: number }
  committed?: boolean
}
