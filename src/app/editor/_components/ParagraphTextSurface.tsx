import { useEffect, useRef } from "react"
import type { DocumentNode } from "@/schema"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"

interface Props {
  fragment: PageFragment
  doc: DocumentNode
  pageKey: string
  scale: number
  isEditing: boolean
  isLayoutLoading: boolean
  hasActiveInlineEditor: boolean
  showTextSegments: boolean
  initialCaretIndex: number | null
  onChange: (nodeId: string, text: string) => void
  onEndEdit: () => void
  onSplitParagraph: (nodeId: string, splitIndex: number) => void
  onMergeParagraph: (nodeId: string) => void
}

function getEditableParagraphText(doc: DocumentNode, nodeId: string): string | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") {
      return node.children
        .filter((child) => child.type === "text")
        .map((child) => (child as { text: string }).text)
        .join("")
    }
  }
  return null
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

export function ParagraphTextSurface({
  fragment,
  doc,
  pageKey,
  scale,
  isEditing,
  isLayoutLoading,
  hasActiveInlineEditor,
  showTextSegments,
  initialCaretIndex,
  onChange,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const renderProps = fragment.renderProps
  const editHeight = Math.max(fragment.height * scale, 1)
  const fontSize = (renderProps?.fontSize ?? 12) * scale
  const lineHeight = (renderProps?.lineHeight ?? (renderProps?.fontSize ?? 12) * 1.5) * scale
  const spacingBefore = (renderProps?.spacingBefore ?? 0) * scale
  const spacingAfter = (renderProps?.spacingAfter ?? 0) * scale

  useEffect(() => {
    if (!isEditing || initialCaretIndex == null) return
    const el = textareaRef.current
    if (!el) return
    const caret = Math.min(Math.max(0, initialCaretIndex), el.value.length)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [fragment.nodeId, initialCaretIndex, isEditing])

  if (isEditing) {
    return (
      <>
        {fragment.lines?.map((line, index) =>
          renderLine(line, index, fragment, renderProps, pageKey, scale),
        )}
        {showTextSegments && renderSegmentDebug(fragment.lines, fragment, renderProps, scale)}
        <foreignObject
          x={fragment.x * scale}
          y={fragment.y * scale}
          width={fragment.width * scale}
          height={editHeight}
        >
          <textarea
            ref={textareaRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
            autoFocus
            spellCheck={false}
            defaultValue={getEditableParagraphText(doc, fragment.nodeId) ?? ""}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              outline: "2px solid #2563eb",
              outlineOffset: -2,
              borderRadius: 2,
              fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
              fontSize,
              lineHeight: `${lineHeight}px`,
              textAlign: textAlignForParagraph(renderProps?.align),
              color: "transparent",
              caretColor: "#1e40af",
              resize: "none",
              overflow: "hidden",
              padding: `${spacingBefore}px 0 ${spacingAfter}px`,
              margin: 0,
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
              overflowWrap: "normal",
              wordBreak: "normal",
            }}
            onInput={(event) => onChange(fragment.nodeId, event.currentTarget.value)}
            onBlur={onEndEdit}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Escape") {
                event.preventDefault()
                onEndEdit()
              }
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </foreignObject>
      </>
    )
  }

  if (isLayoutLoading && !hasActiveInlineEditor && fragment.nodeType === "paragraph") {
    const liveText = getEditableParagraphText(doc, fragment.nodeId)
    const paginatedText = fragment.lines?.map((line) => line.text).join("") ?? ""
    const firstLine = fragment.lines?.[0]
    if (liveText !== null && liveText.replace(/\n/g, "") !== paginatedText && firstLine) {
      return renderLine({ ...firstLine, text: liveText }, 0, fragment, renderProps, pageKey, scale, 0.75)
    }
  }

  return fragment.lines?.map((line, index) =>
    renderLine(line, index, fragment, renderProps, pageKey, scale),
  ).concat(showTextSegments ? renderSegmentDebug(fragment.lines, fragment, renderProps, scale) ?? [] : []) ?? null
}
