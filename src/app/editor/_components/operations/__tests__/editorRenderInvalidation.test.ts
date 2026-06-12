import { describe, expect, it } from "vitest"
import type { PageFragment, PaginatedDocument, PaginatedPage } from "@/pagination"
import type { EditorAction } from "../../editorReducer"
import { createEditorOperationFromAction } from "../editorOperationFromAction"
import {
  EDITOR_RENDER_ACTION_OWNERSHIP,
  resolveEditorRenderInvalidation,
} from "../editorRenderInvalidation"

function fragment(
  nodeId: string,
  nodeType: PageFragment["nodeType"],
  pageIndex: number,
  parentNodeId?: string,
): PageFragment {
  return {
    nodeId,
    nodeType,
    parentNodeId,
    pageIndex,
    x: 10,
    y: 20,
    width: 100,
    height: 30,
  }
}

function page(index: number, fragments: PageFragment[]): PaginatedPage {
  return {
    index,
    width: 200,
    height: 300,
    contentBox: { x: 10, y: 10, width: 180, height: 280 },
    fragments,
    headerFragments: [],
    footerFragments: [],
  }
}

function makePaginated(): PaginatedDocument {
  return {
    tocEntries: [],
    sections: [
      {
        sectionId: "s1",
        pages: [
          page(0, [fragment("intro", "paragraph", 0)]),
          page(1, [fragment("target", "paragraph", 1), fragment("table-1", "flow-table", 1)]),
          page(2, [fragment("later", "paragraph", 2), fragment("cell-1", "flow-table-cell", 2, "table-1")]),
        ],
      },
    ],
  }
}

function planFor(action: EditorAction, paginated: PaginatedDocument | null = makePaginated()) {
  return resolveEditorRenderInvalidation({
    operation: createEditorOperationFromAction(action),
    paginated,
  })
}

describe("editorRenderInvalidation", () => {
  it("keeps selection-only actions out of pagination and preview settle", () => {
    const plan = planFor({ type: "SELECT_NODE", nodeId: "target" })

    expect(plan.lane).toBe("selection-only")
    expect(plan.pageScope).toBe("none")
    expect(plan.affectedPageIndexes).toEqual([])
    expect(plan.invalidatesPagination).toBe(false)
    expect(plan.requiresPreviewSettle).toBe(false)
    expect(plan.requiresHistoryEntry).toBe(false)
    expect(plan.ownership).toEqual(EDITOR_RENDER_ACTION_OWNERSHIP)
  })

  it("marks visual-only style changes as affected-node fragment updates", () => {
    const plan = planFor({
      type: "UPDATE_PARAGRAPH_TEXT_STYLE",
      nodeId: "target",
      changes: { textColor: "DC2626", textDecoration: "underline" },
    })

    expect(plan.lane).toBe("visual-only")
    expect(plan.pageScope).toBe("affected-node-pages")
    expect(plan.affectedNodeIds).toEqual(["target"])
    expect(plan.affectedPageIndexes).toEqual([1])
    expect(plan.invalidatesPagination).toBe(false)
    expect(plan.mayUseVisualFastLane).toBe(true)
    expect(plan.requiresPreviewSettle).toBe(true)
    expect(plan.requiresHistoryEntry).toBe(true)
  })

  it("marks node layout actions as pagination-affecting for the target node pages", () => {
    const plan = planFor({ type: "UPDATE_TEXT", nodeId: "target", text: "Changed text" })

    expect(plan.lane).toBe("node-layout")
    expect(plan.pageScope).toBe("affected-node-pages")
    expect(plan.affectedPageIndexes).toEqual([1])
    expect(plan.invalidatesPagination).toBe(true)
    expect(plan.mayUseVisualFastLane).toBe(false)
  })

  it("marks table actions as pagination-affecting for table pages and descendants", () => {
    const plan = planFor({ type: "TABLE_ADD_ROW", tableId: "table-1", afterIndex: 0 })

    expect(plan.lane).toBe("table-layout")
    expect(plan.pageScope).toBe("affected-node-pages")
    expect(plan.affectedNodeIds).toEqual(["table-1"])
    expect(plan.affectedPageIndexes).toEqual([1, 2])
    expect(plan.invalidatesPagination).toBe(true)
  })

  it("marks structural from-index actions as affecting from the first target page forward", () => {
    const plan = planFor({
      type: "SPLIT_PARAGRAPH",
      nodeId: "target",
      newNodeId: "inserted",
      splitIndex: 3,
      text: "Alpha",
    })

    expect(plan.lane).toBe("from-index-structure")
    expect(plan.pageScope).toBe("from-first-affected-page")
    expect(plan.affectedNodeIds).toEqual(["target", "inserted"])
    expect(plan.affectedPageIndexes).toEqual([1, 2])
    expect(plan.invalidatesPagination).toBe(true)
  })

  it("marks document layout actions as whole-document invalidations", () => {
    const plan = planFor({
      type: "UPDATE_MARGIN",
      sectionIndex: 0,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
    })

    expect(plan.lane).toBe("document-layout")
    expect(plan.pageScope).toBe("document")
    expect(plan.affectedNodeIds).toEqual([])
    expect(plan.affectedPageIndexes).toEqual([0, 1, 2])
    expect(plan.invalidatesPagination).toBe(true)
  })

  it("keeps no-layout reducer updates as no-render invalidations", () => {
    const paginated = makePaginated()
    const plan = planFor({ type: "SET_PAGINATED", paginated }, paginated)

    expect(plan.lane).toBe("no-render")
    expect(plan.pageScope).toBe("none")
    expect(plan.affectedPageIndexes).toEqual([])
    expect(plan.invalidatesPagination).toBe(false)
    expect(plan.requiresPreviewSettle).toBe(false)
    expect(plan.requiresHistoryEntry).toBe(false)
  })
})
