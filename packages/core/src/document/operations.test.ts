import { describe, expect, it } from "vitest"
import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
  ListStyleDefinition,
  ParagraphNode,
} from "../schema"
import { mm, pt } from "../schema"
import { getPageDimensions } from "../pagination/metrics"
import { assertDocument } from "./assert"
import { resolveFlowTableGrid } from "./flowTableGrid"
import {
  applyTextRunStyleRange,
  backspaceListItemAtStart,
  applyParagraphTextStyle,
  applyPlacementOperation,
  applyParagraphList,
  applyParagraphStyleId,
  applyParagraphStylePreset,
  addFlowTableColumn,
  addFlowTableRow,
  addFlowStackColumn,
  canUpdateFlowTableCellSpan,
  canRemoveFlowTableColumn,
  canRemoveFlowTableRow,
  canDisableSectionReservedZone,
  clampSectionReservedZones,
  DEFAULT_HEADER_FOOTER_RESERVED_PT,
  clearParagraphList,
  clearParagraphStyleId,
  deleteTextRunRange,
  deleteEmptyFlowTableCellParagraph,
  deleteNode,
  detachParagraphStyle,
  disableSectionReservedZoneIfEmpty,
  duplicateNode,
  createUniqueListPresetInstanceId,
  ensureReservedZoneRoots,
  ensureBaseParagraphStyle,
  ensureSectionReservedZoneVisibleForAuthoring,
  ensureListPresetInstance,
  exitListItem,
  fitFlowTableToSectionWidth,
  indentListItem,
  isPlainTextParagraph,
  mergeListItemWithPrevious,
  mergeParagraphWithPrevious,
  mergeTextRunParagraphWithPrevious,
  MAX_HEADER_FOOTER_RESERVED_RATIO,
  MIN_BODY_CONTENT_HEIGHT_RATIO,
  MIN_HEADER_FOOTER_RESERVED_PT,
  outdentListItem,
  patchParagraphStyleOverrideBox,
  patchParagraphStyleOverrides,
  patchParagraphStyleDefinition,
  removeFlowTableColumn,
  removeFlowTableRow,
  replaceTextRunParagraphText,
  replaceTextRunParagraphTextInParagraph,
  replaceTextRunRange,
  resolveTextRunParagraphTextReplacement,
  reorderBodyChild,
  restartParagraphListAt,
  resetParagraphStyleOverrides,
  resizeFlowTableColumnPair,
  resolveFlowTableCellMergeTarget,
  splitParagraphAtIndex,
  splitListItemAtIndex,
  splitTextRunParagraphAtIndex,
  toggleParagraphListPreset,
  updateFlowTableCellSpan,
  updateFieldRefInline,
  updateFlowStackBoxStyle,
  updateParagraphBoxStyle,
  updateParagraphStyleOverrides,
  updateParagraphText,
  updateSectionHeaderFooterHorizontalMode,
  updateSectionReservedZones,
  ensureParagraphStylePreset,
  renameParagraphStyleDefinition,
  upsertListInstance,
  upsertListStyleDefinition,
  upsertParagraphStyleDefinition,
} from "./operations"
import { BULLET_BASIC_LIST_STYLE_ID, TOR_CLAUSE_LIST_STYLE_ID } from "./listPresets"
import { resolveListMarkers } from "./listNumbering"
import { resolveStyledParagraphProps } from "./paragraphStyles"
import { TOR_BODY_PARAGRAPH_STYLE_ID, TOR_HEADING1_PARAGRAPH_STYLE_ID } from "./paragraphStylePresets"

function makeParagraph(id: string, children: ParagraphNode["children"]): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children,
  }
}

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function makeFlowTableDoc(paragraph: ParagraphNode): DocumentNode {
  const cell: FlowTableCellNode = { id: "flow-cell", type: "flow-table-cell", props: {}, childIds: [paragraph.id] }
  const row: FlowTableRowNode = { id: "flow-row", type: "flow-table-row", props: {}, cellIds: [cell.id] }
  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: [{ width: pt(200) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      [paragraph.id]: paragraph,
    },
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function makeFlowTableDocWithParagraphs(paragraphs: ParagraphNode[]): DocumentNode {
  const cell: FlowTableCellNode = {
    id: "flow-cell",
    type: "flow-table-cell",
    props: {},
    childIds: paragraphs.map((paragraph) => paragraph.id),
  }
  const row: FlowTableRowNode = { id: "flow-row", type: "flow-table-row", props: {}, cellIds: [cell.id] }
  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: [{ width: pt(200) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      ...Object.fromEntries(paragraphs.map((paragraph) => [paragraph.id, paragraph])),
    },
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function makeGridFlowTableDoc(options: {
  columnWidths?: number[]
  rows?: string[][]
  headerRowCount?: number
  firstCellProps?: FlowTableCellNode["props"]
} = {}): DocumentNode {
  const rows = options.rows ?? [
    ["A", "B", "C"],
    ["D", "E", "F"],
    ["G", "H", "I"],
  ]
  const columnWidths = options.columnWidths ?? rows[0].map(() => 100)
  const tableNodes: FlowTableNode["nodes"] = {}
  const rowIds: string[] = []

  rows.forEach((rowText, rowIndex) => {
    const cellIds: string[] = []
    rowText.forEach((text, columnIndex) => {
      const paragraph = makeParagraph(`fp-${rowIndex}-${columnIndex}`, [
        { id: `ft-${rowIndex}-${columnIndex}`, type: "text", text },
      ])
      const cell: FlowTableCellNode = {
        id: `flow-cell-${rowIndex}-${columnIndex}`,
        type: "flow-table-cell",
        props: rowIndex === 0 && columnIndex === 0 ? options.firstCellProps ?? {} : {},
        childIds: [paragraph.id],
      }
      tableNodes[paragraph.id] = paragraph
      tableNodes[cell.id] = cell
      cellIds.push(cell.id)
    })
    const row: FlowTableRowNode = { id: `flow-row-${rowIndex}`, type: "flow-table-row", props: {}, cellIds }
    tableNodes[row.id] = row
    rowIds.push(row.id)
  })

  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: options.headerRowCount != null ? { headerRowCount: options.headerRowCount } : {},
    columns: columnWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes: tableNodes,
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function makeSpannedFlowTableDoc(): DocumentNode {
  const p1 = makeParagraph("fsp-1", [{ id: "fst-1", type: "text", text: "A" }])
  const p2 = makeParagraph("fsp-2", [{ id: "fst-2", type: "text", text: "B" }])
  const p3 = makeParagraph("fsp-3", [{ id: "fst-3", type: "text", text: "C" }])
  const c1: FlowTableCellNode = { id: "flow-cell-span", type: "flow-table-cell", props: { colspan: 2, rowspan: 2 }, childIds: [p1.id] }
  const c2: FlowTableCellNode = { id: "flow-cell-top-right", type: "flow-table-cell", props: {}, childIds: [p2.id] }
  const c3: FlowTableCellNode = { id: "flow-cell-bottom-right", type: "flow-table-cell", props: {}, childIds: [p3.id] }
  const r1: FlowTableRowNode = { id: "flow-row-top", type: "flow-table-row", props: {}, cellIds: [c1.id, c2.id] }
  const r2: FlowTableRowNode = { id: "flow-row-bottom", type: "flow-table-row", props: {}, cellIds: [c3.id] }
  const table: FlowTableNode = {
    id: "flow-table",
    type: "flow-table",
    props: {},
    columns: [120, 80, 60].map((width) => ({ width: pt(width) })),
    rowIds: [r1.id, r2.id],
    nodes: {
      [r1.id]: r1,
      [r2.id]: r2,
      [c1.id]: c1,
      [c2.id]: c2,
      [c3.id]: c3,
      [p1.id]: p1,
      [p2.id]: p2,
      [p3.id]: p3,
    },
  }
  return makeDoc({ "flow-table": table as unknown as LayoutNode }, ["flow-table"])
}

function getFlowTable(doc: DocumentNode): FlowTableNode {
  return doc.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
}

function flowTableWidth(table: FlowTableNode): number {
  return table.columns.reduce((sum, column) => sum + column.width.value, 0)
}

function paragraphText(node: ParagraphNode): string {
  return node.children.filter((child) => child.type === "text").map((child) => child.text).join("")
}

function getParagraph(doc: DocumentNode, paragraphId: string): ParagraphNode {
  for (const section of doc.document.sections) {
    const node = section.nodes[paragraphId]
    if (node?.type === "paragraph") return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as FlowTableNode).nodes[paragraphId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  throw new Error(`Missing paragraph ${paragraphId}`)
}

function textRunSummary(node: ParagraphNode) {
  return node.children.map((child) =>
    child.type === "text"
      ? { type: child.type, text: child.text, style: child.style }
      : child,
  )
}

function flowTableCellParagraphTexts(table: FlowTableNode, cellId: string): string[] {
  const cell = table.nodes[cellId]
  if (cell?.type !== "flow-table-cell") return []
  return cell.childIds.map((childId) => {
    const child = table.nodes[childId]
    return child?.type === "paragraph" ? paragraphText(child) : childId
  })
}

describe("section page settings operations", () => {
  it("updates header and footer reserved heights and creates empty zone roots", () => {
    const doc = makeDoc({}, [])
    const next = updateSectionReservedZones(doc, 0, { headerReserved: 42.337, footerReserved: 31.664 })
    const section = next.document.sections[0]

    expect(section.page.headerReserved).toBe(42.34)
    expect(section.page.footerReserved).toBe(31.66)
    expect(section.bodyRootId).toBe("body")
    expect(section.headerRootId).toBeTruthy()
    expect(section.footerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(section.footerRootId ? section.nodes[section.footerRootId]?.type : null).toBe("stack")
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("clamps invalid reserved heights to non-negative point values", () => {
    const doc = makeDoc({}, [])
    const next = updateSectionReservedZones(doc, 0, { headerReserved: -12, footerReserved: Number.NaN })

    expect(next.document.sections[0].page.headerReserved).toBeUndefined()
    expect(next.document.sections[0].page.footerReserved).toBeUndefined()
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("creates missing reserved zone roots for loaded documents without changing existing roots", () => {
    const doc = makeDoc({}, [])
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 36,
      footerReserved: 24,
    }

    const next = ensureReservedZoneRoots(doc)
    const section = next.document.sections[0]

    expect(section.headerRootId).toBeTruthy()
    expect(section.footerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(section.footerRootId ? section.nodes[section.footerRootId]?.type : null).toBe("stack")
    expect(ensureReservedZoneRoots(next)).toBe(next)
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("keeps inactive header/footer zones at zero but gives active zones a one-line minimum", () => {
    const inactive = updateSectionReservedZones(makeDoc({}, []), 0, { headerReserved: 0, footerReserved: 0 })
    const active = makeDoc({
      "header-root": { id: "header-root", type: "stack", props: {}, childIds: [] },
    }, [])
    active.document.sections[0].headerRootId = "header-root"

    const next = updateSectionReservedZones(active, 0, { headerReserved: 0, footerReserved: 0 })

    expect(inactive.document.sections[0].page.headerReserved).toBeUndefined()
    expect(inactive.document.sections[0].page.footerReserved).toBeUndefined()
    expect(next.document.sections[0].page.headerReserved).toBe(MIN_HEADER_FOOTER_RESERVED_PT)
    expect(next.document.sections[0].page.footerReserved).toBe(0)
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("opens an inactive header authoring zone at the default reserved height", () => {
    const next = ensureSectionReservedZoneVisibleForAuthoring(makeDoc({}, []), 0, "header")
    const section = next.document.sections[0]

    expect(section.page.headerReserved).toBe(DEFAULT_HEADER_FOOTER_RESERVED_PT)
    expect(section.page.footerReserved).toBe(0)
    expect(section.headerRootId).toBeTruthy()
    expect(section.footerRootId).toBeUndefined()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("does not expand an existing header authoring zone when opening it", () => {
    const doc = makeDoc({}, [])
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 36,
    }

    const next = ensureSectionReservedZoneVisibleForAuthoring(doc, 0, "header")
    const section = next.document.sections[0]

    expect(section.page.headerReserved).toBe(36)
    expect(section.headerRootId).toBeTruthy()
    expect(section.headerRootId ? section.nodes[section.headerRootId]?.type : null).toBe("stack")
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("can disable an empty header authoring zone", () => {
    const visible = ensureSectionReservedZoneVisibleForAuthoring(makeDoc({}, []), 0, "header")
    const next = disableSectionReservedZoneIfEmpty(visible, 0, "header")
    const section = next.document.sections[0]

    expect(section.page.headerReserved).toBe(0)
    expect(section.headerRootId).toBeUndefined()
    expect(Object.values(section.nodes).some((node) => node.type === "stack")).toBe(false)
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("refuses to disable a header authoring zone that contains content", () => {
    const doc = makeDoc({
      "header-root": { id: "header-root", type: "stack", props: {}, childIds: ["header-p"] },
      "header-p": makeParagraph("header-p", [{ id: "header-t", type: "text", text: "Header" }]),
    }, [])
    doc.document.sections[0].headerRootId = "header-root"
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      headerReserved: 80,
    }

    expect(canDisableSectionReservedZone(doc.document.sections[0], "header")).toBe(false)
    expect(disableSectionReservedZoneIfEmpty(doc, 0, "header")).toBe(doc)
  })

  it("caps header/footer reserved heights so body keeps at least 30 percent of usable height", () => {
    const doc = makeDoc({}, [])
    const section = doc.document.sections[0]
    const { height } = getPageDimensions(section.page)
    const usableHeight = height - section.page.margin.top.value - section.page.margin.bottom.value
    const maxReserved = Math.round(usableHeight * MAX_HEADER_FOOTER_RESERVED_RATIO * 100) / 100
    const minBodyHeight = Math.round(usableHeight * MIN_BODY_CONTENT_HEIGHT_RATIO * 100) / 100
    const next = updateSectionReservedZones(doc, 0, { headerReserved: 500, footerReserved: 200 })
    const page = next.document.sections[0].page
    const totalReserved = (page.headerReserved ?? 0) + (page.footerReserved ?? 0)
    const bodyHeight = Math.round((usableHeight - totalReserved) * 100) / 100

    expect(totalReserved).toBe(maxReserved)
    expect(bodyHeight).toBe(minBodyHeight)
    expect(page.footerReserved).toBe(MIN_HEADER_FOOTER_RESERVED_PT)
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("uses converted margin units when capping header/footer reserved heights", () => {
    const doc = makeDoc({}, [])
    doc.document.sections[0].page = {
      ...doc.document.sections[0].page,
      margin: {
        ...doc.document.sections[0].page.margin,
        top: mm(25.4),
        bottom: mm(25.4),
      },
    }
    const section = doc.document.sections[0]
    const { height } = getPageDimensions(section.page)
    const usableHeight = height - (25.4 * 2.8346 * 2)
    const maxReserved = Math.round(usableHeight * MAX_HEADER_FOOTER_RESERVED_RATIO * 100) / 100

    const next = updateSectionReservedZones(doc, 0, { headerReserved: 500, footerReserved: 500 })
    const page = next.document.sections[0].page
    const totalReserved = (page.headerReserved ?? 0) + (page.footerReserved ?? 0)

    expect(totalReserved).toBe(maxReserved)
    expect(() => assertDocument(next)).not.toThrow()
  })

  it("can preserve footer reserved height when footer is the active edit priority", () => {
    const doc = makeDoc({}, [])
    const section = doc.document.sections[0]
    const { height } = getPageDimensions(section.page)
    const usableHeight = height - section.page.margin.top.value - section.page.margin.bottom.value
    const maxReserved = Math.round(usableHeight * MAX_HEADER_FOOTER_RESERVED_RATIO * 100) / 100

    const next = clampSectionReservedZones(section, { headerReserved: 200, footerReserved: 500 }, "footerReserved")

    expect(next.headerReserved).toBe(MIN_HEADER_FOOTER_RESERVED_PT)
    expect(next.headerReserved + next.footerReserved).toBe(maxReserved)
  })

  it("updates header/footer horizontal mode without changing the default body mode", () => {
    const doc = makeDoc({}, [])
    const noOp = updateSectionHeaderFooterHorizontalMode(doc, 0, "body")
    const full = updateSectionHeaderFooterHorizontalMode(doc, 0, "full")
    const body = updateSectionHeaderFooterHorizontalMode(full, 0, "body")

    expect(noOp).toBe(doc)
    expect(full.document.sections[0].page.headerFooterHorizontalMode).toBe("full")
    expect(body.document.sections[0].page.headerFooterHorizontalMode).toBe("body")
    expect(() => assertDocument(full)).not.toThrow()
    expect(() => assertDocument(body)).not.toThrow()
  })
})

describe("body child reorder operations", () => {
  const reorderListStyle: ListStyleDefinition = {
    id: "outline-list-style",
    levels: [0, 1, 2].map((level) => ({
      level,
      format: "decimal",
      pattern: `%${level + 1}.`,
      startAt: 1,
      markerIndent: pt(level * 18),
      bodyIndent: pt((level + 1) * 18),
    })),
  }

  function makeListDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
    const doc = makeDoc(nodes, childIds)
    return {
      ...doc,
      document: {
        ...doc.document,
        listStyles: { [reorderListStyle.id]: reorderListStyle },
        listInstances: { "outline-list": { id: "outline-list", styleId: reorderListStyle.id } },
      },
    }
  }

  function makeListParagraph(id: string, level: number): ParagraphNode {
    const paragraph = makeParagraph(id, [{ id: `${id}-text`, type: "text", text: id }])
    return {
      ...paragraph,
      props: {
        ...paragraph.props,
        list: { instanceId: "outline-list", level, itemId: `${id}-item` },
      },
    }
  }

  it("moves a direct body child before or after another body child", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Two" }])
    const p3 = makeParagraph("p3", [{ id: "t3", type: "text", text: "Three" }])
    const doc = makeDoc({ p1, p2, p3 }, ["p1", "p2", "p3"])

    const movedAfter = reorderBodyChild(doc, "section", "p1", "p3", "after")
    expect(movedAfter.document.sections[0].nodes.body).toMatchObject({
      childIds: ["p2", "p3", "p1"],
    })
    assertDocument(movedAfter)

    const movedBefore = reorderBodyChild(movedAfter, "section", "p1", "p2", "before")
    expect(movedBefore.document.sections[0].nodes.body).toMatchObject({
      childIds: ["p1", "p2", "p3"],
    })
    assertDocument(movedBefore)
  })

  it("refuses to reorder nested children or cross-section targets", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const nested = makeParagraph("nested", [{ id: "tn", type: "text", text: "Nested" }])
    const row: LayoutNode = { id: "row", type: "row", props: {}, childIds: ["stack"] }
    const stack: LayoutNode = { id: "stack", type: "stack", props: { widthShare: 100 }, childIds: ["nested"] }
    const doc = makeDoc({ p1, row, stack, nested }, ["p1", "row"])

    expect(reorderBodyChild(doc, "section", "nested", "p1", "before")).toBe(doc)
    expect(reorderBodyChild(doc, "missing-section", "row", "p1", "before")).toBe(doc)
    expect(reorderBodyChild(doc, "section", "row", "missing-target", "after")).toBe(doc)
  })

  it("refuses list reorders into their own subtree segment", () => {
    const p0 = makeListParagraph("p0", 0)
    const p1 = makeListParagraph("p1", 1)
    const p2 = makeListParagraph("p2", 2)
    const doc = makeListDoc({ p0, p1, p2 }, ["p0", "p1", "p2"])

    const moved = reorderBodyChild(doc, "section", "p1", "p2", "after")

    expect(moved).toBe(doc)
    assertDocument(doc)
  })

  it("refuses list reorders that would make the instance start nested", () => {
    const p0 = makeListParagraph("p0", 0)
    const p1 = makeListParagraph("p1", 1)
    const q0 = makeListParagraph("q0", 0)
    const q1 = makeListParagraph("q1", 1)
    const q2 = makeListParagraph("q2", 2)
    const doc = makeListDoc({ p0, p1, q0, q1, q2 }, ["p0", "p1", "q0", "q1", "q2"])

    const moved = reorderBodyChild(doc, "section", "q1", "p0", "before")

    expect(moved).toBe(doc)
    assertDocument(doc)
  })

  it("moves a listed body child with its subtree segment", () => {
    const p0 = makeListParagraph("p0", 0)
    const p1 = makeListParagraph("p1", 1)
    const p2 = makeListParagraph("p2", 2)
    const q0 = makeListParagraph("q0", 0)
    const q1 = makeListParagraph("q1", 1)
    const doc = makeListDoc({ p0, p1, p2, q0, q1 }, ["p0", "p1", "p2", "q0", "q1"])

    const moved = reorderBodyChild(doc, "section", "p1", "q1", "after")

    expect(moved.document.sections[0].nodes.body).toMatchObject({
      childIds: ["p0", "q0", "q1", "p1", "p2"],
    })
    assertDocument(moved)
  })

  it("allows list reorders that preserve the authored hierarchy", () => {
    const p0 = makeListParagraph("p0", 0)
    const p1 = makeListParagraph("p1", 1)
    const p2 = makeListParagraph("p2", 2)
    const q0 = makeListParagraph("q0", 0)
    const q1 = makeListParagraph("q1", 1)
    const q2 = makeListParagraph("q2", 2)
    const doc = makeListDoc({ p0, p1, p2, q0, q1, q2 }, ["p0", "p1", "p2", "q0", "q1", "q2"])

    const moved = reorderBodyChild(doc, "section", "p2", "q2", "after")

    expect(moved.document.sections[0].nodes.body).toMatchObject({
      childIds: ["p0", "p1", "q0", "q1", "q2", "p2"],
    })
    assertDocument(moved)
  })
})

describe("paragraph list operations", () => {
  const torListStyle: ListStyleDefinition = {
    id: "tor-clause",
    levels: Array.from({ length: 8 }, (_, level) => ({
      level,
      format: "decimal",
      pattern: Array.from({ length: level + 1 }, (_value, index) => `%${index + 1}`).join(".") + (level === 0 ? "." : ""),
      startAt: 1,
      markerIndent: pt(level * 18),
      bodyIndent: pt((level + 1) * 18),
    })),
  }

  function withTorListDefinitions(doc: DocumentNode): DocumentNode {
    return upsertListInstance(
      upsertListStyleDefinition(doc, torListStyle),
      { id: "tor-main", styleId: "tor-clause" },
    )
  }

  it("installs a list preset and instance through one operation", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    let doc = makeDoc({ p1: p }, ["p1"])

    doc = ensureListPresetInstance(doc, {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      startAt: 3,
    })
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", itemId: "tor.one" })

    expect(doc.document.listStyles?.["tor-clause"]?.levels).toHaveLength(8)
    expect(doc.document.listInstances?.["tor-main"]).toEqual({
      id: "tor-main",
      styleId: "tor-clause",
      startAt: 3,
    })
    expect(resolveListMarkers(doc).get("p1")?.markerText).toBe("3.")
    expect(getParagraph(doc, "p1").children).toEqual(p.children)
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("creates unique preset-backed list group ids", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const doc = makeDoc({ p1: p }, ["p1"])

    const firstId = createUniqueListPresetInstanceId(doc, TOR_CLAUSE_LIST_STYLE_ID)
    const withFirstGroup = upsertListInstance(doc, { id: firstId, styleId: TOR_CLAUSE_LIST_STYLE_ID })
    const secondId = createUniqueListPresetInstanceId(withFirstGroup, TOR_CLAUSE_LIST_STYLE_ID)

    expect(firstId).toMatch(/^tor-main_/)
    expect(secondId).toMatch(/^tor-main_/)
    expect(secondId).not.toBe(firstId)
    expect(withFirstGroup.document.listInstances?.[secondId]).toBeUndefined()
  })

  it("preserves and clears preset instance startAt explicitly", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    let doc = makeDoc({ p1: p }, ["p1"])

    doc = ensureListPresetInstance(doc, {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      startAt: 3,
    })
    doc = ensureListPresetInstance(doc, {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
    })
    expect(doc.document.listInstances?.["tor-main"]?.startAt).toBe(3)

    doc = ensureListPresetInstance(doc, {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      startAt: null,
    })
    expect(doc.document.listInstances?.["tor-main"]?.startAt).toBeUndefined()
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("adds list definitions and applies list metadata without editing paragraph children", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Two" }])
    const doc = withTorListDefinitions(makeDoc({ p1, p2 }, ["p1", "p2"]))

    const result = applyParagraphList(doc, ["p1", "p2"], { instanceId: "tor-main", level: 0 })

    expect(getParagraph(result, "p1").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p1" })
    expect(getParagraph(result, "p2").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p2" })
    expect(getParagraph(result, "p1").children).toEqual(p1.children)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("clamps a requested nested list level to the available parent depth", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Two" }])
    const doc = withTorListDefinitions(makeDoc({ p1, p2 }, ["p1", "p2"]))

    const result = applyParagraphList(doc, ["p1", "p2"], { instanceId: "tor-main", level: 1 })

    expect(getParagraph(result, "p1").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p1" })
    expect(getParagraph(result, "p2").props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "p2" })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies list metadata to flow-table paragraphs through the same operation", () => {
    const p = makeParagraph("cell-p", [{ id: "cell-t", type: "text", text: "Cell item" }])
    const doc = withTorListDefinitions(makeFlowTableDoc(p))

    const result = applyParagraphList(doc, "cell-p", { instanceId: "tor-main", level: 0, itemId: "cell-item" })

    expect(getParagraph(result, "cell-p").props.list).toEqual({
      instanceId: "tor-main",
      level: 0,
      itemId: "cell-item",
    })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("indents, outdents, and clamps list levels to the supported range", () => {
    const paragraphs = Array.from({ length: 8 }, (_value, level) =>
      makeParagraph(`p${level}`, [{ id: `t${level}`, type: "text", text: `Item ${level}` }]),
    )
    let doc = withTorListDefinitions(makeDoc(
      Object.fromEntries(paragraphs.map((node) => [node.id, node])),
      paragraphs.map((node) => node.id),
    ))
    paragraphs.forEach((node, level) => {
      doc = applyParagraphList(doc, node.id, { instanceId: "tor-main", level, itemId: `item-${level}` })
    })

    doc = indentListItem(doc, "p7")
    expect(getParagraph(doc, "p7").props.list?.level).toBe(7)

    doc = outdentListItem(doc, "p7")
    expect(getParagraph(doc, "p7").props.list?.level).toBe(6)

    doc = applyParagraphList(doc, "p7", { instanceId: "tor-main", level: -5 })
    expect(getParagraph(doc, "p7").props.list?.level).toBe(0)

    doc = outdentListItem(doc, "p7")
    expect(getParagraph(doc, "p7").props.list?.level).toBe(0)
  })

  it("does not indent into a level missing from the list style", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Bullet" }])
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = ensureListPresetInstance(doc, {
      styleId: BULLET_BASIC_LIST_STYLE_ID,
      instanceId: "bullets",
    })
    doc = applyParagraphList(doc, "p1", { instanceId: "bullets", level: 1, itemId: "bullet.one" })

    expect(getParagraph(doc, "p1").props.list).toEqual({ instanceId: "bullets", level: 0, itemId: "bullet.one" })

    const indented = indentListItem(doc, "p1")

    expect(indented).toBe(doc)
    expect(getParagraph(indented, "p1").props.list).toEqual({ instanceId: "bullets", level: 0, itemId: "bullet.one" })
    expect(() => assertDocument(indented)).not.toThrow()
  })

  it("handles Backspace at list item start as outdent or clear-list", () => {
    const parent = makeParagraph("p0", [{ id: "t0", type: "text", text: "Parent" }])
    const child = makeParagraph("p-child", [{ id: "tc", type: "text", text: "Child" }])
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    let doc = withTorListDefinitions(makeDoc({ p0: parent, "p-child": child, p1: p }, ["p0", "p-child", "p1"]))
    doc = applyParagraphList(doc, "p0", { instanceId: "tor-main", level: 0, itemId: "parent" })
    doc = applyParagraphList(doc, "p-child", { instanceId: "tor-main", level: 1, itemId: "child" })
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", level: 2, itemId: "one" })

    doc = backspaceListItemAtStart(doc, "p1")
    expect(getParagraph(doc, "p1").props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "one" })

    doc = backspaceListItemAtStart(doc, "p1")
    expect(getParagraph(doc, "p1").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "one" })

    doc = backspaceListItemAtStart(doc, "p1")
    expect(getParagraph(doc, "p1").props.list).toBeUndefined()
    expect(getParagraph(doc, "p1").children).toEqual(p.children)
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("applies Enter and Backspace list operations inside a flow-stack without moving stack children", () => {
    const parent = makeParagraph("p0", [{ id: "t0", type: "text", text: "Parent" }])
    const left = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    const right = makeParagraph("p2", [{ id: "t3", type: "text", text: "Right stack" }])
    let doc = withTorListDefinitions(makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p0", "p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p0: parent,
      p1: left,
      p2: right,
    }, ["fr1"]))
    doc = applyParagraphList(doc, "p0", { instanceId: "tor-main", level: 0, itemId: "tor.parent" })
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", level: 1, itemId: "tor.left" })
    doc = applyParagraphList(doc, "p2", { instanceId: "tor-main", level: 0, itemId: "tor.right" })

    const split = splitListItemAtIndex(doc, "p1", "Hello ".length, { itemId: "tor.left.split" })
    const insertedId = split.newNodeId
    expect(insertedId).toBeTruthy()
    const splitSection = split.doc.document.sections[0]
    const splitStack = splitSection.nodes.fs1
    const rightStack = splitSection.nodes.fs2

    expect(splitStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (splitStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(splitStack.childIds).toEqual(["p0", "p1", insertedId])
    expect(rightStack.childIds).toEqual(["p2"])
    expect(textRunSummary(getParagraph(split.doc, "p1"))).toEqual([
      { type: "text", text: "Hello ", style: undefined },
    ])
    expect(textRunSummary(getParagraph(split.doc, insertedId))).toEqual([
      { type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    expect(getParagraph(split.doc, insertedId).props.list).toEqual({
      instanceId: "tor-main",
      level: 1,
      itemId: "tor.left.split",
    })
    expect(resolveListMarkers(split.doc).get(insertedId)?.markerText).toBe("1.2")
    expect(() => assertDocument(split.doc)).not.toThrow()

    const outdented = backspaceListItemAtStart(split.doc, insertedId)
    expect(getParagraph(outdented, insertedId).props.list).toEqual({
      instanceId: "tor-main",
      level: 0,
      itemId: "tor.left.split",
    })

    const cleared = backspaceListItemAtStart(outdented, insertedId)
    expect(getParagraph(cleared, insertedId).props.list).toBeUndefined()

    const empty = makeParagraph("empty", [{ id: "empty-t", type: "text", text: "" }])
    let exitDoc = withTorListDefinitions(makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["empty"] },
      empty,
    }, ["fr1"]))
    exitDoc = applyParagraphList(exitDoc, "empty", { instanceId: "tor-main", level: 0, itemId: "tor.empty" })

    const exited = exitListItem(exitDoc, "empty")
    const exitStack = exited.document.sections[0].nodes.fs1
    expect(exitStack.type).toBe("flow-stack")
    if (exitStack.type !== "flow-stack") return
    expect(exitStack.childIds).toEqual(["empty"])
    expect(getParagraph(exited, "empty").props.list).toBeUndefined()
    expect(() => assertDocument(exited)).not.toThrow()
  })

  it("sets and clears numbering restart metadata", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    let doc = withTorListDefinitions(makeDoc({ p1: p }, ["p1"]))
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main" })

    doc = restartParagraphListAt(doc, "p1", 3)
    expect(getParagraph(doc, "p1").props.list?.startAt).toBe(3)

    doc = restartParagraphListAt(doc, "p1", null)
    expect(getParagraph(doc, "p1").props.list?.startAt).toBeUndefined()
  })

  it("clears list metadata without changing authored text", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    let doc = withTorListDefinitions(makeDoc({ p1: p }, ["p1"]))
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", itemId: "one" })

    const result = clearParagraphList(doc, "p1")

    expect(getParagraph(result, "p1").props.list).toBeUndefined()
    expect(getParagraph(result, "p1").children).toEqual(p.children)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("toggles a preset-backed list on and off for selected paragraphs", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "One" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Two" }])
    let doc = makeDoc({ p1, p2 }, ["p1", "p2"])

    doc = toggleParagraphListPreset(doc, ["p1", "p2"], {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
    })
    expect(getParagraph(doc, "p1").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p1" })
    expect(getParagraph(doc, "p2").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "p2" })
    expect(resolveListMarkers(doc).get("p1")?.markerText).toBe("1.")

    doc = toggleParagraphListPreset(doc, ["p1", "p2"], {
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      instanceId: "tor-main",
      level: 0,
    })
    expect(getParagraph(doc, "p1").props.list).toBeUndefined()
    expect(getParagraph(doc, "p2").props.list).toBeUndefined()
    expect(getParagraph(doc, "p1").children).toEqual(p1.children)
    expect(() => assertDocument(doc)).not.toThrow()
  })

  it("splits a list item and gives the new item a unique list identity", () => {
    const parent = makeParagraph("p0", [{ id: "t0", type: "text", text: "Parent" }])
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    let doc = withTorListDefinitions(makeDoc({ p0: parent, p1: p }, ["p0", "p1"]))
    doc = applyParagraphList(doc, "p0", {
      instanceId: "tor-main",
      level: 0,
      itemId: "tor.parent",
    })
    doc = applyParagraphList(doc, "p1", {
      instanceId: "tor-main",
      level: 1,
      itemId: "tor.item.one",
      startAt: 3,
    })

    const result = splitListItemAtIndex(doc, "p1", 6, { itemId: "tor.item.two" })
    const first = getParagraph(result.doc, "p1")
    const second = getParagraph(result.doc, result.newNodeId)

    expect(textRunSummary(first)).toEqual([
      { type: "text", text: "Hello ", style: { fontWeight: "bold" } },
    ])
    expect(textRunSummary(second)).toEqual([
      { type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    expect(first.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "tor.item.one", startAt: 3 })
    expect(second.props.list).toEqual({ instanceId: "tor-main", level: 1, itemId: "tor.item.two" })
    expect(resolveListMarkers(result.doc).get("p1")?.markerText).toBe("1.3")
    expect(resolveListMarkers(result.doc).get(result.newNodeId)?.markerText).toBe("1.4")
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("preserves paragraph style metadata when splitting a list item", () => {
    const p = {
      ...makeParagraph("p1", [
        { id: "t1", type: "text", text: "Hello " },
        { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
      ]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]).props,
        paragraphStyleId: "custom.body",
        styleOverrides: { fontSize: pt(16) },
      },
    }
    let doc = withTorListDefinitions(makeDoc({ p1: p }, ["p1"]))
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(12), lineHeight: 1.5 },
    })
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", level: 0, itemId: "tor.item.one" })

    const result = splitListItemAtIndex(doc, "p1", 6)
    const second = getParagraph(result.doc, result.newNodeId)

    expect(second.props.paragraphStyleId).toBe("custom.body")
    expect(second.props.styleOverrides).toEqual({ fontSize: pt(16) })
    expect(second.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: result.newNodeId })
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("splits a listed paragraph inside a flow-table cell without moving cell children", () => {
    const p = makeParagraph("cell-p", [
      { id: "cell-t1", type: "text", text: "Cell ", style: { fontWeight: "bold" } },
      { id: "cell-t2", type: "text", text: "item", style: { fontStyle: "italic" } },
    ])
    let doc = withTorListDefinitions(makeFlowTableDoc(p))
    doc = applyParagraphList(doc, "cell-p", {
      instanceId: "tor-main",
      level: 0,
      itemId: "cell.item.one",
    })

    const result = splitListItemAtIndex(doc, "cell-p", "Cell ".length, { itemId: "cell.item.two" })
    const table = getFlowTable(result.doc)
    const first = getParagraph(result.doc, "cell-p")
    const second = getParagraph(result.doc, result.newNodeId)

    expect(result.newNodeId).toBeTruthy()
    expect(result.doc.document.sections[0].nodes[result.newNodeId]).toBeUndefined()
    expect(result.doc.document.sections[0].nodes.body?.type === "body" ? result.doc.document.sections[0].nodes.body.childIds : []).toEqual(["flow-table"])
    expect(flowTableCellParagraphTexts(table, "flow-cell")).toEqual(["Cell ", "item"])
    expect(textRunSummary(first)).toEqual([
      { type: "text", text: "Cell ", style: { fontWeight: "bold" } },
    ])
    expect(textRunSummary(second)).toEqual([
      { type: "text", text: "item", style: { fontStyle: "italic" } },
    ])
    expect(first.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "cell.item.one" })
    expect(second.props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "cell.item.two" })
    expect(resolveListMarkers(result.doc).get("cell-p")?.markerText).toBe("1.")
    expect(resolveListMarkers(result.doc).get(result.newNodeId)?.markerText).toBe("2.")
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("uses the new paragraph id as split item identity when no itemId is supplied", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }])
    let doc = withTorListDefinitions(makeDoc({ p1: p }, ["p1"]))
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", itemId: "tor.item.one" })

    const result = splitListItemAtIndex(doc, "p1", 6)

    expect(getParagraph(result.doc, result.newNodeId).props.list?.itemId).toBe(result.newNodeId)
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("does not split a list item that contains inline field objects yet", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Duration " },
      { id: "f1", type: "fieldRef", key: "project.durationDays" },
    ])
    let doc = withTorListDefinitions(makeDoc({ p1: p }, ["p1"]))
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", itemId: "tor.duration" })

    const result = splitListItemAtIndex(doc, "p1", 4)

    expect(result.doc).toBe(doc)
    expect(result.newNodeId).toBe("")
    expect(getParagraph(result.doc, "p1").children).toEqual(p.children)
  })

  it("exits a list only when the item is empty", () => {
    const empty = makeParagraph("empty", [{ id: "empty-t", type: "text", text: "" }])
    const filled = makeParagraph("filled", [{ id: "filled-t", type: "text", text: "Keep me listed" }])
    let doc = withTorListDefinitions(makeDoc({ empty, filled }, ["empty", "filled"]))
    doc = applyParagraphList(doc, ["empty", "filled"], { instanceId: "tor-main" })

    const afterEmpty = exitListItem(doc, "empty")
    const afterFilled = exitListItem(afterEmpty, "filled")

    expect(getParagraph(afterFilled, "empty").props.list).toBeUndefined()
    expect(getParagraph(afterFilled, "filled").props.list).toBeDefined()
    expect(getParagraph(afterFilled, "empty").children).toEqual(empty.children)
    expect(getParagraph(afterFilled, "filled").children).toEqual(filled.children)
    expect(() => assertDocument(afterFilled)).not.toThrow()
  })

  it("exits a list item without clearing paragraph style metadata", () => {
    const empty = {
      ...makeParagraph("empty", [{ id: "empty-t", type: "text", text: "" }]),
      props: {
        ...makeParagraph("empty", [{ id: "empty-t", type: "text", text: "" }]).props,
        paragraphStyleId: "custom.body",
        styleOverrides: { spacingAfter: pt(10) },
      },
    }
    let doc = withTorListDefinitions(makeDoc({ empty }, ["empty"]))
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { spacingAfter: pt(6) },
    })
    doc = applyParagraphList(doc, "empty", { instanceId: "tor-main", itemId: "tor.empty" })

    const result = exitListItem(doc, "empty")
    const paragraph = getParagraph(result, "empty")

    expect(paragraph.props.list).toBeUndefined()
    expect(paragraph.props.paragraphStyleId).toBe("custom.body")
    expect(paragraph.props.styleOverrides).toEqual({ spacingAfter: pt(10) })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("merges a list item into the previous text-run paragraph without duplicating list identity", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello " }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "world", style: { fontWeight: "bold" } }])
    let doc = withTorListDefinitions(makeDoc({ p1, p2 }, ["p1", "p2"]))
    doc = applyParagraphList(doc, "p1", { instanceId: "tor-main", itemId: "tor.item.one" })
    doc = applyParagraphList(doc, "p2", { instanceId: "tor-main", itemId: "tor.item.two" })

    const result = mergeListItemWithPrevious(doc, "p2")

    expect(result).not.toBeNull()
    if (!result) return
    expect(result.prevNodeId).toBe("p1")
    expect(result.caretIndex).toBe("Hello ".length)
    expect(() => getParagraph(result.doc, "p2")).toThrow()
    expect(getParagraph(result.doc, "p1").props.list).toEqual({ instanceId: "tor-main", level: 0, itemId: "tor.item.one" })
    expect(textRunSummary(getParagraph(result.doc, "p1"))).toEqual([
      { type: "text", text: "Hello ", style: undefined },
      { type: "text", text: "world", style: { fontWeight: "bold" } },
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })
})

describe("paragraph text operations", () => {
  it("updates plain text paragraph and collapses multiple text runs to one run", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = updateParagraphText(makeDoc({ p1: p }, ["p1"]), "p1", "Changed")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(updated.children[0]).toMatchObject({ id: "t1", type: "text", text: "Changed" })
  })

  it("does not update paragraph with fieldRef through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Name: " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: " baht" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Flattened")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("does not update paragraph with pageNumber through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Page 1")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("updates plain text paragraph inside a flow-table", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = updateParagraphText(makeFlowTableDoc(p), "p1", "Updated flow cell")
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Updated flow cell")
  })

  it("applies text run style to a range inside one run", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello" }])
    const result = applyTextRunStyleRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 4, {
      fontWeight: "bold",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "H", style: undefined },
      { type: "text", text: "ell", style: { fontWeight: "bold" } },
      { type: "text", text: "o", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies style across existing text runs while preserving existing overrides", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    const result = applyTextRunStyleRange(makeDoc({ p1: p }, ["p1"]), "p1", 3, 8, {
      fontWeight: "bold",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Hel", style: undefined },
      { type: "text", text: "lo ", style: { fontWeight: "bold" } },
      { type: "text", text: "wo", style: { fontStyle: "italic", fontWeight: "bold" } },
      { type: "text", text: "rld", style: { fontStyle: "italic" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("clears a run style field with null and keeps other overrides", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Styled",
      style: { fontWeight: "bold", textColor: "DC2626" },
    }])
    const result = applyTextRunStyleRange(makeDoc({ p1: p }, ["p1"]), "p1", 0, 6, {
      fontWeight: null,
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Styled", style: { textColor: "DC2626" } },
    ])
  })

  it("merges adjacent text runs after a range style creates matching authored style", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B" },
      { id: "t3", type: "text", text: "C", style: { fontWeight: "bold" } },
    ])
    const result = applyTextRunStyleRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 2, {
      fontWeight: "bold",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "ABC", style: { fontWeight: "bold" } },
    ])
  })

  it("does not split or replace runs when the patch is already applied", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Hello",
      style: { fontWeight: "bold" },
    }])
    const doc = makeDoc({ p1: p }, ["p1"])

    expect(applyTextRunStyleRange(doc, "p1", 1, 4, { fontWeight: "bold" })).toBe(doc)
  })

  it("styles text around inline objects without mutating the inline object", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ])
    const result = applyTextRunStyleRange(makeDoc({ p1: p }, ["p1"]), "p1", 0, 2, {
      textDecoration: "underline",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "A", style: { textDecoration: "underline" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { type: "text", text: "B", style: { textDecoration: "underline" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies text run style to a paragraph inside a flow-table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = applyTextRunStyleRange(makeFlowTableDoc(p), "p1", 5, 9, {
      textColor: "2563EB",
    })
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Flow ", style: undefined },
      { type: "text", text: "cell", style: { textColor: "2563EB" } },
      { type: "text", text: " text", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies paragraph text style to paragraph defaults and every text run", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello ", style: { fontStyle: "italic" } },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = applyParagraphTextStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fontWeight: "bold",
      textColor: "2563EB",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.fontWeight).toBe("bold")
    expect(updated.props.textColor).toBe("2563EB")
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Hello ", style: { fontStyle: "italic" } },
      { type: "text", text: "world", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies paragraph text style around inline objects without mutating the inline object", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ])
    const result = applyParagraphTextStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      textDecoration: "underline",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.textDecoration).toBe("underline")
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "A", style: undefined },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { type: "text", text: "B", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("clears matching run overrides when paragraph text style becomes the default", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Bold",
      style: { fontWeight: "bold", fontStyle: "italic" },
    }])
    const result = applyParagraphTextStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fontWeight: "normal",
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.fontWeight).toBe("normal")
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Bold", style: { fontStyle: "italic" } },
    ])
  })

  it("applies paragraph text style inside a flow-table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = applyParagraphTextStyle(makeFlowTableDoc(p), "p1", {
      fontFamilyKey: "notoSansThai",
      fontSize: pt(16),
    })
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.fontFamilyKey).toBe("notoSansThai")
    expect(updated.props.fontSize).toEqual(pt(16))
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Flow cell text", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("updates paragraph style overrides without changing authored text props", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }])
    const result = updateParagraphStyleOverrides(makeDoc({ p1: p }, ["p1"]), "p1", {
      fontSize: pt(16),
      spacingAfter: pt(10),
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.fontSize).toEqual(pt(12))
    expect(updated.props.styleOverrides).toEqual({
      fontSize: pt(16),
      spacingAfter: pt(10),
    })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("clears paragraph style overrides", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]).props,
        styleOverrides: { fontSize: pt(16) },
      },
    }
    const result = updateParagraphStyleOverrides(makeDoc({ p1: p }, ["p1"]), "p1", undefined)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides).toBeUndefined()
  })

  it("updates paragraph style overrides inside a flow-table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = updateParagraphStyleOverrides(makeFlowTableDoc(p), "p1", {
      textColor: "DC2626",
    })
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides).toEqual({ textColor: "DC2626" })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("patches paragraph style overrides without replacing existing override keys or text-run styles", () => {
    const p = {
      ...makeParagraph("p1", [
        { id: "t1", type: "text", text: "Styled ", style: { fontWeight: "bold" } },
        { id: "t2", type: "text", text: "body" },
      ]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled body" }]).props,
        paragraphStyleId: TOR_BODY_PARAGRAPH_STYLE_ID,
        styleOverrides: { spacingAfter: pt(10) },
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = ensureParagraphStylePreset(doc, TOR_BODY_PARAGRAPH_STYLE_ID)
    const result = patchParagraphStyleOverrides(doc, "p1", {
      fontSize: pt(16),
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides).toEqual({
      spacingAfter: pt(10),
      fontSize: pt(16),
    })
    expect(updated.props.fontSize).toEqual(pt(12))
    expect(updated.children).toEqual(p.children)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("patches paragraph style box overrides from the effective box without changing direct props", () => {
    const p = {
      ...makeParagraph("p1", [
        { id: "t1", type: "text", text: "Styled", style: { fontWeight: "bold" } },
      ]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]).props,
        paragraphStyleId: "custom.box",
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.box",
      props: {
        box: {
          fill: "F5F7FA",
          padding: {
            top: pt(2),
            right: pt(2),
            bottom: pt(2),
            left: pt(2),
          },
        },
      },
    })

    const result = patchParagraphStyleOverrideBox(doc, "p1", {
      padding: { left: pt(10) },
      border: { bottom: { style: "solid", width: pt(1), color: "111827" } },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toBeUndefined()
    expect(updated.props.styleOverrides?.box).toEqual({
      fill: "F5F7FA",
      padding: {
        top: pt(2),
        right: pt(2),
        bottom: pt(2),
        left: pt(10),
      },
      border: {
        bottom: { style: "solid", width: pt(1), color: "111827" },
      },
    })
    expect(resolveStyledParagraphProps(result.document.styles, updated).box?.padding?.left).toEqual(pt(10))
    expect(updated.children).toEqual(p.children)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("can clear an inherited style box with an explicit empty box override", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]).props,
        paragraphStyleId: "custom.box",
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.box",
      props: { box: { fill: "F5F7FA" } },
    })

    const result = patchParagraphStyleOverrideBox(doc, "p1", { fill: null })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides?.box).toEqual({})
    expect(resolveStyledParagraphProps(result.document.styles, updated).box).toEqual({})
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("allows a paragraph style override to clear a heading inherited from a style", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled" }]).props,
        paragraphStyleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = ensureParagraphStylePreset(doc, TOR_HEADING1_PARAGRAPH_STYLE_ID)
    const result = patchParagraphStyleOverrides(doc, "p1", {
      headingLevel: null,
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides).toEqual({ headingLevel: null })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("installs paragraph style presets without dropping existing text-run styles", () => {
    const doc = makeDoc({}, [])
    doc.document.styles = {
      textRunStyles: {
        emphasis: { id: "emphasis", style: { fontWeight: "bold" } },
      },
    }

    const result = ensureParagraphStylePreset(doc, TOR_BODY_PARAGRAPH_STYLE_ID)

    expect(result.document.styles?.baseParagraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(result.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID].props.fontSize).toEqual(pt(12))
    expect(result.document.styles?.textRunStyles?.emphasis).toEqual({ id: "emphasis", style: { fontWeight: "bold" } })
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("ensures a base paragraph style without replacing an existing valid base", () => {
    let doc = makeDoc({}, [])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(13) },
    })

    const result = ensureBaseParagraphStyle(doc)

    expect(result).toBe(doc)
    expect(result.document.styles?.baseParagraphStyleId).toBe("custom.body")
  })

  it("uses an upserted paragraph style as base when the existing base is missing", () => {
    const doc = makeDoc({}, [])
    doc.document.styles = {
      baseParagraphStyleId: "missing",
    }

    const result = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(13) },
    })

    expect(result.document.styles?.baseParagraphStyleId).toBe("custom.body")
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("repairs a missing base paragraph style with the body preset", () => {
    const doc = makeDoc({}, [])

    const result = ensureBaseParagraphStyle(doc)

    expect(result.document.styles?.baseParagraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(result.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID]).toBeDefined()
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("patches paragraph style definitions without rewriting referenced paragraphs", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled body" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled body" }]).props,
        paragraphStyleId: "custom.body",
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      name: "Body",
      props: { fontSize: pt(14), lineHeight: 1.25 },
    })
    const originalParagraph = doc.document.sections[0].nodes.p1

    const result = patchParagraphStyleDefinition(doc, "custom.body", {
      name: " Body Updated ",
      props: { fontSize: pt(15), spacingAfter: pt(12) },
    })
    const updatedStyle = result.document.styles?.paragraphStyles?.["custom.body"]
    const updatedParagraph = result.document.sections[0].nodes.p1

    expect(updatedStyle).toMatchObject({
      id: "custom.body",
      name: "Body Updated",
      props: {
        fontSize: pt(15),
        spacingAfter: pt(12),
        lineHeight: 1.25,
      },
    })
    expect(result.document.styles?.baseParagraphStyleId).toBe("custom.body")
    expect(updatedParagraph).toBe(originalParagraph)
    expect(resolveStyledParagraphProps(result.document.styles, updatedParagraph as ParagraphNode).fontSize).toEqual(pt(15))
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("renames paragraph style definitions and clears blank display names", () => {
    let doc = makeDoc({}, [])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      name: "Body",
      props: { fontSize: pt(12) },
    })

    const renamed = renameParagraphStyleDefinition(doc, "custom.body", " Contract Body ")
    const cleared = renameParagraphStyleDefinition(renamed, "custom.body", " ")

    expect(renamed.document.styles?.paragraphStyles?.["custom.body"].name).toBe("Contract Body")
    expect(cleared.document.styles?.paragraphStyles?.["custom.body"].name).toBeUndefined()
    expect(() => assertDocument(cleared)).not.toThrow()
  })

  it("does not patch missing paragraph style definitions", () => {
    const doc = makeDoc({}, [])

    expect(patchParagraphStyleDefinition(doc, "missing", { props: { fontSize: pt(15) } })).toBe(doc)
    expect(renameParagraphStyleDefinition(doc, "missing", "Missing")).toBe(doc)
  })

  it("clones paragraph style definition patches before storing them", () => {
    let doc = makeDoc({}, [])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(12) },
    })
    const patch = { spacingAfter: pt(8) }

    const result = patchParagraphStyleDefinition(doc, "custom.body", { props: patch })
    patch.spacingAfter.value = 99

    expect(result.document.styles?.paragraphStyles?.["custom.body"].props.spacingAfter).toEqual(pt(8))
  })

  it("applies paragraph style presets and syncs direct props for current render paths", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Heading" }])
    const result = applyParagraphStylePreset(makeDoc({ p1: p }, ["p1"]), "p1", TOR_HEADING1_PARAGRAPH_STYLE_ID)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(result.document.styles?.paragraphStyles?.[TOR_HEADING1_PARAGRAPH_STYLE_ID]).toBeDefined()
    expect(updated.props.paragraphStyleId).toBe(TOR_HEADING1_PARAGRAPH_STYLE_ID)
    expect(updated.props.styleOverrides).toBeUndefined()
    expect(updated.props.fontSize).toEqual(pt(16))
    expect(updated.props.fontWeight).toBe("bold")
    expect(updated.props.headingLevel).toBe(1)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies known paragraph style ids while optionally preserving style overrides", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]).props,
        styleOverrides: { fontSize: pt(18) },
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(14), lineHeight: 1.25 },
    })

    const result = applyParagraphStyleId(doc, "p1", "custom.body", { clearOverrides: false })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.paragraphStyleId).toBe("custom.body")
    expect(updated.props.styleOverrides).toEqual({ fontSize: pt(18) })
    expect(updated.props.fontSize).toEqual(pt(14))
    expect(updated.props.lineHeight).toBe(1.25)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("does not apply missing paragraph style ids", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }])
    const doc = makeDoc({ p1: p }, ["p1"])

    expect(applyParagraphStyleId(doc, "p1", "missing")).toBe(doc)
  })

  it("clears paragraph style ids and overrides while preserving direct props", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]).props,
        paragraphStyleId: "custom.body",
        styleOverrides: { fontSize: pt(18) },
      },
    }

    const result = clearParagraphStyleId(makeDoc({ p1: p }, ["p1"]), "p1")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.paragraphStyleId).toBeUndefined()
    expect(updated.props.styleOverrides).toBeUndefined()
    expect(updated.props.fontSize).toEqual(pt(12))
  })

  it("detaches paragraph style metadata while preserving resolved appearance and text-run styles", () => {
    const p = {
      ...makeParagraph("p1", [
        { id: "t1", type: "text", text: "Styled ", style: { fontWeight: "bold" } },
        { id: "t2", type: "text", text: "body" },
      ]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Styled body" }]).props,
        paragraphStyleId: TOR_HEADING1_PARAGRAPH_STYLE_ID,
        styleOverrides: {
          fontSize: pt(18),
          headingLevel: null,
          spacingAfter: pt(20),
        },
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = ensureParagraphStylePreset(doc, TOR_HEADING1_PARAGRAPH_STYLE_ID)

    const result = detachParagraphStyle(doc, "p1")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.paragraphStyleId).toBeUndefined()
    expect(updated.props.styleOverrides).toBeUndefined()
    expect(updated.props.fontSize).toEqual(pt(18))
    expect(updated.props.fontWeight).toBe("bold")
    expect(updated.props.headingLevel).toBeUndefined()
    expect(updated.props.spacingAfter).toEqual(pt(20))
    expect(updated.children).toEqual(p.children)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("resets paragraph style overrides and syncs direct props to the referenced style", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Body" }]).props,
        paragraphStyleId: "custom.body",
        styleOverrides: { fontSize: pt(18) },
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(14), lineHeight: 1.25 },
    })

    const result = resetParagraphStyleOverrides(doc, "p1")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.styleOverrides).toBeUndefined()
    expect(updated.props.fontSize).toEqual(pt(14))
    expect(updated.props.lineHeight).toBe(1.25)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("applies paragraph style presets inside a flow-table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Flow cell text" }])
    const result = applyParagraphStylePreset(makeFlowTableDoc(p), "p1", TOR_BODY_PARAGRAPH_STYLE_ID)
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.paragraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("deletes text inside one styled run without losing the remaining style", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Hello",
      style: { fontWeight: "bold" },
    }])
    const result = deleteTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 4)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Ho", style: { fontWeight: "bold" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("deletes text across runs and merges adjacent matching styles", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B" },
      { id: "t3", type: "text", text: "C", style: { fontWeight: "bold" } },
    ])
    const result = deleteTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 2)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "AC", style: { fontWeight: "bold" } },
    ])
  })

  it("leaves one empty text run when deleting all text from a text-only paragraph", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Styled",
      style: { textColor: "DC2626" },
    }])
    const result = deleteTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 0, 6)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "", style: { textColor: "DC2626" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("preserves inline objects while deleting surrounding text", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ])
    const result = deleteTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 0, 2)
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("deletes text range inside a flow-table cell paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Flow " },
      { id: "t2", type: "text", text: "cell", style: { textColor: "2563EB" } },
      { id: "t3", type: "text", text: " text" },
    ])
    const result = deleteTextRunRange(makeFlowTableDoc(p), "p1", 5, 9)
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Flow  text", style: undefined },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("does not update the document for collapsed or out-of-range delete ranges", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello" }])
    const doc = makeDoc({ p1: p }, ["p1"])

    expect(deleteTextRunRange(doc, "p1", 2, 2)).toBe(doc)
    expect(deleteTextRunRange(doc, "p1", 8, 12)).toBe(doc)
  })

  it("inserts text inside a styled run and inherits the run style", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Hello",
      style: { fontWeight: "bold" },
    }])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 2, 2, "X")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "HeXllo", style: { fontWeight: "bold" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("replaces text across runs using the style at the replacement start", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "AB", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "CD", style: { fontStyle: "italic" } },
    ])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 3, "X")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "AX", style: { fontWeight: "bold" } },
      { type: "text", text: "D", style: { fontStyle: "italic" } },
    ])
  })

  it("inserts at a run boundary using the previous run style", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A", style: { textColor: "DC2626" } },
      { id: "t2", type: "text", text: "B" },
    ])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 1, "x")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Ax", style: { textColor: "DC2626" } },
      { type: "text", text: "B", style: undefined },
    ])
  })

  it("replaces text with an explicit authored style override", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello" }])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 4, "EL", {
      style: { fontStyle: "italic", textColor: "2563EB" },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "H", style: undefined },
      { type: "text", text: "EL", style: { fontStyle: "italic", textColor: "2563EB" } },
      { type: "text", text: "o", style: undefined },
    ])
  })

  it("can force inserted text to be plain by passing style null", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "AB",
      style: { fontWeight: "bold" },
    }])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 1, 1, "x", { style: null })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "A", style: { fontWeight: "bold" } },
      { type: "text", text: "x", style: undefined },
      { type: "text", text: "B", style: { fontWeight: "bold" } },
    ])
  })

  it("preserves inline objects while replacing surrounding text", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "A" },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: "B" },
    ])
    const result = replaceTextRunRange(makeDoc({ p1: p }, ["p1"]), "p1", 0, 2, "X", {
      style: { textDecoration: "underline" },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "X", style: { textDecoration: "underline" } },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("replaces text range inside a flow-table cell paragraph", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Flow cell text",
      style: { textColor: "2563EB" },
    }])
    const result = replaceTextRunRange(makeFlowTableDoc(p), "p1", 5, 9, "box")
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Flow box text", style: { textColor: "2563EB" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("does not update the document for collapsed empty replacement", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello" }])
    const doc = makeDoc({ p1: p }, ["p1"])

    expect(replaceTextRunRange(doc, "p1", 2, 2, "")).toBe(doc)
  })

  it("computes the minimal whole-paragraph text replacement", () => {
    expect(resolveTextRunParagraphTextReplacement("Hello world", "Hello bold world")).toEqual({
      start: 6,
      end: 6,
      text: "bold ",
    })
    expect(resolveTextRunParagraphTextReplacement("Hello bold world", "Hello world")).toEqual({
      start: 6,
      end: 11,
      text: "",
    })
    expect(resolveTextRunParagraphTextReplacement("Same", "Same")).toBeNull()
  })

  it("replaces whole paragraph text while preserving unchanged styled runs", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    const result = replaceTextRunParagraphText(makeDoc({ p1: p }, ["p1"]), "p1", "Hello wide world")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Hello wide ", style: { fontWeight: "bold" } },
      { type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("replaces whole paragraph text inside a flow-table cell without stripping run style", () => {
    const p = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Flow base",
      style: { textColor: "2563EB" },
    }])
    const result = replaceTextRunParagraphText(makeFlowTableDoc(p), "p1", "Flow draft")
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Flow draft", style: { textColor: "2563EB" } },
    ])
    expect(() => assertDocument(result)).not.toThrow()
  })

  it("does not replace whole paragraph text when inline objects are present", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])

    expect(replaceTextRunParagraphText(doc, "p1", "Page 1")).toBe(doc)
    expect(replaceTextRunParagraphTextInParagraph(p, "Page 1")).toBeNull()
  })

  it("splits plain text paragraph and preserves total text", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = splitParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(paragraphText(first)).toBe("Hello ")
    expect(paragraphText(second)).toBe("world")
  })

  it("uses a non-colliding preallocated split paragraph id", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello world" },
    ])
    const result = splitParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 6, {
      newNodeId: "preallocated-split-id",
    })
    const section = result.doc.document.sections[0]

    expect(result.newNodeId).toBe("preallocated-split-id")
    expect(section.nodes["preallocated-split-id"]?.type).toBe("paragraph")
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "p1",
      "preallocated-split-id",
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("does not reuse a colliding preallocated split paragraph id", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello world" },
    ])
    const existing = makeParagraph("existing", [
      { id: "t2", type: "text", text: "Existing paragraph" },
    ])
    const result = splitParagraphAtIndex(makeDoc({ p1, existing }, ["p1", "existing"]), "p1", 6, {
      newNodeId: "existing",
    })
    const section = result.doc.document.sections[0]

    expect(result.newNodeId).not.toBe("existing")
    expect(section.nodes.existing).toEqual(existing)
    expect(section.nodes[result.newNodeId]?.type).toBe("paragraph")
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual([
      "p1",
      result.newNodeId,
      "existing",
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("does not reuse a preallocated split paragraph id that collides inside a flow-table", () => {
    const cellParagraph = makeParagraph("cell-existing", [
      { id: "cell-t", type: "text", text: "Existing cell paragraph" },
    ])
    const result = splitParagraphAtIndex(
      makeFlowTableDoc(cellParagraph),
      "cell-existing",
      "Existing ".length,
      { newNodeId: "cell-existing" },
    )
    const table = getFlowTable(result.doc)

    expect(result.newNodeId).not.toBe("cell-existing")
    expect(table.nodes["cell-existing"]).toBeDefined()
    expect(table.nodes[result.newNodeId]?.type).toBe("paragraph")
    expect(flowTableCellParagraphTexts(table, "flow-cell")).toEqual([
      "Existing ",
      "cell paragraph",
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("transfers outer paragraph spacing across a plain text split", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]).props,
        spacingBefore: pt(12),
        spacingAfter: pt(18),
      },
    }

    const result = splitParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(first.props.spacingBefore).toEqual(pt(12))
    expect(first.props.spacingAfter).toEqual(pt(0))
    expect(second.props.spacingBefore).toEqual(pt(0))
    expect(second.props.spacingAfter).toEqual(pt(18))
  })

  it("splits plain text paragraphs with cloned paragraph style metadata", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]).props,
        paragraphStyleId: "custom.body",
        styleOverrides: { fontSize: pt(16) },
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(12) },
    })

    const result = splitParagraphAtIndex(doc, "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(first.props.paragraphStyleId).toBe("custom.body")
    expect(second.props.paragraphStyleId).toBe("custom.body")
    expect(first.props.styleOverrides).toEqual({ fontSize: pt(16) })
    expect(second.props.styleOverrides).toEqual({ fontSize: pt(16) })

    second.props.styleOverrides!.fontSize!.value = 99
    expect(first.props.styleOverrides).toEqual({ fontSize: pt(16) })
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("splits a plain text paragraph inside a flow-table cell without moving it to body flow", () => {
    const p = makeParagraph("cell-p", [
      { id: "cell-t1", type: "text", text: "Cell " },
      { id: "cell-t2", type: "text", text: "paragraph" },
    ])
    const result = splitParagraphAtIndex(makeFlowTableDoc(p), "cell-p", "Cell ".length)
    const section = result.doc.document.sections[0]
    const table = getFlowTable(result.doc)

    expect(result.newNodeId).toBeTruthy()
    expect(section.nodes[result.newNodeId]).toBeUndefined()
    expect(section.nodes.body?.type === "body" ? section.nodes.body.childIds : []).toEqual(["flow-table"])
    expect(flowTableCellParagraphTexts(table, "flow-cell")).toEqual(["Cell ", "paragraph"])
    expect(table.nodes[result.newNodeId]?.type).toBe("paragraph")
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("deletes an empty flow-table cell paragraph when a previous paragraph remains in the cell", () => {
    const previous = makeParagraph("cell-p1", [{ id: "cell-t1", type: "text", text: "Previous" }])
    const empty = makeParagraph("cell-p2", [{ id: "cell-t2", type: "text", text: "" }])
    const doc = makeFlowTableDocWithParagraphs([previous, empty])
    const result = deleteEmptyFlowTableCellParagraph(doc, "cell-p2")

    expect(result).not.toBeNull()
    if (!result) return
    const table = getFlowTable(result.doc)

    expect(result.prevNodeId).toBe("cell-p1")
    expect(result.caretIndex).toBe("Previous".length)
    expect(table.nodes["cell-p2"]).toBeUndefined()
    expect(flowTableCellParagraphTexts(table, "flow-cell")).toEqual(["Previous"])
    expect(result.doc.document.sections[0].nodes["cell-p2"]).toBeUndefined()
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("does not delete the only paragraph in a flow-table cell", () => {
    const empty = makeParagraph("cell-p1", [{ id: "cell-t1", type: "text", text: "" }])

    expect(deleteEmptyFlowTableCellParagraph(makeFlowTableDoc(empty), "cell-p1")).toBeNull()
  })

  it("does not delete non-empty flow-table cell paragraphs", () => {
    const previous = makeParagraph("cell-p1", [{ id: "cell-t1", type: "text", text: "Previous" }])
    const current = makeParagraph("cell-p2", [{ id: "cell-t2", type: "text", text: "Current" }])

    expect(deleteEmptyFlowTableCellParagraph(makeFlowTableDocWithParagraphs([previous, current]), "cell-p2")).toBeNull()
  })

  it("overrides style-backed spacing at the new split boundary", () => {
    const p = {
      ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]),
      props: {
        ...makeParagraph("p1", [{ id: "t1", type: "text", text: "Hello world" }]).props,
        paragraphStyleId: "custom.body",
      },
    }
    let doc = makeDoc({ p1: p }, ["p1"])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: {
        fontSize: pt(12),
        spacingBefore: pt(10),
        spacingAfter: pt(14),
      },
    })

    const result = splitParagraphAtIndex(doc, "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(resolveStyledParagraphProps(result.doc.document.styles, first).spacingBefore).toEqual(pt(10))
    expect(resolveStyledParagraphProps(result.doc.document.styles, first).spacingAfter).toEqual(pt(0))
    expect(resolveStyledParagraphProps(result.doc.document.styles, second).spacingBefore).toEqual(pt(0))
    expect(resolveStyledParagraphProps(result.doc.document.styles, second).spacingAfter).toEqual(pt(14))
    expect(first.props.styleOverrides?.spacingAfter).toEqual(pt(0))
    expect(second.props.styleOverrides?.spacingBefore).toEqual(pt(0))
  })

  it("does not split mixed inline paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = splitParagraphAtIndex(doc, "p1", 3)

    expect(result.doc).toBe(doc)
    expect(result.newNodeId).toBe("")
  })

  it("merges plain text paragraphs and collapses merged result to one run", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "there" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t3", type: "text", text: " world" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).not.toBeNull()
    if (!result) return
    const updated = result.doc.document.sections[0].nodes.p1
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(paragraphText(updated)).toBe("Hello there world")
    expect(result.caretIndex).toBe("Hello there".length)
  })

  it("does not merge when either paragraph has mixed inline children", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: " body" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).toBeNull()
  })

  it("splits a styled text-run paragraph without stripping run styles", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ])
    const result = splitTextRunParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 8)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(textRunSummary(first)).toEqual([
      { type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { type: "text", text: "wo", style: { fontStyle: "italic" } },
    ])
    expect(textRunSummary(second)).toEqual([
      { type: "text", text: "rld", style: { fontStyle: "italic" } },
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("splits a styled text-run paragraph inside a flow-table cell", () => {
    const p = makeParagraph("cell-p", [
      { id: "cell-t1", type: "text", text: "Cell ", style: { fontWeight: "bold" } },
      { id: "cell-t2", type: "text", text: "content", style: { fontStyle: "italic" } },
    ])
    const result = splitTextRunParagraphAtIndex(makeFlowTableDoc(p), "cell-p", "Cell co".length)
    const table = getFlowTable(result.doc)
    const first = table.nodes["cell-p"]
    const second = table.nodes[result.newNodeId]

    expect(first?.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first?.type !== "paragraph" || second?.type !== "paragraph") return
    expect(flowTableCellParagraphTexts(table, "flow-cell")).toEqual(["Cell co", "ntent"])
    expect(textRunSummary(first)).toEqual([
      { type: "text", text: "Cell ", style: { fontWeight: "bold" } },
      { type: "text", text: "co", style: { fontStyle: "italic" } },
    ])
    expect(textRunSummary(second)).toEqual([
      { type: "text", text: "ntent", style: { fontStyle: "italic" } },
    ])
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("keeps an empty styled anchor when splitting a text-run paragraph at the start", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Styled", style: { textColor: "DC2626" } },
    ])
    const result = splitTextRunParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 0)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(textRunSummary(first)).toEqual([
      { type: "text", text: "", style: { textColor: "DC2626" } },
    ])
    expect(textRunSummary(second)).toEqual([
      { type: "text", text: "Styled", style: { textColor: "DC2626" } },
    ])
  })

  it("does not split a rich paragraph that contains inline objects yet", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = splitTextRunParagraphAtIndex(doc, "p1", 3)

    expect(result.doc).toBe(doc)
    expect(result.newNodeId).toBe("")
  })

  it("merges styled text-run paragraphs and preserves caret position", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
    ])
    const p2 = makeParagraph("p2", [
      { id: "t2", type: "text", text: "world", style: { fontWeight: "bold" } },
      { id: "t3", type: "text", text: "!", style: { fontStyle: "italic" } },
    ])
    const result = mergeTextRunParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).not.toBeNull()
    if (!result) return
    const updated = result.doc.document.sections[0].nodes.p1
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(textRunSummary(updated)).toEqual([
      { type: "text", text: "Hello world", style: { fontWeight: "bold" } },
      { type: "text", text: "!", style: { fontStyle: "italic" } },
    ])
    expect(result.caretIndex).toBe("Hello ".length)
    expect(() => assertDocument(result.doc)).not.toThrow()
  })

  it("does not merge a text-run paragraph with a previous mixed-inline paragraph", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "body", style: { fontWeight: "bold" } }])

    expect(mergeTextRunParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")).toBeNull()
  })
})

describe("paragraph box style operations", () => {
  it("updates body paragraph box style without changing text content", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const result = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fill: "F8FAFC",
      padding: {
        top: pt(4),
        right: pt(5),
        bottom: pt(6),
        left: pt(7),
      },
      border: {
        top: { style: "solid", width: pt(1), color: "111111" },
        right: { style: "dashed", width: pt(2), color: "222222" },
      },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Box me")
    expect(updated.props.box).toEqual({
      fill: "F8FAFC",
      padding: { top: pt(4), right: pt(5), bottom: pt(6), left: pt(7) },
      border: {
        top: { style: "solid", width: pt(1), color: "111111" },
        right: { style: "dashed", width: pt(2), color: "222222" },
      },
    })
  })

  it("merges partial box changes and prunes zero/none values", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const withBox = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      padding: { top: pt(8), left: pt(3) },
      border: {
        bottom: { style: "solid", width: pt(2), color: "333333" },
      },
    })
    const result = updateParagraphBoxStyle(withBox, "p1", {
      padding: { left: pt(0) },
      border: {
        bottom: { style: "none", width: pt(2), color: "333333" },
      },
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toEqual({
      padding: { top: pt(8), right: pt(0), bottom: pt(0), left: pt(0) },
    })
  })

  it("removes an empty paragraph box when all channels are cleared", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Box me" }])
    const withBox = updateParagraphBoxStyle(makeDoc({ p1: p }, ["p1"]), "p1", {
      fill: "FFFFFF",
      padding: { top: pt(2) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
    const result = updateParagraphBoxStyle(withBox, "p1", {
      fill: null,
      padding: null,
      border: null,
    })
    const updated = result.document.sections[0].nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toBeUndefined()
  })

  it("updates paragraph box style inside a flow-table cell", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Cell" }])
    const result = updateParagraphBoxStyle(makeFlowTableDoc(p), "p1", {
      fill: "E0F2FE",
      padding: { left: pt(9) },
    })
    const table = result.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const updated = table.nodes.p1

    expect(() => assertDocument(result)).not.toThrow()
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.props.box).toEqual({
      fill: "E0F2FE",
      padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(9) },
    })
  })
})

describe("flow-stack box style operations", () => {
  it("updates flow-stack box style without changing row structure", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Column text" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: p,
    }, ["fr1"])

    const result = updateFlowStackBoxStyle(doc, "fs1", {
      fill: "E0F2FE",
      padding: { top: pt(4), left: pt(6) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
    const section = result.document.sections[0]
    const row = section.nodes.fr1
    const stack = section.nodes.fs1

    expect(() => assertDocument(result)).not.toThrow()
    expect(row.type).toBe("flow-row")
    expect(stack.type).toBe("flow-stack")
    if (row.type !== "flow-row" || stack.type !== "flow-stack") return
    expect(row.childIds).toEqual(["fs1"])
    expect(stack.childIds).toEqual(["p1"])
    expect(stack.props.box).toEqual({
      fill: "E0F2FE",
      padding: { top: pt(4), right: pt(0), bottom: pt(0), left: pt(6) },
      border: { left: { style: "solid", width: pt(1), color: "111111" } },
    })
  })
})

describe("field reference operations", () => {
  it("updates fieldRef label and fallback without changing its key", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Customer: " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ])
    const updated = updateFieldRefInline(makeDoc({ p1: p }, ["p1"]), "f1", {
      label: "Client",
      fallback: "pending",
    })
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[1]).toMatchObject({
      id: "f1",
      type: "fieldRef",
      key: "customer.name",
      label: "Client",
      fallback: "pending",
    })
  })

  it("clears optional fieldRef label and fallback without removing the fieldRef", () => {
    const p = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "-" },
    ])
    const updated = updateFieldRefInline(makeDoc({ p1: p }, ["p1"]), "f1", {
      label: "",
      fallback: "",
    })
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[0]).toEqual({
      id: "f1",
      type: "fieldRef",
      key: "customer.name",
    })
  })

  it("updates fieldRef metadata inside a flow-table-cell paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "f1", type: "fieldRef", key: "line.sku", label: "SKU", fallback: "N/A" },
    ])
    const updated = updateFieldRefInline(makeFlowTableDoc(p), "f1", { label: "Item SKU" })
    const table = updated.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const paragraph = table.nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[0]).toMatchObject({
      id: "f1",
      type: "fieldRef",
      key: "line.sku",
      label: "Item SKU",
      fallback: "N/A",
    })
  })

  it("inserts a fieldRef inline into a body paragraph without flattening text runs", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Customer: " },
      { id: "t2", type: "text", text: " due" },
    ])
    const updated = applyPlacementOperation(
      makeDoc({ p1: p }, ["p1"]),
      "section",
      { kind: "insert-inline-field", paragraphId: "p1", index: 1 },
      {
        source: "field",
        field: { key: "customer.name", label: "Customer", fallback: "-", fieldType: "text" },
      },
    )
    const paragraph = updated.document.sections[0].nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children).toHaveLength(3)
    expect(paragraph.children[0]).toMatchObject({ id: "t1", type: "text", text: "Customer: " })
    expect(paragraph.children[1]).toMatchObject({
      type: "fieldRef",
      key: "customer.name",
      label: "Customer",
      fallback: "-",
    })
    expect(paragraph.children[2]).toMatchObject({ id: "t2", type: "text", text: " due" })
  })

  it("inserts a fieldRef inline into a flow-table-cell paragraph", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "SKU: " }])
    const updated = applyPlacementOperation(
      makeFlowTableDoc(p),
      "section",
      { kind: "insert-inline-field", paragraphId: "p1", index: 1 },
      {
        source: "field",
        field: { key: "line.sku", label: "SKU", fallback: "N/A", fieldType: "text" },
      },
    )
    const table = updated.document.sections[0].nodes["flow-table"] as unknown as FlowTableNode
    const paragraph = table.nodes.p1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children).toHaveLength(2)
    expect(paragraph.children[0]).toMatchObject({ id: "t1", type: "text", text: "SKU: " })
    expect(paragraph.children[1]).toMatchObject({
      type: "fieldRef",
      key: "line.sku",
      label: "SKU",
      fallback: "N/A",
    })
  })
})

describe("rich text guard operations", () => {
  it("does not route styled text runs through the plain-text rewrite lane", () => {
    const p1 = makeParagraph("p1", [{
      id: "t1",
      type: "text",
      text: "Styled",
      style: { fontWeight: "bold" },
    }])
    const doc = makeDoc({ p1 }, ["p1"])

    const updated = updateParagraphText(doc, "p1", "Changed")
    const paragraph = updated.document.sections[0].nodes.p1

    expect(isPlainTextParagraph(p1)).toBe(false)
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children).toEqual(p1.children)
  })
})

describe("node duplication operations", () => {
  it("duplicates a paragraph after the source with fresh node and inline ids", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Original" }])
    const doc = makeDoc({ p1 }, ["p1"])

    const result = duplicateNode(doc, "p1")
    const updated = result.doc
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(result.duplicatedNodeId).not.toBeNull()
    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body" || !result.duplicatedNodeId) return
    expect(body.childIds).toEqual(["p1", result.duplicatedNodeId])

    const clone = section.nodes[result.duplicatedNodeId]
    expect(clone.type).toBe("paragraph")
    if (clone.type !== "paragraph") return
    expect(clone.children[0]?.id).not.toBe("t1")
    expect(clone.children[0]).toMatchObject({ type: "text", text: "Original" })
  })

  it("duplicates a flow-stack inside a flow-row and preserves total width share", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    const result = duplicateNode(doc, "fs1")
    const updated = result.doc
    const section = updated.document.sections[0]
    const row = section.nodes.fr1

    expect(result.duplicatedNodeId).not.toBeNull()
    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row" || !result.duplicatedNodeId) return
    expect(row.childIds).toEqual(["fs1", result.duplicatedNodeId])

    const source = section.nodes.fs1
    const clone = section.nodes[result.duplicatedNodeId]
    expect(source.type).toBe("flow-stack")
    expect(clone.type).toBe("flow-stack")
    if (source.type !== "flow-stack" || clone.type !== "flow-stack") return
    expect(source.props.widthShare).toBe(50)
    expect(clone.props.widthShare).toBe(50)
    expect(clone.childIds).toHaveLength(1)
    expect(clone.childIds[0]).not.toBe("p1")
  })

  it("duplicates a flow-table with fresh internal row, cell, paragraph, and text ids", () => {
    const paragraph = makeParagraph("cell-p", [{ id: "cell-t", type: "text", text: "Cell" }])
    const doc = makeFlowTableDoc(paragraph)

    const result = duplicateNode(doc, "flow-table")
    const updated = result.doc
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(result.duplicatedNodeId).not.toBeNull()
    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body" || !result.duplicatedNodeId) return
    expect(body.childIds).toEqual(["flow-table", result.duplicatedNodeId])

    const clone = section.nodes[result.duplicatedNodeId] as unknown as FlowTableNode
    expect(clone.type).toBe("flow-table")
    expect(clone.rowIds).toHaveLength(1)
    expect(clone.rowIds[0]).not.toBe("flow-row")
    const clonedRow = clone.nodes[clone.rowIds[0]]
    expect(clonedRow.type).toBe("flow-table-row")
    if (clonedRow.type !== "flow-table-row") return
    expect(clonedRow.cellIds[0]).not.toBe("flow-cell")
    const clonedCell = clone.nodes[clonedRow.cellIds[0]]
    expect(clonedCell.type).toBe("flow-table-cell")
    if (clonedCell.type !== "flow-table-cell") return
    expect(clonedCell.childIds[0]).not.toBe("cell-p")
    const clonedParagraph = clone.nodes[clonedCell.childIds[0]]
    expect(clonedParagraph.type).toBe("paragraph")
    if (clonedParagraph.type !== "paragraph") return
    expect(clonedParagraph.children[0]?.id).not.toBe("cell-t")
  })

  it("copies a paragraph through placement without moving the source", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Original" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Target" }])
    const doc = makeDoc({ p1, p2 }, ["p1", "p2"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-after", parentId: "body", parentType: "body", index: 2, anchorNodeId: "p2" },
      { source: "document-copy", nodeId: "p1" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toHaveLength(3)
    expect(body.childIds.slice(0, 2)).toEqual(["p1", "p2"])
    const cloneId = body.childIds[2]
    expect(cloneId).not.toBe("p1")

    const clone = section.nodes[cloneId]
    expect(clone.type).toBe("paragraph")
    if (clone.type !== "paragraph") return
    expect(clone.children[0]?.id).not.toBe("t1")
    expect(clone.children[0]).toMatchObject({ type: "text", text: "Original" })
  })

  it("copies a flow-stack into a flow-row without removing the source stack", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "move-flow-stack-into-row", rowId: "fr1", targetStackId: "fs2", position: "before" },
      { source: "document-copy", nodeId: "fs1" },
    )
    const section = updated.document.sections[0]
    const row = section.nodes.fr1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")
    const cloneId = row.childIds[1]
    expect(cloneId).not.toBe("fs1")

    const source = section.nodes.fs1
    const target = section.nodes.fs2
    const clone = section.nodes[cloneId]
    expect(source.type).toBe("flow-stack")
    expect(target.type).toBe("flow-stack")
    expect(clone.type).toBe("flow-stack")
    if (source.type !== "flow-stack" || target.type !== "flow-stack" || clone.type !== "flow-stack") return
    expect(source.props.widthShare).toBe(50)
    expect(target.props.widthShare).toBe(25)
    expect(clone.props.widthShare).toBe(25)
    expect(clone.childIds[0]).not.toBe("p1")
  })
})

describe("flow-row / flow-stack operations", () => {
  it("maps the Row palette block to a single-stack flow-row", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "row" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(1)

    const stack = section.nodes[row.childIds[0]]
    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.props.widthShare).toBe(100)
  })

  it("maps the Columns palette block to a two-stack flow-row", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "columns" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])
  })

  it("wraps a body paragraph in flow-stack columns on horizontal placement", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Right" }])
    const updated = applyPlacementOperation(
      makeDoc({ p1 }, ["p1"]),
      "section",
      { kind: "wrap-in-row-left", parentId: "body", parentType: "body", index: 0, targetNodeId: "p1" },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])

    const [leftStackId, rightStackId] = row.childIds
    const leftStack = section.nodes[leftStackId]
    const rightStack = section.nodes[rightStackId]
    expect(leftStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(section.nodes[leftStack.childIds[0]]?.type).toBe("paragraph")
    expect(rightStack.childIds).toEqual(["p1"])
  })

  it("keeps direct legacy stack wrap operations on the old row model", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Nested" }])
    const updated = applyPlacementOperation(
      makeDoc({
        rowParent: { id: "rowParent", type: "row", props: {}, childIds: ["stackParent"] },
        stackParent: { id: "stackParent", type: "stack", props: { widthShare: 100 }, childIds: ["p1"] },
        p1,
      }, ["rowParent"]),
      "section",
      { kind: "wrap-in-row-left", parentId: "stackParent", parentType: "stack", index: 0, targetNodeId: "p1" },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const stackParent = section.nodes.stackParent

    expect(() => assertDocument(updated)).not.toThrow()
    expect(stackParent.type).toBe("stack")
    if (stackParent.type !== "stack") return

    const row = section.nodes[stackParent.childIds[0]]
    expect(row.type).toBe("row")
    if (row.type !== "row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["stack", "stack"])
  })

  it("inserts a default two-stack flow-row from the palette", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-columns" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toHaveLength(1)

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(2)
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])
    expect(row.childIds.map((id) => {
      const stack = section.nodes[id]
      return stack.type === "flow-stack" ? stack.props.widthShare : undefined
    })).toEqual([50, 50])
  })

  it("inserts a flow-row palette block into a header/footer zone root stack", () => {
    const doc = makeDoc({
      "header-root": { id: "header-root", type: "stack", props: {}, childIds: [] },
    }, [])
    doc.document.sections[0].headerRootId = "header-root"

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "header-root", containerType: "stack", index: 0 },
      { source: "palette", blockType: "flow-columns", columnShares: [50, 50] },
    )
    const section = updated.document.sections[0]
    const headerRoot = section.nodes["header-root"]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(headerRoot.type).toBe("stack")
    if (headerRoot.type !== "stack") return
    expect(headerRoot.childIds).toHaveLength(1)

    const row = section.nodes[headerRoot.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds.map((id) => section.nodes[id]?.type)).toEqual(["flow-stack", "flow-stack"])
  })

  it("uses palette column share presets when inserting flow columns", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-columns", columnShares: [66.67, 33.33] },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const row = section.nodes[body.childIds[0]]
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(2)
    expect(row.childIds.map((id) => {
      const stack = section.nodes[id]
      return stack.type === "flow-stack" ? stack.props.widthShare : undefined
    })).toEqual([66.67, 33.33])
  })

  it("inserts a default 3 by 3 flow-table from the palette", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-table" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toHaveLength(1)

    const table = section.nodes[body.childIds[0]] as unknown as FlowTableNode
    expect(table.type).toBe("flow-table")
    expect(table.props.headerRowCount).toBe(1)
    expect(table.props.repeatHeaderRows).toBe(true)
    expect(table.rowIds).toHaveLength(3)
    expect(table.columns).toHaveLength(3)
    expect(table.columns.map((column) => column.width)).toEqual([pt(150), pt(150), pt(150)])

    table.rowIds.forEach((rowId, rowIndex) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("flow-table-row")
      if (row.type !== "flow-table-row") return
      expect(row.cellIds).toHaveLength(3)
      row.cellIds.forEach((cellId, columnIndex) => {
        const cell = table.nodes[cellId]
        expect(cell.type).toBe("flow-table-cell")
        if (cell.type !== "flow-table-cell") return
        expect(cell.props.box?.border?.top).toEqual({ style: "solid", width: pt(1), color: "000000" })
        expect(cell.props.box?.fill).toBe(rowIndex === 0 ? "F3F4F6" : undefined)
        expect(cell.childIds).toHaveLength(1)
        const paragraph = table.nodes[cell.childIds[0]]
        expect(paragraph.type).toBe("paragraph")
        if (paragraph.type !== "paragraph") return
        expect(paragraph.props.fontWeight).toBe(rowIndex === 0 ? "bold" : "normal")
        expect(paragraphText(paragraph)).toBe(rowIndex === 0 ? `Header ${columnIndex + 1}` : "")
      })
    })
  })

  it("uses palette table size when inserting a flow-table", () => {
    const updated = applyPlacementOperation(
      makeDoc({}, []),
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "flow-table", tableSize: { rows: 4, columns: 2 } },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return

    const table = section.nodes[body.childIds[0]] as unknown as FlowTableNode
    expect(table.type).toBe("flow-table")
    expect(table.rowIds).toHaveLength(4)
    expect(table.columns).toHaveLength(2)
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("flow-table-row")
      if (row.type !== "flow-table-row") return
      expect(row.cellIds).toHaveLength(2)
    })
  })

  it("inserts a paragraph into an empty flow-stack", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs1", containerType: "flow-stack", index: 0 },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const stack = section.nodes.fs1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.childIds).toHaveLength(1)
    expect(section.nodes[stack.childIds[0]]?.type).toBe("paragraph")
  })

  it("uses the document base paragraph style for palette paragraphs", () => {
    let doc = makeDoc({}, [])
    doc = upsertParagraphStyleDefinition(doc, {
      id: "custom.body",
      props: { fontSize: pt(13), lineHeight: 1.25, spacingAfter: pt(9) },
    })

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    const paragraph = section.nodes[body.childIds[0]]
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.props.paragraphStyleId).toBe("custom.body")
    expect(paragraph.props.fontSize).toEqual(pt(13))
    expect(paragraph.props.lineHeight).toBe(1.25)
    expect(paragraph.props.spacingAfter).toEqual(pt(9))
  })

  it("inserts divider, TOC, and page-break palette blocks with authored defaults", () => {
    const doc = makeDoc({}, [])

    const withDivider = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "body", containerType: "body", index: 0 },
      { source: "palette", blockType: "divider" },
    )
    const dividerSection = withDivider.document.sections[0]
    const dividerBody = dividerSection.nodes.body

    expect(() => assertDocument(withDivider)).not.toThrow()
    expect(dividerBody.type).toBe("body")
    if (dividerBody.type !== "body") return
    const divider = dividerSection.nodes[dividerBody.childIds[0]]
    expect(divider.type).toBe("divider")
    if (divider.type !== "divider") return
    expect(divider.props).toMatchObject({
      color: "CBD5E1",
      thickness: pt(1),
      marginBefore: pt(6),
      marginAfter: pt(6),
      style: "solid",
    })

    const withToc = applyPlacementOperation(
      withDivider,
      "section",
      { kind: "insert-after", parentId: "body", parentType: "body", index: 1, anchorNodeId: divider.id },
      { source: "palette", blockType: "toc" },
    )
    const tocSection = withToc.document.sections[0]
    const tocBody = tocSection.nodes.body

    expect(() => assertDocument(withToc)).not.toThrow()
    expect(tocBody.type).toBe("body")
    if (tocBody.type !== "body") return
    const toc = tocSection.nodes[tocBody.childIds[1]]
    expect(toc.type).toBe("toc")
    if (toc.type !== "toc") return
    expect(toc.props).toEqual({ title: "สารบัญ", maxLevel: 3 })

    const withPageBreak = applyPlacementOperation(
      withToc,
      "section",
      { kind: "insert-after", parentId: "body", parentType: "body", index: 2, anchorNodeId: toc.id },
      { source: "palette", blockType: "page-break" },
    )
    const pageBreakSection = withPageBreak.document.sections[0]
    const pageBreakBody = pageBreakSection.nodes.body

    expect(() => assertDocument(withPageBreak)).not.toThrow()
    expect(pageBreakBody.type).toBe("body")
    if (pageBreakBody.type !== "body") return
    const pageBreak = pageBreakSection.nodes[pageBreakBody.childIds[2]]
    expect(pageBreak.type).toBe("page-break")
    if (pageBreak.type !== "page-break") return
    expect(pageBreak.props).toEqual({})
  })

  it("inserts a divider into an empty flow-stack", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [] },
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs1", containerType: "flow-stack", index: 0 },
      { source: "palette", blockType: "divider" },
    )
    const section = updated.document.sections[0]
    const stack = section.nodes.fs1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(stack.type).toBe("flow-stack")
    if (stack.type !== "flow-stack") return
    expect(stack.childIds).toHaveLength(1)
    expect(section.nodes[stack.childIds[0]]?.type).toBe("divider")
  })

  it("inserts a paragraph into the second flow-stack without moving sibling content", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
      p1,
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs2", containerType: "flow-stack", index: 0 },
      { source: "palette", blockType: "paragraph" },
    )
    const section = updated.document.sections[0]
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(leftStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.childIds).toEqual(["p1"])
    expect(rightStack.childIds).toHaveLength(1)
    expect(section.nodes[rightStack.childIds[0]]?.type).toBe("paragraph")
  })

  it("keeps flow-stack topology stable across insert and delete snapshots", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const inserted = applyPlacementOperation(
      doc,
      "section",
      { kind: "insert-into-container", containerId: "fs2", containerType: "flow-stack", index: 1 },
      { source: "palette", blockType: "paragraph" },
    )
    const insertedSection = inserted.document.sections[0]
    const insertedLeftStack = insertedSection.nodes.fs1
    const insertedRightStack = insertedSection.nodes.fs2

    expect(() => assertDocument(inserted)).not.toThrow()
    expect(insertedLeftStack.type).toBe("flow-stack")
    expect(insertedRightStack.type).toBe("flow-stack")
    if (insertedLeftStack.type !== "flow-stack" || insertedRightStack.type !== "flow-stack") return
    expect(insertedLeftStack.childIds).toEqual(["p1"])
    expect(insertedRightStack.childIds[0]).toBe("p2")
    expect(insertedRightStack.childIds).toHaveLength(2)
    expect(insertedSection.nodes[insertedRightStack.childIds[1]]?.type).toBe("paragraph")

    const deleted = deleteNode(inserted, insertedRightStack.childIds[1])
    const deletedSection = deleted.document.sections[0]
    const deletedLeftStack = deletedSection.nodes.fs1
    const deletedRightStack = deletedSection.nodes.fs2

    expect(() => assertDocument(deleted)).not.toThrow()
    expect(deletedLeftStack.type).toBe("flow-stack")
    expect(deletedRightStack.type).toBe("flow-stack")
    if (deletedLeftStack.type !== "flow-stack" || deletedRightStack.type !== "flow-stack") return
    expect(deletedLeftStack.childIds).toEqual(["p1"])
    expect(deletedRightStack.childIds).toEqual(["p2"])
  })

  it("adds a flow-stack column by splitting the selected stack width", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1", "fs1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")

    const insertedStack = section.nodes[row.childIds[1]]
    expect(leftStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.props.widthShare).toBe(25)
    expect(insertedStack.props.widthShare).toBe(25)
    expect(insertedStack.childIds).toEqual([])
    expect(rightStack.props.widthShare).toBe(50)
    expect(leftStack.childIds).toEqual(["p1"])
    expect(rightStack.childIds).toEqual(["p2"])
  })

  it("applies a flow-stack edge column placement as a local empty stack split", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 60 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "add-flow-stack-column", rowId: "fr1", targetStackId: "fs1", position: "after" },
      { source: "palette", blockType: "columns" },
    )
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const leftStack = section.nodes.fs1
    const rightStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")

    const insertedStack = section.nodes[row.childIds[1]]
    const flowRows = Object.values(section.nodes).filter((node) => node.type === "flow-row")
    expect(flowRows).toHaveLength(1)
    expect(leftStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(rightStack.type).toBe("flow-stack")
    if (leftStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || rightStack.type !== "flow-stack") return
    expect(leftStack.props.widthShare).toBe(30)
    expect(insertedStack.props.widthShare).toBe(30)
    expect(rightStack.props.widthShare).toBe(40)
    expect(leftStack.childIds).toEqual(["p1"])
    expect(insertedStack.childIds).toEqual([])
    expect(rightStack.childIds).toEqual(["p2"])
  })

  it("moves a flow-stack into another flow-row using the same local split rule", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Moved" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Target" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100, box: { fill: "E0F2FE" } }, childIds: ["p1"] },
      fr2: { id: "fr2", type: "flow-row", props: {}, childIds: ["fs2"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1", "fr2"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "move-flow-stack-into-row", rowId: "fr2", targetStackId: "fs2", position: "before" },
      { source: "document", nodeId: "fs1" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body
    const row = section.nodes.fr2
    const movedStack = section.nodes.fs1
    const targetStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    expect(row.type).toBe("flow-row")
    expect(movedStack.type).toBe("flow-stack")
    expect(targetStack.type).toBe("flow-stack")
    if (body.type !== "body" || row.type !== "flow-row" || movedStack.type !== "flow-stack" || targetStack.type !== "flow-stack") return
    expect(body.childIds).toEqual(["fr2"])
    expect(section.nodes.fr1).toBeUndefined()
    expect(row.childIds).toEqual(["fs1", "fs2"])
    expect(movedStack.props.widthShare).toBe(50)
    expect(movedStack.props.box?.fill).toBe("E0F2FE")
    expect(movedStack.childIds).toEqual(["p1"])
    expect(targetStack.props.widthShare).toBe(50)
    expect(targetStack.childIds).toEqual(["p2"])
  })

  it("moves a flow-stack to body space as a new full-width flow-row", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Moved" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Remaining" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 60, box: { fill: "DCFCE7" } }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "move-flow-stack-to-new-row", parentId: "body", parentType: "body", index: 1 },
      { source: "document", nodeId: "fs1" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body
    const sourceRow = section.nodes.fr1
    const remainingStack = section.nodes.fs2
    const movedStack = section.nodes.fs1

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    expect(sourceRow.type).toBe("flow-row")
    expect(remainingStack.type).toBe("flow-stack")
    expect(movedStack.type).toBe("flow-stack")
    if (body.type !== "body" || sourceRow.type !== "flow-row" || remainingStack.type !== "flow-stack" || movedStack.type !== "flow-stack") return

    expect(body.childIds).toHaveLength(2)
    expect(body.childIds[0]).toBe("fr1")
    const movedRow = section.nodes[body.childIds[1]]
    expect(movedRow.type).toBe("flow-row")
    if (movedRow.type !== "flow-row") return
    expect(sourceRow.childIds).toEqual(["fs2"])
    expect(remainingStack.props.widthShare).toBe(100)
    expect(movedRow.childIds).toEqual(["fs1"])
    expect(movedStack.props.widthShare).toBe(100)
    expect(movedStack.props.box?.fill).toBe("DCFCE7")
    expect(movedStack.childIds).toEqual(["p1"])
  })

  it("keeps body insertion position stable when moving a single-stack row to body space", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Moved" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "After" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
      p2,
    }, ["fr1", "p2"])

    const updated = applyPlacementOperation(
      doc,
      "section",
      { kind: "move-flow-stack-to-new-row", parentId: "body", parentType: "body", index: 2 },
      { source: "document", nodeId: "fs1" },
    )
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(section.nodes.fr1).toBeUndefined()
    expect(body.childIds[0]).toBe("p2")
    const movedRow = section.nodes[body.childIds[1]]
    expect(movedRow.type).toBe("flow-row")
    if (movedRow.type !== "flow-row") return
    expect(movedRow.childIds).toEqual(["fs1"])
  })

  it("adds a balanced flow-stack column when the flow-row is selected", () => {
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2", "fs3"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 20 }, childIds: [] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 60 }, childIds: [] },
      fs3: { id: "fs3", type: "flow-stack", props: { widthShare: 20 }, childIds: [] },
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const firstStack = section.nodes.fs1
    const secondStack = section.nodes.fs2
    const thirdStack = section.nodes.fs3

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(4)
    expect(row.childIds.slice(0, 3)).toEqual(["fs1", "fs2", "fs3"])

    const insertedStack = section.nodes[row.childIds[3]]
    expect(firstStack.type).toBe("flow-stack")
    expect(secondStack.type).toBe("flow-stack")
    expect(thirdStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    if (firstStack.type !== "flow-stack" || secondStack.type !== "flow-stack" || thirdStack.type !== "flow-stack" || insertedStack.type !== "flow-stack") return
    expect(firstStack.props.widthShare).toBe(25)
    expect(secondStack.props.widthShare).toBe(25)
    expect(thirdStack.props.widthShare).toBe(25)
    expect(insertedStack.props.widthShare).toBe(25)
  })

  it("adds a flow-stack column before a selected stack", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = addFlowStackColumn(doc, "fr1", "fs2", "before")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const firstStack = section.nodes.fs1
    const targetStack = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toHaveLength(3)
    expect(row.childIds[0]).toBe("fs1")
    expect(row.childIds[2]).toBe("fs2")

    const insertedStack = section.nodes[row.childIds[1]]
    expect(firstStack.type).toBe("flow-stack")
    expect(insertedStack.type).toBe("flow-stack")
    expect(targetStack.type).toBe("flow-stack")
    if (firstStack.type !== "flow-stack" || insertedStack.type !== "flow-stack" || targetStack.type !== "flow-stack") return
    expect(firstStack.props.widthShare).toBe(50)
    expect(insertedStack.props.widthShare).toBe(25)
    expect(targetStack.props.widthShare).toBe(25)
    expect(insertedStack.childIds).toEqual([])
    expect(firstStack.childIds).toEqual(["p1"])
    expect(targetStack.childIds).toEqual(["p2"])
  })

  it("transfers a deleted flow-stack width share to the nearest sibling", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Left" }])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: "Right" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 60 }, childIds: ["p1"] },
      fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: ["p2"] },
      p1,
      p2,
    }, ["fr1"])

    const updated = deleteNode(doc, "fs1")
    const section = updated.document.sections[0]
    const row = section.nodes.fr1
    const remaining = section.nodes.fs2

    expect(() => assertDocument(updated)).not.toThrow()
    expect(row.type).toBe("flow-row")
    if (row.type !== "flow-row") return
    expect(row.childIds).toEqual(["fs2"])
    expect(remaining.type).toBe("flow-stack")
    if (remaining.type !== "flow-stack") return
    expect(remaining.props.widthShare).toBe(100)
    expect(section.nodes.fs1).toBeUndefined()
    expect(section.nodes.p1).toBeUndefined()
  })

  it("removes an empty flow-row after deleting its last flow-stack", () => {
    const p1 = makeParagraph("p1", [{ id: "t1", type: "text", text: "Only" }])
    const doc = makeDoc({
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1,
    }, ["fr1"])

    const updated = deleteNode(doc, "fs1")
    const section = updated.document.sections[0]
    const body = section.nodes.body

    expect(() => assertDocument(updated)).not.toThrow()
    expect(body.type).toBe("body")
    if (body.type !== "body") return
    expect(body.childIds).toEqual([])
    expect(section.nodes.fr1).toBeUndefined()
    expect(section.nodes.fs1).toBeUndefined()
    expect(section.nodes.p1).toBeUndefined()
  })
})

describe("flow-table structural operations", () => {
  it("adds a row above the first row and preserves the flow-table cell shape", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const updated = addFlowTableRow(doc, "flow-table", -1)
    const table = getFlowTable(updated)
    const inserted = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(3)
    expect(inserted.type).toBe("flow-table-row")
    if (inserted.type !== "flow-table-row") return
    expect(inserted.cellIds).toHaveLength(2)

    inserted.cellIds.forEach((cellId) => {
      const cell = table.nodes[cellId]
      expect(cell.type).toBe("flow-table-cell")
      if (cell.type !== "flow-table-cell") return
      expect(cell.props.box?.border?.top).toEqual({ style: "solid", width: pt(1), color: "000000" })
      expect(cell.props.box?.border?.right).toEqual({ style: "solid", width: pt(1), color: "000000" })
      expect(cell.props.box?.border?.bottom).toEqual({ style: "solid", width: pt(1), color: "000000" })
      expect(cell.props.box?.border?.left).toEqual({ style: "solid", width: pt(1), color: "000000" })
      expect(cell.childIds).toHaveLength(1)
      const paragraph = table.nodes[cell.childIds[0]]
      expect(paragraph.type).toBe("paragraph")
      if (paragraph.type !== "paragraph") return
      expect(paragraphText(paragraph)).toBe("")
    })
  })

  it("removes a row subtree and clamps flow-table header rows to the remaining row count", () => {
    const doc = makeGridFlowTableDoc({ headerRowCount: 3 })
    const before = getFlowTable(doc)
    const removedRow = before.nodes[before.rowIds[2]]
    expect(removedRow.type).toBe("flow-table-row")
    if (removedRow.type !== "flow-table-row") return
    const removedIds = new Set<string>([removedRow.id])
    removedRow.cellIds.forEach((cellId) => {
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "flow-table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeFlowTableRow(doc, "flow-table", 2)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(2)
    expect(table.props.headerRowCount).toBe(2)
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not delete the last flow-table row", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
      headerRowCount: 1,
    })
    const updated = removeFlowTableRow(doc, "flow-table", 0)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(updated).toBe(doc)
    expect(table.rowIds).toHaveLength(1)
    expect(table.props.headerRowCount).toBe(1)
  })

  it("adds a flow-table column to the left of the first column by splitting the nearest width", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [120, 80],
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
    })
    const before = getFlowTable(doc)
    const updated = addFlowTableColumn(doc, "flow-table", -1)
    const table = getFlowTable(updated)
    const firstRow = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([60, 60, 80])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(firstRow.type).toBe("flow-table-row")
    if (firstRow.type !== "flow-table-row") return
    expect(firstRow.cellIds).toHaveLength(3)

    const insertedCell = table.nodes[firstRow.cellIds[0]]
    expect(insertedCell.type).toBe("flow-table-cell")
    if (insertedCell.type !== "flow-table-cell") return
    expect(insertedCell.props.box?.border?.top).toEqual({ style: "solid", width: pt(1), color: "000000" })
    expect(insertedCell.props.box?.border?.right).toEqual({ style: "solid", width: pt(1), color: "000000" })
    expect(insertedCell.props.box?.border?.bottom).toEqual({ style: "solid", width: pt(1), color: "000000" })
    expect(insertedCell.props.box?.border?.left).toEqual({ style: "solid", width: pt(1), color: "000000" })
    const insertedParagraph = table.nodes[insertedCell.childIds[0]]
    expect(insertedParagraph.type).toBe("paragraph")
    if (insertedParagraph.type !== "paragraph") return
    expect(paragraphText(insertedParagraph)).toBe("")
  })

  it("adds a row through flow-table rowspans by expanding covered cells", () => {
    const doc = makeSpannedFlowTableDoc()
    const updated = addFlowTableRow(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const insertedRow = table.nodes[table.rowIds[1]]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toHaveLength(3)
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.rowspan).toBe(3)
    expect(insertedRow.type).toBe("flow-table-row")
    if (insertedRow.type !== "flow-table-row") return
    expect(insertedRow.cellIds).toHaveLength(1)
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-span", insertedRow.cellIds[0]],
      ["flow-cell-span", "flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("adds a column through flow-table colspans by expanding covered cells", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)
    const updated = addFlowTableColumn(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const topRow = table.nodes["flow-row-top"]
    const bottomRow = table.nodes["flow-row-bottom"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([60, 60, 80, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.colspan).toBe(3)
    expect(topRow.type).toBe("flow-table-row")
    expect(bottomRow.type).toBe("flow-table-row")
    if (topRow.type !== "flow-table-row" || bottomRow.type !== "flow-table-row") return
    expect(topRow.cellIds).toEqual(["flow-cell-span", "flow-cell-top-right"])
    expect(bottomRow.cellIds).toEqual(["flow-cell-bottom-right"])
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-span", "flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-span", "flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("removes a flow-table column subtree and transfers its width to the left neighbor", () => {
    const doc = makeGridFlowTableDoc({ columnWidths: [120, 80, 60] })
    const before = getFlowTable(doc)
    const removedIds = new Set<string>()
    before.rowIds.forEach((rowId) => {
      const row = before.nodes[rowId]
      if (row.type !== "flow-table-row") return
      const cellId = row.cellIds[1]
      removedIds.add(cellId)
      const cell = before.nodes[cellId]
      if (cell.type === "flow-table-cell") cell.childIds.forEach((childId) => { removedIds.add(childId) })
    })

    const updated = removeFlowTableColumn(doc, "flow-table", 1)
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([200, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row.type).toBe("flow-table-row")
      if (row.type !== "flow-table-row") return
      expect(row.cellIds).toHaveLength(2)
    })
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("resizes a flow-table column pair while preserving total table width and grid shape", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)
    const updated = resizeFlowTableColumnPair(doc, "flow-table", 0, 140, 60)
    const table = getFlowTable(updated)
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([140, 60, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("fits a flow-table to the section content width while preserving column proportions", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [100, 200],
      rows: [["A", "B"]],
    })
    const updated = fitFlowTableToSectionWidth(doc, "flow-table")
    const table = getFlowTable(updated)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([150.33, 300.67])
    expect(flowTableWidth(table)).toBe(451)
  })

  it("removes a row inside a flow-table rowspan by shrinking the covering cell", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)
    const removedRow = before.nodes["flow-row-bottom"]
    expect(removedRow.type).toBe("flow-table-row")
    if (removedRow.type !== "flow-table-row") return
    const removedIds = new Set<string>([removedRow.id, "flow-cell-bottom-right", "fsp-3"])

    expect(canRemoveFlowTableRow(before, 1)).toBe(true)
    const updated = removeFlowTableRow(doc, "flow-table", 1)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.rowIds).toEqual(["flow-row-top"])
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.rowspan).toBe(1)
    expect(grid.slots).toEqual([["flow-cell-span", "flow-cell-span", "flow-cell-top-right"]])
    removedIds.forEach((id) => {
      expect(table.nodes[id]).toBeUndefined()
    })
  })

  it("does not remove a row when that would move a flow-table rowspan origin", () => {
    const doc = makeSpannedFlowTableDoc()
    const table = getFlowTable(doc)

    expect(canRemoveFlowTableRow(table, 0)).toBe(false)
    expect(removeFlowTableRow(doc, "flow-table", 0)).toBe(doc)
  })

  it("removes a column inside a flow-table colspan by shrinking the covering cell", () => {
    const doc = makeSpannedFlowTableDoc()
    const before = getFlowTable(doc)

    expect(canRemoveFlowTableColumn(before, 1)).toBe(true)
    const updated = removeFlowTableColumn(doc, "flow-table", 1)
    const table = getFlowTable(updated)
    const spanningCell = table.nodes["flow-cell-span"]
    const grid = resolveFlowTableGrid(table)

    expect(() => assertDocument(updated)).not.toThrow()
    expect(table.columns.map((column) => column.width.value)).toEqual([200, 60])
    expect(flowTableWidth(table)).toBe(flowTableWidth(before))
    expect(spanningCell.type).toBe("flow-table-cell")
    if (spanningCell.type !== "flow-table-cell") return
    expect(spanningCell.props.colspan).toBe(1)
    expect(grid.slots).toEqual([
      ["flow-cell-span", "flow-cell-top-right"],
      ["flow-cell-span", "flow-cell-bottom-right"],
    ])
  })

  it("does not remove a column when that would move a flow-table colspan origin", () => {
    const doc = makeSpannedFlowTableDoc()
    const table = getFlowTable(doc)

    expect(canRemoveFlowTableColumn(table, 0)).toBe(false)
    expect(removeFlowTableColumn(doc, "flow-table", 0)).toBe(doc)
  })

  it("expands a flow-table cell span through empty cells without appending placeholders", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["", ""],
        ["", ""],
      ],
      columnWidths: [100, 100],
    })
    const before = getFlowTable(doc)

    expect(canUpdateFlowTableCellSpan(before, "flow-cell-0-0", { colspan: 2, rowspan: 2 })).toBe(true)
    const updated = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    assertDocument(updated)
    const table = getFlowTable(updated)
    const grid = resolveFlowTableGrid(table)
    const placement = grid.placementsByCellId.get("flow-cell-0-0")

    expect(placement).toMatchObject({ columnIndex: 0, rowIndex: 0, colspan: 2, rowspan: 2 })
    expect(grid.placements).toHaveLength(1)
    expect(table.nodes["flow-cell-0-1"]).toBeUndefined()
    expect(table.nodes["flow-cell-1-0"]).toBeUndefined()
    expect(table.nodes["flow-cell-1-1"]).toBeUndefined()
    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual([""])
  })

  it("expands a flow-table cell span through non-empty cells by appending content row-major", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const table = getFlowTable(doc)

    expect(canUpdateFlowTableCellSpan(table, "flow-cell-0-0", { colspan: 2, rowspan: 2 })).toBe(true)
    const updated = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    assertDocument(updated)
    const updatedTable = getFlowTable(updated)
    const grid = resolveFlowTableGrid(updatedTable)
    const originCell = updatedTable.nodes["flow-cell-0-0"]

    expect(grid.placementsByCellId.get("flow-cell-0-0")).toMatchObject({ colspan: 2, rowspan: 2 })
    expect(originCell.type).toBe("flow-table-cell")
    if (originCell.type !== "flow-table-cell") return
    expect(originCell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 0, colOffset: 1, childIds: ["fp-0-1"] },
        { rowOffset: 1, colOffset: 0, childIds: ["fp-1-0"] },
        { rowOffset: 1, colOffset: 1, childIds: ["fp-1-1"] },
      ],
    })
    expect(flowTableCellParagraphTexts(updatedTable, "flow-cell-0-0")).toEqual(["A", "B", "C", "D"])
    expect(updatedTable.nodes["flow-cell-0-1"]).toBeUndefined()
    expect(updatedTable.nodes["flow-cell-1-0"]).toBeUndefined()
    expect(updatedTable.nodes["flow-cell-1-1"]).toBeUndefined()
  })

  it("merges a flow-table cell right into an empty neighbor by increasing colspan", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["", ""],
        ["", ""],
      ],
      columnWidths: [100, 100],
    })
    const updated = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2 })
    assertDocument(updated)
    const table = getFlowTable(updated)
    const grid = resolveFlowTableGrid(table)
    const topRow = table.nodes["flow-row-0"]

    expect(grid.placementsByCellId.get("flow-cell-0-0")).toMatchObject({ colspan: 2, rowspan: 1 })
    expect(table.nodes["flow-cell-0-1"]).toBeUndefined()
    expect(table.nodes["flow-cell-0-0"]?.type).toBe("flow-table-cell")
    if (table.nodes["flow-cell-0-0"]?.type === "flow-table-cell") {
      expect(table.nodes["flow-cell-0-0"].props.mergeMap).toBeUndefined()
    }
    expect(topRow?.type).toBe("flow-table-row")
    if (topRow?.type !== "flow-table-row") return
    expect(topRow.cellIds).toEqual(["flow-cell-0-0"])
  })

  it("merges a flow-table cell down into an empty neighbor by increasing rowspan", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["", ""],
        ["", ""],
      ],
      columnWidths: [100, 100],
    })
    const updated = updateFlowTableCellSpan(doc, "flow-cell-0-0", { rowspan: 2 })
    assertDocument(updated)
    const table = getFlowTable(updated)
    const grid = resolveFlowTableGrid(table)
    const bottomRow = table.nodes["flow-row-1"]

    expect(grid.placementsByCellId.get("flow-cell-0-0")).toMatchObject({ colspan: 1, rowspan: 2 })
    expect(table.nodes["flow-cell-1-0"]).toBeUndefined()
    expect(bottomRow?.type).toBe("flow-table-row")
    if (bottomRow?.type !== "flow-table-row") return
    expect(bottomRow.cellIds).toEqual(["flow-cell-1-1"])
  })

  it("resolves merge left into the neighboring origin and appends selected content", () => {
    const doc = makeGridFlowTableDoc({
      rows: [["A", "B"]],
      columnWidths: [100, 100],
    })
    const table = getFlowTable(doc)

    const target = resolveFlowTableCellMergeTarget(table, "flow-cell-0-1", "left")
    expect(target).toEqual({ cellId: "flow-cell-0-0", changes: { colspan: 2 } })

    const updated = updateFlowTableCellSpan(doc, target?.cellId ?? "", target?.changes ?? {})
    assertDocument(updated)
    const updatedTable = getFlowTable(updated)
    const grid = resolveFlowTableGrid(updatedTable)
    const topRow = updatedTable.nodes["flow-row-0"]

    expect(grid.placementsByCellId.get("flow-cell-0-0")).toMatchObject({ colspan: 2, rowspan: 1 })
    expect(flowTableCellParagraphTexts(updatedTable, "flow-cell-0-0")).toEqual(["A", "B"])
    expect(updatedTable.nodes["flow-cell-0-1"]).toBeUndefined()
    expect(updatedTable.nodes["flow-cell-0-0"]?.type).toBe("flow-table-cell")
    if (updatedTable.nodes["flow-cell-0-0"]?.type === "flow-table-cell") {
      expect(updatedTable.nodes["flow-cell-0-0"].props.mergeMap).toEqual({
        version: 1,
        entries: [
          { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
          { rowOffset: 0, colOffset: 1, childIds: ["fp-0-1"] },
        ],
      })
    }
    expect(topRow?.type).toBe("flow-table-row")
    if (topRow?.type !== "flow-table-row") return
    expect(topRow.cellIds).toEqual(["flow-cell-0-0"])
  })

  it("resolves merge up into the neighboring origin and appends selected content", () => {
    const doc = makeGridFlowTableDoc({
      rows: [["A"], ["B"]],
      columnWidths: [100],
    })
    const table = getFlowTable(doc)

    const target = resolveFlowTableCellMergeTarget(table, "flow-cell-1-0", "up")
    expect(target).toEqual({ cellId: "flow-cell-0-0", changes: { rowspan: 2 } })

    const updated = updateFlowTableCellSpan(doc, target?.cellId ?? "", target?.changes ?? {})
    assertDocument(updated)
    const updatedTable = getFlowTable(updated)
    const grid = resolveFlowTableGrid(updatedTable)
    const bottomRow = updatedTable.nodes["flow-row-1"]

    expect(grid.placementsByCellId.get("flow-cell-0-0")).toMatchObject({ colspan: 1, rowspan: 2 })
    expect(flowTableCellParagraphTexts(updatedTable, "flow-cell-0-0")).toEqual(["A", "B"])
    expect(updatedTable.nodes["flow-cell-1-0"]).toBeUndefined()
    expect(updatedTable.nodes["flow-cell-0-0"]?.type).toBe("flow-table-cell")
    if (updatedTable.nodes["flow-cell-0-0"]?.type === "flow-table-cell") {
      expect(updatedTable.nodes["flow-cell-0-0"].props.mergeMap).toEqual({
        version: 1,
        entries: [
          { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
          { rowOffset: 1, colOffset: 0, childIds: ["fp-1-0"] },
        ],
      })
    }
    expect(bottomRow?.type).toBe("flow-table-row")
    if (bottomRow?.type !== "flow-table-row") return
    expect(bottomRow.cellIds).toEqual([])
  })

  it("does not resolve merge left when the neighboring origin does not align with the selected span", () => {
    const doc = makeSpannedFlowTableDoc()
    const table = getFlowTable(doc)

    expect(resolveFlowTableCellMergeTarget(table, "flow-cell-bottom-right", "left")).toBeNull()
  })

  it("preserves mergeMap offsets through chained flow-table cell merges", () => {
    const doc = makeGridFlowTableDoc({
      rows: [["A", "B", "C"]],
      columnWidths: [100, 100, 100],
    })
    const firstMerge = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2 })
    const secondMerge = updateFlowTableCellSpan(firstMerge, "flow-cell-0-0", { colspan: 3 })
    assertDocument(secondMerge)
    const table = getFlowTable(secondMerge)
    const cell = table.nodes["flow-cell-0-0"]

    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A", "B", "C"])
    expect(cell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 0, colOffset: 1, childIds: ["fp-0-1"] },
        { rowOffset: 0, colOffset: 2, childIds: ["fp-0-2"] },
      ],
    })
  })

  it("shrinks a flow-table cell span by creating empty replacement cells", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["", ""],
        ["", ""],
      ],
      columnWidths: [100, 100],
    })
    const spanned = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const shrunk = updateFlowTableCellSpan(spanned, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    assertDocument(shrunk)
    const table = getFlowTable(shrunk)
    const grid = resolveFlowTableGrid(table)
    const selected = table.nodes["flow-cell-0-0"]

    expect(selected?.type).toBe("flow-table-cell")
    if (selected?.type !== "flow-table-cell") return
    expect(selected.props.colspan).toBeUndefined()
    expect(selected.props.rowspan).toBeUndefined()
    expect(selected.props.mergeMap).toBeUndefined()
    expect(grid.placements).toHaveLength(4)
    expect(grid.slotMatrix[0][0].cellId).toBe("flow-cell-0-0")
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      expect(row?.type).toBe("flow-table-row")
      if (row?.type === "flow-table-row") expect(row.cellIds).toHaveLength(2)
    })
  })

  it("unmerges a content-merged flow-table cell by restoring source-cell mapping", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const unmerged = updateFlowTableCellSpan(merged, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    assertDocument(unmerged)
    const table = getFlowTable(unmerged)
    const grid = resolveFlowTableGrid(table)

    expect(grid.placements).toHaveLength(4)
    const origin = table.nodes["flow-cell-0-0"]
    expect(origin.type).toBe("flow-table-cell")
    if (origin.type !== "flow-table-cell") return
    expect(origin.props.mergeMap).toBeUndefined()
    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[0][1].cellId)).toEqual(["B"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual(["C"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][1].cellId)).toEqual(["D"])
  })

  it("shrinks a content-merged flow-table cell by keeping in-span content and restoring released slots", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const shrunk = updateFlowTableCellSpan(merged, "flow-cell-0-0", { colspan: 2, rowspan: 1 })
    assertDocument(shrunk)
    const table = getFlowTable(shrunk)
    const grid = resolveFlowTableGrid(table)
    const origin = table.nodes["flow-cell-0-0"]

    expect(grid.placements).toHaveLength(3)
    expect(origin.type).toBe("flow-table-cell")
    if (origin.type !== "flow-table-cell") return
    expect(origin.props.colspan).toBe(2)
    expect(origin.props.rowspan).toBeUndefined()
    expect(origin.props.mergeMap).toBeUndefined()
    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A", "B"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual(["C"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][1].cellId)).toEqual(["D"])
  })

  it("shifts flow-table mergeMap row offsets when adding a row through a content-merged cell", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const inserted = addFlowTableRow(merged, "flow-table", 0)
    assertDocument(inserted)
    const insertedTable = getFlowTable(inserted)
    const cell = insertedTable.nodes["flow-cell-0-0"]

    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.rowspan).toBe(3)
    expect(cell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 0, colOffset: 1, childIds: ["fp-0-1"] },
        { rowOffset: 2, colOffset: 0, childIds: ["fp-1-0"] },
        { rowOffset: 2, colOffset: 1, childIds: ["fp-1-1"] },
      ],
    })

    const unmerged = updateFlowTableCellSpan(inserted, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    assertDocument(unmerged)
    const table = getFlowTable(unmerged)
    const grid = resolveFlowTableGrid(table)

    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[0][1].cellId)).toEqual(["B"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual([""])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][1].cellId)).toEqual([""])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[2][0].cellId)).toEqual(["C"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[2][1].cellId)).toEqual(["D"])
  })

  it("shifts flow-table mergeMap column offsets when adding a column through a content-merged cell", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const inserted = addFlowTableColumn(merged, "flow-table", 0)
    assertDocument(inserted)
    const insertedTable = getFlowTable(inserted)
    const cell = insertedTable.nodes["flow-cell-0-0"]

    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.colspan).toBe(3)
    expect(cell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 0, colOffset: 2, childIds: ["fp-0-1"] },
        { rowOffset: 1, colOffset: 0, childIds: ["fp-1-0"] },
        { rowOffset: 1, colOffset: 2, childIds: ["fp-1-1"] },
      ],
    })

    const unmerged = updateFlowTableCellSpan(inserted, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    assertDocument(unmerged)
    const table = getFlowTable(unmerged)
    const grid = resolveFlowTableGrid(table)

    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[0][1].cellId)).toEqual([""])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[0][2].cellId)).toEqual(["B"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual(["C"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][1].cellId)).toEqual([""])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][2].cellId)).toEqual(["D"])
  })

  it("shifts flow-table mergeMap offsets back when removing an inserted empty row through a merged cell", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const inserted = addFlowTableRow(merged, "flow-table", 0)
    const removed = removeFlowTableRow(inserted, "flow-table", 1)
    assertDocument(removed)
    const removedTable = getFlowTable(removed)
    const cell = removedTable.nodes["flow-cell-0-0"]

    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 0, colOffset: 1, childIds: ["fp-0-1"] },
        { rowOffset: 1, colOffset: 0, childIds: ["fp-1-0"] },
        { rowOffset: 1, colOffset: 1, childIds: ["fp-1-1"] },
      ],
    })

    const unmerged = updateFlowTableCellSpan(removed, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    const table = getFlowTable(unmerged)
    const grid = resolveFlowTableGrid(table)

    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[0][1].cellId)).toEqual(["B"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual(["C"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][1].cellId)).toEqual(["D"])
  })

  it("keeps deleted-slot flow-table mergeMap content on the origin when removing a mapped column", () => {
    const doc = makeGridFlowTableDoc({
      rows: [
        ["A", "B"],
        ["C", "D"],
      ],
      columnWidths: [100, 100],
    })
    const merged = updateFlowTableCellSpan(doc, "flow-cell-0-0", { colspan: 2, rowspan: 2 })
    const removed = removeFlowTableColumn(merged, "flow-table", 1)
    assertDocument(removed)
    const removedTable = getFlowTable(removed)
    const cell = removedTable.nodes["flow-cell-0-0"]

    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.colspan).toBe(1)
    expect(cell.props.mergeMap).toEqual({
      version: 1,
      entries: [
        { rowOffset: 0, colOffset: 0, childIds: ["fp-0-0"] },
        { rowOffset: 1, colOffset: 0, childIds: ["fp-1-0"] },
      ],
    })

    const unmerged = updateFlowTableCellSpan(removed, "flow-cell-0-0", { colspan: 1, rowspan: 1 })
    const table = getFlowTable(unmerged)
    const grid = resolveFlowTableGrid(table)

    expect(flowTableCellParagraphTexts(table, "flow-cell-0-0")).toEqual(["A", "B", "D"])
    expect(flowTableCellParagraphTexts(table, grid.slotMatrix[1][0].cellId)).toEqual(["C"])
  })

  it("does not delete the last flow-table column", () => {
    const doc = makeGridFlowTableDoc({
      columnWidths: [100],
      rows: [["Only cell"]],
    })
    const updated = removeFlowTableColumn(doc, "flow-table", 0)
    const table = getFlowTable(updated)
    const row = table.nodes[table.rowIds[0]]

    expect(() => assertDocument(updated)).not.toThrow()
    expect(updated).toBe(doc)
    expect(table.columns).toHaveLength(1)
    expect(row.type).toBe("flow-table-row")
    if (row.type !== "flow-table-row") return
    expect(row.cellIds).toHaveLength(1)
  })

})
