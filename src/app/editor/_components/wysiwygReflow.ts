import type { PageFragment, PaginatedLine } from "@/pagination"

export type WysiwygTextReflowKind =
  | "soft"
  | "hard-local"
  | "hard-page-boundary"
  | "unsupported"

export type WysiwygTextReflowReason =
  | "same-fragment-lines"
  | "line-count-changed"
  | "height-changed"
  | "page-boundary"
  | "unsupported-fragment"
  | "missing-layout"

export interface WysiwygTextReflowDecision {
  kind: WysiwygTextReflowKind
  reason: WysiwygTextReflowReason
  shouldPatchActiveLines: boolean
  shouldPatchSamePageHeight: boolean
  shouldQueueSettledPagination: boolean
}

const HEIGHT_EPSILON = 0.5

function fragmentLineCount(fragment: PageFragment): number {
  if (fragment.lineStart != null && fragment.lineEnd != null) {
    return Math.max(0, fragment.lineEnd - fragment.lineStart)
  }
  return fragment.lines?.length ?? 0
}

export function classifyWysiwygTextReflow(input: {
  fragment: PageFragment
  draftLines?: PaginatedLine[] | null
  draftHeight?: number | null
  pageContentBottom?: number | null
  supportsLocalDraftLayout: boolean
}): WysiwygTextReflowDecision {
  if (!input.supportsLocalDraftLayout) {
    return {
      kind: "unsupported",
      reason: "unsupported-fragment",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    }
  }

  if (!input.draftLines || input.draftHeight == null) {
    return {
      kind: "unsupported",
      reason: "missing-layout",
      shouldPatchActiveLines: false,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: false,
    }
  }

  const draftBottom = input.fragment.y + input.draftHeight
  if (input.pageContentBottom != null && draftBottom > input.pageContentBottom + HEIGHT_EPSILON) {
    return {
      kind: "hard-page-boundary",
      reason: "page-boundary",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: false,
      shouldQueueSettledPagination: true,
    }
  }

  const lineCountChanged = input.draftLines.length !== fragmentLineCount(input.fragment)
  if (lineCountChanged) {
    return {
      kind: "hard-local",
      reason: "line-count-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: true,
      shouldQueueSettledPagination: false,
    }
  }

  if (Math.abs(input.draftHeight - input.fragment.height) >= HEIGHT_EPSILON) {
    return {
      kind: "hard-local",
      reason: "height-changed",
      shouldPatchActiveLines: true,
      shouldPatchSamePageHeight: true,
      shouldQueueSettledPagination: false,
    }
  }

  return {
    kind: "soft",
    reason: "same-fragment-lines",
    shouldPatchActiveLines: true,
    shouldPatchSamePageHeight: false,
    shouldQueueSettledPagination: false,
  }
}
