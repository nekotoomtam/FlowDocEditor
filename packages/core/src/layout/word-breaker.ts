import type { WordBreaker } from "./types"

/**
 * Concrete WordBreaker implementations
 *
 * - intlWordBreaker: ใช้ Intl.Segmenter เป็นตัวหลักสำหรับช่วง prototype
 * - thaiWordBreaker: alias เดิมสำหรับ server call sites
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fallbackSegment(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? []
}

// ─── Thai Word Breaker ────────────────────────────────────────────────────────

function segmentWithIntl(text: string): string[] {
  const Segmenter = Intl.Segmenter
  if (!Segmenter) return fallbackSegment(text)

  const segmenter = new Segmenter(["th", "en"], { granularity: "word" })
  return Array.from(segmenter.segment(text))
    .map((part) => part.segment)
    .filter((segment) => segment.length > 0)
}

export const intlWordBreaker: WordBreaker = {
  segment: segmentWithIntl,
}

export const thaiWordBreaker = intlWordBreaker
