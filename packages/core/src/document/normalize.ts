import type {
  BodyNode,
  DocumentNode,
  DocumentSection,
  FieldRefInline,
  FlowRowNode,
  FlowStackNode,
  InlineNode,
  LayoutNode,
  ParagraphBoxBorder,
  ParagraphBoxBorderSide,
  ParagraphBoxPadding,
  ParagraphBoxStyle,
  ParagraphNode,
  ParagraphProps,
  RowNode,
  SpacerNode,
  StackNode,
  TextRun,
  UnitValue,
} from "../schema"
import {
  DEFAULT_PARAGRAPH_PROPS,
  DEFAULT_SPACER_HEIGHT,
  DEFAULT_STACK_MIN_HEIGHT,
  createId,
  getEqualWidthShares,
} from "./defaults"

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

// ─── Inline Nodes ─────────────────────────────────────────────────────────────

function normalizeTextRun(input: unknown): TextRun {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  return {
    id: typeof raw["id"] === "string" && raw["id"].length > 0 ? raw["id"] : createId("text"),
    type: "text",
    text: normalizeString(raw["text"], ""),
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

function normalizeInlineNode(input: unknown): InlineNode {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  if (raw["type"] === "fieldRef") return normalizeFieldRef(input)
  return normalizeTextRun(input)
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

function normalizeParagraphProps(input: unknown): ParagraphProps {
  const raw = (typeof input === "object" && input != null ? input : {}) as Record<string, unknown>
  const align = raw["align"]

  return {
    align: align === "left" || align === "center" || align === "right" || align === "justify"
      ? align
      : DEFAULT_PARAGRAPH_PROPS.align,
    fontSize: normalizePositiveUnitValue(raw["fontSize"], DEFAULT_PARAGRAPH_PROPS.fontSize),
    fontFamilyKey: typeof raw["fontFamilyKey"] === "string" ? raw["fontFamilyKey"] : DEFAULT_PARAGRAPH_PROPS.fontFamilyKey,
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
    box: normalizeParagraphBoxStyle(raw["box"]),
  }
}

function normalizeParagraphNode(input: LayoutNode & { type: "paragraph" }): ParagraphNode {
  return {
    id: input.id,
    type: "paragraph",
    props: normalizeParagraphProps(input.props),
    children: Array.isArray(input.children)
      ? input.children.map(normalizeInlineNode)
      : [],
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
    case "table": return node
    case "flow-table": return node
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
