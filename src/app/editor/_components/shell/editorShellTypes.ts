import type { PaginatedDocument, PageFragment } from "@/pagination"
import type { DragSource } from "@/placement/types"
import type { ParagraphNode } from "@/schema"
import type { EditorAction } from "../editorReducer"
import type { EditorActionClassification } from "../editorActionClassifier"
import type { OptimisticSplitRefocusMode } from "../optimisticStructuralRefocus"
import type { EditorWorkflowMode } from "./EditorToolbar"
import type { EditorLeftRailMode } from "./EditorLeftRail"

export type SplitParagraphHistory = Extract<EditorAction, { type: "SPLIT_PARAGRAPH" }>["history"]

export interface PendingClickAction {
  type: "inline-edit"
  nodeId: string
  selectNodeId?: string
  caretIndex: number | null
  pageIndex: number | null
}

export interface PendingDrag {
  source: DragSource
  clientX: number
  clientY: number
  clickAction?: PendingClickAction
  finalizeOnDragStart?: boolean
}

export interface DeferredInlineEditStart {
  frameId: number | null
  timeoutId: number | null
}

export interface DeferredInlineEditEnd {
  frameId: number | null
  timeoutId: number | null
  nodeId: string
  reason: "blur" | "keyboard"
}

export interface PendingEditorActionClassification {
  action: EditorAction
  classification: EditorActionClassification
}

export interface PendingOptimisticSplitRefocus {
  sourceNodeId: string
  newNodeId: string
  sourceFragment: PageFragment
  startedAt: number
  prestarted: boolean
}

export interface PendingOptimisticMergeRefocus {
  currentNodeId: string
  previousNodeId: string
  currentFragment: PageFragment
  previousFragment: PageFragment
  startedAt: number
  prestarted: boolean
}

export interface OptimisticStructuralRefocusPaint {
  nodeId: string
  startedAt: number
}

export interface OptimisticStructuralIslandOverride {
  nodeId: string
  paragraph: ParagraphNode
  fragment: PageFragment
  pageKey: string
  pages: PaginatedDocument["sections"][number]["pages"]
  isTableCellParagraph: boolean
  mode: OptimisticSplitRefocusMode
  suppressedPageBreakNodeId?: string | null
  settleRemovedNodeId?: string
}

export type WysiwygFinalizeMode = "settled-preview" | "responsive-preview"

export interface PendingDragMove {
  clientX: number
  clientY: number
  sourceOverride?: DragSource | null
}

export type ZoomMode = "fit" | "manual"
export type LeftRailMode = EditorLeftRailMode
export type RightRailMode = "page" | "properties" | "style"
export type WorkflowMode = EditorWorkflowMode

export type RightRailResizeDrag = {
  pointerId: number
  startX: number
  startWidth: number
  previewWidth: number
}

export type EditorPrepareOverlayStatus = "visible" | "fading" | "hidden"
export type EditorDocumentIoStatus = { type: "info" | "error"; message: string }
