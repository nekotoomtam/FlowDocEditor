import { useMemo } from "react"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { buildSelectionContext } from "../selectionContext"
import type { WysiwygPerfEvent } from "../wysiwygPerformance"
import {
  buildEditorPageNavigationIndex,
  findFirstPageIndexForNodeInIndex,
} from "./editorCanvasNavigation"

type StructuralShellRenderMetadata = Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">>

type CaptureStructuralShellRenderValue = <T>(
  action: string,
  compute: () => T,
  metadata?: (value: T) => StructuralShellRenderMetadata,
) => T

export function useEditorNavigationSelectionState({
  displayPaginated,
  doc,
  selectedNodeId,
  selectionAnchorNodeId,
  isTemplateMode,
  activeSectionIndex,
  captureStructuralShellRenderValue,
}: {
  displayPaginated: PaginatedDocument
  doc: DocumentNode
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  isTemplateMode: boolean
  activeSectionIndex: number
  captureStructuralShellRenderValue: CaptureStructuralShellRenderValue
}) {
  const editorPageNavigation = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:page-navigation",
      () => buildEditorPageNavigationIndex(displayPaginated),
      (navigation) => ({
        renderReason: "buildEditorPageNavigationIndex",
        pageCount: navigation.pageItems.length,
      }),
    )
  ), [captureStructuralShellRenderValue, displayPaginated])

  const editorPageItems = editorPageNavigation.pageItems
  const selectedContextItems = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:selection-context",
      () => (
        isTemplateMode
          ? buildSelectionContext(doc, selectionAnchorNodeId ?? selectedNodeId)
          : []
      ),
      (items) => ({
        renderReason: "buildSelectionContext",
        fragmentCount: items.length,
      }),
    )
  ), [captureStructuralShellRenderValue, doc, isTemplateMode, selectedNodeId, selectionAnchorNodeId])

  const selectedContextLabel = !isTemplateMode
    ? "Fill data"
    : selectedContextItems.length > 0
      ? selectedContextItems[selectedContextItems.length - 1].label
      : "Canvas"
  const selectedPageIndex = useMemo(() => (
    findFirstPageIndexForNodeInIndex(editorPageNavigation, selectionAnchorNodeId ?? selectedNodeId)
  ), [editorPageNavigation, selectedNodeId, selectionAnchorNodeId])
  const editorPageCount = editorPageItems.length
  const canvasSectionLabel = `Section ${activeSectionIndex + 1}`

  return {
    editorPageNavigation,
    editorPageItems,
    selectedContextLabel,
    selectedPageIndex,
    editorPageCount,
    canvasSectionLabel,
  }
}
