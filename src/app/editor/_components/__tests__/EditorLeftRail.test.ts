import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { createDefaultDocument, DEFAULT_PARAGRAPH_PROPS, getAllListStylePresets, TOR_BODY_PARAGRAPH_STYLE_ID } from "@/document"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import { EditorLeftRail } from "../shell/EditorLeftRail"

const registry: FieldRegistryV1 = { version: 1, fields: [] }

function listedDoc(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      listStyles: getAllListStylePresets(),
      listInstances: {
        "tor-main": { id: "tor-main", styleId: "tor-clause" },
      },
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              ...DEFAULT_PARAGRAPH_PROPS,
              list: { instanceId: "tor-main", level: 0, itemId: "tor.one" },
            },
            children: [{ id: "t1", type: "text", text: "Listed paragraph" }],
          },
        },
      }],
    },
  }
}

describe("EditorLeftRail", () => {
  it("exposes the styles tab bookmark", () => {
    const doc = createDefaultDocument("Left rail")
    const markup = renderToStaticMarkup(createElement(EditorLeftRail, {
      mode: "outline",
      outlineDoc: doc,
      styleDoc: doc,
      selectedNodeId: null,
      selectedStyleResource: null,
      registry,
      editable: true,
      isDragging: false,
      onModeChange: () => undefined,
      onSelectNode: () => undefined,
      onSelectStyleResource: () => undefined,
      onReorderBodyChild: () => undefined,
      onDragStart: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"editor-left-rail-mode-styles\"")
    expect(markup).toContain("aria-label=\"Show styles\"")
    expect(markup).toContain("title=\"Styles\"")
  })

  it("renders the style manager panel in styles mode", () => {
    const doc = createDefaultDocument("Left rail")
    const markup = renderToStaticMarkup(createElement(EditorLeftRail, {
      mode: "styles",
      outlineDoc: doc,
      styleDoc: doc,
      selectedNodeId: null,
      selectedStyleResource: { kind: "paragraph-style", id: TOR_BODY_PARAGRAPH_STYLE_ID },
      registry,
      editable: true,
      isDragging: false,
      onModeChange: () => undefined,
      onSelectNode: () => undefined,
      onSelectStyleResource: () => undefined,
      onReorderBodyChild: () => undefined,
      onDragStart: () => undefined,
    }))

    expect(markup).toContain("data-mode=\"styles\"")
    expect(markup).toContain("data-testid=\"style-manager-panel\"")
    expect(markup).toContain("TOR Body")
    expect(markup).toContain("aria-pressed=\"true\"")
  })

  it("highlights the active outline list group even when no style resource is selected", () => {
    const doc = listedDoc()
    const markup = renderToStaticMarkup(createElement(EditorLeftRail, {
      mode: "outline",
      outlineDoc: doc,
      styleDoc: doc,
      selectedNodeId: "p1",
      selectedStyleResource: null,
      activeOutlineListGroupId: "tor-main",
      registry,
      editable: true,
      isDragging: false,
      onModeChange: () => undefined,
      onSelectNode: () => undefined,
      onSelectStyleResource: () => undefined,
      onReorderBodyChild: () => undefined,
      onDragStart: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"outline-list-group-row\"")
    expect(markup).toContain("data-outline-list-group-id=\"tor-main\"")
    expect(markup).toContain("aria-pressed=\"true\"")
    expect(markup).toContain("Listed paragraph")
  })
})
