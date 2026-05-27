import { describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import { assertPaginatedDocument, paginateDocument, paginateDocumentWithTrace } from "../index"
import type { DocumentNode, LayoutNode, PageBreakNode, ParagraphNode, SpacerNode } from "../../schema"
import type { ParagraphSplitDecision } from "../types"

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

const LINE_HEIGHT = 10 * 1.2
const LINES_PER_PAGE = Math.floor(698 / LINE_HEIGHT)

function makePara(
  id: string,
  text: string,
  overrides: Partial<ParagraphNode["props"]> = {},
): ParagraphNode {
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
      ...overrides,
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeSpacer(id: string, height: number): SpacerNode {
  return { id, type: "spacer", props: { height } }
}

function makePageBreak(id: string): PageBreakNode {
  return { id, type: "page-break", props: {} }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "trace-doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

describe("pagination trace", () => {
  it("wraps full pagination without changing paginated output", () => {
    const longText = Array.from({ length: LINES_PER_PAGE + 4 }, (_, index) => `line ${index}`).join("\n")
    const doc = makeDoc(["toc", "heading", "intro", "long"], {
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ", maxLevel: 6 } },
      heading: makePara("heading", "บทนำ", { headingLevel: 1 }),
      intro: makePara("intro", "intro"),
      long: makePara("long", longText),
    })

    const expected = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const { paginated } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)

    expect(paginated).toEqual(expected)
    expect(() => assertPaginatedDocument(paginated)).not.toThrow()
  })

  it("records section and direct body-child page spans", () => {
    const doc = makeDoc(["p1", "pb", "p2"], {
      p1: makePara("p1", "first"),
      pb: makePageBreak("pb"),
      p2: makePara("p2", "second page"),
    })

    const { trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)

    expect(trace.sectionSpans).toEqual([{
      sectionId: "sec",
      firstPageIndex: 0,
      lastPageIndex: 1,
      pageCount: 2,
    }])
    expect(trace.pageCount).toBe(2)
    expect(trace.bodyChildSpans.map((span) => [span.nodeId, span.firstPageIndex, span.lastPageIndex])).toEqual([
      ["p1", 0, 0],
      ["pb", 0, 0],
      ["p2", 1, 1],
    ])
  })

  it("records split paragraph line ranges and continuation status", () => {
    const lineCount = LINES_PER_PAGE + 6
    const longText = Array.from({ length: lineCount }, (_, index) => `line ${index}`).join("\n")
    const doc = makeDoc(["long"], { long: makePara("long", longText) })

    const { trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)
    const span = trace.nodeSpans.find((candidate) => candidate.nodeId === "long")
    const bodySpan = trace.bodyChildSpans.find((candidate) => candidate.nodeId === "long")

    expect(span).toMatchObject({
      nodeId: "long",
      nodeType: "paragraph",
      firstPageIndex: 0,
      lastPageIndex: 1,
      fragmentCount: 2,
      lineStart: 0,
      lineEnd: lineCount,
      hasContinuation: true,
    })
    expect(bodySpan).toMatchObject({
      nodeId: "long",
      hasFragments: true,
      firstPageIndex: 0,
      lastPageIndex: 1,
      fragmentCount: 2,
      hasContinuation: true,
    })
  })

  it("forwards paragraph split decisions from the wrapped pagination run", () => {
    const lineCount = LINES_PER_PAGE + 3
    const longText = Array.from({ length: lineCount }, (_, index) => `line ${index}`).join("\n")
    const doc = makeDoc(["long"], { long: makePara("long", longText) })
    const decisions: ParagraphSplitDecision[] = []

    paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker, (decision) => decisions.push(decision))

    expect(decisions.map((decision) => decision.nodeId)).toEqual(["long", "long"])
    expect(decisions.every((decision) => decision.isSplit)).toBe(true)
  })

  it("copies TOC entries into the trace", () => {
    const doc = makeDoc(["toc", "heading"], {
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ", maxLevel: 6 } },
      heading: makePara("heading", "บทนำ", { headingLevel: 1 }),
    })

    const { paginated, trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)

    expect(trace.tocEntries).toEqual(paginated.tocEntries)
    expect(trace.tocEntries).toEqual([
      { nodeId: "heading", text: "บทนำ", level: 1, pageNumber: 2 },
    ])
  })

  it("records every direct body child in authored order", () => {
    const doc = makeDoc(["zero", "after"], {
      zero: makeSpacer("zero", 1),
      after: makePara("after", "after"),
    })

    const { trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)

    expect(trace.bodyChildSpans.map((span) => span.nodeId)).toEqual(["zero", "after"])
    expect(trace.bodyChildSpans.every((span) => span.hasFragments)).toBe(true)
  })
})
