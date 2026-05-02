/**
 * Layout types ทำงานใน abstract units ทั้งหมด
 * ไม่รู้จัก pt, px, EMU — Renderer แปลงเอง
 */

// ─── Size ─────────────────────────────────────────────────────────────────────

export interface Size {
  width: number
  height: number
}

// ─── Measured Results ─────────────────────────────────────────────────────────

// ผลลัพธ์การ measure paragraph — แต่ละบรรทัด
export interface MeasuredLine {
  text: string
  width: number
  height: number  // lineHeight
}

// ผลลัพธ์ measure paragraph ทั้งก้อน
export interface MeasuredParagraph {
  nodeId: string
  lines: MeasuredLine[]
  lineHeight: number
  spacingBefore: number
  spacingAfter: number
  width: number
  totalHeight: number  // sum(lines) + spacingBefore + spacingAfter
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
  nodeType: "body" | "row" | "stack" | "paragraph" | "spacer" | "table" | "toc"
  x: number
  y: number
  width: number
  height: number
  children: FlowBox[]
}

// ─── Text Measurer ────────────────────────────────────────────────────────────

export interface TextMeasurer {
  measureText(text: string, fontFamilyKey: string, fontSize: number): { width: number }
  measureLineHeight(fontFamilyKey: string, fontSize: number, lineHeightRatio: number): number
}

export const defaultTextMeasurer: TextMeasurer = {
  measureText(text, _fontFamilyKey, fontSize) {
    return { width: text.length * fontSize * 0.5 }
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

// Default — space-based fallback สำหรับ Latin และ testing
export const defaultWordBreaker: WordBreaker = {
  segment(text: string): string[] {
    return text.split(" ")
  },
}
