import type { PaginatedDocument } from "../pagination"

/**
 * Renderer interface — รับ PaginatedDocument แล้ว output format ที่ต้องการ
 *
 * กฎหลัก:
 * - ไม่รู้จัก document schema โดยตรง — รับ PaginatedDocument เท่านั้น
 * - แต่ละ renderer แปลง abstract units เป็นหน่วยของตัวเอง
 *   เช่น DOCX ใช้ EMU, PDF ใช้ pt
 * - pure function เสมอ — same input → same output
 */

export interface RenderResult {
  buffer: Uint8Array
  mimeType: string
  extension: string
}

export interface Renderer {
  render(doc: PaginatedDocument): Promise<RenderResult>
}

// ─── Font Provider ────────────────────────────────────────────────────────────

// รับ fontFamilyKey แล้วคืน TTF buffer
// คืน null → renderer ใช้ standard font fallback (Latin only)
export interface FontProvider {
  getFont(fontFamilyKey: string): Promise<Uint8Array | null>
}

// ─── Unit Conversion ──────────────────────────────────────────────────────────

// abstract unit (pt) → EMU (English Metric Units) สำหรับ DOCX
// 1 pt = 12700 EMU
export function ptToEmu(pt: number): number {
  return Math.round(pt * 12700)
}

// abstract unit (pt) → twips สำหรับ DOCX margins
// 1 pt = 20 twips
export function ptToTwips(pt: number): number {
  return Math.round(pt * 20)
}

// abstract unit (pt) → half-points สำหรับ font size ใน DOCX
// 1 pt = 2 half-points
export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2)
}

// abstract unit (pt) → px สำหรับ screen rendering
// 1 pt = 1.333 px (96dpi)
export function ptToPx(pt: number): number {
  return pt * (96 / 72)
}
