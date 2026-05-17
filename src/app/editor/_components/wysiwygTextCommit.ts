import { assertDocument, isPlainTextParagraph, normalizeDocument, updateParagraphText } from "@/document"
import type { DocumentNode, FlowTableNode, TableNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"

export interface WysiwygTextCommitHistoryEntry {
  doc: DocumentNode
  paginated: PaginatedDocument
}

export interface WysiwygTextCommitState {
  doc: DocumentNode
  paginated: PaginatedDocument
  past: WysiwygTextCommitHistoryEntry[]
  future: WysiwygTextCommitHistoryEntry[]
}

export interface WysiwygTextCommitInput {
  nodeId: string
  text: string
  beforeText: string
  afterPaginated: PaginatedDocument
  history?: WysiwygTextCommitHistoryEntry
}

export function getPlainParagraphTextFromDocument(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      if (!isPlainTextParagraph(node)) return null
      return node.children.map((child) => child.type === "text" ? child.text : "").join("")
    }
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "table" && candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as TableNode | FlowTableNode).nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      if (!isPlainTextParagraph(inner)) return null
      return inner.children.map((child) => child.type === "text" ? child.text : "").join("")
    }
  }
  return null
}

export function commitWysiwygTextEditState<TState extends WysiwygTextCommitState>(
  state: TState,
  input: WysiwygTextCommitInput,
  maxHistory: number,
): TState {
  const currentText = getPlainParagraphTextFromDocument(state.doc, input.nodeId)
  if (currentText == null || input.text === input.beforeText) {
    return {
      ...state,
      paginated: input.afterPaginated,
    }
  }

  const normalizedDoc = normalizeDocument(updateParagraphText(state.doc, input.nodeId, input.text))
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("WYSIWYG text commit produced invalid document:", error)
    return state
  }

  return {
    ...state,
    doc: normalizedDoc,
    paginated: input.afterPaginated,
    past: [...state.past.slice(-(maxHistory - 1)), input.history ?? { doc: state.doc, paginated: state.paginated }],
    future: [],
  }
}
