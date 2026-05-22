import type { InlineNode, ParagraphNode, TextRun, TextRunStyle, UnitValue } from "../schema"
import { normalizeFontFamilyKey } from "../font-registry"
import { createId, DEFAULT_PARAGRAPH_PROPS } from "./defaults"

export interface EffectiveTextRunStyle {
  fontSize: UnitValue
  fontFamilyKey: string
  textColor: string
  fontWeight: "normal" | "bold"
  fontStyle: "normal" | "italic"
  textDecoration: "none" | "underline"
  strikethrough: boolean
}

export interface TextRunStyleFieldState<T> {
  value: T
  mixed: boolean
}

export interface TextRunStyleRangeState {
  fontSize: TextRunStyleFieldState<UnitValue>
  fontFamilyKey: TextRunStyleFieldState<string>
  textColor: TextRunStyleFieldState<string>
  fontWeight: TextRunStyleFieldState<"normal" | "bold">
  fontStyle: TextRunStyleFieldState<"normal" | "italic">
  textDecoration: TextRunStyleFieldState<"none" | "underline">
  strikethrough: TextRunStyleFieldState<boolean>
}

export interface TextRunStylePatch {
  fontSize?: TextRunStyle["fontSize"] | null
  fontFamilyKey?: TextRunStyle["fontFamilyKey"] | null
  textColor?: TextRunStyle["textColor"] | null
  fontWeight?: TextRunStyle["fontWeight"] | null
  fontStyle?: TextRunStyle["fontStyle"] | null
  textDecoration?: TextRunStyle["textDecoration"] | null
  strikethrough?: TextRunStyle["strikethrough"] | null
}

export interface ReplaceTextRunRangeOptions {
  style?: TextRunStyle | null
}

export type ParagraphTextStyleChanges = TextRunStylePatch

export interface TextRunParagraphTextReplacement {
  start: number
  end: number
  text: string
}

function cloneUnitValue(value: UnitValue): UnitValue {
  return { value: value.value, unit: value.unit }
}

function clonePlainData<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function unitValueStyleKey(value: UnitValue | undefined): string {
  return value ? `${value.value}:${value.unit}` : ""
}

export function hasTextRunStyle(run: TextRun): boolean {
  return run.style != null && Object.keys(run.style).length > 0
}

export function isTextRunOnlyParagraph(node: ParagraphNode): node is ParagraphNode & { children: TextRun[] } {
  return node.children.length > 0 && node.children.every((child) => child.type === "text")
}

export function getTextRunParagraphText(node: ParagraphNode): string | null {
  if (!isTextRunOnlyParagraph(node)) return null
  return node.children.map((child) => child.type === "text" ? child.text : "").join("")
}

export function textRunStyleKey(style: TextRunStyle | undefined): string {
  if (!style) return ""
  return [
    unitValueStyleKey(style.fontSize),
    style.fontFamilyKey ?? "",
    style.textColor ?? "",
    style.fontWeight ?? "",
    style.fontStyle ?? "",
    style.textDecoration ?? "",
    style.strikethrough == null ? "" : String(style.strikethrough),
  ].join("|")
}

export function areTextRunStylesEqual(a: TextRunStyle | undefined, b: TextRunStyle | undefined): boolean {
  return textRunStyleKey(a) === textRunStyleKey(b)
}

export function resolveTextRunStyle(paragraph: ParagraphNode, run: TextRun): EffectiveTextRunStyle {
  const style = run.style ?? {}
  return {
    fontSize: cloneUnitValue(style.fontSize ?? paragraph.props.fontSize ?? DEFAULT_PARAGRAPH_PROPS.fontSize),
    fontFamilyKey: normalizeFontFamilyKey(style.fontFamilyKey ?? paragraph.props.fontFamilyKey ?? DEFAULT_PARAGRAPH_PROPS.fontFamilyKey),
    textColor: style.textColor ?? paragraph.props.textColor ?? DEFAULT_PARAGRAPH_PROPS.textColor ?? "000000",
    fontWeight: style.fontWeight ?? paragraph.props.fontWeight ?? DEFAULT_PARAGRAPH_PROPS.fontWeight ?? "normal",
    fontStyle: style.fontStyle ?? paragraph.props.fontStyle ?? DEFAULT_PARAGRAPH_PROPS.fontStyle ?? "normal",
    textDecoration: style.textDecoration ?? paragraph.props.textDecoration ?? DEFAULT_PARAGRAPH_PROPS.textDecoration ?? "none",
    strikethrough: style.strikethrough ?? paragraph.props.strikethrough ?? DEFAULT_PARAGRAPH_PROPS.strikethrough ?? false,
  }
}

function paragraphTextLength(paragraph: ParagraphNode): number {
  return paragraph.children.reduce((sum, child) => sum + (child.type === "text" ? child.text.length : 0), 0)
}

function normalizeTextRangeForStyleState(
  start: number,
  end: number,
  maxLength: number,
): { start: number; end: number; collapsed: boolean } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const rawStart = Math.trunc(start)
  const rawEnd = Math.trunc(end)
  const from = Math.max(0, Math.min(rawStart, rawEnd, maxLength))
  const to = Math.max(0, Math.min(Math.max(rawStart, rawEnd), maxLength))
  return { start: from, end: to, collapsed: from === to }
}

function textRunAtOffset(paragraph: ParagraphNode, offset: number): TextRun | null {
  let cursor = 0
  let firstTextRun: TextRun | null = null
  let previousTextRun: TextRun | null = null

  for (const child of paragraph.children) {
    if (child.type !== "text") continue
    if (!firstTextRun) firstTextRun = child
    const runStart = cursor
    const runEnd = runStart + child.text.length
    if (offset === runStart && previousTextRun) return previousTextRun
    if (offset >= runStart && offset < runEnd) return child
    if (offset === runEnd && child.text.length > 0) previousTextRun = child
    cursor = runEnd
  }

  return previousTextRun ?? firstTextRun
}

function textRunsInRange(paragraph: ParagraphNode, start: number, end: number): TextRun[] {
  const runs: TextRun[] = []
  let cursor = 0
  for (const child of paragraph.children) {
    if (child.type !== "text") continue
    const runStart = cursor
    const runEnd = runStart + child.text.length
    cursor = runEnd
    if (Math.max(start, runStart) < Math.min(end, runEnd)) runs.push(child)
  }
  return runs
}

function unitValuesEqual(a: UnitValue, b: UnitValue): boolean {
  return a.value === b.value && a.unit === b.unit
}

function fieldState<T>(values: T[], equals: (a: T, b: T) => boolean = Object.is): TextRunStyleFieldState<T> {
  const first = values[0]!
  return {
    value: first,
    mixed: values.some((value) => !equals(first, value)),
  }
}

export function getTextRunStyleRangeState(
  paragraph: ParagraphNode,
  start: number,
  end: number,
): TextRunStyleRangeState | null {
  const range = normalizeTextRangeForStyleState(start, end, paragraphTextLength(paragraph))
  if (!range) return null

  const runs = range.collapsed
    ? [textRunAtOffset(paragraph, range.start)].filter((run): run is TextRun => run !== null)
    : textRunsInRange(paragraph, range.start, range.end)
  if (runs.length === 0) return null

  const styles = runs.map((run) => resolveTextRunStyle(paragraph, run))
  return {
    fontSize: fieldState(styles.map((style) => style.fontSize), unitValuesEqual),
    fontFamilyKey: fieldState(styles.map((style) => style.fontFamilyKey)),
    textColor: fieldState(styles.map((style) => style.textColor)),
    fontWeight: fieldState(styles.map((style) => style.fontWeight)),
    fontStyle: fieldState(styles.map((style) => style.fontStyle)),
    textDecoration: fieldState(styles.map((style) => style.textDecoration)),
    strikethrough: fieldState(styles.map((style) => style.strikethrough)),
  }
}

export function mergeAdjacentTextRuns(children: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = []
  for (const child of children) {
    const previous = merged.at(-1)
    if (
      previous?.type === "text" &&
      child.type === "text" &&
      areTextRunStylesEqual(previous.style, child.style)
    ) {
      merged[merged.length - 1] = { ...previous, text: previous.text + child.text }
      continue
    }
    merged.push(child)
  }
  return merged
}

export function resolveTextRunParagraphTextReplacement(
  currentText: string,
  nextText: string,
): TextRunParagraphTextReplacement | null {
  if (currentText === nextText) return null

  let prefixLength = 0
  const maxPrefixLength = Math.min(currentText.length, nextText.length)
  while (
    prefixLength < maxPrefixLength &&
    currentText[prefixLength] === nextText[prefixLength]
  ) {
    prefixLength += 1
  }

  let currentEnd = currentText.length
  let nextEnd = nextText.length
  while (
    currentEnd > prefixLength &&
    nextEnd > prefixLength &&
    currentText[currentEnd - 1] === nextText[nextEnd - 1]
  ) {
    currentEnd -= 1
    nextEnd -= 1
  }

  return {
    start: prefixLength,
    end: currentEnd,
    text: nextText.slice(prefixLength, nextEnd),
  }
}

function textRunBoundaryAtOrBeforeOffset(node: ParagraphNode & { children: TextRun[] }, offset: number): number {
  const boundaries: number[] = [0]
  let cursor = 0
  for (const child of node.children) {
    cursor += child.text.length
    boundaries.push(cursor)
  }
  if (boundaries.includes(offset)) return offset
  for (let index = boundaries.length - 1; index >= 0; index--) {
    if (boundaries[index] < offset) return boundaries[index]
  }
  return 0
}

function alignTextReplacementToRunBoundary(
  node: ParagraphNode & { children: TextRun[] },
  currentText: string,
  nextText: string,
  replacement: TextRunParagraphTextReplacement,
): TextRunParagraphTextReplacement {
  let start = replacement.start
  let end = replacement.end
  let nextEnd = start + replacement.text.length
  const boundary = textRunBoundaryAtOrBeforeOffset(node, start)

  while (
    start > boundary &&
    end > 0 &&
    nextEnd > 0 &&
    currentText[end - 1] === nextText[nextEnd - 1]
  ) {
    start -= 1
    end -= 1
    nextEnd -= 1
  }

  if (start === replacement.start && end === replacement.end) return replacement
  return {
    start,
    end,
    text: nextText.slice(start, nextEnd),
  }
}

function normalizeTextRange(start: number, end: number, maxLength: number): { start: number; end: number } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const rawStart = Math.trunc(start)
  const rawEnd = Math.trunc(end)
  const from = Math.max(0, Math.min(rawStart, rawEnd, maxLength))
  const to = Math.max(0, Math.min(Math.max(rawStart, rawEnd), maxLength))
  return from < to ? { start: from, end: to } : null
}

function normalizeTextRangeForReplacement(
  start: number,
  end: number,
  maxLength: number,
  replacementText: string,
): { start: number; end: number } | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const rawStart = Math.trunc(start)
  const rawEnd = Math.trunc(end)
  const from = Math.max(0, Math.min(rawStart, rawEnd, maxLength))
  const to = Math.max(0, Math.min(Math.max(rawStart, rawEnd), maxLength))
  return from < to || replacementText.length > 0 ? { start: from, end: to } : null
}

export function hasTextRunStylePatch(patch: TextRunStylePatch): boolean {
  return Object.keys(patch).length > 0
}

function applyTextRunStylePatch(style: TextRunStyle | undefined, patch: TextRunStylePatch): TextRunStyle | undefined {
  const next: TextRunStyle = clonePlainData(style ?? {})

  if (Object.prototype.hasOwnProperty.call(patch, "fontSize")) {
    if (patch.fontSize == null) delete next.fontSize
    else next.fontSize = clonePlainData(patch.fontSize)
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontFamilyKey")) {
    if (patch.fontFamilyKey == null) delete next.fontFamilyKey
    else next.fontFamilyKey = patch.fontFamilyKey
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textColor")) {
    if (patch.textColor == null) delete next.textColor
    else next.textColor = patch.textColor
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontWeight")) {
    if (patch.fontWeight == null) delete next.fontWeight
    else next.fontWeight = patch.fontWeight
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fontStyle")) {
    if (patch.fontStyle == null) delete next.fontStyle
    else next.fontStyle = patch.fontStyle
  }
  if (Object.prototype.hasOwnProperty.call(patch, "textDecoration")) {
    if (patch.textDecoration == null) delete next.textDecoration
    else next.textDecoration = patch.textDecoration
  }
  if (Object.prototype.hasOwnProperty.call(patch, "strikethrough")) {
    if (patch.strikethrough == null) delete next.strikethrough
    else next.strikethrough = patch.strikethrough
  }

  return Object.keys(next).length > 0 ? next : undefined
}

function textRunPart(
  source: TextRun,
  text: string,
  style: TextRunStyle | undefined,
  keepSourceId: boolean,
): TextRun | null {
  if (text.length === 0) return null
  const next: TextRun = {
    ...source,
    id: keepSourceId ? source.id : createId("text"),
    text,
  }
  if (style && Object.keys(style).length > 0) next.style = clonePlainData(style)
  else delete next.style
  return next
}

function appendTextRunPart(
  output: InlineNode[],
  source: TextRun,
  text: string,
  style: TextRunStyle | undefined,
  keepSourceId: boolean,
): void {
  const part = textRunPart(source, text, style, keepSourceId)
  if (part) output.push(part)
}

function textRunStyleFromReplacementOptions(
  node: ParagraphNode,
  offset: number,
  options: ReplaceTextRunRangeOptions,
): TextRunStyle | undefined {
  if (Object.prototype.hasOwnProperty.call(options, "style")) {
    if (options.style == null || Object.keys(options.style).length === 0) return undefined
    return clonePlainData(options.style)
  }

  let cursor = 0
  let previousTextRun: TextRun | null = null
  let firstTextRun: TextRun | null = null

  for (const child of node.children) {
    if (child.type !== "text") continue
    if (!firstTextRun) firstTextRun = child
    const runStart = cursor
    const runEnd = runStart + child.text.length
    if (offset === runStart && previousTextRun) return clonePlainData(previousTextRun.style)
    if (offset >= runStart && offset < runEnd) return clonePlainData(child.style)
    if (offset === runEnd && child.text.length > 0) previousTextRun = child
    cursor = runEnd
  }

  return clonePlainData(previousTextRun?.style ?? firstTextRun?.style)
}

function createInsertedTextRun(
  source: TextRun | null,
  text: string,
  style: TextRunStyle | undefined,
): TextRun | null {
  if (text.length === 0) return null
  const next: TextRun = source
    ? { ...source, id: createId("text"), text }
    : { id: createId("text"), type: "text", text }
  if (style && Object.keys(style).length > 0) next.style = clonePlainData(style)
  else delete next.style
  return next
}

function appendInsertedTextRun(
  output: InlineNode[],
  source: TextRun | null,
  text: string,
  style: TextRunStyle | undefined,
): void {
  const inserted = createInsertedTextRun(source, text, style)
  if (inserted) output.push(inserted)
}

export function applyTextRunStyleRangeToParagraph(
  node: ParagraphNode,
  start: number,
  end: number,
  patch: TextRunStylePatch,
): ParagraphNode | null {
  if (!hasTextRunStylePatch(patch)) return null
  const range = normalizeTextRange(start, end, paragraphTextLength(node))
  if (!range) return null

  let cursor = 0
  let changed = false
  const children: InlineNode[] = []

  for (const child of node.children) {
    if (child.type !== "text") {
      children.push(child)
      continue
    }

    const runStart = cursor
    const runEnd = runStart + child.text.length
    cursor = runEnd
    const overlapStart = Math.max(range.start, runStart)
    const overlapEnd = Math.min(range.end, runEnd)

    if (overlapStart >= overlapEnd) {
      children.push(child)
      continue
    }

    const nextStyle = applyTextRunStylePatch(child.style, patch)
    if (areTextRunStylesEqual(child.style, nextStyle)) {
      children.push(child)
      continue
    }

    changed = true
    let keptSourceId = false
    const pushPart = (text: string, style: TextRunStyle | undefined) => {
      appendTextRunPart(children, child, text, style, !keptSourceId)
      if (text.length > 0 && !keptSourceId) keptSourceId = true
    }

    pushPart(child.text.slice(0, overlapStart - runStart), child.style)
    pushPart(child.text.slice(overlapStart - runStart, overlapEnd - runStart), nextStyle)
    pushPart(child.text.slice(overlapEnd - runStart), child.style)
  }

  if (!changed) return null
  return { ...node, children: mergeAdjacentTextRuns(children) }
}

export function deleteTextRunRangeFromParagraph(
  node: ParagraphNode,
  start: number,
  end: number,
): ParagraphNode | null {
  const range = normalizeTextRange(start, end, paragraphTextLength(node))
  if (!range) return null

  let cursor = 0
  let changed = false
  const children: InlineNode[] = []
  const firstTextRun = node.children.find((child) => child.type === "text")

  for (const child of node.children) {
    if (child.type !== "text") {
      children.push(child)
      continue
    }

    const runStart = cursor
    const runEnd = runStart + child.text.length
    cursor = runEnd
    const overlapStart = Math.max(range.start, runStart)
    const overlapEnd = Math.min(range.end, runEnd)

    if (overlapStart >= overlapEnd) {
      children.push(child)
      continue
    }

    changed = true
    let keptSourceId = false
    const pushPart = (text: string) => {
      appendTextRunPart(children, child, text, child.style, !keptSourceId)
      if (text.length > 0 && !keptSourceId) keptSourceId = true
    }

    pushPart(child.text.slice(0, overlapStart - runStart))
    pushPart(child.text.slice(overlapEnd - runStart))
  }

  if (!changed) return null

  const merged = mergeAdjacentTextRuns(children)
  if (merged.length > 0) return { ...node, children: merged }
  if (!firstTextRun) return { ...node, children: [] }
  const emptyRun: TextRun = { ...firstTextRun, text: "" }
  if (firstTextRun.style) emptyRun.style = clonePlainData(firstTextRun.style)
  else delete emptyRun.style
  return { ...node, children: [emptyRun] }
}

export function replaceTextRunRangeInParagraph(
  node: ParagraphNode,
  start: number,
  end: number,
  text: string,
  options: ReplaceTextRunRangeOptions = {},
): ParagraphNode | null {
  const range = normalizeTextRangeForReplacement(start, end, paragraphTextLength(node), text)
  if (!range) return null

  const firstTextRun = node.children.find((child) => child.type === "text") ?? null
  const insertStyle = textRunStyleFromReplacementOptions(node, range.start, options)
  let cursor = 0
  let changed = false
  let inserted = false
  const children: InlineNode[] = []

  const insertReplacement = () => {
    if (inserted) return
    appendInsertedTextRun(children, firstTextRun, text, insertStyle)
    inserted = true
    if (text.length > 0) changed = true
  }

  for (const child of node.children) {
    if (child.type !== "text") {
      if (!inserted && range.start === cursor && range.end === cursor) {
        insertReplacement()
      }
      children.push(child)
      continue
    }

    const runStart = cursor
    const runEnd = runStart + child.text.length
    cursor = runEnd
    const overlapStart = Math.max(range.start, runStart)
    const overlapEnd = Math.min(range.end, runEnd)

    if (!inserted && range.start <= runStart) {
      insertReplacement()
    }

    if (range.start === range.end && range.start > runStart && range.start < runEnd) {
      changed = true
      let keptSourceId = false
      const pushPart = (part: string) => {
        appendTextRunPart(children, child, part, child.style, !keptSourceId)
        if (part.length > 0 && !keptSourceId) keptSourceId = true
      }
      pushPart(child.text.slice(0, range.start - runStart))
      insertReplacement()
      pushPart(child.text.slice(range.start - runStart))
      continue
    }

    if (overlapStart >= overlapEnd) {
      children.push(child)
      continue
    }

    changed = true
    let keptSourceId = false
    const pushPart = (part: string) => {
      appendTextRunPart(children, child, part, child.style, !keptSourceId)
      if (part.length > 0 && !keptSourceId) keptSourceId = true
    }

    pushPart(child.text.slice(0, overlapStart - runStart))
    if (!inserted) insertReplacement()
    pushPart(child.text.slice(overlapEnd - runStart))
  }

  if (!inserted) insertReplacement()
  if (!changed) return null

  const merged = mergeAdjacentTextRuns(children)
  if (merged.length > 0) return { ...node, children: merged }
  if (!firstTextRun) return { ...node, children: [] }
  const emptyRun: TextRun = { ...firstTextRun, text: "" }
  if (firstTextRun.style) emptyRun.style = clonePlainData(firstTextRun.style)
  else delete emptyRun.style
  return { ...node, children: [emptyRun] }
}

export function replaceTextRunParagraphTextInParagraph(
  node: ParagraphNode,
  nextText: string,
): ParagraphNode | null {
  if (!isTextRunOnlyParagraph(node)) return null
  const currentText = getTextRunParagraphText(node)
  if (currentText == null) return null
  const replacement = resolveTextRunParagraphTextReplacement(currentText, nextText)
  if (!replacement) return null
  const alignedReplacement = alignTextReplacementToRunBoundary(node, currentText, nextText, replacement)
  return replaceTextRunRangeInParagraph(
    node,
    alignedReplacement.start,
    alignedReplacement.end,
    alignedReplacement.text,
  )
}

function ensureTextRunChildren(children: InlineNode[], fallbackRun: TextRun | undefined): InlineNode[] {
  if (children.length > 0) return children
  if (!fallbackRun) return []
  const emptyRun: TextRun = { ...fallbackRun, id: createId("text"), text: "" }
  if (fallbackRun.style) emptyRun.style = clonePlainData(fallbackRun.style)
  else delete emptyRun.style
  return [emptyRun]
}

export function splitTextRunsAtOffset(node: ParagraphNode & { children: TextRun[] }, offset: number): { before: InlineNode[]; after: InlineNode[] } {
  const safeOffset = Math.max(0, Math.min(Math.trunc(offset), paragraphTextLength(node)))
  const before: InlineNode[] = []
  const after: InlineNode[] = []
  let cursor = 0

  for (const child of node.children) {
    const runStart = cursor
    const runEnd = runStart + child.text.length
    cursor = runEnd

    if (safeOffset <= runStart) {
      after.push(child)
      continue
    }
    if (safeOffset >= runEnd) {
      before.push(child)
      continue
    }

    appendTextRunPart(before, child, child.text.slice(0, safeOffset - runStart), child.style, true)
    appendTextRunPart(after, child, child.text.slice(safeOffset - runStart), child.style, false)
  }

  const firstRun = node.children[0]
  const lastBefore = [...before].reverse().find((child): child is TextRun => child.type === "text")
  const firstAfter = after.find((child): child is TextRun => child.type === "text")
  return {
    before: ensureTextRunChildren(mergeAdjacentTextRuns(before), lastBefore ?? firstAfter ?? firstRun),
    after: ensureTextRunChildren(mergeAdjacentTextRuns(after), firstAfter ?? lastBefore ?? firstRun),
  }
}
