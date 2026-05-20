import type { PaginatedDocument } from "@/pagination"

export interface InlineEditPageFollowInput {
  previousPageIndex: number | null
  nextPageIndex: number | null
}

export interface InlineEditPageRelocationInput {
  nextPageIndex: number | null
  isVisualLocked: boolean
}

export interface ActiveInlineEditPageIndexInput {
  inlineEditPageIndex: number | null
  previewCaretPageIndex?: number | null
  isVisualLocked: boolean
}

export function resolveActiveInlineEditPageIndex(input: ActiveInlineEditPageIndexInput): number | null {
  if (input.isVisualLocked && input.inlineEditPageIndex !== null) return input.inlineEditPageIndex
  return input.previewCaretPageIndex ?? input.inlineEditPageIndex
}

export function shouldRelocateInlineEditPage(input: InlineEditPageRelocationInput): boolean {
  return input.nextPageIndex !== null && !input.isVisualLocked
}

export function shouldFollowInlineEditPageChange(input: InlineEditPageFollowInput): boolean {
  return input.previousPageIndex !== null &&
    input.nextPageIndex !== null &&
    input.previousPageIndex !== input.nextPageIndex
}

export function findEditorPageKeyByPageIndex(
  paginated: PaginatedDocument,
  targetPageIndex: number | null,
): string | null {
  if (targetPageIndex === null) return null
  for (const [sectionIndex, section] of paginated.sections.entries()) {
    const pageArrayIndex = section.pages.findIndex((page) => page.index === targetPageIndex)
    if (pageArrayIndex >= 0) return `${sectionIndex}-${pageArrayIndex}`
  }
  return null
}

export function scrollElementIntoNearestView(
  element: { scrollIntoView: (options?: ScrollIntoViewOptions) => void } | null | undefined,
): void {
  if (!element) return
  try {
    element.scrollIntoView({ block: "nearest", inline: "nearest" })
  } catch {
    element.scrollIntoView()
  }
}
