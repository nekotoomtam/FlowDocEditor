import { describe, expect, it } from "vitest"
import { collectPaginatedLayoutWarnings, type PaginatedDocument } from "@/pagination"
import type { DriftReport, FragmentDrift, GeometryDrift } from "../comparePagination"
import { formatExportReadinessMessage, getExportReadiness, selectAuthoritativeLayoutWarnings } from "../exportReadiness"

function baseInput(overrides: Partial<Parameters<typeof getExportReadiness>[0]> = {}) {
  return {
    layoutStatus: "server-checked" as const,
    layoutError: false,
    serverLayoutCheckedForCurrentPreview: true,
    fontFallback: false,
    driftReport: null,
    isFillMode: false,
    dataReadinessHasErrors: false,
    dataReadinessIssues: [],
    layoutWarnings: [],
    ...overrides,
  }
}

function drift(overrides: Partial<DriftReport>): DriftReport {
  return {
    driftMap: new Map(),
    geometryDriftMap: new Map(),
    driftCount: 0,
    totalParagraphs: 0,
    maxLineDelta: 0,
    pageBreakChanged: false,
    continuationChangedCount: 0,
    ...overrides,
  }
}

function fragmentDrift(overrides: Partial<FragmentDrift> = {}): FragmentDrift {
  return {
    nodeId: "p1",
    zone: "body",
    nodeType: "paragraph",
    browserLineCount: 2,
    serverLineCount: 3,
    lineDelta: 1,
    heightDelta: 14,
    pageMovement: false,
    browserFragmentCount: 1,
    serverFragmentCount: 1,
    continuationChanged: false,
    splitBoundaryMoved: false,
    ...overrides,
  }
}

function geometryDrift(overrides: Partial<GeometryDrift> = {}): GeometryDrift {
  return {
    nodeId: "row1",
    zone: "body",
    nodeType: "row",
    pageMovement: false,
    heightDelta: 12,
    ...overrides,
  }
}

describe("export readiness", () => {
  it("allows export only when authoritative layout and report state are safe", () => {
    expect(getExportReadiness(baseInput()).canExport).toBe(true)
  })

  it("blocks export before the current preview document has a server layout check", () => {
    const readiness = getExportReadiness(baseInput({
      layoutStatus: "server-checked",
      serverLayoutCheckedForCurrentPreview: false,
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("server layout has not checked the current document")
  })

  it("blocks export while server layout is reconciling or failed", () => {
    expect(getExportReadiness(baseInput({ layoutStatus: "reconciling" })).reasons)
      .toContain("server layout check is still running")
    expect(getExportReadiness(baseInput({ layoutError: true })).reasons)
      .toContain("server pagination failed")
  })

  it("blocks export on runtime font fallback and page-break drift", () => {
    const readiness = getExportReadiness(baseInput({
      fontFallback: true,
      driftReport: drift({ pageBreakChanged: true, continuationChangedCount: 1 }),
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("runtime font fallback is active")
    expect(readiness.reasons).toContain("browser/server pagination changes page breaks")
    expect(readiness.reasons).toContain("browser/server pagination changes paragraph continuations")
  })

  it("blocks export on line-count-only drift", () => {
    const readiness = getExportReadiness(baseInput({
      driftReport: drift({
        driftMap: new Map([["p1", fragmentDrift()]]),
        driftCount: 1,
        maxLineDelta: 1,
      }),
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("browser/server pagination changes line wrapping")
  })

  it("blocks export on split-boundary drift even when continuation count is unchanged", () => {
    const readiness = getExportReadiness(baseInput({
      driftReport: drift({
        driftMap: new Map([["p1", fragmentDrift({
          browserLineCount: 6,
          serverLineCount: 6,
          lineDelta: 0,
          browserFragmentCount: 2,
          serverFragmentCount: 2,
          splitBoundaryMoved: true,
        })]]),
        driftCount: 1,
      }),
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("browser/server pagination moves split boundaries")
  })

  it("blocks export on geometry-only drift", () => {
    const readiness = getExportReadiness(baseInput({
      driftReport: drift({
        geometryDriftMap: new Map([["row1", geometryDrift()]]),
      }),
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("browser/server layout geometry differs")
  })

  it("uses zone-specific reasons for header and footer drift", () => {
    const readiness = getExportReadiness(baseInput({
      driftReport: drift({
        driftMap: new Map([["header-p", fragmentDrift({
          nodeId: "header-p",
          zone: "header",
          lineDelta: 1,
        })]]),
        geometryDriftMap: new Map([["footer-spacer", geometryDrift({
          nodeId: "footer-spacer",
          zone: "footer",
          nodeType: "spacer",
        })]]),
        driftCount: 1,
        maxLineDelta: 1,
      }),
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("browser/server header layout differs")
    expect(readiness.reasons).toContain("browser/server footer layout differs")
  })

  it("blocks export when layout fragment warnings are present", () => {
    const readiness = getExportReadiness(baseInput({
      layoutWarnings: [{
        code: "forced-table-split-overflow",
        count: 2,
        message: "table split used forced overflow",
      }],
    }))

    expect(readiness.canExport).toBe(false)
    expect(readiness.reasons).toContain("layout warning: table split used forced overflow")
  })

  it("uses server layout warnings once the current preview has reconciled", () => {
    const serverWarning = {
      code: "forced-table-split-overflow",
      count: 1,
      message: "table split used forced overflow",
    }
    const optimisticWarning = {
      code: "optimistic-only",
      count: 1,
      message: "optimistic warning",
    }

    expect(selectAuthoritativeLayoutWarnings({
      serverLayoutCheckedForCurrentPreview: true,
      serverLayoutWarnings: [serverWarning],
      optimisticLayoutWarnings: [optimisticWarning],
    })).toEqual([serverWarning])
  })

  it("ignores stale server layout warnings before the current preview has reconciled", () => {
    const staleServerWarning = {
      code: "forced-table-split-overflow",
      count: 1,
      message: "table split used forced overflow",
    }

    expect(selectAuthoritativeLayoutWarnings({
      serverLayoutCheckedForCurrentPreview: false,
      serverLayoutWarnings: [staleServerWarning],
      optimisticLayoutWarnings: [],
    })).toEqual([])
  })

  it("collects layout fragment warnings from body, header, and footer fragments", () => {
    const paginated = {
      tocEntries: [],
      sections: [{
        sectionId: "s1",
        pages: [{
          index: 0,
          width: 595,
          height: 842,
          contentBox: { x: 57, y: 57, width: 481, height: 728 },
          headerFragments: [{
            nodeId: "header-row",
            nodeType: "row",
            pageIndex: 0,
            x: 0,
            y: 0,
            width: 100,
            height: 10,
            warnings: [{ code: "forced-table-split-overflow", message: "header warning" }],
          }],
          fragments: [{
            nodeId: "body-row",
            nodeType: "row",
            pageIndex: 0,
            x: 0,
            y: 10,
            width: 100,
            height: 10,
            warnings: [{ code: "forced-table-split-overflow", message: "body warning" }],
          }],
          footerFragments: [{
            nodeId: "footer-row",
            nodeType: "row",
            pageIndex: 0,
            x: 0,
            y: 20,
            width: 100,
            height: 10,
            warnings: [{ code: "forced-table-split-overflow", message: "footer warning" }],
          }],
        }],
      }],
    } as unknown as PaginatedDocument

    expect(collectPaginatedLayoutWarnings(paginated)).toEqual([{
      code: "forced-table-split-overflow",
      count: 3,
      message: "table split used forced overflow",
    }])
  })

  it("blocks fill mode export on data readiness errors with the field-specific reason", () => {
    const readiness = getExportReadiness(baseInput({
      isFillMode: true,
      dataReadinessHasErrors: true,
      dataReadinessIssues: [{
        source: "data-snapshot",
        code: "required_missing",
        severity: "error",
        key: "customer.name",
        message: "required field is missing",
      }],
    }))

    expect(readiness.canExport).toBe(false)
    expect(formatExportReadinessMessage(readiness))
      .toContain("fill data error for customer.name: required field is missing")
  })

  it("blocks fill mode final export when required values are missing", () => {
    const readiness = getExportReadiness(baseInput({
      isFillMode: true,
      dataReadinessHasErrors: false,
      dataReadinessIssues: [{
        source: "data-snapshot",
        code: "missing-required-value",
        severity: "warning",
        key: "customer.name",
        message: 'required field "customer.name" has no value',
      }],
    }))

    expect(readiness.canExport).toBe(false)
    expect(formatExportReadinessMessage(readiness))
      .toContain('fill data required value missing for customer.name: required field "customer.name" has no value')
  })

  it("allows fill mode export when only non-required warnings remain", () => {
    const readiness = getExportReadiness(baseInput({
      isFillMode: true,
      dataReadinessHasErrors: false,
      dataReadinessIssues: [{
        source: "data-snapshot",
        code: "unknown-key",
        severity: "warning",
        key: "legacy.field",
        message: 'data snapshot contains unknown key "legacy.field"',
      }],
    }))

    expect(readiness.canExport).toBe(true)
  })
})
