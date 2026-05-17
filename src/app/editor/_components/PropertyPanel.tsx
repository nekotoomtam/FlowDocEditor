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
  TableCellNode,
  TableNode,
  TableRowNode,
  TocNode,
} from "@/schema"
import { pt } from "@/schema"
import { canRemoveFlowTableColumn, canRemoveFlowTableRow, canUpdateFlowTableCellSpan, isPlainTextParagraph } from "@/document"
import type { FieldRefInlineChanges, FlowTableCellSpanChanges, ParagraphBoxStyleChanges } from "@/document"
import { tryResolveFlowTableGrid } from "@/document/flowTableGrid"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { resolveFlowStackResizePairShares } from "./flowStackResize"
import { InfoHint } from "./InfoHint"
import { buildSelectionContext } from "./selectionContext"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

type DocNode = LayoutNode | TableRowNode | TableCellNode | FlowTableRowNode | FlowTableCellNode
type ParagraphPanelTab = "text" | "box"
type FlowContainerPanelTab = "layout" | "box"

interface TableOps {
  addRow: (tableId: string, afterIndex?: number) => void
  removeRow: (tableId: string, rowIndex: number) => void
  addCol: (tableId: string, afterIndex?: number) => void
  removeCol: (tableId: string, colIndex: number) => void
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
  onUpdateFieldRef: (fieldRefId: string, changes: FieldRefInlineChanges) => void
  onUpdateParagraphBoxStyle: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  onUpdateFlowStackBoxStyle?: (nodeId: string, changes: ParagraphBoxStyleChanges) => void
  onUpdateFlowTableCellSpan?: (cellId: string, changes: FlowTableCellSpanChanges) => void
  onSelectContextNode: (nodeId: string) => void
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
      if (n.type !== "table" && n.type !== "flow-table") continue
      const inner = (n as unknown as TableNode | FlowTableNode).nodes[nodeId]
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
  return nodeType
}

function isTopLevel(doc: DocumentNode, nodeId: string): boolean {
  return doc.document.sections.some((s) => s.nodes[nodeId] != null)
}

function findTableOf(doc: DocumentNode, nodeId: string): { table: TableNode; tableId: string } | null {
  for (const section of doc.document.sections) {
    for (const [tableId, n] of Object.entries(section.nodes)) {
      if (n.type !== "table") continue
      const table = n as unknown as TableNode
      if (table.nodes[nodeId]) return { table, tableId }
    }
  }
  return null
}

function rowIndexOf(table: TableNode, rowId: string): number {
  return table.rowIds.indexOf(rowId)
}

function rowOfCell(table: TableNode, cellId: string): { rowId: string; rowIndex: number; colIndex: number } | null {
  for (let ri = 0; ri < table.rowIds.length; ri++) {
    const row = table.nodes[table.rowIds[ri]] as TableRowNode
    const ci = row?.cellIds.indexOf(cellId) ?? -1
    if (ci !== -1) return { rowId: table.rowIds[ri], rowIndex: ri, colIndex: ci }
  }
  return null
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

const DEFAULT_BOX_FILL = "E0F2FE"
const DEFAULT_BOX_BORDER_COLOR = "1F2937"
const DEFAULT_BOX_BORDER_WIDTH = 1
const BOX_BORDER_WIDTH_MAX = 5
const BOX_BORDER_WIDTH_STEP = 0.25
const BOX_FILL_SWATCHES = ["F8FAFC", "E0F2FE", "DCFCE7", "FEF3C7", "FCE7F3"]
const BOX_BORDER_STYLE_OPTIONS: ParagraphBoxBorderStyle[] = ["none", "solid", "dashed", "dotted"]

function sanitizeHexColorInput(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
}

function isCompleteHexColor(value: string): boolean {
  return /^[0-9A-F]{6}$/.test(value)
}

function numericPtInput(value: string): number {
  return Math.max(0, Number(value) || 0)
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
  const allBorderActionLabel = allBordersActive ? "Clear all borders" : "Apply border to all sides"
  const [fillDraft, setFillDraft] = useState(fill)
  const [fillDraftDirty, setFillDraftDirty] = useState(false)
  const [borderColorDraft, setBorderColorDraft] = useState(borderColor ?? "")
  const [borderColorDraftDirty, setBorderColorDraftDirty] = useState(false)
  const [borderWidthDraft, setBorderWidthDraft] = useState(borderWidth ?? DEFAULT_BOX_BORDER_WIDTH)
  const [borderWidthDraftDirty, setBorderWidthDraftDirty] = useState(false)

  useEffect(() => {
    setFillDraft(fill)
    setFillDraftDirty(false)
  }, [fill, nodeId])

  useEffect(() => {
    setBorderColorDraft(borderColor ?? "")
    setBorderColorDraftDirty(false)
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
    setFillDraftDirty(false)
  }

  const commitFillDraft = () => {
    const hex = sanitizeHexColorInput(fillDraft)
    if (hex.length === 0) {
      if (fill !== "") onUpdateBoxStyle(nodeId, { fill: null })
      setFillDraft("")
      setFillDraftDirty(false)
      return
    }
    if (!isCompleteHexColor(hex)) {
      setFillDraft(fill)
      setFillDraftDirty(false)
      return
    }
    if (hex !== fill) onUpdateBoxStyle(nodeId, { fill: hex })
    setFillDraft(hex)
    setFillDraftDirty(false)
  }

  const commitBorderColorDraft = () => {
    const hex = sanitizeHexColorInput(borderColorDraft)
    if (!isCompleteHexColor(hex)) {
      setBorderColorDraft(borderColor ?? "")
      setBorderColorDraftDirty(false)
      return
    }
    if (hex !== borderColor) updateBorderEdges(targetEdges, makeBorderSide({ color: hex }))
    setBorderColorDraft(hex)
    setBorderColorDraftDirty(false)
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
  const fillPreviewColor = isCompleteHexColor(fillDraft) ? fillDraft : fill || DEFAULT_BOX_FILL
  const borderPreviewColor = isCompleteHexColor(borderColorDraft) ? borderColorDraft : borderColor ?? DEFAULT_BOX_BORDER_COLOR
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
            background: `#${fillPreviewColor}`,
            marginBottom: 6,
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 44px", gap: 6, alignItems: "center" }}>
          <input
            type="color"
            aria-label={`${labelPrefix} fill color`}
            value={`#${fillPreviewColor}`}
            onChange={(e) => {
              setFillDraft(sanitizeHexColorInput(e.target.value))
              setFillDraftDirty(true)
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
              setFillDraftDirty(hex !== fill)
            }}
            onBlur={commitFillDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitFillDraft()
              if (e.key === "Escape") {
                setFillDraft(fill)
                setFillDraftDirty(false)
              }
            }}
            style={input}
          />
          <button
            type="button"
            disabled={!fillDraftDirty}
            onClick={commitFillDraft}
            style={{ ...btn, padding: "4px 0", opacity: fillDraftDirty ? 1 : 0.45, cursor: fillDraftDirty ? "pointer" : "default" }}
          >
            Apply
          </button>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
          {BOX_FILL_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              data-testid={`${testIdPrefix}-fill-swatch`}
              aria-label={`Set ${labelPrefix.toLowerCase()} fill ${swatch}`}
              onClick={() => commitFill(swatch)}
              style={{
                width: 20,
                height: 18,
                border: fill === swatch ? "2px solid #2563eb" : "1px solid #d1d5db",
                borderRadius: 4,
                background: `#${swatch}`,
                cursor: "pointer",
              }}
            />
          ))}
          <button type="button" onClick={() => commitFill("")} style={{ ...btn, flex: 1, padding: "2px 0" }}>
            Clear fill
          </button>
        </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 44px", gap: 6, alignItems: "center", marginTop: 6 }}>
          <input
            type="color"
            aria-label={`${labelPrefix} border color`}
            value={`#${borderPreviewColor}`}
            onChange={(e) => {
              const hex = sanitizeHexColorInput(e.target.value)
              setBorderColorDraft(hex)
              setBorderColorDraftDirty(true)
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
              setBorderColorDraftDirty(hex !== (borderColor ?? ""))
            }}
            onBlur={commitBorderColorDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitBorderColorDraft()
              if (e.key === "Escape") {
                setBorderColorDraft(borderColor ?? "")
                setBorderColorDraftDirty(false)
              }
            }}
            style={input}
          />
          <button
            type="button"
            disabled={!borderColorDraftDirty}
            onClick={commitBorderColorDraft}
            style={{ ...btn, padding: "4px 0", opacity: borderColorDraftDirty ? 1 : 0.45, cursor: borderColorDraftDirty ? "pointer" : "default" }}
          >
            Apply
          </button>
        </div>
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
  gridTemplateColumns: "1fr 1fr",
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

// ─── PropertyPanel ────────────────────────────────────────────────────────────

export function PropertyPanel({ doc, registry, selectedNodeId, selectionAnchorNodeId, onUpdateProps, onUpdateText, onUpdateFieldRef, onUpdateParagraphBoxStyle, onUpdateFlowStackBoxStyle, onUpdateFlowTableCellSpan, onSelectContextNode, onDelete, tableOps, flowRowOps }: Props) {
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
          const canEditText = isPlainTextParagraph(node)
          const fieldRefs = getParagraphFieldRefs(node)
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
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Font size (pt)</label>
                    <input type="number" min={4} max={200}
                      value={node.props.fontSize.value}
                      onChange={(e) => onUpdateProps(selectedNodeId, { fontSize: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Line height</label>
                    <input type="number" min={0.5} max={5} step={0.1}
                      value={node.props.lineHeight}
                      onChange={(e) => onUpdateProps(selectedNodeId, { lineHeight: Number(e.target.value) })}
                      style={input} />
                  </div>
                </div>
                <div>
                  <label style={label}>Align</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["left", "center", "right", "justify"] as const).map((a) => (
                      <button key={a} onClick={() => onUpdateProps(selectedNodeId, { align: a })}
                        style={{ flex: 1, padding: "4px 0", fontSize: 10, cursor: "pointer", border: "1px solid #e5e7eb", borderRadius: 4, background: node.props.align === a ? "#dbeafe" : "#fafafa", color: node.props.align === a ? "#1d4ed8" : "#6b7280", fontWeight: node.props.align === a ? "bold" : "normal" }}>
                        {a === "left" ? "L" : a === "center" ? "C" : a === "right" ? "R" : "J"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Space before</label>
                    <input type="number" min={0}
                      value={node.props.spacingBefore.value}
                      onChange={(e) => onUpdateProps(selectedNodeId, { spacingBefore: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label}>Space after</label>
                    <input type="number" min={0}
                      value={node.props.spacingAfter.value}
                      onChange={(e) => onUpdateProps(selectedNodeId, { spacingAfter: pt(Number(e.target.value)) })}
                      style={input} />
                  </div>
                </div>

                <div>
                  <label style={label}>Heading level</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([undefined, 1, 2, 3] as const).map((lvl) => {
                      const active = (node.props.headingLevel ?? undefined) === lvl
                      return (
                        <button key={String(lvl)} onClick={() => onUpdateProps(selectedNodeId, { headingLevel: lvl })}
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
                  box={node.props.box}
                  onUpdateBoxStyle={onUpdateParagraphBoxStyle}
                />
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

        {/* ── Table ── */}
        {node.type === "table" && (() => {
          const rows = node.rowIds.length
          const cols = node.columns.length
          const headerRowCount = node.props.headerRowCount ?? 0
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{rows} rows × {cols} cols</div>
              <div>
                <label style={label}>Header rows</label>
                <input type="number" min={0} max={rows}
                  value={headerRowCount}
                  onChange={(e) => {
                    const value = Math.min(rows, Math.max(0, Number(e.target.value) || 0))
                    onUpdateProps(selectedNodeId, { headerRowCount: value > 0 ? value : undefined })
                  }}
                  style={input} />
              </div>
              <div>
                <label style={label}>Rows</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btn} onClick={() => tableOps.addRow(selectedNodeId)}>+ Row</button>
                  <button style={{ ...btn, opacity: rows <= 1 ? 0.4 : 1 }} disabled={rows <= 1}
                    onClick={() => tableOps.removeRow(selectedNodeId, rows - 1)}>− Last</button>
                </div>
              </div>
              <div>
                <label style={label}>Columns</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btn} onClick={() => tableOps.addCol(selectedNodeId)}>+ Col</button>
                  <button style={{ ...btn, opacity: cols <= 1 ? 0.4 : 1 }} disabled={cols <= 1}
                    onClick={() => tableOps.removeCol(selectedNodeId, cols - 1)}>− Last</button>
                </div>
              </div>
            </>
          )
        })()}

        {/* ── Flow Table ── */}
        {node.type === "flow-table" && (() => {
          const table = node as unknown as FlowTableNode
          const rows = table.rowIds.length
          const cols = table.columns.length
          const headerRowCount = table.props.headerRowCount ?? 0
          const canAddGrid = canAddFlowTableGrid(table)
          const canRemoveLastRow = canRemoveFlowTableRow(table, rows - 1)
          const canRemoveLastCol = canRemoveFlowTableColumn(table, cols - 1)
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{rows} rows × {cols} cols</div>
              <div>
                <label style={label}>Header rows</label>
                <input type="number" min={0} max={rows}
                  value={headerRowCount}
                  onChange={(e) => {
                    const value = Math.min(rows, Math.max(0, Number(e.target.value) || 0))
                    onUpdateProps(selectedNodeId, { headerRowCount: value > 0 ? value : undefined })
                  }}
                  style={input} />
              </div>
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
          const canAddGrid = canAddFlowTableGrid(table)
          const canRemoveRow = canRemoveFlowTableRow(table, ri)
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Row {ri + 1} of {table.rowIds.length}</div>
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
            </>
          )
        })()}

        {node.type === "flow-table-cell" && (() => {
          const cell = node as FlowTableCellNode
          const paragraphId = cell.childIds[0]
          const paraNode = paragraphId ? findNode(doc, paragraphId) : null
          const text = paraNode?.type === "paragraph" ? getParagraphText(paraNode) : ""
          const canEditText = paraNode?.type === "paragraph" ? isPlainTextParagraph(paraNode) : false
          const fieldRefs = paraNode?.type === "paragraph" ? getParagraphFieldRefs(paraNode) : []
          const info = findFlowTableOf(doc, selectedNodeId)
          const table = info?.table ?? null
          const pos = table ? rowOfFlowTableCell(table, selectedNodeId) : null
          const canAddGrid = table ? canAddFlowTableGrid(table) : false
          const canRemoveCol = table && pos ? canRemoveFlowTableColumn(table, pos.colIndex) : false
          const canRemoveRow = table && pos ? canRemoveFlowTableRow(table, pos.rowIndex) : false
          const canMergeRight = table && pos ? canUpdateFlowTableCellSpan(table, selectedNodeId, { colspan: pos.colspan + 1 }) : false
          const canMergeDown = table && pos ? canUpdateFlowTableCellSpan(table, selectedNodeId, { rowspan: pos.rowspan + 1 }) : false
          const canUnmerge = table && pos ? canUpdateFlowTableCellSpan(table, selectedNodeId, { colspan: 1, rowspan: 1 }) : false
          return (
            <>
              {pos && table && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Row {pos.rowIndex + 1}, Col {pos.colIndex + 1}</div>
              )}
              {paragraphId && (
                <div>
                  <label style={label}>Text</label>
                  <textarea
                    value={text}
                    rows={3}
                    readOnly={!canEditText}
                    onChange={(e) => {
                      if (canEditText) onUpdateText(paragraphId, e.target.value)
                    }}
                    style={{
                      ...input,
                      resize: "vertical",
                      background: canEditText ? input.background : "#f9fafb",
                      color: canEditText ? input.color : "#9ca3af",
                    }}
                  />
                </div>
              )}
              <FieldReferenceList refs={fieldRefs} registry={registry} onUpdateFieldRef={onUpdateFieldRef} />
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
                    <InfoHint text="Expanding can only consume empty Flow Table cells. Shrinking creates empty replacement cells; content merge and span-origin movement are deferred." />
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginTop: 6 }}>
                    <button
                      style={{ ...btn, opacity: canMergeRight ? 1 : 0.4 }}
                      disabled={!canMergeRight}
                      title={canMergeRight ? "Merge right into empty cells" : "Merge right needs an empty cell fully inside the next span"}
                      onClick={() => onUpdateFlowTableCellSpan?.(selectedNodeId, { colspan: pos.colspan + 1 })}
                    >
                      Merge right
                    </button>
                    <button
                      style={{ ...btn, opacity: canMergeDown ? 1 : 0.4 }}
                      disabled={!canMergeDown}
                      title={canMergeDown ? "Merge down into empty cells" : "Merge down needs an empty cell fully inside the next span"}
                      onClick={() => onUpdateFlowTableCellSpan?.(selectedNodeId, { rowspan: pos.rowspan + 1 })}
                    >
                      Merge down
                    </button>
                    <button
                      style={{ ...btn, opacity: canUnmerge ? 1 : 0.4 }}
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

        {/* ── Table Row ── */}
        {node.type === "table-row" && (() => {
          const info = findTableOf(doc, selectedNodeId)
          if (!info) return null
          const { table, tableId } = info
          const ri = rowIndexOf(table, selectedNodeId)
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Row {ri + 1} of {table.rowIds.length}</div>
              <label style={{ ...label, display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}>
                <input type="checkbox"
                  checked={node.props.allowBreak ?? true}
                  onChange={(e) => onUpdateProps(selectedNodeId, { allowBreak: e.target.checked })} />
                Allow page break
              </label>
              <div>
                <label style={label}>Insert</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btn} onClick={() => tableOps.addRow(tableId, ri - 1)}>↑ Above</button>
                  <button style={btn} onClick={() => tableOps.addRow(tableId, ri)}>↓ Below</button>
                </div>
              </div>
              <button style={{ ...btnDanger, opacity: table.rowIds.length <= 1 ? 0.4 : 1 }}
                disabled={table.rowIds.length <= 1}
                onClick={() => tableOps.removeRow(tableId, ri)}>
                Delete row
              </button>
            </>
          )
        })()}

        {/* ── Table Cell ── */}
        {node.type === "table-cell" && (() => {
          const cell = node as TableCellNode
          const info = findTableOf(doc, selectedNodeId)
          if (!info) return null
          const { table, tableId } = info
          const pos = rowOfCell(table, selectedNodeId)
          if (!pos) return null
          const paragraphId = cell.childIds[0]
          const paraNode = paragraphId ? findNode(doc, paragraphId) : null
          const text = paraNode?.type === "paragraph" ? getParagraphText(paraNode) : ""
          const canEditText = paraNode?.type === "paragraph" ? isPlainTextParagraph(paraNode) : false
          const fieldRefs = paraNode?.type === "paragraph" ? getParagraphFieldRefs(paraNode) : []
          const cols = table.columns.length
          return (
            <>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Row {pos.rowIndex + 1}, Col {pos.colIndex + 1}</div>
              {paragraphId && (
                <div>
                  <label style={label}>Text</label>
                  <textarea
                    value={text}
                    rows={3}
                    readOnly={!canEditText}
                    onChange={(e) => {
                      if (canEditText) onUpdateText(paragraphId, e.target.value)
                    }}
                    style={{
                      ...input,
                      resize: "vertical",
                      background: canEditText ? input.background : "#f9fafb",
                      color: canEditText ? input.color : "#9ca3af",
                    }}
                  />
                </div>
              )}
              <FieldReferenceList refs={fieldRefs} registry={registry} onUpdateFieldRef={onUpdateFieldRef} />
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>Padding</label>
                  <input type="number" min={0}
                    value={cell.props.padding?.value ?? 0}
                    onChange={(e) => onUpdateProps(selectedNodeId, { padding: pt(Math.max(0, Number(e.target.value) || 0)) })}
                    style={input} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label}>Background</label>
                  <input
                    value={cell.props.background ?? ""}
                    placeholder="FFFFFF"
                    maxLength={6}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)
                      onUpdateProps(selectedNodeId, { background: value.length === 6 ? value : undefined })
                    }}
                    style={input} />
                </div>
              </div>
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
              <div>
                <label style={label}>Insert row</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btn} onClick={() => tableOps.addRow(tableId, pos.rowIndex - 1)}>↑ Above</button>
                  <button style={btn} onClick={() => tableOps.addRow(tableId, pos.rowIndex)}>↓ Below</button>
                </div>
              </div>
              <div>
                <label style={label}>Insert column</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btn} onClick={() => tableOps.addCol(tableId, pos.colIndex - 1)}>← Left</button>
                  <button style={btn} onClick={() => tableOps.addCol(tableId, pos.colIndex)}>Right →</button>
                </div>
              </div>
              <button style={{ ...btnDanger, opacity: cols <= 1 ? 0.4 : 1 }}
                disabled={cols <= 1}
                onClick={() => tableOps.removeCol(tableId, pos.colIndex)}>
                Delete column
              </button>
              <button style={{ ...btnDanger, opacity: table.rowIds.length <= 1 ? 0.4 : 1 }}
                disabled={table.rowIds.length <= 1}
                onClick={() => tableOps.removeRow(tableId, pos.rowIndex)}>
                Delete row
              </button>
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
            Delete block
          </button>
        </div>
      )}
    </div>
  )
}
