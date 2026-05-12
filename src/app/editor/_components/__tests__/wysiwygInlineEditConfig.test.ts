import { describe, expect, it } from "vitest"
import { resolveWysiwygInlineEditEnabled } from "../wysiwygInlineEditConfig"

describe("resolveWysiwygInlineEditEnabled", () => {
  it("keeps the experimental WYSIWYG path disabled by default in every environment", () => {
    expect(resolveWysiwygInlineEditEnabled(undefined, "development")).toBe(false)
    expect(resolveWysiwygInlineEditEnabled(undefined, "test")).toBe(false)
    expect(resolveWysiwygInlineEditEnabled(undefined, "production")).toBe(false)
  })

  it("allows explicit environment overrides", () => {
    expect(resolveWysiwygInlineEditEnabled("true", "production")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("enabled", "development")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("off", "development")).toBe(false)
  })
})
