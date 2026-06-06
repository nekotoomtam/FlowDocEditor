"use client"

import { Profiler, memo, startTransition, useReducer, useCallback, useRef, useState, useEffect, useLayoutEffect, useMemo, type PointerEvent, type ProfilerOnRenderCallback, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { DocumentPrepareOverlay } from "@/app/_components/DocumentPrepareOverlay"
import { collectPaginatedLayoutWarnings, LAYOUT_WARNINGS_BLOCKED_CODE, paginateDocument, resolveHeaderFooterHorizontalBox } from "@/pagination"
import { assertDocument, canRemoveFlowTableColumn, canRemoveFlowTableRow, clampSectionReservedZones, createDefaultDocument, createParagraphNode, createUniqueListPresetInstanceId, getTextRunParagraphText, isTextRunOnlyParagraph, mergeParagraphWithPrevious, normalizeDocument, resolveParagraphListContext, splitParagraphAtIndex } from "@/document"
import type { FlowDocListStylePresetId } from "@/document"
import {
  resizeFlowTableColumnPair as resizeFlowTableColumnPairForPreview,
  updateNodeProps,
} from "@/document"
import { bindDocumentWithSnapshot } from "@/binding"
import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { assessDocumentDataReadiness } from "@/readiness"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { DocumentNode, FlowTableNode, ParagraphNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type {
  DragSource,
  PlacementPreview,
  PlacementOperation,
  PlacementZone,
  PlacementIntentType,
} from "@/placement/types"
import { tryResolveFlowTableGrid } from "@/document/flowTableGrid"
import { EditorCanvas, type ActiveOutOfCanvasStructuralIsland, type CanvasTableAction } from "./EditorCanvas"
import { FlowdocDraftEditorIslandRoot } from "./FlowdocDraftEditorIslandRoot"
import { ListToolbar } from "./ListToolbar"
import { ListResourceInspectorPanel } from "./ListResourceInspectorPanel"
import type { OutlineBodyChildReorder } from "./OutlinePanel"
import { PropertyPanel } from "./PropertyPanel"
import { StyleDefinitionPanel } from "./StyleDefinitionPanel"
import type { StyleManagerResourceSelection } from "./StyleManagerPanel"
import { RichTextToolbar } from "./RichTextToolbar"
import { FillingPanel } from "./FillingPanel"
import { PagePanel } from "./PagePanel"
import {
  RIGHT_RAIL_COLLAPSED_WIDTH,
  RIGHT_RAIL_COLLAPSE_THRESHOLD,
  RIGHT_RAIL_CONTENT_HIDE_THRESHOLD,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  resolveRightRailPreviewWidth,
  resolveRightRailResize,
  resolveRightRailResizeStartWidth,
} from "./rightRailResize"
import { SAMPLE_FIELD_REGISTRY_V1 } from "@/app/_lib/fieldRegistry"
import {
  FLOWDOC_EXPORT_PROFILE_HEADER,
  formatFlowDocExportProfileSummary,
  parseFlowDocExportProfileHeader,
} from "@/app/_lib/exportProfile"
import { createBrowserTextMeasurer } from "./browserTextMeasurer"
import {
  isEditorTextMeasurerReady,
  resolveBrowserEditorTextMeasurer,
  type EditorTextMeasurerStatus,
} from "./editorTextMeasurerState"
import type { TextMeasurer } from "@/layout"
import { comparePagination } from "./comparePagination"
import {
  documentImportSuccessMessage,
  documentParseFailureMessage,
  type DocumentParseResult,
  loadDocumentFromStorage,
  makeFlowDocFileName,
  parsePersistedDocument,
  saveDocumentToStorage,
  serializeDocumentPackageWithFields,
} from "./documentPersistence"
import type { DriftReport } from "./comparePagination"
import { resolveSamePreviewOptimisticLayout, type LayoutStatus, type OptimisticLayoutSnapshot } from "./layoutReconciliation"
import { formatExportReadinessMessage, getExportReadiness, selectAuthoritativeLayoutWarnings } from "./exportReadiness"
import {
  createEditorPreviewPlaceholderLayoutState,
  markEditorPreviewLayoutFull,
  markEditorPreviewLayoutPartial,
  markEditorPreviewLayoutSettling,
  markEditorPreviewLayoutSettlingFromCurrent,
  shouldBlockEditorPreviewCanvas,
} from "./editorPreviewLayoutStatus"
import {
  resolveEditorDisplayPaginated,
  type EditorPartialPreviewPaginated,
} from "./editorPreviewDisplay"
import { findWysiwygPageIndexInFragmentRanges, getWysiwygParagraphFragmentRanges } from "./wysiwygCaretMapping"
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
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "./wysiwygDraftPreview"
import { resolveEditorTestScenarioFromLocation } from "./wysiwygStage3StressScenarios"
import { findWysiwygTextEngineFragment, isParagraphInsideFlowStack, isParagraphInsideRowStack, isParagraphInsideTableCell, isWysiwygTextEngineFragmentEligible } from "./wysiwygTextEligibility"
import { createOptimisticMergeRefocusPaginated, createOptimisticSplitRefocusPaginated, type OptimisticSplitRefocusMode } from "./optimisticStructuralRefocus"
import {
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
  replaceEditableParagraphInDocument,
  replaceEditableParagraphTextInDocument,
} from "./wysiwygTextCommit"
import { useInlineEditSession } from "./useInlineEditSession"
import {
  areWysiwygTextSelectionsEqual,
  describeWysiwygTextSessionAccessibility,
  useWysiwygTextSession,
  type WysiwygTextInputKey,
  type WysiwygTextSelection,
  WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID,
} from "./useWysiwygTextSession"
import {
  applyRichTextDraftSessionStyleCommand,
  projectRichTextDraftSessionToWysiwygTextSession,
  useWysiwygRichTextDraftSession,
} from "./richTextDraftSession"
import {
  RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS,
  areRichTextToolbarSelectionsEqual,
  resolveRichTextToolbarSelectionSnapshot,
  shouldDebounceRichTextToolbarSelection,
  type RichTextToolbarSelectionSnapshot,
} from "./richTextToolbarSelection"
import {
  getRichTextDraftSessionCommandPatch,
  isRichTextDraftStylePatchLayoutAffecting,
  resolveRichTextDraftKeyboardCommand,
  type RichTextDraftSessionCommand,
} from "./richTextDraftCommands"
import { resolvePersistableWysiwygDocument } from "./wysiwygDraftPersistence"
import {
  scrollElementIntoNearestView,
  scrollElementIntoStartView,
  shouldFollowInlineEditPageChange,
  shouldRelocateInlineEditPage,
} from "./editorPageFollow"
import {
  resolveWysiwygDraftPaginationSource,
  shouldPatchPlainParagraphBoundaryHeightPreview,
  type WysiwygDraftPaginationLatestSnapshot,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
import {
  effectiveFlowStackResizeMinShare,
  resolveFlowStackResizePairShares,
} from "./flowStackResize"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"
import { useAnimationFrameState } from "./useAnimationFrameState"
import { createInitialEditorState, reducer, resizeColumnsDocument, type DragState, type EditorAction } from "./editorReducer"
import { classifyEditorAction, shouldSuppressLayoutLoadingOverlayForEditorAction, type EditorActionClassification } from "./editorActionClassifier"
import { tryApplyVisualOnlyPaginatedUpdate } from "./editorVisualOnlyPagination"
import { buildSelectionContext } from "./selectionContext"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import { EditorCanvasColumn } from "./shell/EditorCanvasColumn"
import { shouldUseBackgroundBrowserPagination } from "./browserPaginationStrategy"
import type { BrowserPaginationWorkerRequest, BrowserPaginationWorkerResponse } from "./browserPaginationWorkerTypes"
import {
  buildEditorPageNavigationIndex,
  findFirstPageIndexForNodeInIndex,
  findNearestPageIndexInItems,
  type EditorPageNavItem,
} from "./shell/editorCanvasNavigation"
import {
  EditorToolbar,
  type EditorExportFeedback,
  type EditorExportFeedbackStage,
  type EditorExportFormat,
  type EditorWorkflowMode,
  type EditorWorkflowNavItem,
} from "./shell/EditorToolbar"
import { EditorLeftRail, type EditorLeftRailMode } from "./shell/EditorLeftRail"
import {
  clearDocumentPrepareHandoff,
  getDocumentPrepareStep,
  readDocumentPrepareHandoff,
  type DocumentPrepareHandoff,
  type DocumentPrepareStepId,
} from "./documentLibrary"
import {
  createStructuralEditRuntime,
  type StructuralEditRuntime,
  type StructuralEditTransactionIdentity,
} from "./runtime/structuralEditRuntime"
import {
  createPanelDeferralRuntime,
  type PanelDeferralRuntime,
} from "./runtime/panelDeferralRuntime"
import {
  createPreviewSettleRuntime,
  type PreviewSettleRuntime,
} from "./runtime/previewSettleRuntime"
import {
  createWysiwygDraftRuntime,
  type WysiwygDraftRuntime,
  type WysiwygDraftSession,
  type WysiwygDraftSessionIdentity,
  type WysiwygDraftSessionSource,
} from "./runtime/wysiwygDraftRuntime"
import {
  abortTrackedWysiwygDraftRuntimeSessionForStructuralTransactionBridge,
  beginTrackedWysiwygDraftRuntimeSessionBridge,
  cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge,
  createWysiwygDraftRuntimeSessionIdentity,
  getCurrentTrackedWysiwygDraftRuntimeSessionBridge,
  markCurrentTrackedWysiwygDraftRuntimeCompositionBridge,
  markTrackedWysiwygDraftRuntimeSessionCommittedBridge,
  markTrackedWysiwygDraftRuntimeSessionCommittingBridge,
  updateCurrentTrackedWysiwygDraftRuntimeMetadataBridge,
} from "./wysiwygDraftRuntimeBridge"
import { createStructuralDraftSessionPlan } from "./structuralEdit/structuralEditPlans"
import {
  abortStructuralPanelDeferralBridge,
  beginStructuralPanelDeferralBridge,
  cancelScheduledStructuralPanelReleaseBridge,
  canApplyStructuralPanelReleaseBridge,
  createScheduledStructuralPanelRelease,
  createStructuralPanelReleaseApplying,
  isStructuralPanelReleaseBlockedByUrgentFlushBridge,
  markStructuralPanelInputDuringDeferralBridge,
  markStructuralPanelReleaseCompletedBridge,
  markStructuralPanelReleaseStartedBridge,
  markStructuralPanelUrgentFlushCompleteBridge,
  matchesApplyingStructuralPanelReleaseTransaction,
  matchesScheduledStructuralPanelReleaseTransaction,
  matchesStructuralPanelReleaseTransaction,
  scheduleStructuralPanelReleaseBridge,
  shouldDelayStructuralPanelReleaseForInputBridge,
  type DeferredStructuralPanelRelease,
  type ScheduledStructuralPanelRelease,
  type StructuralPanelReleaseApplying,
} from "./structuralEdit/panelDeferralBridge"
import {
  getCurrentPreviewSettleGenerationBridge,
  getCurrentPreviewSettleRequestBridge,
  getPreviewSettleApplyDecisionBridge,
  invalidatePreviewSettleBridge,
  markPreviewSettleAppliedBridge,
  markPreviewSettleCancelledBridge,
  markPreviewSettleCompletedBridge,
  markPreviewSettleIgnoredBridge,
  markPreviewSettleStartedBridge,
  markPreviewSettleSupersededBridge,
  matchesPreviewSettleStructuralTransaction,
  createBrowserPreviewSettleApplyPlan,
  createDraftPreviewPaginationApplyPlan,
  createDraftPreviewPaginationSchedulePlan,
  resolveActivePreviewSettleStructuralTransaction,
  resolveDraftPreviewPaginationClearedGeneration,
  resolveDraftPreviewPaginationDelayMsBridge,
  resolveDraftPreviewPaginationResponsiveNodeId,
  resolvePreviewSettleDebounceMs,
  resolvePreviewSettleGraceRemainingMs,
  schedulePreviewSettleBridge,
  shouldRunDraftPreviewPagination,
  shouldSupersedePreviewSettleOnCleanup,
  type DraftPreviewPaginationRequest,
  type StructuralPreviewSettleSnapshot,
} from "./structuralEdit/previewSettleBridge"
import {
  applyDraftPreviewShellMutation,
  applyPaginatedOutputBrowserPreviewShellMutation,
  applyPartialWorkerBrowserPreviewShellMutation,
  applyPrecomputedBrowserPreviewShellMutation,
  applyVisualOnlyBrowserPreviewShellMutation,
  createBrowserPreviewShellMutationPlan,
  createDraftPreviewShellMutationPlan,
  summarizePreviewSettleShellMutationPlan,
  type BrowserPreviewShellMutationPlan,
  type DraftPreviewShellMutationPlan,
} from "./structuralEdit/previewSettleShellAdapter"
import {
  canStartParagraphTextSurfaceFallbackStructuralEditBridge,
  type ParagraphTextSurfaceStructuralEditGuardInput,
} from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import {
  resolveStructuralParagraphEligibility,
  resolveStructuralResultParagraph,
  resolveStructuralSourceDocument,
  summarizeStructuralOptimisticPaginatedForPerf,
} from "./structuralEdit/structuralEditPreparationPlans"
import type { StructuralPanelDeferralPlan } from "./structuralEdit/structuralEditBridgeTypes"
import { useStructuralEditController } from "./structuralEdit/useStructuralEditController"

export type { DragState } from "./editorReducer"

// ─── State ────────────────────────────────────────────────────────────────────

type SplitParagraphHistory = Extract<EditorAction, { type: "SPLIT_PARAGRAPH" }>["history"]

interface PendingClickAction {
  type: "inline-edit"
  nodeId: string
  selectNodeId?: string
  caretIndex: number | null
  pageIndex: number | null
}

interface PendingDrag {
  source: DragSource
  clientX: number
  clientY: number
  clickAction?: PendingClickAction
  finalizeOnDragStart?: boolean
}

interface DeferredInlineEditStart {
  frameId: number | null
  timeoutId: number | null
}

interface DeferredInlineEditEnd {
  frameId: number | null
  timeoutId: number | null
  nodeId: string
  reason: "blur" | "keyboard"
}

interface PendingEditorActionClassification {
  action: EditorAction
  classification: EditorActionClassification
}

interface PendingOptimisticSplitRefocus {
  sourceNodeId: string
  newNodeId: string
  sourceFragment: PageFragment
  startedAt: number
  prestarted: boolean
}

interface PendingOptimisticMergeRefocus {
  currentNodeId: string
  previousNodeId: string
  currentFragment: PageFragment
  previousFragment: PageFragment
  startedAt: number
  prestarted: boolean
}

interface OptimisticStructuralRefocusPaint {
  nodeId: string
  startedAt: number
}

interface OptimisticStructuralIslandOverride {
  nodeId: string
  paragraph: ParagraphNode
  fragment: PageFragment
  pageKey: string
  pages: PaginatedDocument["sections"][number]["pages"]
  mode: OptimisticSplitRefocusMode
  suppressedPageBreakNodeId?: string | null
  settleRemovedNodeId?: string
}

const STRUCTURAL_PANEL_RELEASE_MIN_DELAY_MS = 180
const STRUCTURAL_PANEL_RELEASE_IDLE_TIMEOUT_MS = 1000
const STRUCTURAL_PANEL_RELEASE_INPUT_QUIET_MS = 140

type WysiwygFinalizeMode = "settled-preview" | "responsive-preview"

interface PendingDragMove {
  clientX: number
  clientY: number
  sourceOverride?: DragSource | null
}

const SCREEN_READER_ONLY_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const

export interface StackResizeDrag {
  type: "stack"
  rowId: string
  leftStackId: string
  rightStackId: string
  pairX: number          // left stack x in doc coords
  pairWidth: number      // left + right stack width in doc coords
  gapWidthPt: number     // gap between the left and right stack fragments
  svgLeft: number        // SVG client left at drag start
  svgTop: number         // SVG client top at drag start
  pageKey: string
  rowFragY: number       // row top in doc coords
  rowFragHeight: number  // row height in doc coords
  currentDocX: number    // current drag position in doc coords
  leftShareOriginal: number
  rightShareOriginal: number
  totalShare: number     // leftShare + rightShare
  minWidthPt: number     // min column width in pt
  stackKind: "stack" | "flow-stack"
  committed?: boolean
}

export interface TableColumnResizeDrag {
  type: "table-column"
  tableId: string
  leftColIndex: number
  pairX: number          // left column x in rendered doc coords
  pairWidth: number      // left + right column rendered width in doc coords
  svgLeft: number        // SVG client left at drag start
  svgTop: number         // SVG client top at drag start
  pageKey: string
  tableFragY: number     // table fragment top in doc coords
  tableFragHeight: number // table fragment height in doc coords
  currentDocX: number    // current drag position in rendered doc coords
  pointerOffsetDocX: number
  leftWidthOriginal: number
  rightWidthOriginal: number
  pairWidthAuthored: number
  minWidthPt: number     // rendered min column width in pt
  committed?: boolean
}

export type ResizeDrag = StackResizeDrag | TableColumnResizeDrag

export interface MinHeightDrag {
  rowId: string
  rowFragY: number       // row top in doc coords
  svgTop: number         // SVG client top at drag start
  minPt: number          // natural content height
  currentMinHeight: number
  pageKey: string
  committed?: boolean
}

export interface MarginDrag {
  sectionIndex: number
  side: "top" | "right" | "bottom" | "left"
  pageWidthPt: number
  pageHeightPt: number
  currentMargins: { top: number; right: number; bottom: number; left: number }
  pageKey: string
  altKey: boolean        // true = single-side mode (no mirror)
  committed?: boolean
}

export interface MarginEditMode {
  sectionIndex: number
}

export interface HeaderFooterEditMode {
  sectionIndex: number
  zone: "header" | "footer"
}

export interface HeaderFooterReservedDrag {
  sectionIndex: number
  zone: "header" | "footer"
  pageKey: string
  pageHeightPt: number
  marginTopPt: number
  marginBottomPt: number
  currentReserved: { headerReserved: number; footerReserved: number }
  committed?: boolean
}

type ZoomMode = "fit" | "manual"
type LeftRailMode = EditorLeftRailMode
type RightRailMode = "page" | "properties" | "style"
type WorkflowMode = EditorWorkflowMode
type RightRailResizeDrag = {
  pointerId: number
  startX: number
  startWidth: number
  previewWidth: number
}

type CanvasFlowTableActionScope =
  | { type: "table"; table: FlowTableNode; tableId: string }
  | { type: "row"; table: FlowTableNode; tableId: string; rowIndex: number }
  | { type: "cell"; table: FlowTableNode; tableId: string; columnIndex: number; columnEndIndex: number }

type CanvasFlowTableActionTarget =
  | { type: "add-row"; tableId: string; afterIndex?: number }
  | { type: "delete-row"; tableId: string; rowIndex: number }
  | { type: "add-column"; tableId: string; afterIndex?: number }
  | { type: "delete-column"; tableId: string; colIndex: number }
  | { type: "delete-table"; tableId: string }

const MIN_SCALE = 0.3
const MAX_SCALE = 4
const ZOOM_STEP = 0.25
const OUTLINE_SELECTION_IDLE_TIMEOUT_MS = 1500
const INLINE_EDIT_PREVIEW_DEBOUNCE_MS = 0
const OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS = 1500
const BROWSER_PREVIEW_VISIBLE_WINDOW_MARGIN_PAGES = 4
// Keep hard reflow from settling between real key-repeat events; the local
// text-engine draft replacement carries immediate feedback until the burst pauses.
const WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS = 450
// Flow-stack page-boundary edits do not have a safe same-page local preview.
// Keep the authoritative draft pagination close to the input frame instead.
const FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS = 16
const WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS = 450
const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS = 48
const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS = 160
const FLOWDOC_FONT_HEADER = "X-FlowDoc-Font"
const FLOWDOC_FONT_FALLBACK_VALUE = "fallback"
const TRANSIENT_EXPORT_READINESS_REASONS = new Set([
  "server layout has not checked the current document",
  "server layout check is still running",
])

function resolveCanvasFlowTableActionScope(doc: DocumentNode, nodeId: string): CanvasFlowTableActionScope | null {
  for (const section of doc.document.sections) {
    const sectionNode = section.nodes[nodeId]
    if (sectionNode?.type === "flow-table") {
      return { type: "table", table: sectionNode as unknown as FlowTableNode, tableId: nodeId }
    }

    for (const [tableId, node] of Object.entries(section.nodes)) {
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (!inner) continue

      if (inner.type === "flow-table-row") {
        const rowIndex = table.rowIds.indexOf(nodeId)
        return rowIndex >= 0 ? { type: "row", table, tableId, rowIndex } : null
      }

      if (inner.type === "flow-table-cell") {
        const resolved = tryResolveFlowTableGrid(table)
        if (!resolved.ok) return null
        const placement = resolved.grid.placementsByCellId.get(nodeId)
        return placement
          ? { type: "cell", table, tableId, columnIndex: placement.columnIndex, columnEndIndex: placement.columnEndIndex }
          : null
      }
    }
  }
  return null
}

function resolveCanvasFlowTableActionTarget(
  doc: DocumentNode,
  nodeId: string,
  action: CanvasTableAction,
): CanvasFlowTableActionTarget | null {
  const scope = resolveCanvasFlowTableActionScope(doc, nodeId)
  if (!scope) return null

  if (action === "delete-table") {
    return scope.type === "table" ? { type: "delete-table", tableId: scope.tableId } : null
  }

  const resolved = tryResolveFlowTableGrid(scope.table)
  if (!resolved.ok) return null

  if (action === "add-row") {
    if (scope.type === "table") return { type: "add-row", tableId: scope.tableId }
    if (scope.type === "row") return { type: "add-row", tableId: scope.tableId, afterIndex: scope.rowIndex }
    return null
  }
  if (action === "delete-row") {
    if (scope.type !== "row") return null
    return canRemoveFlowTableRow(scope.table, scope.rowIndex)
      ? { type: "delete-row", tableId: scope.tableId, rowIndex: scope.rowIndex }
      : null
  }

  if (action === "add-column") {
    if (scope.type === "table") return { type: "add-column", tableId: scope.tableId }
    if (scope.type === "cell") return { type: "add-column", tableId: scope.tableId, afterIndex: scope.columnEndIndex }
    return null
  }
  if (scope.type === "cell" && canRemoveFlowTableColumn(scope.table, scope.columnIndex)) {
    return { type: "delete-column", tableId: scope.tableId, colIndex: scope.columnIndex }
  }
  return null
}

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

function firstVisibleExportReadinessReason(reasons: string[]): string | null {
  return reasons.find((reason) => !TRANSIENT_EXPORT_READINESS_REASONS.has(reason)) ?? null
}

function buildExportFeedback(
  format: EditorExportFormat,
  stage: EditorExportFeedbackStage,
  startedAt: number,
): EditorExportFeedback {
  if (stage === "preflight") {
    return {
      format,
      stage,
      startedAt,
      title: "Checking readiness",
      detail: "Checking active edit, server layout, font, and layout gates.",
      steps: [
        "Finish active edit if needed",
        "Check export readiness",
        "Confirm server layout and warning gates",
      ],
    }
  }
  if (stage === "uploading") {
    return {
      format,
      stage,
      startedAt,
      title: "Sending document",
      detail: "Sending the current FlowDoc document to the export API.",
      steps: [
        "Serialize current document",
        "POST to /api/export",
        "Wait for server processing to start",
      ],
    }
  }
  if (stage === "processing") {
    return {
      format,
      stage,
      startedAt,
      title: "Creating file",
      detail: "Server is validating, paginating, rendering, and finalizing the export.",
      steps: format === "pdf"
        ? [
          "Validate document shape",
          "Paginate with runtime fonts",
          "Assert layout and blocking warnings",
          "Render PDF page batches",
          "Finalize PDF binary",
        ]
        : [
          "Validate document shape",
          "Paginate with runtime fonts",
          "Assert layout and blocking warnings",
          "Serialize DOCX package",
          "Finalize DOCX binary",
        ],
    }
  }
  return {
    format,
    stage,
    startedAt,
    title: "Preparing download",
    detail: "The export response is ready; creating the browser download.",
    steps: [
      "Read export profile header",
      "Create download blob",
      "Trigger browser download",
    ],
  }
}

function fieldRegistryFromDocumentParseResult(result: DocumentParseResult): FieldRegistryV1 {
  return result.ok && result.package?.packageVersion === 2
    ? result.package.fields
    : SAMPLE_FIELD_REGISTRY_V1
}

function dataSnapshotFromDocumentParseResult(result: DocumentParseResult): DataSnapshotV1 {
  return result.ok && result.package?.packageVersion === 2 && result.package.data
    ? result.package.data
    : createEmptyDataSnapshot()
}

function saveToStorage(doc: DocumentNode, fields: FieldRegistryV1, data: DataSnapshotV1): void {
  saveDocumentToStorage(localStorage, doc, { fields, data })
}

function getRowFragmentHeight(paginated: PaginatedDocument, rowId: string): number | null {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragment = page.fragments.find((f) => f.nodeId === rowId && f.nodeType === "row")
      if (fragment) return fragment.height
    }
  }
  return null
}

function zoneToIntent(zone: PlacementZone): PlacementIntentType {
  switch (zone) {
    case "top":
    case "row-outer-top":
      return "insertAbove"
    case "bottom":
    case "row-outer-bottom":
      return "insertBelow"
    case "left":
      return "insertLeft"
    case "right":
      return "insertRight"
    case "center":
    case "row-stack-inner":
      return "insertInside"
  }
}

const PAGE_BREAK_INTERACTION_HEIGHT = 18

function fragmentInteractionHeightForPlacement(fragment: PageFragment): number {
  return fragment.nodeType === "page-break"
    ? PAGE_BREAK_INTERACTION_HEIGHT
    : fragment.height
}

function findSmallestFragmentAt(fragments: PageFragment[], docX: number, docY: number): PageFragment | null {
  let hit: PageFragment | null = null
  let hitArea = Infinity
  for (const fragment of fragments) {
    const height = fragmentInteractionHeightForPlacement(fragment)
    if (
      docX >= fragment.x &&
      docX <= fragment.x + fragment.width &&
      docY >= fragment.y &&
      docY <= fragment.y + height
    ) {
      const area = fragment.width * Math.max(height, 1)
      if (area < hitArea) {
        hit = fragment
        hitArea = area
      }
    }
  }
  return hit
}

function findPageBreakDropBlocker(
  fragments: PageFragment[],
  contentBox: { x: number; y: number; width: number; height: number },
  docX: number,
  docY: number,
): PageFragment | null {
  if (
    docX < contentBox.x ||
    docX > contentBox.x + contentBox.width ||
    docY < contentBox.y ||
    docY > contentBox.y + contentBox.height
  ) {
    return null
  }

  let blocker: PageFragment | null = null
  for (const fragment of fragments) {
    if (fragment.nodeType !== "page-break") continue
    if (docX < fragment.x || docX > fragment.x + fragment.width) continue

    const visualBottom = fragment.y + PAGE_BREAK_INTERACTION_HEIGHT
    if (docY < visualBottom) continue
    if (blocker == null || fragment.y > blocker.y) blocker = fragment
  }
  return blocker
}

function pageBreakBlockedPreview(fragment: PageFragment): PlacementPreview {
  return {
    hoverNodeId: fragment.nodeId,
    zone: "bottom",
    target: { kind: "node", nodeId: fragment.nodeId, nodeType: "page-break" },
    placement: null,
    isValid: false,
  }
}

function describeDragSource(source: DragSource): string {
  if (source.source === "palette") {
    if (source.tableSize) return `Table ${source.tableSize.rows} x ${source.tableSize.columns}`
    if (source.columnShares && source.columnShares.length > 1) return source.columnShares.map((share) => Math.round(share)).join(" | ")
    if (source.blockType === "paragraph") return "Paragraph"
    if (source.blockType === "divider") return "Divider"
    if (source.blockType === "page-break") return "Page break"
    if (source.blockType === "toc") return "TOC"
    if (source.blockType === "row") return "Row"
    if (source.blockType === "flow-columns" || source.blockType === "columns") return "Column"
    if (source.blockType === "flow-table") return "Table"
    return source.blockType
  }
  if (source.source === "field") return source.field.label ?? source.field.key
  if (source.source === "document-copy") return "Copy"
  return "node"
}

function isHeaderFooterSupportedDragSource(source: DragSource): boolean {
  return source.source === "palette" && (
    source.blockType === "paragraph" ||
    source.blockType === "flow-columns"
  )
}

function dragFieldTypeLabel(source: DragSource): string {
  if (source.source !== "field") return ""
  switch (source.field.fieldType) {
    case "number": return "#"
    case "date": return "D"
    case "boolean": return "?"
    case "enum": return "E"
    case "image": return "I"
    case "collection": return "[]"
    default: return "T"
  }
}

function DragGhostIcon({ source }: { source: DragSource }) {
  if (source.source === "field") {
    return <span style={dragGhostFieldIcon}>{dragFieldTypeLabel(source)}</span>
  }
  if (source.source === "document") {
    return <span style={dragGhostDocumentIcon}>N</span>
  }
  if (source.source === "document-copy") {
    return <span style={dragGhostDocumentIcon}>C</span>
  }
  if (source.blockType === "paragraph") {
    return <span style={dragGhostDocumentIcon}>¶</span>
  }
  if (source.blockType === "divider") {
    return <span style={dragGhostDocumentIcon}>-</span>
  }
  if (source.blockType === "page-break") {
    return <span style={dragGhostDocumentIcon}>PB</span>
  }
  if (source.blockType === "toc") {
    return <span style={dragGhostDocumentIcon}>TOC</span>
  }
  if (source.blockType === "flow-table") {
    return (
      <span style={dragGhostTableIcon}>
        {Array.from({ length: 9 }).map((_, index) => <span key={index} style={dragGhostTableCell} />)}
      </span>
    )
  }

  const shares = source.columnShares ?? (source.blockType === "row" ? [100] : [1])
  const isRow = source.blockType === "row"
  return (
    <span style={isRow ? dragGhostRowIcon : dragGhostColumnIcon}>
      {shares.map((share, index) => (
        <span
          key={`${share}-${index}`}
          style={{
            ...(isRow ? dragGhostRowBar : dragGhostColumnBar),
            flex: Math.max(1, share),
          }}
        />
      ))}
    </span>
  )
}

function EditorDragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null
  return (
    <div
      data-testid="editor-drag-ghost"
      aria-hidden="true"
      style={{
        ...editorDragGhostStyle,
        transform: `translate3d(${drag.clientX + 14}px, ${drag.clientY + 12}px, 0)`,
      }}
    >
      <DragGhostIcon source={drag.source} />
      <span style={editorDragGhostLabel}>{describeDragSource(drag.source)}</span>
    </div>
  )
}

function createEmptyDataSnapshot(): DataSnapshotV1 {
  return { version: 1, updatedAt: new Date().toISOString(), values: {} }
}

function setDataSnapshotValue(snapshot: DataSnapshotV1, key: string, value: FieldScalarValue): DataSnapshotV1 {
  return {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    values: {
      ...snapshot.values,
      [key]: value,
    },
  }
}

function getParagraphTextFromDoc(doc: DocumentNode, nodeId: string): string | null {
  return getEditableParagraphTextFromDocument(doc, nodeId)
}

function getParagraphFromDoc(doc: DocumentNode, nodeId: string) {
  return getEditableParagraphFromDocument(doc, nodeId)
}

function getLayoutChildIdsFromNode(node: unknown): string[] | null {
  if (!node || typeof node !== "object" || !("childIds" in node)) return null
  const childIds = (node as { childIds?: unknown }).childIds
  return Array.isArray(childIds) && childIds.every((childId) => typeof childId === "string")
    ? childIds
    : null
}

function findImmediatePageBreakSiblingAfterNode(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    for (const candidate of Object.values(section.nodes)) {
      const childIds = getLayoutChildIdsFromNode(candidate)
      if (!childIds) continue
      const index = childIds.indexOf(nodeId)
      if (index < 0) continue
      const nextNodeId = childIds[index + 1]
      if (!nextNodeId) return null
      return section.nodes[nextNodeId]?.type === "page-break" ? nextNodeId : null
    }
  }
  return null
}

function findSectionIndexForNode(doc: DocumentNode, nodeId: string | null): number {
  if (!nodeId) return 0
  for (let sectionIndex = 0; sectionIndex < doc.document.sections.length; sectionIndex += 1) {
    const section = doc.document.sections[sectionIndex]
    if (section.nodes[nodeId]) return sectionIndex
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      if ((candidate as unknown as FlowTableNode).nodes[nodeId]) return sectionIndex
    }
  }
  return 0
}

const editorDragGhostStyle: React.CSSProperties = {
  position: "fixed",
  top: -10,
  left: -45,
  zIndex: 12000,
  maxWidth: 220,
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  backgroundColor: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(37, 99, 235, 0.16)",
  color: "#1e293b",
  fontSize: 11,
  pointerEvents: "none",
  userSelect: "none",
  boxSizing: "border-box",
}

const editorDragGhostLabel: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 700,
}

const dragGhostDocumentIcon: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  border: "1px solid #93c5fd",
  borderRadius: 5,
  backgroundColor: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 800,
  flexShrink: 0,
}

const dragGhostFieldIcon: React.CSSProperties = {
  ...dragGhostDocumentIcon,
  borderColor: "#c7d2fe",
  backgroundColor: "#eef2ff",
  color: "#3730a3",
  fontSize: 10,
}

const dragGhostRowIcon: React.CSSProperties = {
  width: 28,
  height: 22,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 3,
  flexShrink: 0,
}

const dragGhostRowBar: React.CSSProperties = {
  minHeight: 5,
  borderRadius: 2,
  backgroundColor: "#64748b",
}

const dragGhostColumnIcon: React.CSSProperties = {
  width: 28,
  height: 22,
  display: "flex",
  justifyContent: "center",
  gap: 3,
  flexShrink: 0,
}

const dragGhostColumnBar: React.CSSProperties = {
  minWidth: 5,
  borderRadius: 2,
  backgroundColor: "#64748b",
}

const dragGhostTableIcon: React.CSSProperties = {
  width: 24,
  height: 22,
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 2,
  padding: 3,
  border: "1px solid #93c5fd",
  borderRadius: 4,
  backgroundColor: "#eff6ff",
  boxSizing: "border-box",
  flexShrink: 0,
}

const dragGhostTableCell: React.CSSProperties = {
  backgroundColor: "#64748b",
  borderRadius: 1,
}

const rightRailSidebarStyle = (collapsed: boolean): React.CSSProperties => ({
  width: 36,
  flexShrink: 0,
  borderRight: collapsed ? "none" : "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 5,
  padding: "8px 0 8px 3px",
  position: "relative",
  zIndex: 2,
})

const rightRailBookmarkGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
}

const rightRailBookmarkButton = (active: boolean, height = 28, fontSize = 11): React.CSSProperties => ({
  width: active ? "calc(100% + 7px)" : "100%",
  height,
  border: "none",
  borderRadius: "0 6px 6px 0",
  background: active
    ? "linear-gradient(90deg, rgba(37, 99, 235, 0.28) 0%, rgba(37, 99, 235, 0.15) 58%, rgba(255, 255, 255, 0.92) 100%)"
    : "transparent",
  boxShadow: active
    ? "inset 3px 0 0 #2563eb, 4px 0 8px rgba(15, 23, 42, 0.06), 1px 0 0 rgba(37, 99, 235, 0.08)"
    : "none",
  color: active ? "#1d4ed8" : "#64748b",
  cursor: "pointer",
  fontSize,
  fontWeight: 700,
  lineHeight: 1,
  marginRight: active ? -7 : 0,
  padding: 0,
  position: "relative",
  zIndex: active ? 3 : 1,
  textAlign: "center",
  transition: "width 120ms ease, background 120ms ease, box-shadow 120ms ease, color 120ms ease",
})

function EditorCanvasPerfProfiler({
  enabled,
  onRender,
  children,
}: {
  enabled: boolean
  onRender: ProfilerOnRenderCallback
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <Profiler id="editor-canvas" onRender={onRender}>
      {children}
    </Profiler>
  )
}

function EditorSubtreePerfProfiler({
  enabled,
  id,
  children,
}: {
  enabled: boolean
  id: string
  children: ReactNode
}) {
  const handleRender = useCallback<ProfilerOnRenderCallback>((
    profilerId,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "react:subtree-commit",
      startMs: startTime,
      durationMs: Math.max(0, actualDuration),
      detail: {
        id: profilerId,
        source: phase,
        baseDurationMs: Math.max(0, baseDuration),
        commitTime,
      },
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      componentName: id,
      source: id,
      action: phase,
      active: true,
    })
  }, [])

  if (!enabled) return <>{children}</>
  return (
    <Profiler id={id} onRender={handleRender}>
      {children}
    </Profiler>
  )
}

const StructuralPaintDeferredSubtree = memo(function StructuralPaintDeferredSubtree({
  children,
}: {
  defer: boolean
  children: ReactNode
}) {
  // Keep non-critical rails on their previous tree while the structural island gets its first paint.
  return <>{children}</>
}, (_previousProps, nextProps) => nextProps.defer)

function createBrowserPaginationWorker(): Worker | null {
  if (typeof Worker === "undefined") return null
  const startedAt = startWysiwygPerfSpan()
  try {
    const worker = new Worker(new URL("./browserPaginationWorker.ts", import.meta.url), { type: "module" })
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-create", startedAt, {
      source: "document-preview-worker",
    })
    return worker
  } catch (error) {
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-create", startedAt, {
      source: "document-preview-worker",
      failed: true,
      message: error instanceof Error ? error.message : String(error),
    })
    console.error("browser pagination worker unavailable:", error)
    return null
  }
}

type EditorPrepareOverlayStatus = "visible" | "fading" | "hidden"
let dataSnapshotCreateInvocationId = 0
let fieldRegistryCreateInvocationId = 0

function readInitialDocumentPrepareHandoff(): DocumentPrepareHandoff | null {
  if (typeof window === "undefined") return null
  return readDocumentPrepareHandoff(window.sessionStorage)
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const initialTestScenario = useMemo(() => resolveEditorTestScenarioFromLocation(), [])
  const initialPrepareHandoff = useMemo(() => readInitialDocumentPrepareHandoff(), [])
  const [documentPrepareHandoff, setDocumentPrepareHandoff] = useState<DocumentPrepareHandoff | null>(initialPrepareHandoff)
  const [documentPrepareStepId, setDocumentPrepareStepId] = useState<DocumentPrepareStepId>("editor-start-session")
  const [documentPrepareOverlayStatus, setDocumentPrepareOverlayStatus] = useState<EditorPrepareOverlayStatus>("visible")
  const [scale, setScale] = useState(0.6)
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("design")
  const [leftRailMode, setLeftRailMode] = useState<LeftRailMode>("outline")
  const [rightRailMode, setRightRailMode] = useState<RightRailMode>("page")
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false)
  const [rightRailWidth, setRightRailWidth] = useState(RIGHT_RAIL_MIN_WIDTH)
  const [rightRailResizeDrag, setRightRailResizeDrag] = useState<RightRailResizeDrag | null>(null)
  const [rightRailResizeHandleHover, setRightRailResizeHandleHover] = useState(false)
  const [state, dispatch] = useReducer(reducer, initialTestScenario?.document ?? null, createInitialEditorState)
  const [selectedStyleResource, setSelectedStyleResource] = useState<StyleManagerResourceSelection>(null)
  const selectedStyleResourceId = selectedStyleResource?.id ?? null
  const [editorTextMeasurer, setEditorTextMeasurer] = useState<TextMeasurer>(() => createBrowserTextMeasurer())
  const [editorTextMeasurerStatus, setEditorTextMeasurerStatus] = useState<EditorTextMeasurerStatus>("loading")
  const [browserPreviewLayout, setBrowserPreviewLayout] = useState(createEditorPreviewPlaceholderLayoutState)
  const [partialPreviewPaginated, setPartialPreviewPaginated] = useState<EditorPartialPreviewPaginated | null>(null)
  const [fontReadyVersion, setFontReadyVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    const startedAt = startWysiwygPerfSpan()
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:font-readiness-start",
      startMs: startedAt,
    })
    const fallbackMeasurer = createBrowserTextMeasurer()
    resolveBrowserEditorTextMeasurer(fallbackMeasurer, undefined, undefined, (event) => {
      recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        name: `pre-pagination:${event.name}`,
        startMs: event.startMs,
        durationMs: event.durationMs,
        detail: event.detail,
      })
    }).then((next) => {
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:font-readiness", startedAt, {
        status: next.status,
        cancelled,
      })
      if (cancelled) return
      setEditorTextMeasurer(next.measurer)
      setEditorTextMeasurerStatus(next.status)
      setFontReadyVersion((v) => v + 1)
    })
    return () => { cancelled = true }
  }, [])
  const [mode, setMode] = useState<"template" | "fill">("template")
  const [dataSnapshot, setDataSnapshot] = useState<DataSnapshotV1>(() => {
    const invocationId = ++dataSnapshotCreateInvocationId
    const startedAt = startWysiwygPerfSpan()
    if (initialTestScenario) {
      const snapshot = createEmptyDataSnapshot()
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:data-snapshot-create", startedAt, {
        invocationId,
        source: "test-scenario",
      })
      return snapshot
    }
    const result = loadDocumentFromStorage(localStorage)
    const snapshot = dataSnapshotFromDocumentParseResult(result)
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:data-snapshot-create", startedAt, {
      invocationId,
      source: result.ok ? result.source : result.reason,
    })
    return snapshot
  })
  const [packageFieldRegistry, setPackageFieldRegistry] = useState<FieldRegistryV1>(() => {
    const invocationId = ++fieldRegistryCreateInvocationId
    const startedAt = startWysiwygPerfSpan()
    if (initialTestScenario) {
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:field-registry-create", startedAt, {
        invocationId,
        source: "test-scenario",
        fieldCount: SAMPLE_FIELD_REGISTRY_V1.fields.length,
      })
      return SAMPLE_FIELD_REGISTRY_V1
    }
    const result = loadDocumentFromStorage(localStorage)
    const registry = fieldRegistryFromDocumentParseResult(result)
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:field-registry-create", startedAt, {
      invocationId,
      source: result.ok ? result.source : result.reason,
      fieldCount: registry.fields.length,
    })
    return registry
  })
  const isTemplateMode = mode === "template"
  const [optimisticStructuralRefocusPaint, setOptimisticStructuralRefocusPaint] = useState<OptimisticStructuralRefocusPaint | null>(null)
  const [optimisticStructuralIslandOverride, setOptimisticStructuralIslandOverride] = useState<OptimisticStructuralIslandOverride | null>(null)
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
  const [deferredStructuralPanelRelease, setDeferredStructuralPanelRelease] = useState<DeferredStructuralPanelRelease | null>(null)
  const deferredStructuralPanelReleaseRef = useRef<DeferredStructuralPanelRelease | null>(null)
  const scheduledStructuralPanelReleaseRef = useRef<ScheduledStructuralPanelRelease | null>(null)
  const structuralPanelReleaseApplyingRef = useRef<StructuralPanelReleaseApplying | null>(null)
  useLayoutEffect(() => {
    deferredStructuralPanelReleaseRef.current = deferredStructuralPanelRelease
  }, [deferredStructuralPanelRelease])
  const structuralShellRenderAttributionActive = isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED) && Boolean(
    optimisticStructuralIslandOverride || optimisticStructuralRefocusPaint,
  )
  const recordStructuralPanelReleaseEvent = useCallback((
    action: string,
    metadata: {
      generation?: number
      operation?: DeferredStructuralPanelRelease["operation"]
      nodeId?: string | null
      source?: string
      startedAt?: number
      durationMs?: number
      active?: boolean
    } = {},
  ) => {
    const startedAt = metadata.startedAt ?? startWysiwygPerfSpan()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-panel-release",
      startedAt,
      durationMs: Math.max(0, metadata.durationMs ?? 0),
      nodeId: metadata.nodeId ?? undefined,
      source: metadata.source,
      action,
      operation: metadata.operation,
      token: metadata.generation,
      active: metadata.active,
    })
  }, [])
  const cancelScheduledStructuralPanelRelease = useCallback((reason: string) => {
    const scheduled = scheduledStructuralPanelReleaseRef.current
    if (!scheduled) return false
    if (scheduled.frameId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(scheduled.frameId)
    }
    if (scheduled.timeoutId !== null) {
      window.clearTimeout(scheduled.timeoutId)
    }
    if (scheduled.idleId !== null && typeof window !== "undefined") {
      const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
      idleWindow.cancelIdleCallback?.(scheduled.idleId)
    }
    scheduledStructuralPanelReleaseRef.current = null
    cancelScheduledStructuralPanelReleaseBridge(panelDeferralRuntime, scheduled, reason)
    recordStructuralPanelReleaseEvent("release-cancelled", {
      generation: scheduled.generation,
      source: reason,
      startedAt: scheduled.scheduledAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - scheduled.scheduledAt),
      active: false,
    })
    return true
  }, [panelDeferralRuntime, recordStructuralPanelReleaseEvent])
  const beginStructuralPanelReleaseDeferral = useCallback((plan: StructuralPanelDeferralPlan) => {
    if (scheduledStructuralPanelReleaseRef.current) {
      cancelScheduledStructuralPanelRelease(`${plan.reason}:superseded-by-new-structural-transition`)
    }
    const next = beginStructuralPanelDeferralBridge(panelDeferralRuntime, plan)
    deferredStructuralPanelReleaseRef.current = next
    setDeferredStructuralPanelRelease(next)
    recordStructuralPanelReleaseEvent("defer-start", {
      generation: next.generation,
      operation: next.operation,
      nodeId: next.nodeId,
      source: next.reason,
      startedAt: next.startedAt,
      active: true,
    })
    return next.generation
  }, [cancelScheduledStructuralPanelRelease, panelDeferralRuntime, recordStructuralPanelReleaseEvent])
  const scheduleDeferredStructuralPanelRelease = useCallback((generation: number, reason: string) => {
    const current = deferredStructuralPanelReleaseRef.current
    if (!current || current.generation !== generation || !current.pending) {
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        source: reason,
        active: false,
      })
      return
    }
    if (!structuralEditRuntime.isCurrentGeneration(generation) || !panelDeferralRuntime.isCurrentGeneration(generation)) {
      canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, current)
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        source: `${reason}:stale-structural-generation`,
        active: false,
      })
      return
    }
    if (scheduledStructuralPanelReleaseRef.current) {
      cancelScheduledStructuralPanelRelease(`${reason}:reschedule`)
    }
    const scheduledAt = startWysiwygPerfSpan()
    const scheduled = createScheduledStructuralPanelRelease(current, {
      reason,
      scheduledAt,
    })
    if (!scheduleStructuralPanelReleaseBridge(panelDeferralRuntime, current, scheduledAt)) {
      recordStructuralPanelReleaseEvent("release-superseded", {
        generation,
        operation: current.operation,
        nodeId: current.nodeId,
        source: `${reason}:stale-panel-deferral`,
        startedAt: scheduledAt,
        active: false,
      })
      return
    }
    const applyRelease = () => {
      scheduledStructuralPanelReleaseRef.current = null
      const latest = deferredStructuralPanelReleaseRef.current
      if (!latest || latest.generation !== generation || !latest.pending) {
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          source: reason,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      if (!structuralEditRuntime.isCurrentGeneration(generation) || !panelDeferralRuntime.isCurrentGeneration(generation)) {
        canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, latest)
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: `${reason}:stale-structural-generation`,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      if (isStructuralPanelReleaseBlockedByUrgentFlushBridge(panelDeferralRuntime, latest)) {
        recordStructuralPanelReleaseEvent("release-delayed-urgent-paint", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: reason,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: true,
        })
        scheduleDeferredStructuralPanelRelease(generation, `${reason}:urgent-paint-still-active`)
        return
      }
      const now = startWysiwygPerfSpan()
      const inputQuietDecision = shouldDelayStructuralPanelReleaseForInputBridge(
        panelDeferralRuntime,
        latest,
        STRUCTURAL_PANEL_RELEASE_INPUT_QUIET_MS,
        now,
      )
      if (inputQuietDecision.shouldDelay && inputQuietDecision.lastInputAt !== null) {
        recordStructuralPanelReleaseEvent("release-delayed-input", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: reason,
          startedAt: inputQuietDecision.lastInputAt,
          durationMs: Math.max(0, inputQuietDecision.elapsedMs ?? 0),
          active: true,
        })
        scheduleDeferredStructuralPanelRelease(generation, `${reason}:input-quiet-window`)
        return
      }
      if (!canApplyStructuralPanelReleaseBridge(panelDeferralRuntime, latest)) {
        recordStructuralPanelReleaseEvent("release-superseded", {
          generation,
          operation: latest.operation,
          nodeId: latest.nodeId,
          source: `${reason}:stale-panel-deferral`,
          startedAt: scheduledAt,
          durationMs: Math.max(0, startWysiwygPerfSpan() - scheduledAt),
          active: false,
        })
        return
      }
      const applyStartedAt = startWysiwygPerfSpan()
      markStructuralPanelReleaseStartedBridge(panelDeferralRuntime, latest, applyStartedAt)
      structuralPanelReleaseApplyingRef.current = createStructuralPanelReleaseApplying(latest, {
        scheduledAt,
        applyStartedAt,
      })
      recordStructuralPanelReleaseEvent("release-apply-start", {
        generation,
        operation: latest.operation,
        nodeId: latest.nodeId,
        source: reason,
        startedAt: scheduledAt,
        durationMs: Math.max(0, applyStartedAt - scheduledAt),
        active: true,
      })
      startTransition(() => {
        setDeferredStructuralPanelRelease((active) => (
          active?.generation === generation ? null : active
        ))
      })
      recordStructuralPanelReleaseEvent("release-state-update-scheduled", {
        generation,
        operation: latest.operation,
        nodeId: latest.nodeId,
        source: reason,
        startedAt: applyStartedAt,
        active: true,
      })
    }
    if (typeof window !== "undefined") {
      scheduled.frameId = window.requestAnimationFrame(() => {
        scheduled.timeoutId = window.setTimeout(() => {
          scheduled.timeoutId = null
          const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
          }
          if (typeof idleWindow.requestIdleCallback === "function") {
            scheduled.idleId = idleWindow.requestIdleCallback(applyRelease, {
              timeout: STRUCTURAL_PANEL_RELEASE_IDLE_TIMEOUT_MS,
            })
            return
          }
          scheduled.timeoutId = window.setTimeout(applyRelease, 0)
        }, STRUCTURAL_PANEL_RELEASE_MIN_DELAY_MS)
      })
    } else {
      scheduled.timeoutId = setTimeout(applyRelease, 0)
    }
    scheduledStructuralPanelReleaseRef.current = scheduled
    recordStructuralPanelReleaseEvent("release-scheduled", {
      generation,
      operation: current.operation,
      nodeId: current.nodeId,
      source: reason,
      startedAt: scheduledAt,
      active: true,
    })
  }, [cancelScheduledStructuralPanelRelease, panelDeferralRuntime, recordStructuralPanelReleaseEvent, structuralEditRuntime])
  const abortStructuralEditTransactionAndPanelDeferral = useCallback((
    identity: StructuralEditTransactionIdentity,
    reason: string,
  ) => {
    structuralEditRuntime.abortTransaction(identity, reason)
    abortWysiwygDraftRuntimeSessionForStructuralTransaction(identity, reason)
    const previewSettleRequest = getCurrentPreviewSettleRequestBridge(previewSettleRuntime)
    if (matchesPreviewSettleStructuralTransaction(previewSettleRequest, identity)) {
      markPreviewSettleCancelledBridge(previewSettleRuntime, previewSettleRequest, `${reason}:abort-structural-transaction`)
    }
    const release = deferredStructuralPanelReleaseRef.current
    if (!matchesStructuralPanelReleaseTransaction(release, identity)) {
      return
    }
    const scheduled = scheduledStructuralPanelReleaseRef.current
    if (matchesScheduledStructuralPanelReleaseTransaction(scheduled, identity)) {
      cancelScheduledStructuralPanelRelease(`${reason}:abort-structural-transaction`)
    }
    deferredStructuralPanelReleaseRef.current = null
    abortStructuralPanelDeferralBridge(panelDeferralRuntime, release, reason)
    if (matchesApplyingStructuralPanelReleaseTransaction(structuralPanelReleaseApplyingRef.current, release)) {
      structuralPanelReleaseApplyingRef.current = null
    }
    setDeferredStructuralPanelRelease((active) => (
      active?.transactionId === identity.id && active.generation === identity.generation
        ? null
        : active
    ))
    recordStructuralPanelReleaseEvent("defer-aborted", {
      generation: identity.generation,
      operation: release.operation,
      nodeId: release.nodeId,
      source: reason,
      startedAt: release.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - release.startedAt),
      active: false,
    })
  }, [abortWysiwygDraftRuntimeSessionForStructuralTransaction, cancelScheduledStructuralPanelRelease, panelDeferralRuntime, previewSettleRuntime, recordStructuralPanelReleaseEvent, structuralEditRuntime])
  useEffect(() => () => {
    cancelScheduledStructuralPanelRelease("unmount")
  }, [cancelScheduledStructuralPanelRelease])
  useEffect(() => {
    if (deferredStructuralPanelRelease?.pending !== true || typeof window === "undefined") return
    const markInputDuringPanelDeferral = () => {
      const startedAt = startWysiwygPerfSpan()
      const active = deferredStructuralPanelReleaseRef.current
      if (active) {
        markStructuralPanelInputDuringDeferralBridge(panelDeferralRuntime, active, startedAt)
      }
      recordStructuralPanelReleaseEvent("input-during-defer", {
        generation: active?.generation,
        operation: active?.operation,
        nodeId: active?.nodeId,
        source: "window-input-capture",
        startedAt,
        active: true,
      })
    }
    window.addEventListener("keydown", markInputDuringPanelDeferral, true)
    window.addEventListener("beforeinput", markInputDuringPanelDeferral, true)
    return () => {
      window.removeEventListener("keydown", markInputDuringPanelDeferral, true)
      window.removeEventListener("beforeinput", markInputDuringPanelDeferral, true)
    }
  }, [deferredStructuralPanelRelease?.pending, panelDeferralRuntime, recordStructuralPanelReleaseEvent])
  const pushStructuralShellRenderAttributionEvent = (
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
  }
  const captureStructuralShellRenderValue = <T,>(
    action: string,
    compute: () => T,
    metadata: (value: T) => Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">> = () => ({}),
  ): T => {
    if (!structuralShellRenderAttributionActive) return compute()
    const startedAt = startWysiwygPerfSpan()
    const value = compute()
    pushStructuralShellRenderAttributionEvent(action, startedAt, metadata(value))
    return value
  }
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
  const selectedParagraphListContext = useMemo(() => (
    resolveParagraphListContext(state.doc, state.selectedNodeId)
  ), [state.doc, state.selectedNodeId])
  const activeOutlineListGroupId = selectedStyleResource?.kind === "list-group"
    ? selectedStyleResource.id
    : selectedParagraphListContext?.instanceId ?? null
  const [outlineSelectionState, setOutlineSelectionState] = useState(() => ({
    selectedNodeId: state.selectedNodeId,
    activeListGroupId: activeOutlineListGroupId,
  }))
  const activeSectionIndex = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:active-section-index",
      () => findSectionIndexForNode(state.doc, state.selectedNodeId),
      () => ({ renderReason: "findSectionIndexForNode" }),
    )
  ), [state.doc, state.selectedNodeId])
  useEffect(() => {
    if (optimisticStructuralIslandOverride) return
    let frameId: number | null = null
    let idleId: number | null = null
    let timeoutId: number | null = null

    const syncOutlineSelection = () => {
      setOutlineSelectionState((current) => {
        if (
          current.selectedNodeId === state.selectedNodeId &&
          current.activeListGroupId === activeOutlineListGroupId
        ) {
          return current
        }
        return {
          selectedNodeId: state.selectedNodeId,
          activeListGroupId: activeOutlineListGroupId,
        }
      })
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => {
          idleId = null
          syncOutlineSelection()
        }, { timeout: OUTLINE_SELECTION_IDLE_TIMEOUT_MS })
        return
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null
        syncOutlineSelection()
      }, OUTLINE_SELECTION_IDLE_TIMEOUT_MS)
    })

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [activeOutlineListGroupId, optimisticStructuralIslandOverride, state.selectedNodeId])
  const resolvePreviewDoc = useCallback((doc: DocumentNode) => (
    isTemplateMode
      ? doc
      : bindDocumentWithSnapshot(doc, { registry: packageFieldRegistry, snapshot: dataSnapshot }).doc
  ), [dataSnapshot, isTemplateMode, packageFieldRegistry])
  const previewDoc = useMemo(() => {
    const startedAt = startWysiwygPerfSpan()
    const nextPreviewDoc = captureStructuralShellRenderValue(
      "shell-derived:resolve-preview-doc",
      () => resolvePreviewDoc(state.doc),
      () => ({ renderReason: "resolvePreviewDoc" }),
    )
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:preview-doc-create", startedAt, {
      mode,
      documentId: nextPreviewDoc.document.id,
    })
    pushStructuralShellRenderAttributionEvent("shell-derived:preview-doc", startedAt, {
      renderReason: "previewDoc",
    })
    return nextPreviewDoc
  }, [mode, resolvePreviewDoc, state.doc])
  useEffect(() => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:editor-shell-mounted",
      startMs: startWysiwygPerfSpan(),
      detail: {
        documentId: state.doc.document.id,
      },
    })
    // The first mount marker intentionally captures only the initial shell commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dataReadiness = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:data-readiness",
      () => assessDocumentDataReadiness({
        doc: state.doc,
        registry: packageFieldRegistry,
        snapshot: dataSnapshot,
      }),
      (readiness) => ({
        renderReason: "assessDocumentDataReadiness",
        fragmentCount: readiness.issues.length,
      }),
    )
  ), [dataSnapshot, packageFieldRegistry, state.doc])
  const paginatePreviewDoc = useCallback((doc: DocumentNode) => (
    paginateDocument(resolvePreviewDoc(doc), editorTextMeasurer)
  ), [editorTextMeasurer, resolvePreviewDoc])

  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<Map<string, HTMLElement>>(new Map())
  const pageOverlayRefs = useRef<Map<string, HTMLElement>>(new Map())
  const pendingOptimisticSplitRefocusRef = useRef<PendingOptimisticSplitRefocus | null>(null)
  const pendingOptimisticMergeRefocusRef = useRef<PendingOptimisticMergeRefocus | null>(null)
  const optimisticStructuralSettleRef = useRef<(PendingOptimisticSplitRefocus & StructuralPreviewSettleSnapshot) | null>(null)
  const optimisticStructuralPreviewSettleGraceUntilRef = useRef(0)
  const pendingBoundarySafeInlineEditEndRef = useRef<DeferredInlineEditEnd | null>(null)
  const pendingDragRef = useRef<PendingDrag | null>(null)
  const deferredInlineEditStartRef = useRef<DeferredInlineEditStart | null>(null)
  const deferredInlineEditEndRef = useRef<DeferredInlineEditEnd | null>(null)
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
  const [exportFeedbackTick, setExportFeedbackTick] = useState(0)
  const [documentIoStatus, setDocumentIoStatus] = useState<{ type: "info" | "error"; message: string } | null>(null)
  const [localSaveStatus, setLocalSaveStatus] = useState<"saved" | "saving">("saved")
  const resizePreviewRef = useRef<HTMLDivElement | null>(null)
  const resizePreviewFrameRef = useRef<number | null>(null)
  const pendingResizePreviewRef = useRef<ResizeDrag | null>(null)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const [showDrift, setShowDrift] = useState(false)
  const [showPageThumbnails, setShowPageThumbnails] = useState(false)
  const [viewPageIndex, setViewPageIndex] = useState<number | null>(null)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const showDriftRef = useRef(showDrift)
  useEffect(() => { showDriftRef.current = showDrift }, [showDrift])
  useEffect(() => {
    if (!exportFeedback) return
    const intervalId = window.setInterval(() => setExportFeedbackTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [exportFeedback])
  const exportFeedbackElapsedMs = useMemo(() => (
    exportFeedback ? Date.now() - exportFeedback.startedAt : null
  ), [exportFeedback, exportFeedbackTick])
  const rightRailDisplayWidth = rightRailCollapsed
    ? RIGHT_RAIL_COLLAPSED_WIDTH
    : rightRailResizeDrag?.previewWidth ?? rightRailWidth
  const rightRailContentVisible = !rightRailCollapsed && rightRailDisplayWidth >= RIGHT_RAIL_CONTENT_HIDE_THRESHOLD
  const rightRailResizeHandleActive = rightRailResizeHandleHover || Boolean(rightRailResizeDrag)
  const openRightRailMode = useCallback((mode: RightRailMode) => {
    setRightRailResizeDrag(null)
    setRightRailCollapsed(false)
    setRightRailMode(mode)
  }, [])
  const startRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startWidth = resolveRightRailResizeStartWidth({ collapsed: rightRailCollapsed, width: rightRailWidth })
    setRightRailResizeDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      previewWidth: startWidth,
    })
  }, [rightRailCollapsed, rightRailWidth])
  const moveRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setRightRailResizeDrag((drag) => {
      if (!drag || drag.pointerId !== event.pointerId) return drag
      const rawWidth = drag.startWidth + (drag.startX - event.clientX)
      return { ...drag, previewWidth: resolveRightRailPreviewWidth(rawWidth) }
    })
  }, [])
  const finishRightRailResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setRightRailResizeDrag((drag) => {
      if (!drag || drag.pointerId !== event.pointerId) return drag
      const next = resolveRightRailResize(drag.previewWidth)
      setRightRailCollapsed(next.collapsed)
      if (!next.collapsed) setRightRailWidth(next.width)
      return null
    })
  }, [])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(state.doc)
  const packageFieldRegistryRef = useRef(packageFieldRegistry)
  const dataSnapshotRef = useRef(dataSnapshot)
  const paginatedRef = useRef(state.paginated)
  const paginatedPerfSummaryRef = useRef(summarizePaginatedForWysiwygPerf(state.paginated))
  const wasInlineEditingRef = useRef(false)
  const wysiwygDraftPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wysiwygDraftPaginationFrameRef = useRef<number | null>(null)
  const wysiwygDraftPaginationDelayRef = useRef<number | null>(null)
  const wysiwygDraftPaginationGenerationRef = useRef(0)
  const wysiwygDraftPaginationSnapshotRevisionRef = useRef(0)
  const wysiwygLatestDraftPaginationSnapshotRef = useRef<WysiwygDraftPaginationLatestSnapshot | null>(null)
  const wysiwygDraftPaginationRequestRef = useRef<DraftPreviewPaginationRequest | null>(null)

  useLayoutEffect(() => { docRef.current = state.doc }, [state.doc])
  useEffect(() => { packageFieldRegistryRef.current = packageFieldRegistry }, [packageFieldRegistry])
  useEffect(() => { dataSnapshotRef.current = dataSnapshot }, [dataSnapshot])
  useLayoutEffect(() => {
    paginatedRef.current = state.paginated
    paginatedPerfSummaryRef.current = summarizePaginatedForWysiwygPerf(state.paginated)
  }, [state.paginated])
  const displayPaginated = useMemo(() => resolveEditorDisplayPaginated({
    authoritativePaginated: state.paginated,
    partialPreviewPaginated,
    previewLayout: browserPreviewLayout,
  }), [browserPreviewLayout, partialPreviewPaginated, state.paginated])
  const currentLeftRailOutlineDoc = isTemplateMode ? state.doc : previewDoc
  const currentLeftRailStyleDoc = state.doc
  const panelDeferralSnapshotActive = panelDeferralRuntime.shouldUsePanelSnapshot()
  const panelDeferralNonInteractive = panelDeferralRuntime.isPanelNonInteractive()
  const deferLeftRailForStructuralPaint = optimisticStructuralRefocusPaint !== null ||
    optimisticStructuralIslandOverride !== null ||
    panelDeferralSnapshotActive
  const deferNonCriticalPanelsForStructuralPaint = deferLeftRailForStructuralPaint || panelDeferralNonInteractive
  const deferLeftRailDocForStructuralPaint = deferLeftRailForStructuralPaint
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
  }, [deferLeftRailForStructuralPaint, panelDeferralRuntime, recordStructuralPanelReleaseEvent, structuralEditRuntime])
  useEffect(() => {
    if (!selectedStyleResource) return
    const exists = selectedStyleResource.kind === "paragraph-style"
      ? Boolean(state.doc.document.styles?.paragraphStyles?.[selectedStyleResource.id])
      : selectedStyleResource.kind === "list-style"
        ? Boolean(state.doc.document.listStyles?.[selectedStyleResource.id])
        : Boolean(state.doc.document.listInstances?.[selectedStyleResource.id])
    if (exists) return
    setSelectedStyleResource(null)
    setRightRailMode("page")
  }, [selectedStyleResource, state.doc])

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return
    void document.fonts.ready.then(() => setFontReadyVersion((version) => version + 1))
  }, [])

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
  const editorPageNavigation = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:page-navigation",
      () => buildEditorPageNavigationIndex(displayPaginated),
      (navigation) => ({
        renderReason: "buildEditorPageNavigationIndex",
        pageCount: navigation.pageItems.length,
      }),
    )
  ), [displayPaginated])
  const editorPageItems = editorPageNavigation.pageItems
  const editorPageKeyByPageIndexRef = useRef<Map<number, string>>(editorPageNavigation.pageKeyByPageIndex)
  useEffect(() => { editorPageKeyByPageIndexRef.current = editorPageNavigation.pageKeyByPageIndex }, [editorPageNavigation])
  const selectedContextItems = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:selection-context",
      () => (
        isTemplateMode
          ? buildSelectionContext(state.doc, state.selectionAnchorNodeId ?? state.selectedNodeId)
          : []
      ),
      (items) => ({
        renderReason: "buildSelectionContext",
        fragmentCount: items.length,
      }),
    )
  ), [isTemplateMode, state.doc, state.selectedNodeId, state.selectionAnchorNodeId])
  const selectedContextLabel = !isTemplateMode
    ? "Fill data"
    : selectedContextItems.length > 0
      ? selectedContextItems[selectedContextItems.length - 1].label
      : "Canvas"
  const selectedPageIndex = useMemo(() => (
    findFirstPageIndexForNodeInIndex(editorPageNavigation, state.selectionAnchorNodeId ?? state.selectedNodeId)
  ), [editorPageNavigation, state.selectedNodeId, state.selectionAnchorNodeId])
  const editorPageCount = editorPageItems.length
  const firstPageIndex = editorPageItems[0]?.pageIndex ?? 0
  const currentCanvasPageIndex = inlineEditPageIndex ?? viewPageIndex ?? selectedPageIndex ?? firstPageIndex
  const canvasSectionLabel = `Section ${activeSectionIndex + 1}`
  const localSaveStatusLabel = initialTestScenario
    ? "Test doc"
    : localSaveStatus === "saving"
      ? "Saving"
      : "Saved"
  const localSaveStatusTone = localSaveStatus === "saved" ? "success" : "neutral"
  const jumpToEditorPage = useCallback((page: EditorPageNavItem) => {
    setViewPageIndex(page.pageIndex)
    scrollElementIntoStartView(pageRefs.current.get(page.key))
  }, [])

  useEffect(() => {
    const nextPageIndex = inlineEditPageIndex ?? selectedPageIndex
    if (nextPageIndex !== null) setViewPageIndex(nextPageIndex)
  }, [inlineEditPageIndex, selectedPageIndex])

  useEffect(() => {
    if (editorPageItems.length === 0) {
      if (viewPageIndex !== null) setViewPageIndex(null)
      return
    }
    if (viewPageIndex !== null && !editorPageItems.some((page) => page.pageIndex === viewPageIndex)) {
      setViewPageIndex(findNearestPageIndexInItems(editorPageItems, viewPageIndex))
    }
  }, [editorPageItems, viewPageIndex])

  const requestInlineEditPageFollow = useCallback((pageIndex: number) => {
    const pageKey = editorPageKeyByPageIndexRef.current.get(pageIndex) ?? null
    if (!pageKey) return
    const scrollPage = () => {
      scrollElementIntoNearestView(pageRefs.current.get(pageKey))
    }
    if (typeof requestAnimationFrame === "undefined") {
      scrollPage()
      return
    }
    requestAnimationFrame(scrollPage)
  }, [])

  const {
    state: plainWysiwygTextSessionState,
    start: startPlainWysiwygTextSession,
    startFromText: startPlainWysiwygTextSessionFromText,
    changeDraft: changePlainWysiwygTextDraft,
    moveCaret: movePlainWysiwygTextCaret,
    end: endPlainWysiwygTextSession,
  } = useWysiwygTextSession({
    enabled: WYSIWYG_TEXT_ENGINE_ENABLED,
    getParagraphText: (nodeId) => getParagraphTextFromDoc(docRef.current, nodeId),
  })

  const {
    state: richWysiwygDraftSessionState,
    start: startRichWysiwygDraftSession,
    changeDraft: changeRichWysiwygDraft,
    moveCaret: moveRichWysiwygDraftCaret,
    applyStyleCommand: applyRichWysiwygDraftStyleCommand,
    end: endRichWysiwygDraftSession,
  } = useWysiwygRichTextDraftSession({
    enabled: WYSIWYG_TEXT_ENGINE_ENABLED && WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
    getParagraph: (nodeId) => getParagraphFromDoc(docRef.current, nodeId),
  })

  const richWysiwygTextSessionProjection = useMemo(
    () => projectRichTextDraftSessionToWysiwygTextSession(richWysiwygDraftSessionState),
    [richWysiwygDraftSessionState],
  )
  const wysiwygTextSessionState = WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygTextSessionProjection.nodeId
    ? richWysiwygTextSessionProjection
    : plainWysiwygTextSessionState
  const beginWysiwygDraftRuntimeSession = useCallback((input: {
    nodeId: string
    mode: WysiwygDraftSession["mode"]
    source: WysiwygDraftSessionSource
    initialTextLength?: number
    caretIndex?: number | null
    selection?: WysiwygTextSelection | null
    textVersion?: number
    structuralTransactionId?: string | null
    structuralGeneration?: number | null
  }): WysiwygDraftSession => {
    return beginTrackedWysiwygDraftRuntimeSessionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      {
        ...input,
        timestamp: startWysiwygPerfSpan(),
      },
    )
  }, [wysiwygDraftRuntime])
  const cancelCurrentWysiwygDraftRuntimeSession = useCallback((reason: string) => {
    cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      reason,
      startWysiwygPerfSpan(),
    )
  }, [wysiwygDraftRuntime])
  const startWysiwygTextSession = useCallback((nodeId: string, caretOffset: number | null = null, pageIndex: number | null = null) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
      const started = startRichWysiwygDraftSession(nodeId, caretOffset, pageIndex)
      if (started) {
        endPlainWysiwygTextSession()
        beginWysiwygDraftRuntimeSession({
          nodeId,
          mode: "rich-text",
          source: "flowdoc-draft-island",
          initialTextLength: getParagraphTextFromDoc(docRef.current, nodeId)?.length,
          caretIndex: caretOffset,
        })
      }
      return started
    }
    const started = startPlainWysiwygTextSession(nodeId, caretOffset, pageIndex)
    if (started) {
      endRichWysiwygDraftSession()
      beginWysiwygDraftRuntimeSession({
        nodeId,
        mode: "plain-text",
        source: "flowdoc-draft-island",
        initialTextLength: getParagraphTextFromDoc(docRef.current, nodeId)?.length,
        caretIndex: caretOffset,
      })
    }
    return started
  }, [
    beginWysiwygDraftRuntimeSession,
    endPlainWysiwygTextSession,
    endRichWysiwygDraftSession,
    startPlainWysiwygTextSession,
    startRichWysiwygDraftSession,
  ])
  const changeWysiwygTextDraft = useCallback((change: Parameters<typeof changePlainWysiwygTextDraft>[0]) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionState.nodeId) {
      changeRichWysiwygDraft(change)
      return
    }
    changePlainWysiwygTextDraft(change)
  }, [
    changePlainWysiwygTextDraft,
    changeRichWysiwygDraft,
    richWysiwygDraftSessionState.nodeId,
  ])
  const moveWysiwygTextCaret = useCallback((caretOffset: number | null, selection?: Parameters<typeof movePlainWysiwygTextCaret>[1]) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionState.nodeId) {
      moveRichWysiwygDraftCaret(caretOffset, selection)
      return
    }
    movePlainWysiwygTextCaret(caretOffset, selection)
  }, [
    movePlainWysiwygTextCaret,
    moveRichWysiwygDraftCaret,
    richWysiwygDraftSessionState.nodeId,
  ])
  const endWysiwygTextSession = useCallback(() => {
    cancelCurrentWysiwygDraftRuntimeSession("end-wysiwyg-text-session")
    endPlainWysiwygTextSession()
    endRichWysiwygDraftSession()
  }, [cancelCurrentWysiwygDraftRuntimeSession, endPlainWysiwygTextSession, endRichWysiwygDraftSession])

  const wysiwygTextAccessibilityStatus = useMemo(
    () => describeWysiwygTextSessionAccessibility(wysiwygTextSessionState),
    [wysiwygTextSessionState],
  )
  const wysiwygTextSessionStateRef = useRef(wysiwygTextSessionState)
  const richWysiwygDraftSessionStateRef = useRef(richWysiwygDraftSessionState)
  const [wysiwygPerfTraceActive] = useState(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ))
  useEffect(() => {
    if (!wysiwygPerfTraceActive) return
    window.__flowDocEditorSmokeState = {
      document: state.doc,
      selectedNodeId: state.selectedNodeId,
      selectionAnchorNodeId: state.selectionAnchorNodeId,
      lastSplitNodeId: state.lastSplitNodeId,
      mergeResult: state.mergeResult,
      updatedAt: performance.now(),
    }
    return () => {
      delete window.__flowDocEditorSmokeState
    }
  }, [
    wysiwygPerfTraceActive,
    state.doc,
    state.selectedNodeId,
    state.selectionAnchorNodeId,
    state.lastSplitNodeId,
    state.mergeResult,
  ])
  const richTextToolbarSelectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const richTextToolbarLiveSelection = useMemo(
    () => resolveRichTextToolbarSelectionSnapshot(
      wysiwygTextSessionState.nodeId,
      wysiwygTextSessionState.selection,
    ),
    [wysiwygTextSessionState.nodeId, wysiwygTextSessionState.selection],
  )
  const [richTextToolbarSelection, setRichTextToolbarSelection] = useState<RichTextToolbarSelectionSnapshot | null>(richTextToolbarLiveSelection)
  const [wysiwygDraftPaginationNodeId, setWysiwygDraftPaginationNodeIdState] = useState<string | null>(null)
  const wysiwygDraftPaginationNodeIdRef = useRef<string | null>(null)
  const wysiwygPlainTextBoundaryDraftPaginationNodeIdRef = useRef<string | null>(null)
  const inlineEditHeightPreviewLastDispatchRef = useRef<{ key: string; height: number } | null>(null)
  const setWysiwygDraftPaginationNodeId = useCallback((nodeId: string | null) => {
    const previousNodeId = wysiwygDraftPaginationNodeIdRef.current
    wysiwygDraftPaginationNodeIdRef.current = nodeId
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "draft-pagination-state",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId: nodeId ?? previousNodeId ?? undefined,
      previousNodeId,
      active: nodeId !== null,
      source: previousNodeId === nodeId ? "unchanged" : nodeId ? "set-active" : "clear",
    })
    setWysiwygDraftPaginationNodeIdState(nodeId)
  }, [])
  useEffect(() => { wysiwygTextSessionStateRef.current = wysiwygTextSessionState }, [wysiwygTextSessionState])
  useEffect(() => {
    inlineEditHeightPreviewLastDispatchRef.current = null
    wysiwygPlainTextBoundaryDraftPaginationNodeIdRef.current = null
  }, [wysiwygTextSessionState.nodeId])
  useEffect(() => { richWysiwygDraftSessionStateRef.current = richWysiwygDraftSessionState }, [richWysiwygDraftSessionState])
  useEffect(() => {
    if (richTextToolbarSelectionDebounceRef.current) {
      clearTimeout(richTextToolbarSelectionDebounceRef.current)
      richTextToolbarSelectionDebounceRef.current = null
    }

    const applySelection = () => {
      setRichTextToolbarSelection((current) => (
        areRichTextToolbarSelectionsEqual(current, richTextToolbarLiveSelection)
          ? current
          : richTextToolbarLiveSelection
      ))
    }

    if (!shouldDebounceRichTextToolbarSelection(richTextToolbarLiveSelection)) {
      applySelection()
      return
    }

    richTextToolbarSelectionDebounceRef.current = setTimeout(() => {
      richTextToolbarSelectionDebounceRef.current = null
      applySelection()
    }, RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS)

    return () => {
      if (richTextToolbarSelectionDebounceRef.current) {
        clearTimeout(richTextToolbarSelectionDebounceRef.current)
        richTextToolbarSelectionDebounceRef.current = null
      }
    }
  }, [richTextToolbarLiveSelection])
  useEffect(() => () => {
    if (richTextToolbarSelectionDebounceRef.current) {
      clearTimeout(richTextToolbarSelectionDebounceRef.current)
      richTextToolbarSelectionDebounceRef.current = null
    }
  }, [])
  const handleEditorCanvasProfilerRender = useCallback<ProfilerOnRenderCallback>((
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const session = wysiwygTextSessionStateRef.current
    const selection = session.selection
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "editor-canvas-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      source: phase,
      ...(session.nodeId ? {
        nodeId: session.nodeId,
        draftVersion: session.dirtyVersion,
        textLength: session.draftText.length,
      } : {}),
      ...(selection ? {
        selectionCollapsed: selection.anchorOffset === selection.focusOffset,
        selectionRangeLength: Math.abs(selection.focusOffset - selection.anchorOffset),
      } : {}),
      ...paginatedPerfSummaryRef.current,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-render-attribution",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      componentName: "EditorCanvas",
      source: "EditorCanvas",
      action: phase,
      active: true,
      ...paginatedPerfSummaryRef.current,
    })
  }, [])

  const getPersistableDocumentSnapshot = useCallback(() => {
    try {
      if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
        const richSession = richWysiwygDraftSessionStateRef.current
        if (richSession.nodeId && richSession.draft) {
          return replaceEditableParagraphInDocument(docRef.current, richSession.nodeId, richSession.draft.paragraph)
        }
      }
      return resolvePersistableWysiwygDocument(
        docRef.current,
        wysiwygTextSessionStateRef.current,
        WYSIWYG_TEXT_ENGINE_ENABLED,
      )
    } catch (error) {
      console.error("WYSIWYG draft persistence produced invalid document:", error)
      return docRef.current
    }
  }, [])

  const recordPreviewSettleShellMutationPlan = useCallback((
    plan: DraftPreviewShellMutationPlan | BrowserPreviewShellMutationPlan,
    detail: Record<string, unknown> = {},
  ) => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "preview-settle:shell-mutation-plan",
      startMs: startWysiwygPerfSpan(),
      detail: {
        ...summarizePreviewSettleShellMutationPlan(plan),
        ...detail,
      },
    })
  }, [])

  const clearWysiwygDraftPagination = useCallback(() => {
    if (wysiwygDraftPaginationDebounceRef.current) clearTimeout(wysiwygDraftPaginationDebounceRef.current)
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
    }
    wysiwygDraftPaginationDebounceRef.current = null
    wysiwygDraftPaginationFrameRef.current = null
    wysiwygDraftPaginationDelayRef.current = null
    wysiwygDraftPaginationRequestRef.current = null
    wysiwygLatestDraftPaginationSnapshotRef.current = null
    wysiwygDraftPaginationGenerationRef.current = resolveDraftPreviewPaginationClearedGeneration(
      wysiwygDraftPaginationGenerationRef.current,
    )
    setWysiwygDraftPaginationNodeId(null)
  }, [setWysiwygDraftPaginationNodeId])
  useEffect(() => () => {
    if (wysiwygDraftPaginationDebounceRef.current) clearTimeout(wysiwygDraftPaginationDebounceRef.current)
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
    }
    wysiwygDraftPaginationFrameRef.current = null
    wysiwygDraftPaginationDelayRef.current = null
    wysiwygDraftPaginationRequestRef.current = null
    wysiwygLatestDraftPaginationSnapshotRef.current = null
  }, [])

  const scheduleWysiwygDraftPagination = useCallback((nodeId: string, debounceMs = WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS) => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now()
    const schedulePlan = createDraftPreviewPaginationSchedulePlan({
      nodeId,
      requestedDelayMs: debounceMs,
      pendingRequest: wysiwygDraftPaginationRequestRef.current,
      latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      session: wysiwygTextSessionStateRef.current,
      nowMs,
      currentGeneration: wysiwygDraftPaginationGenerationRef.current,
      responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      quietWindowMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS,
      maxLagMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS,
      canUseAnimationFrame: typeof requestAnimationFrame !== "undefined",
    })

    wysiwygDraftPaginationRequestRef.current = schedulePlan.request
    wysiwygDraftPaginationDelayRef.current = schedulePlan.scheduledDelayMs
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "draft-pagination-schedule",
      startedAt: nowMs,
      durationMs: 0,
      nodeId,
      draftVersion: schedulePlan.draftVersion,
      requestedDelayMs: schedulePlan.requestedDelayMs,
      scheduledDelayMs: schedulePlan.scheduledDelayMs,
      firstRequestedAtMs: schedulePlan.firstRequestedAtMs,
      source: schedulePlan.source,
    })

    const runDraftPagination = (generation: number) => {
      const activeRequest = wysiwygDraftPaginationRequestRef.current
      if (!shouldRunDraftPreviewPagination({
        scheduledGeneration: generation,
        currentGeneration: wysiwygDraftPaginationGenerationRef.current,
        hasActiveRequest: activeRequest !== null,
      }) || !activeRequest) return
      const activeScheduledDelayMs = wysiwygDraftPaginationDelayRef.current
      wysiwygDraftPaginationDebounceRef.current = null
      wysiwygDraftPaginationFrameRef.current = null
      wysiwygDraftPaginationDelayRef.current = null
      wysiwygDraftPaginationRequestRef.current = null
      const activeNodeId = activeRequest.nodeId
      const session = wysiwygTextSessionStateRef.current
      const source = resolveWysiwygDraftPaginationSource({
        nodeId: activeNodeId,
        session,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      if (!source) return
      const richDraftActive = WYSIWYG_RICH_TEXT_DRAFT_ENABLED &&
        richWysiwygDraftSessionStateRef.current.nodeId === activeNodeId
      const draftDoc = buildWysiwygTextDraftPreviewDocument({
        doc: docRef.current,
        nodeId: activeNodeId,
        draftText: source.draftText,
        draftParagraph: richDraftActive
          ? richWysiwygDraftSessionStateRef.current.draft?.paragraph ?? null
          : null,
      })
      try {
        assertDocument(draftDoc)
      } catch (error) {
        console.error("WYSIWYG draft pagination produced invalid document:", error)
        return
      }
      const startedAt = startWysiwygPerfSpan()
      const paginated = paginatePreviewDoc(draftDoc)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
        nodeId: activeNodeId,
        draftVersion: source.revision,
        requestedDelayMs: activeRequest.requestedDelayMs,
        scheduledDelayMs: activeScheduledDelayMs ?? undefined,
        source: "wysiwyg-draft",
        richDraft: richDraftActive,
        ...summarizePaginatedForWysiwygPerf(paginated),
      })
      const nextSource = resolveWysiwygDraftPaginationSource({
        nodeId: activeNodeId,
        session: wysiwygTextSessionStateRef.current,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      const applyPlan = createDraftPreviewPaginationApplyPlan({
        nodeId: activeNodeId,
        requestedDelayMs: activeRequest.requestedDelayMs,
        scheduledGeneration: generation,
        currentGeneration: wysiwygDraftPaginationGenerationRef.current,
        sourceRevision: source.revision,
        nextSourceRevision: nextSource?.revision ?? null,
      })
      if (applyPlan.action !== "apply") {
        const shellMutationPlan = createDraftPreviewShellMutationPlan({
          applyPlan,
          nextPageIndex: null,
          previousInlineEditPageIndex: inlineEditPageIndexRef.current,
          isInlineEditVisualLocked: inlineEditVisualLockedRef.current,
          draftPaginationNodeId: null,
          markInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
        })
        recordPreviewSettleShellMutationPlan(shellMutationPlan, {
          source: "wysiwyg-draft",
          token: generation,
        })
        applyDraftPreviewShellMutation({
          plan: shellMutationPlan,
          optimisticLayout: { doc: draftDoc, paginated },
          paginated,
          fallbackInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
          scheduleDraftPagination: scheduleWysiwygDraftPagination,
          writePaginatedRef: (nextPaginated) => {
            paginatedRef.current = nextPaginated
          },
          writeOptimisticLayout: (layout) => {
            optimisticLayoutRef.current = layout
          },
          relocateInlineEditPage: (pageIndex) => {
            inlineEditPageIndexRef.current = pageIndex
            setInlineEditPageIndex(pageIndex)
          },
          followInlineEditPage: requestInlineEditPageFollow,
          setDraftPaginationNodeId: setWysiwygDraftPaginationNodeId,
          dispatchSetPaginated: (nextPaginated) => dispatch({ type: "SET_PAGINATED", paginated: nextPaginated }),
          markInlineEditVisualFresh,
        })
        return
      }
      const ranges = getWysiwygParagraphFragmentRanges(paginated, activeNodeId)
      const isTableCellParagraph = isParagraphInsideTableCell(draftDoc, activeNodeId)
      const nextPageIndex = source.caretOffset == null
        ? null
        : findWysiwygPageIndexInFragmentRanges(ranges, source.caretOffset, {
          preferPreviousPageAtFragmentEnd: isTableCellParagraph,
        })
      const currentFragmentCount = countWysiwygTextDraftFragments(paginated, activeNodeId)
      const draftPaginationNodeId = resolveDraftPreviewPaginationResponsiveNodeId({
        nodeId: activeNodeId,
        isFlowStackParagraph: isParagraphInsideFlowStack(draftDoc, activeNodeId),
        isTableCellParagraph,
        draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === activeNodeId,
        currentFragmentCount,
      })
      const shellMutationPlan = createDraftPreviewShellMutationPlan({
        applyPlan,
        nextPageIndex,
        previousInlineEditPageIndex: inlineEditPageIndexRef.current,
        isInlineEditVisualLocked: inlineEditVisualLockedRef.current,
        draftPaginationNodeId,
        markInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
      })
      recordPreviewSettleShellMutationPlan(shellMutationPlan, {
        source: "wysiwyg-draft",
        token: generation,
      })
      if (shellMutationPlan.action !== "apply") return
      applyDraftPreviewShellMutation({
        plan: shellMutationPlan,
        optimisticLayout: { doc: draftDoc, paginated },
        paginated,
        fallbackInlineEditVisualFreshVersion: inlineEditDraftVersionRef.current,
        scheduleDraftPagination: scheduleWysiwygDraftPagination,
        writePaginatedRef: (nextPaginated) => {
          paginatedRef.current = nextPaginated
        },
        writeOptimisticLayout: (layout) => {
          optimisticLayoutRef.current = layout
        },
        relocateInlineEditPage: (pageIndex) => {
          inlineEditPageIndexRef.current = pageIndex
          setInlineEditPageIndex(pageIndex)
        },
        followInlineEditPage: requestInlineEditPageFollow,
        setDraftPaginationNodeId: setWysiwygDraftPaginationNodeId,
        dispatchSetPaginated: (nextPaginated) => dispatch({ type: "SET_PAGINATED", paginated: nextPaginated }),
        markInlineEditVisualFresh,
      })
    }

    if (wysiwygDraftPaginationDebounceRef.current) {
      clearTimeout(wysiwygDraftPaginationDebounceRef.current)
      wysiwygDraftPaginationDebounceRef.current = null
    }
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
      wysiwygDraftPaginationFrameRef.current = null
    }

    const generation = schedulePlan.generation
    wysiwygDraftPaginationGenerationRef.current = generation
    if (schedulePlan.useAnimationFrame) {
      wysiwygDraftPaginationFrameRef.current = requestAnimationFrame(() => runDraftPagination(generation))
      return
    }

    wysiwygDraftPaginationDebounceRef.current = setTimeout(() => runDraftPagination(generation), schedulePlan.scheduledDelayMs)
  }, [
    inlineEditDraftVersionRef,
    markInlineEditVisualFresh,
    paginatePreviewDoc,
    recordPreviewSettleShellMutationPlan,
    requestInlineEditPageFollow,
    setInlineEditPageIndex,
    setWysiwygDraftPaginationNodeId,
  ])

  const scheduleRichTextDraftStylePagination = useCallback((nodeId: string) => {
    wysiwygLatestDraftPaginationSnapshotRef.current = null
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    setWysiwygDraftPaginationNodeId(nodeId)
    scheduleWysiwygDraftPagination(nodeId, resolveDraftPreviewPaginationDelayMsBridge({
      draftPaginationActive: true,
      isFlowStackParagraph,
      isTableCellParagraph,
      defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
      flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
    }))
  }, [
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
  ])

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

  const finalizeWysiwygTextSessionBeforeAction = useCallback((mode: WysiwygFinalizeMode = "settled-preview"): boolean => {
    const useResponsivePreview = mode === "responsive-preview"
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
      const richSession = richWysiwygDraftSessionState
      if (WYSIWYG_TEXT_ENGINE_ENABLED && richSession.nodeId && richSession.draft) {
        const richDraft = richSession.draft
        const draftRuntimeSession = getCurrentWysiwygDraftRuntimeSession(richSession.nodeId)
        const draftRuntimeIdentity = createWysiwygDraftRuntimeSessionIdentity(draftRuntimeSession)
        const finalizeStartedAt = startWysiwygPerfSpan()
        const afterDoc = replaceEditableParagraphInDocument(docRef.current, richSession.nodeId, richDraft.paragraph)
        try {
          assertDocument(afterDoc)
        } catch (error) {
          console.error("WYSIWYG rich text finalize produced invalid document:", error)
          return false
        }
        if (draftRuntimeIdentity) {
          markTrackedWysiwygDraftRuntimeSessionCommittingBridge(
            wysiwygDraftRuntime,
            draftRuntimeIdentity,
            startWysiwygPerfSpan(),
          )
        }
        const draftText = getTextRunParagraphText(richDraft.paragraph) ?? ""
        const responsivePreviewMatchesDraft = useResponsivePreview &&
          optimisticLayoutRef.current?.doc &&
          getParagraphTextFromDoc(optimisticLayoutRef.current.doc, richSession.nodeId) === draftText
        const afterPaginated = responsivePreviewMatchesDraft ? paginatedRef.current : paginatePreviewDoc(afterDoc)
        const history = consumeInlineEditHistory(richSession.nodeId)
        docRef.current = afterDoc
        paginatedRef.current = afterPaginated
        if (responsivePreviewMatchesDraft) suppressNextLayoutLoadingOverlayRef.current = true
        dispatch({
          type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT",
          nodeId: richSession.nodeId,
          paragraph: richDraft.paragraph,
          history,
          afterPaginated,
        })
        if (draftRuntimeIdentity) {
          markTrackedWysiwygDraftRuntimeSessionCommittedBridge(
            wysiwygDraftRuntime,
            wysiwygDraftSessionIdentityRef,
            draftRuntimeIdentity,
            startWysiwygPerfSpan(),
          )
        }
        clearWysiwygDraftPagination()
        endWysiwygTextSession()
        resetInlineEditStateForDocumentReplace()
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-finalize", finalizeStartedAt, {
          nodeId: richSession.nodeId,
          textLength: draftText.length,
          source: responsivePreviewMatchesDraft ? mode : "settled-preview",
          richDraft: true,
          ...summarizePaginatedForWysiwygPerf(afterPaginated),
        })
        return true
      }
    }
    const session = wysiwygTextSessionStateRef.current
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || !session.nodeId) return false
    const draftRuntimeSession = getCurrentWysiwygDraftRuntimeSession(session.nodeId)
    const draftRuntimeIdentity = createWysiwygDraftRuntimeSessionIdentity(draftRuntimeSession)
    const finalizeStartedAt = startWysiwygPerfSpan()
    const draftSource = resolveWysiwygDraftPaginationSource({
      nodeId: session.nodeId,
      session,
      latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
    })
    if (!draftSource) return false
    const draftText = draftSource.draftText
    const afterDoc = replaceEditableParagraphTextInDocument(docRef.current, session.nodeId, draftText)
    try {
      assertDocument(afterDoc)
    } catch (error) {
      console.error("WYSIWYG text finalize produced invalid document:", error)
      return false
    }
    if (draftRuntimeIdentity) {
      markTrackedWysiwygDraftRuntimeSessionCommittingBridge(
        wysiwygDraftRuntime,
        draftRuntimeIdentity,
        startWysiwygPerfSpan(),
      )
    }
    const responsivePreviewMatchesDraft = useResponsivePreview &&
      optimisticLayoutRef.current?.doc &&
      getParagraphTextFromDoc(optimisticLayoutRef.current.doc, session.nodeId) === draftText
    const afterPaginated = responsivePreviewMatchesDraft ? paginatedRef.current : paginatePreviewDoc(afterDoc)
    const history = consumeInlineEditHistory(session.nodeId)
    docRef.current = afterDoc
    paginatedRef.current = afterPaginated
    if (responsivePreviewMatchesDraft) suppressNextLayoutLoadingOverlayRef.current = true
    dispatch({
      type: "COMMIT_WYSIWYG_TEXT_EDIT",
      nodeId: session.nodeId,
      text: draftText,
      beforeText: session.baseText,
      history,
      afterPaginated,
    })
    if (draftRuntimeIdentity) {
      markTrackedWysiwygDraftRuntimeSessionCommittedBridge(
        wysiwygDraftRuntime,
        wysiwygDraftSessionIdentityRef,
        draftRuntimeIdentity,
        startWysiwygPerfSpan(),
      )
    }
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    resetInlineEditStateForDocumentReplace()
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-finalize", finalizeStartedAt, {
      nodeId: session.nodeId,
      textLength: draftText.length,
      source: responsivePreviewMatchesDraft ? mode : "settled-preview",
      draftVersion: draftSource.revision,
      ...summarizePaginatedForWysiwygPerf(afterPaginated),
    })
    return true
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    endWysiwygTextSession,
    getCurrentWysiwygDraftRuntimeSession,
    paginatePreviewDoc,
    resetInlineEditStateForDocumentReplace,
    richWysiwygDraftSessionState,
    wysiwygDraftRuntime,
    wysiwygTextSessionState,
  ])

  const finalizeInlineEditBeforeAction = useCallback((mode: WysiwygFinalizeMode = "settled-preview"): boolean => {
    if (finalizeWysiwygTextSessionBeforeAction(mode)) return true
    return finalizeLegacyInlineEditBeforeAction()
  }, [finalizeLegacyInlineEditBeforeAction, finalizeWysiwygTextSessionBeforeAction])
  const finalizeInlineEditBeforeResponsiveAction = useCallback((): boolean => (
    finalizeInlineEditBeforeAction("responsive-preview")
  ), [finalizeInlineEditBeforeAction])
  const finalizeInlineEditBeforeActionRef = useRef(finalizeInlineEditBeforeAction)
  useEffect(() => {
    finalizeInlineEditBeforeActionRef.current = finalizeInlineEditBeforeAction
  }, [finalizeInlineEditBeforeAction])

  const handleInlineEditStart = useCallback((nodeId: string, caretIndex: number | null = null, pageIndex: number | null = null, finalizeMode: WysiwygFinalizeMode = "settled-preview") => {
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionState.nodeId && wysiwygTextSessionState.nodeId !== nodeId) {
      finalizeInlineEditBeforeAction(finalizeMode)
    }
    startInlineEditSession(nodeId, caretIndex, pageIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    if (!isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: paginatedRef.current,
      nodeId,
      pageIndex,
    })) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    if (wysiwygTextSessionState.nodeId === nodeId) {
      moveWysiwygTextCaret(caretIndex)
      return
    }
    startWysiwygTextSession(nodeId, caretIndex, pageIndex)
  }, [
    clearWysiwygDraftPagination,
    endWysiwygTextSession,
    finalizeInlineEditBeforeAction,
    moveWysiwygTextCaret,
    startInlineEditSession,
    startWysiwygTextSession,
    wysiwygTextSessionState.nodeId,
  ])

  const cancelDeferredInlineEditStart = useCallback(() => {
    const pending = deferredInlineEditStartRef.current
    if (!pending) return
    if (pending.frameId !== null) window.cancelAnimationFrame(pending.frameId)
    if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)
    deferredInlineEditStartRef.current = null
  }, [])

  useEffect(() => () => cancelDeferredInlineEditStart(), [cancelDeferredInlineEditStart])

  const cancelDeferredInlineEditEnd = useCallback(() => {
    const pending = deferredInlineEditEndRef.current
    if (!pending) return
    if (pending.frameId !== null) window.cancelAnimationFrame(pending.frameId)
    if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)
    deferredInlineEditEndRef.current = null
  }, [])

  useEffect(() => () => cancelDeferredInlineEditEnd(), [cancelDeferredInlineEditEnd])

  const scheduleInlineEditStartAfterSelectionPaint = useCallback((clickAction: PendingClickAction) => {
    cancelDeferredInlineEditStart()

    const runAfterPaint = () => {
      const timeoutId = window.setTimeout(() => {
        const pending = deferredInlineEditStartRef.current
        if (!pending || pending.timeoutId !== timeoutId) return
        deferredInlineEditStartRef.current = null

        const startedAt = startWysiwygPerfSpan()
        handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex, "responsive-preview")
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-start", startedAt, {
          nodeId: clickAction.nodeId,
          pageIndex: clickAction.pageIndex,
          pageCount: editorPageCount,
          source: "canvas-click-deferred",
        })
      }, 0)
      deferredInlineEditStartRef.current = { frameId: null, timeoutId }
    }

    if (typeof window.requestAnimationFrame !== "function") {
      runAfterPaint()
      return
    }

    const frameId = window.requestAnimationFrame(runAfterPaint)
    deferredInlineEditStartRef.current = { frameId, timeoutId: null }
  }, [
    cancelDeferredInlineEditStart,
    editorPageCount,
    handleInlineEditStart,
  ])

  const canStartInlineEditImmediatelyForClick = useCallback((clickAction: PendingClickAction): boolean => {
    if (!isTemplateMode || !WYSIWYG_TEXT_ENGINE_ENABLED) return false
    if (clickAction.selectNodeId && clickAction.selectNodeId !== clickAction.nodeId) return false
    const fragment = findWysiwygTextEngineFragment(paginatedRef.current, clickAction.nodeId, clickAction.pageIndex)
    if (!fragment) return false
    if (fragment.continuesFrom === true || fragment.isContinued === true) return false
    const doc = docRef.current
    if (isParagraphInsideTableCell(doc, clickAction.nodeId, fragment.parentNodeId)) return false
    if (isParagraphInsideFlowStack(doc, clickAction.nodeId, fragment.parentNodeId)) return false
    if (isParagraphInsideRowStack(doc, clickAction.nodeId)) return false
    return isWysiwygTextEngineFragmentEligible({
      doc,
      paginated: paginatedRef.current,
      nodeId: clickAction.nodeId,
      pageIndex: clickAction.pageIndex,
    })
  }, [isTemplateMode])

  const startInlineEditImmediatelyFromClick = useCallback((clickAction: PendingClickAction) => {
    cancelDeferredInlineEditStart()
    const startedAt = startWysiwygPerfSpan()
    handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex, "responsive-preview")
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-start", startedAt, {
      nodeId: clickAction.nodeId,
      pageIndex: clickAction.pageIndex,
      pageCount: editorPageCount,
      source: "canvas-click-immediate",
    })
  }, [
    cancelDeferredInlineEditStart,
    editorPageCount,
    handleInlineEditStart,
  ])

  const handleInlineEditEnd = useCallback((nodeId?: string, reason: "blur" | "keyboard" = "keyboard") => {
    if (nodeId) cancelDeferredInlineEditEnd()
    const endStartedAt = startWysiwygPerfSpan()
    let finalized = false
    let source = "legacy"
    const restoreEditorFocus = () => {
      if (reason !== "keyboard") return
      requestAnimationFrame(() => editorRootRef.current?.focus())
    }
    const activeWysiwygNodeId = wysiwygTextSessionStateRef.current.nodeId
    if (WYSIWYG_TEXT_ENGINE_ENABLED && activeWysiwygNodeId && (!nodeId || nodeId === activeWysiwygNodeId)) {
      finalized = finalizeInlineEditBeforeResponsiveAction()
      source = "wysiwyg-text-engine"
      restoreEditorFocus()
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-end", endStartedAt, {
        nodeId: nodeId ?? activeWysiwygNodeId,
        source,
        action: reason,
        active: finalized,
      })
      return
    }
    endInlineEditSession(nodeId, reason)
    finalized = true
    restoreEditorFocus()
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-end", endStartedAt, {
      nodeId,
      source,
      action: reason,
      active: finalized,
    })
  }, [cancelDeferredInlineEditEnd, endInlineEditSession, finalizeInlineEditBeforeAction, finalizeInlineEditBeforeResponsiveAction])

  const shouldDeferBoundarySafeInlineEditEnd = useCallback((nodeId: string): boolean => {
    const override = optimisticStructuralIslandOverride
    if (!override || override.nodeId !== nodeId || override.mode !== "boundary-safe") return false
    const settledFragment = findWysiwygTextEngineFragment(
      displayPaginated,
      nodeId,
      inlineEditPageIndex ?? override.fragment.pageIndex,
    )
    return !settledFragment
  }, [displayPaginated, inlineEditPageIndex, optimisticStructuralIslandOverride])

  const deferBoundarySafeInlineEditEnd = useCallback((nodeId: string, reason: "blur" | "keyboard", source: string): boolean => {
    if (!shouldDeferBoundarySafeInlineEditEnd(nodeId)) return false
    pendingBoundarySafeInlineEditEndRef.current = { frameId: null, timeoutId: null, nodeId, reason }
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-island-blur-handoff",
      startedAt: startWysiwygPerfSpan(),
      durationMs: 0,
      nodeId,
      source,
      action: "boundary-safe-wait-for-settled-fragment",
      active: true,
    })
    return true
  }, [shouldDeferBoundarySafeInlineEditEnd])

  const handleFlowdocDraftIslandEndEdit = useCallback((nodeId: string, reason: "blur" | "keyboard" = "keyboard") => {
    if (reason === "blur" && deferBoundarySafeInlineEditEnd(nodeId, reason, "island-end-callback")) return
    handleInlineEditEnd(nodeId, reason)
  }, [deferBoundarySafeInlineEditEnd, handleInlineEditEnd])

  const scheduleInlineEditEndAfterPaint = useCallback((nodeId: string, reason: "blur" | "keyboard", source: string) => {
    cancelDeferredInlineEditEnd()
    const scheduledAt = startWysiwygPerfSpan()
    const runAfterPaint = () => {
      const timeoutId = window.setTimeout(() => {
        const pending = deferredInlineEditEndRef.current
        if (!pending || pending.timeoutId !== timeoutId) return
        deferredInlineEditEndRef.current = null
        const stillActive = inlineEditNodeIdRef.current === nodeId &&
          wysiwygTextSessionStateRef.current.nodeId === nodeId
        finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-island-blur-handoff", scheduledAt, {
          nodeId,
          source,
          action: stillActive ? "shell-deferred-end" : "shell-deferred-end-skipped",
          active: stillActive,
        })
        if (!stillActive) return
        if (deferBoundarySafeInlineEditEnd(nodeId, reason, source)) return
        handleInlineEditEnd(nodeId, reason)
      }, 0)
      deferredInlineEditEndRef.current = { frameId: null, timeoutId, nodeId, reason }
    }

    if (typeof window.requestAnimationFrame !== "function") {
      runAfterPaint()
      return
    }

    const frameId = window.requestAnimationFrame(runAfterPaint)
    deferredInlineEditEndRef.current = { frameId, timeoutId: null, nodeId, reason }
  }, [cancelDeferredInlineEditEnd, deferBoundarySafeInlineEditEnd, handleInlineEditEnd])

  const handleWysiwygTextDraftChange = useCallback((nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => {
    if (wysiwygTextSessionState.nodeId !== nodeId) return
    const textChanged = text !== wysiwygTextSessionState.draftText
    const nextSelection = selection ?? (caretIndex == null ? null : { anchorOffset: caretIndex, focusOffset: caretIndex })
    if (
      !textChanged &&
      wysiwygTextSessionState.caretOffset === caretIndex &&
      areWysiwygTextSelectionsEqual(wysiwygTextSessionState.selection, nextSelection)
    ) return
    const nextSnapshotRevision = wysiwygDraftPaginationSnapshotRevisionRef.current + 1
    wysiwygDraftPaginationSnapshotRevisionRef.current = nextSnapshotRevision
    wysiwygLatestDraftPaginationSnapshotRef.current = {
      nodeId,
      draftText: text,
      caretOffset: caretIndex,
      revision: nextSnapshotRevision,
    }
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
    if (useResponsiveDraftPagination || plainBoundaryDraftPaginationActive) {
      if (responsiveDraftPaginationNodeId) {
        setWysiwygDraftPaginationNodeId(responsiveDraftPaginationNodeId)
      }
      const draftPaginationDelayMs = plainBoundaryDraftPaginationActive && !useResponsiveDraftPagination
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
  useEffect(() => {
    if (initialTestScenario) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setLocalSaveStatus("saving")
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistry, dataSnapshot)
      saveTimeoutRef.current = null
      setLocalSaveStatus("saved")
    }, 500)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataSnapshot,
    getPersistableDocumentSnapshot,
    initialTestScenario,
    packageFieldRegistry,
    state.doc,
    wysiwygTextSessionState.dirtyVersion,
    wysiwygTextSessionState.nodeId,
  ])

  useEffect(() => {
    if (initialTestScenario) return
    const flushDraftToStorage = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistryRef.current, dataSnapshotRef.current)
      setLocalSaveStatus("saved")
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushDraftToStorage()
    }
    window.addEventListener("pagehide", flushDraftToStorage)
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => {
      window.removeEventListener("pagehide", flushDraftToStorage)
      document.removeEventListener("visibilitychange", flushWhenHidden)
    }
  }, [getPersistableDocumentSnapshot, initialTestScenario])

  const importRef = useRef<HTMLInputElement>(null)

  const handleExportJson = useCallback(() => {
    finalizeInlineEditBeforeAction()
    const doc = docRef.current
    const title = doc.document.meta?.title ?? "document"
    const blob = new Blob([serializeDocumentPackageWithFields(doc, packageFieldRegistry, dataSnapshot)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = makeFlowDocFileName(title)
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
    setDocumentIoStatus({ type: "info", message: "Saved FlowDoc package v2 JSON." })
  }, [dataSnapshot, finalizeInlineEditBeforeAction, packageFieldRegistry])

  const replaceDocumentFromParseResult = useCallback((
    result: DocumentParseResult,
    successMessage: (result: Extract<DocumentParseResult, { ok: true }>) => string,
  ): boolean => {
    if (!result.ok) {
      setDocumentIoStatus({ type: "error", message: documentParseFailureMessage(result.reason) })
      return false
    }

    const doc = result.doc
    resetInlineEditStateForDocumentReplace()
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    setSelectedStyleResource(null)
    setPackageFieldRegistry(fieldRegistryFromDocumentParseResult(result))
    setDataSnapshot(dataSnapshotFromDocumentParseResult(result))
    setPartialPreviewPaginated(null)
    setBrowserPreviewLayout(createEditorPreviewPlaceholderLayoutState())
    dispatch({ type: "LOAD_DOCUMENT", doc })
    setDocumentIoStatus({ type: "info", message: successMessage(result) })
    return true
  }, [clearWysiwygDraftPagination, endWysiwygTextSession, resetInlineEditStateForDocumentReplace])

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocumentIoStatus(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parsePersistedDocument(ev.target?.result as string)
      replaceDocumentFromParseResult(result, (okResult) => documentImportSuccessMessage(okResult.source, okResult.fieldRegistryIssues))
    }
    reader.onerror = () => {
      setDocumentIoStatus({ type: "error", message: "Could not read this file." })
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [replaceDocumentFromParseResult])

  const handleNewDocument = useCallback(() => {
    if (!confirm("สร้างเอกสารใหม่? history จะถูกล้าง")) return
    const doc = createDefaultDocument("Untitled")
    resetInlineEditStateForDocumentReplace()
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    setSelectedStyleResource(null)
    setPackageFieldRegistry(SAMPLE_FIELD_REGISTRY_V1)
    setDataSnapshot(createEmptyDataSnapshot())
    setPartialPreviewPaginated(null)
    setBrowserPreviewLayout(createEditorPreviewPlaceholderLayoutState())
    dispatch({ type: "LOAD_DOCUMENT", doc })
  }, [clearWysiwygDraftPagination, endWysiwygTextSession, resetInlineEditStateForDocumentReplace])

  const handleCanvasScaleChange = useCallback((nextScale: number) => {
    setScale(clampScale(nextScale))
  }, [])

  const handleUndo = useCallback(() => {
    if (!isTemplateMode) return
    const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
    if (state.past.length === 0 && !hadInlineEdit) return
    dispatchEditorAction({ type: "UNDO" })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, isTemplateMode, state.past])

  const handleRedo = useCallback(() => {
    if (!isTemplateMode) return
    const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
    if (state.future.length === 0 && !hadInlineEdit) return
    dispatchEditorAction({ type: "REDO" })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, isTemplateMode, state.future])

  const setManualScale = useCallback((nextScale: number) => {
    setZoomMode("manual")
    setScale(clampScale(nextScale))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomMode("manual")
    setScale((current) => clampScale(Math.round((current + ZOOM_STEP) * 100) / 100))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomMode("manual")
    setScale((current) => clampScale(Math.round((current - ZOOM_STEP) * 100) / 100))
  }, [])

  const zoomByWheel = useCallback((deltaY: number) => {
    setZoomMode("manual")
    const direction = deltaY < 0 ? 1 : -1
    setScale((current) => clampScale(Math.round((current + direction * ZOOM_STEP) * 100) / 100))
  }, [])

  const resetZoom = useCallback(() => {
    setManualScale(1)
  }, [setManualScale])

  const fitZoom = useCallback(() => {
    setZoomMode("fit")
  }, [])

  useEffect(() => {
    const root = editorRootRef.current
    if (!root) return
    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      event.preventDefault()
      zoomByWheel(event.deltaY)
    }
    root.addEventListener("wheel", handleWheel, { passive: false })
    return () => root.removeEventListener("wheel", handleWheel)
  }, [zoomByWheel])

  const handleWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    const target = event.target as HTMLElement | null
    const tag = target?.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
    event.preventDefault()
    zoomByWheel(event.deltaY)
  }, [zoomByWheel])

  const prepareOptimisticSplitRefocus = useCallback((nodeId: string): PendingOptimisticSplitRefocus | null => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return null
    if (wysiwygTextSessionStateRef.current.nodeId !== nodeId) return null
    const doc = docRef.current
    if (!resolveStructuralParagraphEligibility({ doc, nodeId }).eligible) return null
    const activeFragment = findWysiwygTextEngineFragment(displayPaginated, nodeId, inlineEditPageIndexRef.current)
      ?? findWysiwygTextEngineFragment(displayPaginated, nodeId, null)
    if (
      !activeFragment ||
      activeFragment.nodeType !== "paragraph" ||
      activeFragment.continuesFrom ||
      activeFragment.isContinued ||
      activeFragment.listMarker
    ) return null
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(activeFragment.pageIndex) ?? null
    if (!pageKey) return null

    const startedAt = startWysiwygPerfSpan()
    const pending: PendingOptimisticSplitRefocus = {
      sourceNodeId: nodeId,
      newNodeId: createParagraphNode("").id,
      sourceFragment: activeFragment,
      startedAt,
      prestarted: false,
    }
    pendingOptimisticSplitRefocusRef.current = pending
    suppressNextLayoutLoadingOverlayRef.current = true
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: 0,
      nodeId,
      pageIndex: activeFragment.pageIndex,
      source: "optimistic-prepared",
      action: "prepared",
      active: true,
      usedFullPaginationBeforeIsland: false,
    })
    return pending
  }, [
    displayPaginated,
    editorPageNavigation.pageKeyByPageIndex,
  ])

  const startOptimisticSplitRefocusBeforeDispatch = useCallback((
    pending: PendingOptimisticSplitRefocus,
    splitIndex: number,
    text?: string,
    history?: SplitParagraphHistory,
  ): boolean => {
    const totalStartedAt = startWysiwygPerfSpan()
    const sourceStartedAt = startWysiwygPerfSpan()
    const source = resolveStructuralSourceDocument({
      doc: docRef.current,
      nodeId: pending.sourceNodeId,
      text,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
      action: "draft-text-resolve",
      operation: "split",
      active: source.textResolved,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: sourceStartedAt,
      durationMs: source.currentTextResolveMs,
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      operation: "split",
      source: source.textSupplied ? "draft-text" : "doc-current",
      action: "current-text-resolve",
      active: source.textResolved,
    })
    if (source.textChanged) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-structural-attribution",
        startedAt: sourceStartedAt,
        durationMs: source.replaceDraftTextMs,
        nodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        operation: "split",
        source: "draft-text-replaced",
        action: "replace-draft-text",
        active: true,
      })
    }
    const sourceDoc = source.doc
    const splitStartedAt = startWysiwygPerfSpan()
    const result = splitParagraphAtIndex(sourceDoc, pending.sourceNodeId, splitIndex, {
      newNodeId: pending.newNodeId,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", splitStartedAt, {
      nodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      action: "split-operation",
      operation: "split",
      active: result.newNodeId === pending.newNodeId,
    })
    if (result.newNodeId !== pending.newNodeId) return false
    const paragraphResolveStartedAt = startWysiwygPerfSpan()
    const resultParagraph = resolveStructuralResultParagraph({
      doc: result.doc,
      nodeId: pending.newNodeId,
    })
    if (!resultParagraph.resolved) return false
    const newText = resultParagraph.text
    const newParagraph = resultParagraph.paragraph
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      action: "paragraph-resolve",
      operation: "split",
      textLength: newText.length,
      active: true,
    })
    const optimisticStartedAt = startWysiwygPerfSpan()
    const optimistic = createOptimisticSplitRefocusPaginated({
      doc: result.doc,
      paginated: paginatedRef.current,
      sourceNodeId: pending.sourceNodeId,
      newNodeId: pending.newNodeId,
      sourceFragment: pending.sourceFragment,
      textMeasurer: editorTextMeasurer,
    })
    const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: pending.sourceFragment.pageIndex,
      action: "optimistic-pagination",
      operation: "split",
      active: optimistic !== null,
      overflowedPage: optimistic?.overflowedPage,
      optimisticMode: optimistic?.mode,
      boundarySafeMode: optimistic?.mode === "boundary-safe",
      affectedPageIndex: optimistic?.newFragment.pageIndex ?? pending.sourceFragment.pageIndex,
      optimisticFragmentCount: optimisticSummary?.fragmentCount,
      ...(optimisticSummary ?? {}),
    })
    if (!optimistic) return false

    pending.prestarted = true
    pendingOptimisticSplitRefocusRef.current = pending
    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: result.doc, paginated: optimistic.paginated }
    optimisticStructuralSettleRef.current = { ...pending, newNodeId: pending.newNodeId }
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    suppressNextLayoutLoadingOverlayRef.current = true
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
    if (!pageKey) return false
    const suppressionStartedAt = startWysiwygPerfSpan()
    const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
      ? findImmediatePageBreakSiblingAfterNode(result.doc, pending.newNodeId)
      : null
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", suppressionStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "boundary-safe-metadata",
      operation: "split",
      boundarySafeMode: optimistic.mode === "boundary-safe",
      suppressedPageBreakNodeId,
      affectedPageIndex: optimistic.newFragment.pageIndex,
    })
    let inlineStarted = false
    let textSessionStarted = false
    let splitDispatched = false
    const structuralBridge = structuralEditController.beginSplit({
      sourceNodeId: pending.sourceNodeId,
      newNodeId: pending.newNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      suppressedPageBreakNodeId,
      startedAt: pending.startedAt,
    })
    const structuralTransaction = structuralBridge.transaction
    const structuralTransactionIdentity = structuralBridge.identity
    const failAfterStructuralTransactionBegin = (reason: string) => {
      abortStructuralEditTransactionAndPanelDeferral(structuralTransactionIdentity, reason)
      return false
    }
    beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
    structuralEditController.markUrgentPainting(structuralTransactionIdentity)
    const flushStartedAt = startWysiwygPerfSpan()
    flushSync(() => {
      const inlineSetupStartedAt = startWysiwygPerfSpan()
      inlineStarted = startInlineEditAfterOptimisticStructuralChange(
        pending.newNodeId,
        0,
        optimistic.paginated,
        optimistic.newFragment.pageIndex,
        result.doc,
        newText,
      )
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", inlineSetupStartedAt, {
        nodeId: pending.newNodeId,
        previousNodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        pageIndex: optimistic.newFragment.pageIndex,
        action: "inline-edit-session-setup",
        operation: "split",
        active: inlineStarted,
      })
      const textSessionSetupStartedAt = startWysiwygPerfSpan()
      textSessionStarted = startPlainWysiwygTextSessionFromText({
        nodeId: pending.newNodeId,
        text: newText,
        caretOffset: 0,
        pageIndex: optimistic.newFragment.pageIndex,
      })
      if (textSessionStarted) {
        beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
          transaction: structuralTransaction,
          nodeId: pending.newNodeId,
          textLength: newText.length,
          caretIndex: 0,
        }))
      }
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", textSessionSetupStartedAt, {
        nodeId: pending.newNodeId,
        previousNodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        pageIndex: optimistic.newFragment.pageIndex,
        textLength: newText.length,
        action: "text-session-setup",
        operation: "split",
        active: textSessionStarted,
      })
      if (!inlineStarted || !textSessionStarted) return
      const dispatchStartedAt = startWysiwygPerfSpan()
      dispatchEditorAction({
        type: "SPLIT_PARAGRAPH",
        nodeId: pending.sourceNodeId,
        splitIndex,
        text,
        history,
        newNodeId: pending.newNodeId,
        precomputed: {
          doc: result.doc,
          newNodeId: pending.newNodeId,
        },
        precomputedDocValidation: "shell-optimistic-structural",
        paginated: optimistic.paginated,
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", dispatchStartedAt, {
        nodeId: pending.newNodeId,
        previousNodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        pageIndex: optimistic.newFragment.pageIndex,
        action: "dispatch",
        operation: "split",
        commandType: "SPLIT_PARAGRAPH",
        active: true,
      })
      splitDispatched = true
      const islandOverrideStartedAt = startWysiwygPerfSpan()
      setOptimisticStructuralIslandOverride({
        nodeId: pending.newNodeId,
        paragraph: newParagraph,
        fragment: optimistic.newFragment,
        pageKey,
        pages: optimistic.paginated.sections.flatMap((section) => section.pages),
        mode: optimistic.mode,
        suppressedPageBreakNodeId,
      })
      setOptimisticStructuralRefocusPaint({ nodeId: pending.newNodeId, startedAt: pending.startedAt })
      structuralEditController.markSplitCommitted(structuralTransactionIdentity, pending.newNodeId)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", islandOverrideStartedAt, {
        nodeId: pending.newNodeId,
        previousNodeId: pending.sourceNodeId,
        sourceNodeId: pending.sourceNodeId,
        pageIndex: optimistic.newFragment.pageIndex,
        action: "island-override-setup",
        operation: "split",
        boundarySafeMode: optimistic.mode === "boundary-safe",
        suppressedPageBreakNodeId,
        active: true,
      })
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", flushStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "flush-sync-transition",
      operation: "split",
      active: inlineStarted && textSessionStarted && splitDispatched,
      optimisticMode: optimistic.mode,
    })
    if (!inlineStarted) return failAfterStructuralTransactionBegin("split-inline-session-setup-failed")
    if (!textSessionStarted) return failAfterStructuralTransactionBegin("split-text-session-setup-failed")
    if (!splitDispatched) return failAfterStructuralTransactionBegin("split-dispatch-failed")
    endRichWysiwygDraftSession()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt: pending.startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - pending.startedAt),
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      source: "optimistic-prestarted",
      action: "prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", totalStartedAt, {
      nodeId: pending.newNodeId,
      previousNodeId: pending.sourceNodeId,
      sourceNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      action: "total",
      operation: "split",
      active: true,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    abortStructuralEditTransactionAndPanelDeferral,
    beginWysiwygDraftRuntimeSession,
    beginStructuralPanelReleaseDeferral,
    editorTextMeasurer,
    editorPageNavigation.pageKeyByPageIndex,
    dispatchEditorAction,
    endRichWysiwygDraftSession,
    startInlineEditAfterOptimisticStructuralChange,
    startPlainWysiwygTextSessionFromText,
    structuralEditController,
  ])

  const startOptimisticMergeRefocusBeforeDispatch = useCallback((
    nodeId: string,
    text: string | undefined,
    history: SplitParagraphHistory,
    sourceDocOverride?: DocumentNode | null,
  ): boolean => {
    const totalStartedAt = startWysiwygPerfSpan()
    const baseDoc = sourceDocOverride ?? docRef.current
    const sourceStartedAt = startWysiwygPerfSpan()
    const source = resolveStructuralSourceDocument({
      doc: baseDoc,
      nodeId,
      text,
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", sourceStartedAt, {
      nodeId,
      sourceNodeId: nodeId,
      source: source.textSupplied ? (source.textChanged ? "draft-text-replaced" : "draft-text-unchanged") : "doc-current",
      action: "draft-text-resolve",
      operation: "merge",
      active: source.textResolved,
    })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "flowdoc-structural-attribution",
      startedAt: sourceStartedAt,
      durationMs: source.currentTextResolveMs,
      nodeId,
      sourceNodeId: nodeId,
      operation: "merge",
      source: source.textSupplied ? "draft-text" : "doc-current",
      action: "current-text-resolve",
      active: source.textResolved,
    })
    if (source.textChanged) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "flowdoc-structural-attribution",
        startedAt: sourceStartedAt,
        durationMs: source.replaceDraftTextMs,
        nodeId,
        sourceNodeId: nodeId,
        operation: "merge",
        source: "draft-text-replaced",
        action: "replace-draft-text",
        active: true,
      })
    }
    const sourceDoc = source.doc
    if (!resolveStructuralParagraphEligibility({ doc: sourceDoc, nodeId }).eligible) return false

    const mergeStartedAt = startWysiwygPerfSpan()
    const result = mergeParagraphWithPrevious(sourceDoc, nodeId)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", mergeStartedAt, {
      nodeId,
      sourceNodeId: nodeId,
      action: "merge-operation",
      operation: "merge",
      active: result !== null,
      previousNodeId: result?.prevNodeId,
    })
    if (!result) return false
    if (isParagraphInsideTableCell(sourceDoc, result.prevNodeId)) return false
    if (isParagraphInsideFlowStack(sourceDoc, result.prevNodeId)) return false
    if (isParagraphInsideRowStack(sourceDoc, result.prevNodeId)) return false

    const paragraphResolveStartedAt = startWysiwygPerfSpan()
    const resultParagraph = resolveStructuralResultParagraph({
      doc: result.doc,
      nodeId: result.prevNodeId,
    })
    if (!resultParagraph.resolved) return false
    const previousParagraph = resultParagraph.paragraph
    const mergedText = resultParagraph.text
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", paragraphResolveStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      action: "paragraph-resolve",
      operation: "merge",
      textLength: mergedText.length,
      active: true,
    })

    const islandOnlyCurrentFragment = optimisticStructuralIslandOverride?.nodeId === nodeId &&
      optimisticStructuralIslandOverride.fragment.nodeType === "paragraph"
      ? optimisticStructuralIslandOverride.fragment
      : null
    const currentFragment = findWysiwygTextEngineFragment(paginatedRef.current, nodeId, inlineEditPageIndexRef.current)
      ?? findWysiwygTextEngineFragment(paginatedRef.current, nodeId, null)
      ?? islandOnlyCurrentFragment
    if (
      !currentFragment ||
      currentFragment.nodeType !== "paragraph" ||
      currentFragment.continuesFrom ||
      currentFragment.isContinued ||
      currentFragment.listMarker
    ) return false
    const previousFragment = findWysiwygTextEngineFragment(paginatedRef.current, result.prevNodeId, currentFragment.pageIndex)
    if (
      !previousFragment ||
      previousFragment.nodeType !== "paragraph" ||
      previousFragment.continuesFrom ||
      previousFragment.isContinued ||
      previousFragment.listMarker
    ) return false

    const optimisticStartedAt = startWysiwygPerfSpan()
    const optimistic = createOptimisticMergeRefocusPaginated({
      doc: result.doc,
      paginated: paginatedRef.current,
      previousNodeId: result.prevNodeId,
      currentNodeId: nodeId,
      previousFragment,
      currentFragment,
      textMeasurer: editorTextMeasurer,
    })
    const optimisticSummary = summarizeStructuralOptimisticPaginatedForPerf(optimistic?.paginated ?? null)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", optimisticStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      pageIndex: currentFragment.pageIndex,
      action: "optimistic-pagination",
      operation: "merge",
      active: optimistic !== null,
      overflowedPage: optimistic?.overflowedPage,
      optimisticMode: optimistic?.mode,
      boundarySafeMode: optimistic?.mode === "boundary-safe",
      affectedPageIndex: optimistic?.mergedFragment.pageIndex ?? currentFragment.pageIndex,
      optimisticFragmentCount: optimisticSummary?.fragmentCount,
      ...(optimisticSummary ?? {}),
    })
    if (!optimistic) return false

    const startedAt = startWysiwygPerfSpan()
    const previousPaginated = paginatedRef.current
    const previousOptimisticLayout = optimisticLayoutRef.current
    const previousStructuralSettle = optimisticStructuralSettleRef.current
    const previousStructuralPreviewGraceUntil = optimisticStructuralPreviewSettleGraceUntilRef.current
    const pending: PendingOptimisticMergeRefocus = {
      currentNodeId: nodeId,
      previousNodeId: result.prevNodeId,
      currentFragment,
      previousFragment,
      startedAt,
      prestarted: true,
    }
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.mergedFragment.pageIndex) ?? null
    if (!pageKey) return false

    pendingOptimisticMergeRefocusRef.current = pending
    optimisticStructuralSettleRef.current = null
    optimisticStructuralPreviewSettleGraceUntilRef.current = startWysiwygPerfSpan() + OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS
    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: result.doc, paginated: optimistic.paginated }
    suppressNextLayoutLoadingOverlayRef.current = true

    let inlineStarted = false
    let textSessionStarted = false
    let mergeDispatched = false
    const structuralBridge = structuralEditController.beginMerge({
      currentNodeId: nodeId,
      previousNodeId: result.prevNodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      startedAt,
    })
    const structuralTransaction = structuralBridge.transaction
    const structuralTransactionIdentity = structuralBridge.identity
    beginStructuralPanelReleaseDeferral(structuralBridge.panelDeferral)
    structuralEditController.markUrgentPainting(structuralTransactionIdentity)
    const flushStartedAt = startWysiwygPerfSpan()
    flushSync(() => {
      const inlineSetupStartedAt = startWysiwygPerfSpan()
      inlineStarted = startInlineEditAfterOptimisticStructuralChange(
        result.prevNodeId,
        result.caretIndex,
        optimistic.paginated,
        optimistic.mergedFragment.pageIndex,
        result.doc,
        mergedText,
      )
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", inlineSetupStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "inline-edit-session-setup",
        operation: "merge",
        active: inlineStarted,
      })
      const textSessionSetupStartedAt = startWysiwygPerfSpan()
      textSessionStarted = startPlainWysiwygTextSessionFromText({
        nodeId: result.prevNodeId,
        text: mergedText,
        caretOffset: result.caretIndex,
        pageIndex: optimistic.mergedFragment.pageIndex,
      })
      if (textSessionStarted) {
        beginWysiwygDraftRuntimeSession(createStructuralDraftSessionPlan({
          transaction: structuralTransaction,
          nodeId: result.prevNodeId,
          textLength: mergedText.length,
          caretIndex: result.caretIndex,
        }))
      }
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", textSessionSetupStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        textLength: mergedText.length,
        action: "text-session-setup",
        operation: "merge",
        active: textSessionStarted,
      })
      if (!inlineStarted || !textSessionStarted) return
      const dispatchStartedAt = startWysiwygPerfSpan()
      dispatchEditorAction({
        type: "MERGE_PARAGRAPH",
        nodeId,
        text,
        history,
        precomputed: {
          doc: result.doc,
          prevNodeId: result.prevNodeId,
          caretIndex: result.caretIndex,
        },
        precomputedDocValidation: "shell-optimistic-structural",
        paginated: optimistic.paginated,
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", dispatchStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "dispatch",
        operation: "merge",
        commandType: "MERGE_PARAGRAPH",
        active: true,
      })
      mergeDispatched = true
      const islandOverrideStartedAt = startWysiwygPerfSpan()
      setOptimisticStructuralIslandOverride({
        nodeId: result.prevNodeId,
        paragraph: previousParagraph,
        fragment: optimistic.mergedFragment,
        pageKey,
        pages: optimistic.paginated.sections.flatMap((section) => section.pages),
        mode: optimistic.mode,
        settleRemovedNodeId: nodeId,
      })
      setOptimisticStructuralRefocusPaint({ nodeId: result.prevNodeId, startedAt })
      structuralEditController.markMergeCommitted(structuralTransactionIdentity, {
        removedNodeId: nodeId,
        committedNodeId: result.prevNodeId,
      })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", islandOverrideStartedAt, {
        nodeId: result.prevNodeId,
        previousNodeId: nodeId,
        sourceNodeId: nodeId,
        pageIndex: optimistic.mergedFragment.pageIndex,
        action: "island-override-setup",
        operation: "merge",
        boundarySafeMode: optimistic.mode === "boundary-safe",
        active: true,
      })
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", flushStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "flush-sync-transition",
      operation: "merge",
      active: inlineStarted && textSessionStarted && mergeDispatched,
      optimisticMode: optimistic.mode,
    })
    if (!inlineStarted || !textSessionStarted || !mergeDispatched) {
      abortStructuralEditTransactionAndPanelDeferral(
        structuralTransactionIdentity,
        !inlineStarted
          ? "merge-inline-session-setup-failed"
          : !textSessionStarted
          ? "merge-text-session-setup-failed"
          : "merge-dispatch-failed",
      )
      pendingOptimisticMergeRefocusRef.current = null
      optimisticStructuralSettleRef.current = previousStructuralSettle
      optimisticStructuralPreviewSettleGraceUntilRef.current = previousStructuralPreviewGraceUntil
      paginatedRef.current = previousPaginated
      optimisticLayoutRef.current = previousOptimisticLayout
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    endRichWysiwygDraftSession()
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      source: "optimistic-merge-prestarted",
      action: "merge-prestarted",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-transaction", totalStartedAt, {
      nodeId: result.prevNodeId,
      previousNodeId: nodeId,
      sourceNodeId: nodeId,
      pageIndex: optimistic.mergedFragment.pageIndex,
      action: "total",
      operation: "merge",
      active: true,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    abortStructuralEditTransactionAndPanelDeferral,
    beginWysiwygDraftRuntimeSession,
    beginStructuralPanelReleaseDeferral,
    clearWysiwygDraftPagination,
    dispatchEditorAction,
    editorPageNavigation.pageKeyByPageIndex,
    editorTextMeasurer,
    endWysiwygTextSession,
    endRichWysiwygDraftSession,
    optimisticStructuralIslandOverride,
    startInlineEditAfterOptimisticStructuralChange,
    startPlainWysiwygTextSessionFromText,
    structuralEditController,
  ])

  const handleSplitParagraph = useCallback((nodeId: string, splitIndex: number, text?: string) => {
    const history = consumeInlineEditHistory(nodeId)
    const optimisticPending = prepareOptimisticSplitRefocus(nodeId)
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    const optimisticStarted = optimisticPending
      ? startOptimisticSplitRefocusBeforeDispatch(optimisticPending, splitIndex, text, history)
      : false
    if (!optimisticPending || !optimisticStarted) {
      pendingOptimisticSplitRefocusRef.current = optimisticPending
    }
    if (optimisticStarted) return
    dispatchEditorAction({
      type: "SPLIT_PARAGRAPH",
      nodeId,
      splitIndex,
      text,
      history,
      newNodeId: optimisticPending?.newNodeId,
    })
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatchEditorAction,
    endWysiwygTextSession,
    prepareOptimisticSplitRefocus,
    startOptimisticSplitRefocusBeforeDispatch,
  ])

  const handleMergeParagraph = useCallback((nodeId: string, text?: string) => {
    const history = consumeInlineEditHistory(nodeId)
    const canTryOptimisticMerge = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId
    const pendingSplit = pendingOptimisticSplitRefocusRef.current
    const pendingSplitDoc = canTryOptimisticMerge &&
      pendingSplit?.prestarted &&
      pendingSplit.newNodeId === nodeId
      ? optimisticLayoutRef.current?.doc ?? null
      : null
    const currentDocContainsNode = canTryOptimisticMerge && getParagraphFromDoc(docRef.current, nodeId) !== null
    const optimisticLayoutDoc = optimisticLayoutRef.current?.doc ?? null
    const optimisticDocContainingNode = canTryOptimisticMerge &&
      !currentDocContainsNode &&
      optimisticLayoutDoc &&
      getParagraphFromDoc(optimisticLayoutDoc, nodeId) !== null
      ? optimisticLayoutDoc
      : null
    const optimisticMergeSourceDoc = pendingSplitDoc ?? optimisticDocContainingNode
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId === nodeId) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
    }
    if (canTryOptimisticMerge && startOptimisticMergeRefocusBeforeDispatch(nodeId, text, history, optimisticMergeSourceDoc)) {
      if (pendingSplit?.newNodeId === nodeId) {
        pendingOptimisticSplitRefocusRef.current = null
      }
      return
    }
    pendingOptimisticMergeRefocusRef.current = null
    dispatchEditorAction({ type: "MERGE_PARAGRAPH", nodeId, text, history })
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    dispatchEditorAction,
    endWysiwygTextSession,
    startOptimisticMergeRefocusBeforeDispatch,
  ])

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

  const startInlineEditAfterModelStructuralChange = useCallback((nodeId: string, caretIndex: number | null) => {
    const structuralPaginated = startInlineEditAfterStructuralChange(nodeId, caretIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    if (!structuralPaginated) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    paginatedRef.current = structuralPaginated
    if (!isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: structuralPaginated,
      nodeId,
    })) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return
    }
    startWysiwygTextSession(nodeId, caretIndex, null)
  }, [
    clearWysiwygDraftPagination,
    endWysiwygTextSession,
    startInlineEditAfterStructuralChange,
    startWysiwygTextSession,
  ])

  const startOptimisticInlineEditAfterSplit = useCallback((nodeId: string, caretIndex: number | null): boolean => {
    const pending = pendingOptimisticSplitRefocusRef.current
    if (!pending) return false
    if (pending.prestarted && pending.newNodeId === nodeId) {
      pendingOptimisticSplitRefocusRef.current = null
      return true
    }
    pendingOptimisticSplitRefocusRef.current = null
    const startedAt = pending.startedAt
    const optimistic = createOptimisticSplitRefocusPaginated({
      doc: docRef.current,
      paginated: paginatedRef.current,
      sourceNodeId: pending.sourceNodeId,
      newNodeId: nodeId,
      sourceFragment: pending.sourceFragment,
      textMeasurer: editorTextMeasurer,
    })
    if (!optimistic) {
      recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
        kind: "structural-refocus-used-full-pagination-before-island",
        startedAt,
        durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
        nodeId,
        previousNodeId: pending.sourceNodeId,
        pageIndex: pending.sourceFragment.pageIndex,
        source: "optimistic-unavailable-fallback",
        action: "fallback",
        active: false,
        usedFullPaginationBeforeIsland: true,
      })
      return false
    }

    paginatedRef.current = optimistic.paginated
    optimisticLayoutRef.current = { doc: docRef.current, paginated: optimistic.paginated }
    optimisticStructuralSettleRef.current = { ...pending, newNodeId: nodeId }
    suppressNextLayoutLoadingOverlayRef.current = true
    const pageKey = editorPageNavigation.pageKeyByPageIndex.get(optimistic.newFragment.pageIndex) ?? null
    if (!pageKey) return false
    dispatch({ type: "SET_PAGINATED", paginated: optimistic.paginated })
    const sessionStarted = startInlineEditAfterOptimisticStructuralChange(
      nodeId,
      caretIndex,
      optimistic.paginated,
      optimistic.newFragment.pageIndex,
    )
    if (!sessionStarted) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    const fragmentEligible = optimistic.mode === "boundary-safe" || isWysiwygTextEngineFragmentEligible({
      doc: docRef.current,
      paginated: optimistic.paginated,
      nodeId,
      pageIndex: optimistic.newFragment.pageIndex,
    })
    if (!fragmentEligible) {
      clearWysiwygDraftPagination()
      endWysiwygTextSession()
      return false
    }
    startWysiwygTextSession(nodeId, caretIndex, optimistic.newFragment.pageIndex)
    const newParagraph = getParagraphFromDoc(docRef.current, nodeId)
    if (newParagraph && isTextRunOnlyParagraph(newParagraph)) {
      const suppressedPageBreakNodeId = optimistic.mode === "boundary-safe"
        ? findImmediatePageBreakSiblingAfterNode(docRef.current, nodeId)
        : null
      setOptimisticStructuralIslandOverride({
        nodeId,
        paragraph: newParagraph,
        fragment: optimistic.newFragment,
        pageKey,
        pages: optimistic.paginated.sections.flatMap((section) => section.pages),
        mode: optimistic.mode,
        suppressedPageBreakNodeId,
      })
    }
    setOptimisticStructuralRefocusPaint({ nodeId, startedAt })
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "structural-refocus-used-full-pagination-before-island",
      startedAt,
      durationMs: Math.max(0, startWysiwygPerfSpan() - startedAt),
      nodeId,
      previousNodeId: pending.sourceNodeId,
      pageIndex: optimistic.newFragment.pageIndex,
      source: "optimistic-started",
      action: "started",
      active: true,
      usedFullPaginationBeforeIsland: false,
      overflowedPage: optimistic.overflowedPage,
      optimisticMode: optimistic.mode,
      ...summarizePaginatedForWysiwygPerf(optimistic.paginated),
    })
    return true
  }, [
    clearWysiwygDraftPagination,
    editorTextMeasurer,
    editorPageNavigation.pageKeyByPageIndex,
    endWysiwygTextSession,
    startInlineEditAfterOptimisticStructuralChange,
    startWysiwygTextSession,
  ])

  const startOptimisticInlineEditAfterMerge = useCallback((nodeId: string, caretIndex: number | null): boolean => {
    const pending = pendingOptimisticMergeRefocusRef.current
    if (!pending) return false
    if (pending.prestarted && pending.previousNodeId === nodeId) {
      pendingOptimisticMergeRefocusRef.current = null
      moveWysiwygTextCaret(caretIndex)
      return true
    }
    pendingOptimisticMergeRefocusRef.current = null
    return false
  }, [moveWysiwygTextCaret])

  // Focus the new paragraph after a split
  useLayoutEffect(() => {
    if (!state.lastSplitNodeId) return
    const nodeId = state.lastSplitNodeId
    if (!startOptimisticInlineEditAfterSplit(nodeId, 0)) {
      startInlineEditAfterModelStructuralChange(nodeId, 0)
    }
    dispatch({ type: "CLEAR_SPLIT_NODE_ID" })
  }, [
    startInlineEditAfterModelStructuralChange,
    startOptimisticInlineEditAfterSplit,
    state.lastSplitNodeId,
  ])

  // Focus the previous paragraph after a merge, caret at join point
  useLayoutEffect(() => {
    if (!state.mergeResult) return
    const nodeId = state.mergeResult.prevNodeId
    if (!startOptimisticInlineEditAfterMerge(nodeId, state.mergeResult.caretIndex)) {
      startInlineEditAfterModelStructuralChange(nodeId, state.mergeResult.caretIndex)
    }
    dispatch({ type: "CLEAR_MERGE_RESULT" })
  }, [
    startInlineEditAfterModelStructuralChange,
    startOptimisticInlineEditAfterMerge,
    state.mergeResult,
  ])

  // Keep editing the same paragraph after empty Enter exits a list item.
  useLayoutEffect(() => {
    if (!state.listExitNodeId) return
    startInlineEditAfterModelStructuralChange(state.listExitNodeId, 0)
    dispatch({ type: "CLEAR_LIST_EXIT_NODE_ID" })
  }, [startInlineEditAfterModelStructuralChange, state.listExitNodeId])

  // Keep editing the same paragraph after Tab/Shift+Tab changes list level.
  useLayoutEffect(() => {
    if (!state.listLevelChangeResult) return
    startInlineEditAfterModelStructuralChange(
      state.listLevelChangeResult.nodeId,
      state.listLevelChangeResult.caretIndex,
    )
    dispatch({ type: "CLEAR_LIST_LEVEL_CHANGE_RESULT" })
  }, [startInlineEditAfterModelStructuralChange, state.listLevelChangeResult])

  // ─── Editor preview layout ─────────────────────────────────────────────────
  const [isLayoutLoading, setIsLayoutLoading] = useState(false)
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("optimistic")
  const [serverCheckedPreviewDoc, setServerCheckedPreviewDoc] = useState<DocumentNode | null>(null)
  const [serverLayoutWarnings, setServerLayoutWarnings] = useState<ReturnType<typeof collectPaginatedLayoutWarnings>>([])
  const [fontFallback, setFontFallback] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const [suppressLayoutLoadingOverlay, setSuppressLayoutLoadingOverlay] = useState(false)
  const interactiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutVersionRef = useRef(0)
  const browserPaginationWorkerRef = useRef<Worker | null>(null)
  const browserPaginationWorkerRequestIdRef = useRef(0)
  const precomputedBrowserPaginationRef = useRef<OptimisticLayoutSnapshot | null>(null)
  const optimisticLayoutRef = useRef<OptimisticLayoutSnapshot | null>(null)
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
  const optimisticLayoutWarnings = useMemo(() => collectPaginatedLayoutWarnings(state.paginated), [state.paginated])
  const serverLayoutCheckedForCurrentPreview = layoutStatus === "server-checked" && serverCheckedPreviewDoc === previewDoc
  const authoritativeLayoutWarnings = selectAuthoritativeLayoutWarnings({
    serverLayoutCheckedForCurrentPreview,
    serverLayoutWarnings,
    optimisticLayoutWarnings,
  })
  const layoutWarningSource = serverLayoutCheckedForCurrentPreview ? "server" : "preview"
  const exportReadiness = useMemo(() => getExportReadiness({
    layoutStatus,
    previewLayoutStatus: browserPreviewLayout.status,
    layoutError,
    serverLayoutCheckedForCurrentPreview,
    fontFallback,
    driftReport,
    isFillMode: !isTemplateMode,
    dataReadinessHasErrors: dataReadiness.hasErrors,
    dataReadinessIssues: dataReadiness.issues,
    layoutWarnings: authoritativeLayoutWarnings,
  }), [
    authoritativeLayoutWarnings,
    dataReadiness.hasErrors,
    dataReadiness.issues,
    driftReport,
    fontFallback,
    browserPreviewLayout.status,
    isTemplateMode,
    layoutError,
    layoutStatus,
    serverLayoutCheckedForCurrentPreview,
  ])
  const exportReadinessMessage = formatExportReadinessMessage(exportReadiness)
  const exportReadinessStatusReason = firstVisibleExportReadinessReason(exportReadiness.reasons)
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

  const renderResizePreview = useCallback((drag: ResizeDrag | null) => {
    const element = resizePreviewRef.current
    if (!element) return
    if (!drag || drag.committed) {
      element.style.display = "none"
      return
    }

    const previewY = drag.type === "table-column" ? drag.tableFragY : drag.rowFragY
    const previewHeight = drag.type === "table-column" ? drag.tableFragHeight : drag.rowFragHeight
    const leftPx = drag.svgLeft + drag.currentDocX * scale
    const topPx = drag.svgTop + previewY * scale
    element.style.display = "block"
    element.style.height = `${Math.max(previewHeight * scale, 8)}px`
    element.style.transform = `translate3d(${leftPx - 1}px, ${topPx}px, 0)`
  }, [scale])

  const scheduleResizePreview = useCallback((drag: ResizeDrag | null) => {
    pendingResizePreviewRef.current = drag
    if (typeof requestAnimationFrame === "undefined") {
      renderResizePreview(drag)
      return
    }
    if (resizePreviewFrameRef.current !== null) return
    resizePreviewFrameRef.current = requestAnimationFrame(() => {
      resizePreviewFrameRef.current = null
      renderResizePreview(pendingResizePreviewRef.current)
    })
  }, [renderResizePreview])

  const hideResizePreview = useCallback(() => {
    pendingResizePreviewRef.current = null
    if (resizePreviewFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(resizePreviewFrameRef.current)
      resizePreviewFrameRef.current = null
    }
    renderResizePreview(null)
  }, [renderResizePreview])

  useEffect(() => () => hideResizePreview(), [hideResizePreview])

  const handleExport = useCallback(async (format: EditorExportFormat) => {
    const exportStartedAt = Date.now()
    setExportFeedback(buildExportFeedback(format, "preflight", exportStartedAt))
    const finalizedActiveEdit = finalizeInlineEditBeforeAction()
    const exportDoc = resolvePreviewDoc(docRef.current)
    const formatLabel = format.toUpperCase()
    const readiness = finalizedActiveEdit
      ? {
        canExport: false,
        reasons: ["server layout has not checked the current document"],
      }
      : exportReadiness
    const blockedReason = formatExportReadinessMessage(readiness)
    if (blockedReason) {
      setExportFeedback(null)
      setDocumentIoStatus(null)
      setExportError(`${formatLabel} export blocked: ${blockedReason}`)
      return
    }

    setExportError(null)
    setDocumentIoStatus({
      type: "info",
      message: format === "pdf"
        ? "Exporting PDF: paginating and rendering page batches..."
        : "Exporting DOCX: paginating and rendering...",
    })
    setIsExporting(true)
    try {
      setExportFeedback(buildExportFeedback(format, "uploading", exportStartedAt))
      const exportRequest = fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: exportDoc, format }),
      })
      setExportFeedback(buildExportFeedback(format, "processing", exportStartedAt))
      const res = await exportRequest
      if (!res.ok) {
        const responseText = await res.text()
        let errorCode: string | null = null
        let errorMessage = responseText
        try {
          const body = JSON.parse(responseText) as { code?: unknown; error?: unknown }
          errorCode = typeof body.code === "string" ? body.code : null
          errorMessage = typeof body.error === "string" ? body.error : responseText
        } catch { }
        if (errorCode === "FONT_FALLBACK_BLOCKED") {
          setFontFallback(true)
          setDocumentIoStatus(null)
          setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
          return
        }
        if (errorCode === LAYOUT_WARNINGS_BLOCKED_CODE) {
          setDocumentIoStatus(null)
          setExportError(`${formatLabel} export blocked: layout warnings block final export`)
          return
        }
        throw new Error(`export failed: ${res.status} ${errorCode ?? ""} ${errorMessage}`)
      }
      if (res.headers.get(FLOWDOC_FONT_HEADER) === FLOWDOC_FONT_FALLBACK_VALUE) {
        setFontFallback(true)
        setDocumentIoStatus(null)
        setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
        return
      }
      const exportProfile = parseFlowDocExportProfileHeader(res.headers.get(FLOWDOC_EXPORT_PROFILE_HEADER))
      setExportFeedback(buildExportFeedback(format, "downloading", exportStartedAt))
      setDocumentIoStatus({ type: "info", message: `Preparing ${formatLabel} download...` })
      setFontFallback(false)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `document.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
      setDocumentIoStatus({
        type: "info",
        message: formatFlowDocExportProfileSummary(exportProfile) ?? `${formatLabel} export ready.`,
      })
      setExportError(null)
    } catch (err) {
      setDocumentIoStatus(null)
      setExportError(`${formatLabel} export failed. Please try again.`)
      console.error("export error:", err)
    } finally {
      setIsExporting(false)
      setExportFeedback(null)
    }
  }, [exportReadiness, finalizeInlineEditBeforeAction, resolvePreviewDoc])

  const inlineEditFragmentRanges = useMemo(() => (
    inlineEditNodeId
      ? getWysiwygParagraphFragmentRanges(state.paginated, inlineEditNodeId)
      : []
  ), [inlineEditNodeId, state.paginated])

  useEffect(() => {
    if (!inlineEditNodeId || inlineEditCaretIndex === null) return
    if (inlineEditVisualLocked || !inlineEditDocumentVisualReady) return
    const nextPageIndex = findWysiwygPageIndexInFragmentRanges(inlineEditFragmentRanges, inlineEditCaretIndex, {
      preferPreviousPageAtFragmentEnd: isParagraphInsideTableCell(previewDoc, inlineEditNodeId),
    })
    if (nextPageIndex === null || nextPageIndex === inlineEditPageIndex) return
    const previousPageIndex = inlineEditPageIndexRef.current
    inlineEditPageIndexRef.current = nextPageIndex
    setInlineEditPageIndex(nextPageIndex)
    if (shouldFollowInlineEditPageChange({ previousPageIndex, nextPageIndex })) {
      requestInlineEditPageFollow(nextPageIndex)
    }
  }, [
    inlineEditCaretIndex,
    inlineEditDocumentVisualReady,
    inlineEditFragmentRanges,
    inlineEditNodeId,
    inlineEditPageIndex,
    inlineEditVisualLocked,
    requestInlineEditPageFollow,
  ])

  // Inline edit contract:
  // - While editing, the textarea owns input/caret events for the active paragraph.
  // - Browser pagination owns optimistic text wrapping and page/fragment geometry
  //   from previewDoc so the visible text matches normal document rendering.
  // - After edit mode exits, settle preview pagination from the latest rendered
  //   document snapshot. This avoids reconciling from a stale onBlur closure.
  useEffect(() => {
    const wasInlineEditing = wasInlineEditingRef.current
    wasInlineEditingRef.current = inlineEditNodeId !== null
    if (!wasInlineEditing || inlineEditNodeId !== null) return
    if (WYSIWYG_TEXT_ENGINE_ENABLED) {
      setPartialPreviewPaginated(null)
      return
    }
    const startedAt = startWysiwygPerfSpan()
    const paginated = paginateDocument(previewDoc, editorTextMeasurer)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-exit-pagination", startedAt, {
      source: "inline-edit-exit",
      ...summarizePaginatedForWysiwygPerf(paginated),
    })
    optimisticLayoutRef.current = { doc: previewDoc, paginated }
    setPartialPreviewPaginated(null)
    setBrowserPreviewLayout(markEditorPreviewLayoutFull(getCurrentPreviewSettleGenerationBridge(previewSettleRuntime)))
    dispatch({ type: "SET_PAGINATED", paginated })
  }, [editorTextMeasurer, inlineEditNodeId, previewDoc, previewSettleRuntime])

  // Full browser pagination — optimistic visual layout. During inline editing
  // this runs against previewDoc so draft text can split across pages before
  // blur; server/API pagination below remains authoritative for export/drift.
  useEffect(() => {
    if (interactiveDebounceRef.current) clearTimeout(interactiveDebounceRef.current)

    // Use ref for debounce time so edit mode enter/exit doesn't re-trigger pagination.
    // Entering edit mode changes inlineEditNodeId but not previewDoc, so this
    // effect only reruns when the draft document or measurement inputs change.
    setPartialPreviewPaginated(null)
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
          clearPartialPreview: () => setPartialPreviewPaginated(null),
          setBrowserPreviewLayout,
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
    const visualOnlyUpdate = tryApplyVisualOnlyPaginatedUpdate({
      action: pendingActionClassification?.action,
      classification: pendingActionClassification?.classification,
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
        clearPartialPreview: () => setPartialPreviewPaginated(null),
        setBrowserPreviewLayout,
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
        ...summarizePaginatedForWysiwygPerf(visualOnlyUpdate.paginated),
      })
      return () => undefined
    }

    setBrowserPreviewLayout((current) => markEditorPreviewLayoutSettlingFromCurrent(generation, current))
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
    interactiveDebounceRef.current = setTimeout(() => {
      interactiveDebounceRef.current = null
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
          clearPartialPreview: () => setPartialPreviewPaginated(null),
          setBrowserPreviewLayout,
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
              applyPartialWorkerBrowserPreviewShellMutation({
                plan: partialShellMutationPlan,
                partialPreview: {
                  generation,
                  requestId,
                  paginated: response.paginated,
                },
                createPartialBrowserPreviewLayout: markEditorPreviewLayoutPartial,
                setPartialPreview: setPartialPreviewPaginated,
                setBrowserPreviewLayout,
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
              pageIndex: currentCanvasPageIndex,
              marginPages: BROWSER_PREVIEW_VISIBLE_WINDOW_MARGIN_PAGES,
            },
            profilePagination,
          }
          finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:worker-request-payload-built", requestBuildStartedAt, {
            requestId,
            generation,
            profilePagination,
            visiblePageIndex: currentCanvasPageIndex,
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
    }, debounceMs)

    return () => {
      if (interactiveDebounceRef.current) {
        clearTimeout(interactiveDebounceRef.current)
        interactiveDebounceRef.current = null
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTextMeasurer, editorTextMeasurerStatus, fontReadyVersion, getBrowserPaginationWorker, markInlineEditVisualFresh, previewDoc])

  // Server pagination — export layout truth. The editor canvas
  // keeps the browser preview so normal display and inline editing share the
  // same visual line layout; server output is kept for status/drift/export.
  useEffect(() => {
    const layoutVersion = ++layoutVersionRef.current
    let controller: AbortController | null = null
    let cancelled = false
    const cancelForPageTransition = () => {
      cancelled = true
      controller?.abort()
    }
    setServerCheckedPreviewDoc(null)
    setServerLayoutWarnings([])
    setLayoutStatus("optimistic")
    const suppressLoadingOverlay = suppressNextLayoutLoadingOverlayRef.current
    suppressNextLayoutLoadingOverlayRef.current = false
    setSuppressLayoutLoadingOverlay(suppressLoadingOverlay)

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
      setIsLayoutLoading(true)
      setLayoutStatus("reconciling")

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
        signal: controller.signal,
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
        .then((paginated) => {
          if (layoutVersion !== layoutVersionRef.current) return
          setLayoutError(false)
          setServerLayoutWarnings(collectPaginatedLayoutWarnings(paginated))
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
          setServerCheckedPreviewDoc(previewDoc)
          setLayoutStatus("server-checked")
        })
        .catch((error) => {
          if (cancelled) return
          if (controller?.signal.aborted) return
          if (error instanceof DOMException && error.name === "AbortError") return
          if (
            error instanceof TypeError &&
            error.message === "Failed to fetch" &&
            document.visibilityState === "hidden"
          ) return
          if (layoutVersion !== layoutVersionRef.current) return
          console.error("server pagination failed:", error)
          setServerCheckedPreviewDoc(null)
          setServerLayoutWarnings([])
          setLayoutStatus("optimistic")
          setLayoutError(true)
        })
        .finally(() => {
          if (layoutVersion === layoutVersionRef.current) {
            setIsLayoutLoading(false)
            setSuppressLayoutLoadingOverlay(false)
          }
        })
    }, inlineEditNodeId ? 500 : 120)

    return () => {
      cancelled = true
      window.removeEventListener("pagehide", cancelForPageTransition)
      if (serverPaginationDebounceRef.current) clearTimeout(serverPaginationDebounceRef.current)
      controller?.abort()
    }
  }, [browserPreviewLayout.status, previewDoc])

  useEffect(() => {
    if (!isLayoutLoading) {
      if (resizeDragRef.current?.committed) setResizeDrag(null)
      if (minHeightDragRef.current?.committed) setMinHeightDrag(null)
      if (marginDragRef.current?.committed) setMarginDrag(null)
      if (headerFooterReservedDragRef.current?.committed) setHeaderFooterReservedDrag(null)
    }
  }, [headerFooterReservedDragRef, isLayoutLoading, marginDragRef, minHeightDragRef, resizeDragRef, setHeaderFooterReservedDrag, setMarginDrag, setMinHeightDrag, setResizeDrag])

  const setPageRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) pageRefs.current.set(key, el)
    else pageRefs.current.delete(key)
  }, [])
  const setPageOverlayRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) pageOverlayRefs.current.set(key, el)
    else pageOverlayRefs.current.delete(key)
  }, [])
  const getPageOverlayElement = useCallback((key: string) => pageOverlayRefs.current.get(key) ?? null, [])
  const flowdocDraftEditorIslandConfig = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:draft-island-config",
      () => {
        if (!isTemplateMode || !WYSIWYG_TEXT_ENGINE_ENABLED) return null
        const nodeId = wysiwygTextSessionState.nodeId
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
    displayPaginated,
    editorPageNavigation.pageKeyByPageIndex,
    inlineEditNodeId,
    inlineEditPageIndex,
    isTemplateMode,
    optimisticStructuralIslandOverride,
    previewDoc,
    wysiwygTextSessionState.nodeId,
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
    flowdocDraftEditorIslandConfig?.nodeId,
    isTemplateMode,
    optimisticStructuralIslandOverride,
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
  }, [panelDeferralRuntime, scheduleDeferredStructuralPanelRelease, structuralEditRuntime])

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
  }, [displayPaginated, handleInlineEditEnd, inlineEditPageIndex, optimisticStructuralIslandOverride])

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
  }, [displayPaginated, inlineEditPageIndex, optimisticStructuralIslandOverride, previewDoc])

  const handleBackgroundPointerDown = useCallback(() => {
    cancelDeferredInlineEditStart()
    setSelectedStyleResource(null)
    if (headerFooterEditMode) {
      if (inlineEditNodeId) finalizeInlineEditBeforeResponsiveAction()
      setHeaderFooterEditMode(null)
      dispatch({ type: "SELECT_NODE", nodeId: null })
      setRightRailMode("page")
      return
    }
    if (marginEditMode) {
      setMarginEditMode(null)
      dispatch({ type: "SELECT_NODE", nodeId: null })
      setRightRailMode("page")
      return
    }
    if (inlineEditNodeId) {
      if (useOutOfCanvasWysiwygIsland && wysiwygTextSessionStateRef.current.nodeId === inlineEditNodeId) {
        scheduleInlineEditEndAfterPaint(inlineEditNodeId, "blur", "background-pointerdown")
      } else {
        finalizeInlineEditBeforeResponsiveAction()
      }
      dispatch({ type: "SELECT_NODE", nodeId: null })
      setRightRailMode("page")
      return
    }
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
  }, [
    cancelDeferredInlineEditStart,
    finalizeInlineEditBeforeResponsiveAction,
    headerFooterEditMode,
    inlineEditNodeId,
    marginEditMode,
    scheduleInlineEditEndAfterPaint,
    useOutOfCanvasWysiwygIsland,
  ])

  const enterMarginEditMode = useCallback((sectionIndex: number) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
    setHeaderFooterEditMode(null)
    setHeaderFooterReservedDrag(null)
    setMarginEditMode({ sectionIndex })
  }, [finalizeInlineEditBeforeAction, setHeaderFooterReservedDrag])

  const exitMarginEditMode = useCallback(() => {
    if (marginDragRef.current && !marginDragRef.current.committed) return
    setMarginEditMode(null)
  }, [marginDragRef])

  const enterHeaderFooterEditMode = useCallback((sectionIndex: number, zone: "header" | "footer") => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    dispatchEditorAction({ type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE", sectionIndex, zone })
    setRightRailMode("page")
    setMarginEditMode(null)
    setMarginDrag(null)
    setHeaderFooterReservedDrag(null)
    setHeaderFooterEditMode({ sectionIndex, zone })
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction, setHeaderFooterReservedDrag, setMarginDrag])

  const exitHeaderFooterEditMode = useCallback(() => {
    if (inlineEditNodeId) finalizeInlineEditBeforeAction()
    setHeaderFooterEditMode(null)
  }, [finalizeInlineEditBeforeAction, inlineEditNodeId])

  const handleHeaderFooterZonePointerDown = useCallback(() => {
    if (inlineEditNodeId) finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
  }, [finalizeInlineEditBeforeAction, inlineEditNodeId])

  const handleHeaderFooterReservedResizeStart = useCallback((
    sectionIndex: number,
    zone: "header" | "footer",
    currentReserved: { headerReserved: number; footerReserved: number },
    pageHeightPt: number,
    marginTopPt: number,
    marginBottomPt: number,
    pageKey: string,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
    setMarginEditMode(null)
    setMarginDrag(null)
    setHeaderFooterEditMode({ sectionIndex, zone })
    setHeaderFooterReservedDrag({
      sectionIndex,
      zone,
      pageKey,
      pageHeightPt,
      marginTopPt,
      marginBottomPt,
      currentReserved,
    })
  }, [finalizeInlineEditBeforeAction, setHeaderFooterReservedDrag, setMarginDrag])

  const handleResizeStart = useCallback((
    rowId: string, leftStackId: string, rightStackId: string,
    pairX: number, pairWidth: number, gapWidthPt: number,
    startClientX: number, pageKey: string, rowFragY: number, rowFragHeight: number,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgRect = svgEl.getBoundingClientRect()
    const svgLeft = svgRect.left
    const svgTop = svgRect.top
    const startDocX = (startClientX - svgLeft) / scale

    let leftShare = 50, rightShare = 50
    let stackKind: StackResizeDrag["stackKind"] | null = null
    for (const section of state.doc.document.sections) {
      const l = section.nodes[leftStackId], r = section.nodes[rightStackId]
      if (l?.type === "stack" && r?.type === "stack") {
        leftShare = l.props.widthShare ?? 50
        rightShare = r.props.widthShare ?? 50
        stackKind = "stack"
        break
      }
      if (l?.type === "flow-stack" && r?.type === "flow-stack") {
        leftShare = l.props.widthShare ?? 50
        rightShare = r.props.widthShare ?? 50
        stackKind = "flow-stack"
        break
      }
    }
    if (stackKind == null) return

    const totalShare = leftShare + rightShare
    const minWidthPt = stackKind === "flow-stack" && totalShare > 0
      ? Math.max(1, pairWidth * (effectiveFlowStackResizeMinShare(totalShare) / totalShare))
      : Math.max(16, pairWidth * 0.15)

    const nextResizeDrag: ResizeDrag = {
      type: "stack",
      rowId, leftStackId, rightStackId,
      pairX, pairWidth, gapWidthPt,
      svgLeft,
      svgTop,
      pageKey,
      rowFragY,
      rowFragHeight,
      currentDocX: startDocX,
      leftShareOriginal: leftShare, rightShareOriginal: rightShare,
      totalShare,
      minWidthPt,
      stackKind,
    }
    setResizeDrag(nextResizeDrag)
    scheduleResizePreview(nextResizeDrag)
  }, [finalizeInlineEditBeforeAction, scale, scheduleResizePreview, state.doc])

  const handleTableColumnResizeStart = useCallback((
    tableId: string,
    leftColIndex: number,
    pairX: number,
    pairWidth: number,
    leftWidthOriginal: number,
    rightWidthOriginal: number,
    startClientX: number,
    pageKey: string,
    tableFragY: number,
    tableFragHeight: number,
  ) => {
    finalizeInlineEditBeforeAction()
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgRect = svgEl.getBoundingClientRect()
    const svgLeft = svgRect.left
    const svgTop = svgRect.top
    const pairWidthAuthored = leftWidthOriginal + rightWidthOriginal
    if (!Number.isFinite(pairWidthAuthored) || pairWidthAuthored <= 0 || pairWidth <= 0) return
    const renderedScale = pairWidth / pairWidthAuthored
    const minWidthPt = Math.min(Math.max(1, 24 * renderedScale), pairWidth / 2)
    const boundaryDocX = pairX + pairWidth * (leftWidthOriginal / pairWidthAuthored)
    const startDocX = (startClientX - svgLeft) / scale

    const nextResizeDrag: ResizeDrag = {
      type: "table-column",
      tableId,
      leftColIndex,
      pairX,
      pairWidth,
      svgLeft,
      svgTop,
      pageKey,
      tableFragY,
      tableFragHeight,
      currentDocX: boundaryDocX,
      pointerOffsetDocX: startDocX - boundaryDocX,
      leftWidthOriginal,
      rightWidthOriginal,
      pairWidthAuthored,
      minWidthPt,
    }
    setResizeDrag(nextResizeDrag)
    scheduleResizePreview(nextResizeDrag)
  }, [finalizeInlineEditBeforeAction, scale, scheduleResizePreview, setResizeDrag])

  const handleMinHeightResizeStart = useCallback((
    rowId: string, rowFragY: number, pageKey: string,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgTop = svgEl.getBoundingClientRect().top
    const naturalDoc = updateNodeProps(state.doc, rowId, { minHeight: undefined })
    const naturalHeight = getRowFragmentHeight(paginateDocument(naturalDoc, editorTextMeasurer), rowId) ?? 0

    let currentMinHeight = naturalHeight
    for (const section of state.doc.document.sections) {
      const n = section.nodes[rowId]
      if (n?.type === "row") { currentMinHeight = Math.max(n.props.minHeight ?? naturalHeight, naturalHeight); break }
    }

    setMinHeightDrag({
      rowId, rowFragY, svgTop,
      minPt: naturalHeight,
      currentMinHeight,
      pageKey,
    })
  }, [editorTextMeasurer, finalizeInlineEditBeforeAction, state.doc, state.paginated])

  const handleMarginResizeStart = useCallback((
    sectionIndex: number,
    side: "top" | "right" | "bottom" | "left",
    currentMargins: { top: number; right: number; bottom: number; left: number },
    pageWidthPt: number,
    pageHeightPt: number,
    pageKey: string,
    altKey: boolean,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
    setHeaderFooterEditMode(null)
    setMarginEditMode({ sectionIndex })
    setMarginDrag({ sectionIndex, side, pageWidthPt, pageHeightPt, currentMargins, pageKey, altKey })
  }, [finalizeInlineEditBeforeAction])

  // Palette drag: starts immediately
  const startPaletteDrag = useCallback((source: DragSource, e: React.PointerEvent) => {
    if (headerFooterEditMode && !isHeaderFooterSupportedDragSource(source)) return
    e.preventDefault()
    cancelDeferredInlineEditStart()
    finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
  }, [cancelDeferredInlineEditStart, finalizeInlineEditBeforeResponsiveAction, headerFooterEditMode])

  // Canvas fragment pointerDown: wait for movement before committing to drag
  const startNodePointerDown = useCallback((source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => {
    e.preventDefault()
    cancelDeferredInlineEditStart()
    const deferFinalizeUntilClickResolves = clickAction?.type === "inline-edit"
    if (!deferFinalizeUntilClickResolves) finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    pendingDragRef.current = {
      source,
      clientX: e.clientX,
      clientY: e.clientY,
      clickAction,
      finalizeOnDragStart: deferFinalizeUntilClickResolves,
    }
  }, [cancelDeferredInlineEditStart, finalizeInlineEditBeforeResponsiveAction])

  const selectContextNode = useCallback((nodeId: string) => {
    finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    dispatch({
      type: "SELECT_NODE",
      nodeId,
      anchorNodeId: state.selectionAnchorNodeId ?? nodeId,
    })
    setRightRailMode("properties")
  }, [finalizeInlineEditBeforeResponsiveAction, state.selectionAnchorNodeId])

  const selectStyleResource = useCallback((resource: Exclude<StyleManagerResourceSelection, null>) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource(resource)
    setLeftRailMode("styles")
    openRightRailMode("style")
  }, [openRightRailMode])

  const selectOutlineListGroup = useCallback((instanceId: string) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource({ kind: "list-group", id: instanceId })
    setLeftRailMode("outline")
    openRightRailMode("style")
  }, [openRightRailMode])

  const selectLeftRailNode = useCallback((nodeId: string) => {
    setSelectedStyleResource(null)
    dispatchEditorAction({ type: "SELECT_NODE", nodeId })
    setRightRailMode("properties")
  }, [dispatchEditorAction])

  const reorderLeftRailBodyChild = useCallback((request: OutlineBodyChildReorder) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource(null)
    dispatchEditorAction({ type: "REORDER_BODY_CHILD", ...request })
    setRightRailMode("properties")
  }, [dispatchEditorAction])

  const startCloneDragPointerDown = useCallback((nodeId: string, e: React.PointerEvent<SVGGElement>) => {
    startNodePointerDown({ source: "document-copy", nodeId }, e)
  }, [startNodePointerDown])

  const deleteNodeFromCanvas = useCallback((nodeId: string) => {
    finalizeInlineEditBeforeAction()
    dispatchEditorAction({ type: "DELETE_NODE", nodeId })
    setRightRailMode("page")
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction])

  const applyCanvasTableAction = useCallback((nodeId: string, action: CanvasTableAction) => {
    finalizeInlineEditBeforeAction()
    const target = resolveCanvasFlowTableActionTarget(state.doc, nodeId, action)
    if (!target) return
    if (target.type === "add-row") {
      dispatchEditorAction({ type: "TABLE_ADD_ROW", tableId: target.tableId, afterIndex: target.afterIndex })
      setRightRailMode("properties")
      return
    }
    if (target.type === "delete-row") {
      dispatchEditorAction({ type: "TABLE_REMOVE_ROW", tableId: target.tableId, rowIndex: target.rowIndex })
      dispatch({ type: "SELECT_NODE", nodeId: target.tableId, anchorNodeId: target.tableId })
      setRightRailMode("properties")
      return
    }
    if (target.type === "add-column") {
      dispatchEditorAction({ type: "TABLE_ADD_COL", tableId: target.tableId, afterIndex: target.afterIndex })
      setRightRailMode("properties")
      return
    }
    if (target.type === "delete-column") {
      dispatchEditorAction({ type: "TABLE_REMOVE_COL", tableId: target.tableId, colIndex: target.colIndex })
      dispatch({ type: "SELECT_NODE", nodeId: target.tableId, anchorNodeId: target.tableId })
      setRightRailMode("properties")
      return
    }
    dispatchEditorAction({ type: "DELETE_NODE", nodeId: target.tableId })
    setRightRailMode("page")
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction, state.doc])

  const activateWorkflowMode = useCallback((nextMode: WorkflowMode) => {
    finalizeInlineEditBeforeAction()
    if (nextMode !== "design") setSelectedStyleResource(null)
    setWorkflowMode(nextMode)
    if (nextMode === "fill") {
      setMode("fill")
      dispatch({ type: "DRAG_CANCEL" })
      hideResizePreview()
      setResizeDrag(null)
      setMinHeightDrag(null)
      setMarginDrag(null)
      setHeaderFooterReservedDrag(null)
      setMarginEditMode(null)
      setHeaderFooterEditMode(null)
      setLeftRailMode("outline")
      setRightRailMode("properties")
      return
    }

    setMode("template")
    if (nextMode === "fields") {
      setLeftRailMode("add")
      setRightRailMode("properties")
      return
    }
    if (nextMode === "render") {
      setLeftRailMode("outline")
      setRightRailMode("page")
      return
    }

    setLeftRailMode("outline")
    setRightRailMode(state.selectedNodeId ? "properties" : "page")
  }, [finalizeInlineEditBeforeAction, hideResizePreview, setHeaderFooterReservedDrag, state.selectedNodeId])

  const computePreview = useCallback(
    (clientX: number, clientY: number, sourceOverride?: DragSource | null): { preview: PlacementPreview | null; sectionId: string | null } => {
      const { doc, paginated } = state
      const dragSource = sourceOverride !== undefined ? sourceOverride : state.drag?.source ?? null

      for (let si = 0; si < paginated.sections.length; si++) {
        const section = paginated.sections[si]
        for (let pi = 0; pi < section.pages.length; pi++) {
          const key = `${si}-${pi}`
          const svgEl = pageRefs.current.get(key)
          if (!svgEl) continue

          const rect = svgEl.getBoundingClientRect()
          if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue

          const svgX = clientX - rect.left
          const svgY = clientY - rect.top
          const docX = svgX / scale
          const docY = svgY / scale

          const page = section.pages[pi]
          const sectionDef = doc.document.sections[si]
          const activeHeaderFooterZone = headerFooterEditMode?.sectionIndex === si
            ? headerFooterEditMode.zone
            : null

          if (sectionDef && activeHeaderFooterZone) {
            const zoneFragments = activeHeaderFooterZone === "header"
              ? page.headerFragments ?? []
              : page.footerFragments ?? []
            const reservedHeight = Math.max(0, activeHeaderFooterZone === "header"
              ? sectionDef.page.headerReserved ?? 0
              : sectionDef.page.footerReserved ?? 0)
            const zoneY = activeHeaderFooterZone === "header"
              ? page.contentBox.y - reservedHeight
              : page.contentBox.y + page.contentBox.height
            const zoneHorizontalBox = resolveHeaderFooterHorizontalBox(sectionDef.page, page.contentBox, page.width)
            const inActiveZone =
              docX >= zoneHorizontalBox.x &&
              docX <= zoneHorizontalBox.x + zoneHorizontalBox.width &&
              docY >= zoneY &&
              docY <= zoneY + reservedHeight
            const rootId = activeHeaderFooterZone === "header"
              ? sectionDef.headerRootId
              : sectionDef.footerRootId
            const rootNode = rootId ? sectionDef.nodes[rootId] : null
            const rootTarget = rootId && rootNode?.type === "stack"
              ? { kind: "node" as const, nodeId: rootId, nodeType: "stack" as const }
              : null
            const hit = findSmallestFragmentAt(zoneFragments, docX, docY)

            if (hit) {
              if (rootTarget && hit.nodeId === rootTarget.nodeId) {
                const rawIntent = { zone: "center" as const, intent: "insertInside" as const, target: rootTarget }
                const lawResult = resolvePlacementLaw(doc, rawIntent, dragSource)
                if (lawResult.ok) {
                  return {
                    preview: { hoverNodeId: rootTarget.nodeId, zone: "center", target: rootTarget, placement: lawResult.value.intent, isValid: true },
                    sectionId: section.sectionId,
                  }
                }
                return {
                  preview: { hoverNodeId: rootTarget.nodeId, zone: "center", target: rootTarget, placement: null, isValid: false },
                  sectionId: section.sectionId,
                }
              }

              const localX = docX - hit.x
              const localY = docY - hit.y
              const targetResult = detectPlacementTarget({
                document: doc,
                hoveredNodeId: hit.nodeId,
                hoveredNodeType: hit.nodeType,
                localX,
                localY,
                width: hit.width,
                height: hit.height,
                source: dragSource,
              })

              if (!targetResult) {
                return { preview: { hoverNodeId: hit.nodeId, zone: null, target: null, placement: null, isValid: false }, sectionId: section.sectionId }
              }

              const rawIntent = { zone: targetResult.zone, intent: zoneToIntent(targetResult.zone), target: targetResult.target }
              const lawResult = resolvePlacementLaw(doc, rawIntent, dragSource)

              if (lawResult.ok) {
                return {
                  preview: { hoverNodeId: hit.nodeId, zone: targetResult.zone, target: targetResult.target, placement: lawResult.value.intent, isValid: true },
                  sectionId: section.sectionId,
                }
              }

              return {
                preview: { hoverNodeId: hit.nodeId, zone: targetResult.zone, target: targetResult.target, placement: null, isValid: false },
                sectionId: section.sectionId,
              }
            }

            if (inActiveZone && rootTarget) {
              const rawIntent = { zone: "center" as const, intent: "insertInside" as const, target: rootTarget }
              const lawResult = resolvePlacementLaw(doc, rawIntent, dragSource)
              if (lawResult.ok) {
                return {
                  preview: { hoverNodeId: rootTarget.nodeId, zone: "center", target: rootTarget, placement: lawResult.value.intent, isValid: true },
                  sectionId: section.sectionId,
                }
              }
              return {
                preview: { hoverNodeId: rootTarget.nodeId, zone: "center", target: rootTarget, placement: null, isValid: false },
                sectionId: section.sectionId,
              }
            }

            if (inActiveZone) return { preview: null, sectionId: section.sectionId }
            continue
          }

          const allFragments = page.fragments
          const pageBreakBlocker = findPageBreakDropBlocker(allFragments, page.contentBox, docX, docY)
          if (pageBreakBlocker) {
            return { preview: pageBreakBlockedPreview(pageBreakBlocker), sectionId: section.sectionId }
          }

          const hit = findSmallestFragmentAt(allFragments, docX, docY)

          if (!hit) {
            // ไม่เจอ fragment → fallback ไป body (empty body หรือ gap เหนือ/ล่าง content)
            const cb = page.contentBox
            if (docX >= cb.x && docX <= cb.x + cb.width && docY >= cb.y && docY <= cb.y + cb.height) {
              if (sectionDef) {
                const bodyId = sectionDef.bodyRootId
                const bodyTarget = { kind: "node" as const, nodeId: bodyId, nodeType: "body" as const }
                const rawIntent = { zone: "center" as const, intent: "insertInside" as const, target: bodyTarget }
                const lawResult = resolvePlacementLaw(doc, rawIntent, dragSource)
                if (lawResult.ok) {
                  return {
                    preview: { hoverNodeId: bodyId, zone: "center" as const, target: bodyTarget, placement: lawResult.value.intent, isValid: true },
                    sectionId: section.sectionId,
                  }
                }
              }
            }
            continue
          }

          const localX = docX - hit.x
          const localY = docY - hit.y
          const interactionHeight = fragmentInteractionHeightForPlacement(hit)
          if (hit.nodeType === "page-break" && localY >= interactionHeight / 2) {
            return { preview: pageBreakBlockedPreview(hit), sectionId: section.sectionId }
          }

          const targetResult = detectPlacementTarget({
            document: doc,
            hoveredNodeId: hit.nodeId,
            hoveredNodeType: hit.nodeType,
            localX, localY,
            width: hit.width,
            height: interactionHeight,
            source: dragSource,
          })

          if (!targetResult) {
            return { preview: { hoverNodeId: hit.nodeId, zone: null, target: null, placement: null, isValid: false }, sectionId: section.sectionId }
          }

          const rawIntent = { zone: targetResult.zone, intent: zoneToIntent(targetResult.zone), target: targetResult.target }
          const lawResult = resolvePlacementLaw(doc, rawIntent, dragSource)

          if (lawResult.ok) {
            return {
              preview: { hoverNodeId: hit.nodeId, zone: targetResult.zone, target: targetResult.target, placement: lawResult.value.intent, isValid: true },
              sectionId: section.sectionId,
            }
          }

          return {
            preview: { hoverNodeId: hit.nodeId, zone: targetResult.zone, target: targetResult.target, placement: null, isValid: false },
            sectionId: section.sectionId,
          }
        }
      }
      return { preview: null, sectionId: null }
    },
    [state, scale, headerFooterEditMode],
  )

  const cancelScheduledDragMove = useCallback(() => {
    pendingDragMoveRef.current = null
    if (dragMoveFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(dragMoveFrameRef.current)
    }
    dragMoveFrameRef.current = null
  }, [])

  const scheduleDragMove = useCallback((move: PendingDragMove) => {
    pendingDragMoveRef.current = move
    if (typeof requestAnimationFrame === "undefined") {
      const { preview } = computePreview(move.clientX, move.clientY, move.sourceOverride)
      dispatch({ type: "DRAG_MOVE", clientX: move.clientX, clientY: move.clientY, preview })
      return
    }
    if (dragMoveFrameRef.current !== null) return
    dragMoveFrameRef.current = requestAnimationFrame(() => {
      dragMoveFrameRef.current = null
      const pendingMove = pendingDragMoveRef.current
      pendingDragMoveRef.current = null
      if (!pendingMove) return
      const { preview } = computePreview(pendingMove.clientX, pendingMove.clientY, pendingMove.sourceOverride)
      dispatch({ type: "DRAG_MOVE", clientX: pendingMove.clientX, clientY: pendingMove.clientY, preview })
    })
  }, [computePreview])

  useEffect(() => () => cancelScheduledDragMove(), [cancelScheduledDragMove])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Header/footer reserved-height drag
      const activeHeaderFooterReservedDrag = headerFooterReservedDragRef.current
      if (activeHeaderFooterReservedDrag && !activeHeaderFooterReservedDrag.committed) {
        const svgEl = pageRefs.current.get(activeHeaderFooterReservedDrag.pageKey)
        const section = state.doc.document.sections[activeHeaderFooterReservedDrag.sectionIndex]
        if (!svgEl || !section) return
        const rect = svgEl.getBoundingClientRect()
        const docY = (e.clientY - rect.top) / scale
        const zoneKey = activeHeaderFooterReservedDrag.zone === "header" ? "headerReserved" : "footerReserved"
        const rawReserved = activeHeaderFooterReservedDrag.zone === "header"
          ? docY - activeHeaderFooterReservedDrag.marginTopPt
          : activeHeaderFooterReservedDrag.pageHeightPt - activeHeaderFooterReservedDrag.marginBottomPt - docY
        const currentReserved = clampSectionReservedZones(section, {
          ...activeHeaderFooterReservedDrag.currentReserved,
          [zoneKey]: rawReserved,
        }, zoneKey)
        scheduleHeaderFooterReservedDrag({ ...activeHeaderFooterReservedDrag, currentReserved })
        return
      }
      // Margin resize drag
      const activeMarginDrag = marginDragRef.current
      if (activeMarginDrag && !activeMarginDrag.committed) {
        const svgEl = pageRefs.current.get(activeMarginDrag.pageKey)
        if (!svgEl) return
        const rect = svgEl.getBoundingClientRect()
        const { side, pageWidthPt, pageHeightPt } = activeMarginDrag
        let rawValue: number
        if (side === "left") rawValue = (e.clientX - rect.left) / scale
        else if (side === "right") rawValue = pageWidthPt - (e.clientX - rect.left) / scale
        else if (side === "top") rawValue = (e.clientY - rect.top) / scale
        else rawValue = pageHeightPt - (e.clientY - rect.top) / scale
        const isHoriz = side === "left" || side === "right"
        const max = (isHoriz ? pageWidthPt : pageHeightPt) / 2 - 36
        const newValue = Math.max(0, Math.min(max, rawValue))
        const newMargins = { ...activeMarginDrag.currentMargins, [side]: newValue }
        if (!activeMarginDrag.altKey) {
          const opposite = side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left"
          newMargins[opposite] = newValue
        }
        scheduleMarginDrag({ ...activeMarginDrag, currentMargins: newMargins })
        return
      }
      // Resize row minHeight drag
      const activeMinHeightDrag = minHeightDragRef.current
      if (activeMinHeightDrag && !activeMinHeightDrag.committed) {
        const rawHeight = (e.clientY - activeMinHeightDrag.svgTop) / scale - activeMinHeightDrag.rowFragY
        const currentMinHeight = Math.max(activeMinHeightDrag.minPt, rawHeight)
        scheduleMinHeightDrag({ ...activeMinHeightDrag, currentMinHeight })
        return
      }
      // Resize column drag
      const activeResizeDrag = resizeDragRef.current
      if (activeResizeDrag && !activeResizeDrag.committed) {
        const rawDocX = (e.clientX - activeResizeDrag.svgLeft) / scale
        const adjustedDocX = activeResizeDrag.type === "table-column"
          ? rawDocX - activeResizeDrag.pointerOffsetDocX
          : rawDocX
        const minX = activeResizeDrag.pairX + activeResizeDrag.minWidthPt
        const maxX = activeResizeDrag.pairX + activeResizeDrag.pairWidth - activeResizeDrag.minWidthPt
        const currentDocX = Math.max(minX, Math.min(maxX, adjustedDocX))
        const nextResizeDrag = { ...activeResizeDrag, currentDocX }
        resizeDragRef.current = nextResizeDrag
        scheduleResizePreview(nextResizeDrag)
        return
      }
      // Convert pendingDrag to real drag after 5px movement
      if (pendingDragRef.current && !state.drag) {
        const dx = e.clientX - pendingDragRef.current.clientX
        const dy = e.clientY - pendingDragRef.current.clientY
        if (Math.hypot(dx, dy) > 5) {
          const { source, finalizeOnDragStart } = pendingDragRef.current
          pendingDragRef.current = null
          if (finalizeOnDragStart) finalizeInlineEditBeforeResponsiveAction()
          dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
          scheduleDragMove({ clientX: e.clientX, clientY: e.clientY, sourceOverride: source })
        }
        return
      }
      if (!state.drag) return
      scheduleDragMove({ clientX: e.clientX, clientY: e.clientY })
    },
    [
      headerFooterReservedDragRef,
      finalizeInlineEditBeforeResponsiveAction,
      marginDragRef,
      minHeightDragRef,
      resizeDragRef,
      scale,
      scheduleDragMove,
      scheduleHeaderFooterReservedDrag,
      scheduleMarginDrag,
      scheduleMinHeightDrag,
      scheduleResizePreview,
      state.doc,
      state.drag,
    ],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Commit header/footer reserved-height drag
      const activeHeaderFooterReservedDrag = headerFooterReservedDragRef.current
      if (activeHeaderFooterReservedDrag && !activeHeaderFooterReservedDrag.committed) {
        dispatchEditorAction({
          type: "UPDATE_RESERVED_ZONES",
          sectionIndex: activeHeaderFooterReservedDrag.sectionIndex,
          reserved: activeHeaderFooterReservedDrag.currentReserved,
          priority: activeHeaderFooterReservedDrag.zone === "header" ? "headerReserved" : "footerReserved",
        })
        setHeaderFooterReservedDrag(null)
        return
      }
      // Commit margin resize
      const activeMarginDrag = marginDragRef.current
      if (activeMarginDrag && !activeMarginDrag.committed) {
        dispatchEditorAction({ type: "UPDATE_MARGIN", sectionIndex: activeMarginDrag.sectionIndex, margin: activeMarginDrag.currentMargins })
        setMarginDrag(null)
        return
      }
      // Commit minHeight resize
      const activeMinHeightDrag = minHeightDragRef.current
      if (activeMinHeightDrag && !activeMinHeightDrag.committed) {
        dispatchEditorAction({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: activeMinHeightDrag.rowId, minHeight: activeMinHeightDrag.currentMinHeight })
        setMinHeightDrag(null)
        return
      }
      // Commit resize
      const activeResizeDrag = resizeDragRef.current
      if (activeResizeDrag && !activeResizeDrag.committed) {
        if (activeResizeDrag.type === "table-column") {
          const renderedLeftWidth = activeResizeDrag.currentDocX - activeResizeDrag.pairX
          const rawLeftWidth = activeResizeDrag.pairWidth > 0
            ? (renderedLeftWidth / activeResizeDrag.pairWidth) * activeResizeDrag.pairWidthAuthored
            : activeResizeDrag.leftWidthOriginal
          const newLeftWidth = Math.round(rawLeftWidth * 100) / 100
          const newRightWidth = Math.round((activeResizeDrag.pairWidthAuthored - newLeftWidth) * 100) / 100
          const nextDoc = (() => {
            let doc = state.doc
            for (const section of doc.document.sections) {
              const table = section.nodes[activeResizeDrag.tableId]
              if (table?.type === "flow-table") {
                return resizeFlowTableColumnPairForPreview(doc, activeResizeDrag.tableId, activeResizeDrag.leftColIndex, newLeftWidth, newRightWidth)
              }
            }
            return doc
          })()
          const nextPreviewDoc = resolvePreviewDoc(nextDoc)
          const nextPaginated = paginateDocument(nextPreviewDoc, editorTextMeasurer)
          precomputedBrowserPaginationRef.current = { doc: nextPreviewDoc, paginated: nextPaginated }
          dispatchEditorAction({
            type: "RESIZE_TABLE_COLUMN_PAIR",
            tableId: activeResizeDrag.tableId,
            leftColIndex: activeResizeDrag.leftColIndex,
            leftWidth: newLeftWidth,
            rightWidth: newRightWidth,
            paginated: nextPaginated,
          })
          hideResizePreview()
          setResizeDrag(null)
          return
        }
        const { leftStackId, rightStackId, pairX, pairWidth, currentDocX, totalShare } = activeResizeDrag
        const leftWidthPt = currentDocX - pairX
        // Clamp to minimum 0.01 to ensure widthShare never becomes zero or negative
        // (drag clamping already prevents this in practice, but floating-point rounding
        // near the boundary could theoretically produce 0 after Math.round)
        const rawLeftShare = Math.max(0.01, Math.round((leftWidthPt / pairWidth) * totalShare * 100) / 100)
        const nextShares = activeResizeDrag.stackKind === "flow-stack"
          ? resolveFlowStackResizePairShares({
            pairTotalShare: totalShare,
            selectedShare: rawLeftShare,
            selectedIsLeft: true,
          })
          : null
        const newLeftShare = nextShares?.leftShare ?? rawLeftShare
        const newRightShare = nextShares?.rightShare ?? Math.max(0.01, Math.round((totalShare - newLeftShare) * 100) / 100)
        const nextDoc = resizeColumnsDocument(state.doc, leftStackId, newLeftShare, rightStackId, newRightShare)
        const nextPreviewDoc = resolvePreviewDoc(nextDoc)
        const nextPaginated = paginateDocument(nextPreviewDoc, editorTextMeasurer)
        precomputedBrowserPaginationRef.current = { doc: nextPreviewDoc, paginated: nextPaginated }
        dispatchEditorAction({
          type: "RESIZE_COLUMNS",
          leftStackId,
          leftShare: newLeftShare,
          rightStackId,
          rightShare: newRightShare,
          paginated: nextPaginated,
        })
        hideResizePreview()
        setResizeDrag(null)
        return
      }
      // PendingDrag released without moving → treat as click.
      if (pendingDragRef.current) {
        cancelScheduledDragMove()
        const { source, clickAction } = pendingDragRef.current
        pendingDragRef.current = null
        if (clickAction?.type === "inline-edit") {
          if (canStartInlineEditImmediatelyForClick(clickAction)) {
            startInlineEditImmediatelyFromClick(clickAction)
            return
          }
          dispatch({
            type: "SELECT_NODE",
            nodeId: clickAction.selectNodeId ?? clickAction.nodeId,
            anchorNodeId: clickAction.nodeId,
          })
          setRightRailMode("properties")
          scheduleInlineEditStartAfterSelectionPaint(clickAction)
          return
        }
        if (source.source === "document") {
          dispatch({ type: "SELECT_NODE", nodeId: source.nodeId, anchorNodeId: source.nodeId })
          setRightRailMode("properties")
        }
        return
      }

      if (!state.drag) return
      cancelScheduledDragMove()
      const { preview, sectionId } = computePreview(e.clientX, e.clientY)

      if (preview?.isValid && preview.placement && sectionId) {
        const lawResult = resolvePlacementLaw(state.doc, {
          zone: preview.zone!,
          intent: preview.placement.intent,
          target: preview.target!,
        }, state.drag.source)

        if (lawResult.ok) {
          dispatchEditorAction({ type: "DRAG_COMMIT", op: lawResult.value.operation, sectionId })
          return
        }
      }
      dispatch({ type: "DRAG_CANCEL" })
    },
    [
      computePreview,
      cancelScheduledDragMove,
      headerFooterReservedDragRef,
      marginDragRef,
      minHeightDragRef,
      resizeDragRef,
      editorTextMeasurer,
      resolvePreviewDoc,
      setHeaderFooterReservedDrag,
      setMarginDrag,
      setMinHeightDrag,
      setResizeDrag,
      canStartInlineEditImmediatelyForClick,
      startInlineEditImmediatelyFromClick,
      scheduleInlineEditStartAfterSelectionPaint,
      state.doc,
      state.drag,
      dispatchEditorAction,
      hideResizePreview,
    ],
  )

  const handlePointerCancel = useCallback(() => {
    pendingDragRef.current = null
    cancelDeferredInlineEditStart()
    cancelScheduledDragMove()
    hideResizePreview()
    if (resizeDragRef.current && !resizeDragRef.current.committed) setResizeDrag(null)
    if (minHeightDragRef.current && !minHeightDragRef.current.committed) setMinHeightDrag(null)
    if (marginDragRef.current && !marginDragRef.current.committed) setMarginDrag(null)
    if (headerFooterReservedDragRef.current && !headerFooterReservedDragRef.current.committed) setHeaderFooterReservedDrag(null)
    if (state.drag) dispatch({ type: "DRAG_CANCEL" })
  }, [
    cancelScheduledDragMove,
    cancelDeferredInlineEditStart,
    headerFooterReservedDragRef,
    hideResizePreview,
    marginDragRef,
    minHeightDragRef,
    resizeDragRef,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMinHeightDrag,
    setResizeDrag,
    state.drag,
  ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const isTextInput = tag === "INPUT" || tag === "TEXTAREA"
    const shortcutKey = normalizeShortcutKey(e)
    if (!isTextInput && WYSIWYG_RICH_TEXT_DRAFT_ENABLED && wysiwygTextSessionState.nodeId) {
      const handledRichTextShortcut = handleWysiwygRichTextShortcut(wysiwygTextSessionState.nodeId, {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing,
      })
      if (handledRichTextShortcut) {
        e.preventDefault()
        return
      }
    }
    if (hasPlatformShortcutModifier(e) && !isTextInput) {
      if (shortcutKey === "+") {
        e.preventDefault()
        zoomIn()
        return
      }
      if (shortcutKey === "-") {
        e.preventDefault()
        zoomOut()
        return
      }
      if (shortcutKey === "0") {
        e.preventDefault()
        resetZoom()
        return
      }
    }
    if (e.key === "Escape") {
      if (inlineEditNodeId) {
        handleInlineEditEnd()
        return
      }
      if (marginDragRef.current && !marginDragRef.current.committed) {
        setMarginDrag(null)
        return
      }
      if (headerFooterReservedDragRef.current && !headerFooterReservedDragRef.current.committed) {
        setHeaderFooterReservedDrag(null)
        return
      }
      if (marginEditMode) {
        setMarginEditMode(null)
        return
      }
      if (headerFooterEditMode) {
        setHeaderFooterEditMode(null)
        return
      }
      if (state.drag) dispatch({ type: "DRAG_CANCEL" })
      else if (pendingDragRef.current) pendingDragRef.current = null
      else {
        setSelectedStyleResource(null)
        dispatch({ type: "SELECT_NODE", nodeId: null })
        setRightRailMode("page")
      }
    }
    if (e.key === "Delete" && state.selectedNodeId && !state.drag) {
      if (isTextInput) return
      e.preventDefault()
      dispatchEditorAction({ type: "DELETE_NODE", nodeId: state.selectedNodeId })
      setRightRailMode("page")
    }
    if (hasPlatformShortcutModifier(e) && !e.shiftKey && shortcutKey === "z") {
      if (isTextInput) return
      e.preventDefault()
      if (!isTemplateMode) return
      handleUndo()
    }
    if (hasPlatformShortcutModifier(e) && (shortcutKey === "y" || (e.shiftKey && shortcutKey === "z"))) {
      if (isTextInput) return
      e.preventDefault()
      if (!isTemplateMode) return
      handleRedo()
    }
  }, [
    handleWysiwygRichTextShortcut,
    dispatchEditorAction,
    handleInlineEditEnd,
    handleRedo,
    handleUndo,
    headerFooterEditMode,
    headerFooterReservedDragRef,
    inlineEditNodeId,
    isTemplateMode,
    marginEditMode,
    marginDragRef,
    resetZoom,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    state.drag,
    state.selectedNodeId,
    wysiwygTextSessionState.nodeId,
    zoomIn,
    zoomOut,
  ])

  const fieldCount = packageFieldRegistry.fields.length
  const fillIssueCount = dataReadiness.issues.length
  const workflowNavItems: EditorWorkflowNavItem[] = [
      { mode: "design", label: "Design", description: "Outline / layout", icon: "D" },
      { mode: "fields", label: "Fields", description: "Variables", icon: "{}", badge: fieldCount > 0 ? String(fieldCount) : undefined },
      { mode: "fill", label: "Fill", description: "Data entry", icon: "F", badge: fillIssueCount > 0 ? String(fillIssueCount) : undefined },
      { mode: "render", label: "Render", description: exportReadiness.canExport ? "Ready to export" : "Check export", icon: "R", badge: exportReadiness.canExport ? undefined : "!" },
    ]
  const showLayoutLoadingOverlay = isLayoutLoading && !suppressLayoutLoadingOverlay
  const showBrowserPreviewLayoutPreparing = shouldBlockEditorPreviewCanvas(browserPreviewLayout)
  const showDocumentPrepareOverlay = documentPrepareOverlayStatus !== "hidden"
  const showInlineInitialLayoutLoading = showBrowserPreviewLayoutPreparing && !showDocumentPrepareOverlay
  const documentPrepareStep = getDocumentPrepareStep(documentPrepareStepId)
  const documentPrepareTitle = documentPrepareHandoff?.templateTitle ?? null

  useEffect(() => {
    if (documentPrepareOverlayStatus !== "visible") return
    if (showBrowserPreviewLayoutPreparing) {
      setDocumentPrepareStepId("editor-build-layout")
      return
    }
    setDocumentPrepareStepId("editor-ready")
    const timeoutId = window.setTimeout(() => {
      setDocumentPrepareOverlayStatus("fading")
    }, 160)
    return () => window.clearTimeout(timeoutId)
  }, [documentPrepareOverlayStatus, showBrowserPreviewLayoutPreparing])

  useEffect(() => {
    if (documentPrepareOverlayStatus !== "fading") return
    const timeoutId = window.setTimeout(() => {
      setDocumentPrepareOverlayStatus("hidden")
      setDocumentPrepareHandoff(null)
      clearDocumentPrepareHandoff(window.sessionStorage)
    }, 240)
    return () => window.clearTimeout(timeoutId)
  }, [documentPrepareOverlayStatus])

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
      style={{ fontFamily: "monospace", background: "#f9fafb", height: "100vh", display: "flex", flexDirection: "column", cursor: state.drag ? "grabbing" : (resizeDrag && !resizeDrag.committed) ? "col-resize" : (minHeightDrag && !minHeightDrag.committed) ? "row-resize" : (marginDrag && !marginDrag.committed) ? (marginDrag.side === "left" || marginDrag.side === "right" ? "ew-resize" : "ns-resize") : (headerFooterReservedDrag && !headerFooterReservedDrag.committed) ? "ns-resize" : "default", userSelect: state.drag || (resizeDrag && !resizeDrag.committed) || (minHeightDrag && !minHeightDrag.committed) || (marginDrag && !marginDrag.committed) || (headerFooterReservedDrag && !headerFooterReservedDrag.committed) ? "none" : undefined }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onWheelCapture={handleWheelCapture}
      tabIndex={-1}
    >
      {showDocumentPrepareOverlay && (
        <DocumentPrepareOverlay
          step={documentPrepareStep}
          templateTitle={documentPrepareTitle}
          fadingOut={documentPrepareOverlayStatus === "fading"}
        />
      )}
      <div
        ref={resizePreviewRef}
        data-testid="column-resize-preview"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 2,
          height: 8,
          display: "none",
          backgroundColor: "#2563eb",
          boxShadow: "0 0 0 1px rgba(37, 99, 235, 0.18)",
          pointerEvents: "none",
          zIndex: 80,
          willChange: "transform",
        }}
      />
      <div
        id={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
        data-wysiwyg-accessibility-status="true"
        aria-live="polite"
        aria-atomic="true"
        style={SCREEN_READER_ONLY_STYLE}
      >
        {wysiwygTextAccessibilityStatus ?? ""}
      </div>
      {/* Toolbar */}
      <div
        data-structural-panel-deferred={deferNonCriticalPanelsForStructuralPaint ? "true" : "false"}
        style={{ pointerEvents: deferNonCriticalPanelsForStructuralPaint ? "none" : "auto" }}
      >
        <StructuralPaintDeferredSubtree defer={deferNonCriticalPanelsForStructuralPaint}>
          <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id="top-toolbar">
            <EditorToolbar
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
            >
              {isTemplateMode && (
                <>
                  <ListToolbar
                    doc={state.doc}
                    selectedNodeId={state.selectionAnchorNodeId ?? state.selectedNodeId}
                    editable={isTemplateMode}
                    onToggleListPreset={handleToggleListPreset}
                    onChangeListItemLevel={handleToolbarChangeListItemLevel}
                  />
                  <RichTextToolbar
                    doc={state.doc}
                    selectedNodeId={state.selectedNodeId}
                    draftParagraph={WYSIWYG_RICH_TEXT_DRAFT_ENABLED &&
                      richWysiwygDraftSessionState.nodeId === state.selectedNodeId
                      ? richWysiwygDraftSessionState.draft?.paragraph ?? null
                      : null}
                    pendingStyle={WYSIWYG_RICH_TEXT_DRAFT_ENABLED &&
                      richWysiwygDraftSessionState.nodeId === state.selectedNodeId
                      ? richWysiwygDraftSessionState.draft?.pendingStyle ?? null
                      : null}
                    textSelection={richTextToolbarSelection}
                    commandTextSelection={richTextToolbarLiveSelection}
                    editable={isTemplateMode}
                    onUpdateParagraphTextStyle={(nodeId, changes) => {
                      if (applyActiveRichTextDraftCommand(nodeId, { type: "setStyle", patch: changes })) return
                      const hadWysiwygTextSession = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId !== null
                      const finalized = finalizeInlineEditBeforeAction()
                      if (hadWysiwygTextSession && !finalized) return
                      dispatchEditorAction({ type: "UPDATE_PARAGRAPH_TEXT_STYLE", nodeId, changes })
                    }}
                    onUpdateTextRunStyleRange={(nodeId, start, end, changes) => {
                      if (applyActiveRichTextDraftCommand(nodeId, { type: "setStyle", patch: changes })) return
                      const hadWysiwygTextSession = WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionStateRef.current.nodeId !== null
                      const finalized = finalizeInlineEditBeforeAction()
                      if (hadWysiwygTextSession && !finalized) return
                      dispatchEditorAction({ type: "UPDATE_TEXT_RUN_STYLE_RANGE", nodeId, start, end, changes })
                    }}
                  />
                </>
              )}
            </EditorToolbar>
          </EditorSubtreePerfProfiler>
        </StructuralPaintDeferredSubtree>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id="left-rail">
          <div
            data-structural-panel-deferred={deferLeftRailForStructuralPaint ? "true" : "false"}
            style={{ display: "flex", flexShrink: 0, pointerEvents: deferLeftRailForStructuralPaint ? "none" : "auto" }}
          >
            <StructuralPaintDeferredSubtree defer={deferLeftRailForStructuralPaint}>
              <EditorLeftRail
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
            </StructuralPaintDeferredSubtree>
          </div>
        </EditorSubtreePerfProfiler>
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
        <div
          data-testid="editor-right-rail"
          data-width={rightRailDisplayWidth}
          style={{
            width: rightRailDisplayWidth,
            flexShrink: 0,
            display: "flex",
            borderLeft: "1px solid #e5e7eb",
            overflow: "hidden",
            background: "#fff",
            position: "relative",
            transition: rightRailResizeDrag ? "none" : "width 120ms ease",
            cursor: rightRailResizeDrag ? "col-resize" : undefined,
          }}
        >
          <div
            data-testid="editor-right-rail-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={RIGHT_RAIL_MIN_WIDTH}
            aria-valuemax={RIGHT_RAIL_MAX_WIDTH}
            aria-valuenow={rightRailCollapsed ? RIGHT_RAIL_COLLAPSED_WIDTH : rightRailWidth}
            title={rightRailCollapsed ? "Drag left to open the right panel." : "Drag to resize. Drag near the icon rail to collapse."}
            onPointerEnter={() => setRightRailResizeHandleHover(true)}
            onPointerLeave={() => setRightRailResizeHandleHover(false)}
            onMouseEnter={() => setRightRailResizeHandleHover(true)}
            onMouseLeave={() => setRightRailResizeHandleHover(false)}
            onPointerDown={startRightRailResize}
            onPointerMove={moveRightRailResize}
            onPointerUp={finishRightRailResize}
            onPointerCancel={finishRightRailResize}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 8,
              zIndex: 10,
              cursor: "col-resize",
              background: rightRailResizeDrag
                ? "rgba(37, 99, 235, 0.16)"
                : rightRailResizeHandleHover
                  ? "rgba(148, 163, 184, 0.18)"
                  : "transparent",
              boxShadow: rightRailResizeHandleActive ? "inset 2px 0 0 rgba(37, 99, 235, 0.45)" : "none",
              transition: "background 120ms ease, box-shadow 120ms ease",
            }}
          />
          <div data-testid="editor-right-rail-sidebar" style={rightRailSidebarStyle(rightRailCollapsed)}>
            <div data-testid="editor-right-rail-collapse-bookmark" style={rightRailBookmarkGroup}>
              <button
                type="button"
                data-testid="editor-right-rail-collapse"
                aria-label={rightRailCollapsed ? "Expand right panel" : "Collapse right panel"}
                aria-pressed={rightRailCollapsed}
                title={rightRailCollapsed ? "Expand right panel" : "Collapse right panel"}
                onClick={() => {
                  setRightRailResizeDrag(null)
                  setRightRailCollapsed((value) => !value)
                }}
                style={rightRailBookmarkButton(rightRailCollapsed, 24, 12)}
              >
                {rightRailCollapsed ? ">" : "<"}
              </button>
            </div>
            <div data-testid="editor-right-rail-mode-bookmarks" style={rightRailBookmarkGroup}>
              <button
                type="button"
                data-testid="editor-right-rail-mode-page"
                aria-label="Show page"
                aria-pressed={!rightRailCollapsed && rightRailMode === "page"}
                title="Page"
                onClick={() => openRightRailMode("page")}
                style={rightRailBookmarkButton(!rightRailCollapsed && rightRailMode === "page", 28, 10)}
              >
                Pg
              </button>
              <button
                type="button"
                data-testid="editor-right-rail-mode-properties"
                aria-label="Show properties"
                aria-pressed={!rightRailCollapsed && rightRailMode === "properties"}
                title="Properties"
                onClick={() => openRightRailMode("properties")}
                style={rightRailBookmarkButton(!rightRailCollapsed && rightRailMode === "properties")}
              >
                P
              </button>
              <button
                type="button"
                data-testid="editor-right-rail-mode-style"
                aria-label="Show style"
                aria-pressed={!rightRailCollapsed && rightRailMode === "style"}
                title="Style"
                disabled={!selectedStyleResourceId}
                onClick={() => {
                  if (selectedStyleResourceId) openRightRailMode("style")
                }}
                style={{
                  ...rightRailBookmarkButton(!rightRailCollapsed && rightRailMode === "style", 28, 10),
                  cursor: selectedStyleResourceId ? "pointer" : "default",
                  opacity: selectedStyleResourceId ? 1 : 0.45,
                }}
              >
                St
              </button>
            </div>
          </div>
          {rightRailContentVisible && (
            <div
              data-testid="editor-right-rail-content"
              data-structural-panel-deferred={deferNonCriticalPanelsForStructuralPaint ? "true" : "false"}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                pointerEvents: deferNonCriticalPanelsForStructuralPaint ? "none" : "auto",
              }}
            >
              <StructuralPaintDeferredSubtree defer={deferNonCriticalPanelsForStructuralPaint}>
                <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id={`right-rail-${rightRailMode}`}>
                {rightRailMode === "page" ? (
                  <div data-testid="editor-right-rail-page" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <PagePanel
                      doc={state.doc}
                      sectionIndex={activeSectionIndex}
                      editable={isTemplateMode}
                      onUpdateMargin={(sectionIndex, margin) => {
                        if (!isTemplateMode) return
                        dispatchEditorAction({ type: "UPDATE_MARGIN", sectionIndex, margin })
                      }}
                      onUpdateReservedZones={(sectionIndex, reserved, priority) => {
                        if (!isTemplateMode) return
                        dispatchEditorAction({ type: "UPDATE_RESERVED_ZONES", sectionIndex, reserved, priority })
                      }}
                      onToggleReservedZone={(sectionIndex, zone, enabled) => {
                        if (!isTemplateMode) return
                        dispatchEditorAction({
                          type: enabled ? "ENSURE_HEADER_FOOTER_ZONE_VISIBLE" : "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY",
                          sectionIndex,
                          zone,
                        })
                      }}
                      onUpdateHeaderFooterMode={(sectionIndex, mode) => {
                        if (!isTemplateMode) return
                        dispatchEditorAction({ type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE", sectionIndex, mode })
                      }}
                    />
                  </div>
                ) : rightRailMode === "style" ? (
                  <div data-testid="editor-right-rail-style" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {selectedStyleResource?.kind === "paragraph-style" ? (
                      <StyleDefinitionPanel
                        doc={state.doc}
                        selectedStyleId={selectedStyleResource.id}
                        editable={isTemplateMode}
                        onPatchStyleDefinition={(styleId, patch) => {
                          if (!isTemplateMode) return
                          finalizeInlineEditBeforeAction()
                          dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_DEFINITION", styleId, patch })
                        }}
                        onRenameStyleDefinition={(styleId, name) => {
                          if (!isTemplateMode) return
                          finalizeInlineEditBeforeAction()
                          dispatchEditorAction({ type: "RENAME_PARAGRAPH_STYLE_DEFINITION", styleId, name })
                        }}
                      />
                    ) : (
                      <ListResourceInspectorPanel
                        doc={state.doc}
                        selectedResource={selectedStyleResource}
                      />
                    )}
                  </div>
                ) : rightRailMode === "properties" ? (
                  <div data-testid="editor-right-rail-properties" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {isTemplateMode ? (
                      <PropertyPanel
                        doc={state.doc}
                        registry={packageFieldRegistry}
                        selectedNodeId={state.selectedNodeId}
                        selectionAnchorNodeId={state.selectionAnchorNodeId}
                        onUpdateProps={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PROPS", nodeId, changes })}
                        onUpdateText={(nodeId, text) => dispatchEditorAction({ type: "UPDATE_TEXT", nodeId, text })}
                        onUpdateParagraphTextStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PARAGRAPH_TEXT_STYLE", nodeId, changes })}
                        onApplyParagraphStylePreset={(nodeId, styleId) => dispatchEditorAction({ type: "APPLY_PARAGRAPH_STYLE_PRESET", nodeId, styleId })}
                        onUpdateParagraphStyleBoxOverrides={(nodeId, changes) => dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX", nodeId, changes })}
                        onUpdateParagraphStyleOverrides={(nodeId, changes) => dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_OVERRIDES", nodeId, changes })}
                        onClearParagraphStyle={(nodeId) => dispatchEditorAction({ type: "CLEAR_PARAGRAPH_STYLE", nodeId })}
                        onDetachParagraphStyle={(nodeId) => dispatchEditorAction({ type: "DETACH_PARAGRAPH_STYLE", nodeId })}
                        onResetParagraphStyleOverrides={(nodeId) => dispatchEditorAction({ type: "RESET_PARAGRAPH_STYLE_OVERRIDES", nodeId })}
                        onUpdateFieldRef={(fieldRefId, changes) => dispatchEditorAction({ type: "UPDATE_FIELD_REF", fieldRefId, changes })}
                        onUpdateParagraphBoxStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PARAGRAPH_BOX_STYLE", nodeId, changes })}
                        onUpdateFlowStackBoxStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_FLOW_STACK_BOX_STYLE", nodeId, changes })}
                        onUpdateFlowTableCellSpan={(cellId, changes) => dispatchEditorAction({ type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId, changes })}
                        onSelectNode={(nodeId) => dispatchEditorAction({ type: "SELECT_NODE", nodeId, anchorNodeId: nodeId })}
                        onSelectContextNode={selectContextNode}
                        onSelectListGroup={selectOutlineListGroup}
                        onSelectStyleResource={selectStyleResource}
                        onDelete={(nodeId) => dispatchEditorAction({ type: "DELETE_NODE", nodeId })}
                        tableOps={{
                          addRow: (tableId, afterIndex) => {
                            dispatchEditorAction({ type: "TABLE_ADD_ROW", tableId, afterIndex })
                          },
                          removeRow: (tableId, rowIndex) => {
                            dispatchEditorAction({ type: "TABLE_REMOVE_ROW", tableId, rowIndex })
                          },
                          addCol: (tableId, afterIndex) => {
                            dispatchEditorAction({ type: "TABLE_ADD_COL", tableId, afterIndex })
                          },
                          removeCol: (tableId, colIndex) => {
                            dispatchEditorAction({ type: "TABLE_REMOVE_COL", tableId, colIndex })
                          },
                          fitToWidth: (tableId) => {
                            dispatchEditorAction({ type: "TABLE_FIT_TO_WIDTH", tableId })
                          },
                        }}
                        flowRowOps={{
                          addCol: (rowId, stackId, position = "after") => {
                            dispatchEditorAction({ type: "FLOW_ROW_ADD_COL", rowId, stackId, position })
                          },
                          resizePair: (leftStackId, rightStackId, leftShare, rightShare) => {
                            dispatchEditorAction({ type: "RESIZE_COLUMNS", leftStackId, rightStackId, leftShare, rightShare })
                          },
                        }}
                      />
                    ) : (
                      <FillingPanel
                        doc={state.doc}
                        registry={packageFieldRegistry}
                        snapshot={dataSnapshot}
                        readinessIssues={dataReadiness.issues}
                        onChange={(key, value) => setDataSnapshot((prev) => setDataSnapshotValue(prev, key, value))}
                      />
                    )}
                  </div>
                ) : null}
                </EditorSubtreePerfProfiler>
              </StructuralPaintDeferredSubtree>
            </div>
          )}
        </div>
      </div>
      <EditorDragGhost drag={state.drag} />
    </div>
  )
}
