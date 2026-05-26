import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import {
  getAllListStylePresets,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "@/document"
import { PropertyPanel } from "../PropertyPanel"

function docWithFlowParagraph(): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
          fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1", "fs2"] },
          fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 50 }, childIds: ["p1"] },
          fs2: { id: "fs2", type: "flow-stack", props: { widthShare: 50 }, childIds: [] },
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
            children: [{ id: "t1", type: "text", text: "Flow text" }],
          },
        },
      }],
    },
  } as DocumentNode
}

function docWithFlowTable(): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
          ft1: {
            id: "ft1",
            type: "flow-table",
            props: {},
            columns: [
              { width: { value: 120, unit: "pt" } },
              { width: { value: 120, unit: "pt" } },
            ],
            rowIds: ["ftr1", "ftr2"],
            nodes: {
              ftr1: { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc1", "ftc2"] },
              ftr2: { id: "ftr2", type: "flow-table-row", props: {}, cellIds: ["ftc3", "ftc4"] },
              ftc1: { id: "ftc1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
              ftc2: { id: "ftc2", type: "flow-table-cell", props: {}, childIds: ["p2"] },
              ftc3: { id: "ftc3", type: "flow-table-cell", props: {}, childIds: ["p3"] },
              ftc4: { id: "ftc4", type: "flow-table-cell", props: {}, childIds: ["p4"] },
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
                children: [{ id: "t1", type: "text", text: "A" }],
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
                children: [{ id: "t2", type: "text", text: "B" }],
              },
              p3: {
                id: "p3",
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
                children: [{ id: "t3", type: "text", text: "C" }],
              },
              p4: {
                id: "p4",
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
                children: [{ id: "t4", type: "text", text: "D" }],
              },
            },
          },
        },
      }],
    },
  } as DocumentNode
}

function docWithShortIdFlowTable(): DocumentNode {
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
          body: { id: "body", type: "body", props: {}, childIds: ["tbl1"] },
          tbl1: {
            id: "tbl1",
            type: "flow-table",
            props: {},
            columns: [
              { width: { value: 120, unit: "pt" } },
              { width: { value: 120, unit: "pt" } },
            ],
            rowIds: ["tr1"],
            nodes: {
              tr1: { id: "tr1", type: "flow-table-row", props: {}, cellIds: ["tc1", "tc2"] },
              tc1: { id: "tc1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
              tc2: { id: "tc2", type: "flow-table-cell", props: {}, childIds: ["p2"] },
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
                children: [{ id: "t1", type: "text", text: "A" }],
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
                children: [{ id: "t2", type: "text", text: "B" }],
              },
            },
          },
        },
      }],
    },
  } as DocumentNode
}

function docWithSpannedFlowTable(): DocumentNode {
  const doc = docWithFlowTable()
  const table = doc.document.sections[0].nodes.ft1
  if (table.type !== "flow-table") throw new Error("expected flow-table fixture")
  table.columns = [
    { width: { value: 120, unit: "pt" } },
    { width: { value: 80, unit: "pt" } },
    { width: { value: 60, unit: "pt" } },
  ]
  table.nodes.ftr1 = { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc1", "ftc2"] }
  table.nodes.ftr2 = { id: "ftr2", type: "flow-table-row", props: {}, cellIds: ["ftc4"] }
  table.nodes.ftc1 = { id: "ftc1", type: "flow-table-cell", props: { colspan: 2, rowspan: 2 }, childIds: ["p1"] }
  table.nodes.ftc2 = { id: "ftc2", type: "flow-table-cell", props: {}, childIds: ["p2"] }
  table.nodes.ftc4 = { id: "ftc4", type: "flow-table-cell", props: {}, childIds: ["p4"] }
  delete table.nodes.ftc3
  delete table.nodes.p3
  return doc
}

function docWithMergedFlowTableCellContent(): DocumentNode {
  const doc = docWithFlowTable()
  const table = doc.document.sections[0].nodes.ft1
  if (table.type !== "flow-table") throw new Error("expected flow-table fixture")
  table.nodes.ftr1 = { id: "ftr1", type: "flow-table-row", props: {}, cellIds: ["ftc1"] }
  table.nodes.ftr2 = { id: "ftr2", type: "flow-table-row", props: {}, cellIds: [] }
  table.nodes.ftc1 = { id: "ftc1", type: "flow-table-cell", props: { colspan: 2, rowspan: 2 }, childIds: ["p1", "p2", "p3"] }
  delete table.nodes.ftc2
  delete table.nodes.ftc3
  delete table.nodes.ftc4
  delete table.nodes.p4
  return doc
}

describe("PropertyPanel selection context", () => {
  it("renders divider and page-break controls from authored document nodes", () => {
    const noop = () => undefined
    const doc = docWithFlowParagraph()
    const section = doc.document.sections[0]
    section.nodes.body = { id: "body", type: "body", props: {}, childIds: ["divider-1", "page-break-1"] }
    section.nodes["divider-1"] = {
      id: "divider-1",
      type: "divider",
      props: {
        color: "334155",
        thickness: { value: 2, unit: "pt" },
        marginBefore: { value: 4, unit: "pt" },
        marginAfter: { value: 6, unit: "pt" },
        style: "dashed",
      },
    }
    section.nodes["page-break-1"] = { id: "page-break-1", type: "page-break", props: {} }
    delete section.nodes.fr1
    delete section.nodes.fs1
    delete section.nodes.p1

    const dividerMarkup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc,
      registry: { version: 1, fields: [] },
      selectedNodeId: "divider-1",
      selectionAnchorNodeId: "divider-1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onSelectStyleResource: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
        fitToWidth: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))
    const pageBreakMarkup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc,
      registry: { version: 1, fields: [] },
      selectedNodeId: "page-break-1",
      selectionAnchorNodeId: "page-break-1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onSelectStyleResource: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
        fitToWidth: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(dividerMarkup).toContain("Divider")
    expect(dividerMarkup).toContain("divider-line-controls")
    expect(dividerMarkup).toContain("divider-line-style-dashed")
    expect(dividerMarkup).toContain("divider-line-width")
    expect(dividerMarkup).toContain("#334155")
    expect(dividerMarkup).toContain("divider-spacing-card")
    expect(dividerMarkup).toContain("divider-spacing-above")
    expect(dividerMarkup).toContain("divider-spacing-below")
    expect(dividerMarkup).toContain("max=\"144\"")
    expect(pageBreakMarkup).toContain("Page break")
    expect(pageBreakMarkup).toContain("Following body content starts on the next page.")
  })

  it("shows a compact context trigger when the selected node has visible parents", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowParagraph(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "p1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onSelectStyleResource: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
        fitToWidth: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"selection-context-button\"")
    expect(markup).toContain("path")
    expect(markup).toContain("data-testid=\"paragraph-panel-tabs\"")
    expect(markup).not.toContain("position:sticky")
    expect(markup).toContain("data-testid=\"paragraph-panel-tab-text\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-tab-box\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-tab-style\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-text\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-box\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-style\"")
    expect(markup).toContain("data-testid=\"paragraph-style-preset\"")
    expect(markup).toContain("data-testid=\"paragraph-style-detach\"")
    expect(markup).toContain("TOR Heading 1")
    expect(markup).toContain("data-testid=\"paragraph-font-family\"")
    expect(markup).toContain("role=\"combobox\"")
    expect(markup).toContain("Sarabun")
    expect(markup).toContain("data-testid=\"paragraph-style-bold\"")
    expect(markup).toContain("data-testid=\"paragraph-style-italic\"")
    expect(markup).toContain("data-testid=\"paragraph-style-underline\"")
    expect(markup).toContain("data-testid=\"paragraph-style-strikethrough\"")
    expect(markup).toContain("data-testid=\"paragraph-text-color-palette-well\"")
    expect(markup).toContain("data-testid=\"paragraph-text-color-palette-value\"")
    expect(markup).toContain("data-testid=\"paragraph-text-color-palette-toggle\"")
    expect(markup).toContain("aria-selected=\"true\"")
  })

  it("renders selected paragraph list context without editing list metadata", () => {
    const noop = () => undefined
    const doc = docWithFlowParagraph()
    const paragraph = doc.document.sections[0].nodes.p1
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph fixture")
    paragraph.props = {
      ...paragraph.props,
      list: { instanceId: "tor-main", level: 0, itemId: "tor.one" },
    }
    doc.document.listStyles = getAllListStylePresets()
    doc.document.listInstances = {
      "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
    }

    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc,
      registry: { version: 1, fields: [] },
      selectedNodeId: "p1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onSelectStyleResource: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"paragraph-list-context\"")
    expect(markup).toContain("data-testid=\"paragraph-list-context-group\"")
    expect(markup).toContain("TOR Main")
    expect(markup).toContain("data-testid=\"paragraph-list-context-style\"")
    expect(markup).toContain("TOR Clause")
    expect(markup).toContain("data-testid=\"paragraph-list-context-marker\"")
    expect(markup).toContain("1.")
    expect(markup).toContain("data-testid=\"paragraph-list-context-count\"")
    expect(markup).toContain("data-testid=\"paragraph-list-context-select-group\"")
    expect(markup).toContain("data-testid=\"paragraph-list-context-edit-style\"")
  })

  it("renders paragraph box controls for paragraph document styling", () => {
    const noop = () => undefined
    const doc = docWithFlowParagraph()
    const paragraph = doc.document.sections[0].nodes.p1
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph fixture")
    paragraph.props.box = {
      fill: "E0F2FE",
      padding: {
        top: { value: 2, unit: "pt" },
        right: { value: 4, unit: "pt" },
        bottom: { value: 6, unit: "pt" },
        left: { value: 8, unit: "pt" },
      },
      border: {
        top: { style: "solid", width: { value: 1, unit: "pt" }, color: "1F2937" },
        right: { style: "solid", width: { value: 1, unit: "pt" }, color: "1F2937" },
        bottom: { style: "solid", width: { value: 1, unit: "pt" }, color: "1F2937" },
        left: { style: "solid", width: { value: 1, unit: "pt" }, color: "1F2937" },
      },
    }
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc,
      registry: { version: 1, fields: [] },
      selectedNodeId: "p1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"paragraph-box-controls\"")
    expect(markup).not.toContain("Paragraph box style is authored document content")
    expect(markup).toContain("data-testid=\"paragraph-box-fill-card\"")
    expect(markup).toContain("data-testid=\"paragraph-box-padding-card\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-card\"")
    expect(markup).toContain("aria-expanded=\"true\"")
    expect(markup).toContain("data-testid=\"paragraph-box-fill-preview\"")
    expect(markup).toContain("data-testid=\"paragraph-box-fill-palette-well\"")
    expect(markup).toContain("data-testid=\"paragraph-box-fill-palette-value\"")
    expect(markup).toContain("data-testid=\"paragraph-box-fill-palette-toggle\"")
    expect(markup).toContain("data-testid=\"paragraph-box-padding-compass\"")
    expect(markup).toContain("data-testid=\"paragraph-box-padding-top\"")
    expect(markup).toContain("data-testid=\"paragraph-box-padding-all\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-compass\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-all\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-glyph-top\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-glyph-all\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-clear-mark\"")
    expect(markup).toContain("aria-label=\"Toggle top border\"")
    expect(markup).toContain("aria-label=\"Clear all borders\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-preview\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-style-group\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-style-none\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-style-solid\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-style-dashed\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-style-dotted\"")
    expect(markup).toContain("aria-label=\"Set border style solid\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-width-slider\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-width\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-color-palette-well\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-color-palette-value\"")
    expect(markup).toContain("data-testid=\"paragraph-box-border-color-palette-toggle\"")
    expect(markup).not.toContain(">Apply</button>")
    expect(markup).toContain("Reset box style")
  })

  it("renders flow-stack column edge controls in the property panel", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowParagraph(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "fs1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"flow-stack-panel-tabs\"")
    expect(markup).toContain("data-testid=\"flow-stack-panel-tab-layout\"")
    expect(markup).toContain("data-testid=\"flow-stack-panel-tab-box\"")
    expect(markup).toContain("data-testid=\"flow-stack-panel-layout\"")
    expect(markup).toContain("data-testid=\"flow-stack-panel-box\"")
    expect(markup).toContain("aria-controls=\"flow-stack-panel-layout\"")
    expect(markup).toContain("data-testid=\"flow-stack-column-control\"")
    expect(markup).toContain("data-testid=\"flow-stack-add-before\"")
    expect(markup).toContain("data-testid=\"flow-stack-add-after\"")
    expect(markup).toContain("Column 1")
    expect(markup).toContain("data-testid=\"flow-stack-box-controls\"")
    expect(markup).toContain("data-testid=\"flow-stack-box-fill-card\"")
    expect(markup).toContain("data-testid=\"flow-stack-box-padding-card\"")
    expect(markup).toContain("data-testid=\"flow-stack-box-border-card\"")
    expect(markup).toContain("Min height (pt)")
  })

  it("renders sibling-safe flow-stack resize controls with the min share guard", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowParagraph(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "fs1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"flow-stack-resize-control\"")
    expect(markup).toContain("Resize with neighbor")
    expect(markup).toContain("data-testid=\"info-hint\"")
    expect(markup).toContain("Resize selected column with right neighbor")
  })

  it("keeps balanced flow-row column add guidance in an info hint", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowParagraph(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "fr1",
      selectionAnchorNodeId: "fr1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"flow-row-panel-tabs\"")
    expect(markup).toContain("data-testid=\"flow-row-panel-tab-layout\"")
    expect(markup).toContain("data-testid=\"flow-row-panel-tab-box\"")
    expect(markup).toContain("data-testid=\"flow-row-panel-layout\"")
    expect(markup).toContain("data-testid=\"flow-row-panel-box\"")
    expect(markup).toContain("aria-controls=\"flow-row-panel-layout\"")
    expect(markup).toContain("+ Balanced col")
    expect(markup).toContain("data-testid=\"info-hint\"")
    expect(markup).toContain("Columns")
  })

  it("renders C1 flow-table row and column controls", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ft1",
      selectionAnchorNodeId: "ft1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Flow table")
    expect(markup).toContain("2 rows × 2 cols")
    expect(markup).toContain("data-testid=\"flow-table-header-rows-control\"")
    expect(markup).toContain("data-testid=\"flow-table-header-rows-control-input\"")
    expect(markup).toContain("data-testid=\"flow-table-header-rows-control-repeat\"")
    expect(markup).toContain("Repeat header on new pages")
    expect(markup).toContain("First row")
    expect(markup).toContain("Clear")
    expect(markup).toContain("data-testid=\"flow-table-layout-control\"")
    expect(markup).toContain("data-testid=\"flow-table-fit-width\"")
    expect(markup).toContain("data-testid=\"flow-table-align-control\"")
    expect(markup).toContain("data-testid=\"flow-table-align-left\"")
    expect(markup).toContain("data-testid=\"flow-table-margin-top\"")
    expect(markup).toContain("data-testid=\"flow-table-margin-bottom\"")
    expect(markup).toContain("+ Row")
    expect(markup).toContain("- Last")
    expect(markup).toContain("+ Col")
    expect(markup).toContain("Delete table")
    expect(markup).not.toContain("Delete block")
  })

  it("renders C1 flow-table cell row and column controls", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftc1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Flow table cell")
    expect(markup).toContain("Row 1, Col 1")
    expect(markup).toContain("data-testid=\"flow-table-cell-header-rows-control\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-header-rows-control-repeat\"")
    expect(markup).toContain("Header through row 1")
    expect(markup).toContain("data-testid=\"flow-table-cell-rowspan-input\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-colspan-input\"")
    expect(markup).toContain("data-testid=\"info-hint\"")
    expect(markup).toContain("Merge up")
    expect(markup).toContain("Merge up needs an aligned neighboring origin above")
    expect(markup).toContain("Merge left")
    expect(markup).toContain("Merge left needs an aligned neighboring origin on the left")
    expect(markup).toContain("Merge right")
    expect(markup).toContain("Merge right and append content")
    expect(markup).toContain("Merge down")
    expect(markup).toContain("Merge down and append content")
    expect(markup).toContain("Unmerge")
    expect(markup).toContain("↑ Above")
    expect(markup).toContain("Right →")
    expect(markup).toContain("Delete column")
    expect(markup).toContain("Delete table")
  })

  it("renders a whole-table delete action from a table cell", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithShortIdFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "tc1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Flow table cell")
    expect(markup).toContain("data-testid=\"flow-table-cell-header-rows-control\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-header-rows-control-repeat\"")
    expect(markup).toContain("Header through row 1")
    expect(markup).toContain("Delete column")
    expect(markup).toContain("Delete row")
    expect(markup).toContain("Delete table")
  })

  it("renders table header controls from root and row selections", () => {
    const noop = () => undefined
    const rootMarkup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithShortIdFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "tbl1",
      selectionAnchorNodeId: "tbl1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))
    const flowRowMarkup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftr2",
      selectionAnchorNodeId: "ftr2",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(rootMarkup).toContain("data-testid=\"flow-table-header-rows-control\"")
    expect(rootMarkup).toContain("data-testid=\"flow-table-header-rows-control-input\"")
    expect(rootMarkup).toContain("data-testid=\"flow-table-header-rows-control-repeat\"")
    expect(rootMarkup).toContain("First row")
    expect(rootMarkup).toContain("Clear")
    expect(flowRowMarkup).toContain("data-testid=\"flow-table-row-header-rows-control\"")
    expect(flowRowMarkup).toContain("data-testid=\"flow-table-row-header-rows-control-repeat\"")
    expect(flowRowMarkup).toContain("Header through row 2")
    expect(flowRowMarkup).toContain("Clear")
  })

  it("enables flow-table merge left when an aligned neighboring origin can consume the selected cell", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftc2",
      selectionAnchorNodeId: "p2",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Row 1, Col 2")
    expect(markup).toContain("Merge left into the neighboring origin and append content")
  })

  it("renders C2.3A flow-table cell span controls with the current span values", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithSpannedFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftc1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("data-testid=\"flow-table-cell-rowspan-input\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-colspan-input\"")
    expect(markup).toContain("value=\"2\"")
    expect(markup).toContain("Unmerge")
    expect(markup).toContain("Split selected span into empty cells")
  })

  it("renders every paragraph child in a merged flow-table cell", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithMergedFlowTableCellContent(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftc1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Text 1")
    expect(markup).toContain("Text 2")
    expect(markup).toContain("Text 3")
    expect(markup).toContain("data-testid=\"flow-table-cell-text-0\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-text-1\"")
    expect(markup).toContain("data-testid=\"flow-table-cell-text-2\"")
    expect(markup).toContain(">A</textarea>")
    expect(markup).toContain(">B</textarea>")
    expect(markup).toContain(">C</textarea>")
  })

  it("enables C2.2 safe flow-table delete controls for spanned tables", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithSpannedFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ft1",
      selectionAnchorNodeId: "ft1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("2 rows × 3 cols")
    expect(markup).toContain("title=\"Add row\"")
    expect(markup).toContain("title=\"Add column\"")
    expect(markup).toContain("title=\"Remove last row\"")
    expect(markup).toContain("title=\"Remove last column\"")
  })

  it("blocks C2.2 flow-table delete controls when deletion would move a span origin", () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PropertyPanel, {
      doc: docWithSpannedFlowTable(),
      registry: { version: 1, fields: [] },
      selectedNodeId: "ftc1",
      selectionAnchorNodeId: "p1",
      onUpdateProps: noop,
      onUpdateText: noop,
      onUpdateFieldRef: noop,
      onUpdateParagraphBoxStyle: noop,
      onSelectContextNode: noop,
      onDelete: noop,
      tableOps: {
        addRow: noop,
        removeRow: noop,
        addCol: noop,
        removeCol: noop,
      },
      flowRowOps: {
        addCol: noop,
        resizePair: noop,
      },
    }))

    expect(markup).toContain("Flow table cell")
    expect(markup).toContain("Span-aware row deletion is blocked for this Flow Table target")
    expect(markup).toContain("Span-aware column deletion is blocked for this Flow Table target")
  })
})
