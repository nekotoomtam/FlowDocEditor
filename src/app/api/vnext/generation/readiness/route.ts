import { NextRequest, NextResponse } from "next/server"
import {
  createEditorVNextHiddenRuntimeTruthSurfaceSnapshot,
  type EditorVNextHiddenRuntimeSurfaceOptions,
} from "../../../../editor/_components/vnextBridge/editorVNextHiddenRuntimeSurface"

type VNextGenerationOutputKind = "preview" | "pdf" | "docx"

const OUTPUT_KINDS = new Set<VNextGenerationOutputKind>(["preview", "pdf", "docx"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function parseOutputKind(value: unknown): VNextGenerationOutputKind {
  if (!isRecord(value) || !hasOwn(value, "kind")) return "preview"
  return typeof value.kind === "string" && OUTPUT_KINDS.has(value.kind as VNextGenerationOutputKind)
    ? value.kind as VNextGenerationOutputKind
    : "preview"
}

function parseMeasurementProfileId(value: unknown): string | undefined {
  if (!isRecord(value) || !hasOwn(value, "measurementProfileId")) return undefined
  return typeof value.measurementProfileId === "string" ? value.measurementProfileId : undefined
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!isRecord(body) || !isRecord(body.template) || !hasOwn(body.template, "package")) {
    return NextResponse.json({
      error: "Invalid vNext generation request",
      code: "VNEXT_TEMPLATE_PACKAGE_REQUIRED",
    }, { status: 400 })
  }

  const output = isRecord(body.output) ? body.output : undefined
  const options: EditorVNextHiddenRuntimeSurfaceOptions = {}
  const measurementProfileId = parseMeasurementProfileId(output)
  if (measurementProfileId) options.measurementProfileId = measurementProfileId
  if (hasOwn(body, "data")) options.data = body.data

  const result = createEditorVNextHiddenRuntimeTruthSurfaceSnapshot(body.template.package, options)
  const snapshot = result.snapshot
  const responseBody = {
    source: "vnext-generation-readiness-api",
    mode: "readiness-diagnostic",
    ...(typeof body.requestId === "string" ? { requestId: body.requestId } : {}),
    status: snapshot.status,
    output: {
      kind: parseOutputKind(output),
      artifactRendered: false,
    },
    template: {
      input: "canonical-vnext-package",
      documentId: snapshot.documentId,
      packageVersion: snapshot.packageVersion,
      documentVersion: snapshot.documentVersion,
    },
    generation: {
      requestData: snapshot.generation.requestDataStatus,
      requestDataConsumed: false,
      bindingRuntimeView: "not-materialized",
      outputArtifact: "not-rendered",
      currentApiRoutes: "not-replaced",
    },
    bridge: {
      pageCount: snapshot.bridge.pageCount,
      graphNodeCount: snapshot.bridge.graph.nodeCount,
      rendererConsumptionStatus: snapshot.bridge.rendererConsumption.status,
      exportReadinessStatus: snapshot.bridge.exportReadiness.status,
    },
    sideEffects: {
      editorState: false,
      history: false,
      selection: false,
      paginatedPreview: false,
      canvasRendering: false,
      persistence: false,
      apiRoutesReplaced: false,
    },
    issues: snapshot.issues,
  }

  if (!result.ok) {
    return NextResponse.json({
      error: "vNext generation readiness blocked",
      code: "VNEXT_GENERATION_READINESS_BLOCKED",
      reason: result.reason,
      ...responseBody,
    }, { status: 400 })
  }

  return NextResponse.json(responseBody)
}
