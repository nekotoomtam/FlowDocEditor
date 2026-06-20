import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { collectPaginatedLayoutWarnings, paginateDocument, type LayoutWarningSummary, type PaginatedDocument } from "@/pagination"
import type { TextMeasurer } from "@/layout"
import type { DocumentDataReadinessReport } from "@/readiness"
import type { DocumentNode } from "@/schema"
import { shouldUseBackgroundBrowserPagination } from "../browserPaginationStrategy"
import type { BrowserPaginationWorkerRequest, BrowserPaginationWorkerResponse } from "../browserPaginationWorkerTypes"
import { comparePagination, type DriftReport } from "../comparePagination"
import { isEditorTextMeasurerReady, type EditorTextMeasurerStatus } from "../editorTextMeasurerState"
import type { EditorAction } from "../editorReducer"
import type { PendingEditorActionClassification, PendingOptimisticSplitRefocus } from "./editorShellTypes"
import { resolveSamePreviewOptimisticLayout, type LayoutStatus, type OptimisticLayoutSnapshot } from "../layoutReconciliation"
import type { StructuralEditRuntime } from "../runtime/structuralEditRuntime"
import type { PreviewSettleRuntime } from "../runtime/previewSettleRuntime"
import type { StructuralPreviewSettleSnapshot } from "../structuralEdit/previewSettleBridge"
import {
  createBrowserPreviewSettleApplyPlan,
  getCurrentPreviewSettleGenerationBridge,
  getPreviewSettleApplyDecisionBridge,
  invalidatePreviewSettleBridge,
  markPreviewSettleAppliedBridge,
  markPreviewSettleCompletedBridge,
  markPreviewSettleIgnoredBridge,
  markPreviewSettleStartedBridge,
  markPreviewSettleSupersededBridge,
  resolveActivePreviewSettleStructuralTransaction,
  resolvePreviewSettleDebounceMs,
  resolvePreviewSettleGraceRemainingMs,
  schedulePreviewSettleBridge,
  shouldSupersedePreviewSettleOnCleanup,
} from "../structuralEdit/previewSettleBridge"
import {
  applyPaginatedOutputBrowserPreviewShellMutation,
  applyPartialWorkerBrowserPreviewShellMutation,
  applyPrecomputedBrowserPreviewShellMutation,
  applyVisualOnlyBrowserPreviewShellMutation,
  createBrowserPreviewShellMutationPlan,
  type BrowserPreviewShellMutationPlan,
} from "../structuralEdit/previewSettleShellAdapter"
import { tryApplyVisualOnlyPaginatedUpdate } from "../editorVisualOnlyPagination"
import { resolveEditorRenderInvalidation } from "../operations/editorRenderInvalidation"
import type { EditorPreviewLayoutState } from "../editorPreviewLayoutStatus"
import {
  markEditorPreviewLayoutFull,
  markEditorPreviewLayoutPartial,
  markEditorPreviewLayoutSettling,
  markEditorPreviewLayoutSettlingFromCurrent,
  shouldApplyEditorPreviewLayoutState,
  shouldBlockEditorPreviewCanvas,
} from "../editorPreviewLayoutStatus"
import type { EditorPartialPreviewPaginated } from "../editorPreviewDisplay"
import {
  finishFlowDocPerfSpan,
  finishWysiwygPerfSpan,
  isPaginationProfileRuntimeEnabled,
  recordFlowDocPerfEvent,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import type {
  HeaderFooterReservedDrag,
  MarginDrag,
  MinHeightDrag,
  ResizeDrag,
} from "../editorInteractionTypes"
import { createBrowserPaginationWorker, prewarmBrowserPaginationWorkerMeasurer } from "./browserPaginationWorkerClient"
import {
  shouldApplyCanvasRenderInvalidationState,
  shouldApplyPartialPreviewPaginated,
  shouldClearPartialPreviewPaginated,
  type CanvasRenderInvalidationState,
} from "./editorPreviewLifecycleGuards"
import {
  createServerPaginationSnapshotIdentity,
  resolveServerPaginationSnapshotFreshness,
  shouldApplyServerLayoutWarnings,
} from "./editorServerLayoutReadinessGuards"
import {
  BROWSER_PREVIEW_VISIBLE_WINDOW_MARGIN_PAGES,
  FLOWDOC_FONT_FALLBACK_VALUE,
  FLOWDOC_FONT_HEADER,
  INLINE_EDIT_PREVIEW_DEBOUNCE_MS,
  OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS,
} from "./editorShellConstants"
import { useEditorExportReadiness } from "./useEditorExportReadiness"

type MutableCurrentRef<T> = {
  current: T
}

type OptimisticStructuralSettleRef = MutableCurrentRef<(PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null>
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

function waitForServerPaginationApplyIdle(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("server pagination apply aborted"))
  if (typeof window === "undefined") return Promise.resolve()

  const idleWindow = window as IdleWindow
  return new Promise((resolve, reject) => {
    let settled = false
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      signal.removeEventListener("abort", abort)
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error("server pagination apply aborted"))
    }

    signal.addEventListener("abort", abort, { once: true })
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(finish, { timeout: 1200 })
    } else {
      timeoutHandle = setTimeout(finish, 16)
    }
  })
}

export function useEditorPaginationLifecycleController({
  authoritativePaginated,
  browserPreviewLayout,
  currentCanvasPageIndex,
  dataReadiness,
  dispatch,
  driftReport,
  editorTextMeasurer,
  editorTextMeasurerStatus,
  fontReadyVersion,
  headerFooterReservedDragRef,
  inlineEditDraftVersionRef,
  inlineEditNodeId,
  inlineEditNodeIdRef,
  isTemplateMode,
  marginDragRef,
  markInlineEditVisualFresh,
  minHeightDragRef,
  optimisticLayoutRef,
  optimisticStructuralPreviewSettleGraceUntilRef,
  optimisticStructuralSettleRef,
  paginatedRef,
  partialPreviewPaginated,
  pendingEditorActionClassificationRef,
  precomputedBrowserPaginationRef,
  previewDoc,
  previewSettleRuntime,
  recordPreviewSettleShellMutationPlan,
  renderInvalidationPlanForCanvas,
  resizeDragRef,
  setBrowserPreviewLayout,
  setDriftReport,
  setHeaderFooterReservedDrag,
  setMarginDrag,
  setMinHeightDrag,
  setPartialPreviewPaginated,
  setRenderInvalidationPlanForCanvas,
  setResizeDrag,
  showDriftRef,
  structuralEditRuntime,
  suppressNextLayoutLoadingOverlayRef,
}: {
  authoritativePaginated: PaginatedDocument
  browserPreviewLayout: EditorPreviewLayoutState
  currentCanvasPageIndex: number
  dataReadiness: DocumentDataReadinessReport
  dispatch: (action: EditorAction) => void
  driftReport: DriftReport | null
  editorTextMeasurer: TextMeasurer
  editorTextMeasurerStatus: EditorTextMeasurerStatus
  fontReadyVersion: number
  headerFooterReservedDragRef: MutableCurrentRef<HeaderFooterReservedDrag | null>
  inlineEditDraftVersionRef: MutableCurrentRef<number>
  inlineEditNodeId: string | null
  inlineEditNodeIdRef: MutableCurrentRef<string | null>
  isTemplateMode: boolean
  marginDragRef: MutableCurrentRef<MarginDrag | null>
  markInlineEditVisualFresh: (version: number) => void
  minHeightDragRef: MutableCurrentRef<MinHeightDrag | null>
  optimisticLayoutRef: MutableCurrentRef<OptimisticLayoutSnapshot | null>
  optimisticStructuralPreviewSettleGraceUntilRef: MutableCurrentRef<number>
  optimisticStructuralSettleRef: OptimisticStructuralSettleRef
  paginatedRef: MutableCurrentRef<PaginatedDocument>
  partialPreviewPaginated: EditorPartialPreviewPaginated | null
  pendingEditorActionClassificationRef: MutableCurrentRef<PendingEditorActionClassification | null>
  precomputedBrowserPaginationRef: MutableCurrentRef<OptimisticLayoutSnapshot | null>
  previewDoc: DocumentNode
  previewSettleRuntime: PreviewSettleRuntime
  recordPreviewSettleShellMutationPlan: (plan: BrowserPreviewShellMutationPlan, detail?: Record<string, unknown>) => void
  renderInvalidationPlanForCanvas: CanvasRenderInvalidationState | null
  resizeDragRef: MutableCurrentRef<ResizeDrag | null>
  setBrowserPreviewLayout: Dispatch<SetStateAction<EditorPreviewLayoutState>>
  setDriftReport: Dispatch<SetStateAction<DriftReport | null>>
  setHeaderFooterReservedDrag: (value: HeaderFooterReservedDrag | null) => void
  setMarginDrag: (value: MarginDrag | null) => void
  setMinHeightDrag: (value: MinHeightDrag | null) => void
  setPartialPreviewPaginated: Dispatch<SetStateAction<EditorPartialPreviewPaginated | null>>
  setRenderInvalidationPlanForCanvas: Dispatch<SetStateAction<CanvasRenderInvalidationState | null>>
  setResizeDrag: (value: ResizeDrag | null) => void
  showDriftRef: MutableCurrentRef<boolean>
  structuralEditRuntime: StructuralEditRuntime
  suppressNextLayoutLoadingOverlayRef: MutableCurrentRef<boolean>
}) {
  const [isLayoutLoading, setIsLayoutLoading] = useState(false)
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("optimistic")
  const [serverCheckedPreviewDoc, setServerCheckedPreviewDoc] = useState<DocumentNode | null>(null)
  const [serverLayoutWarnings, setServerLayoutWarnings] = useState<LayoutWarningSummary[]>([])
  const [fontFallback, setFontFallback] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const [suppressLayoutLoadingOverlay, setSuppressLayoutLoadingOverlay] = useState(false)
  const isLayoutLoadingRef = useRef(isLayoutLoading)
  const layoutStatusRef = useRef(layoutStatus)
  const serverCheckedPreviewDocRef = useRef(serverCheckedPreviewDoc)
  const serverLayoutWarningsRef = useRef(serverLayoutWarnings)
  const layoutErrorRef = useRef(layoutError)
  const suppressLayoutLoadingOverlayRef = useRef(suppressLayoutLoadingOverlay)
  const wasInlineEditingRef = useRef(false)
  const interactiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutVersionRef = useRef(0)
  const browserPaginationWorkerRef = useRef<Worker | null>(null)
  const browserPaginationWorkerMeasurerPrewarmedRef = useRef(false)
  const browserPaginationWorkerRequestIdRef = useRef(0)
  const browserPreviewLayoutRef = useRef(browserPreviewLayout)
  const currentCanvasPageIndexRef = useRef(currentCanvasPageIndex)
  const partialPreviewPaginatedRef = useRef(partialPreviewPaginated)
  const renderInvalidationPlanForCanvasRef = useRef(renderInvalidationPlanForCanvas)
  isLayoutLoadingRef.current = isLayoutLoading
  layoutStatusRef.current = layoutStatus
  serverCheckedPreviewDocRef.current = serverCheckedPreviewDoc
  serverLayoutWarningsRef.current = serverLayoutWarnings
  layoutErrorRef.current = layoutError
  suppressLayoutLoadingOverlayRef.current = suppressLayoutLoadingOverlay
  browserPreviewLayoutRef.current = browserPreviewLayout
  currentCanvasPageIndexRef.current = currentCanvasPageIndex
  partialPreviewPaginatedRef.current = partialPreviewPaginated
  renderInvalidationPlanForCanvasRef.current = renderInvalidationPlanForCanvas

  const setIsLayoutLoadingIfChanged = useCallback((next: boolean) => {
    if (isLayoutLoadingRef.current === next) return
    isLayoutLoadingRef.current = next
    setIsLayoutLoading(next)
  }, [])

  const setLayoutStatusIfChanged = useCallback((next: LayoutStatus) => {
    if (layoutStatusRef.current === next) return
    layoutStatusRef.current = next
    setLayoutStatus(next)
  }, [])

  const setServerCheckedPreviewDocIfChanged = useCallback((next: DocumentNode | null) => {
    if (serverCheckedPreviewDocRef.current === next) return
    serverCheckedPreviewDocRef.current = next
    setServerCheckedPreviewDoc(next)
  }, [])

  const setServerLayoutWarningsIfChanged = useCallback((next: LayoutWarningSummary[]) => {
    if (!shouldApplyServerLayoutWarnings(serverLayoutWarningsRef.current, next)) return
    serverLayoutWarningsRef.current = next
    setServerLayoutWarnings(next)
  }, [])

  const setLayoutErrorIfChanged = useCallback((next: boolean) => {
    if (layoutErrorRef.current === next) return
    layoutErrorRef.current = next
    setLayoutError(next)
  }, [])

  const setSuppressLayoutLoadingOverlayIfChanged = useCallback((next: boolean) => {
    if (suppressLayoutLoadingOverlayRef.current === next) return
    suppressLayoutLoadingOverlayRef.current = next
    setSuppressLayoutLoadingOverlay(next)
  }, [])

  const setBrowserPreviewLayoutIfChanged = useCallback((next: EditorPreviewLayoutState) => {
    if (!shouldApplyEditorPreviewLayoutState(browserPreviewLayoutRef.current, next)) return
    browserPreviewLayoutRef.current = next
    setBrowserPreviewLayout(next)
  }, [setBrowserPreviewLayout])

  const markBrowserPreviewLayoutSettlingFromCurrentIfChanged = useCallback((generation: number) => {
    const next = markEditorPreviewLayoutSettlingFromCurrent(generation, browserPreviewLayoutRef.current)
    if (!shouldApplyEditorPreviewLayoutState(browserPreviewLayoutRef.current, next)) return
    browserPreviewLayoutRef.current = next
    setBrowserPreviewLayout(next)
  }, [setBrowserPreviewLayout])

  const clearPartialPreviewPaginated = useCallback(() => {
    if (!shouldClearPartialPreviewPaginated(partialPreviewPaginatedRef.current)) return
    partialPreviewPaginatedRef.current = null
    setPartialPreviewPaginated(null)
  }, [setPartialPreviewPaginated])

  const setPartialPreviewPaginatedIfChanged = useCallback((next: EditorPartialPreviewPaginated) => {
    if (!shouldApplyPartialPreviewPaginated(partialPreviewPaginatedRef.current, next)) return
    partialPreviewPaginatedRef.current = next
    setPartialPreviewPaginated(next)
  }, [setPartialPreviewPaginated])

  const setCanvasRenderInvalidationPlan = useCallback((next: CanvasRenderInvalidationState) => {
    if (!shouldApplyCanvasRenderInvalidationState(renderInvalidationPlanForCanvasRef.current, next)) return
    renderInvalidationPlanForCanvasRef.current = next
    setRenderInvalidationPlanForCanvas(next)
  }, [setRenderInvalidationPlanForCanvas])

  const {
    serverLayoutCheckedForCurrentPreview,
    authoritativeLayoutWarnings,
    layoutWarningSource,
    exportReadiness,
    exportReadinessMessage,
    exportReadinessStatusReason,
  } = useEditorExportReadiness({
    paginated: authoritativePaginated,
    previewDoc,
    browserPreviewLayoutStatus: browserPreviewLayout.status,
    layoutStatus,
    layoutError,
    serverCheckedPreviewDoc,
    serverLayoutWarnings,
    fontFallback,
    driftReport,
    isTemplateMode,
    dataReadiness,
  })

  useEffect(() => {
    invalidatePreviewSettleBridge(previewSettleRuntime, "inline-edit-node-changed")
  }, [inlineEditNodeId, previewSettleRuntime])

  useEffect(() => () => {
    browserPaginationWorkerRef.current?.terminate()
    browserPaginationWorkerRef.current = null
  }, [])

  const getBrowserPaginationWorker = useCallback(() => {
    if (!browserPaginationWorkerRef.current) {
      browserPaginationWorkerRef.current = createBrowserPaginationWorker()
    }
    return browserPaginationWorkerRef.current
  }, [])

  useEffect(() => {
    const wasInlineEditing = wasInlineEditingRef.current
    wasInlineEditingRef.current = inlineEditNodeId !== null
    if (!wasInlineEditing || inlineEditNodeId !== null) return
    if (WYSIWYG_TEXT_ENGINE_ENABLED) {
      clearPartialPreviewPaginated()
      return
    }
    const startedAt = startWysiwygPerfSpan()
    const paginated = paginateDocument(previewDoc, editorTextMeasurer)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-exit-pagination", startedAt, {
      source: "inline-edit-exit",
      ...summarizePaginatedForWysiwygPerf(paginated),
    })
    optimisticLayoutRef.current = { doc: previewDoc, paginated }
    clearPartialPreviewPaginated()
    setBrowserPreviewLayoutIfChanged(markEditorPreviewLayoutFull(getCurrentPreviewSettleGenerationBridge(previewSettleRuntime)))
    dispatch({ type: "SET_PAGINATED", paginated })
  }, [
    dispatch,
    editorTextMeasurer,
    inlineEditNodeId,
    optimisticLayoutRef,
    previewDoc,
    previewSettleRuntime,
    setBrowserPreviewLayoutIfChanged,
    clearPartialPreviewPaginated,
  ])

  useEffect(() => {
    if (interactiveDebounceRef.current) clearTimeout(interactiveDebounceRef.current)

    clearPartialPreviewPaginated()
    const inlineEditNodeIdAtSchedule = inlineEditNodeIdRef.current
    const inlineEditDraftVersionAtSchedule = inlineEditNodeIdAtSchedule
      ? inlineEditDraftVersionRef.current
      : null
    const structuralSettleAtSchedule = optimisticStructuralSettleRef.current
    const activeStructuralTransactionAtSchedule = resolveActivePreviewSettleStructuralTransaction(
      structuralEditRuntime.getCurrentTransaction(),
    )
    const effectStartedAt = startWysiwygPerfSpan()
    const previewSettleRequest = schedulePreviewSettleBridge({
      runtime: previewSettleRuntime,
      activeStructuralTransaction: activeStructuralTransactionAtSchedule,
      activeInlineNodeId: inlineEditNodeIdAtSchedule,
      draftVersion: inlineEditDraftVersionAtSchedule,
      structuralSettle: structuralSettleAtSchedule,
      scheduledAt: effectStartedAt,
    })
    const generation = previewSettleRequest.generation
    const structuralPreviewGraceRemainingMs = resolvePreviewSettleGraceRemainingMs({
      graceUntil: optimisticStructuralPreviewSettleGraceUntilRef.current,
      now: startWysiwygPerfSpan(),
    })
    const debounceMs = resolvePreviewSettleDebounceMs({
      activeInlineNodeId: inlineEditNodeIdAtSchedule,
      structuralSettleNewNodeId: structuralSettleAtSchedule?.newNodeId ?? null,
      structuralPreviewGraceRemainingMs,
      structuralDebounceMs: OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS,
      inlineEditDebounceMs: INLINE_EDIT_PREVIEW_DEBOUNCE_MS,
      idleDebounceMs: 16,
    })
    const useBackgroundPagination = shouldUseBackgroundBrowserPagination({
      doc: previewDoc,
      canUseWorker: typeof Worker !== "undefined",
      inlineEditNodeId: inlineEditNodeIdAtSchedule,
      allowInlineEdit: structuralSettleAtSchedule?.newNodeId === inlineEditNodeIdAtSchedule,
    })
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:browser-pagination-effect-start",
      startMs: effectStartedAt,
      detail: {
        generation,
        debounceMs,
        useBackgroundPagination,
        documentId: previewDoc.document.id,
        measurerStatus: editorTextMeasurerStatus,
        fontReadyVersion,
        inlineEditNodeId: inlineEditNodeIdAtSchedule,
      },
    })
    const getPreviewSettleApplyDecision = () => (
      getPreviewSettleApplyDecisionBridge({
        runtime: previewSettleRuntime,
        request: previewSettleRequest,
        activeStructuralTransaction: activeStructuralTransactionAtSchedule,
        currentStructuralGeneration: structuralEditRuntime.getCurrentGeneration(),
        currentActiveInlineNodeId: inlineEditNodeIdRef.current,
        currentDraftVersion: inlineEditDraftVersionRef.current,
      })
    )
    const getBrowserPreviewSettleApplyPlan = () => (
      createBrowserPreviewSettleApplyPlan({
        decision: getPreviewSettleApplyDecision(),
        generation,
        currentGeneration: getCurrentPreviewSettleGenerationBridge(previewSettleRuntime),
        scheduledActiveInlineNodeId: inlineEditNodeIdAtSchedule,
        currentActiveInlineNodeId: inlineEditNodeIdRef.current,
        scheduledDraftVersion: inlineEditDraftVersionAtSchedule,
        currentDraftVersion: inlineEditDraftVersionRef.current,
      })
    )
    const getBrowserPreviewShellMutationPlan = (
      applyPlan: ReturnType<typeof getBrowserPreviewSettleApplyPlan>,
      mode: "precomputed" | "visual-only" | "partial-worker" | "paginated-output",
      source: string,
      hasStructuralSettleForInlineNode = false,
    ) => createBrowserPreviewShellMutationPlan({
      applyPlan,
      mode,
      source,
      generation,
      isTextMeasurerReady: isEditorTextMeasurerReady(editorTextMeasurerStatus),
      hasStructuralSettleForInlineNode,
    })
    const recordOptimisticRefocusStaleSettleIgnored = (
      reason: string,
      source: string,
      extra: Record<string, unknown> = {},
    ) => {
      const structuralSettle = optimisticStructuralSettleRef.current
      if (!structuralSettle) return
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "optimistic-refocus-stale-settle-ignored", structuralSettle.startedAt, {
        nodeId: structuralSettle.newNodeId,
        previousNodeId: structuralSettle.sourceNodeId,
        pageIndex: structuralSettle.sourceFragment.pageIndex,
        source,
        action: reason,
        active: true,
        latestSettleApplied: false,
        ...extra,
      })
    }
    const ignorePreviewSettle = (
      plan: ReturnType<typeof getBrowserPreviewSettleApplyPlan> & { action: "ignore" },
      source: string,
      extra: Record<string, unknown> = {},
    ) => {
      markPreviewSettleIgnoredBridge(previewSettleRuntime, previewSettleRequest, plan.decision)
      recordOptimisticRefocusStaleSettleIgnored(plan.reason, source, {
        draftVersion: inlineEditDraftVersionAtSchedule,
        previewSettleApplyDecision: plan.decision.type,
        currentDraftVersion: plan.currentDraftVersion,
        currentPreviewSettleGeneration: plan.currentGeneration,
        ...extra,
      })
    }
    const precomputedPagination = precomputedBrowserPaginationRef.current
    if (precomputedPagination) {
      precomputedBrowserPaginationRef.current = null
      if (precomputedPagination.doc === previewDoc) {
        const applyPlan = getBrowserPreviewSettleApplyPlan()
        const shellMutationPlan = getBrowserPreviewShellMutationPlan(applyPlan, "precomputed", "precomputed-browser-pagination")
        recordPreviewSettleShellMutationPlan(shellMutationPlan, { token: generation })
        if (shellMutationPlan.action === "ignore") {
          if (applyPlan.action === "ignore") {
            ignorePreviewSettle(applyPlan, shellMutationPlan.source)
          }
          return () => undefined
        }
        applyPrecomputedBrowserPreviewShellMutation({
          plan: shellMutationPlan,
          optimisticLayout: precomputedPagination,
          createFullBrowserPreviewLayout: markEditorPreviewLayoutFull,
          writeOptimisticLayout: (layout) => {
            optimisticLayoutRef.current = layout
          },
          clearPartialPreview: clearPartialPreviewPaginated,
          setBrowserPreviewLayout: setBrowserPreviewLayoutIfChanged,
          markPreviewSettleLifecycle: () => {
            markPreviewSettleStartedBridge(previewSettleRuntime, previewSettleRequest)
            markPreviewSettleCompletedBridge(previewSettleRuntime, previewSettleRequest)
            markPreviewSettleAppliedBridge(previewSettleRuntime, previewSettleRequest)
          },
        })
        return () => undefined
      }
    }

    const pendingActionClassification = pendingEditorActionClassificationRef.current
    pendingEditorActionClassificationRef.current = null
    const renderInvalidationPlan = pendingActionClassification
      ? resolveEditorRenderInvalidation({
        operation: pendingActionClassification.operation,
        paginated: paginatedRef.current,
      })
      : null
    const visualOnlyUpdate = tryApplyVisualOnlyPaginatedUpdate({
      action: pendingActionClassification?.action,
      classification: pendingActionClassification?.classification,
      renderInvalidationPlan,
      currentPaginated: paginatedRef.current,
      nextPreviewDoc: previewDoc,
    })
    if (visualOnlyUpdate) {
      const applyPlan = getBrowserPreviewSettleApplyPlan()
      const shellMutationPlan = getBrowserPreviewShellMutationPlan(applyPlan, "visual-only", "visual-only-fast-lane")
      recordPreviewSettleShellMutationPlan(shellMutationPlan, { token: generation })
      if (shellMutationPlan.action === "ignore") {
        if (applyPlan.action === "ignore") {
          ignorePreviewSettle(applyPlan, shellMutationPlan.source)
        }
        return () => undefined
      }
      const startedAt = startWysiwygPerfSpan()
      setCanvasRenderInvalidationPlan({ plan: renderInvalidationPlan, paginated: visualOnlyUpdate.paginated })
      applyVisualOnlyBrowserPreviewShellMutation({
        plan: shellMutationPlan,
        optimisticLayout: { doc: previewDoc, paginated: visualOnlyUpdate.paginated },
        paginated: visualOnlyUpdate.paginated,
        createFullBrowserPreviewLayout: markEditorPreviewLayoutFull,
        writeOptimisticLayout: (layout) => {
          optimisticLayoutRef.current = layout
        },
        writePaginatedRef: (paginated) => {
          paginatedRef.current = paginated
        },
        clearPartialPreview: clearPartialPreviewPaginated,
        setBrowserPreviewLayout: setBrowserPreviewLayoutIfChanged,
        dispatchSetPaginated: (paginated) => dispatch({ type: "SET_PAGINATED", paginated }),
        markPreviewSettleLifecycle: () => {
          markPreviewSettleStartedBridge(previewSettleRuntime, previewSettleRequest)
          markPreviewSettleCompletedBridge(previewSettleRuntime, previewSettleRequest)
          markPreviewSettleAppliedBridge(previewSettleRuntime, previewSettleRequest)
        },
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
        source: "visual-only-fast-lane",
        commandType: pendingActionClassification?.action.type,
        layoutAffecting: false,
        renderInvalidationLane: renderInvalidationPlan?.lane,
        renderInvalidationPageScope: renderInvalidationPlan?.pageScope,
        renderInvalidationInvalidatesPagination: renderInvalidationPlan?.invalidatesPagination,
        renderInvalidationAffectedPageCount: renderInvalidationPlan?.affectedPageIndexes?.length,
        renderInvalidationAffectedPages: renderInvalidationPlan?.affectedPageIndexes?.join(","),
        ...summarizePaginatedForWysiwygPerf(visualOnlyUpdate.paginated),
      })
      return () => undefined
    }

    markBrowserPreviewLayoutSettlingFromCurrentIfChanged(generation)
    if (!isEditorTextMeasurerReady(editorTextMeasurerStatus)) {
      recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        name: "pre-pagination:browser-pagination-deferred-for-font-readiness",
        startMs: startWysiwygPerfSpan(),
        detail: {
          generation,
          measurerStatus: editorTextMeasurerStatus,
          fontReadyVersion,
        },
      })
      return () => undefined
    }
    if (useBackgroundPagination && !browserPaginationWorkerMeasurerPrewarmedRef.current) {
      const prewarmStartedAt = startWysiwygPerfSpan()
      const worker = getBrowserPaginationWorker()
      const posted = prewarmBrowserPaginationWorkerMeasurer(worker)
      if (posted) browserPaginationWorkerMeasurerPrewarmedRef.current = true
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-measurer-prewarm", prewarmStartedAt, {
        generation,
        posted,
        measurerStatus: editorTextMeasurerStatus,
        fontReadyVersion,
      })
    }
    const scheduleStartedAt = startWysiwygPerfSpan()
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:browser-pagination-schedule-requested",
      startMs: scheduleStartedAt,
      detail: {
        generation,
        debounceMs,
        useBackgroundPagination,
        measurerStatus: editorTextMeasurerStatus,
        fontReadyVersion,
      },
    })
    if (structuralSettleAtSchedule) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-structural-pagination-schedule",
        startedAt: scheduleStartedAt,
        durationMs: 0,
        nodeId: structuralSettleAtSchedule.newNodeId,
        previousNodeId: structuralSettleAtSchedule.sourceNodeId,
        sourceNodeId: structuralSettleAtSchedule.sourceNodeId,
        pageIndex: structuralSettleAtSchedule.sourceFragment.pageIndex,
        action: "scheduled",
        operation: "settle",
        token: generation,
        scheduledDelayMs: debounceMs,
        active: true,
      })
    }
    let rafHandle: number | null = null
    interactiveDebounceRef.current = setTimeout(() => {
      interactiveDebounceRef.current = null
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null
        finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:browser-pagination-debounce-delay", scheduleStartedAt, {
          generation,
          requestedDelayMs: debounceMs,
          useBackgroundPagination,
          measurerStatus: editorTextMeasurerStatus,
          fontReadyVersion,
        })
        const startPlan = getBrowserPreviewSettleApplyPlan()
        if (startPlan.action === "ignore") {
          ignorePreviewSettle(startPlan, "browser-preview-schedule")
          return
        }
        if (previewSettleRuntime.getCurrentRequest()?.id !== previewSettleRequest.id) {
          ignorePreviewSettle(
            {
              ...startPlan,
              action: "ignore",
              reason: "stale-settle-discarded",
              decision: { type: "ignore-stale", reason: "stale-settle-discarded" }
            } as any,
            "browser-preview-schedule"
          )
          return
        }
        markPreviewSettleStartedBridge(previewSettleRuntime, previewSettleRequest)

        const commitPagination = (
          paginated: PaginatedDocument,
          startedAt: number,
          source: string,
          extra: Record<string, unknown> = {},
        ) => {
          finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
            nodeId: inlineEditNodeIdAtSchedule ?? undefined,
            draftVersion: inlineEditDraftVersionAtSchedule,
            scheduledDelayMs: debounceMs,
            source,
            ...extra,
            ...summarizePaginatedForWysiwygPerf(paginated),
          })
          markPreviewSettleCompletedBridge(previewSettleRuntime, previewSettleRequest)
          const applyPlan = getBrowserPreviewSettleApplyPlan()
          const structuralSettle = optimisticStructuralSettleRef.current
          const shellMutationPlan = getBrowserPreviewShellMutationPlan(
            applyPlan,
            "paginated-output",
            source,
            Boolean(structuralSettle && structuralSettle.newNodeId === inlineEditNodeIdAtSchedule),
          )
          recordPreviewSettleShellMutationPlan(shellMutationPlan, { token: generation })
          if (shellMutationPlan.action === "ignore") {
            if (applyPlan.action === "ignore") {
              ignorePreviewSettle(applyPlan, shellMutationPlan.source)
            }
            return
          }
          setCanvasRenderInvalidationPlan({ plan: renderInvalidationPlan, paginated })
          applyPaginatedOutputBrowserPreviewShellMutation({
            plan: shellMutationPlan,
            optimisticLayout: { doc: previewDoc, paginated },
            paginated,
            inlineEditVisualFreshVersion: inlineEditDraftVersionAtSchedule,
            createFullBrowserPreviewLayout: markEditorPreviewLayoutFull,
            createSettlingBlockingBrowserPreviewLayout: (layoutGeneration) => markEditorPreviewLayoutSettling(layoutGeneration, { blocksCanvas: true }),
            writeOptimisticLayout: (layout) => {
              optimisticLayoutRef.current = layout
            },
            writePaginatedRef: (nextPaginated) => {
              paginatedRef.current = nextPaginated
            },
            clearPartialPreview: clearPartialPreviewPaginated,
            setBrowserPreviewLayout: setBrowserPreviewLayoutIfChanged,
            dispatchSetPaginated: (nextPaginated) => dispatch({ type: "SET_PAGINATED", paginated: nextPaginated }),
            markPreviewSettleLifecycle: () => {
              markPreviewSettleAppliedBridge(previewSettleRuntime, previewSettleRequest)
            },
            markInlineEditVisualFresh,
            completeStructuralSettle: structuralSettle
              ? () => {
                  optimisticStructuralSettleRef.current = null
                  const settleCompletedAt = startWysiwygPerfSpan()
                  recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
                    kind: "flowdoc-structural-pagination-schedule",
                    startedAt: structuralSettle.startedAt,
                    durationMs: Math.max(0, settleCompletedAt - structuralSettle.startedAt),
                    nodeId: structuralSettle.newNodeId,
                    previousNodeId: structuralSettle.sourceNodeId,
                    sourceNodeId: structuralSettle.sourceNodeId,
                    pageIndex: structuralSettle.sourceFragment.pageIndex,
                    action: "completed",
                    operation: "settle",
                    token: generation,
                    scheduledDelayMs: debounceMs,
                    source,
                    active: true,
                    latestSettleApplied: true,
                  })
                  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "structural-refocus-settled-pagination", structuralSettle.startedAt, {
                    nodeId: structuralSettle.newNodeId,
                    previousNodeId: structuralSettle.sourceNodeId,
                    pageIndex: structuralSettle.sourceFragment.pageIndex,
                    source,
                    active: true,
                    latestSettleApplied: true,
                    ...summarizePaginatedForWysiwygPerf(paginated),
                  })
                }
              : null,
          })
        }

        const runMainThreadPagination = (source: string) => {
          const startedAt = startWysiwygPerfSpan()
          const paginated = paginateDocument(previewDoc, editorTextMeasurer)
          commitPagination(paginated, startedAt, source)
        }

        if (useBackgroundPagination) {
          const profilePagination = isPaginationProfileRuntimeEnabled()
          const worker = getBrowserPaginationWorker()
          if (worker) {
            const startedAt = startWysiwygPerfSpan()
            const requestId = ++browserPaginationWorkerRequestIdRef.current
            let requestSettled = false

            const fallbackToMainThread = (reason: string) => {
              if (requestSettled) return
              const fallbackPlan = getBrowserPreviewSettleApplyPlan()
              if (fallbackPlan.action === "ignore") {
                ignorePreviewSettle(fallbackPlan, "document-preview-worker-fallback")
                return
              }
              requestSettled = true
              console.error("browser pagination worker failed:", reason)
              runMainThreadPagination("document-preview-worker-fallback")
            }

            worker.onmessage = (event: MessageEvent<BrowserPaginationWorkerResponse>) => {
              const response = event.data
              if (!response) return
              if (response.requestId !== requestId) {
                recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
                  name: "pre-pagination:worker-response-ignored",
                  startMs: startWysiwygPerfSpan(),
                  detail: {
                    reason: "request-id-mismatch",
                    activeRequestId: requestId,
                    responseRequestId: response.requestId,
                    activeGeneration: generation,
                    currentGeneration: getCurrentPreviewSettleGenerationBridge(previewSettleRuntime),
                    responseType: response.type,
                    ...(response.type === "success" ? {
                      workerMeasurerStatus: response.measurerStatus,
                      ...(response.workerTiming ? { workerTiming: response.workerTiming } : {}),
                    } : {}),
                  },
                })
                return
              }
              const responsePlan = getBrowserPreviewSettleApplyPlan()
              if (responsePlan.action === "ignore") {
                ignorePreviewSettle(responsePlan, "document-preview-worker")
                recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
                  name: "pre-pagination:worker-response-ignored",
                  startMs: startWysiwygPerfSpan(),
                  detail: {
                    reason: responsePlan.reason,
                    requestId,
                    responseGeneration: generation,
                    currentGeneration: getCurrentPreviewSettleGenerationBridge(previewSettleRuntime),
                    responseType: response.type,
                    ...(response.type === "success" ? {
                      workerMeasurerStatus: response.measurerStatus,
                      ...(response.workerTiming ? { workerTiming: response.workerTiming } : {}),
                    } : {}),
                  },
                })
                return
              }
              if (requestSettled) return
              if (response.type === "partial") {
                const partialShellMutationPlan = getBrowserPreviewShellMutationPlan(
                  responsePlan,
                  "partial-worker",
                  "document-preview-worker-partial",
                )
                recordPreviewSettleShellMutationPlan(partialShellMutationPlan, {
                  token: generation,
                  requestId,
                })
                if (partialShellMutationPlan.action === "ignore") {
                  return
                }
                setCanvasRenderInvalidationPlan({ plan: renderInvalidationPlan, paginated: response.paginated })
                applyPartialWorkerBrowserPreviewShellMutation({
                  plan: partialShellMutationPlan,
                  partialPreview: {
                    generation,
                    requestId,
                    paginated: response.paginated,
                  },
                  createPartialBrowserPreviewLayout: markEditorPreviewLayoutPartial,
                  setPartialPreview: setPartialPreviewPaginatedIfChanged,
                  setBrowserPreviewLayout: setBrowserPreviewLayoutIfChanged,
                })
                return
              }
              if (response.type === "error") {
                fallbackToMainThread(response.message)
                return
              }
              requestSettled = true
              commitPagination(response.paginated, startedAt, "document-preview-worker", {
                workerMeasurerStatus: response.measurerStatus,
                ...(response.workerTiming ? { workerTiming: response.workerTiming } : {}),
                ...(response.paginationProfile ? { paginationProfile: response.paginationProfile } : {}),
              })
            }
            worker.onerror = (event) => {
              fallbackToMainThread(event.message || "worker error")
            }
            const requestBuildStartedAt = startWysiwygPerfSpan()
            const request: BrowserPaginationWorkerRequest = {
              type: "paginate",
              requestId,
              doc: previewDoc,
              visibleWindow: {
                pageIndex: currentCanvasPageIndexRef.current,
                marginPages: BROWSER_PREVIEW_VISIBLE_WINDOW_MARGIN_PAGES,
              },
              profilePagination,
            }
            finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-request-payload-built", requestBuildStartedAt, {
              requestId,
              generation,
              profilePagination,
              visiblePageIndex: currentCanvasPageIndexRef.current,
            })
            const postStartedAt = startWysiwygPerfSpan()
            worker.postMessage(request)
            finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-request-posted", postStartedAt, {
              requestId,
              generation,
            })
            return
          }
        }

        runMainThreadPagination(inlineEditNodeIdAtSchedule ? "inline-edit-preview" : "document-preview")
      })
    }, debounceMs)

    return () => {
      const wasPending = Boolean(interactiveDebounceRef.current || rafHandle)
      if (rafHandle) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
      if (interactiveDebounceRef.current) {
        clearTimeout(interactiveDebounceRef.current)
        interactiveDebounceRef.current = null
      }
      if (wasPending) {
        const structuralSettleForCleanup = structuralSettleAtSchedule
        if (shouldSupersedePreviewSettleOnCleanup({
          hasPendingDebounce: true,
          structuralSettle: structuralSettleForCleanup,
        }) && structuralSettleForCleanup) {
          const supersededAt = startWysiwygPerfSpan()
          markPreviewSettleSupersededBridge(previewSettleRuntime, previewSettleRequest, "browser-preview-effect-cleanup", supersededAt)
          recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
            kind: "flowdoc-structural-pagination-schedule",
            startedAt: scheduleStartedAt,
            durationMs: Math.max(0, supersededAt - scheduleStartedAt),
            nodeId: structuralSettleForCleanup.newNodeId,
            previousNodeId: structuralSettleForCleanup.sourceNodeId,
            sourceNodeId: structuralSettleForCleanup.sourceNodeId,
            pageIndex: structuralSettleForCleanup.sourceFragment.pageIndex,
            action: "superseded",
            operation: "settle",
            token: generation,
            scheduledDelayMs: debounceMs,
            active: false,
          })
        }
        recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          name: "pre-pagination:browser-pagination-schedule-cancelled",
          startMs: startWysiwygPerfSpan(),
          detail: {
            generation,
            debounceMs,
          },
        })
      }
    }
  }, [
    dispatch,
    editorTextMeasurer,
    editorTextMeasurerStatus,
    fontReadyVersion,
    getBrowserPaginationWorker,
    inlineEditDraftVersionRef,
    inlineEditNodeIdRef,
    markInlineEditVisualFresh,
    optimisticLayoutRef,
    optimisticStructuralPreviewSettleGraceUntilRef,
    optimisticStructuralSettleRef,
    paginatedRef,
    pendingEditorActionClassificationRef,
    precomputedBrowserPaginationRef,
    previewDoc,
    previewSettleRuntime,
    recordPreviewSettleShellMutationPlan,
    clearPartialPreviewPaginated,
    markBrowserPreviewLayoutSettlingFromCurrentIfChanged,
    setBrowserPreviewLayoutIfChanged,
    setCanvasRenderInvalidationPlan,
    setPartialPreviewPaginatedIfChanged,
    structuralEditRuntime,
  ])

  useEffect(() => {
    const layoutVersion = ++layoutVersionRef.current
    let controller: AbortController | null = null
    let cancelled = false
    const cancelForPageTransition = () => {
      cancelled = true
      controller?.abort()
    }
    setServerCheckedPreviewDocIfChanged(null)
    setServerLayoutWarningsIfChanged([])
    setLayoutStatusIfChanged("optimistic")
    const suppressLoadingOverlay = suppressNextLayoutLoadingOverlayRef.current
    suppressNextLayoutLoadingOverlayRef.current = false
    setSuppressLayoutLoadingOverlayIfChanged(suppressLoadingOverlay)

    if (serverPaginationDebounceRef.current) clearTimeout(serverPaginationDebounceRef.current)

    if (browserPreviewLayout.status !== "full") {
      recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        name: "pre-pagination:server-pagination-deferred-for-browser-preview",
        startMs: startWysiwygPerfSpan(),
        detail: {
          layoutVersion,
          previewStatus: browserPreviewLayout.status,
        },
      })
      return () => {
        cancelled = true
        if (serverPaginationDebounceRef.current) clearTimeout(serverPaginationDebounceRef.current)
      }
    }

    window.addEventListener("pagehide", cancelForPageTransition, { once: true })

    const serverScheduleStartedAt = startWysiwygPerfSpan()
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:server-pagination-schedule-requested",
      startMs: serverScheduleStartedAt,
      detail: {
        layoutVersion,
      },
    })
    serverPaginationDebounceRef.current = setTimeout(() => {
      serverPaginationDebounceRef.current = null
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:server-pagination-debounce-delay", serverScheduleStartedAt, {
        layoutVersion,
      })
      controller = new AbortController()
      const activeController = controller
      setIsLayoutLoadingIfChanged(true)
      setLayoutStatusIfChanged("reconciling")

      const requestBuildStartedAt = startWysiwygPerfSpan()
      const requestBody = JSON.stringify(previewDoc)
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:server-pagination-request-built", requestBuildStartedAt, {
        layoutVersion,
        sizeBytes: requestBody.length,
      })
      const requestStartedAt = startWysiwygPerfSpan()
      void fetch("/api/paginate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: activeController.signal,
      })
        .then(async (res) => {
          finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:server-pagination-response", requestStartedAt, {
            layoutVersion,
            ok: res.ok,
            status: res.status,
          })
          if (!res.ok) {
            const message = await res.text()
            throw new Error(`paginate failed: ${res.status} ${message}`)
          }
          setFontFallback(res.headers.get(FLOWDOC_FONT_HEADER) === FLOWDOC_FONT_FALLBACK_VALUE)
          return await res.json() as PaginatedDocument
        })
        .then(async (paginated) => {
          const applyIdleStartedAt = startWysiwygPerfSpan()
          await waitForServerPaginationApplyIdle(activeController.signal)
          finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:server-pagination-apply-idle-delay", applyIdleStartedAt, {
            layoutVersion,
          })
          const serverPaginationIdentity = createServerPaginationSnapshotIdentity({
            layoutVersion,
            documentId: previewDoc.document.id,
          })
          const serverPaginationFreshness = resolveServerPaginationSnapshotFreshness({
            identity: serverPaginationIdentity,
            currentLayoutVersion: layoutVersionRef.current,
            cancelled,
            aborted: activeController.signal.aborted,
          })
          if (serverPaginationFreshness.freshness !== "current") return
          setLayoutErrorIfChanged(false)
          setServerLayoutWarningsIfChanged(collectPaginatedLayoutWarnings(paginated))
          const optimisticLayout = resolveSamePreviewOptimisticLayout(
            optimisticLayoutRef.current,
            previewDoc,
            paginatedRef.current,
          )
          const report = comparePagination(optimisticLayout.paginated, paginated)
          setDriftReport(report)
          if (showDriftRef.current && (report.driftCount > 0 || report.geometryDriftMap.size > 0)) {
            console.group(`[FlowDoc drift] ${report.driftCount}/${report.totalParagraphs} paragraphs differ${report.pageBreakChanged ? " · page break changed" : ""}`)
            report.driftMap.forEach((d) => {
              console.log(`  ${d.nodeId}: browser=${d.browserLineCount}L server=${d.serverLineCount}L (${d.lineDelta > 0 ? "+" : ""}${d.lineDelta})`)
            })
            if (report.geometryDriftMap.size > 0) {
              console.group(`  layout geometry drift (${report.geometryDriftMap.size} nodes)`)
              report.geometryDriftMap.forEach((d) => {
                const parts: string[] = []
                if (d.pageMovement) parts.push("page moved")
                if (d.heightDelta !== 0) parts.push(`height ${d.heightDelta > 0 ? "+" : ""}${d.heightDelta.toFixed(1)}pt`)
                console.log(`    ${d.nodeType} ${d.nodeId}: ${parts.join(", ")}`)
              })
              console.groupEnd()
            }
            console.groupEnd()
          }
          setServerCheckedPreviewDocIfChanged(previewDoc)
          setLayoutStatusIfChanged("server-checked")
        })
        .catch((error) => {
          if (cancelled) return
          if (activeController.signal.aborted) return
          if (error instanceof DOMException && error.name === "AbortError") return
          if (
            error instanceof TypeError &&
            error.message === "Failed to fetch" &&
            document.visibilityState === "hidden"
          ) return
          const serverPaginationIdentity = createServerPaginationSnapshotIdentity({
            layoutVersion,
            documentId: previewDoc.document.id,
          })
          const serverPaginationFreshness = resolveServerPaginationSnapshotFreshness({
            identity: serverPaginationIdentity,
            currentLayoutVersion: layoutVersionRef.current,
            cancelled,
            aborted: activeController.signal.aborted,
          })
          if (serverPaginationFreshness.freshness !== "current") return
          console.error("server pagination failed:", error)
          setServerCheckedPreviewDocIfChanged(null)
          setServerLayoutWarningsIfChanged([])
          setLayoutStatusIfChanged("optimistic")
          setLayoutErrorIfChanged(true)
        })
        .finally(() => {
          if (layoutVersion === layoutVersionRef.current) {
            setIsLayoutLoadingIfChanged(false)
            setSuppressLayoutLoadingOverlayIfChanged(false)
          }
        })
    }, inlineEditNodeId ? 500 : 120)

    return () => {
      cancelled = true
      window.removeEventListener("pagehide", cancelForPageTransition)
      if (serverPaginationDebounceRef.current) clearTimeout(serverPaginationDebounceRef.current)
      controller?.abort()
    }
  }, [
    browserPreviewLayout.status,
    inlineEditNodeId,
    optimisticLayoutRef,
    paginatedRef,
    previewDoc,
    setDriftReport,
    setIsLayoutLoadingIfChanged,
    setLayoutErrorIfChanged,
    setLayoutStatusIfChanged,
    setServerCheckedPreviewDocIfChanged,
    setServerLayoutWarningsIfChanged,
    setSuppressLayoutLoadingOverlayIfChanged,
    showDriftRef,
    suppressNextLayoutLoadingOverlayRef,
  ])

  useEffect(() => {
    if (!isLayoutLoading) {
      if (resizeDragRef.current?.committed) setResizeDrag(null)
      if (minHeightDragRef.current?.committed) setMinHeightDrag(null)
      if (marginDragRef.current?.committed) setMarginDrag(null)
      if (headerFooterReservedDragRef.current?.committed) setHeaderFooterReservedDrag(null)
    }
  }, [
    headerFooterReservedDragRef,
    isLayoutLoading,
    marginDragRef,
    minHeightDragRef,
    resizeDragRef,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMinHeightDrag,
    setResizeDrag,
  ])

  return {
    authoritativeLayoutWarnings,
    exportReadiness,
    exportReadinessMessage,
    exportReadinessStatusReason,
    fontFallback,
    layoutError,
    layoutWarningSource,
    serverLayoutCheckedForCurrentPreview,
    setFontFallback,
    showBrowserPreviewLayoutPreparing: shouldBlockEditorPreviewCanvas(browserPreviewLayout),
    showLayoutLoadingOverlay: isLayoutLoading && !suppressLayoutLoadingOverlay,
  }
}
