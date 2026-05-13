import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import type { PaginatedDocument, PageFragment, ParagraphRenderProps } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { EditorCanvas } from "../EditorCanvas"

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

function textFragment(id: string, text: string, y: number): PageFragment {
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

function renderCanvas(): string {
  const noop = () => undefined
  return renderToStaticMarkup(createElement(EditorCanvas, {
    paginated: makePaginated(),
    doc: makeDoc(),
    drag: null,
    resizeDrag: null,
    minHeightDrag: null,
    marginDrag: null,
    scale: 1,
    selectedNodeId: null,
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
