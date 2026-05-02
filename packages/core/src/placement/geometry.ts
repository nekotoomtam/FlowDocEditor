import type { DocumentNode, LayoutNode } from "../schema"
import type { DragSource, PlacementTarget, PlacementZone } from "./types"

/**
 * geometry — แปลง pointer position → zone → target
 *
 * กฎหลัก:
 * - ไม่รู้จัก law หรือ legality
 * - ไม่ mutate document
 * - pure function เสมอ
 */

// ─── Stack Drop Zone ──────────────────────────────────────────────────────────

// แต่ละ stack แบ่งเป็น 3 zone: left(10%) | center | right(10%)
// min 8pt แต่ละฝั่ง
export interface StackZoneEdges {
  leftWidth: number
  rightWidth: number
  rightStart: number
}

export function getStackZoneEdges(width: number): StackZoneEdges {
  const safe = Math.max(0, width)
  const leftWidth = Math.min(Math.max(safe * 0.1, 8), safe / 2)
  const rightWidth = Math.min(Math.max(safe * 0.1, 8), Math.max(0, safe - leftWidth))
  return {
    leftWidth,
    rightWidth,
    rightStart: Math.max(leftWidth, safe - rightWidth),
  }
}

export function resolveStackZone(localX: number, width: number): "left" | "center" | "right" {
  const { leftWidth, rightStart } = getStackZoneEdges(width)
  if (localX <= leftWidth) return "left"
  if (localX >= rightStart) return "right"
  return "center"
}

// ─── Node Zone ────────────────────────────────────────────────────────────────

// zone ของ node ทั่วไป — edge detection based on distance
export interface NodeZoneEdges {
  edgeX: number
  edgeY: number
}

export function getNodeZoneEdges(width: number, height: number): NodeZoneEdges {
  return {
    edgeX: Math.min(Math.max(width * 0.12, 12), 22, width / 3),
    edgeY: Math.min(Math.max(height * 0.09, 10), 18, height / 3),
  }
}

export function resolveNodeZone(
  localX: number,
  localY: number,
  width: number,
  height: number,
): "top" | "bottom" | "left" | "right" | "center" {
  const { edgeX, edgeY } = getNodeZoneEdges(width, height)
  const candidates: Array<{ zone: "top" | "bottom" | "left" | "right"; distance: number }> = []

  if (localY <= edgeY) candidates.push({ zone: "top", distance: localY })
  if (height - localY <= edgeY) candidates.push({ zone: "bottom", distance: height - localY })
  if (localX <= edgeX) candidates.push({ zone: "left", distance: localX })
  if (width - localX <= edgeX) candidates.push({ zone: "right", distance: width - localX })

  if (candidates.length === 0) return "center"

  return candidates.reduce((nearest, c) => c.distance < nearest.distance ? c : nearest).zone
}

// ─── Row Geometry ─────────────────────────────────────────────────────────────

export interface RowStackRect {
  stackId: string
  left: number
  top: number
  width: number
  height: number
}

export interface RowGeometry {
  topBandHeight: number
  bottomBandHeight: number
  stackRects: RowStackRect[]
}

function getRowColumnWidths(
  document: DocumentNode,
  rowId: string,
  availableWidth: number,
): { stackId: string; width: number }[] {
  // หา section ที่มี row นี้
  for (const section of document.document.sections) {
    const row = section.nodes[rowId]
    if (row?.type !== "row") continue

    const gap = Math.max(0, row.props.gap ?? 0)
    const totalGap = gap * Math.max(0, row.childIds.length - 1)
    const contentWidth = Math.max(0, availableWidth - totalGap)

    const shares = row.childIds.map((childId) => {
      const child = section.nodes[childId]
      return child?.type === "stack" && typeof child.props.widthShare === "number"
        ? child.props.widthShare
        : 0
    })

    const totalShare = shares.reduce((sum, s) => sum + s, 0)
    let assigned = 0

    return row.childIds.map((stackId, index) => {
      if (index === row.childIds.length - 1) {
        return { stackId, width: Math.max(0, contentWidth - assigned) }
      }
      const width = totalShare > 0
        ? Math.max(0, contentWidth * (shares[index] / totalShare))
        : contentWidth / Math.max(1, row.childIds.length)
      assigned += width
      return { stackId, width }
    })
  }

  return []
}

export function getRowGeometry(
  document: DocumentNode,
  rowId: string,
  width: number,
  height: number,
): RowGeometry | null {
  const { edgeY } = getNodeZoneEdges(width, height)
  const topBandHeight = Math.min(edgeY, Math.max(0, height))
  const bottomBandHeight = height >= edgeY * 2 ? edgeY : 0
  const innerTop = topBandHeight
  const innerHeight = Math.max(0, height - topBandHeight - bottomBandHeight)

  const columns = getRowColumnWidths(document, rowId, width)
  let x = 0
  const stackRects: RowStackRect[] = columns.map(({ stackId, width: colWidth }) => {
    const rect = { stackId, left: x, top: innerTop, width: colWidth, height: innerHeight }
    x += colWidth
    return rect
  })

  return { topBandHeight, bottomBandHeight, stackRects }
}

// ─── Target Detection ─────────────────────────────────────────────────────────

function isRowLikeDragSource(document: DocumentNode, source?: DragSource | null): boolean {
  if (source == null) return false
  if (source.source === "palette") return source.blockType === "row" || source.blockType === "columns"

  for (const section of document.document.sections) {
    const node = section.nodes[source.nodeId]
    if (node != null) return node.type === "row"
  }
  return false
}

function shouldRejectCenterOnEmptyStack(
  document: DocumentNode,
  stackId: string,
  zone: "left" | "center" | "right",
  source?: DragSource | null,
): boolean {
  if (zone !== "center" || !isRowLikeDragSource(document, source)) return false

  for (const section of document.document.sections) {
    const stack = section.nodes[stackId]
    if (stack?.type === "stack") return stack.childIds.length === 0
  }
  return false
}

export function detectRowTarget(
  document: DocumentNode,
  rowId: string,
  localX: number,
  localY: number,
  width: number,
  height: number,
  source?: DragSource | null,
): { zone: PlacementZone; target: PlacementTarget } | null {
  const geometry = getRowGeometry(document, rowId, width, height)
  if (geometry == null) return null

  if (localY <= geometry.topBandHeight) {
    return { zone: "row-outer-top", target: { kind: "row-outer-top", rowId } }
  }

  if (geometry.bottomBandHeight > 0 && localY >= height - geometry.bottomBandHeight) {
    return { zone: "row-outer-bottom", target: { kind: "row-outer-bottom", rowId } }
  }

  const stackRect = geometry.stackRects.find(
    (r) => localX >= r.left && localX <= r.left + r.width && localY >= r.top && localY <= r.top + r.height,
  )
  if (stackRect == null) return null

  const zone = resolveStackZone(localX - stackRect.left, stackRect.width)
  if (shouldRejectCenterOnEmptyStack(document, stackRect.stackId, zone, source)) return null

  return {
    zone,
    target: { kind: "row-stack-inner", rowId, stackId: stackRect.stackId },
  }
}

export interface DetectTargetInput {
  document: DocumentNode
  hoveredNodeId: string
  hoveredNodeType?: LayoutNode["type"] | null
  localX: number
  localY: number
  width: number
  height: number
  source?: DragSource | null
}

function findNodeType(document: DocumentNode, nodeId: string): LayoutNode["type"] | null {
  for (const section of document.document.sections) {
    const node = section.nodes[nodeId]
    if (node != null) return node.type
  }
  return null
}

function findNearestRowStack(document: DocumentNode, nodeId: string): { rowId: string; stackId: string } | null {
  for (const section of document.document.sections) {
    // หา parent chain
    const findParent = (childId: string): string | null => {
      for (const [id, node] of Object.entries(section.nodes)) {
        if ((node.type === "body" || node.type === "stack" || node.type === "row") && node.childIds.includes(childId)) {
          return id
        }
      }
      return null
    }

    let currentId = nodeId
    while (true) {
      const parentId = findParent(currentId)
      if (parentId == null) break
      const parent = section.nodes[parentId]
      const current = section.nodes[currentId]
      if (current?.type === "stack" && parent?.type === "row") {
        return { rowId: parentId, stackId: currentId }
      }
      currentId = parentId
    }
  }
  return null
}

export function detectPlacementTarget(input: DetectTargetInput): { zone: PlacementZone; target: PlacementTarget } | null {
  const { document, hoveredNodeId, hoveredNodeType, localX, localY, width, height, source } = input
  const nodeType = findNodeType(document, hoveredNodeId) ?? hoveredNodeType ?? null
  if (nodeType == null) return null

  // row node — ใช้ row geometry
  if (nodeType === "row") {
    return detectRowTarget(document, hoveredNodeId, localX, localY, width, height, source)
  }

  // node ที่อยู่ใน row-stack → route ผ่าน row-stack semantics
  const rowStack = findNearestRowStack(document, hoveredNodeId)
  if (rowStack != null) {
    const stackZone = resolveStackZone(localX, width)
    if (shouldRejectCenterOnEmptyStack(document, rowStack.stackId, stackZone, source)) return null

    if (stackZone === "left" || stackZone === "right") {
      return {
        zone: stackZone,
        target: { kind: "row-stack-inner", rowId: rowStack.rowId, stackId: rowStack.stackId },
      }
    }

    // hovering directly on the stack column itself (not on content inside it) —
    // treat entire non-edge area as insert-into-stack, since the stack is short
    // (minHeight 24pt) and resolveNodeZone would route top/bottom to insert-before/after-row
    if (rowStack.stackId === hoveredNodeId) {
      return {
        zone: "center" as const,
        target: { kind: "row-stack-inner", rowId: rowStack.rowId, stackId: rowStack.stackId },
      }
    }
  }

  // node ทั่วไป
  const zone = resolveNodeZone(localX, localY, width, height)

  // body และ stack รับ center ได้ (insert into container)
  // paragraph รับ center ไม่ได้
  if (zone === "center" && nodeType !== "stack" && nodeType !== "body") return null

  return {
    zone,
    target: { kind: "node", nodeId: hoveredNodeId, nodeType },
  }
}
