import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { clampSectionReservedZones, MIN_HEADER_FOOTER_RESERVED_PT } from "@/document"
import { getPageDimensions } from "@/pagination"
import type { DocumentNode } from "@/schema"
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
  return `${Math.max(0, value ?? 0)} pt`
}

function formatHeaderFooterSummary(reserved: PageReservedDraft): string {
  return `${formatReservedZoneValue(reserved.headerReserved)} / ${formatReservedZoneValue(reserved.footerReserved)}`
}

function hasReservedZoneRoot(section: DocumentSection, zone: PageReservedZone): boolean {
  return zone === "headerReserved"
    ? Boolean(section.headerRootId || section.headerFirstPageRootId)
    : Boolean(section.footerRootId || section.footerFirstPageRootId)
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
  onUpdateHeaderFooterMode,
}: {
  doc: DocumentNode
  sectionIndex: number
  editable: boolean
  onUpdateMargin: (sectionIndex: number, margin: PageMarginDraft) => void
  onUpdateReservedZones: (sectionIndex: number, reserved: PageReservedDraft) => void
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
    onUpdateReservedZones(sectionIndex, next)
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                {([
                  ["headerReserved", "Header"],
                  ["footerReserved", "Footer"],
                ] as const).map(([zone, label]) => {
                  const zoneMinimum = section && (hasReservedZoneRoot(section, zone) || reservedDraft[zone] > 0)
                    ? MIN_HEADER_FOOTER_RESERVED_PT
                    : 0
                  return (
                    <label key={zone} style={{ display: "grid", gap: 3 }}>
                      <span style={pagePanelFieldLabel}>{label}</span>
                      <input
                        type="number"
                        min={zoneMinimum}
                        step={1}
                        value={reservedDraft[zone]}
                        disabled={!editable || !section}
                        onChange={(event) => setReservedZone(zone, event.target.value)}
                        onBlur={commitReservedDraft}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur()
                          } else if (event.key === "Escape") {
                            resetReservedDraft()
                            event.currentTarget.blur()
                          }
                        }}
                        style={{ ...pagePanelInput, background: editable ? "white" : "#f8fafc", color: editable ? "#111827" : "#94a3b8" }}
                      />
                    </label>
                  )
                })}
              </div>
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
