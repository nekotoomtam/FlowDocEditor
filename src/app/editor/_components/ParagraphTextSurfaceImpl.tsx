import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextMeasurer } from "@/layout"
import type { DocumentNode } from "@/schema"
import type { PageFragment, PaginatedLine } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"
import {
  resolveCaretOffsetFromPointInFragment,
  resolveSelectionOverlayRectsInFragment,
} from "./wysiwygCaretMapping"
import { classifyInlineEditKey, getInlineEditInputSnapshot } from "./wysiwygTextInteraction"
import type { InlineEditSelectionSnapshot, ListLevelChangeDirection } from "./wysiwygTextInteraction"
import type { WysiwygLocalDraftSnapshot, WysiwygTextInputKey, WysiwygTextSelection } from "./useWysiwygTextSession"
import {
  classifyWysiwygTextReflow,
  shouldPrepareWysiwygTableCellDraftVisualPreview,
  shouldPatchWysiwygSamePageHeight,
  shouldUseWysiwygLocalDraftLines,
} from "./wysiwygReflow"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { isParagraphInsideFlowStack } from "./wysiwygTextEligibility"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { isWysiwygPerfTraceRuntimeEnabled } from "./wysiwygPerformance"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import {
  buildCachedWysiwygDraftParagraphLayout,
  createWysiwygDraftParagraphLayoutCache,
  type WysiwygDraftParagraphLayoutCache,
} from "./wysiwygDraftParagraphLayout"
import type { WysiwygTextPointerFragmentTarget } from "./wysiwygTextSelectionState"
import {
  fontStyleForRenderProps,
  fontWeightForRenderProps,
  renderCollapsedCaret,
  renderLine,
  renderListMarker,
  renderSegmentDebug,
  shiftFragmentVisualY,
  textAlignForParagraph,
  textDecorationForRenderProps,
  type WysiwygCaretVisualMode,
} from "./WysiwygTextRenderPrimitives"
import {
  renderSelectionOverlay,
  resolveSelectionOverlayRectsInFragmentWithPerf,
} from "./WysiwygSelectionOverlayLayer"
import { canStartParagraphTextSurfaceStructuralEdit } from "./paragraphTextSurfaceStructuralEdit"
import { ParagraphLegacyTextareaLayer } from "./ParagraphLegacyTextareaLayer"
import {
  EDIT_CHROME_X,
  EDIT_CHROME_Y,
  buildContinuationBackspaceInput,
  buildInlineEditSliceKey,
  buildSplitEditInput,
  findParagraphNode,
  focusElementWithoutScroll,
  getContinuationEditState,
  getEditableParagraphText,
  getInlineEditVisualMode,
  hasWysiwygTextDraftChange,
  isCollapsedWysiwygTextSelection,
  isParagraphInsideTableCell,
  resolveInlineEditTextareaPointerPagePoint,
  shouldUseInlineEditDocumentVisual,
  shouldUseNativeInlineEditEnter,
  shouldUseNativeTableCellBoundaryBackspace,
  shouldUseWysiwygTextEngineLayer,
} from "./inlineEditSurfaceState"
import type { ContinuationEditState } from "./inlineEditSurfaceState"
import { useWysiwygDraftStoreForNode } from "./shell/wysiwygDraftStore"
import { WysiwygTextLayer } from "./WysiwygTextLayer"

export type { WysiwygCaretVisualMode } from "./WysiwygTextRenderPrimitives"
export type { ContinuationEditState } from "./inlineEditSurfaceState"

interface Props {
  fragment: PageFragment
  doc: DocumentNode
  pageKey: string
  clipPathId?: string
  scale: number
  visualOffsetY?: number
  pageContentBottom?: number | null
  textMeasurer?: TextMeasurer
  isEditing: boolean
  isVisualFresh: boolean
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  wysiwygTextDraftText?: string | null
  wysiwygTextCaretOffset?: number | null
  wysiwygTextSelection?: WysiwygTextSelection | null
  wysiwygTextVisualDraftLines?: PaginatedLine[] | null
  wysiwygTextPointerFragments?: WysiwygTextPointerFragmentTarget[]
  wysiwygTextDraftPaginationActive?: boolean
  showTextSegments: boolean
  initialCaretIndex: number | null
  onChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onCaretChange: (nodeId: string, caretIndex: number | null) => void
  onUserEditInteraction: (nodeId: string) => void
  onHeightChange: (nodeId: string, height: number, pageIndex: number | null, reflow?: WysiwygTextReflowDecision) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onWysiwygTextDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  onWysiwygRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey, overrideSnapshot?: WysiwygLocalDraftSnapshot) => boolean
  onWysiwygTextReflowDecision?: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
}

export { WysiwygTextLayer }

function areParagraphTextSurfacePropsEqual(prev: Props, next: Props): boolean {
  const sameVisualState =
    prev.fragment === next.fragment &&
    prev.doc === next.doc &&
    prev.pageKey === next.pageKey &&
    prev.clipPathId === next.clipPathId &&
    prev.scale === next.scale &&
    prev.visualOffsetY === next.visualOffsetY &&
    prev.pageContentBottom === next.pageContentBottom &&
    prev.textMeasurer === next.textMeasurer &&
    prev.isEditing === next.isEditing &&
    prev.isVisualFresh === next.isVisualFresh &&
    prev.wysiwygInlineEditEnabled === next.wysiwygInlineEditEnabled &&
    prev.wysiwygTextEngineEnabled === next.wysiwygTextEngineEnabled &&
    prev.wysiwygTextDraftText === next.wysiwygTextDraftText &&
    prev.wysiwygTextCaretOffset === next.wysiwygTextCaretOffset &&
    prev.wysiwygTextSelection === next.wysiwygTextSelection &&
    prev.wysiwygTextVisualDraftLines === next.wysiwygTextVisualDraftLines &&
    prev.wysiwygTextPointerFragments === next.wysiwygTextPointerFragments &&
    prev.wysiwygTextDraftPaginationActive === next.wysiwygTextDraftPaginationActive &&
    prev.showTextSegments === next.showTextSegments &&
    prev.initialCaretIndex === next.initialCaretIndex

  if (!sameVisualState) return false
  if (!prev.isEditing && !next.isEditing) return true

  return prev.onChange === next.onChange &&
    prev.onCaretChange === next.onCaretChange &&
    prev.onUserEditInteraction === next.onUserEditInteraction &&
    prev.onHeightChange === next.onHeightChange &&
    prev.onEndEdit === next.onEndEdit &&
    prev.onSplitParagraph === next.onSplitParagraph &&
    prev.onMergeParagraph === next.onMergeParagraph &&
    prev.onCanStartStructuralEdit === next.onCanStartStructuralEdit &&
    prev.onExitListItem === next.onExitListItem &&
    prev.onChangeListItemLevel === next.onChangeListItemLevel &&
    prev.onBackspaceListItemAtStart === next.onBackspaceListItemAtStart &&
    prev.onWysiwygTextDraftChange === next.onWysiwygTextDraftChange &&
    prev.onWysiwygRichTextShortcut === next.onWysiwygRichTextShortcut &&
    prev.onWysiwygTextReflowDecision === next.onWysiwygTextReflowDecision
}

function ParagraphTextSurfaceImpl({
  fragment,
  doc,
  pageKey,
  clipPathId,
  scale,
  visualOffsetY = 0,
  pageContentBottom,
  textMeasurer,
  isEditing,
  isVisualFresh,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  wysiwygTextDraftText,
  wysiwygTextCaretOffset,
  wysiwygTextSelection,
  wysiwygTextVisualDraftLines,
  wysiwygTextPointerFragments,
  wysiwygTextDraftPaginationActive = false,
  showTextSegments,
  initialCaretIndex,
  onChange,
  onCaretChange,
  onUserEditInteraction,
  onHeightChange,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
  onCanStartStructuralEdit,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
  onWysiwygTextDraftChange,
  onWysiwygRichTextShortcut,
  onWysiwygTextReflowDecision,
}: Props) {
  const draftStore = useWysiwygDraftStoreForNode(fragment.nodeId)
  const isDraftIslandActive = draftStore != null
  const resolvedWysiwygTextDraftText = isDraftIslandActive ? draftStore.text : wysiwygTextDraftText
  const resolvedWysiwygTextCaretOffset = isDraftIslandActive ? draftStore.caretIndex : wysiwygTextCaretOffset
  const resolvedWysiwygTextSelection = isDraftIslandActive ? draftStore.selection : wysiwygTextSelection

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pointerSelectionAnchorRef = useRef<number | null>(null)
  const sliceContextRef = useRef<(ContinuationEditState & { editSliceKey: string }) | null>(null)
  const textEngineHeightRequestRef = useRef<string | null>(null)
  const textEngineReflowRequestRef = useRef<string | null>(null)
  const textEngineDraftLayoutCacheRef = useRef<WysiwygDraftParagraphLayoutCache>(createWysiwygDraftParagraphLayoutCache())
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true)
  const [selectionSnapshot, setSelectionSnapshot] = useState<InlineEditSelectionSnapshot | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [hasActivelyTyped, setHasActivelyTyped] = useState(false)

  useEffect(() => {
    if (!isEditing) setHasActivelyTyped(false)
  }, [isEditing])
  const traceHotPathPerf = useMemo(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ), [])
  const renderProps = fragment.renderProps
  const displayFragment = useMemo(() => (
    shiftFragmentVisualY(fragment, visualOffsetY)
  ), [fragment, visualOffsetY])
  const editHeight = Math.max(fragment.height * scale, 1)
  const fontSize = (renderProps?.fontSize ?? 12) * scale
  const lineHeight = (renderProps?.lineHeight ?? (renderProps?.fontSize ?? 12) * 1.5) * scale
  const spacingBeforeDoc = fragment.continuesFrom ? 0 : (renderProps?.spacingBefore ?? 0)
  const spacingAfterDoc = fragment.isContinued ? 0 : (renderProps?.spacingAfter ?? 0)
  const spacingBefore = spacingBeforeDoc * scale
  const spacingAfter = spacingAfterDoc * scale
  const minimumEditHeight = Math.max(lineHeight + spacingBefore + spacingAfter, 1)

  // For continuation fragments (page 2+), use only the text belonging to this
  // fragment so the textarea starts at the right content and the caret is
  // correctly positioned without relying on scroll (which doesn't work reliably
  // inside SVG foreignObject with overflow:hidden).
  const fullText = getEditableParagraphText(doc, fragment.nodeId)
  const paragraphNode = useMemo(() => findParagraphNode(doc, fragment.nodeId), [doc, fragment.nodeId])
  const isListItem = paragraphNode?.props.list != null
  const canPlainTextEdit = fullText !== null
  const nextEditState = getContinuationEditState(fullText ?? "", fragment, initialCaretIndex)
  const editSliceKey = buildInlineEditSliceKey(
    fragment,
    nextEditState.continuationCharStart,
  )
  if (sliceContextRef.current?.editSliceKey !== editSliceKey) {
    sliceContextRef.current = { ...nextEditState, editSliceKey }
  }
  const {
    continuationCharStart,
    continuationCharEnd,
    editText,
    preText,
    postText,
    adjustedInitialCaret,
  } = sliceContextRef.current
  const isTableCellParagraph = isParagraphInsideTableCell(doc, fragment.nodeId, fragment.parentNodeId)
  const isFlowStackParagraph = isParagraphInsideFlowStack(doc, fragment.nodeId, fragment.parentNodeId)
  const shouldUsePlainParagraphNativeGeometryHandoff = !isTableCellParagraph && !isFlowStackParagraph
  const shouldUsePlainParagraphFlowdocDraftLines =
    shouldUsePlainParagraphNativeGeometryHandoff &&
    paragraphNode != null &&
    textMeasurer != null &&
    isCollapsedWysiwygTextSelection(resolvedWysiwygTextSelection) &&
    !hasActivelyTyped
  const isCurrentEditSlice = useCallback((el: HTMLTextAreaElement) => (
    el.dataset.inlineEditSliceKey === editSliceKey
  ), [editSliceKey])
  const updateCaret = useCallback((el: HTMLTextAreaElement) => {
    if (!isCurrentEditSlice(el)) return
    const snapshot = getInlineEditInputSnapshot(el, preText, postText)
    setIsSelectionCollapsed(snapshot.isSelectionCollapsed)
    setSelectionSnapshot(snapshot.selection)
    onCaretChange(fragment.nodeId, snapshot.caretOffset)
  }, [fragment.nodeId, isCurrentEditSlice, onCaretChange, postText, preText])
  const markUserEditInteraction = useCallback(() => {
    onUserEditInteraction(fragment.nodeId)
  }, [fragment.nodeId, onUserEditInteraction])
  // The foreignObject expands by EDIT_CHROME_* for outline/click affordance.
  // Matching padding cancels that expansion so textarea content starts at the
  // same paragraph origin as SVG lines instead of drifting by the chrome size.
  const textareaPadding = `${spacingBefore + EDIT_CHROME_Y}px ${EDIT_CHROME_X}px ${spacingAfter + EDIT_CHROME_Y}px`
  const textareaContentX = displayFragment.listMarker?.bodyX ?? displayFragment.x
  const textareaContentWidth = Math.max(0, (displayFragment.x + displayFragment.width) - textareaContentX)
  const resolveLocalOffsetFromPointer = useCallback((event: React.PointerEvent<HTMLTextAreaElement>): number | null => {
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    const point = resolveInlineEditTextareaPointerPagePoint({
      textareaContentX,
      fragmentY: displayFragment.y,
      clientX: event.clientX,
      clientY: event.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      scale,
    })
    const candidate = resolveCaretOffsetFromPointInFragment(displayFragment, point, { textMeasurer })
    if (!candidate) return null
    return Math.max(0, Math.min(editText.length, candidate.offset - preText.length))
  }, [displayFragment, editText.length, preText.length, scale, textMeasurer, textareaContentX])

  const setTextareaPointerSelection = useCallback((
    el: HTMLTextAreaElement,
    anchor: number,
    focus: number,
  ) => {
    const start = Math.min(anchor, focus)
    const end = Math.max(anchor, focus)
    const direction = focus < anchor ? "backward" : "forward"
    el.setSelectionRange(start, end, start === end ? "none" : direction)
    updateCaret(el)
  }, [updateCaret])

  useEffect(() => {
    setIsSelectionCollapsed(true)
    setSelectionSnapshot(null)
  }, [editSliceKey])

  const editPreview = useMemo(() => {
    if (!isEditing) return null
    return { lines: displayFragment.lines ?? [], height: fragment.height }
  }, [displayFragment.lines, fragment.height, isEditing])
  const editPreviewHeight = (editPreview?.height ?? 0) * scale
  const activeEditHeight = Math.max(editHeight, minimumEditHeight, editPreviewHeight)
  const selectionOverlayRects = useMemo(() => {
    if (!selectionSnapshot || selectionSnapshot.isCollapsed) return []
    return resolveSelectionOverlayRectsInFragment(
      displayFragment,
      selectionSnapshot.anchorOffset,
      selectionSnapshot.focusOffset,
      { textMeasurer },
    )
  }, [displayFragment, selectionSnapshot, textMeasurer])
  const hasSelectionOverlay = selectionOverlayRects.length > 0
  const canUseDocumentVisual = wysiwygInlineEditEnabled && shouldUseInlineEditDocumentVisual(
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
    hasSelectionOverlay,
  )
  const customCaret = useMemo(() => (
    canUseDocumentVisual && isSelectionCollapsed
      ? renderCollapsedCaret(displayFragment, pageKey, scale, initialCaretIndex, textMeasurer, clipPathId)
      : null
  ), [canUseDocumentVisual, clipPathId, displayFragment, initialCaretIndex, isSelectionCollapsed, pageKey, scale, textMeasurer])
  const visualMode = getInlineEditVisualMode({
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
    hasCustomCaret: customCaret !== null,
    hasSelectionOverlay,
    isWysiwygEnabled: wysiwygInlineEditEnabled,
  })
  const supportsLocalDraftLayout = !fragment.continuesFrom && !fragment.isContinued
  const supportsPaginatedDraftLayout = wysiwygTextDraftPaginationActive
  const useWysiwygTextEngineLayer = shouldUseWysiwygTextEngineLayer({
    enabled: wysiwygTextEngineEnabled,
    isEditing,
    canPlainTextEdit,
    isVisualFresh,
    supportsLocalDraftLayout: supportsLocalDraftLayout || supportsPaginatedDraftLayout,
  })
  // Current active-edit baseline: native textarea owns the visible draft.
  // Measured draft lines/live echo are legacy/deferred visual paths and must
  // not be built on the keypress render path.
  const shouldBuildMeasuredTextEngineDraftVisual = false
  const textEngineDraftText = resolvedWysiwygTextDraftText ?? fullText
  const textEngineDraftChanged = hasWysiwygTextDraftChange(fullText, textEngineDraftText)

  useEffect(() => {
    if (isEditing && textEngineDraftChanged) {
      setHasActivelyTyped(true)
    }
  }, [isEditing, textEngineDraftChanged])

  const textEngineCaretOffset = resolvedWysiwygTextCaretOffset ?? initialCaretIndex
  const textEngineDraftLayout = useMemo(() => {
    if (!shouldBuildMeasuredTextEngineDraftVisual || !textEngineDraftChanged || !supportsLocalDraftLayout || !useWysiwygTextEngineLayer || !paragraphNode || textEngineDraftText == null || !textMeasurer) return null
    return buildCachedWysiwygDraftParagraphLayout(textEngineDraftLayoutCacheRef.current, fragment, paragraphNode, textEngineDraftText, textMeasurer, {
      traceMeasure: true,
    })
  }, [fragment, paragraphNode, shouldBuildMeasuredTextEngineDraftVisual, supportsLocalDraftLayout, textEngineDraftChanged, textEngineDraftText, textMeasurer, useWysiwygTextEngineLayer])
  const textEngineDraftLines = textEngineDraftLayout?.lines ?? null
  const textEngineReflowDecision = useMemo(() => (
    classifyWysiwygTextReflow({
      fragment,
      draftLines: textEngineDraftLines ?? (supportsPaginatedDraftLayout ? fragment.lines : null),
      draftHeight: textEngineDraftLayout?.height ?? (supportsPaginatedDraftLayout ? fragment.height : null),
      pageContentBottom,
      supportsLocalDraftLayout: supportsLocalDraftLayout || supportsPaginatedDraftLayout,
      supportsSamePageHeightPatch: shouldPatchWysiwygSamePageHeight({ isTableCellParagraph }),
    })
  ), [
    fragment,
    isTableCellParagraph,
    pageContentBottom,
    supportsLocalDraftLayout,
    supportsPaginatedDraftLayout,
    textEngineDraftLayout?.height,
    textEngineDraftLines,
  ])
  const useTextEngineLocalDraftLines = shouldUseWysiwygLocalDraftLines({
    reflow: textEngineReflowDecision,
    isTableCellParagraph,
  })
  const tableCellDraftVisualPreviewCandidate = shouldPrepareWysiwygTableCellDraftVisualPreview({
    reflow: textEngineReflowDecision,
    isTableCellParagraph,
    isFlowStackParagraph,
    draftPaginationActive: wysiwygTextDraftPaginationActive,
  })
  const textEngineVisualDraftLines = useTextEngineLocalDraftLines
    ? wysiwygTextVisualDraftLines ?? textEngineDraftLines
    : null
  const textEngineLiveTextEcho = !textEngineReflowDecision.shouldPatchActiveLines &&
    fullText != null &&
    textEngineDraftText != null
    ? null
    : null
  const textEngineSelectionOverlayRects = useMemo(() => {
    if (!useWysiwygTextEngineLayer || !shouldBuildMeasuredTextEngineDraftVisual || !resolvedWysiwygTextSelection) return []
    if (resolvedWysiwygTextSelection.anchorOffset === resolvedWysiwygTextSelection.focusOffset) return []
    const visualFragment = textEngineVisualDraftLines ? { ...displayFragment, lines: textEngineVisualDraftLines } : displayFragment
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: visualFragment,
      anchorOffset: resolvedWysiwygTextSelection.anchorOffset,
      focusOffset: resolvedWysiwygTextSelection.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "active",
    })
  }, [displayFragment, shouldBuildMeasuredTextEngineDraftVisual, textEngineVisualDraftLines, textMeasurer, traceHotPathPerf, useWysiwygTextEngineLayer, resolvedWysiwygTextSelection])
  const passiveTextEngineSelectionOverlayRects = useMemo(() => {
    if (isEditing || !wysiwygTextEngineEnabled || !resolvedWysiwygTextSelection) return []
    if (resolvedWysiwygTextSelection.anchorOffset === resolvedWysiwygTextSelection.focusOffset) return []
    const visualFragment = wysiwygTextVisualDraftLines ? { ...displayFragment, lines: wysiwygTextVisualDraftLines } : displayFragment
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: visualFragment,
      anchorOffset: resolvedWysiwygTextSelection.anchorOffset,
      focusOffset: resolvedWysiwygTextSelection.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "passive",
    })
  }, [displayFragment, isEditing, textMeasurer, traceHotPathPerf, wysiwygTextEngineEnabled, resolvedWysiwygTextSelection, wysiwygTextVisualDraftLines])
  const passiveTextEngineSelectionFragment = wysiwygTextVisualDraftLines
    ? { ...displayFragment, lines: wysiwygTextVisualDraftLines }
    : displayFragment
  const syncTextareaHeight = useCallback((el: HTMLTextAreaElement) => {
    el.scrollTop = 0
    onHeightChange(fragment.nodeId, activeEditHeight / scale, fragment.pageIndex)
  }, [activeEditHeight, fragment.nodeId, fragment.pageIndex, onHeightChange, scale])

  useEffect(() => {
    if (!isEditing || adjustedInitialCaret == null) return
    const el = textareaRef.current
    if (!el) return
    const caret = Math.min(Math.max(0, adjustedInitialCaret), el.value.length)
    requestAnimationFrame(() => {
      focusElementWithoutScroll(el)
      el.setSelectionRange(caret, caret)
      el.scrollTop = 0
    })
  }, [adjustedInitialCaret, editSliceKey, fragment.nodeId, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    requestAnimationFrame(() => syncTextareaHeight(el))
  }, [editHeight, isEditing, syncTextareaHeight])

  useEffect(() => {
    if (!useWysiwygTextEngineLayer || !textEngineDraftLayout) {
      textEngineHeightRequestRef.current = null
      return
    }
    if (!textEngineReflowDecision.shouldPatchSamePageHeight) {
      textEngineHeightRequestRef.current = null
      return
    }
    const height = Math.max(textEngineDraftLayout.height, minimumEditHeight / scale)
    const roundedHeight = Math.round(height * 100) / 100
    const nextKey = `${fragment.nodeId}:${fragment.pageIndex}:${textEngineReflowDecision.kind}:${roundedHeight}`
    if (textEngineHeightRequestRef.current === nextKey) return
    textEngineHeightRequestRef.current = nextKey
    onHeightChange(fragment.nodeId, height, fragment.pageIndex, textEngineReflowDecision)
  }, [
    fragment.nodeId,
    fragment.pageIndex,
    minimumEditHeight,
    onHeightChange,
    scale,
    textEngineDraftLayout,
    textEngineReflowDecision,
    useWysiwygTextEngineLayer,
  ])

  useEffect(() => {
    if (!useWysiwygTextEngineLayer || !shouldBuildMeasuredTextEngineDraftVisual) {
      textEngineReflowRequestRef.current = null
      return
    }
    const nextKey = [
      fragment.nodeId,
      fragment.pageIndex,
      textEngineReflowDecision.kind,
      textEngineReflowDecision.reason,
      textEngineDraftLayout?.height ?? "x",
      textEngineDraftLines?.length ?? "x",
      textEngineDraftText?.length ?? 0,
    ].join(":")
    if (textEngineReflowRequestRef.current === nextKey) return
    textEngineReflowRequestRef.current = nextKey
    onWysiwygTextReflowDecision?.(fragment.nodeId, textEngineReflowDecision)
  }, [
    fragment.nodeId,
    fragment.pageIndex,
    onWysiwygTextReflowDecision,
    shouldBuildMeasuredTextEngineDraftVisual,
    textEngineDraftLayout?.height,
    textEngineDraftLines?.length,
    textEngineDraftText,
    textEngineReflowDecision,
    useWysiwygTextEngineLayer,
  ])
  const listMarkerVisual = renderListMarker(displayFragment, renderProps, pageKey, scale, clipPathId)

  if (isEditing && canPlainTextEdit) {
    if (useWysiwygTextEngineLayer) {
      return (
        <WysiwygTextLayer
          fragment={displayFragment}
          lines={textEngineVisualDraftLines ?? undefined}
          renderProps={renderProps}
          draftParagraphNode={paragraphNode}
          useFlowdocDraftLines={shouldUsePlainParagraphFlowdocDraftLines}
          draftPaginationActive={wysiwygTextDraftPaginationActive}
          pageContentBottom={pageContentBottom}
          pageKey={pageKey}
          clipPathId={clipPathId}
          scale={scale}
          textMeasurer={textMeasurer}
          caretIndex={textEngineCaretOffset}
          selection={resolvedWysiwygTextSelection}
          draftText={textEngineDraftText}
          hasDraftChange={shouldBuildMeasuredTextEngineDraftVisual && textEngineDraftChanged}
          isListItem={isListItem}
          onDraftChange={onWysiwygTextDraftChange}
          onNativeHeightChange={shouldUsePlainParagraphNativeGeometryHandoff ? onHeightChange : undefined}
          relaxNativeEditClip={shouldUsePlainParagraphNativeGeometryHandoff}
          onRichTextShortcut={onWysiwygRichTextShortcut}
          onEndEdit={onEndEdit}
          onSplitParagraph={onSplitParagraph}
          onMergeParagraph={isTableCellParagraph ? undefined : onMergeParagraph}
          onCanStartStructuralEdit={onCanStartStructuralEdit}
          onExitListItem={onExitListItem}
          onChangeListItemLevel={onChangeListItemLevel}
          onBackspaceListItemAtStart={onBackspaceListItemAtStart}
          onReflowDecision={onWysiwygTextReflowDecision}
          showTextSegments={showTextSegments}
          selectionOverlayRects={shouldBuildMeasuredTextEngineDraftVisual ? textEngineSelectionOverlayRects : []}
          pointerFragments={wysiwygTextPointerFragments}
          reflowKind={shouldBuildMeasuredTextEngineDraftVisual ? textEngineReflowDecision.kind : undefined}
          liveTextEcho={shouldBuildMeasuredTextEngineDraftVisual ? textEngineLiveTextEcho : null}
          tableCellDraftVisualPreviewCandidate={shouldBuildMeasuredTextEngineDraftVisual && tableCellDraftVisualPreviewCandidate}
          followCaretIntoView={isTableCellParagraph}
          suppressLiveTextEcho={isTableCellParagraph}
        />
      )
    }

  }

  return (
    <ParagraphLegacyTextareaLayer
      fragment={fragment}
      displayFragment={displayFragment}
      renderProps={renderProps}
      paragraphNode={paragraphNode}
      pageKey={pageKey}
      clipPathId={clipPathId}
      scale={scale}
      textMeasurer={textMeasurer}
      listMarkerVisual={listMarkerVisual}
      customCaret={customCaret}
      visualMode={visualMode}
      selectionOverlayRects={selectionOverlayRects}
      passiveTextEngineSelectionFragment={passiveTextEngineSelectionFragment}
      passiveTextEngineSelectionOverlayRects={passiveTextEngineSelectionOverlayRects}
      showTextSegments={showTextSegments}
      textareaRef={textareaRef}
      pointerSelectionAnchorRef={pointerSelectionAnchorRef}
      editSliceKey={editSliceKey}
      editText={editText}
      preText={preText}
      postText={postText}
      fullText={fullText}
      continuationCharStart={continuationCharStart}
      continuationCharEnd={continuationCharEnd}
      textareaContentX={textareaContentX}
      textareaContentWidth={textareaContentWidth}
      textareaPadding={textareaPadding}
      activeEditHeight={activeEditHeight}
      fontSize={fontSize}
      lineHeight={lineHeight}
      isEditingPlainText={isEditing && canPlainTextEdit}
      isListItem={isListItem}
      isTableCellParagraph={isTableCellParagraph}
      isComposing={isComposing}
      wysiwygInlineEditEnabled={wysiwygInlineEditEnabled}
      wysiwygTextEngineEnabled={wysiwygTextEngineEnabled}
      isCurrentEditSlice={isCurrentEditSlice}
      markUserEditInteraction={markUserEditInteraction}
      resolveLocalOffsetFromPointer={resolveLocalOffsetFromPointer}
      setIsSelectionCollapsed={setIsSelectionCollapsed}
      setSelectionSnapshot={setSelectionSnapshot}
      setIsComposing={setIsComposing}
      setTextareaPointerSelection={setTextareaPointerSelection}
      syncTextareaHeight={syncTextareaHeight}
      updateCaret={updateCaret}
      onChange={onChange}
      onEndEdit={onEndEdit}
      onSplitParagraph={onSplitParagraph}
      onMergeParagraph={onMergeParagraph}
      onCanStartStructuralEdit={onCanStartStructuralEdit}
      onExitListItem={onExitListItem}
      onChangeListItemLevel={onChangeListItemLevel}
      onBackspaceListItemAtStart={onBackspaceListItemAtStart}
    />
  )
}

export const ParagraphTextSurface = memo(ParagraphTextSurfaceImpl, areParagraphTextSurfacePropsEqual)
ParagraphTextSurface.displayName = "ParagraphTextSurface"
