import { describe, expect, it } from "vitest"
import { createDefaultDocument } from "@/document"
import type { DocumentNode } from "@/schema"
import {
  LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT,
  countDocumentBodyChildrenForLeftRailOutline,
  shouldDeferInitialLeftRailOutline,
} from "../leftRailInitialRenderPolicy"

function docWithBodyChildCount(count: number): DocumentNode {
  const doc = createDefaultDocument("large-outline")
  const section = doc.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  if (body?.type === "body") {
    body.childIds = Array.from({ length: count }, (_, index) => `missing_${index}`)
  }
  return doc
}

describe("leftRailInitialRenderPolicy", () => {
  it("counts top-level body children across sections", () => {
    const doc = docWithBodyChildCount(LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT + 1)

    expect(countDocumentBodyChildrenForLeftRailOutline(doc))
      .toBe(LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT + 1)
  })

  it("defers large outline content until preview layout is full", () => {
    const doc = docWithBodyChildCount(LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT + 1)

    expect(shouldDeferInitialLeftRailOutline({
      doc,
      mode: "outline",
      previewLayoutStatus: "placeholder",
    })).toBe(true)
    expect(shouldDeferInitialLeftRailOutline({
      doc,
      mode: "outline",
      previewLayoutStatus: "full",
    })).toBe(false)
  })

  it("does not defer non-outline modes or small outlines", () => {
    const doc = docWithBodyChildCount(LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT)

    expect(shouldDeferInitialLeftRailOutline({
      doc,
      mode: "outline",
      previewLayoutStatus: "placeholder",
    })).toBe(false)
    expect(shouldDeferInitialLeftRailOutline({
      doc: docWithBodyChildCount(LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT + 1),
      mode: "styles",
      previewLayoutStatus: "placeholder",
    })).toBe(false)
  })
})
