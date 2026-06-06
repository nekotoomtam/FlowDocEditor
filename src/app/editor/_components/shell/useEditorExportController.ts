import { useCallback, type MutableRefObject } from "react"
import {
  FLOWDOC_EXPORT_PROFILE_HEADER,
  formatFlowDocExportProfileSummary,
  parseFlowDocExportProfileHeader,
} from "@/app/_lib/exportProfile"
import { LAYOUT_WARNINGS_BLOCKED_CODE } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  FLOWDOC_FONT_FALLBACK_VALUE,
  FLOWDOC_FONT_HEADER,
} from "./editorShellConstants"
import type { EditorDocumentIoStatus } from "./editorShellTypes"
import {
  buildExportFeedback,
} from "./EditorExportFeedback"
import type {
  EditorExportFeedback,
  EditorExportFormat,
} from "./EditorToolbar"
import {
  formatExportReadinessMessage,
  type ExportReadiness,
} from "../exportReadiness"

export function useEditorExportController({
  docRef,
  exportReadiness,
  finalizeInlineEditBeforeAction,
  resolvePreviewDoc,
  setDocumentIoStatus,
  setExportError,
  setExportFeedback,
  setFontFallback,
  setIsExporting,
}: {
  docRef: MutableRefObject<DocumentNode>
  exportReadiness: ExportReadiness
  finalizeInlineEditBeforeAction: () => boolean
  resolvePreviewDoc: (doc: DocumentNode) => DocumentNode
  setDocumentIoStatus: (status: EditorDocumentIoStatus | null) => void
  setExportError: (error: string | null) => void
  setExportFeedback: (feedback: EditorExportFeedback | null) => void
  setFontFallback: (active: boolean) => void
  setIsExporting: (active: boolean) => void
}) {
  const handleExport = useCallback(async (format: EditorExportFormat) => {
    const exportStartedAt = Date.now()
    setExportFeedback(buildExportFeedback(format, "preflight", exportStartedAt))
    const finalizedActiveEdit = finalizeInlineEditBeforeAction()
    const exportDoc = resolvePreviewDoc(docRef.current)
    const formatLabel = format.toUpperCase()
    const readiness = finalizedActiveEdit
      ? {
        canExport: false,
        reasons: ["server layout has not checked the current document"],
      }
      : exportReadiness
    const blockedReason = formatExportReadinessMessage(readiness)
    if (blockedReason) {
      setExportFeedback(null)
      setDocumentIoStatus(null)
      setExportError(`${formatLabel} export blocked: ${blockedReason}`)
      return
    }

    setExportError(null)
    setDocumentIoStatus({
      type: "info",
      message: format === "pdf"
        ? "Exporting PDF: paginating and rendering page batches..."
        : "Exporting DOCX: paginating and rendering...",
    })
    setIsExporting(true)
    try {
      setExportFeedback(buildExportFeedback(format, "uploading", exportStartedAt))
      const exportRequest = fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: exportDoc, format }),
      })
      setExportFeedback(buildExportFeedback(format, "processing", exportStartedAt))
      const res = await exportRequest
      if (!res.ok) {
        const responseText = await res.text()
        let errorCode: string | null = null
        let errorMessage = responseText
        try {
          const body = JSON.parse(responseText) as { code?: unknown; error?: unknown }
          errorCode = typeof body.code === "string" ? body.code : null
          errorMessage = typeof body.error === "string" ? body.error : responseText
        } catch { }
        if (errorCode === "FONT_FALLBACK_BLOCKED") {
          setFontFallback(true)
          setDocumentIoStatus(null)
          setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
          return
        }
        if (errorCode === LAYOUT_WARNINGS_BLOCKED_CODE) {
          setDocumentIoStatus(null)
          setExportError(`${formatLabel} export blocked: layout warnings block final export`)
          return
        }
        throw new Error(`export failed: ${res.status} ${errorCode ?? ""} ${errorMessage}`)
      }
      if (res.headers.get(FLOWDOC_FONT_HEADER) === FLOWDOC_FONT_FALLBACK_VALUE) {
        setFontFallback(true)
        setDocumentIoStatus(null)
        setExportError(`${formatLabel} export blocked: runtime font fallback is active`)
        return
      }
      const exportProfile = parseFlowDocExportProfileHeader(res.headers.get(FLOWDOC_EXPORT_PROFILE_HEADER))
      setExportFeedback(buildExportFeedback(format, "downloading", exportStartedAt))
      setDocumentIoStatus({ type: "info", message: `Preparing ${formatLabel} download...` })
      setFontFallback(false)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `document.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
      setDocumentIoStatus({
        type: "info",
        message: formatFlowDocExportProfileSummary(exportProfile) ?? `${formatLabel} export ready.`,
      })
      setExportError(null)
    } catch (err) {
      setDocumentIoStatus(null)
      setExportError(`${formatLabel} export failed. Please try again.`)
      console.error("export error:", err)
    } finally {
      setIsExporting(false)
      setExportFeedback(null)
    }
  }, [
    docRef,
    exportReadiness,
    finalizeInlineEditBeforeAction,
    resolvePreviewDoc,
    setDocumentIoStatus,
    setExportError,
    setExportFeedback,
    setFontFallback,
    setIsExporting,
  ])

  return {
    handleExport,
  }
}
