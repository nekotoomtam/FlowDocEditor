import { createElement, createRef } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  EditorToolbar,
  type EditorExportFeedback,
  type EditorToolbarProps,
} from "../shell/EditorToolbar"

function noop() { }

function renderToolbar(overrides: Partial<EditorToolbarProps> = {}) {
  const props: EditorToolbarProps = {
    workflowMode: "render",
    workflowNavItems: [
      { mode: "design", label: "Design", description: "Build layout", icon: "D" },
      { mode: "fields", label: "Fields", description: "Map data", icon: "F" },
      { mode: "fill", label: "Fill", description: "Preview data", icon: "I" },
      { mode: "render", label: "Render", description: "Export", icon: "R" },
    ],
    onActivateWorkflowMode: noop,
    fontFallback: false,
    editorTextMeasurerStatus: "fontkit",
    layoutError: false,
    authoritativeLayoutWarnings: [],
    layoutWarningSource: "server",
    exportError: null,
    exportReadinessStatusReason: null,
    exportReadinessMessage: null,
    exportFeedback: null,
    exportFeedbackElapsedMs: null,
    documentIoStatus: null,
    dragStatusLabel: null,
    isExporting: false,
    canExport: true,
    onExport: noop,
    canUndo: false,
    canRedo: false,
    onUndo: noop,
    onRedo: noop,
    showTextSegments: false,
    onToggleTextSegments: noop,
    showDrift: false,
    driftCount: null,
    driftTotalParagraphs: null,
    onToggleDrift: noop,
    importRef: createRef<HTMLInputElement>(),
    onNewDocument: noop,
    onImportJson: noop,
    onExportJson: noop,
    ...overrides,
  }
  return renderToStaticMarkup(createElement(EditorToolbar, props))
}

describe("EditorToolbar export feedback", () => {
  const feedback: EditorExportFeedback = {
    format: "pdf",
    stage: "processing",
    title: "Creating file",
    detail: "Server is validating, paginating, rendering, and finalizing the export.",
    steps: [
      "Validate document shape",
      "Paginate with runtime fonts",
      "Render PDF page batches",
      "Finalize PDF binary",
    ],
    startedAt: 0,
  }

  it("shows the active export stage and elapsed time", () => {
    const markup = renderToolbar({
      exportFeedback: feedback,
      exportFeedbackElapsedMs: 65_000,
      isExporting: true,
    })

    expect(markup).toContain("data-testid=\"export-feedback-status\"")
    expect(markup).toContain("PDF export: Creating file (1:05)")
    expect(markup).toContain("Render PDF page batches")
    expect(markup).toContain("Exporting PDF")
  })

  it("prioritizes export feedback over general document IO status", () => {
    const markup = renderToolbar({
      exportFeedback: feedback,
      exportFeedbackElapsedMs: 0,
      documentIoStatus: { type: "info", message: "Saved JSON" },
    })

    expect(markup).toContain("data-testid=\"export-feedback-status\"")
    expect(markup).not.toContain("Saved JSON")
  })
})
