import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment, ParagraphRenderProps } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { buildWysiwygDraftVisualPreview, EditorCanvas } from "../EditorCanvas"

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
          { nodeId: "fs1", nodeType: "flow-stack", parentNodeId: "fr1", pageIndex: 0, x: 36, y: 72, width: 228, height: 40, fragmentIndex: 0 },
          textFragment("body-p", "Body text", 72),
        ],
        headerFragments: [],
        footerFragments: [],
      }],
    }],
    tocEntries: [],
  }
}

function renderCanvas(
  paginated: PaginatedDocument = makePaginated(),
  doc: DocumentNode = makeDoc(),
  selectedNodeId: string | null = null,
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
    inlineEditVisualFresh: false,
    inlineEditNodeId: null,
    inlineEditCaretIndex: null,
    inlineEditPageIndex: null,
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
    wysiwygTextEngineEnabled: false,
    wysiwygTextDraftNodeId: null,
    wysiwygTextDraftText: null,
    wysiwygTextCaretOffset: null,
    wysiwygTextSelection: null,
    wysiwygTextDraftPaginationActive: false,
    onWysiwygTextDraftChange: noop,
    onWysiwygTextReflowDecision: noop,
  }))
}

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
    expect(markup).toContain("flow-row")
    expect(markup).toContain("flow-stack")
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
})
