import {
  createEditorVNextBridgeHostSnapshot,
  type EditorVNextBridgeHostIssueSummary,
  type EditorVNextBridgeHostOptions,
  type EditorVNextBridgeHostSnapshot,
  type EditorVNextBridgeHostSnapshotStatus,
} from "./editorVNextBridgeHost"

export type EditorGenerationReadinessStatus = EditorVNextBridgeHostSnapshotStatus
export type EditorGenerationRequestDataStatus = "not-provided" | "provided-not-consumed"

export interface EditorGenerationReadinessOptions extends EditorVNextBridgeHostOptions {
  data?: unknown
}

export interface EditorGenerationReadinessSnapshot {
  source: "editor-generation-readiness-diagnostic"
  phase: "11.5"
  mode: "read-only"
  input: "canonical-vnext-package"
  status: EditorGenerationReadinessStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  generation: {
    template: "canonical-vnext-package"
    requestData: {
      status: EditorGenerationRequestDataStatus
      consumed: false
    }
    bindingRuntimeView: "not-materialized"
    outputArtifact: "not-rendered"
    currentApiRoutes: "not-replaced"
  }
  readiness: {
    bridgeRuntimeOk: boolean
    templateReadyForMeasuredOutput: boolean
    outputArtifactCreated: false
    publicGenerationApiImplemented: false
  }
  bridge: {
    pageCount: number
    graph: EditorVNextBridgeHostSnapshot["graph"]
    rendererConsumption: EditorVNextBridgeHostSnapshot["rendererConsumption"]
    exportReadiness: EditorVNextBridgeHostSnapshot["exportReadiness"]
    supportedOperationKinds: EditorVNextBridgeHostSnapshot["supportedOperationKinds"]
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

export type EditorGenerationReadinessResult =
  | { ok: true; snapshot: EditorGenerationReadinessSnapshot }
  | { ok: false; reason: string; snapshot: EditorGenerationReadinessSnapshot }

function hasProvidedData(options: EditorGenerationReadinessOptions): boolean {
  return Object.prototype.hasOwnProperty.call(options, "data")
}

function isTemplateReadyForMeasuredOutput(snapshot: EditorVNextBridgeHostSnapshot): boolean {
  return snapshot.status !== "blocked"
    && snapshot.rendererConsumption.status !== "blocked"
    && snapshot.exportReadiness.status !== "blocked"
}

function createReadinessSnapshot(
  bridgeSnapshot: EditorVNextBridgeHostSnapshot,
  options: EditorGenerationReadinessOptions,
  bridgeRuntimeOk: boolean,
): EditorGenerationReadinessSnapshot {
  return {
    source: "editor-generation-readiness-diagnostic",
    phase: "11.5",
    mode: "read-only",
    input: bridgeSnapshot.input,
    status: bridgeSnapshot.status,
    documentId: bridgeSnapshot.documentId,
    packageVersion: bridgeSnapshot.packageVersion,
    documentVersion: bridgeSnapshot.documentVersion,
    generation: {
      template: "canonical-vnext-package",
      requestData: {
        status: hasProvidedData(options) ? "provided-not-consumed" : "not-provided",
        consumed: false,
      },
      bindingRuntimeView: "not-materialized",
      outputArtifact: "not-rendered",
      currentApiRoutes: "not-replaced",
    },
    readiness: {
      bridgeRuntimeOk,
      templateReadyForMeasuredOutput: bridgeRuntimeOk && isTemplateReadyForMeasuredOutput(bridgeSnapshot),
      outputArtifactCreated: false,
      publicGenerationApiImplemented: false,
    },
    bridge: {
      pageCount: bridgeSnapshot.pageCount,
      graph: bridgeSnapshot.graph,
      rendererConsumption: bridgeSnapshot.rendererConsumption,
      exportReadiness: bridgeSnapshot.exportReadiness,
      supportedOperationKinds: bridgeSnapshot.supportedOperationKinds,
    },
    sideEffects: {
      editorState: false,
      history: false,
      selection: false,
      paginatedPreview: false,
      canvasRendering: false,
      apiRoutes: false,
    },
    issues: bridgeSnapshot.issues,
  }
}

export function createEditorGenerationReadinessSnapshot(
  value: unknown,
  options: EditorGenerationReadinessOptions = {},
): EditorGenerationReadinessResult {
  const bridgeResult = createEditorVNextBridgeHostSnapshot(value, {
    measurementProfileId: options.measurementProfileId,
  })
  const snapshot = createReadinessSnapshot(bridgeResult.snapshot, options, bridgeResult.ok)

  if (!bridgeResult.ok) {
    return {
      ok: false,
      reason: bridgeResult.reason,
      snapshot,
    }
  }

  return {
    ok: true,
    snapshot,
  }
}
