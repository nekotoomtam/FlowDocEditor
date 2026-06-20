import { z } from "zod"
import { UnitValueSchema } from "./units"
import { ParagraphBoxStyleSchema, ParagraphStylePropertiesSchema } from "./block"
import { DocumentStyleDefinitionsSchema } from "./styles"
import { ListInstanceSchema, ListStyleDefinitionSchema, ParagraphListPropsSchema } from "./list"
import {
  FlowTableCellPropsSchema,
  FlowTablePropsSchema,
  FlowTableRowPropsSchema,
  TableColumnDefSchema,
} from "./table"

const HexColorSchema = z.string().regex(/^[0-9A-Fa-f]{6}$/)
const PositiveUnitValueSchema = UnitValueSchema.refine((value) => value.value > 0, {
  message: "Unit value must be positive",
})
const NonNegativeUnitValueSchema = UnitValueSchema.refine((value) => value.value >= 0, {
  message: "Unit value must be non-negative",
})

export const DocumentVNextVersionSchema = z.literal(3)

export const TextRunStyleVNextSchema = z.object({
  fontSize: PositiveUnitValueSchema.optional(),
  fontFamilyKey: z.string().min(1).optional(),
  textColor: HexColorSchema.optional(),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]).optional(),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]).optional(),
  textDecoration: z.union([z.literal("none"), z.literal("underline")]).optional(),
  strikethrough: z.boolean().optional(),
})

export const TextInlineVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  text: z.string(),
  style: TextRunStyleVNextSchema.optional(),
})

export const FieldRefInlineVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("field-ref"),
  key: z.string().min(1),
  label: z.string().optional(),
  fallback: z.string().optional(),
})

export const PageNumberInlineVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("page-number"),
})

export const LineBreakInlineVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("line-break"),
})

export const InlineNodeVNextSchema = z.discriminatedUnion("type", [
  TextInlineVNextSchema,
  FieldRefInlineVNextSchema,
  PageNumberInlineVNextSchema,
  LineBreakInlineVNextSchema,
])

export const TextBlockRoleVNextSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("paragraph") }),
  z.object({
    role: z.literal("heading"),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
  }),
  z.object({
    role: z.literal("list-item"),
    list: ParagraphListPropsSchema,
  }),
  z.object({ role: z.literal("caption") }),
  z.object({ role: z.literal("note") }),
  z.object({ role: z.literal("label") }),
])

export const TextBlockPropsVNextSchema = z.object({
  textStyleId: z.string().min(1).optional(),
  styleOverrides: ParagraphStylePropertiesSchema.optional(),
  box: ParagraphBoxStyleSchema.optional(),
})

export const TextBlockNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text-block"),
  role: TextBlockRoleVNextSchema,
  props: TextBlockPropsVNextSchema.default({}),
  children: z.array(InlineNodeVNextSchema),
})

export const ColumnsPropsVNextSchema = z.object({
  gap: z.number().nonnegative().optional(),
  minHeight: z.number().positive().optional(),
  alignY: z.enum(["top", "middle", "bottom"]).optional(),
})

export const ColumnsNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("columns"),
  props: ColumnsPropsVNextSchema.default({}),
  columnIds: z.array(z.string().min(1)).min(1),
})

export const ColumnPropsVNextSchema = z.object({
  widthShare: z.number().positive().max(100).optional(),
  minHeight: z.number().positive().optional(),
  box: ParagraphBoxStyleSchema.optional(),
})

export const ColumnNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("column"),
  props: ColumnPropsVNextSchema.default({}),
  childIds: z.array(z.string().min(1)),
})

export const TablePropsVNextSchema = FlowTablePropsSchema
export const TableColumnDefVNextSchema = TableColumnDefSchema
export const TableRowPropsVNextSchema = FlowTableRowPropsSchema
export const TableCellPropsVNextSchema = FlowTableCellPropsSchema

export const TableNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table"),
  props: TablePropsVNextSchema.default({}),
  columns: z.array(TableColumnDefVNextSchema).min(1),
  rowIds: z.array(z.string().min(1)).min(1),
})

export const TableRowNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-row"),
  props: TableRowPropsVNextSchema.default({}),
  cellIds: z.array(z.string().min(1)).min(1),
})

export const TableCellNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-cell"),
  props: TableCellPropsVNextSchema.default({}),
  childIds: z.array(z.string().min(1)),
})

export const TocNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("toc"),
  props: z.object({
    title: z.string().optional(),
    maxLevel: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]).optional(),
  }).default({}),
})

export const PageBreakNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("page-break"),
  props: z.object({}).default({}),
})

export const DividerNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("divider"),
  props: z.object({
    color: HexColorSchema.default("CBD5E1"),
    thickness: NonNegativeUnitValueSchema.default({ value: 1, unit: "pt" }),
    marginBefore: NonNegativeUnitValueSchema.default({ value: 6, unit: "pt" }),
    marginAfter: NonNegativeUnitValueSchema.default({ value: 6, unit: "pt" }),
    style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
  }).default({
    color: "CBD5E1",
    thickness: { value: 1, unit: "pt" },
    marginBefore: { value: 6, unit: "pt" },
    marginAfter: { value: 6, unit: "pt" },
    style: "solid",
  }),
})

export const SpacerNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("spacer"),
  props: z.object({
    height: z.number().positive(),
  }),
})

export const ZoneRoleVNextSchema = z.enum([
  "body",
  "header",
  "footer",
  "first-page-header",
  "first-page-footer",
])

export const ZoneNodeVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("zone"),
  role: ZoneRoleVNextSchema,
  childIds: z.array(z.string().min(1)),
})

export const AuthoredNodeVNextSchema = z.discriminatedUnion("type", [
  ZoneNodeVNextSchema,
  TextBlockNodeVNextSchema,
  ColumnsNodeVNextSchema,
  ColumnNodeVNextSchema,
  TableNodeVNextSchema,
  TableRowNodeVNextSchema,
  TableCellNodeVNextSchema,
  TocNodeVNextSchema,
  PageBreakNodeVNextSchema,
  DividerNodeVNextSchema,
  SpacerNodeVNextSchema,
])

export const PageMarginVNextSchema = z.object({
  top: UnitValueSchema,
  right: UnitValueSchema,
  bottom: UnitValueSchema,
  left: UnitValueSchema,
})

export const PageSettingsVNextSchema = z.object({
  size: z.literal("A4"),
  orientation: z.enum(["portrait", "landscape"]),
  margin: PageMarginVNextSchema,
  headerReserved: z.number().nonnegative().optional(),
  footerReserved: z.number().nonnegative().optional(),
  headerFooterHorizontalMode: z.enum(["body", "full"]).optional(),
  pageNumberStart: z.number().positive().int().optional(),
})

export const DocumentSectionVNextSchema = z.object({
  id: z.string().min(1),
  type: z.literal("section"),
  page: PageSettingsVNextSchema,
  zoneIds: z.array(z.string().min(1)).min(1),
  nodes: z.record(z.string().min(1), AuthoredNodeVNextSchema),
})

export const DocumentMetaVNextSchema = z.object({
  title: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const DocumentNodeVNextSchema = z.object({
  version: DocumentVNextVersionSchema,
  document: z.object({
    id: z.string().min(1),
    meta: DocumentMetaVNextSchema.optional(),
    styles: DocumentStyleDefinitionsSchema.optional(),
    listStyles: z.record(z.string().min(1), ListStyleDefinitionSchema).optional(),
    listInstances: z.record(z.string().min(1), ListInstanceSchema).optional(),
    sections: z.array(DocumentSectionVNextSchema).min(1),
  }),
})

export type TextRunStyleVNext = z.infer<typeof TextRunStyleVNextSchema>
export type TextInlineVNext = z.infer<typeof TextInlineVNextSchema>
export type FieldRefInlineVNext = z.infer<typeof FieldRefInlineVNextSchema>
export type PageNumberInlineVNext = z.infer<typeof PageNumberInlineVNextSchema>
export type LineBreakInlineVNext = z.infer<typeof LineBreakInlineVNextSchema>
export type InlineNodeVNext = z.infer<typeof InlineNodeVNextSchema>
export type TextBlockRoleVNext = z.infer<typeof TextBlockRoleVNextSchema>
export type TextBlockNodeVNext = z.infer<typeof TextBlockNodeVNextSchema>
export type ColumnsNodeVNext = z.infer<typeof ColumnsNodeVNextSchema>
export type ColumnNodeVNext = z.infer<typeof ColumnNodeVNextSchema>
export type TableNodeVNext = z.infer<typeof TableNodeVNextSchema>
export type TableRowNodeVNext = z.infer<typeof TableRowNodeVNextSchema>
export type TableCellNodeVNext = z.infer<typeof TableCellNodeVNextSchema>
export type TocNodeVNext = z.infer<typeof TocNodeVNextSchema>
export type PageBreakNodeVNext = z.infer<typeof PageBreakNodeVNextSchema>
export type DividerNodeVNext = z.infer<typeof DividerNodeVNextSchema>
export type SpacerNodeVNext = z.infer<typeof SpacerNodeVNextSchema>
export type ZoneRoleVNext = z.infer<typeof ZoneRoleVNextSchema>
export type ZoneNodeVNext = z.infer<typeof ZoneNodeVNextSchema>
export type AuthoredNodeVNext = z.infer<typeof AuthoredNodeVNextSchema>
export type PageMarginVNext = z.infer<typeof PageMarginVNextSchema>
export type PageSettingsVNext = z.infer<typeof PageSettingsVNextSchema>
export type DocumentSectionVNext = z.infer<typeof DocumentSectionVNextSchema>
export type DocumentMetaVNext = z.infer<typeof DocumentMetaVNextSchema>
export type DocumentNodeVNext = z.infer<typeof DocumentNodeVNextSchema>
