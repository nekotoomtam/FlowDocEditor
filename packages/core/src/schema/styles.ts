import { z } from "zod"
import { TextRunStyleSchema } from "./inline"
import { ParagraphStylePropertiesSchema } from "./block"

export const ParagraphStyleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  props: ParagraphStylePropertiesSchema,
})

export const TextRunStyleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  style: TextRunStyleSchema,
})

export const DocumentStyleDefinitionsSchema = z.object({
  baseParagraphStyleId: z.string().min(1).optional(),
  paragraphStyles: z.record(z.string().min(1), ParagraphStyleDefinitionSchema).optional(),
  textRunStyles: z.record(z.string().min(1), TextRunStyleDefinitionSchema).optional(),
})

export type ParagraphStyleDefinition = z.infer<typeof ParagraphStyleDefinitionSchema>
export type TextRunStyleDefinition = z.infer<typeof TextRunStyleDefinitionSchema>
export type DocumentStyleDefinitions = z.infer<typeof DocumentStyleDefinitionsSchema>
