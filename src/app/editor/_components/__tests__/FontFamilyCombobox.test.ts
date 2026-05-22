import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { listSelectableFontEntries } from "@/font-registry"
import {
  FontFamilyCombobox,
  filterFontComboboxOptions,
  resolveFontComboboxValue,
} from "../FontFamilyCombobox"

describe("FontFamilyCombobox", () => {
  const options = listSelectableFontEntries()

  it("filters by registered font metadata", () => {
    const filtered = filterFontComboboxOptions(options, "noto")

    expect(filtered.map((font) => font.key)).toEqual(["notoSansThai"])
  })

  it("keeps the selectable catalog order for an empty query", () => {
    expect(filterFontComboboxOptions(options, "").map((font) => font.key)).toEqual(
      options.map((font) => font.key),
    )
  })

  it("resolves legacy font keys through the registry fallback", () => {
    expect(resolveFontComboboxValue("default", options).key).toBe("sarabun")
  })

  it("renders the selected font name in its registered CSS family", () => {
    const markup = renderToStaticMarkup(createElement(FontFamilyCombobox, {
      value: "notoSansThai",
      options,
      onChange: () => undefined,
      testId: "paragraph-font-family",
    }))

    expect(markup).toContain("data-testid=\"paragraph-font-family\"")
    expect(markup).toContain("role=\"combobox\"")
    expect(markup).toContain("Noto Sans Thai")
    expect(markup).toContain("FlowDocNotoSansThai")
  })
})
