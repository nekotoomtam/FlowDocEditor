import { useCallback, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react"
import { paginateDocument } from "@/pagination"
import { updateNodeProps } from "@/document"
import type { TextMeasurer } from "@/layout"
import type { DocumentNode } from "@/schema"
import type { DragSource } from "@/placement/types"
import type { CanvasTableAction } from "../EditorCanvas"
import type { OutlineBodyChildReorder } from "../OutlinePanel"
import type { StyleManagerResourceSelection } from "../StyleManagerPanel"
import { effectiveFlowStackResizeMinShare } from "../flowStackResize"
import type { EditorAction } from "../editorReducer"
import type {
  HeaderFooterEditMode,
  HeaderFooterReservedDrag,
  MarginDrag,
  MarginEditMode,
  MinHeightDrag,
  ResizeDrag,
  StackResizeDrag,
} from "../editorInteractionTypes"
import {
  isHeaderFooterSupportedDragSource,
  resolveCanvasFlowTableActionTarget,
} from "./editorDragPlacement"
import { getRowFragmentHeight } from "./editorRowFragments"
import type {
  LeftRailMode,
  PendingClickAction,
  PendingDrag,
  RightRailMode,
  WorkflowMode,
  WysiwygFinalizeMode,
} from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

export function useEditorCanvasInteractionActions({
  cancelDeferredInlineEditStart,
  dispatch,
  dispatchEditorAction,
  doc,
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
  selectedNodeId,
  selectionAnchorNodeId,
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
  wysiwygTextSessionNodeId,
}: {
  cancelDeferredInlineEditStart: () => void
  dispatch: (action: EditorAction) => void
  dispatchEditorAction: (action: EditorAction) => void
  doc: DocumentNode
  editorTextMeasurer: TextMeasurer
  finalizeInlineEditBeforeAction: (mode?: WysiwygFinalizeMode) => boolean
  finalizeInlineEditBeforeActionRef: MutableCurrentRef<(mode?: WysiwygFinalizeMode) => boolean>
  finalizeInlineEditBeforeResponsiveAction: () => boolean
  headerFooterEditMode: HeaderFooterEditMode | null
  hideResizePreview: () => void
  inlineEditNodeId: string | null
  marginDragRef: MutableCurrentRef<MarginDrag | null>
  marginEditMode: MarginEditMode | null
  openRightRailMode: (mode: RightRailMode) => void
  pageRefs: MutableCurrentRef<Map<string, HTMLElement>>
  pendingDragRef: MutableCurrentRef<PendingDrag | null>
  scale: number
  scheduleInlineEditEndAfterPaint: (nodeId: string, reason: "blur" | "keyboard", source: string) => void
  scheduleResizePreview: (drag: ResizeDrag) => void
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  setHeaderFooterEditMode: Dispatch<SetStateAction<HeaderFooterEditMode | null>>
  setHeaderFooterReservedDrag: (drag: HeaderFooterReservedDrag | null) => void
  setLeftRailMode: Dispatch<SetStateAction<LeftRailMode>>
  setMarginDrag: (drag: MarginDrag | null) => void
  setMarginEditMode: Dispatch<SetStateAction<MarginEditMode | null>>
  setMinHeightDrag: (drag: MinHeightDrag | null) => void
  setMode: Dispatch<SetStateAction<"template" | "fill">>
  setResizeDrag: (drag: ResizeDrag | null) => void
  setRightRailMode: Dispatch<SetStateAction<RightRailMode>>
  setSelectedStyleResource: Dispatch<SetStateAction<StyleManagerResourceSelection>>
  setWorkflowMode: Dispatch<SetStateAction<WorkflowMode>>
  useOutOfCanvasWysiwygIsland: boolean
  wysiwygTextSessionNodeId: string | null
}) {
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
      if (useOutOfCanvasWysiwygIsland && wysiwygTextSessionNodeId === inlineEditNodeId) {
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
    dispatch,
    finalizeInlineEditBeforeResponsiveAction,
    headerFooterEditMode,
    inlineEditNodeId,
    marginEditMode,
    scheduleInlineEditEndAfterPaint,
    setHeaderFooterEditMode,
    setMarginEditMode,
    setRightRailMode,
    setSelectedStyleResource,
    useOutOfCanvasWysiwygIsland,
    wysiwygTextSessionNodeId,
  ])

  const enterMarginEditMode = useCallback((sectionIndex: number) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
    setHeaderFooterEditMode(null)
    setHeaderFooterReservedDrag(null)
    setMarginEditMode({ sectionIndex })
  }, [
    dispatch,
    finalizeInlineEditBeforeAction,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setMarginEditMode,
    setRightRailMode,
  ])

  const exitMarginEditMode = useCallback(() => {
    if (marginDragRef.current && !marginDragRef.current.committed) return
    setMarginEditMode(null)
  }, [marginDragRef, setMarginEditMode])

  const enterHeaderFooterEditMode = useCallback((sectionIndex: number, zone: "header" | "footer") => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    dispatchEditorAction({ type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE", sectionIndex, zone })
    setRightRailMode("page")
    setMarginEditMode(null)
    setMarginDrag(null)
    setHeaderFooterReservedDrag(null)
    setHeaderFooterEditMode({ sectionIndex, zone })
  }, [
    dispatch,
    dispatchEditorAction,
    finalizeInlineEditBeforeAction,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMarginEditMode,
    setRightRailMode,
  ])

  const exitHeaderFooterEditMode = useCallback(() => {
    if (inlineEditNodeId) finalizeInlineEditBeforeAction()
    setHeaderFooterEditMode(null)
  }, [finalizeInlineEditBeforeAction, inlineEditNodeId, setHeaderFooterEditMode])

  const handleHeaderFooterZonePointerDown = useCallback(() => {
    if (inlineEditNodeId) finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    setRightRailMode("page")
  }, [dispatch, finalizeInlineEditBeforeAction, inlineEditNodeId, setRightRailMode])

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
  }, [
    dispatch,
    finalizeInlineEditBeforeAction,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMarginEditMode,
    setRightRailMode,
  ])

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
    for (const section of doc.document.sections) {
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
  }, [
    dispatch,
    doc,
    finalizeInlineEditBeforeAction,
    pageRefs,
    scale,
    scheduleResizePreview,
    setResizeDrag,
  ])

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
  }, [
    finalizeInlineEditBeforeAction,
    pageRefs,
    scale,
    scheduleResizePreview,
    setResizeDrag,
  ])

  const handleMinHeightResizeStart = useCallback((
    rowId: string, rowFragY: number, pageKey: string,
  ) => {
    finalizeInlineEditBeforeAction()
    dispatch({ type: "SELECT_NODE", nodeId: null })
    const svgEl = pageRefs.current.get(pageKey)
    if (!svgEl) return
    const svgTop = svgEl.getBoundingClientRect().top
    const naturalDoc = updateNodeProps(doc, rowId, { minHeight: undefined })
    const naturalHeight = getRowFragmentHeight(paginateDocument(naturalDoc, editorTextMeasurer), rowId) ?? 0

    let currentMinHeight = naturalHeight
    for (const section of doc.document.sections) {
      const n = section.nodes[rowId]
      if (n?.type === "row") { currentMinHeight = Math.max(n.props.minHeight ?? naturalHeight, naturalHeight); break }
    }

    setMinHeightDrag({
      rowId, rowFragY, svgTop,
      minPt: naturalHeight,
      currentMinHeight,
      pageKey,
    })
  }, [
    dispatch,
    doc,
    editorTextMeasurer,
    finalizeInlineEditBeforeAction,
    pageRefs,
    setMinHeightDrag,
  ])

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
  }, [
    dispatch,
    finalizeInlineEditBeforeAction,
    setHeaderFooterEditMode,
    setMarginDrag,
    setMarginEditMode,
    setRightRailMode,
  ])

  const startPaletteDrag = useCallback((source: DragSource, event: ReactPointerEvent) => {
    if (headerFooterEditMode && !isHeaderFooterSupportedDragSource(source)) return
    event.preventDefault()
    cancelDeferredInlineEditStart()
    finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    dispatch({ type: "DRAG_START", source, clientX: event.clientX, clientY: event.clientY })
  }, [
    cancelDeferredInlineEditStart,
    dispatch,
    finalizeInlineEditBeforeResponsiveAction,
    headerFooterEditMode,
    setSelectedStyleResource,
  ])

  const startNodePointerDown = useCallback((source: DragSource, event: ReactPointerEvent, clickAction?: PendingClickAction) => {
    event.preventDefault()
    cancelDeferredInlineEditStart()
    const deferFinalizeUntilClickResolves = clickAction?.type === "inline-edit"
    if (!deferFinalizeUntilClickResolves) finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    pendingDragRef.current = {
      source,
      clientX: event.clientX,
      clientY: event.clientY,
      clickAction,
      finalizeOnDragStart: deferFinalizeUntilClickResolves,
    }
  }, [
    cancelDeferredInlineEditStart,
    finalizeInlineEditBeforeResponsiveAction,
    pendingDragRef,
    setSelectedStyleResource,
  ])

  const selectContextNode = useCallback((nodeId: string) => {
    finalizeInlineEditBeforeResponsiveAction()
    setSelectedStyleResource(null)
    dispatch({
      type: "SELECT_NODE",
      nodeId,
      anchorNodeId: selectionAnchorNodeId ?? nodeId,
    })
    setRightRailMode("properties")
  }, [
    dispatch,
    finalizeInlineEditBeforeResponsiveAction,
    selectionAnchorNodeId,
    setRightRailMode,
    setSelectedStyleResource,
  ])

  const selectStyleResource = useCallback((resource: Exclude<StyleManagerResourceSelection, null>) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource(resource)
    setLeftRailMode("styles")
    openRightRailMode("style")
  }, [finalizeInlineEditBeforeActionRef, openRightRailMode, setLeftRailMode, setSelectedStyleResource])

  const selectOutlineListGroup = useCallback((instanceId: string) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource({ kind: "list-group", id: instanceId })
    setLeftRailMode("outline")
    openRightRailMode("style")
  }, [finalizeInlineEditBeforeActionRef, openRightRailMode, setLeftRailMode, setSelectedStyleResource])

  const selectLeftRailNode = useCallback((nodeId: string) => {
    setSelectedStyleResource(null)
    dispatchEditorAction({ type: "SELECT_NODE", nodeId })
    setRightRailMode("properties")
  }, [dispatchEditorAction, setRightRailMode, setSelectedStyleResource])

  const reorderLeftRailBodyChild = useCallback((request: OutlineBodyChildReorder) => {
    finalizeInlineEditBeforeActionRef.current()
    setSelectedStyleResource(null)
    dispatchEditorAction({ type: "REORDER_BODY_CHILD", ...request })
    setRightRailMode("properties")
  }, [dispatchEditorAction, finalizeInlineEditBeforeActionRef, setRightRailMode, setSelectedStyleResource])

  const startCloneDragPointerDown = useCallback((nodeId: string, event: ReactPointerEvent<SVGGElement>) => {
    startNodePointerDown({ source: "document-copy", nodeId }, event)
  }, [startNodePointerDown])

  const deleteNodeFromCanvas = useCallback((nodeId: string) => {
    finalizeInlineEditBeforeAction()
    dispatchEditorAction({ type: "DELETE_NODE", nodeId })
    setRightRailMode("page")
  }, [dispatchEditorAction, finalizeInlineEditBeforeAction, setRightRailMode])

  const applyCanvasTableAction = useCallback((nodeId: string, action: CanvasTableAction) => {
    finalizeInlineEditBeforeAction()
    const target = resolveCanvasFlowTableActionTarget(doc, nodeId, action)
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
  }, [
    dispatch,
    dispatchEditorAction,
    doc,
    finalizeInlineEditBeforeAction,
    setRightRailMode,
  ])

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
    setRightRailMode(selectedNodeId ? "properties" : "page")
  }, [
    dispatch,
    finalizeInlineEditBeforeAction,
    hideResizePreview,
    selectedNodeId,
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
  ])

  return {
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
  }
}
