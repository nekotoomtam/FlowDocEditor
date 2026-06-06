import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react"
import type { DocumentNode } from "@/schema"
import {
  WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"
import {
  describeWysiwygTextSessionAccessibility,
  useWysiwygTextSession,
  type WysiwygTextSelection,
} from "../useWysiwygTextSession"
import {
  projectRichTextDraftSessionToWysiwygTextSession,
  useWysiwygRichTextDraftSession,
} from "../richTextDraftSession"
import type {
  WysiwygDraftRuntime,
  WysiwygDraftSession,
  WysiwygDraftSessionIdentity,
  WysiwygDraftSessionSource,
} from "../runtime/wysiwygDraftRuntime"
import {
  beginTrackedWysiwygDraftRuntimeSessionBridge,
  cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge,
} from "../wysiwygDraftRuntimeBridge"
import {
  getParagraphFromDoc,
  getParagraphTextFromDoc,
} from "./editorDocumentLookup"

export function useEditorWysiwygTextSessionController({
  docRef,
  wysiwygDraftRuntime,
  wysiwygDraftSessionIdentityRef,
}: {
  docRef: MutableRefObject<DocumentNode>
  wysiwygDraftRuntime: WysiwygDraftRuntime
  wysiwygDraftSessionIdentityRef: MutableRefObject<WysiwygDraftSessionIdentity | null>
}) {
  const {
    state: plainWysiwygTextSessionState,
    start: startPlainWysiwygTextSession,
    startFromText: startPlainWysiwygTextSessionFromText,
    changeDraft: changePlainWysiwygTextDraft,
    moveCaret: movePlainWysiwygTextCaret,
    end: endPlainWysiwygTextSession,
  } = useWysiwygTextSession({
    enabled: WYSIWYG_TEXT_ENGINE_ENABLED,
    getParagraphText: (nodeId) => getParagraphTextFromDoc(docRef.current, nodeId),
  })

  const {
    state: richWysiwygDraftSessionState,
    start: startRichWysiwygDraftSession,
    changeDraft: changeRichWysiwygDraft,
    moveCaret: moveRichWysiwygDraftCaret,
    applyStyleCommand: applyRichWysiwygDraftStyleCommand,
    end: endRichWysiwygDraftSession,
  } = useWysiwygRichTextDraftSession({
    enabled: WYSIWYG_TEXT_ENGINE_ENABLED && WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
    getParagraph: (nodeId) => getParagraphFromDoc(docRef.current, nodeId),
  })

  const richWysiwygTextSessionProjection = useMemo(
    () => projectRichTextDraftSessionToWysiwygTextSession(richWysiwygDraftSessionState),
    [richWysiwygDraftSessionState],
  )
  const wysiwygTextSessionState = WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygTextSessionProjection.nodeId
    ? richWysiwygTextSessionProjection
    : plainWysiwygTextSessionState

  const beginWysiwygDraftRuntimeSession = useCallback((input: {
    nodeId: string
    mode: WysiwygDraftSession["mode"]
    source: WysiwygDraftSessionSource
    initialTextLength?: number
    caretIndex?: number | null
    selection?: WysiwygTextSelection | null
    textVersion?: number
    structuralTransactionId?: string | null
    structuralGeneration?: number | null
  }): WysiwygDraftSession => {
    return beginTrackedWysiwygDraftRuntimeSessionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      {
        ...input,
        timestamp: startWysiwygPerfSpan(),
      },
    )
  }, [wysiwygDraftRuntime, wysiwygDraftSessionIdentityRef])

  const cancelCurrentWysiwygDraftRuntimeSession = useCallback((reason: string) => {
    cancelCurrentTrackedWysiwygDraftRuntimeSessionBridge(
      wysiwygDraftRuntime,
      wysiwygDraftSessionIdentityRef,
      reason,
      startWysiwygPerfSpan(),
    )
  }, [wysiwygDraftRuntime, wysiwygDraftSessionIdentityRef])

  const startWysiwygTextSession = useCallback((nodeId: string, caretOffset: number | null = null, pageIndex: number | null = null) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED) {
      const started = startRichWysiwygDraftSession(nodeId, caretOffset, pageIndex)
      if (started) {
        endPlainWysiwygTextSession()
        beginWysiwygDraftRuntimeSession({
          nodeId,
          mode: "rich-text",
          source: "flowdoc-draft-island",
          initialTextLength: getParagraphTextFromDoc(docRef.current, nodeId)?.length,
          caretIndex: caretOffset,
        })
      }
      return started
    }
    const started = startPlainWysiwygTextSession(nodeId, caretOffset, pageIndex)
    if (started) {
      endRichWysiwygDraftSession()
      beginWysiwygDraftRuntimeSession({
        nodeId,
        mode: "plain-text",
        source: "flowdoc-draft-island",
        initialTextLength: getParagraphTextFromDoc(docRef.current, nodeId)?.length,
        caretIndex: caretOffset,
      })
    }
    return started
  }, [
    beginWysiwygDraftRuntimeSession,
    docRef,
    endPlainWysiwygTextSession,
    endRichWysiwygDraftSession,
    startPlainWysiwygTextSession,
    startRichWysiwygDraftSession,
  ])

  const changeWysiwygTextDraft = useCallback((change: Parameters<typeof changePlainWysiwygTextDraft>[0]) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionState.nodeId) {
      changeRichWysiwygDraft(change)
      return
    }
    changePlainWysiwygTextDraft(change)
  }, [
    changePlainWysiwygTextDraft,
    changeRichWysiwygDraft,
    richWysiwygDraftSessionState.nodeId,
  ])

  const moveWysiwygTextCaret = useCallback((caretOffset: number | null, selection?: Parameters<typeof movePlainWysiwygTextCaret>[1]) => {
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionState.nodeId) {
      moveRichWysiwygDraftCaret(caretOffset, selection)
      return
    }
    movePlainWysiwygTextCaret(caretOffset, selection)
  }, [
    movePlainWysiwygTextCaret,
    moveRichWysiwygDraftCaret,
    richWysiwygDraftSessionState.nodeId,
  ])

  const endWysiwygTextSession = useCallback(() => {
    cancelCurrentWysiwygDraftRuntimeSession("end-wysiwyg-text-session")
    endPlainWysiwygTextSession()
    endRichWysiwygDraftSession()
  }, [cancelCurrentWysiwygDraftRuntimeSession, endPlainWysiwygTextSession, endRichWysiwygDraftSession])

  const wysiwygTextAccessibilityStatus = useMemo(
    () => describeWysiwygTextSessionAccessibility(wysiwygTextSessionState),
    [wysiwygTextSessionState],
  )
  const wysiwygTextSessionStateRef = useRef(wysiwygTextSessionState)
  const richWysiwygDraftSessionStateRef = useRef(richWysiwygDraftSessionState)

  useEffect(() => { wysiwygTextSessionStateRef.current = wysiwygTextSessionState }, [wysiwygTextSessionState])
  useEffect(() => { richWysiwygDraftSessionStateRef.current = richWysiwygDraftSessionState }, [richWysiwygDraftSessionState])

  return {
    richWysiwygDraftSessionState,
    wysiwygTextSessionState,
    wysiwygTextSessionStateRef,
    richWysiwygDraftSessionStateRef,
    wysiwygTextAccessibilityStatus,
    startPlainWysiwygTextSessionFromText,
    applyRichWysiwygDraftStyleCommand,
    endRichWysiwygDraftSession,
    beginWysiwygDraftRuntimeSession,
    startWysiwygTextSession,
    changeWysiwygTextDraft,
    moveWysiwygTextCaret,
    endWysiwygTextSession,
  }
}
