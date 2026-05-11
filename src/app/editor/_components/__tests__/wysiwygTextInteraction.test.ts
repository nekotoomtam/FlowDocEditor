import { describe, expect, it } from "vitest"
import {
  classifyInlineEditKey,
  getInlineEditClipboardPolicy,
  getInlineEditSelectionSnapshot,
  getWysiwygNativeFallbackReasons,
  getWysiwygSelectedText,
  normalizeWysiwygTextRange,
  replaceWysiwygTextRange,
  shouldUseWysiwygNativeFallback,
} from "../wysiwygTextInteraction"

describe("WYSIWYG text interaction policy", () => {
  it("requires native textarea fallback during composition", () => {
    expect(shouldUseWysiwygNativeFallback({ isComposing: true })).toBe(true)
    expect(getWysiwygNativeFallbackReasons({ isComposing: true })).toEqual(["composition"])
  })

  it("requires native textarea fallback for clipboard and accessibility paths", () => {
    expect(getWysiwygNativeFallbackReasons({
      isClipboardOperationActive: true,
      requiresNativeAccessibility: true,
    })).toEqual(["clipboard", "accessibility"])
  })

  it("requires native fallback when visual geometry is stale or unavailable", () => {
    expect(getWysiwygNativeFallbackReasons({
      isVisualFresh: false,
      hasMappingGeometry: false,
    })).toEqual(["stale-visual", "missing-geometry"])
  })

  it("allows custom visual handling only when no fallback reason is active", () => {
    expect(shouldUseWysiwygNativeFallback({
      isVisualFresh: true,
      hasMappingGeometry: true,
    })).toBe(false)
  })
})

describe("inline edit input policy", () => {
  it("lets native IME composition own keys", () => {
    expect(classifyInlineEditKey({ key: "Enter", isComposing: true })).toEqual({ action: "native" })
    expect(classifyInlineEditKey({ key: "Backspace", isComposing: true, selectionStart: 0, selectionEnd: 0 })).toEqual({ action: "native" })
  })

  it("classifies current custom keyboard paths without changing native shortcuts", () => {
    expect(classifyInlineEditKey({ key: "Escape" })).toEqual({ action: "end-edit", reason: "escape" })
    expect(classifyInlineEditKey({ key: "Enter" })).toEqual({ action: "split-paragraph" })
    expect(classifyInlineEditKey({ key: "Enter", shiftKey: true })).toEqual({ action: "native" })
    expect(classifyInlineEditKey({ key: "z", ctrlKey: true })).toEqual({ action: "native" })
  })

  it("classifies only boundary backspace as merge/boundary handling", () => {
    expect(classifyInlineEditKey({
      key: "Backspace",
      selectionStart: 0,
      selectionEnd: 0,
      valueLength: 5,
    })).toEqual({ action: "merge-or-boundary-backspace" })
    expect(classifyInlineEditKey({
      key: "Backspace",
      selectionStart: 2,
      selectionEnd: 2,
      valueLength: 5,
    })).toEqual({ action: "native" })
    expect(classifyInlineEditKey({
      key: "Backspace",
      selectionStart: 0,
      selectionEnd: 2,
      valueLength: 5,
    })).toEqual({ action: "native" })
  })

  it("keeps clipboard operations native by default", () => {
    expect(getInlineEditClipboardPolicy("copy")).toEqual({
      type: "copy",
      handling: "native",
      preventDefault: false,
    })
    expect(getInlineEditClipboardPolicy("cut")).toMatchObject({ handling: "native", preventDefault: false })
    expect(getInlineEditClipboardPolicy("paste")).toMatchObject({ handling: "native", preventDefault: false })
  })

  it("captures textarea selection as full paragraph offsets for continuation editing", () => {
    const snapshot = getInlineEditSelectionSnapshot({
      value: "world",
      selectionStart: 1,
      selectionEnd: 4,
      selectionDirection: "forward",
    }, "Hello ")

    expect(snapshot).toMatchObject({
      anchorOffset: 7,
      focusOffset: 10,
      startOffset: 7,
      endOffset: 10,
      localAnchorOffset: 1,
      localFocusOffset: 4,
      direction: "forward",
    })
  })

  it("preserves backward textarea selection direction in full paragraph offsets", () => {
    const snapshot = getInlineEditSelectionSnapshot({
      value: "world",
      selectionStart: 1,
      selectionEnd: 4,
      selectionDirection: "backward",
    }, "Hello ")

    expect(snapshot).toMatchObject({
      anchorOffset: 10,
      focusOffset: 7,
      startOffset: 7,
      endOffset: 10,
      localAnchorOffset: 4,
      localFocusOffset: 1,
      direction: "backward",
    })
  })
})

describe("WYSIWYG text range helpers", () => {
  it("normalizes forward and backward selections while preserving direction", () => {
    expect(normalizeWysiwygTextRange({ anchorOffset: 2, focusOffset: 5 }, 10)).toMatchObject({
      startOffset: 2,
      endOffset: 5,
      direction: "forward",
      isCollapsed: false,
    })
    expect(normalizeWysiwygTextRange({ anchorOffset: 5, focusOffset: 2 }, 10)).toMatchObject({
      startOffset: 2,
      endOffset: 5,
      direction: "backward",
      isCollapsed: false,
    })
  })

  it("clamps ranges to the paragraph text length", () => {
    expect(normalizeWysiwygTextRange({ anchorOffset: -10, focusOffset: 99 }, 5)).toEqual({
      anchorOffset: 0,
      focusOffset: 5,
      startOffset: 0,
      endOffset: 5,
      isCollapsed: false,
      direction: "forward",
    })
  })

  it("extracts selected text using normalized paragraph offsets", () => {
    expect(getWysiwygSelectedText("Hello world", { anchorOffset: 11, focusOffset: 6 })).toBe("world")
  })

  it("replaces selected text and collapses the caret after the inserted text", () => {
    const result = replaceWysiwygTextRange("Hello world", { anchorOffset: 6, focusOffset: 11 }, "ตูม")

    expect(result.text).toBe("Hello ตูม")
    expect(result.caretOffset).toBe("Hello ตูม".length)
    expect(result.selection).toMatchObject({
      anchorOffset: "Hello ตูม".length,
      focusOffset: "Hello ตูม".length,
      isCollapsed: true,
      direction: "none",
    })
  })
})
