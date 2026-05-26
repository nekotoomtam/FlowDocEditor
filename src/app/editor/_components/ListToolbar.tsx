import type { CSSProperties } from "react"
import {
  BULLET_BASIC_LIST_STYLE_ID,
  FLOWDOC_LIST_STYLE_PRESET_IDS,
  PAREN_DECIMAL_LIST_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
  type FlowDocListStylePresetId,
} from "@/document"
import type { DocumentNode, FlowTableNode, ParagraphNode } from "@/schema"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"

export interface ListToolbarPresetOption {
  key: "numbered" | "paren" | "bullet"
  label: string
  title: string
  styleId: FlowDocListStylePresetId
  defaultInstanceId: string
}

export interface ListToolbarState {
  targetNodeId: string | null
  currentInstanceId: string | null
  currentStyleId: FlowDocListStylePresetId | null
  currentLevel: number | null
  canToggle: boolean
  canIndent: boolean
  canOutdent: boolean
}

export const LIST_TOOLBAR_PRESETS: ListToolbarPresetOption[] = [
  {
    key: "numbered",
    label: "1.",
    title: "TOR clause numbering",
    styleId: TOR_CLAUSE_LIST_STYLE_ID,
    defaultInstanceId: "tor-main",
  },
  {
    key: "paren",
    label: "(1)",
    title: "Parenthesized numbering",
    styleId: PAREN_DECIMAL_LIST_STYLE_ID,
    defaultInstanceId: "flowdoc-paren-decimal",
  },
  {
    key: "bullet",
    label: "•",
    title: "Bullet list",
    styleId: BULLET_BASIC_LIST_STYLE_ID,
    defaultInstanceId: "flowdoc-bullet-basic",
  },
]

interface ListToolbarProps {
  doc: DocumentNode
  selectedNodeId: string | null
  editable: boolean
  onToggleListPreset: (nodeId: string, styleId: FlowDocListStylePresetId, instanceId: string, level: number) => void
  onChangeListItemLevel: (nodeId: string, direction: ListLevelChangeDirection) => void
}

export function ListToolbar({
  doc,
  selectedNodeId,
  editable,
  onToggleListPreset,
  onChangeListItemLevel,
}: ListToolbarProps) {
  const state = resolveListToolbarState(doc, selectedNodeId, editable)

  return (
    <div
      data-testid="list-toolbar"
      data-active-node-id={state.targetNodeId ?? ""}
      data-active-style-id={state.currentStyleId ?? ""}
      data-current-level={state.currentLevel ?? ""}
      style={toolbarStyle}
    >
      <span style={toolbarLabel}>List</span>
      <div style={buttonGroupStyle}>
        {LIST_TOOLBAR_PRESETS.map((preset) => {
          const active = state.currentStyleId === preset.styleId
          const disabled = !state.canToggle
          const instanceId = active && state.currentInstanceId ? state.currentInstanceId : preset.defaultInstanceId
          return (
            <button
              key={preset.key}
              type="button"
              data-testid={`list-toolbar-${preset.key}`}
              aria-pressed={active}
              disabled={disabled}
              title={preset.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!disabled && state.targetNodeId) {
                  onToggleListPreset(state.targetNodeId, preset.styleId, instanceId, 0)
                }
              }}
              style={toolbarButtonStyle(active, disabled)}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <div style={buttonGroupStyle}>
        <button
          type="button"
          data-testid="list-toolbar-outdent"
          disabled={!state.canOutdent}
          title="Decrease list level"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (state.targetNodeId && state.canOutdent) onChangeListItemLevel(state.targetNodeId, "outdent")
          }}
          style={toolbarButtonStyle(false, !state.canOutdent)}
        >
          Out
        </button>
        <button
          type="button"
          data-testid="list-toolbar-indent"
          disabled={!state.canIndent}
          title="Increase list level"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (state.targetNodeId && state.canIndent) onChangeListItemLevel(state.targetNodeId, "indent")
          }}
          style={toolbarButtonStyle(false, !state.canIndent)}
        >
          In
        </button>
      </div>
    </div>
  )
}

export function resolveListToolbarState(
  doc: DocumentNode,
  selectedNodeId: string | null,
  editable: boolean,
): ListToolbarState {
  const paragraph = selectedNodeId ? findParagraphNode(doc, selectedNodeId) : null
  const list = paragraph?.props.list ?? null
  const instance = list ? doc.document.listInstances?.[list.instanceId] : undefined
  const style = instance ? doc.document.listStyles?.[instance.styleId] : undefined
  const currentStyleId = isPresetStyleId(instance?.styleId) ? instance.styleId : null
  const canToggle = editable && paragraph !== null
  const canIndent = canToggle && list !== null && Boolean(
    style?.levels.some((level) => level.level === list.level + 1),
  )
  const canOutdent = canToggle && list !== null && list.level > 0

  return {
    targetNodeId: paragraph?.id ?? null,
    currentInstanceId: list?.instanceId ?? null,
    currentStyleId,
    currentLevel: list?.level ?? null,
    canToggle,
    canIndent,
    canOutdent,
  }
}

function isPresetStyleId(styleId: string | null | undefined): styleId is FlowDocListStylePresetId {
  return FLOWDOC_LIST_STYLE_PRESET_IDS.some((presetId) => presetId === styleId)
}

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (isParagraphNode(node)) return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const nested = (candidate as unknown as FlowTableNode).nodes[nodeId]
      if (isParagraphNode(nested)) return nested
    }
  }
  return null
}

function isParagraphNode(node: unknown): node is ParagraphNode {
  return Boolean(
    node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "paragraph" &&
    "props" in node &&
    "children" in node,
  )
}

const toolbarStyle: CSSProperties = {
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  paddingTop: 2,
  borderTop: "1px solid #f1f5f9",
}

const toolbarLabel: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0,
  marginRight: 2,
}

const buttonGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
}

function toolbarButtonStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    minWidth: 28,
    height: 28,
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    padding: "0 7px",
    fontSize: 12,
    fontWeight: active ? 800 : 700,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    background: active ? "#dbeafe" : disabled ? "#f9fafb" : "#fff",
    borderColor: active ? "#bfdbfe" : "#e5e7eb",
    color: active ? "#1d4ed8" : disabled ? "#cbd5e1" : "#334155",
    cursor: disabled ? "not-allowed" : "pointer",
  }
}
