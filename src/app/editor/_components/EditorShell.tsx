"use client"

import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from "react"
import { collectPaginatedLayoutWarnings, getPageDimensions, LAYOUT_WARNINGS_BLOCKED_CODE, paginateDocument } from "@/pagination"
import { defaultTextMeasurer, measureParagraph } from "@/layout"
import { assertDocument, createDefaultDocument, normalizeDocument } from "@/document"
import { applyPlacementOperation, updateNodeProps, updateParagraphText, updateFieldRefInline, updateParagraphBoxStyle, deleteNode, addTableRow, removeTableRow, addTableColumn, removeTableColumn, updateSectionMargin, splitParagraphAtIndex, mergeParagraphWithPrevious, addFlowStackColumn } from "@/document"
import type { FieldRefInlineChanges, ParagraphBoxStyleChanges } from "@/document"
import { bindDocumentWithSnapshot } from "@/binding"
import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { assessDocumentDataReadiness } from "@/readiness"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { DocumentNode, TableNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type {
  DragSource,
  PlacementPreview,
  PlacementOperation,
  PlacementZone,
  PlacementIntentType,
} from "@/placement/types"
import { EditorPalette } from "./EditorPalette"
import { FieldPalette } from "./FieldPalette"
import { EditorCanvas } from "./EditorCanvas"
import { PropertyPanel } from "./PropertyPanel"
import { OutlinePanel } from "./OutlinePanel"
import { FillingPanel } from "./FillingPanel"
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
import { resizeFragmentHeightAndShift } from "./inlineEditHeightPreview"
import { resolveEditorTestScenarioFromLocation } from "./wysiwygStage3StressScenarios"
import { isParagraphInsideFlowStack, isWysiwygTextEngineFragmentEligible } from "./wysiwygTextEligibility"
import { commitWysiwygTextEditState, getPlainParagraphTextFromDocument } from "./wysiwygTextCommit"
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
} from "./editorPageFollow"
import {
  resolveWysiwygDraftPaginationSource,
  resolveWysiwygDraftPaginationDelayMs,
  shouldCoalesceWysiwygDraftPaginationRequest,
  shouldScheduleResponsiveFlowStackDraftPagination,
  shouldUseWysiwygDraftPaginationFrame,
  type WysiwygDraftPaginationLatestSnapshot,
  type WysiwygTextReflowDecision,
} from "./wysiwygReflow"

// ─── State ────────────────────────────────────────────────────────────────────

export interface DragState {
  source: DragSource
  clientX: number
  clientY: number
  preview: PlacementPreview | null
}

interface PendingClickAction {
  type: "inline-edit"
  nodeId: string
  caretIndex: number | null
  pageIndex: number | null
}

interface PendingDrag {
  source: DragSource
  clientX: number
  clientY: number
  clickAction?: PendingClickAction
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

interface HistoryEntry {
  doc: DocumentNode
  paginated: PaginatedDocument
}

export interface ResizeDrag {
  rowId: string
  leftStackId: string
  rightStackId: string
  pairX: number          // left stack x in doc coords
  pairWidth: number      // left + right stack width in doc coords
  svgLeft: number        // SVG client left at drag start
  currentDocX: number    // current drag position in doc coords
  leftShareOriginal: number
  rightShareOriginal: number
  totalShare: number     // leftShare + rightShare
  minWidthPt: number     // min column width in pt
  committed?: boolean
}

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

interface EditorState {
  past: HistoryEntry[]
  doc: DocumentNode
  future: HistoryEntry[]
  paginated: PaginatedDocument
  drag: DragState | null
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  lastSplitNodeId: string | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
}

type ZoomMode = "fit" | "manual"
type RightRailMode = "page" | "outline" | "properties"
type PageMarginSide = "top" | "right" | "bottom" | "left"
type PageMarginDraft = Record<PageMarginSide, number>
type DocumentSection = DocumentNode["document"]["sections"][number]

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

type EditorAction =
  | { type: "DRAG_START"; source: DragSource; clientX: number; clientY: number }
  | { type: "DRAG_MOVE"; clientX: number; clientY: number; preview: PlacementPreview | null }
  | { type: "DRAG_COMMIT"; op: PlacementOperation; sectionId: string }
  | { type: "DRAG_CANCEL" }
  | { type: "SELECT_NODE"; nodeId: string | null; anchorNodeId?: string | null }
  | { type: "UPDATE_PROPS"; nodeId: string; changes: Record<string, unknown> }
  | { type: "UPDATE_TEXT"; nodeId: string; text: string }
  | { type: "UPDATE_FIELD_REF"; fieldRefId: string; changes: FieldRefInlineChanges }
  | { type: "UPDATE_PARAGRAPH_BOX_STYLE"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "UPDATE_INLINE_TEXT_DRAFT"; nodeId: string; text: string }
  | { type: "COMMIT_INLINE_TEXT_EDIT"; nodeId: string; beforeDoc: DocumentNode; beforePaginated: PaginatedDocument; beforeText: string; afterPaginated: PaginatedDocument }
  | { type: "COMMIT_WYSIWYG_TEXT_EDIT"; nodeId: string; text: string; beforeText: string; history?: HistoryEntry; afterPaginated: PaginatedDocument }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "SET_PAGINATED"; paginated: PaginatedDocument }
  | { type: "SET_INLINE_EDIT_HEIGHT"; nodeId: string; pageIndex: number | null; height: number; reflow?: WysiwygTextReflowDecision }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TABLE_ADD_ROW"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_ROW"; tableId: string; rowIndex: number }
  | { type: "TABLE_ADD_COL"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_COL"; tableId: string; colIndex: number }
  | { type: "FLOW_ROW_ADD_COL"; rowId: string; stackId?: string; position?: "before" | "after" }
  | { type: "LOAD_DOCUMENT"; doc: DocumentNode; paginated?: PaginatedDocument }
  | { type: "RESIZE_COLUMNS"; leftStackId: string; leftShare: number; rightStackId: string; rightShare: number }
  | { type: "RESIZE_ROW_MIN_HEIGHT"; rowId: string; minHeight: number }
  | { type: "UPDATE_MARGIN"; sectionIndex: number; margin: { top: number; right: number; bottom: number; left: number } }
  | { type: "SPLIT_PARAGRAPH"; nodeId: string; splitIndex: number; history?: HistoryEntry }
  | { type: "CLEAR_SPLIT_NODE_ID" }
  | { type: "MERGE_PARAGRAPH"; nodeId: string; history?: HistoryEntry }
  | { type: "CLEAR_MERGE_RESULT" }

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

function loadFromStorage(): DocumentNode | null {
  const result = loadDocumentFromStorage(localStorage)
  return result.ok ? result.doc : null
}

function paginate(doc: DocumentNode): PaginatedDocument {
  return paginateDocument(doc, defaultTextMeasurer)
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

const MAX_HISTORY = 50

function pushDoc(state: EditorState, newDoc: DocumentNode, history?: HistoryEntry): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), history ?? { doc: state.doc, paginated: state.paginated }],
    doc: normalizedDoc,
    future: [],
  }
}

function setDocWithoutHistory(state: EditorState, newDoc: DocumentNode): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return { ...state, doc: normalizedDoc }
}

function createInitialEditorState(initialDocOverride?: DocumentNode | null): EditorState {
  const initialDoc = normalizeDocument(initialDocOverride ?? loadFromStorage() ?? createDefaultDocument("Untitled"))
  return {
    past: [],
    doc: initialDoc,
    future: [],
    paginated: paginate(initialDoc),
    drag: null,
    selectedNodeId: null,
    selectionAnchorNodeId: null,
    lastSplitNodeId: null,
    mergeResult: null,
  }
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "DRAG_START":
      return { ...state, drag: { source: action.source, clientX: action.clientX, clientY: action.clientY, preview: null } }
    case "DRAG_MOVE":
      if (!state.drag) return state
      return { ...state, drag: { ...state.drag, clientX: action.clientX, clientY: action.clientY, preview: action.preview } }
    case "DRAG_COMMIT": {
      if (!state.drag) return state
      const newDoc = applyPlacementOperation(state.doc, action.sectionId, action.op, state.drag.source)
      return pushDoc({ ...state, drag: null }, newDoc)
    }
    case "DRAG_CANCEL":
      return { ...state, drag: null }
    case "SELECT_NODE":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.anchorNodeId !== undefined ? action.anchorNodeId : action.nodeId,
      }
    case "UPDATE_PROPS":
      return pushDoc(state, updateNodeProps(state.doc, action.nodeId, action.changes))
    case "UPDATE_TEXT":
      return pushDoc(state, updateParagraphText(state.doc, action.nodeId, action.text))
    case "UPDATE_FIELD_REF":
      return pushDoc(state, updateFieldRefInline(state.doc, action.fieldRefId, action.changes))
    case "UPDATE_PARAGRAPH_BOX_STYLE":
      return pushDoc(state, updateParagraphBoxStyle(state.doc, action.nodeId, action.changes))
    case "UPDATE_INLINE_TEXT_DRAFT":
      return setDocWithoutHistory(state, updateParagraphText(state.doc, action.nodeId, action.text))
    case "COMMIT_INLINE_TEXT_EDIT": {
      const currentText = getParagraphTextFromDoc(state.doc, action.nodeId)
      if (currentText == null || currentText === action.beforeText) return {
        ...state,
        paginated: action.afterPaginated,
      }
      return {
        ...state,
        paginated: action.afterPaginated,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), { doc: action.beforeDoc, paginated: action.beforePaginated }],
        future: [],
      }
    }
    case "COMMIT_WYSIWYG_TEXT_EDIT": {
      return commitWysiwygTextEditState(state, action, MAX_HISTORY)
    }
    case "DELETE_NODE":
      return { ...pushDoc(state, deleteNode(state.doc, action.nodeId)), selectedNodeId: null, selectionAnchorNodeId: null }
    case "SET_PAGINATED":
      return { ...state, paginated: action.paginated }
    case "SET_INLINE_EDIT_HEIGHT":
      return {
        ...state,
        paginated: resizeFragmentHeightAndShift(state.paginated, state.doc, action.nodeId, action.height, action.pageIndex),
      }
    case "UNDO": {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return {
        ...state,
        past: state.past.slice(0, -1),
        doc: prev.doc,
        paginated: prev.paginated,
        future: [{ doc: state.doc, paginated: state.paginated }, ...state.future],
      }
    }
    case "REDO": {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        ...state,
        past: [...state.past, { doc: state.doc, paginated: state.paginated }],
        doc: next.doc,
        paginated: next.paginated,
        future: state.future.slice(1),
      }
    }
    case "LOAD_DOCUMENT":
      const normalizedDoc = normalizeDocument(action.doc)
      return { ...state, past: [], doc: normalizedDoc, future: [], paginated: action.paginated ?? paginate(normalizedDoc), selectedNodeId: null, selectionAnchorNodeId: null, drag: null }
    case "TABLE_ADD_ROW":
      return pushDoc(state, addTableRow(state.doc, action.tableId, action.afterIndex))
    case "TABLE_REMOVE_ROW":
      return pushDoc(state, removeTableRow(state.doc, action.tableId, action.rowIndex))
    case "TABLE_ADD_COL":
      return pushDoc(state, addTableColumn(state.doc, action.tableId, action.afterIndex))
    case "TABLE_REMOVE_COL":
      return pushDoc(state, removeTableColumn(state.doc, action.tableId, action.colIndex))
    case "FLOW_ROW_ADD_COL":
      return pushDoc(state, addFlowStackColumn(state.doc, action.rowId, action.stackId, action.position))
    case "RESIZE_COLUMNS": {
      let doc = updateNodeProps(state.doc, action.leftStackId, { widthShare: action.leftShare })
      doc = updateNodeProps(doc, action.rightStackId, { widthShare: action.rightShare })
      return pushDoc(state, doc)
    }
    case "RESIZE_ROW_MIN_HEIGHT":
      return pushDoc(state, updateNodeProps(state.doc, action.rowId, { minHeight: action.minHeight }))
    case "UPDATE_MARGIN":
      return pushDoc(state, updateSectionMargin(state.doc, action.sectionIndex, action.margin))
    case "SPLIT_PARAGRAPH": {
      const result = splitParagraphAtIndex(state.doc, action.nodeId, action.splitIndex)
      if (!result.newNodeId) return state
      return { ...pushDoc(state, result.doc, action.history), lastSplitNodeId: result.newNodeId }
    }
    case "CLEAR_SPLIT_NODE_ID":
      return { ...state, lastSplitNodeId: null }
    case "MERGE_PARAGRAPH": {
      const result = mergeParagraphWithPrevious(state.doc, action.nodeId)
      if (!result) return state
      return {
        ...pushDoc(state, result.doc, action.history),
        mergeResult: { prevNodeId: result.prevNodeId, caretIndex: result.caretIndex },
      }
    }
    case "CLEAR_MERGE_RESULT":
      return { ...state, mergeResult: null }
  }
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
  if (source.source === "palette") return source.blockType
  if (source.source === "field") return source.field.label ?? source.field.key
  return "node"
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

// ─── Local Reflow Helpers ─────────────────────────────────────────────────────

function findParagraphNode(doc: DocumentNode, nodeId: string) {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "table") continue
      const inner = (candidate as unknown as TableNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner
    }
  }
  return null
}

function getParagraphTextFromDoc(doc: DocumentNode, nodeId: string): string | null {
  return getPlainParagraphTextFromDocument(doc, nodeId)
}

function findParagraphFragment(paginated: PaginatedDocument, nodeId: string, pageIndex?: number | null): PageFragment | null {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const f = page.fragments.find((f) => f.nodeId === nodeId && f.nodeType === "paragraph")
      if (!f) continue
      // If pageIndex is specified, match only the fragment on that page
      if (pageIndex != null && f.pageIndex !== pageIndex) continue
      return f
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
      if (candidate.type !== "table") continue
      if ((candidate as unknown as TableNode).nodes[nodeId]) return sectionIndex
    }
  }
  return 0
}

function readSectionMargin(section: DocumentSection): PageMarginDraft {
  return {
    top: section.page.margin.top.value,
    right: section.page.margin.right.value,
    bottom: section.page.margin.bottom.value,
    left: section.page.margin.left.value,
  }
}

function clampPageMarginValue(value: number, side: PageMarginSide, section: DocumentSection): number {
  const { width, height } = getPageDimensions(section.page)
  const pageExtent = side === "left" || side === "right" ? width : height
  const max = Math.max(0, pageExtent / 2 - 36)
  const numeric = Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(max, Math.round(numeric * 100) / 100))
}

function clampPageMarginDraft(draft: PageMarginDraft, section: DocumentSection): PageMarginDraft {
  return {
    top: clampPageMarginValue(draft.top, "top", section),
    right: clampPageMarginValue(draft.right, "right", section),
    bottom: clampPageMarginValue(draft.bottom, "bottom", section),
    left: clampPageMarginValue(draft.left, "left", section),
  }
}

function arePageMarginsEqual(a: PageMarginDraft, b: PageMarginDraft): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

function formatPageMarginSummary(margin: PageMarginDraft): string {
  return `${margin.top}/${margin.right}/${margin.bottom}/${margin.left} pt`
}

function PagePanelSection({
  title,
  summary,
  children,
  testId,
  defaultOpen = true,
}: {
  title: string
  summary?: string
  children: React.ReactNode
  testId?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section data-testid={testId} style={pagePanelSection}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={pagePanelSectionHeader}
      >
        <span style={{ color: "#374151", fontWeight: 700 }}>{title}</span>
        {summary && (
          <span style={{ marginLeft: "auto", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary}
          </span>
        )}
        <span aria-hidden="true" style={{ color: "#6b7280", fontWeight: 700, width: 12, textAlign: "center" }}>
          {open ? "-" : "+"}
        </span>
      </button>
      {open && (
        <div data-testid={testId ? `${testId}-body` : undefined} style={pagePanelSectionBody}>
          {children}
        </div>
      )}
    </section>
  )
}

function PagePanel({
  doc,
  sectionIndex,
  editable,
  onUpdateMargin,
}: {
  doc: DocumentNode
  sectionIndex: number
  editable: boolean
  onUpdateMargin: (sectionIndex: number, margin: PageMarginDraft) => void
}) {
  const section = doc.document.sections[sectionIndex] ?? doc.document.sections[0]
  const [draft, setDraft] = useState<PageMarginDraft>(() => section ? readSectionMargin(section) : { top: 0, right: 0, bottom: 0, left: 0 })

  useEffect(() => {
    if (!section) return
    setDraft(readSectionMargin(section))
  }, [
    section?.id,
    section?.page.margin.top.value,
    section?.page.margin.right.value,
    section?.page.margin.bottom.value,
    section?.page.margin.left.value,
  ])

  const commitDraft = useCallback(() => {
    if (!editable || !section) return
    const next = clampPageMarginDraft(draft, section)
    const current = readSectionMargin(section)
    setDraft(next)
    if (arePageMarginsEqual(next, current)) return
    onUpdateMargin(sectionIndex, next)
  }, [draft, editable, onUpdateMargin, section, sectionIndex])

  const resetDraft = useCallback(() => {
    if (!section) return
    setDraft(readSectionMargin(section))
  }, [section])

  const setMarginSide = (side: PageMarginSide, value: string) => {
    setDraft((prev) => ({ ...prev, [side]: Number(value) || 0 }))
  }

  const setAllMargins = (value: string) => {
    const amount = Number(value) || 0
    setDraft({ top: amount, right: amount, bottom: amount, left: amount })
  }

  const marginValues = [draft.top, draft.right, draft.bottom, draft.left]
  const allMarginValue = marginValues.every((value) => value === marginValues[0]) ? marginValues[0] : null

  const renderMarginInput = (side: PageMarginSide, gridArea: string) => (
    <label key={side} style={{ ...pageCompassField, gridArea }}>
      <span style={pageCompassControlLabel}>{side[0].toUpperCase() + side.slice(1)}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={draft[side]}
        disabled={!editable || !section}
        onChange={(event) => setMarginSide(side, event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          } else if (event.key === "Escape") {
            resetDraft()
            event.currentTarget.blur()
          }
        }}
        style={{ ...pagePanelInput, background: editable ? "white" : "#f8fafc", color: editable ? "#111827" : "#94a3b8" }}
      />
    </label>
  )

  return (
    <div data-testid="page-panel" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "#fff" }}>
      <div
        data-testid="page-panel-title"
        style={{
          flexShrink: 0,
          padding: "12px 14px",
          borderBottom: "1px solid #e5e7eb",
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0,
        }}
      >
        PAGE
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14, display: "grid", alignContent: "start", gap: 10 }}>
        {section ? (
          <>
            <PagePanelSection title="Page setup" summary={`${section.page.size} / ${section.page.orientation}`} testId="page-setup-card">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={pagePanelFieldLabel}>Size</span>
                  <div style={pagePanelReadOnlyValue}>{section.page.size}</div>
                </div>
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={pagePanelFieldLabel}>Orientation</span>
                  <div style={pagePanelReadOnlyValue}>{section.page.orientation}</div>
                </div>
              </div>
            </PagePanelSection>

            <PagePanelSection title="Margins" summary={formatPageMarginSummary(draft)} testId="page-margins-card">
              <div
                data-testid="page-margin-compass"
                style={{
                  ...pageCompassGrid,
                  gridTemplateAreas: `
                    ". top ."
                    "left all right"
                    ". bottom ."
                  `,
                }}
              >
                {renderMarginInput("top", "top")}
                {renderMarginInput("left", "left")}
                <label style={{ ...pageCompassField, gridArea: "all" }}>
                  <span style={pageCompassControlLabel}>All</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={allMarginValue ?? ""}
                    placeholder="mixed"
                    disabled={!editable || !section}
                    onChange={(event) => setAllMargins(event.target.value)}
                    onBlur={commitDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur()
                      } else if (event.key === "Escape") {
                        resetDraft()
                        event.currentTarget.blur()
                      }
                    }}
                    style={{ ...pagePanelInput, background: editable ? "white" : "#f8fafc", color: editable ? "#111827" : "#94a3b8", textAlign: "center" }}
                  />
                </label>
                {renderMarginInput("right", "right")}
                {renderMarginInput("bottom", "bottom")}
              </div>
              {!editable && (
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>
                  Page settings are read-only in Fill mode.
                </div>
              )}
            </PagePanelSection>
          </>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No page section found.</div>
        )}
      </div>
    </div>
  )
}

const pagePanelSection: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
  background: "#f9fafb",
}

const pagePanelSectionHeader: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  padding: "6px 7px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "monospace",
  textAlign: "left",
}

const pagePanelSectionBody: React.CSSProperties = {
  padding: 7,
  background: "white",
}

const pagePanelFieldLabel: React.CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
}

const pagePanelReadOnlyValue: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "4px 6px",
  color: "#374151",
  background: "#fafafa",
  fontSize: 11,
  fontFamily: "monospace",
}

const pagePanelInput: React.CSSProperties = {
  width: "100%",
  fontSize: 11,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "4px 6px",
  boxSizing: "border-box",
  fontFamily: "monospace",
}

const pageCompassGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 58px 1fr",
  gap: 5,
  alignItems: "end",
}

const pageCompassField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
}

const pageCompassControlLabel: React.CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
  textAlign: "center",
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const initialTestScenario = useMemo(() => resolveEditorTestScenarioFromLocation(), [])
  const [scale, setScale] = useState(0.6)
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")
  const [rightRailMode, setRightRailMode] = useState<RightRailMode>("page")
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false)
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
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const [minHeightDrag, setMinHeightDrag] = useState<MinHeightDrag | null>(null)
  const [marginDrag, setMarginDrag] = useState<MarginDrag | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [documentIoStatus, setDocumentIoStatus] = useState<{ type: "info" | "error"; message: string } | null>(null)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const [showDrift, setShowDrift] = useState(false)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const showDriftRef = useRef(showDrift)
  useEffect(() => { showDriftRef.current = showDrift }, [showDrift])
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
    wysiwygLatestDraftPaginationSnapshotRef.current = null
  }, [])

  const scheduleWysiwygDraftPagination = useCallback((nodeId: string, debounceMs = WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS) => {
    if (!WYSIWYG_TEXT_ENGINE_ENABLED) return
    const paginationDelayMs = Math.max(0, debounceMs)
    const runDraftPagination = (generation: number) => {
      if (generation !== wysiwygDraftPaginationGenerationRef.current) return
      wysiwygDraftPaginationDebounceRef.current = null
      wysiwygDraftPaginationFrameRef.current = null
      wysiwygDraftPaginationDelayRef.current = null
      const session = wysiwygTextSessionStateRef.current
      const source = resolveWysiwygDraftPaginationSource({
        nodeId,
        session,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      if (!source) return
      const draftDoc = buildWysiwygTextDraftPreviewDocument({
        doc: docRef.current,
        nodeId,
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
        nodeId,
        draftVersion: source.revision,
        ...summarizePaginatedForWysiwygPerf(paginated),
      })
      if (generation !== wysiwygDraftPaginationGenerationRef.current) return
      const nextSource = resolveWysiwygDraftPaginationSource({
        nodeId,
        session: wysiwygTextSessionStateRef.current,
        latestSnapshot: wysiwygLatestDraftPaginationSnapshotRef.current,
      })
      if (!nextSource) return
      if (nextSource.revision !== source.revision) {
        scheduleWysiwygDraftPagination(nodeId, paginationDelayMs)
        return
      }
      const ranges = getWysiwygParagraphFragmentRanges(paginated, nodeId)
      const nextPageIndex = source.caretOffset == null
        ? null
        : findWysiwygPageIndexInFragmentRanges(ranges, source.caretOffset)
      paginatedRef.current = paginated
      optimisticLayoutRef.current = { doc: draftDoc, paginated }
      if (nextPageIndex !== null) {
        const previousPageIndex = inlineEditPageIndexRef.current
        inlineEditPageIndexRef.current = nextPageIndex
        setInlineEditPageIndex(nextPageIndex)
        if (shouldFollowInlineEditPageChange({ previousPageIndex, nextPageIndex })) {
          requestInlineEditPageFollow(nextPageIndex)
        }
      }
      const currentFragmentCount = countWysiwygTextDraftFragments(paginated, nodeId)
      setWysiwygDraftPaginationNodeId(shouldScheduleResponsiveFlowStackDraftPagination({
        isFlowStackParagraph: isParagraphInsideFlowStack(docRef.current, nodeId),
        draftPaginationActive: wysiwygDraftPaginationNodeIdRef.current === nodeId,
        currentFragmentCount,
      }) ? nodeId : null)
      dispatch({ type: "SET_PAGINATED", paginated })
      markInlineEditVisualFresh(inlineEditDraftVersionRef.current)
    }

    const useAnimationFrame = shouldUseWysiwygDraftPaginationFrame({
      nextDelayMs: paginationDelayMs,
      responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      canUseAnimationFrame: typeof requestAnimationFrame !== "undefined",
    })
    if (useAnimationFrame) {
      if (wysiwygDraftPaginationDebounceRef.current) {
        clearTimeout(wysiwygDraftPaginationDebounceRef.current)
        wysiwygDraftPaginationDebounceRef.current = null
      }
      wysiwygDraftPaginationDelayRef.current = paginationDelayMs
      if (wysiwygDraftPaginationFrameRef.current !== null) return
      const generation = ++wysiwygDraftPaginationGenerationRef.current
      wysiwygDraftPaginationFrameRef.current = requestAnimationFrame(() => runDraftPagination(generation))
      return
    }

    if (wysiwygDraftPaginationFrameRef.current !== null) return
    if (wysiwygDraftPaginationDebounceRef.current) {
      if (shouldCoalesceWysiwygDraftPaginationRequest({
        pendingDelayMs: wysiwygDraftPaginationDelayRef.current,
        nextDelayMs: paginationDelayMs,
        responsiveDelayMs: FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS,
      })) {
        return
      }
      clearTimeout(wysiwygDraftPaginationDebounceRef.current)
    }
    const generation = ++wysiwygDraftPaginationGenerationRef.current
    wysiwygDraftPaginationDelayRef.current = paginationDelayMs
    wysiwygDraftPaginationDebounceRef.current = setTimeout(() => runDraftPagination(generation), paginationDelayMs)
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
    if (text === wysiwygTextSessionState.draftText) {
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
    const isFlowStackParagraph = isParagraphInsideFlowStack(docRef.current, nodeId)
    const useResponsiveFlowStackDraftPagination = shouldScheduleResponsiveFlowStackDraftPagination({
      isFlowStackParagraph,
      draftPaginationActive: wysiwygDraftPaginationNodeId === nodeId,
      currentFragmentCount: countWysiwygTextDraftFragments(paginatedRef.current, nodeId),
    })
    if (useResponsiveFlowStackDraftPagination) {
      setWysiwygDraftPaginationNodeId(nodeId)
      scheduleWysiwygDraftPagination(nodeId, resolveWysiwygDraftPaginationDelayMs({
        draftPaginationActive: true,
        isFlowStackParagraph,
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
    scheduleWysiwygDraftPagination(nodeId, resolveWysiwygDraftPaginationDelayMs({
      reflow,
      isFlowStackParagraph: isParagraphInsideFlowStack(docRef.current, nodeId),
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
  const interactiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutVersionRef = useRef(0)
  const browserPaginationGenerationRef = useRef(0)
  const optimisticLayoutRef = useRef<OptimisticLayoutSnapshot | null>(null)
  const prevLineCountRef = useRef<number | null>(null)
  const prevEditNodeIdRef = useRef<string | null>(null)
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
        } catch {}
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
    const nextPageIndex = findWysiwygPageIndexInFragmentRanges(inlineEditFragmentRanges, inlineEditCaretIndex)
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
      ...summarizePaginatedForWysiwygPerf(paginated),
    })
    optimisticLayoutRef.current = { doc: previewDoc, paginated }
    dispatch({ type: "SET_PAGINATED", paginated })
  }, [editorTextMeasurer, inlineEditNodeId, previewDoc])

  // Track the current line count when edit mode starts. This avoids reflowing on
  // edit enter, but still lets the first typed/deleted character fire a hard
  // event when it changes the paragraph's line count.
  useEffect(() => {
    if (inlineEditNodeId === null) {
      prevLineCountRef.current = null
      prevEditNodeIdRef.current = null
      return
    }
    const fragment = findParagraphFragment(paginatedRef.current, inlineEditNodeId, inlineEditPageIndex)
    prevLineCountRef.current = fragment?.lines?.length ?? null
    prevEditNodeIdRef.current = inlineEditNodeId
  }, [inlineEditNodeId, inlineEditPageIndex])

  // While inline editing, the textarea is the interaction truth for the active
  // paragraph, but browser pagination remains the visual truth. Do not patch
  // fragments through the older same-page local reflow path; that can fight the
  // full paginated preview when text starts crossing page boundaries.
  useEffect(() => {
    if (!inlineEditNodeId) return
    const paraNode = findParagraphNode(previewDoc, inlineEditNodeId)
    if (!paraNode) return
    const fragment = findParagraphFragment(paginatedRef.current, inlineEditNodeId, inlineEditPageIndex)
    if (!fragment) return

    // Skip local reflow for split paragraphs — local reflow builds lines from a
    // full measureParagraph call and positions them all within one fragment's Y
    // range, causing visual corruption when the paragraph spans multiple pages.
    // Split paragraphs rely on the debounced browser pagination for live updates.
    const isSplitParagraph = paginatedRef.current
      ? paginatedRef.current.sections
          .flatMap((s) => s.pages)
          .flatMap((p) => p.fragments)
          .filter((f) => f.nodeId === inlineEditNodeId && f.nodeType === "paragraph")
          .length > 1
      : false
    if (isSplitParagraph) return

    const startedAt = startWysiwygPerfSpan()
    const measured = measureParagraph(paraNode, fragment.width, editorTextMeasurer)
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "active-paragraph-measure", startedAt, {
      nodeId: inlineEditNodeId,
      pageIndex: inlineEditPageIndex,
      lineCount: measured.lines.length,
    })
    const newLineCount = measured.lines.length

    if (prevEditNodeIdRef.current !== inlineEditNodeId) {
      prevLineCountRef.current = null
      prevEditNodeIdRef.current = inlineEditNodeId
    }
    prevLineCountRef.current = newLineCount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc])

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
    interactiveDebounceRef.current = setTimeout(() => {
      if (generation !== browserPaginationGenerationRef.current) return
      if (inlineEditNodeIdAtSchedule !== inlineEditNodeIdRef.current) return
      const startedAt = startWysiwygPerfSpan()
      const paginated = paginateDocument(previewDoc, editorTextMeasurer)
      finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "browser-preview-pagination", startedAt, {
        nodeId: inlineEditNodeIdAtSchedule ?? undefined,
        draftVersion: inlineEditDraftVersionAtSchedule,
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
          if (layoutVersion === layoutVersionRef.current) setIsLayoutLoading(false)
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
      setResizeDrag((prev) => prev?.committed ? null : prev)
      setMinHeightDrag((prev) => prev?.committed ? null : prev)
      setMarginDrag((prev) => prev?.committed ? null : prev)
    }
  }, [isLayoutLoading])

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
    pairX: number, pairWidth: number,
    startClientX: number, pageKey: string,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgLeft = svgEl.getBoundingClientRect().left
    const startDocX = (startClientX - svgLeft) / scale

    let leftShare = 50, rightShare = 50
    for (const section of state.doc.document.sections) {
      const l = section.nodes[leftStackId], r = section.nodes[rightStackId]
      if (l?.type === "stack" && r?.type === "stack") {
        leftShare = l.props.widthShare ?? 50
        rightShare = r.props.widthShare ?? 50
        break
      }
    }

    const minWidthPt = Math.max(16, pairWidth * 0.15)

    setResizeDrag({
      rowId, leftStackId, rightStackId,
      pairX, pairWidth, svgLeft,
      currentDocX: startDocX,
      leftShareOriginal: leftShare, rightShareOriginal: rightShare,
      totalShare: leftShare + rightShare,
      minWidthPt,
    })
  }, [finalizeInlineEditBeforeAction, scale, state.doc, state.paginated])

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

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Margin resize drag
      if (marginDrag && !marginDrag.committed) {
        const svgEl = pageRefs.current.get(marginDrag.pageKey)
        if (!svgEl) return
        const rect = svgEl.getBoundingClientRect()
        const { side, pageWidthPt, pageHeightPt } = marginDrag
        let rawValue: number
        if (side === "left") rawValue = (e.clientX - rect.left) / scale
        else if (side === "right") rawValue = pageWidthPt - (e.clientX - rect.left) / scale
        else if (side === "top") rawValue = (e.clientY - rect.top) / scale
        else rawValue = pageHeightPt - (e.clientY - rect.top) / scale
        const isHoriz = side === "left" || side === "right"
        const max = (isHoriz ? pageWidthPt : pageHeightPt) / 2 - 36
        const newValue = Math.max(0, Math.min(max, rawValue))
        const newMargins = { ...marginDrag.currentMargins, [side]: newValue }
        if (!marginDrag.altKey) {
          const opposite = side === "top" ? "bottom" : side === "bottom" ? "top" : side === "left" ? "right" : "left"
          newMargins[opposite] = newValue
        }
        setMarginDrag((prev) => prev ? { ...prev, currentMargins: newMargins } : null)
        return
      }
      // Resize row minHeight drag
      if (minHeightDrag && !minHeightDrag.committed) {
        const rawHeight = (e.clientY - minHeightDrag.svgTop) / scale - minHeightDrag.rowFragY
        const currentMinHeight = Math.max(minHeightDrag.minPt, rawHeight)
        setMinHeightDrag((prev) => prev ? { ...prev, currentMinHeight } : null)
        return
      }
      // Resize column drag
      if (resizeDrag && !resizeDrag.committed) {
        const rawDocX = (e.clientX - resizeDrag.svgLeft) / scale
        const minX = resizeDrag.pairX + resizeDrag.minWidthPt
        const maxX = resizeDrag.pairX + resizeDrag.pairWidth - resizeDrag.minWidthPt
        const currentDocX = Math.max(minX, Math.min(maxX, rawDocX))
        setResizeDrag((prev) => prev ? { ...prev, currentDocX } : null)
        return
      }
      // Convert pendingDrag to real drag after 5px movement
      if (pendingDragRef.current && !state.drag) {
        const dx = e.clientX - pendingDragRef.current.clientX
        const dy = e.clientY - pendingDragRef.current.clientY
        if (Math.hypot(dx, dy) > 5) {
          const { source } = pendingDragRef.current
          pendingDragRef.current = null
          const { preview } = computePreview(e.clientX, e.clientY, source)
          dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
          dispatch({ type: "DRAG_MOVE", clientX: e.clientX, clientY: e.clientY, preview })
        }
        return
      }
      if (!state.drag) return
      const { preview } = computePreview(e.clientX, e.clientY)
      dispatch({ type: "DRAG_MOVE", clientX: e.clientX, clientY: e.clientY, preview })
    },
    [marginDrag, minHeightDrag, resizeDrag, state.drag, computePreview, scale],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Commit margin resize
      if (marginDrag && !marginDrag.committed) {
        dispatch({ type: "UPDATE_MARGIN", sectionIndex: marginDrag.sectionIndex, margin: marginDrag.currentMargins })
        setMarginDrag(null)
        return
      }
      // Commit minHeight resize
      if (minHeightDrag && !minHeightDrag.committed) {
        dispatch({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: minHeightDrag.rowId, minHeight: minHeightDrag.currentMinHeight })
        setMinHeightDrag(null)
        return
      }
      // Commit resize
      if (resizeDrag && !resizeDrag.committed) {
        const { leftStackId, rightStackId, pairX, pairWidth, currentDocX, totalShare } = resizeDrag
        const leftWidthPt = currentDocX - pairX
        // Clamp to minimum 0.01 to ensure widthShare never becomes zero or negative
        // (drag clamping already prevents this in practice, but floating-point rounding
        // near the boundary could theoretically produce 0 after Math.round)
        const newLeftShare = Math.max(0.01, Math.round((leftWidthPt / pairWidth) * totalShare * 100) / 100)
        const newRightShare = Math.max(0.01, Math.round((totalShare - newLeftShare) * 100) / 100)
        dispatch({ type: "RESIZE_COLUMNS", leftStackId, leftShare: newLeftShare, rightStackId, rightShare: newRightShare })
        setResizeDrag(null)
        return
      }
      // PendingDrag released without moving → treat as click.
      if (pendingDragRef.current) {
        const { source, clickAction } = pendingDragRef.current
        pendingDragRef.current = null
        if (clickAction?.type === "inline-edit") {
          dispatch({ type: "SELECT_NODE", nodeId: clickAction.nodeId })
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
    [marginDrag, minHeightDrag, resizeDrag, state.drag, state.doc, computePreview, handleInlineEditStart],
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const isTextInput = tag === "INPUT" || tag === "TEXTAREA"
    const key = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && !isTextInput) {
      if (key === "=" || key === "+") {
        e.preventDefault()
        zoomIn()
        return
      }
      if (key === "-") {
        e.preventDefault()
        zoomOut()
        return
      }
      if (key === "0") {
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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z") {
      if (isTextInput) return
      e.preventDefault()
      if (!isTemplateMode) return
      handleUndo()
    }
    if ((e.ctrlKey || e.metaKey) && (key === "y" || (e.shiftKey && key === "z"))) {
      if (isTextInput) return
      e.preventDefault()
      if (!isTemplateMode) return
      handleRedo()
    }
  }, [handleInlineEditEnd, handleRedo, handleUndo, inlineEditNodeId, isTemplateMode, resetZoom, state.drag, state.selectedNodeId, zoomIn, zoomOut])

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
      onKeyDown={handleKeyDown}
      onWheelCapture={handleWheelCapture}
      tabIndex={-1}
    >
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
      <div data-testid="editor-toolbar" style={{ padding: "10px 20px", background: "white", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: "bold", color: "#111827" }}>FlowDoc Editor</span>
        {/* Undo / Redo */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
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

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
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

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {(["template", "fill"] as const).map((m) => (
            <button key={m}
              onClick={() => {
                finalizeInlineEditBeforeAction()
                setMode(m)
                if (m === "fill") {
                  dispatch({ type: "DRAG_CANCEL" })
                  setResizeDrag(null)
                  setMinHeightDrag(null)
                  setMarginDrag(null)
                  setRightRailMode("properties")
                } else if (!state.selectedNodeId) {
                  setRightRailMode("page")
                }
              }}
              style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: mode === m ? "#dbeafe" : "white", color: mode === m ? "#1d4ed8" : "#374151", fontWeight: mode === m ? "bold" : "normal" }}>
              {m === "template" ? "Template" : "Fill"}
            </button>
          ))}
        </div>

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

        {/* Document actions */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", minHeight: 24, minWidth: 0 }}>
          <div
            data-testid="editor-status-region"
            style={{
              width: 520,
              maxWidth: "42vw",
              minWidth: 180,
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

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 160, flexShrink: 0, borderRight: "1px solid #e5e7eb", background: "white", display: "flex", flexDirection: "column", overflow: "auto" }}>
          {isTemplateMode ? (
            <>
              <EditorPalette onDragStart={startPaletteDrag} isDragging={!!state.drag} />
              <FieldPalette registry={packageFieldRegistry} onDragStart={startPaletteDrag} isDragging={!!state.drag} />
            </>
          ) : (
            <div style={{ padding: 14, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
              Fill mode locks the template. Edit values in the right panel.
            </div>
          )}
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
            isLayoutLoading={isLayoutLoading}
            textMeasurer={editorTextMeasurer}
            inlineEditVisualFresh={isTemplateMode ? inlineEditDocumentVisualReady : true}
            inlineEditNodeId={isTemplateMode ? inlineEditNodeId : null}
            inlineEditCaretIndex={isTemplateMode ? inlineEditCaretIndex : null}
            inlineEditPageIndex={isTemplateMode ? inlineEditPageIndex : null}
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
          style={{
            width: rightRailCollapsed ? 36 : 260,
            flexShrink: 0,
            display: "flex",
            borderLeft: "1px solid #e5e7eb",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div data-testid="editor-right-rail-sidebar" style={{ width: 36, flexShrink: 0, borderRight: rightRailCollapsed ? "none" : "1px solid #e5e7eb", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 5px" }}>
            <button
              type="button"
              data-testid="editor-right-rail-collapse"
              aria-label={rightRailCollapsed ? "Expand right panel" : "Collapse right panel"}
              title={rightRailCollapsed ? "Expand right panel" : "Collapse right panel"}
              onClick={() => setRightRailCollapsed((value) => !value)}
              style={{ width: 24, height: 24, border: "1px solid #d1d5db", borderRadius: 5, background: "white", color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
            >
              {rightRailCollapsed ? ">" : "<"}
            </button>
            <button
              type="button"
              data-testid="editor-right-rail-mode-page"
              aria-label="Show page"
              aria-pressed={!rightRailCollapsed && rightRailMode === "page"}
              title="Page"
              onClick={() => {
                setRightRailCollapsed(false)
                setRightRailMode("page")
              }}
              style={{
                width: 24,
                height: 28,
                border: "1px solid #d1d5db",
                borderRadius: 5,
                background: !rightRailCollapsed && rightRailMode === "page" ? "#dbeafe" : "white",
                color: !rightRailCollapsed && rightRailMode === "page" ? "#1d4ed8" : "#64748b",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Pg
            </button>
            <button
              type="button"
              data-testid="editor-right-rail-mode-outline"
              aria-label="Show outline"
              aria-pressed={!rightRailCollapsed && rightRailMode === "outline"}
              title="Outline"
              onClick={() => {
                setRightRailCollapsed(false)
                setRightRailMode("outline")
              }}
              style={{
                width: 24,
                height: 28,
                border: "1px solid #d1d5db",
                borderRadius: 5,
                background: !rightRailCollapsed && rightRailMode === "outline" ? "#dbeafe" : "white",
                color: !rightRailCollapsed && rightRailMode === "outline" ? "#1d4ed8" : "#64748b",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              O
            </button>
            <button
              type="button"
              data-testid="editor-right-rail-mode-properties"
              aria-label="Show properties"
              aria-pressed={!rightRailCollapsed && rightRailMode === "properties"}
              title="Properties"
              onClick={() => {
                setRightRailCollapsed(false)
                setRightRailMode("properties")
              }}
              style={{
                width: 24,
                height: 28,
                border: "1px solid #d1d5db",
                borderRadius: 5,
                background: !rightRailCollapsed && rightRailMode === "properties" ? "#dbeafe" : "white",
                color: !rightRailCollapsed && rightRailMode === "properties" ? "#1d4ed8" : "#64748b",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              P
            </button>
          </div>
          {!rightRailCollapsed && (
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
              ) : (
                <div data-testid="editor-right-rail-outline" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <OutlinePanel
                    doc={isTemplateMode ? state.doc : previewDoc}
                    selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
                    onSelect={(nodeId) => {
                      if (!isTemplateMode) return
                      dispatch({ type: "SELECT_NODE", nodeId })
                      setRightRailMode("properties")
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
