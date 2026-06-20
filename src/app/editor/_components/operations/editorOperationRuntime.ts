import { buildDocumentGraphIndexV2, migrateDocumentToV2 } from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorOperationDocumentGraphRuntime, EditorOperationEnvelope, EditorOperationKind } from "./editorOperationTypes"

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

export function createEditorDocumentGraphRuntime(doc: DocumentNode): EditorOperationDocumentGraphRuntime {
  const document = migrateDocumentToV2(doc)
  return {
    sourceModel: "document-v2",
    sourceDocument: doc,
    document,
    index: buildDocumentGraphIndexV2(document),
  }
}

export function createEditorDocumentGraphRuntimeCache(): {
  clear: () => void
  get: (doc: DocumentNode) => EditorOperationDocumentGraphRuntime
} {
  let runtime: EditorOperationDocumentGraphRuntime | null = null

  return {
    clear: () => {
      runtime = null
    },
    get: (doc) => {
      if (runtime?.sourceDocument === doc) {
        return runtime
      }
      runtime = createEditorDocumentGraphRuntime(doc)
      return runtime
    },
  }
}

export function attachEditorOperationDocumentGraphRuntime(
  operation: EditorOperationEnvelope,
  doc: DocumentNode,
  resolveDocumentGraphRuntime?: () => EditorOperationDocumentGraphRuntime | null | undefined,
): EditorOperationEnvelope {
  if (operation.runtime?.documentGraph?.sourceModel === "document-v2") {
    return operation
  }
  if (!shouldAttachDocumentGraphRuntime(operation)) {
    return operation
  }

  try {
    const resolvedDocumentGraph = resolveDocumentGraphRuntime?.()
    return {
      ...operation,
      runtime: {
        ...operation.runtime,
        documentGraph: resolvedDocumentGraph?.sourceDocument === doc
          ? resolvedDocumentGraph
          : createEditorDocumentGraphRuntime(doc),
      },
    }
  } catch {
    return operation
  }
}
