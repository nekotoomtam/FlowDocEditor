import { describe, expect, it } from "vitest"
import { pt, type DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import {
  commitWysiwygRichTextEditState,
  commitWysiwygTextEditState,
  getEditableParagraphFromDocument,
  getPlainParagraphTextFromDocument,
  type WysiwygTextCommitState,
} from "../wysiwygTextCommit"

function paginated(id: string): PaginatedDocument {
  return {
    sections: [{
      sectionId: id,
      pages: [],
    }],
  } as unknown as PaginatedDocument
}

function docWithParagraph(text: string): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
          p1: {
            id: "p1",
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
            children: [{ id: "p1-text", type: "text", text }],
          },
        },
      }],
    },
  }
}

function docWithFlowStackParagraph(text: string): DocumentNode {
  const paragraph = docWithParagraph(text).document.sections[0].nodes.p1
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
          fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
          fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
          p1: paragraph,
        },
      }],
    },
  }
}

function docWithFlowTableParagraph(text: string): DocumentNode {
  const paragraph = docWithParagraph(text).document.sections[0].nodes.p1
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [{
        id: "section",
        type: "section",
        bodyRootId: "body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
          ft1: {
            id: "ft1",
            type: "flow-table",
            props: {},
            columns: [{ width: pt(100) }],
            rowIds: ["row1"],
            nodes: {
              row1: { id: "row1", type: "flow-table-row", props: {}, cellIds: ["cell1"] },
              cell1: { id: "cell1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
              p1: paragraph,
            },
          },
        },
      }],
    },
  }
}

function textRunSummary(doc: DocumentNode, nodeId: string): unknown[] {
  const paragraph = getEditableParagraphFromDocument(doc, nodeId)
  if (!paragraph) return []
  return paragraph.children.map((child) =>
    child.type === "text"
      ? { id: child.id, text: child.text, style: child.style }
      : child,
  )
}

describe("commitWysiwygTextEditState", () => {
  it("commits session draft text once and records one history entry", () => {
    const beforeDoc = docWithParagraph("Alpha")
    const beforePaginated = paginated("before")
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: beforePaginated,
      past: [],
      future: [{ doc: docWithParagraph("Future"), paginated: paginated("future") }],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Alpha!",
      beforeText: "Alpha",
      afterPaginated: paginated("after"),
    }, 50)

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha!")
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toEqual({ doc: beforeDoc, paginated: beforePaginated })
    expect(next.future).toEqual([])
  })

  it("does not add history when draft text matches the session base text", () => {
    const state: WysiwygTextCommitState = {
      doc: docWithParagraph("Alpha"),
      paginated: paginated("before"),
      past: [],
      future: [],
    }
    const afterPaginated = paginated("after")

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Alpha",
      beforeText: "Alpha",
      afterPaginated,
    }, 50)

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([])
  })

  it("uses the captured inline-edit history when provided", () => {
    const history = { doc: docWithParagraph("Original"), paginated: paginated("original") }
    const state: WysiwygTextCommitState = {
      doc: docWithParagraph("Draft base"),
      paginated: paginated("current"),
      past: [],
      future: [],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Committed",
      beforeText: "Draft base",
      history,
      afterPaginated: paginated("after"),
    }, 50)

    expect(next.past).toEqual([history])
  })

  it("commits flow-stack paragraph drafts without changing the flow tree", () => {
    const beforeDoc = docWithFlowStackParagraph("Flow base")
    const beforePaginated = paginated("before-flow")
    const afterPaginated = paginated("after-flow")
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: beforePaginated,
      past: [],
      future: [{ doc: docWithParagraph("Future"), paginated: paginated("future") }],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Flow committed",
      beforeText: "Flow base",
      afterPaginated,
    }, 50)

    expect(getPlainParagraphTextFromDocument(beforeDoc, "p1")).toBe("Flow base")
    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Flow committed")
    expect(next.doc.document.sections[0].nodes.fr1.type).toBe("flow-row")
    expect(next.doc.document.sections[0].nodes.fs1.type).toBe("flow-stack")
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([{ doc: beforeDoc, paginated: beforePaginated }])
    expect(next.future).toEqual([])
  })

  it("commits styled text-run paragraphs without stripping unchanged run styles", () => {
    const beforeDoc = docWithParagraph("Hello world")
    const paragraph = beforeDoc.document.sections[0].nodes.p1
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph")
    paragraph.children = [
      { id: "t1", type: "text", text: "Hello ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "world", style: { fontStyle: "italic" } },
    ]
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: paginated("before"),
      past: [],
      future: [],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Hello wide world",
      beforeText: "Hello world",
      afterPaginated: paginated("after"),
    }, 50)
    const updated = next.doc.document.sections[0].nodes.p1

    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children.map((child) =>
      child.type === "text"
        ? { text: child.text, style: child.style }
        : child,
    )).toEqual([
      { text: "Hello wide ", style: { fontWeight: "bold" } },
      { text: "world", style: { fontStyle: "italic" } },
    ])
    expect(next.past).toHaveLength(1)
  })

  it("commits deletions across styled text-run boundaries without pulling later styles backward", () => {
    const beforeDoc = docWithParagraph("Alpha Beta Gamma")
    const paragraph = beforeDoc.document.sections[0].nodes.p1
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph")
    paragraph.children = [
      { id: "t1", type: "text", text: "Alpha ", style: { fontWeight: "bold" } },
      { id: "t2", type: "text", text: "Beta ", style: { fontStyle: "italic" } },
      { id: "t3", type: "text", text: "Gamma", style: { textColor: "2563EB" } },
    ]
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: paginated("before"),
      past: [],
      future: [],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Alpha Gamma",
      beforeText: "Alpha Beta Gamma",
      afterPaginated: paginated("after"),
    }, 50)
    const updated = next.doc.document.sections[0].nodes.p1

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha Gamma")
    expect(updated.type).toBe("paragraph")
    if (updated.type !== "paragraph") return
    expect(updated.children.map((child) =>
      child.type === "text"
        ? { text: child.text, style: child.style }
        : child,
    )).toEqual([
      { text: "Alpha ", style: { fontWeight: "bold" } },
      { text: "Gamma", style: { textColor: "2563EB" } },
    ])
    expect(next.past).toHaveLength(1)
  })

  it("refuses to commit paragraphs that contain inline objects", () => {
    const beforeDoc = docWithParagraph("Page ")
    const paragraph = beforeDoc.document.sections[0].nodes.p1
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph")
    paragraph.children = [
      { id: "t1", type: "text", text: "Page " },
      { id: "pn", type: "pageNumber" },
    ]
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: paginated("before"),
      past: [],
      future: [],
    }

    const next = commitWysiwygTextEditState(state, {
      nodeId: "p1",
      text: "Page 1",
      beforeText: "Page ",
      afterPaginated: paginated("after"),
    }, 50)

    expect(next.doc).toBe(beforeDoc)
    expect(next.paginated).toEqual(paginated("after"))
    expect(next.past).toEqual([])
  })
})

describe("commitWysiwygRichTextEditState", () => {
  it("commits style-only rich draft paragraphs and records one history entry", () => {
    const beforeDoc = docWithParagraph("Alpha")
    const beforePaginated = paginated("before-rich")
    const afterPaginated = paginated("after-rich")
    const currentParagraph = getEditableParagraphFromDocument(beforeDoc, "p1")
    if (!currentParagraph) throw new Error("expected paragraph")
    const richParagraph = {
      ...currentParagraph,
      children: [{ id: "p1-text", type: "text" as const, text: "Alpha", style: { fontWeight: "bold" as const } }],
    }
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: beforePaginated,
      past: [],
      future: [{ doc: docWithParagraph("Future"), paginated: paginated("future") }],
    }

    const next = commitWysiwygRichTextEditState(state, {
      nodeId: "p1",
      paragraph: richParagraph,
      afterPaginated,
    }, 50)

    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha")
    expect(textRunSummary(next.doc, "p1")).toEqual([
      { id: "p1-text", text: "Alpha", style: { fontWeight: "bold" } },
    ])
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([{ doc: beforeDoc, paginated: beforePaginated }])
    expect(next.future).toEqual([])
  })

  it("does not add history when the rich paragraph is unchanged", () => {
    const beforeDoc = docWithParagraph("Alpha")
    const paragraph = getEditableParagraphFromDocument(beforeDoc, "p1")
    if (!paragraph) throw new Error("expected paragraph")
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: paginated("before"),
      past: [],
      future: [],
    }
    const afterPaginated = paginated("after")

    const next = commitWysiwygRichTextEditState(state, {
      nodeId: "p1",
      paragraph,
      afterPaginated,
    }, 50)

    expect(next.doc).toBe(beforeDoc)
    expect(next.paginated).toBe(afterPaginated)
    expect(next.past).toEqual([])
  })

  it("commits flow-table paragraph rich drafts without replacing the table shell", () => {
    const beforeDoc = docWithFlowTableParagraph("Cell")
    const beforePaginated = paginated("before-flow-table")
    const currentParagraph = getEditableParagraphFromDocument(beforeDoc, "p1")
    if (!currentParagraph) throw new Error("expected paragraph")
    const richParagraph = {
      ...currentParagraph,
      children: [{ id: "p1-text", type: "text" as const, text: "Cell", style: { textColor: "DC2626" } }],
    }
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: beforePaginated,
      past: [],
      future: [],
    }

    const next = commitWysiwygRichTextEditState(state, {
      nodeId: "p1",
      paragraph: richParagraph,
      afterPaginated: paginated("after-flow-table"),
    }, 50)

    expect(next.doc.document.sections[0].nodes.ft1.type).toBe("flow-table")
    expect(textRunSummary(next.doc, "p1")).toEqual([
      { id: "p1-text", text: "Cell", style: { textColor: "DC2626" } },
    ])
    expect(next.past).toEqual([{ doc: beforeDoc, paginated: beforePaginated }])
  })

  it("commits the target node id even if the draft paragraph id is stale", () => {
    const beforeDoc = docWithParagraph("Alpha")
    const currentParagraph = getEditableParagraphFromDocument(beforeDoc, "p1")
    if (!currentParagraph) throw new Error("expected paragraph")
    const state: WysiwygTextCommitState = {
      doc: beforeDoc,
      paginated: paginated("before"),
      past: [],
      future: [],
    }

    const next = commitWysiwygRichTextEditState(state, {
      nodeId: "p1",
      paragraph: {
        ...currentParagraph,
        id: "stale-id",
        children: [{ id: "p1-text", type: "text", text: "Alpha!" }],
      },
      afterPaginated: paginated("after"),
    }, 50)

    expect(getEditableParagraphFromDocument(next.doc, "p1")?.id).toBe("p1")
    expect(getPlainParagraphTextFromDocument(next.doc, "p1")).toBe("Alpha!")
  })
})
