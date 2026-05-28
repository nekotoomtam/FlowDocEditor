import { describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"
import type { PaginatedDocument } from "../types"
import { paginateDocument, paginateDocumentWithProfile } from "../paginator"

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
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeDoc(): DocumentNode {
  const nodes: Record<string, LayoutNode> = {
    body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
    p1: makePara("p1", "A short paragraph"),
    p2: makePara("p2", Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join("\n")),
  }
  return {
    version: 1,
    document: {
      id: "profile-test-doc",
      sections: [{
        id: "sec",
        type: "section",
        page: PAGE_SETTINGS,
        bodyRootId: "body",
        nodes,
      }],
    },
  }
}

function fragmentSignature(paginated: PaginatedDocument) {
  return paginated.sections.flatMap((section) =>
    section.pages.flatMap((page) =>
      page.fragments.map((fragment) => ({
        pageIndex: page.index,
        nodeId: fragment.nodeId,
        nodeType: fragment.nodeType,
        lineStart: fragment.lineStart,
        lineEnd: fragment.lineEnd,
        continuesFrom: fragment.continuesFrom,
        isContinued: fragment.isContinued,
      })),
    ),
  )
}

describe("pagination profiling", () => {
  it("does not change paginated output", () => {
    const doc = makeDoc()
    const plain = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const profiled = paginateDocumentWithProfile(doc, defaultTextMeasurer, defaultWordBreaker, undefined, {
      paginationProfileSource: "server",
    })

    expect(profiled.paginated.sections.map((section) => section.pages.length)).toEqual(
      plain.sections.map((section) => section.pages.length),
    )
    expect(fragmentSignature(profiled.paginated)).toEqual(fragmentSignature(plain))
    expect(profiled.paginationProfile.stages.map((stage) => stage.name)).toContain("total")
    expect(profiled.paginationProfile.topStages?.length).toBeGreaterThan(0)
  })
})
