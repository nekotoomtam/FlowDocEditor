import type { PointerEvent } from "react"
import type { DataSnapshotV1, FieldScalarValue } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentDataReadinessIssue } from "@/readiness"
import type { DocumentNode } from "@/schema"
import type { EditorAction } from "../editorReducer"
import { FillingPanel } from "../FillingPanel"
import { ListResourceInspectorPanel } from "../ListResourceInspectorPanel"
import { PagePanel } from "../PagePanel"
import { PropertyPanel } from "../PropertyPanel"
import { StyleDefinitionPanel } from "../StyleDefinitionPanel"
import type { StyleManagerResourceSelection } from "../StyleManagerPanel"
import {
  RIGHT_RAIL_COLLAPSED_WIDTH,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
} from "../rightRailResize"
import { EditorSubtreePerfProfiler, StructuralPaintDeferredSubtree } from "./EditorShellPerfChrome"
import { rightRailBookmarkButton, rightRailBookmarkGroup, rightRailSidebarStyle } from "./EditorRightRailChrome"
import type { RightRailMode } from "./editorShellTypes"

interface EditorRightRailProps {
  doc: DocumentNode
  registry: FieldRegistryV1
  dataSnapshot: DataSnapshotV1
  dataReadinessIssues: DocumentDataReadinessIssue[]
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  selectedStyleResource: StyleManagerResourceSelection
  activeSectionIndex: number
  isTemplateMode: boolean
  displayWidth: number
  collapsed: boolean
  panelWidth: number
  resizeActive: boolean
  resizeHandleHover: boolean
  resizeHandleActive: boolean
  contentVisible: boolean
  mode: RightRailMode
  deferNonCriticalPanelsForStructuralPaint: boolean
  wysiwygPerfTraceActive: boolean
  onResizeHandleHoverChange: (hover: boolean) => void
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: PointerEvent<HTMLDivElement>) => void
  onResizeFinish: (event: PointerEvent<HTMLDivElement>) => void
  onToggleCollapse: () => void
  onOpenMode: (mode: RightRailMode) => void
  dispatchEditorAction: (action: EditorAction) => void
  finalizeInlineEditBeforeAction: () => boolean
  onSelectContextNode: (nodeId: string) => void
  onSelectOutlineListGroup: (instanceId: string) => void
  onSelectStyleResource: (resource: Exclude<StyleManagerResourceSelection, null>) => void
  onDataSnapshotChange: (key: string, value: FieldScalarValue) => void
}

export function EditorRightRail({
  doc,
  registry,
  dataSnapshot,
  dataReadinessIssues,
  selectedNodeId,
  selectionAnchorNodeId,
  selectedStyleResource,
  activeSectionIndex,
  isTemplateMode,
  displayWidth,
  collapsed,
  panelWidth,
  resizeActive,
  resizeHandleHover,
  resizeHandleActive,
  contentVisible,
  mode,
  deferNonCriticalPanelsForStructuralPaint,
  wysiwygPerfTraceActive,
  onResizeHandleHoverChange,
  onResizeStart,
  onResizeMove,
  onResizeFinish,
  onToggleCollapse,
  onOpenMode,
  dispatchEditorAction,
  finalizeInlineEditBeforeAction,
  onSelectContextNode,
  onSelectOutlineListGroup,
  onSelectStyleResource,
  onDataSnapshotChange,
}: EditorRightRailProps) {
  const selectedStyleResourceId = selectedStyleResource?.id ?? null

  return (
    <div
      data-testid="editor-right-rail"
      data-width={displayWidth}
      style={{
        width: displayWidth,
        flexShrink: 0,
        display: "flex",
        borderLeft: "1px solid #e5e7eb",
        overflow: "hidden",
        background: "#fff",
        position: "relative",
        transition: resizeActive ? "none" : "width 120ms ease",
        cursor: resizeActive ? "col-resize" : undefined,
      }}
    >
      <div
        data-testid="editor-right-rail-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={RIGHT_RAIL_MIN_WIDTH}
        aria-valuemax={RIGHT_RAIL_MAX_WIDTH}
        aria-valuenow={collapsed ? RIGHT_RAIL_COLLAPSED_WIDTH : panelWidth}
        title={collapsed ? "Drag left to open the right panel." : "Drag to resize. Drag near the icon rail to collapse."}
        onPointerEnter={() => onResizeHandleHoverChange(true)}
        onPointerLeave={() => onResizeHandleHoverChange(false)}
        onMouseEnter={() => onResizeHandleHoverChange(true)}
        onMouseLeave={() => onResizeHandleHoverChange(false)}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeFinish}
        onPointerCancel={onResizeFinish}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          zIndex: 10,
          cursor: "col-resize",
          background: resizeActive
            ? "rgba(37, 99, 235, 0.16)"
            : resizeHandleHover
              ? "rgba(148, 163, 184, 0.18)"
              : "transparent",
          boxShadow: resizeHandleActive ? "inset 2px 0 0 rgba(37, 99, 235, 0.45)" : "none",
          transition: "background 120ms ease, box-shadow 120ms ease",
        }}
      />
      <div data-testid="editor-right-rail-sidebar" style={rightRailSidebarStyle(collapsed)}>
        <div data-testid="editor-right-rail-collapse-bookmark" style={rightRailBookmarkGroup}>
          <button
            type="button"
            data-testid="editor-right-rail-collapse"
            aria-label={collapsed ? "Expand right panel" : "Collapse right panel"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand right panel" : "Collapse right panel"}
            onClick={onToggleCollapse}
            style={rightRailBookmarkButton(collapsed, 24, 12)}
          >
            {collapsed ? ">" : "<"}
          </button>
        </div>
        <div data-testid="editor-right-rail-mode-bookmarks" style={rightRailBookmarkGroup}>
          <button
            type="button"
            data-testid="editor-right-rail-mode-page"
            aria-label="Show page"
            aria-pressed={!collapsed && mode === "page"}
            title="Page"
            onClick={() => onOpenMode("page")}
            style={rightRailBookmarkButton(!collapsed && mode === "page", 28, 10)}
          >
            Pg
          </button>
          <button
            type="button"
            data-testid="editor-right-rail-mode-properties"
            aria-label="Show properties"
            aria-pressed={!collapsed && mode === "properties"}
            title="Properties"
            onClick={() => onOpenMode("properties")}
            style={rightRailBookmarkButton(!collapsed && mode === "properties")}
          >
            P
          </button>
          <button
            type="button"
            data-testid="editor-right-rail-mode-style"
            aria-label="Show style"
            aria-pressed={!collapsed && mode === "style"}
            title="Style"
            disabled={!selectedStyleResourceId}
            onClick={() => {
              if (selectedStyleResourceId) onOpenMode("style")
            }}
            style={{
              ...rightRailBookmarkButton(!collapsed && mode === "style", 28, 10),
              cursor: selectedStyleResourceId ? "pointer" : "default",
              opacity: selectedStyleResourceId ? 1 : 0.45,
            }}
          >
            St
          </button>
        </div>
      </div>
      {contentVisible && (
        <div
          data-testid="editor-right-rail-content"
          data-structural-panel-deferred={deferNonCriticalPanelsForStructuralPaint ? "true" : "false"}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            pointerEvents: deferNonCriticalPanelsForStructuralPaint ? "none" : "auto",
          }}
        >
          <StructuralPaintDeferredSubtree defer={deferNonCriticalPanelsForStructuralPaint}>
            <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id={`right-rail-${mode}`}>
              {mode === "page" ? (
                <div data-testid="editor-right-rail-page" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <PagePanel
                    doc={doc}
                    sectionIndex={activeSectionIndex}
                    editable={isTemplateMode}
                    onUpdateMargin={(sectionIndex, margin) => {
                      if (!isTemplateMode) return
                      dispatchEditorAction({ type: "UPDATE_MARGIN", sectionIndex, margin })
                    }}
                    onUpdateReservedZones={(sectionIndex, reserved, priority) => {
                      if (!isTemplateMode) return
                      dispatchEditorAction({ type: "UPDATE_RESERVED_ZONES", sectionIndex, reserved, priority })
                    }}
                    onToggleReservedZone={(sectionIndex, zone, enabled) => {
                      if (!isTemplateMode) return
                      dispatchEditorAction({
                        type: enabled ? "ENSURE_HEADER_FOOTER_ZONE_VISIBLE" : "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY",
                        sectionIndex,
                        zone,
                      })
                    }}
                    onUpdateHeaderFooterMode={(sectionIndex, headerFooterMode) => {
                      if (!isTemplateMode) return
                      dispatchEditorAction({ type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE", sectionIndex, mode: headerFooterMode })
                    }}
                  />
                </div>
              ) : mode === "style" ? (
                <div data-testid="editor-right-rail-style" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {selectedStyleResource?.kind === "paragraph-style" ? (
                    <StyleDefinitionPanel
                      doc={doc}
                      selectedStyleId={selectedStyleResource.id}
                      editable={isTemplateMode}
                      onPatchStyleDefinition={(styleId, patch) => {
                        if (!isTemplateMode) return
                        finalizeInlineEditBeforeAction()
                        dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_DEFINITION", styleId, patch })
                      }}
                      onRenameStyleDefinition={(styleId, name) => {
                        if (!isTemplateMode) return
                        finalizeInlineEditBeforeAction()
                        dispatchEditorAction({ type: "RENAME_PARAGRAPH_STYLE_DEFINITION", styleId, name })
                      }}
                    />
                  ) : (
                    <ListResourceInspectorPanel
                      doc={doc}
                      selectedResource={selectedStyleResource}
                    />
                  )}
                </div>
              ) : mode === "properties" ? (
                <div data-testid="editor-right-rail-properties" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {isTemplateMode ? (
                    <PropertyPanel
                      doc={doc}
                      registry={registry}
                      selectedNodeId={selectedNodeId}
                      selectionAnchorNodeId={selectionAnchorNodeId}
                      onUpdateProps={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PROPS", nodeId, changes })}
                      onUpdateText={(nodeId, text) => dispatchEditorAction({ type: "UPDATE_TEXT", nodeId, text })}
                      onUpdateParagraphTextStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PARAGRAPH_TEXT_STYLE", nodeId, changes })}
                      onApplyParagraphStylePreset={(nodeId, styleId) => dispatchEditorAction({ type: "APPLY_PARAGRAPH_STYLE_PRESET", nodeId, styleId })}
                      onUpdateParagraphStyleBoxOverrides={(nodeId, changes) => dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX", nodeId, changes })}
                      onUpdateParagraphStyleOverrides={(nodeId, changes) => dispatchEditorAction({ type: "PATCH_PARAGRAPH_STYLE_OVERRIDES", nodeId, changes })}
                      onClearParagraphStyle={(nodeId) => dispatchEditorAction({ type: "CLEAR_PARAGRAPH_STYLE", nodeId })}
                      onDetachParagraphStyle={(nodeId) => dispatchEditorAction({ type: "DETACH_PARAGRAPH_STYLE", nodeId })}
                      onResetParagraphStyleOverrides={(nodeId) => dispatchEditorAction({ type: "RESET_PARAGRAPH_STYLE_OVERRIDES", nodeId })}
                      onUpdateFieldRef={(fieldRefId, changes) => dispatchEditorAction({ type: "UPDATE_FIELD_REF", fieldRefId, changes })}
                      onUpdateParagraphBoxStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_PARAGRAPH_BOX_STYLE", nodeId, changes })}
                      onUpdateFlowStackBoxStyle={(nodeId, changes) => dispatchEditorAction({ type: "UPDATE_FLOW_STACK_BOX_STYLE", nodeId, changes })}
                      onUpdateFlowTableCellSpan={(cellId, changes) => dispatchEditorAction({ type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId, changes })}
                      onSelectNode={(nodeId) => dispatchEditorAction({ type: "SELECT_NODE", nodeId, anchorNodeId: nodeId })}
                      onSelectContextNode={onSelectContextNode}
                      onSelectListGroup={onSelectOutlineListGroup}
                      onSelectStyleResource={onSelectStyleResource}
                      onDelete={(nodeId) => dispatchEditorAction({ type: "DELETE_NODE", nodeId })}
                      tableOps={{
                        addRow: (tableId, afterIndex) => {
                          dispatchEditorAction({ type: "TABLE_ADD_ROW", tableId, afterIndex })
                        },
                        removeRow: (tableId, rowIndex) => {
                          dispatchEditorAction({ type: "TABLE_REMOVE_ROW", tableId, rowIndex })
                        },
                        addCol: (tableId, afterIndex) => {
                          dispatchEditorAction({ type: "TABLE_ADD_COL", tableId, afterIndex })
                        },
                        removeCol: (tableId, colIndex) => {
                          dispatchEditorAction({ type: "TABLE_REMOVE_COL", tableId, colIndex })
                        },
                        fitToWidth: (tableId) => {
                          dispatchEditorAction({ type: "TABLE_FIT_TO_WIDTH", tableId })
                        },
                      }}
                      flowRowOps={{
                        addCol: (rowId, stackId, position = "after") => {
                          dispatchEditorAction({ type: "FLOW_ROW_ADD_COL", rowId, stackId, position })
                        },
                        resizePair: (leftStackId, rightStackId, leftShare, rightShare) => {
                          dispatchEditorAction({ type: "RESIZE_COLUMNS", leftStackId, rightStackId, leftShare, rightShare })
                        },
                      }}
                    />
                  ) : (
                    <FillingPanel
                      doc={doc}
                      registry={registry}
                      snapshot={dataSnapshot}
                      readinessIssues={dataReadinessIssues}
                      onChange={onDataSnapshotChange}
                    />
                  )}
                </div>
              ) : null}
            </EditorSubtreePerfProfiler>
          </StructuralPaintDeferredSubtree>
        </div>
      )}
    </div>
  )
}
