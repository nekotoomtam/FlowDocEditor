import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react"
import { buildStyleManagerState } from "@/document"
import type { ParagraphStyleDefinitionPatch } from "@/document"
import { listSelectableFontEntries, resolveFontEntry } from "@/font-registry"
import type {
  DocumentNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphStyleDefinition,
  ParagraphStyleProperties,
  UnitValue,
} from "@/schema"
import { pt } from "@/schema"
import { RightRailPanelHeader, rightRailPanelBody, rightRailPanelShell } from "./RightRailPanel"

type ParagraphAlign = NonNullable<ParagraphStyleProperties["align"]>
type HeadingLevelValue = NonNullable<ParagraphStyleProperties["headingLevel"]> | null
type ParagraphBoxBorderStyle = ParagraphBoxBorderSide["style"]
type BorderEdge = keyof ParagraphBoxBorder
type BoxBorderChoice = ParagraphBoxBorderStyle | "none"

interface StyleDefinitionPanelProps {
  doc: DocumentNode
  selectedStyleId: string | null
  editable: boolean
  onPatchStyleDefinition?: (styleId: string, patch: ParagraphStyleDefinitionPatch) => void
  onRenameStyleDefinition?: (styleId: string, name: string | null) => void
}

const badgeStyle: CSSProperties = {
  borderRadius: 4,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "2px 6px",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
}

const sectionStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  padding: "0 0 12px",
  marginBottom: 12,
}

const sectionTitleStyle: CSSProperties = {
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 8,
}

const identityBoxStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#f8fafc",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 4,
}

const identityIdStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "108px minmax(0, 1fr)",
  gap: 8,
  alignItems: "center",
  minHeight: 26,
  color: "#0f172a",
  fontSize: 12,
}

const rowLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
}

const rowValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #dbe3ef",
  borderRadius: 5,
  padding: "5px 7px",
  boxSizing: "border-box",
  color: "#0f172a",
  background: "#fff",
  fontFamily: "inherit",
  fontSize: 12,
}

const disabledInputStyle: CSSProperties = {
  ...inputStyle,
  color: "#64748b",
  background: "#f8fafc",
}

const unitInputWrapStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  alignItems: "center",
}

const unitLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
}

const emptyStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 6,
  padding: 12,
  color: "#64748b",
  fontSize: 12,
}

const choiceGroupStyle: CSSProperties = {
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "minmax(0, 1fr)",
  gap: 4,
}

const choiceButtonStyle = (active: boolean, editable: boolean): CSSProperties => ({
  height: 26,
  border: "1px solid",
  borderColor: active ? "#bfdbfe" : "#e5e7eb",
  borderRadius: 5,
  background: active ? "#dbeafe" : "#fff",
  color: active ? "#1d4ed8" : "#475569",
  cursor: editable ? "pointer" : "default",
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: active ? 800 : 600,
  opacity: editable ? 1 : 0.65,
})

const colorInputWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  gap: 6,
  alignItems: "center",
}

const colorSwatchStyle = (color: string | undefined): CSSProperties => ({
  width: 18,
  height: 18,
  borderRadius: 4,
  border: "1px solid #cbd5e1",
  background: color ? `#${color}` : "#fff",
  boxShadow: color ? "none" : "inset 0 0 0 2px #f8fafc",
})

const ALIGN_OPTIONS: Array<{ value: ParagraphAlign; label: string }> = [
  { value: "left", label: "L" },
  { value: "center", label: "C" },
  { value: "right", label: "R" },
  { value: "justify", label: "J" },
]

const HEADING_OPTIONS: Array<{ value: HeadingLevelValue; label: string }> = [
  { value: null, label: "-" },
  { value: 1, label: "H1" },
  { value: 2, label: "H2" },
  { value: 3, label: "H3" },
  { value: 4, label: "H4" },
  { value: 5, label: "H5" },
  { value: 6, label: "H6" },
]

const FONT_OPTIONS = listSelectableFontEntries()
const BORDER_EDGES: BorderEdge[] = ["top", "right", "bottom", "left"]
const BORDER_STYLE_OPTIONS: Array<{ value: BoxBorderChoice; label: string }> = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dash" },
  { value: "dotted", label: "Dot" },
]
const DEFAULT_BORDER_WIDTH = 1
const DEFAULT_BORDER_COLOR = "1F2937"

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function styleDisplayName(style: ParagraphStyleDefinition): string {
  return style.name?.trim() || style.id
}

function styleEditableName(style: ParagraphStyleDefinition): string {
  return style.name?.trim() || ""
}

function fontSizeDraftValue(props: ParagraphStyleProperties): string {
  return props.fontSize ? formatNumber(props.fontSize.value) : ""
}

function lineHeightDraftValue(props: ParagraphStyleProperties): string {
  return props.lineHeight != null ? formatNumber(props.lineHeight) : ""
}

function unitDraftValue(value: UnitValue | undefined): string {
  return value ? formatNumber(value.value) : ""
}

function textColorDraftValue(props: ParagraphStyleProperties): string {
  return props.textColor ?? ""
}

function boxFillDraftValue(props: ParagraphStyleProperties): string {
  return props.box?.fill ?? ""
}

function activeBorderSides(border: ParagraphBoxBorder | undefined): ParagraphBoxBorderSide[] {
  if (!border) return []
  return BORDER_EDGES
    .map((edge) => border[edge])
    .filter((side): side is ParagraphBoxBorderSide => Boolean(side))
}

function firstBorderSide(props: ParagraphStyleProperties): ParagraphBoxBorderSide | undefined {
  return activeBorderSides(props.box?.border)[0]
}

function borderStyleValue(props: ParagraphStyleProperties): BoxBorderChoice {
  return firstBorderSide(props)?.style ?? "none"
}

function borderWidthDraftValue(props: ParagraphStyleProperties): string {
  return firstBorderSide(props)?.width ? formatNumber(firstBorderSide(props)!.width.value) : ""
}

function borderColorDraftValue(props: ParagraphStyleProperties): string {
  return firstBorderSide(props)?.color ?? ""
}

function makeUniformBorder(side: ParagraphBoxBorderSide): ParagraphBoxBorder {
  return {
    top: { ...side, width: { ...side.width } },
    right: { ...side, width: { ...side.width } },
    bottom: { ...side, width: { ...side.width } },
    left: { ...side, width: { ...side.width } },
  }
}

function sanitizeHexColorInput(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
}

function isCompleteHexColor(value: string): boolean {
  return /^[0-9A-F]{6}$/.test(value)
}

function DetailRow({
  label,
  value,
  testId,
}: {
  label: string
  value: string
  testId?: string
}) {
  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>{value}</span>
    </div>
  )
}

function EditableTextRow({
  label,
  value,
  placeholder,
  editable,
  testId,
  onChange,
  onCommit,
  onReset,
}: {
  label: string
  value: string
  placeholder?: string
  editable: boolean
  testId: string
  onChange: (value: string) => void
  onCommit: () => void
  onReset: () => void
}) {
  return (
    <label data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <input
        data-testid={`${testId}-input`}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={!editable}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") onCommit()
          if (event.key === "Escape") onReset()
        }}
        style={editable ? inputStyle : disabledInputStyle}
      />
    </label>
  )
}

function EditableNumberRow({
  label,
  value,
  editable,
  testId,
  min,
  max,
  step,
  unit,
  onChange,
  onCommit,
  onReset,
}: {
  label: string
  value: string
  editable: boolean
  testId: string
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: string) => void
  onCommit: () => void
  onReset: () => void
}) {
  return (
    <label data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={{ ...unitInputWrapStyle, gridTemplateColumns: unit ? "minmax(0, 1fr) 28px" : "minmax(0, 1fr)" }}>
        <input
          data-testid={`${testId}-input`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!editable}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") onCommit()
            if (event.key === "Escape") onReset()
          }}
          style={editable ? inputStyle : disabledInputStyle}
        />
        {unit && <span style={unitLabelStyle}>{unit}</span>}
      </span>
    </label>
  )
}

function EditableColorRow({
  label,
  value,
  editable,
  testId,
  onChange,
  onCommit,
  onReset,
}: {
  label: string
  value: string
  editable: boolean
  testId: string
  onChange: (value: string) => void
  onCommit: () => void
  onReset: () => void
}) {
  return (
    <label data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={colorInputWrapStyle}>
        <span aria-hidden="true" style={colorSwatchStyle(isCompleteHexColor(value) ? value : undefined)} />
        <input
          data-testid={`${testId}-input`}
          type="text"
          value={value}
          placeholder="000000"
          disabled={!editable}
          onChange={(event) => onChange(sanitizeHexColorInput(event.target.value))}
          onBlur={onCommit}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") onCommit()
            if (event.key === "Escape") onReset()
          }}
          style={editable ? inputStyle : disabledInputStyle}
        />
      </span>
    </label>
  )
}

function ChoiceRow<TValue extends string | number | null>({
  label,
  testId,
  editable,
  value,
  options,
  onSelect,
}: {
  label: string
  testId: string
  editable: boolean
  value: TValue
  options: Array<{ value: TValue; label: string; title?: string }>
  onSelect: (value: TValue) => void
}) {
  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={choiceGroupStyle}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={String(option.value)}
              type="button"
              data-testid={`${testId}-${String(option.value ?? "none")}`}
              aria-pressed={active}
              title={option.title ?? option.label}
              disabled={!editable}
              onClick={() => onSelect(option.value)}
              style={choiceButtonStyle(active, editable)}
            >
              {option.label}
            </button>
          )
        })}
      </span>
    </div>
  )
}

function SelectRow({
  label,
  testId,
  editable,
  value,
  options,
  onSelect,
}: {
  label: string
  testId: string
  editable: boolean
  value: string
  options: Array<{ value: string; label: string }>
  onSelect: (value: string) => void
}) {
  return (
    <label data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <select
        data-testid={`${testId}-select`}
        value={value}
        disabled={!editable}
        onChange={(event) => onSelect(event.target.value)}
        style={editable ? inputStyle : disabledInputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function ToggleRow({
  label,
  testId,
  editable,
  controls,
}: {
  label: string
  testId: string
  editable: boolean
  controls: Array<{ id: string; label: string; title: string; active: boolean; onToggle: () => void }>
}) {
  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={choiceGroupStyle}>
        {controls.map((control) => (
          <button
            key={control.id}
            type="button"
            data-testid={`${testId}-${control.id}`}
            aria-pressed={control.active}
            title={control.title}
            disabled={!editable}
            onClick={control.onToggle}
            style={choiceButtonStyle(control.active, editable)}
          >
            {control.label}
          </button>
        ))}
      </span>
    </div>
  )
}

function TextStyleRows({
  props,
  editable,
  fontSizeDraft,
  setFontSizeDraft,
  commitFontSizeDraft,
  resetFontSizeDraft,
  textColorDraft,
  setTextColorDraft,
  commitTextColorDraft,
  resetTextColorDraft,
  patchProps,
}: {
  props: ParagraphStyleProperties
  editable: boolean
  fontSizeDraft: string
  setFontSizeDraft: (value: string) => void
  commitFontSizeDraft: () => void
  resetFontSizeDraft: () => void
  textColorDraft: string
  setTextColorDraft: (value: string) => void
  commitTextColorDraft: () => void
  resetTextColorDraft: () => void
  patchProps: (props: ParagraphStyleProperties) => void
}) {
  return (
    <>
      <SelectRow
        testId="style-definition-font-family"
        label="Font"
        editable={editable}
        value={resolveFontEntry(props.fontFamilyKey).key}
        options={FONT_OPTIONS.map((entry) => ({ value: entry.key, label: entry.displayName }))}
        onSelect={(fontFamilyKey) => patchProps({ fontFamilyKey })}
      />
      <EditableNumberRow
        testId="style-definition-font-size"
        label="Size"
        value={fontSizeDraft}
        editable={editable}
        min={1}
        max={96}
        step={0.25}
        unit="pt"
        onChange={setFontSizeDraft}
        onCommit={commitFontSizeDraft}
        onReset={resetFontSizeDraft}
      />
      <EditableColorRow
        testId="style-definition-text-color"
        label="Color"
        value={textColorDraft}
        editable={editable}
        onChange={setTextColorDraft}
        onCommit={commitTextColorDraft}
        onReset={resetTextColorDraft}
      />
      <ToggleRow
        testId="style-definition-text-toggles"
        label="Style"
        editable={editable}
        controls={[
          {
            id: "bold",
            label: "B",
            title: "Bold",
            active: props.fontWeight === "bold",
            onToggle: () => patchProps({ fontWeight: props.fontWeight === "bold" ? "normal" : "bold" }),
          },
          {
            id: "italic",
            label: "I",
            title: "Italic",
            active: props.fontStyle === "italic",
            onToggle: () => patchProps({ fontStyle: props.fontStyle === "italic" ? "normal" : "italic" }),
          },
          {
            id: "underline",
            label: "U",
            title: "Underline",
            active: props.textDecoration === "underline",
            onToggle: () => patchProps({ textDecoration: props.textDecoration === "underline" ? "none" : "underline" }),
          },
          {
            id: "strike",
            label: "S",
            title: "Strikethrough",
            active: props.strikethrough === true,
            onToggle: () => patchProps({ strikethrough: props.strikethrough !== true }),
          },
        ]}
      />
    </>
  )
}

function ParagraphStyleRows({
  props,
  editable,
  lineHeightDraft,
  setLineHeightDraft,
  commitLineHeightDraft,
  resetLineHeightDraft,
  spacingBeforeDraft,
  setSpacingBeforeDraft,
  commitSpacingBeforeDraft,
  resetSpacingBeforeDraft,
  spacingAfterDraft,
  setSpacingAfterDraft,
  commitSpacingAfterDraft,
  resetSpacingAfterDraft,
  textIndentDraft,
  setTextIndentDraft,
  commitTextIndentDraft,
  resetTextIndentDraft,
  indentLeftDraft,
  setIndentLeftDraft,
  commitIndentLeftDraft,
  resetIndentLeftDraft,
  indentRightDraft,
  setIndentRightDraft,
  commitIndentRightDraft,
  resetIndentRightDraft,
  patchProps,
}: {
  props: ParagraphStyleProperties
  editable: boolean
  lineHeightDraft: string
  setLineHeightDraft: (value: string) => void
  commitLineHeightDraft: () => void
  resetLineHeightDraft: () => void
  spacingBeforeDraft: string
  setSpacingBeforeDraft: (value: string) => void
  commitSpacingBeforeDraft: () => void
  resetSpacingBeforeDraft: () => void
  spacingAfterDraft: string
  setSpacingAfterDraft: (value: string) => void
  commitSpacingAfterDraft: () => void
  resetSpacingAfterDraft: () => void
  textIndentDraft: string
  setTextIndentDraft: (value: string) => void
  commitTextIndentDraft: () => void
  resetTextIndentDraft: () => void
  indentLeftDraft: string
  setIndentLeftDraft: (value: string) => void
  commitIndentLeftDraft: () => void
  resetIndentLeftDraft: () => void
  indentRightDraft: string
  setIndentRightDraft: (value: string) => void
  commitIndentRightDraft: () => void
  resetIndentRightDraft: () => void
  patchProps: (props: ParagraphStyleProperties) => void
}) {
  return (
    <>
      <ChoiceRow
        testId="style-definition-align"
        label="Align"
        editable={editable}
        value={props.align ?? "left"}
        options={ALIGN_OPTIONS}
        onSelect={(align) => patchProps({ align })}
      />
      <EditableNumberRow
        testId="style-definition-line-height"
        label="Line height"
        value={lineHeightDraft}
        editable={editable}
        min={0.5}
        max={4}
        step={0.05}
        onChange={setLineHeightDraft}
        onCommit={commitLineHeightDraft}
        onReset={resetLineHeightDraft}
      />
      <EditableNumberRow
        testId="style-definition-spacing-before"
        label="Before"
        value={spacingBeforeDraft}
        editable={editable}
        min={0}
        max={144}
        step={1}
        unit="pt"
        onChange={setSpacingBeforeDraft}
        onCommit={commitSpacingBeforeDraft}
        onReset={resetSpacingBeforeDraft}
      />
      <EditableNumberRow
        testId="style-definition-spacing-after"
        label="After"
        value={spacingAfterDraft}
        editable={editable}
        min={0}
        max={144}
        step={1}
        unit="pt"
        onChange={setSpacingAfterDraft}
        onCommit={commitSpacingAfterDraft}
        onReset={resetSpacingAfterDraft}
      />
      <EditableNumberRow
        testId="style-definition-text-indent"
        label="Text indent"
        value={textIndentDraft}
        editable={editable}
        min={-144}
        max={144}
        step={1}
        unit="pt"
        onChange={setTextIndentDraft}
        onCommit={commitTextIndentDraft}
        onReset={resetTextIndentDraft}
      />
      <EditableNumberRow
        testId="style-definition-indent-left"
        label="Left indent"
        value={indentLeftDraft}
        editable={editable}
        min={-144}
        max={144}
        step={1}
        unit="pt"
        onChange={setIndentLeftDraft}
        onCommit={commitIndentLeftDraft}
        onReset={resetIndentLeftDraft}
      />
      <EditableNumberRow
        testId="style-definition-indent-right"
        label="Right indent"
        value={indentRightDraft}
        editable={editable}
        min={-144}
        max={144}
        step={1}
        unit="pt"
        onChange={setIndentRightDraft}
        onCommit={commitIndentRightDraft}
        onReset={resetIndentRightDraft}
      />
      <ChoiceRow
        testId="style-definition-heading"
        label="Heading"
        editable={editable}
        value={props.headingLevel ?? null}
        options={HEADING_OPTIONS}
        onSelect={(headingLevel) => patchProps({ headingLevel })}
      />
      <ChoiceRow
        testId="style-definition-keep-next"
        label="Keep next"
        editable={editable}
        value={props.keepWithNext === true ? "on" : "off"}
        options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]}
        onSelect={(value) => patchProps({ keepWithNext: value === "on" })}
      />
    </>
  )
}

function EditableBoxStyleRows({
  props,
  editable,
  fillDraft,
  setFillDraft,
  commitFillDraft,
  resetFillDraft,
  paddingTopDraft,
  setPaddingTopDraft,
  commitPaddingTopDraft,
  resetPaddingTopDraft,
  paddingRightDraft,
  setPaddingRightDraft,
  commitPaddingRightDraft,
  resetPaddingRightDraft,
  paddingBottomDraft,
  setPaddingBottomDraft,
  commitPaddingBottomDraft,
  resetPaddingBottomDraft,
  paddingLeftDraft,
  setPaddingLeftDraft,
  commitPaddingLeftDraft,
  resetPaddingLeftDraft,
  borderStyle,
  setBorderStyle,
  borderWidthDraft,
  setBorderWidthDraft,
  commitBorderWidthDraft,
  resetBorderWidthDraft,
  borderColorDraft,
  setBorderColorDraft,
  commitBorderColorDraft,
  resetBorderColorDraft,
}: {
  props: ParagraphStyleProperties
  editable: boolean
  fillDraft: string
  setFillDraft: (value: string) => void
  commitFillDraft: () => void
  resetFillDraft: () => void
  paddingTopDraft: string
  setPaddingTopDraft: (value: string) => void
  commitPaddingTopDraft: () => void
  resetPaddingTopDraft: () => void
  paddingRightDraft: string
  setPaddingRightDraft: (value: string) => void
  commitPaddingRightDraft: () => void
  resetPaddingRightDraft: () => void
  paddingBottomDraft: string
  setPaddingBottomDraft: (value: string) => void
  commitPaddingBottomDraft: () => void
  resetPaddingBottomDraft: () => void
  paddingLeftDraft: string
  setPaddingLeftDraft: (value: string) => void
  commitPaddingLeftDraft: () => void
  resetPaddingLeftDraft: () => void
  borderStyle: BoxBorderChoice
  setBorderStyle: (value: BoxBorderChoice) => void
  borderWidthDraft: string
  setBorderWidthDraft: (value: string) => void
  commitBorderWidthDraft: () => void
  resetBorderWidthDraft: () => void
  borderColorDraft: string
  setBorderColorDraft: (value: string) => void
  commitBorderColorDraft: () => void
  resetBorderColorDraft: () => void
}) {
  const box = props.box
  const padding = box?.padding
  return (
    <>
      <EditableColorRow
        testId="style-definition-box-fill"
        label="Fill"
        value={fillDraft}
        editable={editable}
        onChange={setFillDraft}
        onCommit={commitFillDraft}
        onReset={resetFillDraft}
      />
      <EditableNumberRow
        testId="style-definition-box-padding-top"
        label="Pad top"
        value={paddingTopDraft}
        editable={editable}
        min={0}
        max={72}
        step={1}
        unit="pt"
        onChange={setPaddingTopDraft}
        onCommit={commitPaddingTopDraft}
        onReset={resetPaddingTopDraft}
      />
      <EditableNumberRow
        testId="style-definition-box-padding-right"
        label="Pad right"
        value={paddingRightDraft}
        editable={editable}
        min={0}
        max={72}
        step={1}
        unit="pt"
        onChange={setPaddingRightDraft}
        onCommit={commitPaddingRightDraft}
        onReset={resetPaddingRightDraft}
      />
      <EditableNumberRow
        testId="style-definition-box-padding-bottom"
        label="Pad bottom"
        value={paddingBottomDraft}
        editable={editable}
        min={0}
        max={72}
        step={1}
        unit="pt"
        onChange={setPaddingBottomDraft}
        onCommit={commitPaddingBottomDraft}
        onReset={resetPaddingBottomDraft}
      />
      <EditableNumberRow
        testId="style-definition-box-padding-left"
        label="Pad left"
        value={paddingLeftDraft}
        editable={editable}
        min={0}
        max={72}
        step={1}
        unit="pt"
        onChange={setPaddingLeftDraft}
        onCommit={commitPaddingLeftDraft}
        onReset={resetPaddingLeftDraft}
      />
      {!box && !padding && (
        <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.4 }}>
          Box values are unset until edited.
        </div>
      )}
      <ChoiceRow
        testId="style-definition-box-border-style"
        label="Border"
        editable={editable}
        value={borderStyle}
        options={BORDER_STYLE_OPTIONS}
        onSelect={setBorderStyle}
      />
      <EditableNumberRow
        testId="style-definition-box-border-width"
        label="B width"
        value={borderWidthDraft}
        editable={editable}
        min={0}
        max={12}
        step={0.25}
        unit="pt"
        onChange={setBorderWidthDraft}
        onCommit={commitBorderWidthDraft}
        onReset={resetBorderWidthDraft}
      />
      <EditableColorRow
        testId="style-definition-box-border-color"
        label="B color"
        value={borderColorDraft}
        editable={editable}
        onChange={setBorderColorDraft}
        onCommit={commitBorderColorDraft}
        onReset={resetBorderColorDraft}
      />
    </>
  )
}

export function StyleDefinitionPanel({
  doc,
  selectedStyleId,
  editable,
  onPatchStyleDefinition,
  onRenameStyleDefinition,
}: StyleDefinitionPanelProps) {
  const state = buildStyleManagerState(doc)
  const item = selectedStyleId
    ? state.paragraphStyles.items.find((candidate) => candidate.id === selectedStyleId)
    : null
  const [nameDraft, setNameDraft] = useState(item ? styleEditableName(item.definition) : "")
  const [fontSizeDraft, setFontSizeDraft] = useState(item ? fontSizeDraftValue(item.definition.props) : "")
  const [textColorDraft, setTextColorDraft] = useState(item ? textColorDraftValue(item.definition.props) : "")
  const [lineHeightDraft, setLineHeightDraft] = useState(item ? lineHeightDraftValue(item.definition.props) : "")
  const [spacingBeforeDraft, setSpacingBeforeDraft] = useState(item ? unitDraftValue(item.definition.props.spacingBefore) : "")
  const [spacingAfterDraft, setSpacingAfterDraft] = useState(item ? unitDraftValue(item.definition.props.spacingAfter) : "")
  const [textIndentDraft, setTextIndentDraft] = useState(item ? unitDraftValue(item.definition.props.textIndent) : "")
  const [indentLeftDraft, setIndentLeftDraft] = useState(item ? unitDraftValue(item.definition.props.indentLeft) : "")
  const [indentRightDraft, setIndentRightDraft] = useState(item ? unitDraftValue(item.definition.props.indentRight) : "")
  const [boxFillDraft, setBoxFillDraft] = useState(item ? boxFillDraftValue(item.definition.props) : "")
  const [boxPaddingTopDraft, setBoxPaddingTopDraft] = useState(item ? unitDraftValue(item.definition.props.box?.padding?.top) : "")
  const [boxPaddingRightDraft, setBoxPaddingRightDraft] = useState(item ? unitDraftValue(item.definition.props.box?.padding?.right) : "")
  const [boxPaddingBottomDraft, setBoxPaddingBottomDraft] = useState(item ? unitDraftValue(item.definition.props.box?.padding?.bottom) : "")
  const [boxPaddingLeftDraft, setBoxPaddingLeftDraft] = useState(item ? unitDraftValue(item.definition.props.box?.padding?.left) : "")
  const [boxBorderWidthDraft, setBoxBorderWidthDraft] = useState(item ? borderWidthDraftValue(item.definition.props) : "")
  const [boxBorderColorDraft, setBoxBorderColorDraft] = useState(item ? borderColorDraftValue(item.definition.props) : "")

  useEffect(() => {
    setNameDraft(item ? styleEditableName(item.definition) : "")
    setFontSizeDraft(item ? fontSizeDraftValue(item.definition.props) : "")
    setTextColorDraft(item ? textColorDraftValue(item.definition.props) : "")
    setLineHeightDraft(item ? lineHeightDraftValue(item.definition.props) : "")
    setSpacingBeforeDraft(item ? unitDraftValue(item.definition.props.spacingBefore) : "")
    setSpacingAfterDraft(item ? unitDraftValue(item.definition.props.spacingAfter) : "")
    setTextIndentDraft(item ? unitDraftValue(item.definition.props.textIndent) : "")
    setIndentLeftDraft(item ? unitDraftValue(item.definition.props.indentLeft) : "")
    setIndentRightDraft(item ? unitDraftValue(item.definition.props.indentRight) : "")
    setBoxFillDraft(item ? boxFillDraftValue(item.definition.props) : "")
    setBoxPaddingTopDraft(item ? unitDraftValue(item.definition.props.box?.padding?.top) : "")
    setBoxPaddingRightDraft(item ? unitDraftValue(item.definition.props.box?.padding?.right) : "")
    setBoxPaddingBottomDraft(item ? unitDraftValue(item.definition.props.box?.padding?.bottom) : "")
    setBoxPaddingLeftDraft(item ? unitDraftValue(item.definition.props.box?.padding?.left) : "")
    setBoxBorderWidthDraft(item ? borderWidthDraftValue(item.definition.props) : "")
    setBoxBorderColorDraft(item ? borderColorDraftValue(item.definition.props) : "")
  }, [
    item?.id,
    item?.definition.name,
    item?.definition.props.fontSize?.unit,
    item?.definition.props.fontSize?.value,
    item?.definition.props.lineHeight,
    item?.definition.props.spacingAfter?.unit,
    item?.definition.props.spacingAfter?.value,
    item?.definition.props.spacingBefore?.unit,
    item?.definition.props.spacingBefore?.value,
    item?.definition.props.indentLeft?.unit,
    item?.definition.props.indentLeft?.value,
    item?.definition.props.indentRight?.unit,
    item?.definition.props.indentRight?.value,
    item?.definition.props.textIndent?.unit,
    item?.definition.props.textIndent?.value,
    item?.definition.props.box?.fill,
    item?.definition.props.box?.padding?.bottom?.unit,
    item?.definition.props.box?.padding?.bottom?.value,
    item?.definition.props.box?.padding?.left?.unit,
    item?.definition.props.box?.padding?.left?.value,
    item?.definition.props.box?.padding?.right?.unit,
    item?.definition.props.box?.padding?.right?.value,
    item?.definition.props.box?.padding?.top?.unit,
    item?.definition.props.box?.padding?.top?.value,
    item?.definition.props.box?.border?.bottom?.color,
    item?.definition.props.box?.border?.bottom?.style,
    item?.definition.props.box?.border?.bottom?.width.unit,
    item?.definition.props.box?.border?.bottom?.width.value,
    item?.definition.props.box?.border?.left?.color,
    item?.definition.props.box?.border?.left?.style,
    item?.definition.props.box?.border?.left?.width.unit,
    item?.definition.props.box?.border?.left?.width.value,
    item?.definition.props.box?.border?.right?.color,
    item?.definition.props.box?.border?.right?.style,
    item?.definition.props.box?.border?.right?.width.unit,
    item?.definition.props.box?.border?.right?.width.value,
    item?.definition.props.box?.border?.top?.color,
    item?.definition.props.box?.border?.top?.style,
    item?.definition.props.box?.border?.top?.width.unit,
    item?.definition.props.box?.border?.top?.width.value,
    item?.definition.props.textColor,
  ])

  const resetNameDraft = () => setNameDraft(item ? styleEditableName(item.definition) : "")
  const resetFontSizeDraft = () => setFontSizeDraft(item ? fontSizeDraftValue(item.definition.props) : "")
  const resetTextColorDraft = () => setTextColorDraft(item ? textColorDraftValue(item.definition.props) : "")
  const resetLineHeightDraft = () => setLineHeightDraft(item ? lineHeightDraftValue(item.definition.props) : "")
  const resetSpacingBeforeDraft = () => setSpacingBeforeDraft(item ? unitDraftValue(item.definition.props.spacingBefore) : "")
  const resetSpacingAfterDraft = () => setSpacingAfterDraft(item ? unitDraftValue(item.definition.props.spacingAfter) : "")
  const resetTextIndentDraft = () => setTextIndentDraft(item ? unitDraftValue(item.definition.props.textIndent) : "")
  const resetIndentLeftDraft = () => setIndentLeftDraft(item ? unitDraftValue(item.definition.props.indentLeft) : "")
  const resetIndentRightDraft = () => setIndentRightDraft(item ? unitDraftValue(item.definition.props.indentRight) : "")
  const resetBoxFillDraft = () => setBoxFillDraft(item ? boxFillDraftValue(item.definition.props) : "")
  const resetBoxPaddingTopDraft = () => setBoxPaddingTopDraft(item ? unitDraftValue(item.definition.props.box?.padding?.top) : "")
  const resetBoxPaddingRightDraft = () => setBoxPaddingRightDraft(item ? unitDraftValue(item.definition.props.box?.padding?.right) : "")
  const resetBoxPaddingBottomDraft = () => setBoxPaddingBottomDraft(item ? unitDraftValue(item.definition.props.box?.padding?.bottom) : "")
  const resetBoxPaddingLeftDraft = () => setBoxPaddingLeftDraft(item ? unitDraftValue(item.definition.props.box?.padding?.left) : "")
  const resetBoxBorderWidthDraft = () => setBoxBorderWidthDraft(item ? borderWidthDraftValue(item.definition.props) : "")
  const resetBoxBorderColorDraft = () => setBoxBorderColorDraft(item ? borderColorDraftValue(item.definition.props) : "")

  const patchProps = (props: ParagraphStyleProperties) => {
    if (!item || !editable || !onPatchStyleDefinition) return
    onPatchStyleDefinition(item.id, { props })
  }

  const commitNameDraft = () => {
    if (!item || !editable || !onRenameStyleDefinition) return
    const nextName = nameDraft.trim()
    const currentName = styleEditableName(item.definition)
    if (nextName === currentName) return
    onRenameStyleDefinition(item.id, nextName.length > 0 ? nextName : null)
  }

  const commitFontSizeDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextSize = Number(fontSizeDraft)
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      resetFontSizeDraft()
      return
    }
    const roundedSize = Math.round(nextSize * 100) / 100
    if (item.definition.props.fontSize?.unit === "pt" && item.definition.props.fontSize.value === roundedSize) return
    patchProps({ fontSize: pt(roundedSize) })
  }

  const commitTextColorDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextColor = sanitizeHexColorInput(textColorDraft)
    if (!isCompleteHexColor(nextColor)) {
      resetTextColorDraft()
      return
    }
    if (item.definition.props.textColor === nextColor) return
    patchProps({ textColor: nextColor })
  }

  const commitLineHeightDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextLineHeight = Number(lineHeightDraft)
    if (!Number.isFinite(nextLineHeight) || nextLineHeight <= 0) {
      resetLineHeightDraft()
      return
    }
    const roundedLineHeight = Math.round(nextLineHeight * 100) / 100
    if (item.definition.props.lineHeight === roundedLineHeight) return
    patchProps({ lineHeight: roundedLineHeight })
  }

  const commitSpacingBeforeDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextSpacing = Number(spacingBeforeDraft)
    if (!Number.isFinite(nextSpacing) || nextSpacing < 0) {
      resetSpacingBeforeDraft()
      return
    }
    const roundedSpacing = Math.round(nextSpacing * 100) / 100
    if (item.definition.props.spacingBefore?.unit === "pt" && item.definition.props.spacingBefore.value === roundedSpacing) return
    patchProps({ spacingBefore: pt(roundedSpacing) })
  }

  const commitSpacingAfterDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextSpacing = Number(spacingAfterDraft)
    if (!Number.isFinite(nextSpacing) || nextSpacing < 0) {
      resetSpacingAfterDraft()
      return
    }
    const roundedSpacing = Math.round(nextSpacing * 100) / 100
    if (item.definition.props.spacingAfter?.unit === "pt" && item.definition.props.spacingAfter.value === roundedSpacing) return
    patchProps({ spacingAfter: pt(roundedSpacing) })
  }

  const commitTextIndentDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextIndent = Number(textIndentDraft)
    if (!Number.isFinite(nextIndent)) {
      resetTextIndentDraft()
      return
    }
    const roundedIndent = Math.round(nextIndent * 100) / 100
    if (item.definition.props.textIndent?.unit === "pt" && item.definition.props.textIndent.value === roundedIndent) return
    patchProps({ textIndent: pt(roundedIndent) })
  }

  const commitIndentLeftDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextIndent = Number(indentLeftDraft)
    if (!Number.isFinite(nextIndent)) {
      resetIndentLeftDraft()
      return
    }
    const roundedIndent = Math.round(nextIndent * 100) / 100
    if (item.definition.props.indentLeft?.unit === "pt" && item.definition.props.indentLeft.value === roundedIndent) return
    patchProps({ indentLeft: pt(roundedIndent) })
  }

  const commitIndentRightDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextIndent = Number(indentRightDraft)
    if (!Number.isFinite(nextIndent)) {
      resetIndentRightDraft()
      return
    }
    const roundedIndent = Math.round(nextIndent * 100) / 100
    if (item.definition.props.indentRight?.unit === "pt" && item.definition.props.indentRight.value === roundedIndent) return
    patchProps({ indentRight: pt(roundedIndent) })
  }

  const commitBoxFillDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextFill = sanitizeHexColorInput(boxFillDraft)
    if (!isCompleteHexColor(nextFill)) {
      resetBoxFillDraft()
      return
    }
    if (item.definition.props.box?.fill === nextFill) return
    patchProps({ box: { ...(item.definition.props.box ?? {}), fill: nextFill } })
  }

  const commitBoxPaddingDraft = (
    edge: "top" | "right" | "bottom" | "left",
    draft: string,
    reset: () => void,
  ) => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextPaddingValue = Number(draft)
    if (!Number.isFinite(nextPaddingValue) || nextPaddingValue < 0) {
      reset()
      return
    }
    const roundedPadding = Math.round(nextPaddingValue * 100) / 100
    const currentPadding = item.definition.props.box?.padding?.[edge]
    if (currentPadding?.unit === "pt" && currentPadding.value === roundedPadding) return
    const currentBox = item.definition.props.box ?? {}
    const current = currentBox.padding
    const nextPadding: ParagraphBoxPadding = {
      top: current?.top ?? pt(0),
      right: current?.right ?? pt(0),
      bottom: current?.bottom ?? pt(0),
      left: current?.left ?? pt(0),
    }
    nextPadding[edge] = pt(roundedPadding)
    patchProps({
      box: {
        ...currentBox,
        padding: nextPadding,
      },
    })
  }

  const clearUniformBorder = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const currentBox = item.definition.props.box ?? {}
    const { border: _border, ...boxWithoutBorder } = currentBox
    patchProps({ box: boxWithoutBorder })
  }

  const patchUniformBorder = (changes: Partial<ParagraphBoxBorderSide>) => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const current = firstBorderSide(item.definition.props)
    const currentStyle = current?.style && current.style !== "none" ? current.style : "solid"
    const side: ParagraphBoxBorderSide = {
      style: changes.style ?? currentStyle,
      width: changes.width ?? current?.width ?? pt(DEFAULT_BORDER_WIDTH),
      color: changes.color ?? current?.color ?? DEFAULT_BORDER_COLOR,
    }
    patchProps({
      box: {
        ...(item.definition.props.box ?? {}),
        border: makeUniformBorder(side),
      },
    })
  }

  const setUniformBorderStyle = (style: BoxBorderChoice) => {
    if (style === "none") {
      clearUniformBorder()
      return
    }
    patchUniformBorder({ style })
  }

  const commitBoxBorderWidthDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextWidth = Number(boxBorderWidthDraft)
    if (!Number.isFinite(nextWidth) || nextWidth < 0) {
      resetBoxBorderWidthDraft()
      return
    }
    const roundedWidth = Math.round(nextWidth * 100) / 100
    const current = firstBorderSide(item.definition.props)
    if (current?.width.unit === "pt" && current.width.value === roundedWidth) return
    patchUniformBorder({ width: pt(roundedWidth) })
  }

  const commitBoxBorderColorDraft = () => {
    if (!item || !editable || !onPatchStyleDefinition) return
    const nextColor = sanitizeHexColorInput(boxBorderColorDraft)
    if (!isCompleteHexColor(nextColor)) {
      resetBoxBorderColorDraft()
      return
    }
    const current = firstBorderSide(item.definition.props)
    if (current?.color === nextColor) return
    patchUniformBorder({ color: nextColor })
  }

  const headerAction = item ? (
    <span data-testid="style-definition-source-badge" style={badgeStyle}>
      {item.isBase ? "Base" : "Document"}
    </span>
  ) : undefined

  return (
    <section data-testid="style-definition-panel" data-editable={editable ? "true" : "false"} style={rightRailPanelShell}>
      <RightRailPanelHeader title="Style" testId="style-definition-header" action={headerAction} />
      <div style={rightRailPanelBody}>
        {!selectedStyleId ? (
          <div data-testid="style-definition-empty" style={emptyStyle}>No style selected</div>
        ) : !item ? (
          <div data-testid="style-definition-missing" style={emptyStyle}>Style not found</div>
        ) : (
          <>
            <div style={sectionStyle}>
              <div style={identityBoxStyle}>
                <EditableTextRow
                  testId="style-definition-name"
                  label="Name"
                  value={nameDraft}
                  placeholder={styleDisplayName(item.definition)}
                  editable={editable}
                  onChange={setNameDraft}
                  onCommit={commitNameDraft}
                  onReset={resetNameDraft}
                />
                <div data-testid="style-definition-id" style={identityIdStyle}>{item.id}</div>
              </div>
            </div>
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Text</div>
              <TextStyleRows
                props={item.definition.props}
                editable={editable}
                fontSizeDraft={fontSizeDraft}
                setFontSizeDraft={setFontSizeDraft}
                commitFontSizeDraft={commitFontSizeDraft}
                resetFontSizeDraft={resetFontSizeDraft}
                textColorDraft={textColorDraft}
                setTextColorDraft={setTextColorDraft}
                commitTextColorDraft={commitTextColorDraft}
                resetTextColorDraft={resetTextColorDraft}
                patchProps={patchProps}
              />
            </div>
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Paragraph</div>
              <ParagraphStyleRows
                props={item.definition.props}
                editable={editable}
                lineHeightDraft={lineHeightDraft}
                setLineHeightDraft={setLineHeightDraft}
                commitLineHeightDraft={commitLineHeightDraft}
                resetLineHeightDraft={resetLineHeightDraft}
                spacingBeforeDraft={spacingBeforeDraft}
                setSpacingBeforeDraft={setSpacingBeforeDraft}
                commitSpacingBeforeDraft={commitSpacingBeforeDraft}
                resetSpacingBeforeDraft={resetSpacingBeforeDraft}
                spacingAfterDraft={spacingAfterDraft}
                setSpacingAfterDraft={setSpacingAfterDraft}
                commitSpacingAfterDraft={commitSpacingAfterDraft}
                resetSpacingAfterDraft={resetSpacingAfterDraft}
                textIndentDraft={textIndentDraft}
                setTextIndentDraft={setTextIndentDraft}
                commitTextIndentDraft={commitTextIndentDraft}
                resetTextIndentDraft={resetTextIndentDraft}
                indentLeftDraft={indentLeftDraft}
                setIndentLeftDraft={setIndentLeftDraft}
                commitIndentLeftDraft={commitIndentLeftDraft}
                resetIndentLeftDraft={resetIndentLeftDraft}
                indentRightDraft={indentRightDraft}
                setIndentRightDraft={setIndentRightDraft}
                commitIndentRightDraft={commitIndentRightDraft}
                resetIndentRightDraft={resetIndentRightDraft}
                patchProps={patchProps}
              />
            </div>
            <div style={{ ...sectionStyle, borderBottom: "none", marginBottom: 0 }}>
              <div style={sectionTitleStyle}>Box</div>
              <EditableBoxStyleRows
                props={item.definition.props}
                editable={editable}
                fillDraft={boxFillDraft}
                setFillDraft={setBoxFillDraft}
                commitFillDraft={commitBoxFillDraft}
                resetFillDraft={resetBoxFillDraft}
                paddingTopDraft={boxPaddingTopDraft}
                setPaddingTopDraft={setBoxPaddingTopDraft}
                commitPaddingTopDraft={() => commitBoxPaddingDraft("top", boxPaddingTopDraft, resetBoxPaddingTopDraft)}
                resetPaddingTopDraft={resetBoxPaddingTopDraft}
                paddingRightDraft={boxPaddingRightDraft}
                setPaddingRightDraft={setBoxPaddingRightDraft}
                commitPaddingRightDraft={() => commitBoxPaddingDraft("right", boxPaddingRightDraft, resetBoxPaddingRightDraft)}
                resetPaddingRightDraft={resetBoxPaddingRightDraft}
                paddingBottomDraft={boxPaddingBottomDraft}
                setPaddingBottomDraft={setBoxPaddingBottomDraft}
                commitPaddingBottomDraft={() => commitBoxPaddingDraft("bottom", boxPaddingBottomDraft, resetBoxPaddingBottomDraft)}
                resetPaddingBottomDraft={resetBoxPaddingBottomDraft}
                paddingLeftDraft={boxPaddingLeftDraft}
                setPaddingLeftDraft={setBoxPaddingLeftDraft}
                commitPaddingLeftDraft={() => commitBoxPaddingDraft("left", boxPaddingLeftDraft, resetBoxPaddingLeftDraft)}
                resetPaddingLeftDraft={resetBoxPaddingLeftDraft}
                borderStyle={item ? borderStyleValue(item.definition.props) : "none"}
                setBorderStyle={setUniformBorderStyle}
                borderWidthDraft={boxBorderWidthDraft}
                setBorderWidthDraft={setBoxBorderWidthDraft}
                commitBorderWidthDraft={commitBoxBorderWidthDraft}
                resetBorderWidthDraft={resetBoxBorderWidthDraft}
                borderColorDraft={boxBorderColorDraft}
                setBorderColorDraft={setBoxBorderColorDraft}
                commitBorderColorDraft={commitBoxBorderColorDraft}
                resetBorderColorDraft={resetBoxBorderColorDraft}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
