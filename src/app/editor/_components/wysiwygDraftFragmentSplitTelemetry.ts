import type { PageFragment } from "@/pagination"

export const WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL = 20

export interface WysiwygDraftFragmentSplitTraceState {
  nodeId: string | null
  inputSignature: string
  outputSignature: string
  visualSignature: string
  surfaceKeySignature: string
  fragmentsReference: readonly PageFragment[] | null
  sameInputRepeatCount: number
  sameOutputRepeatCount: number
  sameVisualRepeatCount: number
  sameFragmentArrayRepeatCount: number
  sameSurfaceKeyRepeatCount: number
  suppressedOutputUnchangedCount: number
}

export interface WysiwygDraftFragmentSplitReuseState {
  nodeId: string | null
  visualSignature: string
  surfaceKeySignature: string
  fragmentsReference: PageFragment[]
  sameResultReuseRepeatCount: number
}

export interface WysiwygDraftFragmentSplitTelemetryInput {
  nodeId: string | null
  draftVersion?: number | null
  textLength?: number | null
  lineCount: number
  paragraphHeight: number
  candidatePageCount: number
  source: string
  sourceFragment: Pick<PageFragment, "pageIndex" | "x" | "y" | "width" | "height">
  fragments: readonly PageFragment[]
  surfaceKeySignature?: string
}

export interface WysiwygDraftFragmentSplitTelemetryResult {
  metadata: {
    draftFragmentInputChanged: boolean
    draftFragmentOutputChanged: boolean
    draftFragmentVisualChanged: boolean
    draftFragmentSameInputRepeatCount: number
    draftFragmentSameOutputRepeatCount: number
    draftFragmentSameVisualRepeatCount: number
    draftFragmentArrayReused: boolean
    draftFragmentSameArrayRepeatCount: number
    draftSurfaceKeysChanged: boolean
    draftSurfaceSameKeyRepeatCount: number
    draftFragmentTelemetrySampled: boolean
    draftFragmentSuppressedOutputUnchangedCount: number
    draftFragmentOutputUnchangedSampleInterval: number
  }
  shouldEmitEvent: boolean
  nextState: WysiwygDraftFragmentSplitTraceState
}

export interface WysiwygDraftFragmentSplitReuseResult {
  fragments: PageFragment[]
  metadata: {
    draftFragmentReuseCandidate: boolean
    draftFragmentResultReused: boolean
    draftFragmentSameResultReuseRepeatCount: number
    draftFragmentArrayReused: boolean
    draftFragmentSameArrayRepeatCount: number
  }
  nextState: WysiwygDraftFragmentSplitReuseState
}

function numericSignatureValue(value: number | null | undefined): string {
  if (value == null) return "null"
  if (!Number.isFinite(value)) return String(value)
  return String(Math.round(value * 1000) / 1000)
}

function booleanSignatureValue(value: boolean | null | undefined): string {
  return value == null ? "null" : value ? "1" : "0"
}

function textFingerprint(value: string | null | undefined): string {
  if (!value) return "0"
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(36)
}

function styleSignatureValue(style: {
  fontSize?: number
  fontFamilyKey?: string
  textColor?: string
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
  strikethrough?: boolean
  fontVariant?: string
  lineHeight?: number
} | undefined): string {
  if (!style) return "null"
  return [
    numericSignatureValue(style.fontSize),
    style.fontFamilyKey ?? "null",
    style.textColor ?? "null",
    style.fontWeight ?? "null",
    style.fontStyle ?? "null",
    style.textDecoration ?? "null",
    booleanSignatureValue(style.strikethrough),
    style.fontVariant ?? "null",
    numericSignatureValue(style.lineHeight),
  ].join(",")
}

function buildLineTextSignature(text: string | null | undefined): string {
  return `${text?.length ?? 0}:${textFingerprint(text)}`
}

function buildLineSegmentSignature(segment: NonNullable<NonNullable<PageFragment["lines"]>[number]["segments"]>[number]): string {
  return [
    segment.kind,
    segment.start,
    segment.end,
    numericSignatureValue(segment.x),
    numericSignatureValue(segment.width),
    booleanSignatureValue(segment.breakableAfter),
    segment.sourceType ?? "null",
    segment.sourceId ?? "null",
    buildLineTextSignature(segment.text),
    styleSignatureValue(segment.style),
  ].join(",")
}

function buildLineRunSignature(run: NonNullable<NonNullable<PageFragment["lines"]>[number]["runs"]>[number]): string {
  return [
    run.start,
    run.end,
    numericSignatureValue(run.x),
    numericSignatureValue(run.width),
    run.sourceType ?? "null",
    run.sourceId ?? "null",
    buildLineTextSignature(run.text),
    styleSignatureValue(run.style),
  ].join(",")
}

function buildLineVisualSignature(line: NonNullable<PageFragment["lines"]>[number]): string {
  return [
    numericSignatureValue(line.x),
    numericSignatureValue(line.y),
    numericSignatureValue(line.width),
    numericSignatureValue(line.height),
    numericSignatureValue(line.fontSize),
    buildLineTextSignature(line.text),
    line.segments?.map(buildLineSegmentSignature).join("~") ?? "no-segments",
    line.runs?.map(buildLineRunSignature).join("~") ?? "no-runs",
  ].join("|")
}

export function buildWysiwygDraftFragmentSplitInputSignature(
  input: WysiwygDraftFragmentSplitTelemetryInput,
): string {
  return [
    input.nodeId ?? "null",
    input.draftVersion ?? "null",
    input.textLength ?? "null",
    input.lineCount,
    numericSignatureValue(input.paragraphHeight),
    input.candidatePageCount,
    input.source,
    input.sourceFragment.pageIndex,
    numericSignatureValue(input.sourceFragment.x),
    numericSignatureValue(input.sourceFragment.y),
    numericSignatureValue(input.sourceFragment.width),
    numericSignatureValue(input.sourceFragment.height),
  ].join("|")
}

export function buildWysiwygDraftFragmentSplitOutputSignature(
  fragments: readonly PageFragment[],
): string {
  return fragments.map((fragment) => [
    fragment.pageIndex,
    fragment.fragmentIndex ?? "null",
    numericSignatureValue(fragment.x),
    numericSignatureValue(fragment.y),
    numericSignatureValue(fragment.width),
    numericSignatureValue(fragment.height),
    fragment.lineStart ?? "null",
    fragment.lineEnd ?? "null",
    booleanSignatureValue(fragment.isContinued),
    fragment.continuesFrom ?? "null",
    fragment.lines?.length ?? 0,
  ].join(":")).join(";")
}

export function buildWysiwygDraftFragmentSplitVisualSignature(
  fragments: readonly PageFragment[],
): string {
  return fragments.map((fragment) => [
    fragment.pageIndex,
    fragment.fragmentIndex ?? "null",
    numericSignatureValue(fragment.x),
    numericSignatureValue(fragment.y),
    numericSignatureValue(fragment.width),
    numericSignatureValue(fragment.height),
    fragment.lineStart ?? "null",
    fragment.lineEnd ?? "null",
    booleanSignatureValue(fragment.isContinued),
    fragment.continuesFrom ?? "null",
    fragment.nodeTextVersion ?? "null",
    fragment.lines?.map(buildLineVisualSignature).join("/") ?? "no-lines",
  ].join(":")).join(";")
}

export function classifyWysiwygDraftFragmentSplitTelemetry(
  previous: WysiwygDraftFragmentSplitTraceState | null,
  input: WysiwygDraftFragmentSplitTelemetryInput,
): WysiwygDraftFragmentSplitTelemetryResult {
  const inputSignature = buildWysiwygDraftFragmentSplitInputSignature(input)
  const outputSignature = buildWysiwygDraftFragmentSplitOutputSignature(input.fragments)
  const visualSignature = buildWysiwygDraftFragmentSplitVisualSignature(input.fragments)
  const surfaceKeySignature = input.surfaceKeySignature ?? ""
  const sameNode = previous?.nodeId === input.nodeId
  const draftFragmentInputChanged = !sameNode || previous.inputSignature !== inputSignature
  const draftFragmentOutputChanged = !sameNode || previous.outputSignature !== outputSignature
  const draftFragmentVisualChanged = !sameNode || previous.visualSignature !== visualSignature
  const draftFragmentArrayReused = sameNode && previous.fragmentsReference === input.fragments
  const draftSurfaceKeysChanged = !sameNode || previous.surfaceKeySignature !== surfaceKeySignature
  const draftFragmentSameInputRepeatCount = draftFragmentInputChanged
    ? 0
    : previous.sameInputRepeatCount + 1
  const draftFragmentSameOutputRepeatCount = draftFragmentOutputChanged
    ? 0
    : previous.sameOutputRepeatCount + 1
  const draftFragmentSameVisualRepeatCount = draftFragmentVisualChanged
    ? 0
    : previous.sameVisualRepeatCount + 1
  const draftFragmentSameArrayRepeatCount = draftFragmentArrayReused
    ? previous.sameFragmentArrayRepeatCount + 1
    : 0
  const draftSurfaceSameKeyRepeatCount = draftSurfaceKeysChanged
    ? 0
    : previous.sameSurfaceKeyRepeatCount + 1
  const shouldSampleUnchangedOutput = !draftFragmentOutputChanged && !draftFragmentVisualChanged && (
    draftFragmentSameOutputRepeatCount === 1 ||
    draftFragmentSameOutputRepeatCount % WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL === 0
  )
  const shouldEmitEvent = draftFragmentOutputChanged || draftFragmentVisualChanged || shouldSampleUnchangedOutput
  const previousSuppressedOutputUnchangedCount = previous?.suppressedOutputUnchangedCount ?? 0
  const draftFragmentSuppressedOutputUnchangedCount = shouldEmitEvent
    ? previousSuppressedOutputUnchangedCount
    : 0
  const nextSuppressedOutputUnchangedCount = shouldEmitEvent
    ? 0
    : previousSuppressedOutputUnchangedCount + 1

  return {
    metadata: {
      draftFragmentInputChanged,
      draftFragmentOutputChanged,
      draftFragmentVisualChanged,
      draftFragmentSameInputRepeatCount,
      draftFragmentSameOutputRepeatCount,
      draftFragmentSameVisualRepeatCount,
      draftFragmentArrayReused,
      draftFragmentSameArrayRepeatCount,
      draftSurfaceKeysChanged,
      draftSurfaceSameKeyRepeatCount,
      draftFragmentTelemetrySampled: shouldSampleUnchangedOutput,
      draftFragmentSuppressedOutputUnchangedCount,
      draftFragmentOutputUnchangedSampleInterval: WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL,
    },
    shouldEmitEvent,
    nextState: {
      nodeId: input.nodeId,
      inputSignature,
      outputSignature,
      visualSignature,
      surfaceKeySignature,
      fragmentsReference: input.fragments,
      sameInputRepeatCount: draftFragmentSameInputRepeatCount,
      sameOutputRepeatCount: draftFragmentSameOutputRepeatCount,
      sameVisualRepeatCount: draftFragmentSameVisualRepeatCount,
      sameFragmentArrayRepeatCount: draftFragmentSameArrayRepeatCount,
      sameSurfaceKeyRepeatCount: draftSurfaceSameKeyRepeatCount,
      suppressedOutputUnchangedCount: nextSuppressedOutputUnchangedCount,
    },
  }
}

export function resolveWysiwygDraftFragmentSplitReuse(
  previous: WysiwygDraftFragmentSplitReuseState | null,
  telemetry: WysiwygDraftFragmentSplitTelemetryResult,
  fragments: PageFragment[],
): WysiwygDraftFragmentSplitReuseResult {
  const draftFragmentReuseCandidate =
    previous != null &&
    previous.nodeId === telemetry.nextState.nodeId &&
    telemetry.metadata.draftFragmentVisualChanged === false &&
    telemetry.metadata.draftSurfaceKeysChanged === false &&
    previous.visualSignature === telemetry.nextState.visualSignature &&
    previous.surfaceKeySignature === telemetry.nextState.surfaceKeySignature
  const reusedFragments = draftFragmentReuseCandidate
    ? previous.fragmentsReference
    : fragments
  const draftFragmentSameResultReuseRepeatCount = draftFragmentReuseCandidate
    ? previous.sameResultReuseRepeatCount + 1
    : 0

  return {
    fragments: reusedFragments,
    metadata: {
      draftFragmentReuseCandidate,
      draftFragmentResultReused: draftFragmentReuseCandidate,
      draftFragmentSameResultReuseRepeatCount,
      draftFragmentArrayReused: draftFragmentReuseCandidate,
      draftFragmentSameArrayRepeatCount: draftFragmentSameResultReuseRepeatCount,
    },
    nextState: {
      nodeId: telemetry.nextState.nodeId,
      visualSignature: telemetry.nextState.visualSignature,
      surfaceKeySignature: telemetry.nextState.surfaceKeySignature,
      fragmentsReference: reusedFragments,
      sameResultReuseRepeatCount: draftFragmentSameResultReuseRepeatCount,
    },
  }
}
