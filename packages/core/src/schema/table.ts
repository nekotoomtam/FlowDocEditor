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

const HexColorSchema = z.string().regex(/^[0-9A-Fa-f]{6}$/)
const NonNegativeUnitValueSchema = UnitValueSchema.refine((value) => value.value >= 0, {
  message: "Unit value must be non-negative",
})

export const FlowTableCellBoxPaddingSchema = z.object({
  top: NonNegativeUnitValueSchema,
  right: NonNegativeUnitValueSchema,
  bottom: NonNegativeUnitValueSchema,
  left: NonNegativeUnitValueSchema,
})

export const FlowTableCellBoxBorderSideSchema = z.object({
  style: BorderStyleSchema,
  width: NonNegativeUnitValueSchema,
  color: HexColorSchema.default("000000"),
})

export const FlowTableCellBoxBorderSchema = z.object({
  top: FlowTableCellBoxBorderSideSchema.optional(),
  right: FlowTableCellBoxBorderSideSchema.optional(),
  bottom: FlowTableCellBoxBorderSideSchema.optional(),
  left: FlowTableCellBoxBorderSideSchema.optional(),
})

export const FlowTableCellBoxStyleSchema = z.object({
  fill: HexColorSchema.optional(),
  padding: FlowTableCellBoxPaddingSchema.optional(),
  border: FlowTableCellBoxBorderSchema.optional(),
})

export const FlowTableCellMergeMapEntrySchema = z.object({
  rowOffset: z.number().int().nonnegative(),
  colOffset: z.number().int().nonnegative(),
  childIds: z.array(z.string().min(1)).min(1),
})

export const FlowTableCellMergeMapSchema = z.object({
  version: z.literal(1),
  entries: z.array(FlowTableCellMergeMapEntrySchema).min(1),
})

// ─── Column ───────────────────────────────────────────────────────────────────

export const TableColumnDefSchema = z.object({
  width: UnitValueSchema,
})

// ─── Props ────────────────────────────────────────────────────────────────────

export const TablePropsSchema = z.object({
  border: CellBorderSchema.optional(),  // default border สำหรับทุก cell
  headerRowCount: z.number().int().nonnegative().optional(),  // first N rows repeat on each page
})

export const TableRowPropsSchema = z.object({
  height: UnitValueSchema.optional(),   // fixed height (ถ้าไม่กำหนด = auto จาก content)
  allowBreak: z.boolean().optional(),   // default true — split at page boundary when needed
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

// ─── Flow Table Nodes ────────────────────────────────────────────────────────

export const FlowTablePropsSchema = z.object({
  border: CellBorderSchema.optional(),
  headerRowCount: z.number().int().nonnegative().optional(),
})

export const FlowTableRowPropsSchema = z.object({
  height: UnitValueSchema.optional(),
  allowBreak: z.boolean().optional(),
})

export const FlowTableCellPropsSchema = z.object({
  colspan: z.number().int().min(1).optional(),
  rowspan: z.number().int().min(1).optional(),
  box: FlowTableCellBoxStyleSchema.optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  mergeMap: FlowTableCellMergeMapSchema.optional(),
})

export const FlowTableCellNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-table-cell"),
  props: FlowTableCellPropsSchema,
  childIds: z.array(z.string().min(1)),
})

export const FlowTableRowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-table-row"),
  props: FlowTableRowPropsSchema,
  cellIds: z.array(z.string().min(1)),
})

// nodes ใน flow-table เก็บแบบ passthrough เหมือน table เดิมเพื่อหลีกเลี่ยง
// circular dep กับ block.ts; assert layer ตรวจโครงสร้างจริงเอง
const FlowTableInternalNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
}).passthrough()

export const FlowTableNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flow-table"),
  props: FlowTablePropsSchema,
  columns: z.array(TableColumnDefSchema).min(1),
  rowIds: z.array(z.string().min(1)).min(1),
  nodes: z.record(z.string().min(1), FlowTableInternalNodeSchema),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type BorderStyle = z.infer<typeof BorderStyleSchema>
export type BorderSide = z.infer<typeof BorderSideSchema>
export type CellBorder = z.infer<typeof CellBorderSchema>
export type FlowTableCellBoxPadding = z.infer<typeof FlowTableCellBoxPaddingSchema>
export type FlowTableCellBoxBorderSide = z.infer<typeof FlowTableCellBoxBorderSideSchema>
export type FlowTableCellBoxBorder = z.infer<typeof FlowTableCellBoxBorderSchema>
export type FlowTableCellBoxStyle = z.infer<typeof FlowTableCellBoxStyleSchema>
export type FlowTableCellMergeMapEntry = z.infer<typeof FlowTableCellMergeMapEntrySchema>
export type FlowTableCellMergeMap = z.infer<typeof FlowTableCellMergeMapSchema>
export type TableColumnDef = z.infer<typeof TableColumnDefSchema>
export type TableProps = z.infer<typeof TablePropsSchema>
export type TableRowProps = z.infer<typeof TableRowPropsSchema>
export type TableCellProps = z.infer<typeof TableCellPropsSchema>
export type TableCellNode = z.infer<typeof TableCellNodeSchema>
export type TableRowNode = z.infer<typeof TableRowNodeSchema>
export type FlowTableProps = z.infer<typeof FlowTablePropsSchema>
export type FlowTableRowProps = z.infer<typeof FlowTableRowPropsSchema>
export type FlowTableCellProps = z.infer<typeof FlowTableCellPropsSchema>
export type FlowTableCellNode = z.infer<typeof FlowTableCellNodeSchema>
export type FlowTableRowNode = z.infer<typeof FlowTableRowNodeSchema>

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

export interface FlowTableNode {
  id: string
  type: "flow-table"
  props: FlowTableProps
  columns: TableColumnDef[]
  rowIds: string[]
  nodes: Record<string, FlowTableRowNode | FlowTableCellNode | ParagraphNode | SpacerNode>
}
