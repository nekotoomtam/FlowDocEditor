import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react"
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

export type DraftIslandConfigNullReason =
  | "mode-disabled"
  | "missing-session-node"
  | "inline-edit-node-mismatch"
  | "optimistic-override-missing"
  | "paragraph-missing"
  | "paragraph-not-text-run-only"
  | "fragment-missing"
  | "continued-fragment"
  | "non-paragraph-fragment"
  | "list-marker-fragment"
  | "page-key-missing"

export type DraftIslandConfigResolveResult =
  | { kind: "ready"; config: FlowdocDraftEditorIslandConfig }
  | { kind: "null"; reason: DraftIslandConfigNullReason; nodeId?: string | null }

import { useEditorStructuralIslandStore, editorStructuralIslandStore } from "./editorStructuralIslandStore"

export function useEditorStructuralIslandController({
  captureStructuralShellRenderValue,
  deferredStructuralPanelReleaseRef,
  displayPaginated,
  editorPageNavigation,
  handleInlineEditEnd,
  inlineEditNodeId,
  inlineEditPageIndex,
  isTemplateMode,
  panelDeferralRuntime,
  pendingBoundarySafeInlineEditEndRef,
  previewDoc,
  pushStructuralShellRenderAttributionEvent,
  scheduleDeferredStructuralPanelRelease,
  structuralEditRuntime,
  wysiwygTextSessionNodeId,
  wysiwygTextSessionGeneration,
}: {
  captureStructuralShellRenderValue: CaptureStructuralShellRenderValue
  deferredStructuralPanelReleaseRef: MutableCurrentRef<DeferredStructuralPanelRelease | null>
  displayPaginated: PaginatedDocument
  editorPageNavigation: EditorPageNavigationIndex
  handleInlineEditEnd: (nodeId?: string, reason?: "blur" | "keyboard") => void
  inlineEditNodeId: string | null
  inlineEditPageIndex: number | null
  isTemplateMode: boolean
  panelDeferralRuntime: PanelDeferralRuntime
  pendingBoundarySafeInlineEditEndRef: MutableCurrentRef<DeferredInlineEditEnd | null>
  previewDoc: DocumentNode
  pushStructuralShellRenderAttributionEvent: PushStructuralShellRenderAttributionEvent
  scheduleDeferredStructuralPanelRelease: (generation: number, reason: string) => void
  structuralEditRuntime: StructuralEditRuntime
  wysiwygTextSessionNodeId: string | null
  wysiwygTextSessionGeneration: number | null
}) {
  const { optimisticStructuralIslandOverride, optimisticStructuralRefocusPaint } = useEditorStructuralIslandStore()
  const lastActiveDraftIslandConfigRef = useRef<FlowdocDraftEditorIslandConfig | null>(null)
  const lastActiveSessionGenerationRef = useRef<number | null>(null)

  const flowdocDraftEditorIslandConfig = useMemo<FlowdocDraftEditorIslandConfig | null>(() => (
    captureStructuralShellRenderValue(
      "shell-derived:draft-island-config",
      () => {
        const result = captureStructuralShellRenderValue(
          "shell-derived:draft-island-config-resolve",
          (): DraftIslandConfigResolveResult => {
            if (!isTemplateMode || !WYSIWYG_TEXT_ENGINE_ENABLED) {
              return { kind: "null", reason: "mode-disabled" }
            }
            const nodeId = wysiwygTextSessionNodeId
            if (!nodeId) {
              return { kind: "null", reason: "missing-session-node" }
            }
            if (inlineEditNodeId !== nodeId) {
              return { kind: "null", reason: "inline-edit-node-mismatch", nodeId }
            }
            if (optimisticStructuralIslandOverride?.nodeId === nodeId) {
              return { kind: "ready", config: optimisticStructuralIslandOverride }
            }
            const paragraph = getParagraphFromDoc(previewDoc, nodeId)
            if (!paragraph) {
              return { kind: "null", reason: "paragraph-missing", nodeId }
            }
            if (!isTextRunOnlyParagraph(paragraph)) {
              return { kind: "null", reason: "paragraph-not-text-run-only", nodeId }
            }
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
            if (!fragment) {
              return { kind: "null", reason: "fragment-missing", nodeId }
            }
            if (fragment.continuesFrom) {
              return { kind: "null", reason: "continued-fragment", nodeId }
            }
            if (fragment.nodeType !== "paragraph") {
              return { kind: "null", reason: "non-paragraph-fragment", nodeId }
            }
            if (fragment.listMarker) {
              return { kind: "null", reason: "list-marker-fragment", nodeId }
            }
            const pageKey = editorPageNavigation.pageKeyByPageIndex.get(fragment.pageIndex) ?? null
            if (!pageKey) {
              return { kind: "null", reason: "page-key-missing", nodeId }
            }
            const pages = displayPaginated.sections.flatMap((section) => section.pages)
            return {
              kind: "ready",
              config: { nodeId, paragraph, fragment, pageKey, pages }
            }
          }
        )

        if (result.kind === "ready") {
          lastActiveDraftIslandConfigRef.current = result.config
          lastActiveSessionGenerationRef.current = wysiwygTextSessionGeneration
          return result.config
        }

        const previous = lastActiveDraftIslandConfigRef.current
        const isSameActiveNode =
          previous &&
          previous.nodeId === wysiwygTextSessionNodeId &&
          inlineEditNodeId === previous.nodeId

        const isSameSession =
          isSameActiveNode &&
          lastActiveSessionGenerationRef.current !== null &&
          lastActiveSessionGenerationRef.current === wysiwygTextSessionGeneration

        const isTransientReason =
          result.reason === "fragment-missing" ||
          result.reason === "continued-fragment" ||
          result.reason === "page-key-missing"

        if (isSameSession && isTransientReason) {
          recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
            kind: "flowdoc-island-config",
            startedAt: startWysiwygPerfSpan(),
            durationMs: 0,
            nodeId: wysiwygTextSessionNodeId,
            action: "draft-island-config-sticky",
            source: result.reason,
            active: true,
          })
          return previous
        }

        if (!isSameSession) {
          lastActiveDraftIslandConfigRef.current = null
          lastActiveSessionGenerationRef.current = null
        }

        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "flowdoc-island-config",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId: wysiwygTextSessionNodeId,
          action: "draft-island-config-null",
          source: result.reason,
          active: false,
        })

        return null
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
    wysiwygTextSessionGeneration,
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
    const current = editorStructuralIslandStore.getState().optimisticStructuralRefocusPaint
    if (current?.nodeId === nodeId) {
      editorStructuralIslandStore.setState({ optimisticStructuralRefocusPaint: null })
    }
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
    const current = editorStructuralIslandStore.getState().optimisticStructuralIslandOverride
    if (current?.nodeId === optimisticStructuralIslandOverride.nodeId) {
      editorStructuralIslandStore.setState({ optimisticStructuralIslandOverride: null })
    }
  }, [
    displayPaginated,
    inlineEditPageIndex,
    optimisticStructuralIslandOverride,
    previewDoc,
  ])

  return {
    activeOutOfCanvasStructuralIsland,
    flowdocDraftEditorIslandConfig,
    handleOptimisticStructuralRefocusPainted,
    suppressedCanvasTextNodeIds,
    useOutOfCanvasWysiwygIsland,
  }
}
