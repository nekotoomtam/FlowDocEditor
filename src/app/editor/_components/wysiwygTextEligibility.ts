import { isTextRunOnlyParagraph } from "@/document"
import type { DocumentNode, FlowTableNode, ParagraphNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as FlowTableNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function isTableCellNodeId(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type === "flow-table-cell") return true
    }
  }
  return false
}

export function isParagraphInsideTableCell(
  doc: DocumentNode,
  nodeId: string,
  parentNodeId?: string | null,
): boolean {
  if (isTableCellNodeId(doc, parentNodeId)) return true
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      for (const candidate of Object.values(table.nodes)) {
        if (candidate.type === "flow-table-cell" && candidate.childIds.includes(nodeId)) return true
      }
    }
  }
  return false
}

export function isParagraphInsideFlowStack(
  doc: DocumentNode,
  nodeId: string,
  parentNodeId?: string | null,
): boolean {
  if (parentNodeId) {
    for (const section of doc.document.sections) {
      if (section.nodes[parentNodeId]?.type === "flow-stack") return true
    }
  }

  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type === "flow-stack" && node.childIds.includes(nodeId)) return true
    }
  }
  return false
}

function isStackInsideRow(doc: DocumentNode, stackId: string | null | undefined): boolean {
  if (!stackId) return false
  for (const section of doc.document.sections) {
    const stack = section.nodes[stackId]
    if (stack?.type !== "stack") continue
    if (Object.values(section.nodes).some((node) => (
      node.type === "row" && node.childIds.includes(stackId)
    ))) return true
  }
  return false
}

export function isParagraphInsideRowStack(
  doc: DocumentNode,
  nodeId: string | null | undefined,
): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    const paragraph = section.nodes[nodeId]
    if (paragraph?.type !== "paragraph") continue
    const stack = Object.values(section.nodes).find((node) => (
      node.type === "stack" && node.childIds.includes(nodeId)
    ))
    if (stack && isStackInsideRow(doc, stack.id)) return true
  }
  return false
}

export function findWysiwygTextEngineFragment(
  paginated: PaginatedDocument,
  nodeId: string,
  pageIndex?: number | null,
): PageFragment | null {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const pageFragments = [
        ...page.fragments,
        ...page.headerFragments,
        ...page.footerFragments,
      ]
      const fragment = pageFragments.find((candidate) =>
        candidate.nodeId === nodeId &&
        candidate.nodeType === "paragraph" &&
        (pageIndex == null || candidate.pageIndex === pageIndex)
      )
      if (fragment) return fragment
    }
  }
  return null
}

export function isWysiwygTextEngineFragmentEligible(input: {
  doc: DocumentNode
  paginated: PaginatedDocument
  nodeId: string
  pageIndex?: number | null
}): boolean {
  const fragment = findWysiwygTextEngineFragment(input.paginated, input.nodeId, input.pageIndex)
  if (!fragment) return false
  const paragraph = findParagraphNode(input.doc, input.nodeId)
  return paragraph !== null && isTextRunOnlyParagraph(paragraph)
}
