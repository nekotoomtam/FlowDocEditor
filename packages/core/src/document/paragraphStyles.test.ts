import { describe, expect, it } from "vitest"
import type { DocumentNode, DocumentStyleDefinitions, FlowTableNode, LayoutNode, ParagraphNode, ParagraphStyleProperties, TextRunStyle } from "../schema"
import { pt } from "../schema"
import { DEFAULT_PARAGRAPH_PROPS } from "./defaults"
import {
  applyParagraphStyleProperties,
  mergeParagraphStyleProperties,
  resolveParagraphStyleForNode,
  resolveParagraphStyleProperties,
  resolveDocumentParagraphStyles,
  setParagraphStyleOverrides,
  resolveStyledParagraphProps,
  resolveTextRunStyleProperties,
} from "./paragraphStyles"

describe("paragraph style resolver", () => {
  const styles: DocumentStyleDefinitions = {
    paragraphStyles: {
      "tor.body": {
        id: "tor.body",
        name: "TOR Body",
        props: {
          fontSize: pt(14),
          fontFamilyKey: "sarabun",
          lineHeight: 1.35,
          spacingAfter: pt(6),
          box: {
            padding: {
              top: pt(1),
              right: pt(2),
              bottom: pt(3),
              left: pt(4),
            },
          },
        },
      },
    },
    textRunStyles: {
      emphasis: {
        id: "emphasis",
        style: {
          fontWeight: "bold",
          textColor: "1D4ED8",
          fontSize: pt(12),
        },
      },
    },
  }

  it("merges paragraph style definitions with local overrides", () => {
    const local: ParagraphStyleProperties = {
      fontSize: pt(16),
      textColor: "DC2626",
    }

    const resolved = resolveParagraphStyleProperties(styles, "tor.body", local)

    expect(resolved).toMatchObject({
      fontFamilyKey: "sarabun",
      lineHeight: 1.35,
      spacingAfter: pt(6),
      fontSize: pt(16),
      textColor: "DC2626",
    })
  })

  it("applies resolved properties without changing list metadata or paragraph identity", () => {
    const props = {
      ...DEFAULT_PARAGRAPH_PROPS,
      list: { instanceId: "tor-main", level: 0, itemId: "tor.item" },
    }

    const styled = applyParagraphStyleProperties(props, resolveParagraphStyleProperties(styles, "tor.body"))

    expect(styled.fontSize).toEqual(pt(14))
    expect(styled.spacingAfter).toEqual(pt(6))
    expect(styled.list).toEqual(props.list)
  })

  it("resolves a paragraph node through its paragraphStyleId", () => {
    const paragraph = {
      id: "p1",
      type: "paragraph" as const,
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.body",
      },
      children: [{ id: "t1", type: "text" as const, text: "Body" }],
    }

    const styled = resolveStyledParagraphProps(styles, paragraph)

    expect(styled.paragraphStyleId).toBe("tor.body")
    expect(styled.fontSize).toEqual(pt(14))
    expect(styled.lineHeight).toBe(1.35)
  })

  it("lets explicit local overrides win when resolving a styled paragraph", () => {
    const paragraph = {
      id: "p1",
      type: "paragraph" as const,
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.body",
      },
      children: [{ id: "t1", type: "text" as const, text: "Body" }],
    }

    const styled = resolveStyledParagraphProps(styles, paragraph, { fontSize: pt(18) })

    expect(styled.fontSize).toEqual(pt(18))
    expect(styled.fontFamilyKey).toBe("sarabun")
  })

  it("uses paragraph styleOverrides as node-local style truth", () => {
    const paragraph = {
      id: "p1",
      type: "paragraph" as const,
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.body",
        styleOverrides: {
          fontSize: pt(20),
          spacingAfter: pt(12),
        },
      },
      children: [{ id: "t1", type: "text" as const, text: "Body" }],
    }

    expect(resolveParagraphStyleForNode(styles, paragraph)).toMatchObject({
      fontFamilyKey: "sarabun",
      fontSize: pt(20),
      spacingAfter: pt(12),
    })
    expect(resolveStyledParagraphProps(styles, paragraph).fontSize).toEqual(pt(20))
  })

  it("lets local overrides clear inherited heading level", () => {
    const paragraph = {
      id: "p1",
      type: "paragraph" as const,
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.heading",
        styleOverrides: {
          headingLevel: null,
        },
      },
      children: [{ id: "t1", type: "text" as const, text: "Body" }],
    }
    const styled = resolveStyledParagraphProps({
      paragraphStyles: {
        "tor.heading": {
          id: "tor.heading",
          props: {
            headingLevel: 1,
            keepWithNext: true,
          },
        },
      },
    }, paragraph)

    expect(styled.headingLevel).toBeUndefined()
    expect(styled.keepWithNext).toBe(true)
  })

  it("resolves paragraph style refs across document sections without mutating authored props", () => {
    const paragraph: ParagraphNode = {
      id: "p1",
      type: "paragraph",
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.body",
        styleOverrides: {
          fontSize: pt(18),
        },
      },
      children: [{ id: "t1", type: "text", text: "Styled" }],
    }
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        styles,
        sections: [{
          id: "sec",
          type: "section",
          bodyRootId: "body",
          page: {
            size: "A4",
            orientation: "portrait",
            margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
          },
          nodes: {
            body: { id: "body", type: "body", props: {}, childIds: ["p1"] },
            p1: paragraph,
          },
        }],
      },
    }

    const resolved = resolveDocumentParagraphStyles(doc)
    const authored = doc.document.sections[0].nodes.p1 as ParagraphNode
    const styled = resolved.document.sections[0].nodes.p1 as ParagraphNode

    expect(resolved).not.toBe(doc)
    expect(styled.props.fontFamilyKey).toBe("sarabun")
    expect(styled.props.spacingAfter).toEqual(pt(6))
    expect(styled.props.fontSize).toEqual(pt(18))
    expect(authored.props.fontSize).toEqual(DEFAULT_PARAGRAPH_PROPS.fontSize)
  })

  it("resolves paragraph style refs inside flow-table internal nodes", () => {
    const paragraph: ParagraphNode = {
      id: "p1",
      type: "paragraph",
      props: {
        ...DEFAULT_PARAGRAPH_PROPS,
        paragraphStyleId: "tor.body",
      },
      children: [{ id: "t1", type: "text", text: "Cell" }],
    }
    const table: FlowTableNode = {
      id: "tbl",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(120) }],
      rowIds: ["r1"],
      nodes: {
        r1: { id: "r1", type: "flow-table-row", props: {}, cellIds: ["c1"] },
        c1: { id: "c1", type: "flow-table-cell", props: {}, childIds: ["p1"] },
        p1: paragraph,
      },
    }
    const doc: DocumentNode = {
      version: 1,
      document: {
        id: "doc",
        styles,
        sections: [{
          id: "sec",
          type: "section",
          bodyRootId: "body",
          page: {
            size: "A4",
            orientation: "portrait",
            margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
          },
          nodes: {
            body: { id: "body", type: "body", props: {}, childIds: ["tbl"] },
            tbl: table as unknown as LayoutNode,
          },
        }],
      },
    }

    const resolved = resolveDocumentParagraphStyles(doc)
    const resolvedTable = resolved.document.sections[0].nodes.tbl as unknown as FlowTableNode
    const styled = resolvedTable.nodes.p1 as ParagraphNode

    expect(styled.props.fontFamilyKey).toBe("sarabun")
    expect(styled.props.spacingAfter).toEqual(pt(6))
    expect((table.nodes.p1 as ParagraphNode).props.spacingAfter).toEqual(DEFAULT_PARAGRAPH_PROPS.spacingAfter)
  })

  it("sets and clears cloned paragraph style overrides", () => {
    const paragraph = {
      id: "p1",
      type: "paragraph" as const,
      props: DEFAULT_PARAGRAPH_PROPS,
      children: [{ id: "t1", type: "text" as const, text: "Body" }],
    }
    const overrides = { fontSize: pt(18) }
    const updated = setParagraphStyleOverrides(paragraph, overrides)

    overrides.fontSize.value = 99

    expect(updated.props.styleOverrides).toEqual({ fontSize: pt(18) })
    expect(setParagraphStyleOverrides(updated, undefined).props.styleOverrides).toBeUndefined()
  })

  it("clones unit and box values so callers cannot mutate shared definitions", () => {
    const resolved = resolveParagraphStyleProperties(styles, "tor.body")

    resolved.spacingAfter!.value = 99
    resolved.box!.padding!.left.value = 88

    expect(styles.paragraphStyles!["tor.body"].props.spacingAfter).toEqual(pt(6))
    expect(styles.paragraphStyles!["tor.body"].props.box?.padding?.left).toEqual(pt(4))
  })

  it("resolves missing paragraph styles to local overrides only", () => {
    const resolved = resolveParagraphStyleProperties(styles, "missing", { indentLeft: pt(12) })

    expect(resolved).toEqual({ indentLeft: pt(12) })
  })

  it("merges text-run style presets with local overrides", () => {
    const local: TextRunStyle = { fontStyle: "italic", textColor: "DC2626" }

    const resolved = resolveTextRunStyleProperties(styles, "emphasis", local)

    expect(resolved).toEqual({
      fontWeight: "bold",
      fontStyle: "italic",
      textColor: "DC2626",
      fontSize: pt(12),
    })
  })

  it("keeps later paragraph style layers as the effective value", () => {
    const merged = mergeParagraphStyleProperties(
      { spacingBefore: pt(4), spacingAfter: pt(4) },
      { spacingAfter: pt(10) },
    )

    expect(merged).toEqual({
      spacingBefore: pt(4),
      spacingAfter: pt(10),
    })
  })
})
