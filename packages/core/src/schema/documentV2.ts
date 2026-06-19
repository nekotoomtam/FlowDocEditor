import { z } from "zod"
import { UnitValueSchema } from "./units"
import {
  BodyNodeSchema,
  DividerNodeSchema,
  FlowRowNodeSchema,
  FlowStackNodeSchema,
  PageBreakNodeSchema,
  ParagraphNodeSchema,
  SpacerNodeSchema,
  TocNodeSchema,
} from "./block"
import { ListInstanceSchema, ListStyleDefinitionSchema } from "./list"
import { DocumentStyleDefinitionsSchema } from "./styles"
import {
  FlowTableCellNodeSchema,
  FlowTablePropsSchema,
  FlowTableRowNodeSchema,
  TableColumnDefSchema,
} from "./table"

export const PageMarginV2Schema = z.object({
  top: UnitValueSchema,
  right: UnitValueSchema,
  bottom: UnitValueSchema,
  left: UnitValueSchema,
})

export const PageSettingsV2Schema = z.object({
  size: z.literal("A4"),
  orientation: z.enum(["portrait", "landscape"]),
  margin: PageMarginV2Schema,
  headerReserved: z.number().nonnegative().optional(),
  footerReserved: z.number().nonnegative().optional(),
  headerFooterHorizontalMode: z.enum(["body", "full"]).optional(),
  pageNumberStart: z.number().positive().int().optional(),
})

export const FlowTableNodeV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-table"),
  props: FlowTablePropsSchema,
  columns: z.array(TableColumnDefSchema).min(1),
  rowIds: z.array(z.string().min(1)).min(1),
})

export const LayoutNodeV2Schema = z.discriminatedUnion("type", [
  BodyNodeSchema,
  FlowStackNodeSchema,
  FlowRowNodeSchema,
  ParagraphNodeSchema,
  SpacerNodeSchema,
  DividerNodeSchema,
  PageBreakNodeSchema,
  FlowTableNodeV2Schema,
  FlowTableRowNodeSchema,
  FlowTableCellNodeSchema,
  TocNodeSchema,
])

export const SectionRootsV2Schema = z.object({
  body: z.string().min(1),
  header: z.string().min(1).optional(),
  headerFirstPage: z.string().min(1).optional(),
  footer: z.string().min(1).optional(),
  footerFirstPage: z.string().min(1).optional(),
})

export const DocumentSectionV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal("section"),
  page: PageSettingsV2Schema,
  roots: SectionRootsV2Schema,
  nodes: z.record(z.string().min(1), LayoutNodeV2Schema),
})

export const DocumentMetaV2Schema = z.object({
  title: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const DocumentNodeV2Schema = z.object({
  version: z.literal(2),
  document: z.object({
    id: z.string().min(1),
    meta: DocumentMetaV2Schema.optional(),
    styles: DocumentStyleDefinitionsSchema.optional(),
    listStyles: z.record(z.string().min(1), ListStyleDefinitionSchema).optional(),
    listInstances: z.record(z.string().min(1), ListInstanceSchema).optional(),
    sections: z.array(DocumentSectionV2Schema).min(1),
  }),
})

export type PageMarginV2 = z.infer<typeof PageMarginV2Schema>
export type PageSettingsV2 = z.infer<typeof PageSettingsV2Schema>
export type FlowTableNodeV2 = z.infer<typeof FlowTableNodeV2Schema>
export type LayoutNodeV2 = z.infer<typeof LayoutNodeV2Schema>
export type SectionRootsV2 = z.infer<typeof SectionRootsV2Schema>
export type DocumentSectionV2 = z.infer<typeof DocumentSectionV2Schema>
export type DocumentMetaV2 = z.infer<typeof DocumentMetaV2Schema>
export type DocumentNodeV2 = z.infer<typeof DocumentNodeV2Schema>
