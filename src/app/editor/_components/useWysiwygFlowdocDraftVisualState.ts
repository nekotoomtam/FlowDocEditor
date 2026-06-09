import { useMemo, useRef } from "react"
import type { TextMeasurer } from "@/layout"
import type { ParagraphNode } from "@/schema"
import type { PageFragment } from "@/pagination"
import { isCollapsedWysiwygTextSelection } from "./inlineEditSurfaceState"
import type { WysiwygTextSelection } from "./useWysiwygTextSession"
import {
  buildCachedWysiwygDraftParagraphLayout,
  createWysiwygDraftParagraphLayoutCache,
} from "./wysiwygDraftParagraphLayout"
import { classifyWysiwygTextReflow } from "./wysiwygReflow"
import type { WysiwygTextPointerFragmentTarget } from "./wysiwygTextSelectionState"

interface WysiwygFlowdocDraftState {
  text: string
  selection: WysiwygTextSelection | null | undefined
}

interface UseWysiwygFlowdocDraftVisualStateInput {
  activeVisualFragment: PageFragment
  draftParagraphNode?: ParagraphNode | null
  flowdocDraftState: WysiwygFlowdocDraftState
  isNativeEditLayerEnabled: boolean
  onNativeHeightChange?: (nodeId: string, height: number, pageIndex: number | null) => void
  pageContentBottom?: number | null
  pageKey: string
  pointerFragmentTargets: WysiwygTextPointerFragmentTarget[]
  textMeasurer?: TextMeasurer
  traceHotPathPerf: boolean
  useFlowdocDraftLines: boolean
}

export function useWysiwygFlowdocDraftVisualState(input: UseWysiwygFlowdocDraftVisualStateInput) {
  const flowdocDraftLayoutCacheRef = useRef(createWysiwygDraftParagraphLayoutCache())
  const flowdocDraftSelectionCollapsed = isCollapsedWysiwygTextSelection(input.flowdocDraftState.selection)
  const shouldUseFlowdocDraftLines = Boolean(
    input.isNativeEditLayerEnabled &&
    input.useFlowdocDraftLines &&
    input.draftParagraphNode &&
    input.textMeasurer,
  )

  const flowdocDraftLayout = useMemo(() => {
    if (!shouldUseFlowdocDraftLines || !input.draftParagraphNode || !input.textMeasurer) return null
    const measuredLayout = buildCachedWysiwygDraftParagraphLayout(
      flowdocDraftLayoutCacheRef.current,
      input.activeVisualFragment,
      input.draftParagraphNode,
      input.flowdocDraftState.text,
      input.textMeasurer,
      {
        allowContinuedFirstFragment: !input.activeVisualFragment.continuesFrom,
        traceMeasure: input.traceHotPathPerf,
      },
    )
    if (measuredLayout) {
      if (input.activeVisualFragment.isContinued && !input.activeVisualFragment.continuesFrom) {
        const sliceStart = Math.max(0, input.activeVisualFragment.lineStart ?? 0)
        const sliceEnd = Math.min(
          measuredLayout.lines.length,
          input.activeVisualFragment.lineEnd ?? measuredLayout.lines.length,
        )
        const sliceLines = measuredLayout.lines.slice(sliceStart, sliceEnd)
        if (sliceLines.length > 0) {
          return {
            lines: sliceLines,
            height: input.activeVisualFragment.height,
          }
        }
      }
      return measuredLayout
    }
    if (input.activeVisualFragment.lines?.length) {
      return {
        lines: input.activeVisualFragment.lines,
        height: input.activeVisualFragment.height,
      }
    }
    return null
  }, [
    input.activeVisualFragment,
    input.draftParagraphNode,
    input.flowdocDraftState.text,
    input.textMeasurer,
    input.traceHotPathPerf,
    shouldUseFlowdocDraftLines,
  ])

  const flowdocDraftVisualFragment = useMemo(() => (
    flowdocDraftLayout
      ? { ...input.activeVisualFragment, lines: flowdocDraftLayout.lines, height: flowdocDraftLayout.height }
      : null
  ), [input.activeVisualFragment, flowdocDraftLayout])

  const flowdocDraftReflowDecision = useMemo(() => {
    if (!shouldUseFlowdocDraftLines || !flowdocDraftLayout) return null
    return classifyWysiwygTextReflow({
      fragment: input.activeVisualFragment,
      draftLines: flowdocDraftLayout.lines,
      draftHeight: flowdocDraftLayout.height,
      pageContentBottom: input.pageContentBottom,
      supportsLocalDraftLayout: !input.activeVisualFragment.continuesFrom,
      supportsSamePageHeightPatch: input.onNativeHeightChange != null,
    })
  }, [
    flowdocDraftLayout,
    input.activeVisualFragment,
    input.onNativeHeightChange,
    input.pageContentBottom,
    shouldUseFlowdocDraftLines,
  ])

  const activePointerFragmentTargets = useMemo(() => {
    if (!flowdocDraftVisualFragment) return input.pointerFragmentTargets
    return input.pointerFragmentTargets.map((target) => (
      target.pageKey === input.pageKey &&
      target.fragment.nodeId === input.activeVisualFragment.nodeId &&
      target.fragment.pageIndex === input.activeVisualFragment.pageIndex
        ? { ...target, fragment: flowdocDraftVisualFragment }
        : target
    ))
  }, [
    flowdocDraftVisualFragment,
    input.activeVisualFragment.nodeId,
    input.activeVisualFragment.pageIndex,
    input.pageKey,
    input.pointerFragmentTargets,
  ])

  const hasContinuationPointerFragmentTarget = useMemo(() => (
    input.pointerFragmentTargets.some((target) =>
      target.fragment.nodeId === input.activeVisualFragment.nodeId &&
      target.fragment.pageIndex !== input.activeVisualFragment.pageIndex
    )
  ), [
    input.activeVisualFragment.nodeId,
    input.activeVisualFragment.pageIndex,
    input.pointerFragmentTargets,
  ])

  return {
    activePointerFragmentTargets,
    flowdocDraftLayout,
    flowdocDraftReflowDecision,
    flowdocDraftSelectionCollapsed,
    flowdocDraftVisualFragment,
    hasContinuationPointerFragmentTarget,
    nativeVisualFragment: flowdocDraftVisualFragment ?? input.activeVisualFragment,
    shouldUseFlowdocDraftLines,
  }
}
