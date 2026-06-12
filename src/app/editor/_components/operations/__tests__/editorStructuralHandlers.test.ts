import { afterEach, describe, expect, it, vi } from "vitest"
import type { PageFragment, PaginatedDocument } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import {
  executeParagraphMergeOperationPlan,
  type StructuralExecutionContext,
} from "../editorStructuralHandlers"
import type { ParagraphMergeOperationPlan } from "../editorStructuralOperationPlans"

function fragment(nodeId: string, pageIndex = 1): PageFragment {
  return {
    nodeId,
    nodeType: "paragraph",
    pageIndex,
    x: 10,
    y: 20,
    width: 300,
    height: 24,
  }
}

function paginated(id: string): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [
      {
        sectionId: id,
        pages: [
          {
            index: 1,
            width: 600,
            height: 800,
            contentBox: { x: 40, y: 40, width: 520, height: 720 },
            fragments: [fragment("previous"), fragment("current")],
            headerFragments: [],
            footerFragments: [],
          },
        ],
      },
    ],
  }
}

function paragraph(id: string): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {},
    children: [{ id: `${id}:text`, type: "text", text: "Merged text" }],
  } as ParagraphNode
}

function mergePlan(overrides: Partial<Extract<ParagraphMergeOperationPlan, { status: "success" }>> = {}): Extract<ParagraphMergeOperationPlan, { status: "success" }> {
  const doc = { document: { sections: [] } } as unknown as DocumentNode
  const nextPaginated = paginated("next")
  return {
    status: "success",
    sourceNodeId: "current",
    previousNodeId: "previous",
    sourceFragment: fragment("current"),
    previousFragment: fragment("previous"),
    mergedFragment: fragment("previous"),
    previousParagraph: paragraph("previous"),
    mergedText: "Merged text",
    optimisticLayout: { doc, paginated: nextPaginated },
    mode: "same-page",
    overflowedPage: false,
    pageKey: "page:1",
    operation: {
      kind: "paragraph.merge",
      urgency: "visible",
      scope: {
        nodeIds: ["current", "previous"],
        layoutScope: "from-index",
        uiImpact: "structure",
        needsHistory: true,
        needsPreviewSettle: true,
        canOptimistic: true,
      },
      action: {
        type: "MERGE_PARAGRAPH",
        nodeId: "current",
        text: "Merged text",
        precomputed: {
          doc,
          prevNodeId: "previous",
          caretIndex: 6,
        },
        precomputedDocValidation: "shell-optimistic-structural",
        paginated: nextPaginated,
      },
    },
    perf: { startedAt: 10 },
    ...overrides,
  }
}

function executionContext(overrides: Partial<StructuralExecutionContext> = {}): StructuralExecutionContext {
  const previousPaginated = paginated("previous")
  const previousLayout = { doc: { document: { sections: [] } } as unknown as DocumentNode, paginated: previousPaginated }
  const previousSettle = { marker: "previous-settle" } as any
  return {
    abortStructuralEditTransactionAndPanelDeferral: vi.fn(),
    beginStructuralPanelReleaseDeferral: vi.fn(),
    beginWysiwygDraftRuntimeSession: vi.fn(),
    clearWysiwygDraftPagination: vi.fn(),
    dispatchEditorAction: vi.fn(),
    endRichWysiwygDraftSession: vi.fn(),
    endWysiwygTextSession: vi.fn(),
    setOptimisticStructuralIslandOverride: vi.fn(),
    setOptimisticStructuralRefocusPaint: vi.fn(),
    startInlineEditAfterOptimisticStructuralChange: vi.fn(() => true),
    startPlainWysiwygTextSessionFromText: vi.fn(() => true),
    structuralEditController: {
      beginMerge: vi.fn(() => ({
        transaction: { id: "tx-1", generation: 1 },
        identity: { id: "tx-1", generation: 1 },
        panelDeferral: {
          transactionId: "tx-1",
          generation: 1,
          operation: "merge",
          nodeId: "previous",
          reason: "merge-urgent-structural-paint",
          startedAt: 10,
        },
      })),
      markUrgentPainting: vi.fn(),
      markMergeCommitted: vi.fn(),
    } as any,
    setPendingOptimisticSplitRefocus: vi.fn(),
    setPendingOptimisticMergeRefocus: vi.fn(),
    setPaginatedRef: vi.fn(),
    setOptimisticLayoutRef: vi.fn(),
    setOptimisticStructuralSettleRef: vi.fn(),
    setOptimisticStructuralPreviewSettleGraceUntilRef: vi.fn(),
    setSuppressNextLayoutLoadingOverlayRef: vi.fn(),
    getPaginatedRef: vi.fn(() => previousPaginated),
    getOptimisticLayoutRef: vi.fn(() => previousLayout),
    getOptimisticStructuralSettleRef: vi.fn(() => previousSettle),
    getOptimisticStructuralPreviewSettleGraceUntilRef: vi.fn(() => 1234),
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("editor structural handlers", () => {
  it("executes a merge plan through the injected structural context", () => {
    vi.useFakeTimers()
    const plan = mergePlan()
    const context = executionContext()

    expect(executeParagraphMergeOperationPlan(plan, context)).toBe(true)

    expect(context.setPendingOptimisticMergeRefocus).toHaveBeenCalledWith(expect.objectContaining({
      currentNodeId: "current",
      previousNodeId: "previous",
      prestarted: true,
    }))
    expect(context.setOptimisticStructuralSettleRef).toHaveBeenCalledWith(null)
    expect(context.setPaginatedRef).toHaveBeenCalledWith(plan.optimisticLayout.paginated)
    expect(context.setOptimisticLayoutRef).toHaveBeenCalledWith(plan.optimisticLayout)
    expect(context.setSuppressNextLayoutLoadingOverlayRef).toHaveBeenCalledWith(true)
    expect(context.startInlineEditAfterOptimisticStructuralChange).toHaveBeenCalledWith(
      "previous",
      6,
      plan.optimisticLayout.paginated,
      1,
      plan.optimisticLayout.doc,
      "Merged text",
    )
    expect(context.startPlainWysiwygTextSessionFromText).toHaveBeenCalledWith({
      nodeId: "previous",
      text: "Merged text",
      caretOffset: 6,
      pageIndex: 1,
    })

    vi.runAllTimers()

    expect(context.dispatchEditorAction).toHaveBeenCalledWith(expect.objectContaining({
      type: "MERGE_PARAGRAPH",
      nodeId: "current",
      isOptimistic: true,
    }))
    expect(context.structuralEditController.markMergeCommitted).toHaveBeenCalledWith(
      { id: "tx-1", generation: 1 },
      {
        removedNodeId: "current",
        committedNodeId: "previous",
      },
    )
    expect(context.endRichWysiwygDraftSession).toHaveBeenCalled()
  })

  it("rolls back merge optimistic state when text session setup fails", () => {
    const plan = mergePlan()
    const previousPaginated = paginated("rollback")
    const previousLayout = { doc: { document: { sections: [] } } as unknown as DocumentNode, paginated: previousPaginated }
    const previousSettle = { marker: "rollback-settle" } as any
    const context = executionContext({
      startPlainWysiwygTextSessionFromText: vi.fn(() => false),
      getPaginatedRef: vi.fn(() => previousPaginated),
      getOptimisticLayoutRef: vi.fn(() => previousLayout),
      getOptimisticStructuralSettleRef: vi.fn(() => previousSettle),
      getOptimisticStructuralPreviewSettleGraceUntilRef: vi.fn(() => 4567),
    })

    expect(executeParagraphMergeOperationPlan(plan, context)).toBe(false)

    expect(context.abortStructuralEditTransactionAndPanelDeferral).toHaveBeenCalledWith(
      { id: "tx-1", generation: 1 },
      "merge-text-session-setup-failed",
    )
    expect(context.setPendingOptimisticMergeRefocus).toHaveBeenLastCalledWith(null)
    expect(context.setOptimisticStructuralSettleRef).toHaveBeenLastCalledWith(previousSettle)
    expect(context.setOptimisticStructuralPreviewSettleGraceUntilRef).toHaveBeenLastCalledWith(4567)
    expect(context.setPaginatedRef).toHaveBeenLastCalledWith(previousPaginated)
    expect(context.setOptimisticLayoutRef).toHaveBeenLastCalledWith(previousLayout)
    expect(context.clearWysiwygDraftPagination).toHaveBeenCalled()
    expect(context.endWysiwygTextSession).toHaveBeenCalled()
    expect(context.dispatchEditorAction).not.toHaveBeenCalled()
    expect(context.structuralEditController.markMergeCommitted).not.toHaveBeenCalled()
  })
})
