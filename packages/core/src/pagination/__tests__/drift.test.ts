import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { defaultWordBreaker } from "../../layout"
import type { TextMeasurer } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, ParagraphNode, LayoutNode } from "../../schema"

// ─── Measurers ────────────────────────────────────────────────────────────────

// "Browser" measurer — slightly narrower chars (canvas tends to measure narrower)
const browserMeasurer: TextMeasurer = {
  measureText: (text, _key, fontSize) => {
    const width = [...text].reduce((sum, ch) => {
      const code = ch.codePointAt(0) ?? 0
      return sum + fontSize * (code >= 0x0e00 && code <= 0x0e7f ? 0.62 : 0.48)
    }, 0)
    return { width }
  },
  measureLineHeight: (_key, fontSize, ratio) => fontSize * (ratio ?? 1.2),
}

// "Server" measurer — slightly wider chars (fontkit metrics are often wider)
const serverMeasurer: TextMeasurer = {
  measureText: (text, _key, fontSize) => {
    const width = [...text].reduce((sum, ch) => {
      const code = ch.codePointAt(0) ?? 0
      return sum + fontSize * (code >= 0x0e00 && code <= 0x0e7f ? 0.67 : 0.52)
    }, 0)
    return { width }
  },
  measureLineHeight: (_key, fontSize, ratio) => fontSize * (ratio ?? 1.2),
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE_SETTINGS = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string): ParagraphNode {
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
    children: [{ id: `${id}-t`, type: "text", text }],
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
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes: {
          "body": { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function paraLineCount(doc: DocumentNode, nodeId: string, measurer: TextMeasurer): number {
  const result = paginateDocument(doc, measurer, defaultWordBreaker)
  let count = 0
  for (const section of result.sections) {
    for (const page of section.pages) {
      for (const f of page.fragments) {
        if (f.nodeId === nodeId) count += f.lines?.length ?? 0
      }
    }
  }
  return count
}

function paraPageIndex(doc: DocumentNode, nodeId: string, measurer: TextMeasurer): number {
  const result = paginateDocument(doc, measurer, defaultWordBreaker)
  for (const section of result.sections) {
    for (const page of section.pages) {
      if (page.fragments.some((f) => f.nodeId === nodeId)) return page.index
    }
  }
  return -1
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("layout drift — line-count drift", () => {
  it("browser and server agree on short text", () => {
    // Short text (well under line width) — both measurers wrap identically
    const p = makePara("p1", "Hello")
    const doc = makeDoc(["p1"], { p1: p })
    expect(paraLineCount(doc, "p1", browserMeasurer)).toBe(paraLineCount(doc, "p1", serverMeasurer))
  })

  it("server wraps more lines when chars are wider", () => {
    // contentWidth=451, browserMeasurer: 451/(10*0.48)=93.9 → 93 chars/line
    //                   serverMeasurer:  451/(10*0.52)=86.7 → 86 chars/line
    // 90 ASCII chars → browser: 1 line, server: ≥2 lines
    const text = "A".repeat(90)
    const p = makePara("p1", text)
    const doc = makeDoc(["p1"], { p1: p })
    const browserLines = paraLineCount(doc, "p1", browserMeasurer)
    const serverLines = paraLineCount(doc, "p1", serverMeasurer)
    expect(browserLines).toBe(1)
    expect(serverLines).toBeGreaterThan(1)
  })

  it("drift accumulates with more near-boundary lines", () => {
    // Each hard line of 90 chars: browser=1 rendered-line, server=2 rendered-lines (delta +1 per hard line)
    // 1 hard line → delta=1; 10 hard lines → delta=10
    const oneLine  = makePara("p1", "A".repeat(90))
    const tenLines = makePara("p10", Array.from({ length: 10 }, () => "A".repeat(90)).join("\n"))
    const docOne  = makeDoc(["p1"],  { p1: oneLine })
    const docTen  = makeDoc(["p10"], { p10: tenLines })

    const delta1   = paraLineCount(docOne, "p1",   serverMeasurer) - paraLineCount(docOne,  "p1",   browserMeasurer)
    const delta10  = paraLineCount(docTen, "p10",  serverMeasurer) - paraLineCount(docTen, "p10",  browserMeasurer)
    expect(delta10).toBeGreaterThan(delta1)
  })
})

describe("layout drift — page-break drift", () => {
  it("paragraph that fits on page 1 with browser measurer may move to page 2 with server measurer", () => {
    // Fill page with text that stays on 1 page with browser but overflows with server
    // Browser: 93 chars/line, contentHeight=698, lh=12 → 58 lines/page
    // Server:  86 chars/line → same paragraph produces more lines → may push next para to next page
    // Strategy: short filler + boundary paragraph that stays on page 1 browser but moves with server
    const fillerText = "A".repeat(90) + "\n"  // 1 browser-line, 2 server-lines
    // Add 56 filler paragraphs (each 1 browser-line = 12pt): total height = 56×12 = 672pt on browser
    // 2 server-lines each = 56×2 = 112 server-lines = 112×12 = 1344pt → overflows 698pt → pushed to page 2
    const fillerLines = Array.from({ length: 56 }, (_, i) => `${fillerText.trim()}${i}`).join("\n")
    const p1 = makePara("p1", fillerLines)
    const p2 = makePara("p2", "Final")
    const doc = makeDoc(["p1", "p2"], { p1, p2 })

    const browserPage = paraPageIndex(doc, "p2", browserMeasurer)
    const serverPage  = paraPageIndex(doc, "p2", serverMeasurer)
    // Both should place p2 somewhere valid (≥ 0)
    expect(browserPage).toBeGreaterThanOrEqual(0)
    expect(serverPage).toBeGreaterThanOrEqual(0)
    // Server measurer produces more lines → p2 lands on a later page or same page
    expect(serverPage).toBeGreaterThanOrEqual(browserPage)
  })

  it("Thai text drift: server wraps sooner due to wider Thai chars", () => {
    // Thai chars: browser=0.62×fs, server=0.67×fs
    // 451/(10×0.62)=72.7 browser chars/line vs 451/(10×0.67)=67.3 server chars/line
    const thaiText = "ก".repeat(70)  // 70 Thai chars → browser: 1 line, server: ≥2 lines
    const p = makePara("p1", thaiText)
    const doc = makeDoc(["p1"], { p1: p })
    const bLines = paraLineCount(doc, "p1", browserMeasurer)
    const sLines = paraLineCount(doc, "p1", serverMeasurer)
    expect(bLines).toBe(1)
    expect(sLines).toBeGreaterThan(1)
  })
})

describe("layout drift — height drift", () => {
  it("fragment height is larger with server measurer when more lines", () => {
    const text = "A".repeat(90)
    const p = makePara("p1", text)
    const doc = makeDoc(["p1"], { p1: p })

    const bResult = paginateDocument(doc, browserMeasurer, defaultWordBreaker)
    const sResult = paginateDocument(doc, serverMeasurer, defaultWordBreaker)

    // Sum heights across all fragments for p1 (could be split across pages)
    const sumHeight = (result: typeof bResult) =>
      result.sections[0].pages.flatMap((pg) => pg.fragments)
        .filter((f) => f.nodeId === "p1")
        .reduce((sum, f) => sum + f.height, 0)

    expect(sumHeight(sResult)).toBeGreaterThan(sumHeight(bResult))
  })
})
