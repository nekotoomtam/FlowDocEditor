"use client"

import { useReducer, useCallback, useRef, useState, useEffect, useLayoutEffect, useMemo } from "react"
import { assertDocument, createUniqueListPresetInstanceId, normalizeDocument, resolveParagraphListContext } from "@/document"
import type { FlowDocListStylePresetId } from "@/document"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import { EditorCanvas } from "./EditorCanvas"
import { FlowdocDraftEditorIslandRoot } from "./FlowdocDraftEditorIslandRoot"
import type { DriftReport } from "./comparePagination"
import type { OptimisticLayoutSnapshot } from "./layoutReconciliation"
import {
  createEditorPreviewPlaceholderLayoutState,
} from "./editorPreviewLayoutStatus"
import {
  resolveEditorDisplayPaginated,
  type EditorPartialPreviewPaginated,
} from "./editorPreviewDisplay"
import {
  WYSIWYG_INLINE_EDIT_ENABLED,
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "./wysiwygInlineEditConfig"
import {
  finishFlowDocPerfSpan,
  finishWysiwygPerfSpan,
  isPaginationProfileRuntimeEnabled,
  isWysiwygPerfTraceRuntimeEnabled,
  recordFlowDocPerfEvent,
  recordWysiwygPerfEvent,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
  type WysiwygPerfEvent,
} from "./wysiwygPerformance"
import {
  countWysiwygTextDraftFragments,
} from "./wysiwygDraftPreview"
import { resolveEditorTestScenarioFromLocation } from "./wysiwygStage3StressScenarios"
import { findWysiwygTextEngineFragment, isParagraphInsideFlowStack, isParagraphInsideRowStack, isParagraphInsideTableCell, isWysiwygTextEngineFragmentEligible } from "./wysiwygTextEligibility"
import { useInlineEditSession } from "./useInlineEditSession"
import {
  areWysiwygTextSelectionsEqual,
  type WysiwygTextInputKey,
} from "./useWysiwygTextSession"
import {
  applyRichTextDraftSessionStyleCommand,
} from "./richTextDraftSession"
import {
  getRichTextDraftSessionCommandPatch,
  isRichTextDraftStylePatchLayoutAffecting,
  resolveRichTextDraftKeyboardCommand,
  type RichTextDraftSessionCommand,
} from "./richTextDraftCommands"
import {
  shouldRelocateInlineEditPage,
} from "./editorPageFollow"
import {
  shouldPatchPlainParagraphBoundaryHeightPreview,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
import { useAnimationFrameState } from "./useAnimationFrameState"
import { createInitialEditorState, reducer, type EditorAction } from "./editorReducer"
import { classifyEditorAction, shouldSuppressLayoutLoadingOverlayForEditorAction } from "./editorActionClassifier"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import { EditorCanvasColumn } from "./shell/EditorCanvasColumn"
import type {
  HeaderFooterEditMode,
  HeaderFooterReservedDrag,
  MarginDrag,
  MarginEditMode,
  MinHeightDrag,
  ResizeDrag,
} from "./editorInteractionTypes"
import { EditorDragGhost, describeDragSource } from "./shell/EditorDragGhost"
import {
  type EditorExportFeedback,
  type EditorExportFormat,
} from "./shell/EditorToolbar"
import { EditorTopToolbar } from "./shell/EditorTopToolbar"
import { buildEditorWorkflowNavItems } from "./shell/editorWorkflowNav"
import {
  setDataSnapshotValue,
} from "./shell/editorDocumentDataState"
import {
  findImmediatePageBreakSiblingAfterNode,
  getParagraphFromDoc,
  getParagraphTextFromDoc,
} from "./shell/editorDocumentLookup"
import {
  EditorCanvasPerfProfiler,
} from "./shell/EditorShellPerfChrome"
import { EditorShellOverlayChrome } from "./shell/EditorShellOverlayChrome"
import { EditorRightRail } from "./shell/EditorRightRail"
import { EditorLeftRailPane } from "./shell/EditorLeftRailPane"
import {
  FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
  MAX_SCALE,
  MIN_SCALE,
  WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
  WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
  WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_PAGE_LIMIT,
} from "./shell/editorShellConstants"
import {
  type DeferredInlineEditEnd,
  type EditorDocumentIoStatus,
  type LeftRailMode,
  type OptimisticStructuralIslandOverride,
  type OptimisticStructuralRefocusPaint,
  type PendingDrag,
  type PendingDragMove,
  type PendingEditorActionClassification,
  type WorkflowMode,
} from "./shell/editorShellTypes"
import { useEditorZoomController } from "./shell/useEditorZoomController"
import { useRightRailController } from "./shell/useRightRailController"
import { useEditorAutosave } from "./shell/useEditorAutosave"
import { useEditorDocumentIoActions } from "./shell/useEditorDocumentIoActions"
import { useEditorTextMeasurerController } from "./shell/useEditorTextMeasurerController"
import { useEditorPackageDataState } from "./shell/useEditorPackageDataState"
import { editorShellRootStyle } from "./shell/editorShellRootChrome"
import { useEditorDocumentPrepareOverlay } from "./shell/useEditorDocumentPrepareOverlay"
import { useResizePreviewController } from "./shell/useResizePreviewController"
import { useExportFeedbackElapsed } from "./shell/useExportFeedbackElapsed"
import { useEditorLiveRefs } from "./shell/useEditorLiveRefs"
import { useEditorPageViewController } from "./shell/useEditorPageViewController"
import { useEditorSelectedStyleResource } from "./shell/useEditorSelectedStyleResource"
import { useEditorOutlineSelectionState } from "./shell/useEditorOutlineSelectionState"
import { useEditorRuntimeControllers } from "./shell/useEditorRuntimeControllers"
import { useEditorLeftRailDocuments } from "./shell/useEditorLeftRailDocuments"
import { useEditorRichTextToolbarSelection } from "./shell/useEditorRichTextToolbarSelection"
import { useEditorWysiwygTextSessionController } from "./shell/useEditorWysiwygTextSessionController"
import { useStructuralPanelReleaseController } from "./shell/useStructuralPanelReleaseController"
import { useEditorPerfTraceController } from "./shell/useEditorPerfTraceController"
import { useEditorPreviewDocumentController } from "./shell/useEditorPreviewDocumentController"
import { useEditorPaginationLifecycleController } from "./shell/useEditorPaginationLifecycleController"
import { useEditorNavigationSelectionState } from "./shell/useEditorNavigationSelectionState"
import { useEditorDocumentSnapshotActions } from "./shell/useEditorDocumentSnapshotActions"
import { useEditorHistoryActions } from "./shell/useEditorHistoryActions"
import { useEditorWheelZoomController } from "./shell/useEditorWheelZoomController"
import { useEditorExportController } from "./shell/useEditorExportController"
import { useInlineEditPageRelocation } from "./shell/useInlineEditPageRelocation"
import { useEditorKeyboardShortcuts } from "./shell/useEditorKeyboardShortcuts"
import { useEditorStructuralIslandController } from "./shell/useEditorStructuralIslandController"
import { useEditorCanvasInteractionActions } from "./shell/useEditorCanvasInteractionActions"
import { useEditorCanvasPointerController } from "./shell/useEditorCanvasPointerController"
import { useEditorInlineEditLifecycleController } from "./shell/useEditorInlineEditLifecycleController"
import { useEditorOptimisticStructuralRefocusController } from "./shell/useEditorOptimisticStructuralRefocusController"
import { useWysiwygDraftPaginationController } from "./shell/useWysiwygDraftPaginationController"
import {
  markCurrentTrackedWysiwygDraftRuntimeCompositionBridge,
  updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge,
} from "./wysiwygDraftRuntimeBridge"
import {
  resolveDraftPreviewPaginationDelayMsBridge,
  resolveDraftPreviewPaginationResponsiveNodeId,
  shouldSchedulePlainBoundaryDraftPagination,
} from "./structuralEdit/previewSettleBridge"
import {
  canStartParagraphTextSurfaceFallbackStructuralEditBridge,
  type ParagraphTextSurfaceStructuralEditGuardInput,
} from "./structuralEdit/paragraphTextSurfaceFallbackBridge"

// ─── State ────────────────────────────────────────────────────────────────────

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const initialTestScenario = useMemo(() => resolveEditorTestScenarioFromLocation(), [])
  const {
    scale,
    zoomMode,
    handleCanvasScaleChange,
    setManualScale,
    zoomIn,
    zoomOut,
    zoomByWheel,
    resetZoom,
    fitZoom,
  } = useEditorZoomController(0.6)
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("design")
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>("outline")
  const {
    rightRailMode,
    setRightRailMode,
    rightRailCollapsed,
    setRightRailCollapsed,
    rightRailWidth,
    rightRailResizeDrag,
    setRightRailResizeDrag,
    rightRailResizeHandleHover,
    setRightRailResizeHandleHover,
    rightRailDisplayWidth,
    rightRailContentVisible,
    rightRailResizeHandleActive,
    openRightRailMode,
    startRightRailResize,
    moveRightRailResize,
    finishRightRailResize,
  } = useRightRailController()
  const [state, dispatch] = useReducer(reducer, initialTestScenario?.document ?? null, createInitialEditorState)
  const {
    selectedStyleResource,
    setSelectedStyleResource,
  } = useEditorSelectedStyleResource(state.doc, setRightRailMode)
  const {
    editorTextMeasurer,
    editorTextMeasurerStatus,
    fontReadyVersion,
  } = useEditorTextMeasurerController()
  const [browserPreviewLayout, setBrowserPreviewLayout] = useState(createEditorPreviewPlaceholderLayoutState)
  const [partialPreviewPaginated, setPartialPreviewPaginated] = useState<EditorPartialPreviewPaginated | null>(null)
  const [mode, setMode] = useState<"template" | "fill">("template")
  const {
    dataSnapshot,
    setDataSnapshot,
    packageFieldRegistry,
    setPackageFieldRegistry,
  } = useEditorPackageDataState(Boolean(initialTestScenario))
  const isTemplateMode = mode === "template"
  const [optimisticStructuralRefocusPaint, setOptimisticStructuralRefocusPaint] = useState<OptimisticStructuralRefocusPaint | null>(null)
  const [optimisticStructuralIslandOverride, setOptimisticStructuralIslandOverride] = useState<OptimisticStructuralIslandOverride | null>(null)
  const {
    structuralEditRuntime,
    structuralEditController,
    panelDeferralRuntime,
    previewSettleRuntime,
    wysiwygDraftRuntime,
    wysiwygDraftSessionIdentityRef,
    getCurrentWysiwygDraftRuntimeSession,
    abortWysiwygDraftRuntimeSessionForStructuralTransaction,
  } = useEditorRuntimeControllers()
  const {
    deferredStructuralPanelReleaseRef,
    structuralPanelReleaseApplyingRef,
    recordStructuralPanelReleaseEvent,
    beginStructuralPanelReleaseDeferral,
    scheduleDeferredStructuralPanelRelease,
    abortStructuralEditTransactionAndPanelDeferral,
  } = useStructuralPanelReleaseController({
    structuralEditRuntime,
    panelDeferralRuntime,
    previewSettleRuntime,
    abortWysiwygDraftRuntimeSessionForStructuralTransaction,
  })
  const structuralShellRenderAttributionActive = isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED) && Boolean(
    optimisticStructuralIslandOverride || optimisticStructuralRefocusPaint,
  )
  const pushStructuralShellRenderAttributionEvent = useCallback((
    action: string,
    startedAt: number,
    metadata: Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">> = {},
  ): void => {
    if (!structuralShellRenderAttributionActive) return
    const activeIsland = optimisticStructuralIslandOverride
    const endedAt = startWysiwygPerfSpan()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      nodeId: activeIsland?.nodeId ?? optimisticStructuralRefocusPaint?.nodeId,
      pageIndex: activeIsland?.fragment.pageIndex ?? null,
      componentName: "EditorShell",
      source: "EditorShell",
      action,
      optimisticMode: activeIsland?.mode,
      active: true,
      derivedValueCount: 1,
      ...metadata,
    })
  }, [optimisticStructuralIslandOverride, optimisticStructuralRefocusPaint, structuralShellRenderAttributionActive])
  const captureStructuralShellRenderValue = useCallback(<T,>(
    action: string,
    compute: () => T,
    metadata: (value: T) => Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">> = () => ({}),
  ): T => {
    if (!structuralShellRenderAttributionActive) return compute()
    const startedAt = startWysiwygPerfSpan()
    const value = compute()
    pushStructuralShellRenderAttributionEvent(action, startedAt, metadata(value))
    return value
  }, [pushStructuralShellRenderAttributionEvent, structuralShellRenderAttributionActive])
  useLayoutEffect(() => {
    if (!structuralShellRenderAttributionActive) return
    const startedAt = startWysiwygPerfSpan()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: optimisticStructuralIslandOverride?.nodeId ?? optimisticStructuralRefocusPaint?.nodeId,
      pageIndex: optimisticStructuralIslandOverride?.fragment.pageIndex ?? null,
      componentName: "EditorShell",
      source: "EditorShell",
      action: "shell-layout-effect",
      optimisticMode: optimisticStructuralIslandOverride?.mode,
      active: true,
    })
  })
  const {
    outlineSelectionState,
  } = useEditorOutlineSelectionState({
    doc: state.doc,
    selectedNodeId: state.selectedNodeId,
    selectedStyleResource,
    frozen: Boolean(optimisticStructuralIslandOverride),
  })
  const {
    activeSectionIndex,
    resolvePreviewDoc,
    previewDoc,
    dataReadiness,
    paginatePreviewDoc,
  } = useEditorPreviewDocumentController({
    doc: state.doc,
    selectedNodeId: state.selectedNodeId,
    mode,
    isTemplateMode,
    packageFieldRegistry,
    dataSnapshot,
    editorTextMeasurer,
    captureStructuralShellRenderValue,
    pushStructuralShellRenderAttributionEvent,
  })

  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const pendingBoundarySafeInlineEditEndRef = useRef<DeferredInlineEditEnd | null>(null)
  const pendingDragRef = useRef<PendingDrag | null>(null)
  const pendingEditorActionClassificationRef = useRef<PendingEditorActionClassification | null>(null)
  const suppressNextLayoutLoadingOverlayRef = useRef(false)
  const dispatchEditorAction = useCallback((action: EditorAction) => {
    const startedAt = startWysiwygPerfSpan()
    const classification = classifyEditorAction(action)
    pendingEditorActionClassificationRef.current = { action, classification }
    if (shouldSuppressLayoutLoadingOverlayForEditorAction(action, classification)) {
      suppressNextLayoutLoadingOverlayRef.current = true
    }
    dispatch(action)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "editor-action-dispatch", startedAt, {
      source: "dispatchEditorAction",
      commandType: action.type,
      uiImpact: classification.uiImpact,
      layoutScope: classification.layoutScope,
      priority: classification.priority,
      layoutAffecting: classification.layoutScope !== "none",
    })
  }, [])
  const pendingDragMoveRef = useRef<PendingDragMove | null>(null)
  const dragMoveFrameRef = useRef<number | null>(null)
  const {
    value: resizeDrag,
    valueRef: resizeDragRef,
    setImmediate: setResizeDrag,
  } = useAnimationFrameState<ResizeDrag | null>(null)
  const {
    value: minHeightDrag,
    valueRef: minHeightDragRef,
    setImmediate: setMinHeightDrag,
    setOnAnimationFrame: scheduleMinHeightDrag,
  } = useAnimationFrameState<MinHeightDrag | null>(null)
  const {
    value: marginDrag,
    valueRef: marginDragRef,
    setImmediate: setMarginDrag,
    setOnAnimationFrame: scheduleMarginDrag,
  } = useAnimationFrameState<MarginDrag | null>(null)
  const {
    value: headerFooterReservedDrag,
    valueRef: headerFooterReservedDragRef,
    setImmediate: setHeaderFooterReservedDrag,
    setOnAnimationFrame: scheduleHeaderFooterReservedDrag,
  } = useAnimationFrameState<HeaderFooterReservedDrag | null>(null)
  const [marginEditMode, setMarginEditMode] = useState<MarginEditMode | null>(null)
  const [headerFooterEditMode, setHeaderFooterEditMode] = useState<HeaderFooterEditMode | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportFeedback, setExportFeedback] = useState<EditorExportFeedback | null>(null)
  const exportFeedbackElapsedMs = useExportFeedbackElapsed(exportFeedback)
  const [documentIoStatus, setDocumentIoStatus] = useState<EditorDocumentIoStatus | null>(null)
  const {
    resizePreviewRef,
    scheduleResizePreview,
    hideResizePreview,
  } = useResizePreviewController(scale)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const [showDrift, setShowDrift] = useState(false)
  const [showPageThumbnails, setShowPageThumbnails] = useState(false)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const showDriftRef = useRef(showDrift)
  useEffect(() => { showDriftRef.current = showDrift }, [showDrift])
  const {
    docRef,
    packageFieldRegistryRef,
    dataSnapshotRef,
    paginatedRef,
    paginatedPerfSummaryRef,
  } = useEditorLiveRefs({
    doc: state.doc,
    packageFieldRegistry,
    dataSnapshot,
    paginated: state.paginated,
  })
  const precomputedBrowserPaginationRef = useRef<OptimisticLayoutSnapshot | null>(null)
  const optimisticLayoutRef = useRef<OptimisticLayoutSnapshot | null>(null)

  const displayPaginated = useMemo(() => resolveEditorDisplayPaginated({
    authoritativePaginated: state.paginated,
    partialPreviewPaginated,
    previewLayout: browserPreviewLayout,
  }), [browserPreviewLayout, partialPreviewPaginated, state.paginated])
  const {
    leftRailOutlineDoc,
    leftRailStyleDoc,
    deferLeftRailForStructuralPaint,
    deferNonCriticalPanelsForStructuralPaint,
  } = useEditorLeftRailDocuments({
    doc: state.doc,
    previewDoc,
    isTemplateMode,
    optimisticStructuralRefocusPaint,
    optimisticStructuralIslandOverride,
    panelDeferralRuntime,
    structuralEditRuntime,
    structuralPanelReleaseApplyingRef,
    recordStructuralPanelReleaseEvent,
  })
  const {
    nodeId: inlineEditNodeId,
    caretIndex: inlineEditCaretIndex,
    pageIndex: inlineEditPageIndex,
    isDocumentVisualReady: inlineEditDocumentVisualReady,
    isVisualLocked: inlineEditVisualLocked,
    nodeIdRef: inlineEditNodeIdRef,
    draftVersionRef: inlineEditDraftVersionRef,
    markVisualFresh: markInlineEditVisualFresh,
    setPageIndex: setInlineEditPageIndex,
    finalizeBeforeAction: finalizeLegacyInlineEditBeforeAction,
    resetForDocumentReplace: resetInlineEditStateForDocumentReplace,
    end: endInlineEditSession,
    start: startInlineEditSession,
    change: handleInlineEditChange,
    userInteraction: handleInlineEditUserInteraction,
    caretChange: handleInlineEditCaretChange,
    heightChange: handleInlineEditHeightChange,
    consumeHistory: consumeInlineEditHistory,
    startAfterStructuralChange: startInlineEditAfterStructuralChange,
    startAfterOptimisticStructuralChange: startInlineEditAfterOptimisticStructuralChange,
  } = useInlineEditSession({
    getCurrentDoc: () => docRef.current,
    getCurrentPaginated: () => paginatedRef.current,
    getParagraphText: getParagraphTextFromDoc,
    paginatePreviewDoc,
    selectNode: (nodeId) => {
      dispatchEditorAction({ type: "SELECT_NODE", nodeId })
      if (nodeId) setRightRailMode("properties")
    },
    updateInlineTextDraft: (nodeId, text) => {
      const startedAt = startWysiwygPerfSpan()
      dispatchEditorAction({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-draft-update", startedAt, {
        nodeId,
        textLength: text.length,
      })
    },
    commitInlineTextEdit: (payload) => dispatchEditorAction({ type: "COMMIT_INLINE_TEXT_EDIT", ...payload }),
    setPaginated: (paginated) => dispatch({ type: "SET_PAGINATED", paginated }),
  })
  const inlineEditPageIndexRef = useRef<number | null>(inlineEditPageIndex)
  useEffect(() => { inlineEditPageIndexRef.current = inlineEditPageIndex }, [inlineEditPageIndex])
  const inlineEditVisualLockedRef = useRef(inlineEditVisualLocked)
  useEffect(() => { inlineEditVisualLockedRef.current = inlineEditVisualLocked }, [inlineEditVisualLocked])
  const {
    editorPageNavigation,
    editorPageItems,
    selectedContextLabel,
    selectedPageIndex,
    editorPageCount,
    canvasSectionLabel,
  } = useEditorNavigationSelectionState({
    displayPaginated,
    doc: state.doc,
    selectedNodeId: state.selectedNodeId,
    selectionAnchorNodeId: state.selectionAnchorNodeId,
    isTemplateMode,
    activeSectionIndex,
    captureStructuralShellRenderValue,
  })
  const {
    pageRefs,
    editorPageKeyByPageIndexRef,
    currentCanvasPageIndex,
    jumpToEditorPage,
    requestInlineEditPageFollow,
    setPageRef,
    setPageOverlayRef,
    getPageOverlayElement,
  } = useEditorPageViewController({
    editorPageItems,
    pageKeyByPageIndex: editorPageNavigation.pageKeyByPageIndex,
    selectedPageIndex,
    inlineEditPageIndex,
  })

  const {
    richWysiwygDraftSessionState,
    wysiwygTextSessionState,
    wysiwygTextSessionStateRef,
    richWysiwygDraftSessionStateRef,
    wysiwygTextAccessibilityStatus,
    startPlainWysiwygTextSessionFromText,
    applyRichWysiwygDraftStyleCommand,
    endRichWysiwygDraftSession,
    beginWysiwygDraftRuntimeSession,
    startWysiwygTextSession,
    changeWysiwygTextDraft,
    moveWysiwygTextCaret,
    endWysiwygTextSession,
  } = useEditorWysiwygTextSessionController({
    docRef,
    wysiwygDraftRuntime,
    wysiwygDraftSessionIdentityRef,
  })
  const {
    wysiwygPerfTraceActive,
    handleEditorCanvasProfilerRender,
  } = useEditorPerfTraceController({
    document: state.doc,
    selectedNodeId: state.selectedNodeId,
    selectionAnchorNodeId: state.selectionAnchorNodeId,
    lastSplitNodeId: state.lastSplitNodeId,
    mergeResult: state.mergeResult,
    wysiwygTextSessionStateRef,
    paginatedPerfSummaryRef,
  })
  const {
    richTextToolbarSelection,
    richTextToolbarLiveSelection,
  } = useEditorRichTextToolbarSelection(
    wysiwygTextSessionState.nodeId,
    wysiwygTextSessionState.selection,
  )
  const {
    getPersistableDocumentSnapshot,
    recordPreviewSettleShellMutationPlan,
  } = useEditorDocumentSnapshotActions({
    docRef,
    richWysiwygDraftSessionStateRef,
    wysiwygTextSessionStateRef,
  })
  const {
    clearWysiwygDraftPagination,
    inlineEditHeightPreviewLastDispatchRef,
    recordWysiwygDraftPaginationSnapshot,
    scheduleRichTextDraftStylePagination,
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
    wysiwygDraftPaginationNodeId,
    wysiwygDraftPaginationNodeIdRef,
    wysiwygLatestDraftPaginationSnapshotRef,
    wysiwygPlainTextBoundaryDraftPaginationNodeIdRef,
  } = useWysiwygDraftPaginationController({
    dispatch,
    docRef,
    inlineEditDraftVersionRef,
    inlineEditPageIndexRef,
    inlineEditVisualLockedRef,
    markInlineEditVisualFresh,
    optimisticLayoutRef,
    paginatePreviewDoc,
    paginatedRef,
    recordPreviewSettleShellMutationPlan,
    requestInlineEditPageFollow,
    richWysiwygDraftSessionStateRef,
    setInlineEditPageIndex,
    wysiwygTextSessionNodeId: wysiwygTextSessionState.nodeId,
    wysiwygTextSessionStateRef,
  })

  const canUseLocalRichTextDraftStylePreview = useCallback((nodeId: string): boolean => {
    const doc = docRef.current
    return !isParagraphInsideFlowStack(doc, nodeId) &&
      !isParagraphInsideTableCell(doc, nodeId) &&
      !isParagraphInsideRowStack(doc, nodeId)
  }, [])

  const applyActiveRichTextDraftCommand = useCallback((nodeId: string, command: RichTextDraftSessionCommand): boolean => {
    if (!WYSIWYG_RICH_TEXT_DRAFT_ENABLED) return false
    const current = richWysiwygDraftSessionStateRef.current
    if (!current.nodeId || current.nodeId !== nodeId || !current.draft) return false
    const patch = getRichTextDraftSessionCommandPatch(current, command)
    const layoutAffecting = isRichTextDraftStylePatchLayoutAffecting(patch)
    const canUseLocalStylePreview = !layoutAffecting && canUseLocalRichTextDraftStylePreview(nodeId)
    const selection = current.draft.selection
    const startedAt = startWysiwygPerfSpan()
    const next = applyRichTextDraftSessionStyleCommand(current, patch)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "rich-draft-style-command", startedAt, {
      nodeId,
      commandType: command.type,
      styleFields: Object.keys(patch).sort().join(","),
      layoutAffecting,
      localStylePreview: canUseLocalStylePreview,
      selectionCollapsed: selection.anchorOffset === selection.focusOffset,
    })
    if (next === current) return false
    applyRichWysiwygDraftStyleCommand(patch)
    if (next.dirtyVersion !== current.dirtyVersion) {
      if (!canUseLocalStylePreview) {
        scheduleRichTextDraftStylePagination(nodeId)
      }
    }
    return true
  }, [
    applyRichWysiwygDraftStyleCommand,
    canUseLocalRichTextDraftStylePreview,
    scheduleRichTextDraftStylePagination,
  ])

  const handleWysiwygRichTextShortcut = useCallback((nodeId: string, input: WysiwygTextInputKey): boolean => {
    const richTextCommand = resolveRichTextDraftKeyboardCommand(input)
    return richTextCommand ? applyActiveRichTextDraftCommand(nodeId, richTextCommand) : false
  }, [applyActiveRichTextDraftCommand])

  const {
    canStartInlineEditImmediatelyForClick,
    cancelDeferredInlineEditStart,
    finalizeInlineEditBeforeAction,
    finalizeInlineEditBeforeActionRef,
    finalizeInlineEditBeforeResponsiveAction,
    handleFlowdocDraftIslandEndEdit,
    handleInlineEditEnd,
    handleInlineEditStart,
    scheduleInlineEditEndAfterPaint,
    scheduleInlineEditStartAfterSelectionPaint,
    startInlineEditImmediatelyFromClick,
  } = useEditorInlineEditLifecycleController({
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatch,
    displayPaginated,
    docRef,
    editorPageCount,
    editorRootRef,
    endInlineEditSession,
    endWysiwygTextSession,
    finalizeLegacyInlineEditBeforeAction,
    getCurrentWysiwygDraftRuntimeSession,
    inlineEditNodeIdRef,
    inlineEditPageIndex,
    isTemplateMode,
    moveWysiwygTextCaret,
    optimisticLayoutRef,
    optimisticStructuralIslandOverride,
    paginatePreviewDoc,
    paginatedRef,
    pendingBoundarySafeInlineEditEndRef,
    resetInlineEditStateForDocumentReplace,
    richWysiwygDraftSessionState,
    startInlineEditSession,
    startWysiwygTextSession,
    suppressNextLayoutLoadingOverlayRef,
    wysiwygDraftRuntime,
    wysiwygDraftSessionIdentityRef,
    wysiwygLatestDraftPaginationSnapshotRef,
    wysiwygTextSessionNodeId: wysiwygTextSessionState.nodeId,
    wysiwygTextSessionStateRef,
  })

  const handleWysiwygTextDraftChange = useCallback((nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => {
    if (wysiwygTextSessionState.nodeId !== nodeId) return
    const textChanged = text !== wysiwygTextSessionState.draftText
    const nextSelection = selection ?? (caretIndex == null ? null : { anchorOffset: caretIndex, focusOffset: caretIndex })
    if (
      !textChanged &&
      wysiwygTextSessionState.caretOffset === caretIndex &&
      areWysiwygTextSelectionsEqual(wysiwygTextSessionState.selection, nextSelection)
    ) return
    const nextSnapshotRevision = recordWysiwygDraftPaginationSnapshot({
      nodeId,
      draftText: text,
      caretOffset: caretIndex,
    })
    updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      {
        nodeId,
        caretIndex,
        selection: nextSelection,
        textVersion: nextSnapshotRevision,
        draftTextLength: text.length,
        timestamp: startWysiwygPerfSpan(),
      },
    )
    if (!textChanged) {
      const startedAt = startWysiwygPerfSpan()
      moveWysiwygTextCaret(caretIndex, nextSelection)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-selection-update", startedAt, {
        nodeId,
        draftVersion: wysiwygTextSessionState.dirtyVersion,
        textLength: text.length,
        richDraft: WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionStateRef.current.nodeId === nodeId,
        selectionCollapsed: !selection || selection.anchorOffset === selection.focusOffset,
      })
    } else {
      const startedAt = startWysiwygPerfSpan()
      changeWysiwygTextDraft({ text, caretOffset: caretIndex, selection })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-draft-update", startedAt, {
        nodeId,
        draftVersion: wysiwygTextSessionState.dirtyVersion + 1,
        textLength: text.length,
      })
    }
    handleInlineEditCaretChange(nodeId, caretIndex)
    if (!textChanged) return
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    const draftPaginationActive = wysiwygDraftPaginationNodeId === nodeId
    const plainBoundaryDraftPaginationActive =
      !isFlowStackParagraph &&
      !isTableCellParagraph &&
      wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current === nodeId
    const currentFragmentCount = countWysiwygTextDraftFragments(paginatedRef.current, nodeId)
    const responsiveDraftPaginationNodeId = resolveDraftPreviewPaginationResponsiveNodeId({
      nodeId,
      isFlowStackParagraph,
      isTableCellParagraph,
      draftPaginationActive,
      currentFragmentCount,
    })
    const useResponsiveDraftPagination = responsiveDraftPaginationNodeId !== null
    const plainBoundaryPaginationSummary = plainBoundaryDraftPaginationActive && !useResponsiveDraftPagination
      ? summarizePaginatedForWysiwygPerf(paginatedRef.current)
      : null
    const plainBoundaryPageCount = plainBoundaryPaginationSummary?.pageCount ?? 0
    const plainBoundaryFragmentCount = plainBoundaryPaginationSummary?.fragmentCount ?? 0
    const shouldUsePlainBoundaryDraftPagination = plainBoundaryPaginationSummary
      ? shouldSchedulePlainBoundaryDraftPagination({
          pageCount: plainBoundaryPageCount,
          pageLimit: WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_PAGE_LIMIT,
        })
      : false
    if (plainBoundaryDraftPaginationActive && !useResponsiveDraftPagination && !shouldUsePlainBoundaryDraftPagination) {
      wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current = null
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "draft-pagination-schedule",
        startedAt: startWysiwygPerfSpan(),
        durationMs: 0,
        nodeId,
        draftVersion: wysiwygTextSessionState.dirtyVersion + 1,
        textLength: text.length,
        requestedDelayMs: WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
        source: "plain-boundary-large-doc-suppressed",
        action: "skip-large-doc",
        pageCount: plainBoundaryPageCount,
        fragmentCount: plainBoundaryFragmentCount,
      })
    }
    if (useResponsiveDraftPagination || shouldUsePlainBoundaryDraftPagination) {
      if (responsiveDraftPaginationNodeId) {
        setWysiwygDraftPaginationNodeId(responsiveDraftPaginationNodeId)
      }
      const draftPaginationDelayMs = shouldUsePlainBoundaryDraftPagination && !useResponsiveDraftPagination
        ? WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS
        : resolveDraftPreviewPaginationDelayMsBridge({
            draftPaginationActive: true,
            isFlowStackParagraph,
            isTableCellParagraph,
            defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
            flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
          })
      scheduleWysiwygDraftPagination(nodeId, draftPaginationDelayMs)
    }
  }, [
    changeWysiwygTextDraft,
    handleInlineEditCaretChange,
    moveWysiwygTextCaret,
    recordWysiwygDraftPaginationSnapshot,
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
    wysiwygDraftRuntime,
    wysiwygTextSessionState.caretOffset,
    wysiwygTextSessionState.draftText,
    wysiwygTextSessionState.nodeId,
    wysiwygTextSessionState.selection,
    wysiwygDraftPaginationNodeId,
  ])

  const handleWysiwygDraftCompositionChange = useCallback((nodeId: string, isComposing: boolean) => {
    markCurrentTrackedWysiwygDraftRuntimeCompositionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      {
        nodeId,
        isComposing,
        timestamp: startWysiwygPerfSpan(),
      },
    )
  }, [wysiwygDraftRuntime])

  const handleInlineEditHeightPreviewChange = useCallback((nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => {
    const key = `${nodeId}:${pageIndex ?? "null"}`
    const previous = inlineEditHeightPreviewLastDispatchRef.current
    if (previous?.key === key && Math.abs(previous.height - height) < 0.5) {
      return
    }
    inlineEditHeightPreviewLastDispatchRef.current = { key, height }
    handleInlineEditHeightChange(nodeId, height, pageIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || wysiwygTextSessionState.nodeId !== nodeId) return
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    const shouldPatchBoundaryHeight = shouldPatchPlainParagraphBoundaryHeightPreview({
      isFlowStackParagraph,
      isTableCellParagraph,
      reflow,
    })
    if (reflow && !reflow.shouldPatchSamePageHeight && !shouldPatchBoundaryHeight) return
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "inline-edit-height-preview",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      pageIndex,
      draftVersion: wysiwygTextSessionState.dirtyVersion,
      textLength: wysiwygTextSessionState.draftText.length,
      paragraphHeight: height,
      source: shouldPatchBoundaryHeight
        ? "set-inline-edit-height-dispatch-boundary-handoff"
        : "set-inline-edit-height-dispatch",
      commandType: "SET_INLINE_EDIT_HEIGHT",
      active: true,
      reflowKind: reflow?.kind,
      reflowReason: reflow?.reason,
    })
    dispatch({ type: "SET_INLINE_EDIT_HEIGHT", nodeId, height, pageIndex, reflow })
  }, [
    handleInlineEditHeightChange,
    wysiwygTextSessionState.dirtyVersion,
    wysiwygTextSessionState.draftText.length,
    wysiwygTextSessionState.nodeId,
  ])

  const handleWysiwygTextReflowDecision = useCallback((nodeId: string, reflow: WysiwygTextReflowDecision) => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || wysiwygTextSessionState.nodeId !== nodeId) return
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    const isPlainParagraphBoundary =
      !isFlowStackParagraph &&
      !isTableCellParagraph &&
      reflow.kind === "hard-page-boundary"
    const requestedDelayMs = isPlainParagraphBoundary
      ? WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS
      : resolveDraftPreviewPaginationDelayMsBridge({
          reflow,
          isFlowStackParagraph,
          isTableCellParagraph,
          draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === nodeId,
          defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
          flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
        })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "table-cell-reflow-decision",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      draftVersion: wysiwygTextSessionState.dirtyVersion,
      textLength: wysiwygTextSessionState.draftText.length,
      requestedDelayMs: reflow.shouldQueueSettledPagination ? requestedDelayMs : undefined,
      source: "handle-wysiwyg-text-reflow-decision",
      reflowKind: reflow.kind,
      reflowReason: reflow.reason,
      responsiveDraftPaginationRequested: reflow.shouldQueueSettledPagination &&
        isTableCellParagraph &&
        requestedDelayMs <= FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      isTableCellParagraph,
      isFlowStackParagraph,
      draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === nodeId,
    })
    if (!reflow.shouldQueueSettledPagination) return
    if (isPlainParagraphBoundary) {
      const plainBoundaryPaginationSummary = summarizePaginatedForWysiwygPerf(paginatedRef.current)
      const plainBoundaryPageCount = plainBoundaryPaginationSummary.pageCount ?? 0
      const plainBoundaryFragmentCount = plainBoundaryPaginationSummary.fragmentCount ?? 0
      const shouldUsePlainBoundaryDraftPagination = shouldSchedulePlainBoundaryDraftPagination({
        pageCount: plainBoundaryPageCount,
        pageLimit: WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_PAGE_LIMIT,
      })
      if (!shouldUsePlainBoundaryDraftPagination) {
        if (wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current === nodeId) {
          wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current = null
        }
        recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
          kind: "draft-pagination-schedule",
          startedAt: startWysiwygPerfSpan(),
          durationMs: 0,
          nodeId,
          draftVersion: wysiwygTextSessionState.dirtyVersion,
          textLength: wysiwygTextSessionState.draftText.length,
          requestedDelayMs,
          source: "plain-boundary-large-doc-suppressed",
          action: "skip-large-doc",
          reflowKind: reflow.kind,
          reflowReason: reflow.reason,
          pageCount: plainBoundaryPageCount,
          fragmentCount: plainBoundaryFragmentCount,
        })
        return
      }
      if (wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current === nodeId) return
      wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current = nodeId
    }
    scheduleWysiwygDraftPagination(nodeId, requestedDelayMs)
  }, [
    scheduleWysiwygDraftPagination,
    wysiwygTextSessionState.dirtyVersion,
    wysiwygTextSessionState.draftText,
    wysiwygTextSessionState.nodeId,
  ])

  // ─── Auto-save ───────────────────────────────────────────────────────────────
  const { localSaveStatusLabel, localSaveStatusTone } = useEditorAutosave({
    disabled: Boolean(initialTestScenario),
    dataSnapshot,
    dataSnapshotRef,
    doc: state.doc,
    getPersistableDocumentSnapshot,
    packageFieldRegistry,
    packageFieldRegistryRef,
    wysiwygTextSessionDirtyVersion: wysiwygTextSessionState.dirtyVersion,
    wysiwygTextSessionNodeId: wysiwygTextSessionState.nodeId,
  })

  const importRef = useRef<HTMLInputElement>(null)

  const {
    handleExportJson,
    handleImportJson,
    handleNewDocument,
  } = useEditorDocumentIoActions({
    clearWysiwygDraftPagination,
    dataSnapshot,
    dispatch,
    docRef,
    endWysiwygTextSession,
    finalizeInlineEditBeforeAction,
    packageFieldRegistry,
    resetInlineEditStateForDocumentReplace,
    setBrowserPreviewLayout,
    setDataSnapshot,
    setDocumentIoStatus,
    setPackageFieldRegistry,
    setPartialPreviewPaginated,
    setSelectedStyleResource,
  })

  const {
    handleUndo,
    handleRedo,
  } = useEditorHistoryActions({
    isTemplateMode,
    pastLength: state.past.length,
    futureLength: state.future.length,
    finalizeInlineEditBeforeResponsiveAction,
    dispatchEditorAction,
  })
  const { handleWheelCapture } = useEditorWheelZoomController({
    editorRootRef,
    zoomByWheel,
  })

  const {
    handleMergeParagraph,
    handleSplitParagraph,
    optimisticStructuralPreviewSettleGraceUntilRef,
    optimisticStructuralSettleRef,
  } = useEditorOptimisticStructuralRefocusController({
    abortStructuralEditTransactionAndPanelDeferral,
    beginStructuralPanelReleaseDeferral,
    beginWysiwygDraftRuntimeSession,
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatch,
    dispatchEditorAction,
    displayPaginated,
    docRef,
    editorPageNavigation,
    editorTextMeasurer,
    endRichWysiwygDraftSession,
    endWysiwygTextSession,
    inlineEditPageIndexRef,
    lastSplitNodeId: state.lastSplitNodeId,
    listExitNodeId: state.listExitNodeId,
    listLevelChangeResult: state.listLevelChangeResult,
    mergeResult: state.mergeResult,
    moveWysiwygTextCaret,
    optimisticLayoutRef,
    optimisticStructuralIslandOverride,
    paginatedRef,
    setOptimisticStructuralIslandOverride,
    setOptimisticStructuralRefocusPaint,
    startInlineEditAfterOptimisticStructuralChange,
    startInlineEditAfterStructuralChange,
    startPlainWysiwygTextSessionFromText,
    startWysiwygTextSession,
    structuralEditController,
    suppressNextLayoutLoadingOverlayRef,
    wysiwygTextSessionStateRef,
  })

  const handleExitListItem = useCallback((nodeId: string, text?: string) => {
    const history = consumeInlineEditHistory(nodeId)
    dispatchEditorAction({ type: "EXIT_LIST_ITEM", nodeId, text, history })
  }, [consumeInlineEditHistory, dispatchEditorAction])

  const handleChangeListItemLevel = useCallback((
    nodeId: string,
    direction: ListLevelChangeDirection,
    text?: string,
    caretIndex?: number | null,
  ) => {
    const history = consumeInlineEditHistory(nodeId)
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    dispatchEditorAction({ type: "CHANGE_LIST_ITEM_LEVEL", nodeId, direction, text, caretIndex, history })
  }, [clearWysiwygDraftPagination, consumeInlineEditHistory, dispatchEditorAction, endWysiwygTextSession])

  const handleBackspaceListItemAtStart = useCallback((nodeId: string, text?: string, caretIndex?: number | null) => {
    const history = consumeInlineEditHistory(nodeId)
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    dispatchEditorAction({ type: "BACKSPACE_LIST_ITEM_AT_START", nodeId, text, caretIndex, history })
  }, [clearWysiwygDraftPagination, consumeInlineEditHistory, dispatchEditorAction, endWysiwygTextSession])

  const handleToggleListPreset = useCallback((
    nodeId: string,
    styleId: FlowDocListStylePresetId,
    instanceId: string,
    level: number,
  ) => {
    const hadWysiwygTextSession = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId !== null
    const finalized = finalizeInlineEditBeforeAction()
    if (hadWysiwygTextSession && !finalized) return
    const listContext = resolveParagraphListContext(docRef.current, nodeId)
    const isClearingSamePreset = listContext?.styleId === styleId
    const targetInstanceId = isClearingSamePreset
      ? listContext.instanceId
      : createUniqueListPresetInstanceId(docRef.current, styleId)
    dispatchEditorAction({ type: "TOGGLE_LIST_PRESET", nodeId, styleId, instanceId: targetInstanceId || instanceId, level })
    if (isClearingSamePreset) {
      setSelectedStyleResource(null)
      setRightRailMode("properties")
      return
    }
    setSelectedStyleResource({ kind: "list-group", id: targetInstanceId })
    setLeftRailMode("styles")
    openRightRailMode("style")
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction, openRightRailMode])

  const handleToolbarChangeListItemLevel = useCallback((nodeId: string, direction: ListLevelChangeDirection) => {
    const hadWysiwygTextSession = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId !== null
    const finalized = finalizeInlineEditBeforeAction()
    if (hadWysiwygTextSession && !finalized) return
    dispatchEditorAction({ type: "CHANGE_LIST_ITEM_LEVEL", nodeId, direction, refocus: false })
    setRightRailMode("properties")
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction])

  const handleCanStartParagraphTextSurfaceStructuralEdit = useCallback((
    input: ParagraphTextSurfaceStructuralEditGuardInput,
  ): boolean => {
    const currentDocContainsNode = getParagraphFromDoc(docRef.current, input.nodeId) !== null
    const optimisticDoc = optimisticLayoutRef.current?.doc ?? null
    const optimisticDocContainsNode = optimisticDoc
      ? getParagraphFromDoc(optimisticDoc, input.nodeId) !== null
      : false
    const nodeExists = currentDocContainsNode || optimisticDocContainsNode
    return canStartParagraphTextSurfaceFallbackStructuralEditBridge(structuralEditRuntime, {
      ...input,
      currentActiveNodeId: input.currentActiveNodeId ?? input.nodeId,
      expectedNodeExists: nodeExists,
      removedNodeStillExists: nodeExists,
    })
  }, [structuralEditRuntime])

  // ─── Editor preview layout ─────────────────────────────────────────────────
  const {
    serverLayoutCheckedForCurrentPreview,
    authoritativeLayoutWarnings,
    layoutWarningSource,
    exportReadiness,
    exportReadinessMessage,
    exportReadinessStatusReason,
    fontFallback,
    layoutError,
    setFontFallback,
    showBrowserPreviewLayoutPreparing,
    showLayoutLoadingOverlay,
  } = useEditorPaginationLifecycleController({
    authoritativePaginated: state.paginated,
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
    pendingEditorActionClassificationRef,
    precomputedBrowserPaginationRef,
    previewDoc,
    previewSettleRuntime,
    recordPreviewSettleShellMutationPlan,
    resizeDragRef,
    setBrowserPreviewLayout,
    setDriftReport,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMinHeightDrag,
    setPartialPreviewPaginated,
    setResizeDrag,
    showDriftRef,
    structuralEditRuntime,
    suppressNextLayoutLoadingOverlayRef,
  })

  const { handleExport } = useEditorExportController({
    docRef,
    exportReadiness,
    finalizeInlineEditBeforeAction,
    resolvePreviewDoc,
    setDocumentIoStatus,
    setExportError,
    setExportFeedback,
    setFontFallback,
    setIsExporting,
  })

  useInlineEditPageRelocation({
    authoritativePaginated: state.paginated,
    previewDoc,
    inlineEditNodeId,
    inlineEditCaretIndex,
    inlineEditPageIndex,
    inlineEditVisualLocked,
    inlineEditDocumentVisualReady,
    inlineEditPageIndexRef,
    setInlineEditPageIndex,
    requestInlineEditPageFollow,
  })

  const {
    activeOutOfCanvasStructuralIsland,
    flowdocDraftEditorIslandConfig,
    handleOptimisticStructuralRefocusPainted,
    suppressedCanvasTextNodeIds,
    useOutOfCanvasWysiwygIsland,
  } = useEditorStructuralIslandController({
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
    wysiwygTextSessionNodeId: wysiwygTextSessionState.nodeId,
  })

  const {
    activateWorkflowMode,
    applyCanvasTableAction,
    deleteNodeFromCanvas,
    enterHeaderFooterEditMode,
    enterMarginEditMode,
    exitHeaderFooterEditMode,
    exitMarginEditMode,
    handleBackgroundPointerDown,
    handleHeaderFooterReservedResizeStart,
    handleHeaderFooterZonePointerDown,
    handleMarginResizeStart,
    handleMinHeightResizeStart,
    handleResizeStart,
    handleTableColumnResizeStart,
    reorderLeftRailBodyChild,
    selectContextNode,
    selectLeftRailNode,
    selectOutlineListGroup,
    selectStyleResource,
    startCloneDragPointerDown,
    startNodePointerDown,
    startPaletteDrag,
  } = useEditorCanvasInteractionActions({
    cancelDeferredInlineEditStart,
    dispatch,
    dispatchEditorAction,
    doc: state.doc,
    editorTextMeasurer,
    finalizeInlineEditBeforeAction,
    finalizeInlineEditBeforeActionRef,
    finalizeInlineEditBeforeResponsiveAction,
    headerFooterEditMode,
    hideResizePreview,
    inlineEditNodeId,
    marginDragRef,
    marginEditMode,
    openRightRailMode,
    pageRefs,
    pendingDragRef,
    scale,
    scheduleInlineEditEndAfterPaint,
    scheduleResizePreview,
    selectedNodeId: state.selectedNodeId,
    selectionAnchorNodeId: state.selectionAnchorNodeId,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setLeftRailMode,
    setMarginDrag,
    setMarginEditMode,
    setMinHeightDrag,
    setMode,
    setResizeDrag,
    setRightRailMode,
    setSelectedStyleResource,
    setWorkflowMode,
    useOutOfCanvasWysiwygIsland,
    wysiwygTextSessionNodeId: wysiwygTextSessionStateRef.current.nodeId,
  })

  const {
    handlePointerCancel,
    handlePointerMove,
    handlePointerUp,
  } = useEditorCanvasPointerController({
    activeDrag: state.drag,
    canStartInlineEditImmediatelyForClick,
    cancelDeferredInlineEditStart,
    dispatch,
    dispatchEditorAction,
    doc: state.doc,
    dragMoveFrameRef,
    editorTextMeasurer,
    finalizeInlineEditBeforeResponsiveAction,
    headerFooterEditMode,
    headerFooterReservedDragRef,
    hideResizePreview,
    marginDragRef,
    minHeightDragRef,
    pageRefs,
    paginated: state.paginated,
    pendingDragMoveRef,
    pendingDragRef,
    precomputedBrowserPaginationRef,
    resizeDragRef,
    resolvePreviewDoc,
    scale,
    scheduleHeaderFooterReservedDrag,
    scheduleInlineEditStartAfterSelectionPaint,
    scheduleMarginDrag,
    scheduleMinHeightDrag,
    scheduleResizePreview,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMinHeightDrag,
    setResizeDrag,
    setRightRailMode,
    startInlineEditImmediatelyFromClick,
  })

  const clearSelectedStyleResource = useCallback(() => {
    setSelectedStyleResource(null)
  }, [])
  const setRightRailModeToPage = useCallback(() => {
    setRightRailMode("page")
  }, [])
  const { handleKeyDown } = useEditorKeyboardShortcuts({
    clearSelectedStyleResource,
    dispatch,
    dispatchEditorAction,
    handleInlineEditEnd,
    handleRedo,
    handleUndo,
    handleWysiwygRichTextShortcut,
    headerFooterEditMode,
    headerFooterReservedDragRef,
    hasActiveDrag: Boolean(state.drag),
    inlineEditNodeId,
    isTemplateMode,
    marginDragRef,
    marginEditMode,
    pendingDragRef,
    resetZoom,
    selectedNodeId: state.selectedNodeId,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMarginEditMode,
    setRightRailModeToPage,
    wysiwygTextSessionNodeId: wysiwygTextSessionState.nodeId,
    zoomIn,
    zoomOut,
  })

  const fieldCount = packageFieldRegistry.fields.length
  const fillIssueCount = dataReadiness.issues.length
  const workflowNavItems = buildEditorWorkflowNavItems({
    fieldCount,
    fillIssueCount,
    canExport: exportReadiness.canExport,
  })
  const {
    showDocumentPrepareOverlay,
    showInlineInitialLayoutLoading,
    documentPrepareStep,
    documentPrepareTitle,
    documentPrepareOverlayStatus,
  } = useEditorDocumentPrepareOverlay(showBrowserPreviewLayoutPreparing)

  return (
    <div
      ref={editorRootRef}
      data-testid="editor-shell"
      data-editor-test-scenario={initialTestScenario?.id ?? undefined}
      data-wysiwyg-text-engine-enabled={WYSIWYG_TEXT_ENGINE_ENABLED ? "true" : "false"}
      data-wysiwyg-rich-text-draft-enabled={WYSIWYG_RICH_TEXT_DRAFT_ENABLED ? "true" : "false"}
      data-wysiwyg-perf-trace-enabled={WYSIWYG_PERF_TRACE_ENABLED ? "true" : "false"}
      data-document-id={state.doc.document.id}
      data-document-title={state.doc.document.meta?.title ?? undefined}
      data-preview-layout-status={browserPreviewLayout.status}
      data-preview-layout-blocking={browserPreviewLayout.blocksCanvas ? "true" : "false"}
      style={editorShellRootStyle({
        dragActive: Boolean(state.drag),
        resizeActive: Boolean(resizeDrag && !resizeDrag.committed),
        minHeightResizeActive: Boolean(minHeightDrag && !minHeightDrag.committed),
        marginResizeSide: marginDrag && !marginDrag.committed ? marginDrag.side : null,
        headerFooterReservedResizeActive: Boolean(headerFooterReservedDrag && !headerFooterReservedDrag.committed),
      })}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onWheelCapture={handleWheelCapture}
      tabIndex={-1}
    >
      <EditorShellOverlayChrome
        showDocumentPrepareOverlay={showDocumentPrepareOverlay}
        documentPrepareStep={documentPrepareStep}
        documentPrepareTitle={documentPrepareTitle}
        documentPrepareOverlayStatus={documentPrepareOverlayStatus}
        resizePreviewRef={resizePreviewRef}
        wysiwygTextAccessibilityStatus={wysiwygTextAccessibilityStatus}
      />
      <EditorTopToolbar
        workflowMode={workflowMode}
        workflowNavItems={workflowNavItems}
        onActivateWorkflowMode={activateWorkflowMode}
        fontFallback={fontFallback}
        editorTextMeasurerStatus={editorTextMeasurerStatus}
        layoutError={layoutError}
        authoritativeLayoutWarnings={authoritativeLayoutWarnings}
        layoutWarningSource={layoutWarningSource}
        exportError={exportError}
        exportReadinessStatusReason={exportReadinessStatusReason}
        exportReadinessMessage={exportReadinessMessage}
        exportFeedback={exportFeedback}
        exportFeedbackElapsedMs={exportFeedbackElapsedMs}
        documentIoStatus={documentIoStatus}
        dragStatusLabel={state.drag ? `dragging ${describeDragSource(state.drag.source)} — Esc to cancel` : null}
        isExporting={isExporting}
        canExport={exportReadiness.canExport}
        onExport={handleExport}
        canUndo={isTemplateMode && state.past.length > 0}
        canRedo={isTemplateMode && state.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showTextSegments={showTextSegments}
        onToggleTextSegments={() => setShowTextSegments((value) => !value)}
        showDrift={showDrift}
        driftCount={driftReport?.driftCount ?? null}
        driftTotalParagraphs={driftReport?.totalParagraphs ?? null}
        onToggleDrift={() => setShowDrift((value) => !value)}
        importRef={importRef}
        onNewDocument={handleNewDocument}
        onImportJson={handleImportJson}
        onExportJson={handleExportJson}
        doc={state.doc}
        selectedNodeId={state.selectedNodeId}
        selectionAnchorNodeId={state.selectionAnchorNodeId}
        isTemplateMode={isTemplateMode}
        deferNonCriticalPanelsForStructuralPaint={deferNonCriticalPanelsForStructuralPaint}
        wysiwygPerfTraceActive={wysiwygPerfTraceActive}
        richTextDraftEnabled={WYSIWYG_RICH_TEXT_DRAFT_ENABLED}
        richDraftNodeId={richWysiwygDraftSessionState.nodeId}
        richDraftParagraph={richWysiwygDraftSessionState.draft?.paragraph ?? null}
        richDraftPendingStyle={richWysiwygDraftSessionState.draft?.pendingStyle ?? null}
        richTextToolbarSelection={richTextToolbarSelection}
        richTextToolbarLiveSelection={richTextToolbarLiveSelection}
        onToggleListPreset={handleToggleListPreset}
        onChangeListItemLevel={handleToolbarChangeListItemLevel}
        onApplyRichTextDraftCommand={applyActiveRichTextDraftCommand}
        hasWysiwygTextSession={() => WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId !== null}
        finalizeInlineEditBeforeAction={finalizeInlineEditBeforeAction}
        dispatchEditorAction={dispatchEditorAction}
      />

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <EditorLeftRailPane
          deferLeftRailForStructuralPaint={deferLeftRailForStructuralPaint}
          deferOutlineSelection={leftRailMode === "outline" && inlineEditNodeId !== null}
          previewLayoutStatus={browserPreviewLayout.status}
          wysiwygPerfTraceActive={wysiwygPerfTraceActive}
          mode={leftRailMode}
          outlineDoc={leftRailOutlineDoc}
          styleDoc={leftRailStyleDoc}
          selectedNodeId={outlineSelectionState.selectedNodeId}
          selectedStyleResource={selectedStyleResource}
          activeOutlineListGroupId={outlineSelectionState.activeListGroupId}
          registry={packageFieldRegistry}
          editable={isTemplateMode}
          isDragging={!!state.drag}
          addPaletteScope={headerFooterEditMode ? "headerFooter" : "document"}
          onModeChange={setLeftRailMode}
          onSelectNode={selectLeftRailNode}
          onSelectOutlineListGroup={selectOutlineListGroup}
          onSelectStyleResource={selectStyleResource}
          onReorderBodyChild={reorderLeftRailBodyChild}
          onDragStart={startPaletteDrag}
        />
        <EditorCanvasColumn
          saveStatusLabel={localSaveStatusLabel}
          saveStatusTone={localSaveStatusTone}
          sectionLabel={canvasSectionLabel}
          contextLabel={selectedContextLabel}
          pageItems={editorPageItems}
          currentPageIndex={currentCanvasPageIndex}
          scale={scale}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          zoomMode={zoomMode}
          showPageThumbnails={showPageThumbnails}
          onTogglePageThumbnails={() => setShowPageThumbnails((value) => !value)}
          onJumpToPage={jumpToEditorPage}
          onScaleChange={setManualScale}
          onResetZoom={resetZoom}
          onFitZoom={fitZoom}
          perfTraceActive={wysiwygPerfTraceActive}
        >
          {showInlineInitialLayoutLoading ? (
            <div
              data-testid="initial-layout-loading"
              aria-live="polite"
              style={{ flex: 1, display: "grid", placeItems: "center", overflow: "auto", padding: 24, background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}
            >
              Preparing layout...
            </div>
          ) : (
            <EditorCanvasPerfProfiler
              enabled={wysiwygPerfTraceActive}
              onRender={handleEditorCanvasProfilerRender}
            >
              <EditorCanvas
                paginated={displayPaginated}
                doc={previewDoc}
                drag={isTemplateMode ? state.drag : null}
                scale={scale}
                activePageIndex={currentCanvasPageIndex}
                selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
                selectionAnchorNodeId={isTemplateMode ? state.selectionAnchorNodeId : null}
                isLayoutLoading={showLayoutLoadingOverlay}
                textMeasurer={editorTextMeasurer}
                inlineEditVisualFresh={isTemplateMode ? inlineEditDocumentVisualReady : true}
                inlineEditNodeId={isTemplateMode && !useOutOfCanvasWysiwygIsland ? inlineEditNodeId : null}
                inlineEditCaretIndex={isTemplateMode && !useOutOfCanvasWysiwygIsland ? inlineEditCaretIndex : null}
                inlineEditPageIndex={isTemplateMode && !useOutOfCanvasWysiwygIsland ? inlineEditPageIndex : null}
                inlineEditVisualLocked={isTemplateMode ? inlineEditVisualLocked : false}
                onInlineEditStart={isTemplateMode ? handleInlineEditStart : () => undefined}
                onInlineEditChange={isTemplateMode ? handleInlineEditChange : () => undefined}
                onInlineEditCaretChange={isTemplateMode ? handleInlineEditCaretChange : () => undefined}
                onInlineEditUserInteraction={isTemplateMode ? handleInlineEditUserInteraction : () => undefined}
                onInlineEditHeightChange={isTemplateMode ? handleInlineEditHeightPreviewChange : () => undefined}
                onInlineEditEnd={isTemplateMode ? handleInlineEditEnd : () => undefined}
                onSplitParagraph={isTemplateMode ? handleSplitParagraph : () => undefined}
                onMergeParagraph={isTemplateMode ? handleMergeParagraph : () => undefined}
                onCanStartStructuralEdit={isTemplateMode ? handleCanStartParagraphTextSurfaceStructuralEdit : undefined}
                onExitListItem={isTemplateMode ? handleExitListItem : () => undefined}
                onChangeListItemLevel={isTemplateMode ? handleChangeListItemLevel : () => undefined}
                onBackspaceListItemAtStart={isTemplateMode ? handleBackspaceListItemAtStart : () => undefined}
                setPageRef={setPageRef}
                setPageOverlayRef={setPageOverlayRef}
                onNodePointerDown={isTemplateMode ? startNodePointerDown : () => undefined}
                onBackgroundPointerDown={isTemplateMode ? handleBackgroundPointerDown : () => undefined}
                onSelectContextNode={isTemplateMode ? selectContextNode : () => undefined}
                onStartCloneDrag={isTemplateMode ? startCloneDragPointerDown : () => undefined}
                onDeleteNode={isTemplateMode ? deleteNodeFromCanvas : () => undefined}
                onTableAction={isTemplateMode ? applyCanvasTableAction : () => undefined}
                onResizeStart={isTemplateMode ? handleResizeStart : () => undefined}
                onTableColumnResizeStart={isTemplateMode ? handleTableColumnResizeStart : () => undefined}
                resizeDrag={isTemplateMode ? resizeDrag : null}
                minHeightDrag={isTemplateMode ? minHeightDrag : null}
                onMinHeightResizeStart={isTemplateMode ? handleMinHeightResizeStart : () => undefined}
                marginDrag={isTemplateMode ? marginDrag : null}
                marginEditMode={isTemplateMode ? marginEditMode : null}
                headerFooterEditMode={isTemplateMode ? headerFooterEditMode : null}
                headerFooterReservedDrag={isTemplateMode ? headerFooterReservedDrag : null}
                onMarginEditModeEnter={isTemplateMode ? enterMarginEditMode : () => undefined}
                onMarginEditModeExit={isTemplateMode ? exitMarginEditMode : () => undefined}
                onHeaderFooterEditModeEnter={isTemplateMode ? enterHeaderFooterEditMode : () => undefined}
                onHeaderFooterEditModeExit={isTemplateMode ? exitHeaderFooterEditMode : () => undefined}
                onHeaderFooterZonePointerDown={isTemplateMode ? handleHeaderFooterZonePointerDown : () => undefined}
                onHeaderFooterReservedResizeStart={isTemplateMode ? handleHeaderFooterReservedResizeStart : () => undefined}
                onMarginResizeStart={isTemplateMode ? handleMarginResizeStart : () => undefined}
                onScaleChange={handleCanvasScaleChange}
                autoFitScale={zoomMode === "fit"}
                showTextSegments={showTextSegments}
                showDrift={showDrift}
                driftMap={driftReport?.driftMap ?? null}
                wysiwygInlineEditEnabled={WYSIWYG_INLINE_EDIT_ENABLED}
                wysiwygTextEngineEnabled={WYSIWYG_TEXT_ENGINE_ENABLED}
                wysiwygTextDraftNodeId={useOutOfCanvasWysiwygIsland ? null : wysiwygTextSessionState.nodeId}
                wysiwygTextDraftText={!useOutOfCanvasWysiwygIsland && wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.draftText : null}
                wysiwygTextDraftParagraph={!useOutOfCanvasWysiwygIsland && WYSIWYG_RICH_TEXT_DRAFT_ENABLED &&
                  richWysiwygDraftSessionState.nodeId === wysiwygTextSessionState.nodeId
                  ? richWysiwygDraftSessionState.draft?.paragraph ?? null
                  : null}
                wysiwygTextDraftDirtyVersion={!useOutOfCanvasWysiwygIsland && wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.dirtyVersion : 0}
                wysiwygTextCaretOffset={!useOutOfCanvasWysiwygIsland && wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.caretOffset : null}
                wysiwygTextSelection={!useOutOfCanvasWysiwygIsland && wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.selection : null}
                wysiwygTextDraftPaginationActive={!useOutOfCanvasWysiwygIsland && wysiwygDraftPaginationNodeId === wysiwygTextSessionState.nodeId}
                suppressedCanvasTextNodeIds={suppressedCanvasTextNodeIds}
                activeOutOfCanvasStructuralIsland={activeOutOfCanvasStructuralIsland}
                onWysiwygTextDraftChange={handleWysiwygTextDraftChange}
                onWysiwygRichTextShortcut={handleWysiwygRichTextShortcut}
                onWysiwygTextReflowDecision={handleWysiwygTextReflowDecision}
              />
            </EditorCanvasPerfProfiler>
          )}
          {flowdocDraftEditorIslandConfig ? (
            <FlowdocDraftEditorIslandRoot
              key={flowdocDraftEditorIslandConfig.nodeId}
              active
              nodeId={flowdocDraftEditorIslandConfig.nodeId}
              paragraph={flowdocDraftEditorIslandConfig.paragraph}
              fragment={flowdocDraftEditorIslandConfig.fragment}
              pageKey={flowdocDraftEditorIslandConfig.pageKey}
              pages={flowdocDraftEditorIslandConfig.pages}
              scale={scale}
              textMeasurer={editorTextMeasurer}
              draftText={wysiwygTextSessionState.draftText}
              caretOffset={wysiwygTextSessionState.caretOffset}
              selection={wysiwygTextSessionState.selection}
              getPageElement={getPageOverlayElement}
              getPageKeyByPageIndex={(pageIndex) => editorPageNavigation.pageKeyByPageIndex.get(pageIndex) ?? null}
              onDraftChange={handleWysiwygTextDraftChange}
              onHeightChange={handleInlineEditHeightPreviewChange}
              onReflowDecision={handleWysiwygTextReflowDecision}
              onEndEdit={handleFlowdocDraftIslandEndEdit}
              onSplitParagraph={handleSplitParagraph}
              onMergeParagraph={handleMergeParagraph}
              onRequestUndo={handleUndo}
              onCompositionChange={handleWysiwygDraftCompositionChange}
              structuralEditRuntime={structuralEditRuntime}
              structuralRefocusStartedAt={optimisticStructuralRefocusPaint?.nodeId === flowdocDraftEditorIslandConfig.nodeId
                ? optimisticStructuralRefocusPaint.startedAt
                : null}
              onStructuralRefocusPainted={handleOptimisticStructuralRefocusPainted}
            />
          ) : null}
        </EditorCanvasColumn>
        <EditorRightRail
          doc={state.doc}
          registry={packageFieldRegistry}
          dataSnapshot={dataSnapshot}
          dataReadinessIssues={dataReadiness.issues}
          selectedNodeId={state.selectedNodeId}
          selectionAnchorNodeId={state.selectionAnchorNodeId}
          selectedStyleResource={selectedStyleResource}
          activeSectionIndex={activeSectionIndex}
          isTemplateMode={isTemplateMode}
          displayWidth={rightRailDisplayWidth}
          collapsed={rightRailCollapsed}
          panelWidth={rightRailWidth}
          resizeActive={Boolean(rightRailResizeDrag)}
          resizeHandleHover={rightRailResizeHandleHover}
          resizeHandleActive={rightRailResizeHandleActive}
          contentVisible={rightRailContentVisible}
          mode={rightRailMode}
          deferNonCriticalPanelsForStructuralPaint={deferNonCriticalPanelsForStructuralPaint}
          wysiwygPerfTraceActive={wysiwygPerfTraceActive}
          onResizeHandleHoverChange={setRightRailResizeHandleHover}
          onResizeStart={startRightRailResize}
          onResizeMove={moveRightRailResize}
          onResizeFinish={finishRightRailResize}
          onToggleCollapse={() => {
            setRightRailResizeDrag(null)
            setRightRailCollapsed((value) => !value)
          }}
          onOpenMode={openRightRailMode}
          dispatchEditorAction={dispatchEditorAction}
          finalizeInlineEditBeforeAction={finalizeInlineEditBeforeAction}
          onSelectContextNode={selectContextNode}
          onSelectOutlineListGroup={selectOutlineListGroup}
          onSelectStyleResource={selectStyleResource}
          onDataSnapshotChange={(key, value) => setDataSnapshot((prev) => setDataSnapshotValue(prev, key, value))}
        />
      </div>
      <EditorDragGhost drag={state.drag} />
    </div>
  )
}
