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
        lineStart?: number
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
          lineStart: f.lineStart,
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

  it("paragraph driftCount is unaffected by non-paragraph fragments", () => {
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

  it("tracks height drift for row fragment", () => {
    const browser = makeDoc([{ pages: [{ fragments: [{ nodeId: "row1", nodeType: "row", height: 24 }] }] }])
    const server  = makeDoc([{ pages: [{ fragments: [{ nodeId: "row1", nodeType: "row", height: 48 }] }] }])
    const report = comparePagination(browser, server)
    expect(report.geometryDriftMap.size).toBe(1)
    const gd = report.geometryDriftMap.get("row1")!
    expect(gd.nodeType).toBe("row")
    expect(gd.heightDelta).toBe(24)
    expect(gd.pageMovement).toBe(false)
  })

  it("tracks page movement for table-row fragment", () => {
    const browser = makeDoc([{ pages: [
      { fragments: [{ nodeId: "tr1", nodeType: "table-row", height: 24 }] },
      { fragments: [] },
    ] }])
    const server = makeDoc([{ pages: [
      { fragments: [] },
      { fragments: [{ nodeId: "tr1", nodeType: "table-row", height: 24 }] },
    ] }])
    const report = comparePagination(browser, server)
    expect(report.pageBreakChanged).toBe(true)
    const gd = report.geometryDriftMap.get("tr1")!
    expect(gd.pageMovement).toBe(true)
    expect(gd.nodeType).toBe("table-row")
  })

  it("reports no geometry drift when row matches exactly", () => {
    const doc = makeDoc([{ pages: [{ fragments: [{ nodeId: "row1", nodeType: "row", height: 24 }] }] }])
    const report = comparePagination(doc, doc)
    expect(report.geometryDriftMap.size).toBe(0)
  })

  // ── Continuation metadata ────────────────────────────────────────────────

  it("continuationChanged: browser 1 fragment, server 2 fragments", () => {
    const browser = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24, lineStart: 0 }] },
    ] }])
    const server = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12, lineStart: 0 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12, lineStart: 1 }] },
    ] }])
    const report = comparePagination(browser, server)
    const drift = report.driftMap.get("p1")!
    expect(drift).toBeDefined()
    expect(drift.browserFragmentCount).toBe(1)
    expect(drift.serverFragmentCount).toBe(2)
    expect(drift.continuationChanged).toBe(true)
    expect(report.continuationChangedCount).toBe(1)
  })

  it("splitBoundaryMoved: same fragment count but different split points", () => {
    // Both browser and server split the paragraph across 2 pages,
    // but browser splits at line 30 while server splits at line 28.
    const browser = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(30), height: 360, lineStart: 0 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(10), height: 120, lineStart: 30 }] },
    ] }])
    const server = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(28), height: 336, lineStart: 0 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(12), height: 144, lineStart: 28 }] },
    ] }])
    const report = comparePagination(browser, server)
    const drift = report.driftMap.get("p1")!
    expect(drift).toBeDefined()
    expect(drift.continuationChanged).toBe(false)
    expect(drift.splitBoundaryMoved).toBe(true)
    expect(drift.browserFragmentCount).toBe(2)
    expect(drift.serverFragmentCount).toBe(2)
    expect(report.continuationChangedCount).toBe(0)
  })

  it("no continuation drift when both sides split at same boundary", () => {
    const splitDoc = makeDoc([{ pages: [
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(30), height: 360, lineStart: 0 }] },
      { fragments: [{ nodeId: "p1", nodeType: "paragraph", lines: lines(10), height: 120, lineStart: 30 }] },
    ] }])
    const report = comparePagination(splitDoc, splitDoc)
    expect(report.driftCount).toBe(0)
    expect(report.continuationChangedCount).toBe(0)
  })

  it("continuationChangedCount counts multiple paragraphs with changed splits", () => {
    const browser = makeDoc([{ pages: [
      { fragments: [
        { nodeId: "p1", nodeType: "paragraph", lines: lines(2), height: 24, lineStart: 0 },
        { nodeId: "p2", nodeType: "paragraph", lines: lines(2), height: 24, lineStart: 0 },
      ] },
    ] }])
    const server = makeDoc([{ pages: [
      { fragments: [
        { nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12, lineStart: 0 },
        { nodeId: "p2", nodeType: "paragraph", lines: lines(2), height: 24, lineStart: 0 },
      ] },
      { fragments: [
        { nodeId: "p1", nodeType: "paragraph", lines: lines(1), height: 12, lineStart: 1 },
      ] },
    ] }])
    const report = comparePagination(browser, server)
    // p1: browser=1 frag, server=2 frags → continuationChanged
    // p2: both 1 frag, same lines → no drift
    expect(report.continuationChangedCount).toBe(1)
  })

  it("stack geometry drift is tracked independently from row", () => {
    const browser = makeDoc([{ pages: [{ fragments: [
      { nodeId: "st1", nodeType: "stack", height: 24 },
    ] }] }])
    const server = makeDoc([{ pages: [{ fragments: [
      { nodeId: "st1", nodeType: "stack", height: 36 },
    ] }] }])
    const report = comparePagination(browser, server)
    expect(report.geometryDriftMap.has("st1")).toBe(true)
    expect(report.geometryDriftMap.get("st1")!.heightDelta).toBe(12)
  })
})
