import { describe, expect, it } from "vitest"
import {
  applyParagraphTextStyle,
  createParagraphNode,
  createDefaultDocument,
  patchParagraphStyleDefinition,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  updateNodeProps,
  updateParagraphBoxStyle,
} from "@/document"
import { defaultTextMeasurer } from "@/layout"
import { paginateDocument, type PageFragment, type PaginatedDocument } from "@/pagination"
import type { BodyNode, DocumentNode } from "@/schema"
import { classifyEditorAction } from "../editorActionClassifier"
import { tryApplyVisualOnlyPaginatedUpdate } from "../editorVisualOnlyPagination"
import { createEditorOperationFromAction } from "../operations/editorOperationFromAction"
import {
  EDITOR_RENDER_ACTION_OWNERSHIP,
  resolveEditorRenderInvalidation,
} from "../operations/editorRenderInvalidation"
import { replaceEditableParagraphTextInDocument } from "../wysiwygTextCommit"

function firstParagraphId(doc: DocumentNode): string {
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (!body || !("childIds" in body)) throw new Error("expected body root")
  return body.childIds[0]
}

function firstParagraphFragment(paginated: PaginatedDocument, nodeId: string): PageFragment {
  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragment = page.fragments.find((candidate) => candidate.nodeId === nodeId && candidate.nodeType === "paragraph")
      if (fragment) return fragment
    }
  }
  throw new Error(`missing paragraph fragment ${nodeId}`)
}

function plainParagraphDocument(): { doc: DocumentNode; paragraphId: string } {
  const initial = createDefaultDocument("Visual fast lane")
  const paragraphId = firstParagraphId(initial)
  const withText = replaceEditableParagraphTextInDocument(initial, paragraphId, "Alpha Beta Gamma")
  const doc = updateNodeProps(withText, paragraphId, { paragraphStyleId: undefined })
  return { doc, paragraphId }
}

function paginatedPage(index: number, fragments: PageFragment[]): PaginatedDocument["sections"][number]["pages"][number] {
  return {
    index,
    width: 600,
    height: 800,
    contentBox: { x: 40, y: 40, width: 520, height: 720 },
    fragments,
    headerFragments: [],
    footerFragments: [],
  }
}

function paragraphFragment(nodeId: string, pageIndex: number): PageFragment {
  return {
    nodeId,
    nodeType: "paragraph",
    pageIndex,
    x: 40,
    y: 60,
    width: 300,
    height: 24,
    renderProps: {
      fontSize: 12,
      fontFamily: "Arial",
      lineHeight: 1.2,
      textColor: "000000",
      textDecoration: "none",
      strikethrough: false,
      align: "left",
    },
  } as unknown as PageFragment
}

function twoParagraphDocument(): {
  doc: DocumentNode
  firstParagraphId: string
  secondParagraphId: string
} {
  const doc = createDefaultDocument("Visual page identity")
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId] as BodyNode
  const firstId = firstParagraphId(doc)
  const secondParagraph = createParagraphNode("Second paragraph")
  const nextSection = {
    ...section,
    nodes: {
      ...section.nodes,
      [body.id]: { ...body, childIds: [firstId, secondParagraph.id] },
      [secondParagraph.id]: secondParagraph,
    },
  }
  return {
    doc: {
      ...doc,
      document: {
        ...doc.document,
        sections: [nextSection, ...doc.document.sections.slice(1)],
      },
    },
    firstParagraphId: firstId,
    secondParagraphId: secondParagraph.id,
  }
}

describe("editorVisualOnlyPagination", () => {
  it("patches paragraph text color and decoration without changing fragment geometry", () => {
    const { doc, paragraphId } = plainParagraphDocument()
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const nextDoc = applyParagraphTextStyle(doc, paragraphId, {
      textColor: "DC2626",
      textDecoration: "underline",
      strikethrough: true,
    })
    const action = {
      type: "UPDATE_PARAGRAPH_TEXT_STYLE",
      nodeId: paragraphId,
      changes: { textColor: "DC2626", textDecoration: "underline", strikethrough: true },
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      renderInvalidationPlan: resolveEditorRenderInvalidation({
        operation: createEditorOperationFromAction(action),
        paginated: currentPaginated,
      }),
      currentPaginated,
      nextPreviewDoc: nextDoc,
    })

    expect(result?.changed).toBe(true)
    const before = firstParagraphFragment(currentPaginated, paragraphId)
    const after = firstParagraphFragment(result!.paginated, paragraphId)
    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    expect(after.lines?.map((line) => line.text)).toEqual(before.lines?.map((line) => line.text))
    expect(after.renderProps).toMatchObject({
      textColor: "DC2626",
      textDecoration: "underline",
      strikethrough: true,
    })
  })

  it("refuses the fast lane when the render invalidation plan is layout-affecting", () => {
    const { doc, paragraphId } = plainParagraphDocument()
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const nextDoc = applyParagraphTextStyle(doc, paragraphId, {
      textColor: "DC2626",
    })
    const action = {
      type: "UPDATE_PARAGRAPH_TEXT_STYLE",
      nodeId: paragraphId,
      changes: { textColor: "DC2626" },
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      renderInvalidationPlan: {
        lane: "node-layout",
        pageScope: "affected-node-pages",
        affectedNodeIds: [paragraphId],
        affectedPageIndexes: [0],
        invalidatesPagination: true,
        mayUseVisualFastLane: false,
        requiresPreviewSettle: true,
        requiresHistoryEntry: true,
        ownership: EDITOR_RENDER_ACTION_OWNERSHIP,
        reason: "test:layout-affecting",
      },
      currentPaginated,
      nextPreviewDoc: nextDoc,
    })

    expect(result).toBeNull()
  })

  it("keeps unaffected page objects stable when patching one visual-only page", () => {
    const { doc, firstParagraphId, secondParagraphId } = twoParagraphDocument()
    const currentPaginated: PaginatedDocument = {
      tocEntries: [],
      sections: [
        {
          sectionId: "section-1",
          pages: [
            paginatedPage(0, [paragraphFragment(firstParagraphId, 0)]),
            paginatedPage(1, [paragraphFragment(secondParagraphId, 1)]),
          ],
        },
      ],
    }
    const nextDoc = updateNodeProps(doc, firstParagraphId, {
      styleOverrides: { textColor: "DC2626" },
    })
    const action = {
      type: "PATCH_PARAGRAPH_STYLE_OVERRIDES",
      nodeId: firstParagraphId,
      changes: { textColor: "DC2626" },
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      renderInvalidationPlan: resolveEditorRenderInvalidation({
        operation: createEditorOperationFromAction(action),
        paginated: currentPaginated,
      }),
      currentPaginated,
      nextPreviewDoc: nextDoc,
    })

    expect(result?.changed).toBe(true)
    expect(result?.paginated.sections[0].pages[0]).not.toBe(currentPaginated.sections[0].pages[0])
    expect(result?.paginated.sections[0].pages[1]).toBe(currentPaginated.sections[0].pages[1])
  })

  it("patches paragraph box fill using the existing fragment rectangle", () => {
    const { doc, paragraphId } = plainParagraphDocument()
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const nextDoc = updateParagraphBoxStyle(doc, paragraphId, { fill: "F8FAFC" })
    const action = {
      type: "UPDATE_PARAGRAPH_BOX_STYLE",
      nodeId: paragraphId,
      changes: { fill: "F8FAFC" },
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      currentPaginated,
      nextPreviewDoc: nextDoc,
    })

    expect(result?.changed).toBe(true)
    const before = firstParagraphFragment(currentPaginated, paragraphId)
    const after = firstParagraphFragment(result!.paginated, paragraphId)
    expect(after.x).toBe(before.x)
    expect(after.y).toBe(before.y)
    expect(after.height).toBe(before.height)
    expect(after.renderProps?.box?.fill).toBe("F8FAFC")
  })

  it("patches visual paragraph style definition changes for styled paragraphs", () => {
    const doc = createDefaultDocument("Style visual fast lane")
    const paragraphId = firstParagraphId(doc)
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const nextDoc = patchParagraphStyleDefinition(doc, TOR_BODY_PARAGRAPH_STYLE_ID, {
      props: { textColor: "2563EB" },
    })
    const action = {
      type: "PATCH_PARAGRAPH_STYLE_DEFINITION",
      styleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      patch: { props: { textColor: "2563EB" } },
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      currentPaginated,
      nextPreviewDoc: nextDoc,
    })

    expect(result?.changed).toBe(true)
    expect(firstParagraphFragment(result!.paginated, paragraphId).renderProps?.textColor).toBe("2563EB")
  })

  it("does not claim metric text style changes are visual-only", () => {
    const { doc, paragraphId } = plainParagraphDocument()
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const action = {
      type: "UPDATE_PARAGRAPH_TEXT_STYLE",
      nodeId: paragraphId,
      changes: { fontSize: { value: 16, unit: "pt" } },
    } as const

    expect(tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      currentPaginated,
      nextPreviewDoc: doc,
    })).toBeNull()
  })

  it("leaves style rename on the current paginated snapshot", () => {
    const doc = createDefaultDocument("Style rename")
    const currentPaginated = paginateDocument(doc, defaultTextMeasurer)
    const action = {
      type: "RENAME_PARAGRAPH_STYLE_DEFINITION",
      styleId: TOR_BODY_PARAGRAPH_STYLE_ID,
      name: "Body copy",
    } as const

    const result = tryApplyVisualOnlyPaginatedUpdate({
      action,
      classification: classifyEditorAction(action),
      currentPaginated,
      nextPreviewDoc: doc,
    })

    expect(result).toMatchObject({
      paginated: currentPaginated,
      changed: false,
    })
  })
})
