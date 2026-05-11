/**
 * Binding Layer
 *
 * หน้าที่: เชื่อม Field Registry กับ Document Template
 *
 * TODO: repeat region, resolver, composite key สำหรับ diff
 */

import type { DataSnapshotIssue, DataSnapshotV1, FieldScalarValue } from "../dataSnapshot"
import { validateDataSnapshot } from "../dataSnapshot"
import type { FieldRegistryV1 } from "../fieldRegistry"
import type { DocumentNode, FieldRefInline, LayoutNode, ParagraphNode, TableNode } from "../schema"

// ─── Field Registry ───────────────────────────────────────────────────────────

// ชนิดของ field
export type FieldType = "scalar" | "object" | "collection"

export interface FieldDefinition {
  key: string        // path เช่น "customer.name"
  type: FieldType
  label?: string
}

// Field Registry = single source of truth ของ data schema
export interface FieldRegistry {
  fields: FieldDefinition[]
}

// ─── Field Data ───────────────────────────────────────────────────────────────

// ข้อมูลจริงที่ใส่เข้ามาตอน resolve
export type FieldValue = string | number | boolean | null
export interface FieldData {
  [key: string]: FieldValue | FieldData | FieldData[]
}

// ─── Repeat Region ────────────────────────────────────────────────────────────

// TODO: repeat region ใช้ composite key "templateNodeId:itemIndex"
// เพื่อให้ diff ทำงานได้ระดับ node
//
// ตัวอย่าง:
// template node "row_abc" + items[0,1,2]
// → "row_abc:0", "row_abc:1", "row_abc:2"
//
// ประเด็นที่ยังไม่ตัดสินใจ:
// 1. sort/reorder → composite key จะ diff ยาก (defer)
// 2. nested repeat region → ยังไม่ชัดว่าจะ model ยังไง
// 3. repeat region node type → เพิ่มเข้า tree หรือแยก layer?

export interface RepeatRegion {
  templateNodeId: string    // node ที่เป็น template
  collectionKey: string     // field key ของ collection เช่น "items"
}

// ─── Resolver (Draft) ─────────────────────────────────────────────────────────

// TODO: implement จริงๆ เมื่อ FieldData และ RepeatRegion ชัดขึ้น

export interface BindingContext {
  registry: FieldRegistry
  data: FieldData
  repeatContext?: {
    collectionKey: string
    itemIndex: number
    item: FieldData
  }
}

export interface SnapshotBindingContext {
  registry: FieldRegistryV1
  snapshot: DataSnapshotV1
}

export interface SnapshotBindingResult {
  doc: DocumentNode
  issues: DataSnapshotIssue[]
}

// resolve scalar field จาก path เช่น "customer.name"
export function resolveFieldValue(path: string, context: BindingContext): string {
  const parts = path.split(".")

  // ถ้าอยู่ใน repeat context และ path ขึ้นต้นด้วย collection key
  if (context.repeatContext != null) {
    const { collectionKey, item } = context.repeatContext
    const collectionPrefix = collectionKey.split(".").pop() ?? collectionKey
    if (parts[0] === collectionPrefix) {
      const subPath = parts.slice(1)
      const value = subPath.reduce<FieldData | FieldData[] | FieldValue>(
        (obj, key) => (typeof obj === "object" && obj != null && !Array.isArray(obj) ? (obj as FieldData)[key] : null),
        item,
      )
      return value != null ? String(value) : ""
    }
  }

  // resolve จาก root data
  const value = parts.reduce<FieldData | FieldData[] | FieldValue>(
    (obj, key) => (typeof obj === "object" && obj != null && !Array.isArray(obj) ? (obj as FieldData)[key] : null),
    context.data,
  )
  return value != null ? String(value) : ""
}

type FieldRefValueResolver = (fieldRef: FieldRefInline) => string
type FieldRefFallbackResolver = (fieldRef: FieldRefInline) => string

function formatSnapshotValue(value: FieldScalarValue | undefined): string {
  return value == null ? "" : String(value)
}

function bindParagraphWithResolver(
  node: ParagraphNode,
  resolveValue: FieldRefValueResolver,
  resolveFallback: FieldRefFallbackResolver,
): ParagraphNode {
  return {
    ...node,
    children: node.children.map((child) => {
      if (child.type !== "fieldRef") return child
      const value = resolveValue(child)
      return {
        id: child.id,
        type: "text" as const,
        text: value.length > 0 ? value : resolveFallback(child),
      }
    }),
  }
}

function bindTableWithResolver(
  table: TableNode,
  resolveValue: FieldRefValueResolver,
  resolveFallback: FieldRefFallbackResolver,
): TableNode {
  const nodes: TableNode["nodes"] = {}
  Object.entries(table.nodes).forEach(([nodeId, node]) => {
    nodes[nodeId] = node.type === "paragraph" ? bindParagraphWithResolver(node, resolveValue, resolveFallback) : node
  })
  return { ...table, nodes }
}

function bindLayoutNodeWithResolver(
  node: LayoutNode,
  resolveValue: FieldRefValueResolver,
  resolveFallback: FieldRefFallbackResolver,
): LayoutNode {
  if (node.type === "paragraph") return bindParagraphWithResolver(node, resolveValue, resolveFallback)
  if (node.type === "table") return bindTableWithResolver(node as unknown as TableNode, resolveValue, resolveFallback) as unknown as LayoutNode
  return node
}

function bindDocumentWithResolver(
  template: DocumentNode,
  resolveValue: FieldRefValueResolver,
  resolveFallback: FieldRefFallbackResolver,
): DocumentNode {
  return {
    ...template,
    document: {
      ...template.document,
      sections: template.document.sections.map((section) => {
        const nodes: Record<string, LayoutNode> = {}
        Object.entries(section.nodes).forEach(([nodeId, node]) => {
          nodes[nodeId] = bindLayoutNodeWithResolver(node, resolveValue, resolveFallback)
        })
        return { ...section, nodes }
      }),
    },
  }
}

export function bindDocument(template: DocumentNode, context: BindingContext): DocumentNode {
  return bindDocumentWithResolver(
    template,
    (fieldRef) => resolveFieldValue(fieldRef.key, context),
    (fieldRef) => fieldRef.fallback ?? "",
  )
}

export function bindDocumentWithSnapshot(
  template: DocumentNode,
  context: SnapshotBindingContext,
): SnapshotBindingResult {
  const validation = validateDataSnapshot(context.snapshot, context.registry)
  const fieldDefinitions = new Map(context.registry.fields.map((field) => [field.key, field]))
  const invalidValueKeys = new Set(validation.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.key))

  return {
    doc: bindDocumentWithResolver(
      template,
      (fieldRef) => invalidValueKeys.has(fieldRef.key)
        ? ""
        : formatSnapshotValue(context.snapshot.values[fieldRef.key]),
      (fieldRef) => fieldRef.fallback ?? fieldDefinitions.get(fieldRef.key)?.fallback ?? "",
    ),
    issues: validation.issues,
  }
}
