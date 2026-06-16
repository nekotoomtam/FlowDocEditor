import { describe, expect, it, vi } from "vitest"
import type { StructuralEditTransaction } from "../../runtime/structuralEditRuntime"
import { resetStructuralEditTransactionForHistoryAction } from "../useEditorHistoryActions"

function structuralTransaction(input: {
  id: string
  generation: number
}): StructuralEditTransaction {
  return {
    id: input.id,
    generation: input.generation,
    kind: "split",
    phase: "preparing",
    sourceNodeId: "source-paragraph",
    expectedNodeCommitted: false,
    removedNodeCommitted: false,
    guardState: "active",
    acceptedStructuralKeyCount: 1,
    guardedStructuralKeyCount: 0,
    droppedStructuralKeyCount: 0,
    compositionIgnoredCount: 0,
    affectedPageIds: [],
    startedAt: 0,
  }
}

describe("resetStructuralEditTransactionForHistoryAction", () => {
  it("aborts the active structural transaction before undo history dispatch", () => {
    const abortStructuralEditTransactionAndPanelDeferral = vi.fn()
    const structuralEditRuntime = {
      getCurrentTransaction: vi.fn(() => structuralTransaction({
        id: "split-tx-2",
        generation: 2,
      })),
    }

    const didReset = resetStructuralEditTransactionForHistoryAction({
      action: "undo",
      structuralEditRuntime,
      abortStructuralEditTransactionAndPanelDeferral,
    })

    expect(didReset).toBe(true)
    expect(abortStructuralEditTransactionAndPanelDeferral).toHaveBeenCalledWith({
      id: "split-tx-2",
      generation: 2,
    }, "history-undo-reset")
  })

  it("uses a redo-specific reset reason", () => {
    const abortStructuralEditTransactionAndPanelDeferral = vi.fn()
    const structuralEditRuntime = {
      getCurrentTransaction: vi.fn(() => structuralTransaction({
        id: "split-tx-3",
        generation: 3,
      })),
    }

    resetStructuralEditTransactionForHistoryAction({
      action: "redo",
      structuralEditRuntime,
      abortStructuralEditTransactionAndPanelDeferral,
    })

    expect(abortStructuralEditTransactionAndPanelDeferral).toHaveBeenCalledWith({
      id: "split-tx-3",
      generation: 3,
    }, "history-redo-reset")
  })

  it("does not abort when no structural transaction is active", () => {
    const abortStructuralEditTransactionAndPanelDeferral = vi.fn()
    const structuralEditRuntime = {
      getCurrentTransaction: vi.fn(() => null),
    }

    const didReset = resetStructuralEditTransactionForHistoryAction({
      action: "undo",
      structuralEditRuntime,
      abortStructuralEditTransactionAndPanelDeferral,
    })

    expect(didReset).toBe(false)
    expect(abortStructuralEditTransactionAndPanelDeferral).not.toHaveBeenCalled()
  })
})
