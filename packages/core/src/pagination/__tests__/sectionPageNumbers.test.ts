import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePageNumberPara(id: string, prefix: string): ParagraphNode {
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
    children: [
      { id: `${id}-t`, type: "text", text: prefix },
      { id: `${id}-pn`, type: "pageNumber" },
    ],
  }
}

function makeSection(
  id: string,
  paraId: string,
  paraPrefix: string,
  pageNumberStart?: number,
): DocumentNode["document"]["sections"][0] {
  const page = pageNumberStart !== undefined
    ? { ...PAGE, pageNumberStart }
    : PAGE
  const nodes: Record<string, LayoutNode> = {}
  nodes[paraId] = makePageNumberPara(paraId, paraPrefix)
  return {
    id,
    type: "section",
    page,
    bodyRootId: `body-${id}`,
    nodes: {
      [`body-${id}`]: { id: `body-${id}`, type: "body", props: {}, childIds: [paraId] },
      ...nodes,
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function getLineText(result: ReturnType<typeof paginate>, sectionIndex: number, nodeId: string): string {
  const ps = result.sections[sectionIndex]
  for (const page of ps?.pages ?? []) {
    const frag = page.fragments.find((f) => f.nodeId === nodeId)
    if (frag?.lines?.[0]) return frag.lines[0].text
  }
  return ""
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("section-level page numbering", () => {
  it("default (no pageNumberStart): global numbering continues across sections", () => {
    // Section 1: page 1, section 2: page 2 (global)
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", "p1", "หน้า "),
          makeSection("s2", "p2", "หน้า "),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    expect(getLineText(result, 0, "p1")).toBe("หน้า 1")
    expect(getLineText(result, 1, "p2")).toBe("หน้า 2")
  })

  it("pageNumberStart=1 on second section: restarts numbering at 1", () => {
    // Section 1 takes 1 page (global page 0) → displays as 1
    // Section 2 starts at global page 1 with pageNumberStart=1 → offset = 1-1-1 = -1 → displays as 1
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", "p1", "หน้า "),
          makeSection("s2", "p2", "หน้า ", 1),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    expect(getLineText(result, 0, "p1")).toBe("หน้า 1")
    expect(getLineText(result, 1, "p2")).toBe("หน้า 1")  // restarted at 1
  })

  it("pageNumberStart=5: first page of section shows 5", () => {
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", "p1", "หน้า ", 5),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    expect(getLineText(result, 0, "p1")).toBe("หน้า 5")
  })

  it("header page-number fields use the section page-number offset", () => {
    const section = makeSection("s1", "p1", "Body ", 5)
    const header = makePageNumberPara("h1", "Header ")
    section.headerRootId = "h1"
    section.nodes.h1 = header
    const doc: DocumentNode = {
      version: 1,
      document: { id: "doc", sections: [section] },
    }

    const result = paginate(doc)
    assertPaginatedDocument(result)
    expect(result.sections[0].pages[0].headerFragments[0].lines?.[0]?.text).toBe("Header 5")
  })

  it("TOC entries use restarted section page numbers", () => {
    const first = makeSection("s1", "p1", "First ")
    const second = makeSection("s2", "p2", "Second ", 1)
    const firstPara = first.nodes.p1
    const secondPara = second.nodes.p2
    if (firstPara.type === "paragraph") firstPara.props = { ...firstPara.props, headingLevel: 1 }
    if (secondPara.type === "paragraph") secondPara.props = { ...secondPara.props, headingLevel: 1 }
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [first, second],
      },
    }

    const result = paginate(doc)
    assertPaginatedDocument(result)
    expect(result.tocEntries.find((entry) => entry.nodeId === "p2")?.pageNumber).toBe(1)
  })

  it("pageNumberStart=1 in first section (explicit): same as default global numbering", () => {
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", "p1", "หน้า ", 1),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    expect(getLineText(result, 0, "p1")).toBe("หน้า 1")
  })

  it("assertPaginatedDocument passes for all section numbering variants", () => {
    const cases: DocumentNode[] = [
      {
        version: 1,
        document: {
          id: "doc",
          sections: [makeSection("s1", "p1", "p"), makeSection("s2", "p2", "p", 1)],
        },
      },
      {
        version: 1,
        document: {
          id: "doc",
          sections: [makeSection("s1", "p1", "p", 5)],
        },
      },
    ]
    for (const doc of cases) {
      expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
    }
  })
})
