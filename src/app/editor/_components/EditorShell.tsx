"use client"

import { useReducer, useCallback, useRef, useState, useEffect, useMemo } from "react"
import { paginateDocument } from "@/pagination"
import { defaultTextMeasurer, measureParagraph } from "@/layout"
import { assertDocument, createDefaultDocument, normalizeDocument } from "@/document"
import { applyPlacementOperation, updateNodeProps, updateParagraphText, deleteNode, addTableRow, removeTableRow, addTableColumn, removeTableColumn, updateSectionMargin, splitParagraphAtIndex, mergeParagraphWithPrevious } from "@/document"
import { bindDocument } from "@/binding"
import type { FieldData, FieldValue } from "@/binding"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument, PaginatedLine, PageFragment } from "@/pagination"
import type { MeasuredParagraph } from "@/layout"
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
import { createBrowserTextMeasurer } from "./browserTextMeasurer"

// ─── State ────────────────────────────────────────────────────────────────────

export interface DragState {
  source: DragSource
  clientX: number
  clientY: number
  preview: PlacementPreview | null
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
  past: DocumentNode[]
  doc: DocumentNode
  future: DocumentNode[]
  paginated: PaginatedDocument
  drag: DragState | null
  selectedNodeId: string | null
  lastSplitNodeId: string | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
}

type EditorAction =
  | { type: "DRAG_START"; source: DragSource; clientX: number; clientY: number }
  | { type: "DRAG_MOVE"; clientX: number; clientY: number; preview: PlacementPreview | null }
  | { type: "DRAG_COMMIT"; op: PlacementOperation; sectionId: string }
  | { type: "DRAG_CANCEL" }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "UPDATE_PROPS"; nodeId: string; changes: Record<string, unknown> }
  | { type: "UPDATE_TEXT"; nodeId: string; text: string }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "SET_PAGINATED"; paginated: PaginatedDocument }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TABLE_ADD_ROW"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_ROW"; tableId: string; rowIndex: number }
  | { type: "TABLE_ADD_COL"; tableId: string }
  | { type: "TABLE_REMOVE_COL"; tableId: string; colIndex: number }
  | { type: "LOAD_DOCUMENT"; doc: DocumentNode }
  | { type: "RESIZE_COLUMNS"; leftStackId: string; leftShare: number; rightStackId: string; rightShare: number }
  | { type: "RESIZE_ROW_MIN_HEIGHT"; rowId: string; minHeight: number }
  | { type: "UPDATE_MARGIN"; sectionIndex: number; margin: { top: number; right: number; bottom: number; left: number } }
  | { type: "SPLIT_PARAGRAPH"; nodeId: string; splitIndex: number }
  | { type: "CLEAR_SPLIT_NODE_ID" }
  | { type: "MERGE_PARAGRAPH"; nodeId: string }
  | { type: "CLEAR_MERGE_RESULT" }

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "flowdoc_document"

function saveToStorage(doc: DocumentNode): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)) } catch { /* full / disabled */ }
}

function loadFromStorage(): DocumentNode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version === 1 && Array.isArray(parsed?.document?.sections)) return parsed as DocumentNode
    return null
  } catch { return null }
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

function pushDoc(state: EditorState, newDoc: DocumentNode): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), state.doc],
    doc: normalizedDoc,
    future: [],
  }
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
    case "DELETE_NODE":
      return { ...pushDoc(state, deleteNode(state.doc, action.nodeId)), selectedNodeId: null }
    case "SET_PAGINATED":
      return { ...state, paginated: action.paginated }
    case "UNDO": {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return {
        ...state,
        past: state.past.slice(0, -1),
        doc: prev,
        future: [state.doc, ...state.future],
      }
    }
    case "REDO": {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        ...state,
        past: [...state.past, state.doc],
        doc: next,
        future: state.future.slice(1),
      }
    }
    case "LOAD_DOCUMENT":
      const normalizedDoc = normalizeDocument(action.doc)
      return { ...state, past: [], doc: normalizedDoc, future: [], selectedNodeId: null, drag: null }
    case "TABLE_ADD_ROW":
      return pushDoc(state, addTableRow(state.doc, action.tableId, action.afterIndex))
    case "TABLE_REMOVE_ROW":
      return pushDoc(state, removeTableRow(state.doc, action.tableId, action.rowIndex))
    case "TABLE_ADD_COL":
      return pushDoc(state, addTableColumn(state.doc, action.tableId))
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
      return { ...pushDoc(state, result.doc), lastSplitNodeId: result.newNodeId }
    }
    case "CLEAR_SPLIT_NODE_ID":
      return { ...state, lastSplitNodeId: null }
    case "MERGE_PARAGRAPH": {
      const result = mergeParagraphWithPrevious(state.doc, action.nodeId)
      if (!result) return state
      return {
        ...pushDoc(state, result.doc),
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

function setFieldDataValue(data: FieldData, key: string, value: FieldValue): FieldData {
  const parts = key.split(".").filter(Boolean)
  if (parts.length === 0) return data

  const root: FieldData = { ...data }
  let cursor: FieldData = root

  parts.slice(0, -1).forEach((part) => {
    const current = cursor[part]
    const next = typeof current === "object" && current != null && !Array.isArray(current)
      ? { ...current } as FieldData
      : {}
    cursor[part] = next
    cursor = next
  })

  cursor[parts[parts.length - 1]] = value
  return root
}

// ─── Local Reflow Helpers ─────────────────────────────────────────────────────

function findParagraphNode(doc: DocumentNode, nodeId: string) {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
  }
  return null
}

function findParagraphFragment(paginated: PaginatedDocument, nodeId: string): PageFragment | null {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const f = page.fragments.find((f) => f.nodeId === nodeId && f.nodeType === "paragraph")
      if (f) return f
    }
  }
  return null
}

function buildLocalLines(measured: MeasuredParagraph, fragment: PageFragment): PaginatedLine[] {
  let lineY = fragment.y + measured.spacingBefore
  return measured.lines.map((line) => {
    const result: PaginatedLine = {
      text: line.text,
      x: fragment.x,
      y: lineY,
      width: line.width,
      height: line.height,
      segments: line.segments,
    }
    lineY += line.height
    return result
  })
}

function replaceFragmentLines(
  paginated: PaginatedDocument,
  nodeId: string,
  lines: PaginatedLine[],
  height: number,
): PaginatedDocument {
  return {
    ...paginated,
    sections: paginated.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => ({
        ...page,
        fragments: page.fragments.map((f) =>
          f.nodeId === nodeId && f.nodeType === "paragraph"
            ? { ...f, lines, height }
            : f,
        ),
      })),
    })),
  }
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const [scale, setScale] = useState(0.6)
  const [state, dispatch] = useReducer(reducer, undefined, createInitialEditorState)
  const editorTextMeasurer = useMemo(() => createBrowserTextMeasurer(), [])
  const [fontReadyVersion, setFontReadyVersion] = useState(0)
  const [mode, setMode] = useState<"template" | "fill">("template")
  const [fieldData, setFieldData] = useState<FieldData>({})
  const isTemplateMode = mode === "template"
  const previewDoc = useMemo(() => (
    isTemplateMode
      ? state.doc
      : bindDocument(state.doc, { registry: { fields: [] }, data: fieldData })
  ), [fieldData, isTemplateMode, state.doc])

  const pageRefs = useRef<Map<string, SVGSVGElement>>(new Map())
  const pendingDragRef = useRef<{ source: DragSource; clientX: number; clientY: number } | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const [minHeightDrag, setMinHeightDrag] = useState<MinHeightDrag | null>(null)
  const [marginDrag, setMarginDrag] = useState<MarginDrag | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [showTextSegments, setShowTextSegments] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inlineEditNodeId, setInlineEditNodeId] = useState<string | null>(null)
  const [inlineEditCaretIndex, setInlineEditCaretIndex] = useState<number | null>(null)

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return
    void document.fonts.ready.then(() => setFontReadyVersion((version) => version + 1))
  }, [])

  // ─── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(state.doc)
      setSavedAt(new Date())
    }, 500)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc])

  const handleExport = useCallback(async (format: "pdf" | "docx") => {
    setIsExporting(true)
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: previewDoc, format }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `document.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      console.error("export error:", err)
    } finally {
      setIsExporting(false)
    }
  }, [previewDoc])

  const importRef = useRef<HTMLInputElement>(null)

  const handleExportJson = useCallback(() => {
    const title = state.doc.document.meta?.title ?? "document"
    const blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `${title}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }, [state.doc])

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (parsed?.version === 1 && Array.isArray(parsed?.document?.sections)) {
          dispatch({ type: "LOAD_DOCUMENT", doc: parsed as DocumentNode })
        }
      } catch { /* invalid JSON */ }
    }
    reader.readAsText(file)
    e.target.value = ""
  }, [])

  const handleNewDocument = useCallback(() => {
    if (!confirm("สร้างเอกสารใหม่? history จะถูกล้าง")) return
    dispatch({ type: "LOAD_DOCUMENT", doc: createDefaultDocument("Untitled") })
  }, [])

  // ─── Inline editing ───────────────────────────────────────────────────────────
  const handleInlineEditStart = useCallback((nodeId: string, caretIndex: number | null = null) => {
    dispatch({ type: "SELECT_NODE", nodeId })
    setInlineEditNodeId(nodeId)
    setInlineEditCaretIndex(caretIndex)
  }, [])

  const handleInlineEditChange = useCallback((nodeId: string, text: string) => {
    dispatch({ type: "UPDATE_TEXT", nodeId, text })
  }, [])

  const handleInlineEditEnd = useCallback(() => {
    setInlineEditNodeId(null)
    setInlineEditCaretIndex(null)
  }, [])

  const handleSplitParagraph = useCallback((nodeId: string, splitIndex: number) => {
    dispatch({ type: "SPLIT_PARAGRAPH", nodeId, splitIndex })
  }, [])

  const handleMergeParagraph = useCallback((nodeId: string) => {
    dispatch({ type: "MERGE_PARAGRAPH", nodeId })
  }, [])

  // Focus the new paragraph after a split
  useEffect(() => {
    if (!state.lastSplitNodeId) return
    setInlineEditNodeId(state.lastSplitNodeId)
    setInlineEditCaretIndex(0)
    dispatch({ type: "CLEAR_SPLIT_NODE_ID" })
  }, [state.lastSplitNodeId])

  // Focus the previous paragraph after a merge, caret at join point
  useEffect(() => {
    if (!state.mergeResult) return
    setInlineEditNodeId(state.mergeResult.prevNodeId)
    setInlineEditCaretIndex(state.mergeResult.caretIndex)
    dispatch({ type: "CLEAR_MERGE_RESULT" })
  }, [state.mergeResult])

  // ─── Editor preview layout ─────────────────────────────────────────────────
  const [isLayoutLoading, setIsLayoutLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paginatedRef = useRef(state.paginated)
  useEffect(() => { paginatedRef.current = state.paginated })

  // Local reflow — re-measure only the active paragraph immediately on each
  // text change so line wrapping feels live while the full paginator catches up.
  useEffect(() => {
    if (!inlineEditNodeId) return
    const paraNode = findParagraphNode(previewDoc, inlineEditNodeId)
    if (!paraNode) return
    const fragment = findParagraphFragment(paginatedRef.current, inlineEditNodeId)
    if (!fragment) return
    const measured = measureParagraph(paraNode, fragment.width, editorTextMeasurer)
    const newLines = buildLocalLines(measured, fragment)
    dispatch({
      type: "SET_PAGINATED",
      paginated: replaceFragmentLines(paginatedRef.current, inlineEditNodeId, newLines, measured.totalHeight),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc, inlineEditNodeId])

  // Full pagination — corrects page breaks and surrounding layout.
  // Debounce is longer during inline editing so local reflow has time to show first.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      setIsLayoutLoading(true)
      dispatch({ type: "SET_PAGINATED", paginated: paginateDocument(previewDoc, editorTextMeasurer) })
      setIsLayoutLoading(false)
    }, inlineEditNodeId ? 200 : 16)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTextMeasurer, fontReadyVersion, previewDoc, inlineEditNodeId])

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
    if (inlineEditNodeId) return
    dispatch({ type: "SELECT_NODE", nodeId: null })
  }, [inlineEditNodeId])

  const handleResizeStart = useCallback((
    rowId: string, leftStackId: string, rightStackId: string,
    pairX: number, pairWidth: number,
    startClientX: number, pageKey: string,
  ) => {
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setInlineEditNodeId(null)
    setInlineEditCaretIndex(null)
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
  }, [scale, state.doc, state.paginated])

  const handleMinHeightResizeStart = useCallback((
    rowId: string, rowFragY: number, pageKey: string,
  ) => {
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setInlineEditNodeId(null)
    setInlineEditCaretIndex(null)
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
  }, [editorTextMeasurer, state.doc, state.paginated])

  const handleMarginResizeStart = useCallback((
    sectionIndex: number,
    side: "top" | "right" | "bottom" | "left",
    currentMargins: { top: number; right: number; bottom: number; left: number },
    pageWidthPt: number,
    pageHeightPt: number,
    pageKey: string,
    altKey: boolean,
  ) => {
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setInlineEditNodeId(null)
    setInlineEditCaretIndex(null)
    setMarginDrag({ sectionIndex, side, pageWidthPt, pageHeightPt, currentMargins, pageKey, altKey })
  }, [])

  // Palette drag: starts immediately
  const startPaletteDrag = useCallback((source: DragSource, e: React.PointerEvent) => {
    e.preventDefault()
    dispatch({ type: "DRAG_START", source, clientX: e.clientX, clientY: e.clientY })
  }, [])

  // Canvas fragment pointerDown: wait for movement before committing to drag
  const startNodePointerDown = useCallback((source: DragSource, e: React.PointerEvent) => {
    e.preventDefault()
    pendingDragRef.current = { source, clientX: e.clientX, clientY: e.clientY }
  }, [])

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
        const newLeftShare = Math.round((leftWidthPt / pairWidth) * totalShare * 100) / 100
        const newRightShare = Math.round((totalShare - newLeftShare) * 100) / 100
        dispatch({ type: "RESIZE_COLUMNS", leftStackId, leftShare: newLeftShare, rightStackId, rightShare: newRightShare })
        setResizeDrag(null)
        return
      }
      // PendingDrag released without moving → treat as click → select node
      if (pendingDragRef.current) {
        const { source } = pendingDragRef.current
        pendingDragRef.current = null
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
    [marginDrag, minHeightDrag, resizeDrag, state.drag, state.doc, computePreview],
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (inlineEditNodeId) { setInlineEditNodeId(null); setInlineEditCaretIndex(null); return }
      if (state.drag) dispatch({ type: "DRAG_CANCEL" })
      else if (pendingDragRef.current) pendingDragRef.current = null
      else dispatch({ type: "SELECT_NODE", nodeId: null })
    }
    if (e.key === "Delete" && state.selectedNodeId && !state.drag) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      e.preventDefault()
      dispatch({ type: "DELETE_NODE", nodeId: state.selectedNodeId })
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      e.preventDefault()
      dispatch({ type: "UNDO" })
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      e.preventDefault()
      dispatch({ type: "REDO" })
    }
  }, [state.drag, state.selectedNodeId])

  return (
    <div
      style={{ fontFamily: "monospace", background: "#f9fafb", height: "100vh", display: "flex", flexDirection: "column", cursor: state.drag ? "grabbing" : (resizeDrag && !resizeDrag.committed) ? "col-resize" : (minHeightDrag && !minHeightDrag.committed) ? "row-resize" : (marginDrag && !marginDrag.committed) ? (marginDrag.side === "left" || marginDrag.side === "right" ? "ew-resize" : "ns-resize") : "default", userSelect: state.drag || (resizeDrag && !resizeDrag.committed) || (minHeightDrag && !minHeightDrag.committed) || (marginDrag && !marginDrag.committed) ? "none" : undefined }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Toolbar */}
      <div style={{ padding: "10px 20px", background: "white", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: "bold", color: "#111827" }}>FlowDoc Editor</span>
        {/* Undo / Redo */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {(["Undo", "Redo"] as const).map((label) => {
            const isUndo = label === "Undo"
            const disabled = isUndo ? state.past.length === 0 : state.future.length === 0
            return (
              <button key={label} disabled={disabled}
                onClick={() => dispatch({ type: isUndo ? "UNDO" : "REDO" })}
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
          {(["template", "fill"] as const).map((m) => (
            <button key={m}
              onClick={() => {
                  setMode(m)
                  if (m === "fill") {
                    dispatch({ type: "DRAG_CANCEL" })
                    setInlineEditNodeId(null)
                    setInlineEditCaretIndex(null)
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
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportJson} />
          <button onClick={handleExportJson}
            style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: "white", color: "#374151" }}>
            Save JSON
          </button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {savedAt && !isLayoutLoading && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>
              saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {isLayoutLoading && !state.drag && !inlineEditNodeId && (
            <span style={{ fontSize: 10, color: "#9ca3af" }}>↻ layout…</span>
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
              <FieldPalette onDragStart={startPaletteDrag} isDragging={!!state.drag} />
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
          inlineEditNodeId={isTemplateMode ? inlineEditNodeId : null}
          inlineEditCaretIndex={isTemplateMode ? inlineEditCaretIndex : null}
          onInlineEditStart={isTemplateMode ? handleInlineEditStart : () => undefined}
          onInlineEditChange={isTemplateMode ? handleInlineEditChange : () => undefined}
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
          onScaleChange={setScale}
          showTextSegments={showTextSegments}
        />
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #e5e7eb", overflow: "hidden" }}>
          {isTemplateMode ? (
            <div style={{ flexShrink: 0 }}>
              <PropertyPanel
                doc={state.doc}
                selectedNodeId={state.selectedNodeId}
                onUpdateProps={(nodeId, changes) => dispatch({ type: "UPDATE_PROPS", nodeId, changes })}
                onUpdateText={(nodeId, text) => dispatch({ type: "UPDATE_TEXT", nodeId, text })}
                onDelete={(nodeId) => dispatch({ type: "DELETE_NODE", nodeId })}
                tableOps={{
                  addRow: (tableId, afterIndex) => dispatch({ type: "TABLE_ADD_ROW", tableId, afterIndex }),
                  removeRow: (tableId, rowIndex) => dispatch({ type: "TABLE_REMOVE_ROW", tableId, rowIndex }),
                  addCol: (tableId) => dispatch({ type: "TABLE_ADD_COL", tableId }),
                  removeCol: (tableId, colIndex) => dispatch({ type: "TABLE_REMOVE_COL", tableId, colIndex }),
                }}
              />
            </div>
          ) : (
            <FillingPanel
              doc={state.doc}
              data={fieldData}
              onChange={(key, value) => setFieldData((prev) => setFieldDataValue(prev, key, value))}
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
