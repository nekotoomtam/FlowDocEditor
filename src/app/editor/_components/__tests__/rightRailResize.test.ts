import { describe, expect, it } from "vitest"
import {
  RIGHT_RAIL_COLLAPSED_WIDTH,
  RIGHT_RAIL_COLLAPSE_THRESHOLD,
  RIGHT_RAIL_CONTENT_HIDE_THRESHOLD,
  RIGHT_RAIL_MAX_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  clampRightRailWidth,
  resolveRightRailPreviewWidth,
  resolveRightRailResize,
  resolveRightRailResizeStartWidth,
} from "../rightRailResize"

describe("rightRailResize", () => {
  it("keeps visible right rail widths inside the accepted range", () => {
    expect(clampRightRailWidth(240)).toBe(RIGHT_RAIL_MIN_WIDTH)
    expect(clampRightRailWidth(300)).toBe(300)
    expect(clampRightRailWidth(340)).toBe(RIGHT_RAIL_MAX_WIDTH)
  })

  it("collapses only below the drag-close threshold", () => {
    expect(RIGHT_RAIL_COLLAPSE_THRESHOLD).toBe(130)
    expect(resolveRightRailResize(129)).toEqual({ collapsed: true, width: RIGHT_RAIL_MIN_WIDTH })
    expect(resolveRightRailResize(130)).toEqual({ collapsed: false, width: RIGHT_RAIL_MIN_WIDTH })
    expect(resolveRightRailResize(200)).toEqual({ collapsed: false, width: RIGHT_RAIL_MIN_WIDTH })
    expect(resolveRightRailResize(318)).toEqual({ collapsed: false, width: 318 })
  })

  it("keeps rail content hidden below the stable visible width", () => {
    expect(RIGHT_RAIL_CONTENT_HIDE_THRESHOLD).toBe(RIGHT_RAIL_MIN_WIDTH)
  })

  it("pins the drag preview at the stable minimum until the close threshold", () => {
    expect(resolveRightRailPreviewWidth(20)).toBe(RIGHT_RAIL_COLLAPSED_WIDTH)
    expect(resolveRightRailPreviewWidth(129)).toBe(RIGHT_RAIL_COLLAPSED_WIDTH)
    expect(resolveRightRailPreviewWidth(130)).toBe(RIGHT_RAIL_MIN_WIDTH)
    expect(resolveRightRailPreviewWidth(244)).toBe(RIGHT_RAIL_MIN_WIDTH)
    expect(resolveRightRailPreviewWidth(330)).toBe(RIGHT_RAIL_MAX_WIDTH)
  })

  it("starts collapsed drags from the icon rail width", () => {
    expect(resolveRightRailResizeStartWidth({ collapsed: true, width: 318 })).toBe(RIGHT_RAIL_COLLAPSED_WIDTH)
    expect(resolveRightRailResizeStartWidth({ collapsed: false, width: 318 })).toBe(318)
  })
})
