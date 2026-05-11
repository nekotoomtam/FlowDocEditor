import type { LineSegment, TextMeasurer } from "@/layout"
import { snapToGraphemeBoundary } from "@/layout"
import type { PageFragment, PaginatedDocument, PaginatedLine } from "@/pagination"

export type WysiwygCaretMappingSource = "segment-candidate" | "segment-ratio"

export interface WysiwygPagePoint {
  x: number
  y: number
}

export interface WysiwygCaretCandidate {
  offset: number
  pageIndex: number
  fragmentIndex?: number
  lineIndex: number
  x: number
  y: number
  height: number
  source: WysiwygCaretMappingSource
}

export interface WysiwygCaretMappingOptions {
  textMeasurer?: TextMeasurer
}

export interface WysiwygCollapsedCaretOverlay {
  offset: number
  pageIndex: number
  fragmentIndex?: number
  x1: number
  y1: number
  x2: number
  y2: number
}

type LineRange = {
  line: PaginatedLine
  lineIndex: number
  start: number
  end: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function graphemeBoundaries(text: string): number[] {
  const Segmenter = Intl.Segmenter
  if (!Segmenter) {
    const boundaries = [0]
    let cursor = 0
    for (const char of Array.from(text)) {
      cursor += char.length
      boundaries.push(cursor)
    }
    return boundaries
  }

  const segmenter = new Segmenter(["th", "en"], { granularity: "grapheme" })
  const boundaries = [0]
  let cursor = 0
  for (const { segment } of segmenter.segment(text)) {
    cursor += segment.length
    boundaries.push(cursor)
  }
  return boundaries
}

function segmentPrefixWidth(
  segment: LineSegment,
  localOffset: number,
  line: PaginatedLine,
  fragment: PageFragment,
  options: WysiwygCaretMappingOptions,
): number {
  const safeOffset = clamp(localOffset, 0, segment.text.length)
  const fallbackWidth = segment.text.length > 0
    ? segment.width * (safeOffset / segment.text.length)
    : 0

  const fontFamilyKey = fragment.renderProps?.fontFamilyKey
  const fontSize = line.fontSize ?? fragment.renderProps?.fontSize
  if (!options.textMeasurer || !fontFamilyKey || !fontSize) return fallbackWidth

  const measured = options.textMeasurer.measureText(
    segment.text.slice(0, safeOffset),
    fontFamilyKey,
    fontSize,
  ).width
  return clamp(measured, 0, segment.width)
}

function candidateFromSegment(
  fragment: PageFragment,
  line: PaginatedLine,
  lineIndex: number,
  segment: LineSegment,
  localOffset: number,
  options: WysiwygCaretMappingOptions,
): WysiwygCaretCandidate {
  const safeOffset = snapToGraphemeBoundary(segment.text, localOffset)
  return {
    offset: segment.start + safeOffset,
    pageIndex: fragment.pageIndex,
    fragmentIndex: fragment.fragmentIndex,
    lineIndex,
    x: line.x + segment.x + segmentPrefixWidth(segment, safeOffset, line, fragment, options),
    y: line.y,
    height: line.height,
    source: "segment-candidate",
  }
}

function getLineRange(line: PaginatedLine, lineIndex: number): LineRange | null {
  const segments = line.segments ?? []
  if (segments.length === 0) return null

  let start = segments[0].start
  let end = segments[0].end
  for (const segment of segments.slice(1)) {
    start = Math.min(start, segment.start)
    end = Math.max(end, segment.end)
  }
  return { line, lineIndex, start, end }
}

function getLineRanges(fragment: PageFragment): LineRange[] {
  return (fragment.lines ?? [])
    .map((line, lineIndex) => getLineRange(line, lineIndex))
    .filter((range): range is LineRange => range !== null)
}

function findLineRangeForOffset(fragment: PageFragment, offset: number): LineRange | null {
  const ranges = getLineRanges(fragment)
  if (ranges.length === 0) return null
  if (offset <= ranges[0].start) return ranges[0]

  for (const range of ranges) {
    if (offset >= range.start && offset < range.end) return range
  }

  const exactStart = ranges.find((range) => offset === range.start)
  if (exactStart) return exactStart

  return ranges[ranges.length - 1]
}

function nearestCandidate(
  candidates: WysiwygCaretCandidate[],
  offset: number,
): WysiwygCaretCandidate | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, candidate) => {
    const bestDistance = Math.abs(best.offset - offset)
    const distance = Math.abs(candidate.offset - offset)
    if (distance < bestDistance) return candidate
    if (distance === bestDistance && candidate.offset < best.offset) return candidate
    return best
  }, candidates[0])
}

function paragraphFragments(paginated: PaginatedDocument, nodeId: string): PageFragment[] {
  const fragments: PageFragment[] = []
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.fragments) {
        if (fragment.nodeId === nodeId && fragment.nodeType === "paragraph") {
          fragments.push(fragment)
        }
      }
    }
  }

  return fragments.sort((a, b) => {
    const byFragment = (a.fragmentIndex ?? a.pageIndex) - (b.fragmentIndex ?? b.pageIndex)
    if (byFragment !== 0) return byFragment
    return a.pageIndex - b.pageIndex
  })
}

function fragmentRange(fragment: PageFragment): { start: number; end: number } | null {
  const ranges = getLineRanges(fragment)
  if (ranges.length === 0) return null
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  }
}

export function getWysiwygCaretCandidatesForLine(
  fragment: PageFragment,
  line: PaginatedLine,
  lineIndex: number,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCaretCandidate[] {
  const candidates: WysiwygCaretCandidate[] = []
  const seen = new Set<number>()

  for (const segment of line.segments ?? []) {
    for (const boundary of graphemeBoundaries(segment.text)) {
      const candidate = candidateFromSegment(fragment, line, lineIndex, segment, boundary, options)
      if (seen.has(candidate.offset)) continue
      seen.add(candidate.offset)
      candidates.push(candidate)
    }
  }

  return candidates.sort((a, b) => a.offset - b.offset || a.x - b.x)
}

export function resolveCaretPositionInFragment(
  fragment: PageFragment,
  offset: number,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCaretCandidate | null {
  const range = findLineRangeForOffset(fragment, offset)
  if (!range) return null

  return nearestCandidate(
    getWysiwygCaretCandidatesForLine(fragment, range.line, range.lineIndex, options),
    offset,
  )
}

export function resolveCaretOffsetFromPointInFragment(
  fragment: PageFragment,
  point: WysiwygPagePoint,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCaretCandidate | null {
  const lines = fragment.lines ?? []
  if (lines.length === 0) return null

  const directLineIndex = lines.findIndex((line) => point.y >= line.y && point.y <= line.y + line.height)
  const lineIndex = directLineIndex >= 0
    ? directLineIndex
    : lines.reduce((nearest, line, index) => {
      const distance = Math.abs(point.y - (line.y + line.height / 2))
      const nearestLine = lines[nearest]
      const nearestDistance = Math.abs(point.y - (nearestLine.y + nearestLine.height / 2))
      return distance < nearestDistance ? index : nearest
    }, 0)

  const line = lines[lineIndex]
  const segments = line.segments ?? []
  if (segments.length === 0) return null
  if (point.x <= line.x) {
    return candidateFromSegment(fragment, line, lineIndex, segments[0], 0, options)
  }

  for (const segment of segments) {
    const left = line.x + segment.x
    const right = left + segment.width
    if (point.x <= right) {
      const ratio = segment.width > 0 ? clamp((point.x - left) / segment.width, 0, 1) : 0
      const localOffset = Math.round(ratio * segment.text.length)
      return candidateFromSegment(fragment, line, lineIndex, segment, localOffset, options)
    }
  }

  const last = segments[segments.length - 1]
  return candidateFromSegment(fragment, line, lineIndex, last, last.text.length, options)
}

export function resolveParagraphCaretPosition(
  paginated: PaginatedDocument,
  nodeId: string,
  offset: number,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCaretCandidate | null {
  const fragments = paragraphFragments(paginated, nodeId)
  if (fragments.length === 0) return null

  let fallback: PageFragment | null = fragments[0]
  for (const fragment of fragments) {
    const range = fragmentRange(fragment)
    if (!range) continue
    if (offset < range.start) break
    fallback = fragment
    if (offset >= range.start && offset < range.end) {
      return resolveCaretPositionInFragment(fragment, offset, options)
    }
  }

  return fallback ? resolveCaretPositionInFragment(fallback, offset, options) : null
}

export function collapsedCaretOverlayFromCandidate(
  candidate: WysiwygCaretCandidate,
): WysiwygCollapsedCaretOverlay {
  return {
    offset: candidate.offset,
    pageIndex: candidate.pageIndex,
    fragmentIndex: candidate.fragmentIndex,
    x1: candidate.x,
    y1: candidate.y,
    x2: candidate.x,
    y2: candidate.y + candidate.height,
  }
}

export function resolveCollapsedCaretOverlayInFragment(
  fragment: PageFragment,
  offset: number,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCollapsedCaretOverlay | null {
  const candidate = resolveCaretPositionInFragment(fragment, offset, options)
  return candidate ? collapsedCaretOverlayFromCandidate(candidate) : null
}

export function resolveParagraphCollapsedCaretOverlay(
  paginated: PaginatedDocument,
  nodeId: string,
  offset: number,
  options: WysiwygCaretMappingOptions = {},
): WysiwygCollapsedCaretOverlay | null {
  const candidate = resolveParagraphCaretPosition(paginated, nodeId, offset, options)
  return candidate ? collapsedCaretOverlayFromCandidate(candidate) : null
}
