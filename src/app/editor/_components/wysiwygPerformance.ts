import type { PaginatedDocument, PaginationProfile } from "@/pagination"

export type WysiwygPerfEventKind =
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
  | "inline-edit-finalize"
  | "inline-edit-exit-pagination"
  | "active-paragraph-measure"
  | "text-engine-draft-measure"
  | "browser-preview-pagination"

export interface WysiwygPerfEvent {
  kind: WysiwygPerfEventKind
  startedAt: number
  durationMs: number
  nodeId?: string
  pageIndex?: number | null
  draftVersion?: number | null
  textLength?: number
  lineCount?: number
  availableWidth?: number
  paragraphHeight?: number
  requestedDelayMs?: number
  scheduledDelayMs?: number
  source?: string
  commandType?: string
  uiImpact?: string
  layoutScope?: string
  priority?: string
  styleFields?: string
  layoutAffecting?: boolean
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
}

export interface FlowDocPerfEvent {
  name: string
  startMs?: number
  durationMs?: number
  detail?: Record<string, unknown>
}

declare global {
  interface Window {
    __flowDocWysiwygPerfEvents?: WysiwygPerfEvent[]
    __flowDocWysiwygPerfTraceEnabled?: boolean
    __flowDocPaginationProfileEnabled?: boolean
    __FLOWDOC_PERF_EVENTS__?: FlowDocPerfEvent[]
  }
}

const MAX_WYSIWYG_PERF_EVENTS = 600
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
