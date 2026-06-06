import { describe, expect, it } from "vitest"
import {
  classifyBoundarySafeSuppression,
  createLegacyAliases,
  createPerformanceSample,
  getMetricDefinition,
  getReportSchemaVersion,
  mergeRuntimeMetrics,
  normalizeReport,
  recordBoundarySafeSuppression,
  recordCounter,
  recordFrameWindowMetadata,
  recordTimingAnchors,
  resetSample,
} from "../editorPerformanceRuntime"

describe("EditorPerformanceRuntime", () => {
  it("aggregates counters from multiple sources", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })

    recordCounter(sample, "structuralGuardDecisionCount", 1, "structural-edit")
    recordCounter(sample, "structuralGuardDecisionCount", 2, "structural-edit")
    recordCounter(sample, "panelDeferralBeginCount", 1, "panel-deferral")

    expect(sample.counters.structuralGuardDecisionCount).toBe(3)
    expect(sample.counters.panelDeferralBeginCount).toBe(1)
    expect(sample.sources.structuralGuardDecisionCount).toBe("structural-edit")
  })

  it("creates legacy aliases without overwriting existing fields", () => {
    const aliases = createLegacyAliases({
      counters: {
        previewSettleSupersededCount: 2,
        panelDeferralReleaseStartedCount: 1,
        panelDeferralReleaseCompletedCount: 1,
        canvasViewportAffectedPageCount: 1,
      },
      timings: {
        panelSnapshotActiveMs: 40,
        panelLiveDocRestoredMs: 70,
      },
      flags: {
        panelReleaseRanInsideUrgentStructuralFlush: false,
      },
      fields: {
        canvasViewportAffectedPages: "0",
      },
    })

    expect(aliases.counters.supersededPaginationCount).toBe(2)
    expect(aliases.counters.deferredLeftRailReleaseApplyStartCount).toBe(1)
    expect(aliases.counters.deferredLeftRailReleaseLiveDocRestoredCount).toBe(1)
    expect(aliases.counters.affectedPageCount).toBe(1)
    expect(aliases.timings.leftRailSnapshotActiveMs).toBe(40)
    expect(aliases.timings.leftRailLiveDocRestoredMs).toBe(70)
    expect(aliases.flags.deferredLeftRailReleaseRanInsideUrgentStructuralFlush).toBe(false)
    expect(aliases.fields.affectedPageIndexes).toBe("0")
  })

  it("resets a sample without leaking fields from the previous sample", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })
    recordCounter(sample, "scheduledPaginationCount", 1, "preview-settle")

    const next = resetSample(sample, { sampleId: "b", startedAt: 20 })

    expect(next.sampleId).toBe("b")
    expect(next.counters.scheduledPaginationCount).toBeUndefined()
    expect(sample.counters.scheduledPaginationCount).toBe(1)
  })

  it("normalizes timing anchors and records unknown-anchor notes explicitly", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })

    recordTimingAnchors(sample, {
      keydownStart: 100,
      firstRaf: 116,
      flushSyncEnd: 145,
      islandDomVisible: 160,
      firstIslandPaintAnchor: "keydown-start",
    })

    expect(sample.timings.keydownToFirstIslandPaintMs).toBe(60)
    expect(sample.timings.keydownToFirstRafMs).toBe(16)
    expect(sample.timings.keydownToFlushEndMs).toBe(45)

    const unknown = createPerformanceSample({ mode: "enter-mid-split", sampleId: "b", startedAt: 0 })
    recordTimingAnchors(unknown, { keydownStart: 100, firstIslandPaintAnchor: "unknown" })
    expect(unknown.timings.keydownToFirstIslandPaintMs).toBeNull()
    expect(unknown.notes).toContain("first island paint timing anchor was unavailable")
    expect(unknown.notes).toContain("first island paint anchor is unknown")
  })

  it("classifies boundary-safe suppression without confusing count zero with not observed", () => {
    expect(classifyBoundarySafeSuppression({ expected: true, observed: true })).toBe("suppressed")
    expect(classifyBoundarySafeSuppression({ expected: true, observed: false })).toBe("not-observed")
    expect(classifyBoundarySafeSuppression({ expected: false, observed: null })).toBe("not-applicable")
    expect(classifyBoundarySafeSuppression({ expected: true, observed: null, required: false })).toBe("not-required")

    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })
    recordCounter(sample, "canvasViewportSuppressedPageBreakCount", 0, "canvas-viewport")
    recordBoundarySafeSuppression(sample, { expected: true, observed: false })
    const report = normalizeReport(sample)

    expect(report.counters.canvasViewportSuppressedPageBreakCount).toBe(0)
    expect(report.boundarySafeSuppressionObservation).toBe("not-observed")
  })

  it("records default and extended frame window metadata", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })
    recordFrameWindowMetadata(sample, {
      frameDelaysMs: [0, 50, 120, 4200],
      usedExtendedFrameWindow: false,
      waitedForFullSettle: false,
      waitedForBoundarySafeClear: false,
    })
    let report = normalizeReport(sample)
    expect(report.probeFrameWindowMs).toBe(4200)
    expect(report.probeUsedExtendedFrameWindow).toBe(false)

    recordFrameWindowMetadata(sample, {
      frameDelaysMs: [0, 50, 120, 4200, 7000],
      usedExtendedFrameWindow: true,
      extendedFrameWindowReason: "slow full pagination settle",
      waitedForFullSettle: true,
      waitedForBoundarySafeClear: true,
    })
    report = normalizeReport(sample)
    expect(report.probeFrameWindowMs).toBe(7000)
    expect(report.probeUsedExtendedFrameWindow).toBe(true)
    expect(report.probeExtendedFrameWindowReason).toBe("slow full pagination settle")
  })

  it("merges runtime metrics snapshots without overwriting unrelated fields", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })

    mergeRuntimeMetrics(sample, {
      source: "structural-edit",
      counters: { structuralGuardDecisionCount: 1 },
      fields: { structuralRuntimePhase: "urgent-painting" },
    })
    mergeRuntimeMetrics(sample, {
      source: "panel-deferral",
      counters: { panelDeferralBeginCount: 1 },
      timings: { panelSnapshotActiveMs: 25 },
    })
    mergeRuntimeMetrics(sample, {
      source: "preview-settle",
      counters: { previewSettleSupersededCount: 1 },
      fields: { previewSettleCurrentPhase: "applied" },
    })
    mergeRuntimeMetrics(sample, {
      source: "canvas-viewport",
      counters: { canvasViewportAffectedPageCount: 1 },
      fields: { canvasViewportAffectedPages: "0" },
    })

    const report = normalizeReport(sample)
    expect(report.counters.structuralGuardDecisionCount).toBe(1)
    expect(report.counters.panelDeferralBeginCount).toBe(1)
    expect(report.counters.supersededPaginationCount).toBe(1)
    expect(report.counters.affectedPageCount).toBe(1)
    expect(report.fields.structuralRuntimePhase).toBe("urgent-painting")
    expect(report.fields.previewSettleCurrentPhase).toBe("applied")
  })

  it("includes report schema version and metric definitions", () => {
    const sample = createPerformanceSample({ mode: "enter-mid-split", sampleId: "a", startedAt: 0 })
    const report = normalizeReport(sample)

    expect(report.schemaVersion).toBe(getReportSchemaVersion())
    expect(getMetricDefinition("fullPaginationSettledMs")).toMatchObject({
      name: "fullPaginationSettledMs",
      kind: "timing",
    })
    expect(getMetricDefinition("wysiwygDraftCurrentPhase")).toMatchObject({
      name: "wysiwygDraftCurrentPhase",
      kind: "field",
      source: "wysiwyg-draft",
    })
  })
})
