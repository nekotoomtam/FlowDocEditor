import type { CSSProperties } from "react"
import { buildStyleManagerState } from "@/document"
import type { StyleManagerListGroupItem, StyleManagerListStyleItem } from "@/document"
import type { DocumentNode } from "@/schema"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"
import type { StyleManagerResourceSelection } from "./StyleManagerPanel"

interface ListResourceInspectorPanelProps {
  doc: DocumentNode
  selectedResource: StyleManagerResourceSelection
}

const badgeStyle: CSSProperties = {
  borderRadius: 4,
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#c2410c",
  padding: "2px 6px",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
}

const emptyStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 6,
  padding: 12,
  color: "#64748b",
  fontSize: 12,
}

const sectionStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  padding: "0 0 12px",
  marginBottom: 12,
}

const sectionTitleStyle: CSSProperties = {
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 8,
}

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "108px minmax(0, 1fr)",
  gap: 8,
  alignItems: "center",
  minHeight: 26,
  color: "#0f172a",
  fontSize: 12,
}

const rowLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
}

const rowValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const levelListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
}

const levelRowStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#f8fafc",
  padding: "7px 8px",
  color: "#334155",
  fontSize: 11,
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  gap: 8,
  alignItems: "center",
}

function DetailRow({
  label,
  value,
  testId,
}: {
  label: string
  value: string
  testId?: string
}) {
  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>{value}</span>
    </div>
  )
}

function unitLabel(value: { value: number; unit: string }): string {
  return `${value.value}${value.unit}`
}

function levelSummary(item: StyleManagerListStyleItem, maxRows = 8) {
  return item.definition.levels.slice(0, maxRows)
}

function ListStyleInspector({ item }: { item: StyleManagerListStyleItem }) {
  return (
    <>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Identity</div>
        <DetailRow testId="list-resource-label" label="Name" value={item.label} />
        <DetailRow testId="list-resource-id" label="Id" value={item.id} />
        <DetailRow testId="list-resource-level-count" label="Levels" value={String(item.levelCount)} />
        <DetailRow testId="list-resource-preset" label="Preset" value={item.presetId ?? "-"} />
      </div>
      <div style={{ ...sectionStyle, borderBottom: "none", marginBottom: 0 }}>
        <div style={sectionTitleStyle}>Levels</div>
        <div data-testid="list-resource-levels" style={levelListStyle}>
          {levelSummary(item).map((level) => (
            <div key={level.level} data-testid="list-resource-level" style={levelRowStyle}>
              <strong>L{level.level + 1}</strong>
              <span style={rowValueStyle}>
                {level.pattern} · {level.format} · marker {unitLabel(level.markerIndent)} · body {unitLabel(level.bodyIndent)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ListGroupInspector({ item }: { item: StyleManagerListGroupItem }) {
  return (
    <>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Identity</div>
        <DetailRow testId="list-resource-label" label="Name" value={item.label} />
        <DetailRow testId="list-resource-id" label="Id" value={item.id} />
        <DetailRow testId="list-resource-style" label="Style" value={item.styleLabel} />
        <DetailRow testId="list-resource-style-id" label="Style id" value={item.styleId} />
      </div>
      <div style={{ ...sectionStyle, borderBottom: "none", marginBottom: 0 }}>
        <div style={sectionTitleStyle}>Numbering</div>
        <DetailRow testId="list-resource-item-count" label="Items" value={String(item.itemCount)} />
        <DetailRow testId="list-resource-start-at" label="Start at" value={item.instance.startAt != null ? String(item.instance.startAt) : "-"} />
        <DetailRow testId="list-resource-first-marker" label="First" value={item.firstMarkerText ?? "-"} />
        <DetailRow testId="list-resource-last-marker" label="Last" value={item.lastMarkerText ?? "-"} />
      </div>
    </>
  )
}

export function ListResourceInspectorPanel({
  doc,
  selectedResource,
}: ListResourceInspectorPanelProps) {
  const state = buildStyleManagerState(doc)
  const listStyle = selectedResource?.kind === "list-style"
    ? state.listStyles.items.find((item) => item.id === selectedResource.id)
    : undefined
  const listGroup = selectedResource?.kind === "list-group"
    ? state.listGroups.items.find((item) => item.id === selectedResource.id)
    : undefined
  const title = selectedResource?.kind === "list-group" ? "List Group" : "List Style"
  const missing = selectedResource?.kind === "list-style" || selectedResource?.kind === "list-group"

  return (
    <section data-testid="list-resource-inspector-panel" style={rightRailPanelShell}>
      <RightRailPanelHeader title={title} testId="list-resource-inspector-header" action={<span style={badgeStyle}>Read only</span>} />
      <div style={rightRailPanelBody}>
        {!selectedResource ? (
          <div data-testid="list-resource-empty" style={emptyStyle}>No list resource selected</div>
        ) : listStyle ? (
          <ListStyleInspector item={listStyle} />
        ) : listGroup ? (
          <ListGroupInspector item={listGroup} />
        ) : missing ? (
          <div data-testid="list-resource-missing" style={emptyStyle}>List resource not found</div>
        ) : (
          <div data-testid="list-resource-empty" style={emptyStyle}>No list resource selected</div>
        )}
      </div>
    </section>
  )
}
