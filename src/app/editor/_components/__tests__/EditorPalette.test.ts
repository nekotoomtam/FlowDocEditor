import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EditorPalette } from "../EditorPalette"

describe("EditorPalette", () => {
  it("presents layout presets, the column modifier, and table picker entry", () => {
    const markup = renderToStaticMarkup(createElement(EditorPalette, {
      onDragStart: () => undefined,
      isDragging: false,
    }))

    expect(markup).toContain("Layout")
    expect(markup).toContain("Row")
    expect(markup).toContain("Column")
    expect(markup).toContain("50 | 50")
    expect(markup).toContain("66 | 33")
    expect(markup).toContain("33 | 66")
    expect(markup).toContain("33 | 33 | 33")
    expect(markup).toContain("25 | 25 | 25 | 25")
    expect(markup).toContain("Table")
    expect(markup).toContain("aria-expanded=\"false\"")
    expect(markup).toContain("Paragraph")
    expect(markup).toContain("Divider")
    expect(markup).toContain("Page break")
    expect(markup).not.toContain("Flow cols")
  })

  it("filters the palette to supported header/footer blocks", () => {
    const markup = renderToStaticMarkup(createElement(EditorPalette, {
      onDragStart: () => undefined,
      isDragging: false,
      scope: "headerFooter",
    }))

    expect(markup).toContain("data-scope=\"headerFooter\"")
    expect(markup).toContain("50 | 50")
    expect(markup).toContain("66 | 33")
    expect(markup).toContain("33 | 66")
    expect(markup).toContain("33 | 33 | 33")
    expect(markup).toContain("25 | 25 | 25 | 25")
    expect(markup).toContain("Paragraph")
    expect(markup).toContain("Divider")
    expect(markup).not.toContain("Page break")
    expect(markup).not.toContain("data-testid=\"palette-block-row\"")
    expect(markup).not.toContain("data-testid=\"palette-block-column\"")
    expect(markup).not.toContain("data-testid=\"palette-table-picker-toggle\"")
  })
})
