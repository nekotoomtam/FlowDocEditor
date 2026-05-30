import type { PaginatedDocument } from "@/pagination"
import {
  addFlowStackColumn,
  addFlowTableColumn,
  addFlowTableRow,
  applyParagraphStylePreset,
  applyParagraphTextStyle,
  applyTextRunStyleRange,
  applyPlacementOperation,
  backspaceListItemAtStart,
  assertDocument,
  clearParagraphStyleId,
  createDefaultDocument,
  deleteNode,
  detachParagraphStyle,
  duplicateNode,
  ensureBaseParagraphStyle,
  disableSectionReservedZoneIfEmpty,
  ensureReservedZoneRoots,
  ensureSectionReservedZoneVisibleForAuthoring,
  exitListItem,
  fitFlowTableToSectionWidth,
  getParagraphStylePreset,
  indentListItem,
  mergeListItemWithPrevious,
  mergeParagraphWithPrevious,
  normalizeDocument,
  outdentListItem,
  patchParagraphStyleDefinition,
  patchParagraphStyleOverrideBox,
  patchParagraphStyleOverrides,
  removeFlowTableColumn,
  removeFlowTableRow,
  renameParagraphStyleDefinition,
  reorderBodyChild,
  resetParagraphStyleOverrides,
  resizeFlowTableColumnPair,
  splitListItemAtIndex,
  splitParagraphAtIndex,
  toggleParagraphListPreset,
  updateFieldRefInline,
  updateFlowStackBoxStyle,
  updateFlowTableCellSpan,
  updateNodeProps,
  updateParagraphBoxStyle,
  updateSectionHeaderFooterHorizontalMode,
  updateSectionMargin,
  updateSectionReservedZones,
} from "@/document"
import type { FieldRefInlineChanges, FlowDocListStylePresetId, FlowDocParagraphStylePresetId, FlowTableCellSpanChanges, ParagraphBoxStyleChanges, ParagraphStyleDefinitionPatch, ParagraphTextStyleChanges } from "@/document"
import type { ReservedZonePriority } from "@/document"
import type { DocumentNode, LayoutNode, ParagraphNode, ParagraphStyleProperties } from "@/schema"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import type { DragSource, PlacementOperation, PlacementPreview } from "@/placement/types"
import { loadDocumentFromStorage } from "./documentPersistence"
import { createEditorPlaceholderPaginatedDocument } from "./editorInitialPagination"
import { resizeFragmentHeightAndShift } from "./inlineEditHeightPreview"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { finishFlowDocPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"
import {
  commitWysiwygRichTextEditState,
  commitWysiwygTextEditState,
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
  replaceEditableParagraphInDocument,
  replaceEditableParagraphTextInDocument,
} from "./wysiwygTextCommit"

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
  | { type: "SPLIT_PARAGRAPH"; nodeId: string; splitIndex: number; text?: string; history?: HistoryEntry }
  | { type: "CLEAR_SPLIT_NODE_ID" }
  | { type: "MERGE_PARAGRAPH"; nodeId: string; text?: string; history?: HistoryEntry }
  | { type: "CLEAR_MERGE_RESULT" }
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
  const result = loadDocumentFromStorage(localStorage)
  finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:storage-document-load", startedAt, {
    invocationId,
    ok: result.ok,
    source: result.ok ? result.source : result.reason,
  })
  return result.ok ? result.doc : null
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

function shouldDeleteEmptyUnlistedParagraph(doc: DocumentNode, nodeId: string): boolean {
  const paragraph = getEditableParagraphFromDocument(doc, nodeId)
  if (!paragraph || paragraph.props.list) return false
  const text = getEditableParagraphTextFromDocument(doc, nodeId)
  return text != null && text.trim().length === 0
}

function getLayoutChildIds(node: LayoutNode): string[] | null {
  if (!("childIds" in node)) return null
  return Array.isArray(node.childIds) ? node.childIds : null
}

function isDirectBodyParagraph(doc: DocumentNode, nodeId: string): boolean {
  for (const section of doc.document.sections) {
    const body = section.nodes[section.bodyRootId]
    if (body?.type !== "body" || !body.childIds.includes(nodeId)) continue
    return section.nodes[nodeId]?.type === "paragraph"
  }
  return false
}

function hasHeadingLevelChange(changes: Record<string, unknown> | ParagraphStyleProperties): boolean {
  return Object.prototype.hasOwnProperty.call(changes, "headingLevel")
}

function omitHeadingLevelChange<T extends Record<string, unknown> | ParagraphStyleProperties>(changes: T): T {
  const { headingLevel: _headingLevel, ...rest } = changes
  return rest as T
}

function findPreviousEditableParagraphSibling(
  doc: DocumentNode,
  nodeId: string,
): { prevNodeId: string; caretIndex: number } | null {
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      const childIds = getLayoutChildIds(node)
      const index = childIds?.indexOf(nodeId) ?? -1
      if (index <= 0 || !childIds) continue

      const prevNodeId = childIds[index - 1]
      if (!prevNodeId) return null
      const prevNode = section.nodes[prevNodeId]
      if (prevNode?.type !== "paragraph") return null
      const prevText = getEditableParagraphTextFromDocument(doc, prevNodeId)
      return prevText == null ? null : { prevNodeId, caretIndex: prevText.length }
    }
  }
  return null
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
    case "UPDATE_PROPS": {
      const changes = hasHeadingLevelChange(action.changes) && !isDirectBodyParagraph(state.doc, action.nodeId)
        ? omitHeadingLevelChange(action.changes)
        : action.changes
      return Object.keys(changes).length === 0 ? state : pushDoc(state, updateNodeProps(state.doc, action.nodeId, changes))
    }
    case "UPDATE_TEXT":
      return pushDoc(state, replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text))
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
      return pushDoc(state, applyParagraphTextStyle(state.doc, action.nodeId, action.changes))
    case "APPLY_PARAGRAPH_STYLE_PRESET": {
      const style = getParagraphStylePreset(action.styleId)
      if (style.props.headingLevel != null && !isDirectBodyParagraph(state.doc, action.nodeId)) return state
      const nextDoc = applyParagraphStylePreset(state.doc, action.nodeId, action.styleId)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "CLEAR_PARAGRAPH_STYLE": {
      const nextDoc = clearParagraphStyleId(state.doc, action.nodeId)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "DETACH_PARAGRAPH_STYLE": {
      const nextDoc = detachParagraphStyle(state.doc, action.nodeId)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES": {
      const changes = hasHeadingLevelChange(action.changes) && !isDirectBodyParagraph(state.doc, action.nodeId)
        ? omitHeadingLevelChange(action.changes)
        : action.changes
      if (Object.keys(changes).length === 0) return state
      const nextDoc = patchParagraphStyleOverrides(state.doc, action.nodeId, changes)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX": {
      const nextDoc = patchParagraphStyleOverrideBox(state.doc, action.nodeId, action.changes)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "PATCH_PARAGRAPH_STYLE_DEFINITION": {
      const nextDoc = patchParagraphStyleDefinition(state.doc, action.styleId, action.patch)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "RENAME_PARAGRAPH_STYLE_DEFINITION": {
      const nextDoc = renameParagraphStyleDefinition(state.doc, action.styleId, action.name)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "RESET_PARAGRAPH_STYLE_OVERRIDES": {
      const nextDoc = resetParagraphStyleOverrides(state.doc, action.nodeId)
      if (nextDoc === state.doc) return state
      return {
        ...pushDoc(state, nextDoc),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
    case "UPDATE_TEXT_RUN_STYLE_RANGE": {
      const nextDoc = applyTextRunStyleRange(state.doc, action.nodeId, action.start, action.end, action.changes)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
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
      return setDocWithoutHistory(state, replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text))
    case "COMMIT_INLINE_TEXT_EDIT": {
      const currentText = getEditableParagraphTextFromDocument(state.doc, action.nodeId)
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
    case "COMMIT_WYSIWYG_RICH_TEXT_EDIT": {
      return commitWysiwygRichTextEditState(state, action, MAX_HISTORY)
    }
    case "DELETE_NODE":
      {
        const nextDoc = deleteNode(state.doc, action.nodeId)
        if (nextDoc === state.doc) return state
        return { ...pushDoc(state, nextDoc), selectedNodeId: null, selectionAnchorNodeId: null }
      }
    case "DUPLICATE_NODE": {
      const result = duplicateNode(state.doc, action.nodeId)
      if (result.doc === state.doc || !result.duplicatedNodeId) return state
      return {
        ...pushDoc(state, result.doc),
        selectedNodeId: result.duplicatedNodeId,
        selectionAnchorNodeId: result.duplicatedNodeId,
      }
    }
    case "REORDER_BODY_CHILD": {
      const nextDoc = reorderBodyChild(state.doc, action.sectionId, action.sourceNodeId, action.targetNodeId, action.position)
      if (nextDoc === state.doc) return state
      return { ...pushDoc(state, nextDoc), selectedNodeId: action.sourceNodeId, selectionAnchorNodeId: action.sourceNodeId }
    }
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
    case "TABLE_FIT_TO_WIDTH":
      return updateTableStructure(
        state,
        action.tableId,
        (doc, tableId) => fitFlowTableToSectionWidth(doc, tableId),
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
    case "UPDATE_RESERVED_ZONES": {
      const nextDoc = updateSectionReservedZones(state.doc, action.sectionIndex, action.reserved, action.priority)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE": {
      const nextDoc = ensureSectionReservedZoneVisibleForAuthoring(state.doc, action.sectionIndex, action.zone)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY": {
      const nextDoc = disableSectionReservedZoneIfEmpty(state.doc, action.sectionIndex, action.zone)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE": {
      const nextDoc = updateSectionHeaderFooterHorizontalMode(state.doc, action.sectionIndex, action.mode)
      return nextDoc === state.doc ? state : pushDoc(state, nextDoc)
    }
    case "SPLIT_PARAGRAPH": {
      const sourceDoc = action.text === undefined
        ? state.doc
        : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
      const listResult = splitListItemAtIndex(sourceDoc, action.nodeId, action.splitIndex)
      const result = listResult.newNodeId ? listResult : splitParagraphAtIndex(sourceDoc, action.nodeId, action.splitIndex)
      if (!result.newNodeId) return state
      return { ...pushDoc(state, result.doc, action.history), lastSplitNodeId: result.newNodeId }
    }
    case "CLEAR_SPLIT_NODE_ID":
      return { ...state, lastSplitNodeId: null }
    case "MERGE_PARAGRAPH": {
      const sourceDoc = action.text === undefined
        ? state.doc
        : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)

      if (shouldDeleteEmptyUnlistedParagraph(sourceDoc, action.nodeId)) {
        const previousSibling = findPreviousEditableParagraphSibling(sourceDoc, action.nodeId)
        const nextDoc = deleteNode(sourceDoc, action.nodeId)
        if (nextDoc !== state.doc) {
          return {
            ...pushDoc(state, nextDoc, action.history),
            selectedNodeId: previousSibling?.prevNodeId ?? null,
            selectionAnchorNodeId: previousSibling?.prevNodeId ?? null,
            mergeResult: previousSibling,
          }
        }
      }

      const result = mergeListItemWithPrevious(sourceDoc, action.nodeId) ?? mergeParagraphWithPrevious(sourceDoc, action.nodeId)
      if (!result) return state
      return {
        ...pushDoc(state, result.doc, action.history),
        mergeResult: { prevNodeId: result.prevNodeId, caretIndex: result.caretIndex },
      }
    }
    case "CLEAR_MERGE_RESULT":
      return { ...state, mergeResult: null }
    case "EXIT_LIST_ITEM": {
      const sourceDoc = action.text === undefined
        ? state.doc
        : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
      const nextDoc = exitListItem(sourceDoc, action.nodeId)
      if (nextDoc === state.doc) return state
      return { ...pushDoc(state, nextDoc, action.history), listExitNodeId: action.nodeId }
    }
    case "CLEAR_LIST_EXIT_NODE_ID":
      return { ...state, listExitNodeId: null }
    case "CHANGE_LIST_ITEM_LEVEL": {
      const sourceDoc = action.text === undefined
        ? state.doc
        : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
      const nextDoc = action.direction === "indent"
        ? indentListItem(sourceDoc, action.nodeId)
        : outdentListItem(sourceDoc, action.nodeId)
      if (nextDoc === sourceDoc) return state
      return {
        ...pushDoc(state, nextDoc, action.history),
        listLevelChangeResult: action.refocus === false ? null : {
          nodeId: action.nodeId,
          caretIndex: action.caretIndex ?? null,
        },
      }
    }
    case "CLEAR_LIST_LEVEL_CHANGE_RESULT":
      return { ...state, listLevelChangeResult: null }
    case "BACKSPACE_LIST_ITEM_AT_START": {
      const sourceDoc = action.text === undefined
        ? state.doc
        : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
      const nextDoc = backspaceListItemAtStart(sourceDoc, action.nodeId)
      if (nextDoc === sourceDoc) return state
      return {
        ...pushDoc(state, nextDoc, action.history),
        listLevelChangeResult: {
          nodeId: action.nodeId,
          caretIndex: action.caretIndex ?? null,
        },
      }
    }
    case "TOGGLE_LIST_PRESET": {
      const sourceDoc = action.paragraph
        ? replaceEditableParagraphInDocument(state.doc, action.nodeId, action.paragraph)
        : action.text === undefined
          ? state.doc
          : replaceEditableParagraphTextInDocument(state.doc, action.nodeId, action.text)
      const nextDoc = toggleParagraphListPreset(sourceDoc, action.nodeId, {
        styleId: action.styleId,
        instanceId: action.instanceId,
        level: action.level,
      })
      if (nextDoc === sourceDoc) return state
      return {
        ...pushDoc(state, nextDoc, action.history),
        selectedNodeId: action.nodeId,
        selectionAnchorNodeId: action.nodeId,
      }
    }
  }
}
