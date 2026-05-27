import type {
  CSSProperties,
  ChangeEventHandler,
  ReactNode,
  RefObject,
} from "react"
import type { LayoutWarningSummary } from "@/pagination"
import type { EditorTextMeasurerStatus } from "../editorTextMeasurerState"

export type EditorWorkflowMode = "design" | "fields" | "fill" | "render"
export type EditorExportFormat = "pdf" | "docx"
export type EditorExportFeedbackStage = "preflight" | "uploading" | "processing" | "downloading"

export interface EditorWorkflowNavItem {
  mode: EditorWorkflowMode
  label: string
  description: string
  icon: string
  badge?: string
}

export interface EditorDocumentIoStatus {
  type: "info" | "error"
  message: string
}

export interface EditorExportFeedback {
  format: EditorExportFormat
  stage: EditorExportFeedbackStage
  title: string
  detail: string
  steps: string[]
  startedAt: number
}

export interface EditorToolbarProps {
  workflowMode: EditorWorkflowMode
  workflowNavItems: EditorWorkflowNavItem[]
  onActivateWorkflowMode: (mode: EditorWorkflowMode) => void
  fontFallback: boolean
  editorTextMeasurerStatus: EditorTextMeasurerStatus
  layoutError: boolean
  authoritativeLayoutWarnings: LayoutWarningSummary[]
  layoutWarningSource: string
  exportError: string | null
  exportReadinessStatusReason: string | null
  exportReadinessMessage: string | null
  exportFeedback: EditorExportFeedback | null
  exportFeedbackElapsedMs: number | null
  documentIoStatus: EditorDocumentIoStatus | null
  dragStatusLabel: string | null
  isExporting: boolean
  canExport: boolean
  onExport: (format: EditorExportFormat) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  showTextSegments: boolean
  onToggleTextSegments: () => void
  showDrift: boolean
  driftCount: number | null
  driftTotalParagraphs: number | null
  onToggleDrift: () => void
  importRef: RefObject<HTMLInputElement | null>
  onNewDocument: () => void
  onImportJson: ChangeEventHandler<HTMLInputElement>
  onExportJson: () => void
  children?: ReactNode
}

const toolbarShellStyle: CSSProperties = {
  padding: "8px 16px 9px",
  background: "white",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  flexShrink: 0,
}

const workflowBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  flexWrap: "wrap",
}

const commandBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  flexWrap: "wrap",
}

const workflowNavStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 6,
  minWidth: 0,
  flexWrap: "wrap",
}

const workflowNavButton = (active: boolean): CSSProperties => ({
  width: 118,
  minHeight: 40,
  border: `1px solid ${active ? "#bfdbfe" : "#e5e7eb"}`,
  borderRadius: 6,
  background: active ? "#eff6ff" : "#f8fafc",
  color: active ? "#1d4ed8" : "#475569",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  textAlign: "left",
  boxSizing: "border-box",
  boxShadow: active ? "inset 0 -2px 0 #2563eb" : "none",
})

const workflowNavIcon = (active: boolean): CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 5,
  background: active ? "#dbeafe" : "#e2e8f0",
  color: active ? "#1d4ed8" : "#475569",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 800,
  flexShrink: 0,
})

const workflowNavText: CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
}

const workflowNavTitle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
  fontSize: 11,
  fontWeight: 800,
}

const workflowNavDescription: CSSProperties = {
  fontSize: 9,
  color: "#94a3b8",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const workflowNavBadge: CSSProperties = {
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  padding: "0 5px",
  background: "#dbeafe",
  color: "#1d4ed8",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  fontWeight: 800,
}

const toolbarGroupStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  alignItems: "center",
}

const toolbarSeparatorStyle: CSSProperties = {
  width: 1,
  height: 16,
  background: "#e5e7eb",
  flexShrink: 0,
}

const statusRegionShellStyle: CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  gap: 8,
  alignItems: "center",
  minHeight: 24,
  minWidth: 0,
}

const statusRegionStyle: CSSProperties = {
  width: 430,
  maxWidth: "34vw",
  minWidth: 160,
  minHeight: 20,
  display: "flex",
  gap: 6,
  alignItems: "center",
  justifyContent: "flex-end",
  overflow: "hidden",
  whiteSpace: "nowrap",
}

const warningStatusStyle: CSSProperties = {
  fontSize: 10,
  color: "#d97706",
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const errorStatusStyle: CSSProperties = {
  fontSize: 10,
  color: "#dc2626",
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const exportFeedbackStatusStyle: CSSProperties = {
  fontSize: 10,
  color: "#2563eb",
  maxWidth: 300,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const toolbarButtonStyle = (disabled = false): CSSProperties => ({
  padding: "4px 8px",
  fontSize: 11,
  cursor: disabled ? "not-allowed" : "pointer",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: "white",
  color: disabled ? "#d1d5db" : "#374151",
})

const exportButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "4px 10px",
  fontSize: 11,
  cursor: disabled ? "not-allowed" : "pointer",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: disabled ? "#f9fafb" : "white",
  color: disabled ? "#9ca3af" : "#374151",
})

const toggleButtonStyle = (active: boolean, activeColor: string, activeBackground: string): CSSProperties => ({
  padding: "4px 8px",
  fontSize: 11,
  cursor: "pointer",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  background: active ? activeBackground : "white",
  color: active ? activeColor : "#374151",
})

function formatExportFeedbackElapsed(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "0:00"
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function exportFeedbackTooltip(feedback: EditorExportFeedback, elapsedMs: number | null): string {
  const lines = [
    `${feedback.format.toUpperCase()} export: ${feedback.title}`,
    feedback.detail,
    `Elapsed: ${formatExportFeedbackElapsed(elapsedMs)}`,
  ]
  if (feedback.steps.length > 0) {
    lines.push("", "This stage includes:", ...feedback.steps.map((step) => `- ${step}`))
  }
  return lines.join("\n")
}

function EditorStatusRegion({
  fontFallback,
  editorTextMeasurerStatus,
  layoutError,
  authoritativeLayoutWarnings,
  layoutWarningSource,
  exportError,
  exportReadinessStatusReason,
  exportReadinessMessage,
  exportFeedback,
  exportFeedbackElapsedMs,
  documentIoStatus,
  dragStatusLabel,
}: Pick<
  EditorToolbarProps,
  | "fontFallback"
  | "editorTextMeasurerStatus"
  | "layoutError"
  | "authoritativeLayoutWarnings"
  | "layoutWarningSource"
  | "exportError"
  | "exportReadinessStatusReason"
  | "exportReadinessMessage"
  | "exportFeedback"
  | "exportFeedbackElapsedMs"
  | "documentIoStatus"
  | "dragStatusLabel"
>) {
  return (
    <div data-testid="editor-status-region" style={statusRegionStyle}>
      {fontFallback && (
        <span data-testid="font-fallback-status" title="Server is using Helvetica fallback — Thai text layout may be incorrect" style={{ fontSize: 10, color: "#d97706", cursor: "help", flexShrink: 0 }}>
          ⚠ fallback font
        </span>
      )}
      {editorTextMeasurerStatus === "loading" && (
        <span data-testid="browser-font-loading-status" title="Browser font metrics are still loading; preview may settle again shortly" style={{ fontSize: 10, color: "#64748b", cursor: "help", flexShrink: 0 }}>
          font loading
        </span>
      )}
      {editorTextMeasurerStatus === "fallback" && !fontFallback && (
        <span data-testid="browser-font-fallback-status" title="Browser preview is using fallback text metrics; server/export pagination remains authoritative" style={{ fontSize: 10, color: "#d97706", cursor: "help", flexShrink: 0 }}>
          ⚠ browser font
        </span>
      )}
      {layoutError && (
        <span data-testid="layout-error-badge" title="Server pagination failed — editor is showing browser preview only" style={{ fontSize: 10, color: "#dc2626", cursor: "help", flexShrink: 0 }}>
          ⚠ layout error
        </span>
      )}
      {authoritativeLayoutWarnings.length > 0 && (
        <span
          data-testid="layout-warning-status"
          title={authoritativeLayoutWarnings.map((warning) => `${layoutWarningSource} ${warning.count} ${warning.message}`).join("; ")}
          style={warningStatusStyle}
        >
          layout warning: {layoutWarningSource} {authoritativeLayoutWarnings[0].message}
        </span>
      )}
      {exportError && (
        <span data-testid="export-error" title={exportError} style={errorStatusStyle}>
          {exportError}
        </span>
      )}
      {exportReadinessStatusReason && !exportError && (
        <span
          data-testid="export-readiness-status"
          title={exportReadinessMessage ?? undefined}
          style={{ ...warningStatusStyle, maxWidth: 260 }}
        >
          export blocked: {exportReadinessStatusReason}
        </span>
      )}
      {exportFeedback && !exportError ? (
        <span
          data-testid="export-feedback-status"
          title={exportFeedbackTooltip(exportFeedback, exportFeedbackElapsedMs)}
          style={exportFeedbackStatusStyle}
        >
          {exportFeedback.format.toUpperCase()} export: {exportFeedback.title} ({formatExportFeedbackElapsed(exportFeedbackElapsedMs)})
        </span>
      ) : documentIoStatus && (
        <span
          data-testid="document-io-status"
          title={documentIoStatus.message}
          style={{
            fontSize: 10,
            color: documentIoStatus.type === "error" ? "#dc2626" : "#2563eb",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {documentIoStatus.message}
        </span>
      )}
      {dragStatusLabel && (
        <span
          style={{
            fontSize: 11,
            color: "#6b7280",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {dragStatusLabel}
        </span>
      )}
    </div>
  )
}

export function EditorToolbar({
  workflowMode,
  workflowNavItems,
  onActivateWorkflowMode,
  fontFallback,
  editorTextMeasurerStatus,
  layoutError,
  authoritativeLayoutWarnings,
  layoutWarningSource,
  exportError,
  exportReadinessStatusReason,
  exportReadinessMessage,
  exportFeedback,
  exportFeedbackElapsedMs,
  documentIoStatus,
  dragStatusLabel,
  isExporting,
  canExport,
  onExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showTextSegments,
  onToggleTextSegments,
  showDrift,
  driftCount,
  driftTotalParagraphs,
  onToggleDrift,
  importRef,
  onNewDocument,
  onImportJson,
  onExportJson,
  children,
}: EditorToolbarProps) {
  const driftLabel = showDrift && driftCount !== null && driftTotalParagraphs !== null && driftCount > 0
    ? `Drift ${driftCount}/${driftTotalParagraphs}`
    : "Drift"

  return (
    <div data-testid="editor-toolbar" style={toolbarShellStyle}>
      <div data-testid="editor-workflow-bar" style={workflowBarStyle}>
        <span style={{ fontSize: 13, fontWeight: "bold", color: "#111827", flexShrink: 0 }}>FlowDoc Editor</span>
        <div data-testid="editor-workflow-nav" style={workflowNavStyle}>
          {workflowNavItems.map((item) => {
            const active = workflowMode === item.mode
            return (
              <button
                key={item.mode}
                type="button"
                data-testid={`editor-workflow-${item.mode}`}
                aria-pressed={active}
                title={`${item.label}: ${item.description}`}
                onClick={() => onActivateWorkflowMode(item.mode)}
                style={workflowNavButton(active)}
              >
                <span style={workflowNavIcon(active)}>{item.icon}</span>
                <span style={workflowNavText}>
                  <span style={workflowNavTitle}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                    {item.badge && <span style={workflowNavBadge}>{item.badge}</span>}
                  </span>
                  <span style={workflowNavDescription}>{item.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div style={statusRegionShellStyle}>
          <EditorStatusRegion
            fontFallback={fontFallback}
            editorTextMeasurerStatus={editorTextMeasurerStatus}
            layoutError={layoutError}
            authoritativeLayoutWarnings={authoritativeLayoutWarnings}
            layoutWarningSource={layoutWarningSource}
            exportError={exportError}
            exportReadinessStatusReason={exportReadinessStatusReason}
            exportReadinessMessage={exportReadinessMessage}
            exportFeedback={exportFeedback}
            exportFeedbackElapsedMs={exportFeedbackElapsedMs}
            documentIoStatus={documentIoStatus}
            dragStatusLabel={dragStatusLabel}
          />
          {(["pdf", "docx"] as const).map((format) => {
            const disabled = isExporting || !canExport
            return (
              <button
                key={format}
                disabled={disabled}
                onClick={() => onExport(format)}
                title={!canExport && exportReadinessMessage ? `Export blocked: ${exportReadinessMessage}` : undefined}
                style={exportButtonStyle(disabled)}
              >
                {isExporting
                  ? exportFeedback?.format === format
                    ? `Exporting ${format.toUpperCase()}`
                    : format.toUpperCase()
                  : `Export ${format.toUpperCase()}`}
              </button>
            )
          })}
        </div>
      </div>

      <div data-testid="editor-command-bar" style={commandBarStyle}>
        <div style={toolbarGroupStyle}>
          <button
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            style={toolbarButtonStyle(!canUndo)}
          >
            Undo
          </button>
          <button
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            style={toolbarButtonStyle(!canRedo)}
          >
            Redo
          </button>
        </div>

        <div style={toolbarSeparatorStyle} />

        <div style={toolbarGroupStyle}>
          <button
            onClick={onToggleTextSegments}
            title="Toggle text segment overlay"
            style={toggleButtonStyle(showTextSegments, "#166534", "#dcfce7")}
          >
            Segments
          </button>
          <button
            onClick={onToggleDrift}
            title="Toggle layout drift overlay (browser vs server pagination)"
            style={toggleButtonStyle(showDrift, "#c2410c", "#fff7ed")}
          >
            {driftLabel}
          </button>
        </div>

        <div style={toolbarSeparatorStyle} />

        <div style={toolbarGroupStyle}>
          <button onClick={onNewDocument} style={toolbarButtonStyle()}>
            New
          </button>
          <button onClick={() => importRef.current?.click()} style={toolbarButtonStyle()}>
            Open…
          </button>
          <input ref={importRef} type="file" accept=".flowdoc.json,.json,application/json" style={{ display: "none" }} onChange={onImportJson} />
          <button onClick={onExportJson} style={toolbarButtonStyle()}>
            Save JSON
          </button>
        </div>
      </div>

      {children}
    </div>
  )
}
