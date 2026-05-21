import type { FlowBox } from "../../layout"

export interface SplitPoint {
  childIdx: number
  lineIdx: number
}

export function endSplitPoint(cellBox: FlowBox, to: SplitPoint | null): SplitPoint {
  return to ?? { childIdx: cellBox.children.length, lineIdx: 0 }
}

export function splitPointProgressed(from: SplitPoint, to: SplitPoint | null, cellBox: FlowBox): boolean {
  const end = endSplitPoint(cellBox, to)
  return end.childIdx > from.childIdx ||
    (end.childIdx === from.childIdx && end.lineIdx > from.lineIdx)
}

export function splitProgressKey(rowBox: FlowBox, splits: Map<string, SplitPoint>): string {
  return rowBox.children
    .map((cellBox) => {
      const split = splits.get(cellBox.nodeId) ?? { childIdx: 0, lineIdx: 0 }
      return `${cellBox.nodeId}:${split.childIdx}:${split.lineIdx}`
    })
    .join("|")
}

export function splitPointIsAtStart(from: SplitPoint): boolean {
  return from.childIdx === 0 && from.lineIdx === 0
}
