"use client"

import { useReducer, useCallback, useRef, useState, useEffect, useMemo, type PointerEvent } from "react"
import { collectPaginatedLayoutWarnings, LAYOUT_WARNINGS_BLOCKED_CODE, paginateDocument } from "@/pagination"
import { assertDocument, createDefaultDocument, normalizeDocument } from "@/document"
import {
  resizeFlowTableColumnPair as resizeFlowTableColumnPairForPreview,
  updateNodeProps,
  updateParagraphText,
} from "@/document"
import { bindDocumentWithSnapshot } from "@/binding"
import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { assessDocumentDataReadiness } from "@/readiness"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { DocumentNode, FlowTableNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type {
  DragSource,
  PlacementPreview,
  PlacementOperation,
  PlacementZone,
  PlacementIntentType,
} from "@/placement/types"
import { EditorCanvas } from "./EditorCanvas"
import { PropertyPanel } from "./PropertyPanel"
import { OutlinePanel } from "./OutlinePanel"
import { FillingPanel } from "./FillingPanel"
import { AddPanel } from "./AddPanel"
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
import { findWysiwygPageIndexInFragmentRanges, getWysiwygParagraphFragmentRanges } from "./wysiwygCaretMapping"
import {
  WYSIWYG_INLINE_EDIT_ENABLED,
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "./wysiwygInlineEditConfig"
import {
  finishWysiwygPerfSpan,
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "./wysiwygPerformance"
import {
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "./wysiwygDraftPreview"
import { resolveEditorTestScenarioFromLocation } from "./wysiwygStage3StressScenarios"
import { isParagraphInsideFlowStack, isParagraphInsideTableCell, isWysiwygTextEngineFragmentEligible } from "./wysiwygTextEligibility"
import { getPlainParagraphTextFromDocument } from "./wysiwygTextCommit"
import { useInlineEditSession } from "./useInlineEditSession"
import {
  describeWysiwygTextSessionAccessibility,
  useWysiwygTextSession,
  WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID,
} from "./useWysiwygTextSession"
import { resolvePersistableWysiwygDocument } from "./wysiwygDraftPersistence"
import {
  findEditorPageKeyByPageIndex,
  scrollElementIntoNearestView,
  shouldFollowInlineEditPageChange,
  shouldRelocateInlineEditPage,
} from "./editorPageFollow"
import {
  resolveWysiwygDraftPaginationSource,
  resolveWysiwygDraftPaginationDelayMs,
  resolveWysiwygLatestOnlyDraftPaginationDelayMs,
  shouldScheduleResponsiveContainerDraftPagination,
  shouldUseWysiwygDraftPaginationFrame,
  type WysiwygDraftPaginationLatestSnapshot,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"
import {
  effectiveFlowStackResizeMinShare,
  resolveFlowStackResizePairShares,
} from "./flowStackResize"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"
import { useAnimationFrameState } from "./useAnimationFrameState"
import { createInitialEditorState, reducer, resizeColumnsDocument, type DragState } from "./editorReducer"

export type { DragState } from "./editorReducer"

// ─── State ────────────────────────────────────────────────────────────────────

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
}

interface WysiwygDraftPaginationRequest {
  nodeId: string
  requestedDelayMs: number
  firstRequestedAtMs: number
}

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

type ZoomMode = "fit" | "manual"
type LeftRailMode = "outline" | "add"
type RightRailMode = "page" | "properties"
type WorkflowMode = "design" | "fields" | "fill" | "render"
type RightRailResizeDrag = {
  pointerId: number
  startX: number
  startWidth: number
  previewWidth: number
}

const MIN_SCALE = 0.3
const MAX_SCALE = 4
const ZOOM_STEP = 0.25
const INLINE_EDIT_PREVIEW_DEBOUNCE_MS = 0
// Keep hard reflow from settling between real key-repeat events; live echo
// carries immediate feedback until the typing burst pauses.
const WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS = 450
// Flow-stack page-boundary edits do not have a safe same-page local preview.
// Keep the authoritative draft pagination close to the input frame instead.
const FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS = 16
const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS = 48
const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS = 160
const FLOWDOC_FONT_HEADER = "X-FlowDoc-Font"
const FLOWDOC_FONT_FALLBACK_VALUE = "fallback"
const TRANSIENT_EXPORT_READINESS_REASONS = new Set([
  "server layout has not checked the current document",
  "server layout check is still running",
])

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

function firstVisibleExportReadinessReason(reasons: string[]): string | null {
  return reasons.find((reason) => !TRANSIENT_EXPORT_READINESS_REASONS.has(reason)) ?? null
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

function describeDragSource(source: DragSource): string {
  if (source.source === "palette") {
    if (source.tableSize) return `Table ${source.tableSize.rows} x ${source.tableSize.columns}`
    if (source.columnShares && source.columnShares.length > 1) return source.columnShares.map((share) => Math.round(share)).join(" | ")
    if (source.blockType === "paragraph") return "Paragraph"
    if (source.blockType === "row") return "Row"
    if (source.blockType === "flow-columns" || source.blockType === "columns") return "Column"
    if (source.blockType === "flow-table") return "Table"
    return source.blockType
  }
  if (source.source === "field") return source.field.label ?? source.field.key
  return "node"
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
  if (source.blockType === "paragraph") {
    return <span style={dragGhostDocumentIcon}>¶</span>
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
  return getPlainParagraphTextFromDocument(doc, nodeId)
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

const toolbarShellStyle: React.CSSProperties = {
  padding: "8px 16px 9px",
  background: "white",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  flexShrink: 0,
}

const workflowBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  flexWrap: "wrap",
}

const commandBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  flexWrap: "wrap",
}

const workflowNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 6,
  minWidth: 0,
  flexWrap: "wrap",
}

const workflowNavButton = (active: boolean): React.CSSProperties => ({
  width: 118,
  minHeight: 40,
  border: `1px solid ${active ? "#bfdbfe" : "#e5e7eb"}`,
  borderRadius: 6,
  background: active ? "#eff6ff" : "#f8fafc",
  color: active ? "#1d4ed8" : "#475569",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  textAlign: "left",
  boxSizing: "border-box",
  boxShadow: active ? "inset 0 -2px 0 #2563eb" : "none",
})

const workflowNavIcon = (active: boolean): React.CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 5,
  background: active ? "#dbeafe" : "#e2e8f0",
  color: active ? "#1d4ed8" : "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 800,
  flexShrink: 0,
})

const workflowNavText: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
}

const workflowNavTitle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
  fontSize: 11,
  fontWeight: 800,
}

const workflowNavDescription: React.CSSProperties = {
  fontSize: 9,
  color: "#94a3b8",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const workflowNavBadge: React.CSSProperties = {
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  padding: "0 5px",
  background: "#dbeafe",
  color: "#1d4ed8",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  fontWeight: 800,
}

const toolbarGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "center",
}

const toolbarSeparatorStyle: React.CSSProperties = {
  width: 1,
  height: 16,
  background: "#e5e7eb",
  flexShrink: 0,
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

const LEFT_RAIL_WIDTH = 260

const leftRailShellStyle: React.CSSProperties = {
  width: LEFT_RAIL_WIDTH,
  flexShrink: 0,
  borderRight: "1px solid #e5e7eb",
  background: "#fff",
  display: "flex",
  overflow: "hidden",
}

const leftRailSidebarStyle: React.CSSProperties = {
  width: 36,
  flexShrink: 0,
  borderRight: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 5,
  padding: "8px 0 8px 3px",
  position: "relative",
  zIndex: 2,
}

const leftRailContentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
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

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const initialTestScenario = useMemo(() => resolveEditorTestScenarioFromLocation(), [])
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
  const [editorTextMeasurer, setEditorTextMeasurer] = useState<TextMeasurer>(() => createBrowserTextMeasurer())
  const [editorTextMeasurerStatus, setEditorTextMeasurerStatus] = useState<EditorTextMeasurerStatus>("loading")
  const [initialLayoutReady, setInitialLayoutReady] = useState(false)
  const [fontReadyVersion, setFontReadyVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    const fallbackMeasurer = createBrowserTextMeasurer()
    resolveBrowserEditorTextMeasurer(fallbackMeasurer).then((next) => {
      if (cancelled) return
      setEditorTextMeasurer(next.measurer)
      setEditorTextMeasurerStatus(next.status)
      setFontReadyVersion((v) => v + 1)
    })
    return () => { cancelled = true }
  }, [])
  const [mode, setMode] = useState<"template" | "fill">("template")
  const [dataSnapshot, setDataSnapshot] = useState<DataSnapshotV1>(() => (
    initialTestScenario
      ? createEmptyDataSnapshot()
      : dataSnapshotFromDocumentParseResult(loadDocumentFromStorage(localStorage))
  ))
  const [packageFieldRegistry, setPackageFieldRegistry] = useState<FieldRegistryV1>(() => (
    initialTestScenario
      ? SAMPLE_FIELD_REGISTRY_V1
      : fieldRegistryFromDocumentParseResult(loadDocumentFromStorage(localStorage))
  ))
  const isTemplateMode = mode === "template"
  const activeSectionIndex = useMemo(() => (
    findSectionIndexForNode(state.doc, state.selectedNodeId)
  ), [state.doc, state.selectedNodeId])
  const resolvePreviewDoc = useCallback((doc: DocumentNode) => (
    isTemplateMode
      ? doc
      : bindDocumentWithSnapshot(doc, { registry: packageFieldRegistry, snapshot: dataSnapshot }).doc
  ), [dataSnapshot, isTemplateMode, packageFieldRegistry])
  const previewDoc = useMemo(() => resolvePreviewDoc(state.doc), [resolvePreviewDoc, state.doc])
  const isInitialLayoutPreparing = !initialLayoutReady
  const dataReadiness = useMemo(() => assessDocumentDataReadiness({
    doc: state.doc,
    registry: packageFieldRegistry,
    snapshot: dataSnapshot,
  }), [dataSnapshot, packageFieldRegistry, state.doc])
  const paginatePreviewDoc = useCallback((doc: DocumentNode) => (
    paginateDocument(resolvePreviewDoc(doc), editorTextMeasurer)
  ), [editorTextMeasurer, resolvePreviewDoc])

  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<Map<string, SVGSVGElement>>(new Map())
  const pendingDragRef = useRef<PendingDrag | null>(null)
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
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [documentIoStatus, setDocumentIoStatus] = useState<{ type: "info" | "error"; message: string } | null>(null)
  const resizePreviewRef = useRef<HTMLDivElement | null>(null)
  const resizePreviewFrameRef = useRef<number | null>(null)
  const pendingResizePreviewRef = useRef<ResizeDrag | null>(null)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const [showDrift, setShowDrift] = useState(false)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const showDriftRef = useRef(showDrift)
  useEffect(() => { showDriftRef.current = showDrift }, [showDrift])
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
  const wasInlineEditingRef = useRef(false)
  const wysiwygDraftPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wysiwygDraftPaginationFrameRef = useRef<number | null>(null)
  const wysiwygDraftPaginationDelayRef = useRef<number | null>(null)
  const wysiwygDraftPaginationGenerationRef = useRef(0)
  const wysiwygDraftPaginationSnapshotRevisionRef = useRef(0)
  const wysiwygLatestDraftPaginationSnapshotRef = useRef<WysiwygDraftPaginationLatestSnapshot | null>(null)
  const wysiwygDraftPaginationRequestRef = useRef<WysiwygDraftPaginationRequest | null>(null)

  useEffect(() => { docRef.current = state.doc }, [state.doc])
  useEffect(() => { packageFieldRegistryRef.current = packageFieldRegistry }, [packageFieldRegistry])
  useEffect(() => { dataSnapshotRef.current = dataSnapshot }, [dataSnapshot])
  useEffect(() => { paginatedRef.current = state.paginated })

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
  } = useInlineEditSession({
    getCurrentDoc: () => docRef.current,
    getCurrentPaginated: () => paginatedRef.current,
    getParagraphText: getParagraphTextFromDoc,
    paginatePreviewDoc,
    selectNode: (nodeId) => {
      dispatch({ type: "SELECT_NODE", nodeId })
      if (nodeId) setRightRailMode("properties")
    },
    updateInlineTextDraft: (nodeId, text) => {
      const startedAt = startWysiwygPerfSpan()
      dispatch({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text })
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-draft-update", startedAt, {
        nodeId,
        textLength: text.length,
      })
    },
    commitInlineTextEdit: (payload) => dispatch({ type: "COMMIT_INLINE_TEXT_EDIT", ...payload }),
    setPaginated: (paginated) => dispatch({ type: "SET_PAGINATED", paginated }),
  })
  const inlineEditPageIndexRef = useRef<number | null>(inlineEditPageIndex)
  useEffect(() => { inlineEditPageIndexRef.current = inlineEditPageIndex }, [inlineEditPageIndex])
  const inlineEditVisualLockedRef = useRef(inlineEditVisualLocked)
  useEffect(() => { inlineEditVisualLockedRef.current = inlineEditVisualLocked }, [inlineEditVisualLocked])
  const requestInlineEditPageFollow = useCallback((pageIndex: number) => {
    const pageKey = findEditorPageKeyByPageIndex(paginatedRef.current, pageIndex)
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
    state: wysiwygTextSessionState,
    start: startWysiwygTextSession,
    changeDraft: changeWysiwygTextDraft,
    moveCaret: moveWysiwygTextCaret,
    end: endWysiwygTextSession,
  } = useWysiwygTextSession({
    enabled: WYSIWYG_TEXT_ENGINE_ENABLED,
    getParagraphText: (nodeId) => getParagraphTextFromDoc(docRef.current, nodeId),
  })
  const wysiwygTextAccessibilityStatus = useMemo(
    () => describeWysiwygTextSessionAccessibility(wysiwygTextSessionState),
    [wysiwygTextSessionState],
  )
  const wysiwygTextSessionStateRef = useRef(wysiwygTextSessionState)
  const [wysiwygDraftPaginationNodeId, setWysiwygDraftPaginationNodeIdState] = useState<string | null>(null)
  const wysiwygDraftPaginationNodeIdRef = useRef<string | null>(null)
  const setWysiwygDraftPaginationNodeId = useCallback((nodeId: string | null) => {
    wysiwygDraftPaginationNodeIdRef.current = nodeId
    setWysiwygDraftPaginationNodeIdState(nodeId)
  }, [])
  useEffect(() => { wysiwygTextSessionStateRef.current = wysiwygTextSessionState }, [wysiwygTextSessionState])

  const getPersistableDocumentSnapshot = useCallback(() => {
    try {
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
    wysiwygDraftPaginationGenerationRef.current += 1
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
    const requestedDelayMs = Math.max(0, debounceMs)
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now()
    const pendingRequest = wysiwygDraftPaginationRequestRef.current
    const isResponsiveRequest = requestedDelayMs <= FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS
    const canReuseResponsiveWindow = isResponsiveRequest &&
      pendingRequest?.nodeId === nodeId &&
      pendingRequest.requestedDelayMs <= FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS
    const firstRequestedAtMs = canReuseResponsiveWindow
      ? pendingRequest.firstRequestedAtMs
      : nowMs
    const scheduledDelayMs = resolveWysiwygLatestOnlyDraftPaginationDelayMs({
      requestedDelayMs,
      responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      quietWindowMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS,
      maxLagMs: WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS,
      firstRequestedAtMs,
      nowMs,
    })

    const request: WysiwygDraftPaginationRequest = {
      nodeId,
      requestedDelayMs,
      firstRequestedAtMs,
    }
    wysiwygDraftPaginationRequestRef.current = request
    wysiwygDraftPaginationDelayRef.current = scheduledDelayMs

    const runDraftPagination = (generation: number) => {
      if (generation !== wysiwygDraftPaginationGenerationRef.current) return
      const activeRequest = wysiwygDraftPaginationRequestRef.current
      if (!activeRequest) return
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
      const draftDoc = buildWysiwygTextDraftPreviewDocument({
        doc: docRef.current,
        nodeId: activeNodeId,
        draftText: source.draftText,
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
        ...summarizePaginatedForWysiwygPerf(paginated),
      })
      if (generation !== wysiwygDraftPaginationGenerationRef.current) return
      const nextSource = resolveWysiwygDraftPaginationSource({
        nodeId: activeNodeId,
        session: wysiwygTextSessionStateRef.current,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      if (!nextSource) return
      if (nextSource.revision !== source.revision) {
        scheduleWysiwygDraftPagination(activeNodeId, activeRequest.requestedDelayMs)
        return
      }
      const ranges = getWysiwygParagraphFragmentRanges(paginated, activeNodeId)
      const isTableCellParagraph = isParagraphInsideTableCell(draftDoc, activeNodeId)
      const nextPageIndex = source.caretOffset == null
        ? null
        : findWysiwygPageIndexInFragmentRanges(ranges, source.caretOffset, {
          preferPreviousPageAtFragmentEnd: isTableCellParagraph,
        })
      paginatedRef.current = paginated
      optimisticLayoutRef.current = { doc: draftDoc, paginated }
      if (shouldRelocateInlineEditPage({
        nextPageIndex,
        isVisualLocked: inlineEditVisualLockedRef.current,
      })) {
        const previousPageIndex = inlineEditPageIndexRef.current
        inlineEditPageIndexRef.current = nextPageIndex!
        setInlineEditPageIndex(nextPageIndex!)
        if (shouldFollowInlineEditPageChange({ previousPageIndex, nextPageIndex: nextPageIndex! })) {
          requestInlineEditPageFollow(nextPageIndex!)
        }
      }
      const currentFragmentCount = countWysiwygTextDraftFragments(paginated, activeNodeId)
      setWysiwygDraftPaginationNodeId(shouldScheduleResponsiveContainerDraftPagination({
        isFlowStackParagraph: isParagraphInsideFlowStack(draftDoc, activeNodeId),
        isTableCellParagraph,
        draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === activeNodeId,
        currentFragmentCount,
      }) ? activeNodeId : null)
      dispatch({ type: "SET_PAGINATED", paginated })
      markInlineEditVisualFresh(inlineEditDraftVersionRef.current)
    }

    if (wysiwygDraftPaginationDebounceRef.current) {
      clearTimeout(wysiwygDraftPaginationDebounceRef.current)
      wysiwygDraftPaginationDebounceRef.current = null
    }
    if (wysiwygDraftPaginationFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(wysiwygDraftPaginationFrameRef.current)
      wysiwygDraftPaginationFrameRef.current = null
    }

    const generation = ++wysiwygDraftPaginationGenerationRef.current
    const useAnimationFrame = shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: scheduledDelayMs,
      responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      canUseAnimationFrame: typeof requestAnimationFrame !== "undefined",
    })
    if (useAnimationFrame) {
      wysiwygDraftPaginationFrameRef.current = requestAnimationFrame(() => runDraftPagination(generation))
      return
    }

    wysiwygDraftPaginationDebounceRef.current = setTimeout(() => runDraftPagination(generation), scheduledDelayMs)
  }, [
    inlineEditDraftVersionRef,
    markInlineEditVisualFresh,
    paginatePreviewDoc,
    requestInlineEditPageFollow,
    setInlineEditPageIndex,
    setWysiwygDraftPaginationNodeId,
  ])

  const finalizeWysiwygTextSessionBeforeAction = useCallback((): boolean => {
    const session = wysiwygTextSessionState
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || !session.nodeId) return false
    const afterDoc = normalizeDocument(updateParagraphText(docRef.current, session.nodeId, session.draftText))
    try {
      assertDocument(afterDoc)
    } catch (error) {
      console.error("WYSIWYG text finalize produced invalid document:", error)
      return false
    }
    const afterPaginated = paginatePreviewDoc(afterDoc)
    const history = consumeInlineEditHistory(session.nodeId)
    docRef.current = afterDoc
    paginatedRef.current = afterPaginated
    dispatch({
      type: "COMMIT_WYSIWYG_TEXT_EDIT",
      nodeId: session.nodeId,
      text: session.draftText,
      beforeText: session.baseText,
      history,
      afterPaginated,
    })
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    resetInlineEditStateForDocumentReplace()
    return true
  }, [
    clearWysiwygDraftPagination,
    consumeInlineEditHistory,
    endWysiwygTextSession,
    paginatePreviewDoc,
    resetInlineEditStateForDocumentReplace,
    wysiwygTextSessionState,
  ])

  const finalizeInlineEditBeforeAction = useCallback((): boolean => {
    if (finalizeWysiwygTextSessionBeforeAction()) return true
    return finalizeLegacyInlineEditBeforeAction()
  }, [finalizeLegacyInlineEditBeforeAction, finalizeWysiwygTextSessionBeforeAction])

  const handleInlineEditStart = useCallback((nodeId: string, caretIndex: number | null = null, pageIndex: number | null = null) => {
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionState.nodeId && wysiwygTextSessionState.nodeId !== nodeId) {
      finalizeInlineEditBeforeAction()
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
    finalizeInlineEditBeforeAction,
    endWysiwygTextSession,
    moveWysiwygTextCaret,
    startInlineEditSession,
    startWysiwygTextSession,
    wysiwygTextSessionState.nodeId,
  ])

  const handleInlineEditEnd = useCallback((nodeId?: string, reason: "blur" | "keyboard" = "keyboard") => {
    const restoreEditorFocus = () => {
      if (reason !== "keyboard") return
      requestAnimationFrame(() => editorRootRef.current?.focus())
    }
    if (WYSIWYG_TEXT_ENGINE_ENABLED && wysiwygTextSessionState.nodeId && (!nodeId || nodeId === wysiwygTextSessionState.nodeId)) {
      finalizeInlineEditBeforeAction()
      restoreEditorFocus()
      return
    }
    endInlineEditSession(nodeId, reason)
    restoreEditorFocus()
  }, [endInlineEditSession, finalizeInlineEditBeforeAction, wysiwygTextSessionState.nodeId])

  const handleWysiwygTextDraftChange = useCallback((nodeId: string, text: string, caretIndex: number | null, selection?: { anchorOffset: number; focusOffset: number } | null) => {
    if (wysiwygTextSessionState.nodeId !== nodeId) return
    const nextSnapshotRevision = wysiwygDraftPaginationSnapshotRevisionRef.current + 1
    wysiwygDraftPaginationSnapshotRevisionRef.current = nextSnapshotRevision
    wysiwygLatestDraftPaginationSnapshotRef.current = {
      nodeId,
      draftText: text,
      caretOffset: caretIndex,
      revision: nextSnapshotRevision,
    }
    const textChanged = text !== wysiwygTextSessionState.draftText
    if (!textChanged) {
      moveWysiwygTextCaret(caretIndex, selection)
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
    const currentFragmentCount = countWysiwygTextDraftFragments(paginatedRef.current, nodeId)
    const useResponsiveDraftPagination = shouldScheduleResponsiveContainerDraftPagination({
      isFlowStackParagraph,
      isTableCellParagraph,
      draftPaginationActive,
      currentFragmentCount,
    })
    if (useResponsiveDraftPagination) {
      setWysiwygDraftPaginationNodeId(nodeId)
      scheduleWysiwygDraftPagination(nodeId, resolveWysiwygDraftPaginationDelayMs({
        draftPaginationActive: true,
        isFlowStackParagraph,
        isTableCellParagraph,
        defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
        flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      }))
    }
  }, [
    changeWysiwygTextDraft,
    handleInlineEditCaretChange,
    moveWysiwygTextCaret,
    scheduleWysiwygDraftPagination,
    setWysiwygDraftPaginationNodeId,
    wysiwygTextSessionState.draftText,
    wysiwygTextSessionState.nodeId,
    wysiwygDraftPaginationNodeId,
  ])

  const handleInlineEditHeightPreviewChange = useCallback((nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => {
    handleInlineEditHeightChange(nodeId, height, pageIndex)
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || wysiwygTextSessionState.nodeId !== nodeId) return
    if (reflow && !reflow.shouldPatchSamePageHeight) return
    dispatch({ type: "SET_INLINE_EDIT_HEIGHT", nodeId, height, pageIndex, reflow })
  }, [handleInlineEditHeightChange, wysiwygTextSessionState.nodeId])

  const handleWysiwygTextReflowDecision = useCallback((nodeId: string, reflow: WysiwygTextReflowDecision) => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED || wysiwygTextSessionState.nodeId !== nodeId) return
    if (!reflow.shouldQueueSettledPagination) return
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const isTableCellParagraph = isParagraphInsideTableCell(docRef.current, nodeId)
    scheduleWysiwygDraftPagination(nodeId, resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph,
      isTableCellParagraph,
      defaultDelayMs: WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS,
      flowStackBoundaryDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
    }))
  }, [scheduleWysiwygDraftPagination, wysiwygTextSessionState.nodeId])

  // ─── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialTestScenario) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistry, dataSnapshot)
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

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocumentIoStatus(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parsePersistedDocument(ev.target?.result as string)
      if (result.ok) {
        const doc = result.doc
        resetInlineEditStateForDocumentReplace()
        clearWysiwygDraftPagination()
        endWysiwygTextSession()
        setPackageFieldRegistry(fieldRegistryFromDocumentParseResult(result))
        setDataSnapshot(dataSnapshotFromDocumentParseResult(result))
        dispatch({ type: "LOAD_DOCUMENT", doc, paginated: paginatePreviewDoc(doc) })
        setDocumentIoStatus({ type: "info", message: documentImportSuccessMessage(result.source, result.fieldRegistryIssues) })
      } else {
        setDocumentIoStatus({ type: "error", message: documentParseFailureMessage(result.reason) })
      }
    }
    reader.onerror = () => {
      setDocumentIoStatus({ type: "error", message: "Could not read this file." })
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [clearWysiwygDraftPagination, endWysiwygTextSession, paginatePreviewDoc, resetInlineEditStateForDocumentReplace])

  const handleNewDocument = useCallback(() => {
    if (!confirm("สร้างเอกสารใหม่? history จะถูกล้าง")) return
    const doc = createDefaultDocument("Untitled")
    resetInlineEditStateForDocumentReplace()
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    setPackageFieldRegistry(SAMPLE_FIELD_REGISTRY_V1)
    setDataSnapshot(createEmptyDataSnapshot())
    dispatch({ type: "LOAD_DOCUMENT", doc, paginated: paginatePreviewDoc(doc) })
  }, [clearWysiwygDraftPagination, endWysiwygTextSession, paginatePreviewDoc, resetInlineEditStateForDocumentReplace])

  const handleCanvasScaleChange = useCallback((nextScale: number) => {
    setScale(clampScale(nextScale))
  }, [])

  const handleUndo = useCallback(() => {
    if (!isTemplateMode) return
    const hadInlineEdit = finalizeInlineEditBeforeAction()
    if (state.past.length === 0 && !hadInlineEdit) return
    dispatch({ type: "UNDO" })
  }, [finalizeInlineEditBeforeAction, isTemplateMode, state.past])

  const handleRedo = useCallback(() => {
    if (!isTemplateMode) return
    const hadInlineEdit = finalizeInlineEditBeforeAction()
    if (state.future.length === 0 && !hadInlineEdit) return
    dispatch({ type: "REDO" })
  }, [finalizeInlineEditBeforeAction, isTemplateMode, state.future])

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

  const handleSplitParagraph = useCallback((nodeId: string, splitIndex: number) => {
    const history = consumeInlineEditHistory(nodeId)
    dispatch({ type: "SPLIT_PARAGRAPH", nodeId, splitIndex, history })
  }, [consumeInlineEditHistory])

  const handleMergeParagraph = useCallback((nodeId: string) => {
    const history = consumeInlineEditHistory(nodeId)
    dispatch({ type: "MERGE_PARAGRAPH", nodeId, history })
  }, [consumeInlineEditHistory])

  // Focus the new paragraph after a split
  useEffect(() => {
    if (!state.lastSplitNodeId) return
    const nodeId = state.lastSplitNodeId
    startInlineEditAfterStructuralChange(nodeId, 0)
    dispatch({ type: "CLEAR_SPLIT_NODE_ID" })
  }, [startInlineEditAfterStructuralChange, state.lastSplitNodeId])

  // Focus the previous paragraph after a merge, caret at join point
  useEffect(() => {
    if (!state.mergeResult) return
    const nodeId = state.mergeResult.prevNodeId
    startInlineEditAfterStructuralChange(nodeId, state.mergeResult.caretIndex)
    dispatch({ type: "CLEAR_MERGE_RESULT" })
  }, [startInlineEditAfterStructuralChange, state.mergeResult])

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
  const browserPaginationGenerationRef = useRef(0)
  const suppressNextLayoutLoadingOverlayRef = useRef(false)
  const precomputedBrowserPaginationRef = useRef<OptimisticLayoutSnapshot | null>(null)
  const optimisticLayoutRef = useRef<OptimisticLayoutSnapshot | null>(null)
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
    isTemplateMode,
    layoutError,
    layoutStatus,
    serverLayoutCheckedForCurrentPreview,
  ])
  const exportReadinessMessage = formatExportReadinessMessage(exportReadiness)
  const exportReadinessStatusReason = firstVisibleExportReadinessReason(exportReadiness.reasons)
  useEffect(() => {
    browserPaginationGenerationRef.current += 1
  }, [inlineEditNodeId])
  const suppressNextLayoutLoadingOverlay = useCallback(() => {
    suppressNextLayoutLoadingOverlayRef.current = true
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

  const handleExport = useCallback(async (format: "pdf" | "docx") => {
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
      setExportError(`${formatLabel} export blocked: ${blockedReason}`)
      return
    }

    setExportError(null)
    setIsExporting(true)
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: exportDoc, format }),
      })
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
          setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
          return
        }
        if (errorCode === LAYOUT_WARNINGS_BLOCKED_CODE) {
          setExportError(`${formatLabel} export blocked: layout warnings block final export`)
          return
        }
        throw new Error(`export failed: ${res.status} ${errorCode ?? ""} ${errorMessage}`)
      }
      if (res.headers.get(FLOWDOC_FONT_HEADER) === FLOWDOC_FONT_FALLBACK_VALUE) {
        setFontFallback(true)
        setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
        return
      }
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
      setExportError(null)
    } catch (err) {
      setExportError(`${formatLabel} export failed. Please try again.`)
      console.error("export error:", err)
    } finally {
      setIsExporting(false)
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
    const startedAt = startWysiwygPerfSpan()
    const paginated = paginateDocument(previewDoc, editorTextMeasurer)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "inline-edit-exit-pagination", startedAt, {
      source: "inline-edit-exit",
      ...summarizePaginatedForWysiwygPerf(paginated),
    })
    optimisticLayoutRef.current = { doc: previewDoc, paginated }
    dispatch({ type: "SET_PAGINATED", paginated })
  }, [editorTextMeasurer, inlineEditNodeId, previewDoc])

  // Full browser pagination — optimistic visual layout. During inline editing
  // this runs against previewDoc so draft text can split across pages before
  // blur; server/API pagination below remains authoritative for export/drift.
  useEffect(() => {
    if (interactiveDebounceRef.current) clearTimeout(interactiveDebounceRef.current)

    // Use ref for debounce time so edit mode enter/exit doesn't re-trigger pagination.
    // Entering edit mode changes inlineEditNodeId but not previewDoc, so this
    // effect only reruns when the draft document or measurement inputs change.
    const generation = ++browserPaginationGenerationRef.current
    const inlineEditNodeIdAtSchedule = inlineEditNodeIdRef.current
    const inlineEditDraftVersionAtSchedule = inlineEditNodeIdAtSchedule
      ? inlineEditDraftVersionRef.current
      : null
    const debounceMs = inlineEditNodeIdAtSchedule ? INLINE_EDIT_PREVIEW_DEBOUNCE_MS : 16
    const precomputedPagination = precomputedBrowserPaginationRef.current
    if (precomputedPagination) {
      precomputedBrowserPaginationRef.current = null
      if (precomputedPagination.doc === previewDoc) {
        optimisticLayoutRef.current = precomputedPagination
        if (isEditorTextMeasurerReady(editorTextMeasurerStatus)) {
          setInitialLayoutReady(true)
        }
        return () => undefined
      }
    }
    interactiveDebounceRef.current = setTimeout(() => {
      if (generation !== browserPaginationGenerationRef.current) return
      if (inlineEditNodeIdAtSchedule !== inlineEditNodeIdRef.current) return
      const startedAt = startWysiwygPerfSpan()
      const paginated = paginateDocument(previewDoc, editorTextMeasurer)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
        nodeId: inlineEditNodeIdAtSchedule ?? undefined,
        draftVersion: inlineEditDraftVersionAtSchedule,
        scheduledDelayMs: debounceMs,
        source: inlineEditNodeIdAtSchedule ? "inline-edit-preview" : "document-preview",
        ...summarizePaginatedForWysiwygPerf(paginated),
      })
      if (generation !== browserPaginationGenerationRef.current) return
      if (inlineEditNodeIdAtSchedule !== inlineEditNodeIdRef.current) return
      optimisticLayoutRef.current = { doc: previewDoc, paginated }
      dispatch({ type: "SET_PAGINATED", paginated })
      if (isEditorTextMeasurerReady(editorTextMeasurerStatus)) {
        setInitialLayoutReady(true)
      }
      if (inlineEditDraftVersionAtSchedule !== null) {
        markInlineEditVisualFresh(inlineEditDraftVersionAtSchedule)
      }
    }, debounceMs)

    return () => { if (interactiveDebounceRef.current) clearTimeout(interactiveDebounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTextMeasurer, editorTextMeasurerStatus, fontReadyVersion, markInlineEditVisualFresh, previewDoc])

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

    window.addEventListener("pagehide", cancelForPageTransition, { once: true })

    if (serverPaginationDebounceRef.current) clearTimeout(serverPaginationDebounceRef.current)
    serverPaginationDebounceRef.current = setTimeout(() => {
      controller = new AbortController()
      setIsLayoutLoading(true)
      setLayoutStatus("reconciling")

      void fetch("/api/paginate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewDoc),
        signal: controller.signal,
      })
        .then(async (res) => {
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
  }, [previewDoc])

  useEffect(() => {
    if (!isLayoutLoading) {
      if (resizeDragRef.current?.committed) setResizeDrag(null)
      if (minHeightDragRef.current?.committed) setMinHeightDrag(null)
      if (marginDragRef.current?.committed) setMarginDrag(null)
    }
  }, [isLayoutLoading, marginDragRef, minHeightDragRef, resizeDragRef, setMarginDrag, setMinHeightDrag, setResizeDrag])

  const setPageRef = useCallback((key: string, el: SVGSVGElement | null) => {
    if (el) pageRefs.current.set(key, el)
    else pageRefs.current.delete(key)
  }, [])

  const handleBackgroundPointerDown = useCallback(() => {
    if (inlineEditNodeId) {
      finalizeInlineEditBeforeAction()
      dispatch({ type: "SELECT_NODE", nodeId: null })
      setRightRailMode("page")
      return
    }
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
  }, [finalizeInlineEditBeforeAction, inlineEditNodeId])

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
    setMarginDrag({ sectionIndex, side, pageWidthPt, pageHeightPt, currentMargins, pageKey, altKey })
  }, [finalizeInlineEditBeforeAction])

  // Palette drag: starts immediately
  const startPaletteDrag = useCallback((source: DragSource, e: React.PointerEvent) => {
    e.preventDefault()
    finalizeInlineEditBeforeAction()
    dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
  }, [finalizeInlineEditBeforeAction])

  // Canvas fragment pointerDown: wait for movement before committing to drag
  const startNodePointerDown = useCallback((source: DragSource, e: React.PointerEvent, clickAction?: PendingClickAction) => {
    e.preventDefault()
    finalizeInlineEditBeforeAction()
    pendingDragRef.current = { source, clientX: e.clientX, clientY: e.clientY, clickAction }
  }, [finalizeInlineEditBeforeAction])

  const activateWorkflowMode = useCallback((nextMode: WorkflowMode) => {
    finalizeInlineEditBeforeAction()
    setWorkflowMode(nextMode)
    if (nextMode === "fill") {
      setMode("fill")
      dispatch({ type: "DRAG_CANCEL" })
      hideResizePreview()
      setResizeDrag(null)
      setMinHeightDrag(null)
      setMarginDrag(null)
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
  }, [finalizeInlineEditBeforeAction, hideResizePreview, state.selectedNodeId])

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
          const allFragments = page.fragments

          let hit: PageFragment | null = null
          let hitArea = Infinity
          for (const f of allFragments) {
            if (docX >= f.x && docX <= f.x + f.width && docY >= f.y && docY <= f.y + f.height) {
              const area = f.width * f.height
              if (area < hitArea) { hit = f; hitArea = area }
            }
          }

          if (!hit) {
            // ไม่เจอ fragment → fallback ไป body (empty body หรือ gap เหนือ/ล่าง content)
            const cb = page.contentBox
            if (docX >= cb.x && docX <= cb.x + cb.width && docY >= cb.y && docY <= cb.y + cb.height) {
              const sectionDef = doc.document.sections[si]
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
          const targetResult = detectPlacementTarget({
            document: doc,
            hoveredNodeId: hit.nodeId,
            hoveredNodeType: hit.nodeType,
            localX, localY,
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
      }
      return { preview: null, sectionId: null }
    },
    [state, scale],
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
          const { source } = pendingDragRef.current
          pendingDragRef.current = null
          dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
          scheduleDragMove({ clientX: e.clientX, clientY: e.clientY, sourceOverride: source })
        }
        return
      }
      if (!state.drag) return
      scheduleDragMove({ clientX: e.clientX, clientY: e.clientY })
    },
    [
      marginDragRef,
      minHeightDragRef,
      resizeDragRef,
      scale,
      scheduleDragMove,
      scheduleMarginDrag,
      scheduleMinHeightDrag,
      scheduleResizePreview,
      state.drag,
    ],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Commit margin resize
      const activeMarginDrag = marginDragRef.current
      if (activeMarginDrag && !activeMarginDrag.committed) {
        suppressNextLayoutLoadingOverlay()
        dispatch({ type: "UPDATE_MARGIN", sectionIndex: activeMarginDrag.sectionIndex, margin: activeMarginDrag.currentMargins })
        setMarginDrag(null)
        return
      }
      // Commit minHeight resize
      const activeMinHeightDrag = minHeightDragRef.current
      if (activeMinHeightDrag && !activeMinHeightDrag.committed) {
        suppressNextLayoutLoadingOverlay()
        dispatch({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: activeMinHeightDrag.rowId, minHeight: activeMinHeightDrag.currentMinHeight })
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
          suppressNextLayoutLoadingOverlay()
          dispatch({
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
        suppressNextLayoutLoadingOverlay()
        dispatch({
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
          dispatch({ type: "SELECT_NODE", nodeId: clickAction.selectNodeId ?? clickAction.nodeId })
          setRightRailMode("properties")
          handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex)
          return
        }
        if (source.source === "document") {
          dispatch({ type: "SELECT_NODE", nodeId: source.nodeId })
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
          dispatch({ type: "DRAG_COMMIT", op: lawResult.value.operation, sectionId })
          return
        }
      }
      dispatch({ type: "DRAG_CANCEL" })
    },
    [
      computePreview,
      cancelScheduledDragMove,
      handleInlineEditStart,
      marginDragRef,
      minHeightDragRef,
      resizeDragRef,
      editorTextMeasurer,
      resolvePreviewDoc,
      setMarginDrag,
      setMinHeightDrag,
      setResizeDrag,
      state.doc,
      state.drag,
      suppressNextLayoutLoadingOverlay,
      hideResizePreview,
    ],
  )

  const handlePointerCancel = useCallback(() => {
    pendingDragRef.current = null
    cancelScheduledDragMove()
    hideResizePreview()
    if (resizeDragRef.current && !resizeDragRef.current.committed) setResizeDrag(null)
    if (minHeightDragRef.current && !minHeightDragRef.current.committed) setMinHeightDrag(null)
    if (marginDragRef.current && !marginDragRef.current.committed) setMarginDrag(null)
    if (state.drag) dispatch({ type: "DRAG_CANCEL" })
  }, [
    cancelScheduledDragMove,
    hideResizePreview,
    marginDragRef,
    minHeightDragRef,
    resizeDragRef,
    setMarginDrag,
    setMinHeightDrag,
    setResizeDrag,
    state.drag,
  ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const isTextInput = tag === "INPUT" || tag === "TEXTAREA"
    const shortcutKey = normalizeShortcutKey(e)
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
      if (state.drag) dispatch({ type: "DRAG_CANCEL" })
      else if (pendingDragRef.current) pendingDragRef.current = null
      else {
        dispatch({ type: "SELECT_NODE", nodeId: null })
        setRightRailMode("page")
      }
    }
    if (e.key === "Delete" && state.selectedNodeId && !state.drag) {
      if (isTextInput) return
      e.preventDefault()
      dispatch({ type: "DELETE_NODE", nodeId: state.selectedNodeId })
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
  }, [handleInlineEditEnd, handleRedo, handleUndo, inlineEditNodeId, isTemplateMode, resetZoom, state.drag, state.selectedNodeId, zoomIn, zoomOut])

  const fieldCount = packageFieldRegistry.fields.length
  const fillIssueCount = dataReadiness.issues.length
  const workflowNavItems: Array<{
    mode: WorkflowMode
    label: string
    description: string
    icon: string
    badge?: string
  }> = [
      { mode: "design", label: "Design", description: "Outline / layout", icon: "D" },
      { mode: "fields", label: "Fields", description: "Variables", icon: "{}", badge: fieldCount > 0 ? String(fieldCount) : undefined },
      { mode: "fill", label: "Fill", description: "Data entry", icon: "F", badge: fillIssueCount > 0 ? String(fillIssueCount) : undefined },
      { mode: "render", label: "Render", description: exportReadiness.canExport ? "Ready to export" : "Check export", icon: "R", badge: exportReadiness.canExport ? undefined : "!" },
    ]
  const showLayoutLoadingOverlay = isLayoutLoading && !suppressLayoutLoadingOverlay

  return (
    <div
      ref={editorRootRef}
      data-testid="editor-shell"
      data-editor-test-scenario={initialTestScenario?.id ?? undefined}
      data-wysiwyg-text-engine-enabled={WYSIWYG_TEXT_ENGINE_ENABLED ? "true" : "false"}
      data-wysiwyg-perf-trace-enabled={WYSIWYG_PERF_TRACE_ENABLED ? "true" : "false"}
      style={{ fontFamily: "monospace", background: "#f9fafb", height: "100vh", display: "flex", flexDirection: "column", cursor: state.drag ? "grabbing" : (resizeDrag && !resizeDrag.committed) ? "col-resize" : (minHeightDrag && !minHeightDrag.committed) ? "row-resize" : (marginDrag && !marginDrag.committed) ? (marginDrag.side === "left" || marginDrag.side === "right" ? "ew-resize" : "ns-resize") : "default", userSelect: state.drag || (resizeDrag && !resizeDrag.committed) || (minHeightDrag && !minHeightDrag.committed) || (marginDrag && !marginDrag.committed) ? "none" : undefined }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onWheelCapture={handleWheelCapture}
      tabIndex={-1}
    >
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
      <div data-testid="editor-toolbar" style={toolbarShellStyle}>
        <div data-testid="editor-workflow-bar" style={workflowBarStyle}>
          <span style={{ fontSize: 13, fontWeight: "bold", color: "#111827", flexShrink: 0 }}>FlowDoc Editor</span>
          <div data-testid="editor-workflow-nav" style={workflowNavStyle}>
            {workflowNavItems.map((item) => {
              const active = workflowMode === item.mode
              return (
                <button
                  key={item.mode}
                  type="button"
                  data-testid={`editor-workflow-${item.mode}`}
                  aria-pressed={active}
                  title={`${item.label}: ${item.description}`}
                  onClick={() => activateWorkflowMode(item.mode)}
                  style={workflowNavButton(active)}
                >
                  <span style={workflowNavIcon(active)}>{item.icon}</span>
                  <span style={workflowNavText}>
                    <span style={workflowNavTitle}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                      {item.badge && <span style={workflowNavBadge}>{item.badge}</span>}
                    </span>
                    <span style={workflowNavDescription}>{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", minHeight: 24, minWidth: 0 }}>
            <div
              data-testid="editor-status-region"
              style={{
                width: 430,
                maxWidth: "34vw",
                minWidth: 160,
                minHeight: 20,
                display: "flex",
                gap: 6,
                alignItems: "center",
                justifyContent: "flex-end",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {fontFallback && (
                <span data-testid="font-fallback-status" title="Server is using Helvetica fallback — Thai text layout may be incorrect" style={{ fontSize: 10, color: "#d97706", cursor: "help", flexShrink: 0 }}>
                  ⚠ fallback font
                </span>
              )}
              {editorTextMeasurerStatus === "loading" && (
                <span data-testid="browser-font-loading-status" title="Browser font metrics are still loading; preview may settle again shortly" style={{ fontSize: 10, color: "#64748b", cursor: "help", flexShrink: 0 }}>
                  font loading
                </span>
              )}
              {editorTextMeasurerStatus === "fallback" && !fontFallback && (
                <span data-testid="browser-font-fallback-status" title="Browser preview is using fallback text metrics; server/export pagination remains authoritative" style={{ fontSize: 10, color: "#d97706", cursor: "help", flexShrink: 0 }}>
                  ⚠ browser font
                </span>
              )}
              {layoutError && (
                <span data-testid="layout-error-badge" title="Server pagination failed — editor is showing browser preview only" style={{ fontSize: 10, color: "#dc2626", cursor: "help", flexShrink: 0 }}>
                  ⚠ layout error
                </span>
              )}
              {authoritativeLayoutWarnings.length > 0 && (
                <span
                  data-testid="layout-warning-status"
                  title={authoritativeLayoutWarnings.map((warning) => `${layoutWarningSource} ${warning.count} ${warning.message}`).join("; ")}
                  style={{ fontSize: 10, color: "#d97706", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  layout warning: {layoutWarningSource} {authoritativeLayoutWarnings[0].message}
                </span>
              )}
              {exportError && (
                <span data-testid="export-error" title={exportError} style={{ fontSize: 10, color: "#dc2626", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {exportError}
                </span>
              )}
              {exportReadinessStatusReason && !exportError && (
                <span
                  data-testid="export-readiness-status"
                  title={exportReadinessMessage ?? undefined}
                  style={{ fontSize: 10, color: "#d97706", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  export blocked: {exportReadinessStatusReason}
                </span>
              )}
              {documentIoStatus && (
                <span
                  data-testid="document-io-status"
                  title={documentIoStatus.message}
                  style={{
                    fontSize: 10,
                    color: documentIoStatus.type === "error" ? "#dc2626" : "#2563eb",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {documentIoStatus.message}
                </span>
              )}
              {state.drag && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  dragging {describeDragSource(state.drag.source)} — Esc to cancel
                </span>
              )}
            </div>
            {(["pdf", "docx"] as const).map((fmt) => {
              const disabled = isExporting || !exportReadiness.canExport
              return (
                <button
                  key={fmt}
                  disabled={disabled}
                  onClick={() => handleExport(fmt)}
                  title={!exportReadiness.canExport && exportReadinessMessage ? `Export blocked: ${exportReadinessMessage}` : undefined}
                  style={{ padding: "4px 10px", fontSize: 11, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: disabled ? "#f9fafb" : "white", color: disabled ? "#9ca3af" : "#374151" }}
                >
                  {isExporting ? "…" : `Export ${fmt.toUpperCase()}`}
                </button>
              )
            })}
          </div>
        </div>

        <div data-testid="editor-command-bar" style={commandBarStyle}>
          <div style={toolbarGroupStyle}>
            {(["Undo", "Redo"] as const).map((label) => {
              const isUndo = label === "Undo"
              const disabled = !isTemplateMode || (isUndo ? state.past.length === 0 : state.future.length === 0)
              return (
                <button key={label} disabled={disabled}
                  onClick={isUndo ? handleUndo : handleRedo}
                  title={`${label} (${isUndo ? "Ctrl+Z" : "Ctrl+Y"})`}
                  style={{ padding: "4px 8px", fontSize: 11, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: disabled ? "#d1d5db" : "#374151" }}>
                  {label}
                </button>
              )
            })}
          </div>

          <div style={toolbarSeparatorStyle} />

          <div style={toolbarGroupStyle}>
            <button
              onClick={zoomOut}
              title="Zoom out (Ctrl+-)"
              disabled={scale <= MIN_SCALE + 0.001}
              style={{ width: 26, height: 24, fontSize: 13, cursor: scale <= MIN_SCALE + 0.001 ? "not-allowed" : "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: scale <= MIN_SCALE + 0.001 ? "#d1d5db" : "#374151" }}
            >
              -
            </button>
            <button
              onClick={resetZoom}
              title="Reset zoom to 100% (Ctrl+0)"
              style={{ minWidth: 46, height: 24, padding: "0 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: zoomMode === "manual" ? "#f3f4f6" : "white", color: "#374151" }}
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={zoomIn}
              title="Zoom in (Ctrl++)"
              disabled={scale >= MAX_SCALE - 0.001}
              style={{ width: 26, height: 24, fontSize: 13, cursor: scale >= MAX_SCALE - 0.001 ? "not-allowed" : "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: scale >= MAX_SCALE - 0.001 ? "#d1d5db" : "#374151" }}
            >
              +
            </button>
            <button
              onClick={fitZoom}
              title="Fit page width"
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: zoomMode === "fit" ? "#dbeafe" : "white", color: zoomMode === "fit" ? "#1d4ed8" : "#374151", fontWeight: zoomMode === "fit" ? "bold" : "normal" }}
            >
              Fit
            </button>
          </div>

          <div style={toolbarSeparatorStyle} />

          <div style={toolbarGroupStyle}>
            <button
              onClick={() => setShowTextSegments((value) => !value)}
              title="Toggle text segment overlay"
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: showTextSegments ? "#dcfce7" : "white", color: showTextSegments ? "#166534" : "#374151" }}
            >
              Segments
            </button>
            <button
              onClick={() => setShowDrift((value) => !value)}
              title="Toggle layout drift overlay (browser vs server pagination)"
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: showDrift ? "#fff7ed" : "white", color: showDrift ? "#c2410c" : "#374151" }}
            >
              {showDrift && driftReport && driftReport.driftCount > 0
                ? `Drift ${driftReport.driftCount}/${driftReport.totalParagraphs}`
                : "Drift"}
            </button>
          </div>

          <div style={toolbarSeparatorStyle} />

          <div style={toolbarGroupStyle}>
            <button onClick={handleNewDocument}
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: "#374151" }}>
              New
            </button>
            <button onClick={() => importRef.current?.click()}
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: "#374151" }}>
              Open…
            </button>
            <input ref={importRef} type="file" accept=".flowdoc.json,.json,application/json" style={{ display: "none" }} onChange={handleImportJson} />
            <button onClick={handleExportJson}
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: "#374151" }}>
              Save JSON
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div data-testid="editor-left-rail" data-mode={leftRailMode} style={leftRailShellStyle}>
          <div data-testid="editor-left-rail-sidebar" style={leftRailSidebarStyle}>
            <div data-testid="editor-left-rail-mode-bookmarks" style={rightRailBookmarkGroup}>
              <button
                type="button"
                data-testid="editor-left-rail-mode-outline"
                aria-label="Show outline"
                aria-pressed={leftRailMode === "outline"}
                title="Outline"
                onClick={() => setLeftRailMode("outline")}
                style={rightRailBookmarkButton(leftRailMode === "outline")}
              >
                O
              </button>
              <button
                type="button"
                data-testid="editor-left-rail-mode-add"
                aria-label="Show add"
                aria-pressed={leftRailMode === "add"}
                title="Add"
                onClick={() => setLeftRailMode("add")}
                style={rightRailBookmarkButton(leftRailMode === "add", 28, 14)}
              >
                +
              </button>
            </div>
          </div>
          <div data-testid="editor-left-rail-content" style={leftRailContentStyle}>
            {leftRailMode === "outline" ? (
              <OutlinePanel
                doc={isTemplateMode ? state.doc : previewDoc}
                selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
                onAddShortcut={isTemplateMode ? () => setLeftRailMode("add") : undefined}
                onSelect={(nodeId) => {
                  if (!isTemplateMode) return
                  dispatch({ type: "SELECT_NODE", nodeId })
                  setRightRailMode("properties")
                }}
                onReorderBodyChild={isTemplateMode ? (request) => {
                  finalizeInlineEditBeforeAction()
                  dispatch({ type: "REORDER_BODY_CHILD", ...request })
                  setRightRailMode("properties")
                } : undefined}
              />
            ) : (
              <AddPanel
                registry={packageFieldRegistry}
                editable={isTemplateMode}
                onDragStart={startPaletteDrag}
                isDragging={!!state.drag}
              />
            )}
          </div>
        </div>
        {isInitialLayoutPreparing ? (
          <div
            data-testid="initial-layout-loading"
            aria-live="polite"
            style={{ flex: 1, display: "grid", placeItems: "center", overflow: "auto", padding: 24, background: "#f3f4f6", color: "#6b7280", fontSize: 12 }}
          >
            Preparing layout...
          </div>
        ) : (
          <EditorCanvas
            paginated={state.paginated}
            doc={previewDoc}
            drag={isTemplateMode ? state.drag : null}
            scale={scale}
            selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
            isLayoutLoading={showLayoutLoadingOverlay}
            textMeasurer={editorTextMeasurer}
            inlineEditVisualFresh={isTemplateMode ? inlineEditDocumentVisualReady : true}
            inlineEditNodeId={isTemplateMode ? inlineEditNodeId : null}
            inlineEditCaretIndex={isTemplateMode ? inlineEditCaretIndex : null}
            inlineEditPageIndex={isTemplateMode ? inlineEditPageIndex : null}
            inlineEditVisualLocked={isTemplateMode ? inlineEditVisualLocked : false}
            onInlineEditStart={isTemplateMode ? handleInlineEditStart : () => undefined}
            onInlineEditChange={isTemplateMode ? handleInlineEditChange : () => undefined}
            onInlineEditCaretChange={isTemplateMode ? handleInlineEditCaretChange : () => undefined}
            onInlineEditUserInteraction={isTemplateMode ? handleInlineEditUserInteraction : () => undefined}
            onInlineEditHeightChange={isTemplateMode ? handleInlineEditHeightPreviewChange : () => undefined}
            onInlineEditEnd={isTemplateMode ? handleInlineEditEnd : () => undefined}
            onSplitParagraph={isTemplateMode ? handleSplitParagraph : () => undefined}
            onMergeParagraph={isTemplateMode ? handleMergeParagraph : () => undefined}
            setPageRef={setPageRef}
            onNodePointerDown={isTemplateMode ? startNodePointerDown : () => undefined}
            onBackgroundPointerDown={isTemplateMode ? handleBackgroundPointerDown : () => undefined}
            onResizeStart={isTemplateMode ? handleResizeStart : () => undefined}
            onTableColumnResizeStart={isTemplateMode ? handleTableColumnResizeStart : () => undefined}
            resizeDrag={isTemplateMode ? resizeDrag : null}
            minHeightDrag={isTemplateMode ? minHeightDrag : null}
            onMinHeightResizeStart={isTemplateMode ? handleMinHeightResizeStart : () => undefined}
            marginDrag={isTemplateMode ? marginDrag : null}
            onMarginResizeStart={isTemplateMode ? handleMarginResizeStart : () => undefined}
            onScaleChange={handleCanvasScaleChange}
            autoFitScale={zoomMode === "fit"}
            showTextSegments={showTextSegments}
            showDrift={showDrift}
            driftMap={driftReport?.driftMap ?? null}
            wysiwygInlineEditEnabled={WYSIWYG_INLINE_EDIT_ENABLED}
            wysiwygTextEngineEnabled={WYSIWYG_TEXT_ENGINE_ENABLED}
            wysiwygTextDraftNodeId={wysiwygTextSessionState.nodeId}
            wysiwygTextDraftText={wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.draftText : null}
            wysiwygTextCaretOffset={wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.caretOffset : null}
            wysiwygTextSelection={wysiwygTextSessionState.nodeId ? wysiwygTextSessionState.selection : null}
            wysiwygTextDraftPaginationActive={wysiwygDraftPaginationNodeId === wysiwygTextSessionState.nodeId}
            onWysiwygTextDraftChange={handleWysiwygTextDraftChange}
            onWysiwygTextReflowDecision={handleWysiwygTextReflowDecision}
          />
        )}
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
            </div>
          </div>
          {rightRailContentVisible && (
            <div data-testid="editor-right-rail-content" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {rightRailMode === "page" ? (
                <div data-testid="editor-right-rail-page" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <PagePanel
                    doc={state.doc}
                    sectionIndex={activeSectionIndex}
                    editable={isTemplateMode}
                    onUpdateMargin={(sectionIndex, margin) => {
                      if (!isTemplateMode) return
                      dispatch({ type: "UPDATE_MARGIN", sectionIndex, margin })
                    }}
                  />
                </div>
              ) : rightRailMode === "properties" ? (
                <div data-testid="editor-right-rail-properties" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {isTemplateMode ? (
                    <PropertyPanel
                      doc={state.doc}
                      registry={packageFieldRegistry}
                      selectedNodeId={state.selectedNodeId}
                      selectionAnchorNodeId={state.selectionAnchorNodeId}
                      onUpdateProps={(nodeId, changes) => dispatch({ type: "UPDATE_PROPS", nodeId, changes })}
                      onUpdateText={(nodeId, text) => dispatch({ type: "UPDATE_TEXT", nodeId, text })}
                      onUpdateFieldRef={(fieldRefId, changes) => dispatch({ type: "UPDATE_FIELD_REF", fieldRefId, changes })}
                      onUpdateParagraphBoxStyle={(nodeId, changes) => dispatch({ type: "UPDATE_PARAGRAPH_BOX_STYLE", nodeId, changes })}
                      onUpdateFlowStackBoxStyle={(nodeId, changes) => dispatch({ type: "UPDATE_FLOW_STACK_BOX_STYLE", nodeId, changes })}
                      onUpdateFlowTableCellSpan={(cellId, changes) => dispatch({ type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId, changes })}
                      onSelectNode={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId, anchorNodeId: nodeId })}
                      onSelectContextNode={(nodeId) => dispatch({
                        type: "SELECT_NODE",
                        nodeId,
                        anchorNodeId: state.selectionAnchorNodeId ?? nodeId,
                      })}
                      onDelete={(nodeId) => dispatch({ type: "DELETE_NODE", nodeId })}
                      tableOps={{
                        addRow: (tableId, afterIndex) => dispatch({ type: "TABLE_ADD_ROW", tableId, afterIndex }),
                        removeRow: (tableId, rowIndex) => dispatch({ type: "TABLE_REMOVE_ROW", tableId, rowIndex }),
                        addCol: (tableId, afterIndex) => dispatch({ type: "TABLE_ADD_COL", tableId, afterIndex }),
                        removeCol: (tableId, colIndex) => dispatch({ type: "TABLE_REMOVE_COL", tableId, colIndex }),
                      }}
                      flowRowOps={{
                        addCol: (rowId, stackId, position = "after") => dispatch({ type: "FLOW_ROW_ADD_COL", rowId, stackId, position }),
                        resizePair: (leftStackId, rightStackId, leftShare, rightShare) => dispatch({ type: "RESIZE_COLUMNS", leftStackId, rightStackId, leftShare, rightShare }),
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
            </div>
          )}
        </div>
      </div>
      <EditorDragGhost drag={state.drag} />
    </div>
  )
}
