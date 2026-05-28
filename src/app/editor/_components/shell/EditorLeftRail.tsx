import { useCallback, type CSSProperties, type PointerEvent } from "react"
import type { DocumentNode } from "@/schema"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DragSource } from "@/placement/types"
import { AddPanel } from "../AddPanel"
import { OutlinePanel, type OutlineBodyChildReorder } from "../OutlinePanel"
import { StyleManagerPanel, type StyleManagerResourceSelection } from "../StyleManagerPanel"

export type EditorLeftRailMode = "outline" | "add" | "styles"

interface EditorLeftRailProps {
  mode: EditorLeftRailMode
  outlineDoc: DocumentNode
  styleDoc: DocumentNode
  selectedNodeId: string | null
  selectedStyleResource: StyleManagerResourceSelection
  activeOutlineListGroupId?: string | null
  registry: FieldRegistryV1
  editable: boolean
  isDragging: boolean
  addPaletteScope?: "document" | "headerFooter"
  onModeChange: (mode: EditorLeftRailMode) => void
  onSelectNode: (nodeId: string) => void
  onSelectOutlineListGroup?: (instanceId: string) => void
  onSelectStyleResource: (resource: Exclude<StyleManagerResourceSelection, null>) => void
  onReorderBodyChild: (request: OutlineBodyChildReorder) => void
  onDragStart: (source: DragSource, event: PointerEvent) => void
}

const LEFT_RAIL_WIDTH = 260

const noopSelectNode = () => undefined
const noopSelectStyleResource = () => undefined

const leftRailShellStyle: CSSProperties = {
  width: LEFT_RAIL_WIDTH,
  flexShrink: 0,
  borderRight: "1px solid #e5e7eb",
  background: "#fff",
  display: "flex",
  overflow: "hidden",
}

const leftRailSidebarStyle: CSSProperties = {
  width: 36,
  flexShrink: 0,
  borderRight: "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 5,
  padding: "8px 0 8px 3px",
  position: "relative",
  zIndex: 2,
}

const leftRailContentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
}

const leftRailBookmarkGroup: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
}

const leftRailBookmarkButton = (active: boolean, height = 28, fontSize = 11): CSSProperties => ({
  width: active ? "calc(100% + 7px)" : "100%",
  height,
  border: "none",
  borderRadius: "0 6px 6px 0",
  background: active
    ? "linear-gradient(90deg, rgba(37, 99, 235, 0.28) 0%, rgba(37, 99, 235, 0.15) 58%, rgba(255, 255, 255, 0.92) 100%)"
    : "transparent",
  boxShadow: active
    ? "inset 3px 0 0 #2563eb, 4px 0 8px rgba(15, 23, 42, 0.06), 1px 0 0 rgba(37, 99, 235, 0.08)"
    : "none",
  color: active ? "#1d4ed8" : "#64748b",
  cursor: "pointer",
  fontSize,
  fontWeight: 700,
  lineHeight: 1,
  marginRight: active ? -7 : 0,
  padding: 0,
  position: "relative",
  zIndex: active ? 3 : 1,
  textAlign: "center",
  transition: "width 120ms ease, background 120ms ease, box-shadow 120ms ease, color 120ms ease",
})

export function EditorLeftRail({
  mode,
  outlineDoc,
  styleDoc,
  selectedNodeId,
  selectedStyleResource,
  activeOutlineListGroupId = null,
  registry,
  editable,
  isDragging,
  addPaletteScope = "document",
  onModeChange,
  onSelectNode,
  onSelectOutlineListGroup,
  onSelectStyleResource,
  onReorderBodyChild,
  onDragStart,
}: EditorLeftRailProps) {
  const openAddPanel = useCallback(() => onModeChange("add"), [onModeChange])

  return (
    <div data-testid="editor-left-rail" data-mode={mode} style={leftRailShellStyle}>
      <div data-testid="editor-left-rail-sidebar" style={leftRailSidebarStyle}>
        <div data-testid="editor-left-rail-mode-bookmarks" style={leftRailBookmarkGroup}>
          <button
            type="button"
            data-testid="editor-left-rail-mode-outline"
            aria-label="Show outline"
            aria-pressed={mode === "outline"}
            title="Outline"
            onClick={() => onModeChange("outline")}
            style={leftRailBookmarkButton(mode === "outline")}
          >
            O
          </button>
          <button
            type="button"
            data-testid="editor-left-rail-mode-add"
            aria-label="Show add"
            aria-pressed={mode === "add"}
            title="Add"
            onClick={() => onModeChange("add")}
            style={leftRailBookmarkButton(mode === "add", 28, 14)}
          >
            +
          </button>
          <button
            type="button"
            data-testid="editor-left-rail-mode-styles"
            aria-label="Show styles"
            aria-pressed={mode === "styles"}
            title="Styles"
            onClick={() => onModeChange("styles")}
            style={leftRailBookmarkButton(mode === "styles")}
          >
            S
          </button>
        </div>
      </div>
      <div data-testid="editor-left-rail-content" style={leftRailContentStyle}>
        {mode === "outline" ? (
          <OutlinePanel
            doc={outlineDoc}
            selectedNodeId={editable ? selectedNodeId : null}
            selectedListGroupId={activeOutlineListGroupId ?? (selectedStyleResource?.kind === "list-group" ? selectedStyleResource.id : null)}
            onAddShortcut={editable ? openAddPanel : undefined}
            onSelect={editable ? onSelectNode : noopSelectNode}
            onSelectListGroup={editable ? onSelectOutlineListGroup : undefined}
            onReorderBodyChild={editable ? onReorderBodyChild : undefined}
          />
        ) : mode === "add" ? (
          <AddPanel
            registry={registry}
            editable={editable}
            onDragStart={onDragStart}
            isDragging={isDragging}
            paletteScope={addPaletteScope}
          />
        ) : (
          <StyleManagerPanel
            doc={styleDoc}
            selectedResource={selectedStyleResource}
            editable={editable}
            onSelectResource={editable ? onSelectStyleResource : noopSelectStyleResource}
          />
        )}
      </div>
    </div>
  )
}
