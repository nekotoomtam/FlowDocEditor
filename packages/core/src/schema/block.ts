import { z } from "zod"
import { UnitValueSchema } from "./units"
import { InlineNodeSchema } from "./inline"
import { ParagraphListPropsSchema } from "./list"
import { BorderStyleSchema, FlowTableNodeSchema } from "./table"

// ─── Alignment ───────────────────────────────────────────────────────────────

export const AlignXSchema = z.enum(["left", "center", "right"])
export const AlignYSchema = z.enum(["top", "middle", "bottom"])
export const TextAlignSchema = z.enum(["left", "center", "right", "justify"])

// ─── Props ───────────────────────────────────────────────────────────────────

export const BodyPropsSchema = z.object({
  gap: z.number().nonnegative().optional(),
  padding: z.number().nonnegative().optional(),
  minHeight: z.number().positive().optional(),
  alignX: AlignXSchema.optional(),
})

export const StackPropsSchema = BodyPropsSchema.extend({
  // widthShare คือ % ของ parent row เช่น 50 = 50%
  // ต้องมีเมื่ออยู่ใน row — validate ตอน assertDocument
  widthShare: z.number().positive().max(100).optional(),
})

export const RowPropsSchema = z.object({
  gap: z.number().nonnegative().optional(),
  alignY: AlignYSchema.optional(),
  minHeight: z.number().positive().optional(),
})

export const FlowRowPropsSchema = z.object({
  gap: z.number().nonnegative().optional(),
  minHeight: z.number().positive().optional(),
})

const HexColorSchema = z.string().regex(/^[0-9A-Fa-f]{6}$/)
const NonNegativeUnitValueSchema = UnitValueSchema.refine((value) => value.value >= 0, {
  message: "Unit value must be non-negative",
})

export const ParagraphBoxPaddingSchema = z.object({
  top: NonNegativeUnitValueSchema,
  right: NonNegativeUnitValueSchema,
  bottom: NonNegativeUnitValueSchema,
  left: NonNegativeUnitValueSchema,
})

export const ParagraphBoxBorderSideSchema = z.object({
  style: BorderStyleSchema,
  width: NonNegativeUnitValueSchema,
  color: HexColorSchema.default("000000"),
})

export const ParagraphBoxBorderSchema = z.object({
  top: ParagraphBoxBorderSideSchema.optional(),
  right: ParagraphBoxBorderSideSchema.optional(),
  bottom: ParagraphBoxBorderSideSchema.optional(),
  left: ParagraphBoxBorderSideSchema.optional(),
})

export const ParagraphBoxStyleSchema = z.object({
  fill: HexColorSchema.optional(),
  padding: ParagraphBoxPaddingSchema.optional(),
  border: ParagraphBoxBorderSchema.optional(),
})

export const FlowStackPropsSchema = z.object({
  // widthShare คือ % ของ parent flow-row เช่น 50 = 50%
  // ต้องมีเมื่ออยู่ใน flow-row — validate ตอน assertDocument
  widthShare: z.number().positive().max(100).optional(),
  minHeight: z.number().positive().optional(),
  box: ParagraphBoxStyleSchema.optional(),
})

export const ParagraphPropsSchema = z.object({
  align: TextAlignSchema,
  fontSize: UnitValueSchema,
  fontFamilyKey: z.string().optional(),
  textColor: HexColorSchema.optional(),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]).optional(),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]).optional(),
  textDecoration: z.union([z.literal("none"), z.literal("underline")]).optional(),
  strikethrough: z.boolean().optional(),
  lineHeight: z.number().positive(),
  spacingBefore: UnitValueSchema,
  spacingAfter: UnitValueSchema,
  textIndent: UnitValueSchema,
  indentLeft: UnitValueSchema,
  indentRight: UnitValueSchema,
  headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  keepWithNext: z.boolean().optional(),  // keep this paragraph on the same page as the next sibling
  list: ParagraphListPropsSchema.optional(),
  box: ParagraphBoxStyleSchema.optional(),
})

export const SpacerPropsSchema = z.object({
  // height เป็น abstract unit ตาม UnitValue
  // Renderer แปลงเองตอน output
  height: z.number().positive(),
})

export const DividerLineStyleSchema = z.enum(["solid", "dashed", "dotted"])

export const DividerPropsSchema = z.object({
  color: HexColorSchema.default("CBD5E1"),
  thickness: NonNegativeUnitValueSchema.default({ value: 1, unit: "pt" }),
  marginBefore: NonNegativeUnitValueSchema.default({ value: 6, unit: "pt" }),
  marginAfter: NonNegativeUnitValueSchema.default({ value: 6, unit: "pt" }),
  style: DividerLineStyleSchema.default("solid"),
})

export const PageBreakPropsSchema = z.object({})

// ─── Nodes ───────────────────────────────────────────────────────────────────

export const BodyNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("body"),
  props: BodyPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const StackNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("stack"),
  props: StackPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const RowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("row"),
  props: RowPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const FlowStackNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-stack"),
  props: FlowStackPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const FlowRowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-row"),
  props: FlowRowPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const ParagraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("paragraph"),
  props: ParagraphPropsSchema,
  children: z.array(InlineNodeSchema),
})

export const SpacerNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("spacer"),
  props: SpacerPropsSchema,
})

export const DividerNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("divider"),
  props: DividerPropsSchema,
})

export const PageBreakNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("page-break"),
  props: PageBreakPropsSchema,
})

export const TocPropsSchema = z.object({
  title: z.string().optional(),
  maxLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
})

export const TocNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("toc"),
  props: TocPropsSchema,
})

// ─── Union ───────────────────────────────────────────────────────────────────

export const LayoutNodeSchema = z.discriminatedUnion("type", [
  BodyNodeSchema,
  StackNodeSchema,
  RowNodeSchema,
  FlowStackNodeSchema,
  FlowRowNodeSchema,
  ParagraphNodeSchema,
  SpacerNodeSchema,
  DividerNodeSchema,
  PageBreakNodeSchema,
  FlowTableNodeSchema,
  TocNodeSchema,
])

export type BodyProps = z.infer<typeof BodyPropsSchema>
export type StackProps = z.infer<typeof StackPropsSchema>
export type RowProps = z.infer<typeof RowPropsSchema>
export type FlowStackProps = z.infer<typeof FlowStackPropsSchema>
export type FlowRowProps = z.infer<typeof FlowRowPropsSchema>
export type ParagraphProps = z.infer<typeof ParagraphPropsSchema>
export type ParagraphBoxPadding = z.infer<typeof ParagraphBoxPaddingSchema>
export type ParagraphBoxBorderSide = z.infer<typeof ParagraphBoxBorderSideSchema>
export type ParagraphBoxBorder = z.infer<typeof ParagraphBoxBorderSchema>
export type ParagraphBoxStyle = z.infer<typeof ParagraphBoxStyleSchema>
export type SpacerProps = z.infer<typeof SpacerPropsSchema>
export type DividerLineStyle = z.infer<typeof DividerLineStyleSchema>
export type DividerProps = z.infer<typeof DividerPropsSchema>
export type PageBreakProps = z.infer<typeof PageBreakPropsSchema>

export type BodyNode = z.infer<typeof BodyNodeSchema>
export type StackNode = z.infer<typeof StackNodeSchema>
export type RowNode = z.infer<typeof RowNodeSchema>
export type FlowStackNode = z.infer<typeof FlowStackNodeSchema>
export type FlowRowNode = z.infer<typeof FlowRowNodeSchema>
export type ParagraphNode = z.infer<typeof ParagraphNodeSchema>
export type SpacerNode = z.infer<typeof SpacerNodeSchema>
export type DividerNode = z.infer<typeof DividerNodeSchema>
export type PageBreakNode = z.infer<typeof PageBreakNodeSchema>
export type TocProps = z.infer<typeof TocPropsSchema>
export type TocNode = z.infer<typeof TocNodeSchema>
export type LayoutNode = z.infer<typeof LayoutNodeSchema>
