import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import Home from "../page"

describe("Home", () => {
  it("routes first-time users to the document library", () => {
    const markup = renderToStaticMarkup(createElement(Home))

    expect(markup).toContain("Document Library")
    expect(markup).toContain("href=\"/library\"")
  })
})
