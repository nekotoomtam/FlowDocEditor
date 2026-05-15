import type {
  BodyNode,
  BodyProps,
  DocumentNode,
  DocumentSection,
  FlowRowNode,
  FlowRowProps,
  FlowStackNode,
  FlowStackProps,
  LayoutNode,
  PageSettings,
  ParagraphNode,
  ParagraphProps,
  RowNode,
  RowProps,
  SpacerNode,
  SpacerProps,
  StackNode,
  StackProps,
  TableNode,
  TableRowNode,
  TableCellNode,
  TocNode,
  TocProps,
} from "../schema"
import { pt } from "../schema"

// ─── ID Factory ───────────────────────────────────────────────────────────────

let _counter = 0
export function createId(prefix = "node"): string {
  _counter += 1
  return `${prefix}_${Date.now()}_${_counter}`
}

// ─── Default Values ───────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  size: "A4",
  orientation: "portrait",
  margin: {
    top: pt(72),
    right: pt(72),
    bottom: pt(72),
    left: pt(72),
  },
}

export const DEFAULT_PARAGRAPH_PROPS: ParagraphProps = {
  align: "left",
  fontSize: pt(12),
  fontFamilyKey: "default",
  lineHeight: 1.5,
  spacingBefore: pt(0),
  spacingAfter: pt(8),
  textIndent: pt(0),
  indentLeft: pt(0),
  indentRight: pt(0),
}

export const DEFAULT_SPACER_HEIGHT = 20
export const DEFAULT_STACK_MIN_HEIGHT = 24
export const DEFAULT_STACK_WIDTH_SHARE = 100

// ─── Width Share Math ─────────────────────────────────────────────────────────

function floorToTwo(value: number): number {
  return Math.floor((value + Number.EPSILON) * 100) / 100
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function getEqualWidthShares(count: number): number[] {
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount === 0) return []

  const baseShare = floorToTwo(100 / safeCount)
  const shares = Array.from({ length: safeCount }, () => baseShare)
  const allocated = roundToTwo(baseShare * safeCount)
  shares[safeCount - 1] = roundToTwo(100 - (allocated - baseShare))
  return shares
}

// ─── Node Factories ───────────────────────────────────────────────────────────

export function createTextRun(text = ""): { id: string; type: "text"; text: string } {
  return { id: createId("text"), type: "text", text }
}

export function createFieldRefInline(key: string, label?: string, fallback?: string) {
  return { id: createId("field"), type: "fieldRef" as const, key, label, fallback }
}

export function createParagraphNode(text = "", props: Partial<ParagraphProps> = {}): ParagraphNode {
  return {
    id: createId("paragraph"),
    type: "paragraph",
    props: {
      ...DEFAULT_PARAGRAPH_PROPS,
      fontSize: { ...DEFAULT_PARAGRAPH_PROPS.fontSize },
      spacingBefore: { ...DEFAULT_PARAGRAPH_PROPS.spacingBefore },
      spacingAfter: { ...DEFAULT_PARAGRAPH_PROPS.spacingAfter },
      textIndent: { ...DEFAULT_PARAGRAPH_PROPS.textIndent },
      indentLeft: { ...DEFAULT_PARAGRAPH_PROPS.indentLeft },
      indentRight: { ...DEFAULT_PARAGRAPH_PROPS.indentRight },
      ...props,
    },
    children: [createTextRun(text)],
  }
}

export function createSpacerNode(props: Partial<SpacerProps> = {}): SpacerNode {
  return {
    id: createId("spacer"),
    type: "spacer",
    props: { height: DEFAULT_SPACER_HEIGHT, ...props },
  }
}

export function createBodyNode(childIds: string[] = [], props: Partial<BodyProps> = {}): BodyNode {
  return {
    id: createId("body"),
    type: "body",
    props,
    childIds,
  }
}

export function createStackNode(childIds: string[] = [], props: Partial<StackProps> = {}): StackNode {
  return {
    id: createId("stack"),
    type: "stack",
    props: { minHeight: DEFAULT_STACK_MIN_HEIGHT, ...props },
    childIds,
  }
}

export function createRowNode(childIds: string[] = [], props: Partial<RowProps> = {}): RowNode {
  return {
    id: createId("row"),
    type: "row",
    props,
    childIds,
  }
}

export function createFlowStackNode(childIds: string[] = [], props: Partial<FlowStackProps> = {}): FlowStackNode {
  return {
    id: createId("flow-stack"),
    type: "flow-stack",
    props: { minHeight: DEFAULT_STACK_MIN_HEIGHT, ...props },
    childIds,
  }
}

export function createFlowRowNode(childIds: string[] = [], props: Partial<FlowRowProps> = {}): FlowRowNode {
  return {
    id: createId("flow-row"),
    type: "flow-row",
    props,
    childIds,
  }
}

// ─── Subtree Factories ────────────────────────────────────────────────────────

// สร้าง row ที่มี stack เดียว (canonical empty row)
export function createRowSubtree(props: Partial<RowProps> = {}): {
  row: RowNode
  stacks: [StackNode]
  nodes: Record<string, LayoutNode>
} {
  const stack = createStackNode([], { widthShare: 100 })
  const row = createRowNode([stack.id], props)
  return {
    row,
    stacks: [stack],
    nodes: { [row.id]: row, [stack.id]: stack },
  }
}

// สร้าง row ที่มี N stacks แบ่ง width เท่าๆ กัน
export function createColumnsSubtree(columnCount = 2, props: Partial<RowProps> = {}): {
  row: RowNode
  stacks: StackNode[]
  nodes: Record<string, LayoutNode>
} {
  const safeCount = Math.max(1, Math.floor(columnCount))
  const shares = getEqualWidthShares(safeCount)
  const stacks = shares.map((widthShare) =>
    createStackNode([], { widthShare, minHeight: DEFAULT_STACK_MIN_HEIGHT }),
  )
  const row = createRowNode(stacks.map((s) => s.id), props)
  const nodes: Record<string, LayoutNode> = { [row.id]: row }
  stacks.forEach((s) => { nodes[s.id] = s })
  return { row, stacks, nodes }
}

// สร้าง flow-row ที่มี N flow-stacks แบ่ง width เท่าๆ กัน
export function createFlowColumnsSubtree(columnCount = 2, props: Partial<FlowRowProps> = {}): {
  row: FlowRowNode
  stacks: FlowStackNode[]
  nodes: Record<string, LayoutNode>
} {
  const safeCount = Math.max(1, Math.floor(columnCount))
  const shares = getEqualWidthShares(safeCount)
  const stacks = shares.map((widthShare) =>
    createFlowStackNode([], { widthShare, minHeight: DEFAULT_STACK_MIN_HEIGHT }),
  )
  const row = createFlowRowNode(stacks.map((s) => s.id), props)
  const nodes: Record<string, LayoutNode> = { [row.id]: row }
  stacks.forEach((s) => { nodes[s.id] = s })
  return { row, stacks, nodes }
}

// ─── TOC Factory ─────────────────────────────────────────────────────────────

export function createTocNode(props: Partial<TocProps> = {}): TocNode {
  return { id: createId("toc"), type: "toc", props: { title: "สารบัญ", maxLevel: 3, ...props } }
}

// ─── Table Factories ──────────────────────────────────────────────────────────

export function createTableCellNode(childIds: string[]): TableCellNode {
  return { id: createId("tcell"), type: "table-cell", props: {}, childIds }
}

export function createTableRowNode(cellIds: string[]): TableRowNode {
  return { id: createId("trow"), type: "table-row", props: {}, cellIds }
}

export function createDefaultTable(rowCount = 3, colCount = 3): TableNode {
  const colWidthPt = 150
  const internalNodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  for (let r = 0; r < rowCount; r++) {
    const cellIds: string[] = []
    for (let c = 0; c < colCount; c++) {
      const para = createParagraphNode("", { spacingBefore: pt(2), spacingAfter: pt(2) })
      const cell = createTableCellNode([para.id])
      internalNodes[para.id] = para
      internalNodes[cell.id] = cell
      cellIds.push(cell.id)
    }
    const row = createTableRowNode(cellIds)
    internalNodes[row.id] = row
    rowIds.push(row.id)
  }

  return {
    id: createId("table"),
    type: "table",
    props: {
      border: {
        top: { style: "solid", width: pt(0.5), color: "000000" },
        right: { style: "solid", width: pt(0.5), color: "000000" },
        bottom: { style: "solid", width: pt(0.5), color: "000000" },
        left: { style: "solid", width: pt(0.5), color: "000000" },
      },
    },
    columns: Array.from({ length: colCount }, () => ({ width: pt(colWidthPt) })),
    rowIds,
    nodes: internalNodes,
  }
}

// ─── Document Factory ─────────────────────────────────────────────────────────

export function createDefaultDocument(title = "Untitled"): DocumentNode {
  const paragraph = createParagraphNode()
  const body = createBodyNode([paragraph.id])

  const section: DocumentSection = {
    id: createId("section"),
    type: "section",
    page: {
      ...DEFAULT_PAGE_SETTINGS,
      margin: {
        top: { ...DEFAULT_PAGE_SETTINGS.margin.top },
        right: { ...DEFAULT_PAGE_SETTINGS.margin.right },
        bottom: { ...DEFAULT_PAGE_SETTINGS.margin.bottom },
        left: { ...DEFAULT_PAGE_SETTINGS.margin.left },
      },
    },
    bodyRootId: body.id,
    nodes: {
      [body.id]: body,
      [paragraph.id]: paragraph,
    },
  }

  return {
    version: 1,
    document: {
      id: createId("doc"),
      meta: { title },
      sections: [section],
    },
  }
}
