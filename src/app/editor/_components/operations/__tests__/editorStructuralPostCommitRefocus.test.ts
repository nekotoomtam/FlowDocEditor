import { describe, expect, it, vi } from "vitest"
import { createDefaultDocument, splitParagraphAtIndex } from "@/document"
import { defaultTextMeasurer } from "@/layout"
import { paginateDocument, type PageFragment, type PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import type { PendingOptimisticMergeRefocus, PendingOptimisticSplitRefocus } from "../../shell/editorShellTypes"
import { replaceEditableParagraphTextInDocument } from "../../wysiwygTextCommit"
import {
  executePostCommitOptimisticMergeRefocus,
  executePostCommitOptimisticSplitRefocus,
  type PostCommitOptimisticSplitRefocusContext,
} from "../editorStructuralPostCommitRefocus"

function firstParagraphId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (!body || !("childIds" in body)) throw new Error("expected body root")
  return body.childIds[0]
}

function firstParagraphFragment(paginated: PaginatedDocument, nodeId: string): PageFragment {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragment = page.fragments.find((candidate) => candidate.nodeId === nodeId && candidate.nodeType === "paragraph")
      if (fragment) return fragment
    }
  }
  throw new Error(`missing paragraph fragment ${nodeId}`)
}

function pendingSplit(
  sourceNodeId: string,
  newNodeId: string,
  sourceFragment: PageFragment,
  prestarted = false,
): PendingOptimisticSplitRefocus {
  return {
    sourceNodeId,
    newNodeId,
    sourceFragment,
    startedAt: 10,
    prestarted,
  }
}

function pendingMerge(previousNodeId: string, prestarted = true): PendingOptimisticMergeRefocus {
  const previousFragment = {
    nodeId: previousNodeId,
    nodeType: "paragraph",
    pageIndex: 0,
    x: 0,
    y: 0,
    width: 100,
    height: 20,
  } as PageFragment
  return {
    currentNodeId: "current",
    previousNodeId,
    currentFragment: { ...previousFragment, nodeId: "current" },
    previousFragment,
    startedAt: 10,
    prestarted,
  }
}

function contextFor(
  doc: DocumentNode,
  paginated: PaginatedDocument,
  sourceFragment: PageFragment,
): PostCommitOptimisticSplitRefocusContext {
  return {
    doc,
    paginated,
    textMeasurer: defaultTextMeasurer,
    pageKeyByPageIndex: new Map([[sourceFragment.pageIndex, `page-${sourceFragment.pageIndex}`]]),
    setPendingOptimisticSplitRefocus: vi.fn(),
    setPaginatedRef: vi.fn(),
    setOptimisticLayoutRef: vi.fn(),
    setOptimisticStructuralSettleRef: vi.fn(),
    setSuppressNextLayoutLoadingOverlayRef: vi.fn(),
    dispatchEditorAction: vi.fn(),
    startInlineEditAfterOptimisticStructuralChange: vi.fn(() => true),
    clearWysiwygDraftPagination: vi.fn(),
    endWysiwygTextSession: vi.fn(),
    startWysiwygTextSession: vi.fn(),
    setOptimisticStructuralIslandOverride: vi.fn(),
    setOptimisticStructuralRefocusPaint: vi.fn(),
  }
}

describe("editorStructuralPostCommitRefocus", () => {
  it("moves the caret for a matching prestarted merge", () => {
    const context = {
      setPendingOptimisticMergeRefocus: vi.fn(),
      moveWysiwygTextCaret: vi.fn(),
    }

    expect(executePostCommitOptimisticMergeRefocus({
      nodeId: "previous",
      caretIndex: 4,
      pending: pendingMerge("previous"),
    }, context)).toBe(true)

    expect(context.setPendingOptimisticMergeRefocus).toHaveBeenCalledWith(null)
    expect(context.moveWysiwygTextCaret).toHaveBeenCalledWith(4)
  })

  it("clears stale merge refocus state without moving the caret", () => {
    const context = {
      setPendingOptimisticMergeRefocus: vi.fn(),
      moveWysiwygTextCaret: vi.fn(),
    }

    expect(executePostCommitOptimisticMergeRefocus({
      nodeId: "different",
      caretIndex: 4,
      pending: pendingMerge("previous"),
    }, context)).toBe(false)

    expect(context.setPendingOptimisticMergeRefocus).toHaveBeenCalledWith(null)
    expect(context.moveWysiwygTextCaret).not.toHaveBeenCalled()
  })

  it("clears a prestarted split without rebuilding the optimistic layout", () => {
    const doc = createDefaultDocument("Prestarted split")
    const nodeId = firstParagraphId(doc)
    const paginated = paginateDocument(doc, defaultTextMeasurer)
    const sourceFragment = firstParagraphFragment(paginated, nodeId)
    const context = contextFor(doc, paginated, sourceFragment)

    expect(executePostCommitOptimisticSplitRefocus({
      nodeId: "new-node",
      caretIndex: 0,
      pending: pendingSplit(nodeId, "new-node", sourceFragment, true),
    }, context)).toBe(true)

    expect(context.setPendingOptimisticSplitRefocus).toHaveBeenCalledWith(null)
    expect(context.dispatchEditorAction).not.toHaveBeenCalled()
    expect(context.startInlineEditAfterOptimisticStructuralChange).not.toHaveBeenCalled()
  })

  it("starts an optimistic split island after a committed split result", () => {
    const initialDoc = createDefaultDocument("Post commit split")
    const sourceNodeId = firstParagraphId(initialDoc)
    const textDoc = replaceEditableParagraphTextInDocument(initialDoc, sourceNodeId, "Alpha Beta Gamma")
    const beforePaginated = paginateDocument(textDoc, defaultTextMeasurer)
    const sourceFragment = firstParagraphFragment(beforePaginated, sourceNodeId)
    const split = splitParagraphAtIndex(textDoc, sourceNodeId, 6, { newNodeId: "split-node" })
    const context = contextFor(split.doc, beforePaginated, sourceFragment)

    expect(executePostCommitOptimisticSplitRefocus({
      nodeId: split.newNodeId,
      caretIndex: 0,
      pending: pendingSplit(sourceNodeId, split.newNodeId, sourceFragment),
    }, context)).toBe(true)

    expect(context.setPendingOptimisticSplitRefocus).toHaveBeenCalledWith(null)
    expect(context.setPaginatedRef).toHaveBeenCalled()
    expect(context.setOptimisticLayoutRef).toHaveBeenCalledWith(expect.objectContaining({ doc: split.doc }))
    expect(context.setOptimisticStructuralSettleRef).toHaveBeenCalledWith(expect.objectContaining({
      sourceNodeId,
      newNodeId: split.newNodeId,
    }))
    expect(context.setSuppressNextLayoutLoadingOverlayRef).toHaveBeenCalledWith(true)
    expect(context.dispatchEditorAction).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_PAGINATED" }))
    expect(context.startInlineEditAfterOptimisticStructuralChange).toHaveBeenCalledWith(
      split.newNodeId,
      0,
      expect.any(Object),
      sourceFragment.pageIndex,
    )
    expect(context.startWysiwygTextSession).toHaveBeenCalledWith(split.newNodeId, 0, sourceFragment.pageIndex)
    expect(context.setOptimisticStructuralIslandOverride).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: split.newNodeId,
      pageKey: `page-${sourceFragment.pageIndex}`,
    }))
    expect(context.setOptimisticStructuralRefocusPaint).toHaveBeenCalledWith({
      nodeId: split.newNodeId,
      startedAt: 10,
    })
  })

  it("falls back when the committed document cannot build the optimistic split", () => {
    const doc = createDefaultDocument("Unavailable split")
    const sourceNodeId = firstParagraphId(doc)
    const paginated = paginateDocument(doc, defaultTextMeasurer)
    const sourceFragment = firstParagraphFragment(paginated, sourceNodeId)
    const context = contextFor(doc, paginated, sourceFragment)

    expect(executePostCommitOptimisticSplitRefocus({
      nodeId: "missing-new-node",
      caretIndex: 0,
      pending: pendingSplit(sourceNodeId, "missing-new-node", sourceFragment),
    }, context)).toBe(false)

    expect(context.setPendingOptimisticSplitRefocus).toHaveBeenCalledWith(null)
    expect(context.dispatchEditorAction).not.toHaveBeenCalled()
    expect(context.startWysiwygTextSession).not.toHaveBeenCalled()
  })
})
