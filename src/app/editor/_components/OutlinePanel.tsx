"use client"

import { memo, useState } from "react"
import { buildStyleManagerState, resolveListMarkers } from "@/document"
import type { StyleManagerListGroupItem } from "@/document"
import type { DocumentNode, LayoutNode } from "@/schema"
import { buildOutlineModel } from "./outlineModel"
import type { OutlineItem, OutlineNodeItem } from "./outlineModel"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getParaText(node: LayoutNode): string {
  if (node.type !== "paragraph") return ""
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("")
    .trim()
}

function getTableSize(node: LayoutNode): string {
  if (node.type !== "flow-table") return ""
  return `${node.rowIds.length}×${node.columns.length}`
}

export type OutlineReorderPosition = "before" | "after"

export interface OutlineBodyChildReorder {
  sectionId: string
  sourceNodeId: string
  targetNodeId: string
  position: OutlineReorderPosition
}

interface OutlineReorderItem {
  sectionId: string
  bodyId: string
  nodeId: string
}

interface OutlineDragState {
  source: OutlineReorderItem
  targetNodeId: string | null
  position: OutlineReorderPosition | null
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

function NodeRow({
  label,
  icon,
  depth,
  nodeId,
  selectedNodeId,
  onClick,
  reorderItem,
  dragState,
  onDragStateChange,
  onReorder,
  children,
}: {
  label: string; icon: string; depth: number; nodeId: string
  selectedNodeId: string | null; onClick: (id: string) => void
  reorderItem?: OutlineReorderItem
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const isSelected = nodeId === selectedNodeId
  const hasChildren = !!children
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
  const rowBackground = isDropTarget
    ? "#eff6ff"
    : isSelected
      ? "#dbeafe"
      : isDraggingSource
        ? "#f8fafc"
        : outlineDepthBackground(depth, hovered)
  const rowBorder = isDropTarget
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
        data-outline-body-child={canDrag ? "true" : undefined}
        data-outline-section-id={reorderItem?.sectionId}
        data-outline-body-id={reorderItem?.bodyId}
        data-outline-reorderable={canDrag ? "true" : undefined}
        data-outline-drag-source={isDraggingSource ? "true" : undefined}
        onClick={() => onClick(nodeId)}
        onDragOver={(event) => {
          if (!canDrop || !reorderItem || !dragState) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = "move"
          const rect = event.currentTarget.getBoundingClientRect()
          const position: OutlineReorderPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
          const pointer = dragPointerFromEvent(event) ?? dragState.pointer
          if (
            dragState.targetNodeId === reorderItem.nodeId &&
            dragState.position === position &&
            dragState.pointer?.x === pointer?.x &&
            dragState.pointer?.y === pointer?.y
          ) return
          onDragStateChange({ ...dragState, targetNodeId: reorderItem.nodeId, position, pointer })
        }}
        onDrop={(event) => {
          if (!canDrop || !reorderItem || !dragState?.position || !onReorder) return
          event.preventDefault()
          event.stopPropagation()
          onReorder({
            sectionId: reorderItem.sectionId,
            sourceNodeId: dragState.source.nodeId,
            targetNodeId: reorderItem.nodeId,
            position: dragState.position,
          })
          onDragStateChange(null)
        }}
        style={{
          minHeight: 26,
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 7px",
          paddingLeft: OUTLINE_DEPTH_BASE_LEFT + depth * OUTLINE_DEPTH_INDENT,
          cursor: "pointer", fontSize: 11,
          backgroundColor: rowBackground,
          backgroundImage: rowBackgroundImage,
          color: isSelected ? "#1d4ed8" : "#374151",
          border: rowBorder,
          borderRadius: 5,
          opacity: isDraggingSource ? 0.46 : 1,
          userSelect: "none",
          boxSizing: "border-box",
          boxShadow: dropPosition === "before"
            ? "inset 0 2px 0 #2563eb"
            : dropPosition === "after"
              ? "inset 0 -2px 0 #2563eb"
              : undefined,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hasChildren && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            style={{ fontSize: 8, color: "#9ca3af", width: 10, flexShrink: 0 }}
          >
            {expanded ? "▼" : "▶"}
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
        <span title={label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "#1d4ed8" : "#475569" }}>
          {label}
        </span>
      </div>
      {hasChildren && expanded ? children : null}
    </>
  )
}

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
  children,
}: {
  instanceId: string
  paragraphIds: string[]
  depth: number
  listGroupContext: OutlineListGroupContext
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
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
          userSelect: "none",
          boxSizing: "border-box",
        }}
      >
        <span
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((value) => !value)
          }}
          style={{ fontSize: 8, color: "#94a3b8", width: 10, flexShrink: 0 }}
        >
          {expanded ? "▼" : "▶"}
        </span>
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
      {expanded ? children : null}
    </>
  )
}

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function OutlineItems({
  items,
  depth,
  selectedNodeId,
  onSelect,
  dragState,
  onDragStateChange,
  onReorder,
  listGroupContext,
}: {
  items: OutlineItem[]
  depth: number
  selectedNodeId: string | null
  onSelect: (id: string) => void
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  listGroupContext: OutlineListGroupContext
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
            onSelect={onSelect}
            dragState={dragState}
            onDragStateChange={onDragStateChange}
            onReorder={onReorder}
            listGroupContext={listGroupContext}
          />
        </ListGroupRunRow>
      ) : (
        <OutlineNode
          key={item.key}
          item={item}
          depth={depth}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          onReorder={onReorder}
          listGroupContext={listGroupContext}
        />
      ))}
    </>
  )
}

function OutlineNode({
  item,
  depth,
  selectedNodeId,
  onSelect,
  dragState,
  onDragStateChange,
  onReorder,
  listGroupContext,
}: {
  item: OutlineNodeItem
  depth: number
  selectedNodeId: string | null; onSelect: (id: string) => void
  dragState: OutlineDragState | null
  onDragStateChange: (state: OutlineDragState | null) => void
  onReorder?: (request: OutlineBodyChildReorder) => void
  listGroupContext: OutlineListGroupContext
}) {
  const node = item.node
  const reorderItem = item.isBodyChild
    ? { sectionId: item.sectionId, bodyId: item.bodyId, nodeId: item.nodeId }
    : undefined
  const children = item.children.length > 0 ? (
    <OutlineItems
      items={item.children}
      depth={depth + 1}
      selectedNodeId={selectedNodeId}
      onSelect={onSelect}
      dragState={dragState}
      onDragStateChange={onDragStateChange}
      onReorder={onReorder}
      listGroupContext={listGroupContext}
    />
  ) : null

  if (node.type === "paragraph") {
    const text = getParaText(node)
    return (
      <NodeRow icon="¶" label={text || "(ว่าง)"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder} />
    )
  }

  if (node.type === "spacer") {
    return (
      <NodeRow icon="—" label="ช่องว่าง" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder} />
    )
  }

  if (node.type === "divider") {
    return (
      <NodeRow icon="-" label="เส้นแบ่ง" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder} />
    )
  }

  if (node.type === "page-break") {
    return (
      <NodeRow icon="PB" label="ขึ้นหน้าใหม่" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder} />
    )
  }

  if (node.type === "toc") {
    return (
      <NodeRow icon="☰" label="สารบัญ" depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder} />
    )
  }

  if (node.type === "flow-table") {
    return (
      <NodeRow icon="▦" label={`Flow table ${getTableSize(node)}`} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "flow-table-row") {
    return (
      <NodeRow icon="TR" label={item.labelOverride ?? "แถว"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "flow-table-cell") {
    return (
      <NodeRow icon="TC" label={item.labelOverride ?? "เซลล์"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "row" || node.type === "flow-row") {
    const stackCount = node.childIds.length
    return (
      <NodeRow icon="⫿" label={`${stackCount} คอลัมน์`} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}>
        {children}
      </NodeRow>
    )
  }

  if (node.type === "stack" || node.type === "flow-stack") {
    return (
      <NodeRow icon="▯" label={item.labelOverride ?? "คอลัมน์"} depth={depth} nodeId={item.nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}
        reorderItem={reorderItem} dragState={dragState}
        onDragStateChange={onDragStateChange} onReorder={onReorder}>
        {children}
      </NodeRow>
    )
  }

  return null
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentNode
  selectedNodeId: string | null
  selectedListGroupId?: string | null
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

function OutlinePanelImpl({
  doc,
  selectedNodeId,
  selectedListGroupId = null,
  onSelect,
  onSelectListGroup,
  onAddShortcut,
  onReorderBodyChild,
}: Props) {
  const [dragState, setDragState] = useState<OutlineDragState | null>(null)
  const listGroupState = buildStyleManagerState(doc).listGroups.items
  const markerTextByParagraphId = new Map(
    Array.from(resolveListMarkers(doc).entries()).map(([paragraphId, marker]) => [paragraphId, marker.markerText]),
  )
  const listGroupContext: OutlineListGroupContext = {
    selectedListGroupId,
    groupsById: new Map(listGroupState.map((group) => [group.id, group])),
    markerTextByParagraphId,
    ...(onSelectListGroup ? { onSelectListGroup } : {}),
  }
  const outlineSections = buildOutlineModel(doc, {
    listGroupIds: listGroupState.map((group) => group.id),
  })

  const handleBodyEndDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onReorderBodyChild) return
    if (dragEventTargetElement(event)?.closest("[data-outline-drop-row='true']")) return

    const lastRow = findLastBodyChildRow(event.currentTarget, dragState)
    if (!lastRow || event.clientY < lastRow.getBoundingClientRect().bottom) return

    const targetNodeId = getBodyEndTargetNodeId(doc, dragState)
    if (!targetNodeId) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const pointer = dragPointerFromEvent(event) ?? dragState.pointer
    const nextTargetNodeId = targetNodeId === dragState.source.nodeId ? null : targetNodeId
    const nextPosition = nextTargetNodeId ? "after" : null
    if (
      dragState.targetNodeId === nextTargetNodeId &&
      dragState.position === nextPosition &&
      dragState.pointer?.x === pointer?.x &&
      dragState.pointer?.y === pointer?.y
    ) return
    setDragState({
      ...dragState,
      targetNodeId: nextTargetNodeId,
      position: nextPosition,
      pointer,
    })
  }

  const handleBodyEndDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onReorderBodyChild) return
    if (dragEventTargetElement(event)?.closest("[data-outline-drop-row='true']")) return

    const lastRow = findLastBodyChildRow(event.currentTarget, dragState)
    if (!lastRow || event.clientY < lastRow.getBoundingClientRect().bottom) return

    const targetNodeId = getBodyEndTargetNodeId(doc, dragState)
    if (!targetNodeId) return

    event.preventDefault()
    event.stopPropagation()
    if (targetNodeId !== dragState.source.nodeId) {
      onReorderBodyChild({
        sectionId: dragState.source.sectionId,
        sourceNodeId: dragState.source.nodeId,
        targetNodeId,
        position: "after",
      })
    }
    setDragState(null)
  }

  return (
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
        style={{ ...rightRailPanelBody, padding: "8px 8px 12px" }}
        onDragOver={handleBodyEndDragOver}
        onDrop={handleBodyEndDrop}
      >
        {outlineSections.map((sectionModel, si) => (
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
              onSelect={onSelect}
              dragState={dragState}
              onDragStateChange={setDragState}
              onReorder={onReorderBodyChild}
              listGroupContext={listGroupContext}
            />
          </div>
        ))}
      </div>
      <OutlineDragGhost dragState={dragState} />
    </div>
  )
}

export const OutlinePanel = memo(OutlinePanelImpl)
OutlinePanel.displayName = "OutlinePanel"
