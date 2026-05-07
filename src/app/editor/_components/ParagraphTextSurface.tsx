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
  initialCaretIndex: number | null
  onChange: (nodeId: string, text: string) => void
  onEndEdit: () => void
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

function lineX(line: PaginatedLine, fragment: PageFragment, align: ParagraphRenderProps["align"] | undefined): number {
  if (align === "center") return fragment.x + fragment.width / 2
  if (align === "right") return fragment.x + fragment.width
  return line.x
}

function lineBaselineY(line: PaginatedLine): number {
  return line.y + line.height * 0.78
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
  return (
    <text
      key={index}
      x={lineX(line, fragment, align) * scale}
      y={lineBaselineY(line) * scale}
      fontSize={fontSize}
      fontFamily={resolveFontCssFamily(renderProps?.fontFamilyKey)}
      textAnchor={textAnchorForAlign(align)}
      fill="#1e40af"
      opacity={opacity}
      clipPath={`url(#cp-${pageKey}-${fragment.nodeId})`}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      {line.text}
    </text>
  )
}

export function ParagraphTextSurface({
  fragment,
  doc,
  pageKey,
  scale,
  isEditing,
  isLayoutLoading,
  hasActiveInlineEditor,
  initialCaretIndex,
  onChange,
  onEndEdit,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const renderProps = fragment.renderProps
  const editHeight = Math.max(fragment.height * scale, 1)
  const fontSize = (renderProps?.fontSize ?? 12) * scale
  const lineHeight = (renderProps?.lineHeight ?? (renderProps?.fontSize ?? 12) * 1.5) * scale

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
            background: "rgba(219,234,254,0.97)",
            border: "none",
            outline: "2px solid #2563eb",
            outlineOffset: -2,
            borderRadius: 2,
            fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
            fontSize,
            lineHeight: `${lineHeight}px`,
            textAlign: textAlignForParagraph(renderProps?.align),
            color: "#1e40af",
            caretColor: "#1e40af",
            resize: "none",
            overflow: "hidden",
            padding: 0,
            margin: 0,
            boxSizing: "border-box",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
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
    )
  }

  if (isLayoutLoading && !hasActiveInlineEditor && fragment.nodeType === "paragraph") {
    const liveText = getEditableParagraphText(doc, fragment.nodeId)
    const paginatedText = fragment.lines?.map((line) => line.text).join("") ?? ""
    const firstLine = fragment.lines?.[0]
    if (liveText !== null && liveText !== paginatedText && firstLine) {
      return renderLine({ ...firstLine, text: liveText }, 0, fragment, renderProps, pageKey, scale, 0.75)
    }
  }

  return fragment.lines?.map((line, index) =>
    renderLine(line, index, fragment, renderProps, pageKey, scale),
  ) ?? null
}
