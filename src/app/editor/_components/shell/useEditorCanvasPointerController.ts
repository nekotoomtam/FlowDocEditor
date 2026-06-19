import { useCallback, useEffect, type PointerEvent as ReactPointerEvent } from "react"
import {
  paginateDocument,
  resolveHeaderFooterHorizontalBox,
  type PaginatedDocument,
} from "@/pagination"
import { clampSectionReservedZones, resizeFlowTableColumnPair as resizeFlowTableColumnPairForPreview } from "@/document"
import type { TextMeasurer } from "@/layout"
import type { DocumentNode } from "@/schema"
import type { DragSource, PlacementPreview } from "@/placement/types"
import { detectPlacementTarget } from "@/placement/geometry"
import { resolvePlacementLaw } from "@/placement/law"
import type { EditorAction } from "../editorReducer"
import { resizeColumnsDocument } from "../operations/editorFlowRowOperationPlans"
import { resolveFlowStackResizePairShares } from "../flowStackResize"
import type {
  DragState,
  HeaderFooterEditMode,
  HeaderFooterReservedDrag,
  MarginDrag,
  MinHeightDrag,
  ResizeDrag,
} from "../editorInteractionTypes"
import {
  findPageBreakDropBlocker,
  findSmallestFragmentAt,
  fragmentInteractionHeightForPlacement,
  pageBreakBlockedPreview,
  zoneToIntent,
} from "./editorDragPlacement"
import type {
  PendingClickAction,
  PendingDrag,
  PendingDragMove,
  RightRailMode,
} from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

function useEditorPlacementPreviewComputer({
  activeDrag,
  doc,
  headerFooterEditMode,
  pageRefs,
  paginated,
  scale,
}: {
  activeDrag: DragState | null
  doc: DocumentNode
  headerFooterEditMode: HeaderFooterEditMode | null
  pageRefs: MutableCurrentRef<Map<string, HTMLElement>>
  paginated: PaginatedDocument
  scale: number
}) {
  return useCallback((
    clientX: number,
    clientY: number,
    sourceOverride?: DragSource | null,
  ): { preview: PlacementPreview | null; sectionId: string | null } => {
    const dragSource = sourceOverride !== undefined ? sourceOverride : activeDrag?.source ?? null

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
  }, [activeDrag?.source, doc, headerFooterEditMode, pageRefs, paginated, scale])
}

export function useEditorCanvasPointerController({
  activeDrag,
  canStartInlineEditImmediatelyForClick,
  cancelDeferredInlineEditStart,
  dispatch,
  dispatchEditorAction,
  doc,
  dragMoveFrameRef,
  editorTextMeasurer,
  finalizeInlineEditBeforeResponsiveAction,
  headerFooterEditMode,
  headerFooterReservedDragRef,
  hideResizePreview,
  marginDragRef,
  minHeightDragRef,
  pageRefs,
  paginated,
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
}: {
  activeDrag: DragState | null
  canStartInlineEditImmediatelyForClick: (clickAction: PendingClickAction) => boolean
  cancelDeferredInlineEditStart: () => void
  dispatch: (action: EditorAction) => void
  dispatchEditorAction: (action: EditorAction) => void
  doc: DocumentNode
  dragMoveFrameRef: MutableCurrentRef<number | null>
  editorTextMeasurer: TextMeasurer
  finalizeInlineEditBeforeResponsiveAction: () => boolean
  headerFooterEditMode: HeaderFooterEditMode | null
  headerFooterReservedDragRef: MutableCurrentRef<HeaderFooterReservedDrag | null>
  hideResizePreview: () => void
  marginDragRef: MutableCurrentRef<MarginDrag | null>
  minHeightDragRef: MutableCurrentRef<MinHeightDrag | null>
  pageRefs: MutableCurrentRef<Map<string, HTMLElement>>
  paginated: PaginatedDocument
  pendingDragMoveRef: MutableCurrentRef<PendingDragMove | null>
  pendingDragRef: MutableCurrentRef<PendingDrag | null>
  precomputedBrowserPaginationRef: MutableCurrentRef<{ doc: DocumentNode; paginated: PaginatedDocument } | null>
  resizeDragRef: MutableCurrentRef<ResizeDrag | null>
  resolvePreviewDoc: (nextDoc: DocumentNode) => DocumentNode
  scale: number
  scheduleHeaderFooterReservedDrag: (drag: HeaderFooterReservedDrag) => void
  scheduleInlineEditStartAfterSelectionPaint: (clickAction: PendingClickAction) => void
  scheduleMarginDrag: (drag: MarginDrag) => void
  scheduleMinHeightDrag: (drag: MinHeightDrag) => void
  scheduleResizePreview: (drag: ResizeDrag) => void
  setHeaderFooterReservedDrag: (drag: HeaderFooterReservedDrag | null) => void
  setMarginDrag: (drag: MarginDrag | null) => void
  setMinHeightDrag: (drag: MinHeightDrag | null) => void
  setResizeDrag: (drag: ResizeDrag | null) => void
  setRightRailMode: (mode: RightRailMode) => void
  startInlineEditImmediatelyFromClick: (clickAction: PendingClickAction) => void
}) {
  const computePreview = useEditorPlacementPreviewComputer({
    activeDrag,
    doc,
    headerFooterEditMode,
    pageRefs,
    paginated,
    scale,
  })

  const cancelScheduledDragMove = useCallback(() => {
    pendingDragMoveRef.current = null
    if (dragMoveFrameRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(dragMoveFrameRef.current)
    }
    dragMoveFrameRef.current = null
  }, [dragMoveFrameRef, pendingDragMoveRef])

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
  }, [computePreview, dispatch, dragMoveFrameRef, pendingDragMoveRef])

  useEffect(() => () => cancelScheduledDragMove(), [cancelScheduledDragMove])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const activeHeaderFooterReservedDrag = headerFooterReservedDragRef.current
      if (activeHeaderFooterReservedDrag && !activeHeaderFooterReservedDrag.committed) {
        const svgEl = pageRefs.current.get(activeHeaderFooterReservedDrag.pageKey)
        const section = doc.document.sections[activeHeaderFooterReservedDrag.sectionIndex]
        if (!svgEl || !section) return
        const rect = svgEl.getBoundingClientRect()
        const docY = (event.clientY - rect.top) / scale
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
      const activeMarginDrag = marginDragRef.current
      if (activeMarginDrag && !activeMarginDrag.committed) {
        const svgEl = pageRefs.current.get(activeMarginDrag.pageKey)
        if (!svgEl) return
        const rect = svgEl.getBoundingClientRect()
        const { side, pageWidthPt, pageHeightPt } = activeMarginDrag
        let rawValue: number
        if (side === "left") rawValue = (event.clientX - rect.left) / scale
        else if (side === "right") rawValue = pageWidthPt - (event.clientX - rect.left) / scale
        else if (side === "top") rawValue = (event.clientY - rect.top) / scale
        else rawValue = pageHeightPt - (event.clientY - rect.top) / scale
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
      const activeMinHeightDrag = minHeightDragRef.current
      if (activeMinHeightDrag && !activeMinHeightDrag.committed) {
        const rawHeight = (event.clientY - activeMinHeightDrag.svgTop) / scale - activeMinHeightDrag.rowFragY
        const currentMinHeight = Math.max(activeMinHeightDrag.minPt, rawHeight)
        scheduleMinHeightDrag({ ...activeMinHeightDrag, currentMinHeight })
        return
      }
      const activeResizeDrag = resizeDragRef.current
      if (activeResizeDrag && !activeResizeDrag.committed) {
        const rawDocX = (event.clientX - activeResizeDrag.svgLeft) / scale
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
      if (pendingDragRef.current && !activeDrag) {
        const dx = event.clientX - pendingDragRef.current.clientX
        const dy = event.clientY - pendingDragRef.current.clientY
        if (Math.hypot(dx, dy) > 5) {
          const { source, finalizeOnDragStart } = pendingDragRef.current
          pendingDragRef.current = null
          if (finalizeOnDragStart) finalizeInlineEditBeforeResponsiveAction()
          dispatch({ type: "DRAG_START", source, clientX: event.clientX, clientY: event.clientY })
          scheduleDragMove({ clientX: event.clientX, clientY: event.clientY, sourceOverride: source })
        }
        return
      }
      if (!activeDrag) return
      scheduleDragMove({ clientX: event.clientX, clientY: event.clientY })
    },
    [
      activeDrag,
      cancelDeferredInlineEditStart,
      dispatch,
      doc,
      finalizeInlineEditBeforeResponsiveAction,
      headerFooterReservedDragRef,
      marginDragRef,
      minHeightDragRef,
      pageRefs,
      pendingDragRef,
      resizeDragRef,
      scale,
      scheduleDragMove,
      scheduleHeaderFooterReservedDrag,
      scheduleMarginDrag,
      scheduleMinHeightDrag,
      scheduleResizePreview,
    ],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent) => {
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
      const activeMarginDrag = marginDragRef.current
      if (activeMarginDrag && !activeMarginDrag.committed) {
        dispatchEditorAction({ type: "UPDATE_MARGIN", sectionIndex: activeMarginDrag.sectionIndex, margin: activeMarginDrag.currentMargins })
        setMarginDrag(null)
        return
      }
      const activeMinHeightDrag = minHeightDragRef.current
      if (activeMinHeightDrag && !activeMinHeightDrag.committed) {
        dispatchEditorAction({ type: "RESIZE_ROW_MIN_HEIGHT", rowId: activeMinHeightDrag.rowId, minHeight: activeMinHeightDrag.currentMinHeight })
        setMinHeightDrag(null)
        return
      }
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
        const nextDoc = resizeColumnsDocument(doc, leftStackId, newLeftShare, rightStackId, newRightShare)
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

      if (!activeDrag) return
      cancelScheduledDragMove()
      const { preview, sectionId } = computePreview(event.clientX, event.clientY)

      if (preview?.isValid && preview.placement && sectionId) {
        const lawResult = resolvePlacementLaw(doc, {
          zone: preview.zone!,
          intent: preview.placement.intent,
          target: preview.target!,
        }, activeDrag.source)

        if (lawResult.ok) {
          dispatchEditorAction({ type: "DRAG_COMMIT", op: lawResult.value.operation, sectionId })
          return
        }
      }
      dispatch({ type: "DRAG_CANCEL" })
    },
    [
      activeDrag,
      canStartInlineEditImmediatelyForClick,
      cancelScheduledDragMove,
      computePreview,
      dispatch,
      dispatchEditorAction,
      doc,
      editorTextMeasurer,
      headerFooterReservedDragRef,
      hideResizePreview,
      marginDragRef,
      minHeightDragRef,
      pendingDragRef,
      precomputedBrowserPaginationRef,
      resizeDragRef,
      resolvePreviewDoc,
      scheduleInlineEditStartAfterSelectionPaint,
      setHeaderFooterReservedDrag,
      setMarginDrag,
      setMinHeightDrag,
      setResizeDrag,
      setRightRailMode,
      startInlineEditImmediatelyFromClick,
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
    if (activeDrag) dispatch({ type: "DRAG_CANCEL" })
  }, [
    activeDrag,
    cancelDeferredInlineEditStart,
    cancelScheduledDragMove,
    dispatch,
    headerFooterReservedDragRef,
    hideResizePreview,
    marginDragRef,
    minHeightDragRef,
    pendingDragRef,
    resizeDragRef,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMinHeightDrag,
    setResizeDrag,
  ])

  return {
    handlePointerCancel,
    handlePointerMove,
    handlePointerUp,
  }
}
