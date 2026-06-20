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
import type { EditorOperationCommand, EditorOperationEnvelope } from "./editorOperationTypes"

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
type DocumentSettingsCommand = Extract<EditorOperationCommand, { kind: "document.settings.patch" }>

function createDocumentSettingsCommand(action: DocumentSettingsAction): DocumentSettingsCommand {
  switch (action.type) {
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
  }
}

function reducerPathForDocumentSettingsCommand(input: DocumentSettingsCommand): DocumentSettingsAction["type"] {
  switch (input.setting) {
    case "margin":
      return "UPDATE_MARGIN"
    case "reserved-zones":
      return "UPDATE_RESERVED_ZONES"
    case "ensure-zone-visible":
      return "ENSURE_HEADER_FOOTER_ZONE_VISIBLE"
    case "disable-zone-if-empty":
      return "DISABLE_HEADER_FOOTER_ZONE_IF_EMPTY"
    case "header-footer-horizontal-mode":
      return "UPDATE_HEADER_FOOTER_HORIZONTAL_MODE"
  }
}

function shouldNoopWhenUnchanged(input: DocumentSettingsCommand): boolean {
  return input.setting !== "margin"
}

function applyDocumentSettingsCommand(doc: DocumentNode, input: DocumentSettingsCommand): DocumentNode {
  switch (input.setting) {
    case "margin":
      return updateSectionMargin(doc, input.sectionIndex, input.margin)
    case "reserved-zones":
      return updateSectionReservedZones(doc, input.sectionIndex, input.reserved, input.priority)
    case "ensure-zone-visible":
      return ensureSectionReservedZoneVisibleForAuthoring(doc, input.sectionIndex, input.zone)
    case "disable-zone-if-empty":
      return disableSectionReservedZoneIfEmpty(doc, input.sectionIndex, input.zone)
    case "header-footer-horizontal-mode":
      return updateSectionHeaderFooterHorizontalMode(doc, input.sectionIndex, input.mode)
  }
}

function createDocumentSettingsDiagnostics(
  state: EditorState,
  input: DocumentSettingsCommand,
): EditorOperationCommitDiagnostics {
  const reducerPath = reducerPathForDocumentSettingsCommand(input)
  const section = state.doc.document.sections[input.sectionIndex]
  return {
    operationKind: "document.settings.patch",
    reducerPath,
    sectionIndex: input.sectionIndex,
    sectionId: section?.id,
    sectionExists: section != null,
    sectionCount: state.doc.document.sections.length,
    ...(input.setting === "ensure-zone-visible" ||
      input.setting === "disable-zone-if-empty"
      ? { zone: input.zone }
      : {}),
    ...(input.setting === "header-footer-horizontal-mode" ? { mode: input.mode } : {}),
  }
}

function createDocumentSettingsCommitResult(
  state: EditorState,
  input: DocumentSettingsCommand,
): EditorOperationCommitResult {
  const nextDoc = applyDocumentSettingsCommand(state.doc, input)
  const diagnostics = createDocumentSettingsDiagnostics(state, input)

  if (shouldNoopWhenUnchanged(input) && nextDoc === state.doc) {
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
  return createDocumentSettingsCommitResult(state, createDocumentSettingsCommand(action))
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

  const command = operation.command?.kind === "document.settings.patch"
    ? operation.command
    : operation.payload?.kind === "document.settings.patch"
      ? operation.payload
      : undefined
  if (command) {
    return createDocumentSettingsCommitResult(state, command)
  }

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
