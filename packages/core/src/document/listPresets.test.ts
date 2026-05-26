import { describe, expect, it } from "vitest"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import { assertDocument } from "./assert"
import { createDefaultDocument } from "./defaults"
import {
  BULLET_BASIC_LIST_STYLE_ID,
  createListInstanceForPreset,
  getAllListStylePresets,
  getListStylePreset,
  PAREN_DECIMAL_LIST_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "./listPresets"
import { resolveListMarkers } from "./listNumbering"

function firstBodyParagraph(doc: DocumentNode): { paragraphId: string; paragraph: ParagraphNode } {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type !== "body") throw new Error("expected body root")
  const paragraphId = body.childIds[0]
  const paragraph = section.nodes[paragraphId]
  if (paragraph?.type !== "paragraph") throw new Error("expected first paragraph")
  return { paragraphId, paragraph }
}

describe("list style presets", () => {
  it("defines the TOR clause preset through all supported list levels", () => {
    const style = getListStylePreset(TOR_CLAUSE_LIST_STYLE_ID)

    expect(style.levels).toHaveLength(8)
    expect(style.levels.map((level) => level.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(style.levels[0]).toMatchObject({
      format: "decimal",
      pattern: "%1.",
      startAt: 1,
      markerIndent: pt(0),
      textIndent: pt(36),
    })
    expect(style.levels[7]).toMatchObject({
      format: "decimal",
      pattern: "%1.%2.%3.%4.%5.%6.%7.%8",
      startAt: 1,
      markerIndent: pt(252),
      textIndent: pt(288),
    })
  })

  it("defines reusable subitem and bullet presets", () => {
    const presets = getAllListStylePresets()

    expect(presets[PAREN_DECIMAL_LIST_STYLE_ID].levels[0]).toMatchObject({
      format: "decimal",
      pattern: "(%1)",
      startAt: 1,
      markerIndent: pt(72),
      textIndent: pt(108),
    })
    expect(presets[BULLET_BASIC_LIST_STYLE_ID].levels[0]).toMatchObject({
      format: "bullet",
      pattern: "•",
      startAt: 1,
      markerIndent: pt(72),
      textIndent: pt(108),
    })
  })

  it("returns cloned preset definitions before inserting them into documents", () => {
    const first = getListStylePreset(TOR_CLAUSE_LIST_STYLE_ID)
    first.levels[0].markerIndent.value = 999

    const second = getListStylePreset(TOR_CLAUSE_LIST_STYLE_ID)

    expect(second.levels[0].markerIndent).toEqual(pt(0))
  })

  it("creates preset list instances with optional top-level startAt", () => {
    expect(createListInstanceForPreset("tor-main", TOR_CLAUSE_LIST_STYLE_ID)).toEqual({
      id: "tor-main",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
    })
    expect(createListInstanceForPreset("tor-annex", TOR_CLAUSE_LIST_STYLE_ID, 3)).toEqual({
      id: "tor-annex",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      startAt: 3,
    })
  })

  it("can be used as valid document list definitions without writing markers into text", () => {
    const doc = createDefaultDocument("List preset")
    const { paragraphId, paragraph } = firstBodyParagraph(doc)
    const torStyle = getListStylePreset(TOR_CLAUSE_LIST_STYLE_ID)
    const section = doc.document.sections[0]
    const listedParagraph: ParagraphNode = {
      ...paragraph,
      props: {
        ...paragraph.props,
        list: {
          instanceId: "tor-main",
          level: 7,
          itemId: "tor.deep.clause",
        },
      },
      children: [{ id: `${paragraphId}-text`, type: "text", text: "Deep clause" }],
    }
    const nextDoc: DocumentNode = {
      ...doc,
      document: {
        ...doc.document,
        listStyles: { [torStyle.id]: torStyle },
        listInstances: {
          "tor-main": createListInstanceForPreset("tor-main", TOR_CLAUSE_LIST_STYLE_ID),
        },
        sections: [{
          ...section,
          nodes: {
            ...section.nodes,
            [paragraphId]: listedParagraph as unknown as LayoutNode,
          },
        }],
      },
    }

    expect(() => assertDocument(nextDoc)).not.toThrow()
    expect(resolveListMarkers(nextDoc).get(paragraphId)?.markerText).toBe("1.1.1.1.1.1.1.1")
    expect(listedParagraph.children).toEqual([{ id: `${paragraphId}-text`, type: "text", text: "Deep clause" }])
  })
})
