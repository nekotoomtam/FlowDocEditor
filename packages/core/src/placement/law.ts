import type { DocumentNode, FlowTableNode, LayoutNode, TableNode } from "../schema"
import type {
  DragSource,
  PaletteBlockType,
  PlacementDecision,
  PlacementError,
  PlacementErrorCode,
  PlacementOperation,
  PlacementContainerType,
  PlacementResult,
  RawPlacementIntent,
  ValidPlacementIntent,
} from "./types"

/**
 * law — แปลง raw intent → valid operation
 *
 * กฎหลัก:
 * - ไม่ mutate document
 * - ทุก path ต้อง return PlacementResult (ok/error)
 * - ไม่มี side effects
 */

// ─── Tree Helpers ─────────────────────────────────────────────────────────────

interface NodeLocation {
  section: { id: string; nodes: Record<string, LayoutNode> }
  node: LayoutNode
  parent: (LayoutNode & { childIds: string[] }) | null
  index: number
}

function findLocation(document: DocumentNode, nodeId: string): NodeLocation | null {
  for (const section of document.document.sections) {
    const node = section.nodes[nodeId]
    if (node == null) {
      for (const candidate of Object.values(section.nodes)) {
        if (candidate.type !== "table" && candidate.type !== "flow-table") continue
        const inner = (candidate as unknown as TableNode | FlowTableNode).nodes[nodeId]
        if (inner?.type === "paragraph") {
          return { section, node: inner, parent: null, index: 0 }
        }
      }
      continue
    }

    // หา parent
    for (const [, candidate] of Object.entries(section.nodes)) {
      if (
        (candidate.type === "body" || candidate.type === "stack" || candidate.type === "row" || candidate.type === "flow-row" || candidate.type === "flow-stack") &&
        candidate.childIds.includes(nodeId)
      ) {
        const index = candidate.childIds.indexOf(nodeId)
        return { section, node, parent: candidate, index }
      }
    }

    // root node (ไม่มี parent)
    return { section, node, parent: null, index: 0 }
  }
  return null
}

function getSubtreeIds(document: DocumentNode, nodeId: string): Set<string> {
  const ids = new Set<string>()
  for (const section of document.document.sections) {
    const visit = (id: string) => {
      if (ids.has(id)) return
      const node = section.nodes[id]
      if (node == null) return
      ids.add(id)
      if ("childIds" in node) {
        (node as { childIds: string[] }).childIds.forEach(visit)
      }
    }
    visit(nodeId)
    if (ids.size > 0) break
  }
  return ids
}

function isNestedInRow(document: DocumentNode, nodeId: string): boolean {
  for (const section of document.document.sections) {
    const findParent = (childId: string): string | null => {
      for (const [id, node] of Object.entries(section.nodes)) {
        if ((node.type === "body" || node.type === "stack" || node.type === "row" || node.type === "flow-row" || node.type === "flow-stack") && node.childIds.includes(childId)) {
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
      if (parent?.type === "row") return true
      currentId = parentId
    }
  }
  return false
}

function findDirectRowAnchor(document: DocumentNode, nodeId: string): { rowId: string; childNodeId: string } | null {
  for (const section of document.document.sections) {
    const findParent = (childId: string): { parentId: string; parent: LayoutNode } | null => {
      for (const [id, node] of Object.entries(section.nodes)) {
        if ((node.type === "body" || node.type === "stack" || node.type === "row" || node.type === "flow-row" || node.type === "flow-stack") && node.childIds.includes(childId)) {
          return { parentId: id, parent: node }
        }
      }
      return null
    }

    let currentId = nodeId
    while (true) {
      const result = findParent(currentId)
      if (result == null) break
      if (result.parent.type === "row") {
        return { rowId: result.parentId, childNodeId: currentId }
      }
      currentId = result.parentId
    }
  }
  return null
}

// ─── Width Constraint ─────────────────────────────────────────────────────────

function splitWidthPercent(percent: number): { original: number; inserted: number } {
  const safe = Math.round(Math.max(percent, 0) * 100) / 100
  const original = Math.floor((safe / 2) * 100) / 100
  return { original, inserted: Math.round((safe - original) * 100) / 100 }
}

function canExpandRow(document: DocumentNode, stackId: string, minRatio = 0.1): boolean {
  const location = findLocation(document, stackId)
  if (location?.node.type !== "stack") return false

  const widthShare = location.node.props.widthShare ?? 100
  const { original, inserted } = splitWidthPercent(widthShare)

  // ตรวจว่าทั้งสอง stack จะกว้างพอ (อิง page width)
  // ใช้ ratio แทน pt เพราะ law layer ไม่รู้ page metrics
  return original >= minRatio * 100 && inserted >= minRatio * 100
}

// ─── Result Builders ──────────────────────────────────────────────────────────

function ok(intent: ValidPlacementIntent, operation: PlacementOperation): PlacementResult {
  return { ok: true, value: { intent, operation } }
}

function err(rawIntent: RawPlacementIntent, code: PlacementErrorCode, message: string): PlacementResult {
  return { ok: false, error: { code, message, rawIntent } }
}

function makeIntent(
  raw: RawPlacementIntent,
  targetNodeId: string,
  parentNodeId: string | null,
  targetParentType: LayoutNode["type"] | null,
): ValidPlacementIntent {
  return { ...raw, targetNodeId, parentNodeId, targetParentType }
}

// ─── Source Helpers ───────────────────────────────────────────────────────────

function getSourceNodeId(source?: DragSource | null): string | null {
  return source?.source === "document" ? source.nodeId : null
}

function getSourceBlockType(document: DocumentNode, source?: DragSource | null): LayoutNode["type"] | null {
  if (source == null) return null
  if (source.source === "field") return null
  if (source.source === "palette") {
    if (source.blockType === "row" || source.blockType === "columns" || source.blockType === "flow-columns") return "flow-row"
    return source.blockType
  }
  const location = findLocation(document, source.nodeId)
  return location?.node.type ?? null
}

function isStructuralStackSource(document: DocumentNode, source?: DragSource | null): boolean {
  const sourceType = getSourceBlockType(document, source)
  return sourceType === "stack" || sourceType === "flow-stack"
}

function getPaletteBlockType(source?: DragSource | null): PaletteBlockType | null {
  return source?.source === "palette" ? source.blockType : null
}

function isFieldSource(source?: DragSource | null): boolean {
  return source?.source === "field"
}

function isInlineFieldSource(source?: DragSource | null): boolean {
  if (source?.source !== "field") return false
  return source.field.fieldType !== "image" && source.field.fieldType !== "collection"
}

function getPaletteStackInsertCount(source?: DragSource | null): number | null {
  if (source?.source !== "palette") return null
  // Row/Columns palette entries are flow-backed now. Legacy row stack insertion
  // remains available only through explicit legacy operations, not palette law.
  return null
}

function isRowLikeSource(document: DocumentNode, source?: DragSource | null): boolean {
  const sourceType = getSourceBlockType(document, source)
  return sourceType === "row" || sourceType === "flow-row"
}

function isFlowStackContentSource(document: DocumentNode, source?: DragSource | null): boolean {
  const sourceType = getSourceBlockType(document, source)
  return sourceType === "paragraph" || sourceType === "spacer"
}

function isRowStackTarget(location: NodeLocation | null, rowId: string): location is NodeLocation & {
  node: Extract<LayoutNode, { type: "stack" | "flow-stack" }>
  parent: Extract<LayoutNode, { type: "row" | "flow-row" }> & { childIds: string[] }
} {
  if (location == null) return false
  if (location.node.type === "stack" && location.parent?.type === "row" && location.parent.id === rowId) return true
  if (location.node.type === "flow-stack" && location.parent?.type === "flow-row" && location.parent.id === rowId) return true
  return false
}

// ─── Subtree Check ────────────────────────────────────────────────────────────

function rejectSubtree(
  document: DocumentNode,
  rawIntent: RawPlacementIntent,
  sourceNodeId: string | null,
  targetNodeId: string,
): PlacementResult | null {
  if (sourceNodeId == null) return null

  const sourceLocation = findLocation(document, sourceNodeId)
  const targetLocation = findLocation(document, targetNodeId)

  if (sourceLocation == null || targetLocation == null) {
    return err(rawIntent, "missing-target", "Source or target could not be resolved.")
  }

  if (sourceLocation.section.id !== targetLocation.section.id) {
    return err(rawIntent, "cross-section", "Cannot move nodes across sections.")
  }

  if (getSubtreeIds(document, sourceNodeId).has(targetNodeId)) {
    return err(rawIntent, "cyclic-placement", "Cannot move a node into its own subtree.")
  }

  return null
}

// ─── Row Expansion ────────────────────────────────────────────────────────────

function createRowExpansion(
  document: DocumentNode,
  rawIntent: RawPlacementIntent,
  zone: "left" | "right",
  rowId: string,
  targetStackId: string,
  index: number,
): PlacementResult {
  if (!canExpandRow(document, targetStackId)) {
    return err(rawIntent, "invalid-row-split", "Row split would violate minimum stack width.")
  }

  const intent = makeIntent(rawIntent, targetStackId, rowId, "row")
  return ok(intent, {
    kind: zone === "left" ? "expand-row-left" : "expand-row-right",
    rowId,
    targetStackId,
    index,
  })
}

// ─── Law Resolvers ────────────────────────────────────────────────────────────

function resolveNodeLaw(document: DocumentNode, rawIntent: RawPlacementIntent, source?: DragSource | null): PlacementResult {
  const { zone, target } = rawIntent
  if (target.kind !== "node") return err(rawIntent, "invalid-target", "Expected node target.")

  const sourceNodeId = getSourceNodeId(source)
  const paletteBlockType = getPaletteBlockType(source)
  const location = findLocation(document, target.nodeId)

  if (location == null) return err(rawIntent, "missing-target", `Node "${target.nodeId}" not found.`)

  if (isFieldSource(source)) {
    if (zone !== "center" || location.node.type !== "paragraph") {
      return err(rawIntent, "invalid-target", "Fields can only be inserted into paragraphs.")
    }
    if (!isInlineFieldSource(source)) {
      return err(rawIntent, "invalid-source", "This field type needs a block/control node.")
    }

    const intent = makeIntent(rawIntent, target.nodeId, location.parent?.id ?? null, location.parent?.type ?? null)
    return ok(intent, {
      kind: "insert-inline-field",
      paragraphId: target.nodeId,
      index: location.node.children.length,
    })
  }

  // center → insert into container
  if (zone === "center") {
    if (location.node.type !== "stack" && location.node.type !== "body" && location.node.type !== "flow-stack") {
      return err(rawIntent, "invalid-zone", "Center placement only allowed on body, stack, or flow-stack.")
    }
    if (isRowLikeSource(document, source) && (location.node.type === "stack" || location.node.type === "flow-stack")) {
      return err(rawIntent, "invalid-parent", "Cannot create columns inside a column.")
    }
    if (location.node.type === "flow-stack" && !isFlowStackContentSource(document, source)) {
      return err(rawIntent, "invalid-parent", "Flow stack can only contain paragraph or spacer nodes.")
    }
    const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, target.nodeId)
    if (subtreeErr != null) return subtreeErr

    const node = location.node as LayoutNode & { childIds: string[] }
    const intent = makeIntent(rawIntent, target.nodeId, target.nodeId, location.node.type)
    return ok(intent, {
      kind: "insert-into-container",
      containerId: target.nodeId,
      containerType: location.node.type as PlacementContainerType,
      index: node.childIds.length,
    })
  }

  // top/bottom → vertical placement
  if (zone === "top" || zone === "bottom") {
    if (location.parent == null) return err(rawIntent, "invalid-parent", "Node has no parent.")
    if (location.parent.type !== "body" && location.parent.type !== "stack" && location.parent.type !== "flow-stack") {
      return err(rawIntent, "invalid-parent", "Vertical placement requires body, stack, or flow-stack parent.")
    }
    if (isRowLikeSource(document, source) && (location.parent.type === "stack" || location.parent.type === "flow-stack")) {
      return err(rawIntent, "invalid-parent", "Row-like source cannot be inserted into a stack.")
    }
    if (location.parent.type === "flow-stack" && !isFlowStackContentSource(document, source)) {
      return err(rawIntent, "invalid-parent", "Flow stack can only contain paragraph or spacer nodes.")
    }
    if (paletteBlockType === "columns" && location.parent.type === "stack" && isNestedInRow(document, location.parent.id)) {
      return err(rawIntent, "invalid-parent", "Columns cannot be inserted into a stack already in a row.")
    }

    const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, target.nodeId)
    if (subtreeErr != null) return subtreeErr

    const intent = makeIntent(rawIntent, target.nodeId, location.parent.id, location.parent.type)
    return ok(intent, {
      kind: zone === "top" ? "insert-before" : "insert-after",
      parentId: location.parent.id,
      parentType: location.parent.type as PlacementContainerType,
      index: zone === "top" ? location.index : location.index + 1,
      anchorNodeId: target.nodeId,
    })
  }

  // left/right → horizontal placement
  if (zone === "left" || zone === "right") {
    const stackInsertCount = getPaletteStackInsertCount(source)

    const rowAnchor = findDirectRowAnchor(document, target.nodeId)
    if (rowAnchor != null) {
      const rowLocation = findLocation(document, rowAnchor.rowId)
      if (rowLocation?.node.type !== "row") return err(rawIntent, "invalid-target", "Row anchor not found.")
      const stackIndex = (rowLocation.node as LayoutNode & { childIds: string[] }).childIds.indexOf(rowAnchor.childNodeId)
      const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, rowAnchor.childNodeId)
      if (subtreeErr != null) return subtreeErr

      if (stackInsertCount != null) {
        const intent = makeIntent(rawIntent, rowAnchor.childNodeId, rowAnchor.rowId, "row")
        return ok(intent, {
          kind: "insert-stacks-into-row",
          rowId: rowAnchor.rowId,
          targetStackId: rowAnchor.childNodeId,
          index: zone === "left" ? stackIndex : stackIndex + 1,
          count: stackInsertCount,
        })
      }

      if (isRowLikeSource(document, source)) {
        return err(rawIntent, "invalid-zone", "Row-like source cannot expand an existing row.")
      }

      return createRowExpansion(
        document, rawIntent, zone,
        rowAnchor.rowId, rowAnchor.childNodeId,
        zone === "left" ? stackIndex : stackIndex + 1,
      )
    }

    if (isRowLikeSource(document, source)) {
      return err(rawIntent, "invalid-zone", "Row-like source cannot be placed on left/right edges.")
    }

    if (location.parent == null) return err(rawIntent, "invalid-parent", "Node has no parent.")
    if (location.parent.type !== "body" && location.parent.type !== "stack") {
      return err(rawIntent, "invalid-parent", "Horizontal placement requires body or stack parent.")
    }
    if (location.parent.type === "stack") {
      return err(rawIntent, "invalid-parent", "Cannot create columns inside a column.")
    }

    const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, target.nodeId)
    if (subtreeErr != null) return subtreeErr

    const intent = makeIntent(rawIntent, target.nodeId, location.parent.id, location.parent.type)
    return ok(intent, {
      kind: zone === "left" ? "wrap-in-row-left" : "wrap-in-row-right",
      parentId: location.parent.id,
      parentType: location.parent.type as "body" | "stack",
      index: location.index,
      targetNodeId: target.nodeId,
    })
  }

  return err(rawIntent, "invalid-zone", `Unhandled zone "${zone}".`)
}

function resolveRowOuterLaw(document: DocumentNode, rawIntent: RawPlacementIntent, source?: DragSource | null): PlacementResult {
  const { target } = rawIntent
  if (target.kind !== "row-outer-top" && target.kind !== "row-outer-bottom") {
    return err(rawIntent, "invalid-target", "Expected row-outer target.")
  }

  const rowLocation = findLocation(document, target.rowId)
  if (rowLocation?.node.type !== "row" && rowLocation?.node.type !== "flow-row") return err(rawIntent, "invalid-target", "Row not found.")
  if (rowLocation.parent?.type !== "body" && rowLocation.parent?.type !== "stack") {
    return err(rawIntent, "invalid-target", "Row must be under body or stack.")
  }

  const sourceNodeId = getSourceNodeId(source)
  const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, target.rowId)
  if (subtreeErr != null) return subtreeErr

  const isTop = target.kind === "row-outer-top"
  const intent = makeIntent(rawIntent, target.rowId, rowLocation.parent.id, rowLocation.parent.type)
  return ok(intent, {
    kind: isTop ? "insert-before" : "insert-after",
    parentId: rowLocation.parent.id,
    parentType: rowLocation.parent.type as "body" | "stack",
    index: isTop ? rowLocation.index : rowLocation.index + 1,
    anchorNodeId: target.rowId,
  })
}

function resolveRowStackLaw(document: DocumentNode, rawIntent: RawPlacementIntent, source?: DragSource | null): PlacementResult {
  const { zone, target } = rawIntent
  if (target.kind !== "row-stack-inner") return err(rawIntent, "invalid-target", "Expected row-stack-inner target.")

  const stackLocation = findLocation(document, target.stackId)
  if (!isRowStackTarget(stackLocation, target.rowId)) {
    return err(rawIntent, "invalid-target", "Stack is not a child of the target row.")
  }
  const rowType = stackLocation.parent.type
  const stackType = stackLocation.node.type

  const sourceNodeId = getSourceNodeId(source)
  const paletteBlockType = getPaletteBlockType(source)

  const subtreeErr = rejectSubtree(document, rawIntent, sourceNodeId, target.stackId)
  if (subtreeErr != null) return subtreeErr

  if (zone === "left" || zone === "right") {
    if (rowType === "flow-row") {
      return err(rawIntent, "invalid-zone", "Flow-row column insertion requires an explicit flow-stack operation.")
    }

    const stackInsertCount = getPaletteStackInsertCount(source)
    if (stackInsertCount != null) {
      const intent = makeIntent(rawIntent, target.stackId, target.rowId, "row")
      return ok(intent, {
        kind: "insert-stacks-into-row",
        rowId: target.rowId,
        targetStackId: target.stackId,
        index: zone === "left" ? stackLocation.index : stackLocation.index + 1,
        count: stackInsertCount,
      })
    }

    if (isRowLikeSource(document, source)) {
      return err(rawIntent, "invalid-zone", "Row-like source cannot expand an existing row.")
    }

    return createRowExpansion(
      document, rawIntent, zone,
      target.rowId, target.stackId,
      zone === "left" ? stackLocation.index : stackLocation.index + 1,
    )
  }

  if (zone === "center") {
    if (isRowLikeSource(document, source)) {
      return err(rawIntent, "invalid-zone", "Row-like source cannot be inserted into row stack center.")
    }
    if (stackType === "flow-stack" && !isFlowStackContentSource(document, source)) {
      return err(rawIntent, "invalid-parent", "Flow stack can only contain paragraph or spacer nodes.")
    }
    if (paletteBlockType === "columns" && isNestedInRow(document, target.stackId)) {
      return err(rawIntent, "invalid-parent", "Columns cannot be inserted into a stack already in a row.")
    }

    const node = stackLocation.node as LayoutNode & { childIds: string[] }
    const intent = makeIntent(rawIntent, target.stackId, target.stackId, stackType)
    return ok(intent, {
      kind: "insert-into-container",
      containerId: target.stackId,
      containerType: stackType,
      index: node.childIds.length,
    })
  }

  return err(rawIntent, "invalid-zone", `Unhandled zone "${zone}" for row-stack-inner.`)
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function resolvePlacementLaw(
  document: DocumentNode,
  rawIntent: RawPlacementIntent,
  source?: DragSource | null,
): PlacementResult {
  if (isStructuralStackSource(document, source)) {
    return err(rawIntent, "invalid-source", "Stack nodes are structural row regions and cannot be dragged as standalone blocks.")
  }

  const { target } = rawIntent

  if (target.kind === "row-outer-top" || target.kind === "row-outer-bottom") {
    return resolveRowOuterLaw(document, rawIntent, source)
  }

  if (target.kind === "row-stack-inner") {
    return resolveRowStackLaw(document, rawIntent, source)
  }

  return resolveNodeLaw(document, rawIntent, source)
}
