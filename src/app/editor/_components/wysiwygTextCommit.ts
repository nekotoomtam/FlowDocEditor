import {
  assertDocument,
  getTextRunParagraphText,
  normalizeDocument,
  replaceTextRunParagraphText,
} from "@/document"
import type { DocumentNode, FlowTableNode, LayoutNode, ParagraphNode } from "@/schema"
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

export interface WysiwygRichTextCommitInput {
  nodeId: string
  paragraph: ParagraphNode
  afterPaginated: PaginatedDocument
  history?: WysiwygTextCommitHistoryEntry
}

export function getEditableParagraphFromDocument(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node
    }
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as FlowTableNode).nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      return inner
    }
  }
  return null
}

export function getEditableParagraphTextFromDocument(doc: DocumentNode, nodeId: string): string | null {
  const paragraph = getEditableParagraphFromDocument(doc, nodeId)
  return paragraph ? getTextRunParagraphText(paragraph) : null
}

export function getPlainParagraphTextFromDocument(doc: DocumentNode, nodeId: string): string | null {
  return getEditableParagraphTextFromDocument(doc, nodeId)
}

export function replaceEditableParagraphTextInDocument(
  doc: DocumentNode,
  nodeId: string,
  text: string,
): DocumentNode {
  return normalizeDocument(replaceTextRunParagraphText(doc, nodeId, text))
}

function areParagraphNodesEqual(a: ParagraphNode, b: ParagraphNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function replaceEditableParagraphInDocument(
  doc: DocumentNode,
  nodeId: string,
  paragraph: ParagraphNode,
): DocumentNode {
  const nextParagraph: ParagraphNode = { ...paragraph, id: nodeId, type: "paragraph" }
  for (let si = 0; si < doc.document.sections.length; si++) {
    const section = doc.document.sections[si]
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      if (areParagraphNodesEqual(node, nextParagraph)) return doc
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [nodeId]: nextParagraph as LayoutNode } } : s,
      )
      return normalizeDocument({ ...doc, document: { ...doc.document, sections: newSections } })
    }

    for (const [tableId, candidate] of Object.entries(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const table = candidate as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type !== "paragraph") continue
      if (areParagraphNodesEqual(inner, nextParagraph)) return doc
      const newTable = { ...table, nodes: { ...table.nodes, [nodeId]: nextParagraph } }
      const newSections = doc.document.sections.map((s, i) =>
        i === si ? { ...s, nodes: { ...s.nodes, [tableId]: newTable as unknown as LayoutNode } } : s,
      )
      return normalizeDocument({ ...doc, document: { ...doc.document, sections: newSections } })
    }
  }
  return doc
}

export function commitWysiwygTextEditState<TState extends WysiwygTextCommitState>(
  state: TState,
  input: WysiwygTextCommitInput,
  maxHistory: number,
): TState {
  const currentText = getEditableParagraphTextFromDocument(state.doc, input.nodeId)
  if (currentText == null || input.text === input.beforeText) {
    return {
      ...state,
      paginated: input.afterPaginated,
    }
  }

  const normalizedDoc = replaceEditableParagraphTextInDocument(state.doc, input.nodeId, input.text)
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

export function commitWysiwygRichTextEditState<TState extends WysiwygTextCommitState>(
  state: TState,
  input: WysiwygRichTextCommitInput,
  maxHistory: number,
): TState {
  const currentParagraph = getEditableParagraphFromDocument(state.doc, input.nodeId)
  const nextParagraph: ParagraphNode = { ...input.paragraph, id: input.nodeId, type: "paragraph" }
  if (currentParagraph == null || areParagraphNodesEqual(currentParagraph, nextParagraph)) {
    return {
      ...state,
      paginated: input.afterPaginated,
    }
  }

  const normalizedDoc = replaceEditableParagraphInDocument(state.doc, input.nodeId, nextParagraph)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("WYSIWYG rich text commit produced invalid document:", error)
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
