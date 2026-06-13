import { describe, expect, it } from "vitest"
import type { PaginatedDocument } from "@/pagination"
import type { EditorPartialPreviewPaginated } from "../../editorPreviewDisplay"
import {
  EDITOR_RENDER_ACTION_OWNERSHIP,
  type EditorRenderInvalidationPlan,
} from "../../operations/editorRenderInvalidation"
import {
  shouldApplyCanvasRenderInvalidationState,
  shouldApplyPartialPreviewPaginated,
  shouldClearPartialPreviewPaginated,
  type CanvasRenderInvalidationState,
} from "../editorPreviewLifecycleGuards"

function paginated(id: string): PaginatedDocument {
  return { id } as unknown as PaginatedDocument
}

function partial(
  generation: number,
  requestId: number,
  doc: PaginatedDocument,
): EditorPartialPreviewPaginated {
  return { generation, requestId, paginated: doc }
}

function plan(reason: string): EditorRenderInvalidationPlan {
  return {
    lane: "node-layout",
    pageScope: "affected-node-pages",
    affectedNodeIds: ["p1"],
    affectedPageIndexes: [0],
    invalidatesPagination: true,
    mayUseVisualFastLane: false,
    requiresPreviewSettle: true,
    requiresHistoryEntry: true,
    ownership: EDITOR_RENDER_ACTION_OWNERSHIP,
    reason,
  }
}

function canvasState(
  invalidationPlan: EditorRenderInvalidationPlan | null,
  doc: PaginatedDocument,
): CanvasRenderInvalidationState {
  return { plan: invalidationPlan, paginated: doc }
}

describe("editor preview lifecycle guards", () => {
  it("clears partial preview only when a partial preview exists", () => {
    const doc = paginated("partial")

    expect(shouldClearPartialPreviewPaginated(null)).toBe(false)
    expect(shouldClearPartialPreviewPaginated(partial(1, 1, doc))).toBe(true)
  })

  it("suppresses repeated partial preview state with identical generation, request, and paginated output", () => {
    const doc = paginated("partial")
    const current = partial(2, 10, doc)

    expect(shouldApplyPartialPreviewPaginated(current, partial(2, 10, doc))).toBe(false)
    expect(shouldApplyPartialPreviewPaginated(current, partial(3, 10, doc))).toBe(true)
    expect(shouldApplyPartialPreviewPaginated(current, partial(2, 11, doc))).toBe(true)
    expect(shouldApplyPartialPreviewPaginated(current, partial(2, 10, paginated("next")))).toBe(true)
    expect(shouldApplyPartialPreviewPaginated(null, current)).toBe(true)
  })

  it("suppresses null and repeated canvas invalidation state", () => {
    const doc = paginated("canvas")
    const currentPlan = plan("current")
    const current = canvasState(currentPlan, doc)

    expect(shouldApplyCanvasRenderInvalidationState(null, canvasState(null, doc))).toBe(false)
    expect(shouldApplyCanvasRenderInvalidationState(current, canvasState(currentPlan, doc))).toBe(false)
    expect(shouldApplyCanvasRenderInvalidationState(current, canvasState(plan("next"), doc))).toBe(true)
    expect(shouldApplyCanvasRenderInvalidationState(current, canvasState(currentPlan, paginated("next")))).toBe(true)
  })
})
