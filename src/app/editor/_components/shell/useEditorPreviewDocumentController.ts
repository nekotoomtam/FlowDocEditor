import { useCallback, useEffect, useMemo } from "react"
import { bindDocumentWithSnapshot } from "@/binding"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import { assessDocumentDataReadiness } from "@/readiness"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { TextMeasurer } from "@/layout"
import type { DocumentNode } from "@/schema"
import { paginateDocument } from "@/pagination"
import {
  finishFlowDocPerfSpan,
  recordFlowDocPerfEvent,
  startWysiwygPerfSpan,
  type WysiwygPerfEvent,
} from "../wysiwygPerformance"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import { findSectionIndexForNode } from "./editorDocumentLookup"

type StructuralShellRenderMetadata = Partial<Omit<WysiwygPerfEvent, "kind" | "startedAt" | "durationMs" | "action">>

type CaptureStructuralShellRenderValue = <T>(
  action: string,
  compute: () => T,
  metadata?: (value: T) => StructuralShellRenderMetadata,
) => T

type PushStructuralShellRenderAttributionEvent = (
  action: string,
  startedAt: number,
  metadata?: StructuralShellRenderMetadata,
) => void

export function useEditorPreviewDocumentController({
  doc,
  selectedNodeId,
  mode,
  isTemplateMode,
  packageFieldRegistry,
  dataSnapshot,
  editorTextMeasurer,
  captureStructuralShellRenderValue,
  pushStructuralShellRenderAttributionEvent,
}: {
  doc: DocumentNode
  selectedNodeId: string | null
  mode: "template" | "fill"
  isTemplateMode: boolean
  packageFieldRegistry: FieldRegistryV1
  dataSnapshot: DataSnapshotV1
  editorTextMeasurer: TextMeasurer
  captureStructuralShellRenderValue: CaptureStructuralShellRenderValue
  pushStructuralShellRenderAttributionEvent: PushStructuralShellRenderAttributionEvent
}) {
  const activeSectionIndex = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:active-section-index",
      () => findSectionIndexForNode(doc, selectedNodeId),
      () => ({ renderReason: "findSectionIndexForNode" }),
    )
  ), [captureStructuralShellRenderValue, doc, selectedNodeId])

  const resolvePreviewDoc = useCallback((nextDoc: DocumentNode) => (
    isTemplateMode
      ? nextDoc
      : bindDocumentWithSnapshot(nextDoc, { registry: packageFieldRegistry, snapshot: dataSnapshot }).doc
  ), [dataSnapshot, isTemplateMode, packageFieldRegistry])

  const previewDoc = useMemo(() => {
    const startedAt = startWysiwygPerfSpan()
    const nextPreviewDoc = captureStructuralShellRenderValue(
      "shell-derived:resolve-preview-doc",
      () => resolvePreviewDoc(doc),
      () => ({ renderReason: "resolvePreviewDoc" }),
    )
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:preview-doc-create", startedAt, {
      mode,
      documentId: nextPreviewDoc.document.id,
    })
    pushStructuralShellRenderAttributionEvent("shell-derived:preview-doc", startedAt, {
      renderReason: "previewDoc",
    })
    return nextPreviewDoc
  }, [captureStructuralShellRenderValue, doc, mode, pushStructuralShellRenderAttributionEvent, resolvePreviewDoc])

  useEffect(() => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "pre-pagination:editor-shell-mounted",
      startMs: startWysiwygPerfSpan(),
      detail: {
        documentId: doc.document.id,
      },
    })
    // The first mount marker intentionally captures only the initial shell commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dataReadiness = useMemo(() => (
    captureStructuralShellRenderValue(
      "shell-derived:data-readiness",
      () => assessDocumentDataReadiness({
        doc,
        registry: packageFieldRegistry,
        snapshot: dataSnapshot,
      }),
      (readiness) => ({
        renderReason: "assessDocumentDataReadiness",
        fragmentCount: readiness.issues.length,
      }),
    )
  ), [captureStructuralShellRenderValue, dataSnapshot, doc, packageFieldRegistry])

  const paginatePreviewDoc = useCallback((nextDoc: DocumentNode) => (
    paginateDocument(resolvePreviewDoc(nextDoc), editorTextMeasurer)
  ), [editorTextMeasurer, resolvePreviewDoc])

  return {
    activeSectionIndex,
    resolvePreviewDoc,
    previewDoc,
    dataReadiness,
    paginatePreviewDoc,
  }
}
