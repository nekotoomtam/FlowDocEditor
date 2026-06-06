import { useEffect, useMemo, useRef, useState } from "react"
import type { WysiwygTextSelection } from "../useWysiwygTextSession"
import {
  RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS,
  areRichTextToolbarSelectionsEqual,
  resolveRichTextToolbarSelectionSnapshot,
  shouldDebounceRichTextToolbarSelection,
  type RichTextToolbarSelectionSnapshot,
} from "../richTextToolbarSelection"

export function useEditorRichTextToolbarSelection(
  nodeId: string | null,
  selection: WysiwygTextSelection | null,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const richTextToolbarLiveSelection = useMemo(
    () => resolveRichTextToolbarSelectionSnapshot(nodeId, selection),
    [nodeId, selection],
  )
  const [richTextToolbarSelection, setRichTextToolbarSelection] = useState<RichTextToolbarSelectionSnapshot | null>(richTextToolbarLiveSelection)

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    const applySelection = () => {
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

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      applySelection()
    }, RICH_TEXT_TOOLBAR_SELECTION_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [richTextToolbarLiveSelection])

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  return {
    richTextToolbarSelection,
    richTextToolbarLiveSelection,
  }
}
