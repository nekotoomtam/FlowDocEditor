import type { LayoutNode } from "../schema"

/**
 * Placement types — นิยาม pipeline ของ drag & drop
 *
 * Pipeline:
 * pointer → geometry → zone → intent → law → operation → transform
 */

// ─── Drag Source ──────────────────────────────────────────────────────────────

export type PaletteBlockType = "paragraph" | "row" | "columns" | "table" | "toc"

export type DragSource =
  | { source: "palette"; blockType: PaletteBlockType }
  | { source: "document"; nodeId: string }

// ─── Hit Zone ─────────────────────────────────────────────────────────────────

// zone ที่ได้จาก pointer position relative to node
export type NodeZone =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"

// zone พิเศษสำหรับ row
export type RowZone =
  | "row-outer-top"
  | "row-outer-bottom"
  | "row-stack-inner"

export type PlacementZone = NodeZone | RowZone

// ─── Placement Target ─────────────────────────────────────────────────────────

// target คือ semantic surface ที่ user hover อยู่
export type PlacementTarget =
  | { kind: "node"; nodeId: string; nodeType: LayoutNode["type"] | null }
  | { kind: "row-outer-top"; rowId: string }
  | { kind: "row-outer-bottom"; rowId: string }
  | { kind: "row-stack-inner"; rowId: string; stackId: string }

// ─── Intent ───────────────────────────────────────────────────────────────────

export type PlacementIntentType =
  | "insertAbove"
  | "insertBelow"
  | "insertLeft"
  | "insertRight"
  | "insertInside"

// raw intent = ก่อน law validation
export interface RawPlacementIntent {
  zone: PlacementZone
  intent: PlacementIntentType
  target: PlacementTarget
}

// valid intent = ผ่าน law แล้ว
export interface ValidPlacementIntent extends RawPlacementIntent {
  targetNodeId: string
  parentNodeId: string | null
  targetParentType: LayoutNode["type"] | null
}

// ─── Operation ───────────────────────────────────────────────────────────────

// operation คือ canonical execution-level action
export type PlacementOperation =
  | { kind: "insert-before"; parentId: string; parentType: "body" | "stack"; index: number; anchorNodeId: string }
  | { kind: "insert-after"; parentId: string; parentType: "body" | "stack"; index: number; anchorNodeId: string }
  | { kind: "insert-into-container"; containerId: string; containerType: "body" | "stack"; index: number }
  | { kind: "expand-row-left"; rowId: string; targetStackId: string; index: number }
  | { kind: "expand-row-right"; rowId: string; targetStackId: string; index: number }
  | { kind: "insert-stacks-into-row"; rowId: string; targetStackId: string; index: number; count: number }
  | { kind: "wrap-in-row-left"; parentId: string; parentType: "body" | "stack"; index: number; targetNodeId: string }
  | { kind: "wrap-in-row-right"; parentId: string; parentType: "body" | "stack"; index: number; targetNodeId: string }

// ─── Law Result ───────────────────────────────────────────────────────────────

export type PlacementErrorCode =
  | "missing-target"
  | "invalid-target"
  | "invalid-zone"
  | "invalid-parent"
  | "invalid-row-split"
  | "cyclic-placement"
  | "cross-section"
  | "invalid-source"

export interface PlacementError {
  code: PlacementErrorCode
  message: string
  rawIntent: RawPlacementIntent
}

export interface PlacementDecision {
  intent: ValidPlacementIntent
  operation: PlacementOperation
}

export type PlacementResult =
  | { ok: true; value: PlacementDecision }
  | { ok: false; error: PlacementError }

// ─── Preview ──────────────────────────────────────────────────────────────────

export interface PlacementPreview {
  hoverNodeId: string | null
  zone: PlacementZone | null
  target: PlacementTarget | null
  placement: ValidPlacementIntent | null
  isValid: boolean
}
