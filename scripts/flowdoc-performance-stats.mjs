function isObject(value) {
  return typeof value === "object" && value !== null
}

function emptyStats() {
  return {
    sections: 0,
    bodyChildren: 0,
    totalNodes: 0,
    paragraphs: 0,
    headings: 0,
    tocNodes: 0,
    flowRows: 0,
    flowStacks: 0,
    flowTables: 0,
    flowTableRows: 0,
    flowTableCells: 0,
    fieldRefs: 0,
    textCharacters: 0,
  }
}

function documentLike(value) {
  return isObject(value) &&
    value.version === 1 &&
    isObject(value.document) &&
    Array.isArray(value.document.sections)
}

export function unwrapFlowDocDocument(value) {
  if (documentLike(value)) return value

  if (
    isObject(value) &&
    value.kind === "document" &&
    documentLike(value.document)
  ) {
    return value.document
  }

  if (
    isObject(value) &&
    documentLike(value.document)
  ) {
    return value.document
  }

  throw new Error("Baseline fixture is not a FlowDoc document or package")
}

function paragraphTextStats(node, stats) {
  for (const child of node.children ?? []) {
    if (!isObject(child)) continue
    if (child.type === "text") {
      stats.textCharacters += String(child.text ?? "").length
      continue
    }
    if (child.type === "fieldRef") {
      stats.fieldRefs += 1
      stats.textCharacters += String(child.fallback ?? child.label ?? child.key ?? "").length
      continue
    }
    if (child.type === "pageNumber") {
      stats.textCharacters += 2
    }
  }
}

function countNode(node, stats) {
  if (!isObject(node) || typeof node.type !== "string") return

  stats.totalNodes += 1

  switch (node.type) {
    case "paragraph":
      stats.paragraphs += 1
      if (node.props?.headingLevel != null) stats.headings += 1
      paragraphTextStats(node, stats)
      break
    case "toc":
      stats.tocNodes += 1
      break
    case "flow-row":
      stats.flowRows += 1
      break
    case "flow-stack":
      stats.flowStacks += 1
      break
    case "flow-table":
      stats.flowTables += 1
      for (const internalNode of Object.values(node.nodes ?? {})) {
        countNode(internalNode, stats)
      }
      break
    case "flow-table-row":
      stats.flowTableRows += 1
      break
    case "flow-table-cell":
      stats.flowTableCells += 1
      break
  }
}

export function summarizeFlowDocStats(documentNode) {
  const doc = unwrapFlowDocDocument(documentNode)
  const stats = emptyStats()

  for (const section of doc.document.sections) {
    stats.sections += 1
    const sectionNodes = section.nodes ?? {}
    const body = sectionNodes[section.bodyRootId]
    if (isObject(body) && Array.isArray(body.childIds)) {
      stats.bodyChildren += body.childIds.length
    }

    for (const node of Object.values(sectionNodes)) {
      countNode(node, stats)
    }
  }

  return stats
}
