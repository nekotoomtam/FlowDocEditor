import type { ComponentProps } from "react"
import { EditorLeftRail } from "./EditorLeftRail"
import { EditorSubtreePerfProfiler, StructuralPaintDeferredSubtree } from "./EditorShellPerfChrome"

interface EditorLeftRailPaneProps extends ComponentProps<typeof EditorLeftRail> {
  deferLeftRailForStructuralPaint: boolean
  wysiwygPerfTraceActive: boolean
}

export function EditorLeftRailPane({
  deferLeftRailForStructuralPaint,
  wysiwygPerfTraceActive,
  ...leftRailProps
}: EditorLeftRailPaneProps) {
  return (
    <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id="left-rail">
      <div
        data-structural-panel-deferred={deferLeftRailForStructuralPaint ? "true" : "false"}
        style={{ display: "flex", flexShrink: 0, pointerEvents: deferLeftRailForStructuralPaint ? "none" : "auto" }}
      >
        <StructuralPaintDeferredSubtree defer={deferLeftRailForStructuralPaint}>
          <EditorLeftRail {...leftRailProps} />
        </StructuralPaintDeferredSubtree>
      </div>
    </EditorSubtreePerfProfiler>
  )
}
