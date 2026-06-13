import { describe, expect, it } from "vitest"
import type { DocumentNode } from "@/schema"
import {
  buildOutlinePanelModel,
  buildOutlineStructureSignature,
} from "../outlinePanelModel"

function outlineDoc(): DocumentNode {
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
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: ["p1", "p2"] },
          p1: {
            id: "p1",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "t1", type: "text", text: "First paragraph" }],
          },
          p2: {
            id: "p2",
            type: "paragraph",
            props: {
              align: "left",
              fontSize: { value: 12, unit: "pt" },
              fontFamilyKey: "default",
              lineHeight: 1.5,
              spacingBefore: { value: 0, unit: "pt" },
              spacingAfter: { value: 0, unit: "pt" },
              textIndent: { value: 0, unit: "pt" },
              indentLeft: { value: 0, unit: "pt" },
              indentRight: { value: 0, unit: "pt" },
            },
            children: [{ id: "t2", type: "text", text: "Second paragraph" }],
          },
        },
      }],
    },
  } as DocumentNode
}

function cloneDoc(doc: DocumentNode): DocumentNode {
  return JSON.parse(JSON.stringify(doc)) as DocumentNode
}

describe("outline panel model", () => {
  it("keeps the structural signature stable for text-only paragraph edits", () => {
    const before = outlineDoc()
    const after = cloneDoc(before)
    const p2 = after.document.sections[0].nodes.p2
    if (p2?.type !== "paragraph") throw new Error("expected p2 paragraph")
    p2.children = [{ id: "t2", type: "text", text: "Second paragraph edited" }]

    expect(buildOutlineStructureSignature(after)).toBe(buildOutlineStructureSignature(before))
  })

  it("reuses cached tree data while refreshing labels for text-only edits", () => {
    const first = buildOutlinePanelModel(outlineDoc(), null)
    const edited = outlineDoc()
    const p1 = edited.document.sections[0].nodes.p1
    if (p1?.type !== "paragraph") throw new Error("expected p1 paragraph")
    p1.children = [{ id: "t1", type: "text", text: "First paragraph edited" }]

    const second = buildOutlinePanelModel(edited, first.cache)

    expect(second.model.outlineSections).toBe(first.model.outlineSections)
    expect(second.model.listGroupState).toBe(first.model.listGroupState)
    expect(second.model.markerTextByParagraphId).toBe(first.model.markerTextByParagraphId)
    expect(second.model.labelByNodeId.get("p1")).toBe("First paragraph edited")
    expect(second.stats.structureCacheHit).toBe(true)
    expect(second.stats.fullLabelRefresh).toBe(true)
  })

  it("keeps frozen labels during active text edits", () => {
    const first = buildOutlinePanelModel(outlineDoc(), null)
    const edited = outlineDoc()
    const p1 = edited.document.sections[0].nodes.p1
    if (p1?.type !== "paragraph") throw new Error("expected p1 paragraph")
    p1.children = [{ id: "t1", type: "text", text: "First paragraph while typing" }]

    const second = buildOutlinePanelModel(edited, first.cache, {
      labelUpdatePolicy: { kind: "frozen-active-edit" },
    })

    expect(second.model.outlineSections).toBe(first.model.outlineSections)
    expect(second.model.labelByNodeId).toBe(first.model.labelByNodeId)
    expect(second.model.labelByNodeId.get("p1")).toBe("First paragraph")
    expect(second.stats.labelSnapshotUsed).toBe(true)
    expect(second.stats.fullLabelRefresh).toBe(false)
  })

  it("updates only the edited node label after a text edit finishes", () => {
    const first = buildOutlinePanelModel(outlineDoc(), null)
    const edited = outlineDoc()
    const p1 = edited.document.sections[0].nodes.p1
    if (p1?.type !== "paragraph") throw new Error("expected p1 paragraph")
    p1.children = [{ id: "t1", type: "text", text: "First paragraph committed" }]

    const second = buildOutlinePanelModel(edited, first.cache, {
      labelUpdatePolicy: { kind: "single-node", nodeId: "p1" },
    })

    expect(second.model.outlineSections).toBe(first.model.outlineSections)
    expect(second.model.labelByNodeId).not.toBe(first.model.labelByNodeId)
    expect(second.model.labelByNodeId.get("p1")).toBe("First paragraph committed")
    expect(second.model.labelByNodeId.get("p2")).toBe("Second paragraph")
    expect(second.stats.singleLabelUpdated).toBe(true)
    expect(second.stats.fullLabelRefresh).toBe(false)
  })

  it("rebuilds cached tree data when body child order changes", () => {
    const first = buildOutlinePanelModel(outlineDoc(), null)
    const reordered = outlineDoc()
    const body = reordered.document.sections[0].nodes.body
    if (body?.type !== "body") throw new Error("expected body")
    body.childIds = ["p2", "p1"]

    const second = buildOutlinePanelModel(reordered, first.cache)

    expect(second.cache).not.toBe(first.cache)
    expect(second.model.outlineSections).not.toBe(first.model.outlineSections)
  })
})
