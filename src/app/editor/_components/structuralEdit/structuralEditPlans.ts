import type { StructuralEditTransaction } from "../runtime/structuralEditRuntime"
import type {
  StructuralBridgeOperation,
  StructuralBridgeTransactionIdentity,
  StructuralDraftSessionPlan,
  StructuralEditTransactionPlan,
  StructuralMergeTransactionPlanInput,
  StructuralPanelDeferralPlan,
  StructuralSplitTransactionPlanInput,
} from "./structuralEditBridgeTypes"

export function createStructuralTransactionIdentity(
  transaction: StructuralEditTransaction,
): StructuralBridgeTransactionIdentity {
  return {
    id: transaction.id,
    generation: transaction.generation,
  }
}

export function createSplitStructuralEditPlan(
  input: StructuralSplitTransactionPlanInput,
): StructuralEditTransactionPlan {
  return {
    key: "Enter",
    accepted: true,
    kind: "split",
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.newNodeId,
    expectedActiveNodeId: input.newNodeId,
    affectedPageIds: [input.pageIndex],
    suppressedPageBreakNodeId: input.suppressedPageBreakNodeId ?? null,
    startedAt: input.startedAt,
  }
}

export function createMergeStructuralEditPlan(
  input: StructuralMergeTransactionPlanInput,
): StructuralEditTransactionPlan {
  return {
    key: "Backspace",
    accepted: true,
    kind: "merge",
    sourceNodeId: input.currentNodeId,
    targetNodeId: input.previousNodeId,
    removedNodeId: input.currentNodeId,
    expectedActiveNodeId: input.previousNodeId,
    affectedPageIds: [input.pageIndex],
    startedAt: input.startedAt,
  }
}

export function createStructuralPanelDeferralPlan({
  transaction,
  operation,
  nodeId,
  startedAt,
}: {
  transaction: StructuralEditTransaction
  operation: StructuralBridgeOperation
  nodeId: string
  startedAt: number
}): StructuralPanelDeferralPlan {
  return {
    transactionId: transaction.id,
    generation: transaction.generation,
    operation,
    nodeId,
    reason: operation === "split" ? "split-urgent-structural-paint" : "merge-urgent-structural-paint",
    startedAt,
  }
}

export function createStructuralDraftSessionPlan({
  transaction,
  nodeId,
  textLength,
  caretIndex,
}: {
  transaction: StructuralEditTransaction
  nodeId: string
  textLength: number
  caretIndex: number
}): StructuralDraftSessionPlan {
  return {
    nodeId,
    mode: "plain-text",
    source: "shell-refocus",
    initialTextLength: textLength,
    caretIndex,
    structuralTransactionId: transaction.id,
    structuralGeneration: transaction.generation,
  }
}
