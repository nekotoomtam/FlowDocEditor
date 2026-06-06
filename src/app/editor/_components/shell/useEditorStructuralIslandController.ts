import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react"
import { isTextRunOnlyParagraph } from "@/document"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type { DocumentNode, ParagraphNode } from "@/schema"
import type { ActiveOutOfCanvasStructuralIsland } from "../EditorCanvas"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  type WysiwygPerfEvent,
} from "../wysiwygPerformance"
import {
  findWysiwygTextEngineFragment,
  isParagraphInsideFlowStack,
  isParagraphInsideRowStack,
  isParagraphInsideTableCell,
} from "../wysiwygTextEligibility"
import type { StructuralEditRuntime } from "../runtime/structuralEditRuntime"
import type { PanelDeferralRuntime } from "../runtime/panelDeferralRuntime"
import {
  markStructuralPanelUrgentFlushCompleteBridge,
  type DeferredStructuralPanelRelease,
} from "../structuralEdit/panelDeferralBridge"
import { getParagraphFromDoc } from "./editorDocumentLookup"
import type { EditorPageNavigationIndex } from "./editorCanvasNavigation"
import type {
  DeferredInlineEditEnd,
  OptimisticStructuralIslandOverride,
  OptimisticStructuralRefocusPaint,
} from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

type StructuralShellRenderMetadata = Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">>

type CaptureStructuralShellRenderValue = <T>(
  action: string,
  compute: () => T,
  metadata?: (value: T) => StructuralShellRenderMetadata,
) => T

type PushStructuralShellRenderAttributionEvent = (
  action: string,
  startedAt: number,
  metadata?: StructuralShellRenderMetadata,
) => void

export interface FlowdocDraftEditorIslandConfig {
  nodeId: string
  paragraph: ParagraphNode
  fragment: PageFragment
  pageKey: string
  pages: PaginatedDocument["sections"][number]["pages"]
}

export function useEditorStructuralIslandController({
  captureStructuralShellRenderValue,
  deferredStructuralPanelReleaseRef,
  displayPaginated,
  editorPageNavigation,
  handleInlineEditEnd,
  inlineEditNodeId,
  inlineEditPageIndex,
  isTemplateMode,
  optimisticStructuralIslandOverride,
  optimisticStructuralRefocusPaint,
  panelDeferralRuntime,
  pendingBoundarySafeInlineEditEndRef,
  previewDoc,
  pushStructuralShellRenderAttributionEvent,
  scheduleDeferredStructuralPanelRelease,
  setOptimisticStructuralIslandOverride,
  setOptimisticStructuralRefocusPaint,
  structuralEditRuntime,
  wysiwygTextSessionNodeId,
}: {
  captureStructuralShellRenderValue: CaptureStructuralShellRenderValue
  deferredStructuralPanelReleaseRef: MutableCurrentRef<DeferredStructuralPanelRelease | null>
  displayPaginated: PaginatedDocument
  editorPageNavigation: EditorPageNavigationIndex
  handleInlineEditEnd: (nodeId?: string, reason?: "blur" | "keyboard") => void
  inlineEditNodeId: string | null
  inlineEditPageIndex: number | null
  isTemplateMode: boolean
  optimisticStructuralIslandOverride: OptimisticStructuralIslandOverride | null
  optimisticStructuralRefocusPaint: OptimisticStructuralRefocusPaint | null
  panelDeferralRuntime: PanelDeferralRuntime
  pendingBoundarySafeInlineEditEndRef: MutableCurrentRef<DeferredInlineEditEnd | null>
  previewDoc: DocumentNode
  pushStructuralShellRenderAttributionEvent: PushStructuralShellRenderAttributionEvent
  scheduleDeferredStructuralPanelRelease: (generation: number, reason: string) => void
  setOptimisticStructuralIslandOverride: Dispatch<SetStateAction<OptimisticStructuralIslandOverride | null>>
  setOptimisticStructuralRefocusPaint: Dispatch<SetStateAction<OptimisticStructuralRefocusPaint | null>>
  structuralEditRuntime: StructuralEditRuntime
  wysiwygTextSessionNodeId: string | null
}) {
  const flowdocDraftEditorIslandConfig = useMemo<FlowdocDraftEditorIslandConfig | null>(() => (
    captureStructuralShellRenderValue(
      "shell-derived:draft-island-config",
      () => {
        if (!isTemplateMode || !WYSIWYG_TEXT_ENGINE_ENABLED) return null
        const nodeId = wysiwygTextSessionNodeId
        if (!nodeId || inlineEditNodeId !== nodeId) return null
        if (optimisticStructuralIslandOverride?.nodeId === nodeId) {
          return optimisticStructuralIslandOverride
        }
        if (isParagraphInsideTableCell(previewDoc, nodeId)) return null
        if (isParagraphInsideFlowStack(previewDoc, nodeId)) return null
        if (isParagraphInsideRowStack(previewDoc, nodeId)) return null
        const paragraph = getParagraphFromDoc(previewDoc, nodeId)
        if (!paragraph || !isTextRunOnlyParagraph(paragraph)) return null
        const fragmentLookupStartedAt = startWysiwygPerfSpan()
        const activeFragment = findWysiwygTextEngineFragment(displayPaginated, nodeId, inlineEditPageIndex)
        const fragment = activeFragment?.continuesFrom
          ? findWysiwygTextEngineFragment(displayPaginated, nodeId, null)
          : activeFragment
        pushStructuralShellRenderAttributionEvent("shell-derived:draft-island-active-fragment", fragmentLookupStartedAt, {
          renderReason: "findWysiwygTextEngineFragment",
          nodeId,
          pageIndex: fragment?.pageIndex ?? activeFragment?.pageIndex ?? null,
          currentFragmentCount: fragment ? 1 : 0,
        })
        if (!fragment || fragment.continuesFrom || fragment.nodeType !== "paragraph") return null
        if (fragment.listMarker) return null
        const pageKey = editorPageNavigation.pageKeyByPageIndex.get(fragment.pageIndex) ?? null
        if (!pageKey) return null
        const pages = displayPaginated.sections.flatMap((section) => section.pages)
        return { nodeId, paragraph, fragment, pageKey, pages }
      },
      (config) => ({
        renderReason: "flowdocDraftEditorIslandConfig",
        nodeId: config?.nodeId ?? optimisticStructuralIslandOverride?.nodeId ?? optimisticStructuralRefocusPaint?.nodeId,
        pageIndex: config?.fragment.pageIndex ?? optimisticStructuralIslandOverride?.fragment.pageIndex ?? null,
        currentFragmentCount: config ? 1 : 0,
        pageCount: config?.pages.length ?? 0,
      }),
    )
  ), [
    captureStructuralShellRenderValue,
    displayPaginated,
    editorPageNavigation.pageKeyByPageIndex,
    inlineEditNodeId,
    inlineEditPageIndex,
    isTemplateMode,
    optimisticStructuralIslandOverride,
    optimisticStructuralRefocusPaint?.nodeId,
    previewDoc,
    pushStructuralShellRenderAttributionEvent,
    wysiwygTextSessionNodeId,
  ])

  const useOutOfCanvasWysiwygIsland = flowdocDraftEditorIslandConfig !== null
  const activeOutOfCanvasStructuralIsland = useMemo<ActiveOutOfCanvasStructuralIsland | null>(() => (
    captureStructuralShellRenderValue(
      "shell-derived:active-structural-island",
      () => {
        const override = optimisticStructuralIslandOverride
        if (!isTemplateMode || !useOutOfCanvasWysiwygIsland) return null
        if (!override) return null
        if (flowdocDraftEditorIslandConfig?.nodeId !== override.nodeId) return null
        return {
          nodeId: override.nodeId,
          mode: override.mode,
          fragment: override.fragment,
          pageIndex: override.fragment.pageIndex,
          suppressedPageBreakNodeId: override.suppressedPageBreakNodeId ?? null,
        }
      },
      (island) => ({
        renderReason: "activeOutOfCanvasStructuralIsland",
        nodeId: island?.nodeId ?? optimisticStructuralIslandOverride?.nodeId ?? optimisticStructuralRefocusPaint?.nodeId,
        pageIndex: island?.pageIndex ?? optimisticStructuralIslandOverride?.fragment.pageIndex ?? null,
        suppressedPageBreakNodeId: island?.suppressedPageBreakNodeId ?? optimisticStructuralIslandOverride?.suppressedPageBreakNodeId ?? null,
      }),
    )
  ), [
    captureStructuralShellRenderValue,
    flowdocDraftEditorIslandConfig?.nodeId,
    isTemplateMode,
    optimisticStructuralIslandOverride,
    optimisticStructuralRefocusPaint?.nodeId,
    useOutOfCanvasWysiwygIsland,
  ])

  const suppressedCanvasTextNodeIds = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:suppressed-canvas-text-node-ids",
      () => {
        const ids = new Set<string>()
        if (flowdocDraftEditorIslandConfig?.nodeId) {
          ids.add(flowdocDraftEditorIslandConfig.nodeId)
        }
        if (optimisticStructuralIslandOverride?.settleRemovedNodeId) {
          ids.add(optimisticStructuralIslandOverride.settleRemovedNodeId)
        }
        return ids
      },
      (ids) => ({
        renderReason: "suppressedCanvasTextNodeIds",
        fragmentCount: ids.size,
      }),
    )
  ), [
    captureStructuralShellRenderValue,
    flowdocDraftEditorIslandConfig?.nodeId,
    optimisticStructuralIslandOverride?.settleRemovedNodeId,
  ])

  const handleOptimisticStructuralRefocusPainted = useCallback((nodeId: string) => {
    setOptimisticStructuralRefocusPaint((current) => (
      current?.nodeId === nodeId ? null : current
    ))
    const release = deferredStructuralPanelReleaseRef.current
    if (release?.pending && release.nodeId === nodeId) {
      const identity = {
        id: release.transactionId,
        generation: release.generation,
      }
      structuralEditRuntime.markUrgentPainted(identity)
      structuralEditRuntime.markPanelReleasePending(identity)
      markStructuralPanelUrgentFlushCompleteBridge(panelDeferralRuntime, release)
      scheduleDeferredStructuralPanelRelease(release.generation, "structural-refocus-painted")
    }
  }, [
    deferredStructuralPanelReleaseRef,
    panelDeferralRuntime,
    scheduleDeferredStructuralPanelRelease,
    setOptimisticStructuralRefocusPaint,
    structuralEditRuntime,
  ])

  useEffect(() => {
    const pending = pendingBoundarySafeInlineEditEndRef.current
    if (!pending) return
    if (optimisticStructuralIslandOverride?.nodeId === pending.nodeId) {
      const settledFragment = findWysiwygTextEngineFragment(
        displayPaginated,
        pending.nodeId,
        inlineEditPageIndex ?? optimisticStructuralIslandOverride.fragment.pageIndex,
      )
      if (!settledFragment) return
    }
    pendingBoundarySafeInlineEditEndRef.current = null
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-blur-handoff",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: pending.nodeId,
      action: "boundary-safe-settled-fragment-ready",
      active: true,
    })
    handleInlineEditEnd(pending.nodeId, pending.reason)
  }, [
    displayPaginated,
    handleInlineEditEnd,
    inlineEditPageIndex,
    optimisticStructuralIslandOverride,
    pendingBoundarySafeInlineEditEndRef,
  ])

  useEffect(() => {
    if (!optimisticStructuralIslandOverride) return
    if (
      optimisticStructuralIslandOverride.settleRemovedNodeId &&
      getParagraphFromDoc(previewDoc, optimisticStructuralIslandOverride.settleRemovedNodeId)
    ) {
      return
    }
    const settledFragment = findWysiwygTextEngineFragment(
      displayPaginated,
      optimisticStructuralIslandOverride.nodeId,
      inlineEditPageIndex ?? optimisticStructuralIslandOverride.fragment.pageIndex,
    )
    if (!settledFragment) return
    setOptimisticStructuralIslandOverride((current) => (
      current?.nodeId === optimisticStructuralIslandOverride.nodeId
        ? null
        : current
    ))
  }, [
    displayPaginated,
    inlineEditPageIndex,
    optimisticStructuralIslandOverride,
    previewDoc,
    setOptimisticStructuralIslandOverride,
  ])

  return {
    activeOutOfCanvasStructuralIsland,
    flowdocDraftEditorIslandConfig,
    handleOptimisticStructuralRefocusPainted,
    suppressedCanvasTextNodeIds,
    useOutOfCanvasWysiwygIsland,
  }
}
