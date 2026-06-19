import type { EditorAction } from "../editorReducer"
import { classifyEditorAction, type EditorActionClassification } from "../editorActionClassifier"
import type { EditorOperationEnvelope, EditorOperationKind } from "./editorOperationTypes"

/**
 * Derives the EditorOperationKind from the existing EditorAction type.
 * This is the mapping layer that bridges the legacy reducer-based architecture
 * to the new Operation Architecture.
 */
function deriveOperationKindFromAction(action: EditorAction): EditorOperationKind {
  switch (action.type) {
    case "DRAG_COMMIT":
      return "drag.placement"
    case "SPLIT_PARAGRAPH":
      return "paragraph.split"
    case "MERGE_PARAGRAPH":
      return "paragraph.merge"
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return "table.structure.patch"
    case "EXIT_LIST_ITEM":
    case "CHANGE_LIST_ITEM_LEVEL":
    case "BACKSPACE_LIST_ITEM_AT_START":
    case "TOGGLE_LIST_PRESET":
      return "list.structure.patch"
    case "DELETE_NODE":
      return "node.delete"
    case "DUPLICATE_NODE":
      return "node.duplicate"
    case "REORDER_BODY_CHILD":
      return "node.reorder"
    case "FLOW_ROW_ADD_COL":
      return "flow-row.structure.patch"
    case "RESIZE_COLUMNS":
    case "RESIZE_ROW_MIN_HEIGHT":
      return "flow-row.layout.patch"
    case "UPDATE_PROPS":
      return "node.props.patch"
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "APPLY_PARAGRAPH_STYLE_PRESET":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "UPDATE_FLOW_STACK_BOX_STYLE":
    case "CLEAR_PARAGRAPH_STYLE":
    case "DETACH_PARAGRAPH_STYLE":
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
      return "style.patch"
    case "UPDATE_FIELD_REF":
      return "field.patch"
    case "RESIZE_TABLE_COLUMN_PAIR":
    case "TABLE_ADD_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_ROW":
    case "TABLE_REMOVE_COL":
    case "TABLE_FIT_TO_WIDTH":
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
      return "table.structure.patch"
    case "UPDATE_MARGIN":
    case "UPDATE_RESERVED_ZONES":
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
      return "document.settings.patch"
    case "UPDATE_INLINE_TEXT_DRAFT":
      return "text.draft"
    // The "text.commit" is conceptually tied to updating text.
    case "UPDATE_TEXT":
    case "COMMIT_INLINE_TEXT_EDIT":
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
    case "DRAG_COMMIT":
      return []
    case "SPLIT_PARAGRAPH":
      return [action.nodeId, ...(action.newNodeId ? [action.newNodeId] : [])]
    case "MERGE_PARAGRAPH":
      return [action.nodeId, ...(action.precomputed?.prevNodeId ? [action.precomputed.prevNodeId] : [])]
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return [action.nodeId]
    case "EXIT_LIST_ITEM":
    case "CHANGE_LIST_ITEM_LEVEL":
    case "BACKSPACE_LIST_ITEM_AT_START":
    case "TOGGLE_LIST_PRESET":
      return [action.nodeId]
    case "DELETE_NODE":
    case "DUPLICATE_NODE":
      return [action.nodeId]
    case "UPDATE_PROPS":
    case "UPDATE_TEXT":
    case "UPDATE_INLINE_TEXT_DRAFT":
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "APPLY_PARAGRAPH_STYLE_PRESET":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "CLEAR_PARAGRAPH_STYLE":
    case "DETACH_PARAGRAPH_STYLE":
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
    case "TOGGLE_LIST_PRESET":
    case "COMMIT_INLINE_TEXT_EDIT":
    case "COMMIT_WYSIWYG_TEXT_EDIT":
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return [action.nodeId]
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return []
    case "UPDATE_FIELD_REF":
      return []
    case "TABLE_ADD_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_ROW":
    case "TABLE_REMOVE_COL":
    case "TABLE_FIT_TO_WIDTH":
    case "RESIZE_TABLE_COLUMN_PAIR":
      return [action.tableId]
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
      return [action.cellId]
    case "REORDER_BODY_CHILD":
      return [action.sourceNodeId, action.targetNodeId]
    case "FLOW_ROW_ADD_COL":
      return [action.rowId, ...(action.stackId ? [action.stackId] : [])]
    case "RESIZE_COLUMNS":
      return [action.leftStackId, action.rightStackId]
    case "RESIZE_ROW_MIN_HEIGHT":
      return [action.rowId]
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
export function createEditorOperationFromAction(
  action: EditorAction,
  classification: EditorActionClassification = classifyEditorAction(action),
): EditorOperationEnvelope {
  const kind = deriveOperationKindFromAction(action)

  return {
    kind,
    urgency: classification.priority,
    scope: {
      nodeIds: extractOperationNodeIds(action),
      layoutScope: classification.layoutScope,
      uiImpact: classification.uiImpact,
      // Defaulting to basic needs based on current architecture behavior
      needsHistory: action.type === "UPDATE_INLINE_TEXT_DRAFT"
        ? false
        : classification.uiImpact !== "none" && classification.uiImpact !== "selection",
      needsPreviewSettle: classification.priority !== "sync",
      canOptimistic: true,
    },
    // The lossless original action
    action,
  }
}
