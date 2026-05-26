import type {
  DocumentNode,
  DocumentSection,
  FlowTableNode,
  ParagraphNode,
} from "../schema"

export function orderedSectionParagraphs(section: DocumentSection): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = []

  const visitFlowTable = (table: FlowTableNode): void => {
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      if (row?.type !== "flow-table-row") return
      row.cellIds.forEach((cellId) => {
        const cell = table.nodes[cellId]
        if (cell?.type !== "flow-table-cell") return
        cell.childIds.forEach((childId) => {
          const child = table.nodes[childId]
          if (child?.type === "paragraph") paragraphs.push(child)
        })
      })
    })
  }

  const visit = (nodeId: string): void => {
    const node = section.nodes[nodeId]
    if (!node) return
    if (node.type === "paragraph") {
      paragraphs.push(node)
      return
    }
    if (node.type === "flow-table") {
      visitFlowTable(node as unknown as FlowTableNode)
      return
    }
    if ("childIds" in node) node.childIds.forEach(visit)
  }

  visit(section.bodyRootId)
  return paragraphs
}

export function orderedDocumentParagraphs(doc: DocumentNode): ParagraphNode[] {
  return doc.document.sections.flatMap(orderedSectionParagraphs)
}
