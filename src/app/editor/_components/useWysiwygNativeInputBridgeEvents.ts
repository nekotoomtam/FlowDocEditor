import { useEffect } from "react"
import type { MutableRefObject, RefObject } from "react"
import { hasPlatformShortcutModifier, isEditorHistoryShortcut } from "./keyboardShortcuts"
import { canStartParagraphTextSurfaceStructuralEdit } from "./paragraphTextSurfaceStructuralEdit"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import {
  normalizeWysiwygTextInputKey,
  type WysiwygTextInputKey,
  type WysiwygTextSelection,
} from "./useWysiwygTextSession"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import { classifyInlineEditKey, resolveStructuralListEnterInput } from "./wysiwygTextInteraction"
import type { WysiwygDraftSyncPayload } from "./wysiwygDraftSyncState"

interface WysiwygNativeInputDraftState {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null | undefined
}

interface UseWysiwygNativeInputBridgeEventsInput {
  inputBridgeRef: RefObject<HTMLDivElement | null>
  nodeId: string
  isListItem: boolean
  isComposingTextEngineRef: MutableRefObject<boolean>
  suppressNextCompositionInputRef: MutableRefObject<boolean>
  draftStateRef: MutableRefObject<WysiwygNativeInputDraftState>
  pendingDraftSyncRef: MutableRefObject<WysiwygDraftSyncPayload | null>
  applyClipboardCutToDraft: () => string | null
  applyKeyInput: (input: WysiwygTextInputKey) => boolean
  applyTextInput: (insertedText: string) => boolean
  applyVerticalKeyInput: (input: WysiwygTextInputKey) => boolean
  cancelScheduledDraftSyncFrame: () => void
  clearInputBridgeText: (input?: HTMLElement | null) => void
  flushPendingDraftSyncImmediately: () => boolean
  getSelectedDraftText: () => string
  handleClipboardShortcutKeyDown: (event: KeyboardEvent) => boolean
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onEndEdit?: (nodeId: string, reason?: "blur" | "keyboard") => void
  onExitListItem?: (nodeId: string, text?: string) => void
  onMergeParagraph?: (nodeId: string, text?: string) => void
  onRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
}

export function useWysiwygNativeInputBridgeEvents(input: UseWysiwygNativeInputBridgeEventsInput) {
  const {
    applyClipboardCutToDraft,
    applyKeyInput,
    applyTextInput,
    applyVerticalKeyInput,
    cancelScheduledDraftSyncFrame,
    clearInputBridgeText,
    draftStateRef,
    flushPendingDraftSyncImmediately,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
    inputBridgeRef,
    isComposingTextEngineRef,
    isListItem,
    nodeId,
    onBackspaceListItemAtStart,
    onCanStartStructuralEdit,
    onChangeListItemLevel,
    onEndEdit,
    onExitListItem,
    onMergeParagraph,
    onRichTextShortcut,
    onSplitParagraph,
    pendingDraftSyncRef,
    suppressNextCompositionInputRef,
  } = input

  useEffect(() => {
    const inputElement = inputBridgeRef.current
    if (!inputElement) return

    const isCompositionBridgeInput = (event: InputEvent) => (
      event.isComposing ||
      isComposingTextEngineRef.current ||
      event.inputType === "insertCompositionText" ||
      event.inputType === "deleteCompositionText"
    )

    const consumeSuppressedCompositionInput = () => {
      if (!suppressNextCompositionInputRef.current) return false
      suppressNextCompositionInputRef.current = false
      clearInputBridgeText(inputElement)
      return true
    }

    const startCompositionInput = () => {
      isComposingTextEngineRef.current = true
      suppressNextCompositionInputRef.current = false
      clearInputBridgeText(inputElement)
    }

    const endCompositionInput = (committedText: string) => {
      isComposingTextEngineRef.current = false
      clearInputBridgeText(inputElement)
      if (!committedText) {
        suppressNextCompositionInputRef.current = false
        return false
      }
      suppressNextCompositionInputRef.current = true
      return applyTextInput(committedText)
    }

    const clearPendingDraftSync = () => {
      cancelScheduledDraftSyncFrame()
      pendingDraftSyncRef.current = null
    }

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      if (isEditorHistoryShortcut(event)) {
        flushPendingDraftSyncImmediately()
        return
      }
      event.stopPropagation()
      if (event.key === "Escape") {
        event.preventDefault()
        flushPendingDraftSyncImmediately()
        onEndEdit?.(nodeId, "keyboard")
        return
      }
      if (handleClipboardShortcutKeyDown(event)) return
      const keyInput = {
        key: normalizeWysiwygTextInputKey(event.key),
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
      }
      if (hasPlatformShortcutModifier(keyInput)) flushPendingDraftSyncImmediately()
      if (onRichTextShortcut?.(nodeId, keyInput)) {
        event.preventDefault()
        return
      }
      if (
        isListItem &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing &&
        !isComposingTextEngineRef.current
      ) {
        event.preventDefault()
        const current = draftStateRef.current
        const structuralInput = resolveStructuralListEnterInput(
          current.text,
          current.caretOffset,
          current.selection ?? null,
        )
        if (
          structuralInput.action !== "exit-list" &&
          !canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
            key: "Enter",
            operation: "split",
            nodeId,
            caretIndex: structuralInput.splitIndex,
            isComposing: event.isComposing,
            hasActiveComposition: isComposingTextEngineRef.current,
            currentActiveNodeId: nodeId,
            expectedNodeExists: true,
            source: "paragraph-text-surface:text-engine-list-enter",
          })
        ) {
          return
        }
        clearPendingDraftSync()
        if (structuralInput.action === "exit-list") {
          onExitListItem?.(nodeId, structuralInput.text)
        } else {
          onSplitParagraph?.(nodeId, structuralInput.splitIndex, structuralInput.text)
        }
        return
      }
      const listLevelDecision = classifyInlineEditKey({
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing || isComposingTextEngineRef.current,
      }, {
        listTabBehavior: isListItem ? "change-list-level" : "native",
      })
      if (listLevelDecision.action === "change-list-level") {
        event.preventDefault()
        const current = draftStateRef.current
        clearPendingDraftSync()
        onChangeListItemLevel?.(
          nodeId,
          listLevelDecision.direction,
          current.text,
          current.caretOffset,
        )
        return
      }
      if (
        event.key === "Backspace" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.isComposing &&
        !isComposingTextEngineRef.current
      ) {
        const current = draftStateRef.current
        const selection = current.selection
        const isCollapsedAtStart = current.caretOffset === 0 &&
          (!selection || (selection.anchorOffset === 0 && selection.focusOffset === 0))
        if (isCollapsedAtStart && (isListItem || onMergeParagraph)) {
          event.preventDefault()
          if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
            key: "Backspace",
            operation: current.text.length === 0 ? "delete-empty" : "merge",
            nodeId,
            caretIndex: 0,
            isComposing: event.isComposing,
            hasActiveComposition: isComposingTextEngineRef.current,
            currentActiveNodeId: nodeId,
            expectedNodeExists: true,
            removedNodeStillExists: true,
            source: isListItem
              ? "paragraph-text-surface:text-engine-list-backspace"
              : "paragraph-text-surface:text-engine-backspace",
          })) {
            return
          }
          clearPendingDraftSync()
          if (isListItem) {
            onBackspaceListItemAtStart?.(nodeId, current.text, 0)
          } else {
            onMergeParagraph?.(nodeId, current.text)
          }
          return
        }
      }
      const isVerticalNavigation = event.key === "ArrowUp" || event.key === "ArrowDown"
      const handled = applyVerticalKeyInput(keyInput) || applyKeyInput(keyInput)
      if (!handled) {
        if (isVerticalNavigation) event.preventDefault()
        return
      }
      event.preventDefault()
    }

    const handleNativeBeforeInput = (event: InputEvent) => {
      event.stopPropagation()
      if (consumeSuppressedCompositionInput()) {
        event.preventDefault()
        return
      }
      if (isCompositionBridgeInput(event)) return
      let handled = false
      if (event.inputType === "insertText" && event.data) {
        handled = applyTextInput(event.data)
      } else if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
        handled = applyKeyInput({ key: "Enter" })
      } else if (event.inputType === "deleteContentBackward") {
        handled = applyKeyInput({ key: "Backspace" })
      } else if (event.inputType === "deleteContentForward") {
        handled = applyKeyInput({ key: "Delete" })
      }
      if (!handled) return
      event.preventDefault()
      clearInputBridgeText(inputElement)
    }

    const handleNativeInput = (event: InputEvent) => {
      event.stopPropagation()
      if (consumeSuppressedCompositionInput()) return
      if (isComposingTextEngineRef.current) return
      const insertedText = inputElement.textContent ?? ""
      clearInputBridgeText(inputElement)
      applyTextInput(insertedText)
    }

    const handleNativePaste = (event: ClipboardEvent) => {
      event.stopPropagation()
      event.preventDefault()
      clearInputBridgeText(inputElement)
      applyTextInput(event.clipboardData?.getData("text/plain") ?? "")
    }

    const handleNativeCopy = (event: ClipboardEvent) => {
      const selectedText = getSelectedDraftText()
      if (!selectedText || !event.clipboardData) return
      event.stopPropagation()
      event.preventDefault()
      event.clipboardData.setData("text/plain", selectedText)
    }

    const handleNativeCut = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const selectedText = applyClipboardCutToDraft()
      if (!selectedText) return
      event.stopPropagation()
      event.preventDefault()
      event.clipboardData.setData("text/plain", selectedText)
      clearInputBridgeText(inputElement)
    }

    const handleNativeCompositionStart = (event: CompositionEvent) => {
      event.stopPropagation()
      startCompositionInput()
    }

    const handleNativeCompositionEnd = (event: CompositionEvent) => {
      event.stopPropagation()
      endCompositionInput(event.data || inputElement.textContent || "")
    }

    inputElement.addEventListener("keydown", handleNativeKeyDown)
    inputElement.addEventListener("beforeinput", handleNativeBeforeInput)
    inputElement.addEventListener("input", handleNativeInput)
    inputElement.addEventListener("paste", handleNativePaste)
    inputElement.addEventListener("copy", handleNativeCopy)
    inputElement.addEventListener("cut", handleNativeCut)
    inputElement.addEventListener("compositionstart", handleNativeCompositionStart)
    inputElement.addEventListener("compositionend", handleNativeCompositionEnd)
    return () => {
      inputElement.removeEventListener("keydown", handleNativeKeyDown)
      inputElement.removeEventListener("beforeinput", handleNativeBeforeInput)
      inputElement.removeEventListener("input", handleNativeInput)
      inputElement.removeEventListener("paste", handleNativePaste)
      inputElement.removeEventListener("copy", handleNativeCopy)
      inputElement.removeEventListener("cut", handleNativeCut)
      inputElement.removeEventListener("compositionstart", handleNativeCompositionStart)
      inputElement.removeEventListener("compositionend", handleNativeCompositionEnd)
    }
  }, [
    applyClipboardCutToDraft,
    applyKeyInput,
    applyTextInput,
    applyVerticalKeyInput,
    cancelScheduledDraftSyncFrame,
    clearInputBridgeText,
    draftStateRef,
    flushPendingDraftSyncImmediately,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
    inputBridgeRef,
    isComposingTextEngineRef,
    isListItem,
    nodeId,
    onBackspaceListItemAtStart,
    onCanStartStructuralEdit,
    onChangeListItemLevel,
    onEndEdit,
    onExitListItem,
    onMergeParagraph,
    onRichTextShortcut,
    onSplitParagraph,
    pendingDraftSyncRef,
    suppressNextCompositionInputRef,
  ])
}
