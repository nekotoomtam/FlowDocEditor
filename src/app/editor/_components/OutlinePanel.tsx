"use client"

import { Profiler, memo, useCallback, useEffect, useMemo, useRef, useState, type ProfilerOnRenderCallback } from "react"
import { orderedSectionParagraphs, type StyleManagerListGroupItem } from "@/document"
import type { DocumentNode, DocumentSection } from "@/schema"
import type { OutlineItem, OutlineNodeItem } from "./outlineModel"
import {
  buildOutlinePanelModel,
  type OutlineLabelUpdatePolicy,
  type OutlinePanelModel,
  type OutlinePanelModelCache,
  type OutlinePanelModelStats,
} from "./outlinePanelModel"
import {
  flattenOutlinePanelRows,
  OUTLINE_VIRTUALIZATION_MIN_ROW_COUNT,
  OUTLINE_VIRTUALIZATION_OVERSCAN_ROWS,
  resolveOutlineVisibleWindow,
  toggleOutlineRowExpanded,
  type OutlineFlatRow,
} from "./outlinePanelWindowing"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { recordWysiwygPerfEvent, startWysiwygPerfSpan } from "./wysiwygPerformance"

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type OutlineReorderPosition = "before" | "after"

export interface OutlineBodyChildReorder {
  sectionId: string
  sourceNodeId: string
  targetNodeId: string
  position: OutlineReorderPosition
}

export type OutlineReorderBlockedReason = "invalid-list-hierarchy"

export interface OutlineBodyChildReorderDrop {
  request: OutlineBodyChildReorder | null
  blockedReason: OutlineReorderBlockedReason | null
}

export interface OutlineEditRelease {
  nodeId: string
  token: number
}

export interface OutlineReorderItem {
  sectionId: string
  bodyId: string
  nodeId: string
}

interface OutlineDragState {
  source: OutlineReorderItem
  targetNodeId: string | null
  position: OutlineReorderPosition | null
  blockedReason: OutlineReorderBlockedReason | null
  pointer: { x: number; y: number } | null
  ghost: { label: string; icon: string; depth: number }
}

interface OutlineListGroupContext {
  selectedListGroupId: string | null
  groupsById: Map<string, StyleManagerListGroupItem>
  markerTextByParagraphId: Map<string, string>
  onSelectListGroup?: (instanceId: string) => void
}

// ─── Node Row ─────────────────────────────────────────────────────────────────

let transparentDragImage: HTMLCanvasElement | null = null

function getTransparentDragImage(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null
  if (!transparentDragImage) {
    transparentDragImage = document.createElement("canvas")
    transparentDragImage.width = 1
    transparentDragImage.height = 1
  }
  return transparentDragImage
}

function hideNativeDragImage(dataTransfer: DataTransfer): void {
  const image = getTransparentDragImage()
  if (image) dataTransfer.setDragImage(image, 0, 0)
}

function dragPointerFromEvent(event: React.DragEvent): { x: number; y: number } | null {
  if (event.clientX === 0 && event.clientY === 0) return null
  return { x: event.clientX, y: event.clientY }
}

function dragEventTargetElement(event: React.DragEvent): Element | null {
  return event.target instanceof Element ? event.target : null
}

function outlineReorderBlockedReasonLabel(reason: OutlineReorderBlockedReason | null): string {
  if (reason === "invalid-list-hierarchy") return "วางตรงนี้ไม่ได้ เพราะลำดับรายการจะไม่ถูกต้อง"
  return ""
}

const outlineDepthBackgrounds = [
  "transparent",
  "#f8fafc",
  "#f1f5f9",
  "#eaf1f7",
  "#e2e8f0",
]

const outlineDepthHoverBackgrounds = [
  "#f8fafc",
  "#f1f5f9",
  "#eaf1f7",
  "#e2e8f0",
  "#dbe3ee",
]

function outlineDepthBackground(depth: number, hovered: boolean): string {
  const steps = hovered ? outlineDepthHoverBackgrounds : outlineDepthBackgrounds
  return steps[Math.min(Math.max(0, depth), steps.length - 1)]
}

const OUTLINE_DEPTH_INDENT = 14
const OUTLINE_DEPTH_BASE_LEFT = 8
const OUTLINE_DEPTH_LANE_X = 13

function outlineDepthLaneLeft(depth: number): number {
  return OUTLINE_DEPTH_BASE_LEFT + Math.max(0, depth) * OUTLINE_DEPTH_INDENT
}

function outlineDepthGuideBackground(depth: number, fillColor: string, guideColor: string): string {
  if (depth <= 0) return fillColor
  const lanes: string[] = []
  for (let level = 1; level <= Math.min(depth, 8); level += 1) {
    const x = OUTLINE_DEPTH_LANE_X + (level - 1) * OUTLINE_DEPTH_INDENT
    lanes.push(`linear-gradient(90deg, transparent ${x}px, ${guideColor} ${x}px, ${guideColor} ${x + 1}px, transparent ${x + 1}px)`)
  }
  const fillStart = outlineDepthLaneLeft(depth)
  lanes.push(`linear-gradient(90deg, transparent 0, transparent ${fillStart}px, ${fillColor} ${fillStart}px, ${fillColor} 100%)`)
  return lanes.join(", ")
}

const outlineRowGrip: React.CSSProperties = {
  width: 24,
  height: 22,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "grab",
  backgroundColor: "transparent",
  border: 0,
  padding: 0,
  margin: "-3px -4px",
  color: "transparent",
  outline: "none",
}

const outlineRowGripDots: React.CSSProperties = {
  width: 8,
  height: 13,
  display: "grid",
  gridTemplateColumns: "repeat(2, 3px)",
  gridAutoRows: 3,
  gap: 2,
  alignContent: "center",
  justifyContent: "center",
  opacity: 0.55,
  pointerEvents: "none",
}

const outlineRowGripDot: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: 2,
  background: "#94a3b8",
}

const outlineScreenReaderOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}

function RowGrip({
  draggable,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  draggable: boolean
  onDragStart: (event: React.DragEvent<HTMLSpanElement>) => void
  onDrag: (event: React.DragEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
}) {
  return (
    <span
      data-testid="outline-row-grip"
      role="button"
      aria-label="Reorder outline item"
      title="Drag to reorder"
      draggable={draggable}
      onClick={(event) => { event.stopPropagation() }}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      style={outlineRowGrip}
    >
      <span style={outlineRowGripDots}>
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} style={outlineRowGripDot} />
        ))}
      </span>
    </span>
  )
}

type NodeRowProps = {
  label: string; icon: string; depth: number; nodeId: string
  selectedNodeId: string | null; activeEditingNodeId: string | null; onClick: (id: string) => void
  hasChildren?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
  reorderItem?: OutlineReorderItem
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  resolveReorderDrop?: (target: OutlineReorderItem, position: OutlineReorderPosition | null) => OutlineBodyChildReorderDrop
  children?: React.ReactNode
}

function reorderItemSignature(item: OutlineReorderItem | undefined): string {
  return item ? `${item.sectionId}:${item.bodyId}:${item.nodeId}` : ""
}

function rowDragSignature(props: Pick<NodeRowProps, "nodeId" | "reorderItem" | "dragState">): string {
  const { nodeId, reorderItem, dragState } = props
  if (!dragState) return ""
  const source = dragState.source.nodeId === nodeId ? "source" : ""
  const canDrop = Boolean(
    reorderItem &&
    dragState.source.sectionId === reorderItem.sectionId &&
    dragState.source.bodyId === reorderItem.bodyId &&
    dragState.source.nodeId !== reorderItem.nodeId,
  )
  const target = canDrop && dragState.targetNodeId === reorderItem?.nodeId
    ? `target:${dragState.position ?? ""}`
    : ""
  const blocked = target && dragState.blockedReason ? `blocked:${dragState.blockedReason}` : ""
  return `${source}|${target}|${blocked}`
}

export function resolveOutlineBodyChildReorderRequest(
  source: OutlineReorderItem,
  target: OutlineReorderItem,
  position: OutlineReorderPosition | null,
): OutlineBodyChildReorder | null {
  if (!position) return null
  if (source.sectionId !== target.sectionId || source.bodyId !== target.bodyId) return null
  if (source.nodeId === target.nodeId) return null
  return {
    sectionId: source.sectionId,
    sourceNodeId: source.nodeId,
    targetNodeId: target.nodeId,
    position,
  }
}

function moveOutlineBodyChildIds(
  childIds: string[],
  sourceNodeId: string,
  targetNodeId: string,
  position: OutlineReorderPosition,
): string[] | null {
  if (sourceNodeId === targetNodeId) return null

  const sourceIndex = childIds.indexOf(sourceNodeId)
  const targetIndex = childIds.indexOf(targetNodeId)
  if (sourceIndex < 0 || targetIndex < 0) return null

  const withoutSource = childIds.filter((id) => id !== sourceNodeId)
  const targetIndexAfterRemoval = withoutSource.indexOf(targetNodeId)
  if (targetIndexAfterRemoval < 0) return null

  const insertIndex = position === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1
  const nextChildIds = [...withoutSource]
  nextChildIds.splice(insertIndex, 0, sourceNodeId)
  return nextChildIds
}

function hasValidOutlineListHierarchyOrder(sections: DocumentSection[]): boolean {
  const previousLevelByInstance = new Map<string, number>()

  for (const section of sections) {
    for (const paragraph of orderedSectionParagraphs(section)) {
      const list = paragraph.props.list
      if (!list) continue

      const previousLevel = previousLevelByInstance.get(list.instanceId)
      if (previousLevel == null) {
        if (list.level > 0) return false
      } else if (list.level > previousLevel + 1) {
        return false
      }
      previousLevelByInstance.set(list.instanceId, list.level)
    }
  }

  return true
}

export function resolveOutlineBodyChildReorderDrop(
  doc: DocumentNode,
  source: OutlineReorderItem,
  target: OutlineReorderItem,
  position: OutlineReorderPosition | null,
): OutlineBodyChildReorderDrop {
  const request = resolveOutlineBodyChildReorderRequest(source, target, position)
  if (!request || !position) return { request: null, blockedReason: null }

  const nextSections = doc.document.sections.map((section) => {
    if (section.id !== source.sectionId) return section

    const body = section.nodes[source.bodyId]
    if (body?.type !== "body") return section

    const nextChildIds = moveOutlineBodyChildIds(body.childIds, source.nodeId, target.nodeId, position)
    if (!nextChildIds) return section

    return {
      ...section,
      nodes: {
        ...section.nodes,
        [body.id]: { ...body, childIds: nextChildIds },
      },
    }
  })

  return {
    request,
    blockedReason: hasValidOutlineListHierarchyOrder(nextSections) ? null : "invalid-list-hierarchy",
  }
}

function areNodeRowPropsEqual(previous: NodeRowProps, next: NodeRowProps): boolean {
  if (previous.children || next.children) return false
  return (
    previous.label === next.label &&
    previous.icon === next.icon &&
    previous.depth === next.depth &&
    previous.nodeId === next.nodeId &&
    (previous.nodeId === previous.selectedNodeId) === (next.nodeId === next.selectedNodeId) &&
    (previous.nodeId === previous.activeEditingNodeId) === (next.nodeId === next.activeEditingNodeId) &&
    previous.hasChildren === next.hasChildren &&
    previous.expanded === next.expanded &&
    previous.onToggleExpanded === next.onToggleExpanded &&
    reorderItemSignature(previous.reorderItem) === reorderItemSignature(next.reorderItem) &&
    rowDragSignature(previous) === rowDragSignature(next) &&
    previous.onClick === next.onClick &&
    previous.onDragStateChange === next.onDragStateChange &&
    previous.onReorder === next.onReorder &&
    previous.resolveReorderDrop === next.resolveReorderDrop
  )
}

const NodeRow = memo(function NodeRow({
  label,
  icon,
  depth,
  nodeId,
  selectedNodeId,
  activeEditingNodeId,
  onClick,
  hasChildren: hasChildrenOverride,
  expanded: controlledExpanded,
  onToggleExpanded,
  reorderItem,
  dragState,
  onDragStateChange,
  onReorder,
  resolveReorderDrop,
  children,
}: NodeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const isSelected = nodeId === selectedNodeId
  const isEditing = nodeId === activeEditingNodeId
  const hasChildren = hasChildrenOverride ?? !!children
  const isExpanded = controlledExpanded ?? expanded
  const canDrag = reorderItem != null && onReorder != null
  const isDraggingSource = dragState?.source.nodeId === nodeId
  const canDrop = Boolean(
    reorderItem &&
    dragState?.source.sectionId === reorderItem.sectionId &&
    dragState.source.bodyId === reorderItem.bodyId &&
    dragState.source.nodeId !== reorderItem.nodeId,
  )
  const isDropTarget = canDrop && dragState?.targetNodeId === reorderItem?.nodeId
  const dropPosition = isDropTarget ? dragState?.position : null
  const dropBlockedReason = isDropTarget ? dragState?.blockedReason ?? null : null
  const isDropBlocked = dropBlockedReason != null
  const blockedLabel = outlineReorderBlockedReasonLabel(dropBlockedReason)
  const rowBackground = isDropBlocked
    ? "#fffbeb"
    : isDropTarget
    ? "#eff6ff"
    : isSelected
      ? "#dbeafe"
      : isDraggingSource
        ? "#f8fafc"
        : outlineDepthBackground(depth, hovered)
  const rowBorder = isDropBlocked
    ? "1px solid #f59e0b"
    : isDropTarget
    ? "1px solid #bfdbfe"
    : isDraggingSource
      ? "1px dashed #cbd5e1"
      : hovered
        ? "1px solid #e2e8f0"
        : "1px solid transparent"
  const rowBackgroundImage = !isDropTarget && !isSelected && !isDraggingSource
    ? outlineDepthGuideBackground(depth, rowBackground, hovered ? "#cbd5e1" : "#d8e0eb")
    : undefined

  return (
    <>
      <div
        data-testid="outline-node-row"
        data-outline-drop-row="true"
        data-outline-node-id={nodeId}
        data-outline-body-child={canDrag ? "true" : undefined}
        data-outline-section-id={reorderItem?.sectionId}
        data-outline-body-id={reorderItem?.bodyId}
        data-outline-reorderable={canDrag ? "true" : undefined}
        data-outline-drag-source={isDraggingSource ? "true" : undefined}
        data-outline-drop-target={isDropTarget ? "true" : undefined}
        data-outline-drop-position={dropPosition ?? undefined}
        data-outline-drop-blocked={isDropBlocked ? dropBlockedReason : undefined}
        aria-disabled={isDropBlocked ? true : undefined}
        title={isDropBlocked ? blockedLabel : undefined}
        data-outline-editing={isEditing ? "true" : undefined}
        onClick={() => onClick(nodeId)}
        onDragOver={(event) => {
          if (!canDrop || !reorderItem || !dragState) return
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          const position: OutlineReorderPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
          const drop = resolveReorderDrop?.(reorderItem, position) ?? {
            request: resolveOutlineBodyChildReorderRequest(dragState.source, reorderItem, position),
            blockedReason: null,
          }
          event.dataTransfer.dropEffect = drop.blockedReason ? "none" : "move"
          const pointer = dragPointerFromEvent(event) ?? dragState.pointer
          if (
            dragState.targetNodeId === reorderItem.nodeId &&
            dragState.position === position &&
            dragState.blockedReason === drop.blockedReason &&
            dragState.pointer?.x === pointer?.x &&
            dragState.pointer?.y === pointer?.y
          ) return
          onDragStateChange({
            ...dragState,
            targetNodeId: reorderItem.nodeId,
            position,
            blockedReason: drop.blockedReason,
            pointer,
          })
        }}
        onDrop={(event) => {
          if (!canDrop || !reorderItem || !dragState?.position || !onReorder) return
          event.preventDefault()
          event.stopPropagation()
          const drop = resolveReorderDrop?.(reorderItem, dragState.position) ?? {
            request: resolveOutlineBodyChildReorderRequest(dragState.source, reorderItem, dragState.position),
            blockedReason: null,
          }
          // Keep the editor action lifecycle intact: core no-ops blocked list reorders,
          // while the Shell still finalizes any active draft before dispatch.
          if (drop.request) onReorder(drop.request)
          onDragStateChange(null)
        }}
        style={{
          minHeight: 26,
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 7px",
          paddingLeft: OUTLINE_DEPTH_BASE_LEFT + depth * OUTLINE_DEPTH_INDENT,
          cursor: isDropBlocked ? "no-drop" : "pointer", fontSize: 11,
          backgroundColor: rowBackground,
          backgroundImage: rowBackgroundImage,
          color: isSelected ? "#1d4ed8" : "#374151",
          border: rowBorder,
          borderRadius: 5,
          opacity: isDraggingSource ? 0.46 : 1,
          position: "relative",
          overflow: "hidden",
          contentVisibility: "auto",
          containIntrinsicSize: "26px",
          userSelect: "none",
          boxSizing: "border-box",
          boxShadow: dropPosition === "before"
            ? `inset 0 2px 0 ${isDropBlocked ? "#f59e0b" : "#2563eb"}`
            : dropPosition === "after"
              ? `inset 0 -2px 0 ${isDropBlocked ? "#f59e0b" : "#2563eb"}`
              : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              if (onToggleExpanded) {
                onToggleExpanded()
              } else {
                setExpanded((v) => !v)
              }
            }}
            style={{ fontSize: 8, color: "#9ca3af", width: 10, flexShrink: 0 }}
          >
            {isExpanded ? "▼" : "▶"}
          </span>
        )}
        {!hasChildren && <span style={{ width: 10, flexShrink: 0 }} />}
        {canDrag && reorderItem ? (
          <RowGrip
            draggable
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData("text/plain", reorderItem.nodeId)
              hideNativeDragImage(event.dataTransfer)
              onDragStateChange({
                source: reorderItem,
                targetNodeId: null,
                position: null,
                blockedReason: null,
                pointer: dragPointerFromEvent(event),
                ghost: { label, icon, depth },
              })
            }}
            onDrag={(event) => {
              if (!dragState) return
              const pointer = dragPointerFromEvent(event)
              if (!pointer) return
              if (dragState.pointer?.x === pointer.x && dragState.pointer?.y === pointer.y) return
              onDragStateChange({ ...dragState, pointer })
            }}
            onDragEnd={() => onDragStateChange(null)}
          />
        ) : <span style={{ width: 10, flexShrink: 0 }} />}
        <span style={{ flexShrink: 0, width: 12, textAlign: "center", color: isSelected ? "#1d4ed8" : "#64748b" }}>{icon}</span>
        <span title={label} style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: isSelected ? "#1d4ed8" : "#475569",
          paddingRight: isEditing ? 74 : 0,
        }}>
          {label}
        </span>
        {isEditing ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#2563eb",
              fontSize: 10,
              fontWeight: 800,
              opacity: 0.28,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            กำลังแก้ไข
          </span>
        ) : null}
      </div>
      {hasChildren && isExpanded ? children : null}
    </>
  )
}, areNodeRowPropsEqual)

function markerRange(markers: Array<string | undefined>): string {
  const values = markers.filter((value): value is string => Boolean(value))
  if (values.length === 0) return ""
  const first = values[0]
  const last = values[values.length - 1]
  return first === last ? first : `${first} - ${last}`
}

function ListGroupRunRow({
  instanceId,
  paragraphIds,
  depth,
  listGroupContext,
  hasChildren: hasChildrenOverride,
  expanded: controlledExpanded,
  onToggleExpanded,
  children,
}: {
  instanceId: string
  paragraphIds: string[]
  depth: number
  listGroupContext: OutlineListGroupContext
  hasChildren?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const hasChildren = hasChildrenOverride ?? Boolean(children)
  const isExpanded = controlledExpanded ?? expanded
  const group = listGroupContext.groupsById.get(instanceId)
  const isSelected = listGroupContext.selectedListGroupId === instanceId
  const range = markerRange(paragraphIds.map((paragraphId) => listGroupContext.markerTextByParagraphId.get(paragraphId)))
  const label = group?.label ?? instanceId
  const itemCount = paragraphIds.length
  const totalCount = group?.itemCount ?? itemCount
  const meta = [
    group?.styleLabel,
    `${itemCount}${totalCount !== itemCount ? `/${totalCount}` : ""} items`,
    range,
  ].filter(Boolean).join(" · ")
  const rowBackground = isSelected ? "#e0f2fe" : hovered ? "#f8fafc" : "#fff"

  return (
    <>
      <div
        data-testid="outline-list-group-row"
        data-outline-list-group-id={instanceId}
        role={listGroupContext.onSelectListGroup ? "button" : undefined}
        aria-pressed={isSelected}
        onClick={() => listGroupContext.onSelectListGroup?.(instanceId)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          minHeight: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 7px",
          paddingLeft: OUTLINE_DEPTH_BASE_LEFT + depth * OUTLINE_DEPTH_INDENT,
          cursor: listGroupContext.onSelectListGroup ? "pointer" : "default",
          fontSize: 11,
          backgroundColor: rowBackground,
          backgroundImage: outlineDepthGuideBackground(depth, rowBackground, hovered ? "#cbd5e1" : "#d8e0eb"),
          color: isSelected ? "#0369a1" : "#334155",
          border: isSelected ? "1px solid #7dd3fc" : hovered ? "1px solid #e2e8f0" : "1px solid transparent",
          borderRadius: 5,
          contentVisibility: "auto",
          containIntrinsicSize: "28px",
          userSelect: "none",
          boxSizing: "border-box",
        }}
      >
        {hasChildren ? (
          <span
            onClick={(event) => {
              event.stopPropagation()
              if (onToggleExpanded) {
                onToggleExpanded()
              } else {
                setExpanded((value) => !value)
              }
            }}
            style={{ fontSize: 8, color: "#94a3b8", width: 10, flexShrink: 0 }}
          >
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : <span style={{ width: 10, flexShrink: 0 }} />}
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 18,
            borderRadius: 4,
            background: isSelected ? "#bae6fd" : "#e0f2fe",
            color: isSelected ? "#0369a1" : "#0284c7",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          LG
        </span>
        <span title={label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "#0369a1" : "#0f172a", fontWeight: 800 }}>
          {label}
        </span>
        {meta && (
          <span title={meta} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b", fontSize: 10 }}>
            {meta}
          </span>
        )}
      </div>
      {hasChildren && isExpanded ? children : null}
    </>
  )
}

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function OutlineItems({
  items,
  depth,
  selectedNodeId,
  activeEditingNodeId,
  onSelect,
  dragState,
  onDragStateChange,
  onReorder,
  resolveReorderDrop,
  listGroupContext,
  labelByNodeId,
}: {
  items: OutlineItem[]
  depth: number
  selectedNodeId: string | null
  activeEditingNodeId: string | null
  onSelect: (id: string) => void
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  resolveReorderDrop?: (target: OutlineReorderItem, position: OutlineReorderPosition | null) => OutlineBodyChildReorderDrop
  listGroupContext: OutlineListGroupContext
  labelByNodeId: Map<string, string>
}) {
  return (
    <>
      {items.map((item) => item.kind === "list-group-run" ? (
        <ListGroupRunRow
          key={item.key}
          instanceId={item.instanceId}
          paragraphIds={item.paragraphIds}
          depth={depth}
          listGroupContext={listGroupContext}
        >
          <OutlineItems
            items={item.children}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            activeEditingNodeId={activeEditingNodeId}
            onSelect={onSelect}
            dragState={dragState}
            onDragStateChange={onDragStateChange}
            onReorder={onReorder}
            resolveReorderDrop={resolveReorderDrop}
            listGroupContext={listGroupContext}
            labelByNodeId={labelByNodeId}
          />
        </ListGroupRunRow>
      ) : (
        <OutlineNode
          key={item.key}
          item={item}
          depth={depth}
          selectedNodeId={selectedNodeId}
          activeEditingNodeId={activeEditingNodeId}
          onSelect={onSelect}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          onReorder={onReorder}
          resolveReorderDrop={resolveReorderDrop}
          listGroupContext={listGroupContext}
          labelByNodeId={labelByNodeId}
        />
      ))}
    </>
  )
}

type OutlineNodeProps = {
  item: OutlineNodeItem
  depth: number
  selectedNodeId: string | null; activeEditingNodeId: string | null; onSelect: (id: string) => void
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  resolveReorderDrop?: (target: OutlineReorderItem, position: OutlineReorderPosition | null) => OutlineBodyChildReorderDrop
  listGroupContext: OutlineListGroupContext
  labelByNodeId: Map<string, string>
}

function reorderItemForOutlineItem(item: OutlineNodeItem): OutlineReorderItem | undefined {
  return item.isBodyChild
    ? { sectionId: item.sectionId, bodyId: item.bodyId, nodeId: item.nodeId }
    : undefined
}

function areOutlineNodePropsEqual(previous: OutlineNodeProps, next: OutlineNodeProps): boolean {
  if (previous.item.children.length > 0 || next.item.children.length > 0) return false
  if (previous.item !== next.item) return false
  const nodeId = previous.item.nodeId
  return (
    previous.depth === next.depth &&
    (nodeId === previous.selectedNodeId) === (nodeId === next.selectedNodeId) &&
    (nodeId === previous.activeEditingNodeId) === (nodeId === next.activeEditingNodeId) &&
    (previous.labelByNodeId.get(nodeId) ?? null) === (next.labelByNodeId.get(nodeId) ?? null) &&
    previous.item.labelOverride === next.item.labelOverride &&
    rowDragSignature({
      nodeId,
      reorderItem: reorderItemForOutlineItem(previous.item),
      dragState: previous.dragState,
    }) === rowDragSignature({
      nodeId,
      reorderItem: reorderItemForOutlineItem(next.item),
      dragState: next.dragState,
    }) &&
    previous.onSelect === next.onSelect &&
    previous.onDragStateChange === next.onDragStateChange &&
    previous.onReorder === next.onReorder &&
    previous.resolveReorderDrop === next.resolveReorderDrop
  )
}

const OutlineNode = memo(function OutlineNode({
  item,
  depth,
  selectedNodeId,
  activeEditingNodeId,
  onSelect,
  dragState,
  onDragStateChange,
  onReorder,
  resolveReorderDrop,
  listGroupContext,
  labelByNodeId,
}: OutlineNodeProps) {
  const node = item.node
  const reorderItem = reorderItemForOutlineItem(item)
  const children = item.children.length > 0 ? (
    <OutlineItems
      items={item.children}
      depth={depth + 1}
      selectedNodeId={selectedNodeId}
      activeEditingNodeId={activeEditingNodeId}
      onSelect={onSelect}
      dragState={dragState}
      onDragStateChange={onDragStateChange}
      onReorder={onReorder}
      resolveReorderDrop={resolveReorderDrop}
      listGroupContext={listGroupContext}
      labelByNodeId={labelByNodeId}
    />
  ) : null

  if (node.type === "paragraph") {
    const text = labelByNodeId.get(item.nodeId) ?? "(ว่าง)"
    return (
      <NodeRow icon="¶" label={text} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop} />
    )
  }

  if (node.type === "spacer") {
    return (
      <NodeRow icon="—" label="ช่องว่าง" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop} />
    )
  }

  if (node.type === "divider") {
    return (
      <NodeRow icon="-" label="เส้นแบ่ง" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop} />
    )
  }

  if (node.type === "page-break") {
    return (
      <NodeRow icon="PB" label="ขึ้นหน้าใหม่" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop} />
    )
  }

  if (node.type === "toc") {
    return (
      <NodeRow icon="☰" label="สารบัญ" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop} />
    )
  }

  if (node.type === "flow-table") {
    return (
      <NodeRow icon="▦" label={labelByNodeId.get(item.nodeId) ?? "Flow table"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "flow-table-row") {
    return (
      <NodeRow icon="TR" label={item.labelOverride ?? "แถว"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "flow-table-cell") {
    return (
      <NodeRow icon="TC" label={item.labelOverride ?? "เซลล์"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "row" || node.type === "flow-row") {
    return (
      <NodeRow icon="⫿" label={labelByNodeId.get(item.nodeId) ?? "คอลัมน์"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "stack" || node.type === "flow-stack") {
    return (
      <NodeRow icon="▯" label={item.labelOverride ?? "คอลัมน์"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} activeEditingNodeId={activeEditingNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}
        resolveReorderDrop={resolveReorderDrop}>
        {children}
      </NodeRow>
    )
  }

  return null
}, areOutlineNodePropsEqual)

function outlineNodeRowDisplay(item: OutlineNodeItem, labelByNodeId: Map<string, string>): { icon: string; label: string } | null {
  const node = item.node

  if (node.type === "paragraph") {
    return { icon: "¶", label: labelByNodeId.get(item.nodeId) ?? "(ว่าง)" }
  }
  if (node.type === "spacer") return { icon: "—", label: "ช่องว่าง" }
  if (node.type === "divider") return { icon: "-", label: "เส้นแบ่ง" }
  if (node.type === "page-break") return { icon: "PB", label: "ขึ้นหน้าใหม่" }
  if (node.type === "toc") return { icon: "☰", label: "สารบัญ" }
  if (node.type === "flow-table") return { icon: "▦", label: labelByNodeId.get(item.nodeId) ?? "Flow table" }
  if (node.type === "flow-table-row") return { icon: "TR", label: item.labelOverride ?? "แถว" }
  if (node.type === "flow-table-cell") return { icon: "TC", label: item.labelOverride ?? "เซลล์" }
  if (node.type === "row" || node.type === "flow-row") return { icon: "⫿", label: labelByNodeId.get(item.nodeId) ?? "คอลัมน์" }
  if (node.type === "stack" || node.type === "flow-stack") return { icon: "▯", label: item.labelOverride ?? "คอลัมน์" }

  return null
}

function OutlineFlatRowView({
  row,
  selectedNodeId,
  activeEditingNodeId,
  onSelect,
  dragState,
  onDragStateChange,
  onReorder,
  resolveReorderDrop,
  listGroupContext,
  labelByNodeId,
  onToggleExpanded,
}: {
  row: OutlineFlatRow
  selectedNodeId: string | null
  activeEditingNodeId: string | null
  onSelect: (id: string) => void
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  resolveReorderDrop?: (target: OutlineReorderItem, position: OutlineReorderPosition | null) => OutlineBodyChildReorderDrop
  listGroupContext: OutlineListGroupContext
  labelByNodeId: Map<string, string>
  onToggleExpanded: (rowKey: string) => void
}) {
  if (row.kind === "section-heading") {
    return (
      <div style={{ padding: "6px 8px 4px", fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>
        Section {row.sectionIndex + 1}
      </div>
    )
  }

  if (row.kind === "list-group-run") {
    return (
      <ListGroupRunRow
        instanceId={row.item.instanceId}
        paragraphIds={row.item.paragraphIds}
        depth={row.depth}
        listGroupContext={listGroupContext}
        hasChildren={row.expandable}
        expanded={row.expanded}
        onToggleExpanded={() => onToggleExpanded(row.key)}
      >
        {null}
      </ListGroupRunRow>
    )
  }

  const display = outlineNodeRowDisplay(row.item, labelByNodeId)
  if (!display) return null

  return (
    <NodeRow
      icon={display.icon}
      label={display.label}
      depth={row.depth}
      nodeId={row.item.nodeId}
      selectedNodeId={selectedNodeId}
      activeEditingNodeId={activeEditingNodeId}
      onClick={onSelect}
      hasChildren={row.expandable}
      expanded={row.expanded}
      onToggleExpanded={() => onToggleExpanded(row.key)}
      reorderItem={reorderItemForOutlineItem(row.item)}
      dragState={dragState}
      onDragStateChange={onDragStateChange}
      onReorder={onReorder}
      resolveReorderDrop={resolveReorderDrop}
    />
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentNode
  selectedNodeId: string | null
  activeEditingNodeId?: string | null
  editRelease?: OutlineEditRelease | null
  selectedListGroupId?: string | null
  deferContent?: boolean
  perfTraceActive?: boolean
  onSelect: (nodeId: string) => void
  onSelectListGroup?: (instanceId: string) => void
  onAddShortcut?: () => void
  onReorderBodyChild?: (request: OutlineBodyChildReorder) => void
}

const outlineAddShortcutButton: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "1px solid #dbeafe",
  borderRadius: 5,
  background: "#eff6ff",
  color: "#1d4ed8",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
  textAlign: "center",
}

const outlineDragGhost: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: -45,
  zIndex: 10000,
  width: 220,
  maxWidth: "min(220px, calc(100vw - 32px))",
  minHeight: 28,
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(37, 99, 235, 0.18)",
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 8px",
  boxSizing: "border-box",
  pointerEvents: "none",
  color: "#1e293b",
  fontSize: 11,
  userSelect: "none",
}

const outlineDragGhostIcon: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  background: "#dbeafe",
  color: "#1d4ed8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 800,
}

const outlineDragGhostLabel: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 700,
}

function OutlineDragGhost({ dragState }: { dragState: OutlineDragState | null }) {
  if (!dragState?.pointer) return null
  const x = Math.min(Math.max(12, dragState.pointer.x + 14), Math.max(12, window.innerWidth - 236))
  const y = Math.min(Math.max(12, dragState.pointer.y + 10), Math.max(12, window.innerHeight - 44))
  return (
    <div
      data-testid="outline-drag-ghost"
      style={{
        ...outlineDragGhost,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      <span style={outlineDragGhostIcon}>{dragState.ghost.icon}</span>
      <span title={dragState.ghost.label} style={outlineDragGhostLabel}>{dragState.ghost.label}</span>
    </div>
  )
}

function getBodyEndTargetNodeId(doc: DocumentNode, dragState: OutlineDragState): string | null {
  const section = doc.document.sections.find((candidate) => candidate.id === dragState.source.sectionId)
  if (!section) return null
  const body = section.nodes[dragState.source.bodyId]
  if (body?.type !== "body") return null
  return body.childIds.length > 0 ? body.childIds[body.childIds.length - 1] : null
}

function findLastBodyChildRow(root: HTMLElement, dragState: OutlineDragState): HTMLElement | null {
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-outline-body-child='true']"))
    .filter((row) => (
      row.dataset.outlineSectionId === dragState.source.sectionId &&
      row.dataset.outlineBodyId === dragState.source.bodyId
    ))
  return rows.length > 0 ? rows[rows.length - 1] : null
}

function isScrolledToOutlineEnd(root: HTMLElement): boolean {
  return root.scrollTop + root.clientHeight >= root.scrollHeight - 2
}

type OutlinePanelMeasuredModel = {
  model: OutlinePanelModel
  stats: OutlinePanelModelStats
  startedAt: number
  durationMs: number
}

export function resolveOutlineLabelUpdatePolicy({
  activeEditingNodeId,
  previousActiveEditingNodeId,
  editRelease,
  consumedEditReleaseToken,
}: {
  activeEditingNodeId: string | null
  previousActiveEditingNodeId: string | null
  editRelease: OutlineEditRelease | null
  consumedEditReleaseToken: number | null
}): OutlineLabelUpdatePolicy {
  if (editRelease && editRelease.token !== consumedEditReleaseToken) {
    return { kind: "single-node", nodeId: editRelease.nodeId }
  }
  if (
    activeEditingNodeId &&
    previousActiveEditingNodeId &&
    previousActiveEditingNodeId !== activeEditingNodeId
  ) {
    return { kind: "single-node", nodeId: previousActiveEditingNodeId }
  }
  if (activeEditingNodeId) return { kind: "frozen-active-edit" }
  if (previousActiveEditingNodeId) return { kind: "single-node", nodeId: previousActiveEditingNodeId }
  return { kind: "full" }
}

function OutlinePanelImpl({
  doc,
  selectedNodeId,
  activeEditingNodeId = null,
  editRelease = null,
  selectedListGroupId = null,
  deferContent = false,
  perfTraceActive = false,
  onSelect,
  onSelectListGroup,
  onAddShortcut,
  onReorderBodyChild,
}: Props) {
  const [dragState, setDragState] = useState<OutlineDragState | null>(null)
  const [virtualScrollTop, setVirtualScrollTop] = useState(0)
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(0)
  const [expandedOutlineRowKeys, setExpandedOutlineRowKeys] = useState<Map<string, boolean>>(() => new Map())
  const outlineBodyRef = useRef<HTMLDivElement | null>(null)
  const outlineWindowStatsRef = useRef({ flatRowCount: 0, renderedRowCount: 0, virtualized: false })
  const outlineModelCacheRef = useRef<OutlinePanelModelCache | null>(null)
  const previousActiveEditingNodeIdRef = useRef<string | null>(null)
  const consumedEditReleaseTokenRef = useRef<number | null>(null)
  const outlinePanelModelResult = useMemo<OutlinePanelMeasuredModel | null>(() => {
    if (deferContent) return null
    const previousActiveEditingNodeId = previousActiveEditingNodeIdRef.current
    const consumedEditReleaseToken = consumedEditReleaseTokenRef.current
    const shouldConsumeEditRelease = Boolean(
      !activeEditingNodeId &&
      editRelease &&
      editRelease.token !== consumedEditReleaseToken,
    )
    const startedAt = startWysiwygPerfSpan()
    const result = buildOutlinePanelModel(doc, outlineModelCacheRef.current, {
      labelUpdatePolicy: resolveOutlineLabelUpdatePolicy({
        activeEditingNodeId,
        previousActiveEditingNodeId,
        editRelease,
        consumedEditReleaseToken,
      }),
    })
    const durationMs = Math.max(0, startWysiwygPerfSpan() - startedAt)
    outlineModelCacheRef.current = result.cache
    previousActiveEditingNodeIdRef.current = activeEditingNodeId
    if (shouldConsumeEditRelease && editRelease) consumedEditReleaseTokenRef.current = editRelease.token
    return {
      model: result.model,
      stats: result.stats,
      startedAt,
      durationMs,
    }
  }, [activeEditingNodeId, deferContent, doc, editRelease])

  useEffect(() => {
    const element = outlineBodyRef.current
    if (!element) return

    const updateViewportHeight = () => {
      const nextHeight = element.clientHeight
      setVirtualViewportHeight((current) => current === nextHeight ? current : nextHeight)
    }

    updateViewportHeight()

    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(updateViewportHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [deferContent])

  const handleOutlineBodyScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop
    setVirtualScrollTop((current) => current === nextScrollTop ? current : nextScrollTop)
  }, [])

  const handleToggleFlatRowExpanded = useCallback((rowKey: string) => {
    setExpandedOutlineRowKeys((current) => toggleOutlineRowExpanded(current, rowKey))
  }, [])

  useEffect(() => {
    if (!perfTraceActive || !outlinePanelModelResult) return
    const { stats } = outlinePanelModelResult
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "outline-panel-model",
      startedAt: outlinePanelModelResult.startedAt,
      durationMs: outlinePanelModelResult.durationMs,
      nodeId: activeEditingNodeId,
      active: Boolean(activeEditingNodeId),
      componentName: "OutlinePanel",
      source: stats.structureCacheHit ? "structure-cache-hit" : "structure-cache-miss",
      action: stats.labelUpdatePolicy,
      outlineStructureCacheHit: stats.structureCacheHit,
      outlineLabelSnapshotUsed: stats.labelSnapshotUsed,
      outlineSingleLabelUpdated: stats.singleLabelUpdated,
      outlineFullLabelRefresh: stats.fullLabelRefresh,
      outlineLabelNodeCount: stats.labelNodeCount,
      outlineSectionCount: stats.outlineSectionCount,
      outlineItemCount: stats.outlineItemCount,
    })
  }, [activeEditingNodeId, outlinePanelModelResult, perfTraceActive])

  const handleOutlineProfilerRender = useCallback<ProfilerOnRenderCallback>((
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const stats = outlinePanelModelResult?.stats
    recordWysiwygPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      kind: "outline-panel-react-commit",
      startedAt: startTime,
      durationMs: Math.max(0, actualDuration),
      baseDurationMs: Math.max(0, baseDuration),
      commitTime,
      nodeId: activeEditingNodeId,
      active: Boolean(activeEditingNodeId),
      componentName: id,
      source: phase,
      action: phase,
      outlineFlatRowCount: outlineWindowStatsRef.current.flatRowCount,
      outlineRenderedRowCount: outlineWindowStatsRef.current.renderedRowCount,
      outlineVirtualized: outlineWindowStatsRef.current.virtualized,
      ...(stats ? {
        outlineStructureCacheHit: stats.structureCacheHit,
        outlineLabelSnapshotUsed: stats.labelSnapshotUsed,
        outlineSingleLabelUpdated: stats.singleLabelUpdated,
        outlineFullLabelRefresh: stats.fullLabelRefresh,
        outlineLabelNodeCount: stats.labelNodeCount,
        outlineSectionCount: stats.outlineSectionCount,
        outlineItemCount: stats.outlineItemCount,
      } : {}),
    })
  }, [activeEditingNodeId, outlinePanelModelResult])

  const outlinePanelModel = outlinePanelModelResult?.model ?? null
  const outlineItemCount = outlinePanelModelResult?.stats.outlineItemCount ?? 0
  const showSectionHeadings = doc.document.sections.length > 1
  const outlineFlatRows = useMemo(() => {
    if (!outlinePanelModel || outlineItemCount < OUTLINE_VIRTUALIZATION_MIN_ROW_COUNT) return null
    return flattenOutlinePanelRows(outlinePanelModel.outlineSections, {
      showSectionHeadings,
      expandedRowKeys: expandedOutlineRowKeys,
    })
  }, [expandedOutlineRowKeys, outlineItemCount, outlinePanelModel, showSectionHeadings])

  const outlineVisibleWindow = useMemo(() => {
    if (!outlineFlatRows) return null
    return resolveOutlineVisibleWindow(outlineFlatRows, {
      virtualized: virtualViewportHeight > 0,
      scrollTop: virtualScrollTop,
      viewportHeight: virtualViewportHeight,
      overscanRows: OUTLINE_VIRTUALIZATION_OVERSCAN_ROWS,
    })
  }, [outlineFlatRows, virtualScrollTop, virtualViewportHeight])
  outlineWindowStatsRef.current = {
    flatRowCount: outlineFlatRows?.length ?? 0,
    renderedRowCount: outlineVisibleWindow?.visibleRows.length ?? 0,
    virtualized: outlineVisibleWindow?.virtualized ?? false,
  }
  const resolveReorderDrop = useCallback((
    target: OutlineReorderItem,
    position: OutlineReorderPosition | null,
  ): OutlineBodyChildReorderDrop => {
    if (!dragState) return { request: null, blockedReason: null }
    return resolveOutlineBodyChildReorderDrop(doc, dragState.source, target, position)
  }, [doc, dragState])
  const reorderStatusText = outlineReorderBlockedReasonLabel(dragState?.blockedReason ?? null)

  if (deferContent) {
    const deferredPanel = (
      <div style={rightRailPanelShell}>
        <RightRailPanelHeader
          title="Outline"
          testId="outline-panel-title"
          action={onAddShortcut ? (
            <button
              type="button"
              data-testid="outline-add-shortcut"
              aria-label="Open add panel"
              title="Add"
              onClick={onAddShortcut}
              style={outlineAddShortcutButton}
            >
              +
            </button>
          ) : undefined}
        />
        <div
          ref={outlineBodyRef}
          data-outline-content-deferred="true"
          style={{ ...rightRailPanelBody, padding: "8px 8px 12px" }}
        />
      </div>
    )
    return perfTraceActive ? (
      <Profiler id="outline-panel" onRender={handleOutlineProfilerRender}>
        {deferredPanel}
      </Profiler>
    ) : deferredPanel
  }

  if (!outlinePanelModel) return null

  const { listGroupState, markerTextByParagraphId, outlineSections, labelByNodeId } = outlinePanelModel
  const listGroupContext: OutlineListGroupContext = {
    selectedListGroupId,
    groupsById: new Map(listGroupState.map((group) => [group.id, group])),
    markerTextByParagraphId,
    ...(onSelectListGroup ? { onSelectListGroup } : {}),
  }

  const handleBodyEndDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onReorderBodyChild) return
    if (dragEventTargetElement(event)?.closest("[data-outline-drop-row='true']")) return
    if (outlineVisibleWindow?.virtualized && !isScrolledToOutlineEnd(event.currentTarget)) return

    const lastRow = findLastBodyChildRow(event.currentTarget, dragState)
    if (!lastRow || event.clientY < lastRow.getBoundingClientRect().bottom) return

    const targetNodeId = getBodyEndTargetNodeId(doc, dragState)
    if (!targetNodeId) return

    event.preventDefault()
    const pointer = dragPointerFromEvent(event) ?? dragState.pointer
    const nextTargetNodeId = targetNodeId === dragState.source.nodeId ? null : targetNodeId
    const nextPosition = nextTargetNodeId ? "after" : null
    const targetItem = { ...dragState.source, nodeId: targetNodeId }
    const drop = nextPosition
      ? resolveOutlineBodyChildReorderDrop(doc, dragState.source, targetItem, nextPosition)
      : { request: null, blockedReason: null }
    event.dataTransfer.dropEffect = drop.blockedReason ? "none" : "move"
    if (
      dragState.targetNodeId === nextTargetNodeId &&
      dragState.position === nextPosition &&
      dragState.blockedReason === drop.blockedReason &&
      dragState.pointer?.x === pointer?.x &&
      dragState.pointer?.y === pointer?.y
    ) return
    setDragState({
      ...dragState,
      targetNodeId: nextTargetNodeId,
      position: nextPosition,
      blockedReason: drop.blockedReason,
      pointer,
    })
  }

  const handleBodyEndDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onReorderBodyChild) return
    if (dragEventTargetElement(event)?.closest("[data-outline-drop-row='true']")) return
    if (outlineVisibleWindow?.virtualized && !isScrolledToOutlineEnd(event.currentTarget)) return

    const lastRow = findLastBodyChildRow(event.currentTarget, dragState)
    if (!lastRow || event.clientY < lastRow.getBoundingClientRect().bottom) return

    const targetNodeId = getBodyEndTargetNodeId(doc, dragState)
    if (!targetNodeId) return

    event.preventDefault()
    event.stopPropagation()
    const drop = resolveOutlineBodyChildReorderDrop(
      doc,
      dragState.source,
      { ...dragState.source, nodeId: targetNodeId },
      "after",
    )
    if (drop.request) {
      onReorderBodyChild(drop.request)
    }
    setDragState(null)
  }

  const renderFlatRow = (row: OutlineFlatRow) => (
    <OutlineFlatRowView
      row={row}
      selectedNodeId={selectedNodeId}
      activeEditingNodeId={activeEditingNodeId}
      onSelect={onSelect}
      dragState={dragState}
      onDragStateChange={setDragState}
      onReorder={onReorderBodyChild}
      resolveReorderDrop={resolveReorderDrop}
      listGroupContext={listGroupContext}
      labelByNodeId={labelByNodeId}
      onToggleExpanded={handleToggleFlatRowExpanded}
    />
  )

  const panel = (
    <div style={rightRailPanelShell}>
      <RightRailPanelHeader
        title="Outline"
        testId="outline-panel-title"
        action={onAddShortcut ? (
          <button
            type="button"
            data-testid="outline-add-shortcut"
            aria-label="Open add panel"
            title="Add"
            onClick={onAddShortcut}
            style={outlineAddShortcutButton}
          >
            +
          </button>
        ) : undefined}
      />
      <div
        ref={outlineBodyRef}
        data-outline-windowed={outlineVisibleWindow?.virtualized ? "true" : undefined}
        data-outline-row-count={outlineFlatRows?.length}
        data-outline-rendered-row-count={outlineVisibleWindow?.visibleRows.length}
        style={{ ...rightRailPanelBody, padding: "8px 8px 12px" }}
        onScroll={handleOutlineBodyScroll}
        onDragOver={handleBodyEndDragOver}
        onDrop={handleBodyEndDrop}
      >
        {outlineVisibleWindow ? (
          outlineVisibleWindow.virtualized ? (
            <div
              data-outline-virtual-scroll-spacer="true"
              style={{ height: outlineVisibleWindow.totalHeight, position: "relative" }}
            >
              {outlineVisibleWindow.visibleRows.map(({ row, top }) => (
                <div
                  key={row.key}
                  style={{
                    position: "absolute",
                    top,
                    left: 0,
                    right: 0,
                    height: row.height,
                  }}
                >
                  {renderFlatRow(row)}
                </div>
              ))}
            </div>
          ) : (
            outlineVisibleWindow.visibleRows.map(({ row }) => (
              <div key={row.key}>{renderFlatRow(row)}</div>
            ))
          )
        ) : (
          outlineSections.map((sectionModel, si) => (
            <div key={sectionModel.sectionId}>
              {doc.document.sections.length > 1 && (
                <div style={{ padding: "6px 8px 4px", fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>
                  Section {si + 1}
                </div>
              )}
              <OutlineItems
                items={sectionModel.items}
                depth={0}
                selectedNodeId={selectedNodeId}
                activeEditingNodeId={activeEditingNodeId}
                onSelect={onSelect}
                dragState={dragState}
                onDragStateChange={setDragState}
                onReorder={onReorderBodyChild}
                resolveReorderDrop={resolveReorderDrop}
                listGroupContext={listGroupContext}
                labelByNodeId={labelByNodeId}
              />
            </div>
          ))
        )}
      </div>
      <div
        data-testid="outline-reorder-status"
        role="status"
        aria-live="polite"
        style={outlineScreenReaderOnly}
      >
        {reorderStatusText}
      </div>
      <OutlineDragGhost dragState={dragState} />
    </div>
  )

  return perfTraceActive ? (
    <Profiler id="outline-panel" onRender={handleOutlineProfilerRender}>
      {panel}
    </Profiler>
  ) : panel
}

export const OutlinePanel = memo(OutlinePanelImpl)
OutlinePanel.displayName = "OutlinePanel"
