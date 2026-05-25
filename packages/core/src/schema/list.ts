import { z } from "zod"
import { UnitValueSchema } from "./units"

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

export const ListLevelDefinitionSchema = z.object({
  level: ListLevelIndexSchema,
  format: ListMarkerFormatSchema,
  pattern: z.string().min(1),
  startAt: PositiveIntegerSchema,
  restartAfterLevel: ListLevelIndexSchema.optional(),
  markerIndent: UnitValueSchema,
  textIndent: UnitValueSchema,
  tabStop: UnitValueSchema.optional(),
})

export const ListStyleDefinitionSchema = z.object({
  id: z.string().min(1),
  levels: z.array(ListLevelDefinitionSchema).min(1).max(LIST_LEVEL_COUNT),
})

export const ListInstanceSchema = z.object({
  id: z.string().min(1),
  styleId: z.string().min(1),
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
