import type { EditorAction } from "../editorReducer"
import { classifyEditorAction } from "../editorActionClassifier"
import type { EditorOperationEnvelope, EditorOperationKind } from "./editorOperationTypes"

/**
 * Derives the EditorOperationKind from the existing EditorAction type.
 * This is the mapping layer that bridges the legacy reducer-based architecture
 * to the new Operation Architecture.
 */
function deriveOperationKindFromAction(action: EditorAction): EditorOperationKind {
  switch (action.type) {
    case "SPLIT_PARAGRAPH":
      return "paragraph.split"
    case "MERGE_PARAGRAPH":
      return "paragraph.merge"
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return "table.structure.patch"
    case "DELETE_NODE":
      return "node.delete"
    case "REORDER_BODY_CHILD":
      return "node.reorder"
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "UPDATE_FLOW_STACK_BOX_STYLE":
    case "CLEAR_PARAGRAPH_STYLE":
    case "TOGGLE_LIST_PRESET":
      return "style.patch"
    case "RESIZE_TABLE_COLUMN_PAIR":
    case "TABLE_ADD_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_ROW":
    case "TABLE_REMOVE_COL":
    case "RESIZE_COLUMNS":
      return "table.structure.patch"
    // The "text.commit" is conceptually tied to updating text.
    case "UPDATE_TEXT":
    case "COMMIT_WYSIWYG_TEXT_EDIT":
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return "text.commit"
    default:
      // Any other UI actions (SELECT_NODE, SET_PAGINATED, etc)
      return "legacy.action"
  }
}

/**
 * Extracts nodeIds related to the action to determine the operation scope.
 * This is a basic mapping, it can be extended based on actual operation needs.
 */
function extractOperationNodeIds(action: EditorAction): string[] {
  switch (action.type) {
    case "SPLIT_PARAGRAPH":
      return [action.nodeId, ...(action.newNodeId ? [action.newNodeId] : [])]
    case "MERGE_PARAGRAPH":
      return [action.nodeId, ...(action.precomputed?.prevNodeId ? [action.precomputed.prevNodeId] : [])]
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return [action.nodeId]
    case "DELETE_NODE":
      return [action.nodeId]
    case "UPDATE_TEXT":
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "CLEAR_PARAGRAPH_STYLE":
    case "TOGGLE_LIST_PRESET":
    case "COMMIT_WYSIWYG_TEXT_EDIT":
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return [action.nodeId]
    case "TABLE_ADD_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_ROW":
    case "TABLE_REMOVE_COL":
    case "RESIZE_TABLE_COLUMN_PAIR":
      return [action.tableId]
    case "REORDER_BODY_CHILD":
      return [action.sourceNodeId, action.targetNodeId]
    case "RESIZE_COLUMNS":
      return []
    case "SELECT_NODE":
      return action.nodeId ? [action.nodeId] : []
    default:
      return []
  }
}

/**
 * Creates an EditorOperationEnvelope losslessly from an EditorAction.
 *
 * Guarantee: Zero behavior change.
 * The original EditorAction is fully preserved within the envelope and
 * can be safely roundtripped back to the reducer.
 */
export function createEditorOperationFromAction(action: EditorAction): EditorOperationEnvelope {
  const classification = classifyEditorAction(action)
  const kind = deriveOperationKindFromAction(action)

  return {
    kind,
    urgency: classification.priority,
    scope: {
      nodeIds: extractOperationNodeIds(action),
      layoutScope: classification.layoutScope,
      uiImpact: classification.uiImpact,
      // Defaulting to basic needs based on current architecture behavior
      needsHistory: classification.uiImpact !== "none" && classification.uiImpact !== "selection",
      needsPreviewSettle: classification.priority !== "sync",
      canOptimistic: true,
    },
    // The lossless original action
    action,
  }
}
