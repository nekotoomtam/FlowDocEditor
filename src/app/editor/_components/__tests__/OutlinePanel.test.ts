import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import { OutlinePanel } from "../OutlinePanel"

function outlineDoc(): DocumentNode {
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
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "t1", type: "text", text: "First paragraph" }],
          },
          p2: {
            id: "p2",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "t2", type: "text", text: "Second paragraph with a long title" }],
          },
        },
      }],
    },
  } as DocumentNode
}

function flowOutlineDoc(): DocumentNode {
  const doc = outlineDoc()
  const section = doc.document.sections[0]
  section.nodes.body = { id: "body", type: "body", props: {}, childIds: ["fr1"] }
  section.nodes.fr1 = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] }
  section.nodes.fs1 = { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] }
  delete section.nodes.p2
  return doc
}

describe("OutlinePanel", () => {
  it("uses the shared panel header and compact outline rows", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: outlineDoc(),
      selectedNodeId: "p1",
      onSelect: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"outline-panel-title\"")
    expect(markup).toContain("Outline")
    expect(markup).toContain("data-testid=\"outline-node-row\"")
    expect(markup).toContain("min-height:42px")
    expect(markup).toContain("min-height:26px")
    expect(markup).toContain("First paragraph")
  })

  it("renders an add shortcut when the host panel wires one", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: outlineDoc(),
      selectedNodeId: null,
      onSelect: () => undefined,
      onAddShortcut: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"outline-add-shortcut\"")
    expect(markup).toContain("aria-label=\"Open add panel\"")
    expect(markup).toContain("title=\"Add\"")
  })

  it("shows flow-backed rows and stacks with standard row/column labels", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: flowOutlineDoc(),
      selectedNodeId: "fr1",
      onSelect: () => undefined,
    }))

    expect(markup).toContain("1 คอลัมน์")
    expect(markup).toContain("คอลัมน์ 1")
    expect(markup).toContain("First paragraph")
  })

  it("shows reorder grips for direct body children only when reorder is wired", () => {
    const bodyMarkup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: outlineDoc(),
      selectedNodeId: null,
      onSelect: () => undefined,
      onReorderBodyChild: () => undefined,
    }))
    const nestedMarkup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: flowOutlineDoc(),
      selectedNodeId: null,
      onSelect: () => undefined,
      onReorderBodyChild: () => undefined,
    }))

    expect(bodyMarkup).toContain("data-testid=\"outline-row-grip\"")
    expect(bodyMarkup).toContain("aria-label=\"Reorder outline item\"")
    expect(bodyMarkup).toContain("draggable=\"true\"")
    expect(bodyMarkup).toContain("data-outline-section-id=\"section\"")
    expect((bodyMarkup.match(/data-testid=\"outline-row-grip\"/g) ?? [])).toHaveLength(2)
    expect((bodyMarkup.match(/data-outline-body-child=\"true\"/g) ?? [])).toHaveLength(2)
    expect((nestedMarkup.match(/data-testid=\"outline-row-grip\"/g) ?? [])).toHaveLength(1)
    expect((nestedMarkup.match(/data-outline-body-child=\"true\"/g) ?? [])).toHaveLength(1)
  })
})
