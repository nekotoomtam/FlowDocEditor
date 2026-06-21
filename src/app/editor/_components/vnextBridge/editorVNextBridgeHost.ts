import {
  createVNextOperationHistoryRecord,
  runVNextOperation,
  safeCreateVNextEditorBridgeRuntime,
  type VNextEditorBridgeRuntimeStatus,
  type VNextMeasuredRenderCommand,
  type VNextOperationCommand,
  type VNextOperationFailureReason,
  type VNextOperationHistoryRecord,
  type VNextOperationRenderInvalidation,
  type VNextOperationScope,
  type VNextOperationKind,
  type VNextOperationSource,
} from "../../../../../vnext-workspace/src/index"

export type EditorVNextBridgeHostSnapshotStatus = VNextEditorBridgeRuntimeStatus
export type EditorVNextTextReplaceOperationPilotCommand = Extract<VNextOperationCommand, { kind: "text-block.text.replace" }>

export interface EditorVNextBridgeHostOptions {
  measurementProfileId?: string
}

export type EditorVNextPreviewArtifactData = Record<string, string | number | boolean | null>

export interface EditorVNextPreviewArtifactOptions extends EditorVNextBridgeHostOptions {
  data?: EditorVNextPreviewArtifactData
  maxCommands?: number
}

export interface EditorVNextBridgeHostIssueSummary {
  code: string
  path: string
  message: string
}

export interface EditorVNextBridgeHostSnapshot {
  source: "editor-vnext-bridge-host"
  input: "canonical-vnext-package"
  status: EditorVNextBridgeHostSnapshotStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  pageCount: number
  graph: {
    sectionCount: number
    zoneCount: number
    nodeCount: number
    issueCount: number
  }
  rendererConsumption: {
    status: "consumable" | "blocked"
    commandCount: number
    blockingIssueCount: number
    warningIssueCount: number
    mayRelayout: false
    requiresAuthoredDocumentForLayout: false
  }
  exportReadiness: {
    status: EditorVNextBridgeHostSnapshotStatus
    blockingIssueCount: number
    warningIssueCount: number
  }
  supportedOperationKinds: readonly VNextOperationKind[]
  issues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextBridgeHostResult =
  | { ok: true; snapshot: EditorVNextBridgeHostSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextBridgeHostSnapshot }

export interface EditorVNextOperationPilotSnapshot {
  source: "editor-vnext-operation-pilot"
  phase: "11.6"
  mode: "mutating-derived-output"
  input: "canonical-vnext-package"
  status: "committed" | "rejected" | "blocked"
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  operation: {
    kind: "text-block.text.replace"
    source: VNextOperationSource | null
    targetNodeIds: string[]
    failureReason: VNextOperationFailureReason | "bridge-blocked" | "unsupported-operation-kind" | null
    validationPolicy: "full" | null
    historyIntent: "content" | "structure" | "layout" | null
    renderInvalidation: VNextOperationRenderInvalidation | null
    scope: VNextOperationScope | null
  }
  mutation: {
    appliedToVNextDocument: boolean
    returnedNextDocument: boolean
    targetNodeId: string
    replacementInlineChildCount: number
    persisted: false
    editorStateApplied: false
  }
  history: {
    recordCreated: boolean
    recordStatus: VNextOperationHistoryRecord["status"] | null
    record: VNextOperationHistoryRecord | null
  }
  sideEffects: {
    editorState: false
    history: false
    selection: false
    paginatedPreview: false
    canvasRendering: false
    apiRoutes: false
  }
  issues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextOperationPilotResult =
  | { ok: true; snapshot: EditorVNextOperationPilotSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextOperationPilotSnapshot }

export interface EditorVNextPreviewArtifactCommand {
  id: string
  pageIndex: number
  pageNumber: number
  sectionId: string
  zoneId: string
  zoneRole: VNextMeasuredRenderCommand["zoneRole"]
  nodeId: string
  nodeType: VNextMeasuredRenderCommand["nodeType"]
  kind: VNextMeasuredRenderCommand["kind"]
  bounds: VNextMeasuredRenderCommand["bounds"]
  text?: string
  lineStart?: number
  lineEnd?: number
  continuesFromPreviousPage?: boolean
  continuesOnNextPage?: boolean
  table?: VNextMeasuredRenderCommand["table"]
}

export interface EditorVNextPreviewArtifactSnapshot {
  source: "editor-vnext-preview-artifact"
  milestone: "artifact-generation"
  jobItem: "A3"
  mode: "measured-preview-artifact"
  input: "canonical-vnext-package"
  status: EditorVNextBridgeHostSnapshotStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  artifact: {
    kind: "preview"
    format: "measured-render-commands"
    commandCount: number
    returnedCommandCount: number
    truncated: boolean
    generatedDocumentReturned: false
    paginatedDocumentReturned: false
    pdfRendered: false
    docxRendered: false
  }
  rendererContract: {
    consumes: "measured-pagination-fragments"
    mayRelayout: false
    requiresAuthoredDocumentForLayout: false
  }
  pages: Array<{
    pageIndex: number
    pageNumber: number
    sectionId: string
    widthPt: number
    heightPt: number
    commandCount: number
  }>
  commands: EditorVNextPreviewArtifactCommand[]
  sideEffects: {
    editorState: false
    history: false
    selection: false
    paginatedPreview: false
    canvasRendering: false
    persistence: false
    apiRoutesReplaced: false
  }
  issues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextPreviewArtifactResult =
  | { ok: true; snapshot: EditorVNextPreviewArtifactSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextPreviewArtifactSnapshot }

function summarizeIssues(issues: readonly { code: string; path?: string; message: string }[]): EditorVNextBridgeHostIssueSummary[] {
  return issues.slice(0, 10).map((issue) => ({
    code: issue.code,
    path: issue.path ?? "",
    message: issue.message,
  }))
}

function failedSnapshot(issues: EditorVNextBridgeHostIssueSummary[]): EditorVNextBridgeHostSnapshot {
  return {
    source: "editor-vnext-bridge-host",
    input: "canonical-vnext-package",
    status: "blocked",
    documentId: null,
    packageVersion: null,
    documentVersion: null,
    pageCount: 0,
    graph: {
      sectionCount: 0,
      zoneCount: 0,
      nodeCount: 0,
      issueCount: issues.length,
    },
    rendererConsumption: {
      status: "blocked",
      commandCount: 0,
      blockingIssueCount: issues.length,
      warningIssueCount: 0,
      mayRelayout: false,
      requiresAuthoredDocumentForLayout: false,
    },
    exportReadiness: {
      status: "blocked",
      blockingIssueCount: issues.length,
      warningIssueCount: 0,
    },
    supportedOperationKinds: [],
    issues,
  }
}

function operationSideEffects(): EditorVNextOperationPilotSnapshot["sideEffects"] {
  return {
    editorState: false,
    history: false,
    selection: false,
    paginatedPreview: false,
    canvasRendering: false,
    apiRoutes: false,
  }
}

function previewArtifactSideEffects(): EditorVNextPreviewArtifactSnapshot["sideEffects"] {
  return {
    editorState: false,
    history: false,
    selection: false,
    paginatedPreview: false,
    canvasRendering: false,
    persistence: false,
    apiRoutesReplaced: false,
  }
}

function clampMaxCommands(maxCommands: number | undefined): number {
  if (maxCommands == null || !Number.isFinite(maxCommands)) return 200
  return Math.max(1, Math.min(1000, Math.floor(maxCommands)))
}

function previewCommandFromRenderCommand(command: VNextMeasuredRenderCommand): EditorVNextPreviewArtifactCommand {
  return {
    id: command.id,
    pageIndex: command.pageIndex,
    pageNumber: command.pageNumber,
    sectionId: command.sectionId,
    zoneId: command.zoneId,
    zoneRole: command.zoneRole,
    nodeId: command.nodeId,
    nodeType: command.nodeType,
    kind: command.kind,
    bounds: command.bounds,
    ...(command.text == null ? {} : { text: command.text }),
    ...(command.lineStart == null ? {} : { lineStart: command.lineStart }),
    ...(command.lineEnd == null ? {} : { lineEnd: command.lineEnd }),
    ...(command.continuesFromPreviousPage == null ? {} : { continuesFromPreviousPage: command.continuesFromPreviousPage }),
    ...(command.continuesOnNextPage == null ? {} : { continuesOnNextPage: command.continuesOnNextPage }),
    ...(command.table == null ? {} : { table: command.table }),
  }
}

function failedPreviewArtifactSnapshot(issues: EditorVNextBridgeHostIssueSummary[]): EditorVNextPreviewArtifactSnapshot {
  return {
    source: "editor-vnext-preview-artifact",
    milestone: "artifact-generation",
    jobItem: "A3",
    mode: "measured-preview-artifact",
    input: "canonical-vnext-package",
    status: "blocked",
    documentId: null,
    packageVersion: null,
    documentVersion: null,
    artifact: {
      kind: "preview",
      format: "measured-render-commands",
      commandCount: 0,
      returnedCommandCount: 0,
      truncated: false,
      generatedDocumentReturned: false,
      paginatedDocumentReturned: false,
      pdfRendered: false,
      docxRendered: false,
    },
    rendererContract: {
      consumes: "measured-pagination-fragments",
      mayRelayout: false,
      requiresAuthoredDocumentForLayout: false,
    },
    pages: [],
    commands: [],
    sideEffects: previewArtifactSideEffects(),
    issues,
  }
}

function blockedOperationSnapshot(
  command: EditorVNextTextReplaceOperationPilotCommand,
  bridgeSnapshot: EditorVNextBridgeHostSnapshot,
  failureReason: EditorVNextOperationPilotSnapshot["operation"]["failureReason"],
  issues: EditorVNextBridgeHostIssueSummary[],
): EditorVNextOperationPilotSnapshot {
  return {
    source: "editor-vnext-operation-pilot",
    phase: "11.6",
    mode: "mutating-derived-output",
    input: "canonical-vnext-package",
    status: "blocked",
    documentId: bridgeSnapshot.documentId,
    packageVersion: bridgeSnapshot.packageVersion,
    documentVersion: bridgeSnapshot.documentVersion,
    operation: {
      kind: "text-block.text.replace",
      source: command.source ?? "user",
      targetNodeIds: [command.nodeId],
      failureReason,
      validationPolicy: null,
      historyIntent: null,
      renderInvalidation: null,
      scope: null,
    },
    mutation: {
      appliedToVNextDocument: false,
      returnedNextDocument: false,
      targetNodeId: command.nodeId,
      replacementInlineChildCount: command.children.length,
      persisted: false,
      editorStateApplied: false,
    },
    history: {
      recordCreated: false,
      recordStatus: null,
      record: null,
    },
    sideEffects: operationSideEffects(),
    issues,
  }
}

function operationSnapshotFromHistoryRecord(
  bridgeSnapshot: EditorVNextBridgeHostSnapshot,
  command: EditorVNextTextReplaceOperationPilotCommand,
  record: VNextOperationHistoryRecord,
): EditorVNextOperationPilotSnapshot {
  return {
    source: "editor-vnext-operation-pilot",
    phase: "11.6",
    mode: "mutating-derived-output",
    input: "canonical-vnext-package",
    status: record.status,
    documentId: bridgeSnapshot.documentId,
    packageVersion: bridgeSnapshot.packageVersion,
    documentVersion: bridgeSnapshot.documentVersion,
    operation: {
      kind: "text-block.text.replace",
      source: record.source,
      targetNodeIds: record.targetNodeIds,
      failureReason: record.failureReason ?? null,
      validationPolicy: record.validationPolicy,
      historyIntent: record.historyIntent,
      renderInvalidation: record.renderInvalidation,
      scope: record.scope,
    },
    mutation: {
      appliedToVNextDocument: record.status === "committed",
      returnedNextDocument: record.status === "committed",
      targetNodeId: command.nodeId,
      replacementInlineChildCount: command.children.length,
      persisted: false,
      editorStateApplied: false,
    },
    history: {
      recordCreated: true,
      recordStatus: record.status,
      record,
    },
    sideEffects: operationSideEffects(),
    issues: summarizeIssues(record.issues),
  }
}

export function createEditorVNextBridgeHostSnapshot(
  value: unknown,
  options: EditorVNextBridgeHostOptions = {},
): EditorVNextBridgeHostResult {
  const result = safeCreateVNextEditorBridgeRuntime(value, {
    source: "canonical-vnext-package",
    measurementProfileId: options.measurementProfileId,
  })

  if (!result.ok) {
    const issues = summarizeIssues(result.issues)
    return {
      ok: false,
      reason: result.reason,
      snapshot: failedSnapshot(issues),
    }
  }

  const runtime = result.runtime
  return {
    ok: true,
    snapshot: {
      source: "editor-vnext-bridge-host",
      input: "canonical-vnext-package",
      status: runtime.status,
      documentId: runtime.package.id,
      packageVersion: runtime.packageVersion,
      documentVersion: runtime.documentVersion,
      pageCount: runtime.pagination.pageCount,
      graph: {
        sectionCount: runtime.graph.sectionsById.size,
        zoneCount: runtime.graph.zonesById.size,
        nodeCount: runtime.graph.nodesById.size,
        issueCount: runtime.diagnostics.graphIssueCount,
      },
      rendererConsumption: {
        status: runtime.rendererConsumption.status,
        commandCount: runtime.rendererConsumption.commandCount,
        blockingIssueCount: runtime.diagnostics.rendererBlockingIssueCount,
        warningIssueCount: runtime.diagnostics.rendererWarningIssueCount,
        mayRelayout: runtime.rendererConsumption.rendererContract.mayRelayout,
        requiresAuthoredDocumentForLayout: runtime.rendererConsumption.rendererContract.requiresAuthoredDocumentForLayout,
      },
      exportReadiness: {
        status: runtime.exportReadiness.status,
        blockingIssueCount: runtime.diagnostics.exportBlockingIssueCount,
        warningIssueCount: runtime.diagnostics.exportWarningIssueCount,
      },
      supportedOperationKinds: runtime.diagnostics.supportedOperationKinds,
      issues: [
        ...summarizeIssues(runtime.exportReadiness.blockingIssues),
        ...summarizeIssues(runtime.exportReadiness.warningIssues),
      ],
    },
  }
}

export function runEditorVNextTextReplaceOperationPilot(
  value: unknown,
  command: EditorVNextTextReplaceOperationPilotCommand,
  options: EditorVNextBridgeHostOptions = {},
): EditorVNextOperationPilotResult {
  if (command.kind !== "text-block.text.replace") {
    const bridgeSnapshot = failedSnapshot([])
    return {
      ok: false,
      reason: "unsupported-operation-kind",
      snapshot: blockedOperationSnapshot(command, bridgeSnapshot, "unsupported-operation-kind", []),
    }
  }

  const bridgeResult = createEditorVNextBridgeHostSnapshot(value, options)
  if (!bridgeResult.ok) {
    return {
      ok: false,
      reason: bridgeResult.reason,
      snapshot: blockedOperationSnapshot(command, bridgeResult.snapshot, "bridge-blocked", bridgeResult.snapshot.issues),
    }
  }

  const runtime = safeCreateVNextEditorBridgeRuntime(value, {
    source: "canonical-vnext-package",
    measurementProfileId: options.measurementProfileId,
  })
  if (!runtime.ok) {
    const issues = summarizeIssues(runtime.issues)
    return {
      ok: false,
      reason: runtime.reason,
      snapshot: blockedOperationSnapshot(command, bridgeResult.snapshot, "bridge-blocked", issues),
    }
  }

  const operationResult = runVNextOperation(runtime.runtime.package.document, command)
  const historyRecord = createVNextOperationHistoryRecord(operationResult)
  const snapshot = operationSnapshotFromHistoryRecord(bridgeResult.snapshot, command, historyRecord)

  if (!operationResult.ok) {
    return {
      ok: false,
      reason: operationResult.reason,
      snapshot,
    }
  }

  return {
    ok: true,
    snapshot,
  }
}

export function createEditorVNextPreviewArtifactSnapshot(
  value: unknown,
  options: EditorVNextPreviewArtifactOptions = {},
): EditorVNextPreviewArtifactResult {
  const result = safeCreateVNextEditorBridgeRuntime(value, {
    source: "canonical-vnext-package",
    measurementProfileId: options.measurementProfileId,
    data: options.data,
  })

  if (!result.ok) {
    const issues = summarizeIssues(result.issues)
    return {
      ok: false,
      reason: result.reason,
      snapshot: failedPreviewArtifactSnapshot(issues),
    }
  }

  const runtime = result.runtime
  const maxCommands = clampMaxCommands(options.maxCommands)
  const returnedCommands = runtime.rendererConsumption.commands.slice(0, maxCommands)
  const commandCountsByPage = new Map<number, number>()
  runtime.rendererConsumption.commands.forEach((command) => {
    commandCountsByPage.set(command.pageIndex, (commandCountsByPage.get(command.pageIndex) ?? 0) + 1)
  })
  const issues = [
    ...summarizeIssues(runtime.exportReadiness.blockingIssues),
    ...summarizeIssues(runtime.exportReadiness.warningIssues),
  ]
  const snapshot: EditorVNextPreviewArtifactSnapshot = {
    source: "editor-vnext-preview-artifact",
    milestone: "artifact-generation",
    jobItem: "A3",
    mode: "measured-preview-artifact",
    input: "canonical-vnext-package",
    status: runtime.status,
    documentId: runtime.package.id,
    packageVersion: runtime.packageVersion,
    documentVersion: runtime.documentVersion,
    artifact: {
      kind: "preview",
      format: "measured-render-commands",
      commandCount: runtime.rendererConsumption.commandCount,
      returnedCommandCount: returnedCommands.length,
      truncated: runtime.rendererConsumption.commandCount > returnedCommands.length,
      generatedDocumentReturned: false,
      paginatedDocumentReturned: false,
      pdfRendered: false,
      docxRendered: false,
    },
    rendererContract: {
      consumes: runtime.rendererConsumption.rendererContract.consumes,
      mayRelayout: runtime.rendererConsumption.rendererContract.mayRelayout,
      requiresAuthoredDocumentForLayout: runtime.rendererConsumption.rendererContract.requiresAuthoredDocumentForLayout,
    },
    pages: runtime.pagination.pages.map((page) => ({
      pageIndex: page.pageIndex,
      pageNumber: page.pageNumber,
      sectionId: page.sectionId,
      widthPt: page.pageBox.widthPt,
      heightPt: page.pageBox.heightPt,
      commandCount: commandCountsByPage.get(page.pageIndex) ?? 0,
    })),
    commands: returnedCommands.map(previewCommandFromRenderCommand),
    sideEffects: previewArtifactSideEffects(),
    issues,
  }

  if (runtime.rendererConsumption.status === "blocked") {
    return {
      ok: false,
      reason: "renderer-consumption-blocked",
      snapshot,
    }
  }

  return {
    ok: true,
    snapshot,
  }
}
