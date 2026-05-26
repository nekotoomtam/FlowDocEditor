import { useEffect, useMemo, useState } from "react"
import type {
  DocumentNode,
  FieldRefInline,
  FlowTableCellNode,
  FlowTableNode,
  FlowTableRowNode,
  LayoutNode,
  ParagraphBoxBorderSide,
  ParagraphBoxStyle,
  ParagraphNode,
  ParagraphStyleProperties,
  TocNode,
  UnitValue,
} from "@/schema"
import { pt } from "@/schema"
import { DEFAULT_FONT_KEY, listSelectableFontEntries, resolveFontEntry } from "@/font-registry"
import {
  canRemoveFlowTableColumn,
  canRemoveFlowTableRow,
  canUpdateFlowTableCellSpan,
  FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS,
  getParagraphStylePreset,
  getTextRunStyleRangeState,
  isTextRunOnlyParagraph,
  resolveFlowTableCellMergeTarget,
  resolveParagraphListContext,
  resolveStyledParagraphProps,
} from "@/document"
import type { FieldRefInlineChanges, FlowDocParagraphStylePresetId, FlowTableCellSpanChanges, ParagraphBoxStyleChanges, ParagraphTextStyleChanges, StyleManagerResourceKind } from "@/document"
import { tryResolveFlowTableGrid } from "@/document/flowTableGrid"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { FontFamilyCombobox } from "./FontFamilyCombobox"
import { resolveFlowStackResizePairShares } from "./flowStackResize"
import { InfoHint } from "./InfoHint"
import { buildSelectionContext } from "./selectionContext"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

type DocNode = LayoutNode | FlowTableRowNode | FlowTableCellNode
type DividerNode = Extract<LayoutNode, { type: "divider" }>
type DividerLineStyle = DividerNode["props"]["style"]
type ParagraphPanelTab = "text" | "box" | "style"
type FlowContainerPanelTab = "layout" | "box"

interface TableOps {
  addRow: (tableId: string, afterIndex?: number) => void
  removeRow: (tableId: string, rowIndex: number) => void
  addCol: (tableId: string, afterIndex?: number) => void
  removeCol: (tableId: string, colIndex: number) => void
  fitToWidth?: (tableId: string) => void
}

interface FlowRowOps {
  addCol: (rowId: string, stackId?: string, position?: "before" | "after") => void
  resizePair: (leftStackId: string, rightStackId: string, leftShare: number, rightShare: number) => void
}

interface Props {
  doc: DocumentNode
  registry: FieldRegistryV1
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  onUpdateProps: (nodeId: string, changes: Record<string, unknown>) => void
  onUpdateText: (nodeId: string, text: string) => void
  onUpdateParagraphTextStyle?: (nodeId: string, changes: ParagraphTextStyleChanges) => void
  onApplyParagraphStylePreset?: (nodeId: string, styleId: FlowDocParagraphStylePresetId) => void
  onUpdateParagraphStyleBoxOverrides?: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  onUpdateParagraphStyleOverrides?: (nodeId: string, changes: ParagraphStyleProperties) => void
  onClearParagraphStyle?: (nodeId: string) => void
  onDetachParagraphStyle?: (nodeId: string) => void
  onResetParagraphStyleOverrides?: (nodeId: string) => void
  onUpdateFieldRef: (fieldRefId: string, changes: FieldRefInlineChanges) => void
  onUpdateParagraphBoxStyle: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  onUpdateFlowStackBoxStyle?: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  onUpdateFlowTableCellSpan?: (cellId: string, changes: FlowTableCellSpanChanges) => void
  onSelectNode?: (nodeId: string) => void
  onSelectContextNode: (nodeId: string) => void
  onSelectListGroup?: (instanceId: string) => void
  onSelectStyleResource?: (resource: { kind: StyleManagerResourceKind; id: string }) => void
  onDelete: (nodeId: string) => void
  tableOps: TableOps
  flowRowOps: FlowRowOps
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNode(doc: DocumentNode, nodeId: string): DocNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node) return node
    for (const n of Object.values(section.nodes)) {
      if (n.type !== "flow-table") continue
      const inner = (n as unknown as FlowTableNode).nodes[nodeId]
      if (inner) return inner as DocNode
    }
  }
  return null
}

function displayNodeType(nodeType: DocNode["type"]): string {
  if (nodeType === "flow-row") return "Row"
  if (nodeType === "flow-stack") return "Stack"
  if (nodeType === "flow-table") return "Flow table"
  if (nodeType === "flow-table-row") return "Flow table row"
  if (nodeType === "flow-table-cell") return "Flow table cell"
  if (nodeType === "divider") return "Divider"
  if (nodeType === "page-break") return "Page break"
  return nodeType
}

function isTopLevel(doc: DocumentNode, nodeId: string): boolean {
  return doc.document.sections.some((s) => s.nodes[nodeId] != null)
}

function deleteButtonLabel(nodeType: DocNode["type"]): string {
  return nodeType === "flow-table" ? "Delete table" : "Delete block"
}

function findFlowTableOf(doc: DocumentNode, nodeId: string): { table: FlowTableNode; tableId: string } | null {
  for (const section of doc.document.sections) {
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "flow-table") continue
      const table = n as unknown as FlowTableNode
      if (table.nodes[nodeId]) return { table, tableId }
    }
  }
  return null
}

function rowIndexOfFlowTable(table: FlowTableNode, rowId: string): number {
  return table.rowIds.indexOf(rowId)
}

function rowOfFlowTableCell(table: FlowTableNode, cellId: string): {
  rowId: string
  rowIndex: number
  rowEndIndex: number
  colIndex: number
  colEndIndex: number
  rowspan: number
  colspan: number
} | null {
  const resolved = tryResolveFlowTableGrid(table)
  if (!resolved.ok) return null
  const placement = resolved.grid.placementsByCellId.get(cellId)
  if (placement == null) return null
  return {
    rowId: placement.rowId,
    rowIndex: placement.rowIndex,
    rowEndIndex: placement.rowEndIndex,
    colIndex: placement.columnIndex,
    colEndIndex: placement.columnEndIndex,
    rowspan: placement.rowspan,
    colspan: placement.colspan,
  }
}

function canAddFlowTableGrid(table: FlowTableNode): boolean {
  return tryResolveFlowTableGrid(table).ok
}

function findFlowRowOfStack(doc: DocumentNode, stackId: string): { rowId: string; row: Extract<LayoutNode, { type: "flow-row" }>; index: number } | null {
  for (const section of doc.document.sections) {
    for (const [rowId, node] of Object.entries(section.nodes)) {
      if (node.type !== "flow-row") continue
      const index = node.childIds.indexOf(stackId)
      if (index !== -1) return { rowId, row: node, index }
    }
  }
  return null
}

function getParagraphText(node: ParagraphNode): string {
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
}

function getParagraphFieldRefs(node: ParagraphNode): FieldRefInline[] {
  return node.children.filter((child): child is FieldRefInline => child.type === "fieldRef")
}

function optionalTextValue(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const PARAGRAPH_BOX_EDGES = ["top", "right", "bottom", "left"] as const
type ParagraphBoxEdge = typeof PARAGRAPH_BOX_EDGES[number]
type ParagraphBoxBorderStyle = ParagraphBoxBorderSide["style"]

const DEFAULT_BOX_BORDER_COLOR = "1F2937"
const DEFAULT_BOX_BORDER_WIDTH = 1
const BOX_BORDER_WIDTH_MAX = 5
const BOX_BORDER_WIDTH_STEP = 0.25
const DEFAULT_DIVIDER_COLOR = "CBD5E1"
const DIVIDER_THICKNESS_SLIDER_MAX = 12
const DIVIDER_SPACING_SLIDER_MAX = 72
const DIVIDER_SPACING_INPUT_MAX = 144
const DOCUMENT_COLOR_PALETTE = [
  "F8FAFC", "DBEAFE", "DCFCE7", "FEF3C7", "FCE7F3",
  "E2E8F0", "BFDBFE", "BBF7D0", "FDE68A", "FBCFE8",
  "64748B", "2563EB", "16A34A", "D97706", "DB2777",
  "111827", "1E3A8A", "166534", "92400E", "831843",
] as const
const BOX_BORDER_STYLE_OPTIONS: ParagraphBoxBorderStyle[] = ["none", "solid", "dashed", "dotted"]
const DIVIDER_LINE_STYLE_OPTIONS: DividerLineStyle[] = ["solid", "dashed", "dotted"]
const PARAGRAPH_FONT_OPTIONS = listSelectableFontEntries()
const PARAGRAPH_STYLE_PRESET_OPTIONS = FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS.map((styleId) => {
  const style = getParagraphStylePreset(styleId)
  return {
    id: style.id,
    label: style.name ?? style.id,
  }
})

function sanitizeHexColorInput(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
}

function isCompleteHexColor(value: string): boolean {
  return /^[0-9A-F]{6}$/.test(value)
}

function numericPtInput(value: string): number {
  return Math.max(0, Number(value) || 0)
}

function clampedPtInput(value: string | number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(max, numeric))
}

function clampedBorderWidthInput(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(BOX_BORDER_WIDTH_MAX, numeric))
}

function edgeLabel(edge: ParagraphBoxEdge): string {
  return edge[0].toUpperCase() + edge.slice(1)
}

function concreteBorderStyle(style: ParagraphBoxBorderStyle | "mixed" | "none"): ParagraphBoxBorderStyle {
  return style === "mixed" || style === "none" ? "solid" : style
}

function commonBorderStyle(sides: ParagraphBoxBorderSide[]): ParagraphBoxBorderStyle | "mixed" | "none" {
  if (sides.length === 0) return "none"
  const first = sides[0].style
  return sides.every((side) => side.style === first) ? first : "mixed"
}

function commonBorderWidth(sides: ParagraphBoxBorderSide[]): number | null {
  if (sides.length === 0) return null
  const first = sides[0].width.value
  return sides.every((side) => side.width.value === first && side.width.unit === "pt") ? first : null
}

function commonBorderColor(sides: ParagraphBoxBorderSide[]): string | null {
  if (sides.length === 0) return null
  const first = sides[0].color.toUpperCase()
  return sides.every((side) => side.color.toUpperCase() === first) ? first : null
}

function CollapsibleCard({
  title,
  summary,
  children,
  testId,
  defaultOpen = true,
}: {
  title: string
  summary?: string
  children: React.ReactNode
  testId?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section data-testid={testId ?? "property-card"} style={collapsibleCard}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={collapsibleCardHeader}
      >
        <span style={{ fontWeight: 700, color: "#374151" }}>{title}</span>
        {summary && (
          <span style={{ marginLeft: "auto", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary}
          </span>
        )}
        <span aria-hidden="true" style={{ color: "#6b7280", fontWeight: 700, width: 12, textAlign: "center" }}>
          {open ? "-" : "+"}
        </span>
      </button>
      {open && (
        <div data-testid={testId ? `${testId}-body` : undefined} style={collapsibleCardBody}>
          {children}
        </div>
      )}
    </section>
  )
}

function BorderGlyph({
  edge,
  active,
  clearMark = false,
}: {
  edge: ParagraphBoxEdge | "all"
  active: boolean
  clearMark?: boolean
}) {
  const baseColor = "#cbd5e1"
  const targetColor = active ? "#2563eb" : "#64748b"
  const targetBorder = `2px solid ${targetColor}`
  const baseBorder = `1px solid ${baseColor}`
  const sideBorder = (side: ParagraphBoxEdge) => edge === "all" || edge === side ? targetBorder : baseBorder

  return (
    <span
      aria-hidden="true"
      data-testid={`paragraph-box-border-glyph-${edge}`}
      style={{
        width: 16,
        height: 16,
        boxSizing: "border-box",
        borderTop: sideBorder("top"),
        borderRight: sideBorder("right"),
        borderBottom: sideBorder("bottom"),
        borderLeft: sideBorder("left"),
        background: active ? "#eff6ff" : "#fff",
        display: "block",
        position: "relative",
      }}
    >
      {clearMark && (
        <span
          aria-hidden="true"
          data-testid="paragraph-box-border-clear-mark"
          style={{
            position: "absolute",
            inset: 2,
            display: "block",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 1,
              right: 1,
              top: 5,
              height: 2,
              borderRadius: 999,
              background: "#ef4444",
              transform: "rotate(45deg)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: 1,
              right: 1,
              top: 5,
              height: 2,
              borderRadius: 999,
              background: "#ef4444",
              transform: "rotate(-45deg)",
            }}
          />
        </span>
      )}
    </span>
  )
}

function BorderStyleIcon({ style }: { style: ParagraphBoxBorderStyle }) {
  if (style === "none") {
    return (
      <span aria-hidden="true" style={borderStyleIconBox}>
        <span style={{ ...borderStyleIconLine, borderTop: "2px solid #94a3b8" }} />
        <span
          style={{
            position: "absolute",
            left: 5,
            right: 5,
            top: 10,
            height: 2,
            borderRadius: 999,
            background: "#ef4444",
            transform: "rotate(-24deg)",
          }}
        />
      </span>
    )
  }

  return (
    <span aria-hidden="true" style={borderStyleIconBox}>
      <span style={{ ...borderStyleIconLine, borderTop: `2px ${style} #334155` }} />
    </span>
  )
}

function ColorPaletteTray({
  colors,
  selectedColor,
  displayValue,
  onSelectColor,
  testIdPrefix,
  labelPrefix,
  wellStyle,
  wellContent,
  actionControl,
  customControls,
  swatchWidth = 22,
  swatchHeight = 20,
}: {
  colors: readonly string[]
  selectedColor: string | null
  displayValue: string
  onSelectColor: (color: string) => void
  testIdPrefix: string
  labelPrefix: string
  wellStyle: React.CSSProperties
  wellContent?: React.ReactNode
  actionControl?: React.ReactNode
  customControls?: React.ReactNode
  swatchWidth?: number
  swatchHeight?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={colorControlRow}>
        <button
          type="button"
          data-testid={`${testIdPrefix}-well`}
          aria-label={`Open ${labelPrefix.toLowerCase()} color palette`}
          aria-expanded={open}
          aria-controls={`${testIdPrefix}-tray`}
          onClick={() => setOpen((value) => !value)}
          style={{ ...colorWellButton, ...wellStyle }}
        >
          {wellContent}
        </button>
        <span data-testid={`${testIdPrefix}-value`} style={colorValueLabel}>{displayValue}</span>
        <button
          type="button"
          data-testid={`${testIdPrefix}-toggle`}
          aria-expanded={open}
          aria-controls={`${testIdPrefix}-tray`}
          onClick={() => setOpen((value) => !value)}
          style={colorMoreButton}
        >
          More
        </button>
      </div>
      {open && (
        <div
          id={`${testIdPrefix}-tray`}
          data-testid={`${testIdPrefix}-tray`}
          style={colorTray}
        >
          <div style={colorTrayHeader}>
            <span style={{ fontSize: 9, color: "#6b7280" }}>Document colors</span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-close`}
              aria-label={`Close ${labelPrefix.toLowerCase()} color palette`}
              onClick={() => setOpen(false)}
              style={colorTrayCloseButton}
            >
              Close
            </button>
          </div>
          {actionControl}
          <div
            data-testid={`${testIdPrefix}-grid`}
            style={{ ...colorPaletteGrid, gridTemplateColumns: `repeat(5, ${swatchWidth}px)` }}
          >
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                data-testid={`${testIdPrefix}-swatch`}
                aria-label={`Set ${labelPrefix.toLowerCase()} palette color ${color}`}
                onClick={() => onSelectColor(color)}
                style={{
                  width: swatchWidth,
                  height: swatchHeight,
                  border: selectedColor === color ? "2px solid #2563eb" : "1px solid #d1d5db",
                  borderRadius: 4,
                  background: `#${color}`,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
          {customControls && <div style={colorTrayCustom}>{customControls}</div>}
        </div>
      )}
    </div>
  )
}

function DividerControls({
  node,
  onUpdateProps,
}: {
  node: DividerNode
  onUpdateProps: (nodeId: string, changes: Record<string, unknown>) => void
}) {
  const color = node.props.color.toUpperCase()
  const thickness = unitValueToPtNumber(node.props.thickness)
  const marginBefore = unitValueToPtNumber(node.props.marginBefore)
  const marginAfter = unitValueToPtNumber(node.props.marginAfter)
  const [colorDraft, setColorDraft] = useState(color)
  const [thicknessDraft, setThicknessDraft] = useState(thickness)
  const [thicknessDraftDirty, setThicknessDraftDirty] = useState(false)
  const [marginBeforeDraft, setMarginBeforeDraft] = useState(marginBefore)
  const [marginAfterDraft, setMarginAfterDraft] = useState(marginAfter)
  const [marginBeforeDraftDirty, setMarginBeforeDraftDirty] = useState(false)
  const [marginAfterDraftDirty, setMarginAfterDraftDirty] = useState(false)

  useEffect(() => {
    setColorDraft(color)
  }, [color, node.id])

  useEffect(() => {
    setThicknessDraft(thickness)
    setThicknessDraftDirty(false)
  }, [thickness, node.id])

  useEffect(() => {
    setMarginBeforeDraft(marginBefore)
    setMarginBeforeDraftDirty(false)
  }, [marginBefore, node.id])

  useEffect(() => {
    setMarginAfterDraft(marginAfter)
    setMarginAfterDraftDirty(false)
  }, [marginAfter, node.id])

  const commitColor = (nextColor: string) => {
    const hex = sanitizeHexColorInput(nextColor)
    if (!isCompleteHexColor(hex)) return
    if (hex !== color) onUpdateProps(node.id, { color: hex })
    setColorDraft(hex)
  }

  const commitColorDraft = () => {
    const hex = sanitizeHexColorInput(colorDraft)
    if (!isCompleteHexColor(hex)) {
      setColorDraft(color)
      return
    }
    commitColor(hex)
  }

  const setThicknessDraftValue = (value: string | number) => {
    const next = Math.max(0, Number(value) || 0)
    setThicknessDraft(next)
    setThicknessDraftDirty(next !== thickness)
  }

  const commitThicknessDraft = () => {
    const next = Math.max(0, Number(thicknessDraft) || 0)
    if (thicknessDraftDirty && next !== thickness) onUpdateProps(node.id, { thickness: pt(next) })
    setThicknessDraft(next)
    setThicknessDraftDirty(false)
  }

  const spacingInputMax = Math.max(
    DIVIDER_SPACING_INPUT_MAX,
    Math.ceil(marginBefore),
    Math.ceil(marginAfter),
  )
  const spacingSliderMax = Math.max(
    DIVIDER_SPACING_SLIDER_MAX,
    Math.ceil(marginBeforeDraft),
    Math.ceil(marginAfterDraft),
  )

  const setSpacingDraftValue = (edge: "before" | "after", value: string | number) => {
    const next = clampedPtInput(value, spacingInputMax)
    if (edge === "before") {
      setMarginBeforeDraft(next)
      setMarginBeforeDraftDirty(next !== marginBefore)
      return
    }
    setMarginAfterDraft(next)
    setMarginAfterDraftDirty(next !== marginAfter)
  }

  const commitSpacingDraft = (edge: "before" | "after") => {
    if (edge === "before") {
      const next = clampedPtInput(marginBeforeDraft, spacingInputMax)
      if (marginBeforeDraftDirty && next !== marginBefore) onUpdateProps(node.id, { marginBefore: pt(next) })
      setMarginBeforeDraft(next)
      setMarginBeforeDraftDirty(false)
      return
    }
    const next = clampedPtInput(marginAfterDraft, spacingInputMax)
    if (marginAfterDraftDirty && next !== marginAfter) onUpdateProps(node.id, { marginAfter: pt(next) })
    setMarginAfterDraft(next)
    setMarginAfterDraftDirty(false)
  }

  const resetSpacingDraft = (edge: "before" | "after") => {
    if (edge === "before") {
      setMarginBeforeDraft(marginBefore)
      setMarginBeforeDraftDirty(false)
      return
    }
    setMarginAfterDraft(marginAfter)
    setMarginAfterDraftDirty(false)
  }

  const renderSpacingControl = (edge: "before" | "after") => {
    const isBefore = edge === "before"
    const draft = isBefore ? marginBeforeDraft : marginAfterDraft
    const labelText = isBefore ? "\u2191 Above" : "\u2193 Below"
    const testIdPrefix = isBefore ? "divider-spacing-above" : "divider-spacing-below"
    return (
      <label key={edge} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 9, color: "#9ca3af" }}>{labelText}</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 52px", gap: 6, alignItems: "center" }}>
          <input
            data-testid={`${testIdPrefix}-slider`}
            aria-label={`Divider spacing ${isBefore ? "above" : "below"}`}
            type="range"
            min={0}
            max={spacingSliderMax}
            step={1}
            value={draft}
            onChange={(e) => setSpacingDraftValue(edge, e.target.value)}
            onPointerUp={() => commitSpacingDraft(edge)}
            onBlur={() => commitSpacingDraft(edge)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSpacingDraft(edge)
              if (e.key === "Escape") resetSpacingDraft(edge)
            }}
            style={{ width: "100%" }}
          />
          <input
            data-testid={testIdPrefix}
            type="number"
            min={0}
            max={spacingInputMax}
            step={1}
            value={draft}
            onChange={(e) => setSpacingDraftValue(edge, e.target.value)}
            onBlur={() => commitSpacingDraft(edge)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSpacingDraft(edge)
              if (e.key === "Escape") resetSpacingDraft(edge)
            }}
            style={input}
          />
        </div>
      </label>
    )
  }

  const renderLineStyleButton = (style: DividerLineStyle) => {
    const active = node.props.style === style
    const label = `Set divider line style ${style}`
    return (
      <button
        key={style}
        type="button"
        data-testid={`divider-line-style-${style}`}
        aria-label={label}
        aria-pressed={active}
        title={label}
        onClick={() => onUpdateProps(node.id, { style })}
        style={{
          ...borderStyleButton,
          background: active ? "#dbeafe" : "#f8fafc",
          borderColor: active ? "#93c5fd" : "#e5e7eb",
        }}
      >
        <BorderStyleIcon style={style} />
      </button>
    )
  }

  const previewColor = isCompleteHexColor(colorDraft) ? colorDraft : color
  const previewWidth = Math.max(1, thicknessDraft)
  const sliderMax = Math.max(DIVIDER_THICKNESS_SLIDER_MAX, Math.ceil(thicknessDraft))

  return (
    <section data-testid="divider-line-controls" style={sectionBox}>
      <CollapsibleCard title="Line" summary={`${node.props.style}, ${thickness} pt`} testId="divider-line-card">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>Style</span>
            <div data-testid="divider-line-style-group" style={{ ...borderStyleGroup, gridTemplateColumns: "repeat(3, 1fr)" }}>
              {DIVIDER_LINE_STYLE_OPTIONS.map(renderLineStyleButton)}
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>Width</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 52px", gap: 6, alignItems: "center" }}>
              <input
                data-testid="divider-line-width-slider"
                aria-label="Divider line width"
                type="range"
                min={0}
                max={sliderMax}
                step={BOX_BORDER_WIDTH_STEP}
                value={thicknessDraft}
                onChange={(e) => setThicknessDraftValue(e.target.value)}
                onPointerUp={commitThicknessDraft}
                onBlur={commitThicknessDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitThicknessDraft()
                  if (e.key === "Escape") {
                    setThicknessDraft(thickness)
                    setThicknessDraftDirty(false)
                  }
                }}
                style={{ width: "100%" }}
              />
              <input
                data-testid="divider-line-width"
                type="number"
                min={0}
                step={BOX_BORDER_WIDTH_STEP}
                value={thicknessDraft}
                onChange={(e) => setThicknessDraftValue(e.target.value)}
                onBlur={commitThicknessDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitThicknessDraft()
                  if (e.key === "Escape") {
                    setThicknessDraft(thickness)
                    setThicknessDraftDirty(false)
                  }
                }}
                style={input}
              />
            </div>
          </label>
        </div>
        <div
          data-testid="divider-line-preview"
          style={{
            height: 20,
            display: "flex",
            alignItems: "center",
            marginTop: 6,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              width: "100%",
              borderTop: `${previewWidth}px ${node.props.style} #${previewColor}`,
            }}
          />
        </div>
        <ColorPaletteTray
          colors={DOCUMENT_COLOR_PALETTE}
          selectedColor={color}
          displayValue={`#${color}`}
          onSelectColor={commitColor}
          testIdPrefix="divider-line-color-palette"
          labelPrefix="Divider line"
          wellStyle={{ background: `#${previewColor}` }}
          actionControl={(
            <button
              type="button"
              data-testid="divider-line-color-default"
              aria-label="Set divider line default color"
              onClick={() => commitColor(DEFAULT_DIVIDER_COLOR)}
              style={paletteActionButton}
            >
              <span style={{ ...paletteActionSwatch, background: `#${DEFAULT_DIVIDER_COLOR}` }} />
              Default
            </button>
          )}
          customControls={(
            <div style={customColorRow}>
              <input
                type="color"
                aria-label="Divider line color"
                value={`#${previewColor}`}
                onChange={(e) => {
                  const hex = sanitizeHexColorInput(e.target.value)
                  setColorDraft(hex)
                }}
                onBlur={commitColorDraft}
                style={{ width: 28, height: 24, padding: 0, border: "1px solid #e5e7eb", borderRadius: 4, background: "white" }}
              />
              <input
                data-testid="divider-line-color"
                value={colorDraft}
                maxLength={6}
                onChange={(e) => {
                  const hex = sanitizeHexColorInput(e.target.value)
                  setColorDraft(hex)
                }}
                onBlur={commitColorDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitColorDraft()
                  if (e.key === "Escape") setColorDraft(color)
                }}
                style={input}
              />
            </div>
          )}
          swatchWidth={20}
          swatchHeight={18}
        />
      </CollapsibleCard>
      <CollapsibleCard title="Spacing" summary={`${marginBefore} / ${marginAfter} pt`} testId="divider-spacing-card">
        <div data-testid="divider-spacing-preview" style={dividerSpacingPreview}>
          <span style={dividerSpacingLabel}>{"\u2191"} Above</span>
          <span
            aria-hidden="true"
            style={{
              width: "100%",
              borderTop: `${previewWidth}px ${node.props.style} #${previewColor}`,
            }}
          />
          <span style={dividerSpacingLabel}>{"\u2193"} Below</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {renderSpacingControl("before")}
          {renderSpacingControl("after")}
        </div>
      </CollapsibleCard>
    </section>
  )
}

function BoxControls({
  nodeId,
  box,
  onUpdateBoxStyle,
  testIdPrefix = "paragraph-box",
  labelPrefix = "Paragraph box",
}: {
  nodeId: string
  box: ParagraphBoxStyle | undefined
  onUpdateBoxStyle: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  testIdPrefix?: string
  labelPrefix?: string
}) {
  const fill = box?.fill?.toUpperCase() ?? ""
  const activeEdges = PARAGRAPH_BOX_EDGES.filter((edge) => box?.border?.[edge])
  const activeSides = activeEdges
    .map((edge) => box?.border?.[edge])
    .filter((side): side is ParagraphBoxBorderSide => Boolean(side))
  const targetEdges = activeEdges.length > 0 ? activeEdges : PARAGRAPH_BOX_EDGES
  const borderStyle = commonBorderStyle(activeSides)
  const borderWidth = commonBorderWidth(activeSides)
  const borderColor = commonBorderColor(activeSides)
  const paddingValues = PARAGRAPH_BOX_EDGES.map((edge) => box?.padding?.[edge]?.value ?? 0)
  const allPaddingValue = paddingValues.every((value) => value === paddingValues[0]) ? paddingValues[0] : null
  const paddingSummary = paddingValues.join("/")
  const borderSummary = activeEdges.length > 0 ? `${activeEdges.length}/4 sides` : "none"
  const allBordersActive = activeEdges.length === PARAGRAPH_BOX_EDGES.length
  const allBorderActionLabel = allBordersActive ? "Clear all borders" : "Set border on all sides"
  const [fillDraft, setFillDraft] = useState(fill)
  const [borderColorDraft, setBorderColorDraft] = useState(borderColor ?? "")
  const [borderWidthDraft, setBorderWidthDraft] = useState(borderWidth ?? DEFAULT_BOX_BORDER_WIDTH)
  const [borderWidthDraftDirty, setBorderWidthDraftDirty] = useState(false)

  useEffect(() => {
    setFillDraft(fill)
  }, [fill, nodeId])

  useEffect(() => {
    setBorderColorDraft(borderColor ?? "")
  }, [borderColor, nodeId])

  useEffect(() => {
    setBorderWidthDraft(borderWidth ?? DEFAULT_BOX_BORDER_WIDTH)
    setBorderWidthDraftDirty(false)
  }, [borderWidth, nodeId])

  const updateBorderEdges = (edges: readonly ParagraphBoxEdge[], side: ParagraphBoxBorderSide | null) => {
    const border = edges.reduce<NonNullable<ParagraphBoxStyleChanges["border"]>>((acc, edge) => {
      acc[edge] = side
      return acc
    }, {})
    onUpdateBoxStyle(nodeId, { border })
  }

  const makeBorderSide = (overrides: Partial<{
    style: ParagraphBoxBorderStyle
    width: number
    color: string
  }> = {}): ParagraphBoxBorderSide => ({
    style: overrides.style ?? concreteBorderStyle(borderStyle),
    width: pt(overrides.width ?? borderWidth ?? DEFAULT_BOX_BORDER_WIDTH),
    color: (overrides.color ?? borderColor ?? DEFAULT_BOX_BORDER_COLOR).toUpperCase(),
  })

  const commitFill = (nextFill: string) => {
    const hex = sanitizeHexColorInput(nextFill)
    onUpdateBoxStyle(nodeId, { fill: hex.length === 6 ? hex : null })
    setFillDraft(hex.length === 6 ? hex : "")
  }

  const commitFillDraft = () => {
    const hex = sanitizeHexColorInput(fillDraft)
    if (hex.length === 0) {
      if (fill !== "") onUpdateBoxStyle(nodeId, { fill: null })
      setFillDraft("")
      return
    }
    if (!isCompleteHexColor(hex)) {
      setFillDraft(fill)
      return
    }
    if (hex !== fill) onUpdateBoxStyle(nodeId, { fill: hex })
    setFillDraft(hex)
  }

  const commitBorderColor = (nextColor: string) => {
    const hex = sanitizeHexColorInput(nextColor)
    if (!isCompleteHexColor(hex)) return
    if (hex !== borderColor || activeEdges.length === 0) updateBorderEdges(targetEdges, makeBorderSide({ color: hex }))
    setBorderColorDraft(hex)
  }

  const commitBorderColorDraft = () => {
    const hex = sanitizeHexColorInput(borderColorDraft)
    if (!isCompleteHexColor(hex)) {
      setBorderColorDraft(borderColor ?? "")
      return
    }
    commitBorderColor(hex)
  }

  const setBorderWidthDraftValue = (value: string | number) => {
    const width = clampedBorderWidthInput(value)
    setBorderWidthDraft(width)
    setBorderWidthDraftDirty(width !== (borderWidth ?? DEFAULT_BOX_BORDER_WIDTH))
  }

  const commitBorderWidthDraft = () => {
    const width = clampedBorderWidthInput(borderWidthDraft)
    if (borderWidthDraftDirty && width !== borderWidth) updateBorderEdges(targetEdges, makeBorderSide({ width }))
    setBorderWidthDraft(width)
    setBorderWidthDraftDirty(false)
  }

  const setPadding = (edge: ParagraphBoxEdge, value: string) => {
    onUpdateBoxStyle(nodeId, { padding: { [edge]: pt(numericPtInput(value)) } })
  }

  const setAllPadding = (value: string) => {
    const amount = numericPtInput(value)
    onUpdateBoxStyle(nodeId, {
      padding: {
        top: pt(amount),
        right: pt(amount),
        bottom: pt(amount),
        left: pt(amount),
      },
    })
  }

  const renderPaddingInput = (edge: ParagraphBoxEdge, gridArea: string) => (
    <label key={edge} style={{ ...compassField, gridArea }}>
      <span style={compassControlLabel}>{edgeLabel(edge)}</span>
      <input
        data-testid={`${testIdPrefix}-padding-${edge}`}
        type="number"
        min={0}
        step={1}
        value={box?.padding?.[edge]?.value ?? 0}
        onChange={(e) => setPadding(edge, e.target.value)}
        style={input}
      />
    </label>
  )

  const renderBorderButton = (edge: ParagraphBoxEdge, gridArea: string) => {
    const active = Boolean(box?.border?.[edge])
    return (
      <button
        key={edge}
        type="button"
        data-testid={`${testIdPrefix}-border-${edge}`}
        aria-label={`Toggle ${edge} border`}
        aria-pressed={active}
        title={`Toggle ${edge} border`}
        onClick={() => updateBorderEdges([edge], active ? null : makeBorderSide())}
        style={{
          ...compassButton,
          gridArea,
          background: active ? "#dbeafe" : "#fafafa",
          borderColor: active ? "#93c5fd" : "#e5e7eb",
        }}
      >
        <BorderGlyph edge={edge} active={active} />
      </button>
    )
  }
  const renderBorderStyleButton = (style: ParagraphBoxBorderStyle) => {
    const active = borderStyle === style || (style === "none" && activeEdges.length === 0)
    const label = style === "none" ? "Clear border style" : `Set border style ${style}`
    return (
      <button
        key={style}
        type="button"
        data-testid={`${testIdPrefix}-border-style-${style}`}
        aria-label={label}
        aria-pressed={active}
        title={label}
        onClick={() => {
          if (style === "none") updateBorderEdges(targetEdges, null)
          else updateBorderEdges(targetEdges, makeBorderSide({ style }))
        }}
        style={{
          ...borderStyleButton,
          background: active ? "#dbeafe" : "#f8fafc",
          borderColor: active ? "#93c5fd" : "#e5e7eb",
        }}
      >
        <BorderStyleIcon style={style} />
      </button>
    )
  }
  const draftFillColor = isCompleteHexColor(fillDraft) ? fillDraft : ""
  const previewFillColor = draftFillColor || fill
  const fillPickerColor = previewFillColor || "FFFFFF"
  const fillPreviewBackground = previewFillColor ? { background: `#${previewFillColor}` } : noneFillBackground
  const borderPreviewColor = isCompleteHexColor(borderColorDraft) ? borderColorDraft : borderColor ?? DEFAULT_BOX_BORDER_COLOR
  const borderDisplayValue = borderColor ? `#${borderColor}` : activeEdges.length > 0 ? "mixed" : "default"
  const borderPreviewStyle = concreteBorderStyle(borderStyle)
  const borderPreviewWidth = Math.max(1, borderWidthDraft)

  return (
    <section data-testid={`${testIdPrefix}-controls`} style={sectionBox}>
      <CollapsibleCard title="Fill" summary={fill ? `#${fill}` : "none"} testId={`${testIdPrefix}-fill-card`}>
        <div
          data-testid={`${testIdPrefix}-fill-preview`}
          style={{
            height: 22,
            border: "1px solid #e5e7eb",
            borderRadius: 4,
            ...fillPreviewBackground,
            marginBottom: 6,
            overflow: "hidden",
            position: "relative",
          }}
        />
        <ColorPaletteTray
          colors={DOCUMENT_COLOR_PALETTE}
          selectedColor={fill || null}
          displayValue={fill ? `#${fill}` : "none"}
          onSelectColor={commitFill}
          testIdPrefix={`${testIdPrefix}-fill-palette`}
          labelPrefix={`${labelPrefix} fill`}
          wellStyle={fill ? { background: `#${fill}` } : noneFillBackground}
          wellContent={!fill && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: -4,
                right: -4,
                top: 11,
                height: 2,
                background: "#64748b",
                transform: "rotate(-35deg)",
              }}
            />
          )}
          actionControl={(
            <button
              type="button"
              data-testid={`${testIdPrefix}-fill-none`}
              aria-label={`Set ${labelPrefix.toLowerCase()} fill none`}
              onClick={() => commitFill("")}
              style={paletteActionButton}
            >
              <span style={{ ...paletteActionSwatch, ...noneFillBackground }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -3,
                    right: -3,
                    top: 8,
                    height: 2,
                    background: "#64748b",
                    transform: "rotate(-35deg)",
                  }}
                />
              </span>
              None
            </button>
          )}
          customControls={(
            <div style={customColorRow}>
              <input
                type="color"
                aria-label={`${labelPrefix} fill color`}
                value={`#${fillPickerColor}`}
                onChange={(e) => {
                  setFillDraft(sanitizeHexColorInput(e.target.value))
                }}
                onBlur={commitFillDraft}
                style={{ width: 28, height: 24, padding: 0, border: "1px solid #e5e7eb", borderRadius: 4, background: "white" }}
              />
              <input
                data-testid={`${testIdPrefix}-fill-input`}
                value={fillDraft}
                placeholder="none"
                maxLength={6}
                onChange={(e) => {
                  const hex = sanitizeHexColorInput(e.target.value)
                  setFillDraft(hex)
                }}
                onBlur={commitFillDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitFillDraft()
                  if (e.key === "Escape") {
                    setFillDraft(fill)
                  }
                }}
                style={input}
              />
            </div>
          )}
        />
      </CollapsibleCard>

      <CollapsibleCard title="Padding" summary={`${paddingSummary} pt`} testId={`${testIdPrefix}-padding-card`}>
        <div
          data-testid={`${testIdPrefix}-padding-compass`}
          style={{
            ...compassGrid,
            gridTemplateAreas: `
              ". top ."
              "left all right"
              ". bottom ."
            `,
          }}
        >
          {renderPaddingInput("top", "top")}
          {renderPaddingInput("left", "left")}
          <label style={{ ...compassField, gridArea: "all" }}>
            <span style={compassControlLabel}>All</span>
            <input
              data-testid={`${testIdPrefix}-padding-all`}
              type="number"
              min={0}
              step={1}
              value={allPaddingValue ?? ""}
              placeholder="mixed"
              onChange={(e) => setAllPadding(e.target.value)}
              style={input}
            />
          </label>
          {renderPaddingInput("right", "right")}
          {renderPaddingInput("bottom", "bottom")}
        </div>
        <button type="button" onClick={() => onUpdateBoxStyle(nodeId, { padding: null })} style={{ ...btn, width: "100%", marginTop: 5 }}>
          Clear padding
        </button>
      </CollapsibleCard>

      <CollapsibleCard title="Border" summary={borderSummary} testId={`${testIdPrefix}-border-card`}>
        <div
          data-testid={`${testIdPrefix}-border-compass`}
          style={{
            ...compassGrid,
            marginBottom: 6,
            gridTemplateAreas: `
              ". top ."
              "left all right"
              ". bottom ."
            `,
          }}
        >
          {renderBorderButton("top", "top")}
          {renderBorderButton("left", "left")}
          <button
            type="button"
            data-testid={`${testIdPrefix}-border-all`}
            aria-label={allBorderActionLabel}
            aria-pressed={allBordersActive}
            title={allBorderActionLabel}
            onClick={() => updateBorderEdges(PARAGRAPH_BOX_EDGES, allBordersActive ? null : makeBorderSide())}
            style={{
              ...compassButton,
              gridArea: "all",
              background: allBordersActive ? "#ccfbf1" : "#f0fdfa",
              borderColor: allBordersActive ? "#5eead4" : "#99f6e4",
            }}
          >
            <BorderGlyph edge="all" active={allBordersActive} clearMark={allBordersActive} />
          </button>
          {renderBorderButton("right", "right")}
          {renderBorderButton("bottom", "bottom")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>Style</span>
            <div data-testid={`${testIdPrefix}-border-style-group`} style={borderStyleGroup}>
              {BOX_BORDER_STYLE_OPTIONS.map(renderBorderStyleButton)}
            </div>
            {borderStyle === "mixed" && <span style={{ fontSize: 9, color: "#9ca3af" }}>mixed sides</span>}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>Width</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 52px", gap: 6, alignItems: "center" }}>
              <input
                data-testid={`${testIdPrefix}-border-width-slider`}
                aria-label="Border width"
                type="range"
                min={0}
                max={BOX_BORDER_WIDTH_MAX}
                step={BOX_BORDER_WIDTH_STEP}
                value={borderWidthDraft}
                onChange={(e) => setBorderWidthDraftValue(e.target.value)}
                onPointerUp={commitBorderWidthDraft}
                onBlur={commitBorderWidthDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBorderWidthDraft()
                  if (e.key === "Escape") {
                    setBorderWidthDraft(borderWidth ?? DEFAULT_BOX_BORDER_WIDTH)
                    setBorderWidthDraftDirty(false)
                  }
                }}
                style={{ width: "100%" }}
              />
              <input
                data-testid={`${testIdPrefix}-border-width`}
                type="number"
                min={0}
                max={BOX_BORDER_WIDTH_MAX}
                step={BOX_BORDER_WIDTH_STEP}
                value={borderWidthDraft}
                placeholder="mixed"
                onChange={(e) => setBorderWidthDraftValue(e.target.value)}
                onBlur={commitBorderWidthDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBorderWidthDraft()
                  if (e.key === "Escape") {
                    setBorderWidthDraft(borderWidth ?? DEFAULT_BOX_BORDER_WIDTH)
                    setBorderWidthDraftDirty(false)
                  }
                }}
                style={input}
              />
            </div>
          </label>
        </div>
        <div
          data-testid={`${testIdPrefix}-border-preview`}
          style={{
            height: 20,
            display: "flex",
            alignItems: "center",
            marginTop: 6,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              width: "100%",
              borderTop: `${borderPreviewWidth}px ${borderPreviewStyle} #${borderPreviewColor}`,
            }}
          />
        </div>
        <ColorPaletteTray
          colors={DOCUMENT_COLOR_PALETTE}
          selectedColor={borderColor}
          displayValue={borderDisplayValue}
          onSelectColor={commitBorderColor}
          testIdPrefix={`${testIdPrefix}-border-color-palette`}
          labelPrefix={`${labelPrefix} border`}
          wellStyle={{ background: `#${borderPreviewColor}` }}
          actionControl={(
            <button
              type="button"
              data-testid={`${testIdPrefix}-border-color-default`}
              aria-label={`Set ${labelPrefix.toLowerCase()} border default color`}
              onClick={() => commitBorderColor(DEFAULT_BOX_BORDER_COLOR)}
              style={paletteActionButton}
            >
              <span style={{ ...paletteActionSwatch, background: `#${DEFAULT_BOX_BORDER_COLOR}` }} />
              Default
            </button>
          )}
          customControls={(
            <div style={customColorRow}>
              <input
                type="color"
                aria-label={`${labelPrefix} border color`}
                value={`#${borderPreviewColor}`}
                onChange={(e) => {
                  const hex = sanitizeHexColorInput(e.target.value)
                  setBorderColorDraft(hex)
                }}
                onBlur={commitBorderColorDraft}
                style={{ width: 28, height: 24, padding: 0, border: "1px solid #e5e7eb", borderRadius: 4, background: "white" }}
              />
              <input
                data-testid={`${testIdPrefix}-border-color`}
                value={borderColorDraft}
                placeholder="mixed"
                maxLength={6}
                onChange={(e) => {
                  const hex = sanitizeHexColorInput(e.target.value)
                  setBorderColorDraft(hex)
                }}
                onBlur={commitBorderColorDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBorderColorDraft()
                  if (e.key === "Escape") {
                    setBorderColorDraft(borderColor ?? "")
                  }
                }}
                style={input}
              />
            </div>
          )}
          swatchWidth={20}
          swatchHeight={18}
        />
        <button type="button" onClick={() => onUpdateBoxStyle(nodeId, { border: null })} style={{ ...btn, width: "100%", marginTop: 5 }}>
          Clear border
        </button>
      </CollapsibleCard>

      <button
        type="button"
        data-testid={`${testIdPrefix}-reset`}
        onClick={() => onUpdateBoxStyle(nodeId, { fill: null, padding: null, border: null })}
        style={{ ...btnDanger, width: "100%" }}
      >
        Reset box style
      </button>
    </section>
  )
}

function FieldReferenceList({
  refs,
  registry,
  onUpdateFieldRef,
}: {
  refs: FieldRefInline[]
  registry: FieldRegistryV1
  onUpdateFieldRef: (fieldRefId: string, changes: FieldRefInlineChanges) => void
}) {
  if (refs.length === 0) return null
  const definitions = new Map(registry.fields.map((field) => [field.key, field]))

  return (
    <div data-testid="property-field-refs" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={label}>Field refs</label>
      {refs.map((fieldRef) => {
        const definition = definitions.get(fieldRef.key)
        const isInlineCompatible = definition && definition.fieldType !== "image" && definition.fieldType !== "collection"
        const status = definition == null ? "missing" : isInlineCompatible ? definition.fieldType : "not inline"
        const statusColor = definition == null || !isInlineCompatible ? "#b45309" : "#047857"
        return (
          <div
            key={fieldRef.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              padding: "6px 7px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: "bold", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fieldRef.label ?? definition?.label ?? fieldRef.key}
              </span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9, color: statusColor }}>
                {status}
              </span>
            </div>
            <div title={fieldRef.key} style={{ fontSize: 9, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              key: {fieldRef.key}
            </div>
            {definition && (
              <div style={{ fontSize: 9, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                type: {definition.fieldType}{definition.required ? " required" : ""}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Label</span>
              <input
                data-testid="field-ref-label-input"
                value={fieldRef.label ?? ""}
                placeholder={definition?.label ?? fieldRef.key}
                onChange={(e) => onUpdateFieldRef(fieldRef.id, { label: optionalTextValue(e.target.value) })}
                style={{ ...input, fontSize: 10, padding: "3px 5px" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 9, color: "#9ca3af" }}>Fallback</span>
              <input
                data-testid="field-ref-fallback-input"
                value={fieldRef.fallback ?? ""}
                placeholder={definition?.fallback ?? ""}
                onChange={(e) => onUpdateFieldRef(fieldRef.id, { fallback: optionalTextValue(e.target.value) })}
                style={{ ...input, fontSize: 10, padding: "3px 5px" }}
              />
            </label>
          </div>
        )
      })}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const label: React.CSSProperties = {
  fontSize: 10, color: "#6b7280", marginBottom: 3, display: "block",
}
const labelWithInfo: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4, marginBottom: 3,
}
const inlineLabel: React.CSSProperties = {
  ...label, marginBottom: 0,
}
const input: React.CSSProperties = {
  width: "100%", fontSize: 11, border: "1px solid #e5e7eb",
  borderRadius: 4, padding: "4px 6px", boxSizing: "border-box",
  fontFamily: "monospace",
}
const btn: React.CSSProperties = {
  flex: 1, padding: "5px 0", fontSize: 10, cursor: "pointer",
  border: "1px solid #e5e7eb", borderRadius: 4,
  background: "#fafafa", color: "#374151",
}
const btnDanger: React.CSSProperties = {
  ...btn, border: "1px solid #fca5a5", background: "#fff5f5", color: "#ef4444",
}
const colorInput: React.CSSProperties = {
  width: 30,
  height: 26,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  padding: 1,
  background: "#fff",
  cursor: "pointer",
}
const colorControlRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 1fr 58px",
  gap: 6,
  alignItems: "center",
}
const colorWellButton: React.CSSProperties = {
  width: 28,
  height: 24,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  padding: 0,
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}
const colorValueLabel: React.CSSProperties = {
  minWidth: 0,
  height: 24,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "4px 7px",
  boxSizing: "border-box",
  fontFamily: "monospace",
  fontSize: 11,
  color: "#6b7280",
  background: "#fff",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}
const colorMoreButton: React.CSSProperties = {
  ...btn,
  flex: "0 0 auto",
  height: 24,
  padding: "2px 0",
}
const colorTray: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 5,
  padding: 6,
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  gap: 6,
}
const colorTrayHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
}
const colorTrayCloseButton: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 9,
  padding: 0,
}
const paletteActionButton: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 6px",
  fontSize: 10,
  alignSelf: "flex-start",
}
const paletteActionSwatch: React.CSSProperties = {
  width: 18,
  height: 16,
  border: "1px solid #d1d5db",
  borderRadius: 3,
  position: "relative",
  overflow: "hidden",
  flexShrink: 0,
}
const colorTrayCustom: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  paddingTop: 6,
}
const customColorRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 1fr",
  gap: 6,
  alignItems: "center",
}
const customColorHint: React.CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
}
const noneFillBackground: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage: "repeating-conic-gradient(#f8fafc 0% 25%, #ffffff 0% 50%)",
  backgroundSize: "8px 8px",
}
const colorPaletteGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, min-content)",
  gap: 4,
  padding: 5,
  border: "1px solid #e5e7eb",
  borderRadius: 5,
  background: "#fff",
}
const sectionBox: React.CSSProperties = {
  border: "none",
  borderRadius: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "transparent",
}
const collapsibleCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 5,
  overflow: "hidden",
  background: "#fff",
}
const collapsibleCardHeader: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  padding: "5px 7px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "monospace",
  textAlign: "left",
}
const collapsibleCardBody: React.CSSProperties = {
  padding: 6,
  background: "white",
}
const panelTabList: React.CSSProperties = {
  flexShrink: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
  gap: 0,
  padding: "0 12px",
  background: "white",
  borderBottom: "1px solid #e5e7eb",
}
const panelTabButton: React.CSSProperties = {
  border: "none",
  borderBottom: "2px solid transparent",
  borderRadius: 0,
  padding: "9px 0 7px",
  fontSize: 11,
  cursor: "pointer",
}
const paragraphTabPanel: React.CSSProperties = {
  flexDirection: "column",
  gap: 12,
}
const compassGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 54px 1fr",
  gap: 4,
  alignItems: "end",
}
const compassField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
}
const compassControlLabel: React.CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
  textAlign: "center",
}
const compassButton: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "#fafafa",
  color: "#374151",
  cursor: "pointer",
  width: 28,
  height: 28,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  justifySelf: "center",
  alignSelf: "center",
}
const borderStyleGroup: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 4,
}
const borderStyleButton: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  height: 28,
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}
const borderStyleIconBox: React.CSSProperties = {
  width: 26,
  height: 18,
  position: "relative",
  display: "block",
}
const borderStyleIconLine: React.CSSProperties = {
  position: "absolute",
  left: 3,
  right: 3,
  top: 8,
  height: 0,
}
const dividerSpacingPreview: React.CSSProperties = {
  minHeight: 58,
  display: "grid",
  gridTemplateRows: "1fr auto 1fr",
  alignItems: "center",
  justifyItems: "center",
  padding: "6px 8px",
  marginBottom: 8,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "#f8fafc",
  color: "#64748b",
  boxSizing: "border-box",
}
const dividerSpacingLabel: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.2,
  color: "#64748b",
}

function normalizeHeaderRowCount(rowCount: number, value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(rowCount, Math.max(0, Math.trunc(value)))
}

function headerRowCountChanges(value: number): Record<string, unknown> {
  return { headerRowCount: value > 0 ? value : undefined }
}

type FlowTableAlign = NonNullable<FlowTableNode["props"]["align"]>

function unitValueToPtNumber(value: UnitValue | undefined): number {
  if (!value) return 0
  return value.unit === "mm" ? value.value * 72 / 25.4 : value.value
}

function flowTableMarginChange(key: "marginTop" | "marginBottom", value: number): Record<string, unknown> {
  const next = Math.max(0, Number.isFinite(value) ? value : 0)
  return { [key]: next > 0 ? pt(next) : undefined }
}

function TableLayoutControl({
  tableId,
  table,
  onUpdateProps,
  onFitToWidth,
}: {
  tableId: string
  table: FlowTableNode
  onUpdateProps: Props["onUpdateProps"]
  onFitToWidth?: (tableId: string) => void
}) {
  const currentAlign: FlowTableAlign = table.props.align ?? "left"
  const totalWidth = table.columns.reduce((sum, column) => sum + unitValueToPtNumber(column.width), 0)
  return (
    <div data-testid="flow-table-layout-control" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div>
        <div style={labelWithInfo}>
          <label style={inlineLabel}>Table width</label>
          <InfoHint text="Fit to width rewrites authored column widths to the current section content width. Manual column resize remains the source of truth after fitting." />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
          <input
            type="text"
            readOnly
            value={`${Math.round(totalWidth * 100) / 100} pt`}
            style={{ ...input, background: "#f9fafb", color: "#6b7280" }}
            aria-label="Authored table width"
          />
          <button
            type="button"
            data-testid="flow-table-fit-width"
            style={{ ...btn, whiteSpace: "nowrap", opacity: onFitToWidth ? 1 : 0.45 }}
            disabled={!onFitToWidth}
            onClick={() => onFitToWidth?.(tableId)}
          >
            Fit
          </button>
        </div>
      </div>
      <div>
        <label style={label}>Align</label>
        <div data-testid="flow-table-align-control" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {(["left", "center", "right"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`flow-table-align-${value}`}
              onClick={() => onUpdateProps(tableId, { align: value === "left" ? undefined : value })}
              style={{
                ...btn,
                background: currentAlign === value ? "#dbeafe" : "#fafafa",
                color: currentAlign === value ? "#1d4ed8" : "#6b7280",
                fontWeight: currentAlign === value ? "bold" : "normal",
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={label}>Margin (pt)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#6b7280" }}>
            Top
            <input
              data-testid="flow-table-margin-top"
              type="number"
              min={0}
              step={1}
              value={Math.round(unitValueToPtNumber(table.props.marginTop) * 100) / 100}
              onChange={(e) => onUpdateProps(tableId, flowTableMarginChange("marginTop", Number(e.target.value)))}
              style={input}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#6b7280" }}>
            Bottom
            <input
              data-testid="flow-table-margin-bottom"
              type="number"
              min={0}
              step={1}
              value={Math.round(unitValueToPtNumber(table.props.marginBottom) * 100) / 100}
              onChange={(e) => onUpdateProps(tableId, flowTableMarginChange("marginBottom", Number(e.target.value)))}
              style={input}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function TableHeaderRowsControl({
  tableId,
  rowCount,
  headerRowCount,
  repeatHeaderRows,
  selectedRowIndex,
  testId,
  onUpdateProps,
}: {
  tableId: string
  rowCount: number
  headerRowCount: number
  repeatHeaderRows: boolean
  selectedRowIndex?: number
  testId: string
  onUpdateProps: (nodeId: string, changes: Record<string, unknown>) => void
}) {
  const safeHeaderRowCount = normalizeHeaderRowCount(rowCount, headerRowCount)
  const selectedThroughRowCount = selectedRowIndex == null
    ? null
    : normalizeHeaderRowCount(rowCount, selectedRowIndex + 1)
  const updateHeaderRows = (value: number) => {
    const next = normalizeHeaderRowCount(rowCount, value)
    onUpdateProps(tableId, headerRowCountChanges(next))
  }

  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={labelWithInfo}>
        <label style={inlineLabel}>Header rows</label>
        <InfoHint text="The first N authored rows are table headers. Repeating them on continuation pages is controlled separately." />
      </div>
      <input
        data-testid={`${testId}-input`}
        type="number"
        min={0}
        max={rowCount}
        value={safeHeaderRowCount}
        onChange={(e) => updateHeaderRows(Number(e.target.value) || 0)}
        style={input}
      />
      {selectedThroughRowCount == null && rowCount > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            data-testid={`${testId}-first-row`}
            style={{ ...btn, opacity: safeHeaderRowCount === 1 ? 0.55 : 1 }}
            disabled={safeHeaderRowCount === 1}
            onClick={() => updateHeaderRows(1)}
          >
            First row
          </button>
          <button
            data-testid={`${testId}-clear`}
            style={{ ...btn, opacity: safeHeaderRowCount > 0 ? 1 : 0.4 }}
            disabled={safeHeaderRowCount <= 0}
            onClick={() => updateHeaderRows(0)}
          >
            Clear
          </button>
        </div>
      )}
      {selectedThroughRowCount != null && (
        <div style={{ display: "flex", gap: 4 }}>
          <button
            data-testid={`${testId}-through-row`}
            style={{ ...btn, opacity: safeHeaderRowCount === selectedThroughRowCount ? 0.55 : 1 }}
            disabled={safeHeaderRowCount === selectedThroughRowCount}
            onClick={() => updateHeaderRows(selectedThroughRowCount)}
          >
            Header through row {selectedThroughRowCount}
          </button>
          <button
            data-testid={`${testId}-clear`}
            style={{ ...btn, opacity: safeHeaderRowCount > 0 ? 1 : 0.4 }}
            disabled={safeHeaderRowCount <= 0}
            onClick={() => updateHeaderRows(0)}
          >
            Clear
          </button>
        </div>
      )}
      <label style={{ ...label, display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}>
        <input
          data-testid={`${testId}-repeat`}
          type="checkbox"
          checked={repeatHeaderRows}
          disabled={safeHeaderRowCount <= 0}
          onChange={(e) => onUpdateProps(tableId, { repeatHeaderRows: e.target.checked })}
        />
        Repeat header on new pages
      </label>
    </div>
  )
}

// ─── PropertyPanel ────────────────────────────────────────────────────────────

export function PropertyPanel({ doc, registry, selectedNodeId, selectionAnchorNodeId, onUpdateProps, onUpdateText, onUpdateParagraphTextStyle, onApplyParagraphStylePreset, onUpdateParagraphStyleBoxOverrides, onUpdateParagraphStyleOverrides, onClearParagraphStyle, onDetachParagraphStyle, onResetParagraphStyleOverrides, onUpdateFieldRef, onUpdateParagraphBoxStyle, onUpdateFlowStackBoxStyle, onUpdateFlowTableCellSpan, onSelectNode, onSelectContextNode, onSelectListGroup, onSelectStyleResource, onDelete, tableOps, flowRowOps }: Props) {
  const [contextOpen, setContextOpen] = useState(false)
  const [paragraphPanelTab, setParagraphPanelTab] = useState<ParagraphPanelTab>("text")
  const [flowContainerPanelTab, setFlowContainerPanelTab] = useState<FlowContainerPanelTab>("layout")
  const [flowResizeSide, setFlowResizeSide] = useState<"left" | "right" | null>(null)
  const [flowResizeDraft, setFlowResizeDraft] = useState<{ nodeId: string; side: "left" | "right"; selectedShare: number } | null>(null)
  const selectionContext = useMemo(
    () => buildSelectionContext(doc, selectionAnchorNodeId ?? selectedNodeId),
    [doc, selectedNodeId, selectionAnchorNodeId],
  )

  useEffect(() => {
    setContextOpen(false)
    setParagraphPanelTab("text")
    setFlowContainerPanelTab("layout")
    setFlowResizeSide(null)
    setFlowResizeDraft(null)
  }, [selectedNodeId])

  if (!selectedNodeId) {
    return (
      <div style={{ background: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0" }}>
        <span style={{ fontSize: 11, color: "#d1d5db" }}>select a block</span>
      </div>
    )
  }

  const node = findNode(doc, selectedNodeId)
  if (!node) return null

  const canDelete = isTopLevel(doc, selectedNodeId)
  const hasSelectionContext = selectionContext.length > 1
  const hasFlowContainerTabs = node.type === "flow-row" || node.type === "flow-stack"
  const renderParagraphTabButton = (tab: ParagraphPanelTab, labelText: string) => {
    const active = paragraphPanelTab === tab
    return (
      <button
        key={tab}
        type="button"
        role="tab"
        id={`paragraph-panel-tab-${tab}`}
        data-testid={`paragraph-panel-tab-${tab}`}
        aria-selected={active}
        aria-controls={`paragraph-panel-${tab}`}
        onClick={() => setParagraphPanelTab(tab)}
        style={{
          ...panelTabButton,
          background: "transparent",
          borderBottomColor: active ? "#2563eb" : "transparent",
          color: active ? "#1d4ed8" : "#475569",
          fontWeight: active ? 700 : 500,
        }}
      >
        {labelText}
      </button>
    )
  }
  const renderFlowContainerTabButton = (tab: FlowContainerPanelTab, labelText: string) => {
    const active = flowContainerPanelTab === tab
    return (
      <button
        key={tab}
        type="button"
        role="tab"
        id={`${node.type}-panel-tab-${tab}`}
        data-testid={`${node.type}-panel-tab-${tab}`}
        aria-selected={active}
        aria-controls={`${node.type}-panel-${tab}`}
        onClick={() => setFlowContainerPanelTab(tab)}
        style={{
          ...panelTabButton,
          background: "transparent",
          borderBottomColor: active ? "#2563eb" : "transparent",
          color: active ? "#1d4ed8" : "#475569",
          fontWeight: active ? 700 : 500,
        }}
      >
        {labelText}
      </button>
    )
  }

  return (
    <div style={{ ...rightRailPanelShell, overflow: "hidden" }}>
      <RightRailPanelHeader
        title={displayNodeType(node.type)}
        testId="property-panel-title"
        action={hasSelectionContext ? (
          <>
            <button
              type="button"
              data-testid="selection-context-button"
              aria-expanded={contextOpen}
              title="Show selection context"
              onClick={() => setContextOpen((value) => !value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 4,
                background: contextOpen ? "#eef2ff" : "white",
                color: "#4b5563",
                cursor: "pointer",
                fontSize: 9,
                fontWeight: 700,
                lineHeight: "16px",
                padding: "0 6px",
                textTransform: "none",
                letterSpacing: 0,
                flexShrink: 0,
              }}
            >
              path
            </button>
            {contextOpen && (
              <div
                data-testid="selection-context-menu"
                role="listbox"
                style={{
                  position: "absolute",
                  top: 30,
                  right: 8,
                  zIndex: 20,
                  width: 178,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  background: "white",
                  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
                  padding: 4,
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                <div style={{ padding: "4px 6px", fontSize: 9, color: "#9ca3af", fontWeight: 700 }}>
                  Selected context
                </div>
                {selectionContext.map((item) => {
                  const active = item.nodeId === selectedNodeId
                  return (
                    <button
                      key={item.nodeId}
                      type="button"
                      data-testid="selection-context-item"
                      data-node-id={item.nodeId}
                      data-node-type={item.type}
                      aria-selected={active}
                      onClick={() => {
                        setContextOpen(false)
                        onSelectContextNode(item.nodeId)
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: 4,
                        background: active ? "#dbeafe" : "transparent",
                        color: active ? "#1d4ed8" : "#374151",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "5px 6px",
                        fontSize: 11,
                        textAlign: "left",
                      }}
                    >
                      <span>{item.label}</span>
                      {active && <span style={{ fontSize: 9, color: "#2563eb" }}>active</span>}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setContextOpen(false)}
                  style={{
                    width: "100%",
                    marginTop: 2,
                    border: "none",
                    borderTop: "1px solid #f3f4f6",
                    background: "transparent",
                    color: "#6b7280",
                    cursor: "pointer",
                    padding: "5px 6px 3px",
                    fontSize: 10,
                    textAlign: "left",
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </>
        ) : undefined}
      />
      {node.type === "paragraph" && (
        <div role="tablist" aria-label="Paragraph properties" data-testid="paragraph-panel-tabs" style={panelTabList}>
          {renderParagraphTabButton("text", "Text")}
          {renderParagraphTabButton("box", "Box")}
          {renderParagraphTabButton("style", "Style")}
        </div>
      )}
      {hasFlowContainerTabs && (
        <div role="tablist" aria-label={`${node.type} properties`} data-testid={`${node.type}-panel-tabs`} style={panelTabList}>
          {renderFlowContainerTabButton("layout", "Layout")}
          {renderFlowContainerTabButton("box", "Box")}
        </div>
      )}

      {/* Fields */}
      <div style={{ ...rightRailPanelBody, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Paragraph ── */}
        {node.type === "paragraph" && (() => {
          const text = getParagraphText(node)
          const canEditText = isTextRunOnlyParagraph(node)
          const fieldRefs = getParagraphFieldRefs(node)
          const effectiveNode: ParagraphNode = {
            ...node,
            props: resolveStyledParagraphProps(doc.document.styles, node),
          }
          const effectiveProps = effectiveNode.props
          const textStyleState = getTextRunStyleRangeState(effectiveNode, 0, text.length)
          const usesStyleOverrideLayer = Boolean(node.props.paragraphStyleId || node.props.styleOverrides)
          const updateParagraphWideStyle = (changes: ParagraphStyleProperties) => {
            if (usesStyleOverrideLayer && onUpdateParagraphStyleOverrides) {
              onUpdateParagraphStyleOverrides(selectedNodeId, changes)
              return
            }
            onUpdateProps(selectedNodeId, changes as Record<string, unknown>)
          }
          const updateTextStyle = (changes: ParagraphTextStyleChanges) => {
            if (usesStyleOverrideLayer && onUpdateParagraphStyleOverrides) {
              onUpdateParagraphStyleOverrides(selectedNodeId, changes as ParagraphStyleProperties)
              return
            }
            if (onUpdateParagraphTextStyle) onUpdateParagraphTextStyle(selectedNodeId, changes)
            else onUpdateProps(selectedNodeId, { ...changes })
          }
          const updateHeadingLevel = (level: 1 | 2 | 3 | undefined) => {
            if (usesStyleOverrideLayer && onUpdateParagraphStyleOverrides) {
              onUpdateParagraphStyleOverrides(selectedNodeId, { headingLevel: level ?? null })
              return
            }
            onUpdateProps(selectedNodeId, { headingLevel: level })
          }
          const fontFamilyMixed = textStyleState?.fontFamilyKey.mixed === true
          const fontSizeMixed = textStyleState?.fontSize.mixed === true
          const textColorMixed = textStyleState?.textColor.mixed === true
          const fontWeightMixed = textStyleState?.fontWeight.mixed === true
          const fontStyleMixed = textStyleState?.fontStyle.mixed === true
          const textDecorationMixed = textStyleState?.textDecoration.mixed === true
          const strikethroughMixed = textStyleState?.strikethrough.mixed === true
          const currentFontKey = resolveFontEntry(
            fontFamilyMixed
              ? effectiveProps.fontFamilyKey ?? DEFAULT_FONT_KEY
              : textStyleState?.fontFamilyKey.value ?? effectiveProps.fontFamilyKey ?? DEFAULT_FONT_KEY,
          ).key
          const currentFont = resolveFontEntry(currentFontKey)
          const fontWeight = fontWeightMixed ? "normal" : textStyleState?.fontWeight.value ?? effectiveProps.fontWeight ?? "normal"
          const fontStyle = fontStyleMixed ? "normal" : textStyleState?.fontStyle.value ?? effectiveProps.fontStyle ?? "normal"
          const textDecoration = textDecorationMixed ? "none" : textStyleState?.textDecoration.value ?? effectiveProps.textDecoration ?? "none"
          const strikethrough = strikethroughMixed ? false : textStyleState?.strikethrough.value ?? effectiveProps.strikethrough ?? false
          const rawTextColor = textColorMixed ? effectiveProps.textColor ?? "000000" : textStyleState?.textColor.value ?? effectiveProps.textColor ?? "000000"
          const textColor = sanitizeHexColorInput(rawTextColor) || "000000"
          const fontSizeValue = fontSizeMixed
            ? ""
            : String(textStyleState?.fontSize.value.value ?? effectiveProps.fontSize.value)
          const hasBoldVariant = Boolean(currentFont.variants.bold || currentFont.variants.boldItalic)
          const hasItalicVariant = Boolean(currentFont.variants.italic || currentFont.variants.boldItalic)
          const textStyleOptions = [
            {
              key: "bold",
              label: "B",
              active: !fontWeightMixed && fontWeight === "bold",
              disabled: !hasBoldVariant && fontWeight !== "bold",
              title: fontWeightMixed ? "Bold (mixed)" : hasBoldVariant ? "Bold" : "Bold variant is unavailable for this font",
              style: { fontWeight: 800 },
              changes: { fontWeight: fontWeightMixed ? "bold" : fontWeight === "bold" ? "normal" : "bold" },
            },
            {
              key: "italic",
              label: "I",
              active: !fontStyleMixed && fontStyle === "italic",
              disabled: !hasItalicVariant && fontStyle !== "italic",
              title: fontStyleMixed ? "Italic (mixed)" : hasItalicVariant ? "Italic" : "Italic variant is unavailable for this font",
              style: { fontStyle: "italic" },
              changes: { fontStyle: fontStyleMixed ? "italic" : fontStyle === "italic" ? "normal" : "italic" },
            },
            {
              key: "underline",
              label: "U",
              active: !textDecorationMixed && textDecoration === "underline",
              disabled: false,
              title: textDecorationMixed ? "Underline (mixed)" : "Underline",
              style: { textDecoration: "underline" },
              changes: { textDecoration: textDecorationMixed ? "underline" : textDecoration === "underline" ? "none" : "underline" },
            },
            {
              key: "strikethrough",
              label: "S",
              active: !strikethroughMixed && strikethrough,
              disabled: false,
              title: strikethroughMixed ? "Strikethrough (mixed)" : "Strikethrough",
              style: { textDecoration: "line-through" },
              changes: { strikethrough: strikethroughMixed ? true : !strikethrough },
            },
          ] as const
          const currentStyleId = node.props.paragraphStyleId ?? ""
          const currentStyle = currentStyleId ? doc.document.styles?.paragraphStyles?.[currentStyleId] : undefined
          const currentPresetStyleId = (FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS as readonly string[]).includes(currentStyleId)
            ? currentStyleId
            : ""
          const currentStyleLabel = currentStyle ? currentStyle.name ?? currentStyle.id : currentStyleId || "None"
          const styleOverrideKeys = Object.keys(node.props.styleOverrides ?? {})
          const listContext = resolveParagraphListContext(doc, selectedNodeId)
          return (
            <>
              <section
                id="paragraph-panel-text"
                role="tabpanel"
                aria-labelledby="paragraph-panel-tab-text"
                data-testid="paragraph-panel-text"
                hidden={paragraphPanelTab !== "text"}
                style={{ ...paragraphTabPanel, display: paragraphPanelTab === "text" ? "flex" : "none" }}
              >
                <div>
                  <label style={label}>Text</label>
                  <textarea
                    value={text}
                    rows={4}
                    readOnly={!canEditText}
                    onChange={(e) => {
                      if (canEditText) onUpdateText(selectedNodeId, e.target.value)
                    }}
                    style={{
                      ...input,
                      resize: "vertical",
                      background: canEditText ? input.background : "#f9fafb",
                      color: canEditText ? input.color : "#9ca3af",
                    }}
                  />
                </div>
                <FieldReferenceList refs={fieldRefs} registry={registry} onUpdateFieldRef={onUpdateFieldRef} />
                <div>
                  <label style={label}>Font</label>
                  <FontFamilyCombobox
                    value={currentFontKey}
                    options={PARAGRAPH_FONT_OPTIONS}
                    onChange={(fontFamilyKey) => updateTextStyle({ fontFamilyKey })}
                    testId="paragraph-font-family"
                  />
                  {fontFamilyMixed && <div style={{ marginTop: 4, fontSize: 9, color: "#9ca3af" }}>mixed</div>}
                </div>
                <div>
                  <label style={label}>Style</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {textStyleOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        data-testid={`paragraph-style-${option.key}`}
                        aria-pressed={option.active}
                        disabled={option.disabled}
                        title={option.title}
                        onClick={() => {
                          if (!option.disabled) updateTextStyle(option.changes)
                        }}
                        style={{
                          ...btn,
                          ...option.style,
                          background: option.active ? "#dbeafe" : option.disabled ? "#f9fafb" : "#fafafa",
                          color: option.active ? "#1d4ed8" : option.disabled ? "#d1d5db" : "#374151",
                          cursor: option.disabled ? "not-allowed" : "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={label}>Text color</label>
                  <ColorPaletteTray
                    colors={DOCUMENT_COLOR_PALETTE}
                    selectedColor={textColor}
                    displayValue={textColorMixed ? "Mixed" : textColor === "000000" ? "Default" : `#${textColor}`}
                    onSelectColor={(color) => updateTextStyle({ textColor: color })}
                    testIdPrefix="paragraph-text-color-palette"
                    labelPrefix="Text"
                    wellStyle={{ background: textColor === "000000" ? "#fff" : `#${textColor}` }}
                    wellContent={textColor === "000000" ? (
                      <span style={{ color: "#111827", fontSize: 11, fontWeight: 700 }}>A</span>
                    ) : undefined}
                    actionControl={(
                      <button
                        type="button"
                        aria-label="Default text color"
                        data-testid="paragraph-text-color-default"
                        onClick={() => updateTextStyle({ textColor: "000000" })}
                        style={paletteActionButton}
                      >
                        <span style={{ ...paletteActionSwatch, background: "#fff", color: "#111827", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>A</span>
                        Default
                      </button>
                    )}
                    customControls={(
                      <div style={{ ...customColorRow, gridTemplateColumns: "28px 1fr" }}>
                        <input
                          type="color"
                          aria-label="Text color"
                          value={`#${textColor}`}
                          onChange={(e) => updateTextStyle({ textColor: sanitizeHexColorInput(e.target.value) })}
                          style={{ ...colorInput, flex: "0 0 auto" }}
                        />
                        <span style={customColorHint}>Custom color</span>
                      </div>
                    )}
                    swatchWidth={22}
                    swatchHeight={22}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Font size (pt)</label>
                    <input type="number" min={4} max={200}
                      value={fontSizeValue}
                      placeholder={fontSizeMixed ? "mixed" : undefined}
                      onChange={(e) => updateTextStyle({ fontSize: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Line height</label>
                    <input type="number" min={0.5} max={5} step={0.1}
                      value={effectiveProps.lineHeight}
                      onChange={(e) => updateParagraphWideStyle({ lineHeight: Number(e.target.value) })}
                      style={input} />
                  </div>
                </div>
                <div>
                  <label style={label}>Align</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["left", "center", "right", "justify"] as const).map((a) => (
                      <button key={a} onClick={() => updateParagraphWideStyle({ align: a })}
                        style={{ flex: 1, padding: "4px 0", fontSize: 10, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: effectiveProps.align === a ? "#dbeafe" : "#fafafa", color: effectiveProps.align === a ? "#1d4ed8" : "#6b7280", fontWeight: effectiveProps.align === a ? "bold" : "normal" }}>
                        {a === "left" ? "L" : a === "center" ? "C" : a === "right" ? "R" : "J"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Space before</label>
                    <input type="number" min={0}
                      value={effectiveProps.spacingBefore.value}
                      onChange={(e) => updateParagraphWideStyle({ spacingBefore: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Space after</label>
                    <input type="number" min={0}
                      value={effectiveProps.spacingAfter.value}
                      onChange={(e) => updateParagraphWideStyle({ spacingAfter: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                </div>

                <div>
                  <label style={label}>Heading level</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([undefined, 1, 2, 3] as const).map((lvl) => {
                      const active = (effectiveProps.headingLevel ?? undefined) === lvl
                      return (
                        <button key={String(lvl)} onClick={() => updateHeadingLevel(lvl)}
                          style={{ flex: 1, padding: "4px 0", fontSize: 10, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: active ? "#dbeafe" : "#fafafa", color: active ? "#1d4ed8" : "#6b7280", fontWeight: active ? "bold" : "normal" }}>
                          {lvl === undefined ? "—" : `H${lvl}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>
              <section
                id="paragraph-panel-box"
                role="tabpanel"
                aria-labelledby="paragraph-panel-tab-box"
                data-testid="paragraph-panel-box"
                hidden={paragraphPanelTab !== "box"}
                style={{ ...paragraphTabPanel, display: paragraphPanelTab === "box" ? "flex" : "none" }}
              >
                <BoxControls
                  nodeId={selectedNodeId}
                  box={effectiveProps.box}
                  onUpdateBoxStyle={usesStyleOverrideLayer && onUpdateParagraphStyleBoxOverrides
                    ? onUpdateParagraphStyleBoxOverrides
                    : onUpdateParagraphBoxStyle}
                />
              </section>
              <section
                id="paragraph-panel-style"
                role="tabpanel"
                aria-labelledby="paragraph-panel-tab-style"
                data-testid="paragraph-panel-style"
                hidden={paragraphPanelTab !== "style"}
                style={{ ...paragraphTabPanel, display: paragraphPanelTab === "style" ? "flex" : "none" }}
              >
                <div>
                  <label style={label}>Preset</label>
                  <select
                    data-testid="paragraph-style-preset"
                    value={currentPresetStyleId}
                    disabled={!onApplyParagraphStylePreset}
                    onChange={(e) => {
                      const styleId = e.target.value
                      if (!styleId) {
                        onClearParagraphStyle?.(selectedNodeId)
                        return
                      }
                      onApplyParagraphStylePreset?.(selectedNodeId, styleId as FlowDocParagraphStylePresetId)
                    }}
                    style={input}
                  >
                    <option value="">None</option>
                    {PARAGRAPH_STYLE_PRESET_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={label}>Current</label>
                  <div data-testid="paragraph-style-current" style={{ fontSize: 11, color: "#334155", lineHeight: 1.4, wordBreak: "break-word" }}>
                    {currentStyleLabel}
                  </div>
                </div>
                <div data-testid="paragraph-list-context">
                  <label style={label}>List</label>
                  {listContext ? (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, background: "#f8fafc", padding: 8, display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "#334155", lineHeight: 1.35 }}>
                      <div data-testid="paragraph-list-context-group" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>Group</span>
                        <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listContext.groupLabel}</strong>
                      </div>
                      <div data-testid="paragraph-list-context-style" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>Style</span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listContext.styleLabel}</span>
                      </div>
                      <div data-testid="paragraph-list-context-marker" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>Number</span>
                        <span>{listContext.markerText ?? "-"}</span>
                      </div>
                      <div data-testid="paragraph-list-context-level" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>Level</span>
                        <span>{listContext.userLevel}</span>
                      </div>
                      <div data-testid="paragraph-list-context-count" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>Items</span>
                        <span>{listContext.itemCount}</span>
                      </div>
                      {(onSelectListGroup || onSelectStyleResource) && (
                        <div style={{ display: "grid", gridTemplateColumns: onSelectStyleResource ? "1fr 1fr" : "1fr", gap: 6, marginTop: 3 }}>
                          <button
                            type="button"
                            data-testid="paragraph-list-context-select-group"
                            onClick={() => {
                              if (onSelectListGroup) onSelectListGroup(listContext.instanceId)
                              else onSelectStyleResource?.({ kind: "list-group", id: listContext.instanceId })
                            }}
                            style={btn}
                          >
                            Select group
                          </button>
                          {onSelectStyleResource && (
                            <button
                              type="button"
                              data-testid="paragraph-list-context-edit-style"
                              onClick={() => onSelectStyleResource({ kind: "list-style", id: listContext.styleId })}
                              style={btn}
                            >
                              Edit style
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div data-testid="paragraph-list-context-empty" style={{ fontSize: 11, color: "#9ca3af" }}>No list</div>
                  )}
                </div>
                <div>
                  <label style={label}>Overrides</label>
                  <div data-testid="paragraph-style-overrides" style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 22, alignItems: "center" }}>
                    {styleOverrideKeys.length > 0 ? styleOverrideKeys.map((key) => (
                      <span
                        key={key}
                        style={{
                          border: "1px solid #dbeafe",
                          borderRadius: 4,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 9,
                          padding: "2px 5px",
                        }}
                      >
                        {key}
                      </span>
                    )) : (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>None</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <button
                    type="button"
                    data-testid="paragraph-style-clear"
                    disabled={!onClearParagraphStyle || (!currentStyleId && styleOverrideKeys.length === 0)}
                    onClick={() => onClearParagraphStyle?.(selectedNodeId)}
                    style={{ ...btn, opacity: (!currentStyleId && styleOverrideKeys.length === 0) ? 0.55 : 1 }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    data-testid="paragraph-style-detach"
                    disabled={!onDetachParagraphStyle || (!currentStyleId && styleOverrideKeys.length === 0)}
                    onClick={() => onDetachParagraphStyle?.(selectedNodeId)}
                    style={{ ...btn, opacity: (!currentStyleId && styleOverrideKeys.length === 0) ? 0.55 : 1 }}
                  >
                    Detach
                  </button>
                  <button
                    type="button"
                    data-testid="paragraph-style-reset-overrides"
                    disabled={!onResetParagraphStyleOverrides || styleOverrideKeys.length === 0}
                    onClick={() => onResetParagraphStyleOverrides?.(selectedNodeId)}
                    style={{ ...btn, opacity: styleOverrideKeys.length === 0 ? 0.55 : 1 }}
                  >
                    Reset
                  </button>
                </div>
              </section>
            </>
          )
        })()}

        {/* ── Spacer ── */}
        {node.type === "spacer" && (
          <div>
            <label style={label}>Height (pt)</label>
            <input type="number" min={1}
              value={node.props.height}
              onChange={(e) => onUpdateProps(selectedNodeId, { height: Number(e.target.value) })}
              style={input} />
          </div>
        )}

        {/* ── Divider ── */}
        {node.type === "divider" && (
          <>
            <DividerControls node={node} onUpdateProps={onUpdateProps} />
          </>
        )}

        {/* ── Page break ── */}
        {node.type === "page-break" && (
          <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
            Following body content starts on the next page.
          </div>
        )}

        {/* ── Row ── */}
        {node.type === "row" && (
          <>
            <div>
              <label style={label}>Gap (pt)</label>
              <input type="number" min={0}
                value={node.props.gap ?? 0}
                onChange={(e) => onUpdateProps(selectedNodeId, { gap: Number(e.target.value) })}
                style={input} />
            </div>
            <div>
              <div style={labelWithInfo}>
                <label style={inlineLabel}>Min height (pt)</label>
                <InfoHint text="0 keeps the row auto-sized; authored content remains the practical minimum height." />
              </div>
              <input type="number" min={0} step={1}
                value={node.props.minHeight ?? 0}
                onChange={(e) => {
                  const height = Math.max(0, Number(e.target.value))
                  onUpdateProps(selectedNodeId, { minHeight: height > 0 ? height : undefined })
                }}
                style={input} />
            </div>
          </>
        )}

        {/* ── Flow Row ── */}
        {node.type === "flow-row" && (
          <>
            <section
              id="flow-row-panel-layout"
              role="tabpanel"
              aria-labelledby="flow-row-panel-tab-layout"
              data-testid="flow-row-panel-layout"
              hidden={flowContainerPanelTab !== "layout"}
              style={{ ...paragraphTabPanel, display: flowContainerPanelTab === "layout" ? "flex" : "none" }}
            >
              <div style={{ fontSize: 11, color: "#6b7280" }}>{node.childIds.length} cols</div>
              <div>
                <div style={labelWithInfo}>
                  <label style={inlineLabel}>Columns</label>
                  <InfoHint text="Adds one empty column and rebalances all column widths equally. Use a selected flow-stack edge button to insert before or after a specific column." />
                </div>
                <button style={btn} onClick={() => flowRowOps.addCol(selectedNodeId)}>+ Balanced col</button>
              </div>
              <div>
                <label style={label}>Gap (pt)</label>
                <input type="number" min={0}
                  value={node.props.gap ?? 0}
                  onChange={(e) => onUpdateProps(selectedNodeId, { gap: Math.max(0, Number(e.target.value) || 0) })}
                  style={input} />
              </div>
              <div>
                <div style={labelWithInfo}>
                  <label style={inlineLabel}>Min height (pt)</label>
                  <InfoHint text="0 keeps the flow-row auto-sized. In the current flow-row model, min height applies to the first slice only." />
                </div>
                <input type="number" min={0} step={1}
                  value={node.props.minHeight ?? 0}
                  onChange={(e) => {
                    const height = Math.max(0, Number(e.target.value) || 0)
                    onUpdateProps(selectedNodeId, { minHeight: height > 0 ? height : undefined })
                  }}
                  style={input} />
              </div>
            </section>
            <section
              id="flow-row-panel-box"
              role="tabpanel"
              aria-labelledby="flow-row-panel-tab-box"
              data-testid="flow-row-panel-box"
              hidden={flowContainerPanelTab !== "box"}
              style={{ ...paragraphTabPanel, display: flowContainerPanelTab === "box" ? "flex" : "none" }}
            >
            </section>
          </>
        )}

        {/* ── Stack ── */}
        {node.type === "stack" && (
          <div>
            <div style={labelWithInfo}>
              <label style={inlineLabel}>Width share (%)</label>
              <InfoHint text="Old stack resize is still handled by canvas resize interactions; property-panel resize is only available for flow-stack pairs." />
            </div>
            <input type="number" readOnly
              value={Math.round(node.props.widthShare ?? 100)}
              style={{ ...input, background: "#f9fafb", color: "#9ca3af" }} />
          </div>
        )}

        {/* ── Flow Stack ── */}
        {node.type === "flow-stack" && (
          <>
            <section
              id="flow-stack-panel-layout"
              role="tabpanel"
              aria-labelledby="flow-stack-panel-tab-layout"
              data-testid="flow-stack-panel-layout"
              hidden={flowContainerPanelTab !== "layout"}
              style={{ ...paragraphTabPanel, display: flowContainerPanelTab === "layout" ? "flex" : "none" }}
            >
              {(() => {
                const parent = findFlowRowOfStack(doc, selectedNodeId)
                if (!parent) return null
                const leftStackId = parent.index > 0 ? parent.row.childIds[parent.index - 1] : null
                const rightStackId = parent.index < parent.row.childIds.length - 1 ? parent.row.childIds[parent.index + 1] : null
                const preferredSide = flowResizeSide === "left" && leftStackId
                  ? "left"
                  : flowResizeSide === "right" && rightStackId
                    ? "right"
                    : rightStackId
                      ? "right"
                      : leftStackId
                        ? "left"
                        : null
                const neighborStackId = preferredSide === "left" ? leftStackId : preferredSide === "right" ? rightStackId : null
                const neighborStack = neighborStackId ? findNode(doc, neighborStackId) : null
                const selectedShare = node.props.widthShare ?? 100
                const neighborShare = neighborStack?.type === "flow-stack" ? neighborStack.props.widthShare ?? 0 : 0
                const pairTotalShare = selectedShare + neighborShare
                const selectedIsLeft = preferredSide === "right"
                const draftShare = flowResizeDraft?.nodeId === selectedNodeId && flowResizeDraft.side === preferredSide
                  ? flowResizeDraft.selectedShare
                  : selectedShare
                const pairShares = preferredSide
                  ? resolveFlowStackResizePairShares({
                      pairTotalShare,
                      selectedShare: draftShare,
                      selectedIsLeft,
                    })
                  : null
                const selectedDisplayShare = pairShares?.selectedShare ?? selectedShare
                const leftDisplayShare = pairShares?.leftShare ?? (preferredSide === "left" ? neighborShare : selectedShare)
                const rightDisplayShare = pairShares?.rightShare ?? (preferredSide === "left" ? selectedShare : neighborShare)
                const commitResize = (nextSelectedShare = selectedDisplayShare) => {
                  if (!preferredSide || !neighborStackId) return
                  const nextShares = resolveFlowStackResizePairShares({
                    pairTotalShare,
                    selectedShare: nextSelectedShare,
                    selectedIsLeft,
                  })
                  const nextLeftStackId = preferredSide === "left" ? neighborStackId : selectedNodeId
                  const nextRightStackId = preferredSide === "left" ? selectedNodeId : neighborStackId
                  if (
                    nextShares.leftShare === (preferredSide === "left" ? neighborShare : selectedShare) &&
                    nextShares.rightShare === (preferredSide === "left" ? selectedShare : neighborShare)
                  ) {
                    setFlowResizeDraft(null)
                    return
                  }
                  flowRowOps.resizePair(nextLeftStackId, nextRightStackId, nextShares.leftShare, nextShares.rightShare)
                  setFlowResizeDraft(null)
                }
                const updateDraftShare = (nextSelectedShare: number) => {
                  if (!preferredSide || !pairShares) return
                  const clamped = resolveFlowStackResizePairShares({
                    pairTotalShare,
                    selectedShare: nextSelectedShare,
                    selectedIsLeft,
                  }).selectedShare
                  setFlowResizeDraft({ nodeId: selectedNodeId, side: preferredSide, selectedShare: clamped })
                }
                const stepResize = (delta: number) => {
                  if (!pairShares) return
                  commitResize(selectedDisplayShare + delta)
                }
                return (
                  <>
                    <div>
                      <label style={label}>Column</label>
                      <div
                        data-testid="flow-stack-column-control"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 1fr 28px",
                          alignItems: "stretch",
                          minHeight: 52,
                          border: "1px solid #d1fae5",
                          borderRadius: 6,
                          overflow: "hidden",
                          background: "#f0fdfa",
                        }}
                      >
                        <button
                          type="button"
                          data-testid="flow-stack-add-before"
                          title="Add column before"
                          onClick={() => flowRowOps.addCol(parent.rowId, selectedNodeId, "before")}
                          style={{
                            border: "none",
                            borderRight: "1px solid #99f6e4",
                            background: "#ecfdf5",
                            color: "#0f766e",
                            cursor: "pointer",
                            fontSize: 16,
                            fontWeight: 700,
                          }}
                        >
                          +
                        </button>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            background: "#d7f4ef",
                            color: "#0f766e",
                            fontSize: 10,
                            minWidth: 0,
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>Column {parent.index + 1}</span>
                          <span style={{ color: "#6b7280" }}>{Math.round(node.props.widthShare ?? 100)}%</span>
                        </div>
                        <button
                          type="button"
                          data-testid="flow-stack-add-after"
                          title="Add column after"
                          onClick={() => flowRowOps.addCol(parent.rowId, selectedNodeId, "after")}
                          style={{
                            border: "none",
                            borderLeft: "1px solid #99f6e4",
                            background: "#ecfdf5",
                            color: "#0f766e",
                            cursor: "pointer",
                            fontSize: 16,
                            fontWeight: 700,
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <InfoHint
                          text={`The left and right edges add a sibling column before or after this flow-stack by splitting this column's width share. This is column ${parent.index + 1} of ${parent.row.childIds.length}.`}
                          align="left"
                        />
                      </div>
                    </div>
                    {preferredSide && pairShares && neighborStack?.type === "flow-stack" && (
                      <div data-testid="flow-stack-resize-control">
                        <div style={labelWithInfo}>
                          <label style={inlineLabel}>Resize with neighbor</label>
                          <InfoHint
                            text={`Choose a left or right neighbor, then resize only that pair. Minimum is ${pairShares.minShare}% each; pair total stays ${Math.round(pairTotalShare)}%.`}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
                          <button
                            type="button"
                            disabled={!leftStackId}
                            onClick={() => {
                              setFlowResizeSide("left")
                              setFlowResizeDraft(null)
                            }}
                            style={{
                              ...btn,
                              background: preferredSide === "left" ? "#dbeafe" : btn.background,
                              color: !leftStackId ? "#9ca3af" : preferredSide === "left" ? "#1d4ed8" : btn.color,
                              cursor: leftStackId ? "pointer" : "not-allowed",
                            }}
                          >
                            Left
                          </button>
                          <button
                            type="button"
                            disabled={!rightStackId}
                            onClick={() => {
                              setFlowResizeSide("right")
                              setFlowResizeDraft(null)
                            }}
                            style={{
                              ...btn,
                              background: preferredSide === "right" ? "#dbeafe" : btn.background,
                              color: !rightStackId ? "#9ca3af" : preferredSide === "right" ? "#1d4ed8" : btn.color,
                              cursor: rightStackId ? "pointer" : "not-allowed",
                            }}
                          >
                            Right
                          </button>
                        </div>
                        <div
                          style={{
                            border: "1px solid #d1d5db",
                            borderRadius: 6,
                            overflow: "hidden",
                            background: "#f9fafb",
                          }}
                        >
                          <div style={{ display: "flex", height: 28, fontSize: 9, color: "#374151" }}>
                            <div style={{ width: `${Math.max(4, (leftDisplayShare / pairTotalShare) * 100)}%`, background: preferredSide === "right" ? "#d7f4ef" : "#e5e7eb", display: "grid", placeItems: "center", minWidth: 24, overflow: "hidden", whiteSpace: "nowrap" }}>
                              {preferredSide === "right" ? "This" : "Neighbor"} {Math.round(leftDisplayShare)}%
                            </div>
                            <div style={{ width: 2, background: "#0f766e" }} />
                            <div style={{ width: `${Math.max(4, (rightDisplayShare / pairTotalShare) * 100)}%`, background: preferredSide === "left" ? "#d7f4ef" : "#e5e7eb", display: "grid", placeItems: "center", minWidth: 24, overflow: "hidden", whiteSpace: "nowrap" }}>
                              {preferredSide === "left" ? "This" : "Neighbor"} {Math.round(rightDisplayShare)}%
                            </div>
                          </div>
                          <input
                            type="range"
                            min={pairShares.minShare}
                            max={pairShares.maxShare}
                            step={0.5}
                            value={selectedDisplayShare}
                            aria-label={`Resize selected column with ${preferredSide} neighbor`}
                            onChange={(e) => updateDraftShare(Number(e.target.value))}
                            onPointerUp={() => commitResize()}
                            onKeyUp={(e) => {
                              if (e.key === "Enter" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") commitResize()
                            }}
                            onBlur={() => {
                              if (flowResizeDraft?.nodeId === selectedNodeId && flowResizeDraft.side === preferredSide) commitResize()
                            }}
                            style={{ width: "100%", display: "block" }}
                          />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                          <button type="button" style={btn} onClick={() => stepResize(-1)}>- 1%</button>
                          <button type="button" style={btn} onClick={() => stepResize(1)}>+ 1%</button>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
              <div>
                <div style={labelWithInfo}>
                  <label style={inlineLabel}>Width share (%)</label>
                  <InfoHint text="Width share is read-only here so edits stay sibling-safe. Use Resize with neighbor to change a selected pair." />
                </div>
                <input type="number" readOnly
                  value={Math.round(node.props.widthShare ?? 100)}
                  style={{ ...input, background: "#f9fafb", color: "#9ca3af" }} />
              </div>
              <div>
                <div style={labelWithInfo}>
                  <label style={inlineLabel}>Min height (pt)</label>
                  <InfoHint text="0 keeps the flow-stack auto-sized. This is a visual floor for the first visible stack area, not a content-aware column minimum." />
                </div>
                <input type="number" min={0} step={1}
                  value={node.props.minHeight ?? 0}
                  onChange={(e) => {
                    const height = Math.max(0, Number(e.target.value) || 0)
                    onUpdateProps(selectedNodeId, { minHeight: height > 0 ? height : undefined })
                  }}
                  style={input} />
              </div>
            </section>
            <section
              id="flow-stack-panel-box"
              role="tabpanel"
              aria-labelledby="flow-stack-panel-tab-box"
              data-testid="flow-stack-panel-box"
              hidden={flowContainerPanelTab !== "box"}
              style={{ ...paragraphTabPanel, display: flowContainerPanelTab === "box" ? "flex" : "none" }}
            >
              <BoxControls
                nodeId={selectedNodeId}
                box={node.props.box}
                onUpdateBoxStyle={onUpdateFlowStackBoxStyle ?? onUpdateParagraphBoxStyle}
                testIdPrefix="flow-stack-box"
                labelPrefix="Stack box"
              />
            </section>
          </>
        )}

        {/* ── Flow Table ── */}
        {node.type === "flow-table" && (() => {
          const table = node as unknown as FlowTableNode
          const rows = table.rowIds.length
          const cols = table.columns.length
          const headerRowCount = table.props.headerRowCount ?? 0
          const repeatHeaderRows = table.props.repeatHeaderRows ?? true
          const canAddGrid = canAddFlowTableGrid(table)
          const canRemoveLastRow = canRemoveFlowTableRow(table, rows - 1)
          const canRemoveLastCol = canRemoveFlowTableColumn(table, cols - 1)
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{rows} rows × {cols} cols</div>
              <TableHeaderRowsControl
                tableId={selectedNodeId}
                rowCount={rows}
                headerRowCount={headerRowCount}
                repeatHeaderRows={repeatHeaderRows}
                testId="flow-table-header-rows-control"
                onUpdateProps={onUpdateProps}
              />
              <TableLayoutControl
                tableId={selectedNodeId}
                table={table}
                onUpdateProps={onUpdateProps}
                onFitToWidth={tableOps.fitToWidth}
              />
              <div>
                <label style={label}>Rows</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                    disabled={!canAddGrid}
                    title={canAddGrid ? "Add row" : "Invalid Flow Table grid"}
                    onClick={() => tableOps.addRow(selectedNodeId)}
                  >
                    + Row
                  </button>
                  <button
                    style={{ ...btn, opacity: canRemoveLastRow ? 1 : 0.4 }}
                    disabled={!canRemoveLastRow}
                    title={canRemoveLastRow ? "Remove last row" : "Span-aware row deletion is blocked for this Flow Table target"}
                    onClick={() => tableOps.removeRow(selectedNodeId, rows - 1)}
                  >
                    - Last
                  </button>
                </div>
              </div>
              <div>
                <label style={label}>Columns</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                    disabled={!canAddGrid}
                    title={canAddGrid ? "Add column" : "Invalid Flow Table grid"}
                    onClick={() => tableOps.addCol(selectedNodeId)}
                  >
                    + Col
                  </button>
                  <button
                    style={{ ...btn, opacity: canRemoveLastCol ? 1 : 0.4 }}
                    disabled={!canRemoveLastCol}
                    title={canRemoveLastCol ? "Remove last column" : "Span-aware column deletion is blocked for this Flow Table target"}
                    onClick={() => tableOps.removeCol(selectedNodeId, cols - 1)}
                  >
                    - Last
                  </button>
                </div>
              </div>
            </>
          )
        })()}

        {node.type === "flow-table-row" && (() => {
          const info = findFlowTableOf(doc, selectedNodeId)
          if (!info) return null
          const { table, tableId } = info
          const ri = rowIndexOfFlowTable(table, selectedNodeId)
          const headerRowCount = table.props.headerRowCount ?? 0
          const repeatHeaderRows = table.props.repeatHeaderRows ?? true
          const canAddGrid = canAddFlowTableGrid(table)
          const canRemoveRow = canRemoveFlowTableRow(table, ri)
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Row {ri + 1} of {table.rowIds.length}</div>
              <TableHeaderRowsControl
                tableId={tableId}
                rowCount={table.rowIds.length}
                headerRowCount={headerRowCount}
                repeatHeaderRows={repeatHeaderRows}
                selectedRowIndex={ri}
                testId="flow-table-row-header-rows-control"
                onUpdateProps={onUpdateProps}
              />
              <label style={{ ...label, display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}>
                <input type="checkbox"
                  checked={node.props.allowBreak ?? true}
                  onChange={(e) => onUpdateProps(selectedNodeId, { allowBreak: e.target.checked })} />
                Allow page break
              </label>
              <div>
                <label style={label}>Insert</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                    disabled={!canAddGrid}
                    title={canAddGrid ? "Insert row above" : "Invalid Flow Table grid"}
                    onClick={() => tableOps.addRow(tableId, ri - 1)}
                  >
                    ↑ Above
                  </button>
                  <button
                    style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                    disabled={!canAddGrid}
                    title={canAddGrid ? "Insert row below" : "Invalid Flow Table grid"}
                    onClick={() => tableOps.addRow(tableId, ri)}
                  >
                    ↓ Below
                  </button>
                </div>
              </div>
              <button
                style={{ ...btnDanger, opacity: canRemoveRow ? 1 : 0.4 }}
                disabled={!canRemoveRow}
                title={canRemoveRow ? "Delete row" : "Span-aware row deletion is blocked for this Flow Table target"}
                onClick={() => tableOps.removeRow(tableId, ri)}
              >
                Delete row
              </button>
              <button
                style={btnDanger}
                onClick={() => onDelete(tableId)}
              >
                Delete table
              </button>
            </>
          )
        })()}

        {node.type === "flow-table-cell" && (() => {
          const cell = node as FlowTableCellNode
          const paragraphs = cell.childIds.flatMap((paragraphId) => {
            const paraNode = findNode(doc, paragraphId)
            if (paraNode?.type !== "paragraph") return []
            return [{
              id: paragraphId,
              text: getParagraphText(paraNode),
              canEditText: isTextRunOnlyParagraph(paraNode),
              fieldRefs: getParagraphFieldRefs(paraNode),
            }]
          })
          const info = findFlowTableOf(doc, selectedNodeId)
          const table = info?.table ?? null
          const pos = table ? rowOfFlowTableCell(table, selectedNodeId) : null
          const headerRowCount = table?.props.headerRowCount ?? 0
          const repeatHeaderRows = table?.props.repeatHeaderRows ?? true
          const canAddGrid = table ? canAddFlowTableGrid(table) : false
          const canRemoveCol = table && pos ? canRemoveFlowTableColumn(table, pos.colIndex) : false
          const canRemoveRow = table && pos ? canRemoveFlowTableRow(table, pos.rowIndex) : false
          const mergeLeft = table ? resolveFlowTableCellMergeTarget(table, selectedNodeId, "left") : null
          const mergeRight = table ? resolveFlowTableCellMergeTarget(table, selectedNodeId, "right") : null
          const mergeUp = table ? resolveFlowTableCellMergeTarget(table, selectedNodeId, "up") : null
          const mergeDown = table ? resolveFlowTableCellMergeTarget(table, selectedNodeId, "down") : null
          const canMergeLeft = mergeLeft != null
          const canMergeRight = mergeRight != null
          const canMergeUp = mergeUp != null
          const canMergeDown = mergeDown != null
          const canUnmerge = table && pos ? canUpdateFlowTableCellSpan(table, selectedNodeId, { colspan: 1, rowspan: 1 }) : false
          const applyMerge = (target: { cellId: string; changes: FlowTableCellSpanChanges } | null) => {
            if (target == null) return
            onUpdateFlowTableCellSpan?.(target.cellId, target.changes)
            if (target.cellId !== selectedNodeId) onSelectNode?.(target.cellId)
          }
          return (
            <>
              {pos && table && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Row {pos.rowIndex + 1}, Col {pos.colIndex + 1}</div>
              )}
              {info && pos && table && (
                <TableHeaderRowsControl
                  tableId={info.tableId}
                  rowCount={table.rowIds.length}
                  headerRowCount={headerRowCount}
                  repeatHeaderRows={repeatHeaderRows}
                  selectedRowIndex={pos.rowIndex}
                  testId="flow-table-cell-header-rows-control"
                  onUpdateProps={onUpdateProps}
                />
              )}
              {paragraphs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {paragraphs.map((paragraph, index) => (
                    <div key={paragraph.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <label style={label}>{paragraphs.length > 1 ? `Text ${index + 1}` : "Text"}</label>
                      <textarea
                        data-testid={`flow-table-cell-text-${index}`}
                        value={paragraph.text}
                        rows={3}
                        readOnly={!paragraph.canEditText}
                        onChange={(e) => {
                          if (paragraph.canEditText) onUpdateText(paragraph.id, e.target.value)
                        }}
                        style={{
                          ...input,
                          resize: "vertical",
                          background: paragraph.canEditText ? input.background : "#f9fafb",
                          color: paragraph.canEditText ? input.color : "#9ca3af",
                        }}
                      />
                      <FieldReferenceList refs={paragraph.fieldRefs} registry={registry} onUpdateFieldRef={onUpdateFieldRef} />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label style={label}>Vertical align</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["top", "middle", "bottom"] as const).map((value) => (
                    <button key={value}
                      onClick={() => onUpdateProps(selectedNodeId, { verticalAlign: value })}
                      style={{ ...btn, background: (cell.props.verticalAlign ?? "top") === value ? "#dbeafe" : "#fafafa", color: (cell.props.verticalAlign ?? "top") === value ? "#1d4ed8" : "#6b7280", fontWeight: (cell.props.verticalAlign ?? "top") === value ? "bold" : "normal" }}>
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {info && pos && table && (
                <div>
                  <div style={labelWithInfo}>
                    <label style={inlineLabel}>Span</label>
                    <InfoHint text="Merging appends consumed cell content to the selected cell in row-major order. Unmerge creates empty replacement cells and does not restore original content mapping." />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#6b7280" }}>
                      Rows
                      <input
                        data-testid="flow-table-cell-rowspan-input"
                        type="number"
                        min={1}
                        max={Math.max(1, table.rowIds.length - pos.rowIndex)}
                        step={1}
                        value={pos.rowspan}
                        onChange={(e) => {
                          const value = Math.min(
                            Math.max(1, Number(e.target.value) || 1),
                            Math.max(1, table.rowIds.length - pos.rowIndex),
                          )
                          onUpdateFlowTableCellSpan?.(selectedNodeId, { rowspan: value })
                        }}
                        style={input}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: "#6b7280" }}>
                      Columns
                      <input
                        data-testid="flow-table-cell-colspan-input"
                        type="number"
                        min={1}
                        max={Math.max(1, table.columns.length - pos.colIndex)}
                        step={1}
                        value={pos.colspan}
                        onChange={(e) => {
                          const value = Math.min(
                            Math.max(1, Number(e.target.value) || 1),
                            Math.max(1, table.columns.length - pos.colIndex),
                          )
                          onUpdateFlowTableCellSpan?.(selectedNodeId, { colspan: value })
                        }}
                        style={input}
                      />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, marginTop: 6 }}>
                    <button
                      style={{ ...btn, opacity: canMergeUp ? 1 : 0.4 }}
                      disabled={!canMergeUp}
                      title={canMergeUp ? "Merge up into the neighboring origin and append content" : "Merge up needs an aligned neighboring origin above"}
                      onClick={() => applyMerge(mergeUp)}
                    >
                      Merge up
                    </button>
                    <button
                      style={{ ...btn, opacity: canMergeDown ? 1 : 0.4 }}
                      disabled={!canMergeDown}
                      title={canMergeDown ? "Merge down and append content" : "Merge down needs a fully covered cell inside the next span"}
                      onClick={() => applyMerge(mergeDown)}
                    >
                      Merge down
                    </button>
                    <button
                      style={{ ...btn, opacity: canMergeLeft ? 1 : 0.4 }}
                      disabled={!canMergeLeft}
                      title={canMergeLeft ? "Merge left into the neighboring origin and append content" : "Merge left needs an aligned neighboring origin on the left"}
                      onClick={() => applyMerge(mergeLeft)}
                    >
                      Merge left
                    </button>
                    <button
                      style={{ ...btn, opacity: canMergeRight ? 1 : 0.4 }}
                      disabled={!canMergeRight}
                      title={canMergeRight ? "Merge right and append content" : "Merge right needs a fully covered cell inside the next span"}
                      onClick={() => applyMerge(mergeRight)}
                    >
                      Merge right
                    </button>
                    <button
                      style={{ ...btn, opacity: canUnmerge ? 1 : 0.4, gridColumn: "1 / -1" }}
                      disabled={!canUnmerge}
                      title={canUnmerge ? "Split selected span into empty cells" : "Selected cell is already 1 by 1"}
                      onClick={() => onUpdateFlowTableCellSpan?.(selectedNodeId, { colspan: 1, rowspan: 1 })}
                    >
                      Unmerge
                    </button>
                  </div>
                </div>
              )}
              {info && pos && table && (
                <>
                  <div>
                    <label style={label}>Insert row</label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                        disabled={!canAddGrid}
                        title={canAddGrid ? "Insert row above" : "Invalid Flow Table grid"}
                        onClick={() => tableOps.addRow(info.tableId, pos.rowIndex - 1)}
                      >
                        ↑ Above
                      </button>
                      <button
                        style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                        disabled={!canAddGrid}
                        title={canAddGrid ? "Insert row below" : "Invalid Flow Table grid"}
                        onClick={() => tableOps.addRow(info.tableId, pos.rowEndIndex)}
                      >
                        ↓ Below
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={label}>Insert column</label>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                        disabled={!canAddGrid}
                        title={canAddGrid ? "Insert column left" : "Invalid Flow Table grid"}
                        onClick={() => tableOps.addCol(info.tableId, pos.colIndex - 1)}
                      >
                        ← Left
                      </button>
                      <button
                        style={{ ...btn, opacity: canAddGrid ? 1 : 0.4 }}
                        disabled={!canAddGrid}
                        title={canAddGrid ? "Insert column right" : "Invalid Flow Table grid"}
                        onClick={() => tableOps.addCol(info.tableId, pos.colEndIndex)}
                      >
                        Right →
                      </button>
                    </div>
                  </div>
                  <button
                    style={{ ...btnDanger, opacity: canRemoveCol ? 1 : 0.4 }}
                    disabled={!canRemoveCol}
                    title={canRemoveCol ? "Delete column" : "Span-aware column deletion is blocked for this Flow Table target"}
                    onClick={() => tableOps.removeCol(info.tableId, pos.colIndex)}
                  >
                    Delete column
                  </button>
                  <button
                    style={{ ...btnDanger, opacity: canRemoveRow ? 1 : 0.4 }}
                    disabled={!canRemoveRow}
                    title={canRemoveRow ? "Delete row" : "Span-aware row deletion is blocked for this Flow Table target"}
                    onClick={() => tableOps.removeRow(info.tableId, pos.rowIndex)}
                  >
                    Delete row
                  </button>
                  <button
                    style={btnDanger}
                    onClick={() => onDelete(info.tableId)}
                  >
                    Delete table
                  </button>
                </>
              )}
            </>
          )
        })()}

        {/* ── TOC ── */}
        {node.type === "toc" && (() => {
          const toc = node as unknown as TocNode
          return (
            <>
              <div>
                <label style={label}>Title</label>
                <input value={toc.props.title ?? "สารบัญ"}
                  onChange={(e) => onUpdateProps(selectedNodeId, { title: e.target.value })}
                  style={input} />
              </div>
              <div>
                <label style={label}>Max heading level</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {([1, 2, 3] as const).map((lvl) => {
                    const active = (toc.props.maxLevel ?? 3) === lvl
                    return (
                      <button key={lvl} onClick={() => onUpdateProps(selectedNodeId, { maxLevel: lvl })}
                        style={{ flex: 1, padding: "4px 0", fontSize: 10, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: active ? "#dbeafe" : "#fafafa", color: active ? "#1d4ed8" : "#6b7280", fontWeight: active ? "bold" : "normal" }}>
                        H{lvl}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )
        })()}

      </div>

      {/* Delete (top-level nodes only) */}
      {canDelete && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
          <button
            onClick={() => onDelete(selectedNodeId)}
            style={{ width: "100%", padding: "6px 0", fontSize: 11, cursor: "pointer", border: "1px solid #fca5a5", borderRadius: 4, background: "#fff5f5", color: "#ef4444" }}
          >
            {deleteButtonLabel(node.type)}
          </button>
        </div>
      )}
    </div>
  )
}
