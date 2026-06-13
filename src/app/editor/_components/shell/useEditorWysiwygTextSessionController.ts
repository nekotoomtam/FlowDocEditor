import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react"
import type { DocumentNode } from "@/schema"
import {
  WYSIWYG_RICH_TEXT_DRAFT_ENABLED,
  WYSIWYG_TEXT_ENGINE_ENABLED,
} from "../wysiwygInlineEditConfig"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"
import {
  describeWysiwygTextSessionAccessibility,
  INACTIVE_WYSIWYG_TEXT_SESSION,
  useWysiwygTextSession,
  type WysiwygTextSelection,
} from "../useWysiwygTextSession"
import {
  INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION,
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
import { wysiwygDraftStore } from "./wysiwygDraftStore"

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
    stateRef: richWysiwygDraftSessionStateRef,
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
  const wysiwygTextSessionStateRef = useRef(wysiwygTextSessionState)

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
        const initialText = getParagraphTextFromDoc(docRef.current, nodeId) ?? ""
        wysiwygDraftStore.setState({
          nodeId,
          text: initialText,
          caretIndex: caretOffset,
          selection: null,
          source: "start-rich-text-session",
        })
        beginWysiwygDraftRuntimeSession({
          nodeId,
          mode: "rich-text",
          source: "flowdoc-draft-island",
          initialTextLength: initialText.length,
          caretIndex: caretOffset,
        })
      }
      return started
    }
    const started = startPlainWysiwygTextSession(nodeId, caretOffset, pageIndex)
    if (started) {
      endRichWysiwygDraftSession()
      const initialText = getParagraphTextFromDoc(docRef.current, nodeId) ?? ""
      wysiwygDraftStore.setState({
        nodeId,
        text: initialText,
        caretIndex: caretOffset,
        selection: null,
        source: "start-plain-text-session",
      })
      beginWysiwygDraftRuntimeSession({
        nodeId,
        mode: "plain-text",
        source: "flowdoc-draft-island",
        initialTextLength: initialText.length,
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
    wysiwygDraftStore.setState({
      text: change.text,
      caretIndex: change.caretOffset ?? null,
      selection: change.selection ?? null,
      source: "session-draft-change",
    })
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionStateRef.current.nodeId) {
      changeRichWysiwygDraft(change)
      return
    }
    changePlainWysiwygTextDraft(change)
  }, [
    changePlainWysiwygTextDraft,
    changeRichWysiwygDraft,
    richWysiwygDraftSessionStateRef,
  ])

  const moveWysiwygTextCaret = useCallback((caretOffset: number | null, selection?: Parameters<typeof movePlainWysiwygTextCaret>[1]) => {
    wysiwygDraftStore.setState({
      caretIndex: caretOffset,
      selection: selection ?? null,
      source: "session-caret-move",
    })
    if (WYSIWYG_RICH_TEXT_DRAFT_ENABLED && richWysiwygDraftSessionStateRef.current.nodeId) {
      moveRichWysiwygDraftCaret(caretOffset, selection)
      return
    }
    movePlainWysiwygTextCaret(caretOffset, selection)
  }, [
    movePlainWysiwygTextCaret,
    moveRichWysiwygDraftCaret,
    richWysiwygDraftSessionStateRef,
  ])

  const endWysiwygTextSession = useCallback(() => {
    wysiwygDraftStore.setState({
      nodeId: null,
      text: "",
      caretIndex: null,
      selection: null,
      source: "end-wysiwyg-text-session",
    })
    cancelCurrentWysiwygDraftRuntimeSession("end-wysiwyg-text-session")
    wysiwygTextSessionStateRef.current = INACTIVE_WYSIWYG_TEXT_SESSION
    richWysiwygDraftSessionStateRef.current = INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION
    endPlainWysiwygTextSession()
    endRichWysiwygDraftSession()
  }, [cancelCurrentWysiwygDraftRuntimeSession, endPlainWysiwygTextSession, endRichWysiwygDraftSession])

  const wysiwygTextAccessibilityStatus = useMemo(
    () => describeWysiwygTextSessionAccessibility(wysiwygTextSessionState),
    [wysiwygTextSessionState],
  )
  useEffect(() => { wysiwygTextSessionStateRef.current = wysiwygTextSessionState }, [wysiwygTextSessionState])

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
