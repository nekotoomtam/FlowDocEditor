import type { CSSProperties } from "react"
import { buildStyleManagerState } from "@/document"
import type {
  StyleManagerListGroupItem,
  StyleManagerListStyleItem,
  StyleManagerParagraphStyleItem,
  StyleManagerResourceKind,
} from "@/document"
import type { DocumentNode } from "@/schema"

export type StyleManagerResourceSelection = {
  kind: StyleManagerResourceKind
  id: string
} | null

interface StyleManagerPanelProps {
  doc: DocumentNode
  selectedResource: StyleManagerResourceSelection
  editable: boolean
  onSelectResource: (resource: Exclude<StyleManagerResourceSelection, null>) => void
}

const panelStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "#fff",
}

const headerStyle: CSSProperties = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px 0 16px",
  borderBottom: "1px solid #e5e7eb",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
}

const countStyle: CSSProperties = {
  minWidth: 22,
  height: 20,
  borderRadius: 4,
  background: "#eff6ff",
  color: "#1d4ed8",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 800,
}

const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "10px 10px 16px",
}

const groupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 6px 8px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
}

const itemButtonStyle = (active: boolean): CSSProperties => ({
  width: "100%",
  minHeight: 36,
  border: "1px solid",
  borderColor: active ? "#bfdbfe" : "transparent",
  borderRadius: 6,
  background: active ? "#eff6ff" : "#fff",
  boxShadow: active ? "inset 3px 0 0 #2563eb" : "none",
  color: "#0f172a",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
})

const markerStyle = (
  tone: "paragraph" | "list-style" | "list-group",
  active = false,
  compact = false,
): CSSProperties => ({
  width: 22,
  height: 22,
  flexShrink: 0,
  borderRadius: 5,
  border: "1px solid #cbd5e1",
  background: active
    ? "#dbeafe"
    : tone === "list-group"
      ? "#ecfdf5"
      : tone === "list-style"
        ? "#fff7ed"
        : "#f8fafc",
  color: active
    ? "#1d4ed8"
    : tone === "list-group"
      ? "#047857"
      : tone === "list-style"
        ? "#c2410c"
        : "#475569",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: compact ? 10 : tone === "paragraph" ? 14 : 11,
  fontWeight: 800,
})

const labelWrapStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
}

const labelStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 700,
}

const metaStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#64748b",
  fontSize: 10,
}

const badgeStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: 4,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "2px 5px",
  fontSize: 9,
  fontWeight: 800,
  textTransform: "uppercase",
}

const emptyStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 6,
  padding: 12,
  color: "#64748b",
  fontSize: 11,
}

const groupBlockStyle: CSSProperties = {
  marginBottom: 12,
}

const itemListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
}

function styleMarkerText(item: StyleManagerParagraphStyleItem): string {
  const headingLevel = item.definition.props.headingLevel
  return headingLevel ? `H${headingLevel}` : "P"
}

function listStyleMarkerText(item: StyleManagerListStyleItem): string {
  const level = item.definition.levels[0]
  if (!level) return "1."
  if (!level.pattern.includes("%")) return level.pattern
  return level.pattern.replace(/%[1-8]/g, "1")
}

function listGroupMarkerText(item: StyleManagerListGroupItem): string {
  return item.firstMarkerText ?? "G"
}

function groupItemCountLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`
}

export function StyleManagerPanel({
  doc,
  selectedResource,
  editable,
  onSelectResource,
}: StyleManagerPanelProps) {
  const state = buildStyleManagerState(doc)
  const paragraphItems = state.paragraphStyles.items
  const listStyleItems = state.listStyles.items
  const listGroupItems = state.listGroups.items
  const totalCount = paragraphItems.length + listStyleItems.length + listGroupItems.length
  const isActive = (kind: StyleManagerResourceKind, id: string) => (
    selectedResource?.kind === kind && selectedResource.id === id
  )

  return (
    <section data-testid="style-manager-panel" style={panelStyle}>
      <div style={headerStyle}>
        <span>Styles</span>
        <span data-testid="style-manager-style-count" style={countStyle}>{totalCount}</span>
      </div>
      <div style={scrollStyle}>
        <div style={groupBlockStyle}>
          <div style={groupHeaderStyle}>
            <span>▾</span>
            <span>{state.paragraphStyles.label}</span>
          </div>
          {paragraphItems.length === 0 ? (
            <div data-testid="style-manager-empty" style={emptyStyle}>No paragraph styles</div>
          ) : (
            <div data-testid="style-manager-paragraph-style-list" style={itemListStyle}>
              {paragraphItems.map((item) => {
                const active = isActive("paragraph-style", item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="style-manager-paragraph-style"
                    data-resource-kind="paragraph-style"
                    data-style-id={item.id}
                    data-resource-id={item.id}
                    aria-pressed={active}
                    disabled={!editable}
                    title={item.label}
                    onClick={() => onSelectResource({ kind: "paragraph-style", id: item.id })}
                    style={{
                      ...itemButtonStyle(active),
                      cursor: editable ? "pointer" : "default",
                      opacity: editable ? 1 : 0.7,
                    }}
                  >
                    <span aria-hidden="true" style={markerStyle("paragraph", item.isBase || active, Boolean(item.definition.props.headingLevel))}>{styleMarkerText(item)}</span>
                    <span style={labelWrapStyle}>
                      <span style={labelStyle}>{item.label}</span>
                      <span style={metaStyle}>{item.id}</span>
                    </span>
                    {item.isBase && <span data-testid="style-manager-base-badge" style={badgeStyle}>Base</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={groupBlockStyle}>
          <div style={groupHeaderStyle}>
            <span>▾</span>
            <span>{state.listStyles.label}</span>
          </div>
          {listStyleItems.length === 0 ? (
            <div data-testid="style-manager-list-style-empty" style={emptyStyle}>No list styles</div>
          ) : (
            <div data-testid="style-manager-list-style-list" style={itemListStyle}>
              {listStyleItems.map((item) => {
                const active = isActive("list-style", item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="style-manager-list-style"
                    data-resource-kind="list-style"
                    data-resource-id={item.id}
                    aria-pressed={active}
                    disabled={!editable}
                    title={item.label}
                    onClick={() => onSelectResource({ kind: "list-style", id: item.id })}
                    style={{
                      ...itemButtonStyle(active),
                      cursor: editable ? "pointer" : "default",
                      opacity: editable ? 1 : 0.7,
                    }}
                  >
                    <span aria-hidden="true" style={markerStyle("list-style", active)}>{listStyleMarkerText(item)}</span>
                    <span style={labelWrapStyle}>
                      <span style={labelStyle}>{item.label}</span>
                      <span style={metaStyle}>{item.levelCount} levels · {item.id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ ...groupBlockStyle, marginBottom: 0 }}>
          <div style={groupHeaderStyle}>
            <span>▾</span>
            <span>{state.listGroups.label}</span>
          </div>
          {listGroupItems.length === 0 ? (
            <div data-testid="style-manager-list-group-empty" style={emptyStyle}>No list groups</div>
          ) : (
            <div data-testid="style-manager-list-group-list" style={itemListStyle}>
              {listGroupItems.map((item) => {
                const active = isActive("list-group", item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid="style-manager-list-group"
                  data-resource-kind="list-group"
                  data-resource-id={item.id}
                  aria-pressed={active}
                  disabled={!editable}
                  title={item.label}
                  onClick={() => onSelectResource({ kind: "list-group", id: item.id })}
                  style={{
                    ...itemButtonStyle(active),
                    cursor: editable ? "pointer" : "default",
                    opacity: editable ? 1 : 0.7,
                  }}
                >
                  <span aria-hidden="true" style={markerStyle("list-group", active)}>{listGroupMarkerText(item)}</span>
                  <span style={labelWrapStyle}>
                    <span style={labelStyle}>{item.label}</span>
                    <span style={metaStyle}>{item.styleLabel} · {groupItemCountLabel(item.itemCount)}</span>
                  </span>
                </button>
              )
            })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
