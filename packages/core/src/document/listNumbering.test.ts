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

  it("applies list instance startAt before style startAt for top-level counters", () => {
    const doc = listDoc([
      paragraph("p1", "Appendix first", { instanceId: "tor-appendix", level: 0, itemId: "appendix-first" }),
      paragraph("p2", "Appendix child", { instanceId: "tor-appendix", level: 1, itemId: "appendix-child" }),
      paragraph("p3", "Appendix second", { instanceId: "tor-appendix", level: 0, itemId: "appendix-second" }),
    ])
    doc.document.listInstances = {
      ...doc.document.listInstances,
      "tor-appendix": { id: "tor-appendix", styleId: "tor-clause", startAt: 3 },
    }

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.ordinal).toBe(3)
    expect(markers.get("p1")?.markerText).toBe("3.")
    expect(markers.get("p2")?.markerText).toBe("3.1")
    expect(markers.get("p3")?.markerText).toBe("4.")
  })

  it("uses list instance startAt for a missing top-level parent counter", () => {
    const doc = listDoc([
      paragraph("p1", "Appendix child first", { instanceId: "tor-appendix", level: 1, itemId: "appendix-child-first" }),
    ])
    doc.document.listInstances = {
      ...doc.document.listInstances,
      "tor-appendix": { id: "tor-appendix", styleId: "tor-clause", startAt: 3 },
    }

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.markerText).toBe("3.1")
  })

  it("lets paragraph startAt override list instance startAt", () => {
    const doc = listDoc([
      paragraph("p1", "Override", { instanceId: "tor-appendix", level: 0, itemId: "override", startAt: 8 }),
      paragraph("p2", "After override", { instanceId: "tor-appendix", level: 0, itemId: "after-override" }),
    ])
    doc.document.listInstances = {
      ...doc.document.listInstances,
      "tor-appendix": { id: "tor-appendix", styleId: "tor-clause", startAt: 3 },
    }

    const markers = resolveListMarkers(doc)

    expect(markers.get("p1")?.markerText).toBe("8.")
    expect(markers.get("p2")?.markerText).toBe("9.")
  })

  it("uses restartAfterLevel to narrow which shallower level resets a counter", () => {
    const doc = listDoc([
      paragraph("p1", "Parent", { instanceId: "tor-main", level: 0, itemId: "parent" }),
      paragraph("p2", "First child", { instanceId: "tor-main", level: 1, itemId: "first-child" }),
      paragraph("p3", "First grandchild", { instanceId: "tor-main", level: 2, itemId: "first-grandchild" }),
      paragraph("p4", "Second child", { instanceId: "tor-main", level: 1, itemId: "second-child" }),
      paragraph("p5", "Continued grandchild counter", { instanceId: "tor-main", level: 2, itemId: "continued-grandchild" }),
      paragraph("p6", "Next parent", { instanceId: "tor-main", level: 0, itemId: "next-parent" }),
      paragraph("p7", "Reset child", { instanceId: "tor-main", level: 1, itemId: "reset-child" }),
      paragraph("p8", "Reset grandchild", { instanceId: "tor-main", level: 2, itemId: "reset-grandchild" }),
    ])
    doc.document.listStyles = {
      ...doc.document.listStyles,
      "tor-clause": {
        ...doc.document.listStyles?.["tor-clause"],
        id: "tor-clause",
        levels: [
          { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), textIndent: pt(18) },
          { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, markerIndent: pt(18), textIndent: pt(36) },
          {
            level: 2,
            format: "decimal",
            pattern: "%1.%2.%3",
            startAt: 1,
            restartAfterLevel: 0,
            markerIndent: pt(36),
            textIndent: pt(54),
          },
        ],
      },
    }

    const markers = resolveListMarkers(doc)

    expect(markers.get("p3")?.markerText).toBe("1.1.1")
    expect(markers.get("p5")?.markerText).toBe("1.2.2")
    expect(markers.get("p8")?.markerText).toBe("2.1.1")
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
