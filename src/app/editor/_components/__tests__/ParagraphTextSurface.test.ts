import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  absoluteInlineEditIndex,
  buildContinuationBackspaceInput,
  buildInlineEditSliceKey,
  buildSplitEditInput,
  focusElementWithoutScroll,
  ParagraphTextSurface,
  buildWysiwygDraftParagraphLayout,
  buildWysiwygDraftParagraphLines,
  getContinuationEditState,
  getInlineEditVisualMode,
  inlineEditTextareaCaretColor,
  inlineEditTextareaOutline,
  inlineEditTextareaTextColor,
  hasWysiwygTextDraftChange,
  isWysiwygTextSessionFocusTarget,
  resolveWysiwygLiveTextEcho,
  resolveWysiwygTextPointerOffsetFromFragmentTargets,
  resolveWysiwygWordSelectionRange,
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

function makeTableDoc(text = "Cell text"): DocumentNode {
  const paragraph = {
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
  }

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
          body: { id: "body", type: "body", props: {}, childIds: ["tbl"] },
          tbl: {
            id: "tbl",
            type: "table",
            props: {},
            rowIds: ["r1"],
            nodes: {
              r1: { id: "r1", type: "table-row", props: {}, cellIds: ["c1"] },
              c1: { id: "c1", type: "table-cell", props: {}, childIds: ["p1"] },
              p1: paragraph,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeFlowTableDoc(text = "Flow cell text"): DocumentNode {
  const paragraph = {
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
  }

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
          body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
          ft1: {
            id: "ft1",
            type: "flow-table",
            props: {},
            rowIds: ["r1"],
            columns: [{ width: { value: 100, unit: "percent" } }],
            nodes: {
              r1: { id: "r1", type: "flow-table-row", props: {}, cellIds: ["c1"] },
              c1: { id: "c1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
              p1: paragraph,
            },
          },
        },
      }],
    },
  } as unknown as DocumentNode
}

function makeStackDoc(text = "Stack text"): DocumentNode {
  const paragraph = {
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
  }

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
          body: { id: "body", type: "body", props: {}, childIds: ["row1"] },
          row1: { id: "row1", type: "row", props: {}, childIds: ["st1", "st2"] },
          st1: { id: "st1", type: "stack", props: { widthShare: 50 }, childIds: ["p1"] },
          st2: { id: "st2", type: "stack", props: { widthShare: 50 }, childIds: ["p2"] },
          p1: paragraph,
          p2: {
            ...paragraph,
            id: "p2",
            children: [{ id: "p2-text", type: "text", text: "Sibling stack text" }],
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

function makeFocusElement(
  attrs: Record<string, string>,
  parentElement: Element | null = null,
): Element {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    parentElement,
  } as unknown as Element
}

describe("ParagraphTextSurface focus behavior", () => {
  it("focuses with preventScroll so edit entry does not force the viewport to jump", () => {
    const calls: Array<FocusOptions | undefined> = []

    focusElementWithoutScroll({
      focus: (options?: FocusOptions) => {
        calls.push(options)
      },
    })

    expect(calls).toEqual([{ preventScroll: true }])
  })

  it("falls back to plain focus when focus options are unsupported", () => {
    const calls: Array<FocusOptions | "plain"> = []

    focusElementWithoutScroll({
      focus: (options?: FocusOptions) => {
        if (!options) {
          calls.push("plain")
          return
        }
        calls.push(options)
        throw new Error("focus options unsupported")
      },
    })

    expect(calls).toEqual([{ preventScroll: true }, "plain"])
  })

  it("ignores a missing focus target", () => {
    expect(() => focusElementWithoutScroll(null)).not.toThrow()
  })

  it("keeps WYSIWYG focus when a same-node input bridge replaces the active layer", () => {
    const layer = makeFocusElement({
      "data-inline-edit-node-id": "p1",
      "data-wysiwyg-text-engine-layer": "true",
    })
    const bridge = makeFocusElement({
      "data-inline-edit-node-id": "p1",
      "data-wysiwyg-input-bridge": "true",
    }, layer)
    const nextBridge = makeFocusElement({
      "data-inline-edit-node-id": "p1",
      "data-wysiwyg-input-bridge": "true",
    })
    const outsideBridge = makeFocusElement({
      "data-inline-edit-node-id": "p2",
      "data-wysiwyg-input-bridge": "true",
    })

    expect(isWysiwygTextSessionFocusTarget(bridge, "p1")).toBe(true)
    expect(isWysiwygTextSessionFocusTarget(nextBridge, "p1")).toBe(true)
    expect(isWysiwygTextSessionFocusTarget(outsideBridge, "p1")).toBe(false)
    expect(isWysiwygTextSessionFocusTarget(null, "p1")).toBe(false)
  })
})

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

  it("keeps an Enter-created empty line in the active continuation slice", () => {
    const fragment = makeFragment({
      isContinued: true,
      lines: [
        {
          text: "Hello",
          x: 0,
          y: 0,
          width: 50,
          height: 12,
          segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
        },
        { text: "", x: 0, y: 12, width: 0, height: 12 },
      ],
    })

    const state = getContinuationEditState("Hello\nworld", fragment, 6)

    expect(state.continuationCharStart).toBe(0)
    expect(state.continuationCharEnd).toBe(6)
    expect(state.editText).toBe("Hello\n")
    expect(state.postText).toBe("world")
    expect(state.adjustedInitialCaret).toBe(6)
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

  it("backspaces one repeated Thai sara am across a continuation boundary", () => {
    const input = buildContinuationBackspaceInput("กำำ", "B")

    expect(input).toEqual({
      text: "กำB",
      caretIndex: 2,
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

  it("does not treat edit enter as a draft layout change", () => {
    expect(hasWysiwygTextDraftChange("same text", "same text")).toBe(false)
    expect(hasWysiwygTextDraftChange("same text", "same text!")).toBe(true)
    expect(hasWysiwygTextDraftChange(null, "draft")).toBe(false)
    expect(hasWysiwygTextDraftChange("same text", null)).toBe(false)
  })

  it("resolves inserted text for a deferred live echo", () => {
    expect(resolveWysiwygLiveTextEcho("Hello", "Hello world")).toEqual({
      anchorOffset: 5,
      text: " world",
    })
    expect(resolveWysiwygLiveTextEcho("Hello world", "Hello wide world")).toEqual({
      anchorOffset: 7,
      text: "ide w",
    })
    expect(resolveWysiwygLiveTextEcho("Hello", "Hell")).toBeNull()
  })

  it("resolves a double-click word selection range from draft text", () => {
    expect(resolveWysiwygWordSelectionRange("Hello world", 1)).toEqual({
      anchorOffset: 0,
      focusOffset: 5,
    })
    expect(resolveWysiwygWordSelectionRange("Hello world", 6)).toEqual({
      anchorOffset: 6,
      focusOffset: 11,
    })
    expect(resolveWysiwygWordSelectionRange("Hello world", 5)).toEqual({
      anchorOffset: 0,
      focusOffset: 5,
    })
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
    expect(markup).toContain("data-wysiwyg-caret-blink=\"true\"")
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

  it("renders passive text-engine selection overlays on non-active continuation fragments", () => {
    const fragment = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
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
      pageKey: "0-1",
      scale: 1,
      textMeasurer: fixedMeasurer,
      isEditing: false,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextSelection: { anchorOffset: 0, focusOffset: 11 },
      showTextSegments: false,
      initialCaretIndex: null,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-selection=\"true\"")
    expect(markup).toContain("world")
    expect(markup).not.toContain("data-wysiwyg-text-engine-layer=\"true\"")
    expect(markup).not.toContain("<textarea")
  })

  it("resolves pointer offsets from continuation fragment page targets", () => {
    const firstFragment = makeFragment({
      pageIndex: 0,
      fragmentIndex: 0,
      lineStart: 0,
      lineEnd: 1,
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
    })
    const continuationFragment = makeFragment({
      pageIndex: 1,
      fragmentIndex: 1,
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
    })
    const pageRects = new Map([
      ["0-0", { left: 0, top: 0 }],
      ["0-1", { left: 400, top: 0 }],
    ])

    expect(resolveWysiwygTextPointerOffsetFromFragmentTargets({
      clientX: 430,
      clientY: 22,
      scale: 1,
      targets: [
        { pageKey: "0-0", fragment: firstFragment },
        { pageKey: "0-1", fragment: continuationFragment },
      ],
      getPageRect: (pageKey) => pageRects.get(pageKey),
      textMeasurer: fixedMeasurer,
    })).toBe(8)
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

  it("uses the text-engine lane for table-cell paragraphs while keeping cell boundary rules separate", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      lines: [{
        text: "Cell text",
        x: 10,
        y: 20,
        width: 80,
        height: 14,
        segments: [{ kind: "word", text: "Cell text", start: 0, end: 9, x: 0, width: 80, breakableAfter: false }],
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
      doc: makeTableDoc("Cell text"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Cell text draft",
      wysiwygTextCaretOffset: 15,
      showTextSegments: false,
      initialCaretIndex: 0,
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
    expect(markup).toContain("data-inline-edit-visual-mode=\"text-engine\"")
    expect(markup).toContain("data-wysiwyg-input-bridge=\"true\"")
    expect(markup).toContain("caret-color:transparent")
    expect(markup).not.toContain("<textarea")
  })

  it("uses the text-engine lane for flow-table-cell paragraphs", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      lines: [{
        text: "Flow cell text",
        x: 10,
        y: 20,
        width: 100,
        height: 14,
        segments: [{ kind: "word", text: "Flow cell text", start: 0, end: 14, x: 0, width: 100, breakableAfter: false }],
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
      doc: makeFlowTableDoc("Flow cell text"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Flow cell text draft",
      wysiwygTextCaretOffset: 20,
      showTextSegments: false,
      initialCaretIndex: 0,
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
    expect(markup).toContain("data-inline-edit-visual-mode=\"text-engine\"")
    expect(markup).toContain("data-wysiwyg-input-bridge=\"true\"")
    expect(markup).not.toContain("<textarea")
  })

  it("renders table-cell local draft lines for same-page line-count changes", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      width: 120,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
      lines: [{
        text: "Cell",
        x: 10,
        y: 20,
        width: 40,
        height: 12,
        segments: [{ kind: "word", text: "Cell", start: 0, end: 4, x: 0, width: 40, breakableAfter: false }],
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
      doc: makeTableDoc("Cell"),
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 200,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Cell\nnext",
      wysiwygTextCaretOffset: 9,
      showTextSegments: false,
      initialCaretIndex: 4,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-reflow-kind=\"hard-local\"")
    expect(markup).toContain("Cell")
    expect(markup).toContain("next")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
    expect(markup).not.toContain("<textarea")
  })

  it("renders flow-table-cell local draft lines for same-page line-count changes", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      width: 120,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
      lines: [{
        text: "Flow",
        x: 10,
        y: 20,
        width: 40,
        height: 12,
        segments: [{ kind: "word", text: "Flow", start: 0, end: 4, x: 0, width: 40, breakableAfter: false }],
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
      doc: makeFlowTableDoc("Flow"),
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 200,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Flow\nnext",
      wysiwygTextCaretOffset: 9,
      showTextSegments: false,
      initialCaretIndex: 4,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    expect(markup).toContain("data-wysiwyg-reflow-kind=\"hard-local\"")
    expect(markup).toContain("Flow")
    expect(markup).toContain("next")
    expect(markup).not.toContain("<textarea")
  })

  it("keeps table-cell page-boundary draft text on the settled pagination visual path", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      y: 20,
      width: 120,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
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
      doc: makeTableDoc("A"),
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
    expect(markup).toContain("data-wysiwyg-table-cell-preview-candidate=\"true\"")
    expect(markup).toContain("A")
    expect(markup).not.toContain(">B<")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).not.toContain("<textarea")
  })

  it("clears the table-cell preview candidate once draft pagination is already active", () => {
    const fragment = makeFragment({
      parentNodeId: "c1",
      y: 20,
      width: 120,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
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
      doc: makeTableDoc("A"),
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
      wysiwygTextDraftPaginationActive: true,
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
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
    expect(markup).not.toContain("<textarea")
  })

  it("keeps row-stack paragraphs on the text-engine path without textarea fallback", () => {
    const fragment = makeFragment({
      parentNodeId: "st1",
      lines: [{
        text: "Stack text",
        x: 10,
        y: 20,
        width: 90,
        height: 14,
        segments: [{ kind: "word", text: "Stack text", start: 0, end: 10, x: 0, width: 90, breakableAfter: false }],
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
      doc: makeStackDoc("Stack text"),
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Stack text draft",
      wysiwygTextCaretOffset: 16,
      showTextSegments: false,
      initialCaretIndex: 0,
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
    expect(markup).toContain("data-inline-edit-visual-mode=\"text-engine\"")
    expect(markup).toContain("data-wysiwyg-input-bridge=\"true\"")
    expect(markup).not.toContain("<textarea")
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

  it("renders draft lines while deferring downstream layout past the page boundary", () => {
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
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-caret=\"true\"")
    expect(markup).toContain("A")
    expect(markup).toContain("B")
  })

  it("can render a parent-split draft slice while still classifying the full draft as page-boundary reflow", () => {
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
      wysiwygTextVisualDraftLines: fragment.lines,
      wysiwygTextCaretOffset: 1,
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
    expect(markup).not.toContain(">B<")
  })

  it("renders draft lines while deferring downstream layout when line count changes", () => {
    const doc = makeDoc("Hello")
    const fragment = makeFragment({
      width: 50,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc,
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 200,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello world",
      wysiwygTextCaretOffset: 11,
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

    expect(markup).toContain("data-wysiwyg-reflow-kind=\"hard-local\"")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).toContain("Hello")
    expect(markup).toContain("world")
  })

  it("moves the draft caret to the next line for deferred Enter input", () => {
    const doc = makeDoc("Hello")
    const fragment = makeFragment({
      width: 50,
      height: 12,
      lineStart: 0,
      lineEnd: 1,
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc,
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 200,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello\n",
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

    expect(markup).toContain("data-wysiwyg-reflow-kind=\"hard-local\"")
    expect(markup).toContain("data-wysiwyg-caret=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-caret=\"true\"")
    expect(markup).toContain("y1=\"12\"")
  })

  it("keeps a visible caret at flow-table-cell line ends around an Enter-created line", () => {
    const doc = makeFlowTableDoc("Hello\n")
    const fragment = makeFragment({
      parentNodeId: "c1",
      width: 50,
      height: 24,
      lineStart: 0,
      lineEnd: 2,
      lines: [
        {
          text: "Hello",
          x: 10,
          y: 20,
          width: 50,
          height: 12,
          segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
        },
        { text: "", x: 10, y: 32, width: 0, height: 12 },
      ],
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
    const renderCaret = (initialCaretIndex: number) => renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc,
      pageKey: "0-0",
      scale: 1,
      pageContentBottom: 200,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: true,
      wysiwygTextEngineEnabled: false,
      showTextSegments: false,
      initialCaretIndex,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
      onWysiwygTextDraftChange: () => undefined,
    })))

    const lineEndMarkup = renderCaret(5)
    const emptyLineMarkup = renderCaret(6)

    expect(lineEndMarkup).toContain("data-wysiwyg-caret=\"true\"")
    expect(lineEndMarkup).toContain("x1=\"60\"")
    expect(lineEndMarkup).toContain("y1=\"20\"")
    expect(emptyLineMarkup).toContain("data-wysiwyg-caret=\"true\"")
    expect(emptyLineMarkup).toContain("x1=\"10\"")
    expect(emptyLineMarkup).toContain("y1=\"32\"")
  })

  it("can render text-engine draft text from local paragraph measurement", () => {
    const doc = makeDoc("Hello")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({
      width: 200,
      height: 12,
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
    expect(markup).toContain("aria-describedby=\"flowdoc-wysiwyg-text-status\"")
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

  it("allows the first continued fragment to seed a canvas-owned draft preview", () => {
    const doc = makeDoc("Hello world")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({ isContinued: true, lineStart: 0, lineEnd: 1 })

    expect(buildWysiwygDraftParagraphLayout(
      fragment,
      paragraph,
      "Hello world!",
      fixedMeasurer,
      { allowContinuedFirstFragment: true },
    )?.lines.map((line) => line.text)).toEqual(["Hello world!"])
  })
})
