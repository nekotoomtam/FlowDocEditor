import { useCallback } from "react"
import { flushSync } from "react-dom"
import type { EditorAction } from "../editorReducer"

export function useEditorHistoryActions({
  isTemplateMode,
  pastLength,
  futureLength,
  finalizeInlineEditBeforeResponsiveAction,
  dispatchEditorAction,
}: {
  isTemplateMode: boolean
  pastLength: number
  futureLength: number
  finalizeInlineEditBeforeResponsiveAction: () => boolean
  dispatchEditorAction: (action: EditorAction) => void
}) {
  const handleUndo = useCallback(() => {
    if (!isTemplateMode) return
    flushSync(() => {
      const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
      if (pastLength === 0 && !hadInlineEdit) return
      dispatchEditorAction({ type: "UNDO" })
    })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, isTemplateMode, pastLength])

  const handleRedo = useCallback(() => {
    if (!isTemplateMode) return
    flushSync(() => {
      const hadInlineEdit = finalizeInlineEditBeforeResponsiveAction()
      if (futureLength === 0 && !hadInlineEdit) return
      dispatchEditorAction({ type: "REDO" })
    })
  }, [dispatchEditorAction, finalizeInlineEditBeforeResponsiveAction, futureLength, isTemplateMode])

  return {
    handleUndo,
    handleRedo,
  }
}
