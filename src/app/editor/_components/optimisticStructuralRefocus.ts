import { getTextRunParagraphText, isTextRunOnlyParagraph } from "@/document"
import type { TextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment, PaginatedLine } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { buildWysiwygDraftParagraphLayout } from "./wysiwygDraftParagraphLayout"

type FragmentLane = "fragments" | "headerFragments" | "footerFragments"

const FRAGMENT_LANES: FragmentLane[] = ["fragments", "headerFragments", "footerFragments"]
const HEIGHT_EPSILON = 0.5
const SAME_PAGE_SAFE_MARGIN_PT = 12

export type OptimisticSplitRefocusMode = "same-page" | "boundary-safe"

export interface OptimisticSplitRefocusResult {
  paginated: PaginatedDocument
  sourceFragment: PageFragment
  newFragment: PageFragment
  overflowedPage: boolean
  mode: OptimisticSplitRefocusMode
}

export interface OptimisticMergeRefocusResult {
  paginated: PaginatedDocument
  mergedFragment: PageFragment
  overflowedPage: boolean
  mode: OptimisticSplitRefocusMode
}

function findParagraph(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
  }
  return null
}

function lineWithNodeId(line: PaginatedLine, nodeId: string): PaginatedLine {
  return {
    ...line,
    segments: line.segments?.map((segment) => ({ ...segment, nodeId })),
    runs: line.runs?.map((run) => ({ ...run, nodeId })),
  }
}

function linesWithNodeId(lines: PaginatedLine[], nodeId: string): PaginatedLine[] {
  return lines.map((line) => lineWithNodeId(line, nodeId))
}

function shiftFragmentY(fragment: PageFragment, deltaY: number): PageFragment {
  if (Math.abs(deltaY) < HEIGHT_EPSILON) return fragment
  return {
    ...fragment,
    y: fragment.y + deltaY,
    lines: fragment.lines?.map((line) => ({ ...line, y: line.y + deltaY })),
  }
}

function withOptimisticRenderSpacing(
  fragment: PageFragment,
  spacing: { spacingBefore?: number; spacingAfter?: number },
): PageFragment {
  if (!fragment.renderProps) return fragment
  return {
    ...fragment,
    renderProps: {
      ...fragment.renderProps,
      ...(spacing.spacingBefore == null ? {} : { spacingBefore: spacing.spacingBefore }),
      ...(spacing.spacingAfter == null ? {} : { spacingAfter: spacing.spacingAfter }),
    },
  }
}

function sameFragment(a: PageFragment, b: PageFragment): boolean {
  return a.nodeId === b.nodeId &&
    a.nodeType === b.nodeType &&
    a.pageIndex === b.pageIndex &&
    (a.fragmentIndex ?? null) === (b.fragmentIndex ?? null) &&
    a.y === b.y
}

function findPageContentBottom(paginated: PaginatedDocument, pageIndex: number): number | null {
  for (const section of paginated.sections) {
    const page = section.pages.find((candidate) => candidate.index === pageIndex)
    if (!page) continue
    return page.contentBox.y + page.contentBox.height
  }
  return null
}

function findPageFragments(paginated: PaginatedDocument, pageIndex: number): PageFragment[] {
  for (const section of paginated.sections) {
    const page = section.pages.find((candidate) => candidate.index === pageIndex)
    if (!page) continue
    return FRAGMENT_LANES.flatMap((lane) => page[lane])
  }
  return []
}

function hasNearbyPageBreakAfterSource(input: {
  paginated: PaginatedDocument
  sourceFragment: PageFragment
  optimisticBottom: number
}): boolean {
  const sourceBottom = input.sourceFragment.y + input.sourceFragment.height
  return findPageFragments(input.paginated, input.sourceFragment.pageIndex).some((fragment) => (
    fragment.nodeType === "page-break" &&
    fragment.y >= sourceBottom - HEIGHT_EPSILON &&
    fragment.y <= input.optimisticBottom + SAME_PAGE_SAFE_MARGIN_PT
  ))
}

function findFragmentLane(paginated: PaginatedDocument, sourceFragment: PageFragment): FragmentLane | null {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      if (page.index !== sourceFragment.pageIndex) continue
      for (const lane of FRAGMENT_LANES) {
        if (page[lane].some((fragment) => sameFragment(fragment, sourceFragment))) return lane
      }
    }
  }
  return null
}

function findTerminalFragmentForNodeInLane(
  paginated: PaginatedDocument,
  sourceFragment: PageFragment,
  lane: FragmentLane,
): PageFragment | null {
  const candidates: PageFragment[] = []
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page[lane]) {
        if (fragment.nodeId === sourceFragment.nodeId && fragment.nodeType === sourceFragment.nodeType) {
          candidates.push(fragment)
        }
      }
    }
  }
  candidates.sort((a, b) => (
    a.pageIndex - b.pageIndex ||
    ((a.fragmentIndex ?? a.lineStart ?? 0) - (b.fragmentIndex ?? b.lineStart ?? 0)) ||
    a.y - b.y
  ))
  return candidates.at(-1) ?? null
}

export function createOptimisticSplitRefocusPaginated(input: {
  doc: DocumentNode
  paginated: PaginatedDocument
  sourceNodeId: string
  newNodeId: string
  sourceFragment: PageFragment
  textMeasurer: TextMeasurer
}): OptimisticSplitRefocusResult | null {
  const sourceFragment = input.sourceFragment
  if (
    sourceFragment.nodeType !== "paragraph" ||
    sourceFragment.continuesFrom ||
    sourceFragment.listMarker
  ) return null
  const firstContinuedSource = sourceFragment.isContinued === true

  const sourceParagraph = findParagraph(input.doc, input.sourceNodeId)
  const newParagraph = findParagraph(input.doc, input.newNodeId)
  if (!sourceParagraph || !newParagraph) return null
  if (!isTextRunOnlyParagraph(sourceParagraph) || !isTextRunOnlyParagraph(newParagraph)) return null

  const sourceText = getTextRunParagraphText(sourceParagraph) ?? ""
  const newText = getTextRunParagraphText(newParagraph) ?? ""
  const lane = findFragmentLane(input.paginated, sourceFragment)
  if (!lane) return null

  if (firstContinuedSource) {
    if (newText.length > 0) return null
    const terminalFragment = findTerminalFragmentForNodeInLane(input.paginated, sourceFragment, lane)
    if (
      !terminalFragment ||
      sameFragment(terminalFragment, sourceFragment) ||
      terminalFragment.continuesFrom !== true ||
      terminalFragment.isContinued === true
    ) return null
    const newMeasureTemplateFragment = withOptimisticRenderSpacing(terminalFragment, { spacingBefore: 0 })
    const newBaseFragment: PageFragment = {
      ...newMeasureTemplateFragment,
      nodeId: input.newNodeId,
      y: terminalFragment.y + terminalFragment.height,
      height: Math.max(1, terminalFragment.height),
      lines: [],
      fragmentIndex: (terminalFragment.fragmentIndex ?? 0) + 1,
      lineStart: 0,
      lineEnd: 0,
      continuesFrom: false,
      isContinued: false,
    }
    const newLayout = buildWysiwygDraftParagraphLayout(newBaseFragment, newParagraph, newText, input.textMeasurer)
    if (!newLayout) return null
    const newFragment: PageFragment = {
      ...newBaseFragment,
      height: Math.max(1, newLayout.height),
      lines: linesWithNodeId(newLayout.lines, input.newNodeId),
      lineStart: 0,
      lineEnd: newLayout.lines.length,
    }
    const pageContentBottom = findPageContentBottom(input.paginated, terminalFragment.pageIndex)
    const optimisticBottom = newFragment.y + newFragment.height
    return {
      paginated: input.paginated,
      sourceFragment,
      newFragment,
      overflowedPage: pageContentBottom != null && optimisticBottom > pageContentBottom + HEIGHT_EPSILON,
      mode: "boundary-safe",
    }
  }

  const sourceMeasureFragment = withOptimisticRenderSpacing(sourceFragment, { spacingAfter: 0 })
  const newMeasureTemplateFragment = withOptimisticRenderSpacing(sourceFragment, { spacingBefore: 0 })
  const sourceLayout = buildWysiwygDraftParagraphLayout(sourceMeasureFragment, sourceParagraph, sourceText, input.textMeasurer)
  if (!sourceLayout) return null

  const sourceHeight = Math.max(1, sourceLayout.height)
  const newBaseFragment: PageFragment = {
    ...newMeasureTemplateFragment,
    nodeId: input.newNodeId,
    y: sourceFragment.y + sourceHeight,
    height: Math.max(1, sourceFragment.height - sourceHeight),
    lines: [],
    fragmentIndex: (sourceFragment.fragmentIndex ?? 0) + 1,
    lineStart: 0,
    lineEnd: 0,
    continuesFrom: false,
    isContinued: false,
  }
  const newLayout = buildWysiwygDraftParagraphLayout(newBaseFragment, newParagraph, newText, input.textMeasurer)
  if (!newLayout) return null

  const patchedSourceFragment: PageFragment = {
    ...sourceMeasureFragment,
    height: sourceHeight,
    lines: linesWithNodeId(sourceLayout.lines, input.sourceNodeId),
    lineStart: 0,
    lineEnd: sourceLayout.lines.length,
    continuesFrom: false,
    isContinued: false,
  }
  const newFragment: PageFragment = {
    ...newBaseFragment,
    height: Math.max(1, newLayout.height),
    lines: linesWithNodeId(newLayout.lines, input.newNodeId),
    lineStart: 0,
    lineEnd: newLayout.lines.length,
  }

  const sourceBottom = sourceFragment.y + sourceFragment.height
  const optimisticBottom = newFragment.y + newFragment.height
  const deltaY = optimisticBottom - sourceBottom
  const pageContentBottom = findPageContentBottom(input.paginated, sourceFragment.pageIndex)
  const overflowedPage = pageContentBottom != null && optimisticBottom > pageContentBottom + HEIGHT_EPSILON
  const pageBreakBlocksSamePage = hasNearbyPageBreakAfterSource({
    paginated: input.paginated,
    sourceFragment,
    optimisticBottom,
  })
  const safeSamePage = !pageBreakBlocksSamePage && (
    pageContentBottom == null ||
    optimisticBottom <= pageContentBottom - SAME_PAGE_SAFE_MARGIN_PT
  )
  const mode: OptimisticSplitRefocusMode = safeSamePage ? "same-page" : "boundary-safe"
  let patched = false

  const paginated: PaginatedDocument = {
    ...input.paginated,
    sections: input.paginated.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => {
        if (page.index !== sourceFragment.pageIndex) return page
        const sourceFragments = page[lane]
        const nextFragments = sourceFragments.flatMap((fragment) => {
          if (sameFragment(fragment, sourceFragment)) {
            patched = true
            return mode === "same-page"
              ? [patchedSourceFragment, newFragment]
              : [patchedSourceFragment]
          }
          if (mode === "boundary-safe") return [fragment]
          if (fragment.y >= sourceBottom - HEIGHT_EPSILON) return [shiftFragmentY(fragment, deltaY)]
          return [fragment]
        })
        return {
          ...page,
          [lane]: nextFragments,
        }
      }),
    })),
  }

  return patched ? {
    paginated,
    sourceFragment: patchedSourceFragment,
    newFragment,
    overflowedPage,
    mode,
  } : null
}

export function createOptimisticMergeRefocusPaginated(input: {
  doc: DocumentNode
  paginated: PaginatedDocument
  previousNodeId: string
  currentNodeId: string
  previousFragment: PageFragment
  currentFragment: PageFragment
  textMeasurer: TextMeasurer
}): OptimisticMergeRefocusResult | null {
  const previousFragment = input.previousFragment
  const currentFragment = input.currentFragment
  if (
    previousFragment.nodeType !== "paragraph" ||
    currentFragment.nodeType !== "paragraph" ||
    previousFragment.pageIndex !== currentFragment.pageIndex ||
    previousFragment.continuesFrom ||
    previousFragment.isContinued ||
    previousFragment.listMarker ||
    currentFragment.continuesFrom ||
    currentFragment.isContinued ||
    currentFragment.listMarker
  ) return null

  const previousParagraph = findParagraph(input.doc, input.previousNodeId)
  if (!previousParagraph || !isTextRunOnlyParagraph(previousParagraph)) return null

  const mergedText = getTextRunParagraphText(previousParagraph) ?? ""
  const mergedLayout = buildWysiwygDraftParagraphLayout(previousFragment, previousParagraph, mergedText, input.textMeasurer)
  if (!mergedLayout) return null

  const lane = findFragmentLane(input.paginated, previousFragment)
  const currentLane = findFragmentLane(input.paginated, currentFragment)
  if (!lane || (currentLane && lane !== currentLane)) return null
  const currentFragmentInPaginated = currentLane !== null

  const oldBottom = Math.max(
    previousFragment.y + previousFragment.height,
    currentFragment.y + currentFragment.height,
  )
  const mergedFragment: PageFragment = {
    ...previousFragment,
    height: Math.max(1, mergedLayout.height),
    lines: linesWithNodeId(mergedLayout.lines, input.previousNodeId),
    lineStart: 0,
    lineEnd: mergedLayout.lines.length,
    continuesFrom: false,
    isContinued: false,
  }
  const mergedBottom = mergedFragment.y + mergedFragment.height
  const deltaY = mergedBottom - oldBottom
  const pageContentBottom = findPageContentBottom(input.paginated, previousFragment.pageIndex)
  const overflowedPage = pageContentBottom != null && mergedBottom > pageContentBottom + HEIGHT_EPSILON
  const safeSamePage = pageContentBottom == null ||
    mergedBottom <= pageContentBottom - SAME_PAGE_SAFE_MARGIN_PT
  if (!safeSamePage) return null
  const mode: OptimisticSplitRefocusMode = "same-page"
  let patchedPrevious = false
  let removedCurrent = false

  const paginated: PaginatedDocument = {
    ...input.paginated,
    sections: input.paginated.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => {
        if (page.index !== previousFragment.pageIndex) return page
        const sourceFragments = page[lane]
        const nextFragments = sourceFragments.flatMap((fragment) => {
          if (sameFragment(fragment, previousFragment)) {
            patchedPrevious = true
            return [mergedFragment]
          }
          if (currentFragmentInPaginated && sameFragment(fragment, currentFragment)) {
            removedCurrent = true
            return []
          }
          if (fragment.y >= oldBottom - HEIGHT_EPSILON) return [shiftFragmentY(fragment, deltaY)]
          return [fragment]
        })
        return {
          ...page,
          [lane]: nextFragments,
        }
      }),
    })),
  }

  return patchedPrevious && (removedCurrent || !currentFragmentInPaginated) ? {
    paginated,
    mergedFragment,
    overflowedPage,
    mode,
  } : null
}
