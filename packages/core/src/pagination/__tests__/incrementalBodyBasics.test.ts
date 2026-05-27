import { describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import {
  assertPaginatedDocument,
  paginateDocument,
  tryPaginateDocumentBodyBasicsIncrementally,
  tryPaginateDocumentBodyBasicsVisibleWindow,
} from "../index"
import type {
  DocumentNode,
  FlowTableNode,
  LayoutNode,
  ListStyleDefinition,
  PageBreakNode,
  ParagraphNode,
  RowNode,
  SpacerNode,
  StackNode,
} from "../../schema"

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
      id: "incremental-body-basics-doc",
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

function makeTwoSectionDoc(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "incremental-two-section-doc",
      sections: [
        {
          id: "sec1",
          type: "section",
          page: PAGE,
          bodyRootId: "body1",
          nodes: {
            body1: { id: "body1", type: "body", props: {}, childIds: ["s1p"] },
            s1p: makePara("s1p", "section one"),
          },
        },
        {
          id: "sec2",
          type: "section",
          page: { ...PAGE, pageNumberStart: 1 },
          bodyRootId: "body2",
          nodes: {
            body2: { id: "body2", type: "body", props: {}, childIds: ["s2p"] },
            s2p: makePara("s2p", "section two"),
          },
        },
      ],
    },
  }
}

const TOR_LIST_STYLE: ListStyleDefinition = {
  id: "tor-clause",
  levels: [
    { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(18) },
    { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), bodyIndent: pt(36) },
  ],
}

function withListDefinitions(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    document: {
      ...doc.document,
      listStyles: { "tor-clause": TOR_LIST_STYLE },
      listInstances: { "tor-main": { id: "tor-main", styleId: "tor-clause" } },
    },
  }
}

function expectIncrementalMatchesFull(doc: DocumentNode): void {
  const full = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
  const result = tryPaginateDocumentBodyBasicsIncrementally(doc, defaultTextMeasurer, defaultWordBreaker)

  expect(result.status).toBe("supported")
  if (result.status !== "supported") return
  expect(result.paginated).toEqual(full)
  expect(() => assertPaginatedDocument(result.paginated)).not.toThrow()
}

function findPage(doc: DocumentNode, pageIndex: number) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    .sections
    .flatMap((section) => section.pages)
    .find((page) => page.index === pageIndex)
}

describe("body-basics incremental pagination proof", () => {
  it("matches full pagination for direct body paragraph, spacer, page-break, and split paragraph", () => {
    const longText = Array.from({ length: LINES_PER_PAGE + 5 }, (_, index) => `line ${index}`).join("\n")
    const doc = makeDoc(["intro", "spacer", "break", "long"], {
      intro: makePara("intro", "intro", { headingLevel: 1 }),
      spacer: makeSpacer("spacer", 24),
      break: makePageBreak("break"),
      long: makePara("long", longText),
    })

    expectIncrementalMatchesFull(doc)
  })

  it("matches full pagination for keep-with-next direct body paragraphs", () => {
    const spacerH = 698 - 14
    const doc = makeDoc(["spacer", "heading", "bodyPara"], {
      spacer: makeSpacer("spacer", spacerH),
      heading: makePara("heading", "Heading", { keepWithNext: true }),
      bodyPara: makePara("bodyPara", "Body"),
    })

    expectIncrementalMatchesFull(doc)
  })

  it("matches full pagination for generated list marker output from section start", () => {
    const doc = withListDefinitions(makeDoc(["p1", "p2"], {
      p1: makePara("p1", "First", { list: { instanceId: "tor-main", level: 0, itemId: "first" } }),
      p2: makePara("p2", "Second", { list: { instanceId: "tor-main", level: 1, itemId: "second" } }),
    }))

    expectIncrementalMatchesFull(doc)
  })

  it("matches full pagination across sections and section-local page numbers", () => {
    expectIncrementalMatchesFull(makeTwoSectionDoc())
  })

  it("reports direct body TOC and containers as unsupported", () => {
    const stack: StackNode = { id: "stack", type: "stack", props: { widthShare: 100 }, childIds: ["nested"] }
    const row: RowNode = { id: "row", type: "row", props: {}, childIds: [stack.id] }
    const docWithToc = makeDoc(["toc"], {
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
    })
    const docWithRow = makeDoc(["row"], {
      row,
      stack,
      nested: makePara("nested", "Nested"),
    })

    expect(tryPaginateDocumentBodyBasicsIncrementally(docWithToc, defaultTextMeasurer, defaultWordBreaker))
      .toMatchObject({ status: "unsupported", reason: "unsupported-body-child", nodeId: "toc", nodeType: "toc" })
    expect(tryPaginateDocumentBodyBasicsIncrementally(docWithRow, defaultTextMeasurer, defaultWordBreaker))
      .toMatchObject({ status: "unsupported", reason: "unsupported-body-child", nodeId: "row", nodeType: "row" })
  })

  it("reports flow-table as unsupported in the first slice", () => {
    const table: FlowTableNode = {
      id: "ft",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(100) }],
      rowIds: ["r1"],
      nodes: {
        r1: { id: "r1", type: "flow-table-row", props: {}, cellIds: ["c1"] },
        c1: { id: "c1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
        p1: makePara("p1", "cell"),
      },
    }
    const doc = makeDoc(["ft"], { ft: table })

    expect(tryPaginateDocumentBodyBasicsIncrementally(doc, defaultTextMeasurer, defaultWordBreaker))
      .toMatchObject({ status: "unsupported", reason: "unsupported-body-child", nodeId: "ft", nodeType: "flow-table" })
  })

  it("returns a body-basics visible-window prefix that matches full pagination through coverage", () => {
    const childIds: string[] = []
    const nodes: Record<string, LayoutNode> = {}
    for (let index = 0; index < 12; index++) {
      const paraId = `p${index}`
      const breakId = `break${index}`
      childIds.push(paraId, breakId)
      nodes[paraId] = makePara(paraId, `Page-ish paragraph ${index + 1}`)
      nodes[breakId] = makePageBreak(breakId)
    }
    const doc = makeDoc(childIds, nodes)
    const full = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const result = tryPaginateDocumentBodyBasicsVisibleWindow(doc, defaultTextMeasurer, {
      pageIndex: 3,
      marginPages: 1,
    }, defaultWordBreaker)

    expect(result.status).toBe("supported")
    if (result.status !== "supported") return
    expect(result.coverage).toMatchObject({
      startPageIndex: 0,
      requestedPageIndex: 3,
      completedDocument: false,
    })
    expect(result.coverage.endPageIndex).toBeGreaterThanOrEqual(4)
    expect(result.paginated.sections).toHaveLength(1)
    for (const page of result.paginated.sections[0].pages) {
      expect(page).toEqual(findPage(doc, page.index))
    }
    expect(result.paginated.sections[0].pages.length)
      .toBeLessThan(full.sections[0].pages.length)
    expect(() => assertPaginatedDocument(result.paginated)).not.toThrow()
  })

  it("reports unsupported visible-window pagination for TOC and containers", () => {
    const doc = makeDoc(["toc"], {
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
    })

    expect(tryPaginateDocumentBodyBasicsVisibleWindow(doc, defaultTextMeasurer, {
      pageIndex: 2,
      marginPages: 1,
    }, defaultWordBreaker))
      .toMatchObject({ status: "unsupported", reason: "unsupported-body-child", nodeId: "toc", nodeType: "toc" })
  })
})
