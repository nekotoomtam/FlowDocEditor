"use client"

import { useState, useCallback, useEffect } from "react"
import {
  createParagraphNode,
  createSpacerNode,
  createStackNode,
  createColumnsSubtree,
  createBodyNode,
  createId,
} from "@/document"
import { paginateDocument } from "@/pagination"
import { defaultTextMeasurer } from "@/layout"
import { PdfRenderer } from "@/renderer/pdf"
import { DocxRenderer } from "@/renderer/docx"
import type { PaginatedDocument, PaginatedPage } from "@/pagination"
import type { DocumentNode, DocumentSection, LayoutNode } from "@/schema"

// ─── Sample Table ─────────────────────────────────────────────────────────────

function buildSampleTable() {
  const BORDER_SIDE = { style: "solid" as const, width: { value: 1, unit: "pt" as const }, color: "000000" }
  const ALL_BORDERS = { top: BORDER_SIDE, right: BORDER_SIDE, bottom: BORDER_SIDE, left: BORDER_SIDE }
  const PADDING = { value: 6, unit: "pt" as const }

  const p = (text: string) => createParagraphNode(text)

  // Paragraphs ─────────────────────────────────────────────────────────────────
  const [h1, h2, h3] = ["รายการ", "จำนวน", "ราคา"].map(p)
  const [r1a, r1b, r1c] = ["สินค้า A", "2 ชิ้น", "500 บาท"].map(p)
  const [r2a, r2b, r2c] = ["สินค้า B", "1 ชิ้น", "1,200 บาท"].map(p)
  const [totalLabel, totalValue] = ["รวมทั้งสิ้น", "1,700 บาท"].map(p)

  // Cells ───────────────────────────────────────────────────────────────────────
  const cell = (childIds: string[], colspan?: number) => ({
    id: createId("cell"), type: "table-cell" as const,
    props: { border: ALL_BORDERS, padding: PADDING, ...(colspan ? { colspan } : {}) },
    childIds,
  })

  const headerCells = [cell([h1.id]), cell([h2.id]), cell([h3.id])]
  const row1Cells   = [cell([r1a.id]), cell([r1b.id]), cell([r1c.id])]
  const row2Cells   = [cell([r2a.id]), cell([r2b.id]), cell([r2c.id])]
  const totalCells  = [cell([totalLabel.id], 2), cell([totalValue.id])]

  // Rows ────────────────────────────────────────────────────────────────────────
  const row = (cells: ReturnType<typeof cell>[]) => ({
    id: createId("row"), type: "table-row" as const,
    props: {}, cellIds: cells.map((c) => c.id),
  })

  const rows = [
    row(headerCells),
    row(row1Cells),
    row(row2Cells),
    { id: createId("row"), type: "table-row" as const, props: {}, cellIds: totalCells.map((c) => c.id) },
  ]

  // Internal nodes map ──────────────────────────────────────────────────────────
  const allParas = [h1, h2, h3, r1a, r1b, r1c, r2a, r2b, r2c, totalLabel, totalValue]
  const allCells = [...headerCells, ...row1Cells, ...row2Cells, ...totalCells]
  const tableNodes: Record<string, unknown> = {}
  ;[...allParas, ...allCells, ...rows].forEach((n) => { tableNodes[n.id] = n })

  return {
    id: createId("table"), type: "table" as const,
    props: {},
    // A4 content width = 451pt (595 - 72 × 2) แบ่ง 60 / 20 / 20%
    columns: [
      { width: { value: 270, unit: "pt" as const } },
      { width: { value: 90, unit: "pt" as const } },
      { width: { value: 91, unit: "pt" as const } },
    ],
    rowIds: rows.map((r) => r.id),
    nodes: tableNodes,
  }
}

// ─── Sample Header / Footer ───────────────────────────────────────────────────

function buildSampleHeaderFooter() {
  // Header: 2 columns — ซ้าย title, ขวา subtitle
  const { row: hRow, stacks: hStacks, nodes: hColNodes } = createColumnsSubtree(2)
  const pHLeft  = createParagraphNode("FlowDoc — Pipeline Test")
  const pHRight = createParagraphNode("ทดสอบระบบ Layout Engine", { align: "right" })
  hStacks[0].childIds.push(pHLeft.id)
  hStacks[1].childIds.push(pHRight.id)
  const headerStack = createStackNode([hRow.id])

  // Footer: centered
  const pFooter = createParagraphNode("เอกสารทดสอบ — FlowDoc", { align: "center" })
  const footerStack = createStackNode([pFooter.id])

  const headerNodes = {
    [headerStack.id]: headerStack,
    [hRow.id]: hRow,
    ...hColNodes,
    [pHLeft.id]: pHLeft,
    [pHRight.id]: pHRight,
  }
  const footerNodes = {
    [footerStack.id]: footerStack,
    [pFooter.id]: pFooter,
  }

  return { headerStack, footerStack, headerNodes, footerNodes }
}

// ─── Sample Doc ───────────────────────────────────────────────────────────────

function buildSampleDoc(): DocumentNode {
  const p1 = createParagraphNode("FlowDoc — Pipeline Test")
  const p2 = createParagraphNode(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  )
  const spacer = createSpacerNode({ height: 24 })

  const { row, stacks, nodes: colNodes } = createColumnsSubtree(2)
  const pLeft = createParagraphNode("Column A: ข้อมูลฝั่งซ้าย")
  const pRight = createParagraphNode("Column B: ข้อมูลฝั่งขวา")
  stacks[0].childIds.push(pLeft.id)
  stacks[1].childIds.push(pRight.id)

  const table = buildSampleTable()
  const spacer2 = createSpacerNode({ height: 16 })
  const { headerStack, footerStack, headerNodes, footerNodes } = buildSampleHeaderFooter()

  const extras = Array.from({ length: 20 }, (_, i) =>
    createParagraphNode(`Paragraph ${i + 1}: ทดสอบ pagination — FlowDoc layout engine`),
  )

  const body = createBodyNode([
    p1.id, p2.id, spacer.id, row.id,
    spacer2.id, table.id,
    ...extras.map((p) => p.id),
  ])

  const section: DocumentSection = {
    id: createId("section"),
    type: "section",
    page: {
      size: "A4",
      orientation: "portrait",
      margin: {
        top: { value: 36, unit: "pt" },
        right: { value: 72, unit: "pt" },
        bottom: { value: 36, unit: "pt" },
        left: { value: 72, unit: "pt" },
      },
      headerReserved: 36,
      footerReserved: 28,
    },
    headerRootId: headerStack.id,
    headerFirstPageRootId: null,  // หน้าแรกไม่มี header
    bodyRootId: body.id,
    footerRootId: footerStack.id,
    footerFirstPageRootId: null,  // หน้าแรกไม่มี footer
    nodes: {
      ...headerNodes,
      ...footerNodes,
      [body.id]: body,
      [p1.id]: p1,
      [p2.id]: p2,
      [spacer.id]: spacer,
      [spacer2.id]: spacer2,
      ...colNodes,
      [pLeft.id]: pLeft,
      [pRight.id]: pRight,
      [table.id]: table as any,
      ...Object.fromEntries(extras.map((p) => [p.id, p])),
    },
  }

  return {
    version: 1,
    document: { id: createId("doc"), meta: { title: "FlowDoc Test" }, sections: [section] },
  }
}

// ─── Editor Helpers ───────────────────────────────────────────────────────────

function findNodeById(doc: DocumentNode, nodeId: string): LayoutNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node) return node
    for (const n of Object.values(section.nodes)) {
      if (n.type === "table") {
        const child = (n as any).nodes?.[nodeId]
        if (child) return child as LayoutNode
      }
    }
  }
  return null
}

function PropertyPanel({
  nodeId, docNode, onUpdate,
}: {
  nodeId: string | null
  docNode: DocumentNode | null
  onUpdate: (newDoc: DocumentNode) => void
}) {
  const [text, setText] = useState("")
  const [fontSize, setFontSize] = useState(12)
  const [align, setAlign] = useState("left")

  const node = nodeId && docNode ? findNodeById(docNode, nodeId) : null

  useEffect(() => {
    if (node?.type !== "paragraph") return
    const run = node.children.find((c) => c.type === "text")
    setText(run?.type === "text" ? run.text : "")
    setFontSize(node.props.fontSize.value)
    setAlign(node.props.align)
  }, [nodeId])  // eslint-disable-line react-hooks/exhaustive-deps

  const S: React.CSSProperties = { width: "100%", padding: 4, fontSize: 11, marginBottom: 12, boxSizing: "border-box" }

  if (!nodeId || !docNode) return (
    <div style={{ padding: 16, color: "#9ca3af", fontSize: 11 }}>
      คลิก fragment เพื่อแก้ไข
    </div>
  )

  return (
    <div style={{ padding: 16, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: "bold", marginBottom: 4, color: "#374151" }}>{node?.type ?? "?"}</div>
      <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 12, wordBreak: "break-all" }}>{nodeId}</div>

      {node?.type === "paragraph" && (
        <>
          <label style={{ display: "block", marginBottom: 4, color: "#6b7280" }}>text</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            style={{ ...S, height: 72, resize: "vertical" }} />

          <label style={{ display: "block", marginBottom: 4, color: "#6b7280" }}>fontSize (pt)</label>
          <input type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
            style={S} />

          <label style={{ display: "block", marginBottom: 4, color: "#6b7280" }}>align</label>
          <select value={align} onChange={(e) => setAlign(e.target.value)} style={{ ...S, marginBottom: 16 }}>
            {["left", "center", "right", "justify"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <button
            onClick={() => {
              if (!docNode || !nodeId) return
              const newDoc = JSON.parse(JSON.stringify(docNode)) as DocumentNode
              for (const section of newDoc.document.sections) {
                const n = section.nodes[nodeId]
                if (n?.type === "paragraph") {
                  const run = n.children.find((c) => c.type === "text")
                  if (run?.type === "text") run.text = text
                  n.props.fontSize = { value: fontSize, unit: "pt" }
                  n.props.align = align as "left" | "center" | "right" | "justify"
                  break
                }
              }
              onUpdate(newDoc)
            }}
            style={{ width: "100%", padding: "7px 0", background: "#2563eb", color: "white",
              border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
          >
            Update
          </button>
        </>
      )}

      {node?.type === "spacer" && (
        <div style={{ color: "#6b7280" }}>height: {node.props.height}pt</div>
      )}

      {node && node.type !== "paragraph" && node.type !== "spacer" && (
        <div style={{ color: "#9ca3af" }}>read-only</div>
      )}
    </div>
  )
}

// ─── Visualization ────────────────────────────────────────────────────────────

const SCALE = 0.5
const PAGE_W = 595 * SCALE
const PAGE_H = 842 * SCALE

const COLORS: Record<string, string> = {
  paragraph: "#bfdbfe",
  spacer: "#d1d5db",
  row: "#fed7aa",
  stack: "#e9d5ff",
  body: "#bbf7d0",
}

const ZONE_COLORS = { header: "#fef9c3", footer: "#fce7f3" }

function FragmentRect({
  f, i, zoneColor, isSelected, onSelect,
}: {
  f: PaginatedPage["fragments"][0]
  i: number
  zoneColor?: string
  isSelected?: boolean
  onSelect?: (nodeId: string) => void
}) {
  const fill = zoneColor ?? COLORS[f.nodeType] ?? "#f3f4f6"
  return (
    <g key={i} onClick={() => onSelect?.(f.nodeId)} style={{ cursor: onSelect ? "pointer" : "default" }}>
      <rect
        x={f.x * SCALE} y={f.y * SCALE}
        width={f.width * SCALE} height={Math.max(f.height * SCALE, 3)}
        fill={fill}
        stroke={isSelected ? "#2563eb" : "#9ca3af"}
        strokeWidth={isSelected ? 2 : 0.5}
        opacity={0.85}
      />
      <text x={f.x * SCALE + 3} y={f.y * SCALE + 9} fontSize={7} fill="#374151">
        {f.nodeType}
      </text>
    </g>
  )
}

function PageView({
  page, index, selectedNodeId, onSelect,
}: {
  page: PaginatedPage
  index: number
  selectedNodeId?: string | null
  onSelect?: (nodeId: string) => void
}) {
  const hFrags = page.headerFragments ?? []
  const fFrags = page.footerFragments ?? []
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
        Page {index + 1} · body:{page.fragments.length} h:{hFrags.length} f:{fFrags.length}
      </div>
      <svg width={PAGE_W} height={PAGE_H}
        style={{ border: "1px solid #d1d5db", background: "white", display: "block" }}>
        <rect
          x={page.contentBox.x * SCALE} y={page.contentBox.y * SCALE}
          width={page.contentBox.width * SCALE} height={page.contentBox.height * SCALE}
          fill="none" stroke="#e5e7eb" strokeDasharray="4 2"
        />
        {hFrags.map((f, i) => <FragmentRect key={`h${i}`} f={f} i={i} zoneColor={ZONE_COLORS.header} />)}
        {fFrags.map((f, i) => <FragmentRect key={`f${i}`} f={f} i={i} zoneColor={ZONE_COLORS.footer} />)}
        {page.fragments.map((f, i) => (
          <FragmentRect key={i} f={f} i={i}
            isSelected={f.nodeId === selectedNodeId}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DocTest() {
  const [docNode, setDocNode] = useState<DocumentNode | null>(null)
  const [result, setResult] = useState<PaginatedDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [docxLoading, setDocxLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const paginate = useCallback((doc: DocumentNode) => {
    const t0 = performance.now()
    const paginated = paginateDocument(doc, defaultTextMeasurer)
    setElapsed(performance.now() - t0)
    setResult(paginated)
  }, [])

  const run = useCallback(() => {
    try {
      const doc = buildSampleDoc()
      setDocNode(doc)
      paginate(doc)
      setSelectedNodeId(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    }
  }, [paginate])

  const applyUpdate = useCallback((newDoc: DocumentNode) => {
    setDocNode(newDoc)
    paginate(newDoc)
  }, [paginate])

  const downloadPdf = useCallback(async () => {
    if (!result) return
    setPdfLoading(true)
    try {
      const renderer = new PdfRenderer({
        async getFont(_key) {
          const res = await fetch("/fonts/THSarabun.ttf")
          const buf = await res.arrayBuffer()
          return new Uint8Array(buf)
        },
      })
      const { buffer, mimeType } = await renderer.render(result)
      const blob = new Blob([buffer.buffer as ArrayBuffer], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "flowdoc-test.pdf"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfLoading(false)
    }
  }, [result])

  const downloadDocx = useCallback(async () => {
    if (!result) return
    setDocxLoading(true)
    try {
      const renderer = new DocxRenderer()
      const { buffer, mimeType } = await renderer.render(result)
      const blob = new Blob([buffer.buffer as ArrayBuffer], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "flowdoc-test.docx"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDocxLoading(false)
    }
  }, [result])

  const totalPages = result?.sections.reduce((s, sec) => s + sec.pages.length, 0) ?? 0
  const totalFragments =
    result?.sections.reduce(
      (s, sec) => s + sec.pages.reduce((p, page) => p + page.fragments.length, 0),
      0,
    ) ?? 0

  return (
    <div style={{ fontFamily: "monospace", padding: 24, background: "#f9fafb", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>FlowDoc — Pipeline Test</h1>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 16 }}>
        buildSampleDoc → paginateDocument(defaultTextMeasurer) → visual
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button
          onClick={run}
          style={{
            padding: "7px 18px",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Run Pipeline
        </button>
        {result && (
          <>
            <button
              onClick={downloadPdf}
              disabled={pdfLoading}
              style={{
                padding: "7px 18px",
                background: pdfLoading ? "#9ca3af" : "#16a34a",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: pdfLoading ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {pdfLoading ? "Generating..." : "Download PDF"}
            </button>
            <button
              onClick={downloadDocx}
              disabled={docxLoading}
              style={{
                padding: "7px 18px",
                background: docxLoading ? "#9ca3af" : "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: docxLoading ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {docxLoading ? "Generating..." : "Download DOCX"}
            </button>
          </>
        )}
        {elapsed != null && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            {elapsed.toFixed(1)}ms · {totalPages} pages · {totalFragments} fragments
          </span>
        )}
      </div>

      {error && (
        <pre
          style={{ background: "#fee2e2", padding: 12, borderRadius: 4, color: "#b91c1c", fontSize: 11 }}
        >
          {error}
        </pre>
      )}

      {result && (
        <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
          {/* ─ Pages ─ */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {result.sections.map((section, si) => (
              <div key={si} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                  Section {si + 1} — {section.pages.length} page{section.pages.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                  {section.pages.map((page, pi) => (
                    <PageView key={pi} page={page} index={pi}
                      selectedNodeId={selectedNodeId}
                      onSelect={setSelectedNodeId}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(COLORS).map(([type, color]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                  <div style={{ width: 11, height: 11, background: color, border: "1px solid #9ca3af" }} />
                  {type}
                </div>
              ))}
            </div>
          </div>

          {/* ─ Property Panel ─ */}
          <div style={{
            width: 220, flexShrink: 0,
            borderLeft: "1px solid #e5e7eb",
            background: "white",
            alignSelf: "flex-start",
            position: "sticky", top: 0,
          }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: "bold", color: "#374151" }}>
              Properties
            </div>
            <PropertyPanel
              nodeId={selectedNodeId}
              docNode={docNode}
              onUpdate={applyUpdate}
            />
          </div>
        </div>
      )}
    </div>
  )
}
