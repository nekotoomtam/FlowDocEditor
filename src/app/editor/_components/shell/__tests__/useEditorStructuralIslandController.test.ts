import { describe, expect, it } from "vitest"
import type { OptimisticStructuralIslandOverride } from "../editorShellTypes"
import { releaseBoundarySafePageBreakSuppression } from "../useEditorStructuralIslandController"

function islandOverride(input: {
  nodeId?: string
  suppressedPageBreakNodeId?: string | null
} = {}): OptimisticStructuralIslandOverride {
  const suppressedPageBreakNodeId = Object.prototype.hasOwnProperty.call(input, "suppressedPageBreakNodeId")
    ? input.suppressedPageBreakNodeId
    : "cover_break"
  return {
    nodeId: input.nodeId ?? "p2",
    paragraph: { id: input.nodeId ?? "p2", type: "paragraph", children: [] },
    fragment: {
      nodeId: input.nodeId ?? "p2",
      nodeType: "paragraph",
      pageIndex: 0,
      sectionIndex: 0,
      fragmentIndex: 0,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
    },
    pageKey: "page-1",
    pages: [],
    mode: "boundary-safe",
    suppressedPageBreakNodeId,
  } as unknown as OptimisticStructuralIslandOverride
}

describe("releaseBoundarySafePageBreakSuppression", () => {
  it("clears the page-break suppression for the painted island only", () => {
    const override = islandOverride()

    const result = releaseBoundarySafePageBreakSuppression(override, "p2")

    expect(result).not.toBe(override)
    expect(result?.nodeId).toBe("p2")
    expect(result?.suppressedPageBreakNodeId).toBeNull()
  })

  it("keeps unrelated or already released overrides stable", () => {
    const unrelated = islandOverride({ nodeId: "p3" })
    const released = islandOverride({ suppressedPageBreakNodeId: null })

    expect(releaseBoundarySafePageBreakSuppression(null, "p2")).toBeNull()
    expect(releaseBoundarySafePageBreakSuppression(unrelated, "p2")).toBe(unrelated)
    expect(releaseBoundarySafePageBreakSuppression(released, "p2")).toBe(released)
  })
})
