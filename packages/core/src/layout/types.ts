/**
 * Layout types ทำงานใน abstract units ทั้งหมด
 * ไม่รู้จัก pt, px, EMU — Renderer แปลงเอง
 */

import type { FontVariantKey } from "../font-registry"
import { segmentTextWithIntlWordBreaker } from "./word-segments"

// ─── Size ─────────────────────────────────────────────────────────────────────

export interface Size {
  width: number
  height: number
}

// ─── Measured Results ─────────────────────────────────────────────────────────

// ส่วนย่อยของบรรทัดที่ได้จาก line breaking/measurement
// x เป็นตำแหน่งสัมพัทธ์จากต้นบรรทัด; start/end เป็น index ใน display text
// เป็น layout result เท่านั้น ไม่ใช่ authored document data
export interface LineSegment {
  text: string
  start: number
  end: number
  x: number
  width: number
  kind: "word" | "space" | "field" | "grapheme" | "pageNumber"
  breakableAfter: boolean
  sourceId?: string
  sourceType?: "text" | "field" | "pageNumber"
  style?: TextRunLayoutStyle
}

export interface TextRunLayoutStyle {
  fontSize: number
  fontFamilyKey: string
  textColor: string
  fontWeight: "normal" | "bold"
  fontStyle: "normal" | "italic"
  textDecoration: "none" | "underline"
  strikethrough: boolean
  fontVariant: FontVariantKey
  lineHeight: number
}

export interface LineRun {
  text: string
  start: number
  end: number
  x: number
  width: number
  sourceId?: string
  sourceType: "text" | "field" | "pageNumber"
  style: TextRunLayoutStyle
}

// ผลลัพธ์การ measure paragraph — แต่ละบรรทัด
export interface MeasuredLine {
  text: string
  width: number
  height: number  // lineHeight
  segments?: LineSegment[]
  runs?: LineRun[]
}

export interface MeasuredBoxEdges {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MeasuredParagraphBorderSide {
  style: "solid" | "dashed" | "dotted"
  width: number
  color: string
}

export interface MeasuredParagraphBorder {
  top?: MeasuredParagraphBorderSide
  right?: MeasuredParagraphBorderSide
  bottom?: MeasuredParagraphBorderSide
  left?: MeasuredParagraphBorderSide
}

export interface MeasuredParagraphBox {
  fill?: string
  padding: MeasuredBoxEdges
  border: MeasuredParagraphBorder
  contentWidth: number
}

// ผลลัพธ์ measure paragraph ทั้งก้อน
export interface MeasuredParagraph {
  nodeId: string
  lines: MeasuredLine[]
  lineHeight: number
  spacingBefore: number
  spacingAfter: number
  width: number
  contentWidth: number
  box?: MeasuredParagraphBox
  totalHeight: number  // spacing + optional box insets + sum(lines)
}

// ผลลัพธ์ measure spacer
export interface MeasuredSpacer {
  nodeId: string
  height: number
  width: number
}

// ─── Flow Results ─────────────────────────────────────────────────────────────

// position ของ node หลัง flow — relative to parent
export interface FlowBox {
  nodeId: string
  nodeType:
    | "body"
    | "row"
    | "stack"
    | "flow-row"
    | "flow-stack"
    | "paragraph"
    | "spacer"
    | "flow-table"
    | "flow-table-row"
    | "flow-table-cell"
    | "toc"
  x: number
  y: number
  width: number
  height: number
  children: FlowBox[]
}

// ─── Text Measurer ────────────────────────────────────────────────────────────

export interface TextMeasurer {
  measureText(text: string, fontFamilyKey: string, fontSize: number, fontVariant?: FontVariantKey): { width: number }
  measureLineHeight(fontFamilyKey: string, fontSize: number, lineHeightRatio: number): number
}

export const defaultTextMeasurer: TextMeasurer = {
  measureText(text, _fontFamilyKey, fontSize) {
    let width = 0
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0
      if (code >= 0x0E00 && code <= 0x0E7F) {
        // Thai — Leelawadee Thai chars are moderately wide
        width += fontSize * 0.62
      } else if (code >= 0x0020 && code <= 0x007E) {
        // ASCII printable — average Latin width
        width += fontSize * 0.48
      } else if (code >= 0x0E80) {
        // Other CJK / extended unicode — assume wide
        width += fontSize * 0.6
      } else {
        width += fontSize * 0.5
      }
    }
    return { width }
  },
  measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
    return fontSize * lineHeightRatio
  },
}

// ─── Word Breaker ─────────────────────────────────────────────────────────────

// แยก text เป็น segments ที่ wrap ได้ — แต่ละ environment inject implementation เอง
// เช่น Thai ต้องใช้ dictionary, Latin ใช้ space-based
export interface WordBreaker {
  segment(text: string): string[]
}

// Default — uses the platform word segmenter when available. Segments preserve
// authored whitespace because wrapping must not reconstruct spaces manually.
export const defaultWordBreaker: WordBreaker = {
  segment(text: string): string[] {
    return segmentTextWithIntlWordBreaker(text)
  },
}
