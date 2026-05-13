import type { PageFragment, PaginatedDocument } from "./types"

export interface LayoutWarningSummary {
  code: string
  count: number
  message: string
}

export const LAYOUT_WARNINGS_BLOCKED_CODE = "LAYOUT_WARNINGS_BLOCKED"

function warningMessageForCode(code: string): string {
  switch (code) {
    case "forced-table-split-overflow":
      return "table split used forced overflow"
    default:
      return code
  }
}

function collectFragmentWarnings(
  map: Map<string, LayoutWarningSummary>,
  fragment: PageFragment,
): void {
  for (const warning of fragment.warnings ?? []) {
    const existing = map.get(warning.code)
    if (existing) {
      existing.count += 1
    } else {
      map.set(warning.code, {
        code: warning.code,
        count: 1,
        message: warningMessageForCode(warning.code),
      })
    }
  }
}

export function collectPaginatedLayoutWarnings(paginated: PaginatedDocument | null): LayoutWarningSummary[] {
  if (!paginated) return []

  const warnings = new Map<string, LayoutWarningSummary>()
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.headerFragments) collectFragmentWarnings(warnings, fragment)
      for (const fragment of page.fragments) collectFragmentWarnings(warnings, fragment)
      for (const fragment of page.footerFragments) collectFragmentWarnings(warnings, fragment)
    }
  }

  return Array.from(warnings.values())
}
