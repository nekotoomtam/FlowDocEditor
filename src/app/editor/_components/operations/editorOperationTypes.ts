import type { EditorAction } from "../editorReducer"
import type { EditorActionLayoutScope, EditorActionPriority, EditorActionUiImpact } from "../editorActionClassifier"

export type EditorOperationKind =
  | "legacy.action"
  | "text.commit"
  | "paragraph.split"
  | "paragraph.merge"
  | "node.delete"
  | "node.reorder"
  | "style.patch"
  | "table.structure.patch"

export type EditorOperationUrgency = EditorActionPriority

export type EditorOperationScope = {
  nodeIds: string[]
  pageIndexes?: number[]
  layoutScope: EditorActionLayoutScope
  uiImpact: EditorActionUiImpact
  needsHistory: boolean
  needsPreviewSettle: boolean
  canOptimistic: boolean
}

/**
 * The core wrapper for the Editor Operation Architecture.
 * During Phase 1, this envelope losslessly wraps the existing EditorAction
 * to guarantee zero behavior change.
 */
export type EditorOperationEnvelope = {
  kind: EditorOperationKind
  urgency: EditorOperationUrgency
  scope: EditorOperationScope
  /**
   * The original, lossless EditorAction.
   * This ensures that no behavior drifts during the migration phase.
   */
  action: EditorAction
  runtime?: {
    structural?: unknown
    previewSettle?: unknown
    draft?: unknown
  }
}
