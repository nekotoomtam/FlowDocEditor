export interface WysiwygDraftIslandSurfaceRenderTraceState {
  nodeId: string | null
  componentName: string | null
  revisionSignature: string
  textLengthSignature: string
  caretSignature: string
  selectionSignature: string
  layoutSignature: string
  surfaceSignature: string
  anchorSignature: string
  sameRevisionRepeatCount: number
  sameTextLengthRepeatCount: number
  sameCaretRepeatCount: number
  sameSelectionRepeatCount: number
  sameLayoutRepeatCount: number
  sameSurfaceRepeatCount: number
  sameAnchorRepeatCount: number
}

export interface WysiwygDraftIslandSurfaceRenderTelemetryInput {
  nodeId: string | null
  componentName?: string | null
  draftRevision?: number | null
  textLength?: number | null
  caretOffset?: number | null
  selectionAnchorOffset?: number | null
  selectionFocusOffset?: number | null
  lineCount?: number | null
  paragraphHeight?: number | null
  draftFragmentCount?: number | null
  draftPageCount?: number | null
  draftSurfaceCount?: number | null
  draftMissingSurfaceCount?: number | null
  pageIndexes?: string | null
  surfaceSignature?: string | null
  anchorsReady?: boolean | null
  inputToVisibleActive?: boolean | null
}

export interface WysiwygDraftIslandSurfaceRenderTelemetryResult {
  metadata: {
    draftSurfaceRevisionChanged: boolean
    draftSurfaceTextLengthChanged: boolean
    draftSurfaceCaretChanged: boolean
    draftSurfaceSelectionChanged: boolean
    draftSurfaceLayoutChanged: boolean
    draftSurfaceSurfaceChanged: boolean
    draftSurfaceAnchorChanged: boolean
    draftSurfaceInputToVisibleActive: boolean
    draftSurfaceSameRevisionRepeatCount: number
    draftSurfaceSameTextLengthRepeatCount: number
    draftSurfaceSameCaretRepeatCount: number
    draftSurfaceSameSelectionRepeatCount: number
    draftSurfaceSameLayoutRepeatCount: number
    draftSurfaceSameSurfaceRepeatCount: number
    draftSurfaceSameAnchorRepeatCount: number
    draftSurfaceCommitReason: string
  }
  nextState: WysiwygDraftIslandSurfaceRenderTraceState
}

function valueSignature(value: string | number | boolean | null | undefined): string {
  if (value == null) return "null"
  return String(value)
}

function buildLayoutSignature(input: WysiwygDraftIslandSurfaceRenderTelemetryInput): string {
  return [
    input.lineCount,
    input.paragraphHeight,
    input.draftFragmentCount,
    input.draftPageCount,
    input.draftSurfaceCount,
    input.draftMissingSurfaceCount,
    input.pageIndexes,
  ].map(valueSignature).join("|")
}

function buildSelectionSignature(input: WysiwygDraftIslandSurfaceRenderTelemetryInput): string {
  const anchor = input.selectionAnchorOffset
  const focus = input.selectionFocusOffset
  if (anchor == null || focus == null) return "none"
  if (anchor === focus) return "collapsed"
  return `${anchor}|${focus}`
}

export function classifyWysiwygDraftIslandSurfaceRenderTelemetry(
  previous: WysiwygDraftIslandSurfaceRenderTraceState | null,
  input: WysiwygDraftIslandSurfaceRenderTelemetryInput,
): WysiwygDraftIslandSurfaceRenderTelemetryResult {
  const componentName = input.componentName ?? null
  const revisionSignature = valueSignature(input.draftRevision)
  const textLengthSignature = valueSignature(input.textLength)
  const caretSignature = valueSignature(input.caretOffset)
  const selectionSignature = buildSelectionSignature(input)
  const layoutSignature = buildLayoutSignature(input)
  const surfaceSignature = valueSignature(input.surfaceSignature)
  const anchorSignature = valueSignature(input.anchorsReady)
  const sameTarget = (
    previous != null &&
    previous.nodeId === input.nodeId &&
    previous.componentName === componentName
  )
  const draftSurfaceRevisionChanged = !sameTarget || previous.revisionSignature !== revisionSignature
  const draftSurfaceTextLengthChanged = !sameTarget || previous.textLengthSignature !== textLengthSignature
  const draftSurfaceCaretChanged = !sameTarget || previous.caretSignature !== caretSignature
  const draftSurfaceSelectionChanged = !sameTarget || previous.selectionSignature !== selectionSignature
  const draftSurfaceLayoutChanged = !sameTarget || previous.layoutSignature !== layoutSignature
  const draftSurfaceSurfaceChanged = !sameTarget || previous.surfaceSignature !== surfaceSignature
  const draftSurfaceAnchorChanged = !sameTarget || previous.anchorSignature !== anchorSignature
  const draftSurfaceSameRevisionRepeatCount = draftSurfaceRevisionChanged ? 0 : previous.sameRevisionRepeatCount + 1
  const draftSurfaceSameTextLengthRepeatCount = draftSurfaceTextLengthChanged ? 0 : previous.sameTextLengthRepeatCount + 1
  const draftSurfaceSameCaretRepeatCount = draftSurfaceCaretChanged ? 0 : previous.sameCaretRepeatCount + 1
  const draftSurfaceSameSelectionRepeatCount = draftSurfaceSelectionChanged ? 0 : previous.sameSelectionRepeatCount + 1
  const draftSurfaceSameLayoutRepeatCount = draftSurfaceLayoutChanged ? 0 : previous.sameLayoutRepeatCount + 1
  const draftSurfaceSameSurfaceRepeatCount = draftSurfaceSurfaceChanged ? 0 : previous.sameSurfaceRepeatCount + 1
  const draftSurfaceSameAnchorRepeatCount = draftSurfaceAnchorChanged ? 0 : previous.sameAnchorRepeatCount + 1
  const changed = [
    draftSurfaceRevisionChanged ? "revision" : null,
    draftSurfaceTextLengthChanged ? "text-length" : null,
    draftSurfaceCaretChanged ? "caret" : null,
    draftSurfaceSelectionChanged ? "selection" : null,
    draftSurfaceLayoutChanged ? "layout" : null,
    draftSurfaceSurfaceChanged ? "surface" : null,
    draftSurfaceAnchorChanged ? "anchor" : null,
  ].filter((field): field is string => field !== null)

  return {
    metadata: {
      draftSurfaceRevisionChanged,
      draftSurfaceTextLengthChanged,
      draftSurfaceCaretChanged,
      draftSurfaceSelectionChanged,
      draftSurfaceLayoutChanged,
      draftSurfaceSurfaceChanged,
      draftSurfaceAnchorChanged,
      draftSurfaceInputToVisibleActive: input.inputToVisibleActive === true,
      draftSurfaceSameRevisionRepeatCount,
      draftSurfaceSameTextLengthRepeatCount,
      draftSurfaceSameCaretRepeatCount,
      draftSurfaceSameSelectionRepeatCount,
      draftSurfaceSameLayoutRepeatCount,
      draftSurfaceSameSurfaceRepeatCount,
      draftSurfaceSameAnchorRepeatCount,
      draftSurfaceCommitReason: changed.length > 0 ? changed.join("+") : "stable",
    },
    nextState: {
      nodeId: input.nodeId,
      componentName,
      revisionSignature,
      textLengthSignature,
      caretSignature,
      selectionSignature,
      layoutSignature,
      surfaceSignature,
      anchorSignature,
      sameRevisionRepeatCount: draftSurfaceSameRevisionRepeatCount,
      sameTextLengthRepeatCount: draftSurfaceSameTextLengthRepeatCount,
      sameCaretRepeatCount: draftSurfaceSameCaretRepeatCount,
      sameSelectionRepeatCount: draftSurfaceSameSelectionRepeatCount,
      sameLayoutRepeatCount: draftSurfaceSameLayoutRepeatCount,
      sameSurfaceRepeatCount: draftSurfaceSameSurfaceRepeatCount,
      sameAnchorRepeatCount: draftSurfaceSameAnchorRepeatCount,
    },
  }
}
