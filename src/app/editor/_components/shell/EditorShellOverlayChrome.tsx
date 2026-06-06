import type { Ref } from "react"
import { DocumentPrepareOverlay } from "@/app/_components/DocumentPrepareOverlay"
import type { DocumentPrepareOverlayStep } from "../documentLibrary"
import { WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID } from "../useWysiwygTextSession"
import { SCREEN_READER_ONLY_STYLE } from "./editorShellConstants"
import type { EditorPrepareOverlayStatus } from "./editorShellTypes"

interface EditorShellOverlayChromeProps {
  showDocumentPrepareOverlay: boolean
  documentPrepareStep: DocumentPrepareOverlayStep
  documentPrepareTitle: string | null
  documentPrepareOverlayStatus: EditorPrepareOverlayStatus
  resizePreviewRef: Ref<HTMLDivElement>
  wysiwygTextAccessibilityStatus: string | null
}

export function EditorShellOverlayChrome({
  showDocumentPrepareOverlay,
  documentPrepareStep,
  documentPrepareTitle,
  documentPrepareOverlayStatus,
  resizePreviewRef,
  wysiwygTextAccessibilityStatus,
}: EditorShellOverlayChromeProps) {
  return (
    <>
      {showDocumentPrepareOverlay && (
        <DocumentPrepareOverlay
          step={documentPrepareStep}
          templateTitle={documentPrepareTitle}
          fadingOut={documentPrepareOverlayStatus === "fading"}
        />
      )}
      <div
        ref={resizePreviewRef}
        data-testid="column-resize-preview"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 2,
          height: 8,
          display: "none",
          backgroundColor: "#2563eb",
          boxShadow: "0 0 0 1px rgba(37, 99, 235, 0.18)",
          pointerEvents: "none",
          zIndex: 80,
          willChange: "transform",
        }}
      />
      <div
        id={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
        data-wysiwyg-accessibility-status="true"
        aria-live="polite"
        aria-atomic="true"
        style={SCREEN_READER_ONLY_STYLE}
      >
        {wysiwygTextAccessibilityStatus ?? ""}
      </div>
    </>
  )
}
