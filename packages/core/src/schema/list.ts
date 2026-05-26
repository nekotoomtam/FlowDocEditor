import { z } from "zod"
import { UnitValueSchema, type UnitValue } from "./units"

export const MAX_LIST_LEVEL = 7
export const LIST_LEVEL_COUNT = MAX_LIST_LEVEL + 1

const ListLevelIndexSchema = z.number().int().min(0).max(MAX_LIST_LEVEL)
const PositiveIntegerSchema = z.number().int().positive()

export const ListMarkerFormatSchema = z.enum([
  "decimal",
  "thaiLetter",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
  "bullet",
  "custom",
])

const RawListLevelDefinitionSchema = z.object({
  level: ListLevelIndexSchema,
  format: ListMarkerFormatSchema,
  pattern: z.string().min(1),
  startAt: PositiveIntegerSchema,
  restartAfterLevel: ListLevelIndexSchema.optional(),
  markerIndent: UnitValueSchema,
  bodyIndent: UnitValueSchema,
  tabStop: UnitValueSchema.optional(),
})

export const ListLevelDefinitionSchema = z.preprocess((input) => {
  if (typeof input !== "object" || input == null) return input
  const raw = input as Record<string, unknown>
  if (raw["bodyIndent"] != null || raw["textIndent"] == null) return input
  return { ...raw, bodyIndent: raw["textIndent"] }
}, RawListLevelDefinitionSchema)

export const ListStyleDefinitionSchema = z.object({
  id: z.string().min(1),
  levels: z.array(ListLevelDefinitionSchema).min(1).max(LIST_LEVEL_COUNT),
})

export const ListInstanceSchema = z.object({
  id: z.string().min(1),
  styleId: z.string().min(1),
  startAt: PositiveIntegerSchema.optional(),
})

export const ParagraphListPropsSchema = z.object({
  instanceId: z.string().min(1),
  level: ListLevelIndexSchema,
  itemId: z.string().min(1),
  startAt: PositiveIntegerSchema.optional(),
})

export type ListMarkerFormat = z.infer<typeof ListMarkerFormatSchema>
export type ListLevelDefinition = z.infer<typeof ListLevelDefinitionSchema>
export type ListStyleDefinition = z.infer<typeof ListStyleDefinitionSchema>
export type ListInstance = z.infer<typeof ListInstanceSchema>
export type ParagraphListProps = z.infer<typeof ParagraphListPropsSchema>

export function resolveListLevelBodyIndent(level: ListLevelDefinition): UnitValue {
  const legacy = level as ListLevelDefinition & { textIndent?: UnitValue }
  return legacy.bodyIndent ?? legacy.textIndent ?? { value: 0, unit: "pt" }
}
