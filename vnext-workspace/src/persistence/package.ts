import { z } from "zod"
import { DocumentNodeSchema } from "../schema/document.js"

const FieldValueTypeSchema = z.enum(["text", "number", "date", "boolean", "enum", "image", "collection"])

export const FieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: FieldValueTypeSchema,
  fallback: z.string().optional(),
})

export const FieldRegistrySchema = z.object({
  version: z.literal(1),
  fields: z.record(z.string().min(1), FieldDefinitionSchema),
})

export const DataSnapshotSchema = z.object({
  version: z.literal(1),
  values: z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export const FlowDocPackageV2DocumentVNextSchema = z.object({
  packageVersion: z.literal(2),
  kind: z.literal("document"),
  id: z.string().min(1),
  meta: z.object({
    title: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
  document: DocumentNodeSchema,
  fields: FieldRegistrySchema,
  data: DataSnapshotSchema.optional(),
}).superRefine((pack, ctx) => {
  if (pack.id !== pack.document.document.id) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message: "package id must equal document id",
    })
  }
})

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type FieldRegistry = z.infer<typeof FieldRegistrySchema>
export type DataSnapshot = z.infer<typeof DataSnapshotSchema>
export type FlowDocPackageV2DocumentVNext = z.infer<typeof FlowDocPackageV2DocumentVNextSchema>

export function parseFlowDocPackageV2DocumentVNext(value: unknown): FlowDocPackageV2DocumentVNext {
  return FlowDocPackageV2DocumentVNextSchema.parse(value)
}
