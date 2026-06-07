import { useEffect, useState, type ComponentProps } from "react"
import type { EditorPreviewLayoutStatus } from "../editorPreviewLayoutStatus"
import { EditorLeftRail } from "./EditorLeftRail"
import { EditorSubtreePerfProfiler, StructuralPaintDeferredSubtree } from "./EditorShellPerfChrome"
import { shouldDeferInitialLeftRailOutline } from "./leftRailInitialRenderPolicy"

interface EditorLeftRailPaneProps extends ComponentProps<typeof EditorLeftRail> {
  deferLeftRailForStructuralPaint: boolean
  previewLayoutStatus: EditorPreviewLayoutStatus
  wysiwygPerfTraceActive: boolean
}

export function EditorLeftRailPane({
  deferLeftRailForStructuralPaint,
  previewLayoutStatus,
  wysiwygPerfTraceActive,
  ...leftRailProps
}: EditorLeftRailPaneProps) {
  const shouldDeferInitialOutline = shouldDeferInitialLeftRailOutline({
    doc: leftRailProps.outlineDoc,
    mode: leftRailProps.mode,
    previewLayoutStatus,
  })
  const [initialOutlineReady, setInitialOutlineReady] = useState(() => !shouldDeferInitialOutline)
  const deferOutlineContent = shouldDeferInitialOutline || !initialOutlineReady

  useEffect(() => {
    if (shouldDeferInitialOutline) {
      setInitialOutlineReady(false)
      return
    }
    setInitialOutlineReady(true)
  }, [leftRailProps.outlineDoc, shouldDeferInitialOutline])

  return (
    <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id="left-rail">
      <div
        data-structural-panel-deferred={deferLeftRailForStructuralPaint ? "true" : "false"}
        data-initial-outline-deferred={deferOutlineContent ? "true" : "false"}
        style={{ display: "flex", flexShrink: 0, pointerEvents: deferLeftRailForStructuralPaint ? "none" : "auto" }}
      >
        <StructuralPaintDeferredSubtree defer={deferLeftRailForStructuralPaint}>
          <EditorLeftRail {...leftRailProps} deferOutlineContent={deferOutlineContent} />
        </StructuralPaintDeferredSubtree>
      </div>
    </EditorSubtreePerfProfiler>
  )
}
