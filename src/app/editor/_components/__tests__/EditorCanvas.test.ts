import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment, ParagraphRenderProps } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  buildEditorFragmentClipPathId,
  buildEditorFragmentRenderKey,
  buildWysiwygDraftVisualPreview,
  buildWysiwygTableCellDraftVisualChromeFragments,
  EditorCanvas,
  shouldStartInlineEditOnSingleClick,
} from "../EditorCanvas"

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
            type: "table",
            props: {},
            columns: [{ width: { value: 120, unit: "pt" } }],
            rowIds: ["tr1"],
            nodes: {
              tr1: { id: "tr1", type: "table-row", props: {}, cellIds: ["tc1"] },
              tc1: { id: "tc1", type: "table-cell", props: {}, childIds: ["cell-p"] },
              "cell-p": cellParagraph,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
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

function makeTableCellPaginated(kind: "table" | "flow-table" = "table"): PaginatedDocument {
  const isFlow = kind === "flow-table"
  const tableId = isFlow ? "ft1" : "tbl1"
  const rowId = isFlow ? "ftr1" : "tr1"
  const cellId = isFlow ? "ftc1" : "tc1"
  const rowType = isFlow ? "flow-table-row" : "row"
  const cellType = isFlow ? "flow-table-cell" : "table-cell"
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
            { nodeId: tableId, nodeType: kind, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
            { nodeId: rowId, nodeType: rowType, parentNodeId: tableId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
            { nodeId: cellId, nodeType: cellType, parentNodeId: rowId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
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

function makeSplitTableCellPaginated(kind: "table" | "flow-table" = "table"): PaginatedDocument {
  const paginated = makeTableCellPaginated(kind)
  const isFlow = kind === "flow-table"
  const tableId = isFlow ? "ft1" : "tbl1"
  const rowId = isFlow ? "ftr1" : "tr1"
  const cellId = isFlow ? "ftc1" : "tc1"
  const rowType = isFlow ? "flow-table-row" : "row"
  const cellType = isFlow ? "flow-table-cell" : "table-cell"
  const splitRenderProps = {
    ...renderProps,
    lineHeight: 12,
  }
  paginated.sections[0].pages[0].fragments = [
    { nodeId: tableId, nodeType: kind, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: rowId, nodeType: rowType, parentNodeId: tableId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: cellId, nodeType: cellType, parentNodeId: rowId, pageIndex: 0, x: 36, y: 72, width: 120, height: 28 },
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
    { nodeId: tableId, nodeType: kind, pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: rowId, nodeType: rowType, parentNodeId: tableId, pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
    { nodeId: cellId, nodeType: cellType, parentNodeId: rowId, pageIndex: 1, x: 36, y: 72, width: 120, height: 28 },
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
  inlineEditVisualFresh?: boolean
  inlineEditNodeId?: string | null
  inlineEditCaretIndex?: number | null
  inlineEditPageIndex?: number | null
  inlineEditVisualLocked?: boolean
  wysiwygTextEngineEnabled?: boolean
  wysiwygTextDraftNodeId?: string | null
  wysiwygTextDraftText?: string | null
  wysiwygTextCaretOffset?: number | null
  wysiwygTextDraftPaginationActive?: boolean
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
    drag: null,
    resizeDrag: null,
    minHeightDrag: null,
    marginDrag: null,
    scale: 1,
    selectedNodeId,
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
    onResizeStart: noop,
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
    wysiwygTextCaretOffset: options.wysiwygTextCaretOffset ?? null,
    wysiwygTextSelection: null,
    wysiwygTextDraftPaginationActive: options.wysiwygTextDraftPaginationActive ?? false,
    onWysiwygTextDraftChange: noop,
    onWysiwygTextReflowDecision: noop,
  }))
}

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

describe("EditorCanvas header/footer zones", () => {
  it("renders header and footer text as read-only preview content", () => {
    const markup = renderCanvas()

    expect(markup).toContain("data-testid=\"editor-zone-fragment\"")
    expect(markup).toContain("data-zone=\"header\"")
    expect(markup).toContain("data-zone=\"footer\"")
    expect(markup).toContain("Header Preview")
    expect(markup).toContain("หน้า 7")
    expect(markup).toContain("pointer-events:none")
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

  it("keeps table and row structure chrome invisible while cell chrome remains visible", () => {
    const markup = renderCanvas(makeTableCellPaginated("flow-table"), makeFlowTableCellDoc())
    const structureGroups = markup.match(/<g[^>]*data-table-structure-chrome="true"[\s\S]*?<\/g>/g) ?? []

    expect(structureGroups).toHaveLength(2)
    expect(structureGroups.every((group) => group.includes("fill=\"transparent\""))).toBe(true)
    expect(structureGroups.every((group) => group.includes("stroke=\"transparent\""))).toBe(true)
    expect(structureGroups.every((group) => group.includes("opacity=\"0\""))).toBe(true)
    expect(markup).toContain("data-node-type=\"flow-table-cell\"")
    expect(markup).toContain("fill=\"#fef9c3\"")
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
    expect(sourceChrome.map((fragment) => fragment.nodeType)).toEqual(["table", "row", "table-cell"])
    expect(sourceChrome.every((fragment) => fragment.continuesFrom === false)).toBe(true)
    expect(sourceChrome.every((fragment) => fragment.isContinued)).toBe(true)

    const chrome = chromeByPage.get(1) ?? []
    expect(chrome.map((fragment) => fragment.nodeType)).toEqual(["table", "row", "table-cell"])
    expect(chrome.every((fragment) => fragment.continuesFrom)).toBe(true)
    expect(chrome.every((fragment) => fragment.height === preview?.fragments[1].height)).toBe(true)
  })

  it("extends source-page table-cell chrome to the split slice height", () => {
    const paginated = makeTableCellPaginated()
    for (const fragment of paginated.sections[0].pages[0].fragments) {
      if (fragment.nodeType === "table" || fragment.nodeType === "row" || fragment.nodeType === "table-cell") {
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
    const sourceTable = sourceChrome.find((fragment) => fragment.nodeType === "table")
    const sourceRow = sourceChrome.find((fragment) => fragment.nodeType === "row")
    const sourceCell = sourceChrome.find((fragment) => fragment.nodeType === "table-cell")

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

    expect(markup.match(/data-node-id="ftc-merged"/g)).toHaveLength(2)
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
