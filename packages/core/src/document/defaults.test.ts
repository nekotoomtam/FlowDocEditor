import { afterEach, describe, expect, it, vi } from "vitest"
import { createDefaultDocument, createDefaultFlowTable, createDividerNode, createId, createPageBreakNode } from "./defaults"
import { TOR_BODY_PARAGRAPH_STYLE_ID } from "./paragraphStylePresets"

describe("createId", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses crypto randomUUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    })

    expect(createId("node")).toBe("node_00000000000040008000000000000001")
  })

  it("creates unique ids for a burst of nodes", () => {
    const ids = Array.from({ length: 100 }, () => createId("node"))

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("createDefaultFlowTable", () => {
  it("marks the first row as the default header for multi-row tables", () => {
    const table = createDefaultFlowTable(3, 2)
    const firstRow = table.nodes[table.rowIds[0]]
    const bodyRow = table.nodes[table.rowIds[1]]

    expect(table.props.headerRowCount).toBe(1)
    expect(table.props.repeatHeaderRows).toBe(true)
    expect(table.rowIds).toHaveLength(3)
    expect(firstRow.type).toBe("flow-table-row")
    expect(bodyRow.type).toBe("flow-table-row")
    if (firstRow.type !== "flow-table-row" || bodyRow.type !== "flow-table-row") return

    firstRow.cellIds.forEach((cellId, index) => {
      const cell = table.nodes[cellId]
      expect(cell.type).toBe("flow-table-cell")
      if (cell.type !== "flow-table-cell") return

      expect(cell.props.box?.fill).toBe("F3F4F6")
      expect(cell.props.box?.border?.top).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })
      expect(cell.props.box?.border?.right).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })
      expect(cell.props.box?.border?.bottom).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })
      expect(cell.props.box?.border?.left).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })

      const paragraph = table.nodes[cell.childIds[0]]
      expect(paragraph.type).toBe("paragraph")
      if (paragraph.type !== "paragraph") return
      expect(paragraph.props.fontWeight).toBe("bold")
      expect(paragraph.children[0]?.type === "text" ? paragraph.children[0].text : "").toBe(`Header ${index + 1}`)
    })

    const bodyCell = table.nodes[bodyRow.cellIds[0]]
    expect(bodyCell.type).toBe("flow-table-cell")
    if (bodyCell.type !== "flow-table-cell") return
    expect(bodyCell.props.box?.fill).toBeUndefined()
    expect(bodyCell.props.box?.border?.top).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })
    const bodyParagraph = table.nodes[bodyCell.childIds[0]]
    expect(bodyParagraph.type).toBe("paragraph")
    if (bodyParagraph.type !== "paragraph") return
    expect(bodyParagraph.props.fontWeight).toBe("normal")
    expect(bodyParagraph.children[0]?.type === "text" ? bodyParagraph.children[0].text : "").toBe("")
  })

  it("does not create a header-only default for single-row tables", () => {
    const table = createDefaultFlowTable(1, 2)
    const row = table.nodes[table.rowIds[0]]

    expect(table.props.headerRowCount).toBeUndefined()
    expect(table.rowIds).toHaveLength(1)
    expect(row.type).toBe("flow-table-row")
    if (row.type !== "flow-table-row") return
    const cell = table.nodes[row.cellIds[0]]
    expect(cell.type).toBe("flow-table-cell")
    if (cell.type !== "flow-table-cell") return
    expect(cell.props.box?.fill).toBeUndefined()
    expect(cell.props.box?.border?.top).toEqual({ style: "solid", width: { value: 1, unit: "pt" }, color: "000000" })
    const paragraph = table.nodes[cell.childIds[0]]
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    expect(paragraph.children[0]?.type === "text" ? paragraph.children[0].text : "").toBe("")
  })
})

describe("createDefaultDocument", () => {
  it("starts with a document-owned base paragraph style", () => {
    const doc = createDefaultDocument("Styled document")
    const section = doc.document.sections[0]
    const body = section.nodes[section.bodyRootId]
    const firstParagraph = body.type === "body" ? section.nodes[body.childIds[0]] : undefined

    expect(doc.document.styles?.baseParagraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(doc.document.styles?.paragraphStyles?.[TOR_BODY_PARAGRAPH_STYLE_ID]).toBeDefined()
    expect(firstParagraph?.type).toBe("paragraph")
    if (firstParagraph?.type !== "paragraph") return
    expect(firstParagraph.props.paragraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
  })
})

describe("default divider and page-break nodes", () => {
  it("creates authored divider defaults and empty page-break props", () => {
    const divider = createDividerNode()
    const pageBreak = createPageBreakNode({ unexpected: true } as never)

    expect(divider.type).toBe("divider")
    expect(divider.props).toEqual({
      color: "CBD5E1",
      thickness: { value: 1, unit: "pt" },
      marginBefore: { value: 6, unit: "pt" },
      marginAfter: { value: 6, unit: "pt" },
      style: "solid",
    })
    expect(pageBreak.type).toBe("page-break")
    expect(pageBreak.props).toEqual({})
  })
})
