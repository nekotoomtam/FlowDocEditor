import { describe, expect, it } from "vitest"
import {
  applyParagraphTextStyle,
  createDefaultDocument,
  patchParagraphStyleDefinition,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  updateNodeProps,
  updateParagraphBoxStyle,
} from "@/document"
import { defaultTextMeasurer } from "@/layout"
import { paginateDocument, type PageFragment, type PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { classifyEditorAction } from "../editorActionClassifier"
import { tryApplyVisualOnlyPaginatedUpdate } from "../editorVisualOnlyPagination"
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
