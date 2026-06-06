import { startTransition, useCallback, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import {
  areWysiwygDraftSyncPayloadsEqual,
  resolveWysiwygDraftSyncDelayMs,
  type WysiwygDraftSyncPayload,
} from "./wysiwygDraftSyncState"
import type { WysiwygTextSelection } from "./useWysiwygTextSession"

interface UseWysiwygDraftSyncSchedulerInput {
  nodeId: string
  onDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
}

export function useWysiwygDraftSyncScheduler(input: UseWysiwygDraftSyncSchedulerInput) {
  const pendingDraftSyncRef = useRef<WysiwygDraftSyncPayload | null>(null)
  const scheduledDraftSyncFrameRef = useRef<number | null>(null)
  const scheduledDraftSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftSyncFirstRequestedAtRef = useRef<number | null>(null)
  const onDraftChangeRef = useRef(input.onDraftChange)
  const nodeIdRef = useRef(input.nodeId)

  onDraftChangeRef.current = input.onDraftChange
  nodeIdRef.current = input.nodeId

  const cancelScheduledDraftSyncFrame = useCallback(() => {
    if (scheduledDraftSyncFrameRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduledDraftSyncFrameRef.current)
    }
    scheduledDraftSyncFrameRef.current = null
    if (scheduledDraftSyncTimeoutRef.current !== null) {
      clearTimeout(scheduledDraftSyncTimeoutRef.current)
      scheduledDraftSyncTimeoutRef.current = null
    }
    pendingDraftSyncFirstRequestedAtRef.current = null
  }, [])

  const flushPendingDraftSync = useCallback(() => {
    cancelScheduledDraftSyncFrame()
    const pending = pendingDraftSyncRef.current
    const currentOnDraftChange = onDraftChangeRef.current
    if (!pending || !currentOnDraftChange) return false
    pendingDraftSyncRef.current = null
    currentOnDraftChange(nodeIdRef.current, pending.text, pending.caretOffset, pending.selection)
    return true
  }, [cancelScheduledDraftSyncFrame])

  const flushPendingDraftSyncImmediately = useCallback(() => {
    let flushed = false
    flushSync(() => {
      flushed = flushPendingDraftSync()
    })
    return flushed
  }, [flushPendingDraftSync])

  const scheduleDraftSync = useCallback((payload: WysiwygDraftSyncPayload, options: {
    defer?: boolean
    quietWindowMs?: number
    maxLagMs?: number
  } = {}) => {
    const currentOnDraftChange = onDraftChangeRef.current
    if (!currentOnDraftChange) return false
    if (areWysiwygDraftSyncPayloadsEqual(pendingDraftSyncRef.current, payload)) return true
    pendingDraftSyncRef.current = payload
    if (!options.defer || typeof requestAnimationFrame !== "function") {
      pendingDraftSyncFirstRequestedAtRef.current = null
      flushPendingDraftSync()
      return true
    }
    const nowMs = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()
    const firstRequestedAtMs = pendingDraftSyncFirstRequestedAtRef.current ?? nowMs
    pendingDraftSyncFirstRequestedAtRef.current = firstRequestedAtMs
    const delayMs = resolveWysiwygDraftSyncDelayMs({
      firstRequestedAtMs,
      nowMs,
      quietWindowMs: options.quietWindowMs,
      maxLagMs: options.maxLagMs,
    })
    if (scheduledDraftSyncTimeoutRef.current !== null) {
      clearTimeout(scheduledDraftSyncTimeoutRef.current)
      scheduledDraftSyncTimeoutRef.current = null
    }
    scheduledDraftSyncTimeoutRef.current = setTimeout(() => {
      scheduledDraftSyncTimeoutRef.current = null
      const latest = pendingDraftSyncRef.current
      if (!latest || !onDraftChangeRef.current) return
      pendingDraftSyncRef.current = null
      pendingDraftSyncFirstRequestedAtRef.current = null
      startTransition(() => {
        onDraftChangeRef.current?.(nodeIdRef.current, latest.text, latest.caretOffset, latest.selection)
      })
    }, delayMs)
    return true
  }, [flushPendingDraftSync])

  useEffect(() => () => {
    cancelScheduledDraftSyncFrame()
  }, [cancelScheduledDraftSyncFrame])

  return {
    cancelScheduledDraftSyncFrame,
    flushPendingDraftSync,
    flushPendingDraftSyncImmediately,
    pendingDraftSyncRef,
    scheduleDraftSync,
  }
}
