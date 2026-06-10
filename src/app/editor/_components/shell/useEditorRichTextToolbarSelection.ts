import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS,
  RICH_TEXT_TOOLBAR_SELECTION_MAX_WAIT_MS,
  areRichTextToolbarSelectionsEqual,
  resolveRichTextToolbarSelectionSnapshot,
  shouldDebounceRichTextToolbarSelection,
  type RichTextToolbarSelectionSnapshot,
} from "../richTextToolbarSelection"
import { useWysiwygDraftSelection, wysiwygDraftStore } from "./wysiwygDraftStore"

export function useEditorRichTextToolbarSelection() {
  const storeSelection = useWysiwygDraftSelection()
  const debounceRef = useRef<{ timeoutId: ReturnType<typeof setTimeout> | null, lastInvokeTime: number }>({ timeoutId: null, lastInvokeTime: 0 })
  const richTextToolbarLiveSelection = useMemo(
    () => resolveRichTextToolbarSelectionSnapshot(storeSelection.nodeId, storeSelection.selection),
    [storeSelection.nodeId, storeSelection.selection],
  )
  const [richTextToolbarSelection, setRichTextToolbarSelection] = useState<RichTextToolbarSelectionSnapshot | null>(richTextToolbarLiveSelection)

  const getRichTextToolbarLiveSelection = useCallback(() => {
    return resolveRichTextToolbarSelectionSnapshot(wysiwygDraftStore.getState().nodeId, wysiwygDraftStore.getState().selection)
  }, [])

  useEffect(() => {
    const time = Date.now()
    const state = debounceRef.current
    
    if (state.timeoutId) {
      clearTimeout(state.timeoutId)
      state.timeoutId = null
    } else {
      state.lastInvokeTime = time
    }

    const applySelection = () => {
      state.timeoutId = null
      state.lastInvokeTime = 0
      setRichTextToolbarSelection((current) => (
        areRichTextToolbarSelectionsEqual(current, richTextToolbarLiveSelection)
          ? current
          : richTextToolbarLiveSelection
      ))
    }

    if (!shouldDebounceRichTextToolbarSelection(richTextToolbarLiveSelection)) {
      applySelection()
      return
    }

    const timeSinceLastInvoke = time - state.lastInvokeTime
    if (timeSinceLastInvoke >= RICH_TEXT_TOOLBAR_SELECTION_MAX_WAIT_MS) {
      applySelection()
      state.lastInvokeTime = time
    } else {
      state.timeoutId = setTimeout(() => {
        applySelection()
      }, RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS)
    }

    return () => {
      if (state.timeoutId) {
        clearTimeout(state.timeoutId)
        state.timeoutId = null
      }
    }
  }, [richTextToolbarLiveSelection])

  useEffect(() => () => {
    if (debounceRef.current.timeoutId) {
      clearTimeout(debounceRef.current.timeoutId)
      debounceRef.current.timeoutId = null
    }
  }, [richTextToolbarLiveSelection])

  return {
    richTextToolbarSelection,
    getRichTextToolbarLiveSelection,
  }
}
