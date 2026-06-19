import {
  addFlowTableColumn,
  addFlowTableRow,
  fitFlowTableToSectionWidth,
  removeFlowTableColumn,
  removeFlowTableRow,
  resizeFlowTableColumnPair,
  updateFlowTableCellSpan,
} from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import {
  createOperationDocumentGraphDiagnostics,
  type EditorDocumentGraphTargetContext,
} from "./editorDocumentGraphDiagnostics"
import { createEditorGraphPlanningDecision } from "./editorGraphPlanningDecision"
import type { EditorOperationCommitDiagnostics, EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"
import { createDeleteEmptyTableCellParagraphPlan } from "./editorReducerTableCellParagraphPlan"

type TableAddRowAction = Extract<EditorAction, { type: "TABLE_ADD_ROW" }>
type TableRemoveRowAction = Extract<EditorAction, { type: "TABLE_REMOVE_ROW" }>
type TableAddColumnAction = Extract<EditorAction, { type: "TABLE_ADD_COL" }>
type TableRemoveColumnAction = Extract<EditorAction, { type: "TABLE_REMOVE_COL" }>
type TableFitToWidthAction = Extract<EditorAction, { type: "TABLE_FIT_TO_WIDTH" }>
type ResizeTableColumnPairAction = Extract<EditorAction, { type: "RESIZE_TABLE_COLUMN_PAIR" }>
type UpdateFlowTableCellSpanAction = Extract<EditorAction, { type: "UPDATE_FLOW_TABLE_CELL_SPAN" }>
type DeleteEmptyTableCellParagraphAction = Extract<EditorAction, { type: "DELETE_EMPTY_TABLE_CELL_PARAGRAPH" }>

type TableIdStructureAction =
  | TableAddRowAction
  | TableRemoveRowAction
  | TableAddColumnAction
  | TableRemoveColumnAction
  | TableFitToWidthAction
  | ResizeTableColumnPairAction

type TableStructureAction =
  | TableIdStructureAction
  | UpdateFlowTableCellSpanAction
  | DeleteEmptyTableCellParagraphAction
type TableGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>
type TableGraphPlanningContext = {
  targetNodeIds: string[]
  diagnostics: EditorOperationCommitDiagnostics
  graphDecision: TableGraphPlanningResult
  tableId?: string
}

function targetNodeIdsForTableStructureAction(action: TableStructureAction): string[] {
  if ("tableId" in action) return [action.tableId]
  if (action.type === "UPDATE_FLOW_TABLE_CELL_SPAN") return [action.cellId]
  return [action.nodeId]
}

function firstTableIdFromGraphContexts(contexts: readonly EditorDocumentGraphTargetContext[]): string | undefined {
  return contexts.find((context) => context.tableId != null)?.tableId
}

function tableValidationScope(tableId: string | undefined): { kind: "table"; tableId: string; fallback: "full-document" } | undefined {
  return tableId ? { kind: "table", tableId, fallback: "full-document" } : undefined
}

function createTableStructurePlanningContext(
  state: EditorState,
  action: TableStructureAction,
  operation: EditorOperationEnvelope | undefined,
  extra: Record<string, unknown> = {},
  options: {
    operationName: string
    allowedOperationSurfaces?: EditorDocumentGraphTargetContext["operationSurface"][]
    requireTableContext?: boolean
    currentValidationPolicy: "full" | "scoped"
    documentV2ValidationPolicy?: "full" | "scoped"
    tableId?: string
  },
): TableGraphPlanningContext {
  const targetNodeIds = operation?.scope.nodeIds ?? targetNodeIdsForTableStructureAction(action)
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, targetNodeIds)
  const graphDecision = createEditorGraphPlanningDecision({
    graphDiagnostics,
    operationName: options.operationName,
    allowedOperationSurfaces: options.allowedOperationSurfaces,
    requireTableContext: options.requireTableContext,
    currentValidationPolicy: options.currentValidationPolicy,
    documentV2ValidationPolicy: options.documentV2ValidationPolicy ?? options.currentValidationPolicy,
  })
  const tableId = options.tableId ?? firstTableIdFromGraphContexts(graphDiagnostics.graphTargetContexts)
  return {
    targetNodeIds,
    tableId,
    graphDecision,
    diagnostics: {
      operationKind: "table.structure.patch",
      reducerPath: action.type,
      ...extra,
      targetNodeIds,
      ...graphDiagnostics,
      ...graphDecision.diagnostics,
    },
  }
}

function createTableGraphFailureResult(
  context: TableGraphPlanningContext,
  graphDecision: Extract<TableGraphPlanningResult, { kind: "failure" }>,
): EditorOperationCommitResult {
  return {
    status: "failure",
    failure: { reason: graphDecision.reason },
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "document graph unresolved" },
    diagnostics: context.diagnostics,
  }
}

function createTableGraphNoopResult(
  context: TableGraphPlanningContext,
  graphDecision: Extract<TableGraphPlanningResult, { kind: "noop" }>,
): EditorOperationCommitResult {
  return {
    status: "noop",
    noopReason: graphDecision.noopReason,
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "document graph disallowed mutation" },
    diagnostics: context.diagnostics,
  }
}

function tableGraphPreflightResult(context: TableGraphPlanningContext): EditorOperationCommitResult | null {
  if (context.graphDecision.kind === "failure") return createTableGraphFailureResult(context, context.graphDecision)
  if (context.graphDecision.kind === "noop") return createTableGraphNoopResult(context, context.graphDecision)
  return null
}

function allowedTableGraphDecision(context: TableGraphPlanningContext): Extract<TableGraphPlanningResult, { kind: "allow" }> {
  if (context.graphDecision.kind !== "allow") {
    throw new Error("expected allowed table graph decision after preflight")
  }
  return context.graphDecision
}

function applyTableIdStructureAction(doc: DocumentNode, action: TableIdStructureAction): DocumentNode {
  switch (action.type) {
    case "TABLE_ADD_ROW":
      return addFlowTableRow(doc, action.tableId, action.afterIndex)
    case "TABLE_REMOVE_ROW":
      return removeFlowTableRow(doc, action.tableId, action.rowIndex)
    case "TABLE_ADD_COL":
      return addFlowTableColumn(doc, action.tableId, action.afterIndex)
    case "TABLE_REMOVE_COL":
      return removeFlowTableColumn(doc, action.tableId, action.colIndex)
    case "TABLE_FIT_TO_WIDTH":
      return fitFlowTableToSectionWidth(doc, action.tableId)
    case "RESIZE_TABLE_COLUMN_PAIR":
      return resizeFlowTableColumnPair(
        doc,
        action.tableId,
        action.leftColIndex,
        action.leftWidth,
        action.rightWidth,
      )
  }
}

function createTableIdStructureCommitResult(
  state: EditorState,
  action: TableIdStructureAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const context = createTableStructurePlanningContext(state, action, operation, { tableId: action.tableId }, {
    operationName: action.type === "RESIZE_TABLE_COLUMN_PAIR" ? "table-column-resize" : "table-structure",
    allowedOperationSurfaces: ["table"],
    currentValidationPolicy: "scoped",
    tableId: action.tableId,
  })
  const preflightResult = tableGraphPreflightResult(context)
  if (preflightResult != null) return preflightResult
  const graphDecision = allowedTableGraphDecision(context)

  const nextDoc = applyTableIdStructureAction(state.doc, action)
  const noopReason = action.type === "RESIZE_TABLE_COLUMN_PAIR"
    ? "table-column-resize-noop"
    : "table-structure-noop"

  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason,
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: context.diagnostics,
    }
  }

  return {
    status: "success",
    nextDoc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: { kind: "table", tableId: action.tableId, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    paginatedPatch: action.type === "RESIZE_TABLE_COLUMN_PAIR" && action.paginated != null
      ? { paginated: action.paginated }
      : undefined,
    diagnostics: {
      ...context.diagnostics,
      validationPolicy: graphDecision.validationPolicy,
    },
  }
}

function createUpdateFlowTableCellSpanCommitResult(
  state: EditorState,
  action: UpdateFlowTableCellSpanAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const context = createTableStructurePlanningContext(state, action, operation, { cellId: action.cellId }, {
    operationName: "table-cell-span",
    allowedOperationSurfaces: ["table"],
    currentValidationPolicy: "full",
    documentV2ValidationPolicy: "scoped",
  })
  const preflightResult = tableGraphPreflightResult(context)
  if (preflightResult != null) return preflightResult
  const graphDecision = allowedTableGraphDecision(context)

  const nextDoc = updateFlowTableCellSpan(state.doc, action.cellId, action.changes)

  if (nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "table-cell-span-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: context.diagnostics,
    }
  }

  return {
    status: "success",
    nextDoc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: graphDecision.validationPolicy === "scoped"
      ? tableValidationScope(context.tableId)
      : undefined,
    historyPolicy: { kind: "push" },
    diagnostics: {
      ...context.diagnostics,
      validationPolicy: graphDecision.validationPolicy,
    },
  }
}

function createDeleteEmptyTableCellParagraphCommitResult(
  state: EditorState,
  action: DeleteEmptyTableCellParagraphAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const context = createTableStructurePlanningContext(state, action, operation, { nodeId: action.nodeId }, {
    operationName: "delete-empty-table-cell-paragraph",
    requireTableContext: true,
    currentValidationPolicy: "full",
    documentV2ValidationPolicy: "scoped",
  })
  const preflightResult = tableGraphPreflightResult(context)
  if (preflightResult != null) return preflightResult
  const graphDecision = allowedTableGraphDecision(context)

  const plan = createDeleteEmptyTableCellParagraphPlan({
    doc: state.doc,
    nodeId: action.nodeId,
    text: action.text,
  })

  if (plan.status === "noop") {
    return {
      status: "noop",
      noopReason: "delete-empty-table-cell-paragraph-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics: context.diagnostics,
    }
  }

  return {
    status: "success",
    nextDoc: plan.nextDoc,
    validationPolicy: graphDecision.validationPolicy,
    validationScope: graphDecision.validationPolicy === "scoped"
      ? tableValidationScope(context.tableId)
      : undefined,
    historyPolicy: { kind: "push", entry: action.history },
    paginatedPatch: action.paginated != null ? { paginated: action.paginated } : undefined,
    selectionPatch: plan.selectionPatch,
    diagnostics: {
      ...context.diagnostics,
      validationPolicy: graphDecision.validationPolicy,
    },
  }
}

export function createTableStructureActionResult(
  state: EditorState,
  action: TableStructureAction,
): EditorOperationCommitResult {
  if ("tableId" in action) return createTableIdStructureCommitResult(state, action)
  if (action.type === "UPDATE_FLOW_TABLE_CELL_SPAN") {
    return createUpdateFlowTableCellSpanCommitResult(state, action)
  }
  return createDeleteEmptyTableCellParagraphCommitResult(state, action)
}

export function createTableStructureOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "table.structure.patch") {
    return {
      status: "failure",
      failure: { reason: "invalid-table-structure-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "TABLE_STRUCTURE",
      },
    }
  }

  switch (operation.action.type) {
    case "TABLE_ADD_ROW":
    case "TABLE_REMOVE_ROW":
    case "TABLE_ADD_COL":
    case "TABLE_REMOVE_COL":
    case "TABLE_FIT_TO_WIDTH":
    case "RESIZE_TABLE_COLUMN_PAIR":
      return createTableIdStructureCommitResult(state, operation.action, operation)
    case "UPDATE_FLOW_TABLE_CELL_SPAN":
      return createUpdateFlowTableCellSpanCommitResult(state, operation.action, operation)
    case "DELETE_EMPTY_TABLE_CELL_PARAGRAPH":
      return createDeleteEmptyTableCellParagraphCommitResult(state, operation.action, operation)
    default:
      return {
        status: "failure",
        failure: { reason: "invalid-table-structure-action" },
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "invalid operation" },
        diagnostics: {
          operationKind: operation.kind,
          reducerPath: "TABLE_STRUCTURE",
        },
      }
  }
}
