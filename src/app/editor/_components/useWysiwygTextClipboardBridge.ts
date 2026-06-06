import { useCallback } from "react"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "./keyboardShortcuts"
import {
  applyWysiwygTextClipboardCut,
  getWysiwygTextSelectedText,
  type WysiwygTextSelection,
  type WysiwygTextSessionDraftChange,
} from "./useWysiwygTextSession"

interface WysiwygTextClipboardDraftState {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null | undefined
}

interface WysiwygTextClipboardShortcutEvent {
  key: string
  code?: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

interface UseWysiwygTextClipboardBridgeInput {
  draftStateRef: { current: WysiwygTextClipboardDraftState }
  applyDraftChange: (change: WysiwygTextSessionDraftChange | null) => boolean
  applyTextInput: (insertedText: string) => boolean
  clearInputBridgeText: (input?: HTMLElement | null) => void
}

export function useWysiwygTextClipboardBridge(input: UseWysiwygTextClipboardBridgeInput) {
  const {
    applyDraftChange,
    applyTextInput,
    clearInputBridgeText,
    draftStateRef,
  } = input

  const getSelectedDraftText = useCallback(() => {
    const current = draftStateRef.current
    return getWysiwygTextSelectedText(current.text, current.caretOffset, current.selection)
  }, [draftStateRef])

  const getClipboardCutDraft = useCallback(() => {
    const current = draftStateRef.current
    return applyWysiwygTextClipboardCut(current.text, current.caretOffset, current.selection)
  }, [draftStateRef])

  const applyClipboardCutToDraft = useCallback((cut = getClipboardCutDraft()) => {
    if (!cut || !applyDraftChange(cut.change)) return null
    return cut.selectedText
  }, [applyDraftChange, getClipboardCutDraft])

  const writeClipboardText = useCallback((text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return Promise.resolve(false)
    return navigator.clipboard.writeText(text).then(() => true, () => false)
  }, [])

  const readClipboardText = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return Promise.resolve("")
    return navigator.clipboard.readText().then((text) => text, () => "")
  }, [])

  const handleClipboardShortcutKeyDown = useCallback((event: WysiwygTextClipboardShortcutEvent) => {
    if (!hasPlatformShortcutModifier(event)) return false
    const key = normalizeShortcutKey(event)
    if (key !== "c" && key !== "x" && key !== "v") return false

    if (key === "v") {
      event.stopPropagation()
      event.preventDefault()
      void readClipboardText().then((pastedText) => {
        clearInputBridgeText()
        applyTextInput(pastedText)
      })
      return true
    }

    const cut = key === "x" ? getClipboardCutDraft() : null
    const selectedText = cut?.selectedText ?? getSelectedDraftText()
    if (!selectedText) return false

    event.stopPropagation()
    event.preventDefault()
    void writeClipboardText(selectedText).then((written) => {
      if (written && cut) {
        applyClipboardCutToDraft(cut)
        clearInputBridgeText()
      }
    })
    return true
  }, [
    applyClipboardCutToDraft,
    applyTextInput,
    clearInputBridgeText,
    getClipboardCutDraft,
    getSelectedDraftText,
    readClipboardText,
    writeClipboardText,
  ])

  return {
    applyClipboardCutToDraft,
    getSelectedDraftText,
    handleClipboardShortcutKeyDown,
  }
}
