import type {
  BeginStructuralEditInput,
  StructuralEditRuntime,
  StructuralEditTransaction,
  StructuralEditTransactionIdentity,
} from "../runtime/structuralEditRuntime"

export type StructuralBridgeOperation = "split" | "merge"

export type StructuralBridgeTransactionIdentity = StructuralEditTransactionIdentity & {
  generation: number
}

export interface StructuralSplitTransactionPlanInput {
  sourceNodeId: string
  newNodeId: string
  pageIndex: number
  suppressedPageBreakNodeId?: string | null
  startedAt: number
}

export interface StructuralMergeTransactionPlanInput {
  currentNodeId: string
  previousNodeId: string
  pageIndex: number
  startedAt: number
}

export interface StructuralPanelDeferralPlan {
  transactionId: string
  generation: number
  operation: StructuralBridgeOperation
  nodeId: string
  reason: "split-urgent-structural-paint" | "merge-urgent-structural-paint"
  startedAt: number
}

export interface StructuralDraftSessionPlan {
  nodeId: string
  mode: "plain-text"
  source: "shell-refocus"
  initialTextLength: number
  caretIndex: number
  structuralTransactionId: string
  structuralGeneration: number
}

export interface StructuralBridgeBeginResult {
  transaction: StructuralEditTransaction
  identity: StructuralBridgeTransactionIdentity
  panelDeferral: StructuralPanelDeferralPlan
}

export interface StructuralEditControllerOptions {
  structuralRuntime: StructuralEditRuntime
}

export interface StructuralEditController {
  beginSplit(input: StructuralSplitTransactionPlanInput): StructuralBridgeBeginResult
  beginMerge(input: StructuralMergeTransactionPlanInput): StructuralBridgeBeginResult
  markUrgentPainting(identity: StructuralBridgeTransactionIdentity): void
  markSplitCommitted(identity: StructuralBridgeTransactionIdentity, nodeId: string): void
  markMergeCommitted(identity: StructuralBridgeTransactionIdentity, input: {
    removedNodeId: string
    committedNodeId: string
  }): void
}

export type StructuralEditTransactionPlan = BeginStructuralEditInput
