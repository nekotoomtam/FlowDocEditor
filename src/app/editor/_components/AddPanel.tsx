import type { PointerEvent } from "react"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DragSource } from "@/placement/types"
import { EditorPalette } from "./EditorPalette"
import { FieldPalette } from "./FieldPalette"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

export function AddPanel({
  registry,
  editable,
  isDragging,
  onDragStart,
}: {
  registry: FieldRegistryV1
  editable: boolean
  isDragging: boolean
  onDragStart: (source: DragSource, event: PointerEvent) => void
}) {
  return (
    <div data-testid="add-panel" style={rightRailPanelShell}>
      <RightRailPanelHeader title="Add" testId="add-panel-title" />
      <div style={{ ...rightRailPanelBody, padding: 0 }}>
        {editable ? (
          <>
            <EditorPalette onDragStart={onDragStart} isDragging={isDragging} />
            <FieldPalette registry={registry} onDragStart={onDragStart} isDragging={isDragging} />
          </>
        ) : (
          <div style={{ padding: 14, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
            Fill mode locks the template. Switch to Template mode to add blocks or fields.
          </div>
        )}
      </div>
    </div>
  )
}
