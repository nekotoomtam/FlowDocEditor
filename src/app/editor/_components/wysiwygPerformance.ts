import type { PaginatedDocument } from "@/pagination"

export type WysiwygPerfEventKind =
  | "inline-edit-draft-update"
  | "inline-edit-exit-pagination"
  | "active-paragraph-measure"
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
  pageCount?: number
  fragmentCount?: number
}

declare global {
  interface Window {
    __flowDocWysiwygPerfEvents?: WysiwygPerfEvent[]
  }
}

const MAX_WYSIWYG_PERF_EVENTS = 200

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

export function finishWysiwygPerfSpan(
  enabled: boolean,
  kind: WysiwygPerfEventKind,
  startedAt: number,
  metadata: Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs"> = {},
): void {
  if (!enabled || typeof window === "undefined") return
  const endedAt = startWysiwygPerfSpan()
  const event: WysiwygPerfEvent = {
    kind,
    startedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    ...metadata,
  }
  window.__flowDocWysiwygPerfEvents = appendWysiwygPerfEvent(
    window.__flowDocWysiwygPerfEvents ?? [],
    event,
  )
}

