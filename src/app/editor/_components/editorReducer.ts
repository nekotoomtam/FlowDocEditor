import { defaultTextMeasurer } from "@/layout"
import { paginateDocument, type PaginatedDocument } from "@/pagination"
import {
  addFlowStackColumn,
  addFlowTableColumn,
  addFlowTableRow,
  applyPlacementOperation,
  assertDocument,
  createDefaultDocument,
  deleteNode,
  mergeParagraphWithPrevious,
  normalizeDocument,
  removeFlowTableColumn,
  removeFlowTableRow,
  reorderBodyChild,
  resizeFlowTableColumnPair,
  splitParagraphAtIndex,
  updateFieldRefInline,
  updateFlowStackBoxStyle,
  updateFlowTableCellSpan,
  updateNodeProps,
  updateParagraphBoxStyle,
  updateParagraphText,
  updateSectionMargin,
} from "@/document"
import type { FieldRefInlineChanges, FlowTableCellSpanChanges, ParagraphBoxStyleChanges } from "@/document"
import type { DocumentNode } from "@/schema"
import type { DragSource, PlacementOperation, PlacementPreview } from "@/placement/types"
import { loadDocumentFromStorage } from "./documentPersistence"
import { resizeFragmentHeightAndShift } from "./inlineEditHeightPreview"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { commitWysiwygTextEditState, getPlainParagraphTextFromDocument } from "./wysiwygTextCommit"

export interface DragState {
  source: DragSource
  clientX: number
  clientY: number
  preview: PlacementPreview | null
}

interface HistoryEntry {
  doc: DocumentNode
  paginated: PaginatedDocument
}

interface EditorState {
  past: HistoryEntry[]
  doc: DocumentNode
  future: HistoryEntry[]
  paginated: PaginatedDocument
  drag: DragState | null
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  lastSplitNodeId: string | null
  mergeResult: { prevNodeId: string; caretIndex: number } | null
}

type EditorAction =
  | { type: "DRAG_START"; source: DragSource; clientX: number; clientY: number }
  | { type: "DRAG_MOVE"; clientX: number; clientY: number; preview: PlacementPreview | null }
  | { type: "DRAG_COMMIT"; op: PlacementOperation; sectionId: string }
  | { type: "DRAG_CANCEL" }
  | { type: "SELECT_NODE"; nodeId: string | null; anchorNodeId?: string | null }
  | { type: "UPDATE_PROPS"; nodeId: string; changes: Record<string, unknown> }
  | { type: "UPDATE_TEXT"; nodeId: string; text: string }
  | { type: "UPDATE_FIELD_REF"; fieldRefId: string; changes: FieldRefInlineChanges }
  | { type: "UPDATE_PARAGRAPH_BOX_STYLE"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "UPDATE_FLOW_STACK_BOX_STYLE"; nodeId: string; changes: ParagraphBoxStyleChanges }
  | { type: "UPDATE_FLOW_TABLE_CELL_SPAN"; cellId: string; changes: FlowTableCellSpanChanges }
  | { type: "UPDATE_INLINE_TEXT_DRAFT"; nodeId: string; text: string }
  | { type: "COMMIT_INLINE_TEXT_EDIT"; nodeId: string; beforeDoc: DocumentNode; beforePaginated: PaginatedDocument; beforeText: string; afterPaginated: PaginatedDocument }
  | { type: "COMMIT_WYSIWYG_TEXT_EDIT"; nodeId: string; text: string; beforeText: string; history?: HistoryEntry; afterPaginated: PaginatedDocument }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "SET_PAGINATED"; paginated: PaginatedDocument }
  | { type: "SET_INLINE_EDIT_HEIGHT"; nodeId: string; pageIndex: number | null; height: number; reflow?: WysiwygTextReflowDecision }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TABLE_ADD_ROW"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_ROW"; tableId: string; rowIndex: number }
  | { type: "TABLE_ADD_COL"; tableId: string; afterIndex?: number }
  | { type: "TABLE_REMOVE_COL"; tableId: string; colIndex: number }
  | { type: "FLOW_ROW_ADD_COL"; rowId: string; stackId?: string; position?: "before" | "after" }
  | { type: "LOAD_DOCUMENT"; doc: DocumentNode; paginated?: PaginatedDocument }
  | { type: "RESIZE_COLUMNS"; leftStackId: string; leftShare: number; rightStackId: string; rightShare: number; paginated?: PaginatedDocument }
  | { type: "RESIZE_TABLE_COLUMN_PAIR"; tableId: string; leftColIndex: number; leftWidth: number; rightWidth: number; paginated?: PaginatedDocument }
  | { type: "RESIZE_ROW_MIN_HEIGHT"; rowId: string; minHeight: number }
  | { type: "UPDATE_MARGIN"; sectionIndex: number; margin: { top: number; right: number; bottom: number; left: number } }
  | { type: "SPLIT_PARAGRAPH"; nodeId: string; splitIndex: number; history?: HistoryEntry }
  | { type: "CLEAR_SPLIT_NODE_ID" }
  | { type: "MERGE_PARAGRAPH"; nodeId: string; history?: HistoryEntry }
  | { type: "CLEAR_MERGE_RESULT" }
  | { type: "REORDER_BODY_CHILD"; sectionId: string; sourceNodeId: string; targetNodeId: string; position: "before" | "after" }

function loadFromStorage(): DocumentNode | null {
  const result = loadDocumentFromStorage(localStorage)
  return result.ok ? result.doc : null
}

function paginate(doc: DocumentNode): PaginatedDocument {
  return paginateDocument(doc, defaultTextMeasurer)
}

export function resizeColumnsDocument(
  doc: DocumentNode,
  leftStackId: string,
  leftShare: number,
  rightStackId: string,
  rightShare: number,
): DocumentNode {
  let nextDoc = updateNodeProps(doc, leftStackId, { widthShare: leftShare })
  nextDoc = updateNodeProps(nextDoc, rightStackId, { widthShare: rightShare })
  return nextDoc
}

const MAX_HISTORY = 50

function pushDoc(state: EditorState, newDoc: DocumentNode, history?: HistoryEntry): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), history ?? { doc: state.doc, paginated: state.paginated }],
    doc: normalizedDoc,
    future: [],
  }
}

function setDocWithoutHistory(state: EditorState, newDoc: DocumentNode): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return { ...state, doc: normalizedDoc }
}

function updateTableStructure(
  state: EditorState,
  tableId: string,
  operation: (doc: DocumentNode, tableId: string) => DocumentNode,
): EditorState {
  const nextDoc = operation(state.doc, tableId)
  return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
}

export function createInitialEditorState(initialDocOverride?: DocumentNode | null): EditorState {
  const initialDoc = normalizeDocument(initialDocOverride ?? loadFromStorage() ?? createDefaultDocument("Untitled"))
  return {
    past: [],
    doc: initialDoc,
    future: [],
    paginated: paginate(initialDoc),
    drag: null,
    selectedNodeId: null,
    selectionAnchorNodeId: null,
    lastSplitNodeId: null,
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
      if (!state.drag) return state
      const newDoc = applyPlacementOperation(state.doc, action.sectionId, action.op, state.drag.source)
      return pushDoc({ ...state, drag: null }, newDoc)
    }
    case "DRAG_CANCEL":
      return { ...state, drag: null }
    case "SELECT_NODE":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.anchorNodeId !== undefined ? action.anchorNodeId : action.nodeId,
      }
    case "UPDATE_PROPS":
      return pushDoc(state, updateNodeProps(state.doc, action.nodeId, action.changes))
    case "UPDATE_TEXT":
      return pushDoc(state, updateParagraphText(state.doc, action.nodeId, action.text))
    case "UPDATE_FIELD_REF":
      return pushDoc(state, updateFieldRefInline(state.doc, action.fieldRefId, action.changes))
    case "UPDATE_PARAGRAPH_BOX_STYLE":
      return pushDoc(state, updateParagraphBoxStyle(state.doc, action.nodeId, action.changes))
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return pushDoc(state, updateFlowStackBoxStyle(state.doc, action.nodeId, action.changes))
    case "UPDATE_FLOW_TABLE_CELL_SPAN": {
      const nextDoc = updateFlowTableCellSpan(state.doc, action.cellId, action.changes)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "UPDATE_INLINE_TEXT_DRAFT":
      return setDocWithoutHistory(state, updateParagraphText(state.doc, action.nodeId, action.text))
    case "COMMIT_INLINE_TEXT_EDIT": {
      const currentText = getPlainParagraphTextFromDocument(state.doc, action.nodeId)
      if (currentText == null || currentText === action.beforeText) return {
        ...state,
        paginated: action.afterPaginated,
      }
      return {
        ...state,
        paginated: action.afterPaginated,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), { doc: action.beforeDoc, paginated: action.beforePaginated }],
        future: [],
      }
    }
    case "COMMIT_WYSIWYG_TEXT_EDIT": {
      return commitWysiwygTextEditState(state, action, MAX_HISTORY)
    }
    case "DELETE_NODE":
      return { ...pushDoc(state, deleteNode(state.doc, action.nodeId)), selectedNodeId: null, selectionAnchorNodeId: null }
    case "REORDER_BODY_CHILD": {
      const nextDoc = reorderBodyChild(state.doc, action.sectionId, action.sourceNodeId, action.targetNodeId, action.position)
      if (nextDoc === state.doc) return state
      return { ...pushDoc(state, nextDoc), selectedNodeId: action.sourceNodeId, selectionAnchorNodeId: action.sourceNodeId }
    }
    case "SET_PAGINATED":
      return { ...state, paginated: action.paginated }
    case "SET_INLINE_EDIT_HEIGHT":
      return {
        ...state,
        paginated: resizeFragmentHeightAndShift(state.paginated, state.doc, action.nodeId, action.height, action.pageIndex),
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
      const normalizedDoc = normalizeDocument(action.doc)
      return { ...state, past: [], doc: normalizedDoc, future: [], paginated: action.paginated ?? paginate(normalizedDoc), selectedNodeId: null, selectionAnchorNodeId: null, drag: null }
    }
    case "TABLE_ADD_ROW":
      return updateTableStructure(
        state,
        action.tableId,
        (doc, tableId) => addFlowTableRow(doc, tableId, action.afterIndex),
      )
    case "TABLE_REMOVE_ROW":
      return updateTableStructure(
        state,
        action.tableId,
        (doc, tableId) => removeFlowTableRow(doc, tableId, action.rowIndex),
      )
    case "TABLE_ADD_COL":
      return updateTableStructure(
        state,
        action.tableId,
        (doc, tableId) => addFlowTableColumn(doc, tableId, action.afterIndex),
      )
    case "TABLE_REMOVE_COL":
      return updateTableStructure(
        state,
        action.tableId,
        (doc, tableId) => removeFlowTableColumn(doc, tableId, action.colIndex),
      )
    case "FLOW_ROW_ADD_COL":
      return pushDoc(state, addFlowStackColumn(state.doc, action.rowId, action.stackId, action.position))
    case "RESIZE_COLUMNS": {
      const doc = resizeColumnsDocument(state.doc, action.leftStackId, action.leftShare, action.rightStackId, action.rightShare)
      const nextState = pushDoc(state, doc)
      return action.paginated != null && nextState.doc !== state.doc
        ? { ...nextState, paginated: action.paginated }
        : nextState
    }
    case "RESIZE_TABLE_COLUMN_PAIR": {
      const doc = resizeFlowTableColumnPair(state.doc, action.tableId, action.leftColIndex, action.leftWidth, action.rightWidth)
      if (doc === state.doc) return state
      const nextState = pushDoc(state, doc)
      return action.paginated != null && nextState.doc !== state.doc
        ? { ...nextState, paginated: action.paginated }
        : nextState
    }
    case "RESIZE_ROW_MIN_HEIGHT":
      return pushDoc(state, updateNodeProps(state.doc, action.rowId, { minHeight: action.minHeight }))
    case "UPDATE_MARGIN":
      return pushDoc(state, updateSectionMargin(state.doc, action.sectionIndex, action.margin))
    case "SPLIT_PARAGRAPH": {
      const result = splitParagraphAtIndex(state.doc, action.nodeId, action.splitIndex)
      if (!result.newNodeId) return state
      return { ...pushDoc(state, result.doc, action.history), lastSplitNodeId: result.newNodeId }
    }
    case "CLEAR_SPLIT_NODE_ID":
      return { ...state, lastSplitNodeId: null }
    case "MERGE_PARAGRAPH": {
      const result = mergeParagraphWithPrevious(state.doc, action.nodeId)
      if (!result) return state
      return {
        ...pushDoc(state, result.doc, action.history),
        mergeResult: { prevNodeId: result.prevNodeId, caretIndex: result.caretIndex },
      }
    }
    case "CLEAR_MERGE_RESULT":
      return { ...state, mergeResult: null }
  }
}
