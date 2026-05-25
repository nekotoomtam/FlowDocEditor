import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import { resolveListMarkers } from "./listNumbering"

function paragraph(id: string, text: string, list?: ParagraphNode["props"]["list"]): ParagraphNode {
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
      ...(list ? { list } : {}),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function listDoc(paragraphs: ParagraphNode[]): DocumentNode {
  const nodes = Object.fromEntries(paragraphs.map((node) => [node.id, node])) as Record<string, LayoutNode>
  return {
    version: 1,
    document: {
      id: "doc",
      listStyles: {
        "tor-clause": {
          id: "tor-clause",
          levels: [
            { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), textIndent: pt(18) },
            { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), textIndent: pt(36) },
            { level: 2, format: "decimal", pattern: "%1.%2.%3", startAt: 1, markerIndent: pt(36), textIndent: pt(54) },
          ],
        },
        bullet: {
          id: "bullet",
          levels: [
            { level: 0, format: "bullet", pattern: "•", startAt: 1, markerIndent: pt(0), textIndent: pt(18) },
          ],
        },
      },
      listInstances: {
        "tor-main": { id: "tor-main", styleId: "tor-clause" },
        "tor-appendix": { id: "tor-appendix", styleId: "tor-clause" },
        bullets: { id: "bullets", styleId: "bullet" },
      },
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
          body: { id: "body", type: "body", props: {}, childIds: paragraphs.map((node) => node.id) },
          ...nodes,
        },
      }],
    },
  }
}

describe("resolveListMarkers", () => {
  it("resolves decimal multilevel numbering from paragraph list metadata", () => {
    const doc = listDoc([
      paragraph("p1", "Background", { instanceId: "tor-main", level: 0, itemId: "intro" }),
      paragraph("p2", "Objective", { instanceId: "tor-main", level: 1, itemId: "objective" }),
      paragraph("p3", "Scope", { instanceId: "tor-main", level: 1, itemId: "scope" }),
      paragraph("p4", "Qualification", { instanceId: "tor-main", level: 0, itemId: "qualification" }),
    ])

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.markerText).toBe("1.")
    expect(markers.get("p2")?.markerText).toBe("1.1")
    expect(markers.get("p3")?.markerText).toBe("1.2")
    expect(markers.get("p4")?.markerText).toBe("2.")
  })

  it("keeps independent counters for separate list instances that share a style", () => {
    const doc = listDoc([
      paragraph("p1", "Main TOR", { instanceId: "tor-main", level: 0, itemId: "main" }),
      paragraph("p2", "Appendix", { instanceId: "tor-appendix", level: 0, itemId: "appendix" }),
      paragraph("p3", "Main TOR next", { instanceId: "tor-main", level: 0, itemId: "main-next" }),
    ])

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.markerText).toBe("1.")
    expect(markers.get("p2")?.markerText).toBe("1.")
    expect(markers.get("p3")?.markerText).toBe("2.")
  })

  it("applies paragraph startAt as a restart for that list level", () => {
    const doc = listDoc([
      paragraph("p1", "Start at three", { instanceId: "tor-main", level: 0, itemId: "start-three", startAt: 3 }),
      paragraph("p2", "After three", { instanceId: "tor-main", level: 0, itemId: "after-three" }),
    ])

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.ordinal).toBe(3)
    expect(markers.get("p1")?.markerText).toBe("3.")
    expect(markers.get("p2")?.markerText).toBe("4.")
  })

  it("does not create markers for normal paragraphs and never changes paragraph children", () => {
    const normal = paragraph("p1", "plain text")
    const listed = paragraph("p2", "list text", { instanceId: "bullets", level: 0, itemId: "bullet-one" })
    const doc = listDoc([normal, listed])

    const markers = resolveListMarkers(doc)

    expect(markers.has("p1")).toBe(false)
    expect(markers.get("p2")?.markerText).toBe("•")
    expect(normal.children).toEqual([{ id: "p1-text", type: "text", text: "plain text" }])
    expect(listed.children).toEqual([{ id: "p2-text", type: "text", text: "list text" }])
  })
})
