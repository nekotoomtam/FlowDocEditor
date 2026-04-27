"use client"

import { useState, useCallback, useEffect } from "react"
import { paginateDocument } from "@/pagination"
import { buildSampleDoc } from "../_lib/sampleDoc"
import { defaultTextMeasurer } from "@/layout"
import { PdfRenderer } from "@/renderer/pdf"
import { DocxRenderer } from "@/renderer/docx"
import type { PaginatedDocument, PaginatedPage } from "@/pagination"
import type { DocumentNode, LayoutNode } from "@/schema"

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
