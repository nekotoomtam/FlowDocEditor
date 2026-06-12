import { describe, expect, it } from "vitest"
import { createDefaultDocument, createParagraphNode } from "@/document"
import type { BodyNode, DocumentNode } from "@/schema"
import type { PendingOptimisticSplitRefocus } from "../../shell/editorShellTypes"
import { resolveOptimisticMergeSourceDocument } from "../editorStructuralMergeSource"

function docWithParagraph(nodeId: string): DocumentNode {
  const doc = createDefaultDocument(`Doc ${nodeId}`)
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId] as BodyNode
  const paragraph = { ...createParagraphNode(`Paragraph ${nodeId}`), id: nodeId }
  return {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map((candidate, index) => index === 0
        ? {
          ...candidate,
          nodes: {
            ...candidate.nodes,
            [body.id]: { ...body, childIds: [nodeId] },
            [nodeId]: paragraph,
          },
        }
        : candidate),
    },
  }
}

function pendingSplit(newNodeId: string, prestarted = true): PendingOptimisticSplitRefocus {
  return {
    sourceNodeId: "source",
    newNodeId,
    sourceFragment: {
      nodeId: "source",
      nodeType: "paragraph",
      pageIndex: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
    },
    startedAt: 10,
    prestarted,
  }
}

describe("editorStructuralMergeSource", () => {
  it("does not override the source document when optimistic merge is unavailable", () => {
    const optimisticDoc = docWithParagraph("split-node")

    expect(resolveOptimisticMergeSourceDocument({
      canTryOptimisticMerge: false,
      nodeId: "split-node",
      currentDoc: docWithParagraph("current-node"),
      optimisticLayoutDoc: optimisticDoc,
      pendingSplitRefocus: pendingSplit("split-node"),
    })).toBeNull()
  })

  it("uses the optimistic layout document for an already prestarted split node", () => {
    const optimisticDoc = docWithParagraph("split-node")

    expect(resolveOptimisticMergeSourceDocument({
      canTryOptimisticMerge: true,
      nodeId: "split-node",
      currentDoc: docWithParagraph("current-node"),
      optimisticLayoutDoc: optimisticDoc,
      pendingSplitRefocus: pendingSplit("split-node"),
    })).toBe(optimisticDoc)
  })

  it("uses the optimistic layout document when current doc has not committed the node yet", () => {
    const optimisticDoc = docWithParagraph("split-node")

    expect(resolveOptimisticMergeSourceDocument({
      canTryOptimisticMerge: true,
      nodeId: "split-node",
      currentDoc: docWithParagraph("current-node"),
      optimisticLayoutDoc: optimisticDoc,
      pendingSplitRefocus: null,
    })).toBe(optimisticDoc)
  })

  it("keeps current document ownership when the node already exists in the current doc", () => {
    const optimisticDoc = docWithParagraph("split-node")

    expect(resolveOptimisticMergeSourceDocument({
      canTryOptimisticMerge: true,
      nodeId: "split-node",
      currentDoc: docWithParagraph("split-node"),
      optimisticLayoutDoc: optimisticDoc,
      pendingSplitRefocus: null,
    })).toBeNull()
  })
})
