import { measureParagraph } from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { FlowTableNode, TableNode } from "../../schema"
import {
  paragraphFragmentHeight,
  paragraphLineTopOffset,
  paragraphLinesHeight,
} from "./paragraph"
import type { SplitPoint } from "./cellSplit"

type CellSplitOwner = Pick<TableNode | FlowTableNode, "nodes">

export function cellHasRemainingSplitContent(
  cellBox: FlowBox,
  tableNode: CellSplitOwner,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
): boolean {
  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") return true
    if (child.nodeType !== "paragraph") continue

    const node = tableNode.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const measured = measureParagraph(node, child.width, measurer, wordBreaker)
    if (lineStart < measured.lines.length) return true
  }

  return false
}

export function forceOneSplitUnitProgress(
  cellBox: FlowBox,
  tableNode: CellSplitOwner,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
): SplitPoint | null {
  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (!child) continue
    if (child.nodeType === "spacer") return { childIdx: ci + 1, lineIdx: 0 }
    if (child.nodeType !== "paragraph") continue

    const node = tableNode.nodes[child.nodeId]
    if (node?.type !== "paragraph") continue
    const lineStart = ci === from.childIdx ? from.lineIdx : 0
    const measured = measureParagraph(node, child.width, measurer, wordBreaker)
    if (lineStart < measured.lines.length) return { childIdx: ci, lineIdx: lineStart + 1 }
  }

  return null
}

export function forcedSplitUnitHeight(
  cellBox: FlowBox,
  tableNode: CellSplitOwner,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
  to: SplitPoint,
): number {
  const child = cellBox.children[from.childIdx]
  if (!child) return 0
  if (child.nodeType === "spacer") return child.height
  if (child.nodeType !== "paragraph") return 0

  const node = tableNode.nodes[child.nodeId]
  if (node?.type !== "paragraph") return 0

  const measured = measureParagraph(node, child.width, measurer, wordBreaker)
  const lineStart = from.lineIdx
  const lineEnd = to.childIdx === from.childIdx ? to.lineIdx : measured.lines.length
  const lines = measured.lines.slice(lineStart, lineEnd)

  return paragraphFragmentHeight(measured, lines, lineStart, lineEnd)
}

export function computeCellSplitPointFrom(
  cellBox: FlowBox,
  tableNode: CellSplitOwner,
  availH: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  from: SplitPoint,
  initialHeight: number = 0,
): SplitPoint | null {
  let heightUsed = initialHeight

  for (let ci = from.childIdx; ci < cellBox.children.length; ci++) {
    const child = cellBox.children[ci]
    if (heightUsed >= availH) return { childIdx: ci, lineIdx: 0 }

    if (child.nodeType === "spacer") {
      if (heightUsed + child.height <= availH) heightUsed += child.height
      else return { childIdx: ci, lineIdx: 0 }
    } else if (child.nodeType === "paragraph") {
      const node = tableNode.nodes[child.nodeId]
      if (node?.type !== "paragraph") continue
      const measured = measureParagraph(node, child.width, measurer, wordBreaker)
      const lineStart = ci === from.childIdx ? from.lineIdx : 0
      const remainingLines = measured.lines.slice(lineStart)
      const remainH = paragraphLineTopOffset(measured, lineStart) + paragraphLinesHeight(remainingLines)

      if (heightUsed + remainH <= availH) {
        heightUsed += remainH
      } else {
        const availForLines = availH - heightUsed - paragraphLineTopOffset(measured, lineStart)
        if (availForLines <= 0) return { childIdx: ci, lineIdx: lineStart }
        let lineAccum = 0
        for (let li = lineStart; li < measured.lines.length; li++) {
          if (lineAccum + measured.lines[li].height > availForLines) return { childIdx: ci, lineIdx: li }
          lineAccum += measured.lines[li].height
        }
        heightUsed += remainH
      }
    }
  }

  return null
}
