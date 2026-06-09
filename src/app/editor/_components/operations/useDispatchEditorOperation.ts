import { useCallback } from "react"
import type { EditorAction } from "../editorReducer"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

/**
 * A hook that provides a wrapper around the legacy dispatchEditorAction.
 *
 * In Phase 1 of the Operation Architecture, this function does nothing more than
 * extract the original lossless EditorAction from the envelope and pass it to
 * the legacy dispatcher. This guarantees zero behavior change and identical
 * dispatch timing while we lay the groundwork for the new architecture.
 */
export function useDispatchEditorOperation(
  dispatchEditorAction: (action: EditorAction) => void
) {
  const dispatchEditorOperation = useCallback((operation: EditorOperationEnvelope) => {
    // Phase 1: Pure pass-through to ensure zero behavior change.
    // The reducer semantics, dispatch timing, and error handling remain exactly identical.
    dispatchEditorAction(operation.action)
  }, [dispatchEditorAction])

  return dispatchEditorOperation
}
