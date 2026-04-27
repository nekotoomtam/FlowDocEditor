import {
  createId,
  createParagraphNode,
  createSpacerNode,
  createBodyNode,
  createStackNode,
  createRowNode,
  getEqualWidthShares,
} from "@/document"
import { pt } from "@/schema"
import type {
  DocumentNode,
  DocumentSection,
  LayoutNode,
  ParagraphProps,
  TableCellNode,
  TableRowNode,
  TableNode,
} from "@/schema"

// ─── DSL Input Types ──────────────────────────────────────────────────────────

type DslMargin =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number }

interface DslPage {
  size?: "A4"
  orientation?: "portrait" | "landscape"
  margin?: DslMargin
  headerReserved?: number
  footerReserved?: number
}

interface DslParagraph {
  p: string
  align?: "left" | "center" | "right" | "justify"
  fontSize?: number
  lineHeight?: number
  spacingBefore?: number
  spacingAfter?: number
}

interface DslSpacer { spacer: number }

interface DslCols {
  cols: (string | DslBlock | DslBlock[])[]
  widths?: number[]
}

interface DslTable {
  table: {
    cols: number[]
    rows: (string | DslParagraph)[][]
    border?: boolean | { width?: number; color?: string }
  }
}

type DslBlock = string | DslParagraph | DslSpacer | DslCols | DslTable

interface DslDocument {
  title?: string
  page?: DslPage
  header?: DslBlock[]
  headerFirstPage?: DslBlock[] | null
  footer?: DslBlock[]
  footerFirstPage?: DslBlock[] | null
  body: DslBlock[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveMargin(margin: DslMargin | undefined) {
  if (margin == null) return { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) }
  if (typeof margin === "number") {
    const v = pt(margin)
    return { top: v, right: { ...v }, bottom: { ...v }, left: { ...v } }
  }
  return {
    top:    pt(margin.top    ?? 72),
    right:  pt(margin.right  ?? 72),
    bottom: pt(margin.bottom ?? 72),
    left:   pt(margin.left   ?? 72),
  }
}

// ─── Block Compilers ──────────────────────────────────────────────────────────

function compileParagraph(
  item: string | DslParagraph,
): { id: string; nodes: Record<string, LayoutNode> } {
  const text = typeof item === "string" ? item : item.p
  const props: Partial<ParagraphProps> = {}
  if (typeof item !== "string") {
    if (item.align != null)         props.align        = item.align
    if (item.fontSize != null)      props.fontSize     = pt(item.fontSize)
    if (item.lineHeight != null)    props.lineHeight   = item.lineHeight
    if (item.spacingBefore != null) props.spacingBefore = pt(item.spacingBefore)
    if (item.spacingAfter  != null) props.spacingAfter  = pt(item.spacingAfter)
  }
  const node = createParagraphNode(text, props)
  return { id: node.id, nodes: { [node.id]: node } }
}

function compileSpacer(item: DslSpacer): { id: string; nodes: Record<string, LayoutNode> } {
  const node = createSpacerNode({ height: item.spacer })
  return { id: node.id, nodes: { [node.id]: node } }
}

function compileCols(item: DslCols): { id: string; nodes: Record<string, LayoutNode> } {
  const count = item.cols.length
  const shares = item.widths ?? getEqualWidthShares(count)
  const allNodes: Record<string, LayoutNode> = {}

  const stacks = item.cols.map((col, i) => {
    const colBlocks: DslBlock[] =
      typeof col === "string" ? [col]
      : Array.isArray(col)   ? col
      :                        [col as DslBlock]
    const { childIds, nodes } = compileBlocks(colBlocks)
    Object.assign(allNodes, nodes)
    const stack = createStackNode(childIds, { widthShare: shares[i] })
    allNodes[stack.id] = stack
    return stack
  })

  const row = createRowNode(stacks.map((s) => s.id))
  allNodes[row.id] = row
  return { id: row.id, nodes: allNodes }
}

function compileTable(item: DslTable): { id: string; nodes: Record<string, LayoutNode> } {
  const { cols, rows, border } = item.table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableNodes: Record<string, any> = {}

  const borderSide = border
    ? {
        style: "solid" as const,
        width: pt(typeof border === "object" ? (border.width ?? 1) : 1),
        color: (typeof border === "object" ? border.color : undefined) ?? "000000",
      }
    : undefined
  const cellBorder = borderSide
    ? { top: borderSide, right: borderSide, bottom: borderSide, left: borderSide }
    : undefined

  const compiledRows = rows.map((row) => {
    const cells = row.map((cell) => {
      const text = typeof cell === "string" ? cell : cell.p
      const paraProps: Partial<ParagraphProps> = {}
      if (typeof cell !== "string" && cell.align) paraProps.align = cell.align
      const para = createParagraphNode(text, paraProps)
      tableNodes[para.id] = para

      const cellNode: TableCellNode = {
        id: createId("cell"),
        type: "table-cell",
        props: { border: cellBorder, padding: pt(6) },
        childIds: [para.id],
      }
      tableNodes[cellNode.id] = cellNode
      return cellNode
    })

    const rowNode: TableRowNode = {
      id: createId("row"),
      type: "table-row",
      props: {},
      cellIds: cells.map((c) => c.id),
    }
    tableNodes[rowNode.id] = rowNode
    return rowNode
  })

  const tableNode: TableNode = {
    id: createId("table"),
    type: "table",
    props: {},
    columns: cols.map((w) => ({ width: pt(w) })),
    rowIds:  compiledRows.map((r) => r.id),
    nodes:   tableNodes,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { id: tableNode.id, nodes: { [tableNode.id]: tableNode as any } }
}

function compileBlock(item: DslBlock): { id: string; nodes: Record<string, LayoutNode> } {
  if (typeof item === "string") return compileParagraph(item)
  const obj = item as unknown as Record<string, unknown>
  if ("p"      in obj) return compileParagraph(item as DslParagraph)
  if ("spacer" in obj) return compileSpacer(item as DslSpacer)
  if ("cols"   in obj) return compileCols(item as DslCols)
  if ("table"  in obj) return compileTable(item as DslTable)
  throw new Error(`Unknown DSL block: ${JSON.stringify(item)}`)
}

function compileBlocks(
  items: DslBlock[],
): { childIds: string[]; nodes: Record<string, LayoutNode> } {
  const nodes: Record<string, LayoutNode> = {}
  const childIds: string[] = []
  for (const item of items) {
    const { id, nodes: n } = compileBlock(item)
    childIds.push(id)
    Object.assign(nodes, n)
  }
  return { childIds, nodes }
}

function compileZone(
  items: DslBlock[],
): { rootId: string; nodes: Record<string, LayoutNode> } {
  const { childIds, nodes } = compileBlocks(items)
  const stack = createStackNode(childIds)
  nodes[stack.id] = stack
  return { rootId: stack.id, nodes }
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function parseDSL(input: string): DocumentNode {
  const dsl = JSON.parse(input) as DslDocument

  if (!Array.isArray(dsl.body)) throw new Error('"body" must be an array')

  const { childIds, nodes: bodyNodes } = compileBlocks(dsl.body)
  const body = createBodyNode(childIds)

  const pageSettings = {
    size: (dsl.page?.size ?? "A4") as "A4",
    orientation: (dsl.page?.orientation ?? "portrait") as "portrait" | "landscape",
    margin: resolveMargin(dsl.page?.margin),
    headerReserved: dsl.page?.headerReserved,
    footerReserved: dsl.page?.footerReserved,
  }

  const sectionNodes: Record<string, LayoutNode> = {
    ...bodyNodes,
    [body.id]: body,
  }

  const section: DocumentSection = {
    id: createId("section"),
    type: "section",
    page: pageSettings,
    bodyRootId: body.id,
    nodes: sectionNodes,
  }

  if (dsl.header) {
    const { rootId, nodes } = compileZone(dsl.header)
    Object.assign(sectionNodes, nodes)
    section.headerRootId = rootId
    if (pageSettings.headerReserved == null) pageSettings.headerReserved = 36
  }

  if (dsl.headerFirstPage !== undefined) {
    if (dsl.headerFirstPage === null) {
      section.headerFirstPageRootId = null
    } else {
      const { rootId, nodes } = compileZone(dsl.headerFirstPage)
      Object.assign(sectionNodes, nodes)
      section.headerFirstPageRootId = rootId
    }
  }

  if (dsl.footer) {
    const { rootId, nodes } = compileZone(dsl.footer)
    Object.assign(sectionNodes, nodes)
    section.footerRootId = rootId
    if (pageSettings.footerReserved == null) pageSettings.footerReserved = 28
  }

  if (dsl.footerFirstPage !== undefined) {
    if (dsl.footerFirstPage === null) {
      section.footerFirstPageRootId = null
    } else {
      const { rootId, nodes } = compileZone(dsl.footerFirstPage)
      Object.assign(sectionNodes, nodes)
      section.footerFirstPageRootId = rootId
    }
  }

  return {
    version: 1,
    document: {
      id: createId("doc"),
      meta: { title: dsl.title ?? "Untitled" },
      sections: [section],
    },
  }
}
