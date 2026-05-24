import type { WordBreaker } from "./types"
import { segmentTextWithIntlWordBreaker } from "./word-segments"

/**
 * Concrete WordBreaker implementations
 *
 * - intlWordBreaker: ใช้ Intl.Segmenter เป็นตัวหลักสำหรับช่วง prototype
 * - thaiWordBreaker: alias เดิมสำหรับ server call sites
 */

// ─── Thai Word Breaker ────────────────────────────────────────────────────────

function segmentWithIntl(text: string): string[] {
  return segmentTextWithIntlWordBreaker(text)
}

export const intlWordBreaker: WordBreaker = {
  segment: segmentWithIntl,
}

export const thaiWordBreaker = intlWordBreaker
