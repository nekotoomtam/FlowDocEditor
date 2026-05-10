import type { PageFragment, PaginatedDocument } from "@/pagination"

type FragmentWithRange = {
  fragment: PageFragment
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

function paragraphFragmentsWithRanges(
  paginated: PaginatedDocument,
  nodeId: string,
): FragmentWithRange[] {
  const fragments: FragmentWithRange[] = []

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.fragments) {
        if (fragment.nodeId !== nodeId || fragment.nodeType !== "paragraph") continue
        const range = fragmentTextRange(fragment)
        if (!range) continue
        fragments.push({ fragment, ...range })
      }
    }
  }

  return fragments.sort((a, b) => {
    const byStart = a.start - b.start
    if (byStart !== 0) return byStart
    return (a.fragment.fragmentIndex ?? a.fragment.pageIndex) -
      (b.fragment.fragmentIndex ?? b.fragment.pageIndex)
  })
}

export function findInlineEditPageIndexForCaret(
  paginated: PaginatedDocument,
  nodeId: string,
  caretIndex: number | null,
): number | null {
  if (caretIndex === null) return null

  const fragments = paragraphFragmentsWithRanges(paginated, nodeId)
  if (fragments.length === 0) return null

  let candidate = fragments[0]
  for (const fragment of fragments) {
    if (caretIndex < fragment.start) break
    candidate = fragment
    if (caretIndex < fragment.end) break
  }

  return candidate.fragment.pageIndex
}
