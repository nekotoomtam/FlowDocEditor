import { useCallback } from "react"
import { flushSync } from "react-dom"
import type { EditorAction } from "../editorReducer"
import type { StructuralEditRuntime, StructuralEditTransactionIdentity } from "../runtime/structuralEditRuntime"

export type EditorHistoryActionKind = "undo" | "redo"

export function resetStructuralEditTransactionForHistoryAction(input: {
  action: EditorHistoryActionKind
  structuralEditRuntime: Pick<StructuralEditRuntime, "getCurrentTransaction">
  abortStructuralEditTransactionAndPanelDeferral: (identity: StructuralEditTransactionIdentity, reason: string) => void
}): boolean {
  const current = input.structuralEditRuntime.getCurrentTransaction()
  if (!current) return false
  input.abortStructuralEditTransactionAndPanelDeferral({
    id: current.id,
    generation: current.generation,
  }, `history-${input.action}-reset`)
  return true
}

export function useEditorHistoryActions({
  isTemplateMode,
  pastLength,
  futureLength,
  finalizeInlineEditBeforeResponsiveAction,
  dispatchEditorAction,
  onBeforeHistoryDispatch,
}: {
  isTemplateMode: boolean
  pastLength: number
  futureLength: number
  finalizeInlineEditBeforeResponsiveAction: () => boolean
  dispatchEditorAction: (action: EditorAction) => void
  onBeforeHistoryDispatch?: (action: EditorHistoryActionKind) => void
}) {
  const handleUndo = useCallback(() => {
    if (!isTemplateMode) return
    flushSync(() => {
      const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
      if (pastLength === 0 && !hadInlineEdit) return
      onBeforeHistoryDispatch?.("undo")
      dispatchEditorAction({ type: "UNDO" })
    })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, isTemplateMode, onBeforeHistoryDispatch, pastLength])

  const handleRedo = useCallback(() => {
    if (!isTemplateMode) return
    flushSync(() => {
      const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
      if (futureLength === 0 && !hadInlineEdit) return
      onBeforeHistoryDispatch?.("redo")
      dispatchEditorAction({ type: "REDO" })
    })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, futureLength, isTemplateMode, onBeforeHistoryDispatch])

  return {
    handleUndo,
    handleRedo,
  }
}
