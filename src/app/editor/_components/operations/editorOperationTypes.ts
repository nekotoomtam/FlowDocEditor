import type { PaginatedDocument } from "@/pagination"
import type { PlacementOperation } from "@/placement"
import type { DocumentNode, DocumentNodeV2, ParagraphNode, ParagraphStyleProperties } from "@/schema"
import type {
  DocumentGraphIndexV2,
  FlowDocListStylePresetId,
  FieldRefInlineChanges,
  FlowDocParagraphStylePresetId,
  FlowTableCellSpanChanges,
  ParagraphBoxStyleChanges,
  ParagraphStyleDefinitionPatch,
  ParagraphTextStyleChanges,
  ReservedZonePriority,
} from "@/document"
import type { EditorAction } from "../editorReducer"
import type { EditorActionLayoutScope, EditorActionPriority, EditorActionUiImpact } from "../editorActionClassifier"
import type { ListLevelChangeDirection } from "../wysiwygTextInteraction"

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

export type EditorOperationStructuralRuntimeContext = {
  history?: import("../editorReducer").HistoryEntry
  paginated?: PaginatedDocument
  precomputed?: unknown
  precomputedDocValidation?: unknown
  isOptimistic?: boolean
  caretIndex?: number | null
  refocus?: boolean
  paragraph?: unknown
}

export type EditorOperationTextCommitRuntimeContext = {
  beforeDoc?: DocumentNode
  beforePaginated?: PaginatedDocument
  afterPaginated?: PaginatedDocument
  history?: import("../editorReducer").HistoryEntry
}

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
  sourceDocument: DocumentNode
  document: DocumentNodeV2
  index: DocumentGraphIndexV2
}

export type EditorOperationCommand =
  | { kind: "node.delete"; nodeId: string }
  | { kind: "node.duplicate"; nodeId: string }
  | {
      kind: "node.reorder"
      sectionId: string
      sourceNodeId: string
      targetNodeId: string
      position: "before" | "after"
    }
  | { kind: "node.props.patch"; nodeId: string; changes: Record<string, unknown> }
  | { kind: "field.patch"; fieldRefId: string; changes: FieldRefInlineChanges }
  | { kind: "drag.placement"; sectionId: string; op: PlacementOperation }
  | { kind: "text.draft"; nodeId: string; text: string }
  | { kind: "text.commit"; commitType: "update-text"; nodeId: string; text: string }
  | { kind: "text.commit"; commitType: "inline-text"; nodeId: string; beforeText: string }
  | { kind: "text.commit"; commitType: "wysiwyg-text"; nodeId: string; text: string; beforeText: string }
  | { kind: "text.commit"; commitType: "wysiwyg-rich-text"; nodeId: string; paragraph: ParagraphNode }
  | { kind: "paragraph.split"; nodeId: string; splitIndex: number; text?: string; newNodeId?: string }
  | { kind: "paragraph.merge"; nodeId: string; text?: string }
  | { kind: "list.structure.patch"; mutation: "exit-item"; nodeId: string; text?: string }
  | { kind: "list.structure.patch"; mutation: "change-level"; nodeId: string; direction: ListLevelChangeDirection; text?: string }
  | { kind: "list.structure.patch"; mutation: "backspace-at-start"; nodeId: string; text?: string }
  | {
      kind: "list.structure.patch"
      mutation: "toggle-preset"
      nodeId: string
      styleId: FlowDocListStylePresetId
      instanceId: string
      level?: number
      text?: string
    }
  | { kind: "flow-row.structure.patch"; rowId: string; stackId?: string; position?: "before" | "after" }
  | {
      kind: "flow-row.layout.patch"
      layoutType: "resize-columns"
      leftStackId: string
      leftShare: number
      rightStackId: string
      rightShare: number
      paginated?: PaginatedDocument
    }
  | { kind: "flow-row.layout.patch"; layoutType: "resize-row-min-height"; rowId: string; minHeight: number }
  | { kind: "table.structure.patch"; mutation: "add-row"; tableId: string; afterIndex?: number }
  | { kind: "table.structure.patch"; mutation: "remove-row"; tableId: string; rowIndex: number }
  | { kind: "table.structure.patch"; mutation: "add-column"; tableId: string; afterIndex?: number }
  | { kind: "table.structure.patch"; mutation: "remove-column"; tableId: string; colIndex: number }
  | { kind: "table.structure.patch"; mutation: "fit-to-width"; tableId: string }
  | {
      kind: "table.structure.patch"
      mutation: "resize-column-pair"
      tableId: string
      leftColIndex: number
      leftWidth: number
      rightWidth: number
      paginated?: PaginatedDocument
    }
  | { kind: "table.structure.patch"; mutation: "cell-span"; cellId: string; changes: FlowTableCellSpanChanges }
  | { kind: "table.structure.patch"; mutation: "delete-empty-cell-paragraph"; nodeId: string; text?: string }
  | {
      kind: "document.settings.patch"
      setting: "margin"
      sectionIndex: number
      margin: { top: number; right: number; bottom: number; left: number }
    }
  | {
      kind: "document.settings.patch"
      setting: "reserved-zones"
      sectionIndex: number
      reserved: { headerReserved: number; footerReserved: number }
      priority?: ReservedZonePriority
    }
  | {
      kind: "document.settings.patch"
      setting: "ensure-zone-visible" | "disable-zone-if-empty"
      sectionIndex: number
      zone: "header" | "footer"
    }
  | {
      kind: "document.settings.patch"
      setting: "header-footer-horizontal-mode"
      sectionIndex: number
      mode: "body" | "full"
    }
  | { kind: "style.patch"; styleType: "paragraph-text"; nodeId: string; changes: ParagraphTextStyleChanges }
  | { kind: "style.patch"; styleType: "apply-paragraph-style-preset"; nodeId: string; styleId: FlowDocParagraphStylePresetId }
  | { kind: "style.patch"; styleType: "clear-paragraph-style"; nodeId: string }
  | { kind: "style.patch"; styleType: "detach-paragraph-style"; nodeId: string }
  | { kind: "style.patch"; styleType: "paragraph-style-override-box"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { kind: "style.patch"; styleType: "paragraph-style-overrides"; nodeId: string; changes: ParagraphStyleProperties }
  | { kind: "style.patch"; styleType: "paragraph-style-definition"; styleId: string; patch: ParagraphStyleDefinitionPatch }
  | { kind: "style.patch"; styleType: "rename-paragraph-style-definition"; styleId: string; name: string | null }
  | { kind: "style.patch"; styleType: "reset-paragraph-style-overrides"; nodeId: string }
  | {
      kind: "style.patch"
      styleType: "text-run-style-range"
      nodeId: string
      start: number
      end: number
      changes: ParagraphTextStyleChanges
    }
  | { kind: "style.patch"; styleType: "paragraph-box-style"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { kind: "style.patch"; styleType: "flow-stack-box-style"; nodeId: string; changes: ParagraphBoxStyleChanges }

/**
 * Compatibility name for the original operation command body field.
 * New code should prefer `EditorOperationCommand` and `operation.command`.
 */
export type EditorOperationPayload = EditorOperationCommand

export type EditorOperationActionSnapshot = EditorAction

export type EditorOperationRuntimeContext = {
  documentGraph?: EditorOperationDocumentGraphRuntime
  structural?: EditorOperationStructuralRuntimeContext
  textCommit?: EditorOperationTextCommitRuntimeContext
  previewSettle?: unknown
  draft?: unknown
}

/**
 * The core wrapper for the Editor Operation Architecture.
 * `command` is the semantic command body. `payload` remains as a compatibility
 * mirror while existing planners migrate to the command name. `action` remains
 * a lossless UI action snapshot for legacy reducer and lifecycle bridges.
 */
export type EditorOperationEnvelope = {
  kind: EditorOperationKind
  urgency: EditorOperationUrgency
  scope: EditorOperationScope
  /**
   * The original, lossless EditorAction.
   * This ensures that no behavior drifts during the migration phase.
   */
  action: EditorOperationActionSnapshot
  command?: EditorOperationCommand
  /**
   * @deprecated Use `command`. Kept as a compatibility mirror while operation
   * planners migrate by group.
   */
  payload?: EditorOperationPayload
  runtime?: EditorOperationRuntimeContext
}
