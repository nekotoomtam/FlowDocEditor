import type {
  StructuralEditKey,
  StructuralEditKind,
  StructuralEditRuntime,
} from "../runtime/structuralEditRuntime"

export interface ParagraphTextSurfaceStructuralEditGuardInput {
  key: StructuralEditKey
  operation: StructuralEditKind
  nodeId: string
  caretIndex: number
  isComposing: boolean
  hasActiveComposition: boolean
  currentActiveNodeId?: string | null
  expectedNodeExists?: boolean
  removedNodeStillExists?: boolean
  timestamp: number
  source: string
}

export type ParagraphTextSurfaceStructuralEditGuard = (
  input: ParagraphTextSurfaceStructuralEditGuardInput,
) => boolean

export function canStartParagraphTextSurfaceFallbackStructuralEditBridge(
  structuralRuntime: StructuralEditRuntime,
  input: ParagraphTextSurfaceStructuralEditGuardInput,
): boolean {
  const decision = structuralRuntime.canStartStructuralEdit({
    key: input.key,
    nodeId: input.nodeId,
    caretIndex: input.caretIndex,
    isComposing: input.isComposing,
    hasActiveComposition: input.hasActiveComposition,
    currentActiveNodeId: input.currentActiveNodeId,
    expectedNodeExists: input.expectedNodeExists,
    removedNodeStillExists: input.removedNodeStillExists,
    timestamp: input.timestamp,
  })
  if (decision.type === "guard" && decision.transactionId) {
    structuralRuntime.markKeyRepeatDropped({
      id: decision.transactionId,
      generation: decision.generation,
    }, `${input.source}:${decision.reason}`)
  }
  return decision.type === "allow"
}
