import { useEffect, useRef, useState, type ComponentProps } from "react"
import type { EditorPreviewLayoutStatus } from "../editorPreviewLayoutStatus"
import { EditorLeftRail } from "./EditorLeftRail"
import { EditorSubtreePerfProfiler, StructuralPaintDeferredSubtree } from "./EditorShellPerfChrome"
import { shouldDeferInitialLeftRailOutline } from "./leftRailInitialRenderPolicy"

interface EditorLeftRailPaneProps extends ComponentProps<typeof EditorLeftRail> {
  deferLeftRailForStructuralPaint: boolean
  deferOutlineSelection: boolean
  previewLayoutStatus: EditorPreviewLayoutStatus
  wysiwygPerfTraceActive: boolean
}

export interface DeferredLeftRailOutlineSelection {
  selectedNodeId: string | null
  activeOutlineListGroupId: string | null
}

export function resolveDeferredLeftRailOutlineSelection({
  current,
  defer,
  snapshot,
}: {
  current: DeferredLeftRailOutlineSelection
  defer: boolean
  snapshot: DeferredLeftRailOutlineSelection
}): DeferredLeftRailOutlineSelection {
  return defer ? snapshot : current
}

export function EditorLeftRailPane({
  deferLeftRailForStructuralPaint,
  deferOutlineSelection,
  previewLayoutStatus,
  wysiwygPerfTraceActive,
  ...leftRailProps
}: EditorLeftRailPaneProps) {
  const currentOutlineSelection = {
    selectedNodeId: leftRailProps.selectedNodeId,
    activeOutlineListGroupId: leftRailProps.activeOutlineListGroupId ?? null,
  }
  const outlineSelectionSnapshotRef = useRef<DeferredLeftRailOutlineSelection>(currentOutlineSelection)
  if (!deferOutlineSelection) {
    outlineSelectionSnapshotRef.current = currentOutlineSelection
  }
  const renderedOutlineSelection = resolveDeferredLeftRailOutlineSelection({
    current: currentOutlineSelection,
    defer: deferOutlineSelection,
    snapshot: outlineSelectionSnapshotRef.current,
  })
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
        data-outline-selection-deferred={deferOutlineSelection ? "true" : "false"}
        style={{ display: "flex", flexShrink: 0, pointerEvents: deferLeftRailForStructuralPaint ? "none" : "auto" }}
      >
        <StructuralPaintDeferredSubtree defer={deferLeftRailForStructuralPaint || deferOutlineSelection}>
          <EditorLeftRail
            {...leftRailProps}
            selectedNodeId={renderedOutlineSelection.selectedNodeId}
            activeOutlineListGroupId={renderedOutlineSelection.activeOutlineListGroupId}
            deferOutlineContent={deferOutlineContent}
            perfTraceActive={wysiwygPerfTraceActive}
          />
        </StructuralPaintDeferredSubtree>
      </div>
    </EditorSubtreePerfProfiler>
  )
}
