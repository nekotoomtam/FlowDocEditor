import { describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { pt } from "../../schema"
import {
  buildPaginationCheckpointCandidates,
  buildPaginationCheckpointStates,
  findNearestSupportedCheckpointAtOrBeforePage,
  getPaginationCheckpointInvalidationReasons,
  isPaginationCheckpointUsable,
  paginateDocumentWithTrace,
} from "../index"
import type {
  DocumentNode,
  LayoutNode,
  PageBreakNode,
  ParagraphNode,
  RowNode,
  StackNode,
} from "../../schema"

const PAGE = {
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

function makePageBreak(id: string): PageBreakNode {
  return { id, type: "page-break", props: {} }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "checkpoint-doc",
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

function makeRow(id: string): { row: RowNode, stack: StackNode, paragraph: ParagraphNode } {
  const paragraph = makePara(`${id}-p`, "inside row")
  const stack: StackNode = {
    id: `${id}-stack`,
    type: "stack",
    props: { widthShare: 100 },
    childIds: [paragraph.id],
  }
  const row: RowNode = {
    id,
    type: "row",
    props: { gap: 0 },
    childIds: [stack.id],
  }
  return { row, stack, paragraph }
}

function checkpointCandidatesFor(doc: DocumentNode) {
  const { trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)
  return buildPaginationCheckpointCandidates(trace)
}

function checkpointStatesFor(doc: DocumentNode) {
  const { trace } = paginateDocumentWithTrace(doc, defaultTextMeasurer, defaultWordBreaker)
  return buildPaginationCheckpointStates(trace, {
    sourceDocumentGenerationId: "gen-1",
    measurementVersion: "measure-1",
  })
}

describe("pagination checkpoint candidates", () => {
  it("marks simple direct body-child boundaries as supported", () => {
    const doc = makeDoc(["p1", "pb", "p2"], {
      p1: makePara("p1", "first"),
      pb: makePageBreak("pb"),
      p2: makePara("p2", "second"),
    })

    const candidates = checkpointCandidatesFor(doc)

    expect(candidates.map((candidate) => [
      candidate.beforeNodeId,
      candidate.beforeNodeType,
      candidate.pageIndex,
      candidate.status,
    ])).toEqual([
      ["p1", "paragraph", 0, "supported"],
      ["pb", "page-break", 0, "supported"],
      ["p2", "paragraph", 1, "supported"],
    ])
  })

  it("marks TOC and container body children as unsupported first-slice candidates", () => {
    const { row, stack, paragraph } = makeRow("row")
    const doc = makeDoc(["toc", "row", "after"], {
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
      row,
      [stack.id]: stack,
      [paragraph.id]: paragraph,
      after: makePara("after", "after"),
    })

    const candidates = checkpointCandidatesFor(doc)

    expect(candidates.map((candidate) => [candidate.beforeNodeId, candidate.status])).toEqual([
      ["toc", "unsupported-toc"],
      ["row", "unsupported-container"],
      ["after", "supported"],
    ])
  })

  it("finds the nearest supported checkpoint at or before a target page", () => {
    const doc = makeDoc(["p1", "pb", "p2"], {
      p1: makePara("p1", "first"),
      pb: makePageBreak("pb"),
      p2: makePara("p2", "second"),
    })
    const candidates = checkpointCandidatesFor(doc)

    expect(findNearestSupportedCheckpointAtOrBeforePage(candidates, 0)?.beforeNodeId).toBe("pb")
    expect(findNearestSupportedCheckpointAtOrBeforePage(candidates, 1)?.beforeNodeId).toBe("p2")
    expect(findNearestSupportedCheckpointAtOrBeforePage(candidates, -1)).toBeNull()
  })

  it("skips unsupported candidates while searching", () => {
    const { row, stack, paragraph } = makeRow("row")
    const doc = makeDoc(["p1", "row", "pb", "p2"], {
      p1: makePara("p1", "first"),
      row,
      [stack.id]: stack,
      [paragraph.id]: paragraph,
      pb: makePageBreak("pb"),
      p2: makePara("p2", "second"),
    })
    const candidates = checkpointCandidatesFor(doc)

    expect(findNearestSupportedCheckpointAtOrBeforePage(candidates, 0)?.beforeNodeId).toBe("pb")
  })

  it("builds resume-state anchors only for supported candidates", () => {
    const doc = makeDoc(["p1", "toc", "pb", "p2"], {
      p1: makePara("p1", "first"),
      toc: { id: "toc", type: "toc", props: { title: "สารบัญ" } },
      pb: makePageBreak("pb"),
      p2: makePara("p2", "second"),
    })

    const states = checkpointStatesFor(doc)

    expect(states.map((state) => state.beforeNodeId)).toEqual(["p1", "pb", "p2"])
    expect(states.map((state) => state.cursor.pageIndex)).toEqual([0, 1, 2])
    expect(states.map((state) => state.pageNumberContext.sectionLocalPageNumber)).toEqual([1, 2, 3])
    expect(states.map((state) => state.tocDependencyStatus)).toEqual([
      "none-before",
      "toc-before-or-at",
      "toc-before-or-at",
    ])
    expect(states.every((state) => state.listNumberingStatus === "not-captured")).toBe(true)
  })

  it("keeps checkpoints before and at a content edit usable, and invalidates later checkpoints", () => {
    const doc = makeDoc(["p1", "p2", "p3"], {
      p1: makePara("p1", "first"),
      p2: makePara("p2", "second"),
      p3: makePara("p3", "third"),
    })
    const states = checkpointStatesFor(doc)

    const contentEdit = { type: "body-child-content" as const, sectionId: "sec", bodyNodeId: "body", childIndex: 1 }

    expect(states.map((state) => [
      state.beforeNodeId,
      isPaginationCheckpointUsable(state, { changes: [contentEdit] }),
    ])).toEqual([
      ["p1", true],
      ["p2", true],
      ["p3", false],
    ])
    expect(getPaginationCheckpointInvalidationReasons(states[2], { changes: [contentEdit] })).toEqual([
      "body-content-before-checkpoint",
    ])
  })

  it("invalidates checkpoints at and after a body structure edit", () => {
    const doc = makeDoc(["p1", "p2", "p3"], {
      p1: makePara("p1", "first"),
      p2: makePara("p2", "second"),
      p3: makePara("p3", "third"),
    })
    const states = checkpointStatesFor(doc)

    const structureEdit = { type: "body-structure" as const, sectionId: "sec", bodyNodeId: "body", fromChildIndex: 1 }

    expect(states.map((state) => [
      state.beforeNodeId,
      isPaginationCheckpointUsable(state, { changes: [structureEdit] }),
    ])).toEqual([
      ["p1", true],
      ["p2", false],
      ["p3", false],
    ])
  })

  it("invalidates matching section layout, measurement, and version changes", () => {
    const doc = makeDoc(["p1"], { p1: makePara("p1", "first") })
    const [state] = checkpointStatesFor(doc)

    expect(getPaginationCheckpointInvalidationReasons(state, {
      sourceDocumentGenerationId: "gen-2",
      measurementVersion: "measure-2",
      changes: [
        { type: "section-layout", sectionId: "sec" },
        { type: "measurement" },
      ],
    })).toEqual([
      "source-document-generation-mismatch",
      "measurement-version-mismatch",
      "section-layout-changed",
      "measurement-changed",
    ])
  })
})
