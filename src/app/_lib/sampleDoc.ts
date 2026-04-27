import {
  createParagraphNode,
  createSpacerNode,
  createStackNode,
  createColumnsSubtree,
  createBodyNode,
  createId,
} from "@/document"
import type { DocumentNode, DocumentSection } from "@/schema"

function buildSampleTable() {
  const BORDER_SIDE = { style: "solid" as const, width: { value: 1, unit: "pt" as const }, color: "000000" }
  const ALL_BORDERS = { top: BORDER_SIDE, right: BORDER_SIDE, bottom: BORDER_SIDE, left: BORDER_SIDE }
  const PADDING = { value: 6, unit: "pt" as const }

  const p = (text: string) => createParagraphNode(text)

  const [h1, h2, h3] = ["รายการ", "จำนวน", "ราคา"].map(p)
  const [r1a, r1b, r1c] = ["สินค้า A", "2 ชิ้น", "500 บาท"].map(p)
  const [r2a, r2b, r2c] = ["สินค้า B", "1 ชิ้น", "1,200 บาท"].map(p)
  const [totalLabel, totalValue] = ["รวมทั้งสิ้น", "1,700 บาท"].map(p)

  const cell = (childIds: string[], colspan?: number) => ({
    id: createId("cell"), type: "table-cell" as const,
    props: { border: ALL_BORDERS, padding: PADDING, ...(colspan ? { colspan } : {}) },
    childIds,
  })

  const headerCells = [cell([h1.id]), cell([h2.id]), cell([h3.id])]
  const row1Cells   = [cell([r1a.id]), cell([r1b.id]), cell([r1c.id])]
  const row2Cells   = [cell([r2a.id]), cell([r2b.id]), cell([r2c.id])]
  const totalCells  = [cell([totalLabel.id], 2), cell([totalValue.id])]

  const row = (cells: ReturnType<typeof cell>[]) => ({
    id: createId("row"), type: "table-row" as const,
    props: {}, cellIds: cells.map((c) => c.id),
  })

  const rows = [
    row(headerCells),
    row(row1Cells),
    row(row2Cells),
    { id: createId("row"), type: "table-row" as const, props: {}, cellIds: totalCells.map((c) => c.id) },
  ]

  const allParas = [h1, h2, h3, r1a, r1b, r1c, r2a, r2b, r2c, totalLabel, totalValue]
  const allCells = [...headerCells, ...row1Cells, ...row2Cells, ...totalCells]
  const tableNodes: Record<string, unknown> = {}
  ;[...allParas, ...allCells, ...rows].forEach((n) => { tableNodes[n.id] = n })

  return {
    id: createId("table"), type: "table" as const,
    props: {},
    columns: [
      { width: { value: 270, unit: "pt" as const } },
      { width: { value: 90, unit: "pt" as const } },
      { width: { value: 91, unit: "pt" as const } },
    ],
    rowIds: rows.map((r) => r.id),
    nodes: tableNodes,
  }
}

function buildSampleHeaderFooter() {
  const { row: hRow, stacks: hStacks, nodes: hColNodes } = createColumnsSubtree(2)
  const pHLeft  = createParagraphNode("FlowDoc — Pipeline Test")
  const pHRight = createParagraphNode("ทดสอบระบบ Layout Engine", { align: "right" })
  hStacks[0].childIds.push(pHLeft.id)
  hStacks[1].childIds.push(pHRight.id)
  const headerStack = createStackNode([hRow.id])

  const pFooter = createParagraphNode("เอกสารทดสอบ — FlowDoc", { align: "center" })
  const footerStack = createStackNode([pFooter.id])

  const headerNodes = {
    [headerStack.id]: headerStack,
    [hRow.id]: hRow,
    ...hColNodes,
    [pHLeft.id]: pHLeft,
    [pHRight.id]: pHRight,
  }
  const footerNodes = {
    [footerStack.id]: footerStack,
    [pFooter.id]: pFooter,
  }

  return { headerStack, footerStack, headerNodes, footerNodes }
}

export function buildSampleDoc(): DocumentNode {
  const p1 = createParagraphNode("FlowDoc — Pipeline Test")
  const p2 = createParagraphNode(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  )
  const spacer = createSpacerNode({ height: 24 })

  const { row, stacks, nodes: colNodes } = createColumnsSubtree(2)
  const pLeft = createParagraphNode("Column A: ข้อมูลฝั่งซ้าย")
  const pRight = createParagraphNode("Column B: ข้อมูลฝั่งขวา")
  stacks[0].childIds.push(pLeft.id)
  stacks[1].childIds.push(pRight.id)

  const table = buildSampleTable()
  const spacer2 = createSpacerNode({ height: 16 })
  const { headerStack, footerStack, headerNodes, footerNodes } = buildSampleHeaderFooter()

  const extras = Array.from({ length: 20 }, (_, i) =>
    createParagraphNode(`Paragraph ${i + 1}: ทดสอบ pagination — FlowDoc layout engine`),
  )

  const body = createBodyNode([
    p1.id, p2.id, spacer.id, row.id,
    spacer2.id, table.id,
    ...extras.map((p) => p.id),
  ])

  const section: DocumentSection = {
    id: createId("section"),
    type: "section",
    page: {
      size: "A4",
      orientation: "portrait",
      margin: {
        top: { value: 36, unit: "pt" },
        right: { value: 72, unit: "pt" },
        bottom: { value: 36, unit: "pt" },
        left: { value: 72, unit: "pt" },
      },
      headerReserved: 36,
      footerReserved: 28,
    },
    headerRootId: headerStack.id,
    headerFirstPageRootId: null,
    bodyRootId: body.id,
    footerRootId: footerStack.id,
    footerFirstPageRootId: null,
    nodes: {
      ...headerNodes,
      ...footerNodes,
      [body.id]: body,
      [p1.id]: p1,
      [p2.id]: p2,
      [spacer.id]: spacer,
      [spacer2.id]: spacer2,
      ...colNodes,
      [pLeft.id]: pLeft,
      [pRight.id]: pRight,
      [table.id]: table as any,
      ...Object.fromEntries(extras.map((p) => [p.id, p])),
    },
  }

  return {
    version: 1,
    document: { id: createId("doc"), meta: { title: "FlowDoc Test" }, sections: [section] },
  }
}
