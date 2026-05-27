export type EditorPreviewLayoutStatus =
  | "placeholder"
  | "settling"
  | "partial"
  | "full"

export interface EditorPreviewLayoutState {
  status: EditorPreviewLayoutStatus
  blocksCanvas: boolean
  generation: number | null
}

export function createEditorPreviewPlaceholderLayoutState(): EditorPreviewLayoutState {
  return {
    status: "placeholder",
    blocksCanvas: true,
    generation: null,
  }
}

export function markEditorPreviewLayoutSettling(
  generation: number,
  options: { blocksCanvas: boolean },
): EditorPreviewLayoutState {
  return {
    status: "settling",
    blocksCanvas: options.blocksCanvas,
    generation,
  }
}

export function markEditorPreviewLayoutPartial(generation: number): EditorPreviewLayoutState {
  return {
    status: "partial",
    blocksCanvas: false,
    generation,
  }
}

export function markEditorPreviewLayoutFull(generation: number): EditorPreviewLayoutState {
  return {
    status: "full",
    blocksCanvas: false,
    generation,
  }
}

export function isEditorPreviewLayoutFull(status: EditorPreviewLayoutStatus): boolean {
  return status === "full"
}

export function shouldBlockEditorPreviewCanvas(state: EditorPreviewLayoutState): boolean {
  return state.blocksCanvas
}
