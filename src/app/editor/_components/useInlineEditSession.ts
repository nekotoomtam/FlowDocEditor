"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DocumentNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import { decideInlineEditStart, shouldFinalizeInlineEditBlur } from "./inlineEditBlur"

export interface InlineEditTransaction {
  nodeId: string
  beforeDoc: DocumentNode
  beforePaginated: PaginatedDocument
  beforeText: string
}

export interface InlineEditHistoryEntry {
  doc: DocumentNode
  paginated: PaginatedDocument
}

export interface InlineEditCommitPayload extends InlineEditTransaction {
  afterPaginated: PaginatedDocument
}

export type InlineEditEndReason = "blur" | "keyboard"

export function isInlineEditVisualFresh(
  nodeId: string | null,
  draftVersion: number,
  visualVersion: number,
): boolean {
  return nodeId === null || visualVersion >= draftVersion
}

interface UseInlineEditSessionOptions {
  getCurrentDoc: () => DocumentNode
  getCurrentPaginated: () => PaginatedDocument
  getParagraphText: (doc: DocumentNode, nodeId: string) => string | null
  paginatePreviewDoc: (doc: DocumentNode) => PaginatedDocument
  selectNode: (nodeId: string) => void
  updateInlineTextDraft: (nodeId: string, text: string) => void
  commitInlineTextEdit: (payload: InlineEditCommitPayload) => void
  setPaginated: (paginated: PaginatedDocument) => void
}

export function useInlineEditSession({
  getCurrentDoc,
  getCurrentPaginated,
  getParagraphText,
  paginatePreviewDoc,
  selectNode,
  updateInlineTextDraft,
  commitInlineTextEdit,
  setPaginated,
}: UseInlineEditSessionOptions) {
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [caretIndex, setCaretIndex] = useState<number | null>(null)
  const [pageIndex, setPageIndexState] = useState<number | null>(null)
  const [draftVersion, setDraftVersion] = useState(0)
  const [visualVersion, setVisualVersion] = useState(0)

  const nodeIdRef = useRef<string | null>(null)
  const transactionRef = useRef<InlineEditTransaction | null>(null)
  const endFrameRef = useRef<number | null>(null)
  const draftVersionRef = useRef(0)
  const visualVersionRef = useRef(0)

  const setActiveNodeId = useCallback((nextNodeId: string | null) => {
    nodeIdRef.current = nextNodeId
    setNodeId(nextNodeId)
  }, [])

  const setPageIndex = useCallback((nextPageIndex: number | null) => {
    setPageIndexState(nextPageIndex)
  }, [])

  const cancelPendingEnd = useCallback(() => {
    if (endFrameRef.current === null || typeof cancelAnimationFrame === "undefined") return
    cancelAnimationFrame(endFrameRef.current)
    endFrameRef.current = null
  }, [])

  const resetVisualFreshness = useCallback(() => {
    draftVersionRef.current = 0
    visualVersionRef.current = 0
    setDraftVersion(0)
    setVisualVersion(0)
  }, [])

  const markDraftChanged = useCallback(() => {
    const nextVersion = draftVersionRef.current + 1
    draftVersionRef.current = nextVersion
    setDraftVersion(nextVersion)
    return nextVersion
  }, [])

  const markVisualFresh = useCallback((version: number) => {
    visualVersionRef.current = version
    setVisualVersion(version)
  }, [])

  const clearSessionState = useCallback(() => {
    setActiveNodeId(null)
    setCaretIndex(null)
    setPageIndex(null)
    resetVisualFreshness()
  }, [resetVisualFreshness, setActiveNodeId, setPageIndex])

  const finalizeBeforeAction = useCallback((): boolean => {
    cancelPendingEnd()
    const transaction = transactionRef.current
    if (transaction) {
      const afterDoc = getCurrentDoc()
      commitInlineTextEdit({
        ...transaction,
        afterPaginated: paginatePreviewDoc(afterDoc),
      })
      transactionRef.current = null
    }
    clearSessionState()
    return transaction !== null
  }, [cancelPendingEnd, clearSessionState, commitInlineTextEdit, getCurrentDoc, paginatePreviewDoc])

  const resetForDocumentReplace = useCallback(() => {
    cancelPendingEnd()
    transactionRef.current = null
    clearSessionState()
  }, [cancelPendingEnd, clearSessionState])

  useEffect(() => cancelPendingEnd, [cancelPendingEnd])

  const end = useCallback((blurredNodeId?: string, reason: InlineEditEndReason = "keyboard") => {
    if (reason !== "blur") {
      finalizeBeforeAction()
      return
    }

    const nodeIdToCheck = blurredNodeId ?? nodeIdRef.current
    if (!nodeIdToCheck || typeof document === "undefined" || typeof requestAnimationFrame === "undefined") {
      finalizeBeforeAction()
      return
    }

    cancelPendingEnd()
    endFrameRef.current = requestAnimationFrame(() => {
      endFrameRef.current = requestAnimationFrame(() => {
        endFrameRef.current = null
        const active = document.activeElement
        const focusedNodeId = active instanceof HTMLTextAreaElement
          ? active.dataset.inlineEditNodeId ?? null
          : null
        if (!shouldFinalizeInlineEditBlur(nodeIdToCheck, nodeIdRef.current, focusedNodeId)) return
        finalizeBeforeAction()
      })
    })
  }, [cancelPendingEnd, finalizeBeforeAction])

  const start = useCallback((nextNodeId: string, nextCaretIndex: number | null = null, nextPageIndex: number | null = null) => {
    const startDecision = decideInlineEditStart(
      nodeIdRef.current,
      nextNodeId,
      transactionRef.current !== null,
    )

    if (startDecision === "continue-current") {
      cancelPendingEnd()
      selectNode(nextNodeId)
      setCaretIndex(nextCaretIndex)
      setPageIndex(nextPageIndex)
      return
    }

    if (startDecision === "finalize-previous") {
      finalizeBeforeAction()
    }

    const beforeDoc = getCurrentDoc()
    const beforeText = getParagraphText(beforeDoc, nextNodeId)
    if (beforeText == null) return

    resetVisualFreshness()
    transactionRef.current = {
      nodeId: nextNodeId,
      beforeDoc,
      beforePaginated: getCurrentPaginated(),
      beforeText,
    }
    selectNode(nextNodeId)
    setActiveNodeId(nextNodeId)
    setCaretIndex(nextCaretIndex)
    setPageIndex(nextPageIndex)
  }, [
    cancelPendingEnd,
    finalizeBeforeAction,
    getCurrentDoc,
    getCurrentPaginated,
    getParagraphText,
    resetVisualFreshness,
    selectNode,
    setActiveNodeId,
    setPageIndex,
  ])

  const change = useCallback((changedNodeId: string, text: string, nextCaretIndex: number | null) => {
    markDraftChanged()
    setCaretIndex(nextCaretIndex)
    updateInlineTextDraft(changedNodeId, text)
  }, [markDraftChanged, updateInlineTextDraft])

  const userInteraction = useCallback((changedNodeId: string) => {
    if (nodeIdRef.current !== changedNodeId) return
    // The visual layer remains owned by paginated document rendering; this hook
    // only records that the active input session is still current.
  }, [])

  const caretChange = useCallback((changedNodeId: string, nextCaretIndex: number | null) => {
    if (nodeIdRef.current !== changedNodeId) return
    setCaretIndex(nextCaretIndex)
  }, [])

  const heightChange = useCallback((changedNodeId: string, height: number, nextPageIndex: number | null) => {
    if (nodeIdRef.current !== changedNodeId) return
    void height
    void nextPageIndex
  }, [])

  const consumeHistory = useCallback((targetNodeId: string): InlineEditHistoryEntry | undefined => {
    const transaction = transactionRef.current
    if (!transaction || transaction.nodeId !== targetNodeId) return undefined
    transactionRef.current = null
    return {
      doc: transaction.beforeDoc,
      paginated: transaction.beforePaginated,
    }
  }, [])

  const startAfterStructuralChange = useCallback((nextNodeId: string, nextCaretIndex: number | null) => {
    cancelPendingEnd()
    const beforeDoc = getCurrentDoc()
    const beforeText = getParagraphText(beforeDoc, nextNodeId)
    if (beforeText == null) return

    const beforePaginated = paginatePreviewDoc(beforeDoc)
    setPaginated(beforePaginated)
    transactionRef.current = {
      nodeId: nextNodeId,
      beforeDoc,
      beforePaginated,
      beforeText,
    }
    resetVisualFreshness()
    setActiveNodeId(nextNodeId)
    setCaretIndex(nextCaretIndex)
    setPageIndex(null)
  }, [
    cancelPendingEnd,
    getCurrentDoc,
    getParagraphText,
    paginatePreviewDoc,
    resetVisualFreshness,
    setActiveNodeId,
    setPageIndex,
    setPaginated,
  ])

  return {
    nodeId,
    caretIndex,
    pageIndex,
    draftVersion,
    visualVersion,
    isVisualFresh: isInlineEditVisualFresh(nodeId, draftVersion, visualVersion),
    nodeIdRef,
    draftVersionRef,
    visualVersionRef,
    markVisualFresh,
    setPageIndex,
    finalizeBeforeAction,
    resetForDocumentReplace,
    end,
    start,
    change,
    userInteraction,
    caretChange,
    heightChange,
    consumeHistory,
    startAfterStructuralChange,
  }
}
