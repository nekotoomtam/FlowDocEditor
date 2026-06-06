export type EditorPerformanceLane =
  | "urgent-edit"
  | "affected-preview"
  | "deferred-panel"
  | "background-settle"
  | "diagnostic"

export type EditorPerformanceEventKind =
  | "counter"
  | "span-start"
  | "span-end"
  | "mark"
  | "sample"
  | "report-field"

export type EditorPerformanceMetricSource =
  | "structural-edit"
  | "panel-deferral"
  | "preview-settle"
  | "canvas-viewport"
  | "wysiwyg-draft"
  | "editor-shell"
  | "editor-canvas"
  | "browser-probe"

export type EditorPerformanceMetricKind = "counter" | "timing" | "flag" | "field"

export type BoundarySafeSuppressionObservation =
  | "suppressed"
  | "not-observed"
  | "not-applicable"
  | "not-required"
  | "unknown"

export type FirstIslandPaintAnchor =
  | "keydown-start"
  | "post-commit"
  | "probe-observation"
  | "unknown"

export interface EditorPerformanceMetricDefinition {
  name: string
  kind: EditorPerformanceMetricKind
  source: EditorPerformanceMetricSource
  lane: EditorPerformanceLane
  description: string
  legacyAliases?: string[]
}

export interface EditorPerformanceSampleInput {
  mode: string
  sampleId: string
  startedAt: number
  fields?: Record<string, unknown>
  counters?: Record<string, number>
  timings?: Record<string, number | null>
  flags?: Record<string, boolean | null>
  notes?: string[]
}

export interface EditorPerformanceSample {
  schemaVersion: string
  mode: string
  sampleId: string
  startedAt: number
  fields: Record<string, unknown>
  counters: Record<string, number>
  timings: Record<string, number | null>
  flags: Record<string, boolean | null>
  notes: string[]
  sources: Record<string, EditorPerformanceMetricSource>
}

export interface EditorPerformanceRuntimeMetricsMerge {
  source: EditorPerformanceMetricSource
  counters?: Record<string, number | null | undefined>
  timings?: Record<string, number | null | undefined>
  flags?: Record<string, boolean | null | undefined>
  fields?: Record<string, unknown>
  notes?: string[]
}

export interface BoundarySafeSuppressionClassificationInput {
  expected: boolean
  observed: boolean | null
  required?: boolean
  activeWindowObserved?: boolean | null
}

export interface ProbeFrameWindowMetadataInput {
  frameDelaysMs: readonly number[]
  usedExtendedFrameWindow: boolean
  extendedFrameWindowReason?: string | null
  waitedForFullSettle?: boolean | null
  waitedForBoundarySafeClear?: boolean | null
}

export interface EditorPerformanceTimingAnchorsInput {
  keydownStart?: number | null
  keydownEnd?: number | null
  flushSyncStart?: number | null
  flushSyncEnd?: number | null
  firstRaf?: number | null
  islandDomVisible?: number | null
  caretVisible?: number | null
  sourceParagraphUpdated?: number | null
  fullPaginationStart?: number | null
  fullPaginationEnd?: number | null
  firstIslandPaintAnchor?: FirstIslandPaintAnchor
}

export interface EditorPerformanceNormalizedReport {
  schemaVersion: string
  mode: string
  sampleId: string
  startedAt: number
  fields: Record<string, unknown>
  counters: Record<string, number>
  timings: Record<string, number | null>
  flags: Record<string, boolean | null>
  notes: string[]
  sources: Record<string, EditorPerformanceMetricSource>
  boundarySafeSuppressionObservation: BoundarySafeSuppressionObservation
  boundarySafeSuppressionExpected: boolean
  boundarySafeSuppressionObserved: boolean | null
  probeFrameWindowMs: number | null
  probeUsedExtendedFrameWindow: boolean
  probeExtendedFrameWindowReason: string | null
  probeWaitedForFullSettle: boolean | null
  probeWaitedForBoundarySafeClear: boolean | null
  timingAnchorVersion: string
  firstIslandPaintAnchor: FirstIslandPaintAnchor
}
