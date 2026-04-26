import { z } from "zod"
import { UnitValueSchema } from "./units"
import type { ParagraphNode, SpacerNode } from "./block"

// ─── Border ───────────────────────────────────────────────────────────────────

export const BorderStyleSchema = z.enum(["solid", "dashed", "dotted", "none"])

export const BorderSideSchema = z.object({
  style: BorderStyleSchema,
  width: UnitValueSchema,
  color: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("000000"),
})

// CellBorderSchema — ใช้ทั้ง table-level default และ cell-level override
// ไม่กำหนด side ไหน = ไม่ override (inherit จาก table default)
export const CellBorderSchema = z.object({
  top: BorderSideSchema.optional(),
  right: BorderSideSchema.optional(),
  bottom: BorderSideSchema.optional(),
  left: BorderSideSchema.optional(),
})

// ─── Column ───────────────────────────────────────────────────────────────────

export const TableColumnDefSchema = z.object({
  width: UnitValueSchema,
})

// ─── Props ────────────────────────────────────────────────────────────────────

export const TablePropsSchema = z.object({
  border: CellBorderSchema.optional(),  // default border สำหรับทุก cell
})

export const TableRowPropsSchema = z.object({
  height: UnitValueSchema.optional(),   // fixed height (ถ้าไม่กำหนด = auto จาก content)
  allowBreak: z.boolean().optional(),   // default false — keep-together
})

export const TableCellPropsSchema = z.object({
  colspan: z.number().int().min(1).optional(),
  rowspan: z.number().int().min(1).optional(),
  border: CellBorderSchema.optional(),           // override table default
  padding: UnitValueSchema.optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  background: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional(),
})

// ─── Table Nodes ──────────────────────────────────────────────────────────────

export const TableCellNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-cell"),
  props: TableCellPropsSchema,
  childIds: z.array(z.string().min(1)),  // paragraph/spacer ids ใน table.nodes
})

export const TableRowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table-row"),
  props: TableRowPropsSchema,
  cellIds: z.array(z.string().min(1)),
})

// nodes ใน table เก็บแบบ passthrough เพื่อหลีกเลี่ยง circular dep กับ block.ts
// assert layer จะ validate โครงสร้างจริงๆ เอง
const TableInternalNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
}).passthrough()

export const TableNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table"),
  props: TablePropsSchema,
  columns: z.array(TableColumnDefSchema).min(1),
  rowIds: z.array(z.string().min(1)).min(1),
  nodes: z.record(z.string().min(1), TableInternalNodeSchema),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type BorderStyle = z.infer<typeof BorderStyleSchema>
export type BorderSide = z.infer<typeof BorderSideSchema>
export type CellBorder = z.infer<typeof CellBorderSchema>
export type TableColumnDef = z.infer<typeof TableColumnDefSchema>
export type TableProps = z.infer<typeof TablePropsSchema>
export type TableRowProps = z.infer<typeof TableRowPropsSchema>
export type TableCellProps = z.infer<typeof TableCellPropsSchema>
export type TableCellNode = z.infer<typeof TableCellNodeSchema>
export type TableRowNode = z.infer<typeof TableRowNodeSchema>

// TableNode ใช้ TypeScript type แยกต่างหากเพื่อให้ nodes มี type ที่ precise
// (Zod infer จะได้ nodes: Record<string, { id, type }> ซึ่ง loose เกินไป)
export interface TableNode {
  id: string
  type: "table"
  props: TableProps
  columns: TableColumnDef[]
  rowIds: string[]
  nodes: Record<string, TableRowNode | TableCellNode | ParagraphNode | SpacerNode>
}
