import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode, ParagraphNode, TableCellNode, TableNode, TableRowNode } from "../schema"
import { pt } from "../schema"
import {
  mergeParagraphWithPrevious,
  splitParagraphAtIndex,
  updateParagraphText,
} from "./operations"

function makeParagraph(id: string, children: ParagraphNode["children"]): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children,
  }
}

function makeDoc(nodes: Record<string, LayoutNode>, childIds: string[]): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

function makeTableDoc(paragraph: ParagraphNode): DocumentNode {
  const cell: TableCellNode = { id: "cell", type: "table-cell", props: {}, childIds: [paragraph.id] }
  const row: TableRowNode = { id: "row", type: "table-row", props: {}, cellIds: [cell.id] }
  const table: TableNode = {
    id: "table",
    type: "table",
    props: {},
    columns: [{ width: pt(200) }],
    rowIds: [row.id],
    nodes: {
      [row.id]: row,
      [cell.id]: cell,
      [paragraph.id]: paragraph,
    },
  }
  return makeDoc({ table: table as unknown as LayoutNode }, ["table"])
}

function paragraphText(node: ParagraphNode): string {
  return node.children.filter((child) => child.type === "text").map((child) => child.text).join("")
}

describe("paragraph text operations", () => {
  it("updates plain text paragraph and collapses multiple text runs to one run", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = updateParagraphText(makeDoc({ p1: p }, ["p1"]), "p1", "Changed")
    const updated = result.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(updated.children[0]).toMatchObject({ id: "t1", type: "text", text: "Changed" })
  })

  it("does not update paragraph with fieldRef through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Name: " },
      { id: "f1", type: "fieldRef", key: "customer.name", label: "Customer" },
      { id: "t2", type: "text", text: " baht" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Flattened")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("does not update paragraph with pageNumber through plain text operation", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = updateParagraphText(doc, "p1", "Page 1")

    expect(result).toBe(doc)
    expect(result.document.sections[0].nodes.p1).toEqual(p)
  })

  it("updates plain text paragraph inside a table", () => {
    const p = makeParagraph("p1", [{ id: "t1", type: "text", text: "Cell text" }])
    const result = updateParagraphText(makeTableDoc(p), "p1", "Updated cell")
    const table = result.document.sections[0].nodes.table as unknown as TableNode
    const updated = table.nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(paragraphText(updated)).toBe("Updated cell")
  })

  it("splits plain text paragraph and preserves total text", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "world" },
    ])
    const result = splitParagraphAtIndex(makeDoc({ p1: p }, ["p1"]), "p1", 6)
    const section = result.doc.document.sections[0]
    const first = section.nodes.p1
    const second = section.nodes[result.newNodeId]

    expect(first.type).toBe("paragraph")
    expect(second?.type).toBe("paragraph")
    if (first.type !== "paragraph" || second?.type !== "paragraph") return
    expect(paragraphText(first)).toBe("Hello ")
    expect(paragraphText(second)).toBe("world")
  })

  it("does not split mixed inline paragraph", () => {
    const p = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const doc = makeDoc({ p1: p }, ["p1"])
    const result = splitParagraphAtIndex(doc, "p1", 3)

    expect(result.doc).toBe(doc)
    expect(result.newNodeId).toBe("")
  })

  it("merges plain text paragraphs and collapses merged result to one run", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Hello " },
      { id: "t2", type: "text", text: "there" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t3", type: "text", text: " world" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).not.toBeNull()
    if (!result) return
    const updated = result.doc.document.sections[0].nodes.p1
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children).toHaveLength(1)
    expect(paragraphText(updated)).toBe("Hello there world")
    expect(result.caretIndex).toBe("Hello there".length)
  })

  it("does not merge when either paragraph has mixed inline children", () => {
    const p1 = makeParagraph("p1", [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ])
    const p2 = makeParagraph("p2", [{ id: "t2", type: "text", text: " body" }])
    const result = mergeParagraphWithPrevious(makeDoc({ p1, p2 }, ["p1", "p2"]), "p2")

    expect(result).toBeNull()
  })
})
