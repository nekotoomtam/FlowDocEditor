import { z } from "zod"
import { DocumentNodeSchema } from "../schema"
import type { DocumentNode, DocumentSection, LayoutNode, RowNode, BodyNode, StackNode } from "../schema"

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

    if (node.type === "paragraph" || node.type === "spacer" || node.type === "table" || node.type === "toc") return

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
