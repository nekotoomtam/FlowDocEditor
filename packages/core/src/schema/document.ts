import { z } from "zod"
import { UnitValueSchema } from "./units"
import { LayoutNodeSchema } from "./block"

// ─── Page Settings ────────────────────────────────────────────────────────────

export const PageMarginSchema = z.object({
  top: UnitValueSchema,
  right: UnitValueSchema,
  bottom: UnitValueSchema,
  left: UnitValueSchema,
})

export const PageSettingsSchema = z.object({
  size: z.literal("A4"),  // เพิ่ม size อื่นได้ทีหลัง
  orientation: z.enum(["portrait", "landscape"]),
  margin: PageMarginSchema,
  headerReserved: z.number().nonnegative().optional(),
  footerReserved: z.number().nonnegative().optional(),
  pageNumberStart: z.number().positive().int().optional(),  // restart page numbering at this number; undefined = continue from previous section
})

// ─── Section ─────────────────────────────────────────────────────────────────

// nodes เป็น flat map ของทุก node ใน section
// ไม่เก็บ x/y — layout engine คำนวณเอง
export const DocumentSectionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("section"),
  page: PageSettingsSchema,
  headerRootId: z.string().min(1).nullable().optional(),
  headerFirstPageRootId: z.string().min(1).nullable().optional(),
  bodyRootId: z.string().min(1),
  footerRootId: z.string().min(1).nullable().optional(),
  footerFirstPageRootId: z.string().min(1).nullable().optional(),
  nodes: z.record(z.string().min(1), LayoutNodeSchema),
})

// ─── Document ─────────────────────────────────────────────────────────────────

export const DocumentMetaSchema = z.object({
  title: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const DocumentNodeSchema = z.object({
  version: z.literal(1),
  document: z.object({
    id: z.string().min(1),
    meta: DocumentMetaSchema.optional(),
    sections: z.array(DocumentSectionSchema).min(1),
  }),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageMargin = z.infer<typeof PageMarginSchema>
export type PageSettings = z.infer<typeof PageSettingsSchema>
export type DocumentSection = z.infer<typeof DocumentSectionSchema>
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>
export type DocumentNode = z.infer<typeof DocumentNodeSchema>
