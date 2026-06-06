import { resolveFontCssFamily, resolveFontVariantKeyForStyle } from "@/font-registry"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, PaginatedLine, ParagraphRenderProps } from "@/pagination"
import { resolveCaretPositionInFragment } from "./wysiwygCaretMapping"
import type { WysiwygLiveTextEcho } from "./wysiwygImmediateVisualState"

type WysiwygLiveTextEchoCaretVisualMode = "idle" | "typing"

const INLINE_EDIT_TEXT_COLOR = "#1e40af"
const WYSIWYG_CARET_BLINK_DURATION = "1.05s"
const SVG_TEXT_PRESERVE_WHITESPACE_STYLE = {
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "pre",
} as const

function lineVisualLeft(line: PaginatedLine): number {
  return line.x
}

function fontWeightForRenderProps(renderProps: ParagraphRenderProps | undefined): number | undefined {
  return renderProps?.fontWeight === "bold" ? 700 : undefined
}

function fontStyleForRenderProps(renderProps: ParagraphRenderProps | undefined): "italic" | undefined {
  return renderProps?.fontStyle === "italic" ? "italic" : undefined
}

function textColorForRenderProps(renderProps: ParagraphRenderProps | undefined): string {
  return `#${renderProps?.textColor ?? "000000"}`
}

function textDecorationForRenderProps(renderProps: ParagraphRenderProps | undefined): string | undefined {
  const decorations: string[] = []
  if (renderProps?.textDecoration === "underline") decorations.push("underline")
  if (renderProps?.strikethrough) decorations.push("line-through")
  return decorations.length > 0 ? decorations.join(" ") : undefined
}

function renderCaretBlinkAnimation(caretVisualMode: WysiwygLiveTextEchoCaretVisualMode) {
  if (caretVisualMode === "typing") return null
  return (
    <animate
      data-wysiwyg-caret-blink="true"
      attributeName="opacity"
      values="1;1;0;0"
      keyTimes="0;0.48;0.5;1"
      dur={WYSIWYG_CARET_BLINK_DURATION}
      repeatCount="indefinite"
    />
  )
}

function measureLiveEchoTextWidth(
  text: string,
  renderProps: ParagraphRenderProps | undefined,
  line: PaginatedLine | undefined,
  textMeasurer: TextMeasurer | undefined,
): number {
  if (!text) return 0
  const fontFamilyKey = renderProps?.fontFamilyKey
  const fontSize = line?.fontSize ?? renderProps?.fontSize
  const fontVariant = resolveFontVariantKeyForStyle(renderProps?.fontWeight, renderProps?.fontStyle)
  if (textMeasurer && fontFamilyKey && fontSize) {
    return textMeasurer.measureText(text, fontFamilyKey, fontSize, fontVariant).width
  }
  return text.length * (fontSize ?? 8) * 0.5
}

export function renderLiveTextEcho(
  fragment: PageFragment,
  echo: WysiwygLiveTextEcho | null | undefined,
  renderProps: ParagraphRenderProps | undefined,
  pageKey: string,
  scale: number,
  textMeasurer: TextMeasurer | undefined,
  clipPathId?: string,
  caretVisualMode: WysiwygLiveTextEchoCaretVisualMode = "idle",
): { content: React.ReactNode; caret: React.ReactNode } | null {
  if (!echo || echo.text.length === 0) return null

  const anchor = resolveCaretPositionInFragment(fragment, echo.anchorOffset, { textMeasurer })
  if (!anchor) return null

  const anchorLine = fragment.lines?.[anchor.lineIndex]
  const lineHeight = anchorLine?.height ?? renderProps?.lineHeight ?? (renderProps?.fontSize ?? 8) * 1.5
  const fontSize = (anchorLine?.fontSize ?? renderProps?.fontSize ?? 8) * scale
  const fontFamily = resolveFontCssFamily(renderProps?.fontFamilyKey)
  const fontWeight = fontWeightForRenderProps(renderProps)
  const fontStyle = fontStyleForRenderProps(renderProps)
  const textDecoration = textDecorationForRenderProps(renderProps)
  const textColor = textColorForRenderProps(renderProps)
  const parts = echo.text.split("\n")
  const continuationX = anchorLine ? lineVisualLeft(anchorLine) : fragment.x
  const clip = `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`
  const renderedLines: React.ReactNode[] = []

  let caretX = anchor.x
  let caretY = anchor.y

  parts.forEach((part, index) => {
    const x = index === 0 ? anchor.x : continuationX
    const y = anchor.y + lineHeight * index
    caretX = x + measureLiveEchoTextWidth(part, renderProps, anchorLine, textMeasurer)
    caretY = y
    if (!part) return
    renderedLines.push(
      <text
        key={`live-echo-${index}`}
        data-wysiwyg-live-echo-line="true"
        x={x * scale}
        y={(y + lineHeight * 0.78) * scale}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontWeight={fontWeight}
        fontStyle={fontStyle}
        textDecoration={textDecoration}
        fill={textColor}
        opacity={0.88}
        xmlSpace="preserve"
        style={SVG_TEXT_PRESERVE_WHITESPACE_STYLE}
      >
        {part}
      </text>,
    )
  })

  return {
    content: renderedLines.length > 0
      ? (
        <g
          data-wysiwyg-live-echo="true"
          data-wysiwyg-live-echo-anchor={echo.anchorOffset}
          clipPath={clip}
          style={{ pointerEvents: "none" }}
        >
          {renderedLines}
        </g>
      )
      : null,
    caret: (
      <line
        key={`live-caret-${fragment.nodeId}-${echo.anchorOffset}`}
        data-wysiwyg-live-caret="true"
        data-wysiwyg-caret-mode={caretVisualMode}
        x1={caretX * scale}
        y1={caretY * scale}
        x2={caretX * scale}
        y2={(caretY + lineHeight) * scale}
        stroke={INLINE_EDIT_TEXT_COLOR}
        strokeWidth={Math.max(1, 1.1 * scale)}
        strokeLinecap="round"
        clipPath={clip}
        style={{ pointerEvents: "none" }}
      >
        {renderCaretBlinkAnimation(caretVisualMode)}
      </line>
    ),
  }
}
