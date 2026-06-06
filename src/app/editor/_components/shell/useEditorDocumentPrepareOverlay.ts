import { useEffect, useMemo, useState } from "react"
import {
  clearDocumentPrepareHandoff,
  getDocumentPrepareStep,
  type DocumentPrepareHandoff,
  type DocumentPrepareStepId,
} from "../documentLibrary"
import { readInitialDocumentPrepareHandoff } from "./editorPrepareHandoff"
import type { EditorPrepareOverlayStatus } from "./editorShellTypes"

export function useEditorDocumentPrepareOverlay(showBrowserPreviewLayoutPreparing: boolean) {
  const initialPrepareHandoff = useMemo(() => readInitialDocumentPrepareHandoff(), [])
  const [documentPrepareHandoff, setDocumentPrepareHandoff] = useState<DocumentPrepareHandoff | null>(initialPrepareHandoff)
  const [documentPrepareStepId, setDocumentPrepareStepId] = useState<DocumentPrepareStepId>("editor-start-session")
  const [documentPrepareOverlayStatus, setDocumentPrepareOverlayStatus] = useState<EditorPrepareOverlayStatus>("visible")
  const showDocumentPrepareOverlay = documentPrepareOverlayStatus !== "hidden"
  const showInlineInitialLayoutLoading = showBrowserPreviewLayoutPreparing && !showDocumentPrepareOverlay
  const documentPrepareStep = getDocumentPrepareStep(documentPrepareStepId)
  const documentPrepareTitle = documentPrepareHandoff?.templateTitle ?? null

  useEffect(() => {
    if (documentPrepareOverlayStatus !== "visible") return
    if (showBrowserPreviewLayoutPreparing) {
      setDocumentPrepareStepId("editor-build-layout")
      return
    }
    setDocumentPrepareStepId("editor-ready")
    const timeoutId = window.setTimeout(() => {
      setDocumentPrepareOverlayStatus("fading")
    }, 160)
    return () => window.clearTimeout(timeoutId)
  }, [documentPrepareOverlayStatus, showBrowserPreviewLayoutPreparing])

  useEffect(() => {
    if (documentPrepareOverlayStatus !== "fading") return
    const timeoutId = window.setTimeout(() => {
      setDocumentPrepareOverlayStatus("hidden")
      setDocumentPrepareHandoff(null)
      clearDocumentPrepareHandoff(window.sessionStorage)
    }, 240)
    return () => window.clearTimeout(timeoutId)
  }, [documentPrepareOverlayStatus])

  return {
    showDocumentPrepareOverlay,
    showInlineInitialLayoutLoading,
    documentPrepareStep,
    documentPrepareTitle,
    documentPrepareOverlayStatus,
  }
}
