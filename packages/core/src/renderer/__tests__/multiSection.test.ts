import { describe, it, expect } from "vitest"
import JSZip from "jszip"
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

async function readDocxXml(buffer: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(path)
  if (!file) throw new Error(`Missing DOCX part: ${path}`)
  return file.async("string")
}

function countXmlTag(xml: string, tag: string): number {
  return xml.match(new RegExp(`<${tag}(\\s|>|/)`, "g"))?.length ?? 0
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

  it("product fixture — report-cover-toc-body", () => {
    const coverTitle = makePara("cover-title", "รายงานราชการ", 1)
    const bodyPageNumber = makePageNumberPara("body-page-number")
    const h1 = makePara("body-h1", "บทที่ 1 บทนำ", 1)
    const h2 = makePara("body-h2", "บทที่ 2 ผลการดำเนินงาน", 1)
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "report-cover-toc-body",
        sections: [
          makeSection("cover", ["cover-title"], { "cover-title": coverTitle }),
          makeTocSection("สารบัญ"),
          makeSection(
            "body",
            ["body-page-number", "body-h1", "body-h2"],
            { "body-page-number": bodyPageNumber, "body-h1": h1, "body-h2": h2 },
            { pageNumberStart: 1 },
          ),
        ],
      },
    }

    const result = paginate(doc)
    assertPaginatedDocument(result)

    expect(result.sections).toHaveLength(3)
    expect(result.sections.map((section) => section.sectionId)).toEqual(["cover", "toc-sec", "body"])
    expect(result.sections[2].pages[0].fragments
      .find((f) => f.nodeId === "body-page-number")?.lines?.[0]?.text).toBe("หน้า 1")
    expect(result.tocEntries.map((entry) => [entry.nodeId, entry.pageNumber])).toEqual([
      ["cover-title", 1],
      ["body-h1", 1],
      ["body-h2", 1],
    ])
    const tocFrag = result.sections[1].pages[0].fragments.find((f) => f.nodeType === "toc")
    expect(tocFrag?.lines?.some((line) => line.text.includes("บทที่ 1 บทนำ") && line.text.endsWith(" 1"))).toBe(true)
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

  it("DOCX: two-section document emits two Word sections", async () => {
    const p1 = makePara("p1", "Section one")
    const p2 = makePara("p2", "Section two")
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
    const paginated = paginate(doc)
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    expect(countXmlTag(xml, "w:sectPr")).toBe(2)
    expect(xml).toContain("Section one")
    expect(xml).toContain("Section two")
  })

  it("DOCX: multi-page document emits a Word section per paginated page", async () => {
    const nodes: Record<string, LayoutNode> = {}
    const ids: string[] = []
    for (let i = 0; i < 80; i++) {
      const id = `p${i}`
      nodes[id] = makePara(id, `Paragraph ${i + 1}`)
      ids.push(id)
    }
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        sections: [makeSection("s1", ids, nodes)],
      },
    }
    const paginated = paginate(doc)
    const pageCount = paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
    expect(pageCount).toBeGreaterThan(1)

    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    expect(countXmlTag(xml, "w:sectPr")).toBe(pageCount)
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

  it("product fixture — report-docx-structure", async () => {
    const coverTitle = makePara("cover-title", "Government Report", 1)
    const h1 = makePara("body-h1", "Chapter 1 Introduction", 1)
    const body1 = makePara("body-p1", "Editable body paragraph")
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "report-docx-structure",
        sections: [
          makeSection("cover", ["cover-title"], { "cover-title": coverTitle }),
          makeTocSection("Contents"),
          makeSection("body", ["body-h1", "body-p1"], { "body-h1": h1, "body-p1": body1 }, { pageNumberStart: 1 }),
        ],
      },
    }

    const paginated = paginate(doc)
    assertPaginatedDocument(paginated)
    const pageCount = paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
    const result = await docx.render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")

    expect(result.buffer[0]).toBe(0x50)
    expect(result.buffer[1]).toBe(0x4b)
    expect(countXmlTag(xml, "w:sectPr")).toBe(pageCount)
    expect(xml).toContain("Government Report")
    expect(xml).toContain("Contents")
    expect(xml).toContain("Chapter 1 Introduction")
    expect(xml).toContain("Editable body paragraph")
  })
})
