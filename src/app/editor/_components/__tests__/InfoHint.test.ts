import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InfoHint } from "../InfoHint"

describe("InfoHint", () => {
  it("renders a compact information button without a native title tooltip", () => {
    const markup = renderToStaticMarkup(createElement(InfoHint, {
      text: "Adds a balanced column.",
    }))

    expect(markup).toContain("data-testid=\"info-hint\"")
    expect(markup).toContain("aria-label=\"More information\"")
    expect(markup).not.toContain("title=")
    expect(markup).toContain(">i</button>")
  })
})
