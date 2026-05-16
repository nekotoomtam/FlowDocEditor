"use client"

import { useState } from "react"
import type { DocumentNode, LayoutNode } from "@/schema"
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
  if (node.type !== "table") return ""
  return `${node.rowIds.length}×${node.columns.length}`
}

// ─── Node Row ─────────────────────────────────────────────────────────────────

function NodeRow({ label, icon, depth, nodeId, selectedNodeId, onClick, children }: {
  label: string; icon: string; depth: number; nodeId: string
  selectedNodeId: string | null; onClick: (id: string) => void
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = nodeId === selectedNodeId
  const hasChildren = !!children

  return (
    <div>
      <div
        data-testid="outline-node-row"
        onClick={() => onClick(nodeId)}
        style={{
          minHeight: 26,
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 7px",
          paddingLeft: 8 + depth * 14,
          cursor: "pointer", fontSize: 11,
          background: isSelected ? "#dbeafe" : "transparent",
          color: isSelected ? "#1d4ed8" : "#374151",
          border: "1px solid transparent",
          borderRadius: 5,
          userSelect: "none",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            const target = e.currentTarget as HTMLDivElement
            target.style.background = "#f8fafc"
            target.style.borderColor = "#e5e7eb"
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            const target = e.currentTarget as HTMLDivElement
            target.style.background = "transparent"
            target.style.borderColor = "transparent"
          }
        }}
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
        <span style={{ flexShrink: 0, width: 12, textAlign: "center", color: isSelected ? "#1d4ed8" : "#64748b" }}>{icon}</span>
        <span title={label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "#1d4ed8" : "#475569" }}>
          {label}
        </span>
      </div>
      {hasChildren && expanded && <div>{children}</div>}
    </div>
  )
}

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function OutlineNode({ nodes, nodeId, depth, selectedNodeId, onSelect, labelOverride }: {
  nodes: Record<string, LayoutNode>; nodeId: string; depth: number
  selectedNodeId: string | null; onSelect: (id: string) => void
  labelOverride?: string
}) {
  const node = nodes[nodeId]
  if (!node) return null

  if (node.type === "paragraph") {
    const text = getParaText(node)
    return (
      <NodeRow icon="¶" label={text || "(ว่าง)"} depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect} />
    )
  }

  if (node.type === "spacer") {
    return (
      <NodeRow icon="—" label="ช่องว่าง" depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect} />
    )
  }

  if (node.type === "toc") {
    return (
      <NodeRow icon="☰" label="สารบัญ" depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect} />
    )
  }

  if (node.type === "table") {
    return (
      <NodeRow icon="⊞" label={`ตาราง ${getTableSize(node)}`} depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect} />
    )
  }

  if (node.type === "row" || node.type === "flow-row") {
    const childIds = node.childIds ?? []
    const stackCount = childIds.length
    const expectedStackType = node.type === "flow-row" ? "flow-stack" : "stack"
    return (
      <NodeRow icon="⫿" label={`${stackCount} คอลัมน์`} depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}>
        {childIds.map((stackId, i) => {
          const stack = nodes[stackId]
          if (stack?.type !== expectedStackType) return null
          return (
            <OutlineNode key={stackId} nodes={nodes} nodeId={stackId}
              depth={depth + 1} selectedNodeId={selectedNodeId} onSelect={onSelect}
              labelOverride={`คอลัมน์ ${i + 1}`} />
          )
        })}
      </NodeRow>
    )
  }

  if (node.type === "stack" || node.type === "flow-stack") {
    const childIds = node.childIds ?? []
    return (
      <NodeRow icon="▯" label={labelOverride ?? "คอลัมน์"} depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}>
        {childIds.map((childId) => (
          <OutlineNode key={childId} nodes={nodes} nodeId={childId}
            depth={depth + 1} selectedNodeId={selectedNodeId} onSelect={onSelect} />
        ))}
      </NodeRow>
    )
  }

  if (node.type === "body") {
    const childIds = node.childIds ?? []
    return (
      <>
        {childIds.map((childId) => (
          <OutlineNode key={childId} nodes={nodes} nodeId={childId}
            depth={depth} selectedNodeId={selectedNodeId} onSelect={onSelect} />
        ))}
      </>
    )
  }

  return null
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentNode
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}

export function OutlinePanel({ doc, selectedNodeId, onSelect }: Props) {
  return (
    <div style={rightRailPanelShell}>
      <RightRailPanelHeader title="Outline" testId="outline-panel-title" />
      <div style={{ ...rightRailPanelBody, padding: "8px 8px 12px" }}>
        {doc.document.sections.map((section, si) => (
          <div key={section.id}>
            {doc.document.sections.length > 1 && (
              <div style={{ padding: "6px 8px 4px", fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>
                Section {si + 1}
              </div>
            )}
            <OutlineNode
              nodes={section.nodes}
              nodeId={section.bodyRootId}
              depth={0}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
