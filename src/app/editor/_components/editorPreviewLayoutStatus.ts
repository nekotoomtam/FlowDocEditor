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

export function markEditorPreviewLayoutSettlingFromCurrent(
  generation: number,
  current: EditorPreviewLayoutState,
): EditorPreviewLayoutState {
  return markEditorPreviewLayoutSettling(generation, {
    blocksCanvas: current.blocksCanvas,
  })
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

export function areEditorPreviewLayoutStatesEqual(
  current: EditorPreviewLayoutState,
  next: EditorPreviewLayoutState,
): boolean {
  return (
    current.status === next.status &&
    current.blocksCanvas === next.blocksCanvas &&
    current.generation === next.generation
  )
}

export function shouldApplyEditorPreviewLayoutState(
  current: EditorPreviewLayoutState,
  next: EditorPreviewLayoutState,
): boolean {
  if (areEditorPreviewLayoutStatesEqual(current, next)) return false
  if (
    current.status === "settling" &&
    next.status === "settling" &&
    current.blocksCanvas === next.blocksCanvas
  ) {
    return false
  }
  return true
}

export function isEditorPreviewLayoutFull(status: EditorPreviewLayoutStatus): boolean {
  return status === "full"
}

export function shouldBlockEditorPreviewCanvas(state: EditorPreviewLayoutState): boolean {
  return state.blocksCanvas
}
