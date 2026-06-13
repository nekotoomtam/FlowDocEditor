import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { getAllListStylePresets } from "@/document"
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

function listedOutlineDoc(): DocumentNode {
  const doc = outlineDoc()
  doc.document.listStyles = getAllListStylePresets()
  doc.document.listInstances = {
    "tor-main": { id: "tor-main", styleId: "tor-clause" },
  }
  const section = doc.document.sections[0]
  const p1 = section.nodes.p1
  const p2 = section.nodes.p2
  if (p1?.type === "paragraph") {
    p1.props = {
      ...p1.props,
      list: { instanceId: "tor-main", level: 0, itemId: "tor.one" },
    }
  }
  if (p2?.type === "paragraph") {
    p2.props = {
      ...p2.props,
      list: { instanceId: "tor-main", level: 1, itemId: "tor.two" },
    }
  }
  return doc
}

function flowStackListedOutlineDoc(): DocumentNode {
  const doc = listedOutlineDoc()
  const section = doc.document.sections[0]
  section.nodes.body = { id: "body", type: "body", props: {}, childIds: ["fr1"] }
  section.nodes.fr1 = { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] }
  section.nodes.fs1 = { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1", "p2"] }
  return doc
}

function flowTableListedOutlineDoc(): DocumentNode {
  const doc = listedOutlineDoc()
  const section = doc.document.sections[0]
  const p1 = section.nodes.p1
  const p2 = section.nodes.p2
  if (p1?.type !== "paragraph" || p2?.type !== "paragraph") return doc

  section.nodes = {
    body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
    ft1: {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [
        { width: { value: 120, unit: "pt" } },
        { width: { value: 120, unit: "pt" } },
      ],
      rowIds: ["r1"],
      nodes: {
        r1: { id: "r1", type: "flow-table-row", props: {}, cellIds: ["c1", "c2"] },
        c1: { id: "c1", type: "flow-table-cell", props: {}, childIds: ["p1", "p2"] },
        c2: { id: "c2", type: "flow-table-cell", props: {}, childIds: [] },
        p1,
        p2,
      },
    },
  }
  return doc
}

function dividerPageBreakOutlineDoc(): DocumentNode {
  const doc = outlineDoc()
  const section = doc.document.sections[0]
  section.nodes.body = { id: "body", type: "body", props: {}, childIds: ["divider-1", "page-break-1"] }
  section.nodes["divider-1"] = {
    id: "divider-1",
    type: "divider",
    props: {
      color: "334155",
      thickness: { value: 1, unit: "pt" },
      marginBefore: { value: 4, unit: "pt" },
      marginAfter: { value: 4, unit: "pt" },
      style: "solid",
    },
  }
  section.nodes["page-break-1"] = { id: "page-break-1", type: "page-break", props: {} }
  delete section.nodes.p1
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

  it("keeps the outline shell while deferred content skips heavy rows", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: outlineDoc(),
      selectedNodeId: null,
      deferContent: true,
      onSelect: () => undefined,
      onAddShortcut: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"outline-panel-title\"")
    expect(markup).toContain("data-testid=\"outline-add-shortcut\"")
    expect(markup).toContain("data-outline-content-deferred=\"true\"")
    expect(markup).not.toContain("data-testid=\"outline-node-row\"")
    expect(markup).not.toContain("First paragraph")
  })

  it("marks the active edit row with a watermark without replacing the stable label", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: outlineDoc(),
      selectedNodeId: "p1",
      activeEditingNodeId: "p1",
      onSelect: () => undefined,
    }))

    expect(markup).toContain("data-outline-editing=\"true\"")
    expect(markup).toContain("First paragraph")
    expect(markup).toContain("กำลังแก้ไข")
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

  it("renders list groups as virtual outline runs without hiding paragraph rows", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: listedOutlineDoc(),
      selectedNodeId: null,
      selectedListGroupId: "tor-main",
      onSelect: () => undefined,
      onSelectListGroup: () => undefined,
      onReorderBodyChild: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"outline-list-group-row\"")
    expect(markup).toContain("data-outline-list-group-id=\"tor-main\"")
    expect(markup).toContain("aria-pressed=\"true\"")
    expect(markup).toContain("TOR Main")
    expect(markup).toContain("TOR Clause")
    expect(markup).toContain("2 items")
    expect(markup).toContain("1. - 1.1")
    expect(markup).toContain("First paragraph")
    expect(markup).toContain("Second paragraph with a long title")
    expect((markup.match(/data-outline-body-child=\"true\"/g) ?? [])).toHaveLength(2)
    expect((markup.match(/data-testid=\"outline-row-grip\"/g) ?? [])).toHaveLength(2)
  })

  it("renders list groups inside flow-stack content", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: flowStackListedOutlineDoc(),
      selectedNodeId: null,
      selectedListGroupId: "tor-main",
      onSelect: () => undefined,
      onSelectListGroup: () => undefined,
    }))

    expect(markup).toContain("1 คอลัมน์")
    expect(markup).toContain("คอลัมน์ 1")
    expect(markup).toContain("data-testid=\"outline-list-group-row\"")
    expect(markup).toContain("data-outline-list-group-id=\"tor-main\"")
    expect(markup).toContain("2 items")
    expect(markup).toContain("1. - 1.1")
    expect(markup).toContain("First paragraph")
    expect(markup).toContain("Second paragraph with a long title")
  })

  it("renders list groups inside flow-table cell content", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: flowTableListedOutlineDoc(),
      selectedNodeId: "c1",
      selectedListGroupId: "tor-main",
      onSelect: () => undefined,
      onSelectListGroup: () => undefined,
    }))

    expect(markup).toContain("Flow table 1×2")
    expect(markup).toContain("แถว 1")
    expect(markup).toContain("เซลล์ 1")
    expect(markup).toContain("data-testid=\"outline-list-group-row\"")
    expect(markup).toContain("data-outline-list-group-id=\"tor-main\"")
    expect(markup).toContain("aria-pressed=\"true\"")
    expect(markup).toContain("TOR Main")
    expect(markup).toContain("2 items")
    expect(markup).toContain("1. - 1.1")
    expect(markup).toContain("First paragraph")
    expect(markup).toContain("Second paragraph with a long title")
  })

  it("shows divider and page-break outline labels", () => {
    const markup = renderToStaticMarkup(createElement(OutlinePanel, {
      doc: dividerPageBreakOutlineDoc(),
      selectedNodeId: "divider-1",
      onSelect: () => undefined,
    }))

    expect(markup).toContain("เส้นแบ่ง")
    expect(markup).toContain("ขึ้นหน้าใหม่")
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
