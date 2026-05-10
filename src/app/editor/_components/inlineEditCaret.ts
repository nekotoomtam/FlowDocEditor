import type { PageFragment, PaginatedDocument } from "@/pagination"

export type InlineEditFragmentRange = {
  pageIndex: number
  fragmentIndex?: number
  start: number
  end: number
}

function fragmentTextRange(fragment: PageFragment): { start: number; end: number } | null {
  let start: number | null = null
  let end: number | null = null

  for (const line of fragment.lines ?? []) {
    for (const segment of line.segments ?? []) {
      start = start === null ? segment.start : Math.min(start, segment.start)
      end = end === null ? segment.end : Math.max(end, segment.end)
    }
  }

  if (start === null || end === null) return null
  return { start, end }
}

export function getInlineEditFragmentRanges(
  paginated: PaginatedDocument,
  nodeId: string,
): InlineEditFragmentRange[] {
  const ranges: InlineEditFragmentRange[] = []

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.fragments) {
        if (fragment.nodeId !== nodeId || fragment.nodeType !== "paragraph") continue
        const range = fragmentTextRange(fragment)
        if (!range) continue
        ranges.push({
          pageIndex: fragment.pageIndex,
          fragmentIndex: fragment.fragmentIndex,
          ...range,
        })
      }
    }
  }

  return ranges.sort((a, b) => {
    const byStart = a.start - b.start
    if (byStart !== 0) return byStart
    return (a.fragmentIndex ?? a.pageIndex) - (b.fragmentIndex ?? b.pageIndex)
  })
}

export function findInlineEditPageIndexInRanges(
  ranges: InlineEditFragmentRange[],
  caretIndex: number | null,
): number | null {
  if (caretIndex === null) return null

  if (ranges.length === 0) return null

  let candidate = ranges[0]
  for (const range of ranges) {
    if (caretIndex < range.start) break
    candidate = range
    if (caretIndex < range.end) break
  }

  return candidate.pageIndex
}

export function findInlineEditPageIndexForCaret(
  paginated: PaginatedDocument,
  nodeId: string,
  caretIndex: number | null,
): number | null {
  return findInlineEditPageIndexInRanges(
    getInlineEditFragmentRanges(paginated, nodeId),
    caretIndex,
  )
}
