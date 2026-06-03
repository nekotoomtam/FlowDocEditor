import { afterEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  absoluteInlineEditIndex,
  areWysiwygDraftSyncPayloadsEqual,
  areWysiwygImmediateDraftLayoutStatesEqual,
  areWysiwygImmediateTextEchoStatesEqual,
  buildContinuationBackspaceInput,
  buildInlineEditSliceKey,
  buildSplitEditInput,
  buildCachedWysiwygDraftParagraphLayout,
  focusElementWithoutScroll,
  ParagraphTextSurface,
  buildWysiwygDraftParagraphLayout,
  buildWysiwygDraftParagraphLines,
  createWysiwygDraftParagraphLayoutCache,
  getContinuationEditState,
  getInlineEditVisualMode,
  inlineEditTextareaCaretColor,
  inlineEditTextareaOutline,
  inlineEditTextareaTextColor,
  hasWysiwygTextDraftChange,
  isWysiwygRichTextToolbarFocusTarget,
  isWysiwygTextSessionFocusTarget,
  paragraphWithWysiwygFragmentRenderProps,
  resolvePointerSelectionWheelScrollDelta,
  resolveInlineEditTextareaPointerPagePoint,
  resolveWysiwygCaretFollowScrollDelta,
  resolveWysiwygLiveTextEcho,
  resolveSelectionOverlayRectsInFragmentWithPerf,
  resolveTrailingWhitespaceCaretOverlayInFragment,
  resolveWysiwygDraftSyncDelayMs,
  shouldApplyWysiwygNativeHeightPreview,
  resolveWysiwygTextPointerOffsetFromFragmentTargets,
  resolveWysiwygPointerSelectionState,
  resolveWysiwygWordSelectionRange,
  shouldUseInlineEditDocumentLayer,
  shouldUseInlineEditDocumentVisual,
  shouldUseNativeInlineEditEnter,
  shouldUseNativeTableCellBoundaryBackspace,
  shouldUseInlineEditSvgVisual,
  shouldFlushWysiwygImmediateVisualState,
  shouldKeepWysiwygImmediateDraftLayout,
  shouldUseWysiwygTextEngineLayer,
  WysiwygTextLayer,
} from "../ParagraphTextSurface"
import {
  FlowdocDraftEditorIslandRoot,
  resolveDraftIslandStructuralGuardUnlockReason,
  shouldDropDraftIslandStructuralKeyForGuard,
  shouldQueueDraftIslandPageBoundaryReflow,
  shouldReportDraftIslandHeightPreview,
  type DraftIslandStructuralEditGuard,
} from "../FlowdocDraftEditorIslandRoot"
import { createOptimisticMergeRefocusPaginated, createOptimisticSplitRefocusPaginated } from "../optimisticStructuralRefocus"
import type { PageFragment, PaginatedDocument, PaginatedPage } from "@/pagination"
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

function expectNativeEditLayerMarkup(markup: string, text?: string): void {
  expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
  expect(markup).toContain("data-wysiwyg-active-visual-mode=\"native-edit-layer\"")
  expect(markup).toContain("data-wysiwyg-native-edit-layer=\"true\"")
  expect(markup).toContain("data-wysiwyg-native-edit-textarea=\"true\"")
  expect(markup).toContain("data-inline-edit-visual-mode=\"native-edit-layer\"")
  expect(markup).toContain("<textarea")
  if (text != null) {
    for (const token of text.split(/\s+/).filter(Boolean)) {
      expect(markup).toContain(token)
    }
  }
  expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
  expect(markup).not.toContain("data-wysiwyg-live-caret=\"true\"")
  expect(markup).not.toContain("data-wysiwyg-caret=\"true\"")
}

function expectFlowdocDraftLinesMarkup(markup: string, text?: string): void {
  expect(markup).toContain("data-wysiwyg-text-engine-layer=\"true\"")
  expect(markup).toContain("data-wysiwyg-draft-editor-island=\"true\"")
  expect(markup).toContain("data-wysiwyg-active-visual-mode=\"flowdoc-draft-editor-island\"")
  expect(markup).toContain("data-wysiwyg-active-visual-detail=\"flowdoc-owned-draft-lines\"")
  expect(markup).toContain("data-wysiwyg-flowdoc-draft-lines=\"true\"")
  expect(markup).toContain("data-wysiwyg-native-visible-text=\"false\"")
  expect(markup).toContain("data-wysiwyg-custom-caret-visible=\"true\"")
  expect(markup).toContain("data-wysiwyg-hidden-input-bridge=\"true\"")
  expect(markup).toContain("data-wysiwyg-input-bridge-mode=\"hidden-flowdoc-draft-editor-island\"")
  expect(markup).toContain("data-wysiwyg-visible-pointer-owner=\"flowdoc-draft-surface\"")
  expect(markup).toContain("data-inline-edit-visual-mode=\"flowdoc-draft-editor-island\"")
  expect(markup).not.toContain("data-wysiwyg-native-edit-textarea=\"true\"")
  expect(markup).not.toContain("<textarea")
  expect(markup).toContain("color:transparent")
  expect(markup).toContain("caret-color:transparent")
  if (text != null) expect(markup).toContain("data-wysiwyg-flowdoc-draft-text-length=")
  expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
  expect(markup).not.toContain("data-wysiwyg-live-caret=\"true\"")
}

describe("FlowdocDraftEditorIslandRoot", () => {
  it("drops repeated Enter while a split structural guard is in flight", () => {
    const guard: DraftIslandStructuralEditGuard = {
      token: 1,
      operation: "split",
      sourceNodeId: "cover_note",
      expectedActiveNodeId: null,
      removedNodeId: null,
      draftRevision: 0,
      startedAt: 100,
    }
    let splitCount = 1
    if (!shouldDropDraftIslandStructuralKeyForGuard(guard, {
      key: "Enter",
      nodeId: "cover_note",
    })) {
      splitCount += 1
    }

    expect(splitCount).toBe(1)
  })

  it("drops repeated Backspace while a merge structural guard is in flight", () => {
    const guard: DraftIslandStructuralEditGuard = {
      token: 2,
      operation: "merge",
      sourceNodeId: "cover_note_split",
      expectedActiveNodeId: null,
      removedNodeId: "cover_note_split",
      draftRevision: 0,
      startedAt: 100,
    }
    let mergeCount = 1
    if (!shouldDropDraftIslandStructuralKeyForGuard(guard, {
      key: "Backspace",
      nodeId: "cover_note_split",
    })) {
      mergeCount += 1
    }

    expect(mergeCount).toBe(1)
  })

  it("allows Backspace after an Enter split guard unlocks on the new active node", () => {
    const guard: DraftIslandStructuralEditGuard = {
      token: 3,
      operation: "split",
      sourceNodeId: "cover_note",
      expectedActiveNodeId: null,
      removedNodeId: null,
      draftRevision: 0,
      startedAt: 100,
    }

    expect(resolveDraftIslandStructuralGuardUnlockReason(guard, {
      active: true,
      nodeId: "cover_note_split",
      now: 120,
    })).toBe("active-node-changed")
    expect(shouldDropDraftIslandStructuralKeyForGuard(null, {
      key: "Backspace",
      nodeId: "cover_note_split",
    })).toBe(false)
  })

  it("does not block normal text input or IME composition", () => {
    const guard: DraftIslandStructuralEditGuard = {
      token: 4,
      operation: "split",
      sourceNodeId: "cover_note",
      expectedActiveNodeId: null,
      removedNodeId: null,
      draftRevision: 0,
      startedAt: 100,
    }

    expect(shouldDropDraftIslandStructuralKeyForGuard(guard, {
      key: "a",
      nodeId: "cover_note",
    })).toBe(false)
    expect(shouldDropDraftIslandStructuralKeyForGuard(guard, {
      key: "Enter",
      nodeId: "cover_note",
      isComposing: true,
    })).toBe(false)
  })

  it("builds an optimistic same-page split fragment for structural refocus", () => {
    const doc = makeDoc("Before")
    const section = doc.document.sections[0]
    const p1 = section.nodes.p1 as ParagraphNode
    const p2: ParagraphNode = {
      ...p1,
      id: "p2",
      children: [{ id: "p2-text", type: "text", text: "After split wraps" }],
    }
    const splitDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            body: { ...section.nodes.body, childIds: ["p1", "p2", "p3"] },
            p2,
            p3: {
              ...p1,
              id: "p3",
              children: [{ id: "p3-text", type: "text", text: "Downstream" }],
            },
          },
        }],
      },
    } as unknown as DocumentNode
    const sourceFragment = makeFragment({
      nodeId: "p1",
      x: 36,
      y: 48,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 6,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 42,
        spacingAfter: 8,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const downstreamFragment = makeFragment({
      nodeId: "p3",
      y: 80,
      height: 24,
      lineStart: 0,
      lineEnd: 10,
    })
    const paginated: PaginatedDocument = {
      sections: [{
        sectionId: "section",
        pages: [{
          index: 0,
          width: 300,
          height: 300,
          contentBox: { x: 36, y: 48, width: 220, height: 220 },
          fragments: [sourceFragment, downstreamFragment],
          headerFragments: [],
          footerFragments: [],
        }],
      }],
    } as unknown as PaginatedDocument

    const result = createOptimisticSplitRefocusPaginated({
      doc: splitDoc,
      paginated,
      sourceNodeId: "p1",
      newNodeId: "p2",
      sourceFragment,
      textMeasurer: fixedMeasurer,
    })

    expect(result).not.toBeNull()
    const fragments = result!.paginated.sections[0].pages[0].fragments
    expect(fragments.map((fragment) => fragment.nodeId)).toEqual(["p1", "p2", "p3"])
    expect(result!.newFragment.nodeId).toBe("p2")
    expect(result!.mode).toBe("same-page")
    expect(result!.sourceFragment.lineStart).toBe(0)
    expect(result!.sourceFragment.lineEnd).toBe(result!.sourceFragment.lines?.length)
    expect(result!.newFragment.lineStart).toBe(0)
    expect(result!.newFragment.lineEnd).toBe(result!.newFragment.lines?.length)
    expect(result!.newFragment.y).toBeGreaterThan(result!.sourceFragment.y)
    expect(fragments[2].y).toBeGreaterThan(downstreamFragment.y)
    expect(result!.overflowedPage).toBe(false)
  })

  it("uses boundary-safe structural refocus near a page break without fake same-page canvas insertion", () => {
    const doc = makeDoc("Before")
    const section = doc.document.sections[0]
    const p1 = section.nodes.p1 as ParagraphNode
    const p2: ParagraphNode = {
      ...p1,
      id: "p2",
      children: [{ id: "p2-text", type: "text", text: "After split wraps" }],
    }
    const splitDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            body: { ...section.nodes.body, childIds: ["p1", "p2", "p3"] },
            p2,
            p3: {
              ...p1,
              id: "p3",
              children: [{ id: "p3-text", type: "text", text: "Downstream" }],
            },
          },
        }],
      },
    } as unknown as DocumentNode
    const sourceFragment = makeFragment({
      nodeId: "p1",
      x: 36,
      y: 48,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const downstreamFragment = makeFragment({
      nodeId: "p3",
      y: 80,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
    })
    const paginated: PaginatedDocument = {
      sections: [{
        sectionId: "section",
        pages: [{
          index: 0,
          width: 300,
          height: 300,
          contentBox: { x: 36, y: 48, width: 220, height: 45 },
          fragments: [sourceFragment, downstreamFragment],
          headerFragments: [],
          footerFragments: [],
        }],
      }],
    } as unknown as PaginatedDocument

    const result = createOptimisticSplitRefocusPaginated({
      doc: splitDoc,
      paginated,
      sourceNodeId: "p1",
      newNodeId: "p2",
      sourceFragment,
      textMeasurer: fixedMeasurer,
    })

    expect(result).not.toBeNull()
    expect(result!.mode).toBe("boundary-safe")
    expect(result!.overflowedPage).toBe(true)
    expect(result!.newFragment.nodeId).toBe("p2")
    expect(result!.newFragment.lineEnd).toBe(result!.newFragment.lines?.length)
    const fragments = result!.paginated.sections[0].pages[0].fragments
    expect(fragments.map((fragment) => fragment.nodeId)).toEqual(["p1", "p3"])
    expect(fragments[1].y).toBe(downstreamFragment.y)
  })

  it("uses boundary-safe structural refocus when a split would collide with an explicit page-break marker", () => {
    const doc = makeDoc("Before")
    const section = doc.document.sections[0]
    const p1 = section.nodes.p1 as ParagraphNode
    const p2: ParagraphNode = {
      ...p1,
      id: "p2",
      children: [{ id: "p2-text", type: "text", text: "After split wraps" }],
    }
    const splitDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            body: { ...section.nodes.body, childIds: ["p1", "p2", "break"] },
            p2,
            break: {
              id: "break",
              type: "page-break",
              props: {},
            },
          },
        }],
      },
    } as unknown as DocumentNode
    const sourceFragment = makeFragment({
      nodeId: "p1",
      x: 36,
      y: 48,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const pageBreakFragment = makeFragment({
      nodeId: "break",
      nodeType: "page-break",
      y: 78,
      height: 10,
      lineStart: undefined,
      lineEnd: undefined,
      lines: undefined,
    })
    const paginated: PaginatedDocument = {
      sections: [{
        sectionId: "section",
        pages: [{
          index: 0,
          width: 300,
          height: 300,
          contentBox: { x: 36, y: 48, width: 220, height: 220 },
          fragments: [sourceFragment, pageBreakFragment],
          headerFragments: [],
          footerFragments: [],
        }],
      }],
    } as unknown as PaginatedDocument

    const result = createOptimisticSplitRefocusPaginated({
      doc: splitDoc,
      paginated,
      sourceNodeId: "p1",
      newNodeId: "p2",
      sourceFragment,
      textMeasurer: fixedMeasurer,
    })

    expect(result).not.toBeNull()
    expect(result!.mode).toBe("boundary-safe")
    expect(result!.overflowedPage).toBe(false)
    expect(result!.newFragment.nodeId).toBe("p2")
    expect(result!.sourceFragment.renderProps?.spacingAfter).toBe(0)
    expect(result!.newFragment.renderProps?.spacingBefore).toBe(0)
    expect(result!.newFragment.lines?.[0]?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(result!.newFragment.y + 24)
    const fragments = result!.paginated.sections[0].pages[0].fragments
    expect(fragments.map((fragment) => fragment.nodeId)).toEqual(["p1", "break"])
    expect(fragments[1].y).toBe(pageBreakFragment.y)
  })

  it("builds an optimistic same-page merge fragment for structural Backspace refocus", () => {
    const doc = makeDoc("BeforeAfter")
    const section = doc.document.sections[0]
    const p1 = section.nodes.p1 as ParagraphNode
    const p3: ParagraphNode = {
      ...p1,
      id: "p3",
      children: [{ id: "p3-text", type: "text", text: "Downstream" }],
    }
    const mergedDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            body: { ...section.nodes.body, childIds: ["p1", "p3"] },
            p3,
          },
        }],
      },
    } as unknown as DocumentNode
    const previousFragment = makeFragment({
      nodeId: "p1",
      x: 36,
      y: 48,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const currentFragment = makeFragment({
      nodeId: "p2",
      x: 36,
      y: 80,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
    })
    const downstreamFragment = makeFragment({
      nodeId: "p3",
      y: 112,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
    })
    const paginated: PaginatedDocument = {
      sections: [{
        sectionId: "section",
        pages: [{
          index: 0,
          width: 300,
          height: 300,
          contentBox: { x: 36, y: 48, width: 220, height: 220 },
          fragments: [previousFragment, currentFragment, downstreamFragment],
          headerFragments: [],
          footerFragments: [],
        }],
      }],
    } as unknown as PaginatedDocument

    const result = createOptimisticMergeRefocusPaginated({
      doc: mergedDoc,
      paginated,
      previousNodeId: "p1",
      currentNodeId: "p2",
      previousFragment,
      currentFragment,
      textMeasurer: fixedMeasurer,
    })

    expect(result).not.toBeNull()
    expect(result!.mode).toBe("same-page")
    expect(result!.mergedFragment.nodeId).toBe("p1")
    expect(result!.mergedFragment.lineStart).toBe(0)
    expect(result!.mergedFragment.lineEnd).toBe(result!.mergedFragment.lines?.length)
    const fragments = result!.paginated.sections[0].pages[0].fragments
    expect(fragments.map((fragment) => fragment.nodeId)).toEqual(["p1", "p3"])
    expect(fragments[0].lineEnd).toBe(fragments[0].lines?.length)
    expect(fragments[1].y).toBeLessThan(downstreamFragment.y)
  })

  it("builds an optimistic merge when the current split paragraph only exists in the island", () => {
    const doc = makeDoc("BeforeAfter")
    const section = doc.document.sections[0]
    const mergedDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            body: { ...section.nodes.body, childIds: ["p1", "break"] },
            break: {
              id: "break",
              type: "page-break",
              props: {},
            },
          },
        }],
      },
    } as unknown as DocumentNode
    const previousFragment = makeFragment({
      nodeId: "p1",
      x: 36,
      y: 48,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const currentIslandFragment = makeFragment({
      nodeId: "p2",
      x: 36,
      y: 72,
      width: 70,
      height: 24,
      lineStart: 0,
      lineEnd: 1,
    })
    const pageBreakFragment = makeFragment({
      nodeId: "break",
      nodeType: "page-break",
      y: 96,
      height: 10,
      lineStart: undefined,
      lineEnd: undefined,
      lines: undefined,
    })
    const paginated: PaginatedDocument = {
      sections: [{
        sectionId: "section",
        pages: [{
          index: 0,
          width: 300,
          height: 300,
          contentBox: { x: 36, y: 48, width: 220, height: 220 },
          fragments: [previousFragment, pageBreakFragment],
          headerFragments: [],
          footerFragments: [],
        }],
      }],
    } as unknown as PaginatedDocument

    const result = createOptimisticMergeRefocusPaginated({
      doc: mergedDoc,
      paginated,
      previousNodeId: "p1",
      currentNodeId: "p2",
      previousFragment,
      currentFragment: currentIslandFragment,
      textMeasurer: fixedMeasurer,
    })

    expect(result).not.toBeNull()
    expect(result!.mode).toBe("same-page")
    const fragments = result!.paginated.sections[0].pages[0].fragments
    expect(fragments.map((fragment) => fragment.nodeId)).toEqual(["p1", "break"])
    expect(fragments.some((fragment) => fragment.nodeId === "p2")).toBe(false)
    expect(result!.mergedFragment.nodeId).toBe("p1")
    expect(result!.mergedFragment.lineEnd).toBe(result!.mergedFragment.lines?.length)
    expect(fragments[1].y).toBeLessThan(pageBreakFragment.y)
  })

  it("reports active island height only when the draft visual height changes meaningfully", () => {
    expect(shouldReportDraftIslandHeightPreview({
      previous: null,
      key: "p1:0",
      nextHeight: 24.25,
      fragmentHeight: 24,
    })).toBe(false)

    expect(shouldReportDraftIslandHeightPreview({
      previous: null,
      key: "p1:0",
      nextHeight: 36,
      fragmentHeight: 24,
    })).toBe(true)

    expect(shouldReportDraftIslandHeightPreview({
      previous: { key: "p1:0", height: 36 },
      key: "p1:0",
      nextHeight: 36.25,
      fragmentHeight: 36,
    })).toBe(false)

    expect(shouldReportDraftIslandHeightPreview({
      previous: { key: "p1:0", height: 36 },
      key: "p1:0",
      nextHeight: 48,
      fragmentHeight: 36,
    })).toBe(true)
  })

  it("does not queue page-boundary pagination for a clean edit-entry draft", () => {
    const fragment = makeFragment()
    const pageBoundaryReflow = {
      kind: "hard-page-boundary",
      reason: "page-boundary",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    } as const

    expect(shouldQueueDraftIslandPageBoundaryReflow({
      active: true,
      nodeId: "p1",
      fragment,
      reflow: pageBoundaryReflow,
      draftRevision: 0,
      hasReflowHandler: true,
    })).toBe(false)

    expect(shouldQueueDraftIslandPageBoundaryReflow({
      active: true,
      nodeId: "p1",
      fragment,
      reflow: pageBoundaryReflow,
      draftRevision: 1,
      hasReflowHandler: true,
    })).toBe(true)
  })

  it("renders the V2 out-of-canvas island with a hidden input bridge outside the visible pointer target", () => {
    const doc = makeDoc("FlowDoc island text")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({
      x: 36,
      y: 48,
      width: 120,
      height: 24,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const markup = renderToStaticMarkup(createElement(FlowdocDraftEditorIslandRoot, {
      active: true,
      nodeId: "p1",
      paragraph,
      fragment,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      draftText: "FlowDoc island text wraps locally",
      caretOffset: 12,
      selection: { anchorOffset: 12, focusOffset: 12 },
      getPageElement: () => null,
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    }))

    expect(markup).toContain("data-wysiwyg-draft-editor-island=\"true\"")
    expect(markup).toContain("data-wysiwyg-out-of-canvas-island=\"true\"")
    expect(markup).toContain("data-wysiwyg-island-anchor=\"inline-fallback\"")
    expect(markup).toContain("data-wysiwyg-active-visual-detail=\"out-of-canvas-v2\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-lines=\"true\"")
    expect(markup).toContain("data-wysiwyg-native-visible-text=\"false\"")
    expect(markup).toContain("data-wysiwyg-input-bridge-mode=\"hidden-flowdoc-draft-editor-island-v2\"")
    expect(markup).toContain("data-wysiwyg-visible-area-pointer-target=\"false\"")
    expect(markup).toContain("data-wysiwyg-visible-pointer-owner=\"flowdoc-draft-island-v2\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-pointer-selection=\"true\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-clipboard=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-native-edit-textarea=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  })

  it("renders V2 island range selection as FlowDoc overlay geometry", () => {
    const doc = makeDoc("FlowDoc island text wraps locally across lines")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({
      x: 36,
      y: 48,
      width: 90,
      height: 24,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const markup = renderToStaticMarkup(createElement(FlowdocDraftEditorIslandRoot, {
      active: true,
      nodeId: "p1",
      paragraph,
      fragment,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      draftText: "FlowDoc island text wraps locally across lines",
      caretOffset: 22,
      selection: { anchorOffset: 4, focusOffset: 22 },
      getPageElement: () => null,
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    }))

    expect(markup).toContain("data-wysiwyg-active-visual-mode=\"flowdoc-draft-editor-island\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-selection-collapsed=\"false\"")
    expect(markup).toContain("data-wysiwyg-selection-overlay=\"true\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-pointer-selection=\"true\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-clipboard=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-native-edit-textarea=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  })

  it("renders V2 island draft continuation surfaces when the active plain paragraph crosses a page boundary", () => {
    const doc = makeDoc("FlowDoc island text")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({
      x: 36,
      y: 72,
      width: 70,
      height: 24,
      renderProps: {
        fontFamilyKey: "default",
        fontSize: 12,
        align: "left",
        lineHeight: 12,
        textColor: "111827",
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    })
    const pages: PaginatedPage[] = [
      { index: 0, width: 300, height: 180, contentBox: { x: 36, y: 72, width: 220, height: 36 }, fragments: [fragment], headerFragments: [], footerFragments: [] },
      { index: 1, width: 300, height: 180, contentBox: { x: 36, y: 72, width: 220, height: 72 }, fragments: [], headerFragments: [], footerFragments: [] },
    ]
    const markup = renderToStaticMarkup(createElement(FlowdocDraftEditorIslandRoot, {
      active: true,
      nodeId: "p1",
      paragraph,
      fragment,
      pageKey: "0-0",
      pages,
      scale: 1,
      textMeasurer: fixedMeasurer,
      draftText: "FlowDoc island text wraps locally across page boundary surfaces",
      caretOffset: 62,
      selection: { anchorOffset: 62, focusOffset: 62 },
      getPageElement: () => null,
      getPageKeyByPageIndex: (pageIndex) => `0-${pageIndex}`,
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    }))

    expect(markup).toContain("data-wysiwyg-island-fragment-count=\"2\"")
    expect(markup).toContain("data-wysiwyg-island-page-boundary-preview=\"true\"")
    expect(markup).toContain("data-wysiwyg-island-reflow-kind=\"hard-page-boundary\"")
    expect(markup).toContain("data-wysiwyg-island-page-key=\"0-1\"")
    expect(markup).toContain("data-wysiwyg-flowdoc-draft-total-line-count=")
    expect(markup).not.toContain("data-wysiwyg-native-edit-textarea=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeCountingMeasurer(): {
  measurer: TextMeasurer
  totalCalls: () => number
} {
  let textCalls = 0
  let lineHeightCalls = 0
  return {
    measurer: {
      measureText: (text) => {
        textCalls += 1
        return { width: text.length * 10 }
      },
      measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => {
        lineHeightCalls += 1
        return fontSize * lineHeightRatio
      },
    },
    totalCalls: () => textCalls + lineHeightCalls,
  }
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
    const toolbarButton = makeFocusElement({}, makeFocusElement({
      "data-wysiwyg-rich-text-toolbar-node-id": "p1",
    }))
    const outsideToolbarButton = makeFocusElement({}, makeFocusElement({
      "data-wysiwyg-rich-text-toolbar-node-id": "p2",
    }))

    expect(isWysiwygTextSessionFocusTarget(bridge, "p1")).toBe(true)
    expect(isWysiwygTextSessionFocusTarget(nextBridge, "p1")).toBe(true)
    expect(isWysiwygTextSessionFocusTarget(toolbarButton, "p1")).toBe(true)
    expect(isWysiwygRichTextToolbarFocusTarget(toolbarButton, "p1")).toBe(true)
    expect(isWysiwygTextSessionFocusTarget(outsideBridge, "p1")).toBe(false)
    expect(isWysiwygTextSessionFocusTarget(outsideToolbarButton, "p1")).toBe(false)
    expect(isWysiwygRichTextToolbarFocusTarget(outsideToolbarButton, "p1")).toBe(false)
    expect(isWysiwygRichTextToolbarFocusTarget(bridge, "p1")).toBe(false)
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
    expect(shouldUseNativeInlineEditEnter(true)).toBe(false)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "")).toBe(true)
    expect(shouldUseNativeTableCellBoundaryBackspace(true, "Hello")).toBe(false)
    expect(shouldUseNativeTableCellBoundaryBackspace(false, "")).toBe(false)
  })

  it("maps list textarea pointer coordinates from the list body start", () => {
    const point = resolveInlineEditTextareaPointerPagePoint({
      textareaContentX: 96,
      fragmentY: 40,
      clientX: 149,
      clientY: 55,
      rectLeft: 93,
      rectTop: 37,
      scale: 2,
    })

    expect(point).toEqual({ x: 122.5, y: 47.5 })
  })
})

describe("ParagraphTextSurface inline edit visual parity", () => {
  it("uses SVG text as the edit visual only when the snapshot is fresh", () => {
    expect(shouldUseInlineEditSvgVisual(true, true)).toBe(true)
    expect(shouldUseInlineEditSvgVisual(true, false)).toBe(false)
    expect(shouldUseInlineEditSvgVisual(false, true)).toBe(false)
  })

  it("renders paginated rich text runs with per-run SVG styling", () => {
    const fragment = makeFragment({
      lines: [{
        text: "BoldItalic",
        x: 10,
        y: 20,
        width: 90,
        height: 18,
        runs: [
          {
            text: "Bold",
            start: 0,
            end: 4,
            x: 0,
            width: 40,
            sourceId: "t1",
            sourceType: "text",
            style: {
              fontSize: 12,
              fontFamilyKey: "sarabun",
              textColor: "DC2626",
              fontWeight: "bold",
              fontStyle: "normal",
              textDecoration: "underline",
              strikethrough: false,
              fontVariant: "bold",
              lineHeight: 14,
            },
          },
          {
            text: "Italic",
            start: 4,
            end: 10,
            x: 40,
            width: 50,
            sourceId: "t2",
            sourceType: "text",
            style: {
              fontSize: 16,
              fontFamilyKey: "notoSansThai",
              textColor: "2563EB",
              fontWeight: "normal",
              fontStyle: "italic",
              textDecoration: "none",
              strikethrough: true,
              fontVariant: "italic",
              lineHeight: 18,
            },
          },
        ],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "sarabun",
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
      doc: makeDoc("BoldItalic"),
      pageKey: "0-0",
      scale: 1,
      isEditing: false,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: false,
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

    expect(markup).toContain("Bold")
    expect(markup).toContain("Italic")
    expect(markup).toContain("x=\"10\"")
    expect(markup).toContain("x=\"50\"")
    expect(markup).toContain("font-family=\"FlowDocSarabun\"")
    expect(markup).toContain("font-family=\"FlowDocNotoSansThai\"")
    expect(markup).toContain("font-weight=\"700\"")
    expect(markup).toContain("font-style=\"italic\"")
    expect(markup).toContain("text-decoration=\"underline\"")
    expect(markup).toContain("text-decoration=\"line-through\"")
    expect(markup).toContain("fill=\"#DC2626\"")
    expect(markup).toContain("fill=\"#2563EB\"")
  })

  it("renders generated list markers separately from paragraph line text", () => {
    const fragment = makeFragment({
      lines: [{
        text: "List body",
        x: 30,
        y: 20,
        width: 90,
        height: 12,
        segments: [{ kind: "word", text: "List body", start: 0, end: 9, x: 0, width: 90, breakableAfter: false }],
      }],
      listMarker: {
        text: "1.",
        level: 0,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "list-body",
        markerIndent: 0,
        bodyIndent: 20,
        markerX: 10,
        bodyX: 30,
      },
      renderProps: {
        align: "left",
        fontFamilyKey: "sarabun",
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
      doc: makeDoc("List body"),
      pageKey: "0-0",
      scale: 1,
      isEditing: false,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: false,
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

    expect(markup).toContain("data-list-marker=\"true\"")
    expect(markup).toContain("data-list-marker-node-id=\"p1\"")
    expect(markup).toContain("data-list-marker-level=\"0\"")
    expect(markup).toContain("x=\"10\"")
    expect(markup).toContain(">1.</text>")
    expect(markup).toContain(">List body</text>")
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

  it("keeps the text-engine native edit layer independent from measured visual freshness", () => {
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
    })).toBe(true)
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

  it("keeps immediate draft layout only until parent draft lines catch up", () => {
    const immediate = {
      baseText: "Hello",
      draftText: "Hello wrapped",
      layout: { lines: [], height: 24 },
    }

    expect(shouldKeepWysiwygImmediateDraftLayout(immediate, "Hello", false)).toBe(true)
    expect(shouldKeepWysiwygImmediateDraftLayout(immediate, "Hello wrapped", false)).toBe(true)
    expect(shouldKeepWysiwygImmediateDraftLayout(immediate, "Hello wrapped", true)).toBe(false)
    expect(shouldKeepWysiwygImmediateDraftLayout(immediate, "Other", false)).toBe(false)
  })

  it("dedupes immediate visual state and flushes only when entering the immediate lane", () => {
    const layout = { lines: [], height: 24 }
    const firstEcho = { baseText: "Hello", draftText: "Hello " }
    const sameEcho = { baseText: "Hello", draftText: "Hello " }
    const nextEcho = { baseText: "Hello", draftText: "Hello  " }
    const firstLayout = { baseText: "Hello", draftText: "Hello ", layout }
    const sameLayout = { baseText: "Hello", draftText: "Hello ", layout: { lines: [], height: 24 } }
    const nextLayout = { baseText: "Hello ", draftText: "Hello  ", layout }

    expect(areWysiwygImmediateTextEchoStatesEqual(firstEcho, sameEcho)).toBe(true)
    expect(areWysiwygImmediateTextEchoStatesEqual(firstEcho, nextEcho)).toBe(false)
    expect(areWysiwygImmediateDraftLayoutStatesEqual(firstLayout, sameLayout)).toBe(true)
    expect(areWysiwygImmediateDraftLayoutStatesEqual(firstLayout, nextLayout)).toBe(false)
    expect(shouldFlushWysiwygImmediateVisualState({
      previousTextEcho: null,
      previousDraftLayout: null,
      nextTextEcho: firstEcho,
      nextDraftLayout: firstLayout,
    })).toBe(true)
    expect(shouldFlushWysiwygImmediateVisualState({
      previousTextEcho: firstEcho,
      previousDraftLayout: firstLayout,
      nextTextEcho: nextEcho,
      nextDraftLayout: nextLayout,
    })).toBe(false)
    expect(shouldFlushWysiwygImmediateVisualState({
      previousTextEcho: firstEcho,
      previousDraftLayout: firstLayout,
      nextTextEcho: null,
      nextDraftLayout: null,
    })).toBe(false)
    expect(areWysiwygDraftSyncPayloadsEqual(
      { text: "Hello", caretOffset: 5, selection: { anchorOffset: 5, focusOffset: 5 } },
      { text: "Hello", caretOffset: 5, selection: { anchorOffset: 5, focusOffset: 5 } },
    )).toBe(true)
    expect(areWysiwygDraftSyncPayloadsEqual(
      { text: "Hello", caretOffset: 5, selection: { anchorOffset: 5, focusOffset: 5 } },
      { text: "Hello ", caretOffset: 6, selection: { anchorOffset: 6, focusOffset: 6 } },
    )).toBe(false)
  })

  it("uses a quiet window for deferred text draft sync", () => {
    expect(resolveWysiwygDraftSyncDelayMs({
      firstRequestedAtMs: 1000,
      nowMs: 1040,
      quietWindowMs: 120,
      maxLagMs: 500,
    })).toBe(120)
  })

  it("caps deferred text draft sync by max lag", () => {
    expect(resolveWysiwygDraftSyncDelayMs({
      firstRequestedAtMs: 1000,
      nowMs: 1460,
      quietWindowMs: 120,
      maxLagMs: 500,
    })).toBe(40)
    expect(resolveWysiwygDraftSyncDelayMs({
      firstRequestedAtMs: 1000,
      nowMs: 1500,
      quietWindowMs: 120,
      maxLagMs: 500,
    })).toBe(0)
  })

  it("renders the native edit layer instead of live echo or draft replacement while editing", () => {
    const fragment = makeFragment({
      width: 40,
      lines: [{
        text: "Hello world",
        x: 10,
        y: 20,
        width: 80,
        height: 14,
        segments: [{ kind: "word", text: "Hello world", start: 0, end: 11, x: 0, width: 80, breakableAfter: false }],
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

    const markup = renderToStaticMarkup(createElement("svg", null,
      createElement("defs", null,
        createElement("clipPath", { id: "cell-clip" },
          createElement("rect", { x: 0, y: 0, width: 40, height: 9999 }),
        ),
      ),
      createElement(WysiwygTextLayer, {
        fragment,
        renderProps: fragment.renderProps,
        pageKey: "0-0",
        clipPathId: "cell-clip",
        scale: 1,
        textMeasurer: fixedMeasurer,
        caretIndex: 16,
        draftText: "Hello wide world",
        liveTextEcho: { anchorOffset: 7, text: "ide w" },
        showTextSegments: false,
        reflowKind: "hard-page-boundary",
        onDraftChange: () => undefined,
        onEndEdit: () => undefined,
      }),
    ))

    expectNativeEditLayerMarkup(markup, "Hello wide world")
    expect(markup).toContain("data-wysiwyg-native-edit-y=\"20\"")
    expect(markup).toContain("data-wysiwyg-native-edit-fragment-y=\"0\"")
    expect(markup).toContain("data-wysiwyg-native-edit-first-line-y=\"20\"")
    expect(markup).toContain("data-wysiwyg-native-edit-measured-text-block-height=\"14\"")
    expect(markup).toContain("<foreignObject data-wysiwyg-native-edit-foreign-object=\"true\" x=\"0\" y=\"20\"")
    expect(markup).not.toContain(">Hello world</text>")
    expect(markup).toMatch(/data-wysiwyg-native-edit-layer="true"[^>]*clip-path="url\(#cell-clip\)"/)
  })

  it("renders long native edit text without measuring text during render", () => {
    const throwingMeasurer: TextMeasurer = {
      measureText: () => {
        throw new Error("draft replacement should not measure text during render")
      },
      measureLineHeight: (_fontFamilyKey, fontSize, lineHeightRatio) => fontSize * lineHeightRatio,
    }
    const fragment = makeFragment({
      width: 52,
      height: 42,
      lines: [
        {
          text: "Wrapped old",
          x: 10,
          y: 20,
          width: 44,
          height: 14,
          segments: [{ kind: "word", text: "Wrapped old", start: 0, end: 11, x: 0, width: 44, breakableAfter: false }],
        },
        {
          text: "visual lines",
          x: 10,
          y: 34,
          width: 48,
          height: 14,
          segments: [{ kind: "word", text: "visual lines", start: 11, end: 23, x: 0, width: 48, breakableAfter: false }],
        },
      ],
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(WysiwygTextLayer, {
      fragment,
      renderProps: fragment.renderProps,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: throwingMeasurer,
      caretIndex: 35,
      draftText: "Wrapped old visual lines plus immediate typed feedback",
      liveTextEcho: { anchorOffset: 23, text: " plus immediate typed feedback" },
      showTextSegments: false,
      reflowKind: "soft",
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    })))

    expectNativeEditLayerMarkup(markup, "Wrapped old visual lines plus immediate typed feedback")
    expect(markup).toContain("white-space:pre-wrap")
  })

  it("keeps live echo suppressed while the native layer owns immediate table-cell feedback", () => {
    const fragment = makeFragment({
      width: 40,
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(WysiwygTextLayer, {
      fragment,
      renderProps: fragment.renderProps,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      caretIndex: 5,
      draftText: "Hello overwide immediate text",
      liveTextEcho: { anchorOffset: 5, text: " overwide immediate text" },
      suppressLiveTextEcho: true,
      showTextSegments: false,
      reflowKind: "soft",
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    })))

    expectNativeEditLayerMarkup(markup, "Hello overwide immediate text")
  })

  it("lets the native edit layer own the caret while text input is active", () => {
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(WysiwygTextLayer, {
      fragment,
      renderProps: fragment.renderProps,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      caretIndex: 5,
      draftText: "Hello",
      caretVisualMode: "typing",
      showTextSegments: false,
      reflowKind: "soft",
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    })))

    expectNativeEditLayerMarkup(markup, "Hello")
    expect(markup).not.toContain("data-wysiwyg-caret-blink=\"true\"")
  })

  it("does not render a draft replacement caret while native text input is active", () => {
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

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(WysiwygTextLayer, {
      fragment,
      renderProps: fragment.renderProps,
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      caretIndex: 5,
      draftText: "Hello!",
      liveTextEcho: { anchorOffset: 5, text: "!" },
      caretVisualMode: "typing",
      showTextSegments: false,
      reflowKind: "soft",
      onDraftChange: () => undefined,
      onEndEdit: () => undefined,
    })))

    expectNativeEditLayerMarkup(markup, "Hello!")
    expect(markup).not.toContain("data-wysiwyg-caret-blink=\"true\"")
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

  it("resolves pointer selection state with duplicate detection", () => {
    const first = resolveWysiwygPointerSelectionState({
      text: "Hello",
      anchorOffset: 1,
      focusOffset: 4,
      currentCaretOffset: 1,
      currentSelection: { anchorOffset: 1, focusOffset: 1 },
    })

    expect(first).toEqual({
      caretOffset: 4,
      selection: { anchorOffset: 1, focusOffset: 4 },
      selectionRangeLength: 3,
      changed: true,
    })
    expect(resolveWysiwygPointerSelectionState({
      text: "Hello",
      anchorOffset: 1,
      focusOffset: 4,
      currentCaretOffset: first.caretOffset,
      currentSelection: first.selection,
    }).changed).toBe(false)
    expect(resolveWysiwygPointerSelectionState({
      text: "Hello",
      anchorOffset: -20,
      focusOffset: 99,
      currentCaretOffset: null,
      currentSelection: null,
    })).toMatchObject({
      caretOffset: 5,
      selection: { anchorOffset: 0, focusOffset: 5 },
      selectionRangeLength: 5,
      changed: true,
    })
  })

  it("renders the flagged text-engine edit lane as a native edit layer", () => {
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

    expect(markup).toContain("data-wysiwyg-hit-area=\"true\"")
    expectNativeEditLayerMarkup(markup, "Hello")
    expect(markup).toContain("data-wysiwyg-native-height-handoff=\"true\"")
    expect(markup).toContain("data-wysiwyg-native-edit-clip-mode=\"relaxed\"")
    expect(markup).not.toContain("data-wysiwyg-caret-blink=\"true\"")
  })

  it("uses a threshold before handing native height changes to local preview", () => {
    expect(shouldApplyWysiwygNativeHeightPreview(null, 100)).toBe(true)
    expect(shouldApplyWysiwygNativeHeightPreview(100, 100.4)).toBe(false)
    expect(shouldApplyWysiwygNativeHeightPreview(100, 101)).toBe(true)
  })

  it("keeps stale measured visuals on the native edit layer when FlowDoc draft measurement is unavailable", () => {
    const fragment = makeFragment({
      width: 56,
      height: 28,
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
      textMeasurer: undefined,
      isEditing: true,
      isVisualFresh: false,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello changed while stale",
      wysiwygTextCaretOffset: 24,
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

    expectNativeEditLayerMarkup(markup, "Hello changed while stale")
    expect(markup).not.toContain("data-inline-edit-visual-mode=\"textarea\"")
    expect(markup).not.toContain("data-inline-edit-visual-mode=\"document\"")
  })

  it("uses FlowDoc draft lines for stale plain paragraph active editing when measurement is available", () => {
    const fragment = makeFragment({
      width: 56,
      height: 28,
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
      isVisualFresh: false,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello changed while stale",
      wysiwygTextCaretOffset: 24,
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

    expectFlowdocDraftLinesMarkup(markup, "Hello changed while stale")
    expect(markup).not.toContain("data-inline-edit-visual-mode=\"textarea\"")
    expect(markup).not.toContain("data-wysiwyg-draft-text-replacement=\"true\"")
  })

  it("preserves repeated spaces in native paragraph edit text", () => {
    const fragment = makeFragment({
      lines: [{
        text: "A  B",
        x: 10,
        y: 20,
        width: 40,
        height: 14,
        segments: [
          { kind: "word", text: "A", start: 0, end: 1, x: 0, width: 10, breakableAfter: true },
          { kind: "space", text: "  ", start: 1, end: 3, x: 10, width: 20, breakableAfter: true },
          { kind: "word", text: "B", start: 3, end: 4, x: 30, width: 10, breakableAfter: false },
        ],
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
      doc: makeDoc("A  B"),
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "A  B",
      wysiwygTextCaretOffset: 4,
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

    expectFlowdocDraftLinesMarkup(markup, "A  B")
    expect(markup).toContain("xml:space=\"preserve\"")
    expect(markup).toContain("white-space:pre")
  })

  it("lets the native edit layer own active text selection", () => {
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

    expectNativeEditLayerMarkup(markup, "Hello")
    expect(markup).not.toContain("data-wysiwyg-selection=\"true\"")
  })

  it("records scalar selection overlay perf metadata without paragraph content", () => {
    vi.stubGlobal("window", { __flowDocWysiwygPerfTraceEnabled: true })
    const fragment = makeFragment({
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: false }],
      }],
    })

    const rects = resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment,
      anchorOffset: 1,
      focusOffset: 4,
      textMeasurer: fixedMeasurer,
      tracePerf: true,
      source: "test",
    })

    expect(rects).toHaveLength(1)
    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "text-engine-selection-overlay",
      nodeId: "p1",
      pageIndex: 0,
      lineCount: 1,
      selectionRangeLength: 3,
      overlayRectCount: 1,
      source: "test",
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("Hello")
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

  it("moves the WYSIWYG caret across trailing spaces that layout trims from line text", () => {
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

    expect(resolveTrailingWhitespaceCaretOverlayInFragment({
      fragment,
      caretIndex: 7,
      draftText: "Hello  ",
      textMeasurer: fixedMeasurer,
    })).toMatchObject({
      offset: 7,
      x1: 80,
      x2: 80,
      y1: 20,
      y2: 34,
    })
    expect(resolveTrailingWhitespaceCaretOverlayInFragment({
      fragment,
      caretIndex: 6,
      draftText: "HelloX",
      textMeasurer: fixedMeasurer,
    })).toBeNull()
  })

  it("normalizes pointer-selection overlay wheel deltas for canvas scrolling", () => {
    expect(resolvePointerSelectionWheelScrollDelta({
      deltaX: 2,
      deltaY: 3,
      deltaMode: 0,
    })).toEqual({ left: 2, top: 3 })

    expect(resolvePointerSelectionWheelScrollDelta({
      deltaX: 1,
      deltaY: -2,
      deltaMode: 1,
      lineHeight: 18,
    })).toEqual({ left: 18, top: -36 })

    expect(resolvePointerSelectionWheelScrollDelta({
      deltaX: 0,
      deltaY: 1,
      deltaMode: 2,
      pageHeight: 640,
    })).toEqual({ left: 0, top: 640 })
  })

  it("keeps WYSIWYG table caret follow idle while the caret is inside the canvas viewport", () => {
    expect(resolveWysiwygCaretFollowScrollDelta({
      caretRect: { left: 120, right: 121, top: 200, bottom: 218 },
      viewportRect: { left: 80, right: 900, top: 100, bottom: 700 },
      margin: 24,
    })).toEqual({ left: 0, top: 0 })
  })

  it("scrolls down just enough when the WYSIWYG table caret falls below the canvas viewport", () => {
    expect(resolveWysiwygCaretFollowScrollDelta({
      caretRect: { left: 120, right: 121, top: 690, bottom: 708 },
      viewportRect: { left: 80, right: 900, top: 100, bottom: 700 },
      margin: 24,
    })).toEqual({ left: 0, top: 32 })
  })

  it("scrolls up just enough when the WYSIWYG table caret moves above the canvas viewport", () => {
    expect(resolveWysiwygCaretFollowScrollDelta({
      caretRect: { left: 120, right: 121, top: 96, bottom: 114 },
      viewportRect: { left: 80, right: 900, top: 100, bottom: 700 },
      margin: 24,
    })).toEqual({ left: 0, top: -28 })
  })

  it("scrolls horizontally when the WYSIWYG table caret moves outside the canvas viewport", () => {
    expect(resolveWysiwygCaretFollowScrollDelta({
      caretRect: { left: 890, right: 912, top: 200, bottom: 218 },
      viewportRect: { left: 80, right: 900, top: 100, bottom: 700 },
      margin: 24,
    })).toEqual({ left: 36, top: 0 })
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

  it("starts legacy textarea fallback at generated list body geometry", () => {
    const doc = makeDoc("List text")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.list = { instanceId: "tor-main", level: 1, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 10,
      y: 20,
      width: 100,
      height: 24,
      listMarker: {
        text: "1.1",
        level: 1,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 18,
        bodyIndent: 36,
        markerX: 28,
        bodyX: 46,
      },
      lines: [{
        text: "List text",
        x: 46,
        y: 20,
        width: 80,
        height: 14,
        segments: [{ kind: "word", text: "List text", start: 0, end: 9, x: 0, width: 80, breakableAfter: false }],
      }],
      renderProps: {
        align: "left",
        fontFamilyKey: "default",
        fontSize: 12,
        lineHeight: 14,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 36,
        indentRight: 0,
      },
    })

    const markup = renderToStaticMarkup(createElement("svg", null, createElement(ParagraphTextSurface, {
      fragment,
      doc,
      pageKey: "0-0",
      scale: 1,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: false,
      showTextSegments: false,
      initialCaretIndex: 0,
      onChange: () => undefined,
      onCaretChange: () => undefined,
      onUserEditInteraction: () => undefined,
      onHeightChange: () => undefined,
      onEndEdit: () => undefined,
      onSplitParagraph: () => undefined,
      onMergeParagraph: () => undefined,
    })))

    expect(markup).toContain("<textarea")
    expect(markup).toContain("<foreignObject x=\"43\"")
    expect(markup).toContain("width=\"70\"")
  })

  it("uses the native text-engine edit layer for table-cell paragraphs while keeping cell boundary rules separate", () => {
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

    expectNativeEditLayerMarkup(markup, "Cell text draft")
    expect(markup).toContain("data-wysiwyg-native-height-handoff=\"false\"")
    expect(markup).toContain("data-wysiwyg-native-edit-clip-mode=\"fragment\"")
  })

  it("uses the native text-engine edit layer for flow-table-cell paragraphs", () => {
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

    expectNativeEditLayerMarkup(markup, "Flow cell text draft")
  })

  it("keeps table-cell same-page draft text in the native edit layer", () => {
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

    expectNativeEditLayerMarkup(markup, "Cell")
    expect(markup).toContain("next")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
  })

  it("keeps flow-table-cell same-page draft text in the native edit layer", () => {
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

    expectNativeEditLayerMarkup(markup, "Flow")
    expect(markup).toContain("next")
  })

  it("keeps table-cell page-boundary draft text in the native edit layer", () => {
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

    expectNativeEditLayerMarkup(markup, "A")
    expect(markup).toContain("B")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate=\"true\"")
    expect(markup).not.toContain("data-wysiwyg-live-echo=\"true\"")
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

    expectNativeEditLayerMarkup(markup, "A")
    expect(markup).toContain("B")
    expect(markup).not.toContain("data-wysiwyg-table-cell-preview-candidate")
  })

  it("keeps row-stack paragraphs on the native text-engine edit layer", () => {
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

    expectNativeEditLayerMarkup(markup, "Stack text draft")
  })

  it("uses the FlowDoc draft editor island for continuation fragments after draft pagination", () => {
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
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello world",
      wysiwygTextVisualDraftLines: fragment.lines,
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

    expectFlowdocDraftLinesMarkup(markup, "Hello world")
    expect(markup).toContain("world")
  })

  it("keeps the FlowDoc draft editor island on the first split fragment after re-enter", () => {
    const fragment = makeFragment({
      isContinued: true,
      lineStart: 0,
      lineEnd: 1,
      width: 50,
      lines: [{
        text: "Hello",
        x: 10,
        y: 20,
        width: 50,
        height: 14,
        segments: [{ kind: "word", text: "Hello", start: 0, end: 5, x: 0, width: 50, breakableAfter: true }],
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
      doc: makeDoc("Hello world again"),
      pageKey: "0-0",
      scale: 1,
      textMeasurer: fixedMeasurer,
      isEditing: true,
      isVisualFresh: true,
      wysiwygInlineEditEnabled: false,
      wysiwygTextEngineEnabled: true,
      wysiwygTextDraftText: "Hello world again",
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

    expectFlowdocDraftLinesMarkup(markup, "Hello")
    expect(markup).not.toContain(">world<")
    expect(markup).not.toContain("data-inline-edit-visual-mode=\"flowdoc-draft-lines-input-bridge\"")
  })

  it("keeps FlowDoc draft lines active while downstream layout is deferred past the page boundary", () => {
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

    expectFlowdocDraftLinesMarkup(markup, "A")
    expect(markup).toContain("B")
  })

  it("does not show a parent-split measured draft slice while FlowDoc draft lines are active", () => {
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

    expectFlowdocDraftLinesMarkup(markup, "A")
    expect(markup).toContain("B")
  })

  it("keeps FlowDoc draft lines active while downstream layout is deferred for line-count changes", () => {
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

    expectFlowdocDraftLinesMarkup(markup, "Hello world")
  })

  it("renders a FlowDoc caret after deferred Enter input", () => {
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

    expectFlowdocDraftLinesMarkup(markup, "Hello")
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

  it("renders plain paragraph active text through FlowDoc draft lines while the native textarea is an input bridge", () => {
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
    expectFlowdocDraftLinesMarkup(markup, "Hello!")
    expect(markup).toContain("data-wysiwyg-input-bridge=\"true\"")
    expect(markup).toContain("aria-describedby=\"flowdoc-wysiwyg-text-status\"")
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

  it("builds list item draft layout from generated body indent without mutating paragraph props", () => {
    const doc = makeDoc("A\nBC")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.list = { instanceId: "tor-main", level: 1, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 10,
      y: 20,
      width: 100,
      listMarker: {
        text: "1.1",
        level: 1,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 18,
        bodyIndent: 36,
        markerX: 28,
        bodyX: 46,
      },
    })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "A\nBC", fixedMeasurer)

    expect(layout?.lines.map((line) => line.text)).toEqual(["A", "BC"])
    expect(layout?.lines.map((line) => line.x)).toEqual([46, 46])
    expect(paragraph.props.indentLeft.value).toBe(0)
    expect(paragraph.props.textIndent.value).toBe(0)
  })

  it("measures styled list draft layouts from the resolved fragment render props", () => {
    const doc = makeDoc("กสสสสสส")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.paragraphStyleId = "tor.body"
    paragraph.props.styleOverrides = { spacingAfter: { value: 5, unit: "pt" } }
    paragraph.props.fontSize = { value: 12.25, unit: "pt" }
    paragraph.props.lineHeight = 1.5
    paragraph.props.spacingAfter = { value: 8, unit: "pt" }
    paragraph.props.list = { instanceId: "tor-main", level: 2, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 72,
      y: 319,
      width: 225.5,
      height: 18.5,
      renderProps: {
        fontSize: 9,
        fontFamilyKey: "sarabun",
        textColor: "000000",
        fontWeight: "normal",
        fontStyle: "normal",
        textDecoration: "none",
        strikethrough: false,
        align: "left",
        lineHeight: 13.5,
        spacingBefore: 0,
        spacingAfter: 5,
        textIndent: 0,
        indentLeft: 108,
        indentRight: 0,
      },
      listMarker: {
        text: "1.1.1",
        level: 2,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 72,
        bodyIndent: 108,
        markerX: 144,
        bodyX: 180,
      },
    })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "กสสสสส", fixedMeasurer)

    expect(layout?.height).toBe(18.5)
    expect(layout?.lines).toHaveLength(1)
    expect(layout?.lines[0]).toMatchObject({
      text: "กสสสสส",
      x: 180,
      y: 319,
      height: 13.5,
    })
    expect(paragraphWithWysiwygFragmentRenderProps(fragment, paragraph).props.fontSize).toEqual({ value: 9, unit: "pt" })
    expect(paragraph.props.fontSize).toEqual({ value: 12.25, unit: "pt" })
  })

  it("wraps list item draft lines from the generated body start", () => {
    const doc = makeDoc("ก".repeat(12))
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.list = { instanceId: "tor-main", level: 1, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 10,
      y: 20,
      width: 90,
      listMarker: {
        text: "1.1",
        level: 1,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 18,
        bodyIndent: 36,
        markerX: 28,
        bodyX: 46,
      },
    })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "ก".repeat(12), fixedMeasurer)

    expect(layout?.lines.length).toBeGreaterThan(1)
    expect(layout?.lines.map((line) => line.x)).toEqual(layout?.lines.map(() => 46))
    expect(layout?.lines.every((line) => line.width <= 54)).toBe(true)
    expect(layout?.lines.map((line) => line.text).join("")).toBe("ก".repeat(12))
  })

  it("uses list marker bodyX as the draft body truth", () => {
    const doc = makeDoc("ABCD")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.box = {
      padding: {
        top: { value: 0, unit: "pt" },
        right: { value: 0, unit: "pt" },
        bottom: { value: 0, unit: "pt" },
        left: { value: 5, unit: "pt" },
      },
    }
    paragraph.props.list = { instanceId: "tor-main", level: 1, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 10,
      y: 20,
      width: 90,
      listMarker: {
        text: "1.1",
        level: 1,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 18,
        bodyIndent: 36,
        markerX: 28,
        bodyX: 44,
      },
    })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "ABCD", fixedMeasurer)

    expect(layout?.lines.map((line) => line.x)).toEqual([44])
    expect(paragraph.props.indentLeft.value).toBe(0)
    expect(paragraph.props.textIndent.value).toBe(0)
  })

  it("builds styled text-run draft layout without flattening run styles", () => {
    const doc = makeDoc("Hello world")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.children = [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ]
    const fragment = makeFragment({ x: 10, y: 20, width: 200 })

    const layout = buildWysiwygDraftParagraphLayout(fragment, paragraph, "Hello wide world", fixedMeasurer)

    expect(layout?.lines[0]?.runs?.map((run) => ({
      text: run.text,
      fontWeight: run.style.fontWeight,
      fontStyle: run.style.fontStyle,
    }))).toEqual([
      { text: "Hello wide ", fontWeight: "bold", fontStyle: "normal" },
      { text: "world", fontWeight: "normal", fontStyle: "italic" },
    ])
  })

  it("reuses cached draft layout measurements for identical text-engine inputs", () => {
    const doc = makeDoc("Hello")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({ x: 10, y: 20, width: 80 })
    const cache = createWysiwygDraftParagraphLayoutCache()
    const counting = makeCountingMeasurer()

    const first = buildCachedWysiwygDraftParagraphLayout(cache, fragment, paragraph, "Hello!", counting.measurer)
    const callsAfterFirst = counting.totalCalls()
    if (first?.lines[0]) first.lines[0].text = "mutated"
    const second = buildCachedWysiwygDraftParagraphLayout(cache, fragment, paragraph, "Hello!", counting.measurer)

    expect(counting.totalCalls()).toBe(callsAfterFirst)
    expect(second?.lines[0]?.text).toBe("Hello!")
    expect(second).not.toBe(first)
    expect(second?.lines).not.toBe(first?.lines)
  })

  it("invalidates cached draft measurements when text, width, style, fragment render props, or measurer changes", () => {
    const doc = makeDoc("Hello")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    const fragment = makeFragment({ width: 80 })
    const cache = createWysiwygDraftParagraphLayoutCache()
    const firstCounting = makeCountingMeasurer()

    buildCachedWysiwygDraftParagraphLayout(cache, fragment, paragraph, "Hello!", firstCounting.measurer)
    const callsAfterFirst = firstCounting.totalCalls()

    buildCachedWysiwygDraftParagraphLayout(cache, { ...fragment, width: 70 }, paragraph, "Hello!", firstCounting.measurer)
    const callsAfterWidthChange = firstCounting.totalCalls()
    expect(callsAfterWidthChange).toBeGreaterThan(callsAfterFirst)

    buildCachedWysiwygDraftParagraphLayout(cache, { ...fragment, width: 70 }, paragraph, "Hello!!", firstCounting.measurer)
    const callsAfterTextChange = firstCounting.totalCalls()
    expect(callsAfterTextChange).toBeGreaterThan(callsAfterWidthChange)

    const styledParagraph = {
      ...paragraph,
      props: {
        ...paragraph.props,
        fontSize: { value: 14, unit: "pt" as const },
      },
    }
    buildCachedWysiwygDraftParagraphLayout(cache, { ...fragment, width: 70 }, styledParagraph, "Hello!!", firstCounting.measurer)
    const callsAfterStyleChange = firstCounting.totalCalls()
    expect(callsAfterStyleChange).toBeGreaterThan(callsAfterTextChange)

    buildCachedWysiwygDraftParagraphLayout(cache, {
      ...fragment,
      width: 70,
      renderProps: {
        fontSize: 16,
        fontFamilyKey: "default",
        align: "left",
        lineHeight: 16,
        spacingBefore: 0,
        spacingAfter: 0,
        textIndent: 0,
        indentLeft: 0,
        indentRight: 0,
      },
    }, styledParagraph, "Hello!!", firstCounting.measurer)
    const callsAfterRenderPropsChange = firstCounting.totalCalls()
    expect(callsAfterRenderPropsChange).toBeGreaterThan(callsAfterStyleChange)

    const secondCounting = makeCountingMeasurer()
    buildCachedWysiwygDraftParagraphLayout(cache, { ...fragment, width: 70 }, styledParagraph, "Hello!!", secondCounting.measurer)
    expect(secondCounting.totalCalls()).toBeGreaterThan(0)
  })

  it("invalidates cached draft measurements when generated list body geometry changes", () => {
    const doc = makeDoc("Hello")
    const paragraph = doc.document.sections[0].nodes.p1 as ParagraphNode
    paragraph.props.list = { instanceId: "tor-main", level: 0, itemId: "tor.item" }
    const fragment = makeFragment({
      x: 10,
      y: 20,
      width: 100,
      listMarker: {
        text: "1.",
        level: 0,
        ordinal: 1,
        instanceId: "tor-main",
        styleId: "tor-clause",
        itemId: "tor.item",
        markerIndent: 0,
        bodyIndent: 18,
        markerX: 10,
        bodyX: 28,
      },
    })
    const cache = createWysiwygDraftParagraphLayoutCache()
    const counting = makeCountingMeasurer()

    const first = buildCachedWysiwygDraftParagraphLayout(cache, fragment, paragraph, "Hello", counting.measurer)
    const callsAfterFirst = counting.totalCalls()
    const second = buildCachedWysiwygDraftParagraphLayout(cache, {
      ...fragment,
      listMarker: {
        ...fragment.listMarker!,
        level: 1,
        text: "1.1",
        markerIndent: 18,
        bodyIndent: 36,
        markerX: 28,
        bodyX: 46,
      },
    }, paragraph, "Hello", counting.measurer)

    expect(first?.lines[0]?.x).toBe(28)
    expect(second?.lines[0]?.x).toBe(46)
    expect(counting.totalCalls()).toBeGreaterThan(callsAfterFirst)
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
