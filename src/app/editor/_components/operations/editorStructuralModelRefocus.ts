import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { WYSIWYG_TEXT_ENGINE_ENABLED } from "../wysiwygInlineEditConfig"
import { isWysiwygTextEngineFragmentEligible } from "../wysiwygTextEligibility"

export interface ModelStructuralRefocusInput {
  nodeId: string
  caretIndex: number | null
}

export interface ModelStructuralRefocusContext {
  doc: DocumentNode
  textEngineEnabled?: boolean
  startInlineEditAfterStructuralChange: (nodeId: string, caretIndex: number | null) => PaginatedDocument | null
  setPaginatedRef: (paginated: PaginatedDocument) => void
  clearWysiwygDraftPagination: () => void
  endWysiwygTextSession: () => void
  startWysiwygTextSession: (nodeId: string, caretIndex?: number | null, pageIndex?: number | null) => unknown
}

export function executeModelStructuralRefocus(
  input: ModelStructuralRefocusInput,
  context: ModelStructuralRefocusContext,
): boolean {
  const structuralPaginated = context.startInlineEditAfterStructuralChange(input.nodeId, input.caretIndex)
  if (!(context.textEngineEnabled ?? WYSIWYG_TEXT_ENGINE_ENABLED)) return structuralPaginated !== null
  if (!structuralPaginated) {
    context.clearWysiwygDraftPagination()
    context.endWysiwygTextSession()
    return false
  }

  context.setPaginatedRef(structuralPaginated)
  if (!isWysiwygTextEngineFragmentEligible({
    doc: context.doc,
    paginated: structuralPaginated,
    nodeId: input.nodeId,
  })) {
    context.clearWysiwygDraftPagination()
    context.endWysiwygTextSession()
    return false
  }

  context.startWysiwygTextSession(input.nodeId, input.caretIndex, null)
  return true
}
