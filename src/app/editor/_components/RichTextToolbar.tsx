import type { CSSProperties } from "react"
import { DEFAULT_FONT_KEY, listSelectableFontEntries, resolveFontEntry } from "@/font-registry"
import {
  getTextRunParagraphText,
  getTextRunStyleRangeState,
  isTextRunOnlyParagraph,
  type ParagraphTextStyleChanges,
} from "@/document"
import type { DocumentNode, ParagraphNode, TextRunStyle } from "@/schema"
import { pt } from "@/schema"
import { FontFamilyCombobox } from "./FontFamilyCombobox"

const PARAGRAPH_FONT_OPTIONS = listSelectableFontEntries()

interface RichTextToolbarProps {
  doc: DocumentNode
  selectedNodeId: string | null
  textSelection?: RichTextToolbarSelection | null
  getCommandTextSelection?: () => RichTextToolbarSelection | null
  draftParagraph?: ParagraphNode | null
  pendingStyle?: TextRunStyle | null
  editable: boolean
  onUpdateParagraphTextStyle: (nodeId: string, changes: ParagraphTextStyleChanges) => void
  onUpdateTextRunStyleRange?: (nodeId: string, start: number, end: number, changes: ParagraphTextStyleChanges) => void
}

export interface RichTextToolbarSelection {
  nodeId: string | null
  anchorOffset: number
  focusOffset: number
}

export interface RichTextToolbarRange {
  start: number
  end: number
  mode: "paragraph" | "range"
}

export type RichTextToolbarScope = "inactive" | "paragraph" | "caret" | "range"

export function RichTextToolbar({
  doc,
  selectedNodeId,
  textSelection = null,
  getCommandTextSelection,
  draftParagraph = null,
  pendingStyle = null,
  editable,
  onUpdateParagraphTextStyle,
  onUpdateTextRunStyleRange,
}: RichTextToolbarProps) {
  const authoredParagraph = selectedNodeId ? findParagraphNode(doc, selectedNodeId) : null
  const paragraph = draftParagraph && selectedNodeId === draftParagraph.id ? draftParagraph : authoredParagraph
  const text = paragraph ? getTextRunParagraphText(paragraph) : null
  const canStyleText = editable && paragraph !== null && text !== null && isTextRunOnlyParagraph(paragraph)
  const activeRange = paragraph && text !== null
    ? resolveRichTextToolbarRange(paragraph.id, text.length, textSelection)
    : null
  const activeScope = resolveRichTextToolbarScope({
    canStyleText,
    mode: activeRange?.mode ?? "paragraph",
    hasActiveRichDraft: Boolean(draftParagraph && paragraph && draftParagraph.id === paragraph.id),
    hasCollapsedSelection: Boolean(paragraph && text !== null && isCollapsedToolbarSelection(paragraph.id, text.length, textSelection)),
  })
  const styleStateRange = paragraph && text !== null
    ? resolveRichTextToolbarStyleStateRange(paragraph.id, text.length, textSelection)
    : null
  const collapsedPendingStyle = paragraph && text !== null && isCollapsedToolbarSelection(paragraph.id, text.length, textSelection)
    ? pendingStyle
    : null
  const textStyleState = paragraph && styleStateRange
    ? getTextRunStyleRangeState(paragraph, styleStateRange.start, styleStateRange.end)
    : null

  const fontFamilyMixed = hasPendingStyleField(collapsedPendingStyle, "fontFamilyKey") ? false : textStyleState?.fontFamilyKey.mixed === true
  const fontSizeMixed = hasPendingStyleField(collapsedPendingStyle, "fontSize") ? false : textStyleState?.fontSize.mixed === true
  const textColorMixed = hasPendingStyleField(collapsedPendingStyle, "textColor") ? false : textStyleState?.textColor.mixed === true
  const fontWeightMixed = hasPendingStyleField(collapsedPendingStyle, "fontWeight") ? false : textStyleState?.fontWeight.mixed === true
  const fontStyleMixed = hasPendingStyleField(collapsedPendingStyle, "fontStyle") ? false : textStyleState?.fontStyle.mixed === true
  const textDecorationMixed = hasPendingStyleField(collapsedPendingStyle, "textDecoration") ? false : textStyleState?.textDecoration.mixed === true
  const strikethroughMixed = hasPendingStyleField(collapsedPendingStyle, "strikethrough") ? false : textStyleState?.strikethrough.mixed === true

  const currentFontKey = resolveFontEntry(
    fontFamilyMixed
      ? paragraph?.props.fontFamilyKey ?? DEFAULT_FONT_KEY
      : collapsedPendingStyle?.fontFamilyKey ?? textStyleState?.fontFamilyKey.value ?? paragraph?.props.fontFamilyKey ?? DEFAULT_FONT_KEY,
  ).key
  const currentFont = resolveFontEntry(currentFontKey)
  const fontWeight = fontWeightMixed ? "normal" : collapsedPendingStyle?.fontWeight ?? textStyleState?.fontWeight.value ?? paragraph?.props.fontWeight ?? "normal"
  const fontStyle = fontStyleMixed ? "normal" : collapsedPendingStyle?.fontStyle ?? textStyleState?.fontStyle.value ?? paragraph?.props.fontStyle ?? "normal"
  const textDecoration = textDecorationMixed ? "none" : collapsedPendingStyle?.textDecoration ?? textStyleState?.textDecoration.value ?? paragraph?.props.textDecoration ?? "none"
  const strikethrough = strikethroughMixed ? false : collapsedPendingStyle?.strikethrough ?? textStyleState?.strikethrough.value ?? paragraph?.props.strikethrough ?? false
  const rawTextColor = textColorMixed ? paragraph?.props.textColor ?? "000000" : collapsedPendingStyle?.textColor ?? textStyleState?.textColor.value ?? paragraph?.props.textColor ?? "000000"
  const textColor = sanitizeHexColorInput(rawTextColor) || "000000"
  const fontSizeValue = fontSizeMixed
    ? ""
    : String(collapsedPendingStyle?.fontSize?.value ?? textStyleState?.fontSize.value.value ?? paragraph?.props.fontSize.value ?? 12)
  const hasBoldVariant = Boolean(currentFont.variants.bold || currentFont.variants.boldItalic)
  const hasItalicVariant = Boolean(currentFont.variants.italic || currentFont.variants.boldItalic)

  function updateTextStyle(changes: ParagraphTextStyleChanges) {
    const liveSelection = getCommandTextSelection ? getCommandTextSelection() : null
    const commandRange = paragraph && text !== null
      ? resolveRichTextToolbarCommandRange(paragraph.id, text.length, textSelection, liveSelection)
      : null
    const targetRange = commandRange ?? activeRange
    if (!paragraph || !canStyleText || !targetRange) return
    if (targetRange.mode === "range" && onUpdateTextRunStyleRange) {
      onUpdateTextRunStyleRange(paragraph.id, targetRange.start, targetRange.end, changes)
      return
    }
    onUpdateParagraphTextStyle(paragraph.id, changes)
  }

  const textStyleOptions = [
    {
      key: "bold",
      label: "B",
      active: !fontWeightMixed && fontWeight === "bold",
      mixed: fontWeightMixed,
      disabled: !canStyleText || (!hasBoldVariant && fontWeight !== "bold"),
      title: fontWeightMixed ? "Bold (mixed)" : hasBoldVariant ? "Bold" : "Bold variant is unavailable for this font",
      style: { fontWeight: 800 },
      changes: { fontWeight: fontWeightMixed ? "bold" : fontWeight === "bold" ? "normal" : "bold" },
    },
    {
      key: "italic",
      label: "I",
      active: !fontStyleMixed && fontStyle === "italic",
      mixed: fontStyleMixed,
      disabled: !canStyleText || (!hasItalicVariant && fontStyle !== "italic"),
      title: fontStyleMixed ? "Italic (mixed)" : hasItalicVariant ? "Italic" : "Italic variant is unavailable for this font",
      style: { fontStyle: "italic" },
      changes: { fontStyle: fontStyleMixed ? "italic" : fontStyle === "italic" ? "normal" : "italic" },
    },
    {
      key: "underline",
      label: "U",
      active: !textDecorationMixed && textDecoration === "underline",
      mixed: textDecorationMixed,
      disabled: !canStyleText,
      title: textDecorationMixed ? "Underline (mixed)" : "Underline",
      style: { textDecoration: "underline" },
      changes: { textDecoration: textDecorationMixed ? "underline" : textDecoration === "underline" ? "none" : "underline" },
    },
    {
      key: "strikethrough",
      label: "S",
      active: !strikethroughMixed && strikethrough,
      mixed: strikethroughMixed,
      disabled: !canStyleText,
      title: strikethroughMixed ? "Strikethrough (mixed)" : "Strikethrough",
      style: { textDecoration: "line-through" },
      changes: { strikethrough: strikethroughMixed ? true : !strikethrough },
    },
  ] as const

  return (
    <div
      data-testid="rich-text-toolbar"
      data-active-node-id={paragraph?.id ?? ""}
      data-enabled={canStyleText ? "true" : "false"}
      data-style-mode={activeRange?.mode ?? "paragraph"}
      data-style-start={activeRange?.start ?? 0}
      data-style-end={activeRange?.end ?? 0}
      data-wysiwyg-rich-text-toolbar-node-id={paragraph?.id ?? undefined}
      style={toolbarStyle}
    >
      <span style={toolbarLabel}>Text</span>
      <span
        data-testid="rich-text-toolbar-scope"
        data-scope={activeScope}
        title={scopeTitleByMode[activeScope]}
        style={scopeChipStyle(activeScope)}
      >
        {scopeLabelByMode[activeScope]}
      </span>
      <div style={fontControlStyle}>
        <FontFamilyCombobox
          value={currentFontKey}
          options={PARAGRAPH_FONT_OPTIONS}
          onChange={(fontFamilyKey) => updateTextStyle({ fontFamilyKey })}
          testId="rich-text-toolbar-font-family"
          disabled={!canStyleText}
        />
      </div>
      {fontFamilyMixed && <span data-testid="rich-text-toolbar-font-mixed" style={mixedLabel}>mixed</span>}
      <div style={buttonGroupStyle}>
        {textStyleOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            data-testid={`rich-text-toolbar-${option.key}`}
            data-mixed={option.mixed ? "true" : "false"}
            aria-pressed={option.active}
            disabled={option.disabled}
            title={option.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!option.disabled) updateTextStyle(option.changes)
            }}
            style={{
              ...iconButtonStyle,
              ...option.style,
              background: option.active ? "#dbeafe" : option.disabled ? "#f9fafb" : "#fff",
              borderColor: option.active ? "#bfdbfe" : "#e5e7eb",
              color: option.active ? "#1d4ed8" : option.disabled ? "#cbd5e1" : "#334155",
              cursor: option.disabled ? "not-allowed" : "pointer",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label style={colorControlStyle} title={textColorMixed ? "Text color (mixed)" : "Text color"}>
        <span
          data-testid="rich-text-toolbar-text-color-swatch"
          style={{
            ...colorSwatchStyle,
            color: textColor === "000000" ? "#111827" : "#fff",
            background: `#${textColor}`,
          }}
        >
          A
        </span>
        <input
          type="color"
          aria-label="Text color"
          data-testid="rich-text-toolbar-text-color"
          value={`#${textColor}`}
          disabled={!canStyleText}
          onChange={(event) => updateTextStyle({ textColor: sanitizeHexColorInput(event.target.value) })}
          style={colorInputStyle}
        />
      </label>
      {textColorMixed && <span data-testid="rich-text-toolbar-color-mixed" style={mixedLabel}>mixed</span>}
      <input
        type="number"
        min={4}
        max={200}
        aria-label="Font size"
        data-testid="rich-text-toolbar-font-size"
        value={fontSizeValue}
        placeholder={fontSizeMixed ? "mixed" : undefined}
        disabled={!canStyleText}
        onChange={(event) => {
          const nextSize = Number(event.target.value)
          if (Number.isFinite(nextSize) && nextSize > 0) updateTextStyle({ fontSize: pt(nextSize) })
        }}
        style={fontSizeInputStyle}
      />
      <span style={unitLabelStyle}>pt</span>
      {!canStyleText && <span data-testid="rich-text-toolbar-empty-state" style={emptyStateStyle}>Select paragraph</span>}
    </div>
  )
}

export function resolveRichTextToolbarRange(
  paragraphId: string,
  textLength: number,
  selection?: RichTextToolbarSelection | null,
): RichTextToolbarRange {
  const safeLength = Math.max(0, Math.trunc(Number.isFinite(textLength) ? textLength : 0))
  if (!selection || selection.nodeId !== paragraphId) {
    return { start: 0, end: safeLength, mode: "paragraph" }
  }
  const anchor = clampTextOffset(selection.anchorOffset, safeLength)
  const focus = clampTextOffset(selection.focusOffset, safeLength)
  const start = Math.min(anchor, focus)
  const end = Math.max(anchor, focus)
  if (start === end) return { start: 0, end: safeLength, mode: "paragraph" }
  return { start, end, mode: "range" }
}

export function resolveRichTextToolbarCommandRange(
  paragraphId: string,
  textLength: number,
  displaySelection?: RichTextToolbarSelection | null,
  commandSelection?: RichTextToolbarSelection | null,
): RichTextToolbarRange {
  return resolveRichTextToolbarRange(
    paragraphId,
    textLength,
    commandSelection === undefined ? displaySelection : commandSelection,
  )
}

export function resolveRichTextToolbarStyleStateRange(
  paragraphId: string,
  textLength: number,
  selection?: RichTextToolbarSelection | null,
): Pick<RichTextToolbarRange, "start" | "end"> {
  const safeLength = Math.max(0, Math.trunc(Number.isFinite(textLength) ? textLength : 0))
  if (!selection || selection.nodeId !== paragraphId) return { start: 0, end: safeLength }
  const anchor = clampTextOffset(selection.anchorOffset, safeLength)
  const focus = clampTextOffset(selection.focusOffset, safeLength)
  return {
    start: Math.min(anchor, focus),
    end: Math.max(anchor, focus),
  }
}

export function resolveRichTextToolbarScope(input: {
  canStyleText: boolean
  mode: RichTextToolbarRange["mode"]
  hasActiveRichDraft: boolean
  hasCollapsedSelection: boolean
}): RichTextToolbarScope {
  if (!input.canStyleText) return "inactive"
  if (input.mode === "range") return "range"
  if (input.hasActiveRichDraft && input.hasCollapsedSelection) return "caret"
  return "paragraph"
}

function clampTextOffset(offset: number, textLength: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.max(0, Math.min(Math.trunc(offset), textLength))
}

function isCollapsedToolbarSelection(
  paragraphId: string,
  textLength: number,
  selection?: RichTextToolbarSelection | null,
): boolean {
  if (!selection || selection.nodeId !== paragraphId) return false
  return clampTextOffset(selection.anchorOffset, textLength) === clampTextOffset(selection.focusOffset, textLength)
}

function hasPendingStyleField<K extends keyof TextRunStyle>(
  style: TextRunStyle | null | undefined,
  key: K,
): style is TextRunStyle & Required<Pick<TextRunStyle, K>> {
  return style != null && Object.prototype.hasOwnProperty.call(style, key)
}

function findParagraphNode(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (isParagraphNode(node)) return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const nested = candidate.nodes[nodeId]
      if (isParagraphNode(nested)) return nested
    }
  }
  return null
}

function isParagraphNode(node: unknown): node is ParagraphNode {
  return Boolean(
    node &&
    typeof node === "object" &&
    (node as { type?: unknown }).type === "paragraph" &&
    "props" in node &&
    "children" in node,
  )
}

function sanitizeHexColorInput(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
}

const toolbarStyle: CSSProperties = {
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  paddingTop: 2,
  borderTop: "1px solid #f1f5f9",
}

const toolbarLabel: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0,
  marginRight: 2,
}

const scopeLabelByMode: Record<RichTextToolbarScope, string> = {
  inactive: "No text",
  paragraph: "Paragraph",
  caret: "Next text",
  range: "Selected text",
}

const scopeTitleByMode: Record<RichTextToolbarScope, string> = {
  inactive: "No editable text is selected",
  paragraph: "Style changes apply to the selected paragraph",
  caret: "Style changes apply to the next typed text",
  range: "Style changes apply only to the selected text",
}

const scopeChipBaseStyle: CSSProperties = {
  height: 22,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#e2e8f0",
  borderRadius: 4,
  padding: "3px 6px",
  color: "#475569",
  background: "#f8fafc",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: "14px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
}

function scopeChipStyle(scope: RichTextToolbarScope): CSSProperties {
  if (scope === "range") {
    return {
      ...scopeChipBaseStyle,
      color: "#1d4ed8",
      background: "#eff6ff",
      borderColor: "#bfdbfe",
    }
  }
  if (scope === "caret") {
    return {
      ...scopeChipBaseStyle,
      color: "#047857",
      background: "#ecfdf5",
      borderColor: "#bbf7d0",
    }
  }
  if (scope === "inactive") {
    return {
      ...scopeChipBaseStyle,
      color: "#94a3b8",
      background: "#f8fafc",
      borderColor: "#e2e8f0",
    }
  }
  return scopeChipBaseStyle
}

const fontControlStyle: CSSProperties = {
  width: 184,
  minWidth: 140,
}

const buttonGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
}

const iconButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: 0,
  fontSize: 12,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
}

const colorControlStyle: CSSProperties = {
  position: "relative",
  width: 30,
  height: 28,
  display: "inline-flex",
  alignItems: "stretch",
  justifyContent: "stretch",
}

const colorSwatchStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  boxSizing: "border-box",
  pointerEvents: "none",
}

const colorInputStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  cursor: "pointer",
}

const fontSizeInputStyle: CSSProperties = {
  width: 58,
  height: 28,
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "3px 6px",
  fontSize: 12,
  color: "#111827",
  background: "#fff",
  boxSizing: "border-box",
}

const unitLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "#94a3b8",
  marginLeft: -3,
}

const mixedLabel: CSSProperties = {
  fontSize: 9,
  color: "#94a3b8",
}

const emptyStateStyle: CSSProperties = {
  marginLeft: 4,
  fontSize: 10,
  color: "#94a3b8",
}
