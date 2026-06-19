import { updateNodeProps } from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import { createDocumentGraphDiagnostics } from "./editorDocumentGraphDiagnostics"
import type { EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type UpdatePropsAction = Extract<EditorAction, { type: "UPDATE_PROPS" }>

function isDirectBodyParagraph(doc: DocumentNode, nodeId: string): boolean {
  for (const section of doc.document.sections) {
    const body = section.nodes[section.bodyRootId]
    if (body?.type !== "body" || !body.childIds.includes(nodeId)) continue
    return section.nodes[nodeId]?.type === "paragraph"
  }
  return false
}

function hasHeadingLevelChange(changes: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(changes, "headingLevel")
}

function omitHeadingLevelChange(changes: Record<string, unknown>): Record<string, unknown> {
  const { headingLevel: _headingLevel, ...rest } = changes
  return rest
}

function createNodePropsCommitResult(
  state: EditorState,
  action: UpdatePropsAction,
  operation?: EditorOperationEnvelope,
): EditorOperationCommitResult {
  const changes = hasHeadingLevelChange(action.changes) && !isDirectBodyParagraph(state.doc, action.nodeId)
    ? omitHeadingLevelChange(action.changes)
    : action.changes
  const targetNodeIds = operation?.scope.nodeIds ?? [action.nodeId]
  const diagnostics = {
    operationKind: "node.props.patch" as const,
    reducerPath: "UPDATE_PROPS",
    nodeId: action.nodeId,
    targetNodeIds,
    ...createDocumentGraphDiagnostics(state, targetNodeIds),
  }

  if (Object.keys(changes).length === 0) {
    return {
      status: "noop",
      noopReason: "node-props-empty-change-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "empty change set" },
      diagnostics,
    }
  }

  return {
    status: "success",
    nextDoc: updateNodeProps(state.doc, action.nodeId, changes),
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    diagnostics,
  }
}

export function createNodePropsActionResult(
  state: EditorState,
  action: UpdatePropsAction,
): EditorOperationCommitResult {
  return createNodePropsCommitResult(state, action)
}

export function createNodePropsOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "node.props.patch" || operation.action.type !== "UPDATE_PROPS") {
    return {
      status: "failure",
      failure: { reason: "invalid-node-props-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "UPDATE_PROPS",
      },
    }
  }
  return createNodePropsCommitResult(state, operation.action, operation)
}
