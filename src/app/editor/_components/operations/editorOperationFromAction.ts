import type { EditorAction } from "../editorReducer"
import { classifyEditorAction, type EditorActionClassification } from "../editorActionClassifier"
import type { EditorOperationCommand, EditorOperationEnvelope, EditorOperationKind } from "./editorOperationTypes"

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

function createOperationCommandFromAction(action: EditorAction): EditorOperationCommand | undefined {
  switch (action.type) {
    case "DELETE_NODE":
      return { kind: "node.delete", nodeId: action.nodeId }
    case "DUPLICATE_NODE":
      return { kind: "node.duplicate", nodeId: action.nodeId }
    case "REORDER_BODY_CHILD":
      return {
        kind: "node.reorder",
        sectionId: action.sectionId,
        sourceNodeId: action.sourceNodeId,
        targetNodeId: action.targetNodeId,
        position: action.position,
      }
    case "UPDATE_PROPS":
      return { kind: "node.props.patch", nodeId: action.nodeId, changes: action.changes }
    case "UPDATE_FIELD_REF":
      return { kind: "field.patch", fieldRefId: action.fieldRefId, changes: action.changes }
    case "DRAG_COMMIT":
      return { kind: "drag.placement", sectionId: action.sectionId, op: action.op }
    case "UPDATE_INLINE_TEXT_DRAFT":
      return { kind: "text.draft", nodeId: action.nodeId, text: action.text }
    case "UPDATE_TEXT":
      return { kind: "text.commit", commitType: "update-text", nodeId: action.nodeId, text: action.text }
    case "COMMIT_INLINE_TEXT_EDIT":
      return { kind: "text.commit", commitType: "inline-text", nodeId: action.nodeId, beforeText: action.beforeText }
    case "COMMIT_WYSIWYG_TEXT_EDIT":
      return {
        kind: "text.commit",
        commitType: "wysiwyg-text",
        nodeId: action.nodeId,
        text: action.text,
        beforeText: action.beforeText,
      }
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return { kind: "text.commit", commitType: "wysiwyg-rich-text", nodeId: action.nodeId, paragraph: action.paragraph }
    case "SPLIT_PARAGRAPH":
      return {
        kind: "paragraph.split",
        nodeId: action.nodeId,
        splitIndex: action.splitIndex,
        ...(action.text !== undefined ? { text: action.text } : {}),
        ...(action.newNodeId ? { newNodeId: action.newNodeId } : {}),
      }
    case "MERGE_PARAGRAPH":
      return {
        kind: "paragraph.merge",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "EXIT_LIST_ITEM":
      return {
        kind: "list.structure.patch",
        mutation: "exit-item",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "CHANGE_LIST_ITEM_LEVEL":
      return {
        kind: "list.structure.patch",
        mutation: "change-level",
        nodeId: action.nodeId,
        direction: action.direction,
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "BACKSPACE_LIST_ITEM_AT_START":
      return {
        kind: "list.structure.patch",
        mutation: "backspace-at-start",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "TOGGLE_LIST_PRESET":
      return {
        kind: "list.structure.patch",
        mutation: "toggle-preset",
        nodeId: action.nodeId,
        styleId: action.styleId,
        instanceId: action.instanceId,
        ...(action.level !== undefined ? { level: action.level } : {}),
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
      return { kind: "style.patch", styleType: "paragraph-text", nodeId: action.nodeId, changes: action.changes }
    case "APPLY_PARAGRAPH_STYLE_PRESET":
      return { kind: "style.patch", styleType: "apply-paragraph-style-preset", nodeId: action.nodeId, styleId: action.styleId }
    case "CLEAR_PARAGRAPH_STYLE":
      return { kind: "style.patch", styleType: "clear-paragraph-style", nodeId: action.nodeId }
    case "DETACH_PARAGRAPH_STYLE":
      return { kind: "style.patch", styleType: "detach-paragraph-style", nodeId: action.nodeId }
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
      return { kind: "style.patch", styleType: "paragraph-style-override-box", nodeId: action.nodeId, changes: action.changes }
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
      return { kind: "style.patch", styleType: "paragraph-style-overrides", nodeId: action.nodeId, changes: action.changes }
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
      return { kind: "style.patch", styleType: "paragraph-style-definition", styleId: action.styleId, patch: action.patch }
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return { kind: "style.patch", styleType: "rename-paragraph-style-definition", styleId: action.styleId, name: action.name }
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
      return { kind: "style.patch", styleType: "reset-paragraph-style-overrides", nodeId: action.nodeId }
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
      return {
        kind: "style.patch",
        styleType: "text-run-style-range",
        nodeId: action.nodeId,
        start: action.start,
        end: action.end,
        changes: action.changes,
      }
    case "UPDATE_PARAGRAPH_BOX_STYLE":
      return { kind: "style.patch", styleType: "paragraph-box-style", nodeId: action.nodeId, changes: action.changes }
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return { kind: "style.patch", styleType: "flow-stack-box-style", nodeId: action.nodeId, changes: action.changes }
    case "FLOW_ROW_ADD_COL":
      return {
        kind: "flow-row.structure.patch",
        rowId: action.rowId,
        ...(action.stackId ? { stackId: action.stackId } : {}),
        ...(action.position ? { position: action.position } : {}),
      }
    case "RESIZE_COLUMNS":
      return {
        kind: "flow-row.layout.patch",
        layoutType: "resize-columns",
        leftStackId: action.leftStackId,
        leftShare: action.leftShare,
        rightStackId: action.rightStackId,
        rightShare: action.rightShare,
        ...(action.paginated ? { paginated: action.paginated } : {}),
      }
    case "RESIZE_ROW_MIN_HEIGHT":
      return {
        kind: "flow-row.layout.patch",
        layoutType: "resize-row-min-height",
        rowId: action.rowId,
        minHeight: action.minHeight,
      }
    case "TABLE_ADD_ROW":
      return {
        kind: "table.structure.patch",
        mutation: "add-row",
        tableId: action.tableId,
        ...(action.afterIndex != null ? { afterIndex: action.afterIndex } : {}),
      }
    case "TABLE_REMOVE_ROW":
      return { kind: "table.structure.patch", mutation: "remove-row", tableId: action.tableId, rowIndex: action.rowIndex }
    case "TABLE_ADD_COL":
      return {
        kind: "table.structure.patch",
        mutation: "add-column",
        tableId: action.tableId,
        ...(action.afterIndex != null ? { afterIndex: action.afterIndex } : {}),
      }
    case "TABLE_REMOVE_COL":
      return { kind: "table.structure.patch", mutation: "remove-column", tableId: action.tableId, colIndex: action.colIndex }
    case "TABLE_FIT_TO_WIDTH":
      return { kind: "table.structure.patch", mutation: "fit-to-width", tableId: action.tableId }
    case "RESIZE_TABLE_COLUMN_PAIR":
      return {
        kind: "table.structure.patch",
        mutation: "resize-column-pair",
        tableId: action.tableId,
        leftColIndex: action.leftColIndex,
        leftWidth: action.leftWidth,
        rightWidth: action.rightWidth,
        ...(action.paginated ? { paginated: action.paginated } : {}),
      }
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
      return { kind: "table.structure.patch", mutation: "cell-span", cellId: action.cellId, changes: action.changes }
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return {
        kind: "table.structure.patch",
        mutation: "delete-empty-cell-paragraph",
        nodeId: action.nodeId,
        ...(action.text !== undefined ? { text: action.text } : {}),
      }
    case "UPDATE_MARGIN":
      return { kind: "document.settings.patch", setting: "margin", sectionIndex: action.sectionIndex, margin: action.margin }
    case "UPDATE_RESERVED_ZONES":
      return {
        kind: "document.settings.patch",
        setting: "reserved-zones",
        sectionIndex: action.sectionIndex,
        reserved: action.reserved,
        ...(action.priority ? { priority: action.priority } : {}),
      }
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
      return { kind: "document.settings.patch", setting: "ensure-zone-visible", sectionIndex: action.sectionIndex, zone: action.zone }
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
      return { kind: "document.settings.patch", setting: "disable-zone-if-empty", sectionIndex: action.sectionIndex, zone: action.zone }
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
      return {
        kind: "document.settings.patch",
        setting: "header-footer-horizontal-mode",
        sectionIndex: action.sectionIndex,
        mode: action.mode,
      }
    default:
      return undefined
  }
}

function createCompatibilityActionFromCommand(command: EditorOperationCommand): EditorAction {
  switch (command.kind) {
    case "node.delete":
      return { type: "DELETE_NODE", nodeId: command.nodeId }
    case "node.duplicate":
      return { type: "DUPLICATE_NODE", nodeId: command.nodeId }
    case "node.reorder":
      return {
        type: "REORDER_BODY_CHILD",
        sectionId: command.sectionId,
        sourceNodeId: command.sourceNodeId,
        targetNodeId: command.targetNodeId,
        position: command.position,
      }
    case "node.props.patch":
      return { type: "UPDATE_PROPS", nodeId: command.nodeId, changes: command.changes }
    case "field.patch":
      return { type: "UPDATE_FIELD_REF", fieldRefId: command.fieldRefId, changes: command.changes }
    case "drag.placement":
      return { type: "DRAG_COMMIT", sectionId: command.sectionId, op: command.op }
    case "text.draft":
      return { type: "UPDATE_INLINE_TEXT_DRAFT", nodeId: command.nodeId, text: command.text }
    case "text.commit":
      switch (command.commitType) {
        case "update-text":
          return { type: "UPDATE_TEXT", nodeId: command.nodeId, text: command.text }
        case "inline-text":
          return { type: "UPDATE_TEXT", nodeId: command.nodeId, text: command.beforeText }
        case "wysiwyg-text":
          return { type: "UPDATE_TEXT", nodeId: command.nodeId, text: command.text }
        case "wysiwyg-rich-text":
          return {
            type: "UPDATE_TEXT",
            nodeId: command.nodeId,
            text: command.paragraph.children.map((child) => child.type === "text" ? child.text : "").join(""),
          }
      }
    case "paragraph.split":
      return {
        type: "SPLIT_PARAGRAPH",
        nodeId: command.nodeId,
        splitIndex: command.splitIndex,
        ...(command.text !== undefined ? { text: command.text } : {}),
        ...(command.newNodeId ? { newNodeId: command.newNodeId } : {}),
      }
    case "paragraph.merge":
      return {
        type: "MERGE_PARAGRAPH",
        nodeId: command.nodeId,
        ...(command.text !== undefined ? { text: command.text } : {}),
      }
    case "list.structure.patch":
      switch (command.mutation) {
        case "exit-item":
          return {
            type: "EXIT_LIST_ITEM",
            nodeId: command.nodeId,
            ...(command.text !== undefined ? { text: command.text } : {}),
          }
        case "change-level":
          return {
            type: "CHANGE_LIST_ITEM_LEVEL",
            nodeId: command.nodeId,
            direction: command.direction,
            ...(command.text !== undefined ? { text: command.text } : {}),
          }
        case "backspace-at-start":
          return {
            type: "BACKSPACE_LIST_ITEM_AT_START",
            nodeId: command.nodeId,
            ...(command.text !== undefined ? { text: command.text } : {}),
          }
        case "toggle-preset":
          return {
            type: "TOGGLE_LIST_PRESET",
            nodeId: command.nodeId,
            styleId: command.styleId,
            instanceId: command.instanceId,
            ...(command.level !== undefined ? { level: command.level } : {}),
            ...(command.text !== undefined ? { text: command.text } : {}),
          }
      }
    case "flow-row.structure.patch":
      return {
        type: "FLOW_ROW_ADD_COL",
        rowId: command.rowId,
        ...(command.stackId ? { stackId: command.stackId } : {}),
        ...(command.position ? { position: command.position } : {}),
      }
    case "flow-row.layout.patch":
      if (command.layoutType === "resize-columns") {
        return {
          type: "RESIZE_COLUMNS",
          leftStackId: command.leftStackId,
          leftShare: command.leftShare,
          rightStackId: command.rightStackId,
          rightShare: command.rightShare,
          ...(command.paginated ? { paginated: command.paginated } : {}),
        }
      }
      return {
        type: "RESIZE_ROW_MIN_HEIGHT",
        rowId: command.rowId,
        minHeight: command.minHeight,
      }
    case "table.structure.patch":
      switch (command.mutation) {
        case "add-row":
          return {
            type: "TABLE_ADD_ROW",
            tableId: command.tableId,
            ...(command.afterIndex != null ? { afterIndex: command.afterIndex } : {}),
          }
        case "remove-row":
          return { type: "TABLE_REMOVE_ROW", tableId: command.tableId, rowIndex: command.rowIndex }
        case "add-column":
          return {
            type: "TABLE_ADD_COL",
            tableId: command.tableId,
            ...(command.afterIndex != null ? { afterIndex: command.afterIndex } : {}),
          }
        case "remove-column":
          return { type: "TABLE_REMOVE_COL", tableId: command.tableId, colIndex: command.colIndex }
        case "fit-to-width":
          return { type: "TABLE_FIT_TO_WIDTH", tableId: command.tableId }
        case "resize-column-pair":
          return {
            type: "RESIZE_TABLE_COLUMN_PAIR",
            tableId: command.tableId,
            leftColIndex: command.leftColIndex,
            leftWidth: command.leftWidth,
            rightWidth: command.rightWidth,
            ...(command.paginated ? { paginated: command.paginated } : {}),
          }
        case "cell-span":
          return { type: "UPDATE_FLOW_TABLE_CELL_SPAN", cellId: command.cellId, changes: command.changes }
        case "delete-empty-cell-paragraph":
          return {
            type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH",
            nodeId: command.nodeId,
            ...(command.text !== undefined ? { text: command.text } : {}),
          }
      }
    case "document.settings.patch":
      switch (command.setting) {
        case "margin":
          return { type: "UPDATE_MARGIN", sectionIndex: command.sectionIndex, margin: command.margin }
        case "reserved-zones":
          return {
            type: "UPDATE_RESERVED_ZONES",
            sectionIndex: command.sectionIndex,
            reserved: command.reserved,
            ...(command.priority ? { priority: command.priority } : {}),
          }
        case "ensure-zone-visible":
          return { type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE", sectionIndex: command.sectionIndex, zone: command.zone }
        case "disable-zone-if-empty":
          return { type: "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY", sectionIndex: command.sectionIndex, zone: command.zone }
        case "header-footer-horizontal-mode":
          return { type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE", sectionIndex: command.sectionIndex, mode: command.mode }
      }
    case "style.patch":
      switch (command.styleType) {
        case "paragraph-text":
          return { type: "UPDATE_PARAGRAPH_TEXT_STYLE", nodeId: command.nodeId, changes: command.changes }
        case "apply-paragraph-style-preset":
          return { type: "APPLY_PARAGRAPH_STYLE_PRESET", nodeId: command.nodeId, styleId: command.styleId }
        case "clear-paragraph-style":
          return { type: "CLEAR_PARAGRAPH_STYLE", nodeId: command.nodeId }
        case "detach-paragraph-style":
          return { type: "DETACH_PARAGRAPH_STYLE", nodeId: command.nodeId }
        case "paragraph-style-override-box":
          return { type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX", nodeId: command.nodeId, changes: command.changes }
        case "paragraph-style-overrides":
          return { type: "PATCH_PARAGRAPH_STYLE_OVERRIDES", nodeId: command.nodeId, changes: command.changes }
        case "paragraph-style-definition":
          return { type: "PATCH_PARAGRAPH_STYLE_DEFINITION", styleId: command.styleId, patch: command.patch }
        case "rename-paragraph-style-definition":
          return { type: "RENAME_PARAGRAPH_STYLE_DEFINITION", styleId: command.styleId, name: command.name }
        case "reset-paragraph-style-overrides":
          return { type: "RESET_PARAGRAPH_STYLE_OVERRIDES", nodeId: command.nodeId }
        case "text-run-style-range":
          return {
            type: "UPDATE_TEXT_RUN_STYLE_RANGE",
            nodeId: command.nodeId,
            start: command.start,
            end: command.end,
            changes: command.changes,
          }
        case "paragraph-box-style":
          return { type: "UPDATE_PARAGRAPH_BOX_STYLE", nodeId: command.nodeId, changes: command.changes }
        case "flow-stack-box-style":
          return { type: "UPDATE_FLOW_STACK_BOX_STYLE", nodeId: command.nodeId, changes: command.changes }
      }
  }
}

function createOperationRuntimeFromAction(action: EditorAction): EditorOperationEnvelope["runtime"] | undefined {
  switch (action.type) {
    case "COMMIT_INLINE_TEXT_EDIT":
      return {
        textCommit: {
          beforeDoc: action.beforeDoc,
          beforePaginated: action.beforePaginated,
          afterPaginated: action.afterPaginated,
        },
      }
    case "COMMIT_WYSIWYG_TEXT_EDIT":
      return {
        textCommit: {
          ...(action.history ? { history: action.history } : {}),
          afterPaginated: action.afterPaginated,
        },
      }
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
      return {
        textCommit: {
          ...(action.history ? { history: action.history } : {}),
          afterPaginated: action.afterPaginated,
        },
      }
    case "SPLIT_PARAGRAPH":
    case "MERGE_PARAGRAPH":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
          ...(action.paginated ? { paginated: action.paginated } : {}),
          ...(action.precomputed ? { precomputed: action.precomputed } : {}),
          ...(action.precomputedDocValidation ? { precomputedDocValidation: action.precomputedDocValidation } : {}),
          ...(action.isOptimistic !== undefined ? { isOptimistic: action.isOptimistic } : {}),
        },
      }
    case "EXIT_LIST_ITEM":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
        },
      }
    case "CHANGE_LIST_ITEM_LEVEL":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
          ...(action.caretIndex !== undefined ? { caretIndex: action.caretIndex } : {}),
          ...(action.refocus !== undefined ? { refocus: action.refocus } : {}),
        },
      }
    case "BACKSPACE_LIST_ITEM_AT_START":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
          ...(action.caretIndex !== undefined ? { caretIndex: action.caretIndex } : {}),
        },
      }
    case "TOGGLE_LIST_PRESET":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
          ...(action.paragraph ? { paragraph: action.paragraph } : {}),
        },
      }
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return {
        structural: {
          ...(action.history ? { history: action.history } : {}),
          ...(action.paginated ? { paginated: action.paginated } : {}),
        },
      }
    default:
      return undefined
  }
}

/**
 * Creates an EditorOperationEnvelope losslessly from an EditorAction.
 *
 * Guarantee: the original EditorAction is preserved for compatibility while
 * migrated operation groups also receive semantic payloads.
 */
export function createEditorOperationFromAction(
  action: EditorAction,
  classification: EditorActionClassification = classifyEditorAction(action),
): EditorOperationEnvelope {
  const kind = deriveOperationKindFromAction(action)
  const command = createOperationCommandFromAction(action)
  const runtime = createOperationRuntimeFromAction(action)

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
    ...(command ? { command, payload: command } : {}),
    ...(runtime ? { runtime } : {}),
  }
}

export function createEditorOperationFromCommand(
  command: EditorOperationCommand,
  classification?: EditorActionClassification,
): EditorOperationEnvelope {
  const action = createCompatibilityActionFromCommand(command)
  return {
    ...createEditorOperationFromAction(action, classification ?? classifyEditorAction(action)),
    command,
    payload: command,
  }
}
