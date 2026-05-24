import { describe, expect, it } from "vitest"
import {
  PAGINATED_TEXT_BASELINE_RATIO,
  resolvePaginatedLineBaselineY,
  resolvePaginatedLinePdfBaselineY,
} from "../textBaseline"

describe("paginated text baseline", () => {
  it("uses the shared editor/PDF visual baseline inside the line box", () => {
    const line = { y: 100, height: 20 }

    expect(resolvePaginatedLineBaselineY(line)).toBe(100 + 20 * PAGINATED_TEXT_BASELINE_RATIO)
  })

  it("maps the shared layout baseline into PDF coordinates", () => {
    const line = { y: 100, height: 20 }
    const pageHeight = 400

    expect(resolvePaginatedLinePdfBaselineY(line, pageHeight)).toBe(
      pageHeight - resolvePaginatedLineBaselineY(line),
    )
    expect(resolvePaginatedLinePdfBaselineY(line, pageHeight)).not.toBe(
      pageHeight - line.y - line.height,
    )
  })
})
