import type { PageFragment, PaginatedDocument } from "./types"

export interface LayoutWarningSummary {
  code: string
  count: number
  message: string
}

export const LAYOUT_WARNINGS_BLOCKED_CODE = "LAYOUT_WARNINGS_BLOCKED"
export const HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE = "header-footer-reserved-overflow"

const GEOMETRY_EPSILON = 0.01

function warningMessageForCode(code: string): string {
  switch (code) {
    case HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE:
      return "header/footer content exceeds reserved height; PDF clips overflow and DOCX may reflow or show extra content"
    case "forced-table-split-overflow":
      return "table split used forced overflow"
    case "forced-flow-table-split-overflow":
      return "flow-table split used forced overflow"
    default:
      return code
  }
}

function addWarningSummary(
  map: Map<string, LayoutWarningSummary>,
  code: string,
): void {
  const existing = map.get(code)
  if (existing) {
    existing.count += 1
  } else {
    map.set(code, {
      code,
      count: 1,
      message: warningMessageForCode(code),
    })
  }
}

function collectFragmentWarnings(
  map: Map<string, LayoutWarningSummary>,
  fragment: PageFragment,
): void {
  for (const warning of fragment.warnings ?? []) {
    addWarningSummary(map, warning.code)
  }
}

function collectFragmentVisualBounds(fragments: PageFragment[]): { top: number; bottom: number } | null {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const fragment of fragments) {
    top = Math.min(top, fragment.y)
    bottom = Math.max(bottom, fragment.y + fragment.height)
    for (const line of fragment.lines ?? []) {
      top = Math.min(top, line.y)
      bottom = Math.max(bottom, line.y + line.height)
    }
  }

  return Number.isFinite(top) && Number.isFinite(bottom) ? { top, bottom } : null
}

function collectHeaderFooterReservedOverflowWarnings(
  map: Map<string, LayoutWarningSummary>,
  paginated: PaginatedDocument,
): void {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const zones = [
        { box: page.headerZoneBox, fragments: page.headerFragments },
        { box: page.footerZoneBox, fragments: page.footerFragments },
      ]

      for (const zone of zones) {
        if (!zone.box || zone.fragments.length === 0) continue
        const bounds = collectFragmentVisualBounds(zone.fragments)
        if (!bounds) continue
        const zoneTop = zone.box.y
        const zoneBottom = zone.box.y + zone.box.height
        if (bounds.top < zoneTop - GEOMETRY_EPSILON || bounds.bottom > zoneBottom + GEOMETRY_EPSILON) {
          addWarningSummary(map, HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE)
        }
      }
    }
  }
}

export function isBlockingLayoutWarning(warning: Pick<LayoutWarningSummary, "code">): boolean {
  return warning.code !== HEADER_FOOTER_RESERVED_OVERFLOW_WARNING_CODE
}

export function filterBlockingLayoutWarnings(warnings: LayoutWarningSummary[]): LayoutWarningSummary[] {
  return warnings.filter(isBlockingLayoutWarning)
}

export function collectPaginatedLayoutWarnings(paginated: PaginatedDocument | null): LayoutWarningSummary[] {
  if (!paginated) return []

  const warnings = new Map<string, LayoutWarningSummary>()
  collectHeaderFooterReservedOverflowWarnings(warnings, paginated)
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.headerFragments) collectFragmentWarnings(warnings, fragment)
      for (const fragment of page.fragments) collectFragmentWarnings(warnings, fragment)
      for (const fragment of page.footerFragments) collectFragmentWarnings(warnings, fragment)
    }
  }

  return Array.from(warnings.values())
}
