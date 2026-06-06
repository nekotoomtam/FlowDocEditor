import { describe, expect, it } from "vitest"
import { createParagraphNode } from "@/document"
import type { DocumentNode, LayoutNode, ParagraphNode } from "@/schema"
import {
  resolveStructuralParagraphEligibility,
  resolveStructuralResultParagraph,
  resolveStructuralSourceDocument,
  summarizeStructuralOptimisticPaginatedForPerf,
} from "../structuralEditPreparationPlans"

function makeDoc(nodes?: Record<string, LayoutNode>, childIds = ["p1"]): DocumentNode {
  const paragraph = createParagraphNode("Hello")
  const p1: ParagraphNode = { ...paragraph, id: "p1" }
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
          margin: {
            top: { value: 72, unit: "pt" },
            right: { value: 72, unit: "pt" },
            bottom: { value: 72, unit: "pt" },
            left: { value: 72, unit: "pt" },
          },
        },
        nodes: nodes ?? {
          body: { id: "body", type: "body", props: {}, childIds },
          p1,
        },
      }],
    },
  } as unknown as DocumentNode
}

describe("structural edit preparation plans", () => {
  it("keeps current document when no draft text is supplied", () => {
    const doc = makeDoc()

    expect(resolveStructuralSourceDocument({ doc, nodeId: "p1" })).toEqual({
      doc,
      textSupplied: false,
      textChanged: false,
      textResolved: false,
      currentTextResolveMs: 0,
      replaceDraftTextMs: 0,
    })
  })

  it("resolves unchanged and changed draft text with measured metadata", () => {
    const doc = makeDoc()
    const unchangedClock = [10, 14]
    const unchanged = resolveStructuralSourceDocument({
      doc,
      nodeId: "p1",
      text: "Hello",
      now: () => unchangedClock.shift() ?? 14,
    })

    expect(unchanged).toMatchObject({
      doc,
      textSupplied: true,
      textChanged: false,
      textResolved: true,
      currentTextResolveMs: 4,
      replaceDraftTextMs: 0,
    })

    const changedClock = [20, 23, 30, 37]
    const changed = resolveStructuralSourceDocument({
      doc,
      nodeId: "p1",
      text: "Hello draft",
      now: () => changedClock.shift() ?? 37,
    })

    expect(changed).toMatchObject({
      textSupplied: true,
      textChanged: true,
      textResolved: true,
      currentTextResolveMs: 3,
      replaceDraftTextMs: 7,
    })
    expect(resolveStructuralResultParagraph({ doc: changed.doc, nodeId: "p1" })).toMatchObject({
      resolved: true,
      text: "Hello draft",
      textLength: 11,
    })
  })

  it("classifies text-run paragraph eligibility without DOM state", () => {
    expect(resolveStructuralParagraphEligibility({ doc: makeDoc(), nodeId: "p1" })).toMatchObject({
      eligible: true,
      paragraph: { id: "p1" },
    })

    const flowStackDoc = makeDoc({
      body: { id: "body", type: "body", props: {}, childIds: ["fr1"] },
      fr1: { id: "fr1", type: "flow-row", props: {}, childIds: ["fs1"] },
      fs1: { id: "fs1", type: "flow-stack", props: { widthShare: 100 }, childIds: ["p1"] },
      p1: { ...createParagraphNode("Stack text"), id: "p1" },
    } as unknown as Record<string, LayoutNode>)

    expect(resolveStructuralParagraphEligibility({ doc: flowStackDoc, nodeId: "p1" })).toMatchObject({
      eligible: false,
      reason: "flow-stack",
      paragraph: { id: "p1" },
    })
    expect(resolveStructuralParagraphEligibility({ doc: makeDoc(), nodeId: "missing" })).toEqual({
      eligible: false,
      reason: "missing-paragraph",
      paragraph: null,
    })
  })

  it("resolves operation result paragraph metadata and optimistic summary inputs", () => {
    expect(resolveStructuralResultParagraph({ doc: makeDoc(), nodeId: "p1" })).toMatchObject({
      resolved: true,
      paragraph: { id: "p1" },
      text: "Hello",
      textLength: 5,
    })

    expect(summarizeStructuralOptimisticPaginatedForPerf(null)).toBeNull()
  })
})
