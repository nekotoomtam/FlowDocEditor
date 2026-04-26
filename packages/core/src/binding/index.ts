/**
 * Binding Layer — DRAFT
 *
 * หน้าที่: เชื่อม Field Registry กับ Document Template
 *
 * ยังไม่ implement ครบ — วางโครงไว้ก่อน
 * TODO: repeat region, resolver, composite key สำหรับ diff
 */

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
