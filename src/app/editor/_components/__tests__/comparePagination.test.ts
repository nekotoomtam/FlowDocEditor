import { describe, it, expect } from "vitest"
import { comparePagination } from "../comparePagination"
import type { PaginatedDocument } from "@/pagination"

// Minimal PaginatedDocument builder for tests.
// Only populates fields that comparePagination reads.
function makeDoc(
  sections: Array<{
    pages: Array<{
      fragments: Array<{
        nodeId: string
        nodeType: string
        lines?: unknown[]
        height?: number
      }>
    }>
  }>,
): PaginatedDocument {
  return {
    tocEntries: [],
    sections: sections.map((s) => ({
      sectionId: "s1",
      pages: s.pages.map((p, pi) => ({
        index: pi,
        width: 595,
        height: 842,
        contentBox: { x: 57, y: 57, width: 481, height: 728 },
        fragments: p.fragments.map((f) => ({
          nodeId: f.nodeId,
          nodeType: f.nodeType,
          x: 57,
          y: 57,
          width: 481,
          height: f.height ?? 12,
          lines: f.lines as never,
          renderProps: undefined,
          parentNodeId: undefined,
        })),
        headerFragments: [],
        footerFragments: [],
      })),
    })),
  } as unknown as PaginatedDocument
}

function lines(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ text: `line${i}`, x: 57, y: 0, width: 100, height: 12 }))
}

describe("comparePagination", () => {
  it("returns empty driftMap when browser and server match", () => {
    const doc = makeDoc([{ pages: [{ fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] }] }])
    const report = comparePagination(doc, doc)
    expect(report.driftCount).toBe(0)
    expect(report.driftMap.size).toBe(0)
    expect(report.pageBreakChanged).toBe(false)
  })

  it("detects positive line-count drift (server wraps more)", () => {
    const browser = makeDoc([{ pages: [{ fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] }] }])
    const server  = makeDoc([{ pages: [{ fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(3), height: 36 }] }] }])
    const report = comparePagination(browser, server)
    expect(report.driftCount).toBe(1)
    const drift = report.driftMap.get("p1")!
    expect(drift.lineDelta).toBe(1)
    expect(drift.browserLineCount).toBe(2)
    expect(drift.serverLineCount).toBe(3)
    expect(drift.pageMovement).toBe(false)
  })

  it("detects negative line-count drift (server wraps fewer)", () => {
    const browser = makeDoc([{ pages: [{ fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(3), height: 36 }] }] }])
    const server  = makeDoc([{ pages: [{ fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] }] }])
    const report = comparePagination(browser, server)
    const drift = report.driftMap.get("p1")!
    expect(drift.lineDelta).toBe(-1)
    expect(report.maxLineDelta).toBe(1)
  })

  it("detects page-movement drift when line counts match but paragraph moves page", () => {
    const browser = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] },
      { fragments: [] },
    ] }])
    const server = makeDoc([{ pages: [
      { fragments: [] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] },
    ] }])
    const report = comparePagination(browser, server)
    expect(report.pageBreakChanged).toBe(true)
    const drift = report.driftMap.get("p1")!
    expect(drift.lineDelta).toBe(0)
    expect(drift.pageMovement).toBe(true)
  })

  it("aggregates line counts for paragraphs split across pages", () => {
    // Browser: p1 split across 2 pages (1 line + 1 line = 2 total)
    const browser = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12 }] },
    ] }])
    // Server: p1 fits on 1 page (2 lines total)
    const server = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24 }] },
      { fragments: [] },
    ] }])
    const report = comparePagination(browser, server)
    // Line counts both = 2, but page layout differs → pageMovement drift only
    expect(report.driftMap.get("p1")?.lineDelta).toBe(0)
    expect(report.driftMap.get("p1")?.pageMovement).toBe(true)
    expect(report.pageBreakChanged).toBe(true)
  })

  it("aggregates correctly when browser and server both split the same paragraph identically", () => {
    const splitDoc = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12 }] },
    ] }])
    const report = comparePagination(splitDoc, splitDoc)
    expect(report.driftCount).toBe(0)
  })

  it("ignores non-paragraph fragments", () => {
    const browser = makeDoc([{ pages: [{ fragments: [{ nodeId: "row1", nodeType: "row", height: 24 }] }] }])
    const server  = makeDoc([{ pages: [{ fragments: [{ nodeId: "row1", nodeType: "row", height: 48 }] }] }])
    const report = comparePagination(browser, server)
    expect(report.driftCount).toBe(0)
    expect(report.totalParagraphs).toBe(0)
  })

  it("reports correct totalParagraphs count", () => {
    const doc = makeDoc([{ pages: [{ fragments: [
      { nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12 },
      { nodeId: "p2", nodeType: "paragraph", lines: lines(1), height: 12 },
      { nodeId: "row1", nodeType: "row", height: 24 },
    ] }] }])
    const report = comparePagination(doc, doc)
    expect(report.totalParagraphs).toBe(2)
  })
})
