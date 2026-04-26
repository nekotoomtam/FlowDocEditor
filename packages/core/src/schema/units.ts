import { z } from "zod"

// Abstract unit — layout engine ไม่รู้จัก pt หรือ px
// Renderer แต่ละตัวจะแปลงเองตอน output
export const UnitValueSchema = z.object({
  value: z.number().finite(),
  unit: z.enum(["pt", "mm"]),
})

export type UnitValue = z.infer<typeof UnitValueSchema>

export function pt(value: number): UnitValue {
  return { value, unit: "pt" }
}

export function mm(value: number): UnitValue {
  return { value, unit: "mm" }
}
