import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isPlainTextParagraph } from "@/document"
import { snapToGraphemeBoundary } from "@/layout"
import type { TextMeasurer } from "@/layout"
import type { DocumentNode, ParagraphNode, TableNode } from "@/schema"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"
import { resolveCollapsedCaretOverlayInFragment } from "./wysiwygCaretMapping"

interface Props {
  fragment: PageFragment
  doc: DocumentNode
  pageKey: string
  scale: number
  textMeasurer?: TextMeasurer
  isEditing: boolean
  isVisualFresh: boolean
  wysiwygInlineEditEnabled: boolean
  showTextSegments: boolean
  initialCaretIndex: number | null
  onChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onCaretChange: (nodeId: string, caretIndex: number | null) => void
  onUserEditInteraction: (nodeId: string) => void
  onHeightChange: (nodeId: string, height: number, pageIndex: number | null) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
}

export interface ContinuationEditState {
  continuationCharStart: number | null
  editText: string
  preText: string
  adjustedInitialCaret: number | null
}

interface SplitEditInput {
  text: string
  splitIndex: number
}

export type InlineEditVisualFallbackReason =
  | "not-editing"
  | "stale-visual"
  | "range-selection"
  | "composition"
  | "wysiwyg-disabled"
  | "missing-caret-geometry"

export interface InlineEditVisualMode {
  useDocumentVisual: boolean
  useCustomCaret: boolean
  fallbackReason: InlineEditVisualFallbackReason | null
  textareaTextColor: string
  textareaCaretColor: string
  textareaOutline: string
  textareaOutlineOffset: number
}

const EDIT_CHROME_X = 3
const EDIT_CHROME_Y = 3
const INLINE_EDIT_TEXT_COLOR = "#1e40af"

export function shouldUseInlineEditSvgVisual(isEditing: boolean, isVisualFresh: boolean): boolean {
  return isEditing && isVisualFresh
}

export function shouldUseInlineEditDocumentVisual(
  isEditing: boolean,
  isVisualFresh: boolean,
  isSelectionCollapsed: boolean,
  isComposing: boolean,
): boolean {
  return shouldUseInlineEditSvgVisual(isEditing, isVisualFresh) && isSelectionCollapsed && !isComposing
}

export function inlineEditTextareaTextColor(useSvgVisual: boolean): string {
  return useSvgVisual ? "transparent" : INLINE_EDIT_TEXT_COLOR
}

export function inlineEditTextareaCaretColor(useCustomCaret: boolean): string {
  return useCustomCaret ? "transparent" : INLINE_EDIT_TEXT_COLOR
}

export function inlineEditTextareaOutline(useDocumentVisual: boolean): string {
  return useDocumentVisual ? "none" : "2px solid #2563eb"
}

export function shouldUseInlineEditDocumentLayer(
  canUseDocumentVisual: boolean,
  hasCustomCaret: boolean,
): boolean {
  return canUseDocumentVisual && hasCustomCaret
}

export function getInlineEditVisualMode(input: {
  isEditing: boolean
  isVisualFresh: boolean
  isSelectionCollapsed: boolean
  isComposing: boolean
  hasCustomCaret: boolean
  isWysiwygEnabled?: boolean
}): InlineEditVisualMode {
  const isWysiwygEnabled = input.isWysiwygEnabled ?? true
  const canUseDocumentVisual = isWysiwygEnabled && shouldUseInlineEditDocumentVisual(
    input.isEditing,
    input.isVisualFresh,
    input.isSelectionCollapsed,
    input.isComposing,
  )
  const useDocumentVisual = shouldUseInlineEditDocumentLayer(canUseDocumentVisual, input.hasCustomCaret)
  const useCustomCaret = canUseDocumentVisual && input.hasCustomCaret
  let fallbackReason: InlineEditVisualFallbackReason | null = null

  if (!input.isEditing) fallbackReason = "not-editing"
  else if (!isWysiwygEnabled) fallbackReason = "wysiwyg-disabled"
  else if (input.isComposing) fallbackReason = "composition"
  else if (!input.isVisualFresh) fallbackReason = "stale-visual"
  else if (!input.isSelectionCollapsed) fallbackReason = "range-selection"
  else if (!input.hasCustomCaret) fallbackReason = "missing-caret-geometry"

  return {
    useDocumentVisual,
    useCustomCaret,
    fallbackReason: useDocumentVisual ? null : fallbackReason,
    textareaTextColor: inlineEditTextareaTextColor(useDocumentVisual),
    textareaCaretColor: inlineEditTextareaCaretColor(useCustomCaret),
    textareaOutline: inlineEditTextareaOutline(useDocumentVisual),
    textareaOutlineOffset: useDocumentVisual ? 0 : -2,
  }
}

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node
    }
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "table") continue
      const inner = (candidate as unknown as TableNode).nodes[nodeId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
  const node = findParagraphNode(doc, nodeId)
  if (!node) return null
  if (!isPlainTextParagraph(node)) return null
  return node.children
    .map((child) => child.type === "text" ? child.text : "")
    .join("")
}

function isTableCellNodeId(doc: DocumentNode, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "table") continue
      const inner = (node as unknown as TableNode).nodes[nodeId]
      if (inner?.type === "table-cell") return true
    }
  }
  return false
}

function isParagraphInsideTableCell(
  doc: DocumentNode,
  nodeId: string,
  parentNodeId: string | null | undefined,
): boolean {
  if (isTableCellNodeId(doc, parentNodeId)) return true
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type !== "table") continue
      const table = node as unknown as TableNode
      for (const candidate of Object.values(table.nodes)) {
        if (candidate.type === "table-cell" && candidate.childIds.includes(nodeId)) return true
      }
    }
  }
  return false
}

export function buildInlineEditSliceKey(fragment: PageFragment, continuationCharStart: number | null): string {
  const fragmentPart = fragment.fragmentIndex ?? fragment.lineStart ?? "x"
  return `${fragment.nodeId}:${fragment.pageIndex}:${fragmentPart}:${continuationCharStart ?? 0}`
}

export function shouldUseNativeInlineEditEnter(): boolean {
  return true
}

export function shouldUseNativeTableCellBoundaryBackspace(
  isTableCellParagraph: boolean,
  preText: string,
): boolean {
  return isTableCellParagraph && preText.length === 0
}

export function getContinuationEditState(
  fullText: string,
  fragment: PageFragment,
  initialCaretIndex: number | null,
): ContinuationEditState {
  const continuationCharStart: number | null = fragment.continuesFrom === true
    ? (fragment.lines?.[0]?.segments?.[0]?.start ?? null)
    : null
  const editText = continuationCharStart !== null ? fullText.slice(continuationCharStart) : fullText
  const preText = continuationCharStart !== null ? fullText.slice(0, continuationCharStart) : ""
  const adjustedInitialCaret = (continuationCharStart !== null && initialCaretIndex !== null)
    ? Math.max(0, initialCaretIndex - continuationCharStart)
    : initialCaretIndex

  return { continuationCharStart, editText, preText, adjustedInitialCaret }
}

export function absoluteInlineEditIndex(preText: string, localIndex: number | null | undefined, fallback: number): number {
  return preText.length + Math.max(0, localIndex ?? fallback)
}

function previousGraphemeBoundary(text: string, index: number, includeExact = false): number {
  const safeIndex = Math.max(0, Math.min(index, text.length))
  if (safeIndex === 0) return 0

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(["th", "en"], { granularity: "grapheme" })
    let offset = 0
    for (const part of segmenter.segment(text)) {
      const nextOffset = offset + part.segment.length
      if (nextOffset === safeIndex) return includeExact ? nextOffset : offset
      if (nextOffset > safeIndex) return offset
      offset = nextOffset
    }
    return offset
  }

  return safeIndex - 1
}

function nextGraphemeBoundary(text: string, index: number): number {
  const safeIndex = Math.max(0, Math.min(index, text.length))
  if (safeIndex === 0) return 0

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(["th", "en"], { granularity: "grapheme" })
    let offset = 0
    for (const part of segmenter.segment(text)) {
      const nextOffset = offset + part.segment.length
      if (nextOffset >= safeIndex) return nextOffset
      offset = nextOffset
    }
    return text.length
  }

  return safeIndex + 1
}

export function buildSplitEditInput(
  preText: string,
  editText: string,
  selectionStart: number,
  selectionEnd: number,
): SplitEditInput {
  const rawStart = Math.max(0, Math.min(selectionStart, editText.length))
  const rawEnd = Math.max(rawStart, Math.min(selectionEnd, editText.length))
  const currentText = preText + editText
  const rawFullStart = preText.length + rawStart
  const rawFullEnd = preText.length + rawEnd
  const fullStart = rawStart === rawEnd
    ? snapToGraphemeBoundary(currentText, rawFullStart)
    : Math.max(preText.length, previousGraphemeBoundary(currentText, rawFullStart, true))
  const fullEnd = rawStart === rawEnd
    ? fullStart
    : Math.max(fullStart, nextGraphemeBoundary(currentText, rawFullEnd))
  const start = Math.max(0, Math.min(fullStart - preText.length, editText.length))
  const end = Math.max(start, Math.min(fullEnd - preText.length, editText.length))
  const nextEditText = editText.slice(0, start) + editText.slice(end)
  const text = preText + nextEditText
  return {
    text,
    splitIndex: snapToGraphemeBoundary(text, Math.min(preText.length + start, text.length)),
  }
}

export function buildContinuationBackspaceInput(
  preText: string,
  editText: string,
): { text: string; caretIndex: number } | null {
  if (preText.length === 0) return null
  const deleteFrom = previousGraphemeBoundary(preText, preText.length)
  return {
    text: preText.slice(0, deleteFrom) + editText,
    caretIndex: deleteFrom,
  }
}

function textAnchorForAlign(align: ParagraphRenderProps["align"] | undefined): "start" | "middle" | "end" {
  if (align === "center") return "middle"
  if (align === "right") return "end"
  return "start"
}

function textAlignForParagraph(align: ParagraphRenderProps["align"] | undefined): React.CSSProperties["textAlign"] {
  if (align === "center") return "center"
  if (align === "right") return "right"
  if (align === "justify") return "justify"
  return "left"
}

// line.x now contains the alignment offset (baked in by buildPaginatedLines).
// lineX computes the SVG anchor point: center/right shift by half/full line width
// to match SVG textAnchor="middle"/"end" behavior.
function lineX(line: PaginatedLine, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return line.x + line.width / 2
  if (align === "right") return line.x + line.width
  return line.x
}

// Visual left edge of the line — used for caret hit testing. line.x is now the
// aligned visual left, so no further adjustment needed.
function lineVisualLeft(line: PaginatedLine): number {
  return line.x
}

function lineBaselineY(line: PaginatedLine): number {
  return line.y + line.height * 0.78
}

function segmentColor(kind: NonNullable<PaginatedLine["segments"]>[number]["kind"]): string {
  if (kind === "space") return "#f59e0b"
  if (kind === "field") return "#8b5cf6"
  if (kind === "grapheme") return "#ef4444"
  return "#10b981"
}

function renderLine(
  line: PaginatedLine,
  index: number,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  opacity?: number,
) {
  const align = renderProps?.align
  const fontSize = (line.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const baseY = lineBaselineY(line) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const clip = `url(#cp-${pageKey}-${fragment.nodeId})`
  const style: React.CSSProperties = { pointerEvents: "none", userSelect: "none" }

  // Justify: draw each non-space word segment at its adjusted x position
  if (align === "justify" && line.segments?.length) {
    return (
      <g key={index} clipPath={clip} opacity={opacity} style={style}>
        {line.segments
          .filter((seg) => seg.kind !== "space" && seg.text.trim() !== "")
          .map((seg, si) => (
            <text key={si} x={(line.x + seg.x) * scale} y={baseY}
              fontSize={fontSize} fontFamily={fontFamily} fill="#1e40af">
              {seg.text}
            </text>
          ))}
      </g>
    )
  }

  return (
    <text
      key={index}
      x={lineX(line, align) * scale}
      y={baseY}
      fontSize={fontSize}
      fontFamily={fontFamily}
      textAnchor={textAnchorForAlign(align)}
      fill="#1e40af"
      opacity={opacity}
      clipPath={clip}
      style={style}
    >
      {line.text}
    </text>
  )
}

function renderSegmentDebug(
  lines: PaginatedLine[] | undefined,
  fragment: PageFragment,
  renderProps: ParagraphRenderProps | undefined,
  scale: number,
) {
  return lines?.flatMap((line, lineIndex) => {
    const segments = line.segments ?? []
    const visualLeft = lineVisualLeft(line)
    return segments.map((segment, segmentIndex) => {
      const color = segmentColor(segment.kind)
      return (
        <g key={`seg-${lineIndex}-${segmentIndex}`} style={{ pointerEvents: "none" }}>
          <rect
            x={(visualLeft + segment.x) * scale}
            y={line.y * scale}
            width={Math.max(segment.width * scale, 1)}
            height={line.height * scale}
            fill={color}
            opacity={segment.kind === "space" ? 0.22 : 0.14}
            stroke={color}
            strokeWidth={0.75}
            strokeDasharray={segment.kind === "space" ? "2 2" : undefined}
          >
            <title>{`${segment.kind}: ${segment.start}-${segment.end} (${Math.round(segment.width * 100) / 100})`}</title>
          </rect>
          <line
            x1={(visualLeft + segment.x) * scale}
            y1={line.y * scale}
            x2={(visualLeft + segment.x) * scale}
            y2={(line.y + line.height) * scale}
            stroke={color}
            strokeWidth={0.75}
            opacity={0.55}
          />
        </g>
      )
    })
  }) ?? null
}

function renderCollapsedCaret(
  fragment: PageFragment,
  pageKey: string,
  scale: number,
  caretIndex: number | null,
  textMeasurer: TextMeasurer | undefined,
) {
  if (caretIndex == null) return null
  const overlay = resolveCollapsedCaretOverlayInFragment(fragment, caretIndex, { textMeasurer })
  if (!overlay) return null

  return (
    <line
      key={`caret-${fragment.nodeId}-${overlay.offset}`}
      data-wysiwyg-caret="true"
      x1={overlay.x1 * scale}
      y1={overlay.y1 * scale}
      x2={overlay.x2 * scale}
      y2={overlay.y2 * scale}
      stroke={INLINE_EDIT_TEXT_COLOR}
      strokeWidth={Math.max(1, 1.1 * scale)}
      strokeLinecap="round"
      clipPath={`url(#cp-${pageKey}-${fragment.nodeId})`}
      style={{ pointerEvents: "none" }}
    />
  )
}

export function ParagraphTextSurface({
  fragment,
  doc,
  pageKey,
  scale,
  textMeasurer,
  isEditing,
  isVisualFresh,
  wysiwygInlineEditEnabled,
  showTextSegments,
  initialCaretIndex,
  onChange,
  onCaretChange,
  onUserEditInteraction,
  onHeightChange,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true)
  const [isComposing, setIsComposing] = useState(false)
  const renderProps = fragment.renderProps
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
  const canPlainTextEdit = fullText !== null
  const {
    continuationCharStart,
    editText,
    preText,
    adjustedInitialCaret,
  } = getContinuationEditState(fullText ?? "", fragment, initialCaretIndex)
  const editSliceKey = buildInlineEditSliceKey(fragment, continuationCharStart)
  const isTableCellParagraph = isParagraphInsideTableCell(doc, fragment.nodeId, fragment.parentNodeId)
  const isCurrentEditSlice = useCallback((el: HTMLTextAreaElement) => (
    el.dataset.inlineEditSliceKey === editSliceKey
  ), [editSliceKey])
  const updateCaret = useCallback((el: HTMLTextAreaElement) => {
    if (!isCurrentEditSlice(el)) return
    setIsSelectionCollapsed((el.selectionStart ?? 0) === (el.selectionEnd ?? 0))
    onCaretChange(fragment.nodeId, absoluteInlineEditIndex(preText, el.selectionStart, el.value.length))
  }, [fragment.nodeId, isCurrentEditSlice, onCaretChange, preText])
  const markUserEditInteraction = useCallback(() => {
    onUserEditInteraction(fragment.nodeId)
  }, [fragment.nodeId, onUserEditInteraction])

  const editPreview = useMemo(() => {
    if (!isEditing) return null
    return { lines: fragment.lines ?? [], height: fragment.height }
  }, [fragment.height, fragment.lines, isEditing])
  const editPreviewHeight = (editPreview?.height ?? 0) * scale
  const activeEditHeight = Math.max(editHeight, minimumEditHeight, editPreviewHeight)
  const canUseDocumentVisual = wysiwygInlineEditEnabled && shouldUseInlineEditDocumentVisual(
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
  )
  const customCaret = useMemo(() => (
    canUseDocumentVisual
      ? renderCollapsedCaret(fragment, pageKey, scale, initialCaretIndex, textMeasurer)
      : null
  ), [canUseDocumentVisual, fragment, initialCaretIndex, pageKey, scale, textMeasurer])
  const visualMode = getInlineEditVisualMode({
    isEditing,
    isVisualFresh,
    isSelectionCollapsed,
    isComposing,
    hasCustomCaret: customCaret !== null,
    isWysiwygEnabled: wysiwygInlineEditEnabled,
  })
  // The foreignObject expands by EDIT_CHROME_* for outline/click affordance.
  // Matching padding cancels that expansion so textarea content starts at the
  // same paragraph origin as SVG lines instead of drifting by the chrome size.
  const textareaPadding = `${spacingBefore + EDIT_CHROME_Y}px ${EDIT_CHROME_X}px ${spacingAfter + EDIT_CHROME_Y}px`

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
      el.focus()
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

  if (isEditing && canPlainTextEdit) {
    return (
      <>
        {visualMode.useDocumentVisual && fragment.lines?.map((line, index) =>
          renderLine(line, index, fragment, renderProps, pageKey, scale),
        )}
        {showTextSegments && renderSegmentDebug(fragment.lines, fragment, renderProps, scale)}
        <foreignObject
          x={fragment.x * scale - EDIT_CHROME_X}
          y={fragment.y * scale - EDIT_CHROME_Y}
          width={fragment.width * scale + EDIT_CHROME_X * 2}
          height={activeEditHeight + EDIT_CHROME_Y * 2}
        >
          <textarea
            key={editSliceKey}
            ref={textareaRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
            autoFocus
            spellCheck={false}
            rows={1}
            defaultValue={editText}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              borderRadius: 2,
              display: "block",
              fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
              fontSize,
              lineHeight: `${lineHeight}px`,
              textAlign: textAlignForParagraph(renderProps?.align),
              color: visualMode.textareaTextColor,
              caretColor: visualMode.textareaCaretColor,
              resize: "none",
              overflow: "hidden",
              padding: textareaPadding,
              margin: 0,
              boxSizing: "border-box",
              outline: visualMode.textareaOutline,
              outlineOffset: visualMode.textareaOutlineOffset,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              wordBreak: "normal",
            }}
            onInput={(event) => {
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              markUserEditInteraction()
              setIsSelectionCollapsed((el.selectionStart ?? 0) === (el.selectionEnd ?? 0))
              const caretIndex = absoluteInlineEditIndex(preText, el.selectionStart, el.value.length)
              syncTextareaHeight(el)
              onChange(fragment.nodeId, preText + el.value, caretIndex)
            }}
            onSelect={(event) => {
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              el.scrollTop = 0
              updateCaret(el)
            }}
            onBlur={() => onEndEdit(fragment.nodeId, "blur")}
            onKeyDown={(event) => {
              event.stopPropagation()
              const el = event.currentTarget
              if (!isCurrentEditSlice(el)) return
              markUserEditInteraction()
              if (event.nativeEvent.isComposing) return
              if (event.key === "Escape") {
                event.preventDefault()
                onEndEdit(fragment.nodeId, "keyboard")
                return
              }

              if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                if (shouldUseNativeInlineEditEnter()) return
                event.preventDefault()
                const selectionStart = el.selectionStart ?? el.value.length
                const selectionEnd = el.selectionEnd ?? selectionStart
                const input = buildSplitEditInput(preText, el.value, selectionStart, selectionEnd)
                onChange(fragment.nodeId, input.text, input.splitIndex)
                onSplitParagraph(fragment.nodeId, input.splitIndex)
                return
              }

              if (event.key === "Backspace" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                const selectionStart = el.selectionStart ?? el.value.length
                const selectionEnd = el.selectionEnd ?? selectionStart
                if (selectionStart !== 0 || selectionEnd !== 0) return

                const continuationBackspace = buildContinuationBackspaceInput(preText, el.value)
                if (continuationBackspace) {
                  event.preventDefault()
                  onChange(fragment.nodeId, continuationBackspace.text, continuationBackspace.caretIndex)
                  return
                }

                if (shouldUseNativeTableCellBoundaryBackspace(isTableCellParagraph, preText)) return
                event.preventDefault()
                onChange(fragment.nodeId, el.value, 0)
                onMergeParagraph(fragment.nodeId)
              }
            }}
            onKeyUp={(event) => {
              if (event.nativeEvent.isComposing) return
              updateCaret(event.currentTarget)
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onCompositionStart={() => {
              setIsComposing(true)
              markUserEditInteraction()
            }}
            onCompositionEnd={(event) => {
              setIsComposing(false)
              updateCaret(event.currentTarget)
            }}
            data-inline-edit-node-id={fragment.nodeId}
            data-inline-edit-slice-key={editSliceKey}
            data-inline-edit-slice-start={continuationCharStart ?? 0}
            data-wysiwyg-inline-edit-enabled={wysiwygInlineEditEnabled ? "true" : "false"}
            data-inline-edit-visual-mode={visualMode.useDocumentVisual ? "document" : "textarea"}
            data-inline-edit-fallback-reason={visualMode.fallbackReason ?? undefined}
          />
        </foreignObject>
        {customCaret}
      </>
    )
  }

  return fragment.lines?.map((line, index) =>
    renderLine(line, index, fragment, renderProps, pageKey, scale),
  ).concat(showTextSegments ? renderSegmentDebug(fragment.lines, fragment, renderProps, scale) ?? [] : []) ?? null
}
