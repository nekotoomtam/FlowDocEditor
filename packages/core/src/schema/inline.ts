import { z } from "zod"

// TextRun — plain text ใน paragraph
export const TextRunSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  text: z.string(),
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

export const InlineNodeSchema = z.discriminatedUnion("type", [
  TextRunSchema,
  FieldRefInlineSchema,
])

export type InlineNode = z.infer<typeof InlineNodeSchema>
