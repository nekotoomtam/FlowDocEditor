import {
  disableSectionReservedZoneIfEmpty,
  ensureSectionReservedZoneVisibleForAuthoring,
  updateSectionHeaderFooterHorizontalMode,
  updateSectionMargin,
  updateSectionReservedZones,
} from "@/document"
import type { DocumentNode } from "@/schema"
import type { EditorAction, EditorState } from "../editorReducer"
import type { EditorOperationCommitDiagnostics, EditorOperationCommitResult } from "./editorOperationCommit"
import type { EditorOperationEnvelope } from "./editorOperationTypes"

type UpdateMarginAction = Extract<EditorAction, { type: "UPDATE_MARGIN" }>
type UpdateReservedZonesAction = Extract<EditorAction, { type: "UPDATE_RESERVED_ZONES" }>
type EnsureHeaderFooterZoneVisibleAction = Extract<EditorAction, { type: "ENSURE_HEADER_FOOTER_ZONE_VISIBLE" }>
type DisableHeaderFooterZoneIfEmptyAction = Extract<EditorAction, { type: "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY" }>
type UpdateHeaderFooterHorizontalModeAction = Extract<EditorAction, { type: "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE" }>

type DocumentSettingsAction =
  | UpdateMarginAction
  | UpdateReservedZonesAction
  | EnsureHeaderFooterZoneVisibleAction
  | DisableHeaderFooterZoneIfEmptyAction
  | UpdateHeaderFooterHorizontalModeAction

function shouldNoopWhenUnchanged(action: DocumentSettingsAction): boolean {
  return action.type !== "UPDATE_MARGIN"
}

function applyDocumentSettingsAction(doc: DocumentNode, action: DocumentSettingsAction): DocumentNode {
  switch (action.type) {
    case "UPDATE_MARGIN":
      return updateSectionMargin(doc, action.sectionIndex, action.margin)
    case "UPDATE_RESERVED_ZONES":
      return updateSectionReservedZones(doc, action.sectionIndex, action.reserved, action.priority)
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
      return ensureSectionReservedZoneVisibleForAuthoring(doc, action.sectionIndex, action.zone)
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
      return disableSectionReservedZoneIfEmpty(doc, action.sectionIndex, action.zone)
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
      return updateSectionHeaderFooterHorizontalMode(doc, action.sectionIndex, action.mode)
  }
}

function createDocumentSettingsDiagnostics(
  state: EditorState,
  action: DocumentSettingsAction,
): EditorOperationCommitDiagnostics {
  const section = state.doc.document.sections[action.sectionIndex]
  return {
    operationKind: "document.settings.patch",
    reducerPath: action.type,
    sectionIndex: action.sectionIndex,
    sectionId: section?.id,
    sectionExists: section != null,
    sectionCount: state.doc.document.sections.length,
    ...(action.type === "ENSURE_HEADER_FOOTER_ZONE_VISIBLE" ||
      action.type === "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY"
      ? { zone: action.zone }
      : {}),
    ...(action.type === "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE" ? { mode: action.mode } : {}),
  }
}

function createDocumentSettingsCommitResult(
  state: EditorState,
  action: DocumentSettingsAction,
): EditorOperationCommitResult {
  const nextDoc = applyDocumentSettingsAction(state.doc, action)
  const diagnostics = createDocumentSettingsDiagnostics(state, action)

  if (shouldNoopWhenUnchanged(action) && nextDoc === state.doc) {
    return {
      status: "noop",
      noopReason: "document-settings-noop",
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
    diagnostics,
  }
}

export function createDocumentSettingsActionResult(
  state: EditorState,
  action: DocumentSettingsAction,
): EditorOperationCommitResult {
  return createDocumentSettingsCommitResult(state, action)
}

export function createDocumentSettingsOperationResult(
  state: EditorState,
  operation: EditorOperationEnvelope,
): EditorOperationCommitResult {
  if (operation.kind !== "document.settings.patch") {
    return {
      status: "failure",
      failure: { reason: "invalid-document-settings-operation" },
      validationPolicy: "read-only",
      historyPolicy: { kind: "none", reason: "invalid operation" },
      diagnostics: {
        operationKind: operation.kind,
        reducerPath: "DOCUMENT_SETTINGS",
      },
    }
  }

  switch (operation.action.type) {
    case "UPDATE_MARGIN":
    case "UPDATE_RESERVED_ZONES":
    case "ENSURE_HEADER_FOOTER_ZONE_VISIBLE":
    case "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY":
    case "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE":
      return createDocumentSettingsCommitResult(state, operation.action)
    default:
      return {
        status: "failure",
        failure: { reason: "invalid-document-settings-action" },
        validationPolicy: "read-only",
        historyPolicy: { kind: "none", reason: "invalid operation" },
        diagnostics: {
          operationKind: operation.kind,
          reducerPath: "DOCUMENT_SETTINGS",
        },
      }
  }
}
