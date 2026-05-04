"use client"

import { useState } from "react"
import type { DocumentNode, LayoutNode } from "@/schema"

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
        onClick={() => onClick(nodeId)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 8px 3px",
          paddingLeft: 8 + depth * 14,
          cursor: "pointer", fontSize: 11,
          background: isSelected ? "#dbeafe" : "transparent",
          color: isSelected ? "#1d4ed8" : "#374151",
          borderRadius: 3,
          userSelect: "none",
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "#f3f4f6" }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}
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
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "#1d4ed8" : "#6b7280" }}>
          {label}
        </span>
      </div>
      {hasChildren && expanded && <div>{children}</div>}
    </div>
  )
}

// ─── Tree Builder ─────────────────────────────────────────────────────────────

function OutlineNode({ nodes, nodeId, depth, selectedNodeId, onSelect }: {
  nodes: Record<string, LayoutNode>; nodeId: string; depth: number
  selectedNodeId: string | null; onSelect: (id: string) => void
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

  if (node.type === "row") {
    const stackCount = node.childIds.length
    return (
      <NodeRow icon="⫿" label={`${stackCount} คอลัมน์`} depth={depth} nodeId={nodeId}
        selectedNodeId={selectedNodeId} onClick={onSelect}>
        {node.childIds.map((stackId, i) => {
          const stack = nodes[stackId]
          if (stack?.type !== "stack") return null
          return (
            <div key={stackId}>
              <div style={{ paddingLeft: 8 + (depth + 1) * 14, fontSize: 10, color: "#9ca3af", padding: `2px 8px 2px ${8 + (depth + 1) * 14}px`, userSelect: "none" }}>
                คอลัมน์ {i + 1}
              </div>
              {stack.childIds.map((childId) => (
                <OutlineNode key={childId} nodes={nodes} nodeId={childId}
                  depth={depth + 2} selectedNodeId={selectedNodeId} onSelect={onSelect} />
              ))}
            </div>
          )
        })}
      </NodeRow>
    )
  }

  if (node.type === "body") {
    return (
      <>
        {node.childIds.map((childId) => (
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 600, color: "#6b7280", letterSpacing: "0.05em", flexShrink: 0 }}>
        OUTLINE
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px 8px" }}>
        {doc.document.sections.map((section, si) => (
          <div key={section.id}>
            {doc.document.sections.length > 1 && (
              <div style={{ padding: "4px 8px", fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>
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
