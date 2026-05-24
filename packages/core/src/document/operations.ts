import type {
  DocumentNode,
  FieldRefInline,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  FlowStackNode,
  InlineNode,
  LayoutNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphBoxStyle,
  ParagraphNode,
  PageSettings,
  TextRun,
  UnitValue,
} from "../schema"
import { pt } from "../schema"
import { getPageDimensions, getPageMetrics } from "../pagination/metrics"
import type { DragSource, PlacementOperation } from "../placement/types"
import {
  createParagraphNode,
  createRowNode,
  createFlowColumnsSubtree,
  createFlowRowNode,
  createFlowStackNode,
  createStackNode,
  getEqualWidthShares,
  DEFAULT_PARAGRAPH_PROPS,
  DEFAULT_STACK_MIN_HEIGHT,
  createDefaultFlowTable,
  createDefaultFlowTableCellBox,
  createFlowTableCellNode,
  createFlowTableRowNode,
  createFieldRefInline,
  createId,
} from "./defaults"
import { tryResolveFlowTableGrid } from "./flowTableGrid"
import {
  applyTextRunStyleRangeToParagraph,
  deleteTextRunRangeFromParagraph,
  hasTextRunStyle,
  hasTextRunStylePatch,
  isTextRunOnlyParagraph,
  mergeAdjacentTextRuns,
  replaceTextRunParagraphTextInParagraph,
  replaceTextRunRangeInParagraph,
  splitTextRunsAtOffset,
} from "./richText"
import type {
  ParagraphTextStyleChanges,
  ReplaceTextRunRangeOptions,
  TextRunStylePatch,
} from "./richText"

export {
  replaceTextRunParagraphTextInParagraph,
  resolveTextRunParagraphTextReplacement,
} from "./richText"
export type {
  ParagraphTextStyleChanges,
  ReplaceTextRunRangeOptions,
  TextRunParagraphTextReplacement,
  TextRunStylePatch,
} from "./richText"

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

const MIN_TABLE_COLUMN_RESIZE_WIDTH_PT = 24
export const MIN_HEADER_FOOTER_RESERVED_PT = 24
export const MIN_BODY_CONTENT_HEIGHT_RATIO = 0.3
export const MAX_HEADER_FOOTER_RESERVED_RATIO = 1 - MIN_BODY_CONTENT_HEIGHT_RATIO

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
  return node.children.length > 0 && node.children.every((child) => child.type === "text" && !hasTextRunStyle(child))
}

function getPlainText(node: ParagraphNode): string {
  return node.children.map((child) => child.type === "text" ? child.text : "").join("")
}

function replaceWithSingleTextRun(node: ParagraphNode, text: string): ParagraphNode {
  const firstRun = node.children.find((child) => child.type === "text")
  if (!firstRun) return node
  return { ...node, children: [{ ...firstRun, text }] }
}

function paragraphTextLength(node: ParagraphNode): number {
  return node.children.reduce((sum, child) => sum + (child.type === "text" ? child.text.length : 0), 0)
}

function applyParagraphTextStyleProps(
  node: ParagraphNode,
  patch: ParagraphTextStyleChanges,
): ParagraphNode | null {
  if (!hasTextRunStylePatch(patch)) return null
  let changed = false
  const nextProps = clonePlainData(node.props)

  if (Object.prototype.hasOwnProperty.call(patch, "fontSize")) {
    const nextFontSize = patch.fontSize == null ? clonePlainData(DEFAULT_PARAGRAPH_PROPS.fontSize) : clonePlainData(patch.fontSize)
    if (nextProps.fontSize.value !== nextFontSize.value || nextProps.fontSize.unit !== nextFontSize.unit) {
      nextProps.fontSize = nextFontSize
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontFamilyKey")) {
    const nextFontFamilyKey = patch.fontFamilyKey ?? DEFAULT_PARAGRAPH_PROPS.fontFamilyKey
    if (nextProps.fontFamilyKey !== nextFontFamilyKey) {
      nextProps.fontFamilyKey = nextFontFamilyKey
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textColor")) {
    const nextTextColor = patch.textColor ?? DEFAULT_PARAGRAPH_PROPS.textColor
    if (nextProps.textColor !== nextTextColor) {
      nextProps.textColor = nextTextColor
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontWeight")) {
    const nextFontWeight = patch.fontWeight ?? DEFAULT_PARAGRAPH_PROPS.fontWeight
    if (nextProps.fontWeight !== nextFontWeight) {
      nextProps.fontWeight = nextFontWeight
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontStyle")) {
    const nextFontStyle = patch.fontStyle ?? DEFAULT_PARAGRAPH_PROPS.fontStyle
    if (nextProps.fontStyle !== nextFontStyle) {
      nextProps.fontStyle = nextFontStyle
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textDecoration")) {
    const nextTextDecoration = patch.textDecoration ?? DEFAULT_PARAGRAPH_PROPS.textDecoration
    if (nextProps.textDecoration !== nextTextDecoration) {
      nextProps.textDecoration = nextTextDecoration
      changed = true
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "strikethrough")) {
    const nextStrikethrough = patch.strikethrough ?? DEFAULT_PARAGRAPH_PROPS.strikethrough
    if (nextProps.strikethrough !== nextStrikethrough) {
      nextProps.strikethrough = nextStrikethrough
      changed = true
    }
  }

  return changed ? { ...node, props: nextProps } : null
}

function applyParagraphTextStyleToParagraph(
  node: ParagraphNode,
  patch: ParagraphTextStyleChanges,
): ParagraphNode | null {
  if (!hasTextRunStylePatch(patch)) return null
  const withProps = applyParagraphTextStyleProps(node, patch) ?? node
  const textLength = paragraphTextLength(withProps)
  const runClearPatch: TextRunStylePatch = {}
  for (const key of Object.keys(patch) as Array<keyof TextRunStylePatch>) {
    runClearPatch[key] = null
  }
  const withRuns = textLength > 0
    ? applyTextRunStyleRangeToParagraph(withProps, 0, textLength, runClearPatch)
    : null
  if (withRuns) return withRuns
  return withProps === node ? null : withProps
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

function roundWidthShare(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizePaletteColumnShares(shares: number[] | undefined): number[] | null {
  if (!shares || shares.length === 0) return null
  const safeShares = shares
    .map((share) => Number(share))
    .filter((share) => Number.isFinite(share) && share > 0)
  if (safeShares.length === 0) return null

  const total = safeShares.reduce((sum, share) => sum + share, 0)
  if (total <= 0) return null

  const normalized = safeShares.map((share) => roundWidthShare((share / total) * 100))
  const allocatedBeforeLast = normalized.slice(0, -1).reduce((sum, share) => sum + share, 0)
  normalized[normalized.length - 1] = roundWidthShare(100 - allocatedBeforeLast)
  return normalized
}

function createPaletteFlowColumnsSubtree(source: DragSource, fallbackColumnCount: number): { insertId: string; newNodes: Nodes } {
  const shares = source.source === "palette"
    ? normalizePaletteColumnShares(source.columnShares) ?? getEqualWidthShares(fallbackColumnCount)
    : getEqualWidthShares(fallbackColumnCount)
  const { row, stacks, nodes } = createFlowColumnsSubtree(shares.length)
  let result = nodes
  stacks.forEach((stack, index) => {
    result = {
      ...result,
      [stack.id]: {
        ...stack,
        props: { ...stack.props, widthShare: shares[index] },
      } as LayoutNode,
    }
  })
  return { insertId: row.id, newNodes: result }
}

function clampPaletteTableAxis(value: number | undefined): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 3
  return Math.min(6, Math.max(1, Math.floor(numericValue)))
}

function createNodesForSource(source: DragSource): { insertId: string; newNodes: Nodes } {
  if (source.source === "palette") {
    if (source.blockType === "paragraph") {
      const node = createParagraphNode("New paragraph")
      return { insertId: node.id, newNodes: { [node.id]: node } }
    }
    if (source.blockType === "row") {
      return createPaletteFlowColumnsSubtree(source, 1)
    }
    if (source.blockType === "columns") {
      return createPaletteFlowColumnsSubtree(source, 2)
    }
    if (source.blockType === "flow-columns") {
      return createPaletteFlowColumnsSubtree(source, 2)
    }
    if (source.blockType === "flow-table") {
      const table = createDefaultFlowTable(
        clampPaletteTableAxis(source.tableSize?.rows),
        clampPaletteTableAxis(source.tableSize?.columns),
      )
      return { insertId: table.id, newNodes: { [table.id]: table as unknown as LayoutNode } }
    }
    return createPaletteFlowColumnsSubtree(source, 1)
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

function doMoveFlowStackIntoRow(
  nodes: Nodes,
  rowId: string,
  targetStackId: string,
  position: "before" | "after",
  stackId: string,
): Nodes {
  const row = nodes[rowId]
  const targetStack = nodes[targetStackId]
  const movedStack = nodes[stackId]
  if (row?.type !== "flow-row") return nodes
  if (targetStack?.type !== "flow-stack") return nodes
  if (movedStack?.type !== "flow-stack") return nodes
  if (targetStackId === stackId) return nodes

  const childIds = row.childIds.filter((id) => id !== stackId)
  const targetIndex = childIds.indexOf(targetStackId)
  if (targetIndex === -1) return nodes

  const { original, inserted } = splitWidthPercent(targetStack.props.widthShare ?? 100)
  let result: Nodes = {
    ...nodes,
    [targetStackId]: {
      ...targetStack,
      props: { ...targetStack.props, widthShare: original },
    } as LayoutNode,
    [stackId]: {
      ...movedStack,
      props: { ...movedStack.props, widthShare: inserted },
    } as LayoutNode,
  }

  const insertAt = position === "before" ? targetIndex : targetIndex + 1
  const nextChildIds = [...childIds]
  nextChildIds.splice(insertAt, 0, stackId)
  result = setChildIds(result, rowId, nextChildIds)
  return result
}

function doMoveFlowStackToNewRow(
  nodes: Nodes,
  parentId: string,
  rawIndex: number,
  stackId: string,
  removedRowIndexInParent: number | null,
): Nodes {
  const parent = nodes[parentId]
  const movedStack = nodes[stackId]
  if (parent?.type !== "body") return nodes
  if (movedStack?.type !== "flow-stack") return nodes

  const row = createFlowRowNode([stackId])
  let result: Nodes = {
    ...nodes,
    [stackId]: {
      ...movedStack,
      props: { ...movedStack.props, widthShare: 100 },
    } as LayoutNode,
    [row.id]: row,
  }

  const idx = Math.min(
    Math.max(0, shiftedIndex(rawIndex, removedRowIndexInParent)),
    getChildIds(result, parentId).length,
  )
  const childIds = [...getChildIds(result, parentId)]
  childIds.splice(idx, 0, row.id)
  result = setChildIds(result, parentId, childIds)
  return result
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

function clonePlainData<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneInlineNode(node: InlineNode): InlineNode {
  if (node.type === "text") return { ...node, id: createId("text"), style: clonePlainData(node.style) }
  if (node.type === "fieldRef") return { ...node, id: createId("field") }
  return { ...node, id: createId("page-number") }
}

function cloneParagraphNode(node: ParagraphNode, id = createId("paragraph")): ParagraphNode {
  return {
    ...node,
    id,
    props: clonePlainData(node.props),
    children: node.children.map(cloneInlineNode),
  }
}

function cloneFlowTableNode(table: FlowTableNode, id = createId("flow-table")): FlowTableNode {
  const idMap = new Map<string, string>([[table.id, id]])
  Object.values(table.nodes).forEach((node) => {
    idMap.set(node.id, createId(node.type))
  })

  const mapId = (nodeId: string) => idMap.get(nodeId) ?? nodeId
  const nodes: FlowTableNode["nodes"] = {}
  Object.values(table.nodes).forEach((node) => {
    const nextId = mapId(node.id)
    if (node.type === "paragraph") {
      nodes[nextId] = cloneParagraphNode(node as ParagraphNode, nextId)
      return
    }
    if (node.type === "spacer") {
      nodes[nextId] = { ...node, id: nextId, props: clonePlainData(node.props) }
      return
    }
    if (node.type === "flow-table-row") {
      nodes[nextId] = {
        ...node,
        id: nextId,
        props: clonePlainData(node.props),
        cellIds: node.cellIds.map(mapId),
      }
      return
    }
    nodes[nextId] = {
      ...node,
      id: nextId,
      props: {
        ...clonePlainData(node.props),
        mergeMap: node.props.mergeMap
          ? {
            ...node.props.mergeMap,
            entries: node.props.mergeMap.entries.map((entry) => ({
              ...entry,
              childIds: entry.childIds.map(mapId),
            })),
          }
          : undefined,
      },
      childIds: node.childIds.map(mapId),
    }
  })

  return {
    ...table,
    id,
    props: clonePlainData(table.props),
    columns: clonePlainData(table.columns),
    rowIds: table.rowIds.map(mapId),
    nodes,
  }
}

function cloneLayoutSubtree(nodes: Nodes, rootId: string): { rootId: string; nodes: Nodes } | null {
  const node = nodes[rootId]
  if (!node || node.type === "body") return null

  if (node.type === "paragraph") {
    const clone = cloneParagraphNode(node)
    return { rootId: clone.id, nodes: { [clone.id]: clone } }
  }

  if (node.type === "spacer") {
    const clone: LayoutNode = { ...node, id: createId("spacer"), props: clonePlainData(node.props) }
    return { rootId: clone.id, nodes: { [clone.id]: clone } }
  }

  if (node.type === "toc") {
    const clone: LayoutNode = { ...node, id: createId("toc"), props: clonePlainData(node.props) }
    return { rootId: clone.id, nodes: { [clone.id]: clone } }
  }

  if (node.type === "flow-table") {
    const clone = cloneFlowTableNode(node as unknown as FlowTableNode)
    return { rootId: clone.id, nodes: { [clone.id]: clone as unknown as LayoutNode } }
  }

  const childIds: string[] = []
  let clonedNodes: Nodes = {}
  node.childIds.forEach((childId) => {
    const cloned = cloneLayoutSubtree(nodes, childId)
    if (!cloned) return
    childIds.push(cloned.rootId)
    clonedNodes = { ...clonedNodes, ...cloned.nodes }
  })

  const clone = {
    ...node,
    id: createId(node.type),
    props: clonePlainData(node.props),
    childIds,
  } as LayoutNode
  return { rootId: clone.id, nodes: { ...clonedNodes, [clone.id]: clone } }
}

// ─── Flow Table Helpers ───────────────────────────────────────────────────────

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

function roundWidthPt(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100
}

function fitFlowTableColumnsToWidth(table: FlowTableNode, targetWidthPt: number): FlowTableNode {
  const safeTargetWidth = roundWidthPt(targetWidthPt)
  if (table.columns.length === 0 || safeTargetWidth <= 0) return table

  const currentWidths = table.columns.map((column) => unitWidthToPt(column.width))
  const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0)
  let assigned = 0
  const columns = table.columns.map((column, index) => {
    const isLast = index === table.columns.length - 1
    const rawWidth = currentTotal > 0
      ? safeTargetWidth * ((currentWidths[index] ?? 0) / currentTotal)
      : safeTargetWidth / table.columns.length
    const nextWidth = isLast
      ? roundWidthPt(safeTargetWidth - assigned)
      : roundWidthPt(rawWidth)
    if (!isLast) assigned += nextWidth
    return { ...column, width: pt(nextWidth) }
  })

  const changed = columns.some((column, index) =>
    Math.abs(unitWidthToPt(column.width) - unitWidthToPt(table.columns[index]?.width)) >= 0.01,
  )
  return changed ? { ...table, columns } : table
}

function resolveResizedColumnPair(
  leftWidthPt: number,
  rightWidthPt: number,
  currentLeftWidthPt: number,
  currentRightWidthPt: number,
  minWidthPt = MIN_TABLE_COLUMN_RESIZE_WIDTH_PT,
): { leftWidthPt: number; rightWidthPt: number } | null {
  const pairTotal = currentLeftWidthPt + currentRightWidthPt
  if (!Number.isFinite(pairTotal) || pairTotal <= 0) return null

  const safeMinWidth = Math.min(
    Math.max(0.01, minWidthPt),
    pairTotal / 2,
  )
  const requestedLeft = Number.isFinite(leftWidthPt) && Number.isFinite(rightWidthPt) && leftWidthPt + rightWidthPt > 0
    ? leftWidthPt
    : currentLeftWidthPt
  const nextLeft = Math.max(safeMinWidth, Math.min(pairTotal - safeMinWidth, requestedLeft))
  const roundedLeft = Math.round(nextLeft * 100) / 100
  const roundedRight = Math.round((pairTotal - roundedLeft) * 100) / 100

  return {
    leftWidthPt: roundedLeft,
    rightWidthPt: roundedRight,
  }
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
  internalNodes[cell.id] = { ...cell, props: { ...cell.props, box: createDefaultFlowTableCellBox() } }
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

function normalizeFlowTableCellMergeMapForOperation(
  cell: FlowTableCellNode,
  entries: FlowTableCellMergeMapEntry[],
  rowspan: number,
  colspan: number,
): FlowTableCellMergeMap | undefined {
  const cellChildIds = new Set(cell.childIds)
  const mappedChildIds = new Set<string>()
  const boundedEntries: FlowTableCellMergeMapEntry[] = []

  entries.forEach((entry) => {
    if (entry.rowOffset < 0 || entry.rowOffset >= rowspan || entry.colOffset < 0 || entry.colOffset >= colspan) return
    const childIds = entry.childIds.filter((childId) => cellChildIds.has(childId) && !mappedChildIds.has(childId))
    if (childIds.length === 0) return
    childIds.forEach((childId) => { mappedChildIds.add(childId) })
    boundedEntries.push({ ...entry, childIds })
  })

  return mergeFlowTableMergeMapEntries(boundedEntries)
}

function updateFlowTableCellPropsMergeMap(
  props: FlowTableCellNode["props"],
  mergeMap: FlowTableCellMergeMap | undefined,
): FlowTableCellNode["props"] {
  const next = { ...props }
  if (mergeMap) next.mergeMap = mergeMap
  else delete next.mergeMap
  return next
}

type FlowTableMergeMapAxis = "row" | "column"

function shiftFlowTableCellMergeMapForAxisInsert(
  cell: FlowTableCellNode,
  axis: FlowTableMergeMapAxis,
  insertOffset: number,
  rowspan: number,
  colspan: number,
): FlowTableCellMergeMap | undefined {
  const mergeMap = cell.props.mergeMap
  if (mergeMap == null) return undefined

  const entries = mergeMap.entries.map((entry) =>
    axis === "row"
      ? { ...entry, rowOffset: entry.rowOffset >= insertOffset ? entry.rowOffset + 1 : entry.rowOffset }
      : { ...entry, colOffset: entry.colOffset >= insertOffset ? entry.colOffset + 1 : entry.colOffset },
  )
  return normalizeFlowTableCellMergeMapForOperation(cell, entries, rowspan, colspan)
}

function shiftFlowTableCellMergeMapForAxisRemoval(
  cell: FlowTableCellNode,
  axis: FlowTableMergeMapAxis,
  removedOffset: number,
  rowspan: number,
  colspan: number,
): FlowTableCellMergeMap | undefined {
  const mergeMap = cell.props.mergeMap
  if (mergeMap == null) return undefined

  const entries = mergeMap.entries.flatMap((entry): FlowTableCellMergeMapEntry[] => {
    const offset = axis === "row" ? entry.rowOffset : entry.colOffset
    if (offset === removedOffset) return []
    return [
      axis === "row"
        ? { ...entry, rowOffset: offset > removedOffset ? offset - 1 : offset }
        : { ...entry, colOffset: offset > removedOffset ? offset - 1 : offset },
    ]
  })
  return normalizeFlowTableCellMergeMapForOperation(cell, entries, rowspan, colspan)
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
  internalNodes[cell.id] = { ...cell, props: { ...cell.props, box: createDefaultFlowTableCellBox() } }
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
      if (candidate.type !== "flow-table") continue
      const table = candidate as unknown as FlowTableNode
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
    // search inside flow tables
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
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

export type BodyChildReorderPosition = "before" | "after"

export function reorderBodyChild(
  doc: DocumentNode,
  sectionId: string,
  sourceNodeId: string,
  targetNodeId: string,
  position: BodyChildReorderPosition,
): DocumentNode {
  if (sourceNodeId === targetNodeId) return doc

  const sectionIndex = doc.document.sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex < 0) return doc

  const section = doc.document.sections[sectionIndex]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") return doc

  const sourceIndex = body.childIds.indexOf(sourceNodeId)
  const targetIndex = body.childIds.indexOf(targetNodeId)
  if (sourceIndex < 0 || targetIndex < 0) return doc

  const withoutSource = body.childIds.filter((id) => id !== sourceNodeId)
  const targetIndexAfterRemoval = withoutSource.indexOf(targetNodeId)
  if (targetIndexAfterRemoval < 0) return doc

  const insertIndex = position === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1
  const nextChildIds = [...withoutSource]
  nextChildIds.splice(insertIndex, 0, sourceNodeId)

  if (nextChildIds.every((id, index) => id === body.childIds[index])) return doc

  const nextSections = doc.document.sections.map((candidate, index) => (
    index === sectionIndex
      ? {
          ...candidate,
          nodes: {
            ...candidate.nodes,
            [body.id]: { ...body, childIds: nextChildIds },
          },
        }
      : candidate
  ))

  return { ...doc, document: { ...doc.document, sections: nextSections } }
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
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
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
    // search inside flow tables
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
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

export function applyTextRunStyleRange(
  doc: DocumentNode,
  nodeId: string,
  start: number,
  end: number,
  patch: TextRunStylePatch,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const updated = applyTextRunStyleRangeToParagraph(node, start, end, patch)
      if (!updated) continue
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated as LayoutNode } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const updated = applyTextRunStyleRangeToParagraph(inner, start, end, patch)
      if (!updated) continue
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

export function applyParagraphTextStyle(
  doc: DocumentNode,
  nodeId: string,
  patch: ParagraphTextStyleChanges,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const updated = applyParagraphTextStyleToParagraph(node, patch)
      if (!updated) continue
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated as LayoutNode } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const updated = applyParagraphTextStyleToParagraph(inner, patch)
      if (!updated) continue
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

export function deleteTextRunRange(
  doc: DocumentNode,
  nodeId: string,
  start: number,
  end: number,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const updated = deleteTextRunRangeFromParagraph(node, start, end)
      if (!updated) continue
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated as LayoutNode } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const updated = deleteTextRunRangeFromParagraph(inner, start, end)
      if (!updated) continue
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

export function replaceTextRunRange(
  doc: DocumentNode,
  nodeId: string,
  start: number,
  end: number,
  text: string,
  options: ReplaceTextRunRangeOptions = {},
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const updated = replaceTextRunRangeInParagraph(node, start, end, text, options)
      if (!updated) continue
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated as LayoutNode } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const updated = replaceTextRunRangeInParagraph(inner, start, end, text, options)
      if (!updated) continue
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

export function replaceTextRunParagraphText(
  doc: DocumentNode,
  nodeId: string,
  text: string,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const updated = replaceTextRunParagraphTextInParagraph(node, text)
      if (!updated) continue
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated as LayoutNode } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }

    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const updated = replaceTextRunParagraphTextInParagraph(inner, text)
      if (!updated) continue
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

      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
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

export function splitTextRunParagraphAtIndex(
  doc: DocumentNode,
  nodeId: string,
  splitIndex: number,
): { doc: DocumentNode; newNodeId: string } {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type !== "paragraph") continue
    if (!isTextRunOnlyParagraph(node)) continue

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (!parentInfo) continue

    const { before, after } = splitTextRunsAtOffset(node, splitIndex)
    const updatedNode: LayoutNode = { ...node, children: before }
    const newPara = createParagraphNode("", node.props)
    const newParagraph: LayoutNode = {
      ...newPara,
      props: clonePlainData(node.props),
      children: after,
    }

    let newNodes: Nodes = {
      ...section.nodes,
      [nodeId]: updatedNode,
      [newPara.id]: newParagraph,
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

export function mergeTextRunParagraphWithPrevious(
  doc: DocumentNode,
  nodeId: string,
): { doc: DocumentNode; prevNodeId: string; caretIndex: number } | null {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type !== "paragraph") continue
    if (!isTextRunOnlyParagraph(node)) continue

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (!parentInfo || parentInfo.index === 0) return null

    const childIds = getChildIds(section.nodes, parentInfo.parentId)
    const prevId = childIds[parentInfo.index - 1]
    if (!prevId) return null

    const prevNode = section.nodes[prevId]
    if (prevNode?.type !== "paragraph") return null
    if (!isTextRunOnlyParagraph(prevNode)) return null

    const caretIndex = paragraphTextLength(prevNode)
    const updatedPrev: LayoutNode = {
      ...prevNode,
      children: mergeAdjacentTextRuns([...prevNode.children, ...node.children]),
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
      const nextRowspan = placement.rowspan + 1
      const mergeMap = shiftFlowTableCellMergeMapForAxisInsert(
        cell,
        "row",
        insertAt - placement.rowIndex,
        nextRowspan,
        placement.colspan,
      )
      internalNodes[placement.cellId] = {
        ...cell,
        props: updateFlowTableCellPropsMergeMap({ ...cell.props, rowspan: nextRowspan }, mergeMap),
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
    const resolved = tryResolveFlowTableGrid(table)
    if (!resolved.ok) return table

    const internalNodes = { ...table.nodes }

    plan.shrinkRowspanCellIds.forEach((cellId) => {
      const cell = internalNodes[cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      const placement = resolved.grid.placementsByCellId.get(cellId)
      if (placement == null) return
      const rowspan = Math.max(1, placement.rowspan - 1)
      const mergeMap = shiftFlowTableCellMergeMapForAxisRemoval(
        cell,
        "row",
        rowIndex - placement.rowIndex,
        rowspan,
        placement.colspan,
      )
      internalNodes[cellId] = {
        ...cell,
        props: updateFlowTableCellPropsMergeMap({ ...cell.props, rowspan }, mergeMap),
      }
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
      const nextColspan = placement.colspan + 1
      const mergeMap = shiftFlowTableCellMergeMapForAxisInsert(
        cell,
        "column",
        insertAt - placement.columnIndex,
        placement.rowspan,
        nextColspan,
      )
      internalNodes[placement.cellId] = {
        ...cell,
        props: updateFlowTableCellPropsMergeMap({ ...cell.props, colspan: nextColspan }, mergeMap),
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
    const resolved = tryResolveFlowTableGrid(table)
    if (!resolved.ok) return table

    const internalNodes = { ...table.nodes }
    const removedWidth = unitWidthToPt(table.columns[colIndex]?.width)
    const deleteCellIds = new Set(plan.deleteCellIds)

    plan.shrinkColspanCellIds.forEach((cellId) => {
      const cell = internalNodes[cellId] as FlowTableCellNode | undefined
      if (cell?.type !== "flow-table-cell") return
      const placement = resolved.grid.placementsByCellId.get(cellId)
      if (placement == null) return
      const colspan = Math.max(1, placement.colspan - 1)
      const mergeMap = shiftFlowTableCellMergeMapForAxisRemoval(
        cell,
        "column",
        colIndex - placement.columnIndex,
        placement.rowspan,
        colspan,
      )
      internalNodes[cellId] = {
        ...cell,
        props: updateFlowTableCellPropsMergeMap({ ...cell.props, colspan }, mergeMap),
      }
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

export function resizeFlowTableColumnPair(
  doc: DocumentNode,
  tableId: string,
  leftColIndex: number,
  leftWidthPt: number,
  rightWidthPt: number,
): DocumentNode {
  return updateFlowTableInSection(doc, tableId, (table) => {
    const resolved = tryResolveFlowTableGrid(table)
    if (!resolved.ok) return table
    const rightColIndex = leftColIndex + 1
    if (leftColIndex < 0 || rightColIndex >= table.columns.length) return table

    const currentLeftWidth = unitWidthToPt(table.columns[leftColIndex]?.width)
    const currentRightWidth = unitWidthToPt(table.columns[rightColIndex]?.width)
    const nextPair = resolveResizedColumnPair(leftWidthPt, rightWidthPt, currentLeftWidth, currentRightWidth)
    if (!nextPair) return table
    if (
      Math.abs(nextPair.leftWidthPt - currentLeftWidth) < 0.01 &&
      Math.abs(nextPair.rightWidthPt - currentRightWidth) < 0.01
    ) return table

    const columns = table.columns.map((column, index) => {
      if (index === leftColIndex) return { ...column, width: pt(nextPair.leftWidthPt) }
      if (index === rightColIndex) return { ...column, width: pt(nextPair.rightWidthPt) }
      return column
    })

    return { ...table, columns }
  })
}

export function fitFlowTableToSectionWidth(doc: DocumentNode, tableId: string): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const tableNode = section.nodes[tableId]
    if (tableNode?.type !== "flow-table") continue
    const targetWidth = getPageMetrics(section.page).contentBox.width
    const newTable = fitFlowTableColumnsToWidth(tableNode as unknown as FlowTableNode, targetWidth)
    if (newTable === tableNode) return doc
    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: { ...s.nodes, [tableId]: newTable as unknown as LayoutNode } } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
  }
  return doc
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

function roundNonNegativePt(value: number): number {
  const numeric = Number.isFinite(value) ? value : 0
  return Math.max(0, Math.round(numeric * 100) / 100)
}

export type HeaderFooterHorizontalMode = NonNullable<PageSettings["headerFooterHorizontalMode"]>
export type ReservedZonePriority = "headerReserved" | "footerReserved"

function roundPt(value: number): number {
  return Math.round(value * 100) / 100
}

function hasHeaderRoot(section: DocumentNode["document"]["sections"][number]): boolean {
  return Boolean(section.headerRootId || section.headerFirstPageRootId)
}

function hasFooterRoot(section: DocumentNode["document"]["sections"][number]): boolean {
  return Boolean(section.footerRootId || section.footerFirstPageRootId)
}

export function clampSectionReservedZones(
  section: DocumentNode["document"]["sections"][number],
  reserved: { headerReserved: number; footerReserved: number },
  priority: ReservedZonePriority = "headerReserved",
): { headerReserved: number; footerReserved: number } {
  const rawHeaderReserved = roundNonNegativePt(reserved.headerReserved)
  const rawFooterReserved = roundNonNegativePt(reserved.footerReserved)
  const headerActive = hasHeaderRoot(section) || rawHeaderReserved > 0
  const footerActive = hasFooterRoot(section) || rawFooterReserved > 0
  const { height } = getPageDimensions(section.page)
  const usableHeight = Math.max(0, height - section.page.margin.top.value - section.page.margin.bottom.value)
  const maxTotalReserved = roundPt(usableHeight * MAX_HEADER_FOOTER_RESERVED_RATIO)
  const activeCount = (headerActive ? 1 : 0) + (footerActive ? 1 : 0)
  const minReserved = activeCount > 0
    ? roundPt(Math.min(MIN_HEADER_FOOTER_RESERVED_PT, maxTotalReserved / activeCount))
    : 0
  const minHeaderReserved = headerActive ? minReserved : 0
  const minFooterReserved = footerActive ? minReserved : 0
  let headerReserved = headerActive ? Math.max(rawHeaderReserved, minHeaderReserved) : 0
  let footerReserved = footerActive ? Math.max(rawFooterReserved, minFooterReserved) : 0

  if (headerReserved + footerReserved > maxTotalReserved) {
    if (priority === "footerReserved") {
      footerReserved = Math.min(footerReserved, Math.max(minFooterReserved, maxTotalReserved - minHeaderReserved))
      headerReserved = Math.min(headerReserved, Math.max(minHeaderReserved, maxTotalReserved - footerReserved))
    } else {
      headerReserved = Math.min(headerReserved, Math.max(minHeaderReserved, maxTotalReserved - minFooterReserved))
      footerReserved = Math.min(footerReserved, Math.max(minFooterReserved, maxTotalReserved - headerReserved))
    }
  }

  return {
    headerReserved: roundPt(headerReserved),
    footerReserved: roundPt(footerReserved),
  }
}

function normalizeHeaderFooterHorizontalMode(mode: PageSettings["headerFooterHorizontalMode"]): HeaderFooterHorizontalMode {
  return mode === "full" ? "full" : "body"
}

export function updateSectionReservedZones(
  doc: DocumentNode,
  sectionIndex: number,
  reserved: { headerReserved: number; footerReserved: number },
): DocumentNode {
  const section = doc.document.sections[sectionIndex]
  if (!section) return doc
  const { headerReserved, footerReserved } = clampSectionReservedZones(section, reserved)
  if (
    (section.page.headerReserved ?? 0) === headerReserved &&
    (section.page.footerReserved ?? 0) === footerReserved
  ) return doc
  const sections = doc.document.sections.map((s, i) =>
    i !== sectionIndex ? s : {
      ...s,
      page: {
        ...s.page,
        headerReserved,
        footerReserved,
      },
    },
  )
  return { ...doc, document: { ...doc.document, sections } }
}

export function updateSectionHeaderFooterHorizontalMode(
  doc: DocumentNode,
  sectionIndex: number,
  mode: HeaderFooterHorizontalMode,
): DocumentNode {
  const section = doc.document.sections[sectionIndex]
  if (!section) return doc
  const nextMode = normalizeHeaderFooterHorizontalMode(mode)
  if (normalizeHeaderFooterHorizontalMode(section.page.headerFooterHorizontalMode) === nextMode) return doc
  const sections = doc.document.sections.map((s, i) =>
    i !== sectionIndex ? s : {
      ...s,
      page: {
        ...s.page,
        headerFooterHorizontalMode: nextMode,
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

export function duplicateNode(doc: DocumentNode, nodeId: string): { doc: DocumentNode; duplicatedNodeId: string | null } {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (!node || node.type === "body") continue

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (parentInfo == null) return { doc, duplicatedNodeId: null }

    const cloned = cloneLayoutSubtree(section.nodes, nodeId)
    if (!cloned) return { doc, duplicatedNodeId: null }

    let nodes: Nodes = { ...section.nodes, ...cloned.nodes }
    const nextChildIds = [...getChildIds(nodes, parentInfo.parentId)]
    nextChildIds.splice(parentInfo.index + 1, 0, cloned.rootId)
    nodes = setChildIds(nodes, parentInfo.parentId, nextChildIds)

    const parent = nodes[parentInfo.parentId]
    const clonedNode = nodes[cloned.rootId]
    if (parent?.type === "row" && node.type === "stack" && clonedNode?.type === "stack") {
      const split = splitWidthPercent(node.props.widthShare ?? 100)
      nodes = {
        ...nodes,
        [nodeId]: { ...node, props: { ...node.props, widthShare: split.original } },
        [cloned.rootId]: { ...clonedNode, props: { ...clonedNode.props, widthShare: split.inserted } },
      }
    }

    if (parent?.type === "flow-row" && node.type === "flow-stack" && clonedNode?.type === "flow-stack") {
      const split = splitWidthPercent(node.props.widthShare ?? 100)
      nodes = {
        ...nodes,
        [nodeId]: { ...node, props: { ...node.props, widthShare: split.original } },
        [cloned.rootId]: { ...clonedNode, props: { ...clonedNode.props, widthShare: split.inserted } },
      }
    }

    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes } : s,
    )
    return {
      doc: { ...doc, document: { ...doc.document, sections: newSections } },
      duplicatedNodeId: cloned.rootId,
    }
  }
  return { doc, duplicatedNodeId: null }
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
  if (op.kind === "add-flow-stack-column") {
    return addFlowStackColumn(doc, op.rowId, op.targetStackId, op.position)
  }

  const sectionIndex = doc.document.sections.findIndex((s) => s.id === sectionId)
  if (sectionIndex === -1) return doc

  const section = doc.document.sections[sectionIndex]
  let nodes: Nodes = { ...section.nodes }
  const sourceNodeBeforeRemoval = source.source === "document" ? section.nodes[source.nodeId] : null
  const sourceParentInfoBeforeRemoval = source.source === "document"
    ? findParentInfo(section.nodes, source.nodeId)
    : null
  const sourceParentBeforeRemoval = sourceParentInfoBeforeRemoval
    ? section.nodes[sourceParentInfoBeforeRemoval.parentId]
    : null
  const sourceContainerParentInfoBeforeRemoval =
    sourceNodeBeforeRemoval?.type === "flow-stack" && sourceParentBeforeRemoval?.type === "flow-row"
      ? findParentInfo(section.nodes, sourceParentBeforeRemoval.id)
      : null
  let removedSourceRowParentId: string | null = null
  let removedSourceRowIndex: number | null = null

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
      if (sourceNodeBeforeRemoval?.type === "flow-stack" && sourceParentBeforeRemoval?.type === "flow-row") {
        const remaining = getChildIds(nodes, parentInfo.parentId)
        if (remaining.length > 0) {
          nodes = transferDeletedFlowStackWidth(nodes, parentInfo.parentId, source.nodeId, parentInfo.index)
        }
      }
      nodes = cleanupAfterRemoval(nodes, parentInfo.parentId)
      if (
        sourceParentBeforeRemoval?.type === "flow-row" &&
        sourceContainerParentInfoBeforeRemoval != null &&
        nodes[sourceParentBeforeRemoval.id] == null
      ) {
        removedSourceRowParentId = sourceContainerParentInfoBeforeRemoval.parentId
        removedSourceRowIndex = sourceContainerParentInfoBeforeRemoval.index
      }
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
    case "move-flow-stack-into-row":
      if (source.source === "document") {
        nodes = doMoveFlowStackIntoRow(nodes, op.rowId, op.targetStackId, op.position, insertId)
      }
      break
    case "move-flow-stack-to-new-row": {
      if (source.source === "document") {
        const removedIndex = removedSourceRowParentId === op.parentId ? removedSourceRowIndex : null
        nodes = doMoveFlowStackToNewRow(nodes, op.parentId, op.index, insertId, removedIndex)
      }
      break
    }
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
