import { measureParagraph } from "../../layout"
import type { ParagraphNode } from "../../schema"
import type { MeasuredParagraph, TextMeasurer, WordBreaker } from "../../layout"
import type { PaginationProfiler } from "../profiler"
import { isPaginationProfilerEnabled } from "../profiler"

export function measureParagraphWithPaginationProfile(
  node: ParagraphNode,
  availableWidth: number,
  measurer: TextMeasurer,
  wordBreaker: WordBreaker,
  profiler?: PaginationProfiler,
): MeasuredParagraph {
  if (!isPaginationProfilerEnabled(profiler)) {
    return measureParagraph(node, availableWidth, measurer, wordBreaker)
  }
  profiler.count("measuredParagraphs")
  return profiler.measure("paragraph-measure", () => measureParagraph(node, availableWidth, measurer, wordBreaker))
}
