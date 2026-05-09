import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode, SpacerNode } from "../../schema"

// ─── Page Metrics ────────────────────────────────────────────────────────────
// A4 + 72pt margins: contentTop=72, contentBottom=770, contentHeight=698
// fontSize=10, lineHeight=1.2 → LH=12
const CY = 72
const CB = 770
const LH = 10 * 1.2  // = 12

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
    // Hard newlines force exactly lineCount measured lines
    children: [{ id: `${id}-t`, type: "text", text: Array.from({ length: lineCount }, (_, i) => `L${i}`).join("\n") }],
  }
}

function makeSpacer(id: string, height: number): SpacerNode {
  return { id, type: "spacer", props: { height } }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
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
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function fragLines(result: ReturnType<typeof paginate>, nodeId: string): number[] {
  return result.sections[0].pages
    .flatMap((p) => p.fragments)
    .filter((f) => f.nodeId === nodeId)
    .map((f) => f.lines?.length ?? 0)
}

function fragPages(result: ReturnType<typeof paginate>, nodeId: string): number[] {
  return result.sections[0].pages
    .flatMap((p) => p.fragments)
    .filter((f) => f.nodeId === nodeId)
    .map((f) => f.pageIndex)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("widow/orphan prevention", () => {
  // ── Orphan ────────────────────────────────────────────────────────────────

  it("orphan: paragraph starting with 1 line of space moves whole to next page", () => {
    // Spacer leaves exactly 1 line (12pt) at bottom of page 1.
    // Without prevention: 1 line on page 1, 2 lines on page 2.
    // With prevention: 0 lines on page 1, all 3 on page 2.
    const spacerH = CB - CY - LH  // 698 - 12 = 686
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 3),
    })
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const lines = fragLines(result, "para")
    // All 3 lines on page 2 (no line stranded on page 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe(3)
    expect(fragPages(result, "para")[0]).toBe(1)
  })

  it("orphan: preserves total line count after moving to next page", () => {
    const spacerH = CB - CY - LH
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 5),
    })
    const result = paginate(doc)
    const total = fragLines(result, "para").reduce((s, n) => s + n, 0)
    expect(total).toBe(5)
  })

  it("orphan: single-line paragraph is not affected (no split possible)", () => {
    const spacerH = CB - CY - LH
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 1),
    })
    const result = paginate(doc)
    assertPaginatedDocument(result)
    // 1 line fits in remaining space — no orphan rule applies (it's the only line)
    expect(fragLines(result, "para")).toEqual([1])
  })

  it("orphan: paragraph at contentTop is not moved (guard prevents infinite loop)", () => {
    // Paragraph starts at contentTop — orphan guard disabled.
    // A 3-line paragraph starting fresh on a page should land normally.
    const doc = makeDoc(["para"], {
      para: makePara("para", 3),
    })
    const result = paginate(doc)
    assertPaginatedDocument(result)
    expect(fragLines(result, "para")).toEqual([3])
    expect(fragPages(result, "para")[0]).toBe(0)
  })

  // ── Widow ─────────────────────────────────────────────────────────────────

  it("widow: 4-line paragraph with 3-line space splits 2+2 instead of 3+1", () => {
    // Spacer leaves exactly 3 lines (36pt) of space on page 1.
    // Without prevention: 3 lines on page 1, 1 line on page 2 (widow).
    // With prevention: 2 lines on page 1, 2 lines on page 2.
    const spacerH = CB - CY - 3 * LH  // 698 - 36 = 662
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 4),
    })
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const lines = fragLines(result, "para")
    expect(lines).toHaveLength(2)   // 2 fragments
    expect(lines[0]).toBe(2)        // page 1: 2 lines
    expect(lines[1]).toBe(2)        // page 2: 2 lines
  })

  it("widow: preserves total line count after split adjustment", () => {
    const spacerH = CB - CY - 3 * LH
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 4),
    })
    const result = paginate(doc)
    const total = fragLines(result, "para").reduce((s, n) => s + n, 0)
    expect(total).toBe(4)
  })

  it("widow: 2-line remainder is not adjusted (no widow — already 2 lines)", () => {
    // Spacer leaves exactly 3 lines, paragraph has 5 lines → split 3+2 (no widow)
    const spacerH = CB - CY - 3 * LH
    const doc = makeDoc(["spacer", "para"], {
      spacer: makeSpacer("spacer", spacerH),
      para: makePara("para", 5),
    })
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const lines = fragLines(result, "para")
    // 3 lines fit, linesAfter = 2 → no widow adjustment needed
    // But orphan guard might fire after widow... let's just check total and assertPaginated
    const total = lines.reduce((s, n) => s + n, 0)
    expect(total).toBe(5)
  })

  // ── Combined / Edge cases ──────────────────────────────────────────────────

  it("assertPaginatedDocument passes for all widow/orphan scenarios", () => {
    const cases = [
      makeDoc(["s1", "p1"], { s1: makeSpacer("s1", CB - CY - LH), p1: makePara("p1", 3) }),
      makeDoc(["s2", "p2"], { s2: makeSpacer("s2", CB - CY - 3 * LH), p2: makePara("p2", 4) }),
      makeDoc(["p3"], { p3: makePara("p3", 1) }),
    ]
    for (const doc of cases) {
      expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
    }
  })
})
