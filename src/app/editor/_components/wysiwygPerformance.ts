import type { PaginatedDocument } from "@/pagination"

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
}

declare global {
  interface Window {
    __flowDocWysiwygPerfEvents?: WysiwygPerfEvent[]
    __flowDocWysiwygPerfTraceEnabled?: boolean
  }
}

const MAX_WYSIWYG_PERF_EVENTS = 200
const WYSIWYG_PERF_TRACE_QUERY_PARAM = "flowdocWysiwygPerfTrace"
const WYSIWYG_PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
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

export function appendWysiwygPerfEvent(
  events: WysiwygPerfEvent[],
  event: WysiwygPerfEvent,
  maxEvents: number = MAX_WYSIWYG_PERF_EVENTS,
): WysiwygPerfEvent[] {
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
}
