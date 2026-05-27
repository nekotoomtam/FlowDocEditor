import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { createDefaultDocument, TOR_BODY_PARAGRAPH_STYLE_ID } from "@/document"
import { StyleDefinitionPanel } from "../StyleDefinitionPanel"

describe("StyleDefinitionPanel", () => {
  it("renders the selected paragraph style definition summary", () => {
    const markup = renderToStaticMarkup(createElement(StyleDefinitionPanel, {
      doc: createDefaultDocument("Style definition"),
      selectedStyleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      editable: true,
    }))

    expect(markup).toContain("data-testid=\"style-definition-panel\"")
    expect(markup).toContain("data-editable=\"true\"")
    expect(markup).toContain("data-testid=\"style-definition-source-badge\"")
    expect(markup).toContain("Base")
    expect(markup).toContain("data-testid=\"style-definition-name-input\"")
    expect(markup).toContain("value=\"TOR Body\"")
    expect(markup).toContain(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(markup).toContain("data-testid=\"style-definition-font-size\"")
    expect(markup).toContain("data-testid=\"style-definition-font-size-input\"")
    expect(markup).toContain("value=\"12\"")
    expect(markup).toContain("data-testid=\"style-definition-text-color-input\"")
    expect(markup).toContain("data-testid=\"style-definition-text-toggles-bold\"")
    expect(markup).toContain("data-testid=\"style-definition-align-left\"")
    expect(markup).toContain("data-testid=\"style-definition-line-height-input\"")
    expect(markup).toContain("data-testid=\"style-definition-spacing-before-input\"")
    expect(markup).toContain("data-testid=\"style-definition-spacing-after-input\"")
    expect(markup).toContain("data-testid=\"style-definition-heading-1\"")
    expect(markup).toContain("data-testid=\"style-definition-heading-6\"")
    expect(markup).toContain("data-testid=\"style-definition-keep-next-on\"")
    expect(markup).toContain("data-testid=\"style-definition-font-family-select\"")
    expect(markup).toContain("Sarabun")
    expect(markup).toContain("data-testid=\"style-definition-text-indent-input\"")
    expect(markup).toContain("data-testid=\"style-definition-indent-left-input\"")
    expect(markup).toContain("data-testid=\"style-definition-indent-right-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-fill-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-padding-top-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-padding-right-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-padding-bottom-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-padding-left-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-border-style-solid\"")
    expect(markup).toContain("data-testid=\"style-definition-box-border-width-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-border-color-input\"")
  })

  it("renders an empty state without a selected style", () => {
    const markup = renderToStaticMarkup(createElement(StyleDefinitionPanel, {
      doc: createDefaultDocument("Style definition"),
      selectedStyleId: null,
      editable: true,
    }))

    expect(markup).toContain("data-testid=\"style-definition-empty\"")
    expect(markup).toContain("No style selected")
  })

  it("renders a missing state when the selected style id is not in the document", () => {
    const markup = renderToStaticMarkup(createElement(StyleDefinitionPanel, {
      doc: createDefaultDocument("Style definition"),
      selectedStyleId: "missing.style",
      editable: false,
    }))

    expect(markup).toContain("data-editable=\"false\"")
    expect(markup).toContain("data-testid=\"style-definition-missing\"")
    expect(markup).toContain("Style not found")
  })

  it("disables editable fields when the host is not editable", () => {
    const markup = renderToStaticMarkup(createElement(StyleDefinitionPanel, {
      doc: createDefaultDocument("Style definition"),
      selectedStyleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      editable: false,
    }))

    expect(markup).toContain("data-testid=\"style-definition-name-input\"")
    expect(markup).toContain("data-testid=\"style-definition-font-family-select\"")
    expect(markup).toContain("data-testid=\"style-definition-font-size-input\"")
    expect(markup).toContain("data-testid=\"style-definition-line-height-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-fill-input\"")
    expect(markup).toContain("data-testid=\"style-definition-box-border-width-input\"")
    expect(markup).toContain("disabled=\"\"")
  })
})
