import type { ParagraphBoxStyle, ParagraphStyleProperties } from "@/schema"
import type { ParagraphBoxStyleChanges, ParagraphStyleDefinitionPatch, ParagraphTextStyleChanges } from "@/document"
import type { EditorAction } from "./editorReducer"

export type EditorActionUiImpact = "none" | "selection" | "visual" | "layout" | "structure"
export type EditorActionLayoutScope = "none" | "node" | "block" | "table" | "from-index" | "document"
export type EditorActionPriority = "sync" | "visible" | "background"

export interface EditorActionClassification {
  uiImpact: EditorActionUiImpact
  layoutScope: EditorActionLayoutScope
  priority: EditorActionPriority
  reason: string
}

const NO_LAYOUT: EditorActionClassification = {
  uiImpact: "none",
  layoutScope: "none",
  priority: "sync",
  reason: "action does not change authored document layout",
}

const SELECTION_ONLY: EditorActionClassification = {
  uiImpact: "selection",
  layoutScope: "none",
  priority: "sync",
  reason: "selection and interaction state only",
}

const VISUAL_ONLY: EditorActionClassification = {
  uiImpact: "visual",
  layoutScope: "none",
  priority: "background",
  reason: "authored visual change can reconcile server layout without blocking canvas",
}

const NODE_LAYOUT: EditorActionClassification = {
  uiImpact: "layout",
  layoutScope: "node",
  priority: "visible",
  reason: "node metrics or text can affect visible layout",
}

const BLOCK_LAYOUT: EditorActionClassification = {
  uiImpact: "layout",
  layoutScope: "block",
  priority: "visible",
  reason: "block metrics can affect visible layout",
}

const TABLE_LAYOUT: EditorActionClassification = {
  uiImpact: "structure",
  layoutScope: "table",
  priority: "visible",
  reason: "table structure can affect visible layout",
}

const FROM_INDEX_STRUCTURE: EditorActionClassification = {
  uiImpact: "structure",
  layoutScope: "from-index",
  priority: "visible",
  reason: "body order or insertion can affect downstream layout",
}

const DOCUMENT_LAYOUT: EditorActionClassification = {
  uiImpact: "layout",
  layoutScope: "document",
  priority: "visible",
  reason: "document-wide settings can affect layout",
}

const DOCUMENT_BACKGROUND_LAYOUT: EditorActionClassification = {
  uiImpact: "layout",
  layoutScope: "document",
  priority: "background",
  reason: "document-wide style change should reconcile without blocking canvas",
}

const TEXT_STYLE_VISUAL_KEYS = new Set<keyof ParagraphTextStyleChanges>([
  "textColor",
  "textDecoration",
  "strikethrough",
])

const PARAGRAPH_STYLE_VISUAL_KEYS = new Set<keyof ParagraphStyleProperties>([
  "textColor",
  "textDecoration",
  "strikethrough",
])

function hasOwnKey(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function classifyParagraphTextStyleChanges(
  changes: ParagraphTextStyleChanges,
): EditorActionClassification {
  const keys = Object.keys(changes) as Array<keyof ParagraphTextStyleChanges>
  if (keys.length > 0 && keys.every((key) => TEXT_STYLE_VISUAL_KEYS.has(key))) {
    return VISUAL_ONLY
  }
  return NODE_LAYOUT
}

function isBoxStyleVisualOnly(box: ParagraphBoxStyle | undefined): boolean {
  if (!box) return true
  if (box.padding != null) return false
  if (box.border != null && Object.keys(box.border).length > 0) return false
  return true
}

export function classifyParagraphStyleProperties(
  props: ParagraphStyleProperties,
  scope: EditorActionLayoutScope = "node",
): EditorActionClassification {
  const keys = Object.keys(props) as Array<keyof ParagraphStyleProperties>
  if (keys.length === 0) return NO_LAYOUT
  const visualOnly = keys.every((key) => {
    if (PARAGRAPH_STYLE_VISUAL_KEYS.has(key)) return true
    if (key === "box") return isBoxStyleVisualOnly(props.box)
    return false
  })
  if (visualOnly) return VISUAL_ONLY
  return scope === "document" ? DOCUMENT_BACKGROUND_LAYOUT : { ...NODE_LAYOUT, layoutScope: scope }
}

export function classifyParagraphBoxStyleChanges(
  changes: ParagraphBoxStyleChanges,
): EditorActionClassification {
  if (hasOwnKey(changes, "padding")) return BLOCK_LAYOUT
  if (hasOwnKey(changes, "border")) return BLOCK_LAYOUT
  if (hasOwnKey(changes, "fill")) return VISUAL_ONLY
  return NO_LAYOUT
}

function classifyParagraphStyleDefinitionPatch(
  patch: ParagraphStyleDefinitionPatch,
): EditorActionClassification {
  if (patch.props) return classifyParagraphStyleProperties(patch.props, "document")
  if (hasOwnKey(patch, "name")) return VISUAL_ONLY
  return NO_LAYOUT
}

export function classifyEditorAction(action: EditorAction): EditorActionClassification {
  switch (action.type) {
    case "SELECT_NODE":
    case "DRAG_START":
    case "DRAG_MOVE":
    case "DRAG_CANCEL":
    case "CLEAR_SPLIT_NODE_ID":
    case "CLEAR_MERGE_RESULT":
    case "CLEAR_LIST_EXIT_NODE_ID":
    case "CLEAR_LIST_LEVEL_CHANGE_RESULT":
    case "SET_PAGINATED":
    case "SET_INLINE_EDIT_HEIGHT":
      return action.type === "SELECT_NODE" ? SELECTION_ONLY : NO_LAYOUT

    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
      return classifyParagraphTextStyleChanges(action.changes)

    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
      return classifyParagraphStyleProperties(action.changes)

    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return classifyParagraphBoxStyleChanges(action.changes)

    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
      return classifyParagraphStyleDefinitionPatch(action.patch)

    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return VISUAL_ONLY

    case "DRAG_COMMIT":
    case "REORDER_BODY_CHILD":
    case "DELETE_NODE":
    case "DUPLICATE_NODE":
    case "SPLIT_PARAGRAPH":
    case "MERGE_PARAGRAPH":
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
    case "EXIT_LIST_ITEM":
    case "CHANGE_LIST_ITEM_LEVEL":
    case "BACKSPACE_LIST_ITEM_AT_START":
    case "TOGGLE_LIST_PRESET":
    case "FLOW_ROW_ADD_COL":
      return FROM_INDEX_STRUCTURE

    case "TABLE_ADD_ROW":
    case "TABLE_REMOVE_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_COL":
    case "TABLE_FIT_TO_WIDTH":
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
    case "RESIZE_TABLE_COLUMN_PAIR":
      return TABLE_LAYOUT

    case "RESIZE_COLUMNS":
    case "RESIZE_ROW_MIN_HEIGHT":
    case "UPDATE_TEXT":
    case "UPDATE_FIELD_REF":
    case "UPDATE_INLINE_TEXT_DRAFT":
    case "COMMIT_INLINE_TEXT_EDIT":
    case "COMMIT_WYSIWYG_TEXT_EDIT":
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT":
    case "APPLY_PARAGRAPH_STYLE_PRESET":
    case "CLEAR_PARAGRAPH_STYLE":
    case "DETACH_PARAGRAPH_STYLE":
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
    case "UPDATE_PROPS":
      return NODE_LAYOUT

    case "UPDATE_MARGIN":
    case "UPDATE_RESERVED_ZONES":
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
    case "UNDO":
    case "REDO":
      return DOCUMENT_LAYOUT

    case "LOAD_DOCUMENT":
      return DOCUMENT_LAYOUT
  }
}

export function shouldSuppressLayoutLoadingOverlayForEditorAction(
  action: EditorAction,
  classification = classifyEditorAction(action),
): boolean {
  if (action.type === "LOAD_DOCUMENT") return false
  if (classification.layoutScope === "none" && classification.uiImpact !== "visual") return false
  return classification.priority === "visible" || classification.priority === "background"
}
