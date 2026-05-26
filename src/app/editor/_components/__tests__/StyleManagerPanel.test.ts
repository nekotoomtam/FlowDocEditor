import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  createDefaultDocument,
  getAllListStylePresets,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "@/document"
import type { ParagraphNode } from "@/schema"
import { StyleManagerPanel } from "../StyleManagerPanel"

function docWithListResources() {
  const doc = createDefaultDocument("Styles")
  const section = doc.document.sections[0]
  const paragraph = Object.values(section.nodes).find((node): node is ParagraphNode => node.type === "paragraph")
  if (!paragraph) throw new Error("paragraph not found")
  paragraph.props = {
    ...paragraph.props,
    list: { instanceId: "tor-main", level: 0, itemId: "tor.one" },
  }
  doc.document.listStyles = getAllListStylePresets()
  doc.document.listInstances = {
    "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
  }
  return doc
}

describe("StyleManagerPanel", () => {
  it("renders document paragraph styles with base status", () => {
    const markup = renderToStaticMarkup(createElement(StyleManagerPanel, {
      doc: createDefaultDocument("Styles"),
      selectedResource: { kind: "paragraph-style", id: TOR_BODY_PARAGRAPH_STYLE_ID },
      editable: true,
      onSelectResource: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"style-manager-panel\"")
    expect(markup).toContain("Styles")
    expect(markup).toContain("Paragraph styles")
    expect(markup).toContain("data-testid=\"style-manager-style-count\"")
    expect(markup).toContain("TOR Body")
    expect(markup).toContain(`data-style-id="${TOR_BODY_PARAGRAPH_STYLE_ID}"`)
    expect(markup).toContain("data-testid=\"style-manager-base-badge\"")
    expect(markup).toContain("aria-pressed=\"true\"")
    expect(markup).toContain("List styles")
    expect(markup).toContain("No list styles")
    expect(markup).toContain("List groups")
    expect(markup).toContain("No list groups")
  })

  it("renders an empty state when no paragraph styles exist", () => {
    const markup = renderToStaticMarkup(createElement(StyleManagerPanel, {
      doc: { version: 1, document: { id: "doc", sections: [] } },
      selectedResource: null,
      editable: true,
      onSelectResource: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"style-manager-empty\"")
    expect(markup).toContain("No paragraph styles")
  })

  it("disables style rows when the host is not editable", () => {
    const markup = renderToStaticMarkup(createElement(StyleManagerPanel, {
      doc: createDefaultDocument("Styles"),
      selectedResource: null,
      editable: false,
      onSelectResource: () => undefined,
    }))

    expect(markup).toContain("disabled=\"\"")
  })

  it("renders list styles and list groups as selectable resources", () => {
    const markup = renderToStaticMarkup(createElement(StyleManagerPanel, {
      doc: docWithListResources(),
      selectedResource: { kind: "list-group", id: "tor-main" },
      editable: true,
      onSelectResource: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"style-manager-list-style\"")
    expect(markup).toContain("data-resource-kind=\"list-style\"")
    expect(markup).toContain("TOR Clause")
    expect(markup).toContain("data-testid=\"style-manager-list-group\"")
    expect(markup).toContain("data-resource-kind=\"list-group\"")
    expect(markup).toContain("TOR Main")
    expect(markup).toContain("TOR Clause · 1 item")
    expect(markup).toContain("aria-pressed=\"true\"")
  })
})
