import type { PaginatedLine } from "./types"

export const PAGINATED_TEXT_BASELINE_RATIO = 0.78

export function resolvePaginatedLineBaselineY(line: Pick<PaginatedLine, "y" | "height">): number {
  return line.y + line.height * PAGINATED_TEXT_BASELINE_RATIO
}

export function resolvePaginatedLinePdfBaselineY(
  line: Pick<PaginatedLine, "y" | "height">,
  pageHeight: number,
): number {
  return pageHeight - resolvePaginatedLineBaselineY(line)
}
