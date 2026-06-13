import { useLayoutEffect, useRef, type MutableRefObject } from "react"
import type { DocumentNode } from "@/schema"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"
import type { PanelDeferralRuntime } from "../runtime/panelDeferralRuntime"
import type { StructuralEditRuntime } from "../runtime/structuralEditRuntime"
import {
  markStructuralPanelReleaseCompletedBridge,
  type StructuralPanelReleaseApplying,
  type StructuralPanelReleaseOperation,
} from "../structuralEdit/panelDeferralBridge"
import type {
  OptimisticStructuralIslandOverride,
  OptimisticStructuralRefocusPaint,
} from "./editorShellTypes"

type StructuralPanelReleaseEventMetadata = {
  generation?: number
  operation?: StructuralPanelReleaseOperation
  nodeId?: string | null
  source?: string
  startedAt?: number
  durationMs?: number
  active?: boolean
}

type RecordStructuralPanelReleaseEvent = (
  action: string,
  metadata?: StructuralPanelReleaseEventMetadata,
) => void

import { editorStructuralIslandStore } from "./editorStructuralIslandStore"

export function useEditorLeftRailDocuments({
  doc,
  previewDoc,
  isTemplateMode,
  panelDeferralRuntime,
  structuralEditRuntime,
  structuralPanelReleaseApplyingRef,
  recordStructuralPanelReleaseEvent,
  isInlineEditing = false,
}: {
  doc: DocumentNode
  previewDoc: DocumentNode
  isTemplateMode: boolean
  panelDeferralRuntime: PanelDeferralRuntime
  structuralEditRuntime: StructuralEditRuntime
  structuralPanelReleaseApplyingRef: MutableRefObject<StructuralPanelReleaseApplying | null>
  recordStructuralPanelReleaseEvent: RecordStructuralPanelReleaseEvent
  isInlineEditing?: boolean
}) {
  const currentLeftRailOutlineDoc = isTemplateMode ? doc : previewDoc
  const currentLeftRailStyleDoc = doc
  const panelDeferralSnapshotActive = panelDeferralRuntime.shouldUsePanelSnapshot()
  const panelDeferralNonInteractive = panelDeferralRuntime.isPanelNonInteractive()
  const { optimisticStructuralRefocusPaint, optimisticStructuralIslandOverride } = editorStructuralIslandStore.getState()
  const structuralIslandBlocksPanelRelease = optimisticStructuralIslandOverride?.suppressedPageBreakNodeId != null
  const deferLeftRailForStructuralPaint = optimisticStructuralRefocusPaint !== null ||
    structuralIslandBlocksPanelRelease ||
    panelDeferralSnapshotActive
  const deferNonCriticalPanelsForStructuralPaint = deferLeftRailForStructuralPaint || panelDeferralNonInteractive
  const deferLeftRailDocForStructuralPaint = deferLeftRailForStructuralPaint || isInlineEditing
  const leftRailDocumentSnapshotRef = useRef<{ outlineDoc: DocumentNode; styleDoc: DocumentNode } | null>(null)
  const previousDeferLeftRailForStructuralPaintRef = useRef(deferLeftRailForStructuralPaint)

  if (leftRailDocumentSnapshotRef.current === null) {
    leftRailDocumentSnapshotRef.current = {
      outlineDoc: currentLeftRailOutlineDoc,
      styleDoc: currentLeftRailStyleDoc,
    }
  }

  const leftRailOutlineDoc = deferLeftRailDocForStructuralPaint
    ? leftRailDocumentSnapshotRef.current.outlineDoc
    : currentLeftRailOutlineDoc
  const leftRailStyleDoc = deferLeftRailDocForStructuralPaint
    ? leftRailDocumentSnapshotRef.current.styleDoc
    : currentLeftRailStyleDoc

  useLayoutEffect(() => {
    if (deferLeftRailDocForStructuralPaint) return
    leftRailDocumentSnapshotRef.current = {
      outlineDoc: currentLeftRailOutlineDoc,
      styleDoc: currentLeftRailStyleDoc,
    }
  }, [currentLeftRailOutlineDoc, currentLeftRailStyleDoc, deferLeftRailDocForStructuralPaint])

  useLayoutEffect(() => {
    const wasDeferred = previousDeferLeftRailForStructuralPaintRef.current
    if (wasDeferred && !deferLeftRailForStructuralPaint) {
      const applying = structuralPanelReleaseApplyingRef.current
      const restoredAt = startWysiwygPerfSpan()
      if (applying) {
        recordStructuralPanelReleaseEvent("live-doc-restored", {
          generation: applying.generation,
          operation: applying.operation,
          nodeId: applying.nodeId,
          source: "left-rail-live-doc-restored",
          startedAt: applying.deferredStartedAt,
          durationMs: Math.max(0, restoredAt - applying.deferredStartedAt),
          active: false,
        })
        markStructuralPanelReleaseCompletedBridge(panelDeferralRuntime, applying, restoredAt)
        const identity = {
          id: applying.transactionId,
          generation: applying.generation,
        }
        structuralEditRuntime.markComplete(identity)
        structuralEditRuntime.clearIfCurrent(identity)
      }
      structuralPanelReleaseApplyingRef.current = null
    }
    previousDeferLeftRailForStructuralPaintRef.current = deferLeftRailForStructuralPaint
  }, [
    deferLeftRailForStructuralPaint,
    panelDeferralRuntime,
    recordStructuralPanelReleaseEvent,
    structuralEditRuntime,
    structuralPanelReleaseApplyingRef,
  ])

  return {
    leftRailOutlineDoc,
    leftRailStyleDoc,
    deferLeftRailForStructuralPaint,
    deferNonCriticalPanelsForStructuralPaint,
  }
}
