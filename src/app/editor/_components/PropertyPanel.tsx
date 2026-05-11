import type { DocumentNode, LayoutNode, TableNode, TableRowNode, TableCellNode, ParagraphNode, TocNode } from "@/schema"
import { pt } from "@/schema"
import { isPlainTextParagraph } from "@/document"

type DocNode = LayoutNode | TableRowNode | TableCellNode

interface TableOps {
  addRow: (tableId: string, afterIndex?: number) => void
  removeRow: (tableId: string, rowIndex: number) => void
  addCol: (tableId: string, afterIndex?: number) => void
  removeCol: (tableId: string, colIndex: number) => void
}

interface Props {
  doc: DocumentNode
  selectedNodeId: string | null
  onUpdateProps: (nodeId: string, changes: Record<string, unknown>) => void
  onUpdateText: (nodeId: string, text: string) => void
  onDelete: (nodeId: string) => void
  tableOps: TableOps
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNode(doc: DocumentNode, nodeId: string): DocNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node) return node
    for (const n of Object.values(section.nodes)) {
      if (n.type !== "table") continue
      const inner = (n as unknown as TableNode).nodes[nodeId]
      if (inner) return inner as DocNode
    }
  }
  return null
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

function getParagraphText(node: ParagraphNode): string {
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const label: React.CSSProperties = {
  fontSize: 10, color: "#6b7280", marginBottom: 3, display: "block",
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

// ─── PropertyPanel ────────────────────────────────────────────────────────────

export function PropertyPanel({ doc, selectedNodeId, onUpdateProps, onUpdateText, onDelete, tableOps }: Props) {
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

  return (
    <div style={{ background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: "bold", color: "#9ca3af", borderBottom: "1px solid #f3f4f6", background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
        {node.type}
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Paragraph ── */}
        {node.type === "paragraph" && (() => {
          const text = getParagraphText(node)
          const canEditText = isPlainTextParagraph(node)
          return (
            <>
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
              <label style={label}>Min height (pt)</label>
              <input type="number" min={0} step={1}
                value={node.props.minHeight ?? 0}
                onChange={(e) => {
                  const height = Math.max(0, Number(e.target.value))
                  onUpdateProps(selectedNodeId, { minHeight: height > 0 ? height : undefined })
                }}
                style={input} />
              <span style={{ ...label, marginTop: 4, fontSize: 9 }}>0 = auto; content stays as minimum</span>
            </div>
          </>
        )}

        {/* ── Stack ── */}
        {node.type === "stack" && (
          <div>
            <label style={label}>Width share (%)</label>
            <input type="number" readOnly
              value={Math.round(node.props.widthShare ?? 100)}
              style={{ ...input, background: "#f9fafb", color: "#9ca3af" }} />
            <span style={{ ...label, marginTop: 4, fontSize: 9 }}>resize via drag — coming soon</span>
          </div>
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
