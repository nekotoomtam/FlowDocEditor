import { describe, expect, it } from "vitest"
import type { PageFragment, PaginatedLine } from "@/pagination"
import {
  classifyWysiwygTextReflow,
  resolveWysiwygDraftPaginationSource,
  resolveWysiwygDraftPaginationDelayMs,
  shouldCoalesceWysiwygDraftPaginationRequest,
  shouldScheduleResponsiveContainerDraftPagination,
  shouldScheduleResponsiveFlowStackDraftPagination,
  shouldScheduleResponsiveTableCellDraftPagination,
  shouldPrepareWysiwygTableCellDraftVisualPreview,
  shouldQueueSettledTableCellDraftPaginationFromVisualPreview,
  shouldUseWysiwygLocalDraftLines,
  shouldUseWysiwygDraftPaginationFrame,
  WYSIWYG_TABLE_CELL_VISUAL_PREVIEW_REFLOW_DECISION,
} from "../wysiwygReflow"

function line(text: string, y = 20): PaginatedLine {
  return { text, x: 10, y, width: text.length * 5, height: 12 }
}

function fragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 10,
    y: 20,
    width: 100,
    height: 12,
    lineStart: 0,
    lineEnd: 1,
    lines: [line("Hello")],
    ...overrides,
  }
}

describe("classifyWysiwygTextReflow", () => {
  it("classifies same fragment line count and height as soft", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello!")],
      draftHeight: 12,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "soft",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    })
  })

  it("classifies line count changes that still fit on the page as hard-local", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "hard-local",
      reason: "line-count-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    })
  })

  it("patches same-page height changes only when the caller opts in", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment({ height: 12 }),
      draftLines: [line("Hello")],
      draftHeight: 16,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
      supportsSamePageHeightPatch: true,
    })).toMatchObject({
      kind: "hard-local",
      reason: "height-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: true,
      shouldQueueSettledPagination: true,
    })
  })

  it("patches same-page line count changes when flow-stack preview opts in", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
      supportsSamePageHeightPatch: true,
    })).toMatchObject({
      kind: "hard-local",
      reason: "line-count-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: true,
      shouldQueueSettledPagination: true,
    })
  })

  it("classifies growth past the page content bottom as hard-page-boundary", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })).toMatchObject({
      kind: "hard-page-boundary",
      reason: "page-boundary",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    })
  })

  it("fails closed for unsupported fragments", () => {
    expect(classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello")],
      draftHeight: 12,
      supportsLocalDraftLayout: false,
    })).toMatchObject({
      kind: "unsupported",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
    })
  })
})

describe("resolveWysiwygDraftPaginationDelayMs", () => {
  const defaultDelayMs = 450
  const flowStackBoundaryDelayMs = 16

  it("uses the short delay for flow-stack page-boundary handoff", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: true,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(flowStackBoundaryDelayMs)
  })

  it("keeps the normal settling delay for non-flow-stack page-boundary edits", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: false,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(defaultDelayMs)
  })

  it("uses the short delay for table-cell page-boundary handoff", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: false,
      isTableCellParagraph: true,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(flowStackBoundaryDelayMs)
  })

  it("uses the short delay for table-cell same-page line-count changes", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: false,
      isTableCellParagraph: true,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(flowStackBoundaryDelayMs)
  })

  it("keeps active flow-stack draft pagination responsive after the first split", () => {
    expect(resolveWysiwygDraftPaginationDelayMs({
      draftPaginationActive: true,
      isFlowStackParagraph: true,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(flowStackBoundaryDelayMs)
  })

  it("keeps same-page flow-stack reflow on the normal settling delay", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
      supportsSamePageHeightPatch: true,
    })

    expect(resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: true,
      defaultDelayMs,
      flowStackBoundaryDelayMs,
    })).toBe(defaultDelayMs)
  })
})

describe("shouldCoalesceWysiwygDraftPaginationRequest", () => {
  it("keeps a pending responsive request so key-repeat deletion cannot starve pagination", () => {
    expect(shouldCoalesceWysiwygDraftPaginationRequest({
      pendingDelayMs: 16,
      nextDelayMs: 16,
      responsiveDelayMs: 16,
    })).toBe(true)
  })

  it("replaces a normal pending debounce when a responsive boundary request arrives", () => {
    expect(shouldCoalesceWysiwygDraftPaginationRequest({
      pendingDelayMs: 450,
      nextDelayMs: 16,
      responsiveDelayMs: 16,
    })).toBe(false)
  })

  it("keeps normal draft pagination debounced", () => {
    expect(shouldCoalesceWysiwygDraftPaginationRequest({
      pendingDelayMs: 450,
      nextDelayMs: 450,
      responsiveDelayMs: 16,
    })).toBe(false)
  })
})

describe("shouldUseWysiwygDraftPaginationFrame", () => {
  it("uses a frame pump for responsive flow-stack pagination when available", () => {
    expect(shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: 16,
      responsiveDelayMs: 16,
      canUseAnimationFrame: true,
    })).toBe(true)
  })

  it("keeps normal settled pagination on timers", () => {
    expect(shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: 450,
      responsiveDelayMs: 16,
      canUseAnimationFrame: true,
    })).toBe(false)
  })

  it("falls back to timers when animation frames are unavailable", () => {
    expect(shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: 16,
      responsiveDelayMs: 16,
      canUseAnimationFrame: false,
    })).toBe(false)
  })
})

describe("shouldScheduleResponsiveFlowStackDraftPagination", () => {
  it("keeps re-entered split flow-stack paragraphs on the responsive pagination path", () => {
    expect(shouldScheduleResponsiveFlowStackDraftPagination({
      isFlowStackParagraph: true,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(true)
  })

  it("keeps the first active split handoff responsive while the marker is set", () => {
    expect(shouldScheduleResponsiveFlowStackDraftPagination({
      isFlowStackParagraph: true,
      draftPaginationActive: true,
      currentFragmentCount: 1,
    })).toBe(true)
  })

  it("does not make unsplit flow-stack edits responsive before a split marker exists", () => {
    expect(shouldScheduleResponsiveFlowStackDraftPagination({
      isFlowStackParagraph: true,
      draftPaginationActive: false,
      currentFragmentCount: 1,
    })).toBe(false)
  })

  it("does not promote non-flow-stack split paragraphs to the flow-stack responsive path", () => {
    expect(shouldScheduleResponsiveFlowStackDraftPagination({
      isFlowStackParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(false)
  })
})

describe("shouldScheduleResponsiveTableCellDraftPagination", () => {
  it("keeps re-entered split table-cell paragraphs on the responsive pagination path", () => {
    expect(shouldScheduleResponsiveTableCellDraftPagination({
      isTableCellParagraph: true,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(true)
  })

  it("keeps the first active table-cell split handoff responsive while the marker is set", () => {
    expect(shouldScheduleResponsiveTableCellDraftPagination({
      isTableCellParagraph: true,
      draftPaginationActive: true,
      currentFragmentCount: 1,
    })).toBe(true)
  })

  it("does not make unsplit table-cell edits responsive before a split marker exists", () => {
    expect(shouldScheduleResponsiveTableCellDraftPagination({
      isTableCellParagraph: true,
      draftPaginationActive: false,
      currentFragmentCount: 1,
    })).toBe(false)
  })

  it("does not promote non-table split paragraphs to the table-cell responsive path", () => {
    expect(shouldScheduleResponsiveTableCellDraftPagination({
      isTableCellParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(false)
  })
})

describe("shouldScheduleResponsiveContainerDraftPagination", () => {
  it("keeps split flow-stack paragraphs on the responsive path", () => {
    expect(shouldScheduleResponsiveContainerDraftPagination({
      isFlowStackParagraph: true,
      isTableCellParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(true)
  })

  it("keeps split table-cell paragraphs on the responsive path after pagination settles", () => {
    expect(shouldScheduleResponsiveContainerDraftPagination({
      isFlowStackParagraph: false,
      isTableCellParagraph: true,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(true)
  })

  it("keeps first split handoff responsive while the marker is active", () => {
    expect(shouldScheduleResponsiveContainerDraftPagination({
      isFlowStackParagraph: false,
      isTableCellParagraph: true,
      draftPaginationActive: true,
      currentFragmentCount: 1,
    })).toBe(true)
  })

  it("does not promote ordinary split body paragraphs to the container responsive path", () => {
    expect(shouldScheduleResponsiveContainerDraftPagination({
      isFlowStackParagraph: false,
      isTableCellParagraph: false,
      draftPaginationActive: false,
      currentFragmentCount: 2,
    })).toBe(false)
  })
})

describe("shouldUseWysiwygLocalDraftLines", () => {
  it("allows body paragraph page-boundary draft lines so the body preview can split them", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldUseWysiwygLocalDraftLines({
      reflow,
      isTableCellParagraph: false,
    })).toBe(true)
  })

  it("allows table-cell draft lines for same-page line-count changes", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldUseWysiwygLocalDraftLines({
      reflow,
      isTableCellParagraph: true,
    })).toBe(true)
  })

  it("keeps table-cell page-boundary edits on the settled pagination visual path", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldUseWysiwygLocalDraftLines({
      reflow,
      isTableCellParagraph: true,
    })).toBe(false)
  })
})

describe("shouldPrepareWysiwygTableCellDraftVisualPreview", () => {
  it("marks table-cell page-boundary edits as eligible for the table-aware preview lane", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldPrepareWysiwygTableCellDraftVisualPreview({
      reflow,
      isTableCellParagraph: true,
      isFlowStackParagraph: false,
      draftPaginationActive: false,
    })).toBe(true)
  })

  it("keeps same-page table-cell edits out of the table-aware preview lane", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment(),
      draftLines: [line("Hello"), line("world", 32)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldPrepareWysiwygTableCellDraftVisualPreview({
      reflow,
      isTableCellParagraph: true,
      isFlowStackParagraph: false,
      draftPaginationActive: false,
    })).toBe(false)
  })

  it("does not promote body or flow-stack paragraphs to the table-aware preview lane", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldPrepareWysiwygTableCellDraftVisualPreview({
      reflow,
      isTableCellParagraph: false,
      isFlowStackParagraph: false,
      draftPaginationActive: false,
    })).toBe(false)
    expect(shouldPrepareWysiwygTableCellDraftVisualPreview({
      reflow,
      isTableCellParagraph: true,
      isFlowStackParagraph: true,
      draftPaginationActive: false,
    })).toBe(false)
  })

  it("prefers settled draft pagination after the active table-cell marker exists", () => {
    const reflow = classifyWysiwygTextReflow({
      fragment: fragment({ y: 180 }),
      draftLines: [line("Hello", 180), line("world", 192)],
      draftHeight: 24,
      pageContentBottom: 200,
      supportsLocalDraftLayout: true,
    })

    expect(shouldPrepareWysiwygTableCellDraftVisualPreview({
      reflow,
      isTableCellParagraph: true,
      isFlowStackParagraph: false,
      draftPaginationActive: true,
    })).toBe(false)
  })
})

describe("shouldQueueSettledTableCellDraftPaginationFromVisualPreview", () => {
  it("queues settled pagination after the conservative table-cell visual preview appears", () => {
    expect(shouldQueueSettledTableCellDraftPaginationFromVisualPreview({
      hasVisualPreview: true,
      draftPaginationActive: false,
      existingSplitActive: false,
    })).toBe(true)
    expect(WYSIWYG_TABLE_CELL_VISUAL_PREVIEW_REFLOW_DECISION).toMatchObject({
      kind: "hard-page-boundary",
      shouldQueueSettledPagination: true,
    })
  })

  it("does not requeue once draft pagination or a real split is already active", () => {
    expect(shouldQueueSettledTableCellDraftPaginationFromVisualPreview({
      hasVisualPreview: true,
      draftPaginationActive: true,
      existingSplitActive: false,
    })).toBe(false)
    expect(shouldQueueSettledTableCellDraftPaginationFromVisualPreview({
      hasVisualPreview: true,
      draftPaginationActive: false,
      existingSplitActive: true,
    })).toBe(false)
    expect(shouldQueueSettledTableCellDraftPaginationFromVisualPreview({
      hasVisualPreview: false,
      draftPaginationActive: false,
      existingSplitActive: false,
    })).toBe(false)
  })
})

describe("resolveWysiwygDraftPaginationSource", () => {
  it("uses the latest synchronous draft snapshot before React state catches up", () => {
    expect(resolveWysiwygDraftPaginationSource({
      nodeId: "p1",
      session: {
        nodeId: "p1",
        draftText: "old draft",
        caretOffset: 9,
        dirtyVersion: 1,
      },
      latestSnapshot: {
        nodeId: "p1",
        draftText: "new draft",
        caretOffset: 3,
        revision: 4,
      },
    })).toEqual({
      nodeId: "p1",
      draftText: "new draft",
      caretOffset: 3,
      revision: 4,
    })
  })

  it("falls back to the session state when no matching snapshot is available", () => {
    expect(resolveWysiwygDraftPaginationSource({
      nodeId: "p1",
      session: {
        nodeId: "p1",
        draftText: "session draft",
        caretOffset: 5,
        dirtyVersion: 2,
      },
      latestSnapshot: {
        nodeId: "other",
        draftText: "other draft",
        caretOffset: 1,
        revision: 7,
      },
    })).toEqual({
      nodeId: "p1",
      draftText: "session draft",
      caretOffset: 5,
      revision: 2,
    })
  })

  it("returns null when neither the session nor latest snapshot is for the requested node", () => {
    expect(resolveWysiwygDraftPaginationSource({
      nodeId: "p1",
      session: {
        nodeId: "other",
        draftText: "other draft",
        caretOffset: 5,
        dirtyVersion: 2,
      },
      latestSnapshot: null,
    })).toBeNull()
  })
})
