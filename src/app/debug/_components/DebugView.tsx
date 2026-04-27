"use client"

import { useState, useCallback } from "react"
import { paginateDocument } from "@/pagination"
import { defaultTextMeasurer } from "@/layout"
import { PdfRenderer } from "@/renderer/pdf"
import { DocxRenderer } from "@/renderer/docx"
import type { PaginatedDocument, PaginatedPage, PageFragment } from "@/pagination"
import { parseDSL } from "../../_lib/parseDSL"
import { PRESETS } from "../../_lib/presets"

// ─── Constants ────────────────────────────────────────────────────────────────

const SCALE = 0.6
const PAGE_W = 595 * SCALE
const PAGE_H = 842 * SCALE

const NODE_COLORS: Record<string, string> = {
  paragraph: "#bfdbfe",
  spacer:    "#d1d5db",
  row:       "#fed7aa",
  stack:     "#e9d5ff",
  body:      "#bbf7d0",
  table:     "#fde68a",
}

const ZONE_COLORS = { header: "#fef9c3", footer: "#fce7f3" }

const BADGE: Record<string, { bg: string; fg: string }> = {
  paragraph: { bg: "#dbeafe", fg: "#1d4ed8" },
  spacer:    { bg: "#f3f4f6", fg: "#374151" },
  row:       { bg: "#ffedd5", fg: "#c2410c" },
  stack:     { bg: "#f3e8ff", fg: "#7e22ce" },
  body:      { bg: "#dcfce7", fg: "#15803d" },
  table:     { bg: "#fef9c3", fg: "#92400e" },
}

function fmt(n: number) { return n.toFixed(1) }

function btn(bg: string, disabled = false): React.CSSProperties {
  return {
    padding: "6px 14px", background: disabled ? "#9ca3af" : bg,
    color: "white", border: "none", borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 12,
  }
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ f, x, y }: { f: PageFragment; x: number; y: number }) {
  return (
    <div style={{
      position: "fixed", left: x + 14, top: y + 14,
      background: "#1f2937", color: "white",
      padding: "6px 10px", borderRadius: 4, fontSize: 10,
      fontFamily: "monospace", pointerEvents: "none", zIndex: 9999,
      whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    }}>
      <span style={{ color: "#93c5fd" }}>{f.nodeType}</span>
      {"  "}
      x:{fmt(f.x)} y:{fmt(f.y)} w:{fmt(f.width)} h:{fmt(f.height)}
    </div>
  )
}

// ─── Inspector ────────────────────────────────────────────────────────────────

function Inspector({ f }: { f: PageFragment | null }) {
  if (!f) {
    return (
      <div style={{ padding: 16, color: "#9ca3af", fontSize: 11 }}>
        คลิก fragment เพื่อดูรายละเอียด
      </div>
    )
  }

  const badge = BADGE[f.nodeType] ?? { bg: "#f3f4f6", fg: "#374151" }

  return (
    <div style={{ padding: 16, fontFamily: "monospace", fontSize: 11 }}>
      <span style={{
        background: badge.bg, color: badge.fg,
        padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: "bold",
      }}>
        {f.nodeType}
      </span>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <tbody>
          {([
            ["x",      fmt(f.x)],
            ["y",      fmt(f.y)],
            ["width",  fmt(f.width)],
            ["height", fmt(f.height)],
            ["page",   String(f.pageIndex)],
            ...(f.lines ? [["lines", String(f.lines.length)]] : []),
          ] as [string, string][]).map(([label, value]) => (
            <tr key={label}>
              <td style={{ color: "#9ca3af", paddingBottom: 5, paddingRight: 12, width: 55 }}>{label}</td>
              <td style={{ color: "#111827", fontWeight: "bold" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
        <div style={{ color: "#9ca3af", marginBottom: 3 }}>nodeId</div>
        <div style={{ color: "#374151", wordBreak: "break-all", fontSize: 10 }}>{f.nodeId}</div>
        {f.parentNodeId && <>
          <div style={{ color: "#9ca3af", marginTop: 8, marginBottom: 3 }}>parentNodeId</div>
          <div style={{ color: "#374151", wordBreak: "break-all", fontSize: 10 }}>{f.parentNodeId}</div>
        </>}
      </div>

      {f.lines && f.lines.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
          <div style={{ color: "#9ca3af", marginBottom: 6 }}>lines</div>
          {f.lines.map((line, i) => (
            <div key={i} style={{
              fontSize: 10, color: "#374151", marginBottom: 3,
              background: "#f9fafb", padding: "3px 6px", borderRadius: 2,
            }}>
              <span style={{ color: "#d1d5db" }}>{i}: </span>
              {line.text || "(empty)"}
              <span style={{ color: "#d1d5db" }}> · y:{fmt(line.y)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fragment List ────────────────────────────────────────────────────────────

function FragmentList({
  fragments, label, selectedId, onSelect,
}: {
  fragments: PageFragment[]
  label: string
  selectedId: string | null
  onSelect: (f: PageFragment) => void
}) {
  if (fragments.length === 0) return null
  return (
    <div>
      <div style={{
        padding: "5px 16px", fontSize: 10, color: "#9ca3af",
        background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
        borderTop: "1px solid #e5e7eb",
      }}>
        {label} · {fragments.length}
      </div>
      {fragments.map((f, i) => {
        const badge = BADGE[f.nodeType] ?? { bg: "#f3f4f6", fg: "#374151" }
        const sel = f.nodeId === selectedId
        return (
          <div
            key={i}
            onClick={() => onSelect(f)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 16px", cursor: "pointer", fontSize: 10,
              background: sel ? "#eff6ff" : "transparent",
              borderLeft: sel ? "2px solid #2563eb" : "2px solid transparent",
            }}
          >
            <span style={{
              background: badge.bg, color: badge.fg,
              padding: "1px 5px", borderRadius: 2, fontSize: 9, flexShrink: 0,
            }}>
              {f.nodeType.slice(0, 4)}
            </span>
            <span style={{
              color: "#6b7280", flex: 1, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {f.nodeId.slice(-8)}
            </span>
            <span style={{ color: "#d1d5db", flexShrink: 0, fontSize: 9 }}>
              {fmt(f.x)},{fmt(f.y)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page View ────────────────────────────────────────────────────────────────

function PageView({
  page, selectedId, hoveredId, onSelect, onHover,
}: {
  page: PaginatedPage
  selectedId: string | null
  hoveredId: string | null
  onSelect: (f: PageFragment) => void
  onHover: (f: PageFragment | null) => void
}) {
  const allFragments = [
    ...page.headerFragments.map((f) => ({ ...f, _zone: "header" as const })),
    ...page.footerFragments.map((f) => ({ ...f, _zone: "footer" as const })),
    ...page.fragments.map((f) => ({ ...f, _zone: "body" as const })),
  ]

  return (
    <svg
      width={PAGE_W} height={PAGE_H}
      style={{ border: "1px solid #d1d5db", background: "white", display: "block", cursor: "crosshair" }}
    >
      <rect
        x={page.contentBox.x * SCALE} y={page.contentBox.y * SCALE}
        width={page.contentBox.width * SCALE} height={page.contentBox.height * SCALE}
        fill="none" stroke="#e5e7eb" strokeDasharray="4 2" strokeWidth={0.5}
      />

      {allFragments.map((f, i) => {
        const baseColor =
          f._zone === "header" ? ZONE_COLORS.header :
          f._zone === "footer" ? ZONE_COLORS.footer :
          (NODE_COLORS[f.nodeType] ?? "#f3f4f6")
        const isSel = f.nodeId === selectedId
        const isHov = f.nodeId === hoveredId && !isSel

        return (
          <g
            key={i}
            onClick={() => onSelect(f)}
            onMouseEnter={() => onHover(f)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={f.x * SCALE} y={f.y * SCALE}
              width={f.width * SCALE} height={Math.max(f.height * SCALE, 2)}
              fill={baseColor}
              stroke={isSel ? "#2563eb" : isHov ? "#4b5563" : "#9ca3af"}
              strokeWidth={isSel ? 1.5 : isHov ? 1 : 0.5}
              opacity={isSel ? 0.95 : 0.75}
            />
            <text
              x={f.x * SCALE + 3} y={f.y * SCALE + 8}
              fontSize={6} fill="#374151"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {f.nodeType}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Input Panel ──────────────────────────────────────────────────────────────

function InputPanel({
  dslText, dslError, selectedPreset,
  onDslChange, onPresetChange,
}: {
  dslText: string
  dslError: string | null
  selectedPreset: string
  onDslChange: (v: string) => void
  onPresetChange: (label: string) => void
}) {
  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderRight: "1px solid #e5e7eb", background: "white",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 16px", fontSize: 11, fontWeight: "bold",
        color: "#374151", borderBottom: "1px solid #f3f4f6", background: "#fafafa",
        flexShrink: 0,
      }}>
        Input
      </div>

      {/* Preset selector */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>preset</div>
        <select
          value={selectedPreset}
          onChange={(e) => onPresetChange(e.target.value)}
          style={{
            width: "100%", fontSize: 11, padding: "4px 6px",
            border: "1px solid #d1d5db", borderRadius: 4,
            background: "white", color: "#374151", cursor: "pointer",
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* DSL error */}
      {dslError && (
        <div style={{
          padding: "6px 12px", background: "#fee2e2",
          color: "#b91c1c", fontSize: 10, fontFamily: "monospace",
          borderBottom: "1px solid #fca5a5", flexShrink: 0,
          wordBreak: "break-all",
        }}>
          {dslError}
        </div>
      )}

      {/* Textarea */}
      <textarea
        value={dslText}
        onChange={(e) => onDslChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1, resize: "none",
          fontFamily: "monospace", fontSize: 10,
          border: "none", outline: "none",
          padding: 12, lineHeight: 1.6,
          color: "#374151", background: "white",
        }}
      />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DebugView() {
  const [dslText, setDslText]             = useState(PRESETS[0].dsl)
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0].label)
  const [dslError, setDslError]           = useState<string | null>(null)
  const [result, setResult]               = useState<PaginatedDocument | null>(null)
  const [error, setError]                 = useState<string | null>(null)
  const [elapsed, setElapsed]             = useState<number | null>(null)
  const [selected, setSelected]           = useState<PageFragment | null>(null)
  const [hovered, setHovered]             = useState<PageFragment | null>(null)
  const [tooltipPos, setTooltipPos]       = useState({ x: 0, y: 0 })
  const [pdfLoading, setPdfLoading]       = useState(false)
  const [docxLoading, setDocxLoading]     = useState(false)

  const handleDslChange = useCallback((v: string) => {
    setDslText(v)
    setSelectedPreset("custom")
    // live parse check
    try {
      JSON.parse(v)
      setDslError(null)
    } catch (e) {
      setDslError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const handlePresetChange = useCallback((label: string) => {
    setSelectedPreset(label)
    const preset = PRESETS.find((p) => p.label === label)
    if (preset) {
      setDslText(preset.dsl)
      setDslError(null)
    }
  }, [])

  const run = useCallback(() => {
    try {
      const doc = parseDSL(dslText)
      const t0 = performance.now()
      const paginated = paginateDocument(doc, defaultTextMeasurer)
      setElapsed(performance.now() - t0)
      setResult(paginated)
      setSelected(null)
      setError(null)
      setDslError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.startsWith("JSON")) {
        setDslError(msg)
      } else {
        setError(msg)
      }
      setResult(null)
    }
  }, [dslText])

  const downloadPdf = useCallback(async () => {
    if (!result) return
    setPdfLoading(true)
    try {
      const renderer = new PdfRenderer({
        async getFont(_key) {
          const res = await fetch("/fonts/THSarabun.ttf")
          return new Uint8Array(await res.arrayBuffer())
        },
      })
      const { buffer, mimeType } = await renderer.render(result)
      const url = URL.createObjectURL(new Blob([buffer.buffer as ArrayBuffer], { type: mimeType }))
      Object.assign(document.createElement("a"), { href: url, download: "flowdoc-debug.pdf" }).click()
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
      const url = URL.createObjectURL(new Blob([buffer.buffer as ArrayBuffer], { type: mimeType }))
      Object.assign(document.createElement("a"), { href: url, download: "flowdoc-debug.docx" }).click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDocxLoading(false)
    }
  }, [result])

  const totalPages = result?.sections.reduce((s, sec) => s + sec.pages.length, 0) ?? 0
  const totalFrags = result?.sections.reduce(
    (s, sec) => s + sec.pages.reduce((p, page) => p + page.fragments.length, 0), 0,
  ) ?? 0

  return (
    <div
      style={{ fontFamily: "monospace", background: "#f9fafb", height: "100vh", display: "flex", flexDirection: "column" }}
      onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
    >
      {/* ── Toolbar ── */}
      <div style={{
        padding: "10px 20px", background: "white", borderBottom: "1px solid #e5e7eb",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: "bold", color: "#111827", marginRight: 4 }}>
          FlowDoc Debug
        </span>
        <button onClick={run} style={btn("#2563eb")}>Run Pipeline</button>
        {result && <>
          <button onClick={downloadPdf} disabled={pdfLoading} style={btn("#16a34a", pdfLoading)}>
            {pdfLoading ? "..." : "PDF"}
          </button>
          <button onClick={downloadDocx} disabled={docxLoading} style={btn("#7c3aed", docxLoading)}>
            {docxLoading ? "..." : "DOCX"}
          </button>
        </>}
        {elapsed != null && (
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
            {elapsed.toFixed(1)}ms · {totalPages}p · {totalFrags}f
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: Input panel */}
        <InputPanel
          dslText={dslText}
          dslError={dslError}
          selectedPreset={selectedPreset}
          onDslChange={handleDslChange}
          onPresetChange={handlePresetChange}
        />

        {/* Center: Pages area */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {error && (
            <pre style={{
              background: "#fee2e2", padding: 12, borderRadius: 4,
              color: "#b91c1c", fontSize: 11, marginBottom: 16,
            }}>
              {error}
            </pre>
          )}

          {!result && !error && (
            <div style={{ color: "#9ca3af", fontSize: 11 }}>
              กด "Run Pipeline" เพื่อเริ่ม
            </div>
          )}

          {result && result.sections.map((section, si) => (
            <div key={si} style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10 }}>
                Section {si + 1} · {section.pages.length} page{section.pages.length !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                {section.pages.map((page, pi) => (
                  <div key={pi}>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
                      Page {page.index + 1}
                      {"  "}body:{page.fragments.length}
                      {"  "}h:{page.headerFragments.length}
                      {"  "}f:{page.footerFragments.length}
                    </div>
                    <PageView
                      page={page}
                      selectedId={selected?.nodeId ?? null}
                      hoveredId={hovered?.nodeId ?? null}
                      onSelect={setSelected}
                      onHover={setHovered}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {result && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                  <div style={{ width: 10, height: 10, background: color, border: "1px solid #9ca3af" }} />
                  {type}
                </div>
              ))}
              {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                <div key={zone} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                  <div style={{ width: 10, height: 10, background: color, border: "1px solid #9ca3af" }} />
                  {zone}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Inspector + Fragment list */}
        {result && (
          <div style={{
            width: 280, flexShrink: 0,
            borderLeft: "1px solid #e5e7eb", background: "white",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
              <div style={{
                padding: "8px 16px", fontSize: 11, fontWeight: "bold",
                color: "#374151", borderBottom: "1px solid #f3f4f6", background: "#fafafa",
              }}>
                Inspector
              </div>
              <Inspector f={selected} />
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
              <div style={{
                padding: "8px 16px", fontSize: 11, fontWeight: "bold",
                color: "#374151", borderBottom: "1px solid #f3f4f6", background: "#fafafa",
              }}>
                Fragments
              </div>
              {result.sections.map((sec, si) =>
                sec.pages.map((page, pi) => (
                  <div key={`${si}-${pi}`}>
                    <FragmentList
                      label={`Page ${page.index + 1} body`}
                      fragments={page.fragments}
                      selectedId={selected?.nodeId ?? null}
                      onSelect={setSelected}
                    />
                    <FragmentList
                      label={`Page ${page.index + 1} header`}
                      fragments={page.headerFragments}
                      selectedId={selected?.nodeId ?? null}
                      onSelect={setSelected}
                    />
                    <FragmentList
                      label={`Page ${page.index + 1} footer`}
                      fragments={page.footerFragments}
                      selectedId={selected?.nodeId ?? null}
                      onSelect={setSelected}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {hovered && <Tooltip f={hovered} x={tooltipPos.x} y={tooltipPos.y} />}
    </div>
  )
}
