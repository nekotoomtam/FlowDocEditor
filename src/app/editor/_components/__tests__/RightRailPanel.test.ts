import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RightRailPanelHeader } from "../RightRailPanel"

describe("RightRailPanel", () => {
  it("renders the shared right-rail header shape with an optional action", () => {
    const markup = renderToStaticMarkup(createElement(RightRailPanelHeader, {
      title: "Page",
      testId: "shared-header",
      action: createElement("button", { type: "button" }, "path"),
    }))

    expect(markup).toContain("data-testid=\"shared-header\"")
    expect(markup).toContain("Page")
    expect(markup).toContain("path")
    expect(markup).toContain("min-height:42px")
    expect(markup).toContain("text-transform:uppercase")
  })
})
