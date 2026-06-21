import {
  createEditorGenerationReadinessSnapshot,
  type EditorGenerationReadinessOptions,
  type EditorGenerationRequestDataStatus,
} from "./editorGenerationReadiness"
import {
  createEditorVNextBridgeHostSnapshot,
  type EditorVNextBridgeHostIssueSummary,
  type EditorVNextBridgeHostSnapshot,
  type EditorVNextBridgeHostSnapshotStatus,
} from "./editorVNextBridgeHost"

export interface EditorVNextHiddenRuntimeSurfaceOptions extends EditorGenerationReadinessOptions {}

export interface EditorVNextHiddenRuntimeSurfaceSnapshot {
  source: "editor-vnext-hidden-runtime-truth-surface"
  milestone: "post-11"
  jobItem: "J3"
  mode: "hidden-diagnostic"
  visibility: "hidden"
  truthSource: "canonical-vnext-package"
  status: EditorVNextBridgeHostSnapshotStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  runtimeTruth: {
    canonicalPackageAccepted: boolean
    currentDocumentAccepted: false
    hiddenSurfaceCanBeRuntimeTruth: boolean
    editorStateSourceOfTruthChanged: false
  }
  bridge: {
    pageCount: number
    graph: EditorVNextBridgeHostSnapshot["graph"]
    rendererConsumption: EditorVNextBridgeHostSnapshot["rendererConsumption"]
    exportReadiness: EditorVNextBridgeHostSnapshot["exportReadiness"]
    supportedOperationKinds: EditorVNextBridgeHostSnapshot["supportedOperationKinds"]
  }
  generation: {
    requestDataStatus: EditorGenerationRequestDataStatus
    requestDataConsumed: false
    templateReadyForMeasuredOutput: boolean
    outputArtifactCreated: false
    publicGenerationApiImplemented: false
    currentApiRoutes: "not-replaced"
  }
  operations: {
    supportedKinds: EditorVNextBridgeHostSnapshot["supportedOperationKinds"]
    canReportHistoryReadyMetadata: boolean
    appliesToEditorState: false
    writesEditorHistory: false
  }
  sideEffects: {
    editorState: false
    history: false
    selection: false
    paginatedPreview: false
    canvasRendering: false
    persistence: false
    apiRoutes: false
  }
  issues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextHiddenRuntimeSurfaceResult =
  | { ok: true; snapshot: EditorVNextHiddenRuntimeSurfaceSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextHiddenRuntimeSurfaceSnapshot }

function sideEffects(): EditorVNextHiddenRuntimeSurfaceSnapshot["sideEffects"] {
  return {
    editorState: false,
    history: false,
    selection: false,
    paginatedPreview: false,
    canvasRendering: false,
    persistence: false,
    apiRoutes: false,
  }
}

function mergeIssues(
  bridgeIssues: readonly EditorVNextBridgeHostIssueSummary[],
  readinessIssues: readonly EditorVNextBridgeHostIssueSummary[],
): EditorVNextBridgeHostIssueSummary[] {
  const seen = new Set<string>()
  const merged: EditorVNextBridgeHostIssueSummary[] = []

  for (const issue of [...bridgeIssues, ...readinessIssues]) {
    const key = `${issue.code}\u0000${issue.path}\u0000${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(issue)
  }

  return merged
}

export function createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(
  value: unknown,
  options: EditorVNextHiddenRuntimeSurfaceOptions = {},
): EditorVNextHiddenRuntimeSurfaceResult {
  const bridgeResult = createEditorVNextBridgeHostSnapshot(value, {
    measurementProfileId: options.measurementProfileId,
  })
  const readinessResult = createEditorGenerationReadinessSnapshot(value, options)
  const bridgeSnapshot = bridgeResult.snapshot
  const readinessSnapshot = readinessResult.snapshot
  const canBeRuntimeTruth = bridgeResult.ok
    && readinessResult.ok
    && bridgeSnapshot.status !== "blocked"
    && readinessSnapshot.readiness.templateReadyForMeasuredOutput

  const snapshot: EditorVNextHiddenRuntimeSurfaceSnapshot = {
    source: "editor-vnext-hidden-runtime-truth-surface",
    milestone: "post-11",
    jobItem: "J3",
    mode: "hidden-diagnostic",
    visibility: "hidden",
    truthSource: "canonical-vnext-package",
    status: bridgeSnapshot.status,
    documentId: bridgeSnapshot.documentId,
    packageVersion: bridgeSnapshot.packageVersion,
    documentVersion: bridgeSnapshot.documentVersion,
    runtimeTruth: {
      canonicalPackageAccepted: bridgeResult.ok,
      currentDocumentAccepted: false,
      hiddenSurfaceCanBeRuntimeTruth: canBeRuntimeTruth,
      editorStateSourceOfTruthChanged: false,
    },
    bridge: {
      pageCount: bridgeSnapshot.pageCount,
      graph: bridgeSnapshot.graph,
      rendererConsumption: bridgeSnapshot.rendererConsumption,
      exportReadiness: bridgeSnapshot.exportReadiness,
      supportedOperationKinds: bridgeSnapshot.supportedOperationKinds,
    },
    generation: {
      requestDataStatus: readinessSnapshot.generation.requestData.status,
      requestDataConsumed: false,
      templateReadyForMeasuredOutput: readinessSnapshot.readiness.templateReadyForMeasuredOutput,
      outputArtifactCreated: false,
      publicGenerationApiImplemented: false,
      currentApiRoutes: "not-replaced",
    },
    operations: {
      supportedKinds: bridgeSnapshot.supportedOperationKinds,
      canReportHistoryReadyMetadata: bridgeSnapshot.supportedOperationKinds.includes("text-block.text.replace"),
      appliesToEditorState: false,
      writesEditorHistory: false,
    },
    sideEffects: sideEffects(),
    issues: mergeIssues(bridgeSnapshot.issues, readinessSnapshot.issues),
  }

  if (!bridgeResult.ok) {
    return {
      ok: false,
      reason: bridgeResult.reason,
      snapshot,
    }
  }

  if (!readinessResult.ok) {
    return {
      ok: false,
      reason: readinessResult.reason,
      snapshot,
    }
  }

  return {
    ok: true,
    snapshot,
  }
}
