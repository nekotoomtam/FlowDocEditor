export function shouldFinalizeInlineEditBlur(
  blurredNodeId: string | null,
  currentInlineEditNodeId: string | null,
  focusedInlineEditNodeId: string | null,
): boolean {
  if (!blurredNodeId) return true
  if (currentInlineEditNodeId !== blurredNodeId) return false
  return focusedInlineEditNodeId !== blurredNodeId
}

export function getFocusedInlineEditNodeId(activeElement: Element | null): string | null {
  return activeElement?.getAttribute("data-inline-edit-node-id") ?? null
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
