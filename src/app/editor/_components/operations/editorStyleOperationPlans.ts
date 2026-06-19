import {
  applyParagraphStylePreset,
  applyParagraphTextStyle,
  applyTextRunStyleRange,
  clearParagraphStyleId,
  detachParagraphStyle,
  getParagraphStylePreset,
  patchParagraphStyleDefinition,
  patchParagraphStyleOverrideBox,
  patchParagraphStyleOverrides,
  renameParagraphStyleDefinition,
  resetParagraphStyleOverrides,
  updateFlowStackBoxStyle,
  updateParagraphBoxStyle,
} from "@/document"
import type { DocumentNode, ParagraphStyleProperties } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitDiagnostics, EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type StylePatchAction =
  | Extract<EditorAction, { type: "UPDATE_PARAGRAPH_TEXT_STYLE" }>
  | Extract<EditorAction, { type: "APPLY_PARAGRAPH_STYLE_PRESET" }>
  | Extract<EditorAction, { type: "CLEAR_PARAGRAPH_STYLE" }>
  | Extract<EditorAction, { type: "DETACH_PARAGRAPH_STYLE" }>
  | Extract<EditorAction, { type: "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX" }>
  | Extract<EditorAction, { type: "PATCH_PARAGRAPH_STYLE_OVERRIDES" }>
  | Extract<EditorAction, { type: "PATCH_PARAGRAPH_STYLE_DEFINITION" }>
  | Extract<EditorAction, { type: "RENAME_PARAGRAPH_STYLE_DEFINITION" }>
  | Extract<EditorAction, { type: "RESET_PARAGRAPH_STYLE_OVERRIDES" }>
  | Extract<EditorAction, { type: "UPDATE_TEXT_RUN_STYLE_RANGE" }>
  | Extract<EditorAction, { type: "UPDATE_PARAGRAPH_BOX_STYLE" }>
  | Extract<EditorAction, { type: "UPDATE_FLOW_STACK_BOX_STYLE" }>

type StyleCommitOptions = {
  nodeId?: string
  styleId?: string
  selectNodeId?: string
  noopWhenUnchanged?: boolean
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

function createStylePatchDiagnostics(
  action: StylePatchAction,
  options: StyleCommitOptions = {},
): EditorOperationCommitDiagnostics {
  return {
    operationKind: "style.patch",
    reducerPath: action.type,
    ...(options.nodeId ? { nodeId: options.nodeId } : {}),
    ...(options.styleId ? { styleId: options.styleId } : {}),
  }
}

function createStylePatchCommitResultWithStateDoc(
  nextDoc: DocumentNode,
  options: StyleCommitOptions,
  diagnostics: EditorOperationCommitDiagnostics,
  stateDoc: DocumentNode,
): EditorOperationCommitResult {
  if (options.noopWhenUnchanged && nextDoc === stateDoc) {
    return {
      status: "noop",
      noopReason: "style-patch-noop",
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "document unchanged" },
      diagnostics,
    }
  }
  return {
    status: "success",
    nextDoc,
    validationPolicy: "full",
    historyPolicy: { kind: "push" },
    selectionPatch: options.selectNodeId
      ? {
          selectedNodeId: options.selectNodeId,
          selectionAnchorNodeId: options.selectNodeId,
        }
      : undefined,
    diagnostics,
  }
}

function commitStyleDoc(
  state: EditorState,
  action: StylePatchAction,
  nextDoc: DocumentNode,
  options: StyleCommitOptions = {},
): EditorOperationCommitResult {
  const diagnostics = createStylePatchDiagnostics(action, options)
  return createStylePatchCommitResultWithStateDoc(nextDoc, options, diagnostics, state.doc)
}

function createStyleNoopResult(
  action: StylePatchAction,
  noopReason: string,
  diagnostics: EditorOperationCommitDiagnostics,
): EditorOperationCommitResult {
  return {
    status: "noop",
    noopReason,
    validationPolicy: "read-only",
    historyPolicy: { kind: "none", reason: "document unchanged" },
    diagnostics,
  }
}

function createStylePatchResult(
  state: EditorState,
  action: StylePatchAction,
): EditorOperationCommitResult {
  switch (action.type) {
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
      return commitStyleDoc(
        state,
        action,
        applyParagraphTextStyle(state.doc, action.nodeId, action.changes),
        { nodeId: action.nodeId },
      )
    case "APPLY_PARAGRAPH_STYLE_PRESET": {
      const style = getParagraphStylePreset(action.styleId)
      const options = { nodeId: action.nodeId, styleId: action.styleId, selectNodeId: action.nodeId }
      if (style.props.headingLevel != null && !isDirectBodyParagraph(state.doc, action.nodeId)) {
        return createStyleNoopResult(
          action,
          "style-heading-level-disallowed-noop",
          createStylePatchDiagnostics(action, options),
        )
      }
      return commitStyleDoc(
        state,
        action,
        applyParagraphStylePreset(state.doc, action.nodeId, action.styleId),
        { ...options, noopWhenUnchanged: true },
      )
    }
    case "CLEAR_PARAGRAPH_STYLE":
      return commitStyleDoc(state, action, clearParagraphStyleId(state.doc, action.nodeId), {
        nodeId: action.nodeId,
        selectNodeId: action.nodeId,
        noopWhenUnchanged: true,
      })
    case "DETACH_PARAGRAPH_STYLE":
      return commitStyleDoc(state, action, detachParagraphStyle(state.doc, action.nodeId), {
        nodeId: action.nodeId,
        selectNodeId: action.nodeId,
        noopWhenUnchanged: true,
      })
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES": {
      const changes = hasHeadingLevelChange(action.changes) && !isDirectBodyParagraph(state.doc, action.nodeId)
        ? omitHeadingLevelChange(action.changes)
        : action.changes
      const options = { nodeId: action.nodeId, selectNodeId: action.nodeId, noopWhenUnchanged: true }
      if (Object.keys(changes).length === 0) {
        return createStyleNoopResult(
          action,
          "style-patch-empty-change-noop",
          createStylePatchDiagnostics(action, options),
        )
      }
      return commitStyleDoc(state, action, patchParagraphStyleOverrides(state.doc, action.nodeId, changes), options)
    }
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
      return commitStyleDoc(state, action, patchParagraphStyleOverrideBox(state.doc, action.nodeId, action.changes), {
        nodeId: action.nodeId,
        selectNodeId: action.nodeId,
        noopWhenUnchanged: true,
      })
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
      return commitStyleDoc(state, action, patchParagraphStyleDefinition(state.doc, action.styleId, action.patch), {
        styleId: action.styleId,
        noopWhenUnchanged: true,
      })
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return commitStyleDoc(state, action, renameParagraphStyleDefinition(state.doc, action.styleId, action.name), {
        styleId: action.styleId,
        noopWhenUnchanged: true,
      })
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
      return commitStyleDoc(state, action, resetParagraphStyleOverrides(state.doc, action.nodeId), {
        nodeId: action.nodeId,
        selectNodeId: action.nodeId,
        noopWhenUnchanged: true,
      })
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
      return commitStyleDoc(
        state,
        action,
        applyTextRunStyleRange(state.doc, action.nodeId, action.start, action.end, action.changes),
        { nodeId: action.nodeId, noopWhenUnchanged: true },
      )
    case "UPDATE_PARAGRAPH_BOX_STYLE":
      return commitStyleDoc(state, action, updateParagraphBoxStyle(state.doc, action.nodeId, action.changes), {
        nodeId: action.nodeId,
      })
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return commitStyleDoc(state, action, updateFlowStackBoxStyle(state.doc, action.nodeId, action.changes), {
        nodeId: action.nodeId,
      })
  }
}

export function createStylePatchActionResult(
  state: EditorState,
  action: StylePatchAction,
): EditorOperationCommitResult {
  return createStylePatchResult(state, action)
}

export function createStylePatchOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "style.patch") {
    return {
      status: "failure",
      failure: { reason: "invalid-style-patch-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "STYLE_PATCH",
      },
    }
  }

  switch (operation.action.type) {
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "APPLY_PARAGRAPH_STYLE_PRESET":
    case "CLEAR_PARAGRAPH_STYLE":
    case "DETACH_PARAGRAPH_STYLE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
    case "RESET_PARAGRAPH_STYLE_OVERRIDES":
    case "UPDATE_TEXT_RUN_STYLE_RANGE":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "UPDATE_FLOW_STACK_BOX_STYLE":
      return createStylePatchResult(state, operation.action)
    default:
      return {
        status: "failure",
        failure: { reason: "invalid-style-patch-action" },
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "invalid operation" },
        diagnostics: {
          operationKind: operation.kind,
          reducerPath: "STYLE_PATCH",
        },
      }
  }
}
