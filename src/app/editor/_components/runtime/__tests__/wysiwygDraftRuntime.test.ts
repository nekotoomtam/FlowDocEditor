import { describe, expect, it } from "vitest"
import {
  createWysiwygDraftRuntime,
  type WysiwygDraftRuntimeEvent,
} from "../wysiwygDraftRuntime"

function createTestRuntime() {
  let clock = 100
  const events: WysiwygDraftRuntimeEvent[] = []
  const runtime = createWysiwygDraftRuntime({
    idFactory: (generation) => `draft-${generation}`,
    now: () => clock,
    onEvent: (event) => events.push(event),
  })

  return {
    events,
    runtime,
    tick: (ms = 1) => {
      clock += ms
      return clock
    },
  }
}

describe("WysiwygDraftRuntime", () => {
  it("begins plain text sessions with stable ids and increasing generations", () => {
    const { runtime } = createTestRuntime()

    const session = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      initialTextLength: 12,
      caretIndex: 4,
      selectionStart: 4,
      selectionEnd: 4,
      timestamp: 100,
    })

    expect(session).toMatchObject({
      id: "draft-1",
      generation: 1,
      nodeId: "p1",
      mode: "plain-text",
      phase: "starting",
      draftTextLength: 12,
      caretIndex: 4,
      isComposing: false,
    })
    expect(runtime.getCurrentSession()?.id).toBe("draft-1")
    expect(runtime.getMetricsSnapshot().wysiwygDraftSessionBeginCount).toBe(1)
  })

  it("marks the current session active", () => {
    const { runtime } = createTestRuntime()
    const session = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })

    expect(runtime.markDraftActive(session)).toMatchObject({ phase: "active" })
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      wysiwygDraftSessionActiveCount: 1,
      wysiwygDraftCurrentPhase: "active",
    })
  })

  it("updates caret and selection metadata while ignoring stale sessions", () => {
    const { events, runtime } = createTestRuntime()
    const stale = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })
    const current = runtime.beginDraftSession({
      nodeId: "p2",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(runtime.updateCaret(stale, {
      caretIndex: 8,
      selectionStart: 3,
      selectionEnd: 8,
      timestamp: 102,
    })).toBeNull()
    expect(runtime.updateCaret(current, {
      caretIndex: 2,
      selectionStart: 1,
      selectionEnd: 2,
      timestamp: 103,
    })).toMatchObject({
      nodeId: "p2",
      caretIndex: 2,
      selectionStart: 1,
      selectionEnd: 2,
    })
    expect(runtime.getMetricsSnapshot().wysiwygDraftStaleSessionIgnoredCount).toBe(1)
    expect(events.some((event) => event.action === "stale-ignored")).toBe(true)
  })

  it("tracks composition lifecycle without starting structural transactions", () => {
    const { runtime } = createTestRuntime()
    const session = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })
    runtime.markDraftActive(session, 101)

    expect(runtime.markCompositionStarted(session, 102)).toMatchObject({
      phase: "composing",
      isComposing: true,
      compositionStartedAt: 102,
      structuralTransactionId: null,
    })
    expect(runtime.markCompositionEnded(session, 103)).toMatchObject({
      phase: "active",
      isComposing: false,
      compositionEndedAt: 103,
      structuralTransactionId: null,
    })
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      wysiwygDraftCompositionStartCount: 1,
      wysiwygDraftCompositionEndCount: 1,
    })
  })

  it("moves active sessions through committing and committed lifecycle", () => {
    const { runtime } = createTestRuntime()
    const session = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "rich-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })
    runtime.markDraftActive(session, 101)

    expect(runtime.markCommitting(session, 102)).toMatchObject({ phase: "committing" })
    expect(runtime.markCommitted(session, 103)).toMatchObject({
      phase: "completed",
      committedAt: 103,
      completedAt: 103,
    })
    expect(runtime.getCurrentSession()).toBeNull()
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      wysiwygDraftSessionCommitCount: 1,
      wysiwygDraftCurrentPhase: "idle",
    })
  })

  it("records cancel and abort reasons and ignores stale aborts", () => {
    const { runtime } = createTestRuntime()
    const cancelled = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })

    expect(runtime.cancelDraftSession(cancelled, "document-replace", 101)).toMatchObject({
      phase: "cancelled",
      cancelReason: "document-replace",
    })
    expect(runtime.getCurrentSession()).toBeNull()

    const aborted = runtime.beginDraftSession({
      nodeId: "p2",
      mode: "plain-text",
      source: "shell-refocus",
      timestamp: 102,
    })
    expect(runtime.abortDraftSession(aborted, "structural-setup-failed", 103)).toMatchObject({
      phase: "aborted",
      abortReason: "structural-setup-failed",
    })
    expect(runtime.abortDraftSession(aborted, "stale-abort", 104)).toBeNull()
    expect(runtime.getMetricsSnapshot()).toMatchObject({
      wysiwygDraftSessionCancelCount: 1,
      wysiwygDraftSessionAbortCount: 1,
      wysiwygDraftStaleSessionIgnoredCount: 1,
    })
  })

  it("keeps the newer superseding session current", () => {
    const { events, runtime } = createTestRuntime()
    const first = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 100,
    })
    const second = runtime.beginDraftSession({
      nodeId: "p2",
      mode: "rich-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(runtime.updateDraftTextMetadata(first, { textVersion: 1, draftTextLength: 20, timestamp: 102 })).toBeNull()
    expect(runtime.getCurrentSession()).toMatchObject({
      id: second.id,
      nodeId: "p2",
      mode: "rich-text",
    })
    expect(events.map((event) => event.action)).toContain("superseded")
  })

  it("stores structural transaction metadata and aborts only the matching session", () => {
    const { runtime } = createTestRuntime()
    const structural = runtime.beginDraftSession({
      nodeId: "p2",
      mode: "plain-text",
      source: "shell-refocus",
      structuralTransactionId: "tx-1",
      structuralGeneration: 7,
      timestamp: 100,
    })
    const newer = runtime.beginDraftSession({
      nodeId: "p3",
      mode: "plain-text",
      source: "flowdoc-draft-island",
      timestamp: 101,
    })

    expect(structural).toMatchObject({
      structuralTransactionId: "tx-1",
      structuralGeneration: 7,
    })
    expect(runtime.abortDraftSession(structural, "structural-abort", 102)).toBeNull()
    expect(runtime.getCurrentSession()?.id).toBe(newer.id)
  })

  it("reports metrics snapshot counters and current fields", () => {
    const { runtime } = createTestRuntime()
    const session = runtime.beginDraftSession({
      nodeId: "p1",
      mode: "plain-text",
      source: "legacy-fallback",
      initialTextLength: 5,
      timestamp: 100,
    })
    runtime.markDraftActive(session, 101)
    runtime.updateDraftTextMetadata(session, {
      textVersion: 2,
      draftTextLength: 8,
      timestamp: 102,
    })

    expect(runtime.getMetricsSnapshot()).toMatchObject({
      wysiwygDraftSessionBeginCount: 1,
      wysiwygDraftSessionActiveCount: 1,
      wysiwygDraftCurrentGeneration: 1,
      wysiwygDraftCurrentPhase: "active",
      wysiwygDraftCurrentNodeId: "p1",
      wysiwygDraftSource: "legacy-fallback",
    })
  })
})
