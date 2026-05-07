import type { LineSegment } from "../layout"

/**
 * Pagination types — รู้จัก page และ cursor
 * รับ FlowBox จาก layout แล้วตัดเป็น pages
 */

// ─── Page Metrics ─────────────────────────────────────────────────────────────

export interface PageContentBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PageMetrics {
  pageWidth: number
  pageHeight: number
  contentBox: PageContentBox
}

// ─── Cursor ───────────────────────────────────────────────────────────────────

// cursor ติดตามตำแหน่ง flow ปัจจุบัน
export interface PageFlowCursor {
  pageIndex: number
  cursorY: number
}

// ─── Table Cell Render Props ──────────────────────────────────────────────────

export interface ResolvedBorderSide {
  style: "solid" | "dashed" | "dotted" | "none"
  width: number  // abstract pt
  color: string  // hex ไม่มี #
}

export interface ResolvedCellBorder {
  top?: ResolvedBorderSide
  right?: ResolvedBorderSide
  bottom?: ResolvedBorderSide
  left?: ResolvedBorderSide
}

export interface TableCellRenderProps {
  colspan: number
  rowspan: number
  border: ResolvedCellBorder
  background?: string
  padding: number  // abstract pt
  verticalAlign: "top" | "middle" | "bottom"
  continuesOnNext?: boolean    // cell ถูกตัดข้ามหน้า — ไม่วาด border ด้านล่าง
  continuedFromPrev?: boolean  // cell ต่อจากหน้าก่อน — ไม่วาด border ด้านบน
}

// ─── Render Props ─────────────────────────────────────────────────────────────

// ข้อมูลที่ renderer ต้องการสำหรับ paragraph — ค่าทุกอย่างแปลงเป็น abstract pt แล้ว
export interface ParagraphRenderProps {
  fontSize: number
  fontFamilyKey: string
  align: "left" | "center" | "right" | "justify"
  lineHeight: number
  spacingBefore: number
  spacingAfter: number
  textIndent: number
  indentLeft: number
  indentRight: number
}

// ─── Page Fragments ───────────────────────────────────────────────────────────

export interface PageFragment {
  nodeId: string
  nodeType: "paragraph" | "spacer" | "stack" | "row" | "body" | "table" | "toc"
  parentNodeId?: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  lines?: PaginatedLine[]
  renderProps?: ParagraphRenderProps
  cellRenderProps?: TableCellRenderProps
}

export interface PaginatedLine {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize?: number  // per-line font size override (ใช้ใน TOC title vs entry)
  segments?: LineSegment[]
}

// ─── TOC ──────────────────────────────────────────────────────────────────────

export interface TocEntry {
  nodeId: string
  text: string
  level: 1 | 2 | 3
  pageNumber: number  // 1-based
}

// ─── Paginated Document ───────────────────────────────────────────────────────

export interface PaginatedPage {
  index: number
  width: number
  height: number
  contentBox: PageContentBox
  fragments: PageFragment[]          // body fragments
  headerFragments: PageFragment[]    // header fragments สำหรับหน้านี้
  footerFragments: PageFragment[]    // footer fragments สำหรับหน้านี้
}

export interface PaginatedSection {
  sectionId: string
  pages: PaginatedPage[]
}

export interface PaginatedDocument {
  sections: PaginatedSection[]
  tocEntries: TocEntry[]
}
