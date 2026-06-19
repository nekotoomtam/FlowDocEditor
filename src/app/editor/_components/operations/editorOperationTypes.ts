import type { DocumentNodeV2 } from "@/schema"
import type { EditorAction } from "../editorReducer"
import type { EditorActionLayoutScope, EditorActionPriority, EditorActionUiImpact } from "../editorActionClassifier"

export type EditorOperationKind =
  | "legacy.action"
  | "document.settings.patch"
  | "drag.placement"
  | "field.patch"
  | "flow-row.layout.patch"
  | "text.draft"
  | "text.commit"
  | "paragraph.split"
  | "paragraph.merge"
  | "list.structure.patch"
  | "node.delete"
  | "node.duplicate"
  | "node.props.patch"
  | "node.reorder"
  | "flow-row.structure.patch"
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

export type EditorOperationDocumentGraphRuntime = {
  sourceModel: "document-v2"
  document: DocumentNodeV2
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
    documentGraph?: EditorOperationDocumentGraphRuntime
    structural?: unknown
    previewSettle?: unknown
    draft?: unknown
  }
}
