import type {
  DocumentNode,
  FieldRefInline,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  FlowStackNode,
  LayoutNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphBoxStyle,
  ParagraphNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  TextRun,
  UnitValue,
} from "../schema"
import { pt } from "../schema"
import type { DragSource, PlacementOperation } from "../placement/types"
import {
  createParagraphNode,
  createRowNode,
  createFlowColumnsSubtree,
  createFlowRowNode,
  createFlowStackNode,
  createStackNode,
  getEqualWidthShares,
  DEFAULT_STACK_MIN_HEIGHT,
  createDefaultFlowTable,
  createDefaultTable,
  createFlowTableCellNode,
  createFlowTableRowNode,
  createTableCellNode,
  createTableRowNode,
  createFieldRefInline,
} from "./defaults"
import { tryResolveFlowTableGrid } from "./flowTableGrid"

// ─── Internal Types ────────────────────────────────────────────────────────────

type Nodes = Record<string, LayoutNode>

interface ParentInfo {
  parentId: string
  index: number
}

export interface FieldRefInlineChanges {
  label?: string
  fallback?: string
}

export type ParagraphBoxEdge = keyof ParagraphBoxPadding

export interface ParagraphBoxStyleChanges {
  fill?: string | null
  padding?: Partial<Record<ParagraphBoxEdge, UnitValue>> | null
  border?: Partial<Record<ParagraphBoxEdge, ParagraphBoxBorderSide | null>> | null
}

export interface FlowTableCellSpanChanges {
  colspan?: number
  rowspan?: number
}

export type FlowTableCellMergeDirection = "left" | "right" | "up" | "down"

export interface FlowTableCellMergeTarget {
  cellId: string
  changes: FlowTableCellSpanChanges
}

// ─── Tree Helpers ──────────────────────────────────────────────────────────────

function findParentInfo(nodes: Nodes, childId: string): ParentInfo | null {
  for (const [id, node] of Object.entries(nodes)) {
    if (
      (node.type === "body" || node.type === "stack" || node.type === "row" || node.type === "flow-row" || node.type === "flow-stack") &&
      node.childIds.includes(childId)
    ) {
      return { parentId: id, index: node.childIds.indexOf(childId) }
    }
  }
  return null
}

function getChildIds(nodes: Nodes, parentId: string): string[] {
  const node = nodes[parentId]
  if (!node || !("childIds" in node)) return []
  return (node as LayoutNode & { childIds: string[] }).childIds
}

function setChildIds(nodes: Nodes, parentId: string, childIds: string[]): Nodes {
  const node = nodes[parentId]
  if (!node || !("childIds" in node)) return nodes
  return { ...nodes, [parentId]: { ...node, childIds } as LayoutNode }
}

export function isPlainTextParagraph(node: ParagraphNode): node is ParagraphNode & { children: TextRun[] } {
  return node.children.length > 0 && node.children.every((child) => child.type === "text")
}

function getPlainText(node: ParagraphNode): string {
  return node.children.map((child) => child.type === "text" ? child.text : "").join("")
}

function replaceWithSingleTextRun(node: ParagraphNode, text: string): ParagraphNode {
  const firstRun = node.children.find((child) => child.type === "text")
  if (!firstRun) return node
  return { ...node, children: [{ ...firstRun, text }] }
}

function updateFieldRefInParagraph(
  node: ParagraphNode,
  fieldRefId: string,
  changes: FieldRefInlineChanges,
): ParagraphNode | null {
  let changed = false
  const children = node.children.map((child) => {
    if (child.type !== "fieldRef" || child.id !== fieldRefId) return child
    changed = true
    const next: FieldRefInline = { ...child }
    if (Object.prototype.hasOwnProperty.call(changes, "label")) {
      if (changes.label == null || changes.label === "") delete next.label
      else next.label = changes.label
    }
    if (Object.prototype.hasOwnProperty.call(changes, "fallback")) {
      if (changes.fallback == null || changes.fallback === "") delete next.fallback
      else next.fallback = changes.fallback
    }
    return next
  })
  return changed ? { ...node, children } : null
}

// ─── Width Share Helpers ───────────────────────────────────────────────────────

function splitWidthPercent(percent: number): { original: number; inserted: number } {
  const safe = Math.round(Math.max(percent, 0) * 100) / 100
  const original = Math.floor((safe / 2) * 100) / 100
  return { original, inserted: Math.round((safe - original) * 100) / 100 }
}

function splitWidthShare(total: number, count: number): number[] {
  const safeTotal = Math.round(Math.max(total, 0) * 100) / 100
  const safeCount = Math.max(1, Math.floor(count))
  const base = Math.floor((safeTotal / safeCount) * 100) / 100
  const shares = Array.from({ length: safeCount }, () => base)
  const assignedExceptLast = base * Math.max(0, safeCount - 1)
  shares[safeCount - 1] = Math.round((safeTotal - assignedExceptLast) * 100) / 100
  return shares
}

function redistributeRowWidths(nodes: Nodes, rowId: string): Nodes {
  const row = nodes[rowId]
  if (row?.type !== "row") return nodes
  const count = row.childIds.length
  if (count === 0) return nodes
  const shares = getEqualWidthShares(count)
  let result = nodes
  row.childIds.forEach((stackId, i) => {
    const stack = result[stackId]
    if (stack?.type === "stack") {
      result = { ...result, [stackId]: { ...stack, props: { ...stack.props, widthShare: shares[i] } } as LayoutNode }
    }
  })
  return result
}

function transferDeletedStackWidth(nodes: Nodes, rowId: string, deletedStackId: string, deletedIndex: number): Nodes {
  const row = nodes[rowId]
  if (row?.type !== "row" || row.childIds.length === 0) return nodes

  const deletedStack = nodes[deletedStackId]
  const deletedShare = deletedStack?.type === "stack" ? deletedStack.props.widthShare ?? 0 : 0
  if (deletedShare <= 0) return nodes

  const receiverId = deletedIndex > 0
    ? row.childIds[deletedIndex - 1]
    : row.childIds[0]
  const receiver = nodes[receiverId]
  if (receiver?.type !== "stack") return nodes

  return {
    ...nodes,
    [receiverId]: {
      ...receiver,
      props: {
        ...receiver.props,
        widthShare: Math.round(((receiver.props.widthShare ?? 0) + deletedShare) * 100) / 100,
      },
    } as LayoutNode,
  }
}

function transferDeletedFlowStackWidth(nodes: Nodes, rowId: string, deletedStackId: string, deletedIndex: number): Nodes {
  const row = nodes[rowId]
  if (row?.type !== "flow-row" || row.childIds.length === 0) return nodes

  const deletedStack = nodes[deletedStackId]
  const deletedShare = deletedStack?.type === "flow-stack" ? deletedStack.props.widthShare ?? 0 : 0
  if (deletedShare <= 0) return nodes

  const receiverId = deletedIndex > 0
    ? row.childIds[deletedIndex - 1]
    : row.childIds[0]
  const receiver = nodes[receiverId]
  if (receiver?.type !== "flow-stack") return nodes

  return {
    ...nodes,
    [receiverId]: {
      ...receiver,
      props: {
        ...receiver.props,
        widthShare: Math.round(((receiver.props.widthShare ?? 0) + deletedShare) * 100) / 100,
      },
    } as LayoutNode,
  }
}

// ─── Removal & Cleanup ─────────────────────────────────────────────────────────

function removeFromParent(nodes: Nodes, nodeId: string): { nodes: Nodes; parentInfo: ParentInfo | null } {
  const parentInfo = findParentInfo(nodes, nodeId)
  if (parentInfo == null) return { nodes, parentInfo: null }
  const childIds = getChildIds(nodes, parentInfo.parentId).filter((id) => id !== nodeId)
  return { nodes: setChildIds(nodes, parentInfo.parentId, childIds), parentInfo }
}

function cleanupAfterRemoval(nodes: Nodes, removedFromId: string): Nodes {
  const parent = nodes[removedFromId]
  if (!parent) return nodes

  // Stack: keep empty stacks as intentional layout regions.
  // A selected stack is deleted explicitly by deleteNode, not by cleanup.
  if (parent.type === "stack") {
    return nodes
  }

  // Row: keep single-stack rows. Delete the row only when no stacks remain.
  if (parent.type === "row") {
    const remaining = getChildIds(nodes, removedFromId)
    const parentInfo = findParentInfo(nodes, removedFromId)
    if (parentInfo == null) return nodes

    if (remaining.length === 0) {
      let result = setChildIds(nodes, parentInfo.parentId, getChildIds(nodes, parentInfo.parentId).filter((id) => id !== removedFromId))
      delete result[removedFromId]
      return cleanupAfterRemoval(result, parentInfo.parentId)
    }

    return nodes
  }

  if (parent.type === "flow-stack") {
    return nodes
  }

  if (parent.type === "flow-row") {
    const remaining = getChildIds(nodes, removedFromId)
    const parentInfo = findParentInfo(nodes, removedFromId)
    if (parentInfo == null) return nodes

    if (remaining.length === 0) {
      let result = setChildIds(nodes, parentInfo.parentId, getChildIds(nodes, parentInfo.parentId).filter((id) => id !== removedFromId))
      delete result[removedFromId]
      return cleanupAfterRemoval(result, parentInfo.parentId)
    }

    return nodes
  }

  return nodes
}

// ─── Node Creation ─────────────────────────────────────────────────────────────

function createNodesForSource(source: DragSource): { insertId: string; newNodes: Nodes } {
  if (source.source === "palette") {
    if (source.blockType === "paragraph") {
      const node = createParagraphNode("New paragraph")
      return { insertId: node.id, newNodes: { [node.id]: node } }
    }
    if (source.blockType === "row") {
      const { row, nodes } = createFlowColumnsSubtree(1)
      return { insertId: row.id, newNodes: nodes }
    }
    if (source.blockType === "columns") {
      const { row, nodes } = createFlowColumnsSubtree(2)
      return { insertId: row.id, newNodes: nodes }
    }
    if (source.blockType === "flow-columns") {
      const { row, nodes } = createFlowColumnsSubtree(2)
      return { insertId: row.id, newNodes: nodes }
    }
    if (source.blockType === "table") {
      const table = createDefaultTable()
      return { insertId: table.id, newNodes: { [table.id]: table as unknown as LayoutNode } }
    }
    if (source.blockType === "flow-table") {
      const table = createDefaultFlowTable()
      return { insertId: table.id, newNodes: { [table.id]: table as unknown as LayoutNode } }
    }
    const { row, nodes } = createFlowColumnsSubtree(1)
    return { insertId: row.id, newNodes: nodes }
  }
  if (source.source === "document") return { insertId: source.nodeId, newNodes: {} }
  return { insertId: "", newNodes: {} }
}

// ─── Index Adjustment ─────────────────────────────────────────────────────────

function shiftedIndex(rawIndex: number, sourceIndexInSameParent: number | null): number {
  if (sourceIndexInSameParent == null) return rawIndex
  return sourceIndexInSameParent < rawIndex ? rawIndex - 1 : rawIndex
}

// ─── Operation Applicators ────────────────────────────────────────────────────

function doInsertBeforeAfter(
  nodes: Nodes,
  parentId: string,
  rawIndex: number,
  insertId: string,
  srcIndexInParent: number | null,
): Nodes {
  const idx = shiftedIndex(rawIndex, srcIndexInParent)
  const childIds = [...getChildIds(nodes, parentId)]
  childIds.splice(idx, 0, insertId)
  return setChildIds(nodes, parentId, childIds)
}

function doInsertIntoContainer(
  nodes: Nodes,
  containerId: string,
  rawIndex: number,
  insertId: string,
  srcIndexInContainer: number | null,
): Nodes {
  const idx = shiftedIndex(rawIndex, srcIndexInContainer)
  const childIds = [...getChildIds(nodes, containerId)]
  childIds.splice(Math.min(idx, childIds.length), 0, insertId)
  return setChildIds(nodes, containerId, childIds)
}

function doExpandRow(
  nodes: Nodes,
  rowId: string,
  targetStackId: string,
  insertionIndex: number,
  insertId: string,
): Nodes {
  const targetStack = nodes[targetStackId]
  if (targetStack?.type !== "stack") return nodes

  const { original, inserted } = splitWidthPercent(targetStack.props.widthShare ?? 100)
  let result: Nodes = {
    ...nodes,
    [targetStackId]: { ...targetStack, props: { ...targetStack.props, widthShare: original } } as LayoutNode,
  }

  const newStack = createStackNode([insertId], { widthShare: inserted, minHeight: DEFAULT_STACK_MIN_HEIGHT })
  result = { ...result, [newStack.id]: newStack }

  const rowChildIds = [...getChildIds(result, rowId)]
  rowChildIds.splice(insertionIndex, 0, newStack.id)
  return setChildIds(result, rowId, rowChildIds)
}

function doInsertStacksIntoRow(
  nodes: Nodes,
  rowId: string,
  targetStackId: string,
  insertionIndex: number,
  count: number,
): Nodes {
  const row = nodes[rowId]
  if (row?.type !== "row") return nodes
  const targetStack = nodes[targetStackId]
  if (targetStack?.type !== "stack") return nodes

  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount === 0) return nodes

  const shares = splitWidthShare(targetStack.props.widthShare ?? 100, safeCount + 1)
  const newStacks = Array.from({ length: safeCount }, () =>
    createStackNode([], { minHeight: DEFAULT_STACK_MIN_HEIGHT }),
  )

  let result: Nodes = {
    ...nodes,
    [targetStackId]: {
      ...targetStack,
      props: { ...targetStack.props, widthShare: shares[0] },
    } as LayoutNode,
  }

  newStacks.forEach((stack, index) => {
    result = {
      ...result,
      [stack.id]: {
        ...stack,
        props: { ...stack.props, widthShare: shares[index + 1] },
      } as LayoutNode,
    }
  })

  const rowChildIds = [...getChildIds(result, rowId)]
  rowChildIds.splice(insertionIndex, 0, ...newStacks.map((stack) => stack.id))
  return setChildIds(result, rowId, rowChildIds)
}

function doWrapInRow(
  nodes: Nodes,
  parentId: string,
  targetNodeId: string,
  insertId: string,
  isLeft: boolean,
): Nodes {
  const currentIndex = getChildIds(nodes, parentId).indexOf(targetNodeId)
  if (currentIndex === -1) return nodes

  const leftIds = isLeft ? [insertId] : [targetNodeId]
  const rightIds = isLeft ? [targetNodeId] : [insertId]
  const parent = nodes[parentId]
  const useLegacyRow = parent?.type === "stack"
  const stackLeft = useLegacyRow
    ? createStackNode(leftIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
    : createFlowStackNode(leftIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
  const stackRight = useLegacyRow
    ? createStackNode(rightIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
    : createFlowStackNode(rightIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
  const newRow = useLegacyRow
    ? createRowNode([stackLeft.id, stackRight.id])
    : createFlowRowNode([stackLeft.id, stackRight.id])

  let result: Nodes = {
    ...nodes,
    [stackLeft.id]: stackLeft,
    [stackRight.id]: stackRight,
    [newRow.id]: newRow,
  }

  const parentChildIds = [...getChildIds(result, parentId)]
  parentChildIds.splice(currentIndex, 1, newRow.id)
  return setChildIds(result, parentId, parentChildIds)
}

// ─── Subtree Helpers ──────────────────────────────────────────────────────────

function collectSubtreeIds(nodes: Nodes, rootId: string): string[] {
  const result: string[] = []
  const visit = (id: string) => {
    result.push(id)
    const node = nodes[id]
    if (node && "childIds" in node) {
      ;(node as LayoutNode & { childIds: string[] }).childIds.forEach(visit)
    }
  }
  visit(rootId)
  return result
}

// ─── Table Helpers ────────────────────────────────────────────────────────────

function updateTableInSection(
  doc: DocumentNode,
  tableId: string,
  updater: (table: TableNode) => TableNode,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const tableNode = section.nodes[tableId]
    if (tableNode?.type !== "table") continue
    const newTable = updater(tableNode as unknown as TableNode)
    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: { ...s.nodes, [tableId]: newTable as unknown as LayoutNode } } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
}

function updateFlowTableInSection(
  doc: DocumentNode,
  tableId: string,
  updater: (table: FlowTableNode) => FlowTableNode,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const tableNode = section.nodes[tableId]
    if (tableNode?.type !== "flow-table") continue
    const newTable = updater(tableNode as unknown as FlowTableNode)
    if (newTable === tableNode) return doc
    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: { ...s.nodes, [tableId]: newTable as unknown as LayoutNode } } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
}

function unitWidthToPt(width: { value: number; unit: "pt" | "mm" } | undefined): number {
  if (!width) return 0
  return width.unit === "mm" ? width.value * 72 / 25.4 : width.value
}

function isSpanFreeFlowTable(table: FlowTableNode): boolean {
  return table.rowIds.every((rowId) => {
    const row = table.nodes[rowId]
    if (row?.type !== "flow-table-row") return false
    if (row.cellIds.length !== table.columns.length) return false
    return row.cellIds.every((cellId) => {
      const cell = table.nodes[cellId]
      return cell?.type === "flow-table-cell" &&
        (cell.props.colspan ?? 1) === 1 &&
        (cell.props.rowspan ?? 1) === 1
    })
  })
}

function createEmptyFlowTableCell(internalNodes: FlowTableNode["nodes"]): string {
  const para = createParagraphNode("", { spacingBefore: pt(2), spacingAfter: pt(2) })
  const cell = createFlowTableCellNode([para.id])
  internalNodes[para.id] = para
  internalNodes[cell.id] = cell
  return cell.id
}

interface FlowTableRowRemovalPlan {
  rowId: string
  deleteCellIds: string[]
  shrinkRowspanCellIds: string[]
}

interface FlowTableColumnRemovalPlan {
  deleteCellIds: string[]
  shrinkColspanCellIds: string[]
}

interface FlowTableCellSpanUpdatePlan {
  cellId: string
  rowIndex: number
  columnIndex: number
  colspan: number
  rowspan: number
  consumeCellIds: string[]
  createSlots: Array<{ rowIndex: number; columnIndex: number }>
}

type FlowTableCellMergeMap = NonNullable<FlowTableCellNode["props"]["mergeMap"]>
type FlowTableCellMergeMapEntry = FlowTableCellMergeMap["entries"][number]

function slotKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`
}

function flowTableCellPropsWithSpan(
  props: FlowTableCellNode["props"],
  colspan: number,
  rowspan: number,
): FlowTableCellNode["props"] {
  const next = { ...props }
  if (colspan > 1) next.colspan = colspan
  else delete next.colspan
  if (rowspan > 1) next.rowspan = rowspan
  else delete next.rowspan
  return next
}

function mergeFlowTableMergeMapEntries(entries: FlowTableCellMergeMapEntry[]): FlowTableCellMergeMap | undefined {
  const entriesBySlot = new Map<string, FlowTableCellMergeMapEntry>()
  entries.forEach((entry) => {
    if (entry.childIds.length === 0) return
    const key = slotKey(entry.rowOffset, entry.colOffset)
    const existing = entriesBySlot.get(key)
    if (existing) {
      existing.childIds.push(...entry.childIds)
    } else {
      entriesBySlot.set(key, { rowOffset: entry.rowOffset, colOffset: entry.colOffset, childIds: [...entry.childIds] })
    }
  })
  const merged = [...entriesBySlot.values()]
    .sort((a, b) => a.rowOffset - b.rowOffset || a.colOffset - b.colOffset)
  return merged.length > 0 ? { version: 1, entries: merged } : undefined
}

function buildFlowTableCellMergeMapForSpanUpdate(
  table: FlowTableNode,
  plan: FlowTableCellSpanUpdatePlan,
  keptOriginChildIds: string[],
  consumedChildIdsByCellId: Map<string, string[]>,
): FlowTableCellMergeMap | undefined {
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return undefined
  const entries: FlowTableCellMergeMapEntry[] = []
  const mappedChildIds = new Set<string>()

  const addCellEntries = (sourceCellId: string, keptChildIds: string[]) => {
    if (keptChildIds.length === 0) return
    const sourceCell = table.nodes[sourceCellId]
    if (sourceCell?.type !== "flow-table-cell") return
    const placement = resolved.grid.placementsByCellId.get(sourceCellId)
    if (placement == null) return

    const kept = new Set(keptChildIds)
    const baseRowOffset = placement.rowIndex - plan.rowIndex
    const baseColOffset = placement.columnIndex - plan.columnIndex

    sourceCell.props.mergeMap?.entries.forEach((entry) => {
      const childIds = entry.childIds.filter((childId) => kept.has(childId) && !mappedChildIds.has(childId))
      if (childIds.length === 0) return
      childIds.forEach((childId) => { mappedChildIds.add(childId) })
      entries.push({
        rowOffset: baseRowOffset + entry.rowOffset,
        colOffset: baseColOffset + entry.colOffset,
        childIds,
      })
    })

    const unmappedChildIds = keptChildIds.filter((childId) => !mappedChildIds.has(childId))
    if (unmappedChildIds.length > 0) {
      unmappedChildIds.forEach((childId) => { mappedChildIds.add(childId) })
      entries.push({
        rowOffset: baseRowOffset,
        colOffset: baseColOffset,
        childIds: unmappedChildIds,
      })
    }
  }

  addCellEntries(plan.cellId, keptOriginChildIds)
  plan.consumeCellIds.forEach((consumeCellId) => {
    addCellEntries(consumeCellId, consumedChildIdsByCellId.get(consumeCellId) ?? [])
  })

  const keptChildIds = new Set([
    ...keptOriginChildIds,
    ...[...consumedChildIdsByCellId.values()].flat(),
  ])
  const boundedEntries = entries
    .filter((entry) => entry.rowOffset >= 0 && entry.rowOffset < plan.rowspan && entry.colOffset >= 0 && entry.colOffset < plan.colspan)
    .map((entry) => ({ ...entry, childIds: entry.childIds.filter((childId) => keptChildIds.has(childId)) }))
    .filter((entry) => entry.childIds.length > 0)

  return mergeFlowTableMergeMapEntries(boundedEntries)
}

interface FlowTableCellSpanShrinkContentPlan {
  originChildIds: string[]
  childIdsBySlot: Map<string, string[]>
}

function splitFlowTableCellChildrenForSpanShrink(
  cell: FlowTableCellNode,
  plan: FlowTableCellSpanUpdatePlan,
): FlowTableCellSpanShrinkContentPlan | null {
  const mergeMap = cell.props.mergeMap
  if (mergeMap == null || plan.createSlots.length === 0) return null

  const cellChildIds = new Set(cell.childIds)
  const mappedChildIds = new Set<string>()
  const originSlotKeys = new Set<string>()
  const createSlotKeys = new Set(
    plan.createSlots.map((slot) => slotKey(slot.rowIndex - plan.rowIndex, slot.columnIndex - plan.columnIndex)),
  )
  const originChildIds: string[] = []
  const childIdsBySlot = new Map<string, string[]>()

  for (let rowOffset = 0; rowOffset < plan.rowspan; rowOffset++) {
    for (let colOffset = 0; colOffset < plan.colspan; colOffset++) {
      originSlotKeys.add(slotKey(rowOffset, colOffset))
    }
  }

  mergeMap.entries.forEach((entry) => {
    const childIds = entry.childIds.filter((childId) => cellChildIds.has(childId) && !mappedChildIds.has(childId))
    if (childIds.length === 0) return
    childIds.forEach((childId) => { mappedChildIds.add(childId) })

    const key = slotKey(entry.rowOffset, entry.colOffset)
    if (originSlotKeys.has(key)) {
      originChildIds.push(...childIds)
      return
    }

    if (createSlotKeys.has(key)) {
      childIdsBySlot.set(key, [...(childIdsBySlot.get(key) ?? []), ...childIds])
      return
    }

    originChildIds.push(...childIds)
  })

  originChildIds.push(...cell.childIds.filter((childId) => !mappedChildIds.has(childId)))

  return { originChildIds, childIdsBySlot }
}

function resolveRequestedFlowTableSpan(value: number | undefined, current: number): number | null {
  if (value == null) return current
  if (!Number.isInteger(value) || value < 1) return null
  return value
}

function isEmptyFlowTableCellChild(table: FlowTableNode, childId: string): boolean {
  const child = table.nodes[childId]
  return child?.type === "paragraph" && isPlainTextParagraph(child) && getPlainText(child).trim().length === 0
}

function deleteFlowTableCellSubtree(nodes: FlowTableNode["nodes"], cellId: string): void {
  const cell = nodes[cellId]
  if (cell?.type !== "flow-table-cell") return
  cell.childIds.forEach((childId) => { delete nodes[childId] })
  delete nodes[cellId]
}

function createFlowTableCellWithChildren(internalNodes: FlowTableNode["nodes"], childIds: string[]): string {
  const cell = createFlowTableCellNode(childIds)
  internalNodes[cell.id] = cell
  return cell.id
}

function getFlowTableCellSpanUpdatePlan(
  table: FlowTableNode,
  cellId: string,
  changes: FlowTableCellSpanChanges,
): FlowTableCellSpanUpdatePlan | null {
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return null
  const placement = resolved.grid.placementsByCellId.get(cellId)
  if (placement == null) return null

  const colspan = resolveRequestedFlowTableSpan(changes.colspan, placement.colspan)
  const rowspan = resolveRequestedFlowTableSpan(changes.rowspan, placement.rowspan)
  if (colspan == null || rowspan == null) return null
  if (colspan === placement.colspan && rowspan === placement.rowspan) return null
  if (placement.columnIndex + colspan > resolved.grid.columnCount) return null
  if (placement.rowIndex + rowspan > resolved.grid.rowCount) return null

  const newSlotKeys = new Set<string>()
  const createSlots: Array<{ rowIndex: number; columnIndex: number }> = []
  const consumeCellIds = new Set<string>()
  const consumePlacements: Array<{ cellId: string; rowIndex: number; columnIndex: number }> = []

  for (let rowIndex = placement.rowIndex; rowIndex < placement.rowIndex + rowspan; rowIndex++) {
    for (let columnIndex = placement.columnIndex; columnIndex < placement.columnIndex + colspan; columnIndex++) {
      newSlotKeys.add(slotKey(rowIndex, columnIndex))
    }
  }

  for (let rowIndex = placement.rowIndex; rowIndex < placement.rowIndex + rowspan; rowIndex++) {
    for (let columnIndex = placement.columnIndex; columnIndex < placement.columnIndex + colspan; columnIndex++) {
      const slot = resolved.grid.slotMatrix[rowIndex]?.[columnIndex]
      if (slot == null || slot.cellId === cellId) continue
      const coveredPlacement = resolved.grid.placementsByCellId.get(slot.cellId)
      if (coveredPlacement == null) return null
      const whollyCovered = coveredPlacement.coveredSlots.every((coveredSlot) =>
        newSlotKeys.has(slotKey(coveredSlot.rowIndex, coveredSlot.columnIndex)),
      )
      if (!whollyCovered) return null
      if (!consumeCellIds.has(slot.cellId)) {
        consumeCellIds.add(slot.cellId)
        consumePlacements.push({
          cellId: slot.cellId,
          rowIndex: coveredPlacement.rowIndex,
          columnIndex: coveredPlacement.columnIndex,
        })
      }
    }
  }

  placement.coveredSlots.forEach((coveredSlot) => {
    if (!newSlotKeys.has(slotKey(coveredSlot.rowIndex, coveredSlot.columnIndex))) {
      createSlots.push({ rowIndex: coveredSlot.rowIndex, columnIndex: coveredSlot.columnIndex })
    }
  })

  return {
    cellId,
    rowIndex: placement.rowIndex,
    columnIndex: placement.columnIndex,
    colspan,
    rowspan,
    consumeCellIds: consumePlacements
      .sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex)
      .map((item) => item.cellId),
    createSlots,
  }
}

export function resolveFlowTableCellMergeTarget(
  table: FlowTableNode,
  cellId: string,
  direction: FlowTableCellMergeDirection,
): FlowTableCellMergeTarget | null {
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return null
  const placement = resolved.grid.placementsByCellId.get(cellId)
  if (placement == null) return null

  if (direction === "right") {
    const changes = { colspan: placement.colspan + 1 }
    return getFlowTableCellSpanUpdatePlan(table, cellId, changes) != null ? { cellId, changes } : null
  }

  if (direction === "down") {
    const changes = { rowspan: placement.rowspan + 1 }
    return getFlowTableCellSpanUpdatePlan(table, cellId, changes) != null ? { cellId, changes } : null
  }

  if (direction === "left") {
    if (placement.columnIndex === 0) return null
    const neighborColumn = placement.columnIndex - 1
    let targetCellId: string | null = null
    for (let rowIndex = placement.rowIndex; rowIndex <= placement.rowEndIndex; rowIndex++) {
      const slot = resolved.grid.slotMatrix[rowIndex]?.[neighborColumn]
      if (slot == null) return null
      if (targetCellId == null) targetCellId = slot.cellId
      else if (targetCellId !== slot.cellId) return null
    }
    if (targetCellId == null || targetCellId === cellId) return null
    const target = resolved.grid.placementsByCellId.get(targetCellId)
    if (target == null) return null
    const aligned =
      target.rowIndex === placement.rowIndex &&
      target.rowEndIndex === placement.rowEndIndex &&
      target.columnEndIndex === placement.columnIndex - 1
    if (!aligned) return null
    const changes = { colspan: target.colspan + placement.colspan }
    return getFlowTableCellSpanUpdatePlan(table, target.cellId, changes) != null
      ? { cellId: target.cellId, changes }
      : null
  }

  if (placement.rowIndex === 0) return null
  const neighborRow = placement.rowIndex - 1
  let targetCellId: string | null = null
  for (let columnIndex = placement.columnIndex; columnIndex <= placement.columnEndIndex; columnIndex++) {
    const slot = resolved.grid.slotMatrix[neighborRow]?.[columnIndex]
    if (slot == null) return null
    if (targetCellId == null) targetCellId = slot.cellId
    else if (targetCellId !== slot.cellId) return null
  }
  if (targetCellId == null || targetCellId === cellId) return null
  const target = resolved.grid.placementsByCellId.get(targetCellId)
  if (target == null) return null
  const aligned =
    target.columnIndex === placement.columnIndex &&
    target.columnEndIndex === placement.columnEndIndex &&
    target.rowEndIndex === placement.rowIndex - 1
  if (!aligned) return null
  const changes = { rowspan: target.rowspan + placement.rowspan }
  return getFlowTableCellSpanUpdatePlan(table, target.cellId, changes) != null
    ? { cellId: target.cellId, changes }
    : null
}

function getFlowTableRowRemovalPlan(table: FlowTableNode, rowIndex: number): FlowTableRowRemovalPlan | null {
  if (table.rowIds.length <= 1) return null
  const rowId = table.rowIds[rowIndex]
  if (!rowId) return null
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return null

  const deleteCellIds: string[] = []
  const shrinkRowspanCellIds: string[] = []

  for (const placement of resolved.grid.placements) {
    if (placement.rowIndex === rowIndex) {
      if (placement.rowspan > 1) return null
      deleteCellIds.push(placement.cellId)
      continue
    }
    if (placement.rowIndex < rowIndex && rowIndex <= placement.rowEndIndex) {
      shrinkRowspanCellIds.push(placement.cellId)
    }
  }

  return { rowId, deleteCellIds, shrinkRowspanCellIds }
}

function getFlowTableColumnRemovalPlan(table: FlowTableNode, colIndex: number): FlowTableColumnRemovalPlan | null {
  if (table.columns.length <= 1) return null
  if (colIndex < 0 || colIndex >= table.columns.length) return null
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return null

  const deleteCellIds: string[] = []
  const shrinkColspanCellIds: string[] = []

  for (const placement of resolved.grid.placements) {
    if (placement.columnIndex === colIndex) {
      if (placement.colspan > 1) return null
      deleteCellIds.push(placement.cellId)
      continue
    }
    if (placement.columnIndex < colIndex && colIndex <= placement.columnEndIndex) {
      shrinkColspanCellIds.push(placement.cellId)
    }
  }

  return { deleteCellIds, shrinkColspanCellIds }
}

export function canRemoveFlowTableRow(table: FlowTableNode, rowIndex: number): boolean {
  return getFlowTableRowRemovalPlan(table, rowIndex) != null
}

export function canRemoveFlowTableColumn(table: FlowTableNode, colIndex: number): boolean {
  return getFlowTableColumnRemovalPlan(table, colIndex) != null
}

export function canUpdateFlowTableCellSpan(
  table: FlowTableNode,
  cellId: string,
  changes: FlowTableCellSpanChanges,
): boolean {
  return getFlowTableCellSpanUpdatePlan(table, cellId, changes) != null
}

function insertInlineField(
  doc: DocumentNode,
  paragraphId: string,
  index: number,
  field: { key: string; label?: string; fallback?: string },
): DocumentNode {
  const fieldRef = createFieldRefInline(field.key, field.label, field.fallback)
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[paragraphId]
    if (node?.type === "paragraph") {
      const insertAt = Math.min(Math.max(0, index), node.children.length)
      const updated: LayoutNode = {
        ...node,
        children: [...node.children.slice(0, insertAt), fieldRef, ...node.children.slice(insertAt)],
      }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [paragraphId]: updated } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
    for (const [tableId, candidate] of Object.entries(section.nodes)) {
      if (candidate.type !== "table" && candidate.type !== "flow-table") continue
      const table = candidate as unknown as TableNode | FlowTableNode
      const inner = table.nodes[paragraphId]
      if (inner?.type !== "paragraph") continue
      const insertAt = Math.min(Math.max(0, index), inner.children.length)
      const updated = {
        ...inner,
        children: [...inner.children.slice(0, insertAt), fieldRef, ...inner.children.slice(insertAt)],
      }
      const newTable = { ...table, nodes: { ...table.nodes, [paragraphId]: updated } }
      const newNodes = { ...section.nodes, [tableId]: newTable as unknown as LayoutNode }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: newNodes } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
  }
  return doc
}

// ─── Document Mutations ───────────────────────────────────────────────────────

export function updateNodeProps(
  doc: DocumentNode,
  nodeId: string,
  propChanges: Record<string, unknown>,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = { ...node, props: { ...(node as any).props, ...propChanges } } as LayoutNode
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
    // search inside tables
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "table" && n.type !== "flow-table") continue
      const table = n as unknown as TableNode | FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner == null) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = { ...inner, props: { ...(inner as any).props, ...propChanges } }
      const newTable = { ...table, nodes: { ...table.nodes, [nodeId]: updated } }
      const newNodes = { ...section.nodes, [tableId]: newTable as unknown as LayoutNode }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: newNodes } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
  }
  return doc
}

const PARAGRAPH_BOX_EDGES: ParagraphBoxEdge[] = ["top", "right", "bottom", "left"]
const ZERO_PT: UnitValue = { value: 0, unit: "pt" }

function hasOwn<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function isHexColor(value: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(value)
}

function nonNegativeUnitValue(value: UnitValue): UnitValue {
  return { value: Math.max(0, value.value), unit: value.unit }
}

function zeroParagraphPadding(): ParagraphBoxPadding {
  return {
    top: { ...ZERO_PT },
    right: { ...ZERO_PT },
    bottom: { ...ZERO_PT },
    left: { ...ZERO_PT },
  }
}

function isZeroUnitValue(value: UnitValue): boolean {
  return value.value === 0
}

function normalizeBoxBorderSide(side: ParagraphBoxBorderSide): ParagraphBoxBorderSide | undefined {
  if (side.style === "none") return undefined
  const width = nonNegativeUnitValue(side.width)
  if (width.value === 0) return undefined
  if (!isHexColor(side.color)) return undefined
  return { ...side, width }
}

function isEmptyParagraphBox(box: ParagraphBoxStyle): boolean {
  return box.fill == null && box.padding == null && box.border == null
}

function pruneParagraphBox(box: ParagraphBoxStyle): ParagraphBoxStyle | undefined {
  const next: ParagraphBoxStyle = {}
  if (box.fill && isHexColor(box.fill)) next.fill = box.fill
  if (box.padding && PARAGRAPH_BOX_EDGES.some((edge) => !isZeroUnitValue(box.padding![edge]))) {
    next.padding = box.padding
  }
  if (box.border && Object.keys(box.border).length > 0) {
    next.border = box.border
  }
  return isEmptyParagraphBox(next) ? undefined : next
}

type BoxStyleNode = ParagraphNode | FlowStackNode

function applyBoxStyleChanges<T extends BoxStyleNode>(node: T, changes: ParagraphBoxStyleChanges): T {
  const current = node.props.box ?? {}
  const next: ParagraphBoxStyle = {
    ...current,
    padding: current.padding ? { ...current.padding } : undefined,
    border: current.border ? { ...current.border } : undefined,
  }

  if (hasOwn(changes, "fill")) {
    if (changes.fill == null || changes.fill === "") delete next.fill
    else if (isHexColor(changes.fill)) next.fill = changes.fill
  }

  if (hasOwn(changes, "padding")) {
    if (changes.padding == null) {
      delete next.padding
    } else {
      const padding = next.padding ? { ...next.padding } : zeroParagraphPadding()
      PARAGRAPH_BOX_EDGES.forEach((edge) => {
        const value = changes.padding?.[edge]
        if (value != null) padding[edge] = nonNegativeUnitValue(value)
      })
      next.padding = padding
    }
  }

  if (hasOwn(changes, "border")) {
    if (changes.border == null) {
      delete next.border
    } else {
      const border: ParagraphBoxBorder = next.border ? { ...next.border } : {}
      PARAGRAPH_BOX_EDGES.forEach((edge) => {
        if (!hasOwn(changes.border!, edge)) return
        const side = changes.border?.[edge]
        if (side == null) {
          delete border[edge]
          return
        }
        const normalized = normalizeBoxBorderSide(side)
        if (normalized) border[edge] = normalized
        else delete border[edge]
      })
      next.border = Object.keys(border).length > 0 ? border : undefined
    }
  }

  const box = pruneParagraphBox(next)
  return { ...node, props: { ...node.props, box } }
}

export function updateParagraphBoxStyle(
  doc: DocumentNode,
  paragraphId: string,
  changes: ParagraphBoxStyleChanges,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[paragraphId]
    if (node?.type === "paragraph") {
      const updated: LayoutNode = applyBoxStyleChanges(node, changes)
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [paragraphId]: updated } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "table" && n.type !== "flow-table") continue
      const table = n as unknown as TableNode | FlowTableNode
      const inner = table.nodes[paragraphId]
      if (inner?.type !== "paragraph") continue
      const updated = applyBoxStyleChanges(inner, changes)
      const newTable = { ...table, nodes: { ...table.nodes, [paragraphId]: updated } }
      const newNodes = { ...section.nodes, [tableId]: newTable as unknown as LayoutNode }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: newNodes } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
  }
  return doc
}

export function updateFlowStackBoxStyle(
  doc: DocumentNode,
  stackId: string,
  changes: ParagraphBoxStyleChanges,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[stackId]
    if (node?.type !== "flow-stack") continue
    const updated: LayoutNode = applyBoxStyleChanges(node, changes)
    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: { ...s.nodes, [stackId]: updated } } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
}

export function addFlowStackColumn(
  doc: DocumentNode,
  rowId: string,
  stackId?: string,
  position: "before" | "after" = "after",
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const row = section.nodes[rowId]
    if (row?.type !== "flow-row") continue

    let nodes: Nodes = { ...section.nodes }
    const childIds = [...row.childIds]
    if (stackId == null) {
      const newStack = createFlowStackNode([], { widthShare: 100, minHeight: DEFAULT_STACK_MIN_HEIGHT })
      const nextChildIds = [...childIds, newStack.id]
      const shares = getEqualWidthShares(nextChildIds.length)
      const balancedNodes = nextChildIds.reduce<Nodes>((acc, childId, index) => {
        const child = childId === newStack.id ? newStack : acc[childId]
        if (child?.type !== "flow-stack") return acc
        return {
          ...acc,
          [childId]: {
            ...child,
            props: { ...child.props, widthShare: shares[index] },
          } as LayoutNode,
        }
      }, { ...nodes, [newStack.id]: newStack })

      const newSections = doc.document.sections.map((s, i) =>
        i === si
          ? {
              ...s,
              nodes: {
                ...balancedNodes,
                [row.id]: { ...row, childIds: nextChildIds } as LayoutNode,
              },
            }
          : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    const targetIndex = stackId != null
      ? childIds.indexOf(stackId)
      : childIds.length - 1
    const targetStackId = targetIndex >= 0 ? childIds[targetIndex] : null
    const targetStack = targetStackId ? nodes[targetStackId] : null
    const insertAt = targetIndex >= 0
      ? (position === "before" ? targetIndex : targetIndex + 1)
      : childIds.length
    const newStack = createFlowStackNode([], { widthShare: 100, minHeight: DEFAULT_STACK_MIN_HEIGHT })

    if (targetStack?.type === "flow-stack") {
      const { original, inserted } = splitWidthPercent(targetStack.props.widthShare ?? 100)
      nodes = {
        ...nodes,
        [targetStack.id]: {
          ...targetStack,
          props: { ...targetStack.props, widthShare: original },
        } as LayoutNode,
        [newStack.id]: {
          ...newStack,
          props: { ...newStack.props, widthShare: inserted },
        } as LayoutNode,
      }
    } else {
      nodes = { ...nodes, [newStack.id]: newStack }
    }

    const nextChildIds = [...childIds]
    nextChildIds.splice(insertAt, 0, newStack.id)
    nodes = {
      ...nodes,
      [row.id]: { ...row, childIds: nextChildIds } as LayoutNode,
    }

    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
}

export function updateParagraphText(
  doc: DocumentNode,
  nodeId: string,
  text: string,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      if (!isPlainTextParagraph(node)) continue
      const updated: LayoutNode = replaceWithSingleTextRun(node, text)
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
    // search inside tables
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "table" && n.type !== "flow-table") continue
      const table = n as unknown as TableNode | FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      if (!isPlainTextParagraph(inner)) continue
      const updated = replaceWithSingleTextRun(inner, text)
      const newTable = { ...table, nodes: { ...table.nodes, [nodeId]: updated } }
      const newNodes = { ...section.nodes, [tableId]: newTable as unknown as LayoutNode }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: newNodes } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
  }
  return doc
}

export function updateFieldRefInline(
  doc: DocumentNode,
  fieldRefId: string,
  changes: FieldRefInlineChanges,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    for (const [nodeId, node] of Object.entries(section.nodes)) {
      if (node.type === "paragraph") {
        const updated = updateFieldRefInParagraph(node, fieldRefId, changes)
        if (!updated) continue
        const newSections = doc.document.sections.map((s, i) =>
          i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated } } : s,
        )
        return { ...doc, document: { ...doc.document, sections: newSections } }
      }

      if (node.type !== "table" && node.type !== "flow-table") continue
      const table = node as unknown as TableNode | FlowTableNode
      for (const [innerId, inner] of Object.entries(table.nodes)) {
        if (inner.type !== "paragraph") continue
        const updated = updateFieldRefInParagraph(inner, fieldRefId, changes)
        if (!updated) continue
        const newTable = { ...table, nodes: { ...table.nodes, [innerId]: updated } }
        const newNodes = { ...section.nodes, [nodeId]: newTable as unknown as LayoutNode }
        const newSections = doc.document.sections.map((s, i) =>
          i === si ? { ...s, nodes: newNodes } : s,
        )
        return { ...doc, document: { ...doc.document, sections: newSections } }
      }
    }
  }
  return doc
}

// ─── Paragraph Split ─────────────────────────────────────────────────────────

export function splitParagraphAtIndex(
  doc: DocumentNode,
  nodeId: string,
  splitIndex: number,
): { doc: DocumentNode; newNodeId: string } {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type !== "paragraph") continue
    if (!isPlainTextParagraph(node)) continue

    const firstRun = node.children[0]
    if (!firstRun || firstRun.type !== "text") continue
    const fullText = getPlainText(node)

    const textBefore = fullText.slice(0, splitIndex)
    const textAfter = fullText.slice(splitIndex)

    const updatedNode: LayoutNode = {
      ...node,
      children: [{ ...firstRun, text: textBefore }],
    }
    const newPara = createParagraphNode(textAfter, node.props)

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (!parentInfo) continue

    let newNodes: Nodes = {
      ...section.nodes,
      [nodeId]: updatedNode,
      [newPara.id]: newPara as unknown as LayoutNode,
    }
    const childIds = getChildIds(newNodes, parentInfo.parentId)
    newNodes = setChildIds(newNodes, parentInfo.parentId, [
      ...childIds.slice(0, parentInfo.index + 1),
      newPara.id,
      ...childIds.slice(parentInfo.index + 1),
    ])

    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: newNodes } : s,
    )
    return {
      doc: { ...doc, document: { ...doc.document, sections: newSections } },
      newNodeId: newPara.id,
    }
  }
  return { doc, newNodeId: "" }
}

export function mergeParagraphWithPrevious(
  doc: DocumentNode,
  nodeId: string,
): { doc: DocumentNode; prevNodeId: string; caretIndex: number } | null {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type !== "paragraph") continue
    if (!isPlainTextParagraph(node)) continue

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (!parentInfo || parentInfo.index === 0) return null

    const childIds = getChildIds(section.nodes, parentInfo.parentId)
    const prevId = childIds[parentInfo.index - 1]
    if (!prevId) return null

    const prevNode = section.nodes[prevId]
    if (prevNode?.type !== "paragraph") return null
    if (!isPlainTextParagraph(prevNode)) return null

    const prevFirstRun = prevNode.children[0]
    const curFirstRun = node.children[0]
    if (!prevFirstRun || prevFirstRun.type !== "text") return null
    if (!curFirstRun || curFirstRun.type !== "text") return null

    const prevText = getPlainText(prevNode)
    const curText = getPlainText(node)
    const caretIndex = prevText.length
    const mergedText = prevText + curText
    const updatedPrev: LayoutNode = {
      ...prevNode,
      children: [{ ...prevFirstRun, text: mergedText }],
    }
    const newChildIds = childIds.filter((id) => id !== nodeId)
    let newNodes: Nodes = { ...section.nodes, [prevId]: updatedPrev }
    delete newNodes[nodeId]
    newNodes = setChildIds(newNodes, parentInfo.parentId, newChildIds)

    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: newNodes } : s,
    )
    return {
      doc: { ...doc, document: { ...doc.document, sections: newSections } },
      prevNodeId: prevId,
      caretIndex,
    }
  }
  return null
}

// ─── Table Structural Mutations ───────────────────────────────────────────────

export function addTableRow(doc: DocumentNode, tableId: string, afterIndex?: number): DocumentNode {
  return updateTableInSection(doc, tableId, (table) => {
    const colCount = table.columns.length
    const internalNodes = { ...table.nodes }
    const cellIds: string[] = []
    for (let c = 0; c < colCount; c++) {
      const para = createParagraphNode("", { spacingBefore: pt(2), spacingAfter: pt(2) })
      const cell = createTableCellNode([para.id])
      internalNodes[para.id] = para
      internalNodes[cell.id] = cell
      cellIds.push(cell.id)
    }
    const row = createTableRowNode(cellIds)
    internalNodes[row.id] = row
    const newRowIds = [...table.rowIds]
    if (afterIndex !== undefined) newRowIds.splice(afterIndex + 1, 0, row.id)
    else newRowIds.push(row.id)
    return { ...table, rowIds: newRowIds, nodes: internalNodes }
  })
}

export function removeTableRow(doc: DocumentNode, tableId: string, rowIndex: number): DocumentNode {
  return updateTableInSection(doc, tableId, (table) => {
    if (table.rowIds.length <= 1) return table
    const rowId = table.rowIds[rowIndex]
    if (!rowId) return table
    const internalNodes = { ...table.nodes }
    const row = internalNodes[rowId] as TableRowNode | undefined
    if (row) {
      row.cellIds.forEach((cellId) => {
        const cell = internalNodes[cellId] as TableCellNode | undefined
        if (cell) {
          cell.childIds.forEach((id) => { delete internalNodes[id] })
          delete internalNodes[cellId]
        }
      })
      delete internalNodes[rowId]
    }
    const rowIds = table.rowIds.filter((_, i) => i !== rowIndex)
    const headerRowCount = table.props.headerRowCount
    const props = headerRowCount != null && headerRowCount > rowIds.length
      ? { ...table.props, headerRowCount: rowIds.length }
      : table.props
    return { ...table, props, rowIds, nodes: internalNodes }
  })
}

export function addTableColumn(doc: DocumentNode, tableId: string, afterColIndex?: number): DocumentNode {
  return updateTableInSection(doc, tableId, (table) => {
    const insertAt = afterColIndex != null
      ? Math.min(Math.max(0, afterColIndex + 1), table.columns.length)
      : table.columns.length
    const splitIndex = afterColIndex != null
      ? Math.min(Math.max(0, afterColIndex), table.columns.length - 1)
      : table.columns.length - 1
    const splitWidth = Math.max(24, unitWidthToPt(table.columns[splitIndex]?.width) || 150)
    const insertedWidth = Math.max(24, splitWidth / 2)
    const remainingWidth = Math.max(24, splitWidth - insertedWidth)

    const newColumns = table.columns.map((column, index) =>
      index === splitIndex ? { ...column, width: pt(remainingWidth) } : column,
    )
    newColumns.splice(insertAt, 0, { width: pt(insertedWidth) })

    const internalNodes = { ...table.nodes }

    table.rowIds.forEach((rowId) => {
      const row = internalNodes[rowId] as TableRowNode | undefined
      if (!row) return

      // หา position ใน cellIds ที่ตรงกับ column insertAt โดยนับ colspan
      let colCursor = 0
      let cellInsertIdx = row.cellIds.length
      for (let i = 0; i < row.cellIds.length; i++) {
        if (colCursor >= insertAt) { cellInsertIdx = i; break }
        const cellNode = internalNodes[row.cellIds[i]] as TableCellNode | undefined
        colCursor += cellNode?.props.colspan ?? 1
      }

      const para = createParagraphNode("", { spacingBefore: pt(2), spacingAfter: pt(2) })
      const cell = createTableCellNode([para.id])
      internalNodes[para.id] = para
      internalNodes[cell.id] = cell
      internalNodes[rowId] = {
        ...row,
        cellIds: [...row.cellIds.slice(0, cellInsertIdx), cell.id, ...row.cellIds.slice(cellInsertIdx)],
      }
    })

    return { ...table, columns: newColumns, nodes: internalNodes }
  })
}

export function removeTableColumn(doc: DocumentNode, tableId: string, colIndex: number): DocumentNode {
  return updateTableInSection(doc, tableId, (table) => {
    if (table.columns.length <= 1) return table
    const internalNodes = { ...table.nodes }
    const removedWidth = unitWidthToPt(table.columns[colIndex]?.width)

    table.rowIds.forEach((rowId) => {
      const row = internalNodes[rowId] as TableRowNode | undefined
      if (!row) return

      // ติดตาม column position ด้วย colspan เพื่อหา cell ที่ถูกต้อง
      let colCursor = 0
      let removeCellId: string | null = null

      for (const cellId of row.cellIds) {
        const cellNode = internalNodes[cellId] as TableCellNode | undefined
        if (!cellNode) { colCursor++; continue }
        const colspan = cellNode.props.colspan ?? 1
        if (colCursor <= colIndex && colIndex < colCursor + colspan) {
          if (colspan > 1) {
            // ลด colspan แทนการลบ — cell ยังคงอยู่แต่แคบลง
            internalNodes[cellId] = { ...cellNode, props: { ...cellNode.props, colspan: colspan - 1 } }
          } else {
            removeCellId = cellId
          }
          break
        }
        colCursor += colspan
      }

      if (removeCellId != null) {
        const cell = internalNodes[removeCellId] as TableCellNode | undefined
        if (cell) {
          cell.childIds.forEach((id) => { delete internalNodes[id] })
          delete internalNodes[removeCellId]
        }
        internalNodes[rowId] = { ...row, cellIds: row.cellIds.filter((id) => id !== removeCellId) }
      }
    })

    const columns = table.columns.filter((_, i) => i !== colIndex)
    if (columns.length > 0 && removedWidth > 0) {
      const absorbIndex = Math.min(Math.max(0, colIndex - 1), columns.length - 1)
      const absorbWidth = unitWidthToPt(columns[absorbIndex]?.width)
      columns[absorbIndex] = { ...columns[absorbIndex], width: pt(absorbWidth + removedWidth) }
    }

    return { ...table, columns, nodes: internalNodes }
  })
}

export function addFlowTableRow(doc: DocumentNode, tableId: string, afterIndex?: number): DocumentNode {
  return updateFlowTableInSection(doc, tableId, (table) => {
    const resolved = tryResolveFlowTableGrid(table)
    if (!resolved.ok) return table
    const insertAt = afterIndex !== undefined
      ? Math.min(Math.max(0, afterIndex + 1), table.rowIds.length)
      : table.rowIds.length
    const internalNodes = { ...table.nodes }
    const coveredColumns = new Set<number>()

    resolved.grid.placements.forEach((placement) => {
      if (!(placement.rowIndex < insertAt && insertAt <= placement.rowEndIndex)) return
      const cell = internalNodes[placement.cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      internalNodes[placement.cellId] = {
        ...cell,
        props: { ...cell.props, rowspan: placement.rowspan + 1 },
      }
      for (let columnIndex = placement.columnIndex; columnIndex <= placement.columnEndIndex; columnIndex++) {
        coveredColumns.add(columnIndex)
      }
    })

    const cellIds: string[] = []

    for (let c = 0; c < table.columns.length; c++) {
      if (coveredColumns.has(c)) continue
      cellIds.push(createEmptyFlowTableCell(internalNodes))
    }

    const row = createFlowTableRowNode(cellIds)
    internalNodes[row.id] = row
    const rowIds = [...table.rowIds]
    rowIds.splice(insertAt, 0, row.id)
    return { ...table, rowIds, nodes: internalNodes }
  })
}

export function removeFlowTableRow(doc: DocumentNode, tableId: string, rowIndex: number): DocumentNode {
  return updateFlowTableInSection(doc, tableId, (table) => {
    const plan = getFlowTableRowRemovalPlan(table, rowIndex)
    if (plan == null) return table

    const internalNodes = { ...table.nodes }

    plan.shrinkRowspanCellIds.forEach((cellId) => {
      const cell = internalNodes[cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      const rowspan = cell.props.rowspan ?? 1
      internalNodes[cellId] = { ...cell, props: { ...cell.props, rowspan: Math.max(1, rowspan - 1) } }
    })

    const row = internalNodes[plan.rowId] as FlowTableRowNode | undefined
    if (row?.type === "flow-table-row") {
      plan.deleteCellIds.forEach((cellId) => {
        const cell = internalNodes[cellId] as FlowTableCellNode | undefined
        if (cell?.type !== "flow-table-cell") return
        cell.childIds.forEach((id) => { delete internalNodes[id] })
        delete internalNodes[cellId]
      })
      delete internalNodes[plan.rowId]
    }

    const rowIds = table.rowIds.filter((_, i) => i !== rowIndex)
    const headerRowCount = table.props.headerRowCount
    const props = headerRowCount != null && headerRowCount > rowIds.length
      ? { ...table.props, headerRowCount: rowIds.length }
      : table.props
    return { ...table, props, rowIds, nodes: internalNodes }
  })
}

export function addFlowTableColumn(doc: DocumentNode, tableId: string, afterColIndex?: number): DocumentNode {
  return updateFlowTableInSection(doc, tableId, (table) => {
    const resolved = tryResolveFlowTableGrid(table)
    if (!resolved.ok) return table
    const insertAt = afterColIndex != null
      ? Math.min(Math.max(0, afterColIndex + 1), table.columns.length)
      : table.columns.length
    const splitIndex = afterColIndex != null
      ? Math.min(Math.max(0, afterColIndex), table.columns.length - 1)
      : table.columns.length - 1
    const splitWidth = Math.max(24, unitWidthToPt(table.columns[splitIndex]?.width) || 150)
    const insertedWidth = Math.max(24, splitWidth / 2)
    const remainingWidth = Math.max(24, splitWidth - insertedWidth)

    const columns = table.columns.map((column, index) =>
      index === splitIndex ? { ...column, width: pt(remainingWidth) } : column,
    )
    columns.splice(insertAt, 0, { width: pt(insertedWidth) })

    const internalNodes = { ...table.nodes }
    const coveredRows = new Set<number>()

    resolved.grid.placements.forEach((placement) => {
      if (!(placement.columnIndex < insertAt && insertAt <= placement.columnEndIndex)) return
      const cell = internalNodes[placement.cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      internalNodes[placement.cellId] = {
        ...cell,
        props: { ...cell.props, colspan: placement.colspan + 1 },
      }
      for (let rowIndex = placement.rowIndex; rowIndex <= placement.rowEndIndex; rowIndex++) {
        coveredRows.add(rowIndex)
      }
    })

    table.rowIds.forEach((rowId, rowIndex) => {
      if (coveredRows.has(rowIndex)) return
      const row = internalNodes[rowId] as FlowTableRowNode | undefined
      if (row?.type !== "flow-table-row") return
      const cellId = createEmptyFlowTableCell(internalNodes)
      const cellInsertIndex = row.cellIds.findIndex((existingCellId) => {
        const placement = resolved.grid.placementsByCellId.get(existingCellId)
        return placement != null && placement.columnIndex >= insertAt
      })
      const insertCellAt = cellInsertIndex === -1 ? row.cellIds.length : cellInsertIndex
      internalNodes[rowId] = {
        ...row,
        cellIds: [...row.cellIds.slice(0, insertCellAt), cellId, ...row.cellIds.slice(insertCellAt)],
      }
    })

    return { ...table, columns, nodes: internalNodes }
  })
}

export function removeFlowTableColumn(doc: DocumentNode, tableId: string, colIndex: number): DocumentNode {
  return updateFlowTableInSection(doc, tableId, (table) => {
    const plan = getFlowTableColumnRemovalPlan(table, colIndex)
    if (plan == null) return table

    const internalNodes = { ...table.nodes }
    const removedWidth = unitWidthToPt(table.columns[colIndex]?.width)
    const deleteCellIds = new Set(plan.deleteCellIds)

    plan.shrinkColspanCellIds.forEach((cellId) => {
      const cell = internalNodes[cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      const colspan = cell.props.colspan ?? 1
      internalNodes[cellId] = { ...cell, props: { ...cell.props, colspan: Math.max(1, colspan - 1) } }
    })

    table.rowIds.forEach((rowId) => {
      const row = internalNodes[rowId] as FlowTableRowNode | undefined
      if (row?.type !== "flow-table-row") return
      row.cellIds.forEach((cellId) => {
        if (!deleteCellIds.has(cellId)) return
        const cell = internalNodes[cellId] as FlowTableCellNode | undefined
        if (cell?.type !== "flow-table-cell") return
        cell.childIds.forEach((id) => { delete internalNodes[id] })
        delete internalNodes[cellId]
      })
      internalNodes[rowId] = {
        ...row,
        cellIds: row.cellIds.filter((cellId) => !deleteCellIds.has(cellId)),
      }
    })

    const columns = table.columns.filter((_, index) => index !== colIndex)
    if (columns.length > 0 && removedWidth > 0) {
      const absorbIndex = Math.min(Math.max(0, colIndex - 1), columns.length - 1)
      const absorbWidth = unitWidthToPt(columns[absorbIndex]?.width)
      columns[absorbIndex] = { ...columns[absorbIndex], width: pt(absorbWidth + removedWidth) }
    }

    return { ...table, columns, nodes: internalNodes }
  })
}

export function updateFlowTableCellSpan(
  doc: DocumentNode,
  cellId: string,
  changes: FlowTableCellSpanChanges,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    for (const [tableId, node] of Object.entries(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      const cell = table.nodes[cellId]
      if (cell?.type !== "flow-table-cell") continue

      const plan = getFlowTableCellSpanUpdatePlan(table, cellId, changes)
      if (plan == null) return doc

      const internalNodes: FlowTableNode["nodes"] = { ...table.nodes }
      const consumed = new Set(plan.consumeCellIds)
      const originColumns = new Map<string, number>()
      const consumedChildIdsByCellId = new Map<string, string[]>()
      const appendChildIds = plan.consumeCellIds.flatMap((consumeCellId) => {
        const consumeCell = table.nodes[consumeCellId]
        if (consumeCell?.type !== "flow-table-cell") return []
        const childIds = consumeCell.childIds.filter((childId) => !isEmptyFlowTableCellChild(table, childId))
        consumedChildIdsByCellId.set(consumeCellId, childIds)
        return childIds
      })

      plan.consumeCellIds.forEach((consumeCellId) => {
        const consumeCell = internalNodes[consumeCellId]
        if (consumeCell?.type !== "flow-table-cell") return
        consumeCell.childIds.forEach((childId) => {
          if (!appendChildIds.includes(childId)) delete internalNodes[childId]
        })
        delete internalNodes[consumeCellId]
      })

      const currentCell = internalNodes[cellId] as FlowTableCellNode | undefined
      if (currentCell?.type !== "flow-table-cell") return doc
      const shrinkContentPlan = splitFlowTableCellChildrenForSpanShrink(currentCell, plan)
      const currentChildIds = shrinkContentPlan?.originChildIds ?? (appendChildIds.length > 0
        ? currentCell.childIds.filter((childId) => !isEmptyFlowTableCellChild(table, childId))
        : currentCell.childIds)
      const nextProps = flowTableCellPropsWithSpan(currentCell.props, plan.colspan, plan.rowspan)
      const shouldWriteMergeMap =
        plan.createSlots.length === 0 &&
        plan.consumeCellIds.length > 0 &&
        (
          appendChildIds.length > 0 ||
          currentCell.props.mergeMap != null ||
          plan.consumeCellIds.some((consumeCellId) => {
            const consumeCell = table.nodes[consumeCellId]
            return consumeCell?.type === "flow-table-cell" && consumeCell.props.mergeMap != null
          })
        )
      const mergeMap = shouldWriteMergeMap
        ? buildFlowTableCellMergeMapForSpanUpdate(table, plan, currentChildIds, consumedChildIdsByCellId)
        : undefined
      if (mergeMap) nextProps.mergeMap = mergeMap
      else delete nextProps.mergeMap
      internalNodes[cellId] = {
        ...currentCell,
        props: nextProps,
        childIds: [...currentChildIds, ...appendChildIds],
      }

      const resolved = tryResolveFlowTableGrid(table)
      if (!resolved.ok) return doc
      resolved.grid.placements.forEach((placement) => {
        if (!consumed.has(placement.cellId)) originColumns.set(placement.cellId, placement.columnIndex)
      })
      originColumns.set(cellId, plan.columnIndex)

      const createdByRow = new Map<number, string[]>()
      plan.createSlots
        .sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex)
        .forEach((slot) => {
          const restoredChildIds = shrinkContentPlan?.childIdsBySlot.get(slotKey(
            slot.rowIndex - plan.rowIndex,
            slot.columnIndex - plan.columnIndex,
          ))
          const newCellId = restoredChildIds != null && restoredChildIds.length > 0
            ? createFlowTableCellWithChildren(internalNodes, restoredChildIds)
            : createEmptyFlowTableCell(internalNodes)
          originColumns.set(newCellId, slot.columnIndex)
          const rowCells = createdByRow.get(slot.rowIndex) ?? []
          rowCells.push(newCellId)
          createdByRow.set(slot.rowIndex, rowCells)
        })

      table.rowIds.forEach((rowId, rowIndex) => {
        const row = internalNodes[rowId] as FlowTableRowNode | undefined
        if (row?.type !== "flow-table-row") return
        const cellIds = [
          ...row.cellIds.filter((rowCellId) => !consumed.has(rowCellId)),
          ...(createdByRow.get(rowIndex) ?? []),
        ].sort((left, right) => (originColumns.get(left) ?? 0) - (originColumns.get(right) ?? 0))
        internalNodes[rowId] = { ...row, cellIds }
      })

      const newTable: FlowTableNode = { ...table, nodes: internalNodes }
      if (!tryResolveFlowTableGrid(newTable).ok) return doc
      const newNodes = { ...section.nodes, [tableId]: newTable as unknown as LayoutNode }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: newNodes } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
  }
  return doc
}

export function updateSectionMargin(
  doc: DocumentNode,
  sectionIndex: number,
  margin: { top: number; right: number; bottom: number; left: number },
): DocumentNode {
  const sections = doc.document.sections.map((s, i) =>
    i !== sectionIndex ? s : {
      ...s,
      page: {
        ...s.page,
        margin: {
          top: pt(margin.top),
          right: pt(margin.right),
          bottom: pt(margin.bottom),
          left: pt(margin.left),
        },
      },
    },
  )
  return { ...doc, document: { ...doc.document, sections } }
}

export function deleteNode(doc: DocumentNode, nodeId: string): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    if (section.nodes[nodeId] == null) continue

    const node = section.nodes[nodeId]
    const toDelete = collectSubtreeIds(section.nodes, nodeId)
    let nodes: Nodes = { ...section.nodes }

    const { nodes: afterRemoval, parentInfo } = removeFromParent(nodes, nodeId)
    if (parentInfo == null) return doc // bodyRoot — ลบไม่ได้
    nodes = afterRemoval

    if (node?.type === "stack") {
      const parent = nodes[parentInfo.parentId]
      if (parent?.type === "row") {
        nodes = parent.childIds.length > 0
          ? transferDeletedStackWidth(nodes, parentInfo.parentId, nodeId, parentInfo.index)
          : cleanupAfterRemoval(nodes, parentInfo.parentId)
      }
    }

    if (node?.type === "flow-stack") {
      const parent = nodes[parentInfo.parentId]
      if (parent?.type === "flow-row") {
        nodes = parent.childIds.length > 0
          ? transferDeletedFlowStackWidth(nodes, parentInfo.parentId, nodeId, parentInfo.index)
          : cleanupAfterRemoval(nodes, parentInfo.parentId)
      }
    }

    nodes = cleanupAfterRemoval(nodes, parentInfo.parentId)

    toDelete.forEach((id) => { delete nodes[id] })

    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function applyPlacementOperation(
  doc: DocumentNode,
  sectionId: string,
  op: PlacementOperation,
  source: DragSource,
): DocumentNode {
  if (op.kind === "insert-inline-field") {
    if (source.source !== "field") return doc
    return insertInlineField(doc, op.paragraphId, op.index, source.field)
  }

  const sectionIndex = doc.document.sections.findIndex((s) => s.id === sectionId)
  if (sectionIndex === -1) return doc

  const section = doc.document.sections[sectionIndex]
  let nodes: Nodes = { ...section.nodes }

  // Phase 1: merge new nodes (palette source)
  const { insertId, newNodes } = op.kind === "insert-stacks-into-row"
    ? { insertId: "", newNodes: {} }
    : createNodesForSource(source)
  if (Object.keys(newNodes).length > 0) {
    nodes = { ...nodes, ...newNodes }
  }

  // Phase 2: remove document source from its current location
  let srcIndexInParent: number | null = null
  if (source.source === "document") {
    const { nodes: afterRemoval, parentInfo } = removeFromParent(nodes, source.nodeId)
    nodes = afterRemoval
    if (parentInfo != null) {
      srcIndexInParent = parentInfo.index
      nodes = cleanupAfterRemoval(nodes, parentInfo.parentId)
    }
  }

  // Phase 3: apply operation
  switch (op.kind) {
    case "insert-before":
    case "insert-after": {
      const srcInThisParent =
        source.source === "document" &&
        findParentInfo({ ...section.nodes }, source.nodeId)?.parentId === op.parentId
          ? srcIndexInParent
          : null
      nodes = doInsertBeforeAfter(nodes, op.parentId, op.index, insertId, srcInThisParent)
      break
    }
    case "insert-into-container": {
      const srcInThisContainer =
        source.source === "document" &&
        findParentInfo({ ...section.nodes }, source.nodeId)?.parentId === op.containerId
          ? srcIndexInParent
          : null
      nodes = doInsertIntoContainer(nodes, op.containerId, op.index, insertId, srcInThisContainer)
      break
    }
    case "expand-row-left":
      nodes = doExpandRow(nodes, op.rowId, op.targetStackId, op.index, insertId)
      break
    case "expand-row-right":
      nodes = doExpandRow(nodes, op.rowId, op.targetStackId, op.index, insertId)
      break
    case "insert-stacks-into-row":
      nodes = doInsertStacksIntoRow(nodes, op.rowId, op.targetStackId, op.index, op.count)
      break
    case "wrap-in-row-left":
      nodes = doWrapInRow(nodes, op.parentId, op.targetNodeId, insertId, true)
      break
    case "wrap-in-row-right":
      nodes = doWrapInRow(nodes, op.parentId, op.targetNodeId, insertId, false)
      break
  }

  const newSection = { ...section, nodes }
  const newSections = doc.document.sections.map((s, i) => (i === sectionIndex ? newSection : s))
  return { ...doc, document: { ...doc.document, sections: newSections } }
}
