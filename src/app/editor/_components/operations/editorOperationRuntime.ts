import { migrateDocumentToV2 } from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorOperationEnvelope, EditorOperationKind } from "./editorOperationTypes"

const DOCUMENT_GRAPH_RUNTIME_OPERATION_KINDS: ReadonlySet<EditorOperationKind> = new Set([
  "drag.placement",
  "flow-row.layout.patch",
  "flow-row.structure.patch",
  "list.structure.patch",
  "node.delete",
  "node.duplicate",
  "node.reorder",
  "paragraph.merge",
  "paragraph.split",
  "table.structure.patch",
])

export function shouldAttachDocumentGraphRuntime(operation: EditorOperationEnvelope): boolean {
  return DOCUMENT_GRAPH_RUNTIME_OPERATION_KINDS.has(operation.kind)
}

export function attachEditorOperationDocumentGraphRuntime(
  operation: EditorOperationEnvelope,
  doc: DocumentNode,
): EditorOperationEnvelope {
  if (operation.runtime?.documentGraph?.sourceModel === "document-v2") {
    return operation
  }
  if (!shouldAttachDocumentGraphRuntime(operation)) {
    return operation
  }

  try {
    return {
      ...operation,
      runtime: {
        ...operation.runtime,
        documentGraph: {
          sourceModel: "document-v2",
          document: migrateDocumentToV2(doc),
        },
      },
    }
  } catch {
    return operation
  }
}
