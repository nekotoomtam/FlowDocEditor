import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  canDisableSectionReservedZone,
  clampSectionReservedZones,
  DEFAULT_HEADER_FOOTER_RESERVED_PT,
  MIN_HEADER_FOOTER_RESERVED_PT,
} from "@/document"
import { toAbstractUnit } from "@/layout"
import { getPageDimensions } from "@/pagination"
import type { DocumentNode, UnitValue } from "@/schema"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

type PageMarginSide = "top" | "right" | "bottom" | "left"
export type PageMarginDraft = Record<PageMarginSide, number>
type PageReservedZone = "headerReserved" | "footerReserved"
export type PageReservedDraft = Record<PageReservedZone, number>
export type PageHeaderFooterHorizontalMode = "body" | "full"
type DocumentSection = DocumentNode["document"]["sections"][number]
const headerFooterModeLabels: Record<PageHeaderFooterHorizontalMode, string> = {
  body: "In frame",
  full: "Full",
}

function readSectionMargin(section: DocumentSection): PageMarginDraft {
  return {
    top: section.page.margin.top.value,
    right: section.page.margin.right.value,
    bottom: section.page.margin.bottom.value,
    left: section.page.margin.left.value,
  }
}

function readSectionReserved(section: DocumentSection): PageReservedDraft {
  return {
    headerReserved: section.page.headerReserved ?? 0,
    footerReserved: section.page.footerReserved ?? 0,
  }
}

function readSectionHeaderFooterMode(section: DocumentSection): PageHeaderFooterHorizontalMode {
  return section.page.headerFooterHorizontalMode === "full" ? "full" : "body"
}

function clampPageMarginValue(value: number, side: PageMarginSide, section: DocumentSection): number {
  const { width, height } = getPageDimensions(section.page)
  const pageExtent = side === "left" || side === "right" ? width : height
  const max = Math.max(0, pageExtent / 2 - 36)
  const numeric = Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(max, Math.round(numeric * 100) / 100))
}

function clampPageReservedDraft(
  draft: PageReservedDraft,
  section: DocumentSection,
  priority: PageReservedZone,
): PageReservedDraft {
  return clampSectionReservedZones(section, draft, priority)
}

function clampPageMarginDraft(draft: PageMarginDraft, section: DocumentSection): PageMarginDraft {
  return {
    top: clampPageMarginValue(draft.top, "top", section),
    right: clampPageMarginValue(draft.right, "right", section),
    bottom: clampPageMarginValue(draft.bottom, "bottom", section),
    left: clampPageMarginValue(draft.left, "left", section),
  }
}

function arePageMarginsEqual(a: PageMarginDraft, b: PageMarginDraft): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

function arePageReservedZonesEqual(a: PageReservedDraft, b: PageReservedDraft): boolean {
  return a.headerReserved === b.headerReserved && a.footerReserved === b.footerReserved
}

function formatPageMarginSummary(margin: PageMarginDraft): string {
  return `${margin.top}/${margin.right}/${margin.bottom}/${margin.left} pt`
}

function formatReservedZoneValue(value: number | undefined): string {
  return `${Math.round(Math.max(0, value ?? 0) * 100) / 100} pt`
}

function resolveUnitValuePt(value: UnitValue): number {
  return Math.max(0, toAbstractUnit(value.value, value.unit))
}

function formatHeaderFooterSummary(reserved: PageReservedDraft): string {
  return `${formatReservedZoneValue(reserved.headerReserved)} / ${formatReservedZoneValue(reserved.footerReserved)}`
}

export function resolveHeaderFooterMiniMap(section: DocumentSection, reserved: PageReservedDraft) {
  const { width, height } = getPageDimensions(section.page)
  const marginTop = resolveUnitValuePt(section.page.margin.top)
  const marginBottom = resolveUnitValuePt(section.page.margin.bottom)
  const usableHeight = Math.max(1, height - marginTop - marginBottom)
  const headerHeight = Math.max(0, reserved.headerReserved)
  const footerHeight = Math.max(0, reserved.footerReserved)
  const bodyHeight = Math.max(0, usableHeight - headerHeight - footerHeight)
  const mapHeight = 144
  const mapWidth = Math.max(48, Math.min(88, mapHeight * (width / Math.max(height, 1))))
  const pageTopPad = Math.max(4, (marginTop / Math.max(height, 1)) * mapHeight)
  const pageBottomPad = Math.max(4, (marginBottom / Math.max(height, 1)) * mapHeight)
  const usableMapHeight = Math.max(24, mapHeight - pageTopPad - pageBottomPad)
  const minVisibleZone = 6
  const visibleHeaderHeight = headerHeight > 0
    ? Math.max(minVisibleZone, usableMapHeight * (headerHeight / usableHeight))
    : 0
  const visibleFooterHeight = footerHeight > 0
    ? Math.max(minVisibleZone, usableMapHeight * (footerHeight / usableHeight))
    : 0
  const visibleBodyHeight = Math.max(8, usableMapHeight - visibleHeaderHeight - visibleFooterHeight)

  return {
    page: { width: mapWidth, height: mapHeight, topPad: pageTopPad, bottomPad: pageBottomPad },
    header: { y: pageTopPad, height: visibleHeaderHeight },
    body: { y: pageTopPad + visibleHeaderHeight, height: visibleBodyHeight },
    footer: { y: pageTopPad + visibleHeaderHeight + visibleBodyHeight, height: visibleFooterHeight },
    labels: {
      header: formatReservedZoneValue(headerHeight),
      body: formatReservedZoneValue(bodyHeight),
      footer: formatReservedZoneValue(footerHeight),
    },
    values: {
      header: Math.round(headerHeight),
      body: Math.round(bodyHeight),
      footer: Math.round(footerHeight),
    },
    percentages: {
      header: `${Math.round((headerHeight / usableHeight) * 100)}%`,
      body: `${Math.round((bodyHeight / usableHeight) * 100)}%`,
      footer: `${Math.round((footerHeight / usableHeight) * 100)}%`,
    },
    geometry: {
      usableHeight,
      usableMapTop: pageTopPad,
      usableMapBottom: mapHeight - pageBottomPad,
      usableMapHeight,
    },
  }
}

export function resolveHeaderFooterReservedValueFromMiniMapY(
  section: DocumentSection,
  reserved: PageReservedDraft,
  zone: PageReservedZone,
  mapY: number,
): number {
  const map = resolveHeaderFooterMiniMap(section, reserved)
  const top = map.geometry.usableMapTop
  const bottom = map.geometry.usableMapBottom
  const usableMapHeight = Math.max(1, bottom - top)
  const clampedY = Math.max(top, Math.min(bottom, mapY))
  const ratio = zone === "headerReserved"
    ? (clampedY - top) / usableMapHeight
    : (bottom - clampedY) / usableMapHeight
  return Math.max(0, Math.round(map.geometry.usableHeight * ratio * 100) / 100)
}

function hasReservedZoneRoot(section: DocumentSection, zone: PageReservedZone): boolean {
  return zone === "headerReserved"
    ? Boolean(section.headerRootId || section.headerFirstPageRootId)
    : Boolean(section.footerRootId || section.footerFirstPageRootId)
}

function reservedZoneToAuthoringZone(zone: PageReservedZone): "header" | "footer" {
  return zone === "headerReserved" ? "header" : "footer"
}

function isReservedZoneEnabled(section: DocumentSection, reserved: PageReservedDraft, zone: PageReservedZone): boolean {
  return reserved[zone] > 0 || hasReservedZoneRoot(section, zone)
}

function HeaderFooterMiniMap({
  section,
  reserved,
  editable,
  onReservedChange,
  onReservedCommit,
  onReservedReset,
  onReservedDragChange,
  onReservedDragCommit,
}: {
  section: DocumentSection
  reserved: PageReservedDraft
  editable: boolean
  onReservedChange: (zone: PageReservedZone, value: string) => void
  onReservedCommit: () => void
  onReservedReset: () => void
  onReservedDragChange: (zone: PageReservedZone, value: number) => void
  onReservedDragCommit: (zone: PageReservedZone, value: number) => void
}) {
  const map = resolveHeaderFooterMiniMap(section, reserved)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draggingZone, setDraggingZone] = useState<PageReservedZone | null>(null)
  const mapWidth = map.page.width
  const mapHeight = map.page.height
  const contentInset = 8
  const zoneWidth = mapWidth - contentInset * 2
  const resolvePointerValue = useCallback((clientY: number, zone: PageReservedZone) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const mapY = rect && rect.height > 0
      ? ((clientY - rect.top) / rect.height) * mapHeight
      : zone === "headerReserved" ? map.body.y : map.footer.y
    return resolveHeaderFooterReservedValueFromMiniMapY(section, reserved, zone, mapY)
  }, [map.body.y, map.footer.y, mapHeight, reserved, section])
  const beginDrag = useCallback((zone: PageReservedZone, event: ReactPointerEvent<SVGRectElement>) => {
    if (!editable || !isReservedZoneEnabled(section, reserved, zone)) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingZone(zone)
    onReservedDragChange(zone, resolvePointerValue(event.clientY, zone))
  }, [editable, onReservedDragChange, resolvePointerValue, reserved, section])

  useEffect(() => {
    if (!draggingZone) return

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault()
      onReservedDragChange(draggingZone, resolvePointerValue(event.clientY, draggingZone))
    }
    const handlePointerEnd = (event: PointerEvent) => {
      event.preventDefault()
      onReservedDragCommit(draggingZone, resolvePointerValue(event.clientY, draggingZone))
      setDraggingZone(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [draggingZone, onReservedDragChange, onReservedDragCommit, resolvePointerValue])

  const renderDragHandle = (
    zone: PageReservedZone,
    label: "Header" | "Footer",
    y: number,
    stroke: string,
  ) => {
    const enabled = editable && isReservedZoneEnabled(section, reserved, zone)
    const active = draggingZone === zone
    return (
      <>
        <line
          x1={contentInset - 2}
          y1={y}
          x2={mapWidth - contentInset + 2}
          y2={y}
          stroke={stroke}
          strokeWidth={active ? 2.25 : 1.5}
        />
        {enabled && (
          <rect
            data-testid={`header-footer-mini-map-${zone}-handle`}
            aria-hidden="true"
            x={contentInset - 5}
            y={y - 6}
            width={zoneWidth + 10}
            height={12}
            fill="transparent"
            onPointerDown={(event) => beginDrag(zone, event)}
            style={headerFooterMiniMapDragHandle}
          />
        )}
      </>
    )
  }

  const renderReservedControl = (
    zone: PageReservedZone,
    label: "Header" | "Footer",
    percentage: string,
    swatchStyle: CSSProperties,
  ) => {
    const enabled = isReservedZoneEnabled(section, reserved, zone)
    const zoneMinimum = (hasReservedZoneRoot(section, zone) || reserved[zone] > 0)
      ? MIN_HEADER_FOOTER_RESERVED_PT
      : 0
    return (
      <div style={headerFooterMiniMapLegendRow}>
        <span style={{ ...headerFooterMiniMapSwatch, ...swatchStyle }} />
        <div style={headerFooterMiniMapControl}>
          <div style={headerFooterMiniMapHeading}>
            <span>{label}</span>
            <span style={headerFooterMiniMapPercent}>{percentage}</span>
          </div>
          <label style={headerFooterMiniMapInputRow}>
            <input
              data-testid={`header-footer-mini-map-${zone}-input`}
              aria-label={`${label} reserved height`}
              type="number"
              min={zoneMinimum}
              step={1}
              value={reserved[zone]}
              disabled={!editable || !enabled}
              onChange={(event) => onReservedChange(zone, event.target.value)}
              onBlur={onReservedCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                } else if (event.key === "Escape") {
                  onReservedReset()
                  event.currentTarget.blur()
                }
              }}
              style={{
                ...headerFooterMiniMapInput,
                background: editable && enabled ? "white" : "#f8fafc",
                color: editable && enabled ? "#111827" : "#94a3b8",
              }}
            />
            <span style={headerFooterMiniMapUnit}>pt</span>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="header-footer-mini-map"
      aria-label={`Header ${map.labels.header}, body ${map.labels.body}, footer ${map.labels.footer}`}
      style={headerFooterMiniMapShell}
    >
      <svg
        ref={svgRef}
        width={mapWidth}
        height={mapHeight}
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        role="img"
        aria-hidden="true"
        style={headerFooterMiniMapSvg}
      >
        <rect x={0.5} y={0.5} width={mapWidth - 1} height={mapHeight - 1} rx={3} fill="#ffffff" stroke="#cbd5e1" />
        <line x1={contentInset} y1={map.page.topPad} x2={mapWidth - contentInset} y2={map.page.topPad} stroke="#e2e8f0" strokeDasharray="2 2" />
        <line x1={contentInset} y1={mapHeight - map.page.bottomPad} x2={mapWidth - contentInset} y2={mapHeight - map.page.bottomPad} stroke="#e2e8f0" strokeDasharray="2 2" />
        {map.header.height > 0 && (
          <rect x={contentInset} y={map.header.y} width={zoneWidth} height={map.header.height} fill="#dbeafe" />
        )}
        <rect x={contentInset} y={map.body.y} width={zoneWidth} height={map.body.height} fill="#f8fafc" />
        {map.footer.height > 0 && (
          <rect x={contentInset} y={map.footer.y} width={zoneWidth} height={map.footer.height} fill="#fce7f3" />
        )}
        {map.header.height > 0 && (
          renderDragHandle("headerReserved", "Header", map.body.y, "#2563eb")
        )}
        {map.footer.height > 0 && (
          renderDragHandle("footerReserved", "Footer", map.footer.y, "#db2777")
        )}
      </svg>
      <div style={headerFooterMiniMapLegend}>
        {renderReservedControl("headerReserved", "Header", map.percentages.header, { background: "#dbeafe", borderColor: "#93c5fd" })}
        <div style={headerFooterMiniMapLegendRow}>
          <span style={{ ...headerFooterMiniMapSwatch, background: "#f8fafc", borderColor: "#cbd5e1" }} />
          <div style={headerFooterMiniMapControl}>
            <div style={headerFooterMiniMapHeading}>
              <span>Body</span>
              <span style={headerFooterMiniMapPercent}>{map.percentages.body}</span>
            </div>
            <div style={headerFooterMiniMapReadonlyValue}>{map.values.body} pt</div>
          </div>
        </div>
        {renderReservedControl("footerReserved", "Footer", map.percentages.footer, { background: "#fce7f3", borderColor: "#f9a8d4" })}
      </div>
    </div>
  )
}

function PagePanelSection({
  title,
  summary,
  children,
  testId,
  defaultOpen = true,
}: {
  title: string
  summary?: string
  children: ReactNode
  testId?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section data-testid={testId} style={pagePanelSection}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={pagePanelSectionHeader}
      >
        <span style={{ color: "#374151", fontWeight: 700 }}>{title}</span>
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
        <div data-testid={testId ? `${testId}-body` : undefined} style={pagePanelSectionBody}>
          {children}
        </div>
      )}
    </section>
  )
}

export function PagePanel({
  doc,
  sectionIndex,
  editable,
  onUpdateMargin,
  onUpdateReservedZones,
  onToggleReservedZone,
  onUpdateHeaderFooterMode,
}: {
  doc: DocumentNode
  sectionIndex: number
  editable: boolean
  onUpdateMargin: (sectionIndex: number, margin: PageMarginDraft) => void
  onUpdateReservedZones: (sectionIndex: number, reserved: PageReservedDraft, priority: PageReservedZone) => void
  onToggleReservedZone: (sectionIndex: number, zone: "header" | "footer", enabled: boolean) => void
  onUpdateHeaderFooterMode: (sectionIndex: number, mode: PageHeaderFooterHorizontalMode) => void
}) {
  const section = doc.document.sections[sectionIndex] ?? doc.document.sections[0]
  const [draft, setDraft] = useState<PageMarginDraft>(() => section ? readSectionMargin(section) : { top: 0, right: 0, bottom: 0, left: 0 })
  const [reservedDraft, setReservedDraft] = useState<PageReservedDraft>(() => section ? readSectionReserved(section) : { headerReserved: 0, footerReserved: 0 })
  const [reservedPriority, setReservedPriority] = useState<PageReservedZone>("headerReserved")
  const headerFooterMode = section ? readSectionHeaderFooterMode(section) : "body"

  useEffect(() => {
    if (!section) return
    setDraft(readSectionMargin(section))
    setReservedDraft(readSectionReserved(section))
  }, [
    section?.id,
    section?.page.margin.top.value,
    section?.page.margin.right.value,
    section?.page.margin.bottom.value,
    section?.page.margin.left.value,
    section?.page.headerReserved,
    section?.page.footerReserved,
  ])

  const commitDraft = useCallback(() => {
    if (!editable || !section) return
    const next = clampPageMarginDraft(draft, section)
    const current = readSectionMargin(section)
    setDraft(next)
    if (arePageMarginsEqual(next, current)) return
    onUpdateMargin(sectionIndex, next)
  }, [draft, editable, onUpdateMargin, section, sectionIndex])

  const resetDraft = useCallback(() => {
    if (!section) return
    setDraft(readSectionMargin(section))
  }, [section])

  const commitReservedDraft = useCallback(() => {
    if (!editable || !section) return
    const next = clampPageReservedDraft(reservedDraft, section, reservedPriority)
    const current = readSectionReserved(section)
    setReservedDraft(next)
    if (arePageReservedZonesEqual(next, current)) return
    onUpdateReservedZones(sectionIndex, next, reservedPriority)
  }, [editable, onUpdateReservedZones, reservedDraft, reservedPriority, section, sectionIndex])

  const resetReservedDraft = useCallback(() => {
    if (!section) return
    setReservedDraft(readSectionReserved(section))
  }, [section])

  const setMarginSide = (side: PageMarginSide, value: string) => {
    setDraft((prev) => ({ ...prev, [side]: Number(value) || 0 }))
  }

  const setReservedZone = (zone: PageReservedZone, value: string) => {
    setReservedPriority(zone)
    setReservedDraft((prev) => ({ ...prev, [zone]: Number(value) || 0 }))
  }

  const previewReservedZoneValue = useCallback((zone: PageReservedZone, value: number) => {
    if (!section) return
    setReservedPriority(zone)
    setReservedDraft((prev) => clampPageReservedDraft({ ...prev, [zone]: value }, section, zone))
  }, [section])

  const commitReservedZoneValue = useCallback((zone: PageReservedZone, value: number) => {
    if (!editable || !section) return
    setReservedPriority(zone)
    const next = clampPageReservedDraft({ ...reservedDraft, [zone]: value }, section, zone)
    const current = readSectionReserved(section)
    setReservedDraft(next)
    if (arePageReservedZonesEqual(next, current)) return
    onUpdateReservedZones(sectionIndex, next, zone)
  }, [editable, onUpdateReservedZones, reservedDraft, section, sectionIndex])

  const setReservedZoneEnabled = (zone: PageReservedZone, enabled: boolean) => {
    if (!editable || !section) return
    const authoringZone = reservedZoneToAuthoringZone(zone)
    setReservedPriority(zone)
    if (enabled) {
      const next = clampPageReservedDraft({
        ...reservedDraft,
        [zone]: DEFAULT_HEADER_FOOTER_RESERVED_PT,
      }, section, zone)
      setReservedDraft(next)
      onToggleReservedZone(sectionIndex, authoringZone, true)
      return
    }
    if (!canDisableSectionReservedZone(section, authoringZone)) return
    setReservedDraft((prev) => ({ ...prev, [zone]: 0 }))
    onToggleReservedZone(sectionIndex, authoringZone, false)
  }

  const setHeaderFooterMode = (mode: PageHeaderFooterHorizontalMode) => {
    if (!editable || !section) return
    if (mode === headerFooterMode) return
    onUpdateHeaderFooterMode(sectionIndex, mode)
  }

  const setAllMargins = (value: string) => {
    const amount = Number(value) || 0
    setDraft({ top: amount, right: amount, bottom: amount, left: amount })
  }

  const marginValues = [draft.top, draft.right, draft.bottom, draft.left]
  const allMarginValue = marginValues.every((value) => value === marginValues[0]) ? marginValues[0] : null

  const renderMarginInput = (side: PageMarginSide, gridArea: string) => (
    <label key={side} style={{ ...pageCompassField, gridArea }}>
      <span style={pageCompassControlLabel}>{side[0].toUpperCase() + side.slice(1)}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={draft[side]}
        disabled={!editable || !section}
        onChange={(event) => setMarginSide(side, event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          } else if (event.key === "Escape") {
            resetDraft()
            event.currentTarget.blur()
          }
        }}
        style={{ ...pagePanelInput, background: editable ? "white" : "#f8fafc", color: editable ? "#111827" : "#94a3b8" }}
      />
    </label>
  )

  return (
    <div data-testid="page-panel" style={rightRailPanelShell}>
      <RightRailPanelHeader title="Page" testId="page-panel-title" />
      <div style={{ ...rightRailPanelBody, display: "grid", alignContent: "start", gap: 10 }}>
        {section ? (
          <>
            <PagePanelSection title="Page setup" summary={`${section.page.size} / ${section.page.orientation}`} testId="page-setup-card">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={pagePanelFieldLabel}>Size</span>
                  <div style={pagePanelReadOnlyValue}>{section.page.size}</div>
                </div>
                <div style={{ display: "grid", gap: 3 }}>
                  <span style={pagePanelFieldLabel}>Orientation</span>
                  <div style={pagePanelReadOnlyValue}>{section.page.orientation}</div>
                </div>
              </div>
            </PagePanelSection>

            <PagePanelSection title="Margins" summary={formatPageMarginSummary(draft)} testId="page-margins-card">
              <div
                data-testid="page-margin-compass"
                style={{
                  ...pageCompassGrid,
                  gridTemplateAreas: `
                    ". top ."
                    "left all right"
                    ". bottom ."
                  `,
                }}
              >
                {renderMarginInput("top", "top")}
                {renderMarginInput("left", "left")}
                <label style={{ ...pageCompassField, gridArea: "all" }}>
                  <span style={pageCompassControlLabel}>All</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={allMarginValue ?? ""}
                    placeholder="mixed"
                    disabled={!editable || !section}
                    onChange={(event) => setAllMargins(event.target.value)}
                    onBlur={commitDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur()
                      } else if (event.key === "Escape") {
                        resetDraft()
                        event.currentTarget.blur()
                      }
                    }}
                    style={{ ...pagePanelInput, background: editable ? "white" : "#f8fafc", color: editable ? "#111827" : "#94a3b8", textAlign: "center" }}
                  />
                </label>
                {renderMarginInput("right", "right")}
                {renderMarginInput("bottom", "bottom")}
              </div>
              {!editable && (
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>
                  Page settings are read-only in Fill mode.
                </div>
              )}
            </PagePanelSection>

            <PagePanelSection title="Header/Footer" summary={formatHeaderFooterSummary(reservedDraft)} testId="page-header-footer-card" defaultOpen={false}>
              <div style={headerFooterToggleGrid}>
                {([
                  ["headerReserved", "Header"],
                  ["footerReserved", "Footer"],
                ] as const).map(([zone, label]) => {
                  const authoringZone = reservedZoneToAuthoringZone(zone)
                  const enabled = isReservedZoneEnabled(section, reservedDraft, zone)
                  const canDisable = canDisableSectionReservedZone(section, authoringZone)
                  const disabled = !editable || !section || (enabled && !canDisable)
                  return (
                    <label
                      key={zone}
                      title={enabled && !canDisable ? `${label} contains content` : undefined}
                      style={{
                        ...headerFooterToggle,
                        ...(disabled ? headerFooterToggleDisabled : null),
                      }}
                    >
                      <input
                        type="checkbox"
                        role="switch"
                        checked={enabled}
                        disabled={disabled}
                        onChange={(event) => setReservedZoneEnabled(zone, event.target.checked)}
                        style={headerFooterToggleInput}
                      />
                      <span
                        aria-hidden="true"
                        style={headerFooterToggleTrack(enabled, disabled)}
                      >
                        <span style={headerFooterToggleThumb(enabled)} />
                      </span>
                      <span style={headerFooterToggleLabel}>{label}</span>
                    </label>
                  )
                })}
              </div>
              <div role="group" aria-label="Header/footer width mode" style={pagePanelSegmentedControl}>
                {(["body", "full"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={headerFooterMode === mode}
                    disabled={!editable || !section}
                    onClick={() => setHeaderFooterMode(mode)}
                    style={{
                      ...pagePanelSegmentButton,
                      ...(headerFooterMode === mode ? pagePanelSegmentButtonActive : null),
                      ...(!editable || !section ? pagePanelSegmentButtonDisabled : null),
                    }}
                  >
                    {headerFooterModeLabels[mode]}
                  </button>
                ))}
              </div>
              <HeaderFooterMiniMap
                section={section}
                reserved={reservedDraft}
                editable={editable}
                onReservedChange={setReservedZone}
                onReservedCommit={commitReservedDraft}
                onReservedReset={resetReservedDraft}
                onReservedDragChange={previewReservedZoneValue}
                onReservedDragCommit={commitReservedZoneValue}
              />
              {!editable && (
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>
                  Header/footer settings are read-only in Fill mode.
                </div>
              )}
            </PagePanelSection>
          </>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No page section found.</div>
        )}
      </div>
    </div>
  )
}

const pagePanelSection: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  overflow: "hidden",
  background: "#f9fafb",
}

const pagePanelSectionHeader: CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #e5e7eb",
  background: "#f8fafc",
  padding: "6px 7px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "monospace",
  textAlign: "left",
}

const pagePanelSectionBody: CSSProperties = {
  padding: 7,
  background: "white",
}

const pagePanelFieldLabel: CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
}

const pagePanelReadOnlyValue: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "4px 6px",
  color: "#374151",
  background: "#fafafa",
  fontSize: 11,
  fontFamily: "monospace",
}

const pagePanelInput: CSSProperties = {
  width: "100%",
  fontSize: 11,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "4px 6px",
  boxSizing: "border-box",
  fontFamily: "monospace",
}

const pagePanelSegmentedControl: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  border: "1px solid #dbeafe",
  borderRadius: 5,
  overflow: "hidden",
  background: "#f8fafc",
}

const pagePanelSegmentButton: CSSProperties = {
  border: "none",
  borderRight: "1px solid #dbeafe",
  padding: "5px 6px",
  background: "transparent",
  color: "#64748b",
  fontSize: 10,
  fontFamily: "monospace",
  cursor: "pointer",
}

const pagePanelSegmentButtonActive: CSSProperties = {
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 700,
}

const pagePanelSegmentButtonDisabled: CSSProperties = {
  cursor: "default",
  color: "#94a3b8",
}

const headerFooterToggleGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 8,
}

const headerFooterToggle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#ffffff",
  padding: "6px 7px",
  display: "grid",
  gridTemplateColumns: "26px 1fr",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
}

const headerFooterToggleDisabled: CSSProperties = {
  cursor: "default",
  background: "#f8fafc",
  color: "#94a3b8",
}

const headerFooterToggleInput: CSSProperties = {
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
}

function headerFooterToggleTrack(checked: boolean, disabled: boolean): CSSProperties {
  return {
    width: 26,
    height: 14,
    borderRadius: 999,
    background: checked ? "#2563eb" : "#cbd5e1",
    opacity: disabled ? 0.55 : 1,
    position: "relative",
    transition: "background 120ms ease",
  }
}

function headerFooterToggleThumb(checked: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 2,
    left: checked ? 14 : 2,
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.25)",
    transition: "left 120ms ease",
  }
}

const headerFooterToggleLabel: CSSProperties = {
  color: "#334155",
  fontSize: 10,
  fontFamily: "monospace",
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const headerFooterMiniMapShell: CSSProperties = {
  marginTop: 8,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#f8fafc",
  padding: 8,
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 8,
  alignItems: "center",
}

const headerFooterMiniMapSvg: CSSProperties = {
  display: "block",
  filter: "drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08))",
}

const headerFooterMiniMapDragHandle: CSSProperties = {
  cursor: "ns-resize",
  touchAction: "none",
}

const headerFooterMiniMapLegend: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
}

const headerFooterMiniMapLegendRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "10px 1fr",
  gap: 5,
  alignItems: "start",
  minWidth: 0,
  color: "#475569",
  fontSize: 10,
  fontFamily: "monospace",
}

const headerFooterMiniMapSwatch: CSSProperties = {
  width: 8,
  height: 8,
  border: "1px solid",
  borderRadius: 2,
}

const headerFooterMiniMapControl: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 2,
  lineHeight: 1.15,
}

const headerFooterMiniMapHeading: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 6,
  minWidth: 0,
  color: "#334155",
}

const headerFooterMiniMapPercent: CSSProperties = {
  color: "#64748b",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
}

const headerFooterMiniMapInputRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  color: "#64748b",
}

const headerFooterMiniMapInput: CSSProperties = {
  width: 54,
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  padding: "2px 4px",
  fontSize: 10,
  fontFamily: "monospace",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.2,
}

const headerFooterMiniMapUnit: CSSProperties = {
  color: "#64748b",
  fontSize: 10,
}

const headerFooterMiniMapReadonlyValue: CSSProperties = {
  color: "#0f172a",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
}

const pageCompassGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 58px 1fr",
  gap: 5,
  alignItems: "end",
}

const pageCompassField: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
}

const pageCompassControlLabel: CSSProperties = {
  fontSize: 9,
  color: "#9ca3af",
  textAlign: "center",
}
