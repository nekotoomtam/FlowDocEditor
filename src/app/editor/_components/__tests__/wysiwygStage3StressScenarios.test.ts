import { describe, expect, it } from "vitest"
import { defaultTextMeasurer } from "@/layout"
import { assertPaginatedDocument, paginateDocument } from "@/pagination"
import {
  WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT,
  WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT,
  WYSIWYG_STAGE3_BOUNDARY_SCENARIO_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_APPEND_TEXT,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_MARKER,
  WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_BOTTOM_SIBLING_NODE_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_APPEND_TEXT,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_CELL_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_INITIAL_TEXT,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_MARKER,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID,
  WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TOP_SIBLING_NODE_ID,
  WYSIWYG_STAGE3_SCENARIO_QUERY_PARAM,
  WYSIWYG_STAGE3_STACK_CONTROL_NODE_ID,
  WYSIWYG_STAGE3_STACK_LEFT_ID,
  WYSIWYG_STAGE3_STACK_RIGHT_ID,
  WYSIWYG_STAGE3_STACK_ROW_ID,
  WYSIWYG_STAGE3_STACK_TARGET_APPEND_TEXT,
  WYSIWYG_STAGE3_STACK_TARGET_INITIAL_TEXT,
  WYSIWYG_STAGE3_STACK_TARGET_NODE_ID,
  WYSIWYG_STAGE3_TABLE_TARGET_APPEND_TEXT,
  WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT,
  WYSIWYG_STAGE3_TABLE_TARGET_MARKER,
  WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID,
  WYSIWYG_STAGE3_TARGET_MARKER,
  WYSIWYG_STAGE3_TARGET_NODE_ID,
  makeWysiwygStage3BoundaryDocument,
  resolveEditorTestScenario,
} from "../wysiwygStage3StressScenarios"
import { buildWysiwygDraftVisualPreview } from "../EditorCanvas"
import {
  buildWysiwygTextDraftPreviewDocument,
  countWysiwygTextDraftFragments,
} from "../wysiwygDraftPreview"
import { getPlainParagraphTextFromDocument } from "../wysiwygTextCommit"
import { applyWysiwygTextInputKey } from "../useWysiwygTextSession"

function targetLineText(paginated: ReturnType<typeof paginateDocument>): string {
  return paragraphLineText(paginated, WYSIWYG_STAGE3_TARGET_NODE_ID)
}

function paragraphLineText(paginated: ReturnType<typeof paginateDocument>, nodeId: string): string {
  return paginated.sections
    .flatMap((section) => section.pages)
    .flatMap((page) => page.fragments)
    .filter((fragment) => fragment.nodeId === nodeId)
    .flatMap((fragment) => fragment.lines ?? [])
    .map((line) => line.text)
    .join("")
}

function compactText(text: string): string {
  return text.replace(/\s+/g, "")
}

function allFragments(paginated: ReturnType<typeof paginateDocument>) {
  return paginated.sections
    .flatMap((section) => section.pages)
    .flatMap((page) => page.fragments)
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

  it("covers row-stack paragraph editing without independent paragraph visual splitting", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const paginated = paginateDocument(doc, defaultTextMeasurer)
    const fragments = allFragments(paginated)
    const rowFragment = fragments.find((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_ROW_ID)
    const leftStack = fragments.find((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_LEFT_ID)
    const rightStack = fragments.find((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_RIGHT_ID)
    const stackTarget = fragments.find((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_TARGET_NODE_ID)
    const stackControl = fragments.find((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_CONTROL_NODE_ID)

    expect(() => assertPaginatedDocument(paginated)).not.toThrow()
    expect(rowFragment).toBeDefined()
    expect(leftStack).toBeDefined()
    expect(rightStack).toBeDefined()
    expect(stackTarget).toBeDefined()
    expect(stackControl).toBeDefined()
    expect(leftStack?.parentNodeId).toBe(WYSIWYG_STAGE3_STACK_ROW_ID)
    expect(rightStack?.parentNodeId).toBe(WYSIWYG_STAGE3_STACK_ROW_ID)
    expect(stackTarget?.parentNodeId).toBe(WYSIWYG_STAGE3_STACK_LEFT_ID)
    expect(stackControl?.parentNodeId).toBe(WYSIWYG_STAGE3_STACK_RIGHT_ID)
    expect(leftStack?.pageIndex).toBe(rowFragment?.pageIndex)
    expect(rightStack?.pageIndex).toBe(rowFragment?.pageIndex)
    expect(stackTarget?.pageIndex).toBe(rowFragment?.pageIndex)
    expect(leftStack?.height).toBe(rowFragment?.height)
    expect(rightStack?.height).toBe(rowFragment?.height)
    expect((leftStack?.x ?? 0) + (leftStack?.width ?? 0)).toBeLessThanOrEqual((rightStack?.x ?? 0) + 0.5)
    expect(fragments.filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_STACK_TARGET_NODE_ID)).toHaveLength(1)

    const stackPreview = buildWysiwygDraftVisualPreview({
      paginated,
      doc,
      nodeId: WYSIWYG_STAGE3_STACK_TARGET_NODE_ID,
      draftText: `${WYSIWYG_STAGE3_STACK_TARGET_INITIAL_TEXT}${WYSIWYG_STAGE3_STACK_TARGET_APPEND_TEXT}${WYSIWYG_STAGE3_STACK_TARGET_APPEND_TEXT}`,
      caretOffset: null,
      textMeasurer: defaultTextMeasurer,
    })
    expect(stackPreview).toBeNull()

    const bodyPreview = buildWysiwygDraftVisualPreview({
      paginated,
      doc,
      nodeId: WYSIWYG_STAGE3_TARGET_NODE_ID,
      draftText: `${WYSIWYG_STAGE3_BOUNDARY_INITIAL_TEXT}${WYSIWYG_STAGE3_BOUNDARY_APPEND_TEXT}`,
      caretOffset: null,
      textMeasurer: defaultTextMeasurer,
    })
    expect(bodyPreview?.fragments.length).toBeGreaterThanOrEqual(2)
  })

  it("covers table-cell draft pagination overflow and shrink-back", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const initialPaginated = paginateDocument(doc, defaultTextMeasurer)
    const initialFragments = allFragments(initialPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)

    expect(() => assertPaginatedDocument(initialPaginated)).not.toThrow()
    expect(initialFragments).toHaveLength(1)
    expect(compactText(paragraphLineText(initialPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT))

    const draftText = `${WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT}${WYSIWYG_STAGE3_TABLE_TARGET_APPEND_TEXT}`
    const draftDoc = buildWysiwygTextDraftPreviewDocument({
      doc,
      nodeId: WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID,
      draftText,
    })
    const draftPaginated = paginateDocument(draftDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(draftPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(draftPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)).toBeGreaterThanOrEqual(2)
    expect(new Set(
      allFragments(draftPaginated)
        .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)
        .map((fragment) => fragment.pageIndex),
    ).size).toBeGreaterThanOrEqual(2)
    expect(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID))
      .toContain(WYSIWYG_STAGE3_TABLE_TARGET_MARKER)
    expect(compactText(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)))
      .toBe(compactText(draftText))

    const shrunkDoc = buildWysiwygTextDraftPreviewDocument({
      doc: draftDoc,
      nodeId: WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID,
      draftText: WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT,
    })
    const shrunkPaginated = paginateDocument(shrunkDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(shrunkPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(shrunkPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)).toBe(1)
    expect(compactText(paragraphLineText(shrunkPaginated, WYSIWYG_STAGE3_TABLE_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_TABLE_TARGET_INITIAL_TEXT))
  })

  it("covers colspan-only flow-table-cell draft pagination overflow and shrink-back", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const initialPaginated = paginateDocument(doc, defaultTextMeasurer)
    const initialFragments = allFragments(initialPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)
    const initialCellFragments = allFragments(initialPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID)

    expect(() => assertPaginatedDocument(initialPaginated)).not.toThrow()
    expect(initialFragments).toHaveLength(1)
    expect(initialCellFragments).toHaveLength(1)
    expect(initialCellFragments[0].nodeType).toBe("flow-table-cell")
    expect(initialCellFragments[0].flowTableCellGridProps).toEqual({
      columnIndex: 0,
      colspan: 2,
      rowspan: 1,
    })
    expect(compactText(paragraphLineText(initialPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT))

    const draftText =
      `${WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT}${WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_APPEND_TEXT}`
    const draftDoc = buildWysiwygTextDraftPreviewDocument({
      doc,
      nodeId: WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID,
      draftText,
    })
    const draftPaginated = paginateDocument(draftDoc, defaultTextMeasurer)
    const draftCellFragments = allFragments(draftPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_CELL_ID)
    const siblingFragments = allFragments(draftPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_SIBLING_NODE_ID)

    expect(() => assertPaginatedDocument(draftPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID))
      .toBeGreaterThanOrEqual(2)
    expect(new Set(
      allFragments(draftPaginated)
        .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)
        .map((fragment) => fragment.pageIndex),
    ).size).toBeGreaterThanOrEqual(2)
    expect(draftCellFragments.length).toBeGreaterThanOrEqual(2)
    expect(draftCellFragments.every((fragment) => (
      fragment.flowTableCellGridProps?.colspan === 2 &&
      fragment.flowTableCellGridProps?.rowspan === 1 &&
      fragment.width === initialCellFragments[0].width
    ))).toBe(true)
    expect(siblingFragments).toHaveLength(1)
    expect(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID))
      .toContain(WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_MARKER)
    expect(compactText(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)))
      .toBe(compactText(draftText))

    const shrunkDoc = buildWysiwygTextDraftPreviewDocument({
      doc: draftDoc,
      nodeId: WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID,
      draftText: WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT,
    })
    const shrunkPaginated = paginateDocument(shrunkDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(shrunkPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(shrunkPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)).toBe(1)
    expect(compactText(paragraphLineText(shrunkPaginated, WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_FLOW_TABLE_COLSPAN_TARGET_INITIAL_TEXT))
  })

  it("covers rowspan flow-table-cell draft pagination overflow and shrink-back", () => {
    const doc = makeWysiwygStage3BoundaryDocument()
    const initialPaginated = paginateDocument(doc, defaultTextMeasurer)
    const initialFragments = allFragments(initialPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)
    const initialCellFragments = allFragments(initialPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_CELL_ID)

    expect(() => assertPaginatedDocument(initialPaginated)).not.toThrow()
    expect(initialFragments).toHaveLength(1)
    expect(initialCellFragments).toHaveLength(1)
    expect(initialCellFragments[0].nodeType).toBe("flow-table-cell")
    expect(initialCellFragments[0].flowTableCellGridProps).toEqual({
      columnIndex: 0,
      colspan: 1,
      rowspan: 2,
    })
    expect(compactText(paragraphLineText(initialPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_INITIAL_TEXT))

    const draftText =
      `${WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_INITIAL_TEXT}${WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_APPEND_TEXT}`
    const draftDoc = buildWysiwygTextDraftPreviewDocument({
      doc,
      nodeId: WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID,
      draftText,
    })
    const draftPaginated = paginateDocument(draftDoc, defaultTextMeasurer)
    const draftCellFragments = allFragments(draftPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_CELL_ID)
    const topSiblingFragments = allFragments(draftPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TOP_SIBLING_NODE_ID)
    const bottomSiblingFragments = allFragments(draftPaginated)
      .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_BOTTOM_SIBLING_NODE_ID)

    expect(() => assertPaginatedDocument(draftPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID))
      .toBeGreaterThanOrEqual(2)
    expect(new Set(
      allFragments(draftPaginated)
        .filter((fragment) => fragment.nodeId === WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)
        .map((fragment) => fragment.pageIndex),
    ).size).toBeGreaterThanOrEqual(2)
    expect(draftCellFragments.length).toBeGreaterThanOrEqual(2)
    expect(draftCellFragments.every((fragment) => (
      fragment.flowTableCellGridProps?.colspan === 1 &&
      fragment.flowTableCellGridProps?.rowspan === 2 &&
      fragment.width === initialCellFragments[0].width
    ))).toBe(true)
    expect(draftCellFragments.some((fragment) => fragment.isContinued)).toBe(true)
    expect(draftCellFragments.some((fragment) => fragment.continuesFrom)).toBe(true)
    expect(topSiblingFragments).toHaveLength(1)
    expect(bottomSiblingFragments).toHaveLength(1)
    expect(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID))
      .toContain(WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_MARKER)
    expect(compactText(paragraphLineText(draftPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)))
      .toBe(compactText(draftText))

    const shrunkDoc = buildWysiwygTextDraftPreviewDocument({
      doc: draftDoc,
      nodeId: WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID,
      draftText: WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_INITIAL_TEXT,
    })
    const shrunkPaginated = paginateDocument(shrunkDoc, defaultTextMeasurer)

    expect(() => assertPaginatedDocument(shrunkPaginated)).not.toThrow()
    expect(countWysiwygTextDraftFragments(shrunkPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)).toBe(1)
    expect(compactText(paragraphLineText(shrunkPaginated, WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_NODE_ID)))
      .toBe(compactText(WYSIWYG_STAGE3_FLOW_TABLE_ROWSPAN_TARGET_INITIAL_TEXT))
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
