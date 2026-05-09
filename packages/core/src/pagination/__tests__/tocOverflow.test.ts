import { describe, it, expect } from "vitest"
import { paginateDocument } from "../index"
import { assertPaginatedDocument } from "../assertPaginated"
import { defaultTextMeasurer, defaultWordBreaker, TOC_ENTRY_FS, TOC_ENTRY_LH, TOC_TITLE_FS, TOC_TITLE_LH, TOC_TITLE_AFTER } from "../../layout"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTRY_H = TOC_ENTRY_FS * TOC_ENTRY_LH
const TITLE_H = TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...(headingLevel !== undefined ? { headingLevel } : {}),
    },
    children: [{ id: `${id}-t`, type: "text", text }],
  }
}

function makeTocSection(tocId: string): DocumentNode["document"]["sections"][0] {
  return {
    id: "sec-toc",
    type: "section",
    page: PAGE,
    bodyRootId: "body-toc",
    nodes: {
      "body-toc": { id: "body-toc", type: "body", props: {}, childIds: [tocId] },
      [tocId]: { id: tocId, type: "toc", props: { title: "สารบัญ" } },
    },
  }
}

function makeContentSection(headingCount: number): DocumentNode["document"]["sections"][0] {
  const nodes: Record<string, LayoutNode> = {}
  const childIds: string[] = []
  for (let i = 0; i < headingCount; i++) {
    const id = `h${i}`
    nodes[id] = makePara(id, `หัวข้อที่ ${i + 1}`, 1)
    childIds.push(id)
  }
  return {
    id: "sec-content",
    type: "section",
    page: PAGE,
    bodyRootId: "body-content",
    nodes: {
      "body-content": { id: "body-content", type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function makeTwoSectionDoc(headingCount: number): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [
        makeTocSection("toc"),
        makeContentSection(headingCount),
      ],
    },
  }
}

function paginate(doc: DocumentNode) {
  return paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
}

function findTocFragment(result: ReturnType<typeof paginate>) {
  for (const ps of result.sections) {
    for (const page of ps.pages) {
      const frag = page.fragments.find((f) => f.nodeType === "toc")
      if (frag) return frag
    }
  }
  return undefined
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TOC overflow — two-pass repagination", () => {
  it("no overflow: single section with matching heading count needs no second pass", () => {
    // TOC and headings in same section → countHeadings matches fillTocFragments count
    const nodes: Record<string, LayoutNode> = {}
    const childIds: string[] = ["toc"]
    nodes["toc"] = { id: "toc", type: "toc", props: { title: "สารบัญ" } }
    for (let i = 0; i < 3; i++) {
      const id = `h${i}`
      nodes[id] = makePara(id, `หัวข้อ ${i + 1}`, 1)
      childIds.push(id)
    }
    const doc: DocumentNode = {
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

    const result = paginate(doc)
    assertPaginatedDocument(result)

    const toc = findTocFragment(result)
    expect(toc).toBeDefined()
    // 3 headings: height = titleH + 3 * entryH
    const expectedH = TITLE_H + 3 * ENTRY_H
    expect(toc!.height).toBeCloseTo(expectedH, 1)
    // TOC lines filled correctly
    expect(toc!.lines).toHaveLength(4) // title + 3 entries
  })

  it("overflow: TOC in section 1, many headings in section 2 — fragment height grows to fit", () => {
    // Section 1 has TOC with 0 local headings → estimate = titleH + 1*entryH
    // Section 2 has 20 headings → actual = titleH + 20*entryH → overflow → pass 2
    const doc = makeTwoSectionDoc(20)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const toc = findTocFragment(result)
    expect(toc).toBeDefined()

    // After pass 2: fragment height must accommodate all 20 entries + title
    const expectedH = TITLE_H + 20 * ENTRY_H
    expect(toc!.height).toBeCloseTo(expectedH, 1)
    expect(toc!.lines).toHaveLength(21) // title + 20 entries
  })

  it("overflow: TOC lines do not exceed fragment height", () => {
    const doc = makeTwoSectionDoc(20)
    const result = paginate(doc)

    const toc = findTocFragment(result)
    if (!toc) throw new Error("TOC fragment not found")

    const lines = toc.lines ?? []
    const lastLine = lines.at(-1)
    if (!lastLine) throw new Error("TOC has no lines")
    const lineBottom = lastLine.y + lastLine.height
    const fragBottom = toc.y + toc.height
    expect(lineBottom).toBeLessThanOrEqual(fragBottom + 0.5) // 0.5pt epsilon
  })

  it("overflow: TOC entries reference correct page numbers from pass 2", () => {
    const doc = makeTwoSectionDoc(20)
    const result = paginate(doc)

    // All TOC entries should reference valid page numbers (>= 1)
    for (const entry of result.tocEntries) {
      expect(entry.pageNumber).toBeGreaterThanOrEqual(1)
    }
    expect(result.tocEntries).toHaveLength(20)
  })

  it("overflow: assertPaginatedDocument passes after two-pass repagination", () => {
    const doc = makeTwoSectionDoc(20)
    const result = paginate(doc)
    expect(() => assertPaginatedDocument(result)).not.toThrow()
  })

  it("no overflow when heading count exactly matches estimate", () => {
    // Section 1 has TOC with 0 local headings → estimate uses max(0,1) = 1 entry
    // Section 2 has exactly 1 heading → actual = 1 entry → no overflow, single pass
    const doc = makeTwoSectionDoc(1)
    const result = paginate(doc)
    assertPaginatedDocument(result)

    const toc = findTocFragment(result)
    expect(toc).toBeDefined()
    expect(toc!.lines).toHaveLength(2) // title + 1 entry
  })
})
