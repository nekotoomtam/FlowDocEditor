import { toAbstractUnit } from "../../layout"
import type {
  FlowTableCellNode,
  FlowTableNode,
} from "../../schema"
import type {
  ParagraphBoxRenderProps,
} from "../types"

export function resolveFlowTableCellBoxRenderProps(cellNode: FlowTableCellNode): ParagraphBoxRenderProps | undefined {
  const box = cellNode.props.box
  if (!box) return undefined

  const padding = box.padding
  const border = box.border
  return {
    fill: box.fill,
    padding: {
      top: padding ? toAbstractUnit(padding.top.value, padding.top.unit) : 0,
      right: padding ? toAbstractUnit(padding.right.value, padding.right.unit) : 0,
      bottom: padding ? toAbstractUnit(padding.bottom.value, padding.bottom.unit) : 0,
      left: padding ? toAbstractUnit(padding.left.value, padding.left.unit) : 0,
    },
    border: {
      top: border?.top ? {
        style: border.top.style,
        width: toAbstractUnit(border.top.width.value, border.top.width.unit),
        color: border.top.color,
      } : undefined,
      right: border?.right ? {
        style: border.right.style,
        width: toAbstractUnit(border.right.width.value, border.right.width.unit),
        color: border.right.color,
      } : undefined,
      bottom: border?.bottom ? {
        style: border.bottom.style,
        width: toAbstractUnit(border.bottom.width.value, border.bottom.width.unit),
        color: border.bottom.color,
      } : undefined,
      left: border?.left ? {
        style: border.left.style,
        width: toAbstractUnit(border.left.width.value, border.left.width.unit),
        color: border.left.color,
      } : undefined,
    },
  }
}

export function resolveFlowTableCellPadding(cellNode: FlowTableCellNode): { top: number; right: number; bottom: number; left: number } {
  const padding = cellNode.props.box?.padding
  return {
    top: padding ? toAbstractUnit(padding.top.value, padding.top.unit) : 0,
    right: padding ? toAbstractUnit(padding.right.value, padding.right.unit) : 0,
    bottom: padding ? toAbstractUnit(padding.bottom.value, padding.bottom.unit) : 0,
    left: padding ? toAbstractUnit(padding.left.value, padding.left.unit) : 0,
  }
}

export function resolveFlowTableColumnWidths(tableNode: FlowTableNode, availableWidth: number): number[] {
  const rawWidths = tableNode.columns.map((column) =>
    toAbstractUnit(column.width.value, column.width.unit),
  )
  const totalWidth = rawWidths.reduce((sum, width) => sum + width, 0)
  const safeAvailableWidth = Math.max(0, availableWidth)

  if (rawWidths.length === 0) return []
  if (totalWidth <= 0) {
    const equalWidth = safeAvailableWidth / rawWidths.length
    return rawWidths.map(() => equalWidth)
  }
  if (totalWidth <= safeAvailableWidth) return rawWidths

  let assigned = 0
  return rawWidths.map((rawWidth, index) => {
    if (index === rawWidths.length - 1) return Math.max(0, safeAvailableWidth - assigned)
    const width = safeAvailableWidth * (rawWidth / totalWidth)
    assigned += width
    return width
  })
}
