"use client"

import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from "react"
import { paginateDocument } from "@/pagination"
import { defaultTextMeasurer, measureParagraph } from "@/layout"
import { assertDocument, createDefaultDocument, DEFAULT_STACK_MIN_HEIGHT, isPlainTextParagraph, normalizeDocument } from "@/document"
import { applyPlacementOperation, updateNodeProps, updateParagraphText, updateFieldRefInline, deleteNode, addTableRow, removeTableRow, addTableColumn, removeTableColumn, updateSectionMargin, splitParagraphAtIndex, mergeParagraphWithPrevious } from "@/document"
import type { FieldRefInlineChanges } from "@/document"
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
import { findWysiwygPageIndexInFragmentRanges, getWysiwygParagraphFragmentRanges } from "./wysiwygCaretMapping"
import { WYSIWYG_INLINE_EDIT_ENABLED } from "./wysiwygInlineEditConfig"
import { useInlineEditSession } from "./useInlineEditSession"

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
  lastSplitNodeId: string | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
}

type ZoomMode = "fit" | "manual"

const MIN_SCALE = 0.3
const MAX_SCALE = 4
const ZOOM_STEP = 0.25
const INLINE_EDIT_PREVIEW_DEBOUNCE_MS = 0

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

type EditorAction =
  | { type: "DRAG_START"; source: DragSource; clientX: number; clientY: number }
  | { type: "DRAG_MOVE"; clientX: number; clientY: number; preview: PlacementPreview | null }
  | { type: "DRAG_COMMIT"; op: PlacementOperation; sectionId: string }
  | { type: "DRAG_CANCEL" }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "UPDATE_PROPS"; nodeId: string; changes: Record<string, unknown> }
  | { type: "UPDATE_TEXT"; nodeId: string; text: string }
  | { type: "UPDATE_FIELD_REF"; fieldRefId: string; changes: FieldRefInlineChanges }
  | { type: "UPDATE_INLINE_TEXT_DRAFT"; nodeId: string; text: string }
  | { type: "COMMIT_INLINE_TEXT_EDIT"; nodeId: string; beforeDoc: DocumentNode; beforePaginated: PaginatedDocument; beforeText: string; afterPaginated: PaginatedDocument }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "SET_PAGINATED"; paginated: PaginatedDocument }
  | { type: "SET_INLINE_EDIT_HEIGHT"; nodeId: string; pageIndex: number | null; height: number }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TABLE_ADD_ROW"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_ROW"; tableId: string; rowIndex: number }
  | { type: "TABLE_ADD_COL"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_COL"; tableId: string; colIndex: number }
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

function createInitialEditorState(): EditorState {
  const initialDoc = normalizeDocument(loadFromStorage() ?? createDefaultDocument("Untitled"))
  return {
    past: [],
    doc: initialDoc,
    future: [],
    paginated: paginate(initialDoc),
    drag: null,
    selectedNodeId: null,
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
      return { ...state, selectedNodeId: action.nodeId }
    case "UPDATE_PROPS":
      return pushDoc(state, updateNodeProps(state.doc, action.nodeId, action.changes))
    case "UPDATE_TEXT":
      return pushDoc(state, updateParagraphText(state.doc, action.nodeId, action.text))
    case "UPDATE_FIELD_REF":
      return pushDoc(state, updateFieldRefInline(state.doc, action.fieldRefId, action.changes))
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
    case "DELETE_NODE":
      return { ...pushDoc(state, deleteNode(state.doc, action.nodeId)), selectedNodeId: null }
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
      return { ...state, past: [], doc: normalizedDoc, future: [], paginated: action.paginated ?? paginate(normalizedDoc), selectedNodeId: null, drag: null }
    case "TABLE_ADD_ROW":
      return pushDoc(state, addTableRow(state.doc, action.tableId, action.afterIndex))
    case "TABLE_REMOVE_ROW":
      return pushDoc(state, removeTableRow(state.doc, action.tableId, action.rowIndex))
    case "TABLE_ADD_COL":
      return pushDoc(state, addTableColumn(state.doc, action.tableId, action.afterIndex))
    case "TABLE_REMOVE_COL":
      return pushDoc(state, removeTableColumn(state.doc, action.tableId, action.colIndex))
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
  const node = findParagraphNode(doc, nodeId)
  if (!node) return null
  if (!isPlainTextParagraph(node)) return null
  return node.children.map((child) => child.type === "text" ? child.text : "").join("")
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

function resizeFragmentHeightAndShift(
  paginated: PaginatedDocument,
  doc: DocumentNode,
  nodeId: string,
  height: number,
  pageIndex?: number | null,
): PaginatedDocument {
  let targetPageIndex: number | null = null
  let targetY: number | null = null
  let delta = 0

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragment = page.fragments.find((f) =>
        f.nodeId === nodeId &&
        f.nodeType === "paragraph" &&
        (pageIndex == null || f.pageIndex === pageIndex)
      )
      if (!fragment) continue
      targetPageIndex = page.index
      targetY = fragment.y
      delta = height - fragment.height
      break
    }
    if (targetY !== null) break
  }

  if (targetPageIndex === null || targetY === null || Math.abs(delta) < 0.5) return paginated

  return {
    ...paginated,
    sections: paginated.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => {
        if (page.index !== targetPageIndex) return page

        const target = page.fragments.find((f) =>
          f.nodeId === nodeId &&
          f.nodeType === "paragraph" &&
          (pageIndex == null || f.pageIndex === pageIndex)
        )
        const byId = new Map(page.fragments.map((fragment) => [fragment.nodeId, fragment]))

        const isDescendantOf = (fragment: PageFragment, ancestorId: string): boolean => {
          let parentId = fragment.parentNodeId
          while (parentId) {
            if (parentId === ancestorId) return true
            parentId = byId.get(parentId)?.parentNodeId
          }
          return false
        }

        const stackAncestor = target?.parentNodeId ? byId.get(target.parentNodeId) : null
        const rowAncestor = stackAncestor?.parentNodeId ? byId.get(stackAncestor.parentNodeId) : null

        if (target && stackAncestor?.nodeType === "stack" && rowAncestor?.nodeType === "row") {
          const isLaterInEditedStack = (fragment: PageFragment): boolean => (
            fragment.nodeId !== target.nodeId &&
            fragment.y > target.y &&
            isDescendantOf(fragment, stackAncestor.nodeId)
          )
          const adjustedY = (fragment: PageFragment): number => (
            isLaterInEditedStack(fragment) ? fragment.y + delta : fragment.y
          )
          const rowNode = doc.document.sections
            .map((docSection) => docSection.nodes[rowAncestor.nodeId])
            .find((node) => node?.type === "row")
          const rowMinHeight = rowNode?.type === "row" ? Math.max(0, rowNode.props.minHeight ?? 0) : 0
          const stackFragments = page.fragments.filter((fragment) =>
            fragment.parentNodeId === rowAncestor.nodeId &&
            fragment.nodeType === "stack"
          )

          const stackHeight = (stack: PageFragment): number => {
            const stackNode = doc.document.sections
              .map((docSection) => docSection.nodes[stack.nodeId])
              .find((node) => node?.type === "stack")
            const stackMinHeight = stackNode?.type === "stack"
              ? Math.max(DEFAULT_STACK_MIN_HEIGHT, stackNode.props.minHeight ?? 0)
              : DEFAULT_STACK_MIN_HEIGHT
            const contentBottom = page.fragments.reduce((bottom, fragment) => {
              if (!isDescendantOf(fragment, stack.nodeId)) return bottom
              const fragmentHeight = fragment.nodeId === nodeId ? height : fragment.height
              return Math.max(bottom, adjustedY(fragment) + fragmentHeight)
            }, stack.y)
            return Math.max(stackMinHeight, contentBottom - stack.y)
          }

          const nextRowHeight = Math.max(rowMinHeight, ...stackFragments.map(stackHeight))
          const rowDelta = nextRowHeight - rowAncestor.height
          const rowBottom = rowAncestor.y + rowAncestor.height

          return {
            ...page,
            fragments: page.fragments.map((fragment) => {
              const isTarget = fragment.nodeId === nodeId &&
                fragment.nodeType === "paragraph" &&
                (pageIndex == null || fragment.pageIndex === pageIndex)
              const isRow = fragment.nodeId === rowAncestor.nodeId && fragment.nodeType === "row"
              const isRowStack = fragment.parentNodeId === rowAncestor.nodeId && fragment.nodeType === "stack"
              const isInsideRow = isDescendantOf(fragment, rowAncestor.nodeId)
              const shouldShiftBelowRow = !isRow && !isInsideRow && fragment.y >= rowBottom - 0.5
              const shouldShiftInsideStack = isLaterInEditedStack(fragment)

              if (isTarget) return { ...fragment, height }
              if (isRow || isRowStack) return { ...fragment, height: nextRowHeight }
              if (shouldShiftInsideStack && Math.abs(delta) >= 0.5) {
                return {
                  ...fragment,
                  y: fragment.y + delta,
                  lines: fragment.lines?.map((line) => ({ ...line, y: line.y + delta })),
                }
              }
              if (!shouldShiftBelowRow || Math.abs(rowDelta) < 0.5) return fragment
              return {
                ...fragment,
                y: fragment.y + rowDelta,
                lines: fragment.lines?.map((line) => ({ ...line, y: line.y + rowDelta })),
              }
            }),
          }
        }

        return {
          ...page,
          fragments: page.fragments.map((fragment) => {
            const isTarget = fragment.nodeId === nodeId &&
              fragment.nodeType === "paragraph" &&
              (pageIndex == null || fragment.pageIndex === pageIndex)
            if (isTarget) return { ...fragment, height }
            if (fragment.y <= targetY) return fragment
            return {
              ...fragment,
              y: fragment.y + delta,
              lines: fragment.lines?.map((line) => ({ ...line, y: line.y + delta })),
            }
          }),
        }
      }),
    })),
  }
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const [scale, setScale] = useState(0.6)
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")
  const [state, dispatch] = useReducer(reducer, undefined, createInitialEditorState)
  const editorTextMeasurer = useMemo(() => createBrowserTextMeasurer(), [])
  const [fontReadyVersion, setFontReadyVersion] = useState(0)
  const [mode, setMode] = useState<"template" | "fill">("template")
  const [dataSnapshot, setDataSnapshot] = useState<DataSnapshotV1>(() => (
    dataSnapshotFromDocumentParseResult(loadDocumentFromStorage(localStorage))
  ))
  const [packageFieldRegistry, setPackageFieldRegistry] = useState<FieldRegistryV1>(() => (
    fieldRegistryFromDocumentParseResult(loadDocumentFromStorage(localStorage))
  ))
  const isTemplateMode = mode === "template"
  const resolvePreviewDoc = useCallback((doc: DocumentNode) => (
    isTemplateMode
      ? doc
      : bindDocumentWithSnapshot(doc, { registry: packageFieldRegistry, snapshot: dataSnapshot }).doc
  ), [dataSnapshot, isTemplateMode, packageFieldRegistry])
  const previewDoc = useMemo(() => resolvePreviewDoc(state.doc), [resolvePreviewDoc, state.doc])
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
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const [showDrift, setShowDrift] = useState(false)
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null)
  const showDriftRef = useRef(showDrift)
  useEffect(() => { showDriftRef.current = showDrift }, [showDrift])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(state.doc)
  const paginatedRef = useRef(state.paginated)
  const wasInlineEditingRef = useRef(false)

  useEffect(() => { docRef.current = state.doc }, [state.doc])
  useEffect(() => { paginatedRef.current = state.paginated })

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return
    void document.fonts.ready.then(() => setFontReadyVersion((version) => version + 1))
  }, [])

  const {
    nodeId: inlineEditNodeId,
    caretIndex: inlineEditCaretIndex,
    pageIndex: inlineEditPageIndex,
    isVisualFresh: inlineEditVisualFresh,
    nodeIdRef: inlineEditNodeIdRef,
    draftVersionRef: inlineEditDraftVersionRef,
    markVisualFresh: markInlineEditVisualFresh,
    setPageIndex: setInlineEditPageIndex,
    finalizeBeforeAction: finalizeInlineEditBeforeAction,
    resetForDocumentReplace: resetInlineEditStateForDocumentReplace,
    end: handleInlineEditEnd,
    start: handleInlineEditStart,
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
    selectNode: (nodeId) => dispatch({ type: "SELECT_NODE", nodeId }),
    updateInlineTextDraft: (nodeId, text) => dispatch({ type: "UPDATE_INLINE_TEXT_DRAFT", nodeId, text }),
    commitInlineTextEdit: (payload) => dispatch({ type: "COMMIT_INLINE_TEXT_EDIT", ...payload }),
    setPaginated: (paginated) => dispatch({ type: "SET_PAGINATED", paginated }),
  })

  // ─── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(state.doc, packageFieldRegistry, dataSnapshot)
      setSavedAt(new Date())
    }, 500)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSnapshot, packageFieldRegistry, state.doc])

  const handleExport = useCallback(async (format: "pdf" | "docx") => {
    finalizeInlineEditBeforeAction()
    const exportDoc = resolvePreviewDoc(docRef.current)
    const formatLabel = format.toUpperCase()
    setExportError(null)
    setIsExporting(true)
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: exportDoc, format }),
      })
      if (!res.ok) {
        const message = await res.text()
        throw new Error(`export failed: ${res.status} ${message}`)
      }
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
  }, [finalizeInlineEditBeforeAction, resolvePreviewDoc])

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
  }, [paginatePreviewDoc, resetInlineEditStateForDocumentReplace])

  const handleNewDocument = useCallback(() => {
    if (!confirm("สร้างเอกสารใหม่? history จะถูกล้าง")) return
    const doc = createDefaultDocument("Untitled")
    resetInlineEditStateForDocumentReplace()
    setPackageFieldRegistry(SAMPLE_FIELD_REGISTRY_V1)
    setDataSnapshot(createEmptyDataSnapshot())
    dispatch({ type: "LOAD_DOCUMENT", doc, paginated: paginatePreviewDoc(doc) })
  }, [paginatePreviewDoc, resetInlineEditStateForDocumentReplace])

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
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("server-checked")
  const [fontFallback, setFontFallback] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const interactiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverPaginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutVersionRef = useRef(0)
  const browserPaginationGenerationRef = useRef(0)
  const optimisticLayoutRef = useRef<OptimisticLayoutSnapshot | null>(null)
  const prevLineCountRef = useRef<number | null>(null)
  const prevEditNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    browserPaginationGenerationRef.current += 1
  }, [inlineEditNodeId])

  const inlineEditFragmentRanges = useMemo(() => (
    inlineEditNodeId
      ? getWysiwygParagraphFragmentRanges(state.paginated, inlineEditNodeId)
      : []
  ), [inlineEditNodeId, state.paginated])

  useEffect(() => {
    if (!inlineEditNodeId || inlineEditCaretIndex === null) return
    const nextPageIndex = findWysiwygPageIndexInFragmentRanges(inlineEditFragmentRanges, inlineEditCaretIndex)
    if (nextPageIndex === null || nextPageIndex === inlineEditPageIndex) return
    setInlineEditPageIndex(nextPageIndex)
  }, [inlineEditCaretIndex, inlineEditFragmentRanges, inlineEditNodeId, inlineEditPageIndex])

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
    const paginated = paginateDocument(previewDoc, editorTextMeasurer)
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

    const measured = measureParagraph(paraNode, fragment.width, editorTextMeasurer)
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
      const paginated = paginateDocument(previewDoc, editorTextMeasurer)
      if (generation !== browserPaginationGenerationRef.current) return
      if (inlineEditNodeIdAtSchedule !== inlineEditNodeIdRef.current) return
      optimisticLayoutRef.current = { doc: previewDoc, paginated }
      dispatch({ type: "SET_PAGINATED", paginated })
      if (inlineEditDraftVersionAtSchedule !== null) {
        markInlineEditVisualFresh(inlineEditDraftVersionAtSchedule)
      }
    }, debounceMs)

    return () => { if (interactiveDebounceRef.current) clearTimeout(interactiveDebounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTextMeasurer, fontReadyVersion, markInlineEditVisualFresh, previewDoc])

  // Server pagination — export layout truth. The editor canvas
  // keeps the browser preview so normal display and inline editing share the
  // same visual line layout; server output is kept for status/drift/export.
  useEffect(() => {
    const layoutVersion = ++layoutVersionRef.current
    let controller: AbortController | null = null
    setLayoutStatus("optimistic")

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
          setFontFallback(res.headers.get("X-FlowDoc-Font") === "fallback")
          return await res.json() as PaginatedDocument
        })
        .then((paginated) => {
          if (layoutVersion !== layoutVersionRef.current) return
          setLayoutError(false)
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
          setLayoutStatus("server-checked")
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          if (layoutVersion !== layoutVersionRef.current) return
          console.error("server pagination failed:", error)
          setLayoutStatus("optimistic")
          setLayoutError(true)
        })
        .finally(() => {
          if (layoutVersion === layoutVersionRef.current) setIsLayoutLoading(false)
        })
    }, inlineEditNodeId ? 500 : 120)

    return () => {
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
      return
    }
    dispatch({ type: "SELECT_NODE", nodeId: null })
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
          handleInlineEditStart(clickAction.nodeId, clickAction.caretIndex, clickAction.pageIndex)
          return
        }
        if (source.source === "document") {
          dispatch({ type: "SELECT_NODE", nodeId: source.nodeId })
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
    if ((e.ctrlKey || e.metaKey) && !isTextInput) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        zoomIn()
        return
      }
      if (e.key === "-") {
        e.preventDefault()
        zoomOut()
        return
      }
      if (e.key === "0") {
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
      else dispatch({ type: "SELECT_NODE", nodeId: null })
    }
    if (e.key === "Delete" && state.selectedNodeId && !state.drag) {
      if (isTextInput) return
      e.preventDefault()
      dispatch({ type: "DELETE_NODE", nodeId: state.selectedNodeId })
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
      if (isTextInput) return
      e.preventDefault()
      if (!isTemplateMode) return
      handleUndo()
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
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
      style={{ fontFamily: "monospace", background: "#f9fafb", height: "100vh", display: "flex", flexDirection: "column", cursor: state.drag ? "grabbing" : (resizeDrag && !resizeDrag.committed) ? "col-resize" : (minHeightDrag && !minHeightDrag.committed) ? "row-resize" : (marginDrag && !marginDrag.committed) ? (marginDrag.side === "left" || marginDrag.side === "right" ? "ew-resize" : "ns-resize") : "default", userSelect: state.drag || (resizeDrag && !resizeDrag.committed) || (minHeightDrag && !minHeightDrag.committed) || (marginDrag && !marginDrag.committed) ? "none" : undefined }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      onWheelCapture={handleWheelCapture}
      tabIndex={-1}
    >
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {fontFallback && (
            <span title="Server is using Helvetica fallback — Thai text layout may be incorrect" style={{ fontSize: 10, color: "#d97706", cursor: "help" }}>
              ⚠ fallback font
            </span>
          )}
          {layoutError && (
            <span data-testid="layout-error-badge" title="Server pagination failed — editor is showing browser preview only" style={{ fontSize: 10, color: "#dc2626", cursor: "help" }}>
              ⚠ layout error
            </span>
          )}
          {savedAt && !isLayoutLoading && layoutStatus === "server-checked" && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>
              saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {isLayoutLoading && !state.drag && !inlineEditNodeId && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>↻ layout…</span>
          )}
          {!isLayoutLoading && layoutStatus === "optimistic" && !state.drag && !inlineEditNodeId && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>preview layout</span>
          )}
          {exportError && (
            <span title={exportError} style={{ fontSize: 10, color: "#dc2626", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {exportError}
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
          {(["pdf", "docx"] as const).map((fmt) => (
            <button key={fmt} disabled={isExporting} onClick={() => handleExport(fmt)}
              style={{ padding: "4px 10px", fontSize: 11, cursor: isExporting ? "not-allowed" : "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: isExporting ? "#f9fafb" : "white", color: isExporting ? "#9ca3af" : "#374151" }}>
              {isExporting ? "…" : `Export ${fmt.toUpperCase()}`}
            </button>
          ))}
        </div>
        {state.drag && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            dragging {describeDragSource(state.drag.source)} — Esc to cancel
          </span>
        )}
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
        <EditorCanvas
          paginated={state.paginated}
          doc={previewDoc}
          drag={isTemplateMode ? state.drag : null}
          scale={scale}
          selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
          isLayoutLoading={isLayoutLoading}
          textMeasurer={editorTextMeasurer}
          inlineEditVisualFresh={isTemplateMode ? inlineEditVisualFresh : true}
          inlineEditNodeId={isTemplateMode ? inlineEditNodeId : null}
          inlineEditCaretIndex={isTemplateMode ? inlineEditCaretIndex : null}
          inlineEditPageIndex={isTemplateMode ? inlineEditPageIndex : null}
          onInlineEditStart={isTemplateMode ? handleInlineEditStart : () => undefined}
          onInlineEditChange={isTemplateMode ? handleInlineEditChange : () => undefined}
          onInlineEditCaretChange={isTemplateMode ? handleInlineEditCaretChange : () => undefined}
          onInlineEditUserInteraction={isTemplateMode ? handleInlineEditUserInteraction : () => undefined}
          onInlineEditHeightChange={isTemplateMode ? handleInlineEditHeightChange : () => undefined}
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
        />
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #e5e7eb", overflow: "hidden" }}>
          {isTemplateMode ? (
            <div style={{ flexShrink: 0 }}>
              <PropertyPanel
                doc={state.doc}
                registry={packageFieldRegistry}
                selectedNodeId={state.selectedNodeId}
                onUpdateProps={(nodeId, changes) => dispatch({ type: "UPDATE_PROPS", nodeId, changes })}
                onUpdateText={(nodeId, text) => dispatch({ type: "UPDATE_TEXT", nodeId, text })}
                onUpdateFieldRef={(fieldRefId, changes) => dispatch({ type: "UPDATE_FIELD_REF", fieldRefId, changes })}
                onDelete={(nodeId) => dispatch({ type: "DELETE_NODE", nodeId })}
                tableOps={{
                  addRow: (tableId, afterIndex) => dispatch({ type: "TABLE_ADD_ROW", tableId, afterIndex }),
                  removeRow: (tableId, rowIndex) => dispatch({ type: "TABLE_REMOVE_ROW", tableId, rowIndex }),
                  addCol: (tableId, afterIndex) => dispatch({ type: "TABLE_ADD_COL", tableId, afterIndex }),
                  removeCol: (tableId, colIndex) => dispatch({ type: "TABLE_REMOVE_COL", tableId, colIndex }),
                }}
              />
            </div>
          ) : (
            <FillingPanel
              doc={state.doc}
              registry={packageFieldRegistry}
              snapshot={dataSnapshot}
              readinessIssues={dataReadiness.issues}
              onChange={(key, value) => setDataSnapshot((prev) => setDataSnapshotValue(prev, key, value))}
            />
          )}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <OutlinePanel
              doc={isTemplateMode ? state.doc : previewDoc}
              selectedNodeId={isTemplateMode ? state.selectedNodeId : null}
              onSelect={(nodeId) => {
                if (isTemplateMode) dispatch({ type: "SELECT_NODE", nodeId })
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
