import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EditorPalette } from "../EditorPalette"

describe("EditorPalette", () => {
  it("presents flow-backed rows as the standard Row and Columns blocks", () => {
    const markup = renderToStaticMarkup(createElement(EditorPalette, {
      onDragStart: () => undefined,
      isDragging: false,
    }))

    expect(markup).toContain("Row")
    expect(markup).toContain("Single column")
    expect(markup).toContain("Columns")
    expect(markup).toContain("Multi-page columns")
    expect(markup).not.toContain("Flow cols")
  })
})
