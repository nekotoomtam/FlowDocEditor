import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS,
  RICH_TEXT_TOOLBAR_SELECTION_MAX_WAIT_MS,
  areRichTextToolbarSelectionsEqual,
  resolveRichTextToolbarSelectionSnapshot,
  shouldDebounceRichTextToolbarSelection,
  type RichTextToolbarSelectionSnapshot,
} from "../richTextToolbarSelection"
import { wysiwygDraftStore } from "./wysiwygDraftStore"

function getWysiwygDraftToolbarSelectionSnapshot(): RichTextToolbarSelectionSnapshot | null {
  const state = wysiwygDraftStore.getState()
  return resolveRichTextToolbarSelectionSnapshot(state.nodeId, state.selection)
}

export function useEditorRichTextToolbarSelection() {
  const debounceRef = useRef<{ timeoutId: ReturnType<typeof setTimeout> | null, lastInvokeTime: number }>({ timeoutId: null, lastInvokeTime: 0 })
  const pendingSelectionRef = useRef<RichTextToolbarSelectionSnapshot | null>(null)
  const [richTextToolbarSelection, setRichTextToolbarSelection] = useState<RichTextToolbarSelectionSnapshot | null>(() => (
    getWysiwygDraftToolbarSelectionSnapshot()
  ))

  const getRichTextToolbarLiveSelection = useCallback(() => {
    return getWysiwygDraftToolbarSelectionSnapshot()
  }, [])

  const applySelection = useCallback((selection: RichTextToolbarSelectionSnapshot | null) => {
    setRichTextToolbarSelection((current) => (
      areRichTextToolbarSelectionsEqual(current, selection)
        ? current
        : selection
    ))
  }, [])
  const applySelectionRef = useRef(applySelection)
  applySelectionRef.current = applySelection

  const queueSelection = useCallback((selection: RichTextToolbarSelectionSnapshot | null) => {
    const time = Date.now()
    const state = debounceRef.current
    pendingSelectionRef.current = selection

    if (state.timeoutId) {
      clearTimeout(state.timeoutId)
      state.timeoutId = null
    } else {
      state.lastInvokeTime = time
    }

    const flushSelection = () => {
      state.timeoutId = null
      state.lastInvokeTime = 0
      applySelectionRef.current(pendingSelectionRef.current)
    }

    if (!shouldDebounceRichTextToolbarSelection(selection)) {
      flushSelection()
      return
    }

    const timeSinceLastInvoke = time - state.lastInvokeTime
    if (timeSinceLastInvoke >= RICH_TEXT_TOOLBAR_SELECTION_MAX_WAIT_MS) {
      flushSelection()
      state.lastInvokeTime = time
    } else {
      state.timeoutId = setTimeout(() => {
        flushSelection()
      }, RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = wysiwygDraftStore.subscribeDraft(() => {
      queueSelection(getWysiwygDraftToolbarSelectionSnapshot())
    })
    return () => {
      unsubscribe()
    }
  }, [queueSelection])

  useEffect(() => () => {
    if (debounceRef.current.timeoutId) {
      clearTimeout(debounceRef.current.timeoutId)
      debounceRef.current.timeoutId = null
    }
  }, [])

  return {
    richTextToolbarSelection,
    getRichTextToolbarLiveSelection,
  }
}
