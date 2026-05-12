import { describe, expect, it } from "vitest"
import { resolveWysiwygInlineEditEnabled } from "../wysiwygInlineEditConfig"

describe("resolveWysiwygInlineEditEnabled", () => {
  it("keeps the experimental WYSIWYG path enabled by default outside production", () => {
    expect(resolveWysiwygInlineEditEnabled(undefined, "development")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled(undefined, "test")).toBe(true)
  })

  it("keeps the experimental WYSIWYG path disabled by default in production", () => {
    expect(resolveWysiwygInlineEditEnabled(undefined, "production")).toBe(false)
  })

  it("allows explicit environment overrides", () => {
    expect(resolveWysiwygInlineEditEnabled("true", "production")).toBe(true)
    expect(resolveWysiwygInlineEditEnabled("off", "development")).toBe(false)
  })
})
