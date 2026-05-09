import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Page Metrics ────────────────────────────────────────────────────────────
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

function getFrags(result: ReturnType<typeof paginate>, nodeId: string) {
  return result.sections[0].pages
    .flatMap((p) => p.fragments)
    .filter((f) => f.nodeId === nodeId)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("paragraph fragment metadata", () => {
  it("fast-path: single fragment has correct metadata", () => {
    const lineCount = 3
    const doc = makeDoc(["p"], { p: makePara("p", lineCount) })
    const [frag] = getFrags(paginate(doc), "p")

    expect(frag.fragmentIndex).toBe(0)
    expect(frag.lineStart).toBe(0)
    expect(frag.lineEnd).toBe(lineCount)
    expect(frag.continuesFrom).toBe(false)
    expect(frag.isContinued).toBe(false)
  })

  it("split: first fragment is not continued-from, is continued", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    const frags = getFrags(paginate(doc), "p")

    const first = frags[0]
    expect(first.fragmentIndex).toBe(0)
    expect(first.continuesFrom).toBe(false)
    expect(first.isContinued).toBe(true)
    expect(first.lineStart).toBe(0)
  })

  it("split: last fragment is continued-from, is not continued", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    const frags = getFrags(paginate(doc), "p")
    const last = frags[frags.length - 1]

    expect(last.fragmentIndex).toBe(frags.length - 1)
    expect(last.continuesFrom).toBe(true)
    expect(last.isContinued).toBe(false)
    expect(last.lineEnd).toBe(LINES_PER_PAGE + 5)
  })

  it("split: middle fragment (3-page span) has both flags true", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE * 2 + 5) })
    const frags = getFrags(paginate(doc), "p")

    expect(frags.length).toBe(3)
    const mid = frags[1]
    expect(mid.continuesFrom).toBe(true)
    expect(mid.isContinued).toBe(true)
    expect(mid.fragmentIndex).toBe(1)
  })

  it("split: lineStart/lineEnd are contiguous with no gaps or overlaps", () => {
    const lineCount = LINES_PER_PAGE + 10
    const doc = makeDoc(["p"], { p: makePara("p", lineCount) })
    const frags = getFrags(paginate(doc), "p")

    // lineEnd of fragment N === lineStart of fragment N+1
    for (let i = 0; i < frags.length - 1; i++) {
      expect(frags[i].lineEnd).toBe(frags[i + 1]!.lineStart)
    }
    // First starts at 0, last ends at total line count
    expect(frags[0].lineStart).toBe(0)
    expect(frags[frags.length - 1].lineEnd).toBe(lineCount)
  })

  it("split: lineEnd - lineStart equals fragment line count", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    const frags = getFrags(paginate(doc), "p")

    for (const frag of frags) {
      const fragLineCount = frag.lines?.length ?? 0
      expect(frag.lineEnd! - frag.lineStart!).toBe(fragLineCount)
    }
  })

  it("split: fragmentIndex is strictly increasing starting from 0", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE * 2 + 5) })
    const frags = getFrags(paginate(doc), "p")

    frags.forEach((frag, i) => {
      expect(frag.fragmentIndex).toBe(i)
    })
  })

  it("metadata does not affect assertPaginatedDocument", () => {
    const doc = makeDoc(["p"], { p: makePara("p", LINES_PER_PAGE + 5) })
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })
})
