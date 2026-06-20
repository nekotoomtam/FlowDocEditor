import { buildDocumentGraphIndexV2, createDefaultDocument, createDefaultFlowTable, migrateDocumentToV2 } from "@/document"
import type { DocumentNode, FlowTableNode, LayoutNode } from "@/schema"
import { describe, expect, it } from "vitest"
import { createDocumentGraphDiagnosticsFromV2 } from "../editorDocumentGraphDiagnostics"

function createDocumentWithFlowTable(rowCount = 2, columnCount = 2): { doc: DocumentNode; table: FlowTableNode; cellId: string } {
  const doc = createDefaultDocument()
  const table = createDefaultFlowTable(rowCount, columnCount)
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") {
    throw new Error("expected default document body")
  }
  const firstRow = table.nodes[table.rowIds[0]]
  if (firstRow?.type !== "flow-table-row") {
    throw new Error("expected flow-table row")
  }

  return {
    doc: {
      ...doc,
      document: {
        ...doc.document,
        sections: doc.document.sections.map((current, index) => index === 0
          ? {
              ...section,
              nodes: {
                ...section.nodes,
                [body.id]: { ...body, childIds: [...body.childIds, table.id] },
                [table.id]: table as unknown as LayoutNode,
              },
            }
          : current),
      },
    },
    table,
    cellId: firstRow.cellIds[0],
  }
}

describe("editor document graph diagnostics", () => {
  it("resolves flattened DocumentNode v2 table targets through the graph index", () => {
    const { doc, table, cellId } = createDocumentWithFlowTable()
    const diagnostics = createDocumentGraphDiagnosticsFromV2(migrateDocumentToV2(doc), [table.id, cellId])

    expect(diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: true,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: table.id,
          nodeType: "flow-table",
          parentKind: "childIds",
          parentType: "body",
          tableId: table.id,
          operationSurface: "table",
          canDelete: true,
          canDuplicate: true,
          canReorder: true,
        }),
        expect.objectContaining({
          nodeId: cellId,
          nodeType: "flow-table-cell",
          parentKind: "cellIds",
          parentType: "flow-table-row",
          tableId: table.id,
          operationSurface: "table",
          canDelete: false,
          canDuplicate: false,
          canReorder: false,
        }),
      ],
    }))
  })

  it("marks missing DocumentNode v2 graph targets as unresolved", () => {
    const { doc } = createDocumentWithFlowTable()
    const diagnostics = createDocumentGraphDiagnosticsFromV2(migrateDocumentToV2(doc), ["missing-node"])

    expect(diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: "missing-node",
          parentKind: "missing",
          operationSurface: "unknown",
        }),
      ],
    }))
  })

  it("uses a supplied DocumentNode v2 graph index", () => {
    const { doc, table } = createDocumentWithFlowTable()
    const migrated = migrateDocumentToV2(doc)
    const index = buildDocumentGraphIndexV2(migrated)
    index.nodeById.delete(table.id)

    const diagnostics = createDocumentGraphDiagnosticsFromV2(migrated, [table.id], index)

    expect(diagnostics).toEqual(expect.objectContaining({
      graphSourceModel: "document-v2",
      graphContextResolved: false,
      graphTargetContexts: [
        expect.objectContaining({
          nodeId: table.id,
          nodeType: undefined,
        }),
      ],
    }))
  })
})
