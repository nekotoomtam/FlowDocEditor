import type { PaginatedDocument } from "@/pagination"
import {
  createDefaultDocument,
  ensureBaseParagraphStyle,
  ensureReservedZoneRoots,
  normalizeDocument,
} from "@/document"
import type { FieldRefInlineChanges, FlowDocListStylePresetId, FlowDocParagraphStylePresetId, FlowTableCellSpanChanges, ParagraphBoxStyleChanges, ParagraphStyleDefinitionPatch, ParagraphTextStyleChanges } from "@/document"
import type { ReservedZonePriority } from "@/document"
import type { DocumentNode, ParagraphNode, ParagraphStyleProperties } from "@/schema"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import type { DragSource, PlacementOperation, PlacementPreview } from "@/placement/types"
import { loadDocumentFromStorageCachedByRawValue } from "./documentPersistence"
import { createEditorPlaceholderPaginatedDocument } from "./editorInitialPagination"
import { resizeFragmentHeightAndShift } from "./inlineEditHeightPreview"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { finishFlowDocPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"
import { commitEditorOperationResult } from "./operations/editorOperationCommit"
import {
  createParagraphMergeActionResult,
  createParagraphMergeOperationResult,
  createParagraphSplitActionResult,
  createParagraphSplitOperationResult,
} from "./operations/editorParagraphOperationPlans"
import {
  createListStructureActionResult,
  createListStructureOperationResult,
} from "./operations/editorListOperationPlans"
import {
  createDragPlacementActionResult,
  createDragPlacementOperationResult,
} from "./operations/editorDragOperationPlans"
import {
  createInlineTextDraftResult,
  createTextCommitActionResult,
  createTextCommitOperationResult,
  createTextDraftOperationResult,
} from "./operations/editorTextCommitPlans"
import {
  createStylePatchActionResult,
  createStylePatchOperationResult,
} from "./operations/editorStyleOperationPlans"
import {
  createNodeDuplicateActionResult,
  createNodeDuplicateOperationResult,
  createNodeDeleteActionResult,
  createNodeDeleteOperationResult,
  createNodeReorderActionResult,
  createNodeReorderOperationResult,
} from "./operations/editorNodeOperationPlans"
import {
  createNodePropsActionResult,
  createNodePropsOperationResult,
} from "./operations/editorNodePropsOperationPlans"
import {
  createFlowRowAddColumnActionResult,
  createFlowRowAddColumnOperationResult,
  createFlowRowLayoutActionResult,
  createFlowRowLayoutOperationResult,
} from "./operations/editorFlowRowOperationPlans"
import {
  createTableStructureActionResult,
  createTableStructureOperationResult,
} from "./operations/editorTableOperationPlans"
import {
  createDocumentSettingsActionResult,
  createDocumentSettingsOperationResult,
} from "./operations/editorDocumentSettingsOperationPlans"
import {
  createFieldPatchActionResult,
  createFieldPatchOperationResult,
} from "./operations/editorFieldOperationPlans"
import type { EditorOperationEnvelope } from "./operations/editorOperationTypes"

export interface DragState {
  source: DragSource
  clientX: number
  clientY: number
  preview: PlacementPreview | null
}

export interface HistoryEntry {
  doc: DocumentNode
  paginated: PaginatedDocument
}

type PrecomputedSplitParagraphResult = {
  doc: DocumentNode
  newNodeId: string
}

type PrecomputedMergeParagraphResult = {
  doc: DocumentNode
  prevNodeId: string
  caretIndex: number
}

type PrecomputedDocValidation = "shell-optimistic-structural"

export interface EditorState {
  past: HistoryEntry[]
  doc: DocumentNode
  future: HistoryEntry[]
  paginated: PaginatedDocument
  drag: DragState | null
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  lastSplitNodeId: string | null
  listExitNodeId: string | null
  listLevelChangeResult: { nodeId: string; caretIndex: number | null } | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
}

export type EditorAction =
  | { type: "DRAG_START"; source: DragSource; clientX: number; clientY: number }
  | { type: "DRAG_MOVE"; clientX: number; clientY: number; preview: PlacementPreview | null }
  | { type: "DRAG_COMMIT"; op: PlacementOperation; sectionId: string }
  | { type: "DRAG_CANCEL" }
  | { type: "SELECT_NODE"; nodeId: string | null; anchorNodeId?: string | null }
  | { type: "UPDATE_PROPS"; nodeId: string; changes: Record<string, unknown> }
  | { type: "UPDATE_TEXT"; nodeId: string; text: string }
  | { type: "UPDATE_PARAGRAPH_TEXT_STYLE"; nodeId: string; changes: ParagraphTextStyleChanges }
  | { type: "APPLY_PARAGRAPH_STYLE_PRESET"; nodeId: string; styleId: FlowDocParagraphStylePresetId }
  | { type: "CLEAR_PARAGRAPH_STYLE"; nodeId: string }
  | { type: "DETACH_PARAGRAPH_STYLE"; nodeId: string }
  | { type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "PATCH_PARAGRAPH_STYLE_OVERRIDES"; nodeId: string; changes: ParagraphStyleProperties }
  | { type: "PATCH_PARAGRAPH_STYLE_DEFINITION"; styleId: string; patch: ParagraphStyleDefinitionPatch }
  | { type: "RENAME_PARAGRAPH_STYLE_DEFINITION"; styleId: string; name: string | null }
  | { type: "RESET_PARAGRAPH_STYLE_OVERRIDES"; nodeId: string }
  | { type: "UPDATE_TEXT_RUN_STYLE_RANGE"; nodeId: string; start: number; end: number; changes: ParagraphTextStyleChanges }
  | { type: "UPDATE_FIELD_REF"; fieldRefId: string; changes: FieldRefInlineChanges }
  | { type: "UPDATE_PARAGRAPH_BOX_STYLE"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "UPDATE_FLOW_STACK_BOX_STYLE"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "UPDATE_FLOW_TABLE_CELL_SPAN"; cellId: string; changes: FlowTableCellSpanChanges }
  | { type: "UPDATE_INLINE_TEXT_DRAFT"; nodeId: string; text: string }
  | { type: "COMMIT_INLINE_TEXT_EDIT"; nodeId: string; beforeDoc: DocumentNode; beforePaginated: PaginatedDocument; beforeText: string; afterPaginated: PaginatedDocument }
  | { type: "COMMIT_WYSIWYG_TEXT_EDIT"; nodeId: string; text: string; beforeText: string; history?: HistoryEntry; afterPaginated: PaginatedDocument }
  | { type: "COMMIT_WYSIWYG_RICH_TEXT_EDIT"; nodeId: string; paragraph: ParagraphNode; history?: HistoryEntry; afterPaginated: PaginatedDocument }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "DUPLICATE_NODE"; nodeId: string }
  | { type: "SET_PAGINATED"; paginated: PaginatedDocument }
  | { type: "SET_INLINE_EDIT_HEIGHT"; nodeId: string; pageIndex: number | null; height: number; reflow?: WysiwygTextReflowDecision }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TABLE_ADD_ROW"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_ROW"; tableId: string; rowIndex: number }
  | { type: "TABLE_ADD_COL"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_COL"; tableId: string; colIndex: number }
  | { type: "TABLE_FIT_TO_WIDTH"; tableId: string }
  | { type: "FLOW_ROW_ADD_COL"; rowId: string; stackId?: string; position?: "before" | "after" }
  | { type: "LOAD_DOCUMENT"; doc: DocumentNode; paginated?: PaginatedDocument }
  | { type: "RESIZE_COLUMNS"; leftStackId: string; leftShare: number; rightStackId: string; rightShare: number; paginated?: PaginatedDocument }
  | { type: "RESIZE_TABLE_COLUMN_PAIR"; tableId: string; leftColIndex: number; leftWidth: number; rightWidth: number; paginated?: PaginatedDocument }
  | { type: "RESIZE_ROW_MIN_HEIGHT"; rowId: string; minHeight: number }
  | { type: "UPDATE_MARGIN"; sectionIndex: number; margin: { top: number; right: number; bottom: number; left: number } }
  | { type: "UPDATE_RESERVED_ZONES"; sectionIndex: number; reserved: { headerReserved: number; footerReserved: number }; priority?: ReservedZonePriority }
  | { type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE"; sectionIndex: number; zone: "header" | "footer" }
  | { type: "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY"; sectionIndex: number; zone: "header" | "footer" }
  | { type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE"; sectionIndex: number; mode: "body" | "full" }
  | { type: "SPLIT_PARAGRAPH"; nodeId: string; splitIndex: number; text?: string; history?: HistoryEntry; newNodeId?: string; precomputed?: PrecomputedSplitParagraphResult; precomputedDocValidation?: PrecomputedDocValidation; paginated?: PaginatedDocument; isOptimistic?: boolean }
  | { type: "CLEAR_SPLIT_NODE_ID" }
  | { type: "MERGE_PARAGRAPH"; nodeId: string; text?: string; history?: HistoryEntry; precomputed?: PrecomputedMergeParagraphResult; precomputedDocValidation?: PrecomputedDocValidation; paginated?: PaginatedDocument; isOptimistic?: boolean }
  | { type: "CLEAR_MERGE_RESULT" }
  | { type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH"; nodeId: string; text?: string; history?: HistoryEntry; paginated?: PaginatedDocument }
  | { type: "EXIT_LIST_ITEM"; nodeId: string; text?: string; history?: HistoryEntry }
  | { type: "CLEAR_LIST_EXIT_NODE_ID" }
  | { type: "CHANGE_LIST_ITEM_LEVEL"; nodeId: string; direction: ListLevelChangeDirection; text?: string; caretIndex?: number | null; history?: HistoryEntry; refocus?: boolean }
  | { type: "CLEAR_LIST_LEVEL_CHANGE_RESULT" }
  | { type: "BACKSPACE_LIST_ITEM_AT_START"; nodeId: string; text?: string; caretIndex?: number | null; history?: HistoryEntry }
  | { type: "TOGGLE_LIST_PRESET"; nodeId: string; styleId: FlowDocListStylePresetId; instanceId: string; level?: number; text?: string; paragraph?: ParagraphNode; history?: HistoryEntry }
  | { type: "REORDER_BODY_CHILD"; sectionId: string; sourceNodeId: string; targetNodeId: string; position: "before" | "after" }

let storageLoadInvocationId = 0
let initialEditorStateInvocationId = 0

function loadFromStorage(): DocumentNode | null {
  const invocationId = ++storageLoadInvocationId
  const startedAt = startWysiwygPerfSpan()
  const result = loadDocumentFromStorageCachedByRawValue(localStorage)
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:storage-document-load", startedAt, {
    invocationId,
    ok: result.ok,
    source: result.ok ? result.source : result.reason,
  })
  return result.ok ? result.doc : null
}

export function createInitialEditorState(initialDocOverride?: DocumentNode | null): EditorState {
  const invocationId = ++initialEditorStateInvocationId
  const startedAt = startWysiwygPerfSpan()
  const sourceStartedAt = startWysiwygPerfSpan()
  const loadedDoc = initialDocOverride ?? loadFromStorage()
  const sourceDocInput = loadedDoc ?? createDefaultDocument("Untitled")
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:initial-document-source", sourceStartedAt, {
    invocationId,
    source: initialDocOverride ? "test-scenario" : loadedDoc ? "storage" : "default",
    documentId: sourceDocInput.document.id,
  })

  const reservedStartedAt = startWysiwygPerfSpan()
  const sourceDoc = normalizeDocument(ensureReservedZoneRoots(sourceDocInput))
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:document-normalize-reserved", reservedStartedAt, {
    invocationId,
    documentId: sourceDoc.document.id,
  })

  const styleStartedAt = startWysiwygPerfSpan()
  const initialDoc = normalizeDocument(ensureBaseParagraphStyle(sourceDoc))
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:document-normalize-base-style", styleStartedAt, {
    invocationId,
    documentId: initialDoc.document.id,
  })

  const placeholderStartedAt = startWysiwygPerfSpan()
  const paginated = createEditorPlaceholderPaginatedDocument(initialDoc)
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:placeholder-pagination-create", placeholderStartedAt, {
    invocationId,
    documentId: initialDoc.document.id,
  })
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:initial-editor-state-create", startedAt, {
    invocationId,
    documentId: initialDoc.document.id,
  })
  return {
    past: [],
    doc: initialDoc,
    future: [],
    paginated,
    drag: null,
    selectedNodeId: null,
    selectionAnchorNodeId: null,
    lastSplitNodeId: null,
    listExitNodeId: null,
    listLevelChangeResult: null,
    mergeResult: null,
  }
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "DRAG_START":
      return { ...state, drag: { source: action.source, clientX: action.clientX, clientY: action.clientY, preview: null } }
    case "DRAG_MOVE":
      if (!state.drag) return state
      return { ...state, drag: { ...state.drag, clientX: action.clientX, clientY: action.clientY, preview: action.preview } }
    case "DRAG_COMMIT": {
      return commitEditorOperationResult(state, createDragPlacementActionResult(state, action))
    }
    case "DRAG_CANCEL":
      return { ...state, drag: null }
    case "SELECT_NODE":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.anchorNodeId !== undefined ? action.anchorNodeId : action.nodeId,
      }
    case "UPDATE_PROPS": {
      return commitEditorOperationResult(state, createNodePropsActionResult(state, action))
    }
    case "UPDATE_TEXT":
      return commitEditorOperationResult(state, createTextCommitActionResult(state, action))
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "APPLY_PARAGRAPH_STYLE_PRESET":
    case "CLEAR_PARAGRAPH_STYLE":
    case "DETACH_PARAGRAPH_STYLE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
      return commitEditorOperationResult(state, createStylePatchActionResult(state, action))
    case "UPDATE_FIELD_REF":
      return commitEditorOperationResult(state, createFieldPatchActionResult(state, action))
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return commitEditorOperationResult(state, createStylePatchActionResult(state, action))
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
      return commitEditorOperationResult(state, createTableStructureActionResult(state, action))
    case "UPDATE_INLINE_TEXT_DRAFT":
      return commitEditorOperationResult(state, createInlineTextDraftResult(state, action))
    case "COMMIT_INLINE_TEXT_EDIT": {
      return commitEditorOperationResult(state, createTextCommitActionResult(state, action))
    }
    case "COMMIT_WYSIWYG_TEXT_EDIT": {
      return commitEditorOperationResult(state, createTextCommitActionResult(state, action))
    }
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT": {
      return commitEditorOperationResult(state, createTextCommitActionResult(state, action))
    }
    case "DELETE_NODE":
      return commitEditorOperationResult(state, createNodeDeleteActionResult(state, action))
    case "DUPLICATE_NODE":
      return commitEditorOperationResult(state, createNodeDuplicateActionResult(state, action))
    case "REORDER_BODY_CHILD":
      return commitEditorOperationResult(state, createNodeReorderActionResult(state, action))
    case "SET_PAGINATED":
      return { ...state, paginated: action.paginated }
    case "SET_INLINE_EDIT_HEIGHT": {
      const nextPaginated = resizeFragmentHeightAndShift(state.paginated, state.doc, action.nodeId, action.height, action.pageIndex)
      if (nextPaginated === state.paginated) return state
      return {
        ...state,
        paginated: nextPaginated,
      }
    }
    case "UNDO": {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return {
        ...state,
        past: state.past.slice(0, -1),
        doc: prev.doc,
        paginated: prev.paginated,
        future: [{ doc: state.doc, paginated: state.paginated }, ...state.future],
      }
    }
    case "REDO": {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        ...state,
        past: [...state.past, { doc: state.doc, paginated: state.paginated }],
        doc: next.doc,
        paginated: next.paginated,
        future: state.future.slice(1),
      }
    }
    case "LOAD_DOCUMENT": {
      const startedAt = startWysiwygPerfSpan()
      const normalizeStartedAt = startWysiwygPerfSpan()
      const normalizedDoc = normalizeDocument(ensureReservedZoneRoots(action.doc))
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:load-document-normalize", normalizeStartedAt, {
        documentId: normalizedDoc.document.id,
      })
      const placeholderStartedAt = startWysiwygPerfSpan()
      const paginated = action.paginated ?? createEditorPlaceholderPaginatedDocument(normalizedDoc)
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:load-document-placeholder", placeholderStartedAt, {
        providedPaginated: action.paginated != null,
        documentId: normalizedDoc.document.id,
      })
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:load-document-dispatch", startedAt, {
        commandType: "LOAD_DOCUMENT",
        documentId: normalizedDoc.document.id,
      })
      return { ...state, past: [], doc: normalizedDoc, future: [], paginated, selectedNodeId: null, selectionAnchorNodeId: null, drag: null }
    }
    case "TABLE_ADD_ROW":
    case "TABLE_REMOVE_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_COL":
    case "TABLE_FIT_TO_WIDTH":
      return commitEditorOperationResult(state, createTableStructureActionResult(state, action))
    case "FLOW_ROW_ADD_COL":
      return commitEditorOperationResult(state, createFlowRowAddColumnActionResult(state, action))
    case "RESIZE_COLUMNS":
      return commitEditorOperationResult(state, createFlowRowLayoutActionResult(state, action))
    case "RESIZE_TABLE_COLUMN_PAIR":
      return commitEditorOperationResult(state, createTableStructureActionResult(state, action))
    case "RESIZE_ROW_MIN_HEIGHT":
      return commitEditorOperationResult(state, createFlowRowLayoutActionResult(state, action))
    case "UPDATE_MARGIN":
    case "UPDATE_RESERVED_ZONES":
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
      return commitEditorOperationResult(state, createDocumentSettingsActionResult(state, action))
    case "SPLIT_PARAGRAPH":
      return commitEditorOperationResult(state, createParagraphSplitActionResult(state, action))
    case "CLEAR_SPLIT_NODE_ID":
      return { ...state, lastSplitNodeId: null }
    case "MERGE_PARAGRAPH":
      return commitEditorOperationResult(state, createParagraphMergeActionResult(state, action))
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return commitEditorOperationResult(state, createTableStructureActionResult(state, action))
    case "CLEAR_MERGE_RESULT":
      return { ...state, mergeResult: null }
    case "EXIT_LIST_ITEM":
      return commitEditorOperationResult(state, createListStructureActionResult(state, action))
    case "CLEAR_LIST_EXIT_NODE_ID":
      return { ...state, listExitNodeId: null }
    case "CHANGE_LIST_ITEM_LEVEL":
      return commitEditorOperationResult(state, createListStructureActionResult(state, action))
    case "CLEAR_LIST_LEVEL_CHANGE_RESULT":
      return { ...state, listLevelChangeResult: null }
    case "BACKSPACE_LIST_ITEM_AT_START":
    case "TOGGLE_LIST_PRESET":
      return commitEditorOperationResult(state, createListStructureActionResult(state, action))
  }
}

export function reduceEditorOperation(state: EditorState, operation: EditorOperationEnvelope): EditorState {
  if (operation.kind === "node.delete") {
    return commitEditorOperationResult(state, createNodeDeleteOperationResult(state, operation))
  }
  if (operation.kind === "node.duplicate") {
    return commitEditorOperationResult(state, createNodeDuplicateOperationResult(state, operation))
  }
  if (operation.kind === "node.reorder") {
    return commitEditorOperationResult(state, createNodeReorderOperationResult(state, operation))
  }
  if (operation.kind === "node.props.patch") {
    return commitEditorOperationResult(state, createNodePropsOperationResult(state, operation))
  }
  if (operation.kind === "field.patch") {
    return commitEditorOperationResult(state, createFieldPatchOperationResult(state, operation))
  }
  if (operation.kind === "style.patch") {
    return commitEditorOperationResult(state, createStylePatchOperationResult(state, operation))
  }
  if (operation.kind === "list.structure.patch") {
    return commitEditorOperationResult(state, createListStructureOperationResult(state, operation))
  }
  if (operation.kind === "drag.placement") {
    return commitEditorOperationResult(state, createDragPlacementOperationResult(state, operation))
  }
  if (operation.kind === "paragraph.split") {
    return commitEditorOperationResult(state, createParagraphSplitOperationResult(state, operation))
  }
  if (operation.kind === "paragraph.merge") {
    return commitEditorOperationResult(state, createParagraphMergeOperationResult(state, operation))
  }
  if (operation.kind === "flow-row.structure.patch") {
    return commitEditorOperationResult(state, createFlowRowAddColumnOperationResult(state, operation))
  }
  if (operation.kind === "flow-row.layout.patch") {
    return commitEditorOperationResult(state, createFlowRowLayoutOperationResult(state, operation))
  }
  if (operation.kind === "document.settings.patch") {
    return commitEditorOperationResult(state, createDocumentSettingsOperationResult(state, operation))
  }
  if (operation.kind === "table.structure.patch") {
    return commitEditorOperationResult(state, createTableStructureOperationResult(state, operation))
  }
  if (operation.kind === "text.draft") {
    return commitEditorOperationResult(state, createTextDraftOperationResult(state, operation))
  }
  if (operation.kind === "text.commit") {
    return commitEditorOperationResult(state, createTextCommitOperationResult(state, operation))
  }
  return reducer(state, operation.action)
}
