import { describe, expect, it } from "vitest"
import {
  clampFlowStackResizeSelectedShare,
  effectiveFlowStackResizeMinShare,
  resolveFlowStackResizePairShares,
} from "../flowStackResize"

describe("flow-stack resize helpers", () => {
  it("uses the preferred minimum when the selected pair has enough width", () => {
    expect(effectiveFlowStackResizeMinShare(70)).toBe(8)
  })

  it("adapts the effective minimum for already narrow pairs", () => {
    expect(effectiveFlowStackResizeMinShare(10)).toBe(4.99)
  })

  it("clamps selected share while preserving the pair total", () => {
    const shares = resolveFlowStackResizePairShares({
      pairTotalShare: 70,
      selectedShare: 75,
      selectedIsLeft: true,
    })

    expect(shares.selectedShare).toBe(62)
    expect(shares.neighborShare).toBe(8)
    expect(shares.leftShare + shares.rightShare).toBe(70)
  })

  it("resolves right-selected shares without changing the pair total", () => {
    const shares = resolveFlowStackResizePairShares({
      pairTotalShare: 60,
      selectedShare: 35.55,
      selectedIsLeft: false,
    })

    expect(shares.leftShare).toBe(24.45)
    expect(shares.rightShare).toBe(35.55)
    expect(shares.leftShare + shares.rightShare).toBe(60)
  })

  it("clamps non-finite selected values to the effective minimum", () => {
    expect(clampFlowStackResizeSelectedShare(80, Number.NaN)).toBe(8)
  })
})
