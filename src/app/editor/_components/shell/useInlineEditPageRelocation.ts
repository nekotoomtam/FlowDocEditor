import { useEffect, useMemo, type MutableRefObject } from "react"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import {
  findWysiwygPageIndexInFragmentRanges,
  getWysiwygParagraphFragmentRanges,
} from "../wysiwygCaretMapping"
import { isParagraphInsideTableCell } from "../wysiwygTextEligibility"
import { shouldFollowInlineEditPageChange } from "../editorPageFollow"

export function useInlineEditPageRelocation({
  authoritativePaginated,
  previewDoc,
  inlineEditNodeId,
  inlineEditCaretIndex,
  inlineEditPageIndex,
  inlineEditVisualLocked,
  inlineEditDocumentVisualReady,
  inlineEditPageIndexRef,
  setInlineEditPageIndex,
  requestInlineEditPageFollow,
}: {
  authoritativePaginated: PaginatedDocument
  previewDoc: DocumentNode
  inlineEditNodeId: string | null
  inlineEditCaretIndex: number | null
  inlineEditPageIndex: number | null
  inlineEditVisualLocked: boolean
  inlineEditDocumentVisualReady: boolean
  inlineEditPageIndexRef: MutableRefObject<number | null>
  setInlineEditPageIndex: (pageIndex: number | null) => void
  requestInlineEditPageFollow: (pageIndex: number) => void
}) {
  const inlineEditFragmentRanges = useMemo(() => (
    inlineEditNodeId
      ? getWysiwygParagraphFragmentRanges(authoritativePaginated, inlineEditNodeId)
      : []
  ), [authoritativePaginated, inlineEditNodeId])

  useEffect(() => {
    if (!inlineEditNodeId || inlineEditCaretIndex === null) return
    if (inlineEditVisualLocked || !inlineEditDocumentVisualReady) return
    const nextPageIndex = findWysiwygPageIndexInFragmentRanges(inlineEditFragmentRanges, inlineEditCaretIndex, {
      preferPreviousPageAtFragmentEnd: isParagraphInsideTableCell(previewDoc, inlineEditNodeId),
    })
    if (nextPageIndex === null || nextPageIndex === inlineEditPageIndex) return
    const previousPageIndex = inlineEditPageIndexRef.current
    inlineEditPageIndexRef.current = nextPageIndex
    setInlineEditPageIndex(nextPageIndex)
    if (shouldFollowInlineEditPageChange({ previousPageIndex, nextPageIndex })) {
      requestInlineEditPageFollow(nextPageIndex)
    }
  }, [
    inlineEditCaretIndex,
    inlineEditDocumentVisualReady,
    inlineEditFragmentRanges,
    inlineEditNodeId,
    inlineEditPageIndex,
    inlineEditPageIndexRef,
    inlineEditVisualLocked,
    previewDoc,
    requestInlineEditPageFollow,
    setInlineEditPageIndex,
  ])
}
