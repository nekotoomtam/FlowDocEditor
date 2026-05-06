"use client"

import { useReducer, useCallback, useRef, useState, useEffect } from "react"
import { paginateDocument } from "@/pagination"
import { defaultTextMeasurer } from "@/layout"
import { createDefaultDocument, normalizeDocument } from "@/document"
import { applyPlacementOperation, updateNodeProps, updateParagraphText, deleteNode, addTableRow, removeTableRow, addTableColumn, removeTableColumn, updateSectionMargin } from "@/document"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument, PageFragment } from "@/pagination"
import type {
  DragSource,
  PlacementPreview,
  PlacementOperation,
  PlacementZone,
  PlacementIntentType,
} from "@/placement/types"
import { EditorPalette } from "./EditorPalette"
import { EditorCanvas } from "./EditorCanvas"
import { PropertyPanel } from "./PropertyPanel"
import { OutlinePanel } from "./OutlinePanel"

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
  committed?: boolean    // true = waiting for server, keep visual override alive
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

function isPaginatedDocument(value: unknown): value is PaginatedDocument {
  return !!value && typeof value === "object" && Array.isArray((value as PaginatedDocument).sections)
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
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), state.doc],
    doc: normalizedDoc,
    future: [],
    paginated: paginate(normalizedDoc),
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
        paginated: paginate(prev),
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
        paginated: paginate(next),
      }
    }
    case "LOAD_DOCUMENT":
      const normalizedDoc = normalizeDocument(action.doc)
      return { ...state, past: [], doc: normalizedDoc, future: [], paginated: paginate(normalizedDoc), selectedNodeId: null, drag: null }
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

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const [scale, setScale] = useState(0.6)
  const [state, dispatch] = useReducer(reducer, undefined, createInitialEditorState)

  const pageRefs = useRef<Map<string, SVGSVGElement>>(new Map())
  const pendingDragRef = useRef<{ source: DragSource; clientX: number; clientY: number } | null>(null)
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag | null>(null)
  const [minHeightDrag, setMinHeightDrag] = useState<MinHeightDrag | null>(null)
  const [marginDrag, setMarginDrag] = useState<MarginDrag | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inlineEditNodeId, setInlineEditNodeId] = useState<string | null>(null)

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
        body: JSON.stringify({ doc: state.doc, format }),
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
  }, [state.doc])

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
  const handleInlineEditStart = useCallback((nodeId: string) => {
    dispatch({ type: "SELECT_NODE", nodeId })
    setInlineEditNodeId(nodeId)
  }, [])

  const handleInlineEditChange = useCallback((nodeId: string, text: string) => {
    dispatch({ type: "UPDATE_TEXT", nodeId, text })
  }, [])

  const handleInlineEditEnd = useCallback(() => {
    setInlineEditNodeId(null)
  }, [])

  // ─── Server-side layout ────────────────────────────────────────────────────
  const [isLayoutLoading, setIsLayoutLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsLayoutLoading(true)
      try {
        const res = await fetch("/api/paginate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.doc),
          signal: controller.signal,
        })
        const result: unknown = await res.json()
        if (!res.ok || !isPaginatedDocument(result)) {
          console.error("layout error:", result)
          return
        }
        dispatch({ type: "SET_PAGINATED", paginated: result })
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error("layout error:", err)
      } finally {
        if (!controller.signal.aborted) setIsLayoutLoading(false)
      }
    }, 80)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc])

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
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgTop = svgEl.getBoundingClientRect().top
    const naturalDoc = updateNodeProps(state.doc, rowId, { minHeight: undefined })
    const naturalHeight = getRowFragmentHeight(paginate(naturalDoc), rowId) ?? 0

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
  }, [state.doc, state.paginated])

  const handleMarginResizeStart = useCallback((
    sectionIndex: number,
    side: "top" | "right" | "bottom" | "left",
    currentMargins: { top: number; right: number; bottom: number; left: number },
    pageWidthPt: number,
    pageHeightPt: number,
    pageKey: string,
    altKey: boolean,
  ) => {
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
      if (resizeDrag) {
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
        setMarginDrag((prev) => prev ? { ...prev, committed: true } : null)
        return
      }
      // Commit minHeight resize
      if (minHeightDrag && !minHeightDrag.committed) {
        dispatch({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: minHeightDrag.rowId, minHeight: minHeightDrag.currentMinHeight })
        setMinHeightDrag((prev) => prev ? { ...prev, committed: true } : null)
        return
      }
      // Commit resize
      if (resizeDrag && !resizeDrag.committed) {
        const { leftStackId, rightStackId, pairX, pairWidth, currentDocX, totalShare } = resizeDrag
        const leftWidthPt = currentDocX - pairX
        const newLeftShare = Math.round((leftWidthPt / pairWidth) * totalShare * 100) / 100
        const newRightShare = Math.round((totalShare - newLeftShare) * 100) / 100
        dispatch({ type: "RESIZE_COLUMNS", leftStackId, leftShare: newLeftShare, rightStackId, rightShare: newRightShare })
        setResizeDrag((prev) => prev ? { ...prev, committed: true } : null)
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
      if (inlineEditNodeId) { setInlineEditNodeId(null); return }
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
            dragging {state.drag.source.source === "palette" ? state.drag.source.blockType : "node"} — Esc to cancel
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <EditorPalette onDragStart={startPaletteDrag} isDragging={!!state.drag} />
        <EditorCanvas
          paginated={state.paginated}
          doc={state.doc}
          drag={state.drag}
          scale={scale}
          selectedNodeId={state.selectedNodeId}
          isLayoutLoading={isLayoutLoading}
          inlineEditNodeId={inlineEditNodeId}
          onInlineEditStart={handleInlineEditStart}
          onInlineEditChange={handleInlineEditChange}
          onInlineEditEnd={handleInlineEditEnd}
          setPageRef={setPageRef}
          onNodePointerDown={startNodePointerDown}
          onBackgroundPointerDown={handleBackgroundPointerDown}
          onResizeStart={handleResizeStart}
          resizeDrag={resizeDrag}
          minHeightDrag={minHeightDrag}
          onMinHeightResizeStart={handleMinHeightResizeStart}
          marginDrag={marginDrag}
          onMarginResizeStart={handleMarginResizeStart}
          onScaleChange={setScale}
        />
        <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #e5e7eb", overflow: "hidden" }}>
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
          <div style={{ flex: 1, overflow: "hidden" }}>
            <OutlinePanel
              doc={state.doc}
              selectedNodeId={state.selectedNodeId}
              onSelect={(nodeId) => dispatch({ type: "SELECT_NODE", nodeId })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
