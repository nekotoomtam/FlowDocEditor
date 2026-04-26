import type { WordBreaker } from "./types"

/**
 * Concrete WordBreaker implementations
 *
 * - thaiWordBreaker: ใช้ wordcut (dictionary) สำหรับ Thai, space-based สำหรับ Latin
 *   → Node.js only (dictionary bundle ใหญ่เกินสำหรับ browser)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isThaiChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code >= 0x0e00 && code <= 0x0e7f
}

// lazy init เพื่อไม่ให้ load dictionary ซ้ำ
let _wordcut: { init(): void; cut(text: string): string } | null = null

function getWordcut() {
  if (_wordcut == null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _wordcut = require("wordcut") as typeof _wordcut
    _wordcut!.init()
  }
  return _wordcut!
}

function segmentThai(text: string): string[] {
  return getWordcut()
    .cut(text)
    .split("|")
    .filter((w: string) => w.length > 0)
}

// ─── Thai Word Breaker ────────────────────────────────────────────────────────

function segmentMixed(text: string): string[] {
  if (text.length === 0) return []

  const segments: string[] = []
  let chunk = ""
  let chunkIsThai = isThaiChar(text[0])

  for (const char of text) {
    const charIsThai = isThaiChar(char)

    if (charIsThai !== chunkIsThai && chunk.length > 0) {
      segments.push(...(chunkIsThai ? segmentThai(chunk) : chunk.split(" ").filter((w) => w.length > 0)))
      chunk = ""
      chunkIsThai = charIsThai
    }

    chunk += char
  }

  if (chunk.length > 0) {
    segments.push(...(chunkIsThai ? segmentThai(chunk) : chunk.split(" ").filter((w) => w.length > 0)))
  }

  return segments
}

export const thaiWordBreaker: WordBreaker = {
  segment: segmentMixed,
}
