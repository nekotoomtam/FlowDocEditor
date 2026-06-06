import {
  areWysiwygTextSelectionsEqual,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"

const WYSIWYG_TEXT_DRAFT_SYNC_QUIET_MS = 120
const WYSIWYG_TEXT_DRAFT_SYNC_MAX_LAG_MS = 5000

export interface WysiwygDraftSyncPayload {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null
}

export function areWysiwygDraftSyncPayloadsEqual(
  a: WysiwygDraftSyncPayload | null,
  b: WysiwygDraftSyncPayload | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.text === b.text &&
    a.caretOffset === b.caretOffset &&
    areWysiwygTextSelectionsEqual(a.selection, b.selection)
}

export function resolveWysiwygDraftSyncDelayMs(input: {
  firstRequestedAtMs: number
  nowMs: number
  quietWindowMs?: number
  maxLagMs?: number
}): number {
  const quietWindowMs = Math.max(0, input.quietWindowMs ?? WYSIWYG_TEXT_DRAFT_SYNC_QUIET_MS)
  const maxLagMs = Math.max(quietWindowMs, input.maxLagMs ?? WYSIWYG_TEXT_DRAFT_SYNC_MAX_LAG_MS)
  const elapsedMs = Math.max(0, input.nowMs - input.firstRequestedAtMs)
  if (elapsedMs >= maxLagMs) return 0
  return Math.min(quietWindowMs, maxLagMs - elapsedMs)
}
