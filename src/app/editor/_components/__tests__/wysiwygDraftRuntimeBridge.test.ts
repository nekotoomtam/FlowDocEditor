import { describe, expect, it } from "vitest"
import { createWysiwygDraftRuntime } from "../runtime/wysiwygDraftRuntime"
import type { WysiwygDraftRuntimeSessionTracker } from "../wysiwygDraftRuntimeBridge"
import {
  abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge,
  beginTrackedWysiwygDraftRuntimeSessionBridge,
  cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge,
  createWysiwygDraftRuntimeSessionIdentity,
  getCurrentTrackedWysiwygDraftRuntimeSessionBridge,
  markCurrentTrackedWysiwygDraftRuntimeCompositionBridge,
  markTrackedWysiwygDraftRuntimeSessionCommittedBridge,
  markTrackedWysiwygDraftRuntimeSessionCommittingBridge,
  updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge,
} from "../wysiwygDraftRuntimeBridge"

function createBridgeHarness() {
  const runtime = createWysiwygDraftRuntime({
    idFactory: (generation) => `draft-${generation}`,
    now: () => 100,
  })
  const tracker: WysiwygDraftRuntimeSessionTracker = { current: null }
  return { runtime, tracker }
}

describe("wysiwyg draft runtime bridge", () => {
  it("begins, activates, and tracks draft runtime sessions", () => {
    const { runtime, tracker } = createBridgeHarness()

    const active = beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      initialTextLength: 12,
      caretIndex: 4,
      selection: { anchorOffset: 2, focusOffset: 4 },
      timestamp: 101,
    })

    expect(active).toMatchObject({
      id: "draft-1",
      generation: 1,
      nodeId: "p1",
      phase: "active",
      draftTextLength: 12,
      caretIndex: 4,
      selectionStart: 2,
      selectionEnd: 4,
    })
    expect(tracker.current).toEqual({ id: "draft-1", generation: 1 })
    expect(getCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, "p1")?.id).toBe("draft-1")
    expect(getCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, "p2")).toBeNull()
  })

  it("cancels and clears only the current tracked session", () => {
    const { runtime, tracker } = createBridgeHarness()
    beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge(
      runtime,
      tracker,
      "end-wysiwyg-text-session",
      102,
    )).toBe(true)
    expect(tracker.current).toBeNull()
    expect(runtime.getCurrentSession()).toBeNull()
    expect(cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, "empty", 103)).toBe(false)
  })

  it("aborts only matching structural draft sessions", () => {
    const { runtime, tracker } = createBridgeHarness()
    beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p2",
      mode: "plain-text",
      source: "shell-refocus",
      structuralTransactionId: "tx-1",
      structuralGeneration: 7,
      timestamp: 101,
    })

    expect(abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge(
      runtime,
      tracker,
      { id: "tx-other", generation: 7 },
      "wrong-transaction",
      102,
    )).toBe(false)
    expect(tracker.current).toEqual({ id: "draft-1", generation: 1 })

    expect(abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge(
      runtime,
      tracker,
      { id: "tx-1", generation: 7 },
      "structural-abort",
      103,
    )).toBe(true)
    expect(tracker.current).toBeNull()
    expect(runtime.getCurrentSession()).toBeNull()
  })

  it("marks committing and committed while clearing the tracked identity", () => {
    const { runtime, tracker } = createBridgeHarness()
    const active = beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p1",
      mode: "rich-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })
    const identity = createWysiwygDraftRuntimeSessionIdentity(active)

    expect(markTrackedWysiwygDraftRuntimeSessionCommittingBridge(runtime, identity, 102)).toMatchObject({
      phase: "committing",
    })
    expect(markTrackedWysiwygDraftRuntimeSessionCommittedBridge(runtime, tracker, identity, 103)).toMatchObject({
      phase: "completed",
      committedAt: 103,
    })
    expect(tracker.current).toBeNull()
    expect(runtime.getCurrentSession()).toBeNull()
  })

  it("updates caret, text metadata, and composition for the current tracked node", () => {
    const { runtime, tracker } = createBridgeHarness()
    beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge(runtime, tracker, {
      nodeId: "p1",
      caretIndex: 5,
      selection: { anchorOffset: 2, focusOffset: 5 },
      textVersion: 3,
      draftTextLength: 18,
      timestamp: 102,
    })).toBe(true)
    expect(updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge(runtime, tracker, {
      nodeId: "p2",
      caretIndex: 1,
      textVersion: 4,
      draftTextLength: 2,
      timestamp: 103,
    })).toBe(false)
    expect(runtime.getCurrentSession()).toMatchObject({
      nodeId: "p1",
      caretIndex: 5,
      selectionStart: 2,
      selectionEnd: 5,
      textVersion: 3,
      draftTextLength: 18,
    })

    expect(markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(runtime, tracker, {
      nodeId: "p1",
      isComposing: true,
      timestamp: 104,
    })).toBe(true)
    expect(runtime.getCurrentSession()).toMatchObject({ phase: "composing", isComposing: true })
    expect(markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(runtime, tracker, {
      nodeId: "p1",
      isComposing: false,
      timestamp: 105,
    })).toBe(true)
    expect(runtime.getCurrentSession()).toMatchObject({ phase: "active", isComposing: false })
  })

  it("ignores composition changes for stale or mismatched tracked sessions", () => {
    const { runtime, tracker } = createBridgeHarness()
    const active = beginTrackedWysiwygDraftRuntimeSessionBridge(runtime, tracker, {
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(runtime, tracker, {
      nodeId: "p2",
      isComposing: true,
      timestamp: 102,
    })).toBe(false)
    expect(runtime.getCurrentSession()).toMatchObject({
      id: active.id,
      nodeId: "p1",
      phase: "active",
      isComposing: false,
    })

    tracker.current = { id: active.id, generation: active.generation + 1 }
    expect(markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(runtime, tracker, {
      nodeId: "p1",
      isComposing: true,
      timestamp: 103,
    })).toBe(false)
    expect(runtime.getCurrentSession()).toMatchObject({
      id: active.id,
      nodeId: "p1",
      phase: "active",
      isComposing: false,
    })
  })
})
