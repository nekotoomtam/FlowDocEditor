import {
  DocumentNodeSchema,
  DividerNodeSchema,
  FlowTableCellNodeSchema,
  FlowTableRowNodeSchema,
  PageBreakNodeSchema,
  ParagraphNodeSchema,
  SpacerNodeSchema,
} from "../schema"
import type { DocumentNode, DocumentSection, FlowRowNode, FlowTableCellNode, FlowTableNode, LayoutNode, ListStyleDefinition, ParagraphNode, RowNode } from "../schema"
import { FlowTableGridError, resolveFlowTableGrid } from "./flowTableGrid"

// ─── Error Types ──────────────────────────────────────────────────────────────

export interface AssertError {
  path: string
  message: string
}

export class DocumentAssertionError extends Error {
  constructor(public readonly errors: AssertError[]) {
    super(errors.map((e) => `[${e.path}] ${e.message}`).join("\n"))
    this.name = "DocumentAssertionError"
  }
}

function fail(path: string, message: string): never {
  throw new DocumentAssertionError([{ path, message }])
}

// ─── Schema Validation (Zod) ──────────────────────────────────────────────────

function assertSchema(doc: unknown): asserts doc is DocumentNode {
  const result = DocumentNodeSchema.safeParse(doc)
  if (!result.success) {
    const errors = result.error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }))
    throw new DocumentAssertionError(errors)
  }
}

// ─── No Layout Keys ───────────────────────────────────────────────────────────

const FORBIDDEN_LAYOUT_KEYS = ["x", "y", "width", "height"] as const

function assertNoLayoutKeys(node: object, path: string): void {
  FORBIDDEN_LAYOUT_KEYS.forEach((key) => {
    if (key in node) {
      fail(path, `"${key}" is not allowed in document model`)
    }
  })
}

// ─── Width Share ──────────────────────────────────────────────────────────────

function assertWidthShareSum(section: DocumentSection, row: RowNode, path: string): void {
  const total = Number(
    row.childIds
      .reduce((sum, childId) => {
        const child = section.nodes[childId]
        return sum + (child?.type === "stack" ? child.props.widthShare ?? 0 : 0)
      }, 0)
      .toFixed(2),
  )

  if (total !== 100) {
    fail(`${path}.childIds`, `row stack widths must total exactly 100.00, got ${total.toFixed(2)}`)
  }
}

function assertFlowWidthShareSum(section: DocumentSection, row: FlowRowNode, path: string): void {
  const total = Number(
    row.childIds
      .reduce((sum, childId) => {
        const child = section.nodes[childId]
        return sum + (child?.type === "flow-stack" ? child.props.widthShare ?? 0 : 0)
      }, 0)
      .toFixed(2),
  )

  if (total !== 100) {
    fail(`${path}.childIds`, `flow-row stack widths must total exactly 100.00, got ${total.toFixed(2)}`)
  }
}

// ─── Nested Structure Internals ───────────────────────────────────────────────

function assertUniqueIds(ids: string[], path: string, label: string): void {
  const seen = new Set<string>()
  ids.forEach((id, index) => {
    if (seen.has(id)) fail(`${path}[${index}]`, `duplicate ${label} "${id}"`)
    seen.add(id)
  })
}

function assertNodeIdMatchesKey(node: { id: string }, key: string, path: string): void {
  if (node.id !== key) {
    fail(path, `node id "${node.id}" must match map key "${key}"`)
  }
}

// ─── List Numbering ───────────────────────────────────────────────────────────

function assertListStyle(style: ListStyleDefinition, key: string, path: string): void {
  if (style.id !== key) fail(path, `list style id "${style.id}" must match map key "${key}"`)

  const levels = new Set<number>()
  style.levels.forEach((level, index) => {
    const levelPath = `${path}.levels[${index}]`
    if (levels.has(level.level)) fail(`${levelPath}.level`, `duplicate list level ${level.level}`)
    levels.add(level.level)
    if (level.restartAfterLevel != null && level.restartAfterLevel >= level.level) {
      fail(`${levelPath}.restartAfterLevel`, "restartAfterLevel must be shallower than the level it restarts")
    }
  })
}

function collectSectionParagraphs(section: DocumentSection): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = []
  Object.values(section.nodes).forEach((node) => {
    if (node.type === "paragraph") {
      paragraphs.push(node)
      return
    }
    if (node.type !== "flow-table") return
    const table = node as unknown as FlowTableNode
    Object.values(table.nodes).forEach((inner) => {
      if (inner.type === "paragraph") paragraphs.push(inner)
    })
  })
  return paragraphs
}

function assertListReferences(doc: DocumentNode): void {
  const styles = doc.document.listStyles ?? {}
  const instances = doc.document.listInstances ?? {}

  Object.entries(styles).forEach(([key, style]) => {
    assertListStyle(style, key, `document.listStyles.${key}`)
  })

  Object.entries(instances).forEach(([key, instance]) => {
    if (instance.id !== key) fail(`document.listInstances.${key}`, `list instance id "${instance.id}" must match map key "${key}"`)
    if (styles[instance.styleId] == null) {
      fail(`document.listInstances.${key}.styleId`, `missing list style "${instance.styleId}"`)
    }
  })

  const seenItemIds = new Set<string>()
  doc.document.sections.forEach((section, sectionIndex) => {
    collectSectionParagraphs(section).forEach((paragraph) => {
      const list = paragraph.props.list
      if (!list) return
      const path = `document.sections[${sectionIndex}].nodes.${paragraph.id}.props.list`
      const instance = instances[list.instanceId]
      if (!instance) fail(`${path}.instanceId`, `missing list instance "${list.instanceId}"`)
      const style = styles[instance.styleId]
      if (!style) fail(`${path}.instanceId`, `missing list style "${instance.styleId}"`)
      if (!style.levels.some((level) => level.level === list.level)) {
        fail(`${path}.level`, `list style "${style.id}" does not define level ${list.level}`)
      }
      const itemKey = `${list.instanceId}:${list.itemId}`
      if (seenItemIds.has(itemKey)) {
        fail(`${path}.itemId`, `duplicate list itemId "${list.itemId}" in instance "${list.instanceId}"`)
      }
      seenItemIds.add(itemKey)
    })
  })
}

// ─── Flow Table Internals ────────────────────────────────────────────────────

function assertFlowTableInternalSchema(node: { type: string }, path: string): void {
  const schema =
    node.type === "flow-table-row" ? FlowTableRowNodeSchema :
    node.type === "flow-table-cell" ? FlowTableCellNodeSchema :
    node.type === "paragraph" ? ParagraphNodeSchema :
    node.type === "spacer" ? SpacerNodeSchema :
    node.type === "divider" ? DividerNodeSchema :
    node.type === "page-break" ? PageBreakNodeSchema :
    null

  if (schema == null) {
    fail(path, `unsupported flow-table internal node type "${node.type}"`)
  }

  const result = schema.safeParse(node)
  if (!result.success) {
    const issue = result.error.issues[0]
    fail(`${path}.${issue?.path.join(".") ?? ""}`, issue?.message ?? "invalid flow-table internal node")
  }
}

function assertFlowTableCellContents(
  table: FlowTableNode,
  cell: FlowTableCellNode,
  tablePath: string,
  path: string,
  reachable: Set<string>,
  seenContentParents: Map<string, string>,
): void {
  assertUniqueIds(cell.childIds, `${path}.childIds`, "flow-table cell child")

  cell.childIds.forEach((childId, index) => {
    const childPath = `${path}.childIds[${index}]`
    const child = table.nodes[childId]

    if (child == null) fail(childPath, `missing child "${childId}"`)
    if (child.type !== "paragraph" && child.type !== "spacer") {
      fail(childPath, `flow-table cell child must be paragraph or spacer — got "${child.type}"`)
    }

    const existingParent = seenContentParents.get(childId)
    if (existingParent != null && existingParent !== cell.id) {
      fail(childPath, `node "${childId}" has multiple flow-table cell parents`)
    }
    seenContentParents.set(childId, cell.id)

    reachable.add(childId)
    assertNoLayoutKeys(child, `${tablePath}.nodes.${childId}`)
  })
}

function assertFlowTableCellMergeMap(cell: FlowTableCellNode, path: string): void {
  const mergeMap = cell.props.mergeMap
  if (mergeMap == null) return

  const rowspan = cell.props.rowspan ?? 1
  const colspan = cell.props.colspan ?? 1
  const cellChildIds = new Set(cell.childIds)
  const mappedChildIds = new Set<string>()

  mergeMap.entries.forEach((entry, entryIndex) => {
    const entryPath = `${path}.props.mergeMap.entries[${entryIndex}]`
    if (entry.rowOffset >= rowspan) {
      fail(`${entryPath}.rowOffset`, `mergeMap rowOffset must be within cell rowspan ${rowspan}`)
    }
    if (entry.colOffset >= colspan) {
      fail(`${entryPath}.colOffset`, `mergeMap colOffset must be within cell colspan ${colspan}`)
    }

    entry.childIds.forEach((childId, childIndex) => {
      const childPath = `${entryPath}.childIds[${childIndex}]`
      if (!cellChildIds.has(childId)) {
        fail(childPath, `mergeMap child "${childId}" must be in the cell childIds`)
      }
      if (mappedChildIds.has(childId)) {
        fail(childPath, `mergeMap child "${childId}" must not be mapped more than once`)
      }
      mappedChildIds.add(childId)
    })
  })
}

function assertFlowTable(table: FlowTableNode, path: string): void {
  assertUniqueIds(table.rowIds, `${path}.rowIds`, "flow-table row")

  if ((table.props.headerRowCount ?? 0) > table.rowIds.length) {
    fail(`${path}.props.headerRowCount`, "headerRowCount cannot exceed flow-table row count")
  }

  Object.entries(table.nodes).forEach(([nodeId, node]) => {
    const nodePath = `${path}.nodes.${nodeId}`
    assertNodeIdMatchesKey(node, nodeId, nodePath)
    assertNoLayoutKeys(node, nodePath)
    assertFlowTableInternalSchema(node, nodePath)
  })

  const reachable = new Set<string>()
  const seenCellParents = new Map<string, string>()
  const seenContentParents = new Map<string, string>()

  table.rowIds.forEach((rowId, rowIndex) => {
    const rowPath = `${path}.nodes.${rowId}`
    const row = table.nodes[rowId]

    if (row == null) fail(`${path}.rowIds[${rowIndex}]`, `missing row "${rowId}"`)
    if (row.type !== "flow-table-row") {
      fail(`${path}.rowIds[${rowIndex}]`, `flow-table row id must reference flow-table-row — got "${row.type}"`)
    }

    reachable.add(rowId)
    assertUniqueIds(row.cellIds, `${rowPath}.cellIds`, "flow-table cell")

    row.cellIds.forEach((cellId, cellIndex) => {
      const cellRefPath = `${rowPath}.cellIds[${cellIndex}]`
      const cell = table.nodes[cellId]

      if (cell == null) fail(cellRefPath, `missing cell "${cellId}"`)
      if (cell.type !== "flow-table-cell") {
        fail(cellRefPath, `flow-table row child must be flow-table-cell — got "${cell.type}"`)
      }

      const existingParent = seenCellParents.get(cellId)
      if (existingParent != null && existingParent !== row.id) {
        fail(cellRefPath, `cell "${cellId}" has multiple flow-table row parents`)
      }
      seenCellParents.set(cellId, row.id)

      reachable.add(cellId)
      assertFlowTableCellContents(table, cell, path, `${path}.nodes.${cellId}`, reachable, seenContentParents)
      assertFlowTableCellMergeMap(cell, `${path}.nodes.${cellId}`)
    })
  })

  try {
    resolveFlowTableGrid(table)
  } catch (error) {
    if (error instanceof FlowTableGridError) {
      fail(`${path}.nodes`, error.message)
    }
    throw error
  }

  Object.keys(table.nodes).forEach((nodeId) => {
    if (!reachable.has(nodeId)) {
      fail(`${path}.nodes.${nodeId}`, `orphan flow-table node — not reachable from flow-table rows`)
    }
  })
}

// ─── Section Graph ────────────────────────────────────────────────────────────

function assertSectionGraph(section: DocumentSection, path: string): void {
  const reachable = new Set<string>()
  const active = new Set<string>()
  const seenParents = new Map<string, string>()
  const zoneRootIds = new Set(
    [
      section.headerRootId,
      section.headerFirstPageRootId,
      section.footerRootId,
      section.footerFirstPageRootId,
    ].filter((id): id is string => typeof id === "string"),
  )

  const visit = (nodeId: string, nodePath: string): void => {
    const node = section.nodes[nodeId]

    if (node == null) fail(nodePath, `missing node "${nodeId}"`)
    if (active.has(nodeId)) fail(nodePath, `cycle detected at "${nodeId}"`)

    reachable.add(nodeId)
    assertNoLayoutKeys(node, nodePath)

    if (node.type === "flow-table") {
      assertFlowTable(node as unknown as FlowTableNode, nodePath)
      return
    }

    if (node.type === "paragraph" || node.type === "spacer" || node.type === "divider" || node.type === "page-break" || node.type === "toc") return

    active.add(nodeId)

    node.childIds.forEach((childId, index) => {
      const child = section.nodes[childId]
      const childPath = `${nodePath}.childIds[${index}]`

      if (child == null) fail(childPath, `missing child "${childId}"`)

      // ห้าม multiple parents
      const existingParent = seenParents.get(childId)
      if (existingParent != null && existingParent !== node.id) {
        fail(childPath, `node "${childId}" has multiple parents`)
      }
      seenParents.set(childId, node.id)

      // Tree law enforcement
      if (node.type === "body") {
        if (child.type !== "paragraph" && child.type !== "row" && child.type !== "flow-row" && child.type !== "spacer" && child.type !== "divider" && child.type !== "page-break" && child.type !== "flow-table" && child.type !== "toc") {
          fail(childPath, `body child must be paragraph, row, flow-row, spacer, divider, page-break, flow-table, or toc — got "${child.type}"`)
        }
      }

      if (node.type === "row") {
        if (child.type !== "stack") {
          fail(childPath, `row child must be stack — got "${child.type}"`)
        }
        // stack ใน row ต้องมี widthShare
        if (child.type === "stack" && child.props.widthShare == null) {
          fail(`${path}.nodes.${childId}.props.widthShare`, `stack inside row must have widthShare`)
        }
      }

      if (node.type === "stack") {
        const isZoneRoot = zoneRootIds.has(node.id)
        const validStackChild = child.type === "paragraph" ||
          child.type === "row" ||
          child.type === "spacer" ||
          child.type === "divider" ||
          child.type === "flow-table" ||
          child.type === "toc" ||
          (isZoneRoot && child.type === "flow-row")
        if (!validStackChild) {
          fail(childPath, `stack child must be paragraph, row, spacer, divider, flow-table, or toc${isZoneRoot ? ", or flow-row" : ""} — got "${child.type}"`)
        }
      }

      if (node.type === "flow-row") {
        if (child.type !== "flow-stack") {
          fail(childPath, `flow-row child must be flow-stack — got "${child.type}"`)
        }
        if (child.type === "flow-stack" && child.props.widthShare == null) {
          fail(`${path}.nodes.${childId}.props.widthShare`, `flow-stack inside flow-row must have widthShare`)
        }
      }

      if (node.type === "flow-stack") {
        if (child.type !== "paragraph" && child.type !== "spacer" && child.type !== "divider") {
          fail(childPath, `flow-stack child must be paragraph, spacer, or divider — got "${child.type}"`)
        }
      }

      visit(childId, `${path}.nodes.${childId}`)
    })

    // ตรวจ widthShare sum หลัง visit children ครบ
    if (node.type === "row") {
      assertWidthShareSum(section, node, nodePath)
    } else if (node.type === "flow-row") {
      assertFlowWidthShareSum(section, node, nodePath)
    }

    active.delete(nodeId)
  }

  // Visit จาก roots
  const visitRoot = (rootId: string | null | undefined, label: string, expectedType: "body" | "stack"): void => {
    if (rootId == null) {
      if (label === "bodyRootId") fail(`${path}.${label}`, "body root is required")
      return
    }

    const root = section.nodes[rootId]
    if (root?.type !== expectedType) {
      fail(`${path}.${label}`, `expected "${rootId}" to be ${expectedType} — got "${root?.type}"`)
    }

    visit(rootId, `${path}.nodes.${rootId}`)
  }

  visitRoot(section.headerRootId, "headerRootId", "stack")
  visitRoot(section.headerFirstPageRootId, "headerFirstPageRootId", "stack")
  visitRoot(section.bodyRootId, "bodyRootId", "body")
  visitRoot(section.footerRootId, "footerRootId", "stack")
  visitRoot(section.footerFirstPageRootId, "footerFirstPageRootId", "stack")

  // ตรวจ orphan nodes
  Object.keys(section.nodes).forEach((nodeId) => {
    if (!reachable.has(nodeId)) {
      fail(`${path}.nodes.${nodeId}`, `orphan node — not reachable from any root`)
    }
  })
}

// ─── Main Assert ──────────────────────────────────────────────────────────────

export function assertDocument(doc: unknown): asserts doc is DocumentNode {
  // Pass 1: Zod schema validation
  assertSchema(doc)

  // Pass 2: List numbering references
  assertListReferences(doc)

  // Pass 3: Graph invariants (tree law, orphans, cycles, widthShare sum)
  doc.document.sections.forEach((section, index) => {
    assertSectionGraph(section, `document.sections[${index}]`)
  })
}
