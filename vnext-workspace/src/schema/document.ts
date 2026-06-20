import { z } from "zod"

const HexColorSchema = z.string().regex(/^[0-9A-Fa-f]{6}$/)

export const UnitValueSchema = z.object({
  value: z.number(),
  unit: z.enum(["pt", "mm"]),
})

const PositiveUnitValueSchema = UnitValueSchema.refine((value) => value.value > 0, {
  message: "Unit value must be positive",
})

const NonNegativeUnitValueSchema = UnitValueSchema.refine((value) => value.value >= 0, {
  message: "Unit value must be non-negative",
})

export const DocumentVNextVersionSchema = z.literal(3)

export const TextRunStyleSchema = z.object({
  fontSize: PositiveUnitValueSchema.optional(),
  fontFamilyKey: z.string().min(1).optional(),
  textColor: HexColorSchema.optional(),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]).optional(),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]).optional(),
  textDecoration: z.union([z.literal("none"), z.literal("underline")]).optional(),
  strikethrough: z.boolean().optional(),
})

export const InlineNodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("text"),
    text: z.string(),
    style: TextRunStyleSchema.optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("field-ref"),
    key: z.string().min(1),
    label: z.string().optional(),
    fallback: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("page-number"),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("line-break"),
  }),
])

export const ListItemRoleMetadataSchema = z.object({
  instanceId: z.string().min(1),
  level: z.number().int().min(0).max(7),
  itemId: z.string().min(1),
  startAt: z.number().int().positive().optional(),
})

export const TextBlockRoleSchema = z.discriminatedUnion("role", [
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
    list: ListItemRoleMetadataSchema,
  }),
  z.object({ role: z.literal("caption") }),
  z.object({ role: z.literal("note") }),
  z.object({ role: z.literal("label") }),
])

export const BoxPaddingSchema = z.object({
  top: NonNegativeUnitValueSchema,
  right: NonNegativeUnitValueSchema,
  bottom: NonNegativeUnitValueSchema,
  left: NonNegativeUnitValueSchema,
})

export const BoxBorderSideSchema = z.object({
  style: z.enum(["solid", "dashed", "dotted", "none"]),
  width: NonNegativeUnitValueSchema,
  color: HexColorSchema.default("000000"),
})

export const BoxStyleSchema = z.object({
  fill: HexColorSchema.optional(),
  padding: BoxPaddingSchema.optional(),
  border: z.object({
    top: BoxBorderSideSchema.optional(),
    right: BoxBorderSideSchema.optional(),
    bottom: BoxBorderSideSchema.optional(),
    left: BoxBorderSideSchema.optional(),
  }).optional(),
})

export const TextBlockPropsSchema = z.object({
  textStyleId: z.string().min(1).optional(),
  box: BoxStyleSchema.optional(),
})

export const TextBlockNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text-block"),
  role: TextBlockRoleSchema,
  props: TextBlockPropsSchema.default({}),
  children: z.array(InlineNodeSchema),
})

export const ColumnsNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("columns"),
  props: z.object({
    gap: z.number().nonnegative().optional(),
    minHeight: z.number().positive().optional(),
    alignY: z.enum(["top", "middle", "bottom"]).optional(),
  }).default({}),
  columnIds: z.array(z.string().min(1)).min(1),
})

export const ColumnNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("column"),
  props: z.object({
    widthShare: z.number().positive().max(100).optional(),
    minHeight: z.number().positive().optional(),
    box: BoxStyleSchema.optional(),
  }).default({}),
  childIds: z.array(z.string().min(1)),
})

export const TableColumnSchema = z.object({
  width: UnitValueSchema,
})

export const TableNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table"),
  props: z.object({
    headerRowCount: z.number().int().nonnegative().optional(),
    repeatHeaderRows: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    marginTop: NonNegativeUnitValueSchema.optional(),
    marginBottom: NonNegativeUnitValueSchema.optional(),
  }).default({}),
  columns: z.array(TableColumnSchema).min(1),
  rowIds: z.array(z.string().min(1)).min(1),
})

export const TableRowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-row"),
  props: z.object({
    height: UnitValueSchema.optional(),
    allowBreak: z.boolean().optional(),
  }).default({}),
  cellIds: z.array(z.string().min(1)).min(1),
})

export const TableCellNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-cell"),
  props: z.object({
    colspan: z.number().int().min(1).optional(),
    rowspan: z.number().int().min(1).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    box: BoxStyleSchema.optional(),
  }).default({}),
  childIds: z.array(z.string().min(1)),
})

export const TocNodeSchema = z.object({
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

export const PageBreakNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("page-break"),
  props: z.object({}).default({}),
})

export const DividerNodeSchema = z.object({
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

export const SpacerNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("spacer"),
  props: z.object({
    height: z.number().positive(),
  }),
})

export const ZoneRoleSchema = z.enum([
  "body",
  "header",
  "footer",
  "first-page-header",
  "first-page-footer",
])

export const ZoneNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("zone"),
  role: ZoneRoleSchema,
  childIds: z.array(z.string().min(1)),
})

export const AuthoredNodeSchema = z.discriminatedUnion("type", [
  ZoneNodeSchema,
  TextBlockNodeSchema,
  ColumnsNodeSchema,
  ColumnNodeSchema,
  TableNodeSchema,
  TableRowNodeSchema,
  TableCellNodeSchema,
  TocNodeSchema,
  PageBreakNodeSchema,
  DividerNodeSchema,
  SpacerNodeSchema,
])

export const PageSettingsSchema = z.object({
  size: z.literal("A4"),
  orientation: z.enum(["portrait", "landscape"]),
  margin: z.object({
    top: UnitValueSchema,
    right: UnitValueSchema,
    bottom: UnitValueSchema,
    left: UnitValueSchema,
  }),
  headerReserved: z.number().nonnegative().optional(),
  footerReserved: z.number().nonnegative().optional(),
  headerFooterHorizontalMode: z.enum(["body", "full"]).optional(),
  pageNumberStart: z.number().positive().int().optional(),
})

export const DocumentSectionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("section"),
  page: PageSettingsSchema,
  zoneIds: z.array(z.string().min(1)).min(1),
  nodes: z.record(z.string().min(1), AuthoredNodeSchema),
})

export const DocumentNodeSchema = z.object({
  version: DocumentVNextVersionSchema,
  document: z.object({
    id: z.string().min(1),
    meta: z.object({
      title: z.string(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
    }).optional(),
    sections: z.array(DocumentSectionSchema).min(1),
  }),
})

export type UnitValue = z.infer<typeof UnitValueSchema>
export type InlineNode = z.infer<typeof InlineNodeSchema>
export type TextBlockRole = z.infer<typeof TextBlockRoleSchema>
export type TextBlockNode = z.infer<typeof TextBlockNodeSchema>
export type ColumnsNode = z.infer<typeof ColumnsNodeSchema>
export type ColumnNode = z.infer<typeof ColumnNodeSchema>
export type TableNode = z.infer<typeof TableNodeSchema>
export type TableRowNode = z.infer<typeof TableRowNodeSchema>
export type TableCellNode = z.infer<typeof TableCellNodeSchema>
export type ZoneNode = z.infer<typeof ZoneNodeSchema>
export type ZoneRole = z.infer<typeof ZoneRoleSchema>
export type AuthoredNode = z.infer<typeof AuthoredNodeSchema>
export type DocumentSection = z.infer<typeof DocumentSectionSchema>
export type DocumentNode = z.infer<typeof DocumentNodeSchema>
