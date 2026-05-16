import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
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

describe("PropertyPanel selection context", () => {
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

    expect(markup).toContain("data-testid=\"selection-context-button\"")
    expect(markup).toContain("path")
    expect(markup).toContain("data-testid=\"paragraph-panel-tabs\"")
    expect(markup).not.toContain("position:sticky")
    expect(markup).toContain("data-testid=\"paragraph-panel-tab-text\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-tab-box\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-text\"")
    expect(markup).toContain("data-testid=\"paragraph-panel-box\"")
    expect(markup).toContain("aria-selected=\"true\"")
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
    expect(markup).toContain("data-testid=\"paragraph-box-fill-input\"")
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
    expect(markup).toContain("Apply")
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
})
