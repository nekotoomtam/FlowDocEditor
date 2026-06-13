import type { LayoutWarningSummary } from "@/pagination"

export function areLayoutWarningSummariesEqual(
  current: LayoutWarningSummary[],
  next: LayoutWarningSummary[],
): boolean {
  if (current === next) return true
  if (current.length !== next.length) return false
  return current.every((warning, index) => {
    const nextWarning = next[index]
    return (
      warning.code === nextWarning?.code &&
      warning.count === nextWarning.count &&
      warning.message === nextWarning.message
    )
  })
}

export function shouldApplyServerLayoutWarnings(
  current: LayoutWarningSummary[],
  next: LayoutWarningSummary[],
): boolean {
  return !areLayoutWarningSummariesEqual(current, next)
}
