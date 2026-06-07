import {
  defaultWordBreaker,
  measureDivider,
  measureParagraphWithCache,
  paragraphBoxLeftInset,
  paragraphBoxBottomInset,
  paragraphBoxTopInset,
  resolveParagraphBoxStyle,
} from "../../layout"
import type { FlowBox, MeasuredParagraphBox, ParagraphMeasurementCache, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection, ParagraphNode } from "../../schema"
import type {
  PageFlowCursor,
  DividerRenderProps,
  PageFragment,
  PageFragmentWarning,
  PaginatedPage,
  ParagraphBoxRenderProps,
} from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveToNextPage,
} from "./cursor"
import {
  buildParagraphBoxRenderProps,
  buildPositionedParagraphLines,
  buildRenderProps,
  paragraphEndInset,
  paragraphFragmentHeight,
  paragraphLineTopOffset,
  resolvePageNumbers,
} from "./paragraph"
import { toListMarkerRenderProps, withListBodyIndent, type ListNumberingPaginationContext } from "./listMarker"

interface FlowSplitPoint {
  childIdx: number
  lineIdx: number
}

function measureFlowParagraph(
  node: ParagraphNode,
  child: FlowBox,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
) {
  const resolvedListMarker = listNumbering?.markers.get(node.id)
  const layoutNode = withListBodyIndent(node, resolvedListMarker, listNumbering)
  const measured = measureParagraphWithCache(layoutNode, child.width, measurer, wordBreaker, paragraphMeasurementCache)
  return { measured, layoutNode, resolvedListMarker }
}

function endFlowSplitPoint(stackBox: FlowBox, to: FlowSplitPoint | null): FlowSplitPoint {
  return to ?? { childIdx: stackBox.children.length, lineIdx: 0 }
}

function flowSplitPointProgressed(from: FlowSplitPoint, to: FlowSplitPoint | null, stackBox: FlowBox): boolean {
  const end = endFlowSplitPoint(stackBox, to)
  return end.childIdx > from.childIdx ||
    (end.childIdx === from.childIdx && end.lineIdx > from.lineIdx)
}

function flowProgressKey(rowBox: FlowBox, splits: Map<string, FlowSplitPoint>): string {
  return rowBox.children
    .map((stackBox) => {
      const split = splits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }
      return `${stackBox.nodeId}:${split.childIdx}:${split.lineIdx}`
    })
    .join("|")
}

function flowStackMeasuredBox(section: DocumentSection, stackBox: FlowBox): MeasuredParagraphBox | undefined {
  const node = section.nodes[stackBox.nodeId]
  if (node?.type !== "flow-stack") return undefined
  return resolveParagraphBoxStyle(node.props.box, stackBox.width)
}

function isFlowStackSliceStart(from: FlowSplitPoint): boolean {
  return from.childIdx === 0 && from.lineIdx === 0
}

function isFlowStackSliceEnd(stackBox: FlowBox, to: FlowSplitPoint | null): boolean {
  const end = endFlowSplitPoint(stackBox, to)
  return end.childIdx >= stackBox.children.length
}

function flowStackSliceTopInset(section: DocumentSection, stackBox: FlowBox, from: FlowSplitPoint): number {
  return isFlowStackSliceStart(from) ? paragraphBoxTopInset(flowStackMeasuredBox(section, stackBox)) : 0
}

function flowStackSliceBottomInset(section: DocumentSection, stackBox: FlowBox, to: FlowSplitPoint | null): number {
  return isFlowStackSliceEnd(stackBox, to) ? paragraphBoxBottomInset(flowStackMeasuredBox(section, stackBox)) : 0
}

function buildFlowStackBoxRenderProps(section: DocumentSection, stackBox: FlowBox): ParagraphBoxRenderProps | undefined {
  return buildParagraphBoxRenderProps(flowStackMeasuredBox(section, stackBox))
}

function flowStackFirstSliceVisualFloor(section: DocumentSection, stackBox: FlowBox, from: FlowSplitPoint): number {
  if (!isFlowStackSliceStart(from)) return 0
  const node = section.nodes[stackBox.nodeId]
  if (node?.type !== "flow-stack") return 0
  const measuredBox = flowStackMeasuredBox(section, stackBox)
  return Math.max(
    Math.max(0, node.props.minHeight ?? 0),
    paragraphBoxTopInset(measuredBox) + paragraphBoxBottomInset(measuredBox),
  )
}

function flowStackHasRemainingContent(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: FlowSplitPoint,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): boolean {
  for (let ci = from.childIdx; ci < stackBox.children.length; ci++) {
    const child = stackBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer" || child.nodeType === "divider") return true
    if (child.nodeType !== "paragraph") continue

    const node = section.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const { measured } = measureFlowParagraph(node, child, measurer, wordBreaker, listNumbering, paragraphMeasurementCache)
    if (lineStart < measured.lines.length) return true
  }

  return false
}

function forceOneFlowUnitProgress(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: FlowSplitPoint,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowSplitPoint | null {
  for (let ci = from.childIdx; ci < stackBox.children.length; ci++) {
    const child = stackBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer" || child.nodeType === "divider") return { childIdx: ci + 1, lineIdx: 0 }
    if (child.nodeType !== "paragraph") continue

    const node = section.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const { measured } = measureFlowParagraph(node, child, measurer, wordBreaker, listNumbering, paragraphMeasurementCache)
    if (lineStart < measured.lines.length) return { childIdx: ci, lineIdx: lineStart + 1 }
  }

  return null
}

function flowParagraphSliceHeight(
  node: ParagraphNode,
  child: FlowBox,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  lineStart: number,
  lineEnd?: number,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): number {
  const { measured } = measureFlowParagraph(node, child, measurer, wordBreaker, listNumbering, paragraphMeasurementCache)
  const resolvedLineEnd = lineEnd ?? measured.lines.length
  const lines = measured.lines.slice(lineStart, resolvedLineEnd)
  if (lines.length === 0) return 0
  return paragraphFragmentHeight(measured, lines, lineStart, resolvedLineEnd)
}

function flowStackSliceHeight(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: FlowSplitPoint,
  to: FlowSplitPoint | null,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): number {
  let height = flowStackSliceTopInset(section, stackBox, from)
  for (let ci = from.childIdx; ci < stackBox.children.length; ci++) {
    const child = stackBox.children[ci]
    if (!child) continue

    const isAtTo = to !== null && ci === to.childIdx
    if (isAtTo && to.lineIdx === 0) break

    if (child.nodeType === "spacer" || child.nodeType === "divider") {
      if (!isAtTo) height += child.height
    } else if (child.nodeType === "paragraph") {
      const node = section.nodes[child.nodeId]
      if (node?.type !== "paragraph") { if (isAtTo) break; continue }
      const lineStart = ci === from.childIdx ? from.lineIdx : 0
      const lineEnd = isAtTo ? to.lineIdx : undefined
      height += flowParagraphSliceHeight(node, child, measurer, wordBreaker, lineStart, lineEnd, listNumbering, paragraphMeasurementCache)
    }

    if (isAtTo) break
  }

  return height + flowStackSliceBottomInset(section, stackBox, to)
}

function computeFlowStackSplitPointFrom(
  stackBox: FlowBox,
  section: DocumentSection,
  availH: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: FlowSplitPoint,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): FlowSplitPoint | null {
  let heightUsed = flowStackSliceTopInset(section, stackBox, from)
  const bottomInset = paragraphBoxBottomInset(flowStackMeasuredBox(section, stackBox))

  for (let ci = from.childIdx; ci < stackBox.children.length; ci++) {
    const child = stackBox.children[ci]
    if (heightUsed >= availH) return { childIdx: ci, lineIdx: 0 }
    const isLastStackChild = ci === stackBox.children.length - 1

    if (child.nodeType === "spacer" || child.nodeType === "divider") {
      const trailingInset = isLastStackChild ? bottomInset : 0
      if (heightUsed + child.height + trailingInset <= availH) heightUsed += child.height + trailingInset
      else return { childIdx: ci, lineIdx: 0 }
    } else if (child.nodeType === "paragraph") {
      const node = section.nodes[child.nodeId]
      if (node?.type !== "paragraph") continue
      const { measured } = measureFlowParagraph(node, child, measurer, wordBreaker, listNumbering, paragraphMeasurementCache)
      const lineStart = ci === from.childIdx ? from.lineIdx : 0
      const remainingHeight = flowParagraphSliceHeight(node, child, measurer, wordBreaker, lineStart, undefined, listNumbering, paragraphMeasurementCache)
      const trailingInset = isLastStackChild ? bottomInset : 0

      if (heightUsed + remainingHeight + trailingInset <= availH) {
        heightUsed += remainingHeight + trailingInset
      } else {
        const availForLines = availH - heightUsed - paragraphLineTopOffset(measured, lineStart)
        if (availForLines <= 0) return { childIdx: ci, lineIdx: lineStart }
        let lineAccum = 0
        for (let li = lineStart; li < measured.lines.length; li++) {
          const lineEnd = li + 1
          const completesParagraph = lineEnd >= measured.lines.length
          const lineTrailingInset = completesParagraph
            ? paragraphEndInset(measured, lineEnd) + trailingInset
            : 0
          if (lineAccum + measured.lines[li].height + lineTrailingInset > availForLines) return { childIdx: ci, lineIdx: li }
          lineAccum += measured.lines[li].height
        }
        heightUsed += remainingHeight + trailingInset
      }
    }
  }

  return null
}

function buildFlowStackSliceFragments(
  stackBox: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pageIndex: number,
  stackPageY: number,
  from: FlowSplitPoint,
  to: FlowSplitPoint | null,
  wordBreaker: WordBreaker,
  pageNumberOffset: number,
  paragraphFragmentIndexes: Map<string, number>,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): PageFragment[] {
  const fragments: PageFragment[] = []
  let curY = stackPageY + flowStackSliceTopInset(section, stackBox, from)

  for (let ci = from.childIdx; ci < stackBox.children.length; ci++) {
    const child = stackBox.children[ci]
    if (!child) continue

    const isAtTo = to !== null && ci === to.childIdx
    if (isAtTo && to.lineIdx === 0) break

    if (child.nodeType === "spacer") {
      if (!isAtTo) {
        fragments.push({
          nodeId: child.nodeId,
          nodeType: "spacer",
          parentNodeId: stackBox.nodeId,
          pageIndex,
          x: child.x,
          y: curY,
          width: child.width,
          height: child.height,
        })
        curY += child.height
      }
    } else if (child.nodeType === "divider") {
      if (!isAtTo) {
        const node = section.nodes[child.nodeId]
        let dividerRenderProps: DividerRenderProps | undefined
        if (node?.type === "divider") {
          const measured = measureDivider(node, child.width)
          dividerRenderProps = {
            color: measured.color,
            thickness: measured.thickness,
            marginBefore: measured.marginBefore,
            marginAfter: measured.marginAfter,
            style: measured.style,
          }
        }
        fragments.push({
          nodeId: child.nodeId,
          nodeType: "divider",
          parentNodeId: stackBox.nodeId,
          pageIndex,
          x: child.x,
          y: curY,
          width: child.width,
          height: child.height,
          dividerRenderProps,
        })
        curY += child.height
      }
    } else if (child.nodeType === "paragraph") {
      const node = section.nodes[child.nodeId]
      if (node?.type !== "paragraph") { if (isAtTo) break; continue }

      const { measured, layoutNode, resolvedListMarker } = measureFlowParagraph(node, child, measurer, wordBreaker, listNumbering, paragraphMeasurementCache)
      const lineStart = ci === from.childIdx ? from.lineIdx : 0
      const lineEnd = isAtTo ? to.lineIdx : undefined
      const lines = lineEnd !== undefined
        ? measured.lines.slice(lineStart, lineEnd)
        : measured.lines.slice(lineStart)

      if (lines.length > 0) {
        const resolvedLineEnd = lineStart + lines.length
        const isLastLines = lineEnd === undefined || lineEnd === measured.lines.length
        const paraH = paragraphFragmentHeight(measured, lines, lineStart, resolvedLineEnd)
        const fragmentIndex = paragraphFragmentIndexes.get(child.nodeId) ?? 0
        paragraphFragmentIndexes.set(child.nodeId, fragmentIndex + 1)
        const paragraphContentX = child.x + paragraphBoxLeftInset(measured.box)
        const listMarker = toListMarkerRenderProps(resolvedListMarker, listNumbering, paragraphContentX)
        fragments.push({
          nodeId: child.nodeId,
          nodeType: "paragraph",
          parentNodeId: stackBox.nodeId,
          pageIndex,
          x: child.x,
          y: curY,
          width: child.width,
          height: paraH,
          lines: resolvePageNumbers(
            buildPositionedParagraphLines(measured, lines, child.x, curY, lineStart, layoutNode.props.align, isLastLines),
            pageIndex + 1 + pageNumberOffset,
          ),
          renderProps: buildRenderProps(layoutNode, measured.lineHeight, measured.box),
          listMarker: lineStart === 0 ? listMarker : undefined,
          fragmentIndex,
          lineStart,
          lineEnd: resolvedLineEnd,
          continuesFrom: lineStart > 0,
          isContinued: resolvedLineEnd < measured.lines.length,
        })
        curY += paraH
      }
    }

    if (isAtTo) break
  }

  return fragments
}

export function paginateFlowRow(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
  wordBreaker: WordBreaker = defaultWordBreaker,
  listNumbering?: ListNumberingPaginationContext,
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): PageFlowCursor {
  const fromSplits = new Map<string, FlowSplitPoint>()
  for (const stackBox of box.children) fromSplits.set(stackBox.nodeId, { childIdx: 0, lineIdx: 0 })

  let current = cursor
  let fragmentIndex = 0
  let retriedNoProgressKey: string | null = null
  const stackFragmentIndexes = new Map<string, number>()
  const paragraphFragmentIndexes = new Map<string, number>()
  const rowNode = section.nodes[box.nodeId]
  const firstSliceMinHeight = rowNode?.type === "flow-row" ? rowNode.props.minHeight ?? 0 : 0

  const hasRemaining = (): boolean => box.children.some((stackBox) =>
    flowStackHasRemainingContent(stackBox, section, measurer, wordBreaker, fromSplits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }, listNumbering, paragraphMeasurementCache),
  )

  if (!hasRemaining() && box.children.length > 0) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
    }

    let rowSliceHeight = Math.max(firstSliceMinHeight, box.height)
    const availH = contentBottom - current.cursorY
    if (current.cursorY > contentTop + 1 && rowSliceHeight > availH) {
      current = advancePage(current, contentTop)
    }
    rowSliceHeight = Math.max(rowSliceHeight, 0)

    pushFragment(pages, template, {
      nodeId: box.nodeId,
      nodeType: "flow-row",
      parentNodeId,
      pageIndex: current.pageIndex,
      x: box.x,
      y: current.cursorY,
      width: box.width,
      height: rowSliceHeight,
      fragmentIndex: 0,
      continuesFrom: false,
      isContinued: false,
    })

    for (const stackBox of box.children) {
      pushFragment(pages, template, {
        nodeId: stackBox.nodeId,
        nodeType: "flow-stack",
        parentNodeId: box.nodeId,
        pageIndex: current.pageIndex,
        x: stackBox.x,
        y: current.cursorY,
        width: stackBox.width,
        height: rowSliceHeight,
        boxRenderProps: buildFlowStackBoxRenderProps(section, stackBox),
        fragmentIndex: 0,
        continuesFrom: false,
        isContinued: false,
      })
    }

    return { ...current, cursorY: current.cursorY + rowSliceHeight }
  }

  while (hasRemaining()) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
    }

    const sliceMinHeight = fragmentIndex === 0 ? firstSliceMinHeight : 0
    const availH = contentBottom - current.cursorY
    if (current.cursorY > contentTop + 1 && sliceMinHeight > availH) {
      current = advancePage(current, contentTop)
      continue
    }

    const activeStacks = box.children.filter((stackBox) =>
      flowStackHasRemainingContent(stackBox, section, measurer, wordBreaker, fromSplits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }, listNumbering, paragraphMeasurementCache),
    )
    const toSplits = new Map<string, FlowSplitPoint | null>()
    let hasContentProgress = false
    let rowSliceHeight = sliceMinHeight
    const sliceWarnings = new Map<string, PageFragmentWarning[]>()

    for (const stackBox of box.children) {
      rowSliceHeight = Math.max(
        rowSliceHeight,
        flowStackFirstSliceVisualFloor(section, stackBox, fromSplits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }),
      )
    }

    for (const stackBox of activeStacks) {
      const from = fromSplits.get(stackBox.nodeId)!
      const to = computeFlowStackSplitPointFrom(stackBox, section, Math.max(0, availH), measurer, wordBreaker, from, listNumbering, paragraphMeasurementCache)
      toSplits.set(stackBox.nodeId, to)
      if (flowSplitPointProgressed(from, to, stackBox)) {
        hasContentProgress = true
      }
      rowSliceHeight = Math.max(rowSliceHeight, flowStackSliceHeight(stackBox, section, measurer, wordBreaker, from, to, listNumbering, paragraphMeasurementCache))
    }

    if (!hasContentProgress) {
      const progressKey = flowProgressKey(box, fromSplits)
      if (current.cursorY > contentTop + 1 && retriedNoProgressKey !== progressKey) {
        retriedNoProgressKey = progressKey
        current = advancePage(current, contentTop)
        continue
      }

      const forcedStack = activeStacks[0]
      if (forcedStack) {
        const forcedSplit = forceOneFlowUnitProgress(
          forcedStack,
          section,
          measurer,
          wordBreaker,
          fromSplits.get(forcedStack.nodeId)!,
          listNumbering,
          paragraphMeasurementCache,
        )
        if (forcedSplit) {
          toSplits.set(forcedStack.nodeId, forcedSplit)
          rowSliceHeight = Math.max(
            rowSliceHeight,
            flowStackSliceHeight(forcedStack, section, measurer, wordBreaker, fromSplits.get(forcedStack.nodeId)!, forcedSplit, listNumbering, paragraphMeasurementCache),
          )
          const warning: PageFragmentWarning = {
            code: "forced-flow-row-split-overflow",
            message: "flow-row split forced one content unit because the available slice could not fit normal progress",
          }
          sliceWarnings.set(box.nodeId, [warning])
          sliceWarnings.set(forcedStack.nodeId, [warning])
        }
      }
    } else {
      retriedNoProgressKey = null
    }

    const nextSplits = new Map(fromSplits)
    for (const stackBox of activeStacks) {
      const to = toSplits.get(stackBox.nodeId) ?? null
      nextSplits.set(stackBox.nodeId, endFlowSplitPoint(stackBox, to))
    }
    const continuesAfter = box.children.some((stackBox) =>
      flowStackHasRemainingContent(stackBox, section, measurer, wordBreaker, nextSplits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }, listNumbering, paragraphMeasurementCache),
    )

    pushFragment(pages, template, {
      nodeId: box.nodeId,
      nodeType: "flow-row",
      parentNodeId,
      pageIndex: current.pageIndex,
      x: box.x,
      y: current.cursorY,
      width: box.width,
      height: rowSliceHeight,
      fragmentIndex,
      continuesFrom: fragmentIndex > 0,
      isContinued: continuesAfter,
      warnings: sliceWarnings.get(box.nodeId),
    })

    const childFragments: PageFragment[] = []
    const activeStackIds = new Set(activeStacks.map((stackBox) => stackBox.nodeId))
    for (const stackBox of box.children) {
      const stackFragmentIndex = stackFragmentIndexes.get(stackBox.nodeId) ?? 0
      const stackContinuesAfter = flowStackHasRemainingContent(
        stackBox,
        section,
        measurer,
        wordBreaker,
        nextSplits.get(stackBox.nodeId) ?? { childIdx: 0, lineIdx: 0 },
        listNumbering,
        paragraphMeasurementCache,
      )
      stackFragmentIndexes.set(stackBox.nodeId, stackFragmentIndex + 1)

      pushFragment(pages, template, {
        nodeId: stackBox.nodeId,
        nodeType: "flow-stack",
        parentNodeId: box.nodeId,
        pageIndex: current.pageIndex,
        x: stackBox.x,
        y: current.cursorY,
        width: stackBox.width,
        height: rowSliceHeight,
        boxRenderProps: buildFlowStackBoxRenderProps(section, stackBox),
        fragmentIndex: stackFragmentIndex,
        continuesFrom: stackFragmentIndex > 0,
        isContinued: stackContinuesAfter,
        warnings: sliceWarnings.get(stackBox.nodeId),
      })

      if (!activeStackIds.has(stackBox.nodeId)) continue
      const from = fromSplits.get(stackBox.nodeId)!
      const to = toSplits.get(stackBox.nodeId) ?? null
      childFragments.push(...buildFlowStackSliceFragments(
        stackBox,
        section,
        measurer,
        current.pageIndex,
        current.cursorY,
        from,
        to,
        wordBreaker,
        current.pageNumberOffset,
        paragraphFragmentIndexes,
        listNumbering,
        paragraphMeasurementCache,
      ))
    }

    childFragments
      .sort((a, b) => a.y - b.y || a.x - b.x || a.nodeId.localeCompare(b.nodeId))
      .forEach((fragment) => pushFragment(pages, template, fragment))

    for (const [stackId, split] of nextSplits) {
      fromSplits.set(stackId, split)
    }

    current = { ...current, cursorY: current.cursorY + rowSliceHeight }
    fragmentIndex += 1

    if (continuesAfter) {
      current = advancePage(current, contentTop)
    }
  }

  return current
}
