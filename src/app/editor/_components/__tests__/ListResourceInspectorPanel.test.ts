import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  createDefaultDocument,
  getAllListStylePresets,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "@/document"
import type { ParagraphNode } from "@/schema"
import { ListResourceInspectorPanel } from "../ListResourceInspectorPanel"

function docWithListResources() {
  const doc = createDefaultDocument("List inspector")
  const section = doc.document.sections[0]
  const paragraph = Object.values(section.nodes).find((node): node is ParagraphNode => node.type === "paragraph")
  if (!paragraph) throw new Error("paragraph not found")
  paragraph.props = {
    ...paragraph.props,
    list: { instanceId: "tor-main", level: 0, itemId: "tor.one" },
  }
  doc.document.listStyles = getAllListStylePresets()
  doc.document.listInstances = {
    "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID, startAt: 1 },
  }
  return doc
}

describe("ListResourceInspectorPanel", () => {
  it("renders a list style resource summary", () => {
    const markup = renderToStaticMarkup(createElement(ListResourceInspectorPanel, {
      doc: docWithListResources(),
      selectedResource: { kind: "list-style", id: TOR_CLAUSE_LIST_STYLE_ID },
    }))

    expect(markup).toContain("data-testid=\"list-resource-inspector-panel\"")
    expect(markup).toContain("List Style")
    expect(markup).toContain("Read only")
    expect(markup).toContain("TOR Clause")
    expect(markup).toContain("data-testid=\"list-resource-level-count\"")
    expect(markup).toContain("data-testid=\"list-resource-level\"")
    expect(markup).toContain("%1.")
  })

  it("renders a list group resource summary", () => {
    const markup = renderToStaticMarkup(createElement(ListResourceInspectorPanel, {
      doc: docWithListResources(),
      selectedResource: { kind: "list-group", id: "tor-main" },
    }))

    expect(markup).toContain("List Group")
    expect(markup).toContain("TOR Main")
    expect(markup).toContain("TOR Clause")
    expect(markup).toContain("data-testid=\"list-resource-item-count\"")
    expect(markup).toContain("data-testid=\"list-resource-first-marker\"")
    expect(markup).toContain("1.")
  })

  it("renders missing state when a selected list resource no longer exists", () => {
    const markup = renderToStaticMarkup(createElement(ListResourceInspectorPanel, {
      doc: createDefaultDocument("Missing"),
      selectedResource: { kind: "list-style", id: "missing" },
    }))

    expect(markup).toContain("data-testid=\"list-resource-missing\"")
    expect(markup).toContain("List resource not found")
  })
})
