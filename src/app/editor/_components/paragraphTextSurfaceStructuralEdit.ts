import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import { startWysiwygPerfSpan } from "./wysiwygPerformance"

export function canStartParagraphTextSurfaceStructuralEdit(
  guard: ParagraphTextSurfaceStructuralEditGuard | undefined,
  input: Omit<Parameters<ParagraphTextSurfaceStructuralEditGuard>[0], "timestamp">,
): boolean {
  if (!guard) return true
  return guard({
    ...input,
    timestamp: startWysiwygPerfSpan(),
  })
}
