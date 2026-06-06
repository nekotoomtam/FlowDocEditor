import type {
  BoundarySafeSuppressionClassificationInput,
  BoundarySafeSuppressionObservation,
  EditorPerformanceMetricDefinition,
  EditorPerformanceMetricKind,
  EditorPerformanceMetricSource,
  EditorPerformanceNormalizedReport,
  EditorPerformanceRuntimeMetricsMerge,
  EditorPerformanceSample,
  EditorPerformanceSampleInput,
  EditorPerformanceTimingAnchorsInput,
  FirstIslandPaintAnchor,
  ProbeFrameWindowMetadataInput,
} from "./editorPerformanceTypes"

export type {
  BoundarySafeSuppressionClassificationInput,
  BoundarySafeSuppressionObservation,
  EditorPerformanceEventKind,
  EditorPerformanceLane,
  EditorPerformanceMetricDefinition,
  EditorPerformanceMetricKind,
  EditorPerformanceMetricSource,
  EditorPerformanceNormalizedReport,
  EditorPerformanceRuntimeMetricsMerge,
  EditorPerformanceSample,
  EditorPerformanceSampleInput,
  EditorPerformanceTimingAnchorsInput,
  FirstIslandPaintAnchor,
  ProbeFrameWindowMetadataInput,
} from "./editorPerformanceTypes"

export const EDITOR_PERFORMANCE_REPORT_SCHEMA_VERSION = "editor-performance-report-v1"
export const EDITOR_PERFORMANCE_TIMING_ANCHOR_VERSION = "editor-performance-timing-anchors-v1"

const REQUIRED_FIELD_NAMES = [
  "structuralRuntimeGeneration",
  "structuralRuntimePhase",
  "structuralGuardDecisionCount",
  "structuralGuardAllowCount",
  "structuralGuardDropCount",
  "repeatedEnterGuardedCount",
  "repeatedBackspaceGuardedCount",
  "enterAfterSplitBackspaceAllowedCount",
  "structuralTransactionAbortCount",
  "staleStructuralUpdateIgnoredCount",
  "deferredLeftRailReleaseRenderMs",
  "deferredLeftRailReleaseRanInsideUrgentStructuralFlush",
  "panelDeferralBeginCount",
  "panelDeferralCancelCount",
  "panelDeferralAbortCount",
  "panelDeferralSupersedeCount",
  "panelDeferralReleaseStartedCount",
  "panelDeferralReleaseCompletedCount",
  "stalePanelReleaseIgnoredCount",
  "panelSnapshotActiveMs",
  "panelLiveDocRestoredMs",
  "deferredReleaseBlockedInputLikely",
  "nextInputDuringDeferredReleaseCount",
  "topToolbarRenderMsInsideUrgentFlush",
  "rightRailRenderMsInsideUrgentFlush",
  "totalPanelRenderMsInsideUrgentFlush",
  "scheduledPaginationCount",
  "completedPaginationCount",
  "supersededPaginationCount",
  "ignoredStalePaginationCount",
  "fullPaginationScheduledMs",
  "fullPaginationStartDelayMs",
  "fullPaginationComputeMs",
  "fullPaginationSettledMs",
  "latestSettleApplied",
  "fullPaginationBlocksFirstPaint",
  "previewSettleScheduledCount",
  "previewSettleStartedCount",
  "previewSettleCompletedCount",
  "previewSettleAppliedCount",
  "previewSettleSupersededCount",
  "previewSettleIgnoredStaleCount",
  "previewSettleFailedCount",
  "previewSettleGeneration",
  "previewSettleCurrentPhase",
  "previewSettleLatestAppliedGeneration",
  "canvasViewportAffectedPageCount",
  "canvasViewportAffectedPages",
  "canvasViewportSuppressedPageBreakCount",
  "canvasViewportUnrelatedPageBreakSuppressedCount",
  "affectedPageCount",
  "wysiwygDraftSessionBeginCount",
  "wysiwygDraftSessionActiveCount",
  "wysiwygDraftSessionCommitCount",
  "wysiwygDraftSessionCancelCount",
  "wysiwygDraftSessionAbortCount",
  "wysiwygDraftCompositionStartCount",
  "wysiwygDraftCompositionEndCount",
  "wysiwygDraftStaleSessionIgnoredCount",
  "wysiwygDraftCurrentGeneration",
  "wysiwygDraftCurrentPhase",
  "wysiwygDraftCurrentNodeId",
  "wysiwygDraftSource",
  "pagesRenderedDuringStructuralTransition",
  "unaffectedPagesRenderedCount",
  "pageViewMemoBailoutCount",
  "enterHandlerMs",
  "backspaceHandlerMs",
  "splitFlushSyncMs",
  "mergeFlushSyncMs",
  "flushSyncMs",
  "firstIslandPaintMs",
  "firstRafMs",
  "sourceParagraphUpdatedMs",
  "caretVisibleMs",
  "longestMainThreadTaskMs",
  "activeNodeMissingFromDocument",
  "ghostFragmentDetected",
  "duplicateTextDetected",
  "invalidDocumentDetected",
  "consoleNodeNotFoundErrorCount",
  "pageErrorCount",
  "structuralRefocusSafety.ok",
] as const

function metricKindForName(name: string): EditorPerformanceMetricKind {
  if (name.endsWith("Ms")) return "timing"
  if (
    name.endsWith("Count") ||
    name.endsWith("Generation") ||
    name === "affectedPageCount" ||
    name === "pagesRenderedDuringStructuralTransition" ||
    name === "unaffectedPagesRenderedCount" ||
    name === "consoleNodeNotFoundErrorCount" ||
    name === "pageErrorCount"
  ) {
    return "counter"
  }
  if (
    name.startsWith("activeNode") ||
    name.endsWith("Detected") ||
    name.endsWith("Applied") ||
    name.endsWith("BlocksFirstPaint") ||
    name.endsWith("RanInsideUrgentStructuralFlush") ||
    name === "structuralRefocusSafety.ok"
  ) {
    return "flag"
  }
  return "field"
}

function metricSourceForName(name: string): EditorPerformanceMetricSource {
  if (name.startsWith("wysiwygDraft")) return "wysiwyg-draft"
  if (name.startsWith("structural")) return "structural-edit"
  if (name.startsWith("panel") || name.startsWith("deferred") || name.includes("Rail") || name.includes("Toolbar")) return "panel-deferral"
  if (name.startsWith("preview") || name.includes("Pagination") || name === "latestSettleApplied") return "preview-settle"
  if (name.startsWith("canvas") || name === "affectedPageCount" || name.includes("Page")) return "canvas-viewport"
  if (name.includes("Node") || name.includes("ghost") || name.includes("duplicate") || name.includes("invalid") || name.includes("console")) return "browser-probe"
  return "browser-probe"
}

function defineMetric(name: string): EditorPerformanceMetricDefinition {
  const kind = metricKindForName(name)
  return {
    name,
    kind,
    source: metricSourceForName(name),
    lane: kind === "timing" && name.includes("Panel") ? "deferred-panel" : kind === "timing" ? "urgent-edit" : "diagnostic",
    description: `Stable Task 20 performance report field: ${name}.`,
  }
}

export const EDITOR_PERFORMANCE_FIELD_DEFINITIONS: Record<string, EditorPerformanceMetricDefinition> =
  Object.fromEntries(REQUIRED_FIELD_NAMES.map((name) => [name, defineMetric(name)]))

export function getReportSchemaVersion(): string {
  return EDITOR_PERFORMANCE_REPORT_SCHEMA_VERSION
}

export function getTimingAnchorVersion(): string {
  return EDITOR_PERFORMANCE_TIMING_ANCHOR_VERSION
}

export function getMetricDefinition(name: string): EditorPerformanceMetricDefinition | null {
  return EDITOR_PERFORMANCE_FIELD_DEFINITIONS[name] ?? null
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function sourceFor(sample: EditorPerformanceSample, name: string, source?: EditorPerformanceMetricSource): void {
  sample.sources[name] = source ?? getMetricDefinition(name)?.source ?? "browser-probe"
}

export function createPerformanceSample(input: EditorPerformanceSampleInput): EditorPerformanceSample {
  return {
    schemaVersion: EDITOR_PERFORMANCE_REPORT_SCHEMA_VERSION,
    mode: input.mode,
    sampleId: input.sampleId,
    startedAt: input.startedAt,
    fields: { ...(input.fields ?? {}) },
    counters: { ...(input.counters ?? {}) },
    timings: { ...(input.timings ?? {}) },
    flags: { ...(input.flags ?? {}) },
    notes: [...(input.notes ?? [])],
    sources: {},
  }
}

export function resetSample(
  sample: EditorPerformanceSample,
  input: Partial<EditorPerformanceSampleInput> = {},
): EditorPerformanceSample {
  return createPerformanceSample({
    mode: input.mode ?? sample.mode,
    sampleId: input.sampleId ?? sample.sampleId,
    startedAt: input.startedAt ?? sample.startedAt,
    fields: input.fields,
    counters: input.counters,
    timings: input.timings,
    flags: input.flags,
    notes: input.notes,
  })
}

export function recordCounter(
  sample: EditorPerformanceSample,
  name: string,
  delta = 1,
  source?: EditorPerformanceMetricSource,
): EditorPerformanceSample {
  const value = finiteNumber(delta) ?? 0
  sample.counters[name] = (sample.counters[name] ?? 0) + value
  sourceFor(sample, name, source)
  return sample
}

export function recordTiming(
  sample: EditorPerformanceSample,
  name: string,
  value: number | null,
  source?: EditorPerformanceMetricSource,
): EditorPerformanceSample {
  sample.timings[name] = finiteNumber(value)
  sourceFor(sample, name, source)
  return sample
}

export function recordFlag(
  sample: EditorPerformanceSample,
  name: string,
  value: boolean | null,
  source?: EditorPerformanceMetricSource,
): EditorPerformanceSample {
  sample.flags[name] = typeof value === "boolean" ? value : null
  sourceFor(sample, name, source)
  return sample
}

export function recordField(
  sample: EditorPerformanceSample,
  name: string,
  value: unknown,
  source?: EditorPerformanceMetricSource,
): EditorPerformanceSample {
  sample.fields[name] = value
  sourceFor(sample, name, source)
  return sample
}

export function recordNote(sample: EditorPerformanceSample, note: string): EditorPerformanceSample {
  if (note && !sample.notes.includes(note)) sample.notes.push(note)
  return sample
}

export function mergeRuntimeMetrics(
  sample: EditorPerformanceSample,
  metrics: EditorPerformanceRuntimeMetricsMerge,
): EditorPerformanceSample {
  for (const [name, value] of Object.entries(metrics.counters ?? {})) {
    if (value != null) recordCounter(sample, name, value, metrics.source)
  }
  for (const [name, value] of Object.entries(metrics.timings ?? {})) {
    recordTiming(sample, name, value ?? null, metrics.source)
  }
  for (const [name, value] of Object.entries(metrics.flags ?? {})) {
    recordFlag(sample, name, value ?? null, metrics.source)
  }
  for (const [name, value] of Object.entries(metrics.fields ?? {})) {
    recordField(sample, name, value, metrics.source)
  }
  for (const note of metrics.notes ?? []) {
    recordNote(sample, note)
  }
  return sample
}

function copyNumberAlias(values: Record<string, number>, from: string, to: string): void {
  if (values[to] !== undefined) return
  const value = values[from]
  if (typeof value === "number" && Number.isFinite(value)) values[to] = value
}

function copyTimingAlias(values: Record<string, number | null>, from: string, to: string): void {
  if (values[to] !== undefined) return
  if (Object.prototype.hasOwnProperty.call(values, from)) values[to] = values[from]
}

function copyFlagAlias(values: Record<string, boolean | null>, from: string, to: string): void {
  if (values[to] !== undefined) return
  if (Object.prototype.hasOwnProperty.call(values, from)) values[to] = values[from]
}

export function createLegacyAliases(input: Pick<EditorPerformanceSample, "counters" | "timings" | "flags" | "fields">): {
  counters: Record<string, number>
  timings: Record<string, number | null>
  flags: Record<string, boolean | null>
  fields: Record<string, unknown>
} {
  const counters = { ...input.counters }
  const timings = { ...input.timings }
  const flags = { ...input.flags }
  const fields = { ...input.fields }

  copyNumberAlias(counters, "previewSettleSupersededCount", "supersededPaginationCount")
  copyNumberAlias(counters, "previewSettleIgnoredStaleCount", "ignoredStalePaginationCount")
  copyNumberAlias(counters, "previewSettleCompletedCount", "completedPaginationCount")
  copyNumberAlias(counters, "previewSettleScheduledCount", "scheduledPaginationCount")
  copyNumberAlias(counters, "panelDeferralCancelCount", "deferredLeftRailReleaseCancelledCount")
  copyNumberAlias(counters, "panelDeferralSupersedeCount", "deferredLeftRailReleaseSupersededCount")
  copyNumberAlias(counters, "panelDeferralReleaseStartedCount", "deferredLeftRailReleaseApplyStartCount")
  copyNumberAlias(counters, "panelDeferralReleaseCompletedCount", "deferredLeftRailReleaseLiveDocRestoredCount")
  copyNumberAlias(counters, "canvasViewportAffectedPageCount", "affectedPageCount")
  copyTimingAlias(timings, "panelSnapshotActiveMs", "leftRailSnapshotActiveMs")
  copyTimingAlias(timings, "panelLiveDocRestoredMs", "leftRailLiveDocRestoredMs")
  copyTimingAlias(timings, "previewSettleScheduledMs", "fullPaginationScheduledMs")
  copyTimingAlias(timings, "splitFlushSyncMs", "flushSyncMs")
  copyFlagAlias(flags, "panelReleaseRanInsideUrgentStructuralFlush", "deferredLeftRailReleaseRanInsideUrgentStructuralFlush")
  if (fields.canvasViewportAffectedPages != null && fields.affectedPageIndexes == null) {
    fields.affectedPageIndexes = fields.canvasViewportAffectedPages
  }

  return { counters, timings, flags, fields }
}

export function classifyBoundarySafeSuppression(
  input: BoundarySafeSuppressionClassificationInput,
): BoundarySafeSuppressionObservation {
  if (input.required === false) return "not-required"
  if (!input.expected) return "not-applicable"
  if (input.observed === true) return "suppressed"
  if (input.observed === false) return "not-observed"
  if (input.activeWindowObserved === false) return "not-observed"
  return "unknown"
}

export function recordBoundarySafeSuppression(
  sample: EditorPerformanceSample,
  input: BoundarySafeSuppressionClassificationInput,
): EditorPerformanceSample {
  const observation = classifyBoundarySafeSuppression(input)
  recordField(sample, "boundarySafeSuppressionObservation", observation, "browser-probe")
  recordField(sample, "boundarySafeSuppressionExpected", input.expected, "browser-probe")
  recordField(sample, "boundarySafeSuppressionObserved", input.observed, "browser-probe")
  return sample
}

export function recordFrameWindowMetadata(
  sample: EditorPerformanceSample,
  input: ProbeFrameWindowMetadataInput,
): EditorPerformanceSample {
  const frameWindowMs = input.frameDelaysMs.reduce((max, value) => (
    typeof value === "number" && Number.isFinite(value) ? Math.max(max, value) : max
  ), 0)
  recordField(sample, "probeFrameWindowMs", frameWindowMs, "browser-probe")
  recordField(sample, "probeUsedExtendedFrameWindow", input.usedExtendedFrameWindow, "browser-probe")
  recordField(sample, "probeExtendedFrameWindowReason", input.extendedFrameWindowReason ?? null, "browser-probe")
  recordField(sample, "probeWaitedForFullSettle", input.waitedForFullSettle ?? null, "browser-probe")
  recordField(sample, "probeWaitedForBoundarySafeClear", input.waitedForBoundarySafeClear ?? null, "browser-probe")
  return sample
}

function durationFrom(start: number | null | undefined, end: number | null | undefined): number | null {
  const normalizedStart = finiteNumber(start)
  const normalizedEnd = finiteNumber(end)
  if (normalizedStart == null || normalizedEnd == null) return null
  return Math.max(0, normalizedEnd - normalizedStart)
}

export function recordTimingAnchors(
  sample: EditorPerformanceSample,
  anchors: EditorPerformanceTimingAnchorsInput,
): EditorPerformanceSample {
  recordField(sample, "timingAnchorVersion", EDITOR_PERFORMANCE_TIMING_ANCHOR_VERSION, "browser-probe")
  recordField(sample, "firstIslandPaintAnchor", anchors.firstIslandPaintAnchor ?? "unknown", "browser-probe")

  const firstIslandPaintMs = durationFrom(anchors.keydownStart, anchors.islandDomVisible)
  const firstRafMs = durationFrom(anchors.keydownStart, anchors.firstRaf)
  const flushEndMs = durationFrom(anchors.keydownStart, anchors.flushSyncEnd)
  recordTiming(sample, "keydownToFirstIslandPaintMs", firstIslandPaintMs, "browser-probe")
  recordTiming(sample, "keydownToFirstRafMs", firstRafMs, "browser-probe")
  recordTiming(sample, "keydownToFlushEndMs", flushEndMs, "browser-probe")

  if (firstIslandPaintMs == null) {
    recordNote(sample, "first island paint timing anchor was unavailable")
  }
  if ((anchors.firstIslandPaintAnchor ?? "unknown") === "unknown") {
    recordNote(sample, "first island paint anchor is unknown")
  }
  return sample
}

function fieldBoolean(fields: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const value = fields[name]
  return typeof value === "boolean" ? value : fallback
}

function fieldBooleanOrNull(fields: Record<string, unknown>, name: string): boolean | null {
  const value = fields[name]
  return typeof value === "boolean" ? value : null
}

function fieldStringOrNull<T extends string>(fields: Record<string, unknown>, name: string, fallback: T): T {
  const value = fields[name]
  return typeof value === "string" ? value as T : fallback
}

function fieldNumberOrNull(fields: Record<string, unknown>, name: string): number | null {
  const value = fields[name]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function normalizeReport(sample: EditorPerformanceSample): EditorPerformanceNormalizedReport {
  const aliases = createLegacyAliases(sample)
  const fields: Record<string, unknown> = {
    ...aliases.fields,
    timingAnchorVersion: aliases.fields.timingAnchorVersion ?? EDITOR_PERFORMANCE_TIMING_ANCHOR_VERSION,
  }
  const boundarySafeSuppressionObservation = fieldStringOrNull<BoundarySafeSuppressionObservation>(
    fields,
    "boundarySafeSuppressionObservation",
    "unknown",
  )
  return {
    schemaVersion: sample.schemaVersion,
    mode: sample.mode,
    sampleId: sample.sampleId,
    startedAt: sample.startedAt,
    fields,
    counters: aliases.counters,
    timings: aliases.timings,
    flags: aliases.flags,
    notes: [...sample.notes],
    sources: { ...sample.sources },
    boundarySafeSuppressionObservation,
    boundarySafeSuppressionExpected: fieldBoolean(fields, "boundarySafeSuppressionExpected", false),
    boundarySafeSuppressionObserved: fieldBooleanOrNull(fields, "boundarySafeSuppressionObserved"),
    probeFrameWindowMs: fieldNumberOrNull(fields, "probeFrameWindowMs"),
    probeUsedExtendedFrameWindow: fieldBoolean(fields, "probeUsedExtendedFrameWindow", false),
    probeExtendedFrameWindowReason: typeof fields.probeExtendedFrameWindowReason === "string" ? fields.probeExtendedFrameWindowReason : null,
    probeWaitedForFullSettle: fieldBooleanOrNull(fields, "probeWaitedForFullSettle"),
    probeWaitedForBoundarySafeClear: fieldBooleanOrNull(fields, "probeWaitedForBoundarySafeClear"),
    timingAnchorVersion: typeof fields.timingAnchorVersion === "string" ? fields.timingAnchorVersion : EDITOR_PERFORMANCE_TIMING_ANCHOR_VERSION,
    firstIslandPaintAnchor: fieldStringOrNull<FirstIslandPaintAnchor>(fields, "firstIslandPaintAnchor", "unknown"),
  }
}
