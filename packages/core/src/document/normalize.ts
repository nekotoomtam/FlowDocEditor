import type {
  BodyNode,
  DividerNode,
  DocumentNode,
  DocumentSection,
  FieldRefInline,
  FlowRowNode,
  FlowStackNode,
  FlowTableCellMergeMap,
  FlowTableCellNode,
  FlowTableNode,
  InlineNode,
  LayoutNode,
  PageBreakNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphBoxStyle,
  ParagraphNode,
  ParagraphProps,
  RowNode,
  PageNumberInline,
  ParagraphListProps,
  SpacerNode,
  StackNode,
  TextRun,
  TextRunStyle,
  UnitValue,
} from "../schema"
import { MAX_LIST_LEVEL } from "../schema"
import {
  DEFAULT_DIVIDER_PROPS,
  DEFAULT_PARAGRAPH_PROPS,
  DEFAULT_SPACER_HEIGHT,
  DEFAULT_STACK_MIN_HEIGHT,
  createId,
  getEqualWidthShares,
} from "./defaults"
import { normalizeFontFamilyKey } from "../font-registry"
import { mergeAdjacentTextRuns } from "./richText"

/**
 * Normalize ทำหน้าที่เดียวคือ
 * "รับ input ที่อาจไม่ครบหรือผิดรูป → คืน canonical shape"
 *
 * กฎหลัก:
 * - deterministic: input เดิม → output เดิมเสมอ
 * - idempotent: normalize(normalize(x)) === normalize(x)
 * - minimal: แก้เท่าที่จำเป็น ไม่ restructure tree
 *
 * สิ่งที่ normalize ไม่ทำ:
 * - ซ่อม tree structure ที่ผิด (เช่น row child ไม่ใช่ stack)
 * - สร้าง node ใหม่ที่ไม่มีอยู่
 * - ตัดสินใจแทน assertDocument
 */

// ─── Scalar Helpers ───────────────────────────────────────────────────────────

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const n = normalizeFiniteNumber(value, fallback)
  return n > 0 ? n : fallback
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const n = normalizeFiniteNumber(value, fallback)
  return n >= 0 ? n : fallback
}

function normalizeUnitValue(input: unknown, fallback: UnitValue): UnitValue {
  if (typeof input !== "object" || input == null) return { ...fallback }
  const raw = input as Record<string, unknown>
  const unit = raw["unit"]
  const value = normalizeFiniteNumber(raw["value"], fallback.value)
  if (unit === "pt" || unit === "mm") return { value, unit }
  return { ...fallback }
}

function normalizePositiveUnitValue(input: unknown, fallback: UnitValue): UnitValue {
  const uv = normalizeUnitValue(input, fallback)
  return uv.value > 0 ? uv : { ...fallback }
}

function normalizeNonNegativeUnitValue(input: unknown, fallback: UnitValue): UnitValue {
  const uv = normalizeUnitValue(input, fallback)
  return uv.value >= 0 ? uv : { ...fallback }
}

function normalizeHexColor(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && /^[0-9A-Fa-f]{6}$/.test(value)) return value
  return fallback
}

function normalizeOptionalPositiveUnitValue(input: unknown): UnitValue | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const unit = raw["unit"]
  const value = raw["value"]
  if ((unit === "pt" || unit === "mm") && typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { value, unit }
  }
  return undefined
}

// ─── Inline Nodes ─────────────────────────────────────────────────────────────

function normalizeTextRunStyle(input: unknown): TextRunStyle | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const style: TextRunStyle = {}
  const fontSize = normalizeOptionalPositiveUnitValue(raw["fontSize"])
  const textColor = normalizeHexColor(raw["textColor"])

  if (fontSize) style.fontSize = fontSize
  if (typeof raw["fontFamilyKey"] === "string" && raw["fontFamilyKey"].length > 0) {
    style.fontFamilyKey = normalizeFontFamilyKey(raw["fontFamilyKey"])
  }
  if (textColor) style.textColor = textColor
  if (raw["fontWeight"] === "normal" || raw["fontWeight"] === "bold") style.fontWeight = raw["fontWeight"]
  if (raw["fontStyle"] === "normal" || raw["fontStyle"] === "italic") style.fontStyle = raw["fontStyle"]
  if (raw["textDecoration"] === "none" || raw["textDecoration"] === "underline") style.textDecoration = raw["textDecoration"]
  if (typeof raw["strikethrough"] === "boolean") style.strikethrough = raw["strikethrough"]

  return Object.keys(style).length > 0 ? style : undefined
}

function normalizeTextRun(input: unknown): TextRun {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  const style = normalizeTextRunStyle(raw["style"])
  return {
    id: typeof raw["id"] === "string" && raw["id"].length > 0 ? raw["id"] : createId("text"),
    type: "text",
    text: normalizeString(raw["text"], ""),
    ...(style ? { style } : {}),
  }
}

function normalizeFieldRef(input: unknown): FieldRefInline {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  return {
    id: typeof raw["id"] === "string" && raw["id"].length > 0 ? raw["id"] : createId("field"),
    type: "fieldRef",
    key: typeof raw["key"] === "string" && raw["key"].length > 0 ? raw["key"] : "field",
    label: typeof raw["label"] === "string" ? raw["label"] : undefined,
    fallback: typeof raw["fallback"] === "string" ? raw["fallback"] : undefined,
  }
}

function normalizePageNumber(input: unknown): PageNumberInline {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  return {
    id: typeof raw["id"] === "string" && raw["id"].length > 0 ? raw["id"] : createId("page-number"),
    type: "pageNumber",
  }
}

function normalizeInlineNode(input: unknown): InlineNode {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  if (raw["type"] === "fieldRef") return normalizeFieldRef(input)
  if (raw["type"] === "pageNumber") return normalizePageNumber(input)
  return normalizeTextRun(input)
}

function normalizeInlineChildren(input: unknown): InlineNode[] {
  const normalized = Array.isArray(input) ? input.map(normalizeInlineNode) : []
  const children = normalized.filter((child) => child.type !== "text" || child.text.length > 0)
  const merged = mergeAdjacentTextRuns(children)
  if (merged.length > 0) return merged
  const firstTextRun = normalized.find((child) => child.type === "text")
  return firstTextRun ? [{ ...firstTextRun, text: "" }] : [normalizeTextRun({ text: "" })]
}

// ─── Paragraph ────────────────────────────────────────────────────────────────

const ZERO_PT: UnitValue = { value: 0, unit: "pt" }

function normalizeParagraphBoxPadding(input: unknown): ParagraphBoxPadding | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  return {
    top: normalizeNonNegativeUnitValue(raw["top"], ZERO_PT),
    right: normalizeNonNegativeUnitValue(raw["right"], ZERO_PT),
    bottom: normalizeNonNegativeUnitValue(raw["bottom"], ZERO_PT),
    left: normalizeNonNegativeUnitValue(raw["left"], ZERO_PT),
  }
}

function normalizeParagraphBoxBorderSide(input: unknown): ParagraphBoxBorderSide | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const style = raw["style"]
  if (style !== "solid" && style !== "dashed" && style !== "dotted" && style !== "none") return undefined
  return {
    style,
    width: normalizeNonNegativeUnitValue(raw["width"], ZERO_PT),
    color: normalizeHexColor(raw["color"], "000000")!,
  }
}

function normalizeParagraphBoxBorder(input: unknown): ParagraphBoxBorder | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const border: ParagraphBoxBorder = {}
  const top = normalizeParagraphBoxBorderSide(raw["top"])
  const right = normalizeParagraphBoxBorderSide(raw["right"])
  const bottom = normalizeParagraphBoxBorderSide(raw["bottom"])
  const left = normalizeParagraphBoxBorderSide(raw["left"])
  if (top) border.top = top
  if (right) border.right = right
  if (bottom) border.bottom = bottom
  if (left) border.left = left
  return Object.keys(border).length > 0 ? border : undefined
}

function normalizeParagraphBoxStyle(input: unknown): ParagraphBoxStyle | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const box: ParagraphBoxStyle = {}
  const fill = normalizeHexColor(raw["fill"])
  const padding = raw["padding"] != null ? normalizeParagraphBoxPadding(raw["padding"]) : undefined
  const border = raw["border"] != null ? normalizeParagraphBoxBorder(raw["border"]) : undefined
  if (fill) box.fill = fill
  if (padding) box.padding = padding
  if (border) box.border = border
  return Object.keys(box).length > 0 ? box : undefined
}

function normalizeParagraphListProps(input: unknown, fallbackItemId: string): ParagraphListProps | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  const instanceId = raw["instanceId"]
  const itemId = raw["itemId"]
  const level = raw["level"]
  if (typeof instanceId !== "string" || instanceId.length === 0) return undefined
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > MAX_LIST_LEVEL) return undefined
  const startAt = raw["startAt"]
  return {
    instanceId,
    level,
    itemId: typeof itemId === "string" && itemId.length > 0 ? itemId : fallbackItemId,
    ...(typeof startAt === "number" && Number.isInteger(startAt) && startAt > 0 ? { startAt } : {}),
  }
}

function normalizeParagraphProps(input: unknown, paragraphId: string): ParagraphProps {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  const align = raw["align"]

  return {
    align: align === "left" || align === "center" || align === "right" || align === "justify"
      ? align
      : DEFAULT_PARAGRAPH_PROPS.align,
    fontSize: normalizePositiveUnitValue(raw["fontSize"], DEFAULT_PARAGRAPH_PROPS.fontSize),
    fontFamilyKey: typeof raw["fontFamilyKey"] === "string"
      ? normalizeFontFamilyKey(raw["fontFamilyKey"])
      : DEFAULT_PARAGRAPH_PROPS.fontFamilyKey,
    textColor: normalizeHexColor(raw["textColor"], DEFAULT_PARAGRAPH_PROPS.textColor),
    fontWeight: raw["fontWeight"] === "bold" ? "bold" : DEFAULT_PARAGRAPH_PROPS.fontWeight,
    fontStyle: raw["fontStyle"] === "italic" ? "italic" : DEFAULT_PARAGRAPH_PROPS.fontStyle,
    textDecoration: raw["textDecoration"] === "underline" ? "underline" : DEFAULT_PARAGRAPH_PROPS.textDecoration,
    strikethrough: typeof raw["strikethrough"] === "boolean" ? raw["strikethrough"] : DEFAULT_PARAGRAPH_PROPS.strikethrough,
    lineHeight: normalizePositiveNumber(raw["lineHeight"], DEFAULT_PARAGRAPH_PROPS.lineHeight),
    spacingBefore: normalizeUnitValue(raw["spacingBefore"], DEFAULT_PARAGRAPH_PROPS.spacingBefore),
    spacingAfter: normalizeUnitValue(raw["spacingAfter"], DEFAULT_PARAGRAPH_PROPS.spacingAfter),
    textIndent: normalizeUnitValue(raw["textIndent"], DEFAULT_PARAGRAPH_PROPS.textIndent),
    indentLeft: normalizeUnitValue(raw["indentLeft"], DEFAULT_PARAGRAPH_PROPS.indentLeft),
    indentRight: normalizeUnitValue(raw["indentRight"], DEFAULT_PARAGRAPH_PROPS.indentRight),
    headingLevel: raw["headingLevel"] === 1 || raw["headingLevel"] === 2 || raw["headingLevel"] === 3
      ? raw["headingLevel"]
      : undefined,
    keepWithNext: typeof raw["keepWithNext"] === "boolean" ? raw["keepWithNext"] : undefined,
    list: normalizeParagraphListProps(raw["list"], paragraphId),
    box: normalizeParagraphBoxStyle(raw["box"]),
  }
}

function normalizeParagraphNode(input: LayoutNode & { type: "paragraph" }): ParagraphNode {
  return {
    id: input.id,
    type: "paragraph",
    props: normalizeParagraphProps(input.props, input.id),
    children: normalizeInlineChildren(input.children),
  }
}

// ─── Spacer ───────────────────────────────────────────────────────────────────

function normalizeSpacerNode(input: LayoutNode & { type: "spacer" }): SpacerNode {
  return {
    id: input.id,
    type: "spacer",
    props: {
      height: normalizePositiveNumber(input.props?.height, DEFAULT_SPACER_HEIGHT),
    },
  }
}

// ─── Divider / Page Break ───────────────────────────────────────────────────

function normalizeDividerLineStyle(value: unknown): DividerNode["props"]["style"] {
  return value === "dashed" || value === "dotted" || value === "solid"
    ? value
    : DEFAULT_DIVIDER_PROPS.style
}

function normalizeDividerNode(input: LayoutNode & { type: "divider" }): DividerNode {
  const raw = (input.props ?? {}) as Record<string, unknown>
  return {
    id: input.id,
    type: "divider",
    props: {
      color: normalizeHexColor(raw["color"], DEFAULT_DIVIDER_PROPS.color)!,
      thickness: normalizeNonNegativeUnitValue(raw["thickness"], DEFAULT_DIVIDER_PROPS.thickness),
      marginBefore: normalizeNonNegativeUnitValue(raw["marginBefore"], DEFAULT_DIVIDER_PROPS.marginBefore),
      marginAfter: normalizeNonNegativeUnitValue(raw["marginAfter"], DEFAULT_DIVIDER_PROPS.marginAfter),
      style: normalizeDividerLineStyle(raw["style"]),
    },
  }
}

function normalizePageBreakNode(input: LayoutNode & { type: "page-break" }): PageBreakNode {
  return {
    id: input.id,
    type: "page-break",
    props: {},
  }
}

// ─── Stack ────────────────────────────────────────────────────────────────────

function normalizeWidthShare(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) return undefined
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeStackNode(input: LayoutNode & { type: "stack" }): StackNode {
  const props = (input.props ?? {}) as Record<string, unknown>
  return {
    id: input.id,
    type: "stack",
    props: {
      gap: props["gap"] != null ? normalizeNonNegativeNumber(props["gap"], 0) : undefined,
      padding: props["padding"] != null ? normalizeNonNegativeNumber(props["padding"], 0) : undefined,
      minHeight: props["minHeight"] != null
        ? normalizePositiveNumber(props["minHeight"], DEFAULT_STACK_MIN_HEIGHT)
        : undefined,
      alignX: props["alignX"] === "left" || props["alignX"] === "center" || props["alignX"] === "right"
        ? props["alignX"]
        : undefined,
      widthShare: normalizeWidthShare(props["widthShare"]),
    },
    childIds: Array.isArray(input.childIds) ? input.childIds.filter((id) => typeof id === "string" && id.length > 0) : [],
  }
}

// ─── Flow Stack ───────────────────────────────────────────────────────────────

function normalizeFlowStackNode(input: LayoutNode & { type: "flow-stack" }): FlowStackNode {
  const props = (input.props ?? {}) as Record<string, unknown>
  return {
    id: input.id,
    type: "flow-stack",
    props: {
      minHeight: props["minHeight"] != null
        ? normalizePositiveNumber(props["minHeight"], DEFAULT_STACK_MIN_HEIGHT)
        : undefined,
      widthShare: normalizeWidthShare(props["widthShare"]),
      box: normalizeParagraphBoxStyle(props["box"]),
    },
    childIds: Array.isArray(input.childIds) ? input.childIds.filter((id) => typeof id === "string" && id.length > 0) : [],
  }
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function normalizeBodyNode(input: LayoutNode & { type: "body" }): BodyNode {
  const props = (input.props ?? {}) as Record<string, unknown>
  return {
    id: input.id,
    type: "body",
    props: {
      gap: props["gap"] != null ? normalizeNonNegativeNumber(props["gap"], 0) : undefined,
      padding: props["padding"] != null ? normalizeNonNegativeNumber(props["padding"], 0) : undefined,
      minHeight: props["minHeight"] != null
        ? normalizePositiveNumber(props["minHeight"], 0)
        : undefined,
      alignX: props["alignX"] === "left" || props["alignX"] === "center" || props["alignX"] === "right"
        ? props["alignX"]
        : undefined,
    },
    childIds: Array.isArray(input.childIds) ? input.childIds.filter((id) => typeof id === "string" && id.length > 0) : [],
  }
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function normalizeRowWidthShares(nodes: Record<string, LayoutNode>, row: RowNode): Record<string, LayoutNode> {
  const stackChildren = row.childIds
    .map((id) => nodes[id])
    .filter((n): n is StackNode => n?.type === "stack")

  // ถ้า widthShare ครบและรวมได้ 100 ไม่ต้องแตะ
  const hasAllShares = stackChildren.every((s) => typeof s.props.widthShare === "number")
  if (hasAllShares) {
    const total = Number(
      stackChildren.reduce((sum, s) => sum + (s.props.widthShare ?? 0), 0).toFixed(2),
    )
    if (total === 100) return nodes
  }

  // fallback: equal distribution
  const shares = getEqualWidthShares(stackChildren.length)
  const updated = { ...nodes }
  stackChildren.forEach((stack, index) => {
    updated[stack.id] = {
      ...stack,
      props: { ...stack.props, widthShare: shares[index] },
    }
  })
  return updated
}

function normalizeRowNode(input: LayoutNode & { type: "row" }): RowNode {
  const props = (input.props ?? {}) as Record<string, unknown>
  const alignY = props["alignY"]
  return {
    id: input.id,
    type: "row",
    props: {
      gap: props["gap"] != null ? normalizeNonNegativeNumber(props["gap"], 0) : undefined,
      alignY: alignY === "top" || alignY === "middle" || alignY === "bottom" ? alignY : undefined,
      minHeight: props["minHeight"] != null
        ? normalizePositiveNumber(props["minHeight"], 0)
        : undefined,
    },
    childIds: Array.isArray(input.childIds) ? input.childIds.filter((id) => typeof id === "string" && id.length > 0) : [],
  }
}

// ─── Flow Row ─────────────────────────────────────────────────────────────────

function normalizeFlowRowWidthShares(nodes: Record<string, LayoutNode>, row: FlowRowNode): Record<string, LayoutNode> {
  const stackChildren = row.childIds
    .map((id) => nodes[id])
    .filter((n): n is FlowStackNode => n?.type === "flow-stack")

  const hasAllShares = stackChildren.every((s) => typeof s.props.widthShare === "number")
  if (hasAllShares) {
    const total = Number(
      stackChildren.reduce((sum, s) => sum + (s.props.widthShare ?? 0), 0).toFixed(2),
    )
    if (total === 100) return nodes
  }

  const shares = getEqualWidthShares(stackChildren.length)
  const updated = { ...nodes }
  stackChildren.forEach((stack, index) => {
    updated[stack.id] = {
      ...stack,
      props: { ...stack.props, widthShare: shares[index] },
    }
  })
  return updated
}

function normalizeFlowRowNode(input: LayoutNode & { type: "flow-row" }): FlowRowNode {
  const props = (input.props ?? {}) as Record<string, unknown>
  return {
    id: input.id,
    type: "flow-row",
    props: {
      gap: props["gap"] != null ? normalizeNonNegativeNumber(props["gap"], 0) : undefined,
      minHeight: props["minHeight"] != null
        ? normalizePositiveNumber(props["minHeight"], 0)
        : undefined,
    },
    childIds: Array.isArray(input.childIds) ? input.childIds.filter((id) => typeof id === "string" && id.length > 0) : [],
  }
}

// ─── Flow Table ───────────────────────────────────────────────────────────────

function normalizeFlowTableCellMergeMap(
  input: unknown,
  cellChildIds: string[],
  rowspan: number,
  colspan: number,
): FlowTableCellMergeMap | undefined {
  if (typeof input !== "object" || input == null) return undefined
  const raw = input as Record<string, unknown>
  if (raw["version"] !== 1 || !Array.isArray(raw["entries"])) return undefined

  const validCellChildIds = new Set(cellChildIds)
  const mappedChildIds = new Set<string>()
  const entries: FlowTableCellMergeMap["entries"] = []

  raw["entries"].forEach((item) => {
    if (typeof item !== "object" || item == null) return
    const entry = item as Record<string, unknown>
    const rowOffset = entry["rowOffset"]
    const colOffset = entry["colOffset"]
    if (!Number.isInteger(rowOffset) || typeof rowOffset !== "number" || rowOffset < 0 || rowOffset >= rowspan) return
    if (!Number.isInteger(colOffset) || typeof colOffset !== "number" || colOffset < 0 || colOffset >= colspan) return
    if (!Array.isArray(entry["childIds"])) return

    const childIds = entry["childIds"].filter((childId): childId is string => {
      if (typeof childId !== "string" || childId.length === 0) return false
      if (!validCellChildIds.has(childId)) return false
      if (mappedChildIds.has(childId)) return false
      mappedChildIds.add(childId)
      return true
    })
    if (childIds.length === 0) return
    entries.push({ rowOffset, colOffset, childIds })
  })

  return entries.length > 0 ? { version: 1, entries } : undefined
}

function normalizeFlowTableCellNode(input: FlowTableCellNode): FlowTableCellNode {
  const rawProps = (input.props ?? {}) as Record<string, unknown>
  const props: FlowTableCellNode["props"] = { ...input.props }
  const rowspan = typeof rawProps["rowspan"] === "number" && Number.isInteger(rawProps["rowspan"]) && rawProps["rowspan"] >= 1
    ? rawProps["rowspan"]
    : 1
  const colspan = typeof rawProps["colspan"] === "number" && Number.isInteger(rawProps["colspan"]) && rawProps["colspan"] >= 1
    ? rawProps["colspan"]
    : 1
  const mergeMap = normalizeFlowTableCellMergeMap(rawProps["mergeMap"], input.childIds, rowspan, colspan)
  if (mergeMap) props.mergeMap = mergeMap
  else delete props.mergeMap
  return { ...input, props }
}

function normalizeFlowTableNode(input: FlowTableNode): FlowTableNode {
  const nodes: FlowTableNode["nodes"] = {}
  Object.entries(input.nodes).forEach(([id, node]) => {
    if (node.type === "flow-table-cell") {
      nodes[id] = normalizeFlowTableCellNode(node)
      return
    }
    if (node.type === "paragraph") {
      nodes[id] = normalizeParagraphNode(node as LayoutNode & { type: "paragraph" })
      return
    }
    nodes[id] = node
  })
  const rawProps = (input.props ?? {}) as Record<string, unknown>
  const props: FlowTableNode["props"] = { ...input.props }
  if (typeof rawProps["repeatHeaderRows"] !== "boolean") delete props.repeatHeaderRows
  if (rawProps["align"] !== "left" && rawProps["align"] !== "center" && rawProps["align"] !== "right") delete props.align
  if (rawProps["marginTop"] != null) props.marginTop = normalizeNonNegativeUnitValue(rawProps["marginTop"], ZERO_PT)
  else delete props.marginTop
  if (rawProps["marginBottom"] != null) props.marginBottom = normalizeNonNegativeUnitValue(rawProps["marginBottom"], ZERO_PT)
  else delete props.marginBottom
  return { ...input, props, nodes }
}

// ─── Section ──────────────────────────────────────────────────────────────────

function normalizeNode(node: LayoutNode): LayoutNode {
  switch (node.type) {
    case "body": return normalizeBodyNode(node)
    case "stack": return normalizeStackNode(node)
    case "row": return normalizeRowNode(node)
    case "flow-stack": return normalizeFlowStackNode(node)
    case "flow-row": return normalizeFlowRowNode(node)
    case "paragraph": return normalizeParagraphNode(node)
    case "spacer": return normalizeSpacerNode(node)
    case "divider": return normalizeDividerNode(node)
    case "page-break": return normalizePageBreakNode(node)
    case "flow-table": return normalizeFlowTableNode(node as unknown as FlowTableNode) as unknown as LayoutNode
    case "toc": return node
  }
}

function normalizeSection(section: DocumentSection): DocumentSection {
  // Pass 1: normalize แต่ละ node
  let nodes: Record<string, LayoutNode> = {}
  Object.entries(section.nodes).forEach(([id, node]) => {
    nodes[id] = normalizeNode(node)
  })

  // Pass 2: fix widthShare สำหรับทุก row
  Object.values(nodes).forEach((node) => {
    if (node.type === "row") {
      nodes = normalizeRowWidthShares(nodes, node)
    } else if (node.type === "flow-row") {
      nodes = normalizeFlowRowWidthShares(nodes, node)
    }
  })

  return { ...section, nodes }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function normalizeDocument(doc: DocumentNode): DocumentNode {
  return {
    ...doc,
    document: {
      ...doc.document,
      sections: doc.document.sections.map(normalizeSection),
    },
  }
}
