import type * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { TextMeasurer } from "@/layout"
import type { ParagraphNode } from "@/schema"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import {
  resolveVerticalCaretNavigationInFragments,
  resolveSelectionOverlayRectsInFragment,
} from "./wysiwygCaretMapping"
import type { WysiwygVerticalCaretLineAffinity } from "./wysiwygCaretMapping"
import { getInlineEditInputSnapshot } from "./wysiwygTextInteraction"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import {
  applyWysiwygTextInputKey,
  applyWysiwygTextInputText,
  areWysiwygTextSelectionsEqual,
  clampWysiwygTextOffset,
} from "./useWysiwygTextSession"
import type { WysiwygTextInputKey, WysiwygTextSelection, WysiwygTextSessionDraftChange } from "./useWysiwygTextSession"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { isWysiwygPerfTraceRuntimeEnabled } from "./wysiwygPerformance"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import type { WysiwygDraftSyncPayload } from "./wysiwygDraftSyncState"
import {
  areWysiwygImmediateDraftLayoutStatesEqual,
  areWysiwygImmediateTextEchoStatesEqual,
  resolveWysiwygLiveTextEcho,
  shouldFlushWysiwygImmediateVisualState,
  shouldKeepWysiwygImmediateDraftLayout,
  type WysiwygImmediateDraftLayoutState,
  type WysiwygImmediateTextEcho,
  type WysiwygLiveTextEcho,
} from "./wysiwygImmediateVisualState"
import {
  type WysiwygTextPointerFragmentTarget,
} from "./wysiwygTextSelectionState"
import {
  resolveTrailingWhitespaceCaretOverlayInFragment,
  scrollActiveWysiwygCaretIntoEditorCanvas,
} from "./wysiwygCaretViewportState"
import { renderLiveTextEcho } from "./WysiwygLiveTextEchoLayer"
import {
  cloneWysiwygDraftReplacementSourceFragment,
  renderDraftTextReplacement,
  resolveWysiwygLineSourceRange,
  type WysiwygDraftTextReplacementState,
} from "./WysiwygDraftTextReplacementLayer"
import {
  renderCollapsedCaret,
  renderLine,
  shiftFragmentVisualY,
  textColorForRenderProps,
  type WysiwygCaretVisualMode,
} from "./WysiwygTextRenderPrimitives"
import { resolveSelectionOverlayRectsInFragmentWithPerf } from "./WysiwygSelectionOverlayLayer"
import {
  focusElementWithoutScroll,
  isWysiwygRichTextToolbarFocusTarget,
  isWysiwygTextSessionFocusTarget,
} from "./inlineEditSurfaceState"
import { useWysiwygNativeTextareaGeometry } from "./useWysiwygNativeTextareaGeometry"
import { useWysiwygDraftSyncScheduler } from "./useWysiwygDraftSyncScheduler"
import { useWysiwygTextClipboardBridge } from "./useWysiwygTextClipboardBridge"
import { useWysiwygNativeInputBridgeEvents } from "./useWysiwygNativeInputBridgeEvents"
import { useWysiwygPointerSelectionBridge } from "./useWysiwygPointerSelectionBridge"
import { useWysiwygFlowdocDraftVisualState } from "./useWysiwygFlowdocDraftVisualState"
import { WysiwygNativeEditLayer } from "./WysiwygNativeEditLayer"
import { WysiwygFlowdocDraftLayer } from "./WysiwygFlowdocDraftLayer"

const WYSIWYG_TYPING_CARET_HOLD_MS = 650
const WYSIWYG_TEXT_BLUR_SETTLE_MS = 32
const WYSIWYG_FLOWDOC_DRAFT_SYNC_QUIET_MS = 300
const WYSIWYG_TEXT_DRAFT_REPLACEMENT_SETTLE_MS = 180

interface WysiwygLocalDraftVisualState extends WysiwygDraftSyncPayload {
  revision: number
}

interface WysiwygTextLayerProps {
  fragment: PageFragment
  lines?: PaginatedLine[]
  renderProps: ParagraphRenderProps | undefined
  draftParagraphNode?: ParagraphNode | null
  useFlowdocDraftLines?: boolean
  draftPaginationActive?: boolean
  pageContentBottom?: number | null
  pageKey: string
  clipPathId?: string
  scale: number
  textMeasurer?: TextMeasurer
  caretIndex: number | null
  selection?: WysiwygTextSelection | null
  draftText?: string | null
  hasDraftChange?: boolean
  isListItem?: boolean
  onDraftChange?: (nodeId: string, text: string, caretIndex: number | null, selection?: WysiwygTextSelection | null) => void
  onNativeHeightChange?: (nodeId: string, height: number, pageIndex: number | null) => void
  onRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onEndEdit?: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph?: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onReflowDecision?: (nodeId: string, reflow: WysiwygTextReflowDecision) => void
  showTextSegments: boolean
  selectionOverlayRects?: ReturnType<typeof resolveSelectionOverlayRectsInFragment>
  pointerFragments?: WysiwygTextPointerFragmentTarget[]
  reflowKind?: WysiwygTextReflowDecision["kind"]
  liveTextEcho?: WysiwygLiveTextEcho | null
  tableCellDraftVisualPreviewCandidate?: boolean
  followCaretIntoView?: boolean
  suppressLiveTextEcho?: boolean
  relaxNativeEditClip?: boolean
  caretVisualMode?: WysiwygCaretVisualMode
}

export function WysiwygTextLayer({
  fragment,
  lines,
  renderProps,
  draftParagraphNode,
  useFlowdocDraftLines = false,
  draftPaginationActive = false,
  pageContentBottom,
  pageKey,
  clipPathId,
  scale,
  textMeasurer,
  caretIndex,
  selection,
  draftText,
  hasDraftChange = false,
  isListItem = false,
  onDraftChange,
  onNativeHeightChange,
  onRichTextShortcut,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
  onCanStartStructuralEdit,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
  onReflowDecision,
  showTextSegments,
  selectionOverlayRects = [],
  pointerFragments = [],
  reflowKind,
  liveTextEcho,
  tableCellDraftVisualPreviewCandidate = false,
  followCaretIntoView = false,
  suppressLiveTextEcho = false,
  relaxNativeEditClip = false,
  caretVisualMode,
}: WysiwygTextLayerProps) {
  const layerRef = useRef<SVGGElement | null>(null)
  const inputBridgeRef = useRef<HTMLDivElement | null>(null)
  const flowdocDraftReflowRequestRef = useRef<string | null>(null)
  const verticalCaretXRef = useRef<number | null>(null)
  const verticalCaretLineAffinityRef = useRef<WysiwygVerticalCaretLineAffinity | null>(null)
  const isComposingTextEngineRef = useRef(false)
  const suppressNextCompositionInputRef = useRef(false)
  const blurEndEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingCaretIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localCaretVisualMode, setLocalCaretVisualMode] = useState<WysiwygCaretVisualMode>("idle")
  const [immediateTextEcho, setImmediateTextEcho] = useState<WysiwygImmediateTextEcho | null>(null)
  const immediateTextEchoRef = useRef<WysiwygImmediateTextEcho | null>(null)
  const [immediateDraftLayout, setImmediateDraftLayout] = useState<WysiwygImmediateDraftLayoutState | null>(null)
  const immediateDraftLayoutRef = useRef<WysiwygImmediateDraftLayoutState | null>(null)
  const draftReplacementSourceFragmentRef = useRef<PageFragment | null>(null)
  const draftReplacementSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isApplyingImmediateVisualStateRef = useRef(false)
  const continuationDraftSyncFlushKeyRef = useRef<string | null>(null)
  const {
    cancelScheduledDraftSyncFrame,
    flushPendingDraftSync,
    flushPendingDraftSyncImmediately,
    pendingDraftSyncRef,
    scheduleDraftSync,
  } = useWysiwygDraftSyncScheduler({
    nodeId: fragment.nodeId,
    onDraftChange,
  })
  const traceHotPathPerf = useMemo(() => (
    isWysiwygPerfTraceRuntimeEnabled(WYSIWYG_PERF_TRACE_ENABLED)
  ), [])
  const draftStateRef = useRef<{
    text: string
    caretOffset: number | null
    selection: WysiwygTextSelection | null | undefined
  }>({
    text: draftText ?? "",
    caretOffset: caretIndex,
    selection,
  })
  const [flowdocDraftState, setFlowdocDraftState] = useState<WysiwygLocalDraftVisualState>({
    text: draftText ?? "",
    caretOffset: caretIndex,
    selection: selection ?? null,
    revision: 0,
  })
  const setFlowdocDraftSnapshot = useCallback((next: WysiwygDraftSyncPayload) => {
    setFlowdocDraftState((current) => (
      current.text === next.text &&
      current.caretOffset === next.caretOffset &&
      areWysiwygTextSelectionsEqual(current.selection, next.selection)
        ? current
        : { ...next, revision: current.revision + 1 }
    ))
  }, [])
  const activeImmediateDraftLayout = shouldKeepWysiwygImmediateDraftLayout(
    immediateDraftLayout,
    draftText ?? "",
    lines != null,
  ) ? immediateDraftLayout?.layout ?? null : null
  const visualFragment = useMemo(() => (
    activeImmediateDraftLayout
      ? { ...fragment, lines: activeImmediateDraftLayout.lines, height: activeImmediateDraftLayout.height }
      : lines
        ? { ...fragment, lines }
        : fragment
  ), [activeImmediateDraftLayout, fragment, lines])
  const pointerFragmentTargets = useMemo(() => {
    const seen = new Set<string>()
    const targets: WysiwygTextPointerFragmentTarget[] = []
    const addTarget = (target: WysiwygTextPointerFragmentTarget) => {
      const key = [
        target.pageKey,
        target.fragment.nodeId,
        target.fragment.pageIndex,
        target.fragment.fragmentIndex ?? "x",
        target.fragment.lineStart ?? "x",
        target.fragment.lineEnd ?? "x",
      ].join(":")
      if (seen.has(key)) return
      seen.add(key)
      targets.push(target)
    }

    addTarget({ pageKey, fragment: visualFragment })
    for (const target of pointerFragments) addTarget(target)
    return targets
  }, [pageKey, pointerFragments, visualFragment])
  const activeCaretVisualMode = caretVisualMode ?? localCaretVisualMode
  const useNativeEditLayer = true
  const draftTextReplacement = useMemo<WysiwygDraftTextReplacementState | null>(() => {
    if (useNativeEditLayer) return null
    if (activeImmediateDraftLayout) return null
    if (immediateTextEcho) {
      return {
        baseText: immediateTextEcho.baseText,
        draftText: immediateTextEcho.draftText,
        allowDraftOverflow: true,
      }
    }
    if (lines != null) return null
    if (liveTextEcho && draftText != null) {
      const visualBaseText = draftText.slice(0, liveTextEcho.anchorOffset) +
        draftText.slice(liveTextEcho.anchorOffset + liveTextEcho.text.length)
      return {
        baseText: visualBaseText,
        draftText,
        allowDraftOverflow: true,
      }
    }
    if (hasDraftChange && draftText != null && lines == null) {
      return {
        baseText: draftText,
        draftText,
        allowDraftOverflow: false,
      }
    }
    return null
  }, [activeImmediateDraftLayout, draftText, hasDraftChange, immediateTextEcho, lines, liveTextEcho])
  if (draftTextReplacement && !draftReplacementSourceFragmentRef.current) {
    draftReplacementSourceFragmentRef.current = cloneWysiwygDraftReplacementSourceFragment(visualFragment)
  } else if (!draftTextReplacement) {
    draftReplacementSourceFragmentRef.current = null
  }
  const draftReplacementSourceFragment = draftReplacementSourceFragmentRef.current
  const activeVisualFragment = draftReplacementSourceFragment ?? visualFragment
  const {
    activePointerFragmentTargets,
    flowdocDraftLayout,
    flowdocDraftReflowDecision,
    flowdocDraftSelectionCollapsed,
    flowdocDraftVisualFragment,
    hasContinuationPointerFragmentTarget,
    nativeVisualFragment,
    shouldUseFlowdocDraftLines,
  } = useWysiwygFlowdocDraftVisualState({
    activeVisualFragment,
    draftParagraphNode,
    flowdocDraftState,
    isNativeEditLayerEnabled: useNativeEditLayer,
    onNativeHeightChange,
    pageContentBottom,
    pageKey,
    pointerFragmentTargets,
    textMeasurer,
    traceHotPathPerf,
    useFlowdocDraftLines,
  })
  const liveEchoVisual = useMemo(() => (
    useNativeEditLayer || draftTextReplacement || suppressLiveTextEcho
      ? null
      : renderLiveTextEcho(
        activeVisualFragment,
        liveTextEcho,
        renderProps,
        pageKey,
        scale,
        textMeasurer,
        clipPathId,
        activeCaretVisualMode,
    )
  ), [activeCaretVisualMode, activeVisualFragment, clipPathId, draftTextReplacement, liveTextEcho, pageKey, renderProps, scale, suppressLiveTextEcho, textMeasurer])
  const draftTextReplacementVisual = useMemo(() => (
    useNativeEditLayer
      ? null
      : renderDraftTextReplacement(
        activeVisualFragment,
        draftTextReplacement,
        draftStateRef.current.caretOffset,
        renderProps,
        pageKey,
        scale,
        clipPathId,
        activeCaretVisualMode,
      )
  ), [activeCaretVisualMode, activeVisualFragment, clipPathId, draftTextReplacement, pageKey, renderProps, scale])
  const activeLiveEchoVisual = activeImmediateDraftLayout
    ? null
    : draftTextReplacementVisual
      ? null
      : liveEchoVisual
  const visualLines = draftTextReplacementVisual ? null : activeVisualFragment.lines
  const activeVisualMode = (draftTextReplacementVisual || activeImmediateDraftLayout || hasDraftChange)
    ? "flowdoc-draft"
    : activeLiveEchoVisual
      ? "live-echo"
      : "measured-svg"
  const activeVisualDetail = draftTextReplacementVisual
    ? "line-box-draft"
    : activeImmediateDraftLayout
      ? "immediate-measured-draft"
      : hasDraftChange
        ? "measured-draft"
        : "measured"

  useEffect(() => {
    const nextText = draftText ?? ""
    const pendingDraftSync = pendingDraftSyncRef.current
    const immediateDraftText = immediateDraftLayoutRef.current?.draftText ??
      immediateTextEchoRef.current?.draftText ??
      null
    const shouldPreserveLocalDraft = Boolean(
      (
        pendingDraftSync &&
        pendingDraftSync.text !== nextText &&
        draftStateRef.current.text !== nextText
      ) ||
      (
        immediateDraftText &&
        immediateDraftText !== nextText &&
        draftStateRef.current.text === immediateDraftText
      ),
    )
    if (shouldPreserveLocalDraft) return
    draftStateRef.current = {
      text: nextText,
      caretOffset: caretIndex,
      selection,
    }
    setFlowdocDraftSnapshot({
      text: nextText,
      caretOffset: caretIndex,
      selection: selection ?? null,
    })
    const shouldSettleDraftReplacement = Boolean(
      immediateTextEchoRef.current?.draftText === nextText &&
      lines != null &&
      !pendingDraftSync,
    )
    if (shouldSettleDraftReplacement) {
      if (draftReplacementSettleTimerRef.current === null) {
        draftReplacementSettleTimerRef.current = setTimeout(() => {
          draftReplacementSettleTimerRef.current = null
          setImmediateTextEcho((current) => {
            if (!current || current.draftText !== draftStateRef.current.text) return current
            immediateTextEchoRef.current = null
            draftReplacementSourceFragmentRef.current = null
            return null
          })
        }, WYSIWYG_TEXT_DRAFT_REPLACEMENT_SETTLE_MS)
      }
    } else if (draftReplacementSettleTimerRef.current) {
      clearTimeout(draftReplacementSettleTimerRef.current)
      draftReplacementSettleTimerRef.current = null
    }
    setImmediateTextEcho((current) => {
      immediateTextEchoRef.current = current
      return current
    })
    setImmediateDraftLayout((current) => {
      const next = shouldKeepWysiwygImmediateDraftLayout(current, nextText, lines != null)
        ? current
        : null
      immediateDraftLayoutRef.current = next
      return next
    })
  }, [caretIndex, draftText, lines, liveTextEcho, selection, setFlowdocDraftSnapshot])

  useEffect(() => {
    focusElementWithoutScroll(nativeTextareaRef.current ?? inputBridgeRef.current)
  }, [fragment.nodeId])

  useEffect(() => () => {
    if (blurEndEditTimerRef.current) {
      clearTimeout(blurEndEditTimerRef.current)
      blurEndEditTimerRef.current = null
    }
    if (typingCaretIdleTimerRef.current) {
      clearTimeout(typingCaretIdleTimerRef.current)
      typingCaretIdleTimerRef.current = null
    }
    if (draftReplacementSettleTimerRef.current) {
      clearTimeout(draftReplacementSettleTimerRef.current)
      draftReplacementSettleTimerRef.current = null
    }
  }, [])

  useEffect(() => () => {
    flushPendingDraftSync()
  }, [flushPendingDraftSync])

  const scheduleBlurEndEdit = useCallback(() => {
    if (!onEndEdit) return
    if (blurEndEditTimerRef.current) clearTimeout(blurEndEditTimerRef.current)
    blurEndEditTimerRef.current = setTimeout(() => {
      blurEndEditTimerRef.current = null
      const activeElement = typeof document === "undefined" ? null : document.activeElement
      if (isWysiwygTextSessionFocusTarget(activeElement, fragment.nodeId)) return
      flushPendingDraftSyncImmediately()
      onEndEdit(fragment.nodeId, "blur")
    }, WYSIWYG_TEXT_BLUR_SETTLE_MS)
  }, [flushPendingDraftSyncImmediately, fragment.nodeId, onEndEdit])

  const handleLayerBlur = useCallback((event: React.FocusEvent<SVGGElement>) => {
    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null
    if (isWysiwygTextSessionFocusTarget(relatedTarget, fragment.nodeId)) {
      if (isWysiwygRichTextToolbarFocusTarget(relatedTarget, fragment.nodeId)) {
        flushPendingDraftSyncImmediately()
      }
      return
    }
    scheduleBlurEndEdit()
  }, [flushPendingDraftSyncImmediately, fragment.nodeId, scheduleBlurEndEdit])

  const clearInputBridgeText = useCallback((input: HTMLElement | null = inputBridgeRef.current) => {
    if (input) input.textContent = ""
  }, [])

  const markTypingCaretActive = useCallback(() => {
    if (typingCaretIdleTimerRef.current) clearTimeout(typingCaretIdleTimerRef.current)
    setLocalCaretVisualMode("typing")
    typingCaretIdleTimerRef.current = setTimeout(() => {
      typingCaretIdleTimerRef.current = null
      setLocalCaretVisualMode("idle")
    }, WYSIWYG_TYPING_CARET_HOLD_MS)
  }, [])

  const nativeLines = nativeVisualFragment.lines ?? []
  const nativeFirstLine = nativeLines[0]
  const nativeLastLine = nativeLines.length > 0 ? nativeLines[nativeLines.length - 1] : null
  const nativeContentX = nativeVisualFragment.listMarker?.bodyX ?? nativeVisualFragment.x
  const nativeContentY = nativeFirstLine?.y ?? nativeVisualFragment.y
  const nativeContentWidth = Math.max(1, (nativeVisualFragment.x + nativeVisualFragment.width) - nativeContentX)
  const nativeMeasuredTextBlockHeight = nativeFirstLine && nativeLastLine
    ? Math.max(1, (nativeLastLine.y + nativeLastLine.height) - nativeFirstLine.y)
    : Math.max(nativeVisualFragment.height, 1)
  const nativeSpacingBefore = nativeVisualFragment.continuesFrom ? 0 : (renderProps?.spacingBefore ?? 0)
  const nativeSpacingAfter = nativeVisualFragment.isContinued ? 0 : (renderProps?.spacingAfter ?? 0)
  const nativeFontSize = (renderProps?.fontSize ?? 12) * scale
  const nativeLineHeight = (renderProps?.lineHeight ?? (renderProps?.fontSize ?? 12) * 1.5) * scale
  const nativeEditHeight = Math.max((flowdocDraftLayout?.height ?? nativeMeasuredTextBlockHeight) * scale, nativeLineHeight, 1)
  const nativeTextColor = textColorForRenderProps(renderProps)
  const {
    nativeTextareaRef,
    nativeForeignObjectRef,
    nativeHitAreaRef,
    nativeOutlineRef,
    nativeRenderedEditHeight,
    reportNativeHeightPreview,
    scheduleNativeTextareaGeometrySync,
    syncNativeTextareaGeometry,
  } = useWysiwygNativeTextareaGeometry({
    layerRef,
    nodeId: fragment.nodeId,
    pageIndex: fragment.pageIndex,
    nativeEditHeight,
    nativeLineCount: nativeLines.length,
    nativeSpacingBefore,
    nativeSpacingAfter,
    scale,
    shouldUseFlowdocDraftLines,
    onNativeHeightChange,
  })

  useEffect(() => {
    if (!shouldUseFlowdocDraftLines || !flowdocDraftLayout || !onNativeHeightChange) return
    if (flowdocDraftReflowDecision && !flowdocDraftReflowDecision.shouldPatchSamePageHeight) return
    const nextHeight = Math.max(1, flowdocDraftLayout.height + nativeSpacingBefore + nativeSpacingAfter)
    reportNativeHeightPreview(nextHeight, "flowdoc-draft-layout")
    layerRef.current?.setAttribute("data-wysiwyg-native-edit-height", String(nativeEditHeight / scale))
  }, [
    flowdocDraftReflowDecision,
    flowdocDraftLayout,
    fragment.nodeId,
    fragment.pageIndex,
    nativeEditHeight,
    nativeSpacingAfter,
    nativeSpacingBefore,
    onNativeHeightChange,
    reportNativeHeightPreview,
    scale,
    shouldUseFlowdocDraftLines,
  ])

  useEffect(() => {
    if (!shouldUseFlowdocDraftLines || !flowdocDraftLayout || !flowdocDraftReflowDecision) return
    if (flowdocDraftReflowDecision.kind === "soft") return
    flushPendingDraftSync()
  }, [
    flowdocDraftLayout,
    flowdocDraftReflowDecision,
    flushPendingDraftSync,
    shouldUseFlowdocDraftLines,
  ])

  useEffect(() => {
    if (!shouldUseFlowdocDraftLines) return
    if (!draftPaginationActive && !hasContinuationPointerFragmentTarget) return
    if (draftText === flowdocDraftState.text) return
    const pendingDraftSync = pendingDraftSyncRef.current
    if (!pendingDraftSync || pendingDraftSync.text !== flowdocDraftState.text) return
    const flushKey = [
      fragment.nodeId,
      fragment.pageIndex,
      flowdocDraftState.revision,
      flowdocDraftState.text.length,
    ].join(":")
    if (continuationDraftSyncFlushKeyRef.current === flushKey) return
    continuationDraftSyncFlushKeyRef.current = flushKey
    const timeoutId = setTimeout(() => {
      const latestPendingDraftSync = pendingDraftSyncRef.current
      if (!latestPendingDraftSync || latestPendingDraftSync.text !== flowdocDraftState.text) return
      flushPendingDraftSync()
    }, 0)
    return () => {
      clearTimeout(timeoutId)
      if (continuationDraftSyncFlushKeyRef.current === flushKey) {
        continuationDraftSyncFlushKeyRef.current = null
      }
    }
  }, [
    draftPaginationActive,
    draftText,
    fragment.nodeId,
    fragment.pageIndex,
    flowdocDraftState.revision,
    flowdocDraftState.text,
    flushPendingDraftSync,
    hasContinuationPointerFragmentTarget,
    shouldUseFlowdocDraftLines,
  ])

  useEffect(() => {
    if (
      !shouldUseFlowdocDraftLines ||
      !flowdocDraftLayout ||
      !flowdocDraftReflowDecision ||
      flowdocDraftReflowDecision.kind !== "hard-page-boundary" ||
      !flowdocDraftReflowDecision.shouldQueueSettledPagination ||
      !onReflowDecision
    ) {
      return
    }
    const key = [
      fragment.nodeId,
      fragment.pageIndex ?? "null",
      "hard-page-boundary",
      pageContentBottom ?? "x",
    ].join(":")
    if (flowdocDraftReflowRequestRef.current === key) return
    flowdocDraftReflowRequestRef.current = key
    onReflowDecision(fragment.nodeId, flowdocDraftReflowDecision)
  }, [
    flowdocDraftLayout,
    flowdocDraftReflowDecision,
    fragment.nodeId,
    fragment.pageIndex,
    onReflowDecision,
    pageContentBottom,
    shouldUseFlowdocDraftLines,
  ])

  const applyNativeTextareaDraft = useCallback((textarea: HTMLTextAreaElement, options: { defer?: boolean } = {}) => {
    const selectionStart = textarea.selectionStart ?? textarea.value.length
    const selectionEnd = textarea.selectionEnd ?? selectionStart
    const nextSelection = selectionStart === selectionEnd
      ? null
      : { anchorOffset: selectionStart, focusOffset: selectionEnd }
    draftStateRef.current = {
      text: textarea.value,
      caretOffset: selectionEnd,
      selection: nextSelection,
    }
    if (shouldUseFlowdocDraftLines) {
      setFlowdocDraftSnapshot({
        text: textarea.value,
        caretOffset: selectionEnd,
        selection: nextSelection,
      })
    }
    scheduleDraftSync({
      text: textarea.value,
      caretOffset: selectionEnd,
      selection: nextSelection,
    }, {
      defer: options.defer ?? true,
      quietWindowMs: shouldUseFlowdocDraftLines ? WYSIWYG_FLOWDOC_DRAFT_SYNC_QUIET_MS : undefined,
    })
  }, [scheduleDraftSync, setFlowdocDraftSnapshot, shouldUseFlowdocDraftLines])

  useEffect(() => {
    const textarea = nativeTextareaRef.current
    if (!textarea) return
    const caret = Math.max(0, Math.min(caretIndex ?? textarea.value.length, textarea.value.length))
    requestAnimationFrame(() => {
      focusElementWithoutScroll(textarea)
      textarea.setSelectionRange(caret, caret)
      scheduleNativeTextareaGeometrySync(textarea, "mount")
    })
  }, [caretIndex, fragment.nodeId, scheduleNativeTextareaGeometrySync])

  const applyDraftChange = useCallback((
    change: WysiwygTextSessionDraftChange | null,
    options: { preserveVerticalCaretX?: boolean } = {},
  ) => {
    if (!change || !onDraftChange) return false
    if (!options.preserveVerticalCaretX) {
      verticalCaretXRef.current = null
      verticalCaretLineAffinityRef.current = null
    }
    const previousText = draftStateRef.current.text
    const previousCaretOffset = draftStateRef.current.caretOffset
    const previousSelection = draftStateRef.current.selection ?? null
    const nextCaretOffset = change.caretOffset ?? null
    const nextSelection = change.selection ?? null
    const textChanged = change.text !== previousText
    if (
      !textChanged &&
      previousCaretOffset === nextCaretOffset &&
      areWysiwygTextSelectionsEqual(previousSelection, nextSelection)
    ) return false
    if (draftReplacementSettleTimerRef.current) {
      clearTimeout(draftReplacementSettleTimerRef.current)
      draftReplacementSettleTimerRef.current = null
    }
    draftStateRef.current = {
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
    }
    if (shouldUseFlowdocDraftLines) {
      setFlowdocDraftSnapshot({
        text: change.text,
        caretOffset: nextCaretOffset,
        selection: nextSelection,
      })
    }
    const immediateEchoBaseText = immediateTextEchoRef.current?.baseText ?? draftText ?? ""
    const nextImmediateTextEcho = change.text === immediateEchoBaseText
      ? null
      : { baseText: immediateEchoBaseText, draftText: change.text }
    const nextImmediateDraftLayoutState = null
    const previousImmediateTextEcho = immediateTextEchoRef.current
    const previousImmediateDraftLayout = immediateDraftLayoutRef.current
    const immediateVisualChanged = !areWysiwygImmediateTextEchoStatesEqual(
      previousImmediateTextEcho,
      nextImmediateTextEcho,
    ) || !areWysiwygImmediateDraftLayoutStatesEqual(
      previousImmediateDraftLayout,
      nextImmediateDraftLayoutState,
    )
    const applyImmediateVisualState = () => {
      setImmediateTextEcho((current) => (
        areWysiwygImmediateTextEchoStatesEqual(current, nextImmediateTextEcho)
          ? current
          : nextImmediateTextEcho
      ))
      setImmediateDraftLayout((current) => (
        areWysiwygImmediateDraftLayoutStatesEqual(current, nextImmediateDraftLayoutState)
          ? current
          : nextImmediateDraftLayoutState
      ))
    }
    immediateTextEchoRef.current = nextImmediateTextEcho
    immediateDraftLayoutRef.current = nextImmediateDraftLayoutState
    if (immediateVisualChanged) {
      const shouldFlush = shouldFlushWysiwygImmediateVisualState({
        previousTextEcho: previousImmediateTextEcho,
        previousDraftLayout: previousImmediateDraftLayout,
        nextTextEcho: nextImmediateTextEcho,
        nextDraftLayout: nextImmediateDraftLayoutState,
      })
      if (shouldFlush && !isApplyingImmediateVisualStateRef.current) {
        isApplyingImmediateVisualStateRef.current = true
        try {
          flushSync(applyImmediateVisualState)
        } finally {
          isApplyingImmediateVisualStateRef.current = false
        }
      } else {
        applyImmediateVisualState()
      }
    }
    scheduleDraftSync({
      text: change.text,
      caretOffset: nextCaretOffset,
      selection: nextSelection,
    }, {
      defer: textChanged,
      quietWindowMs: shouldUseFlowdocDraftLines ? WYSIWYG_FLOWDOC_DRAFT_SYNC_QUIET_MS : undefined,
    })
    if (textChanged) markTypingCaretActive()
    return true
  }, [draftText, markTypingCaretActive, onDraftChange, scheduleDraftSync, setFlowdocDraftSnapshot, shouldUseFlowdocDraftLines])

  const applyTextInput = useCallback((insertedText: string) => {
    if (!insertedText || !onDraftChange) return false
    const current = draftStateRef.current
    return applyDraftChange(applyWysiwygTextInputText(
      current.text,
      current.caretOffset,
      insertedText,
      current.selection,
    ))
  }, [applyDraftChange, onDraftChange])

  const {
    applyClipboardCutToDraft,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
  } = useWysiwygTextClipboardBridge({
    draftStateRef,
    applyDraftChange,
    applyTextInput,
    clearInputBridgeText,
  })

  const applyKeyInput = useCallback((input: {
    key: string
    shiftKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
  }) => {
    if (!onDraftChange) return false
    const current = draftStateRef.current
    return applyDraftChange(applyWysiwygTextInputKey(current.text, current.caretOffset, input, current.selection))
  }, [applyDraftChange, onDraftChange])

  const applyVerticalKeyInput = useCallback((input: {
    key: string
    shiftKey?: boolean
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    isComposing?: boolean
  }) => {
    if (!onDraftChange) return false
    if (input.key !== "ArrowUp" && input.key !== "ArrowDown") return false
    if (input.isComposing || input.altKey || input.ctrlKey || input.metaKey) return false

    const current = draftStateRef.current
    const caretOffset = clampWysiwygTextOffset(current.text, current.caretOffset) ?? current.text.length
    const navigation = resolveVerticalCaretNavigationInFragments(
      activePointerFragmentTargets.map((target) => target.fragment),
      caretOffset,
      input.key === "ArrowUp" ? "up" : "down",
      {
        preferredX: verticalCaretXRef.current,
        lineAffinity: verticalCaretLineAffinityRef.current,
        textMeasurer,
      },
    )
    if (!navigation) return false

    verticalCaretXRef.current = navigation.preferredX
    verticalCaretLineAffinityRef.current = navigation.lineAffinity
    const selectionAnchor = input.shiftKey
      ? clampWysiwygTextOffset(current.text, current.selection?.anchorOffset) ?? caretOffset
      : navigation.offset
    return applyDraftChange({
      text: current.text,
      caretOffset: navigation.offset,
      selection: {
        anchorOffset: selectionAnchor,
        focusOffset: navigation.offset,
      },
    }, { preserveVerticalCaretX: true })
  }, [activePointerFragmentTargets, applyDraftChange, onDraftChange, textMeasurer])

  useWysiwygNativeInputBridgeEvents({
    inputBridgeRef,
    nodeId: fragment.nodeId,
    isListItem,
    isComposingTextEngineRef,
    suppressNextCompositionInputRef,
    draftStateRef,
    pendingDraftSyncRef,
    applyClipboardCutToDraft,
    applyKeyInput,
    applyTextInput,
    applyVerticalKeyInput,
    cancelScheduledDraftSyncFrame,
    clearInputBridgeText,
    flushPendingDraftSyncImmediately,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
    onBackspaceListItemAtStart,
    onCanStartStructuralEdit,
    onChangeListItemLevel,
    onEndEdit,
    onExitListItem,
    onMergeParagraph,
    onRichTextShortcut,
    onSplitParagraph,
  })

  const {
    activePointerIdRef,
    cancelScheduledPointerSelection,
    finishPointerSelection,
    handleClick,
    handleDoubleClick,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerSelectionWheel,
    handlePointerUp,
    isPointerSelecting,
    localPointerSelectionPreview,
    pointerDragStartPointRef,
    pointerSelectionAnchorRef,
    schedulePointerSelectionFromClientPoint,
    setIsPointerSelecting,
  } = useWysiwygPointerSelectionBridge({
    activePointerFragmentTargets,
    draftStateRef,
    draftText,
    inputBridgeRef,
    nativeTextareaRef,
    nodeId: fragment.nodeId,
    onDraftChange,
    pageIndex: fragment.pageIndex,
    scale,
    selection,
    setFlowdocDraftSnapshot,
    shouldUseFlowdocDraftLines,
    textMeasurer,
    traceHotPathPerf,
    verticalCaretLineAffinityRef,
    verticalCaretXRef,
  })

  const localPointerSelectionOverlayRects = useMemo(() => {
    if (useNativeEditLayer && !shouldUseFlowdocDraftLines) return []
    if (!localPointerSelectionPreview) return []
    if (localPointerSelectionPreview.anchorOffset === localPointerSelectionPreview.focusOffset) return []
    const selectionFragment = shouldUseFlowdocDraftLines
      ? flowdocDraftVisualFragment ?? activeVisualFragment
      : activeVisualFragment
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: selectionFragment,
      anchorOffset: localPointerSelectionPreview.anchorOffset,
      focusOffset: localPointerSelectionPreview.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: "local-pointer",
    })
  }, [
    activeVisualFragment,
    flowdocDraftVisualFragment,
    localPointerSelectionPreview,
    shouldUseFlowdocDraftLines,
    textMeasurer,
    traceHotPathPerf,
  ])
  const flowdocDraftSelectionOverlayRects = useMemo(() => {
    if (!shouldUseFlowdocDraftLines || !flowdocDraftVisualFragment) return []
    const activeSelection = localPointerSelectionPreview ?? flowdocDraftState.selection
    if (!activeSelection || activeSelection.anchorOffset === activeSelection.focusOffset) return []
    return resolveSelectionOverlayRectsInFragmentWithPerf({
      fragment: flowdocDraftVisualFragment,
      anchorOffset: activeSelection.anchorOffset,
      focusOffset: activeSelection.focusOffset,
      textMeasurer,
      tracePerf: traceHotPathPerf,
      source: localPointerSelectionPreview ? "local-pointer" : "flowdoc-draft",
    })
  }, [
    flowdocDraftState.selection,
    flowdocDraftVisualFragment,
    localPointerSelectionPreview,
    shouldUseFlowdocDraftLines,
    textMeasurer,
    traceHotPathPerf,
  ])
  const activeSelectionOverlayRects = localPointerSelectionPreview
    ? localPointerSelectionOverlayRects
    : selectionOverlayRects
  const activeCaretIndex = localPointerSelectionPreview?.focusOffset ?? caretIndex
  const trailingWhitespaceCaretOverlay = useNativeEditLayer || activeLiveEchoVisual?.caret
    ? null
    : resolveTrailingWhitespaceCaretOverlayInFragment({
      fragment: activeVisualFragment,
      caretIndex: activeCaretIndex,
      draftText: draftStateRef.current.text,
      textMeasurer,
    })
  const caretFollowKey = useMemo(() => [
    activeCaretIndex ?? "x",
    activeCaretVisualMode,
    draftText?.length ?? 0,
    immediateTextEcho?.draftText.length ?? 0,
    immediateDraftLayout?.draftText.length ?? 0,
    activeVisualFragment.pageIndex,
    activeVisualFragment.fragmentIndex ?? "x",
    activeVisualFragment.lineStart ?? "x",
    activeVisualFragment.lineEnd ?? "x",
    activeVisualFragment.height,
    activeVisualFragment.lines?.length ?? 0,
    reflowKind ?? "x",
    activeImmediateDraftLayout ? "immediate" : "settled",
    activeLiveEchoVisual?.caret ? "live" : "mapped",
  ].join(":"), [
    activeCaretIndex,
    activeCaretVisualMode,
    activeImmediateDraftLayout,
    activeLiveEchoVisual?.caret,
    draftText?.length,
    immediateDraftLayout?.draftText.length,
    immediateTextEcho?.draftText.length,
    reflowKind,
    activeVisualFragment.fragmentIndex,
    activeVisualFragment.height,
    activeVisualFragment.lineEnd,
    activeVisualFragment.lineStart,
    activeVisualFragment.lines?.length,
    activeVisualFragment.pageIndex,
  ])

  useEffect(() => {
    if (!followCaretIntoView) return
    if (typeof requestAnimationFrame !== "function") {
      scrollActiveWysiwygCaretIntoEditorCanvas(layerRef.current)
      return
    }
    const frame = requestAnimationFrame(() => {
      scrollActiveWysiwygCaretIntoEditorCanvas(layerRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [caretFollowKey, followCaretIntoView])

  const flowdocDraftLineVisual = flowdocDraftVisualFragment?.lines?.length
    ? (() => {
      let fallbackStart = 0
      return (
        <g
          data-wysiwyg-flowdoc-draft-lines="true"
          data-wysiwyg-flowdoc-draft-line-count={flowdocDraftVisualFragment.lines?.length ?? 0}
          data-wysiwyg-flowdoc-draft-text-length={flowdocDraftState.text.length}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {flowdocDraftVisualFragment.lines?.map((line, index) => {
            const range = resolveWysiwygLineSourceRange(line, fallbackStart)
            fallbackStart = Math.max(range.end, fallbackStart + line.text.length)
            return (
              <g
                key={`flowdoc-draft-line-${index}`}
                data-wysiwyg-flowdoc-draft-line="true"
                data-wysiwyg-draft-line-index={index}
                data-wysiwyg-draft-line-start={range.start}
                data-wysiwyg-draft-line-end={range.end}
              >
                {renderLine(
                  line,
                  index,
                  flowdocDraftVisualFragment,
                  renderProps,
                  pageKey,
                  scale,
                  undefined,
                  relaxNativeEditClip ? null : clipPathId,
                )}
              </g>
            )
          })}
        </g>
      )
    })()
    : null
  const flowdocDraftCaret = flowdocDraftVisualFragment
    ? renderCollapsedCaret(
      flowdocDraftVisualFragment,
      pageKey,
      scale,
      flowdocDraftState.caretOffset,
      textMeasurer,
      relaxNativeEditClip ? null : clipPathId,
      activeCaretVisualMode,
    )
    : null

  const nativeEditLayer = (
    <WysiwygNativeEditLayer
      activePointerFragmentCount={activePointerFragmentTargets.length}
      applyNativeTextareaDraft={applyNativeTextareaDraft}
      clipPathId={clipPathId}
      draftStateRef={draftStateRef}
      flowdocDraftCaret={flowdocDraftCaret}
      flowdocDraftLineVisual={flowdocDraftLineVisual}
      flowdocDraftReflowKind={flowdocDraftReflowDecision?.kind}
      flowdocDraftSelectionCollapsed={flowdocDraftSelectionCollapsed}
      flowdocDraftState={flowdocDraftState}
      flowdocDraftVisualFragment={flowdocDraftVisualFragment}
      flushPendingDraftSyncImmediately={flushPendingDraftSyncImmediately}
      fragment={fragment}
      hasNativeHeightHandoff={onNativeHeightChange != null}
      isComposingTextEngineRef={isComposingTextEngineRef}
      isListItem={isListItem}
      layerRef={layerRef}
      nativeContentWidth={nativeContentWidth}
      nativeContentX={nativeContentX}
      nativeContentY={nativeContentY}
      nativeEditHeight={nativeEditHeight}
      nativeFirstLineY={nativeFirstLine?.y}
      nativeFontSize={nativeFontSize}
      nativeForeignObjectRef={nativeForeignObjectRef}
      nativeHitAreaRef={nativeHitAreaRef}
      nativeLineHeight={nativeLineHeight}
      nativeMeasuredTextBlockHeight={nativeMeasuredTextBlockHeight}
      nativeOutlineRef={nativeOutlineRef}
      nativeRenderedEditHeight={nativeRenderedEditHeight}
      nativeTextareaRef={nativeTextareaRef}
      nativeTextColor={nativeTextColor}
      nativeVisualFragment={nativeVisualFragment}
      onBackspaceListItemAtStart={onBackspaceListItemAtStart}
      onCanStartStructuralEdit={onCanStartStructuralEdit}
      onChangeListItemLevel={onChangeListItemLevel}
      onEndEdit={onEndEdit}
      onExitListItem={onExitListItem}
      onMergeParagraph={onMergeParagraph}
      onRichTextShortcut={onRichTextShortcut}
      onSplitParagraph={onSplitParagraph}
      pageKey={pageKey}
      relaxNativeEditClip={relaxNativeEditClip}
      renderProps={renderProps}
      reflowKind={reflowKind}
      scale={scale}
      scheduleBlurEndEdit={scheduleBlurEndEdit}
      scheduleDraftSync={scheduleDraftSync}
      scheduleNativeTextareaGeometrySync={scheduleNativeTextareaGeometrySync}
      setFlowdocDraftSnapshot={setFlowdocDraftSnapshot}
      shouldUseFlowdocDraftLines={shouldUseFlowdocDraftLines}
      syncNativeTextareaGeometry={syncNativeTextareaGeometry}
    />
  )

  if (!shouldUseFlowdocDraftLines || !flowdocDraftVisualFragment) return nativeEditLayer

  return (
    <WysiwygFlowdocDraftLayer
      activeCaretVisualMode={activeCaretVisualMode}
      activePointerFragmentCount={activePointerFragmentTargets.length}
      activePointerIdRef={activePointerIdRef}
      cancelScheduledPointerSelection={cancelScheduledPointerSelection}
      clipPathId={clipPathId}
      finishPointerSelection={finishPointerSelection}
      flowdocDraftCaret={flowdocDraftCaret}
      flowdocDraftLineVisual={flowdocDraftLineVisual}
      flowdocDraftReflowKind={flowdocDraftReflowDecision?.kind}
      flowdocDraftSelectionCollapsed={flowdocDraftSelectionCollapsed}
      flowdocDraftSelectionOverlayRects={flowdocDraftSelectionOverlayRects}
      flowdocDraftState={flowdocDraftState}
      flowdocDraftVisualFragment={flowdocDraftVisualFragment}
      fragment={fragment}
      handleClick={handleClick}
      handleDoubleClick={handleDoubleClick}
      handleLayerBlur={handleLayerBlur}
      handlePointerCancel={handlePointerCancel}
      handlePointerDown={handlePointerDown}
      handlePointerMove={handlePointerMove}
      handlePointerSelectionWheel={handlePointerSelectionWheel}
      handlePointerUp={handlePointerUp}
      inputBridgeRef={inputBridgeRef}
      isPointerSelecting={isPointerSelecting}
      layerRef={layerRef}
      localPointerSelectionPreview={localPointerSelectionPreview}
      nativeContentWidth={nativeContentWidth}
      nativeContentX={nativeContentX}
      nativeContentY={nativeContentY}
      nativeRenderedEditHeight={nativeRenderedEditHeight}
      pageKey={pageKey}
      pointerDragStartPointRef={pointerDragStartPointRef}
      pointerSelectionAnchorRef={pointerSelectionAnchorRef}
      reflowKind={reflowKind}
      relaxNativeEditClip={relaxNativeEditClip}
      renderProps={renderProps}
      scale={scale}
      schedulePointerSelectionFromClientPoint={schedulePointerSelectionFromClientPoint}
      setIsPointerSelecting={setIsPointerSelecting}
      showTextSegments={showTextSegments}
    />
  )
}
