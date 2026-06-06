import { useCallback, useRef } from "react"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"
import {
  createStructuralEditRuntime,
  type StructuralEditRuntime,
  type StructuralEditTransactionIdentity,
} from "../runtime/structuralEditRuntime"
import {
  createPanelDeferralRuntime,
  type PanelDeferralRuntime,
} from "../runtime/panelDeferralRuntime"
import {
  createPreviewSettleRuntime,
  type PreviewSettleRuntime,
} from "../runtime/previewSettleRuntime"
import {
  createWysiwygDraftRuntime,
  type WysiwygDraftRuntime,
  type WysiwygDraftSession,
  type WysiwygDraftSessionIdentity,
} from "../runtime/wysiwygDraftRuntime"
import {
  abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge,
  getCurrentTrackedWysiwygDraftRuntimeSessionBridge,
} from "../wysiwygDraftRuntimeBridge"
import { useStructuralEditController } from "../structuralEdit/useStructuralEditController"

export function useEditorRuntimeControllers() {
  const structuralEditRuntimeRef = useRef<StructuralEditRuntime | null>(null)
  if (structuralEditRuntimeRef.current === null) {
    structuralEditRuntimeRef.current = createStructuralEditRuntime({
      now: startWysiwygPerfSpan,
      onEvent: (event) => {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-structural-transaction",
          startedAt: event.startedAt,
          durationMs: 0,
          nodeId: event.targetNodeId ?? event.sourceNodeId,
          previousNodeId: event.removedNodeId ?? null,
          sourceNodeId: event.sourceNodeId,
          expectedActiveNodeId: event.expectedActiveNodeId,
          removedNodeId: event.removedNodeId,
          source: event.source ?? "structural-edit-runtime",
          action: event.phase ? `runtime-${event.phase}` : `runtime-${event.action}`,
          operation: event.kind,
          token: event.generation,
          key: event.key,
          active: event.action !== "stale-ignored" && event.action !== "cleared",
        })
      },
    })
  }
  const structuralEditRuntime = structuralEditRuntimeRef.current
  const structuralEditController = useStructuralEditController({
    structuralRuntime: structuralEditRuntime,
  })

  const panelDeferralRuntimeRef = useRef<PanelDeferralRuntime | null>(null)
  if (panelDeferralRuntimeRef.current === null) {
    panelDeferralRuntimeRef.current = createPanelDeferralRuntime({
      now: startWysiwygPerfSpan,
    })
  }
  const panelDeferralRuntime = panelDeferralRuntimeRef.current

  const previewSettleRuntimeRef = useRef<PreviewSettleRuntime | null>(null)
  if (previewSettleRuntimeRef.current === null) {
    previewSettleRuntimeRef.current = createPreviewSettleRuntime({
      now: startWysiwygPerfSpan,
      onEvent: (event) => {
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-preview-settle-runtime",
          startedAt: event.startedAt,
          durationMs: Math.max(0, event.durationMs ?? 0),
          nodeId: event.activeInlineNodeId ?? undefined,
          source: event.reason,
          action: `runtime-${event.action}`,
          operation: event.kind,
          token: event.generation,
          draftVersion: event.draftVersion,
          active: event.action !== "ignored-stale" && event.action !== "superseded" && event.action !== "cancelled" && event.action !== "failed",
          previewSettlePhase: event.phase,
          previewSettleApplyDecision: event.applyDecision,
          previewSettleLatestAppliedGeneration: event.latestAppliedGeneration,
        })
      },
    })
  }
  const previewSettleRuntime = previewSettleRuntimeRef.current

  const wysiwygDraftRuntimeRef = useRef<WysiwygDraftRuntime | null>(null)
  if (wysiwygDraftRuntimeRef.current === null) {
    wysiwygDraftRuntimeRef.current = createWysiwygDraftRuntime({
      now: startWysiwygPerfSpan,
      onEvent: (event) => {
        const metrics = wysiwygDraftRuntimeRef.current?.getMetricsSnapshot()
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-wysiwyg-draft-runtime",
          startedAt: event.startedAt,
          durationMs: 0,
          nodeId: event.nodeId ?? metrics?.wysiwygDraftCurrentNodeId ?? undefined,
          source: event.source ?? metrics?.wysiwygDraftSource ?? "wysiwyg-draft-runtime",
          action: `runtime-${event.action}`,
          token: event.generation,
          draftVersion: event.textVersion,
          textLength: event.draftTextLength,
          active: metrics?.wysiwygDraftCurrentNodeId != null,
          wysiwygDraftSessionBeginCount: metrics?.wysiwygDraftSessionBeginCount,
          wysiwygDraftSessionActiveCount: metrics?.wysiwygDraftSessionActiveCount,
          wysiwygDraftSessionCommitCount: metrics?.wysiwygDraftSessionCommitCount,
          wysiwygDraftSessionCancelCount: metrics?.wysiwygDraftSessionCancelCount,
          wysiwygDraftSessionAbortCount: metrics?.wysiwygDraftSessionAbortCount,
          wysiwygDraftCompositionStartCount: metrics?.wysiwygDraftCompositionStartCount,
          wysiwygDraftCompositionEndCount: metrics?.wysiwygDraftCompositionEndCount,
          wysiwygDraftStaleSessionIgnoredCount: metrics?.wysiwygDraftStaleSessionIgnoredCount,
          wysiwygDraftCurrentGeneration: metrics?.wysiwygDraftCurrentGeneration,
          wysiwygDraftCurrentPhase: metrics?.wysiwygDraftCurrentPhase,
          wysiwygDraftCurrentNodeId: metrics?.wysiwygDraftCurrentNodeId,
          wysiwygDraftSource: metrics?.wysiwygDraftSource,
        })
      },
    })
  }
  const wysiwygDraftRuntime = wysiwygDraftRuntimeRef.current
  const wysiwygDraftSessionIdentityRef = useRef<WysiwygDraftSessionIdentity | null>(null)

  const getCurrentWysiwygDraftRuntimeSession = useCallback((nodeId?: string | null): WysiwygDraftSession | null => {
    return getCurrentTrackedWysiwygDraftRuntimeSessionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      nodeId,
    )
  }, [wysiwygDraftRuntime])

  const abortWysiwygDraftRuntimeSessionForStructuralTransaction = useCallback((
    identity: StructuralEditTransactionIdentity,
    reason: string,
  ) => {
    abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      identity,
      reason,
      startWysiwygPerfSpan(),
    )
  }, [wysiwygDraftRuntime])

  return {
    structuralEditRuntime,
    structuralEditController,
    panelDeferralRuntime,
    previewSettleRuntime,
    wysiwygDraftRuntime,
    wysiwygDraftSessionIdentityRef,
    getCurrentWysiwygDraftRuntimeSession,
    abortWysiwygDraftRuntimeSessionForStructuralTransaction,
  }
}
