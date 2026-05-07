import type { DocumentNode, LayoutNode, TableNode, TableRowNode, TableCellNode } from "../schema"
import { pt } from "../schema"
import type { DragSource, PlacementOperation } from "../placement/types"
import {
  createParagraphNode,
  createRowNode,
  createRowSubtree,
  createColumnsSubtree,
  createStackNode,
  getEqualWidthShares,
  DEFAULT_STACK_MIN_HEIGHT,
  createDefaultTable,
  createTableCellNode,
  createTableRowNode,
  createFieldRefInline,
} from "./defaults"

// ─── Internal Types ────────────────────────────────────────────────────────────

type Nodes = Record<string, LayoutNode>

interface ParentInfo {
  parentId: string
  index: number
}

// ─── Tree Helpers ──────────────────────────────────────────────────────────────

function findParentInfo(nodes: Nodes, childId: string): ParentInfo | null {
  for (const [id, node] of Object.entries(nodes)) {
    if (
      (node.type === "body" || node.type === "stack" || node.type === "row") &&
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
      const { row, nodes } = createRowSubtree()
      return { insertId: row.id, newNodes: nodes }
    }
    if (source.blockType === "columns") {
      const { row, nodes } = createColumnsSubtree(2)
      return { insertId: row.id, newNodes: nodes }
    }
    if (source.blockType === "table") {
      const table = createDefaultTable()
      return { insertId: table.id, newNodes: { [table.id]: table as unknown as LayoutNode } }
    }
    const { row, nodes } = createRowSubtree()
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
  const stackLeft = createStackNode(leftIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
  const stackRight = createStackNode(rightIds, { widthShare: 50, minHeight: DEFAULT_STACK_MIN_HEIGHT })
  const newRow = createRowNode([stackLeft.id, stackRight.id])

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

function insertInlineField(
  doc: DocumentNode,
  paragraphId: string,
  index: number,
  field: { key: string; label?: string; fallback?: string },
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[paragraphId]
    if (node?.type !== "paragraph") continue

    const insertAt = Math.min(Math.max(0, index), node.children.length)
    const fieldRef = createFieldRefInline(field.key, field.label, field.fallback)
    const updated: LayoutNode = {
      ...node,
      children: [...node.children.slice(0, insertAt), fieldRef, ...node.children.slice(insertAt)],
    }
    const newSections = doc.document.sections.map((s, i) =>
      i === si ? { ...s, nodes: { ...s.nodes, [paragraphId]: updated } } : s,
    )
    return { ...doc, document: { ...doc.document, sections: newSections } }
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
      if (n.type !== "table") continue
      const table = n as unknown as TableNode
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

export function updateParagraphText(
  doc: DocumentNode,
  nodeId: string,
  text: string,
): DocumentNode {
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      const firstRun = node.children[0]
      if (!firstRun || firstRun.type !== "text") continue
      const updated: LayoutNode = { ...node, children: [{ ...firstRun, text }, ...node.children.slice(1)] }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: updated } } : s,
      )
      return { ...doc, document: { ...doc.document, sections: newSections } }
    }
    // search inside tables
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "table") continue
      const table = n as unknown as TableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      const firstRun = inner.children[0]
      if (!firstRun || firstRun.type !== "text") continue
      const updated = { ...inner, children: [{ ...firstRun, text }, ...inner.children.slice(1)] }
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

    const firstRun = node.children[0]
    if (!firstRun || firstRun.type !== "text") continue

    const textBefore = firstRun.text.slice(0, splitIndex)
    const textAfter = firstRun.text.slice(splitIndex)

    const updatedNode: LayoutNode = {
      ...node,
      children: [{ ...firstRun, text: textBefore }, ...node.children.slice(1)],
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

    const parentInfo = findParentInfo(section.nodes, nodeId)
    if (!parentInfo || parentInfo.index === 0) return null

    const childIds = getChildIds(section.nodes, parentInfo.parentId)
    const prevId = childIds[parentInfo.index - 1]
    if (!prevId) return null

    const prevNode = section.nodes[prevId]
    if (prevNode?.type !== "paragraph") return null

    const prevFirstRun = prevNode.children[0]
    const curFirstRun = node.children[0]
    if (!prevFirstRun || prevFirstRun.type !== "text") return null
    if (!curFirstRun || curFirstRun.type !== "text") return null

    const caretIndex = prevFirstRun.text.length
    const mergedText = prevFirstRun.text + curFirstRun.text
    const updatedPrev: LayoutNode = {
      ...prevNode,
      children: [{ ...prevFirstRun, text: mergedText }, ...prevNode.children.slice(1)],
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
    return { ...table, rowIds: table.rowIds.filter((_, i) => i !== rowIndex), nodes: internalNodes }
  })
}

export function addTableColumn(doc: DocumentNode, tableId: string, afterColIndex?: number): DocumentNode {
  return updateTableInSection(doc, tableId, (table) => {
    const insertAt = afterColIndex != null
      ? Math.min(Math.max(0, afterColIndex + 1), table.columns.length)
      : table.columns.length

    const newColumns = [
      ...table.columns.slice(0, insertAt),
      { width: pt(150) },
      ...table.columns.slice(insertAt),
    ]

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

    return { ...table, columns: table.columns.filter((_, i) => i !== colIndex), nodes: internalNodes }
  })
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
