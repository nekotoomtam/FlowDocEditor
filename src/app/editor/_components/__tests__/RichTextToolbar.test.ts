import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DEFAULT_PARAGRAPH_PROPS } from "@/document"
import type { DocumentNode, InlineNode, ParagraphNode, ParagraphProps, TextRunStyle } from "@/schema"
import { pt } from "@/schema"
import {
  RichTextToolbar,
  resolveRichTextToolbarCommandRange,
  resolveRichTextToolbarRange,
  resolveRichTextToolbarScope,
  resolveRichTextToolbarStyleStateRange,
  type RichTextToolbarSelection,
} from "../RichTextToolbar"

function paragraphNode(
  props: Partial<ParagraphProps> = {},
  children: InlineNode[] = [{ id: "t1", type: "text", text: "Hello" }],
): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      ...DEFAULT_PARAGRAPH_PROPS,
      ...props,
    },
    children,
  }
}

function docWithParagraph(paragraph: ParagraphNode): DocumentNode {
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
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: [paragraph.id] },
          [paragraph.id]: paragraph,
        },
      }],
    },
  }
}

function docWithFlowTableParagraph(paragraph: ParagraphNode): DocumentNode {
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
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["table1"] },
          table1: {
            id: "table1",
            type: "flow-table",
            props: {},
            columns: [{ width: pt(240) }],
            rowIds: ["row1"],
            nodes: {
              row1: { id: "row1", type: "flow-table-row", props: {}, cellIds: ["cell1"] },
              cell1: { id: "cell1", type: "flow-table-cell", props: {}, childIds: [paragraph.id] },
              [paragraph.id]: paragraph,
            },
          },
        },
      }],
    },
  }
}

function renderToolbar(
  doc: DocumentNode,
  selectedNodeId = "p1",
  editable = true,
  textSelection: RichTextToolbarSelection | null = null,
  draftParagraph: ParagraphNode | null = null,
  pendingStyle: TextRunStyle | null = null,
): string {
  return renderToStaticMarkup(createElement(RichTextToolbar, {
    doc,
    selectedNodeId,
    textSelection,
    draftParagraph,
    pendingStyle,
    editable,
    onUpdateParagraphTextStyle: () => undefined,
    onUpdateTextRunStyleRange: () => undefined,
  }))
}

describe("RichTextToolbar", () => {
  it("renders paragraph text style controls for the selected paragraph", () => {
    const markup = renderToolbar(docWithParagraph(paragraphNode({ fontWeight: "bold" })))

    expect(markup).toContain('data-testid="rich-text-toolbar"')
    expect(markup).toContain('data-active-node-id="p1"')
    expect(markup).toContain('data-enabled="true"')
    expect(markup).toContain('data-style-mode="paragraph"')
    expect(markup).toContain('data-testid="rich-text-toolbar-scope"')
    expect(markup).toContain('data-scope="paragraph"')
    expect(markup).toContain("Paragraph")
    expect(markup).toContain('data-testid="rich-text-toolbar-font-family"')
    expect(markup).toContain('data-testid="rich-text-toolbar-bold"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("finds selected paragraphs inside flow-table internals", () => {
    const markup = renderToolbar(docWithFlowTableParagraph(paragraphNode({ fontStyle: "italic" })))

    expect(markup).toContain('data-active-node-id="p1"')
    expect(markup).toContain('data-testid="rich-text-toolbar-italic"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("marks mixed run styles without flattening them in the toolbar", () => {
    const markup = renderToolbar(docWithParagraph(paragraphNode({}, [
      { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "B", style: { fontWeight: "normal" } },
    ])))

    expect(markup).toContain('data-testid="rich-text-toolbar-bold"')
    expect(markup).toContain('data-mixed="true"')
  })

  it("uses the active WYSIWYG selection as the toolbar style range", () => {
    const markup = renderToolbar(
      docWithParagraph(paragraphNode({}, [
        { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
        { id: "t2", type: "text", text: "B", style: { fontWeight: "normal" } },
        { id: "t3", type: "text", text: "C", style: { fontWeight: "normal" } },
      ])),
      "p1",
      true,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 3 },
    )

    expect(markup).toContain('data-style-mode="range"')
    expect(markup).toContain('data-style-start="1"')
    expect(markup).toContain('data-style-end="3"')
    expect(markup).toContain('data-scope="range"')
    expect(markup).toContain("Selected text")
    expect(markup).not.toContain('data-mixed="true"')
  })

  it("reads collapsed caret state from the current text run without changing paragraph update mode", () => {
    const markup = renderToolbar(
      docWithParagraph(paragraphNode({}, [
        { id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } },
        { id: "t2", type: "text", text: "B", style: { fontWeight: "normal" } },
      ])),
      "p1",
      true,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 1 },
    )

    expect(markup).toContain('data-style-mode="paragraph"')
    expect(markup).toContain('data-testid="rich-text-toolbar-bold"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).not.toContain('data-mixed="true"')
  })

  it("uses the active rich draft paragraph as the toolbar source of truth", () => {
    const docParagraph = paragraphNode({}, [{ id: "t1", type: "text", text: "A" }])
    const draftParagraph = paragraphNode({}, [{ id: "t1", type: "text", text: "A", style: { fontWeight: "bold" } }])
    const markup = renderToolbar(docWithParagraph(docParagraph), "p1", true, null, draftParagraph)

    expect(markup).toContain('data-testid="rich-text-toolbar-bold"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("reflects collapsed pending style while the active rich draft has not changed text yet", () => {
    const markup = renderToolbar(
      docWithParagraph(paragraphNode({}, [{ id: "t1", type: "text", text: "A" }])),
      "p1",
      true,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 1 },
      null,
      { fontStyle: "italic" },
    )

    expect(markup).toContain('data-testid="rich-text-toolbar-italic"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("communicates collapsed rich draft styling as next typed text", () => {
    const docParagraph = paragraphNode({}, [{ id: "t1", type: "text", text: "A" }])
    const draftParagraph = paragraphNode({}, [{ id: "t1", type: "text", text: "A" }])
    const markup = renderToolbar(
      docWithParagraph(docParagraph),
      "p1",
      true,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 1 },
      draftParagraph,
      { fontStyle: "italic" },
    )

    expect(markup).toContain('data-style-mode="paragraph"')
    expect(markup).toContain('data-scope="caret"')
    expect(markup).toContain("Next text")
    expect(markup).toContain('data-testid="rich-text-toolbar-italic"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("falls back to paragraph mode when the WYSIWYG selection is collapsed", () => {
    expect(resolveRichTextToolbarRange("p1", 5, { nodeId: "p1", anchorOffset: 2, focusOffset: 2 })).toEqual({
      start: 0,
      end: 5,
      mode: "paragraph",
    })
  })

  it("clamps reversed WYSIWYG selection offsets", () => {
    expect(resolveRichTextToolbarRange("p1", 5, { nodeId: "p1", anchorOffset: 9, focusOffset: 2 })).toEqual({
      start: 2,
      end: 5,
      mode: "range",
    })
  })

  it("uses live command selection ahead of the debounced display selection", () => {
    expect(resolveRichTextToolbarCommandRange(
      "p1",
      8,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      { nodeId: "p1", anchorOffset: 3, focusOffset: 7 },
    )).toEqual({
      start: 3,
      end: 7,
      mode: "range",
    })
  })

  it("falls back to debounced display selection when no command selection prop is provided", () => {
    expect(resolveRichTextToolbarCommandRange(
      "p1",
      8,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      undefined,
    )).toEqual({
      start: 1,
      end: 4,
      mode: "range",
    })
  })

  it("lets an explicit null command selection override a stale display range", () => {
    expect(resolveRichTextToolbarCommandRange(
      "p1",
      8,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      null,
    )).toEqual({
      start: 0,
      end: 8,
      mode: "paragraph",
    })
  })

  it("lets a live collapsed command selection override a stale display range", () => {
    expect(resolveRichTextToolbarCommandRange(
      "p1",
      8,
      { nodeId: "p1", anchorOffset: 1, focusOffset: 4 },
      { nodeId: "p1", anchorOffset: 5, focusOffset: 5 },
    )).toEqual({
      start: 0,
      end: 8,
      mode: "paragraph",
    })
  })

  it("resolves collapsed style-state ranges at the caret", () => {
    expect(resolveRichTextToolbarStyleStateRange("p1", 5, { nodeId: "p1", anchorOffset: 9, focusOffset: 2 })).toEqual({
      start: 2,
      end: 5,
    })
    expect(resolveRichTextToolbarStyleStateRange("p1", 5, { nodeId: "p1", anchorOffset: 2, focusOffset: 2 })).toEqual({
      start: 2,
      end: 2,
    })
  })

  it("resolves the visible toolbar scope from range, caret, and inactive state", () => {
    expect(resolveRichTextToolbarScope({
      canStyleText: true,
      mode: "range",
      hasActiveRichDraft: true,
      hasCollapsedSelection: false,
    })).toBe("range")
    expect(resolveRichTextToolbarScope({
      canStyleText: true,
      mode: "paragraph",
      hasActiveRichDraft: true,
      hasCollapsedSelection: true,
    })).toBe("caret")
    expect(resolveRichTextToolbarScope({
      canStyleText: true,
      mode: "paragraph",
      hasActiveRichDraft: false,
      hasCollapsedSelection: true,
    })).toBe("paragraph")
    expect(resolveRichTextToolbarScope({
      canStyleText: false,
      mode: "range",
      hasActiveRichDraft: true,
      hasCollapsedSelection: false,
    })).toBe("inactive")
  })

  it("disables the toolbar for paragraphs that still contain non-text inline nodes", () => {
    const markup = renderToolbar(docWithParagraph(paragraphNode({}, [
      { id: "t1", type: "text", text: "Hello " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
    ])))

    expect(markup).toContain('data-enabled="false"')
    expect(markup).toContain('data-testid="rich-text-toolbar-empty-state"')
    expect(markup).toContain("disabled")
  })
})
