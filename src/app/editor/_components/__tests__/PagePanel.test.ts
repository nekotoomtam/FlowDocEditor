import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { makeHeaderFooterZoneDocument } from "../wysiwygStage3StressScenarios"
import { PagePanel } from "../PagePanel"

describe("PagePanel", () => {
  it("shows header/footer reserved height summary", () => {
    const doc = makeHeaderFooterZoneDocument()
    const markup = renderToStaticMarkup(createElement(PagePanel, {
      doc,
      sectionIndex: 0,
      editable: true,
      onUpdateMargin: () => undefined,
      onUpdateReservedZones: () => undefined,
      onUpdateHeaderFooterMode: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"page-header-footer-card\"")
    expect(markup).toContain("Header/Footer")
    expect(markup).toContain("42 pt / 32 pt")
  })
})
