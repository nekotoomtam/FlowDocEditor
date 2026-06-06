import {
  isTextRunOnlyParagraph,
  replaceTextRunParagraphTextInParagraph,
} from "@/document"
import {
  measureParagraph,
  paragraphBoxLeftInset,
  resolveParagraphBoxStyle,
} from "@/layout"
import type { TextMeasurer } from "@/layout"
import { buildPositionedParagraphLines } from "@/pagination"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import type { ParagraphBoxStyle, ParagraphNode } from "@/schema"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { finishWysiwygPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"

function paragraphWithDraftText(node: ParagraphNode, draftText: string): ParagraphNode | null {
  if (!isTextRunOnlyParagraph(node)) return null
  return replaceTextRunParagraphTextInParagraph(node, draftText) ?? node
}

export interface WysiwygDraftParagraphLayout {
  lines: PaginatedLine[]
  height: number
}

export interface WysiwygDraftParagraphLayoutCache {
  nodeId: string | null
  textMeasurer: TextMeasurer | null
  entries: Map<string, WysiwygDraftParagraphLayout>
}

const WYSIWYG_DRAFT_PARAGRAPH_LAYOUT_CACHE_LIMIT = 64

export function createWysiwygDraftParagraphLayoutCache(): WysiwygDraftParagraphLayoutCache {
  return {
    nodeId: null,
    textMeasurer: null,
    entries: new Map(),
  }
}

function cloneWysiwygDraftParagraphLayout(layout: WysiwygDraftParagraphLayout): WysiwygDraftParagraphLayout {
  return {
    height: layout.height,
    lines: layout.lines.map((line) => ({
      ...line,
      runs: line.runs?.map((run) => ({
        ...run,
        style: run.style ? { ...run.style } : run.style,
      })),
      segments: line.segments?.map((segment) => ({ ...segment })),
    })),
  }
}

function ptUnit(value: number) {
  return { value, unit: "pt" as const }
}

function paragraphBoxStyleFromRenderProps(renderProps: ParagraphRenderProps): ParagraphBoxStyle | undefined {
  const box = renderProps.box
  if (!box) return undefined
  const border = {
    top: box.border.top ? { ...box.border.top, width: ptUnit(box.border.top.width) } : undefined,
    right: box.border.right ? { ...box.border.right, width: ptUnit(box.border.right.width) } : undefined,
    bottom: box.border.bottom ? { ...box.border.bottom, width: ptUnit(box.border.bottom.width) } : undefined,
    left: box.border.left ? { ...box.border.left, width: ptUnit(box.border.left.width) } : undefined,
  }
  const hasBorder = Object.values(border).some(Boolean)
  return {
    fill: box.fill,
    padding: {
      top: ptUnit(box.padding.top),
      right: ptUnit(box.padding.right),
      bottom: ptUnit(box.padding.bottom),
      left: ptUnit(box.padding.left),
    },
    ...(hasBorder ? { border } : {}),
  }
}

export function paragraphWithWysiwygFragmentRenderProps(fragment: PageFragment, node: ParagraphNode): ParagraphNode {
  const renderProps = fragment.renderProps
  if (!renderProps) return node
  const lineHeightRatio = renderProps.fontSize > 0
    ? renderProps.lineHeight / renderProps.fontSize
    : node.props.lineHeight
  return {
    ...node,
    props: {
      ...node.props,
      align: renderProps.align,
      fontSize: ptUnit(renderProps.fontSize),
      fontFamilyKey: renderProps.fontFamilyKey,
      textColor: renderProps.textColor,
      fontWeight: renderProps.fontWeight,
      fontStyle: renderProps.fontStyle,
      textDecoration: renderProps.textDecoration,
      strikethrough: renderProps.strikethrough,
      lineHeight: Number.isFinite(lineHeightRatio) && lineHeightRatio > 0
        ? lineHeightRatio
        : node.props.lineHeight,
      spacingBefore: ptUnit(renderProps.spacingBefore),
      spacingAfter: ptUnit(renderProps.spacingAfter),
      textIndent: ptUnit(renderProps.textIndent),
      indentLeft: ptUnit(renderProps.indentLeft),
      indentRight: ptUnit(renderProps.indentRight),
      box: paragraphBoxStyleFromRenderProps(renderProps) ?? node.props.box,
    },
  }
}

export function createWysiwygDraftParagraphLayoutCacheKey(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  options: { allowContinuedFirstFragment?: boolean } = {},
): string {
  return JSON.stringify({
    draftText,
    fragment: {
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      listMarker: fragment.listMarker
        ? {
          markerIndent: fragment.listMarker.markerIndent,
          bodyIndent: fragment.listMarker.bodyIndent,
          markerX: fragment.listMarker.markerX,
          bodyX: fragment.listMarker.bodyX,
        }
        : null,
      continuesFrom: fragment.continuesFrom ?? false,
      isContinued: fragment.isContinued ?? false,
      lineStart: fragment.lineStart ?? null,
      lineEnd: fragment.lineEnd ?? null,
      renderProps: fragment.renderProps ?? null,
    },
    node: {
      id: node.id,
      props: node.props,
      children: node.children.map((child) => (
        child.type === "text"
          ? { id: child.id, type: child.type, text: child.text, style: child.style }
          : { ...child }
      )),
    },
    options: {
      allowContinuedFirstFragment: options.allowContinuedFirstFragment ?? false,
    },
  })
}

function resolveWysiwygListBodyIndent(fragment: PageFragment, node: ParagraphNode): number | null {
  const marker = fragment.listMarker
  if (!marker) return null
  const box = resolveParagraphBoxStyle(node.props.box, fragment.width)
  const contentOriginX = fragment.x + paragraphBoxLeftInset(box)
  const bodyIndent = marker.bodyX - contentOriginX
  if (Number.isFinite(bodyIndent)) return Math.max(0, bodyIndent)
  return Math.max(0, marker.bodyIndent)
}

function withWysiwygListBodyIndent(fragment: PageFragment, node: ParagraphNode): ParagraphNode {
  const bodyIndent = resolveWysiwygListBodyIndent(fragment, node)
  if (bodyIndent == null) return node
  return {
    ...node,
    props: {
      ...node.props,
      indentLeft: { value: bodyIndent, unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
    },
  }
}

export function buildCachedWysiwygDraftParagraphLayout(
  cache: WysiwygDraftParagraphLayoutCache,
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
  options: { allowContinuedFirstFragment?: boolean; traceMeasure?: boolean } = {},
): WysiwygDraftParagraphLayout | null {
  if (cache.nodeId !== fragment.nodeId || cache.textMeasurer !== textMeasurer) {
    cache.nodeId = fragment.nodeId
    cache.textMeasurer = textMeasurer
    cache.entries.clear()
  }

  const key = createWysiwygDraftParagraphLayoutCacheKey(fragment, node, draftText, options)
  const cached = cache.entries.get(key)
  if (cached) {
    cache.entries.delete(key)
    cache.entries.set(key, cached)
    return cloneWysiwygDraftParagraphLayout(cached)
  }

  const layout = buildWysiwygDraftParagraphLayout(fragment, node, draftText, textMeasurer, options)
  if (!layout) return null

  if (cache.entries.size >= WYSIWYG_DRAFT_PARAGRAPH_LAYOUT_CACHE_LIMIT) {
    const oldestKey = cache.entries.keys().next().value
    if (oldestKey) cache.entries.delete(oldestKey)
  }
  cache.entries.set(key, cloneWysiwygDraftParagraphLayout(layout))
  return layout
}

export function buildWysiwygDraftParagraphLayout(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
  options: { allowContinuedFirstFragment?: boolean; traceMeasure?: boolean } = {},
): WysiwygDraftParagraphLayout | null {
  if (fragment.continuesFrom || (fragment.isContinued && !options.allowContinuedFirstFragment)) return null
  const draftNode = paragraphWithDraftText(node, draftText)
  if (!draftNode) return null
  const resolvedDraftNode = paragraphWithWysiwygFragmentRenderProps(fragment, draftNode)
  const layoutNode = withWysiwygListBodyIndent(fragment, resolvedDraftNode)
  const startedAt = options.traceMeasure ? startWysiwygPerfSpan() : null
  const measured = measureParagraph(layoutNode, fragment.width, textMeasurer)
  if (startedAt !== null) {
    finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "text-engine-draft-measure", startedAt, {
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      textLength: draftText.length,
      lineCount: measured.lines.length,
      availableWidth: fragment.width,
      paragraphHeight: measured.totalHeight,
    })
  }
  return {
    lines: buildPositionedParagraphLines(measured, measured.lines, fragment.x, fragment.y, 0, layoutNode.props.align, true),
    height: measured.totalHeight,
  }
}

export function buildWysiwygDraftParagraphLines(
  fragment: PageFragment,
  node: ParagraphNode,
  draftText: string,
  textMeasurer: TextMeasurer,
): PaginatedLine[] | null {
  return buildWysiwygDraftParagraphLayout(fragment, node, draftText, textMeasurer)?.lines ?? null
}
