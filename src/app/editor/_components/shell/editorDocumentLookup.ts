import type { DocumentNode, FlowTableNode } from "@/schema"
import {
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
} from "../wysiwygTextCommit"

export function getParagraphTextFromDoc(doc: DocumentNode, nodeId: string): string | null {
  return getEditableParagraphTextFromDocument(doc, nodeId)
}

export function getParagraphFromDoc(doc: DocumentNode, nodeId: string) {
  return getEditableParagraphFromDocument(doc, nodeId)
}

function getLayoutChildIdsFromNode(node: unknown): string[] | null {
  if (!node || typeof node !== "object" || !("childIds" in node)) return null
  const childIds = (node as { childIds?: unknown }).childIds
  return Array.isArray(childIds) && childIds.every((childId) => typeof childId === "string")
    ? childIds
    : null
}

export function findImmediatePageBreakSiblingAfterNode(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    for (const candidate of Object.values(section.nodes)) {
      const childIds = getLayoutChildIdsFromNode(candidate)
      if (!childIds) continue
      const index = childIds.indexOf(nodeId)
      if (index < 0) continue
      const nextNodeId = childIds[index + 1]
      if (!nextNodeId) return null
      return section.nodes[nextNodeId]?.type === "page-break" ? nextNodeId : null
    }
  }
  return null
}

export function findSectionIndexForNode(doc: DocumentNode, nodeId: string | null): number {
  if (!nodeId) return 0
  for (let sectionIndex = 0; sectionIndex < doc.document.sections.length; sectionIndex += 1) {
    const section = doc.document.sections[sectionIndex]
    if (section.nodes[nodeId]) return sectionIndex
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      if ((candidate as unknown as FlowTableNode).nodes[nodeId]) return sectionIndex
    }
  }
  return 0
}
