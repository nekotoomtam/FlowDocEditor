import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import { resolveFragmentBoxLayoutPrimitives, type PaginatedDocument, type PaginatedPage, type PageFragment, type ParagraphRenderProps } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import {
  buildEditorFragmentClipPathId,
  buildEditorFragmentRenderKey,
  buildWysiwygDraftVisualPreview,
  buildWysiwygTableCellDraftVisualChromeFragments,
  EditorCanvas,
  pageViewScopedEditPropsAffectPage,
  resolveInlineEditVisualOffsetY,
  shouldStartInlineEditOnSingleClick,
} from "../EditorCanvas"
import type { DragState } from "../editorReducer"

const renderProps: ParagraphRenderProps = {
  align: "left",
  fontFamilyKey: "default",
  fontSize: 12,
  lineHeight: 14,
  spacingBefore: 0,
  spacingAfter: 0,
  textIndent: 0,
  indentLeft: 0,
  indentRight: 0,
}

function paragraphNode(id: string, text: string) {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: { value: 12, unit: "pt" },
      fontFamilyKey: "default",
      lineHeight: 1,
      spacingBefore: { value: 0, unit: "pt" },
      spacingAfter: { value: 0, unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
      indentLeft: { value: 0, unit: "pt" },
      indentRight: { value: 0, unit: "pt" },
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function textFragment(id: string, text: string, y: number, overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: id,
    nodeType: "paragraph",
    pageIndex: 0,
    x: 36,
    y,
    width: 228,
    height: 14,
    lines: [{
      text,
      x: 36,
      y,
      width: 96,
      height: 14,
    }],
    renderProps,
    ...overrides,
  }
}

function pageWithFragments(index: number, fragments: PageFragment[]): PaginatedPage {
  return {
    index,
    width: 300,
    height: 400,
    contentBox: { x: 36, y: 72, width: 228, height: 256 },
    fragments,
    headerFragments: [],
    footerFragments: [],
  }
}

function makeDoc(): DocumentNode {
  const body = paragraphNode("body-p", "Body text")
  const header = paragraphNode("header-p", "Header Preview")
  const footer = paragraphNode("footer-p", "หน้า 7")

  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        headerRootId: "header-root",
        footerRootId: "footer-root",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
          headerReserved: 36,
          footerReserved: 36,
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [body.id] },
          "header-root": { id: "header-root", type: "stack", props: {}, childIds: [header.id] },
          "footer-root": { id: "footer-root", type: "stack", props: {}, childIds: [footer.id] },
          [body.id]: body,
          [header.id]: header,
          [footer.id]: footer,
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeFlowDoc(): DocumentNode {
  const body = paragraphNode("body-p", "Body text")
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
          fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
          fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: [body.id] },
          [body.id]: body,
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeTwoStackFlowDoc(): DocumentNode {
  const left = paragraphNode("left-p", "Left text")
  const right = paragraphNode("right-p", "Right text")
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
          fr1: { id: "fr1", type: "flow-row", props: { gap: 8 }, childIds: ["fs1", "fs2"] },
          fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 60 }, childIds: [left.id] },
          fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 40 }, childIds: [right.id] },
          [left.id]: left,
          [right.id]: right,
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeTableCellDoc(text = "A"): DocumentNode {
  const cellParagraph = paragraphNode("cell-p", text)
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["tbl1"] },
          tbl1: {
            id: "tbl1",
            type: "flow-table",
            props: {},
            columns: [{ width: { value: 120, unit: "pt" } }],
            rowIds: ["tr1"],
            nodes: {
              tr1: { id: "tr1", type: "flow-table-row", props: {}, cellIds: ["tc1"] },
              tc1: { id: "tc1", type: "flow-table-cell", props: {}, childIds: ["cell-p"] },
              "cell-p": cellParagraph,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeTwoRowTableCellDoc(): DocumentNode {
  const doc = makeTableCellDoc() as unknown as {
    document: {
      sections: Array<{
        nodes: Record<string, {
          type?: string
          rowIds?: string[]
          nodes?: Record<string, unknown>
        }>
      }>
    }
  }
  const table = doc.document.sections[0].nodes.tbl1
  const secondParagraph = paragraphNode("cell-p-2", "B")
  table.rowIds?.push("tr2")
  if (table.nodes) {
    table.nodes.tr2 = { id: "tr2", type: "flow-table-row", props: {}, cellIds: ["tc2"] }
    table.nodes.tc2 = { id: "tc2", type: "flow-table-cell", props: {}, childIds: ["cell-p-2"] }
    table.nodes["cell-p-2"] = secondParagraph
  }
  return doc as unknown as DocumentNode
}

function makeFlowTableCellDoc(text = "A"): DocumentNode {
  const cellParagraph = paragraphNode("cell-p", text)
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
          ft1: {
            id: "ft1",
            type: "flow-table",
            props: {},
            columns: [{ width: { value: 120, unit: "pt" } }],
            rowIds: ["ftr1"],
            nodes: {
              ftr1: { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc1"] },
              ftc1: { id: "ftc1", type: "flow-table-cell", props: {}, childIds: ["cell-p"] },
              "cell-p": cellParagraph,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeTwoColumnTableCellDoc(kind: "short-ids" | "flow-table" = "short-ids"): DocumentNode {
  const left = paragraphNode("cell-p-left", "A")
  const right = paragraphNode("cell-p-right", "B")
  const useFlowIds = kind === "flow-table"
  const tableId = useFlowIds ? "ft1" : "tbl1"
  const rowId = useFlowIds ? "ftr1" : "tr1"
  const leftCellId = useFlowIds ? "ftc1" : "tc1"
  const rightCellId = useFlowIds ? "ftc2" : "tc2"
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [tableId] },
          [tableId]: {
            id: tableId,
            type: "flow-table",
            props: {},
            columns: [{ width: { value: 80, unit: "pt" } }, { width: { value: 40, unit: "pt" } }],
            rowIds: [rowId],
            nodes: {
              [rowId]: { id: rowId, type: "flow-table-row", props: {}, cellIds: [leftCellId, rightCellId] },
              [leftCellId]: { id: leftCellId, type: "flow-table-cell", props: {}, childIds: [left.id] },
              [rightCellId]: { id: rightCellId, type: "flow-table-cell", props: {}, childIds: [right.id] },
              [left.id]: left,
              [right.id]: right,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makePaginated(): PaginatedDocument {
  return {
    sections: [{
      sectionId: "section",
      pages: [{
        index: 0,
        width: 300,
        height: 400,
        contentBox: { x: 36, y: 72, width: 228, height: 256 },
        fragments: [textFragment("body-p", "Body text", 72)],
        headerFragments: [textFragment("header-p", "Header Preview", 36)],
        footerFragments: [textFragment("footer-p", "หน้า 7", 340)],
      }],
    }],
    tocEntries: [],
  }
}

function makeDividerPageBreakDoc(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 36, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 36, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["divider-1", "page-break-1"] },
          "divider-1": {
            id: "divider-1",
            type: "divider",
            props: {
              color: "334155",
              thickness: { value: 2, unit: "pt" },
              marginBefore: { value: 4, unit: "pt" },
              marginAfter: { value: 6, unit: "pt" },
              style: "dashed",
            },
          },
          "page-break-1": { id: "page-break-1", type: "page-break", props: {} },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeDividerPageBreakPaginated(): PaginatedDocument {
  return {
    sections: [{
      sectionId: "section",
      pages: [{
        index: 0,
        width: 300,
        height: 400,
        contentBox: { x: 36, y: 72, width: 228, height: 256 },
        fragments: [
          {
            nodeId: "divider-1",
            nodeType: "divider",
            pageIndex: 0,
            x: 36,
            y: 72,
            width: 228,
            height: 12,
            dividerRenderProps: {
              color: "334155",
              thickness: 2,
              marginBefore: 4,
              marginAfter: 6,
              style: "dashed",
            },
          },
          {
            nodeId: "page-break-1",
            nodeType: "page-break",
            pageIndex: 0,
            x: 36,
            y: 96,
            width: 228,
            height: 0,
          },
        ],
        headerFragments: [],
        footerFragments: [],
      }],
    }],
    tocEntries: [],
  }
}

function makeFlowPaginated(): PaginatedDocument {
  return {
    sections: [{
      sectionId: "section",
      pages: [{
        index: 0,
        width: 300,
        height: 400,
        contentBox: { x: 36, y: 72, width: 228, height: 256 },
        fragments: [
          { nodeId: "fr1", nodeType: "flow-row", pageIndex: 0, x: 36, y: 72, width: 228, height: 40, fragmentIndex: 0 },
          {
            nodeId: "fs1",
            nodeType: "flow-stack",
            parentNodeId: "fr1",
            pageIndex: 0,
            x: 36,
            y: 72,
            width: 228,
            height: 40,
            fragmentIndex: 0,
            boxRenderProps: {
              fill: "E0F2FE",
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              border: { left: { style: "solid", width: 1, color: "111111" } },
            },
          },
          textFragment("body-p", "Body text", 72),
        ],
        headerFragments: [],
        footerFragments: [],
      }],
    }],
    tocEntries: [],
  }
}

function makeTwoStackFlowPaginated(): PaginatedDocument {
  return {
    sections: [{
      sectionId: "section",
      pages: [{
        index: 0,
        width: 300,
        height: 400,
        contentBox: { x: 36, y: 72, width: 228, height: 256 },
        fragments: [
          { nodeId: "fr1", nodeType: "flow-row", pageIndex: 0, x: 36, y: 72, width: 228, height: 40, fragmentIndex: 0 },
          { nodeId: "fs1", nodeType: "flow-stack", parentNodeId: "fr1", pageIndex: 0, x: 36, y: 72, width: 132, height: 40, fragmentIndex: 0 },
          { nodeId: "fs2", nodeType: "flow-stack", parentNodeId: "fr1", pageIndex: 0, x: 176, y: 72, width: 88, height: 40, fragmentIndex: 0 },
          textFragment("left-p", "Left text", 72, { parentNodeId: "fs1", width: 132 }),
          textFragment("right-p", "Right text", 72, { parentNodeId: "fs2", x: 176, width: 88 }),
        ],
        headerFragments: [],
        footerFragments: [],
      }],
    }],
    tocEntries: [],
  }
}

function makeTableCellPaginated(kind: "short-ids" | "flow-table" = "short-ids"): PaginatedDocument {
  const useFlowIds = kind === "flow-table"
  const tableId = useFlowIds ? "ft1" : "tbl1"
  const rowId = useFlowIds ? "ftr1" : "tr1"
  const cellId = useFlowIds ? "ftc1" : "tc1"
  return {
    sections: [{
      sectionId: "section",
      pages: [
        {
          index: 0,
          width: 300,
          height: 160,
          contentBox: { x: 36, y: 72, width: 228, height: 28 },
          fragments: [
            { nodeId: tableId, nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
            { nodeId: rowId, nodeType: "flow-table-row", parentNodeId: tableId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
            { nodeId: cellId, nodeType: "flow-table-cell", parentNodeId: rowId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
            textFragment("cell-p", "A", 72, {
              parentNodeId: cellId,
              width: 120,
              height: 12,
              lineStart: 0,
              lineEnd: 1,
              lines: [{
                text: "A",
                x: 36,
                y: 72,
                width: 8,
                height: 12,
                segments: [{ kind: "word", text: "A", start: 0, end: 1, x: 0, width: 8, breakableAfter: false }],
              }],
            }),
          ],
          headerFragments: [],
          footerFragments: [],
        },
        {
          index: 1,
          width: 300,
          height: 160,
          contentBox: { x: 36, y: 72, width: 228, height: 28 },
          fragments: [],
          headerFragments: [],
          footerFragments: [],
        },
      ],
    }],
    tocEntries: [],
  }
}

function makeTwoRowTableCellPaginated(): PaginatedDocument {
  const paginated = makeTableCellPaginated()
  paginated.sections[0].pages[0] = {
    ...paginated.sections[0].pages[0],
    contentBox: { x: 36, y: 72, width: 228, height: 56 },
    fragments: [
      { nodeId: "tbl1", nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 120, height: 56 },
      { nodeId: "tr1", nodeType: "flow-table-row", parentNodeId: "tbl1", pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
      { nodeId: "tc1", nodeType: "flow-table-cell", parentNodeId: "tr1", pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
      textFragment("cell-p", "A", 72, { parentNodeId: "tc1", width: 120 }),
      { nodeId: "tr2", nodeType: "flow-table-row", parentNodeId: "tbl1", pageIndex: 0, x: 36, y: 100, width: 120, height: 28 },
      { nodeId: "tc2", nodeType: "flow-table-cell", parentNodeId: "tr2", pageIndex: 0, x: 36, y: 100, width: 120, height: 28 },
      textFragment("cell-p-2", "B", 100, { parentNodeId: "tc2", width: 120 }),
    ],
  }
  return paginated
}

function makeTwoColumnTableCellPaginated(kind: "short-ids" | "flow-table" = "short-ids"): PaginatedDocument {
  const useFlowIds = kind === "flow-table"
  const tableId = useFlowIds ? "ft1" : "tbl1"
  const rowId = useFlowIds ? "ftr1" : "tr1"
  const leftCellId = useFlowIds ? "ftc1" : "tc1"
  const rightCellId = useFlowIds ? "ftc2" : "tc2"
  return {
    sections: [{
      sectionId: "section",
      pages: [{
        index: 0,
        width: 300,
        height: 160,
        contentBox: { x: 36, y: 72, width: 228, height: 28 },
        fragments: [
          { nodeId: tableId, nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
          { nodeId: rowId, nodeType: "flow-table-row", parentNodeId: tableId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
          { nodeId: leftCellId, nodeType: "flow-table-cell", parentNodeId: rowId, pageIndex: 0, x: 36, y: 72, width: 80, height: 28 },
          { nodeId: rightCellId, nodeType: "flow-table-cell", parentNodeId: rowId, pageIndex: 0, x: 116, y: 72, width: 40, height: 28 },
          textFragment("cell-p-left", "A", 72, { parentNodeId: leftCellId, width: 80 }),
          textFragment("cell-p-right", "B", 72, { parentNodeId: rightCellId, x: 116, width: 40 }),
        ],
        headerFragments: [],
        footerFragments: [],
      }],
    }],
    tocEntries: [],
  }
}

function makeSplitTableCellPaginated(kind: "short-ids" | "flow-table" = "short-ids"): PaginatedDocument {
  const paginated = makeTableCellPaginated(kind)
  const useFlowIds = kind === "flow-table"
  const tableId = useFlowIds ? "ft1" : "tbl1"
  const rowId = useFlowIds ? "ftr1" : "tr1"
  const cellId = useFlowIds ? "ftc1" : "tc1"
  const splitRenderProps = {
    ...renderProps,
    lineHeight: 12,
  }
  paginated.sections[0].pages[0].fragments = [
    { nodeId: tableId, nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: rowId, nodeType: "flow-table-row", parentNodeId: tableId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: cellId, nodeType: "flow-table-cell", parentNodeId: rowId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
    textFragment("cell-p", "A", 72, {
      parentNodeId: cellId,
      width: 120,
      height: 24,
      isContinued: true,
      lineStart: 0,
      lineEnd: 2,
      renderProps: splitRenderProps,
      lines: [
        {
          text: "A",
          x: 36,
          y: 72,
          width: 8,
          height: 12,
          segments: [{ kind: "word", text: "A", start: 0, end: 1, x: 0, width: 8, breakableAfter: false }],
        },
        {
          text: "B",
          x: 36,
          y: 84,
          width: 8,
          height: 12,
          segments: [{ kind: "word", text: "B", start: 2, end: 3, x: 0, width: 8, breakableAfter: false }],
        },
      ],
    }),
  ]
  paginated.sections[0].pages[1].fragments = [
    { nodeId: tableId, nodeType: "flow-table", pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: rowId, nodeType: "flow-table-row", parentNodeId: tableId, pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: cellId, nodeType: "flow-table-cell", parentNodeId: rowId, pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
    textFragment("cell-p", "C", 72, {
      parentNodeId: cellId,
      pageIndex: 1,
      width: 120,
      height: 12,
      continuesFrom: true,
      lineStart: 2,
      lineEnd: 3,
      renderProps: splitRenderProps,
      lines: [{
        text: "C",
        x: 36,
        y: 72,
        width: 8,
        height: 12,
        segments: [{ kind: "word", text: "C", start: 4, end: 5, x: 0, width: 8, breakableAfter: false }],
      }],
    }),
  ]
  return paginated
}

interface RenderCanvasOptions {
  selectionAnchorNodeId?: string | null
  inlineEditVisualFresh?: boolean
  inlineEditNodeId?: string | null
  inlineEditCaretIndex?: number | null
  inlineEditPageIndex?: number | null
  inlineEditVisualLocked?: boolean
  wysiwygTextEngineEnabled?: boolean
  wysiwygTextDraftNodeId?: string | null
  wysiwygTextDraftText?: string | null
  wysiwygTextDraftParagraph?: ParagraphNode | null
  wysiwygTextDraftDirtyVersion?: number
  wysiwygTextCaretOffset?: number | null
  wysiwygTextDraftPaginationActive?: boolean
  marginEditMode?: { sectionIndex: number } | null
  headerFooterEditMode?: { sectionIndex: number; zone: "header" | "footer" } | null
  drag?: DragState | null
}

function renderCanvas(
  paginated: PaginatedDocument = makePaginated(),
  doc: DocumentNode = makeDoc(),
  selectedNodeId: string | null = null,
  options: RenderCanvasOptions = {},
): string {
  const noop = () => undefined
  return renderToStaticMarkup(createElement(EditorCanvas, {
    paginated,
    doc,
    drag: options.drag ?? null,
    resizeDrag: null,
    minHeightDrag: null,
    marginDrag: null,
    marginEditMode: options.marginEditMode ?? null,
    headerFooterEditMode: options.headerFooterEditMode ?? null,
    headerFooterReservedDrag: null,
    onMarginEditModeEnter: noop,
    onMarginEditModeExit: noop,
    onHeaderFooterEditModeEnter: noop,
    onHeaderFooterEditModeExit: noop,
    onHeaderFooterZonePointerDown: noop,
    onHeaderFooterReservedResizeStart: noop,
    scale: 1,
    selectedNodeId,
    selectionAnchorNodeId: options.selectionAnchorNodeId ?? selectedNodeId,
    isLayoutLoading: false,
    textMeasurer: defaultTextMeasurer,
    inlineEditVisualFresh: options.inlineEditVisualFresh ?? false,
    inlineEditNodeId: options.inlineEditNodeId ?? null,
    inlineEditCaretIndex: options.inlineEditCaretIndex ?? null,
    inlineEditPageIndex: options.inlineEditPageIndex ?? null,
    inlineEditVisualLocked: options.inlineEditVisualLocked ?? false,
    onInlineEditStart: noop,
    onInlineEditChange: noop,
    onInlineEditCaretChange: noop,
    onInlineEditUserInteraction: noop,
    onInlineEditHeightChange: noop,
    onInlineEditEnd: noop,
    onSplitParagraph: noop,
    onMergeParagraph: noop,
    setPageRef: noop,
    onNodePointerDown: noop,
    onBackgroundPointerDown: noop,
    onSelectContextNode: noop,
    onStartCloneDrag: noop,
    onDeleteNode: noop,
    onTableAction: noop,
    onResizeStart: noop,
    onTableColumnResizeStart: noop,
    onMinHeightResizeStart: noop,
    onMarginResizeStart: noop,
    onScaleChange: noop,
    autoFitScale: false,
    showTextSegments: false,
    showDrift: false,
    driftMap: null,
    wysiwygInlineEditEnabled: false,
    wysiwygTextEngineEnabled: options.wysiwygTextEngineEnabled ?? false,
    wysiwygTextDraftNodeId: options.wysiwygTextDraftNodeId ?? null,
    wysiwygTextDraftText: options.wysiwygTextDraftText ?? null,
    wysiwygTextDraftParagraph: options.wysiwygTextDraftParagraph ?? null,
    wysiwygTextDraftDirtyVersion: options.wysiwygTextDraftDirtyVersion ?? 0,
    wysiwygTextCaretOffset: options.wysiwygTextCaretOffset ?? null,
    wysiwygTextSelection: null,
    wysiwygTextDraftPaginationActive: options.wysiwygTextDraftPaginationActive ?? false,
    onWysiwygTextDraftChange: noop,
    onWysiwygTextReflowDecision: noop,
  }))
}

function headerFooterHitArea(markup: string, zone: "header" | "footer"): string {
  return markup.match(new RegExp(`<rect[^>]*data-testid="header-footer-zone-hit-area"[^>]*data-zone="${zone}"[^>]*>`))?.[0] ?? ""
}

function headerFooterResizeHandle(markup: string, zone: "header" | "footer"): string {
  return markup.match(new RegExp(`<rect[^>]*data-testid="header-footer-zone-resize-handle"[^>]*data-zone="${zone}"[^>]*>`))?.[0] ?? ""
}

function svgNumberAttr(markup: string, attr: string): number | null {
  const match = markup.match(new RegExp(`(?:^|\\s)${attr}="([^"]+)"`))
  return match ? Number(match[1]) : null
}

function canvasActionRailChrome(markup: string): string {
  return markup.match(/<g[^>]*data-testid="canvas-action-rail"[^>]*><rect[^>]*>/)?.[0] ?? ""
}

function canvasSelectedPathChrome(markup: string): string {
  return markup.match(/<g[^>]*data-testid="canvas-selected-path"[^>]*><rect[^>]*>/)?.[0] ?? ""
}

function marginDragHandle(markup: string, side: "top" | "right" | "bottom" | "left"): string {
  return markup.match(new RegExp(`<rect[^>]*data-testid="page-margin-drag-handle"[^>]*data-side="${side}"[^>]*>`))?.[0] ?? ""
}

describe("EditorCanvas page memoization", () => {
  it("scopes WYSIWYG draft prop changes to pages that render the edited paragraph", () => {
    const activePage = pageWithFragments(0, [textFragment("active-p", "Active", 72)])
    const otherPage = pageWithFragments(1, [textFragment("other-p", "Other", 72, { pageIndex: 1 })])
    const props = {
      inlineEditNodeId: "active-p",
      inlineEditPageIndex: 0,
      wysiwygTextDraftNodeId: "active-p",
      wysiwygDraftVisualPreview: null,
      wysiwygTableCellDraftVisualChromeByPageIndex: new Map<number, PageFragment[]>(),
      wysiwygTextPointerFragments: [],
    }

    expect(pageViewScopedEditPropsAffectPage(activePage, props)).toBe(true)
    expect(pageViewScopedEditPropsAffectPage(otherPage, props)).toBe(false)
  })

  it("keeps header/footer paragraph edits in the page render scope", () => {
    const activePage = pageWithFragments(0, [textFragment("body-p", "Body", 72)])
    activePage.headerFragments = [textFragment("header-p", "Header", 36)]
    const otherPage = pageWithFragments(1, [textFragment("other-p", "Other", 72, { pageIndex: 1 })])
    const props = {
      inlineEditNodeId: "header-p",
      inlineEditPageIndex: 0,
      wysiwygTextDraftNodeId: "header-p",
      wysiwygDraftVisualPreview: null,
      wysiwygTableCellDraftVisualChromeByPageIndex: new Map<number, PageFragment[]>(),
      wysiwygTextPointerFragments: [],
    }

    expect(pageViewScopedEditPropsAffectPage(activePage, props)).toBe(true)
    expect(pageViewScopedEditPropsAffectPage(otherPage, props)).toBe(false)
  })

  it("keeps visual draft preview pages in the WYSIWYG draft render scope", () => {
    const sourcePage = pageWithFragments(0, [textFragment("other-p", "Other", 72)])
    const previewFragment = textFragment("active-p", "Draft", 72, { pageIndex: 1, continuesFrom: true })
    const previewPage = pageWithFragments(1, [textFragment("other-page-p", "Other", 72, { pageIndex: 1 })])
    const props = {
      inlineEditNodeId: "active-p",
      inlineEditPageIndex: 0,
      wysiwygTextDraftNodeId: "active-p",
      wysiwygDraftVisualPreview: {
        nodeId: "active-p",
        fragments: [previewFragment],
        fragmentsByPageIndex: new Map([[1, previewFragment]]),
        caretPageIndex: 1,
      },
      wysiwygTableCellDraftVisualChromeByPageIndex: new Map<number, PageFragment[]>(),
      wysiwygTextPointerFragments: [],
    }

    expect(pageViewScopedEditPropsAffectPage(sourcePage, props)).toBe(true)
    expect(pageViewScopedEditPropsAffectPage(previewPage, props)).toBe(true)
  })
})

describe("EditorCanvas rich draft visual preview", () => {
  it("builds local preview lines from a dirty draft paragraph when text is unchanged", () => {
    const draftParagraph = {
      ...paragraphNode("body-p", "Body text"),
      children: [
        { id: "body-p-red", type: "text", text: "Body", style: { textColor: "DC2626", textDecoration: "underline" } },
        { id: "body-p-rest", type: "text", text: " text" },
      ],
    } as ParagraphNode

    const preview = buildWysiwygDraftVisualPreview({
      paginated: makePaginated(),
      doc: makeDoc(),
      nodeId: "body-p",
      draftText: "Body text",
      draftParagraph,
      caretOffset: 4,
      textMeasurer: defaultTextMeasurer,
    })
    const runs = preview?.fragments[0]?.lines?.flatMap((line) => line.runs ?? []) ?? []

    expect(runs.some((run) =>
      run.text === "Body" &&
      run.style.textColor === "DC2626" &&
      run.style.textDecoration === "underline",
    )).toBe(true)
  })

  it("renders a style-only rich draft through the local visual preview", () => {
    const draftParagraph = {
      ...paragraphNode("body-p", "Body text"),
      children: [
        { id: "body-p-red", type: "text", text: "Body", style: { textColor: "DC2626" } },
        { id: "body-p-rest", type: "text", text: " text" },
      ],
    } as ParagraphNode

    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      inlineEditNodeId: "body-p",
      inlineEditVisualFresh: true,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "body-p",
      wysiwygTextDraftText: "Body text",
      wysiwygTextDraftParagraph: draftParagraph,
      wysiwygTextDraftDirtyVersion: 1,
      wysiwygTextCaretOffset: 4,
    })

    expect(markup).toContain("fill=\"#DC2626\"")
    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
  })
})

describe("EditorCanvas fragment identity", () => {
  it("keys same-page inline paragraph slices by slice identity", () => {
    const firstSlice = textFragment("body-p", "A", 72, {
      isContinued: true,
      lineStart: 0,
      lineEnd: 1,
    })
    const secondSlice = textFragment("body-p", "B", 90, {
      continuesFrom: true,
      lineStart: 1,
      lineEnd: 2,
    })

    expect(buildEditorFragmentRenderKey(firstSlice, 0, true)).not.toBe(
      buildEditorFragmentRenderKey(secondSlice, 1, true),
    )
    expect(buildEditorFragmentRenderKey(firstSlice, 0, true)).toContain("inline-edit-paragraph-body-p-0-0-root")
    expect(buildEditorFragmentRenderKey(secondSlice, 1, true)).toContain("inline-edit-paragraph-body-p-0-1-root")
  })

  it("renders unique clip paths for same-page paragraph slices", () => {
    const paginated = makePaginated()
    const firstSlice = textFragment("body-p", "A", 72, {
      isContinued: true,
      lineStart: 0,
      lineEnd: 1,
      lines: [{
        text: "A",
        x: 36,
        y: 72,
        width: 8,
        height: 14,
        segments: [{ kind: "word", text: "A", start: 0, end: 1, x: 0, width: 8, breakableAfter: false }],
      }],
    })
    const secondSlice = textFragment("body-p", "B", 90, {
      continuesFrom: true,
      lineStart: 1,
      lineEnd: 2,
      lines: [{
        text: "B",
        x: 36,
        y: 90,
        width: 8,
        height: 14,
        segments: [{ kind: "word", text: "B", start: 2, end: 3, x: 0, width: 8, breakableAfter: false }],
      }],
    })
    paginated.sections[0].pages[0].fragments = [firstSlice, secondSlice]

    const markup = renderCanvas(paginated, makeDoc(), null, {
      inlineEditNodeId: "body-p",
      inlineEditPageIndex: 0,
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 2,
    })
    const clipPathIds = [...markup.matchAll(/<clipPath id="([^"]*body-p[^"]*)"/g)].map((match) => match[1])
    const activeInlineEditors = markup.match(/data-inline-edit-node-id="body-p"/g) ?? []

    expect(buildEditorFragmentClipPathId("0-0", firstSlice, 0)).not.toBe(
      buildEditorFragmentClipPathId("0-0", secondSlice, 1),
    )
    expect(new Set(clipPathIds).size).toBe(2)
    expect(activeInlineEditors).toHaveLength(1)
    expect(markup).toContain("data-inline-edit-slice-start=\"2\"")
  })

  it("does not label continuation paragraph fragments as separate paragraphs", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      textFragment("body-p", "A", 72, {
        isContinued: true,
        lineStart: 0,
        lineEnd: 1,
      }),
      textFragment("body-p", "B", 90, {
        continuesFrom: true,
        lineStart: 1,
        lineEnd: 2,
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc())
    const selectedMarkup = renderCanvas(paginated, makeDoc(), "body-p")
    const editingMarkup = renderCanvas(paginated, makeDoc(), null, {
      inlineEditNodeId: "body-p",
      inlineEditPageIndex: 0,
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 0,
    })

    expect(markup).not.toContain(">paragraph</text>")
    expect(selectedMarkup).not.toContain(">paragraph</text>")
    expect(editingMarkup).not.toContain(">paragraph</text>")
  })
})

describe("EditorCanvas page margin edit mode", () => {
  it("keeps page margin guides passive before edit mode is activated", () => {
    const markup = renderCanvas()

    expect(markup).toContain("data-testid=\"page-margin-guides\"")
    expect(markup).toContain("data-margin-edit-active=\"false\"")
    expect(markup).toContain("data-testid=\"page-margin-activation-band\"")
    expect(markup).toContain("data-testid=\"page-margin-guide-line\"")
    expect(markup).not.toContain("data-testid=\"page-margin-drag-handle\"")
    expect(markup).not.toContain("data-testid=\"page-margin-edit-content-overlay\"")
  })

  it("shows the page content overlay and drag handles in margin edit mode", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      marginEditMode: { sectionIndex: 0 },
    })

    expect(markup).toContain("data-margin-edit-active=\"true\"")
    expect(markup).toContain("data-testid=\"page-margin-edit-layer\"")
    expect(markup).toContain("data-testid=\"page-margin-edit-content-overlay\"")
    expect(markup).toContain("data-testid=\"page-margin-edit-outer-band\"")
    expect(markup).toContain("data-testid=\"page-margin-drag-handle\"")
    expect(markup).toContain("data-testid=\"page-margin-edit-line\"")
    expect(markup).not.toContain("data-testid=\"page-margin-activation-band\"")
  })

  it("keeps top and bottom margin handles on authored page margins when header/footer reserve body space", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0] = {
      ...paginated.sections[0].pages[0],
      contentBox: { x: 36, y: 108, width: 228, height: 184 },
      fragments: [textFragment("body-p", "Body text", 108)],
      headerFragments: [textFragment("header-p", "Header Preview", 72)],
      footerFragments: [textFragment("footer-p", "หน้า 7", 292)],
    }

    const markup = renderCanvas(paginated, makeDoc(), null, {
      marginEditMode: { sectionIndex: 0 },
    })

    expect(marginDragHandle(markup, "top")).toContain("y=\"65\"")
    expect(marginDragHandle(markup, "bottom")).toContain("y=\"321\"")
    expect(markup).toContain("data-testid=\"page-margin-edit-content-overlay\" x=\"36\" y=\"72\" width=\"228\" height=\"256\"")
  })
})

describe("EditorCanvas canvas selection path", () => {
  it("renders divider and page-break authoring fragments", () => {
    const markup = renderCanvas(
      makeDividerPageBreakPaginated(),
      makeDividerPageBreakDoc(),
      "page-break-1",
    )

    expect(markup).toContain("data-testid=\"editor-divider-line\"")
    expect(markup).toContain("stroke=\"#334155\"")
    expect(markup).toContain("data-testid=\"editor-page-break-marker\"")
    expect(markup).toContain(">PAGE BREAK</text>")
    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
  })

  it("shows a blocked drop area below a page-break marker on the same page", () => {
    const drag: DragState = {
      source: { source: "palette", blockType: "paragraph" },
      clientX: 0,
      clientY: 0,
      preview: {
        hoverNodeId: "page-break-1",
        zone: "bottom",
        target: { kind: "node", nodeId: "page-break-1", nodeType: "page-break" },
        placement: null,
        isValid: false,
      },
    }
    const markup = renderCanvas(
      makeDividerPageBreakPaginated(),
      makeDividerPageBreakDoc(),
      null,
      { drag },
    )

    expect(markup).toContain("data-testid=\"drop-highlight-page-break-blocked\"")
    expect(markup).toContain("Starts on next page")
    expect(markup).toContain("stroke=\"#dc2626\"")
  })

  it("renders a clickable selected path from the stored selection context", () => {
    const markup = renderCanvas(makeFlowPaginated(), makeFlowDoc(), "body-p")

    expect(markup).toContain("data-testid=\"canvas-selected-path\"")
    expect(markup).toContain("data-testid=\"canvas-path-item\"")
    expect(markup).toContain(">ROW</text>")
    expect(markup).toContain(">STACK</text>")
    expect(markup).toContain(">PARAGRAPH</text>")
    expect(markup).toContain("data-node-id=\"body-p\"")
    expect(markup).toContain("data-active=\"true\"")
  })

  it("keeps the paragraph anchor visible when the selected node is its table cell parent", () => {
    const markup = renderCanvas(makeTableCellPaginated(), makeTableCellDoc(), "tc1", {
      selectionAnchorNodeId: "cell-p",
    })

    expect(markup).toContain("data-testid=\"canvas-selected-path\"")
    expect(markup).toContain(">TABLE</text>")
    expect(markup).toContain(">ROW</text>")
    expect(markup).toContain(">CELL</text>")
    expect(markup).toContain(">PARAGRAPH</text>")
    expect(markup).toContain("data-node-id=\"tc1\"")
    expect(markup).toContain("data-active=\"true\"")
    expect(markup).toContain("data-node-id=\"cell-p\"")
  })

  it("renders a selected action rail for section layout nodes", () => {
    const markup = renderCanvas(makeFlowPaginated(), makeFlowDoc(), "body-p")

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-drag\"")
    expect(markup).toContain("data-testid=\"canvas-action-clone-drag\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete\"")
    expect(markup).toContain("aria-label=\"Drag copy\"")
    expect(markup).toContain("aria-label=\"Delete block\"")
  })

  it("renders a drag handle for selected flow-stack columns", () => {
    const markup = renderCanvas(makeFlowPaginated(), makeFlowDoc(), "fs1")

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-drag\"")
  })

  it("renders table-scope add row and add column actions for selected flow tables", () => {
    const markup = renderCanvas(makeTableCellPaginated(), makeTableCellDoc(), "tbl1")

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-add-column\"")
    expect(markup).toContain("data-testid=\"canvas-action-add-row\"")
    expect(markup).toContain("data-testid=\"canvas-action-drag\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete-table\"")
    expect(markup).toContain("aria-label=\"Add table column\"")
    expect(markup).toContain("aria-label=\"Add table row\"")
    expect(markup).toContain("aria-label=\"Delete table\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-clone-drag\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-delete\"")
  })

  it("renders row-scope add row action for selected flow-table rows", () => {
    const markup = renderCanvas(makeTwoRowTableCellPaginated(), makeTwoRowTableCellDoc(), "tr1", {
      selectionAnchorNodeId: "cell-p",
    })

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-add-row\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete-row\"")
    expect(markup).toContain("aria-label=\"Delete table row\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-add-column\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-clone-drag\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-delete\"")
  })

  it("renders cell-scope add column action for selected flow-table cells", () => {
    const markup = renderCanvas(
      makeTwoColumnTableCellPaginated(),
      makeTwoColumnTableCellDoc(),
      "tc1",
    )

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-add-column\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete-column\"")
    expect(markup).toContain("aria-label=\"Delete table column\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-add-row\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-clone-drag\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-delete\"")
  })

  it("keeps the selected action rail available while inline editing", () => {
    const markup = renderCanvas(makeFlowPaginated(), makeFlowDoc(), "body-p", {
      inlineEditNodeId: "body-p",
      inlineEditPageIndex: 0,
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 0,
    })

    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-clone-drag\"")
  })
})

describe("EditorCanvas header/footer zones", () => {
  it("freezes active header/footer edit visual offset while the zone scroll changes", () => {
    expect(resolveInlineEditVisualOffsetY({
      isInlineEditing: true,
      storedVisualOffsetY: -18,
      currentVisualOffsetY: -42,
    })).toBe(-18)

    expect(resolveInlineEditVisualOffsetY({
      isInlineEditing: false,
      storedVisualOffsetY: -18,
      currentVisualOffsetY: -42,
    })).toBe(-42)
  })

  it("renders header and footer text as read-only preview content", () => {
    const markup = renderCanvas()

    expect(markup).toContain("data-testid=\"editor-zone-fragment\"")
    expect(markup).toContain("data-zone=\"header\"")
    expect(markup).toContain("data-zone=\"footer\"")
    expect(markup).toContain("Header Preview")
    expect(markup).toContain("หน้า 7")
    expect(markup).toContain("pointer-events:none")
  })

  it("renders header and footer preview chrome without colored zone fills", () => {
    const passiveMarkup = renderCanvas()
    const activeMarkup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(passiveMarkup).not.toContain("#fef9c3")
    expect(passiveMarkup).not.toContain("#fce7f3")
    expect(activeMarkup).not.toContain("#e0f2fe")
  })

  it("renders passive header and footer activation zones", () => {
    const markup = renderCanvas()

    expect(markup).toContain("data-testid=\"header-footer-zone-layer\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-hit-area\"")
    expect(markup).toContain("data-zone=\"header\"")
    expect(markup).toContain("data-zone=\"footer\"")
    expect(markup).toContain("data-active=\"false\"")
  })

  it("uses the section header/footer horizontal mode for activation zones", () => {
    const doc = makeDoc()
    doc.document.sections[0].page.headerFooterHorizontalMode = "full"
    const markup = renderCanvas(makePaginated(), doc)
    const headerHitArea = headerFooterHitArea(markup, "header")
    const footerHitArea = headerFooterHitArea(markup, "footer")

    expect(headerHitArea).toContain("x=\"0\"")
    expect(headerHitArea).toContain("width=\"300\"")
    expect(footerHitArea).toContain("x=\"0\"")
    expect(footerHitArea).toContain("width=\"300\"")
  })

  it("shows a body exit overlay and suppresses margin activation while header/footer mode is active", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(markup).toContain("data-testid=\"header-footer-body-exit-overlay\"")
    expect(markup).toContain("data-active=\"true\"")
    expect(markup).toContain(">HEADER</text>")
    expect(markup).not.toContain("data-testid=\"page-margin-activation-band\"")
  })

  it("shows a reserved-height resize handle for the active header/footer zone only", () => {
    const passiveMarkup = renderCanvas()
    const activeMarkup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(passiveMarkup).not.toContain("data-testid=\"header-footer-zone-resize-handle\"")
    expect(activeMarkup).toContain("data-testid=\"header-footer-zone-resize-handle\"")
    expect(activeMarkup).toContain("data-zone=\"header\"")
    expect(activeMarkup).toContain("cursor:ns-resize")
  })

  it("keeps the active footer resize hit area above the footer content zone", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "footer" },
    })
    const footerHitArea = headerFooterHitArea(markup, "footer")
    const footerResizeHandle = headerFooterResizeHandle(markup, "footer")
    const footerZoneY = svgNumberAttr(footerHitArea, "y")
    const handleY = svgNumberAttr(footerResizeHandle, "y")
    const handleHeight = svgNumberAttr(footerResizeHandle, "height")

    expect(footerZoneY).not.toBeNull()
    expect(handleY).not.toBeNull()
    expect(handleHeight).not.toBeNull()
    expect((handleY ?? 0) + (handleHeight ?? 0)).toBeLessThanOrEqual(footerZoneY ?? 0)
  })

  it("marks active header paragraph fragments as editable zone content", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(markup).toContain("data-zone-editable=\"true\"")
    expect(markup).toContain("data-node-id=\"header-p\"")
  })

  it("renders selected path and delete rail for an active header paragraph", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), "header-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(markup).toContain("data-testid=\"canvas-selected-path\"")
    expect(markup.match(/data-testid="canvas-path-item"/g)).toHaveLength(2)
    expect(markup).toContain(">HEADER</text>")
    expect(markup).toContain(">PARAGRAPH</text>")
    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-drag\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-clone-drag\"")
  })

  it("keeps header selection path pinned to the top edge when there is no room above", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].headerFragments = [
      textFragment("header-p", "Header Preview", 0, { height: 80 }),
    ]

    const markup = renderCanvas(paginated, makeDoc(), "header-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })
    const pathY = svgNumberAttr(canvasSelectedPathChrome(markup), "y")

    expect(pathY).toBe(4)
  })

  it("keeps full-width header action rail outside the page instead of over content", () => {
    const doc = makeDoc()
    doc.document.sections[0].page.headerFooterHorizontalMode = "full"
    const paginated = makePaginated()
    paginated.sections[0].pages[0].headerFragments = [
      textFragment("header-p", "Header Preview", 36, { x: 0, width: 300 }),
    ]

    const markup = renderCanvas(paginated, doc, "header-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })
    const actionRailX = svgNumberAttr(canvasActionRailChrome(markup), "x")

    expect(actionRailX).not.toBeNull()
    expect(actionRailX ?? 0).toBeLessThan(0)
  })

  it("anchors active header selection chrome to the inline edit page when the header repeats", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages.push({
      ...paginated.sections[0].pages[0],
      index: 1,
      fragments: [textFragment("body-p", "Body text", 72, { pageIndex: 1 })],
      headerFragments: [textFragment("header-p", "Header Preview", 36, { pageIndex: 1 })],
      footerFragments: [textFragment("footer-p", "หน้า 8", 340, { pageIndex: 1 })],
    })

    const markup = renderCanvas(paginated, makeDoc(), "header-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
      inlineEditNodeId: "header-p",
      inlineEditPageIndex: 0,
    })

    expect(markup.match(/data-testid="canvas-selected-path"/g)).toHaveLength(1)
    expect(markup.match(/data-testid="canvas-action-rail"/g)).toHaveLength(1)
  })

  it("renders selected path and delete rail for an active footer paragraph", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), "footer-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "footer" },
    })

    expect(markup).toContain("data-testid=\"canvas-selected-path\"")
    expect(markup.match(/data-testid="canvas-path-item"/g)).toHaveLength(2)
    expect(markup).toContain(">FOOTER</text>")
    expect(markup).toContain(">PARAGRAPH</text>")
    expect(markup).toContain("data-testid=\"canvas-action-rail\"")
    expect(markup).toContain("data-testid=\"canvas-action-delete\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-drag\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-clone-drag\"")
  })

  it("keeps body selection path and rail suppressed while header/footer mode is active", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), "body-p", {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(markup).not.toContain("data-testid=\"canvas-selected-path\"")
    expect(markup).not.toContain("data-testid=\"canvas-action-rail\"")
  })

  it("clips overflowing active header content and marks the reserved-height boundary", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].headerFragments = [
      textFragment("header-p", "Tall header", 72, {
        height: 64,
        lines: [
          { text: "Tall", x: 36, y: 72, width: 40, height: 14 },
          { text: "header", x: 36, y: 122, width: 54, height: 14 },
        ],
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
    })

    expect(markup).toContain("data-testid=\"header-footer-zone-clip\"")
    expect(markup).toContain("data-zone=\"header\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-overflow-marker\"")
    expect(markup).toContain("data-edge=\"bottom\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-scroll-indicator\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-scroll-rail\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-scroll-track\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-scroll-thumb\"")
    expect(markup).toContain("data-testid=\"header-footer-zone-scroll-hit-area\"")
    expect(markup).toContain("data-overflow-pt=\"28\"")
    expect(markup).toContain("data-hidden-pt=\"28\"")
    expect(markup).toContain("data-scroll-pt=\"0\"")
    expect(markup).toContain("cursor:ns-resize")
    expect(markup).toContain("clip-path=\"url(#0-0-header-footer-header-zone-clip)\"")
  })

  it("suspends header overflow scroll controls while editing a header paragraph", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].headerFragments = [
      textFragment("header-p", "Tall header", 72, {
        height: 64,
        lines: [
          { text: "Tall", x: 36, y: 72, width: 40, height: 14 },
          { text: "header", x: 36, y: 122, width: 54, height: 14 },
        ],
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
      inlineEditNodeId: "header-p",
      inlineEditPageIndex: 0,
      inlineEditVisualFresh: true,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "header-p",
      wysiwygTextDraftText: "Tall header",
    })

    expect(markup).toContain("data-testid=\"header-footer-zone-overflow-marker\"")
    expect(markup).not.toContain("data-testid=\"header-footer-zone-scroll-indicator\"")
    expect(markup).not.toContain("data-testid=\"header-footer-zone-scroll-hit-area\"")
    expect(markup).toContain("data-inline-edit-node-id=\"header-p\"")
  })

  it("renders an inline editor for the active header paragraph fragment", () => {
    const markup = renderCanvas(makePaginated(), makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
      inlineEditNodeId: "header-p",
      inlineEditPageIndex: 0,
      inlineEditVisualFresh: true,
      wysiwygTextEngineEnabled: true,
    })

    expect(markup).toContain("data-zone-editable=\"true\"")
    expect(markup).toContain("data-inline-edit-node-id=\"header-p\"")
    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
  })

  it("shows a container drop line inside the active header/footer root stack", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].headerFragments = [
      { nodeId: "header-root", nodeType: "stack", pageIndex: 0, x: 36, y: 36, width: 228, height: 16 },
      textFragment("header-p", "Header Preview", 36, { parentNodeId: "header-root" }),
    ]
    const rootTarget = { kind: "node" as const, nodeId: "header-root", nodeType: "stack" as const }
    const drag: DragState = {
      source: { source: "palette", blockType: "paragraph" },
      clientX: 0,
      clientY: 0,
      preview: {
        hoverNodeId: "header-root",
        zone: "center",
        target: rootTarget,
        placement: {
          zone: "center",
          intent: "insertInside",
          target: rootTarget,
          targetNodeId: "header-root",
          parentNodeId: "header-root",
          targetParentType: "stack",
        },
        isValid: true,
      },
    }

    const markup = renderCanvas(paginated, makeDoc(), null, {
      headerFooterEditMode: { sectionIndex: 0, zone: "header" },
      drag,
    })

    expect(markup).toContain("data-testid=\"drop-highlight-container-insert\"")
    expect(markup).toContain("fill=\"#0d9488\"")
  })
})

describe("EditorCanvas flow-row / flow-stack static preview", () => {
  it("renders flow-row and flow-stack fragments as selectable static fragments", () => {
    const markup = renderCanvas(makeFlowPaginated(), makeFlowDoc())

    expect(markup).toContain("data-node-type=\"flow-row\"")
    expect(markup).toContain("data-node-type=\"flow-stack\"")
    expect(markup).toContain("data-flow-stack-box=\"true\"")
    expect(markup).toContain("flow-row")
    expect(markup).toContain("flow-stack")
  })

  it("renders a pair resize handle between flow-stacks", () => {
    const markup = renderCanvas(makeTwoStackFlowPaginated(), makeTwoStackFlowDoc())

    expect(markup).toContain("data-testid=\"column-resize-handle\"")
    expect(markup).toContain("data-row-type=\"flow-row\"")
    expect(markup).toContain("data-left-stack-id=\"fs1\"")
    expect(markup).toContain("data-right-stack-id=\"fs2\"")
  })

  it("does not synthesize body-style split previews for flow-stack paragraphs", () => {
    const preview = buildWysiwygDraftVisualPreview({
      paginated: makeFlowPaginated(),
      doc: makeFlowDoc(),
      nodeId: "body-p",
      draftText: `${"Flow stack text ".repeat(80)}`,
      caretOffset: null,
      textMeasurer: defaultTextMeasurer,
    })

    expect(preview).toBeNull()
  })
})

describe("EditorCanvas table-cell WYSIWYG draft visual preview", () => {
  it("allows table-cell paragraphs to enter inline edit from a single click action", () => {
    expect(shouldStartInlineEditOnSingleClick({
      canInlineEditParagraph: true,
      isTableCellParagraph: true,
    })).toBe(true)
  })

  it("keeps table and row structure chrome invisible while cell hit chrome has no node-color fill", () => {
    const markup = renderCanvas(makeTableCellPaginated("flow-table"), makeFlowTableCellDoc())
    const structureGroups = markup.match(/<g[^>]*data-table-structure-chrome="true"[\s\S]*?<\/g>/g) ?? []
    const cellGroup = markup.match(/<g[^>]*data-node-type="flow-table-cell"[^>]*>[\s\S]*?<\/g>/)?.[0] ?? ""

    expect(structureGroups).toHaveLength(2)
    expect(structureGroups.every((group) => group.includes("fill=\"transparent\""))).toBe(true)
    expect(structureGroups.every((group) => group.includes("stroke=\"transparent\""))).toBe(true)
    expect(structureGroups.every((group) => group.includes("opacity=\"0\""))).toBe(true)
    expect(markup).toContain("data-node-type=\"flow-table-cell\"")
    expect(cellGroup).toContain("fill=\"transparent\"")
    expect(markup).not.toContain("fill=\"#fef9c3\"")
  })

  it("renders an internal table column resize handle for a selected table cell", () => {
    const markup = renderCanvas(
      makeTwoColumnTableCellPaginated(),
      makeTwoColumnTableCellDoc(),
      "tc1",
    )

    expect(markup).toContain("data-testid=\"table-column-resize-handle\"")
    expect(markup).toContain("data-table-id=\"tbl1\"")
    expect(markup).toContain("data-left-col-index=\"0\"")
  })

  it("renders an internal table column resize handle for a selected flow-table cell", () => {
    const markup = renderCanvas(
      makeTwoColumnTableCellPaginated("flow-table"),
      makeTwoColumnTableCellDoc("flow-table"),
      "ftc1",
    )

    expect(markup).toContain("data-testid=\"table-column-resize-handle\"")
    expect(markup).toContain("data-table-id=\"ft1\"")
    expect(markup).toContain("data-left-col-index=\"0\"")
  })

  it("builds a conservative table-cell continuation preview before settled draft pagination", () => {
    const paginated = makeTableCellPaginated()
    const preview = buildWysiwygDraftVisualPreview({
      paginated,
      doc: makeTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB\nC",
      caretOffset: 5,
      textMeasurer: defaultTextMeasurer,
    })

    expect(preview?.fragments).toHaveLength(2)
    expect(preview?.fragments[0]).toMatchObject({
      nodeId: "cell-p",
      parentNodeId: "tc1",
      pageIndex: 0,
      lineStart: 0,
      continuesFrom: false,
      isContinued: true,
    })
    expect(preview?.fragments[1]).toMatchObject({
      nodeId: "cell-p",
      parentNodeId: "tc1",
      pageIndex: 1,
      y: 72,
      continuesFrom: true,
      isContinued: false,
    })
    expect(preview?.fragments[0].lines?.map((line) => line.text)).toEqual(["A", "B"])
    expect(preview?.fragments[1].lines?.map((line) => line.text)).toEqual(["C"])
    expect(preview?.caretPageIndex).toBe(1)

    const chromeByPage = buildWysiwygTableCellDraftVisualChromeFragments({ paginated, preview })
    const sourceChrome = chromeByPage.get(0) ?? []
    expect(sourceChrome.map((fragment) => fragment.nodeType)).toEqual(["flow-table", "flow-table-row", "flow-table-cell"])
    expect(sourceChrome.every((fragment) => fragment.continuesFrom === false)).toBe(true)
    expect(sourceChrome.every((fragment) => fragment.isContinued)).toBe(true)

    const chrome = chromeByPage.get(1) ?? []
    expect(chrome.map((fragment) => fragment.nodeType)).toEqual(["flow-table", "flow-table-row", "flow-table-cell"])
    expect(chrome.every((fragment) => fragment.continuesFrom)).toBe(true)
    expect(chrome.every((fragment) => fragment.height === preview?.fragments[1].height)).toBe(true)
  })

  it("extends source-page table-cell chrome to the split slice height", () => {
    const paginated = makeTableCellPaginated()
    for (const fragment of paginated.sections[0].pages[0].fragments) {
      if (fragment.nodeType === "flow-table" || fragment.nodeType === "flow-table-row" || fragment.nodeType === "flow-table-cell") {
        fragment.height = 12
      }
    }

    const preview = buildWysiwygDraftVisualPreview({
      paginated,
      doc: makeTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB\nC",
      caretOffset: 5,
      textMeasurer: defaultTextMeasurer,
    })
    const sourceChrome = buildWysiwygTableCellDraftVisualChromeFragments({ paginated, preview }).get(0) ?? []
    const sourceTable = sourceChrome.find((fragment) => fragment.nodeType === "flow-table")
    const sourceRow = sourceChrome.find((fragment) => fragment.nodeType === "flow-table-row")
    const sourceCell = sourceChrome.find((fragment) => fragment.nodeType === "flow-table-cell")

    expect(sourceRow?.height).toBe(28)
    expect(sourceCell?.height).toBe(28)
    expect(sourceTable?.height).toBe(28)
  })

  it("builds the same conservative preview for flow-table-cell paragraphs", () => {
    const paginated = makeTableCellPaginated("flow-table")
    const preview = buildWysiwygDraftVisualPreview({
      paginated,
      doc: makeFlowTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB\nC",
      caretOffset: 5,
      textMeasurer: defaultTextMeasurer,
    })

    expect(preview?.fragments).toHaveLength(2)
    expect(preview?.fragments[0].parentNodeId).toBe("ftc1")
    expect(preview?.fragments[1]).toMatchObject({
      parentNodeId: "ftc1",
      pageIndex: 1,
      continuesFrom: true,
    })

    const chrome = buildWysiwygTableCellDraftVisualChromeFragments({ paginated, preview }).get(1) ?? []
    expect(chrome.map((fragment) => fragment.nodeType)).toEqual(["flow-table", "flow-table-row", "flow-table-cell"])
  })

  it("preserves colspan-only flow-table cell width in visual chrome", () => {
    const paginated = makeTableCellPaginated("flow-table")
    for (const page of paginated.sections[0].pages) {
      for (const fragment of page.fragments) {
        if (fragment.nodeId === "ft1" || fragment.nodeId === "ftr1" || fragment.nodeId === "ftc1") {
          fragment.width = 200
        }
        if (fragment.nodeId === "ftc1" && fragment.nodeType === "flow-table-cell") {
          fragment.flowTableCellGridProps = { columnIndex: 0, colspan: 2, rowspan: 1 }
        }
      }
    }
    const preview = buildWysiwygDraftVisualPreview({
      paginated,
      doc: makeFlowTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB\nC",
      caretOffset: 5,
      textMeasurer: defaultTextMeasurer,
    })
    const chrome = buildWysiwygTableCellDraftVisualChromeFragments({ paginated, preview }).get(1) ?? []
    const cellChrome = chrome.find((fragment) => fragment.nodeId === "ftc1")

    expect(cellChrome).toMatchObject({
      nodeType: "flow-table-cell",
      width: 200,
      flowTableCellGridProps: { columnIndex: 0, colspan: 2, rowspan: 1 },
    })
  })

  it("does not synthesize same-page or already-settled table-cell previews", () => {
    expect(buildWysiwygDraftVisualPreview({
      paginated: makeTableCellPaginated(),
      doc: makeTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB",
      caretOffset: 3,
      textMeasurer: defaultTextMeasurer,
    })).toBeNull()

    expect(buildWysiwygDraftVisualPreview({
      paginated: makeTableCellPaginated(),
      doc: makeTableCellDoc(),
      nodeId: "cell-p",
      draftText: "A\nB\nC",
      caretOffset: 5,
      textMeasurer: defaultTextMeasurer,
      draftPaginationActive: true,
    })).toBeNull()
  })

  it("renders the table-cell continuation preview through the editor canvas", () => {
    const markup = renderCanvas(makeTableCellPaginated(), makeTableCellDoc(), null, {
      inlineEditNodeId: "cell-p",
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 5,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "cell-p",
      wysiwygTextDraftText: "A\nB\nC",
      wysiwygTextCaretOffset: 5,
    })

    expect(markup).toContain("data-page-index=\"1\"")
    expect(markup.match(/data-wysiwyg-table-cell-visual-chrome="true"/g)).toHaveLength(6)
    expect(markup.match(/data-wysiwyg-table-cell-structure-chrome="true"/g)).toHaveLength(4)
    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).toContain("data-wysiwyg-reflow-kind=\"soft\"")
    expect(markup).toContain(">C</text>")
    expect(markup).not.toContain("<textarea")
  })

  it("keeps the active editor on the committed page while preview pagination is visually locked", () => {
    const markup = renderCanvas(makeTableCellPaginated(), makeTableCellDoc(), null, {
      inlineEditNodeId: "cell-p",
      inlineEditVisualFresh: false,
      inlineEditVisualLocked: true,
      inlineEditCaretIndex: 5,
      inlineEditPageIndex: 0,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "cell-p",
      wysiwygTextDraftText: "A\nB\nC",
      wysiwygTextCaretOffset: 5,
    })

    expect(markup.match(/data-inline-edit-node-id="cell-p"/g)).toHaveLength(1)
    expect(markup).toContain("data-inline-edit-visual-mode=\"textarea\"")
    expect(markup).toContain("data-inline-edit-slice-start=\"0\"")
    expect(markup).not.toContain("data-inline-edit-slice-start=\"4\"")
    expect(markup).toContain(">C</text>")
  })

  it("stops rendering the table-cell continuation preview once draft pagination is active", () => {
    const markup = renderCanvas(makeTableCellPaginated(), makeTableCellDoc(), null, {
      inlineEditNodeId: "cell-p",
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 5,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "cell-p",
      wysiwygTextDraftText: "A\nB\nC",
      wysiwygTextCaretOffset: 5,
      wysiwygTextDraftPaginationActive: true,
    })

    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-table-cell-visual-chrome")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
    expect(markup).not.toContain(">C</text>")
    expect(markup).not.toContain("<textarea")
  })

  it("uses settled split table-cell fragments when editing a continuation page", () => {
    const markup = renderCanvas(makeSplitTableCellPaginated(), makeTableCellDoc("A\nB\nC"), null, {
      inlineEditNodeId: "cell-p",
      inlineEditVisualFresh: true,
      inlineEditCaretIndex: 5,
      inlineEditPageIndex: 1,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftNodeId: "cell-p",
      wysiwygTextDraftText: "A\nB\nC",
      wysiwygTextCaretOffset: 5,
      wysiwygTextDraftPaginationActive: true,
    })

    expect(markup.match(/data-wysiwyg-text-engine-layer="true"/g)).toHaveLength(1)
    expect(markup).toContain("data-wysiwyg-pointer-fragment-count=\"2\"")
    expect(markup).toContain("data-page-index=\"1\"")
    expect(markup).toContain("data-line-start=\"2\"")
    expect(markup).toContain(">C</text>")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
    expect(markup).not.toContain("<textarea")
  })
})

describe("EditorCanvas paragraph box preview", () => {
  const boxedRenderProps: ParagraphRenderProps = {
    ...renderProps,
    spacingBefore: 3,
    spacingAfter: 5,
    box: {
      fill: "E0F2FE",
      padding: { top: 4, right: 6, bottom: 8, left: 10 },
      border: {
        top: { style: "solid", width: 2, color: "EF4444" },
        right: { style: "dashed", width: 2, color: "16A34A" },
        bottom: { style: "dotted", width: 2, color: "2563EB" },
        left: { style: "solid", width: 2, color: "111827" },
      },
    },
  }

  it("renders authored paragraph box fill and borders from paginated metadata", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      textFragment("body-p", "Body text", 72, {
        height: 40,
        renderProps: boxedRenderProps,
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc())

    expect(markup).toContain("data-paragraph-box=\"true\"")
    expect(markup).toContain("data-paragraph-box-fill=\"true\"")
    expect(markup).toContain("x=\"36\" y=\"75\" width=\"228\" height=\"32\" fill=\"#E0F2FE\"")
    expect(markup).toContain("data-paragraph-box-side=\"top\"")
    expect(markup).toContain("stroke=\"#EF4444\"")
    expect(markup).toContain("data-paragraph-box-side=\"right\"")
    expect(markup).toContain("stroke=\"#16A34A\"")
    expect(markup).toContain("stroke-dasharray=\"6 4\"")
    expect(markup).toContain("data-paragraph-box-side=\"bottom\"")
    expect(markup).toContain("stroke=\"#2563EB\"")
    expect(markup).toContain("stroke-linecap=\"round\"")
    expect(markup).toContain("data-paragraph-box-side=\"left\"")
    expect(markup).toContain("stroke=\"#111827\"")
  })

  it("does not paint editor paragraph chrome beyond authored paragraph boxes", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      textFragment("body-p", "Body text", 72, {
        height: 40,
        renderProps: boxedRenderProps,
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc())

    expect(markup).toContain("x=\"36\" y=\"69\" width=\"228\" height=\"46\" fill=\"transparent\" stroke=\"transparent\"")
    expect(markup).toContain("x=\"36\" y=\"75\" width=\"228\" height=\"32\" fill=\"#E0F2FE\"")
  })

  it("keeps middle split paragraph box fragments open at the top and bottom", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      textFragment("body-p", "Body text", 72, {
        height: 40,
        continuesFrom: true,
        isContinued: true,
        renderProps: boxedRenderProps,
      }),
    ]

    const markup = renderCanvas(paginated, makeDoc())

    expect(markup).toContain("data-paragraph-box-side=\"left\"")
    expect(markup).toContain("data-paragraph-box-side=\"right\"")
    expect(markup).not.toContain("data-paragraph-box-side=\"top\"")
    expect(markup).not.toContain("data-paragraph-box-side=\"bottom\"")
  })

  it("renders authored flow-table cell box fill and borders from paginated metadata", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      {
        nodeId: "ft1",
        nodeType: "flow-table",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 120,
        height: 44,
      },
      {
        nodeId: "ftr1",
        nodeType: "flow-table-row",
        parentNodeId: "ft1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 120,
        height: 44,
      },
      {
        nodeId: "ftc1",
        nodeType: "flow-table-cell",
        parentNodeId: "ftr1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 120,
        height: 44,
        boxRenderProps: {
          fill: "FEF3C7",
          padding: { top: 4, right: 6, bottom: 8, left: 10 },
          border: {
            top: { style: "solid", width: 2, color: "DC2626" },
            right: { style: "dashed", width: 2, color: "16A34A" },
            bottom: { style: "solid", width: 2, color: "2563EB" },
            left: { style: "solid", width: 2, color: "111827" },
          },
        },
      },
    ]

    const markup = renderCanvas(paginated, makeDoc())

    expect(markup).toContain("data-flow-table-cell-box=\"true\"")
    expect(markup).toContain("x=\"36\" y=\"72\" width=\"120\" height=\"44\" fill=\"#FEF3C7\"")
    expect(markup).toContain("data-paragraph-box-side=\"top\"")
    expect(markup).toContain("stroke=\"#DC2626\"")
    expect(markup).toContain("data-paragraph-box-side=\"right\"")
    expect(markup).toContain("stroke=\"#16A34A\"")
    expect(markup).toContain("stroke-dasharray=\"6 4\"")
    expect(markup).toContain("data-paragraph-box-side=\"bottom\"")
    expect(markup).toContain("stroke=\"#2563EB\"")
    expect(markup).toContain("data-paragraph-box-side=\"left\"")
    expect(markup).toContain("stroke=\"#111827\"")
    expect(markup).toContain("x=\"36\" y=\"72\" width=\"120\" height=\"44\" fill=\"transparent\" stroke=\"transparent\"")
  })

  it("keeps authored split flow-table cell bottom border on every visual page slice", () => {
    const boxRenderProps: NonNullable<PageFragment["boxRenderProps"]> = {
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      border: {
        top: { style: "solid", width: 1, color: "000000" },
        right: { style: "solid", width: 1, color: "000000" },
        bottom: { style: "solid", width: 1, color: "000000" },
        left: { style: "solid", width: 1, color: "000000" },
      },
    }
    const sourceFragment: PageFragment = {
      nodeId: "ftc1",
      nodeType: "flow-table-cell",
      parentNodeId: "ftr1",
      pageIndex: 0,
      x: 36,
      y: 72,
      width: 120,
      height: 42,
      boxRenderProps,
      continuesFrom: false,
      isContinued: true,
    }
    const finalFragment: PageFragment = {
      ...sourceFragment,
      pageIndex: 1,
      y: 72,
      height: 18,
      continuesFrom: true,
      isContinued: false,
    }

    const sourceBorders = resolveFragmentBoxLayoutPrimitives(sourceFragment)?.borders.map((border) => border.side).sort()
    const finalBorders = resolveFragmentBoxLayoutPrimitives(finalFragment)?.borders.map((border) => border.side).sort()

    expect(sourceBorders).toEqual(["bottom", "left", "right", "top"])
    expect(finalBorders).toEqual(["bottom", "left", "right"])
  })

  it("keeps flow-table row fragments pointer-transparent so cells own merged hit areas", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      {
        nodeId: "ft1",
        nodeType: "flow-table",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 180,
        height: 88,
      },
      {
        nodeId: "ftr1",
        nodeType: "flow-table-row",
        parentNodeId: "ft1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 180,
        height: 44,
      },
      {
        nodeId: "ftc-merged",
        nodeType: "flow-table-cell",
        parentNodeId: "ftr1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 90,
        height: 88,
      },
      {
        nodeId: "ftr2",
        nodeType: "flow-table-row",
        parentNodeId: "ft1",
        pageIndex: 0,
        x: 36,
        y: 116,
        width: 180,
        height: 44,
      },
      {
        nodeId: "ftc-right",
        nodeType: "flow-table-cell",
        parentNodeId: "ftr2",
        pageIndex: 0,
        x: 126,
        y: 116,
        width: 90,
        height: 44,
      },
    ]

    const markup = renderCanvas(paginated, makeDoc(), "ftr2")
    const rowGroup = markup.match(/<g[^>]*data-node-id="ftr2"[^>]*data-node-type="flow-table-row"[^>]*>/)?.[0] ?? ""
    const mergedCellGroup = markup.match(/<g[^>]*data-node-id="ftc-merged"[^>]*data-node-type="flow-table-cell"[^>]*>/)?.[0] ?? ""

    expect(rowGroup).toContain("pointer-events:none")
    expect(markup).not.toContain(">flow row</text>")
    expect(markup).not.toContain("stroke=\"#2563eb\"")
    expect(mergedCellGroup).not.toContain("pointer-events:none")
  })

  it("renders flow-table rowspan continuation cells under the visible row hit area", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      { nodeId: "ft1", nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 240, height: 40 },
      { nodeId: "ftr1", nodeType: "flow-table-row", parentNodeId: "ft1", pageIndex: 0, x: 36, y: 72, width: 240, height: 40 },
      {
        nodeId: "ftc-merged",
        nodeType: "flow-table-cell",
        parentNodeId: "ftr1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 120,
        height: 40,
        isContinued: true,
        flowTableCellGridProps: { columnIndex: 0, colspan: 2, rowspan: 3 },
      },
      { nodeId: "ftc-top", nodeType: "flow-table-cell", parentNodeId: "ftr1", pageIndex: 0, x: 156, y: 72, width: 120, height: 40 },
    ]
    paginated.sections[0].pages.push({
      index: 1,
      width: 300,
      height: 400,
      contentBox: { x: 36, y: 72, width: 228, height: 256 },
      headerFragments: [],
      footerFragments: [],
      fragments: [
        { nodeId: "ft1", nodeType: "flow-table", pageIndex: 1, x: 36, y: 72, width: 240, height: 80 },
        { nodeId: "ftr2", nodeType: "flow-table-row", parentNodeId: "ft1", pageIndex: 1, x: 36, y: 72, width: 240, height: 40 },
        {
          nodeId: "ftc-merged",
          nodeType: "flow-table-cell",
          parentNodeId: "ftr2",
          pageIndex: 1,
          x: 36,
          y: 72,
          width: 120,
          height: 80,
          continuesFrom: true,
          flowTableCellGridProps: { columnIndex: 0, colspan: 2, rowspan: 3 },
        },
        { nodeId: "ftc-middle", nodeType: "flow-table-cell", parentNodeId: "ftr2", pageIndex: 1, x: 156, y: 72, width: 120, height: 40 },
        { nodeId: "ftr3", nodeType: "flow-table-row", parentNodeId: "ft1", pageIndex: 1, x: 36, y: 112, width: 240, height: 40 },
        { nodeId: "ftc-bottom", nodeType: "flow-table-cell", parentNodeId: "ftr3", pageIndex: 1, x: 156, y: 112, width: 120, height: 40 },
      ],
    })
    const paragraph = paragraphNode("cell-p", "A")
    const doc = {
      version: 1,
      document: {
        id: "doc",
        sections: [{
          id: "section",
          type: "section",
          bodyRootId: "body",
          page: {
            size: "A4",
            orientation: "portrait",
            margin: {
              top: { value: 72, unit: "pt" },
              right: { value: 36, unit: "pt" },
              bottom: { value: 72, unit: "pt" },
              left: { value: 36, unit: "pt" },
            },
          },
          nodes: {
            body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
            ft1: {
              id: "ft1",
              type: "flow-table",
              props: {},
              columns: [{ width: { value: 60, unit: "pt" } }, { width: { value: 60, unit: "pt" } }, { width: { value: 120, unit: "pt" } }],
              rowIds: ["ftr1", "ftr2", "ftr3"],
              nodes: {
                ftr1: { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc-merged", "ftc-top"] },
                ftr2: { id: "ftr2", type: "flow-table-row", props: {}, cellIds: ["ftc-middle"] },
                ftr3: { id: "ftr3", type: "flow-table-row", props: {}, cellIds: ["ftc-bottom"] },
                "ftc-merged": { id: "ftc-merged", type: "flow-table-cell", props: { colspan: 2, rowspan: 3 }, childIds: ["cell-p"] },
                "ftc-top": { id: "ftc-top", type: "flow-table-cell", props: {}, childIds: [] },
                "ftc-middle": { id: "ftc-middle", type: "flow-table-cell", props: {}, childIds: [] },
                "ftc-bottom": { id: "ftc-bottom", type: "flow-table-cell", props: {}, childIds: [] },
                "cell-p": paragraph,
              },
            },
          },
        }],
      },
    } as unknown as DocumentNode

    const markup = renderCanvas(paginated, doc, "ftc-merged")
    const continuationCellGroup = markup.match(/<g[^>]*data-node-id="ftc-merged"[^>]*data-page-index="1"[^>]*>/)?.[0] ?? ""
    const continuationRowGroup = markup.match(/<g[^>]*data-node-id="ftr2"[^>]*data-node-type="flow-table-row"[^>]*>/)?.[0] ?? ""
    const mergedCellFragments = markup.match(/data-testid="editor-fragment"[^>]*data-node-id="ftc-merged"/g) ?? []

    expect(mergedCellFragments).toHaveLength(2)
    expect(continuationCellGroup).toContain("data-parent-node-id=\"ftr2\"")
    expect(continuationCellGroup).not.toContain("pointer-events:none")
    expect(continuationRowGroup).toContain("pointer-events:none")
  })

  it("stitches selected flow-table rowspan continuation chrome across page slices", () => {
    const paginated = makePaginated()
    paginated.sections[0].pages[0].fragments = [
      { nodeId: "ft1", nodeType: "flow-table", pageIndex: 0, x: 36, y: 72, width: 120, height: 40 },
      { nodeId: "ftr1", nodeType: "flow-table-row", parentNodeId: "ft1", pageIndex: 0, x: 36, y: 72, width: 120, height: 40 },
      {
        nodeId: "ftc-merged",
        nodeType: "flow-table-cell",
        parentNodeId: "ftr1",
        pageIndex: 0,
        x: 36,
        y: 72,
        width: 120,
        height: 40,
        isContinued: true,
      },
    ]
    paginated.sections[0].pages.push({
      index: 1,
      width: 300,
      height: 400,
      contentBox: { x: 36, y: 72, width: 228, height: 256 },
      headerFragments: [],
      footerFragments: [],
      fragments: [
        { nodeId: "ft1", nodeType: "flow-table", pageIndex: 1, x: 36, y: 72, width: 120, height: 40 },
        { nodeId: "ftr2", nodeType: "flow-table-row", parentNodeId: "ft1", pageIndex: 1, x: 36, y: 72, width: 120, height: 40 },
        {
          nodeId: "ftc-merged",
          nodeType: "flow-table-cell",
          parentNodeId: "ftr2",
          pageIndex: 1,
          x: 36,
          y: 72,
          width: 120,
          height: 40,
          continuesFrom: true,
        },
      ],
    })
    const doc = {
      version: 1,
      document: {
        id: "doc",
        sections: [{
          id: "section",
          type: "section",
          bodyRootId: "body",
          page: {
            size: "A4",
            orientation: "portrait",
            margin: {
              top: { value: 72, unit: "pt" },
              right: { value: 36, unit: "pt" },
              bottom: { value: 72, unit: "pt" },
              left: { value: 36, unit: "pt" },
            },
          },
          nodes: {
            body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
            ft1: {
              id: "ft1",
              type: "flow-table",
              props: {},
              columns: [{ width: { value: 120, unit: "pt" } }],
              rowIds: ["ftr1", "ftr2"],
              nodes: {
                ftr1: { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc-merged"] },
                ftr2: { id: "ftr2", type: "flow-table-row", props: {}, cellIds: [] },
                "ftc-merged": { id: "ftc-merged", type: "flow-table-cell", props: { rowspan: 2 }, childIds: ["cell-p"] },
                "cell-p": paragraphNode("cell-p", "A"),
              },
            },
          },
        }],
      },
    } as unknown as DocumentNode

    const markup = renderCanvas(paginated, doc, "ftc-merged")

    expect(markup).not.toContain(">flow cell</text>")
    expect(markup.match(/data-flow-table-cell-selection-outline="true"/g)).toHaveLength(2)
    expect(markup.match(/data-selection-outline-side="top"/g)).toHaveLength(1)
    expect(markup.match(/data-selection-outline-side="bottom"/g)).toHaveLength(1)
    expect(markup.match(/data-selection-outline-side="left"/g)).toHaveLength(2)
    expect(markup.match(/data-selection-outline-side="right"/g)).toHaveLength(2)
  })
})
