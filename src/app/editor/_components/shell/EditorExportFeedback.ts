import type {
  EditorExportFeedback,
  EditorExportFeedbackStage,
  EditorExportFormat,
} from "./EditorToolbar"

const TRANSIENT_EXPORT_READINESS_REASONS = new Set([
  "server layout has not checked the current document",
  "server layout check is still running",
])

export function firstVisibleExportReadinessReason(reasons: string[]): string | null {
  return reasons.find((reason) => !TRANSIENT_EXPORT_READINESS_REASONS.has(reason)) ?? null
}

export function buildExportFeedback(
  format: EditorExportFormat,
  stage: EditorExportFeedbackStage,
  startedAt: number,
): EditorExportFeedback {
  if (stage === "preflight") {
    return {
      format,
      stage,
      startedAt,
      title: "Checking readiness",
      detail: "Checking active edit, server layout, font, and layout gates.",
      steps: [
        "Finish active edit if needed",
        "Check export readiness",
        "Confirm server layout and warning gates",
      ],
    }
  }
  if (stage === "uploading") {
    return {
      format,
      stage,
      startedAt,
      title: "Sending document",
      detail: "Sending the current FlowDoc document to the export API.",
      steps: [
        "Serialize current document",
        "POST to /api/export",
        "Wait for server processing to start",
      ],
    }
  }
  if (stage === "processing") {
    return {
      format,
      stage,
      startedAt,
      title: "Creating file",
      detail: "Server is validating, paginating, rendering, and finalizing the export.",
      steps: format === "pdf"
        ? [
          "Validate document shape",
          "Paginate with runtime fonts",
          "Assert layout and blocking warnings",
          "Render PDF page batches",
          "Finalize PDF binary",
        ]
        : [
          "Validate document shape",
          "Paginate with runtime fonts",
          "Assert layout and blocking warnings",
          "Serialize DOCX package",
          "Finalize DOCX binary",
        ],
    }
  }
  return {
    format,
    stage,
    startedAt,
    title: "Preparing download",
    detail: "The export response is ready; creating the browser download.",
    steps: [
      "Read export profile header",
      "Create download blob",
      "Trigger browser download",
    ],
  }
}
