export function shouldFinalizeInlineEditBlur(
  blurredNodeId: string | null,
  currentInlineEditNodeId: string | null,
  focusedInlineEditNodeId: string | null,
): boolean {
  if (!blurredNodeId) return true
  if (currentInlineEditNodeId !== blurredNodeId) return false
  return focusedInlineEditNodeId !== blurredNodeId
}

export type InlineEditStartDecision = "start" | "continue-current" | "finalize-previous"

export function decideInlineEditStart(
  currentInlineEditNodeId: string | null,
  nextInlineEditNodeId: string,
  hasOpenTransaction: boolean,
): InlineEditStartDecision {
  if (!hasOpenTransaction || !currentInlineEditNodeId) return "start"
  if (currentInlineEditNodeId === nextInlineEditNodeId) return "continue-current"
  return "finalize-previous"
}
