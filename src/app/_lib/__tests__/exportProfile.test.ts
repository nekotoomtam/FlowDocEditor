import { describe, expect, it } from "vitest"
import {
  classifyFlowDocExportScale,
  formatFlowDocExportProfileSummary,
  formatFlowDocExportScaleNote,
  parseFlowDocExportProfileHeader,
  serializeFlowDocExportProfile,
  type FlowDocExportProfile,
} from "../exportProfile"

describe("export profile header", () => {
  it("round-trips PDF export profile metadata and formats a compact summary", () => {
    const profile: FlowDocExportProfile = {
      format: "pdf",
      pageCount: 3,
      fragmentCount: 42,
      paginateMs: 120,
      assertMs: 5,
      renderMs: 900,
      totalMs: 1300,
      pdfPageRenderMs: 850,
      pdfFinalizeMs: 50,
      pdfPageBatchSize: 20,
    }

    const parsed = parseFlowDocExportProfileHeader(serializeFlowDocExportProfile(profile))

    expect(parsed).toEqual(profile)
    expect(formatFlowDocExportProfileSummary(parsed)).toBe("PDF export ready: 3 pages, 1.3s total, 850ms page render, 50ms finalize, batches of 20.")
  })

  it("round-trips DOCX export profile metadata without PDF batch text", () => {
    const profile: FlowDocExportProfile = {
      format: "docx",
      pageCount: 1,
      fragmentCount: 8,
      paginateMs: 25,
      assertMs: 1,
      renderMs: 75,
      totalMs: 110,
    }

    const parsed = parseFlowDocExportProfileHeader(serializeFlowDocExportProfile(profile))

    expect(parsed).toEqual(profile)
    expect(formatFlowDocExportProfileSummary(parsed)).toBe("DOCX export ready: 1 page, 110ms total, 75ms render.")
  })

  it("round-trips optional pagination profiling metadata", () => {
    const profile: FlowDocExportProfile = {
      format: "pdf",
      pageCount: 2,
      fragmentCount: 12,
      paginateMs: 100,
      assertMs: 1,
      renderMs: 50,
      totalMs: 160,
      paginationProfile: {
        version: 1,
        source: "export-pdf",
        totalMs: 100,
        pageCount: 2,
        fragmentCount: 12,
        stages: [
          { name: "paragraph-measure", totalMs: 70, count: 10, avgMs: 7, maxMs: 12, minMs: 1 },
        ],
      },
    }

    const parsed = parseFlowDocExportProfileHeader(serializeFlowDocExportProfile(profile))

    expect(parsed).toEqual(profile)
  })

  it("ignores malformed or incomplete header values", () => {
    expect(parseFlowDocExportProfileHeader(null)).toBeNull()
    expect(parseFlowDocExportProfileHeader("{")).toBeNull()
    expect(parseFlowDocExportProfileHeader(JSON.stringify({ format: "pdf", pageCount: 1 }))).toBeNull()
    expect(parseFlowDocExportProfileHeader(JSON.stringify({ format: "html", pageCount: 1 }))).toBeNull()
  })

  it("classifies large export profiles without blocking successful exports", () => {
    const baseProfile: FlowDocExportProfile = {
      format: "pdf",
      pageCount: 99,
      fragmentCount: 800,
      paginateMs: 1000,
      assertMs: 10,
      renderMs: 2000,
      totalMs: 3100,
      pdfPageRenderMs: 1800,
      pdfFinalizeMs: 200,
      pdfPageBatchSize: 20,
    }

    expect(classifyFlowDocExportScale(baseProfile)).toBe("standard")
    expect(formatFlowDocExportScaleNote(baseProfile)).toBeNull()
    expect(classifyFlowDocExportScale({ ...baseProfile, pageCount: 100 })).toBe("large")
    expect(formatFlowDocExportScaleNote({ ...baseProfile, pageCount: 100 })).toBe(
      "Large PDF profile captured; watch total, page-render, and finalize time.",
    )
    expect(classifyFlowDocExportScale({ ...baseProfile, pageCount: 300 })).toBe("very-large")
    expect(formatFlowDocExportScaleNote({ ...baseProfile, pageCount: 300 })).toBe(
      "Very large PDF profile captured; use this timing before choosing background or chunked export.",
    )
  })
})
