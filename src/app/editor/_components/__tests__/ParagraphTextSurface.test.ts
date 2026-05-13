import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  absoluteInlineEditIndex,
  buildContinuationBackspaceInput,
  buildInlineEditSliceKey,
  buildSplitEditInput,
  ParagraphTextSurface,
  buildWysiwygDraftParagraphLayout,
  buildWysiwygDraftParagraphLines,
  getContinuationEditState,
  getInlineEditVisualMode,
  inlineEditTextareaCaretColor,
  inlineEditTextareaOutline,
  inlineEditTextareaTextColor,
  shouldUseInlineEditDocumentLayer,
  shouldUseInlineEditDocumentVisual,
  shouldUseNativeInlineEditEnter,
  shouldUseNativeTableCellBoundaryBackspace,
  shouldUseInlineEditSvgVisual,
  shouldUseWysiwygTextEngineLayer,
} from "../ParagraphTextSurface"
import type { PageFragment } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import type { TextMeasurer } from "@/layout"

function makeFragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 24,
    lines: [],
    ...overrides,
  }
}

function makeDoc(text = "Hello"): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "p1-text", type: "text", text }],
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

const fixedMeasurer: TextMeasurer = {
  measureText: (text) => ({ width: text.length * 10 }),
  measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => fontSize * lineHeightRatio,
}

describe("ParagraphTextSurface continuation editing", () => {
  it("uses the full text and absolute caret for a first paragraph fragment", () => {
    const state = getContinuationEditState("Hello world", makeFragment({ continuesFrom: false }), 6)

    expect(state.continuationCharStart).toBeNull()
    expect(state.continuationCharEnd).toBeNull()
    expect(state.preText).toBe("")
    expect(state.editText).toBe("Hello world")
    expect(state.postText).toBe("")
    expect(state.adjustedInitialCaret).toBe(6)
  })

  it("uses only continuation text and makes the caret relative to the fragment", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 8)

    expect(state.continuationCharStart).toBe(6)
    expect(state.continuationCharEnd).toBe(11)
    expect(state.preText).toBe("Hello ")
    expect(state.editText).toBe("world")
    expect(state.postText).toBe("")
    expect(state.adjustedInitialCaret).toBe(2)
  })

  it("uses only the current first-fragment text when the paragraph continues", () => {
    const fragment = makeFragment({
      isContinued: true,
      lines: [{
        text: "Hello",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 11)

    expect(state.continuationCharStart).toBe(0)
    expect(state.continuationCharEnd).toBe(5)
    expect(state.preText).toBe("")
    expect(state.editText).toBe("Hello")
    expect(state.postText).toBe(" world")
    expect(state.adjustedInitialCaret).toBe(5)
  })

  it("clamps a continuation caret before the fragment start to zero", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 3)

    expect(state.adjustedInitialCaret).toBe(0)
  })

  it("supports reconstructing the full paragraph text after editing a continuation", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lines: [{
        text: "world",
        x: 0,
        y: 0,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const state = getContinuationEditState("Hello world", fragment, 11)

    expect(state.preText + "there").toBe("Hello there")
  })

  it("falls back to full-text editing when a continuation fragment has no segment offset", () => {
    const state = getContinuationEditState("Hello world", makeFragment({ continuesFrom: true }), 4)

    expect(state.continuationCharStart).toBeNull()
    expect(state.continuationCharEnd).toBeNull()
    expect(state.preText).toBe("")
    expect(state.editText).toBe("Hello world")
    expect(state.postText).toBe("")
    expect(state.adjustedInitialCaret).toBe(4)
  })

  it("maps continuation textarea caret positions to absolute paragraph offsets", () => {
    expect(absoluteInlineEditIndex("Hello ", 2, 5)).toBe(8)
    expect(absoluteInlineEditIndex("Hello ", null, 5)).toBe(11)
  })

  it("splits continuation edit text at the absolute caret offset", () => {
    const input = buildSplitEditInput("Hello ", "wide", 4, 4, " world")

    expect(input.text).toBe("Hello wide world")
    expect(input.splitIndex).toBe("Hello wide".length)
  })

  it("deletes selected local text before splitting a continuation edit", () => {
    const input = buildSplitEditInput("Hello ", "wide world", 4, 10)

    expect(input.text).toBe("Hello wide")
    expect(input.splitIndex).toBe("Hello wide".length)
  })

  it("snaps paragraph splits away from the middle of a grapheme", () => {
    const input = buildSplitEditInput("", "Aก้B", 2, 2)

    expect(input.text).toBe("Aก้B")
    expect(input.splitIndex).toBe(1)
  })

  it("deletes whole graphemes when a split selection touches the middle of one", () => {
    const input = buildSplitEditInput("", "Aก้B", 2, 3)

    expect(input.text).toBe("AB")
    expect(input.splitIndex).toBe(1)
  })

  it("backspaces across a continuation boundary without merging paragraphs", () => {
    const input = buildContinuationBackspaceInput("Hello ", "wide", " world")

    expect(input).toEqual({
      text: "Hellowide world",
      caretIndex: "Hello".length,
    })
  })

  it("backspaces whole graphemes across a continuation boundary", () => {
    const input = buildContinuationBackspaceInput("Aก้", "B")

    expect(input).toEqual({
      text: "AB",
      caretIndex: 1,
    })
  })

  it("leaves first-fragment start backspace for paragraph merge handling", () => {
    expect(buildContinuationBackspaceInput("", "Hello")).toBeNull()
  })

  it("keys inline edit slices by stable fragment identity and slice start", () => {
    const fragment = makeFragment({ fragmentIndex: 1, lineStart: 4, lineEnd: 6 })

    expect(buildInlineEditSliceKey(fragment, 25)).toBe(buildInlineEditSliceKey({ ...fragment, lineEnd: 8 }, 25))
    expect(buildInlineEditSliceKey(fragment, 25)).not.toBe(buildInlineEditSliceKey(fragment, 30))
    expect(buildInlineEditSliceKey(fragment, 25)).not.toBe(buildInlineEditSliceKey({ ...fragment, pageIndex: 1 }, 25))
  })

  it("lets inline textareas keep native multiline Enter editing", () => {
    expect(shouldUseNativeInlineEditEnter()).toBe(true)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "")).toBe(true)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "Hello")).toBe(false)
    expect(shouldUseNativeTableCellBoundaryBackspace(false, "")).toBe(false)
  })
})

describe("ParagraphTextSurface inline edit visual parity", () => {
  it("uses SVG text as the edit visual only when the snapshot is fresh", () => {
    expect(shouldUseInlineEditSvgVisual(true, true)).toBe(true)
    expect(shouldUseInlineEditSvgVisual(true, false)).toBe(false)
    expect(shouldUseInlineEditSvgVisual(false, true)).toBe(false)
  })

  it("keeps textarea text visible while visual lines are stale", () => {
    expect(inlineEditTextareaTextColor(false)).toBe("#1e40af")
    expect(inlineEditTextareaTextColor(true)).toBe("transparent")
  })

  it("uses document visual for fresh collapsed editing or range selection with an overlay", () => {
    expect(shouldUseInlineEditDocumentVisual(true, true, true, false)).toBe(true)
    expect(shouldUseInlineEditDocumentVisual(true, true, false, false, true)).toBe(true)
    expect(shouldUseInlineEditDocumentVisual(true, false, true, false)).toBe(false)
    expect(shouldUseInlineEditDocumentVisual(true, true, false, false)).toBe(false)
    expect(shouldUseInlineEditDocumentVisual(true, true, true, true)).toBe(false)
  })

  it("falls back to visible textarea text when custom caret geometry is missing", () => {
    expect(shouldUseInlineEditDocumentLayer(true, true)).toBe(true)
    expect(shouldUseInlineEditDocumentLayer(true, false)).toBe(false)
    expect(inlineEditTextareaTextColor(shouldUseInlineEditDocumentLayer(true, false))).toBe("#1e40af")
  })

  it("hides the native textarea caret only when a custom caret is available", () => {
    expect(inlineEditTextareaCaretColor(false)).toBe("#1e40af")
    expect(inlineEditTextareaCaretColor(true)).toBe("transparent")
  })

  it("removes textarea chrome when document visual and custom caret are active", () => {
    const mode = getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: true,
      isComposing: false,
      hasCustomCaret: true,
    })

    expect(mode).toMatchObject({
      useDocumentVisual: true,
      useCustomCaret: true,
      fallbackReason: null,
      textareaTextColor: "transparent",
      textareaCaretColor: "transparent",
      textareaOutline: "none",
      textareaOutlineOffset: 0,
    })
  })

  it("keeps textarea visible with an explicit fallback reason when visual mode is unsafe", () => {
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: false,
      isSelectionCollapsed: true,
      isComposing: false,
      hasCustomCaret: true,
    })).toMatchObject({
      useDocumentVisual: false,
      fallbackReason: "stale-visual",
      textareaTextColor: "#1e40af",
      textareaOutline: "2px solid #2563eb",
    })
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: false,
      isComposing: false,
      hasCustomCaret: true,
    }).fallbackReason).toBe("range-selection")
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: false,
      isComposing: false,
      hasCustomCaret: false,
      hasSelectionOverlay: true,
    })).toMatchObject({
      useDocumentVisual: true,
      useCustomCaret: false,
      fallbackReason: null,
      textareaTextColor: "transparent",
      textareaCaretColor: "transparent",
      textareaOutline: "none",
    })
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: true,
      isComposing: true,
      hasCustomCaret: true,
    }).fallbackReason).toBe("composition")
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: false,
      isSelectionCollapsed: true,
      isComposing: true,
      hasCustomCaret: true,
    }).fallbackReason).toBe("composition")
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: true,
      isComposing: false,
      hasCustomCaret: false,
    }).fallbackReason).toBe("missing-caret-geometry")
    expect(getInlineEditVisualMode({
      isEditing: true,
      isVisualFresh: true,
      isSelectionCollapsed: true,
      isComposing: false,
      hasCustomCaret: true,
      isWysiwygEnabled: false,
    })).toMatchObject({
      useDocumentVisual: false,
      fallbackReason: "wysiwyg-disabled",
      textareaTextColor: "#1e40af",
    })
  })

  it("keeps the existing textarea outline helper for fallback mode", () => {
    expect(inlineEditTextareaOutline(false)).toBe("2px solid #2563eb")
    expect(inlineEditTextareaOutline(true)).toBe("none")
  })

  it("enables the text-engine edit layer only when the flagged visual snapshot is fresh", () => {
    expect(shouldUseWysiwygTextEngineLayer({
      enabled: true,
      isEditing: true,
      canPlainTextEdit: true,
      isVisualFresh: true,
    })).toBe(true)
    expect(shouldUseWysiwygTextEngineLayer({
      enabled: false,
      isEditing: true,
      canPlainTextEdit: true,
      isVisualFresh: true,
    })).toBe(false)
    expect(shouldUseWysiwygTextEngineLayer({
      enabled: true,
      isEditing: true,
      canPlainTextEdit: true,
      isVisualFresh: false,
    })).toBe(false)
    expect(shouldUseWysiwygTextEngineLayer({
      enabled: true,
      isEditing: true,
      canPlainTextEdit: true,
      isVisualFresh: true,
      supportsLocalDraftLayout: false,
    })).toBe(false)
  })

  it("renders the flagged text-engine edit lane from document lines without textarea markup", () => {
    const fragment = makeFragment({
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 14,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc: makeDoc("Hello"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      showTextSegments: false,
      initialCaretIndex: 5,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).toContain("data-inline-edit-visual-mode=\"text-engine\"")
    expect(markup).toContain("data-wysiwyg-hit-area=\"true\"")
    expect(markup).toContain("data-wysiwyg-caret=\"true\"")
    expect(markup).toContain("Hello")
    expect(markup).not.toContain("<textarea")
  })

  it("renders text-engine selection overlays from FlowDoc line geometry", () => {
    const fragment = makeFragment({
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 14,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc: makeDoc("Hello"),
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextSelection: { anchorOffset: 1, focusOffset: 4 },
      showTextSegments: false,
      initialCaretIndex: 4,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).toContain("data-wysiwyg-selection=\"true\"")
    expect(markup).toContain("width=\"30\"")
    expect(markup).not.toContain("<textarea")
  })

  it("does not use the text-engine lane for continuation fragments", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lineStart: 1,
      lineEnd: 2,
      lines: [{
        text: "world",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 14,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc: makeDoc("Hello world"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      showTextSegments: false,
      initialCaretIndex: 8,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
    })))

    expect(markup).not.toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).toContain("<textarea")
  })

  it("uses the text-engine lane for continuation fragments after draft pagination", () => {
    const fragment = makeFragment({
      continuesFrom: true,
      lineStart: 1,
      lineEnd: 2,
      lines: [{
        text: "world",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "world", start: 6, end: 11, x: 0, width: 50, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 14,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc: makeDoc("Hello world"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello world",
      wysiwygTextCaretOffset: 8,
      wysiwygTextDraftPaginationActive: true,
      showTextSegments: false,
      initialCaretIndex: 8,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).toContain("data-wysiwyg-reflow-kind=\"soft\"")
    expect(markup).not.toContain("<textarea")
  })

  it("marks local draft layout as hard-page-boundary when it grows past page content", () => {
    const fragment = makeFragment({
      y: 20,
      width: 200,
      height: 12,
      lines: [{
        text: "A",
        x: 10,
        y: 20,
        width: 10,
        height: 12,
        segments: [{ kind: "word", text: "A", start: 0, end: 1, x: 0, width: 10, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 12,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc: makeDoc("A"),
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 30,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "A\nB",
      wysiwygTextCaretOffset: 3,
      showTextSegments: false,
      initialCaretIndex: 1,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-reflow-kind=\"hard-page-boundary\"")
    expect(markup).toContain("A")
    expect(markup).toContain("B")
  })

  it("can render text-engine draft text from local paragraph measurement", () => {
    const doc = makeDoc("Hello")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({
      width: 200,
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 12,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 12,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const draftLines = buildWysiwygDraftParagraphLines(fragment, paragraph, "Hello!", fixedMeasurer)

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello!",
      wysiwygTextCaretOffset: 6,
      showTextSegments: false,
      initialCaretIndex: 5,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    expect(draftLines?.[0].text).toBe("Hello!")
    expect(markup).toContain("Hello!")
    expect(markup).toContain("data-wysiwyg-input-bridge=\"true\"")
    expect(markup).not.toContain("<textarea")
  })

  it("builds draft layout with paginator line positioning and measured height", () => {
    const doc = makeDoc("A\nBC")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.align = "center"
    paragraph.props.spacingBefore = { value: 2, unit: "pt" }
    paragraph.props.spacingAfter = { value: 3, unit: "pt" }
    const fragment = makeFragment({ x: 10, y: 20, width: 80 })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "A\nBC", fixedMeasurer)

    expect(layout?.height).toBe(29)
    expect(layout?.lines.map((line) => line.text)).toEqual(["A", "BC"])
    expect(layout?.lines.map((line) => line.y)).toEqual([22, 34])
    expect(layout?.lines.map((line) => line.x)).toEqual([45, 40])
  })

  it("does not collapse continuation fragments into one local draft layout", () => {
    const doc = makeDoc("Hello world")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({ continuesFrom: true, lineStart: 1, lineEnd: 2 })

    expect(buildWysiwygDraftParagraphLayout(fragment, paragraph, "Hello world!", fixedMeasurer)).toBeNull()
  })
})
