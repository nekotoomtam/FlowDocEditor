import { describe, expect, it } from "vitest"
import type { DocumentNode } from "../schema"
import { pt } from "../schema"
import { createDefaultDocument, createParagraphNode } from "./defaults"
import {
  buildListGroupManagerItems,
  buildListStyleManagerItems,
  buildParagraphStyleManagerItems,
  buildStyleManagerState,
  resolveParagraphListContext,
  STYLE_MANAGER_LIST_GROUP_GROUP_ID,
  STYLE_MANAGER_LIST_STYLE_GROUP_ID,
  STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID,
} from "./styleManager"
import {
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_HEADING1_PARAGRAPH_STYLE_ID,
  TOR_HEADING2_PARAGRAPH_STYLE_ID,
} from "./paragraphStylePresets"
import {
  BULLET_BASIC_LIST_STYLE_ID,
  PAREN_DECIMAL_LIST_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
  getAllListStylePresets,
} from "./listPresets"

function emptyDoc(): DocumentNode {
  return {
    version: 1,
    document: {
      id: "doc",
      sections: [],
    },
  }
}

function listedParagraph(
  id: string,
  text: string,
  instanceId: string,
  level: number,
  itemId: string,
) {
  return {
    ...createParagraphNode(text, {
      list: { instanceId, level, itemId },
    }),
    id,
  }
}

function docWithListGroups(): DocumentNode {
  const doc = createDefaultDocument("List groups")
  const section = doc.document.sections[0]
  const p1 = listedParagraph("p1", "First", "tor-main", 0, "tor.first")
  const p2 = listedParagraph("p2", "Second", "tor-main", 1, "tor.second")
  const p3 = listedParagraph("p3", "Appendix", "appendix-a", 0, "appendix.a")
  const pMissing = listedParagraph("p-missing", "Missing", "missing-group", 0, "missing")
  doc.document.listStyles = getAllListStylePresets()
  doc.document.listInstances = {
    "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
    "appendix-a": { id: "appendix-a", styleId: TOR_CLAUSE_LIST_STYLE_ID, startAt: 1 },
    unused: { id: "unused", styleId: BULLET_BASIC_LIST_STYLE_ID },
  }
  section.bodyRootId = "body"
  section.nodes = {
    body: { id: "body", type: "body", props: {}, childIds: [p1.id, p2.id, pMissing.id, p3.id] },
    [p1.id]: p1,
    [p2.id]: p2,
    [pMissing.id]: pMissing,
    [p3.id]: p3,
  }
  return doc
}

function docWithFlowTableListGroup(): DocumentNode {
  const doc = createDefaultDocument("Flow table list group")
  const section = doc.document.sections[0]
  const p1 = listedParagraph("p1", "First cell item", "tor-main", 0, "tor.first")
  const p2 = listedParagraph("p2", "Nested cell item", "tor-main", 1, "tor.second")
  doc.document.listStyles = getAllListStylePresets()
  doc.document.listInstances = {
    "tor-main": { id: "tor-main", styleId: TOR_CLAUSE_LIST_STYLE_ID },
  }
  section.bodyRootId = "body"
  section.nodes = {
    body: { id: "body", type: "body", props: {}, childIds: ["ft1"] },
    ft1: {
      id: "ft1",
      type: "flow-table",
      props: {},
      columns: [{ width: pt(180) }],
      rowIds: ["r1"],
      nodes: {
        r1: { id: "r1", type: "flow-table-row", props: {}, cellIds: ["c1"] },
        c1: { id: "c1", type: "flow-table-cell", props: {}, childIds: ["p1", "p2"] },
        p1,
        p2,
      },
    },
  }
  return doc
}

describe("style manager data layer", () => {
  it("builds paragraph style manager state from document-owned styles", () => {
    const doc = createDefaultDocument("Styles")

    const state = buildStyleManagerState(doc)

    expect(state.baseParagraphStyleId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(state.paragraphStyles.id).toBe(STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID)
    expect(state.paragraphStyles.label).toBe("Paragraph styles")
    expect(state.paragraphStyles.items).toHaveLength(1)
    expect(state.paragraphStyles.items[0]).toMatchObject({
      kind: "paragraph-style",
      id: TOR_BODY_PARAGRAPH_STYLE_ID,
      label: "TOR Body",
      source: "document",
      isBase: true,
      canEdit: true,
      canRename: true,
      canDelete: false,
      presetId: TOR_BODY_PARAGRAPH_STYLE_ID,
    })
  })

  it("returns an empty paragraph style group when a document has no styles", () => {
    expect(buildStyleManagerState(emptyDoc())).toEqual({
      baseParagraphStyleId: undefined,
      paragraphStyles: {
        id: STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID,
        label: "Paragraph styles",
        items: [],
      },
      listStyles: {
        id: STYLE_MANAGER_LIST_STYLE_GROUP_ID,
        label: "List styles",
        items: [],
      },
      listGroups: {
        id: STYLE_MANAGER_LIST_GROUP_GROUP_ID,
        label: "List groups",
        items: [],
      },
    })
  })

  it("sorts the base style first, then known presets, then custom styles by label", () => {
    const doc = emptyDoc()
    doc.document.styles = {
      baseParagraphStyleId: "custom.base",
      paragraphStyles: {
        "custom.z": {
          id: "custom.z",
          name: "Zeta",
          props: {},
        },
        [TOR_HEADING2_PARAGRAPH_STYLE_ID]: {
          id: TOR_HEADING2_PARAGRAPH_STYLE_ID,
          name: "Heading 2",
          props: {},
        },
        "custom.a": {
          id: "custom.a",
          name: "Alpha",
          props: {},
        },
        "custom.base": {
          id: "custom.base",
          name: "Document Base",
          props: {},
        },
        [TOR_BODY_PARAGRAPH_STYLE_ID]: {
          id: TOR_BODY_PARAGRAPH_STYLE_ID,
          name: "Body",
          props: {},
        },
        [TOR_HEADING1_PARAGRAPH_STYLE_ID]: {
          id: TOR_HEADING1_PARAGRAPH_STYLE_ID,
          name: "Heading 1",
          props: {},
        },
      },
    }

    expect(buildParagraphStyleManagerItems(doc.document.styles).map((item) => item.id)).toEqual([
      "custom.base",
      TOR_BODY_PARAGRAPH_STYLE_ID,
      TOR_HEADING1_PARAGRAPH_STYLE_ID,
      TOR_HEADING2_PARAGRAPH_STYLE_ID,
      "custom.a",
      "custom.z",
    ])
  })

  it("falls back to the style id when a style has no display name", () => {
    const doc = emptyDoc()
    doc.document.styles = {
      baseParagraphStyleId: "custom.body",
      paragraphStyles: {
        "custom.body": {
          id: "custom.body",
          name: " ",
          props: {},
        },
      },
    }

    expect(buildParagraphStyleManagerItems(doc.document.styles)[0].label).toBe("custom.body")
  })

  it("does not report a base style when the base id is missing from document styles", () => {
    const doc = emptyDoc()
    doc.document.styles = {
      baseParagraphStyleId: "missing",
      paragraphStyles: {
        "custom.body": {
          id: "custom.body",
          props: {},
        },
      },
    }

    const state = buildStyleManagerState(doc)

    expect(state.baseParagraphStyleId).toBeUndefined()
    expect(state.paragraphStyles.items[0].isBase).toBe(false)
  })

  it("clones style definitions so manager data cannot mutate the document", () => {
    const doc = emptyDoc()
    doc.document.styles = {
      baseParagraphStyleId: "custom.body",
      paragraphStyles: {
        "custom.body": {
          id: "custom.body",
          props: { fontSize: pt(12), spacingAfter: pt(8) },
        },
      },
    }

    const item = buildParagraphStyleManagerItems(doc.document.styles)[0]
    item.definition.props.fontSize!.value = 99
    item.definition.props.spacingAfter!.value = 88

    expect(doc.document.styles.paragraphStyles!["custom.body"].props.fontSize).toEqual(pt(12))
    expect(doc.document.styles.paragraphStyles!["custom.body"].props.spacingAfter).toEqual(pt(8))
  })

  it("keeps preset-id styles document-owned after they are cloned into the document", () => {
    const doc = createDefaultDocument("Preset ownership")
    const item = buildStyleManagerState(doc).paragraphStyles.items[0]

    expect(item.id).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
    expect(item.source).toBe("document")
    expect(item.presetId).toBe(TOR_BODY_PARAGRAPH_STYLE_ID)
  })

  it("builds list style manager items from document-owned list styles", () => {
    const doc = emptyDoc()
    doc.document.listStyles = getAllListStylePresets()

    const items = buildListStyleManagerItems(doc.document.listStyles)

    expect(items.map((item) => item.id)).toEqual([
      TOR_CLAUSE_LIST_STYLE_ID,
      PAREN_DECIMAL_LIST_STYLE_ID,
      BULLET_BASIC_LIST_STYLE_ID,
    ])
    expect(items[0]).toMatchObject({
      kind: "list-style",
      id: TOR_CLAUSE_LIST_STYLE_ID,
      label: "TOR Clause",
      source: "document",
      levelCount: 8,
      canEdit: false,
      canRename: false,
      canDelete: false,
      presetId: TOR_CLAUSE_LIST_STYLE_ID,
    })
  })

  it("clones list style definitions so manager data cannot mutate the document", () => {
    const doc = emptyDoc()
    doc.document.listStyles = getAllListStylePresets()

    const item = buildListStyleManagerItems(doc.document.listStyles)[0]
    item.definition.levels[0].markerIndent.value = 999

    expect(doc.document.listStyles[TOR_CLAUSE_LIST_STYLE_ID].levels[0].markerIndent).toEqual(pt(0))
  })

  it("builds list group manager items with document-order counts and resolved markers", () => {
    const doc = docWithListGroups()

    const items = buildListGroupManagerItems(doc)

    expect(items.map((item) => item.id)).toEqual(["tor-main", "appendix-a", "unused"])
    expect(items[0]).toMatchObject({
      kind: "list-group",
      id: "tor-main",
      label: "TOR Main",
      source: "document",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      styleLabel: "TOR Clause",
      itemCount: 2,
      firstDocumentOrder: 0,
      firstParagraphId: "p1",
      lastParagraphId: "p2",
      firstMarkerText: "1.",
      lastMarkerText: "1.1",
      canEdit: false,
      canRename: false,
      canDelete: false,
    })
    expect(items[1]).toMatchObject({
      id: "appendix-a",
      label: "Appendix A",
      itemCount: 1,
      firstDocumentOrder: 3,
      firstParagraphId: "p3",
      lastMarkerText: "1.",
    })
    expect(items[2]).toMatchObject({
      id: "unused",
      label: "Unused",
      styleLabel: "Bullet",
      itemCount: 0,
    })
  })

  it("adds list style and list group sections to the shared style manager state", () => {
    const state = buildStyleManagerState(docWithListGroups())

    expect(state.listStyles.id).toBe(STYLE_MANAGER_LIST_STYLE_GROUP_ID)
    expect(state.listStyles.label).toBe("List styles")
    expect(state.listStyles.items.map((item) => item.id)).toEqual([
      TOR_CLAUSE_LIST_STYLE_ID,
      PAREN_DECIMAL_LIST_STYLE_ID,
      BULLET_BASIC_LIST_STYLE_ID,
    ])
    expect(state.listGroups.id).toBe(STYLE_MANAGER_LIST_GROUP_GROUP_ID)
    expect(state.listGroups.label).toBe("List groups")
    expect(state.listGroups.items.map((item) => [item.id, item.itemCount])).toEqual([
      ["tor-main", 2],
      ["appendix-a", 1],
      ["unused", 0],
    ])
  })

  it("resolves selected paragraph list context from group membership and numbering output", () => {
    const context = resolveParagraphListContext(docWithListGroups(), "p2")

    expect(context).toEqual({
      paragraphId: "p2",
      instanceId: "tor-main",
      groupLabel: "TOR Main",
      styleId: TOR_CLAUSE_LIST_STYLE_ID,
      styleLabel: "TOR Clause",
      level: 1,
      userLevel: 2,
      itemId: "tor.second",
      itemCount: 2,
      markerText: "1.1",
      ordinal: 1,
      firstMarkerText: "1.",
      lastMarkerText: "1.1",
    })
  })

  it("builds list group summaries from flow-table cell paragraphs", () => {
    const doc = docWithFlowTableListGroup()

    expect(buildListGroupManagerItems(doc)[0]).toMatchObject({
      id: "tor-main",
      itemCount: 2,
      firstDocumentOrder: 0,
      firstParagraphId: "p1",
      lastParagraphId: "p2",
      firstMarkerText: "1.",
      lastMarkerText: "1.1",
    })
    expect(resolveParagraphListContext(doc, "p2")).toMatchObject({
      paragraphId: "p2",
      instanceId: "tor-main",
      markerText: "1.1",
      itemCount: 2,
    })
  })

  it("returns no selected paragraph list context for non-list paragraphs", () => {
    expect(resolveParagraphListContext(createDefaultDocument("No list"), "missing")).toBeNull()
    const doc = createDefaultDocument("No list")
    const paragraphId = doc.document.sections[0].bodyRootId === "body"
      ? doc.document.sections[0].nodes.body.type === "body"
        ? doc.document.sections[0].nodes.body.childIds[0]
        : null
      : null
    expect(resolveParagraphListContext(doc, paragraphId)).toBeNull()
  })
})
