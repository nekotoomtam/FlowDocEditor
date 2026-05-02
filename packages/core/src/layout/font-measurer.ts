import fontkit from "@pdf-lib/fontkit"
import type { TextMeasurer } from "./types"

// Node.js only — ไม่ export จาก layout/index.ts
// ใช้ใน /api/paginate และ /api/export เพื่อ accurate font metrics

export function createFontkitMeasurer(fontBuffer: Uint8Array | null): TextMeasurer {
  if (!fontBuffer) {
    return {
      measureText: (text, _key, fontSize) => ({ width: text.length * fontSize * 0.5 }),
      measureLineHeight: (_key, fontSize, ratio) => fontSize * ratio,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const font = (fontkit as any).create(Buffer.from(fontBuffer))

  return {
    measureText(text, _fontFamilyKey, fontSize) {
      if (!text) return { width: 0 }
      try {
        const run = font.layout(text)
        return { width: (run.advanceWidth / font.unitsPerEm) * fontSize }
      } catch {
        return { width: text.length * fontSize * 0.5 }
      }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}
