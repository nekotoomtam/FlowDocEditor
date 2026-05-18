import { pt } from "@/schema"
import type { DocumentNode, FlowTableNode, LayoutNode, ParagraphNode, TableNode } from "@/schema"

export const WYSIWYG_STAGE3_SCENARIO_QUERY_PARAM = "flowdocTestScenario"
export const WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID = "wysiwyg-stage3-boundary"
export const WYSIWYG_STAGE3_TARGET_NODE_ID = "stage3-boundary-target"
export const WYSIWYG_STAGE3_TARGET_MARKER = "STAGE3_BOUNDARY_MARKER"
export const WYSIWYG_STAGE3_STACK_ROW_ID = "stage3-stack-row"
export const WYSIWYG_STAGE3_STACK_LEFT_ID = "stage3-stack-left"
export const WYSIWYG_STAGE3_STACK_RIGHT_ID = "stage3-stack-right"
export const WYSIWYG_STAGE3_STACK_TARGET_NODE_ID = "stage3-stack-target"
export const WYSIWYG_STAGE3_STACK_CONTROL_NODE_ID = "stage3-stack-control"
export const WYSIWYG_STAGE3_STACK_TARGET_MARKER = "STAGE4_STACK_MARKER"
export const WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID = "stage3-table-cell-target"
export const WYSIWYG_STAGE3_TABLE_TARGET_CELL_ID = "stage3-table-cell-target-cell"
export const WYSIWYG_STAGE3_TABLE_TARGET_MARKER = "STAGE3_TABLE_CELL_MARKER"
export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID = "stage3-flow-table-colspan-target"
export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID = "stage3-flow-table-colspan-target-cell"
export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID = "stage3-flow-table-colspan-sibling"
export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_CELL_ID = "stage3-flow-table-colspan-sibling-cell"
export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_MARKER = "STAGE3_FLOW_TABLE_COLSPAN_MARKER"

export const WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT = [
  " ",
  "Typed through the FlowDoc text-engine bridge so the active paragraph must cross the page boundary.",
  "The visual layer must stay SVG-owned while draft pagination creates continuation fragments.",
  WYSIWYG_STAGE3_TARGET_MARKER,
  "longunbrokenstage3token".repeat(10),
].join(" ")

const TARGET_INITIAL_LINES = [
  "Stage 3 target line 1 keeps the paragraph near the page boundary.",
  "Stage 3 target line 2 keeps measured line geometry stable.",
  "Stage 3 target line 3 keeps downstream layout pressure visible.",
  "Stage 3 target line 4 keeps the click target inside the first fragment.",
  "Stage 3 target line 5 keeps Thai text involved: ทดสอบการไหลของข้อความ.",
  "Stage 3 target line 6 keeps the draft close to overflow.",
  "Stage 3 target line 7 keeps the final baseline before typing.",
  "Stage 3 target line 8 should still fit before the stress append.",
]

export const WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT = TARGET_INITIAL_LINES.join("\n")

const STACK_TARGET_INITIAL_LINES = [
  "Stack target line 1 keeps column editing on the text-engine path.",
  "Stack target line 2 checks row geometry while the sibling column remains stable.",
  "Stack target line 3 keeps mixed Thai text in the stack: ทดสอบข้อความในคอลัมน์.",
]

export const WYSIWYG_STAGE3_STACK_TARGET_INITIAL_TEXT = STACK_TARGET_INITIAL_LINES.join("\n")

export const WYSIWYG_STAGE3_STACK_TARGET_APPEND_TEXT = [
  "",
  WYSIWYG_STAGE3_STACK_TARGET_MARKER,
  "Stack paragraph edit keeps the containing row atomic while text grows.",
  "stacklongtoken".repeat(12),
  "Another line keeps local line wrapping under column width pressure.",
].join("\n")

const TABLE_TARGET_INITIAL_LINES = [
  "Table cell target line 1 starts as ordinary editable cell content.",
  "Table cell target line 2 keeps the row breakable under pagination.",
  "Table cell target line 3 keeps Thai text in the table path: ทดสอบเซลล์.",
]

export const WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT = TABLE_TARGET_INITIAL_LINES.join("\n")

export const WYSIWYG_STAGE3_TABLE_TARGET_APPEND_TEXT = [
  "",
  WYSIWYG_STAGE3_TABLE_TARGET_MARKER,
  ...Array.from({ length: 14 }, (_unused, index) => (
    `Table cell responsive line ${index + 1} ไทยอังกฤษ ${"tablecellboundary".repeat(8)}`
  )),
].join("\n")

const FLOW_TABLE_COLSPAN_TARGET_INITIAL_LINES = [
  "Flow Table colspan target line 1 starts inside a two-column cell.",
  "Flow Table colspan target line 2 keeps the row breakable with a sibling cell.",
  "Flow Table colspan target line 3 keeps Thai text in the flow-table path: ทดสอบเซลล์รวม.",
]

export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT =
  FLOW_TABLE_COLSPAN_TARGET_INITIAL_LINES.join("\n")

export const WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_APPEND_TEXT = [
  "",
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_MARKER,
  ...Array.from({ length: 18 }, (_unused, index) => (
    `Flow Table colspan responsive line ${index + 1} ไทยอังกฤษ ${"flowtablecolspanboundary".repeat(6)}`
  )),
].join("\n")

function paragraph(id: string, text: string, overrides: Partial<ParagraphNode["props"]> = {}): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...overrides,
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function downstreamParagraph(index: number): ParagraphNode {
  return paragraph(
    `stage3-downstream-p${index}`,
    `Downstream paragraph ${index} keeps reflow pressure after the edited block. `.repeat(4),
    { spacingAfter: pt(6) },
  )
}

function stressTable(): TableNode {
  const nodes: TableNode["nodes"] = {}
  const rowIds: string[] = []
  for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
    const cellIds: string[] = []
    for (let colIndex = 0; colIndex < 1; colIndex += 1) {
      const isTargetCell = rowIndex === 1 && colIndex === 0
      const paragraphId = isTargetCell
        ? WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID
        : `stage3-table-p${rowIndex}-${colIndex}`
      const cellId = isTargetCell
        ? WYSIWYG_STAGE3_TABLE_TARGET_CELL_ID
        : `stage3-table-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = paragraph(
        paragraphId,
        isTargetCell
          ? WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT
          : `Dense cell ${rowIndex + 1}.${colIndex + 1} ${"layout text ".repeat(8)}`,
        { fontSize: pt(9), lineHeight: 1.2, spacingAfter: pt(0) },
      )
      nodes[cellId] = { id: cellId, type: "table-cell", props: { padding: pt(3) }, childIds: [paragraphId] }
      cellIds.push(cellId)
    }
    const rowId = `stage3-table-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds }
    rowIds.push(rowId)
  }

  return {
    id: "stage3-downstream-table",
    type: "table",
    props: { headerRowCount: 1 },
    columns: [{ width: pt(451) }],
    rowIds,
    nodes,
  }
}

function stressFlowTable(): FlowTableNode {
  const nodes: FlowTableNode["nodes"] = {
    "stage3-flow-table-header-p1": paragraph(
      "stage3-flow-table-header-p1",
      "Flow header 1",
      { fontSize: pt(8), lineHeight: 1.1, spacingAfter: pt(0) },
    ),
    "stage3-flow-table-header-p2": paragraph(
      "stage3-flow-table-header-p2",
      "Flow header 2",
      { fontSize: pt(8), lineHeight: 1.1, spacingAfter: pt(0) },
    ),
    "stage3-flow-table-header-c1": {
      id: "stage3-flow-table-header-c1",
      type: "flow-table-cell",
      props: { colspan: 2, box: { padding: { top: pt(3), right: pt(3), bottom: pt(3), left: pt(3) } } },
      childIds: ["stage3-flow-table-header-p1"],
    },
    "stage3-flow-table-header-c2": {
      id: "stage3-flow-table-header-c2",
      type: "flow-table-cell",
      props: { box: { padding: { top: pt(3), right: pt(3), bottom: pt(3), left: pt(3) } } },
      childIds: ["stage3-flow-table-header-p2"],
    },
    "stage3-flow-table-header-row": {
      id: "stage3-flow-table-header-row",
      type: "flow-table-row",
      props: { height: pt(24) },
      cellIds: ["stage3-flow-table-header-c1", "stage3-flow-table-header-c2"],
    },
    [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID]: paragraph(
      WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID,
      WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT,
      { fontSize: pt(9), lineHeight: 1.2, spacingAfter: pt(0) },
    ),
    [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID]: paragraph(
      WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID,
      "Short sibling content should render once, not repeat on continuation slices.",
      { fontSize: pt(9), lineHeight: 1.2, spacingAfter: pt(0) },
    ),
    [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID]: {
      id: WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID,
      type: "flow-table-cell",
      props: {
        colspan: 2,
        rowspan: 1,
        box: {
          fill: "FFF7CC",
          padding: { top: pt(3), right: pt(3), bottom: pt(3), left: pt(3) },
        },
      },
      childIds: [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID],
    },
    [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_CELL_ID]: {
      id: WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_CELL_ID,
      type: "flow-table-cell",
      props: {
        box: {
          fill: "E0F2FE",
          padding: { top: pt(3), right: pt(3), bottom: pt(3), left: pt(3) },
        },
      },
      childIds: [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID],
    },
    "stage3-flow-table-target-row": {
      id: "stage3-flow-table-target-row",
      type: "flow-table-row",
      props: {},
      cellIds: [WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_CELL_ID],
    },
  }

  return {
    id: "stage3-flow-table-colspan",
    type: "flow-table",
    props: { headerRowCount: 1 },
    columns: [{ width: pt(150) }, { width: pt(151) }, { width: pt(150) }],
    rowIds: ["stage3-flow-table-header-row", "stage3-flow-table-target-row"],
    nodes,
  }
}

function stressStackRow(): Record<string, LayoutNode> {
  const target = paragraph(
    WYSIWYG_STAGE3_STACK_TARGET_NODE_ID,
    WYSIWYG_STAGE3_STACK_TARGET_INITIAL_TEXT,
    { fontSize: pt(10), lineHeight: 1.2, spacingAfter: pt(0) },
  )
  const control = paragraph(
    WYSIWYG_STAGE3_STACK_CONTROL_NODE_ID,
    "Sibling stack paragraph must keep its x/width and row-height relationship while the left stack is edited. ".repeat(3),
    { fontSize: pt(10), lineHeight: 1.2, spacingAfter: pt(0) },
  )
  const leftStack: LayoutNode = {
    id: WYSIWYG_STAGE3_STACK_LEFT_ID,
    type: "stack",
    props: { widthShare: 48, minHeight: 72 },
    childIds: [target.id],
  }
  const rightStack: LayoutNode = {
    id: WYSIWYG_STAGE3_STACK_RIGHT_ID,
    type: "stack",
    props: { widthShare: 52, minHeight: 72 },
    childIds: [control.id],
  }
  const row: LayoutNode = {
    id: WYSIWYG_STAGE3_STACK_ROW_ID,
    type: "row",
    props: { gap: 8, minHeight: 72 },
    childIds: [leftStack.id, rightStack.id],
  }

  return {
    [row.id]: row,
    [leftStack.id]: leftStack,
    [rightStack.id]: rightStack,
    [target.id]: target,
    [control.id]: control,
  }
}

export function makeWysiwygStage3BoundaryDocument(): DocumentNode {
  const spacer: LayoutNode = { id: "stage3-boundary-spacer", type: "spacer", props: { height: 590 } }
  const target = paragraph(WYSIWYG_STAGE3_TARGET_NODE_ID, WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT)
  const downstream = Array.from({ length: 10 }, (_, index) => downstreamParagraph(index + 1))
  const stackRowNodes = stressStackRow()
  const table = stressTable()
  const flowTable = stressFlowTable()
  const nodes: Record<string, LayoutNode> = {
    "stage3-body": {
      id: "stage3-body",
      type: "body",
      props: {},
      childIds: [
        spacer.id,
        target.id,
        ...downstream.map((node) => node.id),
        WYSIWYG_STAGE3_STACK_ROW_ID,
        flowTable.id,
        table.id,
      ],
    },
    [spacer.id]: spacer,
    [target.id]: target,
    ...stackRowNodes,
    [table.id]: table,
    [flowTable.id]: flowTable,
  }

  for (const node of downstream) nodes[node.id] = node

  return {
    version: 1,
    document: {
      id: "wysiwyg-stage3-boundary-doc",
      meta: { title: "WYSIWYG Stage 3 Boundary Stress" },
      sections: [{
        id: "stage3-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "stage3-body",
        nodes,
      }],
    },
  }
}

export interface EditorTestScenario {
  id: typeof WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID
  document: DocumentNode
}

function editorTestScenariosEnabled(): boolean {
  return process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_FLOWDOC_EDITOR_TEST_SCENARIOS === "1" ||
    process.env.NEXT_PUBLIC_FLOWDOC_EDITOR_TEST_SCENARIOS === "true"
}

export function resolveEditorTestScenario(search: string | null | undefined): EditorTestScenario | null {
  if (!editorTestScenariosEnabled() || !search) return null
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  if (params.get(WYSIWYG_STAGE3_SCENARIO_QUERY_PARAM) !== WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID) return null
  return {
    id: WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID,
    document: makeWysiwygStage3BoundaryDocument(),
  }
}

export function resolveEditorTestScenarioFromLocation(): EditorTestScenario | null {
  if (typeof window === "undefined") return null
  return resolveEditorTestScenario(window.location.search)
}
