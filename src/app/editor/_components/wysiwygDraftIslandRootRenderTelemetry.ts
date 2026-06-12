export interface WysiwygDraftIslandRootRenderTraceState {
  nodeId: string | null
  draftSignature: string
  layoutSignature: string
  surfaceSignature: string
  anchorSignature: string
  sameDraftRepeatCount: number
  sameLayoutRepeatCount: number
  sameSurfaceRepeatCount: number
  sameAnchorRepeatCount: number
}

export interface WysiwygDraftIslandRootRenderTelemetryInput {
  nodeId: string | null
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

export interface WysiwygDraftIslandRootRenderTelemetryResult {
  metadata: {
    draftRootDraftChanged: boolean
    draftRootLayoutChanged: boolean
    draftRootSurfaceChanged: boolean
    draftRootAnchorChanged: boolean
    draftRootInputToVisibleActive: boolean
    draftRootSameDraftRepeatCount: number
    draftRootSameLayoutRepeatCount: number
    draftRootSameSurfaceRepeatCount: number
    draftRootSameAnchorRepeatCount: number
    draftRootCommitReason: string
  }
  nextState: WysiwygDraftIslandRootRenderTraceState
}

function valueSignature(value: string | number | boolean | null | undefined): string {
  if (value == null) return "null"
  return String(value)
}

function buildDraftSignature(input: WysiwygDraftIslandRootRenderTelemetryInput): string {
  return [
    input.nodeId,
    input.draftRevision,
    input.textLength,
    input.caretOffset,
    input.selectionAnchorOffset,
    input.selectionFocusOffset,
  ].map(valueSignature).join("|")
}

function buildLayoutSignature(input: WysiwygDraftIslandRootRenderTelemetryInput): string {
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

export function classifyWysiwygDraftIslandRootRenderTelemetry(
  previous: WysiwygDraftIslandRootRenderTraceState | null,
  input: WysiwygDraftIslandRootRenderTelemetryInput,
): WysiwygDraftIslandRootRenderTelemetryResult {
  const draftSignature = buildDraftSignature(input)
  const layoutSignature = buildLayoutSignature(input)
  const surfaceSignature = valueSignature(input.surfaceSignature)
  const anchorSignature = valueSignature(input.anchorsReady)
  const sameNode = previous?.nodeId === input.nodeId
  const draftRootDraftChanged = !sameNode || previous.draftSignature !== draftSignature
  const draftRootLayoutChanged = !sameNode || previous.layoutSignature !== layoutSignature
  const draftRootSurfaceChanged = !sameNode || previous.surfaceSignature !== surfaceSignature
  const draftRootAnchorChanged = !sameNode || previous.anchorSignature !== anchorSignature
  const draftRootSameDraftRepeatCount = draftRootDraftChanged ? 0 : previous.sameDraftRepeatCount + 1
  const draftRootSameLayoutRepeatCount = draftRootLayoutChanged ? 0 : previous.sameLayoutRepeatCount + 1
  const draftRootSameSurfaceRepeatCount = draftRootSurfaceChanged ? 0 : previous.sameSurfaceRepeatCount + 1
  const draftRootSameAnchorRepeatCount = draftRootAnchorChanged ? 0 : previous.sameAnchorRepeatCount + 1
  const changed = [
    draftRootDraftChanged ? "draft" : null,
    draftRootLayoutChanged ? "layout" : null,
    draftRootSurfaceChanged ? "surface" : null,
    draftRootAnchorChanged ? "anchor" : null,
  ].filter((field): field is string => field !== null)

  return {
    metadata: {
      draftRootDraftChanged,
      draftRootLayoutChanged,
      draftRootSurfaceChanged,
      draftRootAnchorChanged,
      draftRootInputToVisibleActive: input.inputToVisibleActive === true,
      draftRootSameDraftRepeatCount,
      draftRootSameLayoutRepeatCount,
      draftRootSameSurfaceRepeatCount,
      draftRootSameAnchorRepeatCount,
      draftRootCommitReason: changed.length > 0 ? changed.join("+") : "stable",
    },
    nextState: {
      nodeId: input.nodeId,
      draftSignature,
      layoutSignature,
      surfaceSignature,
      anchorSignature,
      sameDraftRepeatCount: draftRootSameDraftRepeatCount,
      sameLayoutRepeatCount: draftRootSameLayoutRepeatCount,
      sameSurfaceRepeatCount: draftRootSameSurfaceRepeatCount,
      sameAnchorRepeatCount: draftRootSameAnchorRepeatCount,
    },
  }
}
