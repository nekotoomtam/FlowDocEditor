import type { PaginatedDocument, PaginationProfile } from "@/pagination"
import {
  getMetricDefinition,
  getReportSchemaVersion,
  getTimingAnchorVersion,
} from "./runtime/editorPerformanceRuntime"
import type { EditorPerformanceMetricDefinition } from "./runtime/editorPerformanceRuntime"

export type WysiwygPerfEventKind =
  | "structural-operation-handler-execute"
  | "inline-edit-draft-update"
  | "inline-edit-start"
  | "inline-edit-selection-update"
  | "rich-draft-style-command"
  | "text-engine-pointer-frame"
  | "text-engine-pointer-hit-test"
  | "text-engine-pointer-selection-apply"
  | "text-engine-selection-overlay"
  | "editor-canvas-react-commit"
  | "editor-action-dispatch"
  | "editor-canvas-page-slot-attribution"
  | "inline-edit-finalize"
  | "inline-edit-exit-pagination"
  | "inline-edit-height-preview"
  | "native-edit-geometry-sync"
  | "active-paragraph-measure"
  | "text-engine-draft-measure"
  | "table-cell-reflow-decision"
  | "table-cell-visual-preview"
  | "table-cell-visual-chrome"
  | "draft-pagination-state"
  | "draft-pagination-schedule"
  | "browser-preview-pagination"
  | "flowdoc-island-input"
  | "flowdoc-island-draft-measure"
  | "flowdoc-island-fragment-split"
  | "flowdoc-island-visible-lines"
  | "flowdoc-island-react-commit"
  | "flowdoc-island-surface-react-commit"
  | "flowdoc-island-surface-live-layer-react-commit"
  | "flowdoc-island-surface-chrome-react-commit"
  | "flowdoc-island-caret-react-commit"
  | "flowdoc-island-visual-lines-react-commit"
  | "flowdoc-island-parent-sync"
  | "flowdoc-island-pointer-hit-test"
  | "flowdoc-island-structural-edit"
  | "flowdoc-island-structural-guard"
  | "flowdoc-structural-transaction"
  | "flowdoc-structural-attribution"
  | "flowdoc-structural-panel-release"
  | "flowdoc-preview-settle-runtime"
  | "flowdoc-wysiwyg-draft-runtime"
  | "flowdoc-structural-render-attribution"
  | "flowdoc-structural-pagination-schedule"
  | "flowdoc-island-blur-handoff"
  | "inline-edit-structural-refocus"
  | "enter-key-to-optimistic-island-visible"
  | "enter-key-to-new-caret-visible"
  | "structural-refocus-used-full-pagination-before-island"
  | "optimistic-refocus-stale-settle-ignored"
  | "structural-refocus-settled-pagination"
  | "inline-edit-end"
  | "flowdoc-island-focus"
  | "flowdoc-island-lifecycle"
  | "flowdoc-island-config"
  | "editor-shell-draft-change-enter"
  | "editor-shell-draft-change-exit"


export interface WysiwygPerfEvent {
  kind: WysiwygPerfEventKind
  startedAt: number
  durationMs: number
  nodeId?: string | null
  previousNodeId?: string | null
  sourceNodeId?: string | null
  expectedActiveNodeId?: string | null
  removedNodeId?: string | null
  pageIndex?: number | null
  draftVersion?: number | null
  currentDraftVersion?: number | null
  textLength?: number
  lineCount?: number
  availableWidth?: number
  paragraphHeight?: number
  draftMeasureProfiled?: boolean
  draftMeasureTextCallCount?: number
  draftMeasureTextMs?: number
  draftMeasureTextCharCount?: number
  draftMeasureTextMaxTextLength?: number
  draftMeasureTextUniqueKeyCount?: number
  draftMeasureLineHeightCallCount?: number
  draftMeasureLineHeightMs?: number
  draftMeasureWordSegmentCallCount?: number
  draftMeasureWordSegmentMs?: number
  draftMeasureWordSegmentCharCount?: number
  draftMeasureWordSegmentMaxTextLength?: number
  draftMeasureWordSegmentUniqueTextCount?: number
  draftMeasureResidualMs?: number
  draftFragmentCount?: number
  draftPageCount?: number
  draftSurfaceCount?: number
  draftMissingSurfaceCount?: number
  draftCandidatePageCount?: number
  draftFragmentInputChanged?: boolean
  draftFragmentOutputChanged?: boolean
  draftFragmentVisualChanged?: boolean
  draftFragmentSameInputRepeatCount?: number
  draftFragmentSameOutputRepeatCount?: number
  draftFragmentSameVisualRepeatCount?: number
  draftFragmentArrayReused?: boolean
  draftFragmentSameArrayRepeatCount?: number
  draftSurfaceKeysChanged?: boolean
  draftSurfaceSameKeyRepeatCount?: number
  draftFragmentReuseCandidate?: boolean
  draftFragmentResultReused?: boolean
  draftFragmentSameResultReuseRepeatCount?: number
  draftFragmentTelemetrySampled?: boolean
  draftFragmentSuppressedOutputUnchangedCount?: number
  draftFragmentOutputUnchangedSampleInterval?: number
  draftRootDraftChanged?: boolean
  draftRootLayoutChanged?: boolean
  draftRootSurfaceChanged?: boolean
  draftRootAnchorChanged?: boolean
  draftRootInputToVisibleActive?: boolean
  draftRootSameDraftRepeatCount?: number
  draftRootSameLayoutRepeatCount?: number
  draftRootSameSurfaceRepeatCount?: number
  draftRootSameAnchorRepeatCount?: number
  draftRootCommitReason?: string
  draftSurfaceRevisionChanged?: boolean
  draftSurfaceTextLengthChanged?: boolean
  draftSurfaceCaretChanged?: boolean
  draftSurfaceSelectionChanged?: boolean
  draftSurfaceLayoutChanged?: boolean
  draftSurfaceSurfaceChanged?: boolean
  draftSurfaceAnchorChanged?: boolean
  draftSurfaceInputToVisibleActive?: boolean
  draftSurfaceSameRevisionRepeatCount?: number
  draftSurfaceSameTextLengthRepeatCount?: number
  draftSurfaceSameCaretRepeatCount?: number
  draftSurfaceSameSelectionRepeatCount?: number
  draftSurfaceSameLayoutRepeatCount?: number
  draftSurfaceSameSurfaceRepeatCount?: number
  draftSurfaceSameAnchorRepeatCount?: number
  draftSurfaceCommitReason?: string
  draftLayoutCacheHit?: boolean
  requestedDelayMs?: number
  scheduledDelayMs?: number
  firstRequestedAtMs?: number
  source?: string
  action?: string
  operation?: string
  attemptedOperation?: string
  status?: string
  reason?: string
  token?: number
  key?: string
  active?: boolean
  reflowKind?: string
  reflowReason?: string
  responsiveDraftPaginationRequested?: boolean
  isTableCellParagraph?: boolean
  isFlowStackParagraph?: boolean
  draftPaginationActive?: boolean
  existingSplitActive?: boolean
  currentFragmentCount?: number
  previewFragmentCount?: number
  previewPageCount?: number
  previewCandidateCount?: number
  visualChromeCount?: number
  visualChromePageCount?: number
  remainingVisualChromeCount?: number
  pageIndexes?: string
  commandType?: string
  uiImpact?: string
  layoutScope?: string
  priority?: string
  styleFields?: string
  layoutAffecting?: boolean
  renderInvalidationLane?: string
  renderInvalidationPageScope?: string
  renderInvalidationInvalidatesPagination?: boolean
  renderInvalidationAffectedPageCount?: number
  renderInvalidationAffectedPages?: string
  localStylePreview?: boolean
  richDraft?: boolean
  selectionCollapsed?: boolean
  selectionRangeLength?: number
  pointerTargetCount?: number
  overlayRectCount?: number
  baseDurationMs?: number
  commitTime?: number
  pageCount?: number
  fragmentCount?: number
  paginationProfile?: PaginationProfile
  usedFullPaginationBeforeIsland?: boolean
  overflowedPage?: boolean
  optimisticMode?: "same-page" | "boundary-safe"
  validationMode?: "full" | "prevalidated" | "mixed"
  boundarySafeMode?: boolean
  affectedPageIndex?: number | null
  affectedPageCount?: number
  canvasViewportAffectedPageCount?: number
  canvasViewportAffectedPages?: string
  canvasViewportSuppressedPageBreakCount?: number
  canvasViewportUnrelatedPageBreakSuppressedCount?: number
  totalPageCount?: number
  unaffectedPage?: boolean
  componentName?: string
  renderReason?: string
  pageSlotMemoEqual?: boolean
  pageSlotWouldRender?: boolean
  pageScopedEditAffected?: boolean
  commitAttributionKind?: WysiwygPerfEventKind
  commitAttributionAction?: string
  commitAttributionSource?: string
  commitAttributionDelayMs?: number
  commitAttributionLookbackMs?: number
  comparatorCount?: number
  derivedValueCount?: number
  optimisticFragmentCount?: number
  suppressedPageBreakNodeId?: string | null
  latestSettleApplied?: boolean
  previewSettlePhase?: string
  previewSettleApplyDecision?: string | null
  previewSettleLatestAppliedGeneration?: number | null
  wysiwygDraftSessionBeginCount?: number
  wysiwygDraftSessionActiveCount?: number
  wysiwygDraftSessionCommitCount?: number
  wysiwygDraftSessionCancelCount?: number
  wysiwygDraftSessionAbortCount?: number
  wysiwygDraftCompositionStartCount?: number
  wysiwygDraftCompositionEndCount?: number
  wysiwygDraftStaleSessionIgnoredCount?: number
  wysiwygDraftCurrentGeneration?: number
  wysiwygDraftCurrentPhase?: string
  wysiwygDraftCurrentNodeId?: string | null
  wysiwygDraftSource?: string | null
  reducerPath?: string
}

export interface FlowDocPerfEvent {
  name: string
  startMs?: number
  durationMs?: number
  detail?: Record<string, unknown>
}

export function getWysiwygPerformanceReportSchemaVersion(): string {
  return getReportSchemaVersion()
}

export function getWysiwygPerformanceTimingAnchorVersion(): string {
  return getTimingAnchorVersion()
}

export function getWysiwygPerformanceMetricDefinition(
  name: string,
): EditorPerformanceMetricDefinition | null {
  return getMetricDefinition(name)
}

declare global {
  interface Window {
    __flowDocWysiwygPerfEvents?: WysiwygPerfEvent[]
    __flowDocWysiwygPerfAttributionEvents?: WysiwygPerfEvent[]
    __flowDocWysiwygPerfTraceEnabled?: boolean
    __flowDocPaginationProfileEnabled?: boolean
    __flowDocEditorSmokeState?: {
      document?: unknown
      selectedNodeId?: string | null
      selectionAnchorNodeId?: string | null
      lastSplitNodeId?: string | null
      mergeResult?: unknown
      updatedAt?: number
    }
    __FLOWDOC_PERF_EVENTS__?: FlowDocPerfEvent[]
  }
}

const MAX_WYSIWYG_PERF_EVENTS = 2000
const MAX_WYSIWYG_ATTRIBUTION_EVENTS = 200
const WYSIWYG_PERF_TRACE_QUERY_PARAM = "flowdocWysiwygPerfTrace"
const WYSIWYG_PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const PAGINATION_PROFILE_QUERY_PARAM = "flowdocProfilePagination"
const PAGINATION_PROFILE_STORAGE_KEY = "flowdoc.profilePagination"
const ENABLED_RUNTIME_VALUES = new Set(["", "1", "true", "on", "enabled"])

function runtimeFlagEnabled(rawValue: string | null | undefined): boolean {
  if (rawValue == null) return false
  return ENABLED_RUNTIME_VALUES.has(rawValue.trim().toLowerCase())
}

export function startWysiwygPerfSpan(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

export function appendWysiwygPerfEvent<T>(
  events: T[],
  event: T,
  maxEvents: number = MAX_WYSIWYG_PERF_EVENTS,
): T[] {
  if (maxEvents <= 0) return []
  const next = events.length >= maxEvents
    ? events.slice(events.length - maxEvents + 1)
    : events.slice()
  next.push(event)
  return next
}

export function summarizePaginatedForWysiwygPerf(
  paginated: PaginatedDocument,
): Pick<WysiwygPerfEvent, "pageCount" | "fragmentCount"> {
  let pageCount = 0
  let fragmentCount = 0
  for (const section of paginated.sections) {
    pageCount += section.pages.length
    for (const page of section.pages) {
      fragmentCount += page.fragments.length
    }
  }
  return { pageCount, fragmentCount }
}

function flowDocPerfEventName(kind: WysiwygPerfEventKind): string {
  switch (kind) {
    case "browser-preview-pagination":
      return "pagination:browser"
    case "inline-edit-start":
      return "inline-edit:enter"
    case "inline-edit-finalize":
      return "inline-edit:finalize"
    case "inline-edit-exit-pagination":
      return "inline-edit:exit-pagination"
    case "editor-canvas-react-commit":
      return "react:commit"
    case "editor-action-dispatch":
      return "editor:action-dispatch"
    default:
      return kind
  }
}

function toFlowDocPerfEvent(event: WysiwygPerfEvent): FlowDocPerfEvent {
  const {
    kind,
    startedAt,
    durationMs,
    ...detail
  } = event
  return {
    name: flowDocPerfEventName(kind),
    startMs: startedAt,
    durationMs,
    detail,
  }
}

export function isWysiwygPerfTraceRuntimeEnabled(
  compileTimeEnabled: boolean,
): boolean {
  if (compileTimeEnabled) return true
  if (typeof window === "undefined") return false
  if (typeof window.__flowDocWysiwygPerfTraceEnabled === "boolean") {
    return window.__flowDocWysiwygPerfTraceEnabled
  }

  const search = window.location?.search ?? ""
  if (runtimeFlagEnabled(new URLSearchParams(search).get(WYSIWYG_PERF_TRACE_QUERY_PARAM))) {
    return true
  }

  try {
    return runtimeFlagEnabled(window.localStorage?.getItem(WYSIWYG_PERF_TRACE_STORAGE_KEY))
  } catch {
    return false
  }
}

export function isPaginationProfileRuntimeEnabled(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.__flowDocPaginationProfileEnabled === "boolean") {
    return window.__flowDocPaginationProfileEnabled
  }

  const search = window.location?.search ?? ""
  if (runtimeFlagEnabled(new URLSearchParams(search).get(PAGINATION_PROFILE_QUERY_PARAM))) {
    return true
  }

  try {
    return runtimeFlagEnabled(window.localStorage?.getItem(PAGINATION_PROFILE_STORAGE_KEY))
  } catch {
    return false
  }
}

export function finishWysiwygPerfSpan(
  enabled: boolean,
  kind: WysiwygPerfEventKind,
  startedAt: number,
  metadata: Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs"> = {},
): void {
  if (!isWysiwygPerfTraceRuntimeEnabled(enabled)) return
  const endedAt = startWysiwygPerfSpan()
  recordWysiwygPerfEvent(enabled, {
    kind,
    startedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    ...metadata,
  })
}

export function finishFlowDocPerfSpan(
  enabled: boolean,
  name: string,
  startedAt: number,
  detail: Record<string, unknown> = {},
): void {
  if (!isWysiwygPerfTraceRuntimeEnabled(enabled)) return
  const endedAt = startWysiwygPerfSpan()
  recordFlowDocPerfEvent(enabled, {
    name,
    startMs: startedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    ...(Object.keys(detail).length > 0 ? { detail } : {}),
  })
}

export function recordWysiwygPerfEvent(
  enabled: boolean,
  event: WysiwygPerfEvent,
): void {
  if (!isWysiwygPerfTraceRuntimeEnabled(enabled)) return
  if (typeof window === "undefined") return
  window.__flowDocWysiwygPerfEvents = appendWysiwygPerfEvent(
    window.__flowDocWysiwygPerfEvents ?? [],
    event,
  )
  window.__FLOWDOC_PERF_EVENTS__ = appendWysiwygPerfEvent(
    window.__FLOWDOC_PERF_EVENTS__ ?? [],
    toFlowDocPerfEvent(event),
  )
}

export function recordWysiwygPerfAttributionEvent(
  enabled: boolean,
  event: WysiwygPerfEvent,
): void {
  if (!isWysiwygPerfTraceRuntimeEnabled(enabled)) return
  if (typeof window === "undefined") return
  window.__flowDocWysiwygPerfAttributionEvents = appendWysiwygPerfEvent(
    window.__flowDocWysiwygPerfAttributionEvents ?? [],
    event,
    MAX_WYSIWYG_ATTRIBUTION_EVENTS,
  )
}

export function recordFlowDocPerfEvent(
  enabled: boolean,
  event: FlowDocPerfEvent,
): void {
  if (!isWysiwygPerfTraceRuntimeEnabled(enabled)) return
  if (typeof window === "undefined") return
  window.__FLOWDOC_PERF_EVENTS__ = appendWysiwygPerfEvent(
    window.__FLOWDOC_PERF_EVENTS__ ?? [],
    event,
  )
}
