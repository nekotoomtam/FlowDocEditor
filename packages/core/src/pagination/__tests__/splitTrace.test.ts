import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode, SpacerNode } from "../../schema"
import type { ParagraphSplitDecision } from "../types"

// ─── Page metrics ─────────────────────────────────────────────────────────────
// A4 + 72pt margins: contentHeight=698, LH=12, LINES_PER_PAGE=58
const LH = 10 * 1.2
const LINES_PER_PAGE = Math.floor(698 / LH)  // 58

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePara(id: string, lineCount: number): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-t`, type: "text", text: Array.from({ length: lineCount }, (_, i) => `L${i}`).join("\n") }],
  }
}

function makeSpacer(id: string, height: number): SpacerNode {
  return { id, type: "spacer", props: { height } }
}

function makeDoc(childIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function collect(doc: DocumentNode): ParagraphSplitDecision[] {
  const decisions: ParagraphSplitDecision[] = []
  paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker, (d) => decisions.push(d))
  return decisions
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("paragraph split trace", () => {
  it("fast-path: emits one decision with isSplit=false", () => {
    const doc = makeDoc(["p"], { p: makePara("p", 3) })
    const decisions = collect(doc)
    expect(decisions).toHaveLength(1)
    const d = decisions[0]
    expect(d.nodeId).toBe("p")
    expect(d.isSplit).toBe(false)
    expect(d.fragmentIndex).toBe(0)
    expect(d.lineCount).toBe(3)
    expect(d.forcedProgress).toBe(false)
    expect(d.orphanPrevented).toBe(false)
    expect(d.widowPrevented).toBe(false)
  })

  it("split: emits one decision per fragment placed", () => {
    const lineCount = LINES_PER_PAGE + 5
    const doc = makeDoc(["p"], { p: makePara("p", lineCount) })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    expect(decisions).toHaveLength(2)
    expect(decisions[0].isSplit).toBe(true)
    expect(decisions[1].isSplit).toBe(true)
  })

  it("split: fragmentIndex increments from 0", () => {
    const lineCount = LINES_PER_PAGE * 2 + 5
    const doc = makeDoc(["p"], { p: makePara("p", lineCount) })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    expect(decisions).toHaveLength(3)
    decisions.forEach((d, i) => expect(d.fragmentIndex).toBe(i))
  })

  it("split: total lineCount across decisions equals paragraph line count", () => {
    const lineCount = LINES_PER_PAGE + 10
    const doc = makeDoc(["p"], { p: makePara("p", lineCount) })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    const total = decisions.reduce((s, d) => s + d.lineCount, 0)
    expect(total).toBe(lineCount)
  })

  it("split: availableHeight > 0 for every decision", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    for (const d of decisions) {
      expect(d.availableHeight).toBeGreaterThan(0)
    }
  })

  it("split: fragmentHeight > 0 for every decision", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    for (const d of decisions) {
      expect(d.fragmentHeight).toBeGreaterThan(0)
    }
  })

  it("orphanPrevented: flag is true on fragment placed after orphan advance", () => {
    // Spacer leaves exactly 1 line of space → orphan prevention fires
    const spacerH = 698 - LH  // leaves 12pt = 1 line
    const doc = makeDoc(["spacer", "p"], {
      spacer: makeSpacer("spacer", spacerH),
      p: makePara("p", 3),
    })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    // Whole paragraph moves to next page as a single fragment
    expect(decisions).toHaveLength(1)
    expect(decisions[0].orphanPrevented).toBe(true)
  })

  it("widowPrevented: flag is true on fragment where count was reduced", () => {
    // Spacer leaves 3 lines of space, paragraph has 4 lines → widow fires on first fragment
    const spacerH = 698 - 3 * LH  // leaves 36pt = 3 lines
    const doc = makeDoc(["spacer", "p"], {
      spacer: makeSpacer("spacer", spacerH),
      p: makePara("p", 4),
    })
    const decisions = collect(doc).filter((d) => d.nodeId === "p")
    expect(decisions).toHaveLength(2)
    expect(decisions[0].widowPrevented).toBe(true)
    expect(decisions[0].lineCount).toBe(2)   // reduced from 3 to 2
    expect(decisions[1].lineCount).toBe(2)   // remaining 2 on next page
  })

  it("multiple paragraphs: decisions for each paragraph are emitted", () => {
    const doc = makeDoc(["p1", "p2"], {
      p1: makePara("p1", 3),
      p2: makePara("p2", 3),
    })
    const decisions = collect(doc)
    const ids = decisions.map((d) => d.nodeId)
    expect(ids).toContain("p1")
    expect(ids).toContain("p2")
  })
})
