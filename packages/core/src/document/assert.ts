import {
  DocumentNodeSchema,
  ParagraphNodeSchema,
  SpacerNodeSchema,
  TableCellNodeSchema,
  TableRowNodeSchema,
} from "../schema"
import type { DocumentNode, DocumentSection, LayoutNode, RowNode, TableCellNode, TableNode } from "../schema"

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

// ─── Table Internals ──────────────────────────────────────────────────────────

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

function assertTableInternalSchema(node: { type: string }, path: string): void {
  const schema =
    node.type === "table-row" ? TableRowNodeSchema :
    node.type === "table-cell" ? TableCellNodeSchema :
    node.type === "paragraph" ? ParagraphNodeSchema :
    node.type === "spacer" ? SpacerNodeSchema :
    null

  if (schema == null) {
    fail(path, `unsupported table internal node type "${node.type}"`)
  }

  const result = schema.safeParse(node)
  if (!result.success) {
    const issue = result.error.issues[0]
    fail(`${path}.${issue?.path.join(".") ?? ""}`, issue?.message ?? "invalid table internal node")
  }
}

function assertTableCellContents(
  table: TableNode,
  cell: TableCellNode,
  tablePath: string,
  path: string,
  reachable: Set<string>,
  seenContentParents: Map<string, string>,
): void {
  assertUniqueIds(cell.childIds, `${path}.childIds`, "cell child")

  cell.childIds.forEach((childId, index) => {
    const childPath = `${path}.childIds[${index}]`
    const child = table.nodes[childId]

    if (child == null) fail(childPath, `missing child "${childId}"`)
    if (child.type !== "paragraph" && child.type !== "spacer") {
      fail(childPath, `table cell child must be paragraph or spacer — got "${child.type}"`)
    }

    const existingParent = seenContentParents.get(childId)
    if (existingParent != null && existingParent !== cell.id) {
      fail(childPath, `node "${childId}" has multiple table cell parents`)
    }
    seenContentParents.set(childId, cell.id)

    reachable.add(childId)
    assertNoLayoutKeys(child, `${tablePath}.nodes.${childId}`)
  })
}

function assertTableGrid(
  table: TableNode,
  path: string,
  reachable: Set<string>,
  seenCellParents: Map<string, string>,
  seenContentParents: Map<string, string>,
): void {
  const colCount = table.columns.length
  const occupiedCols: Set<number>[] = Array.from(
    { length: table.rowIds.length },
    () => new Set<number>(),
  )

  table.rowIds.forEach((rowId, rowIndex) => {
    const rowPath = `${path}.nodes.${rowId}`
    const row = table.nodes[rowId]

    if (row == null) fail(`${path}.rowIds[${rowIndex}]`, `missing row "${rowId}"`)
    if (row.type !== "table-row") {
      fail(`${path}.rowIds[${rowIndex}]`, `table row id must reference table-row — got "${row.type}"`)
    }

    reachable.add(rowId)
    assertUniqueIds(row.cellIds, `${rowPath}.cellIds`, "table cell")

    let colCursor = 0
    row.cellIds.forEach((cellId, cellIndex) => {
      while (colCursor < colCount && occupiedCols[rowIndex].has(colCursor)) colCursor++
      if (colCursor >= colCount) {
        fail(`${rowPath}.cellIds[${cellIndex}]`, `cell "${cellId}" exceeds table column count`)
      }

      const cell = table.nodes[cellId]
      const cellRefPath = `${rowPath}.cellIds[${cellIndex}]`

      if (cell == null) fail(cellRefPath, `missing cell "${cellId}"`)
      if (cell.type !== "table-cell") {
        fail(cellRefPath, `table row child must be table-cell — got "${cell.type}"`)
      }

      const existingParent = seenCellParents.get(cellId)
      if (existingParent != null && existingParent !== row.id) {
        fail(cellRefPath, `cell "${cellId}" has multiple table row parents`)
      }
      seenCellParents.set(cellId, row.id)

      const colspan = cell.props.colspan ?? 1
      const rowspan = cell.props.rowspan ?? 1
      if (colCursor + colspan > colCount) {
        fail(`${path}.nodes.${cellId}.props.colspan`, `cell "${cellId}" colspan exceeds table column count`)
      }
      if (rowIndex + rowspan > table.rowIds.length) {
        fail(`${path}.nodes.${cellId}.props.rowspan`, `cell "${cellId}" rowspan exceeds table row count`)
      }

      reachable.add(cellId)
      assertTableCellContents(table, cell, path, `${path}.nodes.${cellId}`, reachable, seenContentParents)

      for (let dr = 1; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          occupiedCols[rowIndex + dr].add(colCursor + dc)
        }
      }

      colCursor += colspan
    })

    while (colCursor < colCount && occupiedCols[rowIndex].has(colCursor)) colCursor++
    if (colCursor !== colCount) {
      fail(`${rowPath}.cellIds`, `table row must fill all ${colCount} columns`)
    }
  })
}

function assertTable(table: TableNode, path: string): void {
  assertUniqueIds(table.rowIds, `${path}.rowIds`, "table row")

  if ((table.props.headerRowCount ?? 0) > table.rowIds.length) {
    fail(`${path}.props.headerRowCount`, "headerRowCount cannot exceed table row count")
  }

  Object.entries(table.nodes).forEach(([nodeId, node]) => {
    const nodePath = `${path}.nodes.${nodeId}`
    assertNodeIdMatchesKey(node, nodeId, nodePath)
    assertNoLayoutKeys(node, nodePath)
    assertTableInternalSchema(node, nodePath)
  })

  const reachable = new Set<string>()
  const seenCellParents = new Map<string, string>()
  const seenContentParents = new Map<string, string>()

  assertTableGrid(table, path, reachable, seenCellParents, seenContentParents)

  Object.keys(table.nodes).forEach((nodeId) => {
    if (!reachable.has(nodeId)) {
      fail(`${path}.nodes.${nodeId}`, `orphan table node — not reachable from table rows`)
    }
  })
}

// ─── Section Graph ────────────────────────────────────────────────────────────

function assertSectionGraph(section: DocumentSection, path: string): void {
  const reachable = new Set<string>()
  const active = new Set<string>()
  const seenParents = new Map<string, string>()

  const visit = (nodeId: string, nodePath: string): void => {
    const node = section.nodes[nodeId]

    if (node == null) fail(nodePath, `missing node "${nodeId}"`)
    if (active.has(nodeId)) fail(nodePath, `cycle detected at "${nodeId}"`)

    reachable.add(nodeId)
    assertNoLayoutKeys(node, nodePath)

    if (node.type === "table") {
      assertTable(node as unknown as TableNode, nodePath)
      return
    }

    if (node.type === "paragraph" || node.type === "spacer" || node.type === "toc") return

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
        if (child.type !== "paragraph" && child.type !== "row" && child.type !== "spacer" && child.type !== "table") {
          fail(childPath, `body child must be paragraph, row, spacer, or table — got "${child.type}"`)
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
        if (child.type !== "paragraph" && child.type !== "row" && child.type !== "spacer" && child.type !== "table") {
          fail(childPath, `stack child must be paragraph, row, spacer, or table — got "${child.type}"`)
        }
      }

      visit(childId, `${path}.nodes.${childId}`)
    })

    // ตรวจ widthShare sum หลัง visit children ครบ
    if (node.type === "row") {
      assertWidthShareSum(section, node, nodePath)
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
  visitRoot(section.bodyRootId, "bodyRootId", "body")
  visitRoot(section.footerRootId, "footerRootId", "stack")

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

  // Pass 2: Graph invariants (tree law, orphans, cycles, widthShare sum)
  doc.document.sections.forEach((section, index) => {
    assertSectionGraph(section, `document.sections[${index}]`)
  })
}
