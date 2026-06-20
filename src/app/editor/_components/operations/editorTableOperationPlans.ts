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
import type { EditorOperationEnvelope, EditorOperationPayload, EditorOperationStructuralRuntimeContext } from "./editorOperationTypes"
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
type TableStructurePayload = Extract<EditorOperationPayload, { kind: "table.structure.patch" }>
type TableIdStructurePayload = Extract<TableStructurePayload, { tableId: string }>
type UpdateFlowTableCellSpanPayload = Extract<TableStructurePayload, { mutation: "cell-span" }>
type DeleteEmptyTableCellParagraphPayload = Extract<TableStructurePayload, { mutation: "delete-empty-cell-paragraph" }> & {
  history?: DeleteEmptyTableCellParagraphAction["history"]
  paginated?: DeleteEmptyTableCellParagraphAction["paginated"]
}
type TableGraphPlanningResult = ReturnType<typeof createEditorGraphPlanningDecision>
type TableGraphPlanningContext = {
  targetNodeIds: string[]
  diagnostics: EditorOperationCommitDiagnostics
  graphDecision: TableGraphPlanningResult
  tableId?: string
}

function firstTableIdFromGraphContexts(contexts: readonly EditorDocumentGraphTargetContext[]): string | undefined {
  return contexts.find((context) => context.tableId != null)?.tableId
}

function reducerPathForTablePayload(input: TableStructurePayload): TableStructureAction["type"] {
  switch (input.mutation) {
    case "add-row":
      return "TABLE_ADD_ROW"
    case "remove-row":
      return "TABLE_REMOVE_ROW"
    case "add-column":
      return "TABLE_ADD_COL"
    case "remove-column":
      return "TABLE_REMOVE_COL"
    case "fit-to-width":
      return "TABLE_FIT_TO_WIDTH"
    case "resize-column-pair":
      return "RESIZE_TABLE_COLUMN_PAIR"
    case "cell-span":
      return "UPDATE_FLOW_TABLE_CELL_SPAN"
    case "delete-empty-cell-paragraph":
      return "DELETE_EMPTY_TABLE_CELL_PARAGRAPH"
  }
}

function targetNodeIdsForTablePayload(input: TableStructurePayload): string[] {
  if ("tableId" in input) return [input.tableId]
  if (input.mutation === "cell-span") return [input.cellId]
  return [input.nodeId]
}

function tableValidationScope(tableId: string | undefined): { kind: "table"; tableId: string; fallback: "full-document" } | undefined {
  return tableId ? { kind: "table", tableId, fallback: "full-document" } : undefined
}

function createTableStructurePlanningContext(
  state: EditorState,
  operation: EditorOperationEnvelope | undefined,
  reducerPath: TableStructureAction["type"],
  targetNodeIds: string[],
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
  const scopedTargetNodeIds = operation?.scope.nodeIds ?? targetNodeIds
  const graphDiagnostics = createOperationDocumentGraphDiagnostics(state, operation, scopedTargetNodeIds)
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
    targetNodeIds: scopedTargetNodeIds,
    tableId,
    graphDecision,
    diagnostics: {
      operationKind: "table.structure.patch",
      reducerPath,
      ...extra,
      targetNodeIds: scopedTargetNodeIds,
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

function createTableIdStructurePayload(action: TableIdStructureAction): TableIdStructurePayload {
  switch (action.type) {
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
  }
}

function createUpdateFlowTableCellSpanPayload(action: UpdateFlowTableCellSpanAction): UpdateFlowTableCellSpanPayload {
  return { kind: "table.structure.patch", mutation: "cell-span", cellId: action.cellId, changes: action.changes }
}

function applyTableIdStructurePayload(doc: DocumentNode, input: TableIdStructurePayload): DocumentNode {
  switch (input.mutation) {
    case "add-row":
      return addFlowTableRow(doc, input.tableId, input.afterIndex)
    case "remove-row":
      return removeFlowTableRow(doc, input.tableId, input.rowIndex)
    case "add-column":
      return addFlowTableColumn(doc, input.tableId, input.afterIndex)
    case "remove-column":
      return removeFlowTableColumn(doc, input.tableId, input.colIndex)
    case "fit-to-width":
      return fitFlowTableToSectionWidth(doc, input.tableId)
    case "resize-column-pair":
      return resizeFlowTableColumnPair(
        doc,
        input.tableId,
        input.leftColIndex,
        input.leftWidth,
        input.rightWidth,
      )
  }
}

function createTableIdStructureCommitResult(
  state: EditorState,
  input: TableIdStructurePayload,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const reducerPath = reducerPathForTablePayload(input)
  const context = createTableStructurePlanningContext(state, operation, reducerPath, targetNodeIdsForTablePayload(input), { tableId: input.tableId }, {
    operationName: input.mutation === "resize-column-pair" ? "table-column-resize" : "table-structure",
    allowedOperationSurfaces: ["table"],
    currentValidationPolicy: "scoped",
    tableId: input.tableId,
  })
  const preflightResult = tableGraphPreflightResult(context)
  if (preflightResult != null) return preflightResult
  const graphDecision = allowedTableGraphDecision(context)

  const nextDoc = applyTableIdStructurePayload(state.doc, input)
  const noopReason = input.mutation === "resize-column-pair"
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
    validationScope: { kind: "table", tableId: input.tableId, fallback: "full-document" },
    historyPolicy: { kind: "push" },
    paginatedPatch: input.mutation === "resize-column-pair" && input.paginated != null
      ? { paginated: input.paginated }
      : undefined,
    diagnostics: {
      ...context.diagnostics,
      validationPolicy: graphDecision.validationPolicy,
    },
  }
}

function createUpdateFlowTableCellSpanCommitResult(
  state: EditorState,
  input: UpdateFlowTableCellSpanPayload,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const context = createTableStructurePlanningContext(state, operation, reducerPathForTablePayload(input), targetNodeIdsForTablePayload(input), { cellId: input.cellId }, {
    operationName: "table-cell-span",
    allowedOperationSurfaces: ["table"],
    currentValidationPolicy: "full",
    documentV2ValidationPolicy: "scoped",
  })
  const preflightResult = tableGraphPreflightResult(context)
  if (preflightResult != null) return preflightResult
  const graphDecision = allowedTableGraphDecision(context)

  const nextDoc = updateFlowTableCellSpan(state.doc, input.cellId, input.changes)

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
  input: DeleteEmptyTableCellParagraphPayload,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const context = createTableStructurePlanningContext(state, operation, reducerPathForTablePayload(input), [input.nodeId], { nodeId: input.nodeId }, {
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
    nodeId: input.nodeId,
    text: input.text,
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
    historyPolicy: { kind: "push", entry: input.history },
    paginatedPatch: input.paginated != null ? { paginated: input.paginated } : undefined,
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
  if ("tableId" in action) return createTableIdStructureCommitResult(state, createTableIdStructurePayload(action))
  if (action.type === "UPDATE_FLOW_TABLE_CELL_SPAN") {
    return createUpdateFlowTableCellSpanCommitResult(state, createUpdateFlowTableCellSpanPayload(action))
  }
  return createDeleteEmptyTableCellParagraphCommitResult(state, {
    kind: "table.structure.patch",
    mutation: "delete-empty-cell-paragraph",
    nodeId: action.nodeId,
    ...(action.text !== undefined ? { text: action.text } : {}),
    ...(action.history ? { history: action.history } : {}),
    ...(action.paginated ? { paginated: action.paginated } : {}),
  })
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

  const command = operation.command?.kind === "table.structure.patch"
    ? operation.command
    : operation.payload?.kind === "table.structure.patch"
      ? operation.payload
      : undefined

  if (command != null) {
    if ("tableId" in command) {
      return createTableIdStructureCommitResult(state, command, operation)
    }
    if (command.mutation === "cell-span") {
      return createUpdateFlowTableCellSpanCommitResult(state, command, operation)
    }
    const runtime: EditorOperationStructuralRuntimeContext | undefined = operation.runtime?.structural
    return createDeleteEmptyTableCellParagraphCommitResult(state, {
      ...command,
      ...(runtime?.history ? { history: runtime.history } : {}),
      ...(runtime?.paginated ? { paginated: runtime.paginated } : {}),
    }, operation)
  }

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
