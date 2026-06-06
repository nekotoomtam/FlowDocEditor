import { useCallback, type MutableRefObject } from "react"
import type { DocumentNode } from "@/schema"
import { replaceEditableParagraphInDocument } from "../wysiwygTextCommit"
import { resolvePersistableWysiwygDocument } from "../wysiwygDraftPersistence"
import type { WysiwygRichTextDraftSessionState } from "../richTextDraftSession"
import type { WysiwygTextSessionState } from "../useWysiwygTextSession"
import {
  recordFlowDocPerfEvent,
  startWysiwygPerfSpan,
} from "../wysiwygPerformance"
import {
  WYSIWYG_PERF_TRACE_ENABLED,
  WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import {
  summarizePreviewSettleShellMutationPlan,
  type BrowserPreviewShellMutationPlan,
  type DraftPreviewShellMutationPlan,
} from "../structuralEdit/previewSettleShellAdapter"

export function useEditorDocumentSnapshotActions({
  docRef,
  richWysiwygDraftSessionStateRef,
  wysiwygTextSessionStateRef,
}: {
  docRef: MutableRefObject<DocumentNode>
  richWysiwygDraftSessionStateRef: MutableRefObject<WysiwygRichTextDraftSessionState>
  wysiwygTextSessionStateRef: MutableRefObject<WysiwygTextSessionState>
}) {
  const getPersistableDocumentSnapshot = useCallback(() => {
    try {
      if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
        const richSession = richWysiwygDraftSessionStateRef.current
        if (richSession.nodeId && richSession.draft) {
          return replaceEditableParagraphInDocument(docRef.current, richSession.nodeId, richSession.draft.paragraph)
        }
      }
      return resolvePersistableWysiwygDocument(
        docRef.current,
        wysiwygTextSessionStateRef.current,
        WYSIWYG_TEXT_ENGINE_ENABLED,
      )
    } catch (error) {
      console.error("WYSIWYG draft persistence produced invalid document:", error)
      return docRef.current
    }
  }, [docRef, richWysiwygDraftSessionStateRef, wysiwygTextSessionStateRef])

  const recordPreviewSettleShellMutationPlan = useCallback((
    plan: DraftPreviewShellMutationPlan | BrowserPreviewShellMutationPlan,
    detail: Record<string, unknown> = {},
  ) => {
    recordFlowDocPerfEvent(WYSIWYG_PERF_TRACE_ENABLED, {
      name: "preview-settle:shell-mutation-plan",
      startMs: startWysiwygPerfSpan(),
      detail: {
        ...summarizePreviewSettleShellMutationPlan(plan),
        ...detail,
      },
    })
  }, [])

  return {
    getPersistableDocumentSnapshot,
    recordPreviewSettleShellMutationPlan,
  }
}
