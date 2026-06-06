"use client"

import { useMemo } from "react"
import {
  createMergeStructuralEditPlan,
  createSplitStructuralEditPlan,
  createStructuralPanelDeferralPlan,
  createStructuralTransactionIdentity,
} from "./structuralEditPlans"
import type {
  StructuralBridgeBeginResult,
  StructuralBridgeTransactionIdentity,
  StructuralEditController,
  StructuralEditControllerOptions,
  StructuralMergeTransactionPlanInput,
  StructuralSplitTransactionPlanInput,
} from "./structuralEditBridgeTypes"

export function createStructuralEditController({
  structuralRuntime,
}: StructuralEditControllerOptions): StructuralEditController {
  const beginSplit = (input: StructuralSplitTransactionPlanInput): StructuralBridgeBeginResult => {
    const transaction = structuralRuntime.beginStructuralEdit(createSplitStructuralEditPlan(input))
    const identity = createStructuralTransactionIdentity(transaction)
    structuralRuntime.markCommitting(identity)
    return {
      transaction,
      identity,
      panelDeferral: createStructuralPanelDeferralPlan({
        transaction,
        operation: "split",
        nodeId: input.newNodeId,
        startedAt: input.startedAt,
      }),
    }
  }

  const beginMerge = (input: StructuralMergeTransactionPlanInput): StructuralBridgeBeginResult => {
    const transaction = structuralRuntime.beginStructuralEdit(createMergeStructuralEditPlan(input))
    const identity = createStructuralTransactionIdentity(transaction)
    structuralRuntime.markCommitting(identity)
    return {
      transaction,
      identity,
      panelDeferral: createStructuralPanelDeferralPlan({
        transaction,
        operation: "merge",
        nodeId: input.previousNodeId,
        startedAt: input.startedAt,
      }),
    }
  }

  return {
    beginSplit,
    beginMerge,
    markUrgentPainting: (identity: StructuralBridgeTransactionIdentity) => {
      structuralRuntime.markUrgentPainting(identity)
    },
    markSplitCommitted: (identity: StructuralBridgeTransactionIdentity, nodeId: string) => {
      structuralRuntime.markNodeCommitted(identity, nodeId)
      structuralRuntime.markReadyForNextStructuralKey(identity)
    },
    markMergeCommitted: (identity: StructuralBridgeTransactionIdentity, input) => {
      structuralRuntime.markNodeRemoved(identity, input.removedNodeId)
      structuralRuntime.markNodeCommitted(identity, input.committedNodeId)
      structuralRuntime.markReadyForNextStructuralKey(identity)
    },
  }
}

export function useStructuralEditController(
  options: StructuralEditControllerOptions,
): StructuralEditController {
  return useMemo(() => createStructuralEditController(options), [options.structuralRuntime])
}
