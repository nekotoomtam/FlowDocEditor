import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import { assertPaginatedDocument, paginateDocument } from "@/pagination"
import {
  WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT,
  WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT,
  WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID,
  WYSIWYG_STAGE3_SCENARIO_QUERY_PARAM,
  WYSIWYG_STAGE3_TARGET_MARKER,
  WYSIWYG_STAGE3_TARGET_NODE_ID,
  makeWysiwygStage3BoundaryDocument,
  resolveEditorTestScenario,
} from "../wysiwygStage3StressScenarios"
import {
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "../wysiwygDraftPreview"
import { getPlainParagraphTextFromDocument } from "../wysiwygTextCommit"
import { applyWysiwygTextInputKey } from "../useWysiwygTextSession"

function targetLineText(paginated: ReturnType<typeof paginateDocument>): string {
  return paginated.sections
    .flatMap((section) => section.pages)
    .flatMap((page) => page.fragments)
    .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_TARGET_NODE_ID)
    .flatMap((fragment) => fragment.lines ?? [])
    .map((line) => line.text)
    .join("")
}

function compactText(text: string): string {
  return text.replace(/\s+/g, "")
}

describe("WYSIWYG Stage 3 stress scenario", () => {
  it("resolves only the named dev/test query scenario", () => {
    expect(resolveEditorTestScenario("")).toBeNull()
    expect(resolveEditorTestScenario("?flowdocTestScenario=missing")).toBeNull()

    const scenario = resolveEditorTestScenario(
      `?${WYSIWYG_STAGE3_SCENARIO_QUERY_PARAM}=${WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID}`,
    )

    expect(scenario?.id).toBe(WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID)
    expect(getPlainParagraphTextFromDocument(scenario?.document ?? makeWysiwygStage3BoundaryDocument(), WYSIWYG_STAGE3_TARGET_NODE_ID))
      .toBe(WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT)
  })

  it("starts near a page boundary, overflows after draft append, and shrinks back", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const initialPaginated = paginateDocument(doc, defaultTextMeasurer)
    const initialFragments = initialPaginated.sections
      .flatMap((section) => section.pages)
      .flatMap((page) => page.fragments)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_TARGET_NODE_ID)

    expect(() => assertPaginatedDocument(initialPaginated)).not.toThrow()
    expect(initialPaginated.sections[0].pages.length).toBeGreaterThanOrEqual(2)
    expect(initialFragments).toHaveLength(1)
    expect(initialFragments[0].pageIndex).toBe(0)
    expect(initialFragments[0].y + initialFragments[0].height).toBeLessThanOrEqual(
      initialPaginated.sections[0].pages[0].contentBox.y + initialPaginated.sections[0].pages[0].contentBox.height,
    )

    const draftText = `${WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT}${WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT}`
    const draftDoc = buildWysiwygTextDraftPreviewDocument({
      doc,
      nodeId: WYSIWYG_STAGE3_TARGET_NODE_ID,
      draftText,
    })
    const draftPaginated = paginateDocument(draftDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(draftPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(draftPaginated, WYSIWYG_STAGE3_TARGET_NODE_ID)).toBeGreaterThanOrEqual(2)
    expect(new Set(
      draftPaginated.sections
        .flatMap((section) => section.pages)
        .flatMap((page) => page.fragments)
        .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_TARGET_NODE_ID)
        .map((fragment) => fragment.pageIndex),
    ).size).toBeGreaterThanOrEqual(2)
    expect(targetLineText(draftPaginated)).toContain(WYSIWYG_STAGE3_TARGET_MARKER)
    expect(compactText(targetLineText(draftPaginated))).toBe(compactText(draftText))

    const shrunkDoc = buildWysiwygTextDraftPreviewDocument({
      doc: draftDoc,
      nodeId: WYSIWYG_STAGE3_TARGET_NODE_ID,
      draftText: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT,
    })
    const shrunkPaginated = paginateDocument(shrunkDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(shrunkPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(shrunkPaginated, WYSIWYG_STAGE3_TARGET_NODE_ID)).toBe(1)
    expect(compactText(targetLineText(shrunkPaginated))).toBe(compactText(WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT))
  })

  it("deletes a selected overflow append from the heavy boundary draft without corrupting pagination", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const overflowDraft = `${WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT}${WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT}`
    const overflowDoc = buildWysiwygTextDraftPreviewDocument({
      doc,
      nodeId: WYSIWYG_STAGE3_TARGET_NODE_ID,
      draftText: overflowDraft,
    })
    const overflowPaginated = paginateDocument(overflowDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(overflowPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(overflowPaginated, WYSIWYG_STAGE3_TARGET_NODE_ID)).toBeGreaterThanOrEqual(2)

    const deleted = applyWysiwygTextInputKey(
      overflowDraft,
      WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT.length,
      { key: "Backspace" },
      {
        anchorOffset: overflowDraft.length,
        focusOffset: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT.length,
      },
    )

    expect(deleted).toEqual({
      text: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT,
      caretOffset: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT.length,
      selection: {
        anchorOffset: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT.length,
        focusOffset: WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT.length,
      },
    })

    const shrunkDoc = buildWysiwygTextDraftPreviewDocument({
      doc: overflowDoc,
      nodeId: WYSIWYG_STAGE3_TARGET_NODE_ID,
      draftText: deleted?.text ?? "",
    })
    const shrunkPaginated = paginateDocument(shrunkDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(shrunkPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(shrunkPaginated, WYSIWYG_STAGE3_TARGET_NODE_ID)).toBe(1)
    expect(targetLineText(shrunkPaginated)).not.toContain(WYSIWYG_STAGE3_TARGET_MARKER)
    expect(compactText(targetLineText(shrunkPaginated))).toBe(compactText(WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT))
  })
})
