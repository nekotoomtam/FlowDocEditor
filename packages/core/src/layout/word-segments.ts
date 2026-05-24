const THAI_COMBINING_MARK_START = /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/
const THAI_TEXT_END = /[\u0E01-\u0E2E\u0E30-\u0E3A\u0E40-\u0E4E]$/u
const THAI_TEXT_ONLY = /^[\u0E01-\u0E3A\u0E40-\u0E4E]+$/u
const THAI_PREPOSED_VOWEL_START = /^[\u0E40-\u0E44]/u
const THAI_THANTHAKHAT = "\u0E4C"
const KNOWN_THAI_COMPOUND_SEGMENTS: Record<string, string[]> = {
  "\u0E15\u0E30\u0E27\u0E31\u0E19\u0E2D\u0E2D\u0E01\u0E01\u0E25\u0E32\u0E07": [
    "\u0E15\u0E30\u0E27\u0E31\u0E19",
    "\u0E2D\u0E2D\u0E01",
    "\u0E01\u0E25\u0E32\u0E07",
  ],
}

function fallbackSegment(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? []
}

function canMergeThaiSegmentWithPrevious(previous: string | undefined, segment: string): boolean {
  if (!previous || /^\s+$/u.test(previous) || /^\s+$/u.test(segment)) return false
  if (!THAI_TEXT_END.test(previous)) return false
  if (THAI_COMBINING_MARK_START.test(segment)) return true
  return (
    segment.length <= 4 &&
    segment.includes(THAI_THANTHAKHAT) &&
    THAI_TEXT_ONLY.test(segment) &&
    !THAI_PREPOSED_VOWEL_START.test(segment)
  )
}

export function repairThaiSegmentBoundaries(segments: string[]): string[] {
  const repaired: string[] = []
  for (const segment of segments) {
    if (segment.length === 0) continue
    const previous = repaired.at(-1)
    if (canMergeThaiSegmentWithPrevious(previous, segment)) {
      repaired[repaired.length - 1] = `${previous}${segment}`
    } else {
      repaired.push(segment)
    }
  }
  return repaired
}

function splitKnownThaiCompoundSegment(segment: string): string[] {
  return KNOWN_THAI_COMPOUND_SEGMENTS[segment] ?? [segment]
}

export function segmentTextWithIntlWordBreaker(text: string): string[] {
  const Segmenter = Intl.Segmenter
  if (!Segmenter) return fallbackSegment(text)

  const segmenter = new Segmenter(["th", "en"], { granularity: "word" })
  return repairThaiSegmentBoundaries(
    Array.from(segmenter.segment(text))
      .flatMap((part) => splitKnownThaiCompoundSegment(part.segment))
      .filter((segment) => segment.length > 0),
  )
}
