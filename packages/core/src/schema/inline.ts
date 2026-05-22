import { z } from "zod"
import { UnitValueSchema } from "./units"

const HexColorSchema = z.string().regex(/^[0-9A-Fa-f]{6}$/)
const PositiveUnitValueSchema = UnitValueSchema.refine((value) => value.value > 0, {
  message: "Unit value must be positive",
})

export const TextRunStyleSchema = z.object({
  fontSize: PositiveUnitValueSchema.optional(),
  fontFamilyKey: z.string().min(1).optional(),
  textColor: HexColorSchema.optional(),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]).optional(),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]).optional(),
  textDecoration: z.union([z.literal("none"), z.literal("underline")]).optional(),
  strikethrough: z.boolean().optional(),
})

export type TextRunStyle = z.infer<typeof TextRunStyleSchema>

// TextRun — plain text ใน paragraph
export const TextRunSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  text: z.string(),
  style: TextRunStyleSchema.optional(),
})

export type TextRun = z.infer<typeof TextRunSchema>

// FieldRefInline — binding point สำหรับ scalar field
// ไม่เก็บ value จริง แค่เก็บ reference ไปยัง field registry
export const FieldRefInlineSchema = z.object({
  id: z.string().min(1),
  type: z.literal("fieldRef"),
  key: z.string().min(1),        // path ใน field registry เช่น "customer.name"
  label: z.string().optional(),   // แสดงใน editor
  fallback: z.string().optional(), // ถ้า field ไม่มีค่า
})

export type FieldRefInline = z.infer<typeof FieldRefInlineSchema>

// PageNumberInline — resolved to the current page number at pagination time.
// Layout uses "00" as a two-digit placeholder for width measurement; the
// actual number is substituted by the paginator after the page is known.
export const PageNumberInlineSchema = z.object({
  id: z.string().min(1),
  type: z.literal("pageNumber"),
})

export type PageNumberInline = z.infer<typeof PageNumberInlineSchema>

export const InlineNodeSchema = z.discriminatedUnion("type", [
  TextRunSchema,
  FieldRefInlineSchema,
  PageNumberInlineSchema,
])

export type InlineNode = z.infer<typeof InlineNodeSchema>
