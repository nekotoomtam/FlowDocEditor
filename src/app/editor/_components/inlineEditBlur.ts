export function shouldFinalizeInlineEditBlur(
  blurredNodeId: string | null,
  currentInlineEditNodeId: string | null,
  focusedInlineEditNodeId: string | null,
): boolean {
  if (!blurredNodeId) return true
  if (currentInlineEditNodeId !== blurredNodeId) return false
  return focusedInlineEditNodeId !== blurredNodeId
}
