export const ISLAND_STRUCTURAL_EDIT_GUARD_TIMEOUT_MS = 180

export type DraftIslandStructuralEditOperation = "split" | "merge" | "delete-empty"

export type DraftIslandStructuralEditGuardUnlockReason =
  | "active-node-changed"
  | "inactive"
  | "timeout"
  | "unmount"

export interface DraftIslandStructuralEditGuard {
  token: number
  operation: DraftIslandStructuralEditOperation
  sourceNodeId: string
  expectedActiveNodeId: string | null
  removedNodeId: string | null
  draftRevision: number
  startedAt: number
}

export interface DraftIslandStructuralGuardKeyInput {
  key: string
  nodeId: string | null
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
}

export function shouldDropDraftIslandStructuralKeyForGuard(
  guard: DraftIslandStructuralEditGuard | null,
  input: DraftIslandStructuralGuardKeyInput,
): boolean {
  if (!guard) return false
  if (input.key !== "Enter" && input.key !== "Backspace") return false
  if (input.shiftKey || input.altKey || input.ctrlKey || input.metaKey || input.isComposing) return false
  return input.nodeId === guard.sourceNodeId
}

export function resolveDraftIslandStructuralGuardUnlockReason(
  guard: DraftIslandStructuralEditGuard | null,
  input: {
    active: boolean
    nodeId: string | null | undefined
    now: number
    timeoutMs?: number
  },
): DraftIslandStructuralEditGuardUnlockReason | null {
  if (!guard) return null
  if (!input.active || !input.nodeId) return "inactive"
  if (guard.expectedActiveNodeId && input.nodeId === guard.expectedActiveNodeId) return "active-node-changed"
  if (input.nodeId !== guard.sourceNodeId) return "active-node-changed"
  const timeoutMs = input.timeoutMs ?? ISLAND_STRUCTURAL_EDIT_GUARD_TIMEOUT_MS
  if (input.now - guard.startedAt >= timeoutMs) return "timeout"
  return null
}
