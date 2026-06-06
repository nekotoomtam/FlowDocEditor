import type { TextMeasurer } from "@/layout"
import type { PageFragment } from "@/pagination"
import { resolveSelectionOverlayRectsInFragment } from "./wysiwygCaretMapping"
import { finishWysiwygPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"

export function renderSelectionOverlay(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  rects: ReturnType<typeof resolveSelectionOverlayRectsInFragment>,
  clipPathId?: string,
) {
  return rects.map((rect) => (
    <rect
      key={`selection-${fragment.nodeId}-${rect.lineIndex}-${rect.startOffset}-${rect.endOffset}`}
      data-wysiwyg-selection="true"
      x={rect.x * scale}
      y={rect.y * scale}
      width={Math.max(rect.width * scale, 1)}
      height={rect.height * scale}
      fill="#93c5fd"
      opacity={0.55}
      clipPath={`url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
      style={{ pointerEvents: "none" }}
    />
  ))
}

export function resolveSelectionOverlayRectsInFragmentWithPerf(input: {
  fragment: PageFragment
  anchorOffset: number
  focusOffset: number
  textMeasurer?: TextMeasurer
  tracePerf?: boolean
  source?: string
}): ReturnType<typeof resolveSelectionOverlayRectsInFragment> {
  const startedAt = input.tracePerf ? startWysiwygPerfSpan() : null
  const rects = resolveSelectionOverlayRectsInFragment(
    input.fragment,
    input.anchorOffset,
    input.focusOffset,
    { textMeasurer: input.textMeasurer },
  )
  if (startedAt !== null) {
    finishWysiwygPerfSpan(true, "text-engine-selection-overlay", startedAt, {
      nodeId: input.fragment.nodeId,
      pageIndex: input.fragment.pageIndex,
      lineCount: input.fragment.lines?.length ?? 0,
      selectionRangeLength: Math.abs(input.focusOffset - input.anchorOffset),
      overlayRectCount: rects.length,
      source: input.source,
    })
  }
  return rects
}
