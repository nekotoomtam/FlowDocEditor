import { canRemoveFlowTableColumn, canRemoveFlowTableRow } from "@/document"
import { tryResolveFlowTableGrid } from "@/document/flowTableGrid"
import type { PageFragment } from "@/pagination"
import type { DragSource, PlacementIntentType, PlacementPreview, PlacementZone } from "@/placement/types"
import type { DocumentNode, FlowTableNode } from "@/schema"
import type { CanvasTableAction } from "../EditorCanvas"

type CanvasFlowTableActionScope =
  | { type: "table"; table: FlowTableNode; tableId: string }
  | { type: "row"; table: FlowTableNode; tableId: string; rowIndex: number }
  | { type: "cell"; table: FlowTableNode; tableId: string; columnIndex: number; columnEndIndex: number }

export type CanvasFlowTableActionTarget =
  | { type: "add-row"; tableId: string; afterIndex?: number }
  | { type: "delete-row"; tableId: string; rowIndex: number }
  | { type: "add-column"; tableId: string; afterIndex?: number }
  | { type: "delete-column"; tableId: string; colIndex: number }
  | { type: "delete-table"; tableId: string }

function resolveCanvasFlowTableActionScope(doc: DocumentNode, nodeId: string): CanvasFlowTableActionScope | null {
  for (const section of doc.document.sections) {
    const sectionNode = section.nodes[nodeId]
    if (sectionNode?.type === "flow-table") {
      return { type: "table", table: sectionNode as unknown as FlowTableNode, tableId: nodeId }
    }

    for (const [tableId, node] of Object.entries(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (!inner) continue

      if (inner.type === "flow-table-row") {
        const rowIndex = table.rowIds.indexOf(nodeId)
        return rowIndex >= 0 ? { type: "row", table, tableId, rowIndex } : null
      }

      if (inner.type === "flow-table-cell") {
        const resolved = tryResolveFlowTableGrid(table)
        if (!resolved.ok) return null
        const placement = resolved.grid.placementsByCellId.get(nodeId)
        return placement
          ? { type: "cell", table, tableId, columnIndex: placement.columnIndex, columnEndIndex: placement.columnEndIndex }
          : null
      }
    }
  }
  return null
}

export function resolveCanvasFlowTableActionTarget(
  doc: DocumentNode,
  nodeId: string,
  action: CanvasTableAction,
): CanvasFlowTableActionTarget | null {
  const scope = resolveCanvasFlowTableActionScope(doc, nodeId)
  if (!scope) return null

  if (action === "delete-table") {
    return scope.type === "table" ? { type: "delete-table", tableId: scope.tableId } : null
  }

  const resolved = tryResolveFlowTableGrid(scope.table)
  if (!resolved.ok) return null

  if (action === "add-row") {
    if (scope.type === "table") return { type: "add-row", tableId: scope.tableId }
    if (scope.type === "row") return { type: "add-row", tableId: scope.tableId, afterIndex: scope.rowIndex }
    return null
  }
  if (action === "delete-row") {
    if (scope.type !== "row") return null
    return canRemoveFlowTableRow(scope.table, scope.rowIndex)
      ? { type: "delete-row", tableId: scope.tableId, rowIndex: scope.rowIndex }
      : null
  }

  if (action === "add-column") {
    if (scope.type === "table") return { type: "add-column", tableId: scope.tableId }
    if (scope.type === "cell") return { type: "add-column", tableId: scope.tableId, afterIndex: scope.columnEndIndex }
    return null
  }
  if (scope.type === "cell" && canRemoveFlowTableColumn(scope.table, scope.columnIndex)) {
    return { type: "delete-column", tableId: scope.tableId, colIndex: scope.columnIndex }
  }
  return null
}

export function zoneToIntent(zone: PlacementZone): PlacementIntentType {
  switch (zone) {
    case "top":
    case "row-outer-top":
      return "insertAbove"
    case "bottom":
    case "row-outer-bottom":
      return "insertBelow"
    case "left":
      return "insertLeft"
    case "right":
      return "insertRight"
    case "center":
    case "row-stack-inner":
      return "insertInside"
  }
}

const PAGE_BREAK_INTERACTION_HEIGHT = 18

export function fragmentInteractionHeightForPlacement(fragment: PageFragment): number {
  return fragment.nodeType === "page-break"
    ? PAGE_BREAK_INTERACTION_HEIGHT
    : fragment.height
}

export function findSmallestFragmentAt(fragments: PageFragment[], docX: number, docY: number): PageFragment | null {
  let hit: PageFragment | null = null
  let hitArea = Infinity
  for (const fragment of fragments) {
    const height = fragmentInteractionHeightForPlacement(fragment)
    if (
      docX >= fragment.x &&
      docX <= fragment.x + fragment.width &&
      docY >= fragment.y &&
      docY <= fragment.y + height
    ) {
      const area = fragment.width * Math.max(height, 1)
      if (area < hitArea) {
        hit = fragment
        hitArea = area
      }
    }
  }
  return hit
}

export function findPageBreakDropBlocker(
  fragments: PageFragment[],
  contentBox: { x: number; y: number; width: number; height: number },
  docX: number,
  docY: number,
): PageFragment | null {
  if (
    docX < contentBox.x ||
    docX > contentBox.x + contentBox.width ||
    docY < contentBox.y ||
    docY > contentBox.y + contentBox.height
  ) {
    return null
  }

  let blocker: PageFragment | null = null
  for (const fragment of fragments) {
    if (fragment.nodeType !== "page-break") continue
    if (docX < fragment.x || docX > fragment.x + fragment.width) continue

    const visualBottom = fragment.y + PAGE_BREAK_INTERACTION_HEIGHT
    if (docY < visualBottom) continue
    if (blocker == null || fragment.y > blocker.y) blocker = fragment
  }
  return blocker
}

export function pageBreakBlockedPreview(fragment: PageFragment): PlacementPreview {
  return {
    hoverNodeId: fragment.nodeId,
    zone: "bottom",
    target: { kind: "node", nodeId: fragment.nodeId, nodeType: "page-break" },
    placement: null,
    isValid: false,
  }
}

export function isHeaderFooterSupportedDragSource(source: DragSource): boolean {
  return source.source === "palette" && (
    source.blockType === "paragraph" ||
    source.blockType === "flow-columns"
  )
}
