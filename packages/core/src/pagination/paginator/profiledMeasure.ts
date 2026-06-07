import { measureParagraph, measureParagraphWithCache, type ParagraphMeasurementCache } from "../../layout"
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
  paragraphMeasurementCache?: ParagraphMeasurementCache,
): MeasuredParagraph {
  if (!isPaginationProfilerEnabled(profiler)) {
    return measureParagraphWithCache(node, availableWidth, measurer, wordBreaker, paragraphMeasurementCache)
  }
  const cached = paragraphMeasurementCache?.get(node, availableWidth)
  if (cached) {
    profiler.count("cache-hit:paragraph-measure")
    return cached
  }
  profiler.count("measuredParagraphs")
  profiler.count("cache-miss:paragraph-measure")
  return profiler.measure("paragraph-measure", () => {
    const measured = measureParagraph(node, availableWidth, measurer, wordBreaker)
    paragraphMeasurementCache?.set(node, availableWidth, measured)
    return measured
  })
}
