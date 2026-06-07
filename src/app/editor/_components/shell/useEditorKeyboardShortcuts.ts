import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react"
import type { EditorAction } from "../editorReducer"
import type { WysiwygTextInputKey } from "../useWysiwygTextSession"
import { WYSIWYG_RICH_TEXT_DRAFT_ENABLED } from "../wysiwygInlineEditConfig"
import {
  hasPlatformShortcutModifier,
  isEditorHistoryRedoShortcut,
  isEditorHistoryUndoShortcut,
  normalizeShortcutKey,
} from "../keyboardShortcuts"
import type {
  HeaderFooterEditMode,
  HeaderFooterReservedDrag,
  MarginDrag,
  MarginEditMode,
} from "../editorInteractionTypes"
import type { PendingDrag } from "./editorShellTypes"

type MutableCurrentRef<T> = {
  current: T
}

export function useEditorKeyboardShortcuts({
  dispatch,
  dispatchEditorAction,
  handleInlineEditEnd,
  handleRedo,
  handleUndo,
  handleWysiwygRichTextShortcut,
  headerFooterEditMode,
  headerFooterReservedDragRef,
  hasActiveDrag,
  inlineEditNodeId,
  isTemplateMode,
  marginDragRef,
  marginEditMode,
  pendingDragRef,
  resetZoom,
  selectedNodeId,
  setHeaderFooterEditMode,
  setHeaderFooterReservedDrag,
  setMarginDrag,
  setMarginEditMode,
  setRightRailModeToPage,
  clearSelectedStyleResource,
  wysiwygTextSessionNodeId,
  zoomIn,
  zoomOut,
}: {
  dispatch: (action: EditorAction) => void
  dispatchEditorAction: (action: EditorAction) => void
  handleInlineEditEnd: () => void
  handleRedo: () => void
  handleUndo: () => void
  handleWysiwygRichTextShortcut: (nodeId: string, input: WysiwygTextInputKey) => boolean
  headerFooterEditMode: HeaderFooterEditMode | null
  headerFooterReservedDragRef: MutableCurrentRef<HeaderFooterReservedDrag | null>
  hasActiveDrag: boolean
  inlineEditNodeId: string | null
  isTemplateMode: boolean
  marginDragRef: MutableCurrentRef<MarginDrag | null>
  marginEditMode: MarginEditMode | null
  pendingDragRef: MutableCurrentRef<PendingDrag | null>
  resetZoom: () => void
  selectedNodeId: string | null
  setHeaderFooterEditMode: (mode: HeaderFooterEditMode | null) => void
  setHeaderFooterReservedDrag: (drag: HeaderFooterReservedDrag | null) => void
  setMarginDrag: (drag: MarginDrag | null) => void
  setMarginEditMode: (mode: MarginEditMode | null) => void
  setRightRailModeToPage: () => void
  clearSelectedStyleResource: () => void
  wysiwygTextSessionNodeId: string | null
  zoomIn: () => void
  zoomOut: () => void
}) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent) => {
    const target = event.target as HTMLElement
    const tag = target.tagName
    const isTextInput = tag === "INPUT" || tag === "TEXTAREA"
    const isInlineEditorInput = target.getAttribute("data-inline-edit-node-id") != null
    const shortcutKey = normalizeShortcutKey(event)
    if (!isTextInput && WYSIWYG_RICH_TEXT_DRAFT_ENABLED && wysiwygTextSessionNodeId) {
      const handledRichTextShortcut = handleWysiwygRichTextShortcut(wysiwygTextSessionNodeId, {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
      if (handledRichTextShortcut) {
        event.preventDefault()
        return
      }
    }
    if (hasPlatformShortcutModifier(event) && !isTextInput) {
      if (shortcutKey === "+") {
        event.preventDefault()
        zoomIn()
        return
      }
      if (shortcutKey === "-") {
        event.preventDefault()
        zoomOut()
        return
      }
      if (shortcutKey === "0") {
        event.preventDefault()
        resetZoom()
        return
      }
    }
    if (event.key === "Escape") {
      if (inlineEditNodeId) {
        handleInlineEditEnd()
        return
      }
      if (marginDragRef.current && !marginDragRef.current.committed) {
        setMarginDrag(null)
        return
      }
      if (headerFooterReservedDragRef.current && !headerFooterReservedDragRef.current.committed) {
        setHeaderFooterReservedDrag(null)
        return
      }
      if (marginEditMode) {
        setMarginEditMode(null)
        return
      }
      if (headerFooterEditMode) {
        setHeaderFooterEditMode(null)
        return
      }
      if (hasActiveDrag) {
        dispatch({ type: "DRAG_CANCEL" })
      } else if (pendingDragRef.current) {
        pendingDragRef.current = null
      } else {
        clearSelectedStyleResource()
        dispatch({ type: "SELECT_NODE", nodeId: null })
        setRightRailModeToPage()
      }
    }
    if (event.key === "Delete" && selectedNodeId && !hasActiveDrag) {
      if (isTextInput) return
      event.preventDefault()
      dispatchEditorAction({ type: "DELETE_NODE", nodeId: selectedNodeId })
      setRightRailModeToPage()
    }
    if (isEditorHistoryUndoShortcut(event)) {
      if (isTextInput && !isInlineEditorInput) return
      event.preventDefault()
      if (!isTemplateMode) return
      handleUndo()
    }
    if (isEditorHistoryRedoShortcut(event)) {
      if (isTextInput && !isInlineEditorInput) return
      event.preventDefault()
      if (!isTemplateMode) return
      handleRedo()
    }
  }, [
    clearSelectedStyleResource,
    dispatch,
    dispatchEditorAction,
    handleInlineEditEnd,
    handleRedo,
    handleUndo,
    handleWysiwygRichTextShortcut,
    hasActiveDrag,
    headerFooterEditMode,
    headerFooterReservedDragRef,
    inlineEditNodeId,
    isTemplateMode,
    marginDragRef,
    marginEditMode,
    pendingDragRef,
    resetZoom,
    selectedNodeId,
    setHeaderFooterEditMode,
    setHeaderFooterReservedDrag,
    setMarginDrag,
    setMarginEditMode,
    setRightRailModeToPage,
    wysiwygTextSessionNodeId,
    zoomIn,
    zoomOut,
  ])

  return {
    handleKeyDown,
  }
}
