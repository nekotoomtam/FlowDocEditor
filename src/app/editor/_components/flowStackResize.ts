export const FLOW_STACK_RESIZE_MIN_WIDTH_SHARE = 8

function roundShare(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function effectiveFlowStackResizeMinShare(
  pairTotalShare: number,
  preferredMinShare = FLOW_STACK_RESIZE_MIN_WIDTH_SHARE,
): number {
  if (!Number.isFinite(pairTotalShare) || pairTotalShare <= 0) return 0.01
  const pairHalf = pairTotalShare / 2
  return roundShare(Math.max(0.01, Math.min(preferredMinShare, pairHalf - 0.01)))
}

export function clampFlowStackResizeSelectedShare(
  pairTotalShare: number,
  selectedShare: number,
  preferredMinShare = FLOW_STACK_RESIZE_MIN_WIDTH_SHARE,
): number {
  const minShare = effectiveFlowStackResizeMinShare(pairTotalShare, preferredMinShare)
  const maxShare = Math.max(minShare, pairTotalShare - minShare)
  if (!Number.isFinite(selectedShare)) return minShare
  return roundShare(Math.max(minShare, Math.min(maxShare, selectedShare)))
}

export function resolveFlowStackResizePairShares(input: {
  pairTotalShare: number
  selectedShare: number
  selectedIsLeft: boolean
  preferredMinShare?: number
}): { leftShare: number; rightShare: number; selectedShare: number; neighborShare: number; minShare: number; maxShare: number } {
  const pairTotalShare = roundShare(input.pairTotalShare)
  const minShare = effectiveFlowStackResizeMinShare(pairTotalShare, input.preferredMinShare)
  const maxShare = roundShare(pairTotalShare - minShare)
  const selectedShare = clampFlowStackResizeSelectedShare(pairTotalShare, input.selectedShare, input.preferredMinShare)
  const neighborShare = roundShare(pairTotalShare - selectedShare)

  return {
    leftShare: input.selectedIsLeft ? selectedShare : neighborShare,
    rightShare: input.selectedIsLeft ? neighborShare : selectedShare,
    selectedShare,
    neighborShare,
    minShare,
    maxShare,
  }
}
