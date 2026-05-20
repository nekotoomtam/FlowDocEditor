import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedLine, PaginatedPage } from "@/pagination"
import { getWysiwygFragmentTextRange, resolveCaretPositionInFragment } from "./wysiwygCaretMapping"

const HEIGHT_EPSILON = 0.5

export interface WysiwygDraftVisualPreview {
  nodeId: string
  fragments: PageFragment[]
  fragmentsByPageIndex: Map<number, PageFragment>
  caretPageIndex: number | null
}

function pageContentBottom(page: PaginatedPage): number {
  return page.contentBox.y + page.contentBox.height
}

function lineWithY(line: PaginatedLine, y: number): PaginatedLine {
  return { ...line, y }
}

function shiftLineY(line: PaginatedLine, deltaY: number): PaginatedLine {
  return { ...line, y: line.y + deltaY }
}

export function shiftPageFragmentY(fragment: PageFragment, deltaY: number): PageFragment {
  if (deltaY === 0) return fragment
  return {
    ...fragment,
    y: fragment.y + deltaY,
    lines: fragment.lines?.map((line) => shiftLineY(line, deltaY)),
  }
}

export function shiftWysiwygDraftPreviewDownstreamFragments(input: {
  fragments: PageFragment[]
  draftFragment: PageFragment
  extraShiftY?: number
}): PageFragment[] {
  const { fragments, draftFragment } = input
  if (!draftFragment.continuesFrom || draftFragment.height <= 0) return fragments
  const insertionY = draftFragment.y
  const shiftY = draftFragment.height + Math.max(0, input.extraShiftY ?? 0)
  return fragments.map((fragment) => {
    if (fragment.nodeId === draftFragment.nodeId) return fragment
    if (fragment.y < insertionY - HEIGHT_EPSILON) return fragment
    return shiftPageFragmentY(fragment, shiftY)
  })
}

function getFragmentTextRange(fragment: PageFragment): { start: number; end: number } | null {
  return getWysiwygFragmentTextRange(fragment)
}

function resolveDraftSpacingAfter(
  sourceFragment: PageFragment,
  draftLines: PaginatedLine[],
  draftHeight: number,
): number {
  const lastLine = draftLines[draftLines.length - 1]
  if (!lastLine) return 0
  return Math.max(0, draftHeight - (lastLine.y + lastLine.height - sourceFragment.y))
}

export function splitWysiwygDraftVisualFragments(input: {
  sourceFragment: PageFragment
  draftLines: PaginatedLine[]
  draftHeight: number
  pages: PaginatedPage[]
  preserveBoundarySingleLines?: boolean
}): PageFragment[] {
  const { sourceFragment, draftLines, draftHeight, pages } = input
  if (pages.length === 0) return []

  const sourcePageArrayIndex = Math.max(0, pages.findIndex((page) => page.index === sourceFragment.pageIndex))
  const sourceLineStart = sourceFragment.lineStart ?? 0
  const spacingAfter = resolveDraftSpacingAfter(sourceFragment, draftLines, draftHeight)
  const fragments: PageFragment[] = []

  if (draftLines.length === 0) {
    return [{
      ...sourceFragment,
      height: Math.max(1, draftHeight),
      lines: [],
      fragmentIndex: 0,
      lineStart: sourceLineStart,
      lineEnd: sourceLineStart,
      continuesFrom: false,
      isContinued: false,
    }]
  }

  let lineIndex = 0
  for (
    let pageArrayIndex = sourcePageArrayIndex;
    pageArrayIndex < pages.length && lineIndex < draftLines.length;
    pageArrayIndex += 1
  ) {
    const page = pages[pageArrayIndex]
    const isSourcePage = page.index === sourceFragment.pageIndex
    const top = isSourcePage ? sourceFragment.y : page.contentBox.y
    const bottom = pageContentBottom(page)
    const sliceStart = lineIndex
    const atContentTop = top <= page.contentBox.y + HEIGHT_EPSILON
    let count = 0
    let cursorY = top

    while (lineIndex + count < draftLines.length) {
      const sourceLine = draftLines[lineIndex + count]
      const y = isSourcePage ? sourceLine.y : cursorY
      const lineBottom = y + sourceLine.height
      const lineFits = lineBottom <= bottom + HEIGHT_EPSILON

      if (!lineFits && count > 0) break
      if (!lineFits && count === 0 && !atContentTop) break

      cursorY = y + sourceLine.height
      count += 1

      if (!lineFits) break
    }

    const remainingAfterCount = draftLines.length - (lineIndex + count)
    if (input.preserveBoundarySingleLines !== true) {
      if (count === 1 && remainingAfterCount > 0 && !atContentTop) continue
      if (remainingAfterCount === 1 && count >= 2 && !atContentTop) count -= 1
    }
    if (count === 0) continue

    const positionedLines: PaginatedLine[] = []
    cursorY = top
    for (let offset = 0; offset < count; offset += 1) {
      const sourceLine = draftLines[lineIndex + offset]
      const y = isSourcePage ? sourceLine.y : cursorY
      positionedLines.push(lineWithY(sourceLine, y))
      cursorY = y + sourceLine.height
    }
    lineIndex += count

    const isLastFragment = lineIndex >= draftLines.length
    const lastLine = positionedLines[positionedLines.length - 1]
    const fragmentHeight = isSourcePage && sliceStart === 0 && isLastFragment
      ? draftHeight
      : Math.max(1, lastLine.y + lastLine.height - top + (isLastFragment ? spacingAfter : 0))

    fragments.push({
      ...sourceFragment,
      pageIndex: page.index,
      y: top,
      height: fragmentHeight,
      lines: positionedLines,
      fragmentIndex: fragments.length,
      lineStart: sourceLineStart + sliceStart,
      lineEnd: sourceLineStart + lineIndex,
      continuesFrom: sliceStart > 0,
      isContinued: !isLastFragment,
    })
  }

  return fragments
}

export function resolveWysiwygDraftVisualCaretPageIndex(input: {
  fragments: PageFragment[]
  caretOffset: number | null
  textMeasurer?: TextMeasurer
  preferPreviousPageAtFragmentEnd?: boolean
}): number | null {
  if (input.caretOffset == null) return null
  for (const fragment of input.fragments) {
    const range = getFragmentTextRange(fragment)
    if (!range) continue
    if (
      input.preferPreviousPageAtFragmentEnd === true &&
      input.caretOffset === range.end &&
      fragment.isContinued
    ) {
      return fragment.pageIndex
    }
    if (input.caretOffset >= range.start && input.caretOffset <= range.end) {
      return fragment.pageIndex
    }
  }
  for (const fragment of input.fragments) {
    const caret = resolveCaretPositionInFragment(fragment, input.caretOffset, {
      textMeasurer: input.textMeasurer,
    })
    if (caret) return fragment.pageIndex
  }
  return null
}

export function createWysiwygDraftVisualPreview(input: {
  nodeId: string
  fragments: PageFragment[]
  caretOffset: number | null
  textMeasurer?: TextMeasurer
  preferPreviousPageAtFragmentEnd?: boolean
}): WysiwygDraftVisualPreview | null {
  if (input.fragments.length === 0) return null
  const fragmentsByPageIndex = new Map<number, PageFragment>()
  for (const fragment of input.fragments) {
    fragmentsByPageIndex.set(fragment.pageIndex, fragment)
  }
  return {
    nodeId: input.nodeId,
    fragments: input.fragments,
    fragmentsByPageIndex,
    caretPageIndex: resolveWysiwygDraftVisualCaretPageIndex({
      fragments: input.fragments,
      caretOffset: input.caretOffset,
      textMeasurer: input.textMeasurer,
      preferPreviousPageAtFragmentEnd: input.preferPreviousPageAtFragmentEnd,
    }),
  }
}
