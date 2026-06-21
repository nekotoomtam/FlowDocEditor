import { NextRequest, NextResponse } from "next/server"
import {
  createEditorVNextPreviewArtifactSnapshot,
  type EditorVNextPreviewArtifactData,
  type EditorVNextPreviewArtifactOptions,
} from "../../../../editor/_components/vnextBridge/editorVNextBridgeHost"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function parseMeasurementProfileId(value: unknown): string | undefined {
  if (!isRecord(value) || !hasOwn(value, "measurementProfileId")) return undefined
  return typeof value.measurementProfileId === "string" ? value.measurementProfileId : undefined
}

function parseMaxCommands(value: unknown): number | undefined {
  if (!isRecord(value) || !hasOwn(value, "maxCommands")) return undefined
  return typeof value.maxCommands === "number" && Number.isFinite(value.maxCommands)
    ? value.maxCommands
    : undefined
}

function parsePrimitiveData(value: unknown): EditorVNextPreviewArtifactData | null {
  if (value == null) return {}
  if (!isRecord(value)) return null

  const data: EditorVNextPreviewArtifactData = {}
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      return null
    }
    data[key] = entry
  }
  return data
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
      error: "Invalid vNext preview artifact request",
      code: "VNEXT_TEMPLATE_PACKAGE_REQUIRED",
    }, { status: 400 })
  }

  const output = isRecord(body.output) ? body.output : undefined
  if (output != null && hasOwn(output, "kind") && output.kind !== "preview") {
    return NextResponse.json({
      error: "Invalid vNext preview artifact output kind",
      code: "VNEXT_PREVIEW_OUTPUT_KIND_REQUIRED",
    }, { status: 400 })
  }

  const data = hasOwn(body, "data") ? parsePrimitiveData(body.data) : undefined
  if (data === null) {
    return NextResponse.json({
      error: "Invalid vNext preview artifact data",
      code: "VNEXT_PRIMITIVE_DATA_REQUIRED",
    }, { status: 400 })
  }

  const options: EditorVNextPreviewArtifactOptions = {}
  const measurementProfileId = parseMeasurementProfileId(output)
  const maxCommands = parseMaxCommands(output)
  if (measurementProfileId) options.measurementProfileId = measurementProfileId
  if (maxCommands !== undefined) options.maxCommands = maxCommands
  if (data !== undefined) options.data = data

  const result = createEditorVNextPreviewArtifactSnapshot(body.template.package, options)
  const snapshot = result.snapshot
  const responseBody = {
    source: "vnext-preview-artifact-api",
    mode: "measured-preview-artifact",
    ...(typeof body.requestId === "string" ? { requestId: body.requestId } : {}),
    status: snapshot.status,
    template: {
      input: "canonical-vnext-package",
      documentId: snapshot.documentId,
      packageVersion: snapshot.packageVersion,
      documentVersion: snapshot.documentVersion,
    },
    artifact: snapshot.artifact,
    rendererContract: snapshot.rendererContract,
    pages: snapshot.pages,
    commands: snapshot.commands,
    sideEffects: snapshot.sideEffects,
    issues: snapshot.issues,
  }

  if (!result.ok) {
    return NextResponse.json({
      error: "vNext preview artifact blocked",
      code: "VNEXT_PREVIEW_ARTIFACT_BLOCKED",
      reason: result.reason,
      ...responseBody,
    }, { status: 400 })
  }

  return NextResponse.json(responseBody)
}
