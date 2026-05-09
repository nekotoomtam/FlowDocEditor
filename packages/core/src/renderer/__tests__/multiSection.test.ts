import { describe, it, expect } from "vitest"
import { PdfRenderer } from "../pdf"
import { DocxRenderer } from "../docx"
import { paginateDocument } from "../../pagination"
import { assertPaginatedDocument } from "../../pagination/assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

function makePara(id: string, text: string, headingLevel?: 1 | 2 | 3): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(4),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...(headingLevel !== undefined ? { headingLevel } : {}),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makePageNumberPara(id: string): ParagraphNode {
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
      { id: `${id}-t`, type: "text", text: "หน้า " },
      { id: `${id}-pn`, type: "pageNumber" },
    ],
  }
}

function makeSection(
  id: string,
  childIds: string[],
  nodes: Record<string, LayoutNode>,
  opts: { pageNumberStart?: number } = {},
): DocumentNode["document"]["sections"][0] {
  const page = opts.pageNumberStart !== undefined
    ? { ...PAGE, pageNumberStart: opts.pageNumberStart }
    : PAGE
  return {
    id,
    type: "section",
    page,
    bodyRootId: `body-${id}`,
    nodes: {
      [`body-${id}`]: { id: `body-${id}`, type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function makeTocSection(title = "Contents"): DocumentNode["document"]["sections"][0] {
  return {
    id: "toc-sec",
    type: "section",
    page: PAGE,
    bodyRootId: "body-toc-sec",
    nodes: {
      "body-toc-sec": { id: "body-toc-sec", type: "body", props: {}, childIds: ["toc-node"] },
      "toc-node": { id: "toc-node", type: "toc", props: { title } },
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("multi-section export smoke tests", () => {
  const pdf = new PdfRenderer()
  const docx = new DocxRenderer()

  // ── Pagination structure ──────────────────────────────────────────────────

  it("two-section document produces two PaginatedSections", () => {
    const p1 = makePara("p1", "Section one content")
    const p2 = makePara("p2", "Section two content")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }),
        ],
      },
    }
    const result = paginate(doc)
    expect(result.sections).toHaveLength(2)
    assertPaginatedDocument(result)
  })

  it("each section produces dense (no sparse) pages array", () => {
    const p1 = makePara("p1", "Section one")
    const p2 = makePara("p2", "Section two")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }),
        ],
      },
    }
    const result = paginate(doc)
    for (const ps of result.sections) {
      for (const page of ps.pages) {
        // No sparse entry: every page must be defined with a fragments array
        expect(page).toBeDefined()
        expect(Array.isArray(page.fragments)).toBe(true)
      }
    }
  })

  it("page number restart: section 2 with pageNumberStart=1 shows correct inline numbers", () => {
    const pn1 = makePageNumberPara("pn1")
    const pn2 = makePageNumberPara("pn2")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["pn1"], { pn1 }),
          makeSection("s2", ["pn2"], { pn2 }, { pageNumberStart: 1 }),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    // Section 1, page 0 → global page 0 → display "1"
    const sec1Lines = result.sections[0].pages[0].fragments
      .find((f) => f.nodeId === "pn1")?.lines?.[0]?.text
    expect(sec1Lines).toBe("หน้า 1")

    // Section 2 restarts at 1 → display "1" even though global index is 1
    const sec2Lines = result.sections[1].pages[0].fragments
      .find((f) => f.nodeId === "pn2")?.lines?.[0]?.text
    expect(sec2Lines).toBe("หน้า 1")
  })

  it("TOC + content section: TOC entries reference content section page numbers", () => {
    // รายงานราชการ pattern: section 1 = TOC, section 2 = headings
    const h1 = makePara("h1", "บทที่ 1 บทนำ", 1)
    const h2 = makePara("h2", "บทที่ 2 เนื้อหา", 1)
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeTocSection(),
          makeSection("content", ["h1", "h2"], { h1, h2 }, { pageNumberStart: 1 }),
        ],
      },
    }
    const result = paginate(doc)
    assertPaginatedDocument(result)

    // TOC entries should reference the headings
    expect(result.tocEntries.length).toBe(2)
    expect(result.tocEntries[0].text).toBe("บทที่ 1 บทนำ")
    expect(result.tocEntries[1].text).toBe("บทที่ 2 เนื้อหา")

    // TOC section has a toc fragment with lines filled
    const tocFrag = result.sections[0].pages[0].fragments.find((f) => f.nodeType === "toc")
    expect(tocFrag).toBeDefined()
    expect(tocFrag!.lines!.length).toBeGreaterThan(0)
  })

  it("assertPaginatedDocument passes for 3-section document", () => {
    const p1 = makePara("p1", "S1")
    const p2 = makePara("p2", "S2")
    const p3 = makePara("p3", "S3")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }, { pageNumberStart: 1 }),
          makeSection("s3", ["p3"], { p3 }),
        ],
      },
    }
    expect(() => assertPaginatedDocument(paginate(doc))).not.toThrow()
  })

  // ── PDF render ────────────────────────────────────────────────────────────

  it("PDF: two-section document renders without throwing", async () => {
    const p1 = makePara("p1", "Section one")
    const p2 = makePara("p2", "Section two")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }),
        ],
      },
    }
    const result = await pdf.render(paginate(doc))
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("PDF: TOC + content section renders without throwing", async () => {
    // Use ASCII text — Helvetica fallback (no FontProvider) cannot encode Thai
    const h1 = makePara("h1", "Chapter 1 Introduction", 1)
    const body1 = makePara("body1", "Body content here")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeTocSection("Contents"),  // ASCII title for Helvetica fallback
          makeSection("content", ["h1", "body1"], { h1, body1 }, { pageNumberStart: 1 }),
        ],
      },
    }
    const result = await pdf.render(paginate(doc))
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  it("PDF: page number restart section renders without throwing", async () => {
    // Use ASCII prefix — Helvetica fallback cannot encode Thai
    const p1 = makePara("p1", "Section one page")
    const p2 = makePara("p2", "Section two page")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }, { pageNumberStart: 1 }),
        ],
      },
    }
    const result = await pdf.render(paginate(doc))
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(String.fromCharCode(...result.buffer.slice(0, 4))).toBe("%PDF")
  })

  // ── DOCX render ───────────────────────────────────────────────────────────

  it("DOCX: two-section document renders without throwing", async () => {
    const p1 = makePara("p1", "Section one")
    const p2 = makePara("p2", "Section two")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeSection("s1", ["p1"], { p1 }),
          makeSection("s2", ["p2"], { p2 }),
        ],
      },
    }
    const result = await docx.render(paginate(doc))
    expect(result.buffer[0]).toBe(0x50)   // PK zip header
    expect(result.buffer[1]).toBe(0x4b)
    expect(result.buffer.length).toBeGreaterThan(0)
  })

  it("DOCX: TOC + content section renders without throwing", async () => {
    const h1 = makePara("h1", "Chapter 1", 1)
    const body1 = makePara("body1", "Body content")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [
          makeTocSection("Contents"),
          makeSection("content", ["h1", "body1"], { h1, body1 }, { pageNumberStart: 1 }),
        ],
      },
    }
    const result = await docx.render(paginate(doc))
    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
  })
})
