import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_PARAGRAPH_PROPS,
  getAllListStylePresets,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import { pt } from "@/schema"
import { ListToolbar, resolveListToolbarState } from "../ListToolbar"

function paragraphNode(list?: ParagraphNode["props"]["list"]): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      ...DEFAULT_PARAGRAPH_PROPS,
      ...(list ? { list } : {}),
    },
    children: [{ id: "t1", type: "text", text: "Hello" }],
  }
}

function docWithParagraph(paragraph: ParagraphNode): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      listStyles: getAllListStylePresets(),
      listInstances: {
        "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
      },
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
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
      listStyles: getAllListStylePresets(),
      listInstances: {
        "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
      },
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
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

function renderToolbar(doc: DocumentNode, selectedNodeId: string | null, editable = true): string {
  return renderToStaticMarkup(createElement(ListToolbar, {
    doc,
    selectedNodeId,
    editable,
    onToggleListPreset: () => undefined,
    onChangeListItemLevel: () => undefined,
  }))
}

describe("ListToolbar", () => {
  it("renders list controls for the selected paragraph", () => {
    const doc = docWithParagraph(paragraphNode())
    const markup = renderToolbar(doc, "p1")

    expect(markup).toContain('data-testid="list-toolbar"')
    expect(markup).toContain('data-testid="list-toolbar-numbered"')
    expect(markup).toContain('data-testid="list-toolbar-paren"')
    expect(markup).toContain('data-testid="list-toolbar-bullet"')
  })

  it("resolves active list state and level controls from paragraph metadata", () => {
    const doc = docWithParagraph(paragraphNode({
      instanceId: "tor-main",
      level: 1,
      itemId: "tor.item",
    }))
    const state = resolveListToolbarState(doc, "p1", true)

    expect(state).toEqual({
      targetNodeId: "p1",
      currentInstanceId: "tor-main",
      currentStyleId: TOR_CLAUSE_LIST_STYLE_ID,
      currentLevel: 1,
      canToggle: true,
      canIndent: true,
      canOutdent: true,
    })
  })

  it("targets paragraphs nested inside flow-table cells", () => {
    const doc = docWithFlowTableParagraph(paragraphNode({
      instanceId: "tor-main",
      level: 0,
      itemId: "table.item",
    }))
    const state = resolveListToolbarState(doc, "p1", true)

    expect(state.targetNodeId).toBe("p1")
    expect(state.currentStyleId).toBe(TOR_CLAUSE_LIST_STYLE_ID)
    expect(state.canIndent).toBe(true)
  })

  it("disables list commands when no editable paragraph is selected", () => {
    const doc = docWithParagraph(paragraphNode())
    const state = resolveListToolbarState(doc, null, true)
    const readonly = resolveListToolbarState(doc, "p1", false)

    expect(state.canToggle).toBe(false)
    expect(readonly.canToggle).toBe(false)
    expect(readonly.canIndent).toBe(false)
    expect(readonly.canOutdent).toBe(false)
  })
})
