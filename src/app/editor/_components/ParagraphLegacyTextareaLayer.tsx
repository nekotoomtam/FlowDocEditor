import type { Dispatch, MutableRefObject, PointerEvent, ReactNode, RefObject, SetStateAction } from "react"
import type { TextMeasurer } from "@/layout"
import type { PageFragment, ParagraphRenderProps } from "@/pagination"
import type { ParagraphNode } from "@/schema"
import { resolveFontCssFamily } from "@/font-registry"
import { classifyInlineEditKey, getInlineEditInputSnapshot } from "./wysiwygTextInteraction"
import type { InlineEditSelectionSnapshot, ListLevelChangeDirection } from "./wysiwygTextInteraction"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import {
  EDIT_CHROME_X,
  EDIT_CHROME_Y,
  buildContinuationBackspaceInput,
  buildSplitEditInput,
  focusElementWithoutScroll,
  shouldUseNativeInlineEditEnter,
  shouldUseNativeTableCellBoundaryBackspace,
  type InlineEditVisualMode,
} from "./inlineEditSurfaceState"
import {
  fontStyleForRenderProps,
  fontWeightForRenderProps,
  renderLine,
  renderSegmentDebug,
  textAlignForParagraph,
  textDecorationForRenderProps,
} from "./WysiwygTextRenderPrimitives"
import { renderSelectionOverlay } from "./WysiwygSelectionOverlayLayer"
import { canStartParagraphTextSurfaceStructuralEdit } from "./paragraphTextSurfaceStructuralEdit"

interface ParagraphLegacyTextareaLayerProps {
  fragment: PageFragment
  displayFragment: PageFragment
  renderProps: ParagraphRenderProps | undefined
  paragraphNode: ParagraphNode | null
  pageKey: string
  clipPathId?: string
  scale: number
  textMeasurer?: TextMeasurer
  listMarkerVisual: ReactNode
  customCaret: ReactNode
  visualMode: InlineEditVisualMode
  selectionOverlayRects: Parameters<typeof renderSelectionOverlay>[3]
  passiveTextEngineSelectionFragment: PageFragment
  passiveTextEngineSelectionOverlayRects: Parameters<typeof renderSelectionOverlay>[3]
  showTextSegments: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  pointerSelectionAnchorRef: MutableRefObject<number | null>
  editSliceKey: string
  editText: string
  preText: string
  postText: string
  fullText: string | null
  continuationCharStart: number | null
  continuationCharEnd: number | null
  textareaContentX: number
  textareaContentWidth: number
  textareaPadding: string
  activeEditHeight: number
  fontSize: number
  lineHeight: number
  isEditingPlainText: boolean
  isListItem: boolean
  isTableCellParagraph: boolean
  isComposing: boolean
  wysiwygInlineEditEnabled: boolean
  wysiwygTextEngineEnabled: boolean
  isCurrentEditSlice: (el: HTMLTextAreaElement) => boolean
  markUserEditInteraction: () => void
  resolveLocalOffsetFromPointer: (event: PointerEvent<HTMLTextAreaElement>) => number | null
  setIsSelectionCollapsed: Dispatch<SetStateAction<boolean>>
  setSelectionSnapshot: Dispatch<SetStateAction<InlineEditSelectionSnapshot | null>>
  setIsComposing: Dispatch<SetStateAction<boolean>>
  setTextareaPointerSelection: (el: HTMLTextAreaElement, anchor: number, focus: number) => void
  syncTextareaHeight: (el: HTMLTextAreaElement) => void
  updateCaret: (el: HTMLTextAreaElement) => void
  onChange: (nodeId: string, text: string, caretIndex: number | null) => void
  onEndEdit: (nodeId: string, reason?: "blur" | "keyboard") => void
  onSplitParagraph: (nodeId: string, splitIndex: number, text?: string) => void
  onMergeParagraph: (nodeId: string, text?: string) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onExitListItem?: (nodeId: string, text?: string) => void
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
}

export function ParagraphLegacyTextareaLayer({
  fragment,
  displayFragment,
  renderProps,
  paragraphNode,
  pageKey,
  clipPathId,
  scale,
  listMarkerVisual,
  customCaret,
  visualMode,
  selectionOverlayRects,
  passiveTextEngineSelectionFragment,
  passiveTextEngineSelectionOverlayRects,
  showTextSegments,
  textareaRef,
  pointerSelectionAnchorRef,
  editSliceKey,
  editText,
  preText,
  postText,
  fullText,
  continuationCharStart,
  continuationCharEnd,
  textareaContentX,
  textareaContentWidth,
  textareaPadding,
  activeEditHeight,
  fontSize,
  lineHeight,
  isEditingPlainText,
  isListItem,
  isTableCellParagraph,
  isComposing,
  wysiwygInlineEditEnabled,
  wysiwygTextEngineEnabled,
  isCurrentEditSlice,
  markUserEditInteraction,
  resolveLocalOffsetFromPointer,
  setIsSelectionCollapsed,
  setSelectionSnapshot,
  setIsComposing,
  setTextareaPointerSelection,
  syncTextareaHeight,
  updateCaret,
  onChange,
  onEndEdit,
  onSplitParagraph,
  onMergeParagraph,
  onCanStartStructuralEdit,
  onExitListItem,
  onChangeListItemLevel,
  onBackspaceListItemAtStart,
}: ParagraphLegacyTextareaLayerProps) {
  if (!isEditingPlainText) {
    return [
      listMarkerVisual,
      ...renderSelectionOverlay(passiveTextEngineSelectionFragment, pageKey, scale, passiveTextEngineSelectionOverlayRects, clipPathId),
      ...(displayFragment.lines?.map((line, index) =>
        renderLine(line, index, displayFragment, renderProps, pageKey, scale, undefined, clipPathId),
      ) ?? []),
      ...(showTextSegments ? renderSegmentDebug(displayFragment.lines, displayFragment, renderProps, scale) ?? [] : []),
    ]
  }

  return (
    <>
      {listMarkerVisual}
      {visualMode.useDocumentVisual && renderSelectionOverlay(displayFragment, pageKey, scale, selectionOverlayRects, clipPathId)}
      {visualMode.useDocumentVisual && displayFragment.lines?.map((line, index) =>
        renderLine(line, index, displayFragment, renderProps, pageKey, scale, undefined, clipPathId),
      )}
      {showTextSegments && renderSegmentDebug(displayFragment.lines, displayFragment, renderProps, scale)}
      <foreignObject
        x={textareaContentX * scale - EDIT_CHROME_X}
        y={displayFragment.y * scale - EDIT_CHROME_Y}
        width={textareaContentWidth * scale + EDIT_CHROME_X * 2}
        height={activeEditHeight + EDIT_CHROME_Y * 2}
      >
        <textarea
          key={editSliceKey}
          ref={textareaRef}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
          autoFocus
          spellCheck={false}
          rows={1}
          defaultValue={editText}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            borderRadius: 2,
            display: "block",
            fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
            fontWeight: fontWeightForRenderProps(renderProps),
            fontStyle: fontStyleForRenderProps(renderProps),
            textDecoration: textDecorationForRenderProps(renderProps),
            fontSize,
            lineHeight: `${lineHeight}px`,
            textAlign: textAlignForParagraph(renderProps?.align),
            color: visualMode.textareaTextColor,
            caretColor: visualMode.textareaCaretColor,
            resize: "none",
            overflow: "hidden",
            padding: textareaPadding,
            margin: 0,
            boxSizing: "border-box",
            outline: visualMode.textareaOutline,
            outlineOffset: visualMode.textareaOutlineOffset,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            wordBreak: "normal",
          }}
          onInput={(event) => {
            const el = event.currentTarget
            if (!isCurrentEditSlice(el)) return
            markUserEditInteraction()
            const snapshot = getInlineEditInputSnapshot(el, preText, postText)
            setIsSelectionCollapsed(snapshot.isSelectionCollapsed)
            setSelectionSnapshot(snapshot.selection)
            syncTextareaHeight(el)
            onChange(fragment.nodeId, snapshot.text, snapshot.caretOffset)
          }}
          onSelect={(event) => {
            const el = event.currentTarget
            if (!isCurrentEditSlice(el)) return
            el.scrollTop = 0
            updateCaret(el)
          }}
          onBlur={() => onEndEdit(fragment.nodeId, "blur")}
          onKeyDown={(event) => {
            event.stopPropagation()
            const el = event.currentTarget
            if (!isCurrentEditSlice(el)) return
            markUserEditInteraction()
            const decision = classifyInlineEditKey({
              key: event.key,
              shiftKey: event.shiftKey,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
              isComposing: event.nativeEvent.isComposing,
              selectionStart: el.selectionStart,
              selectionEnd: el.selectionEnd,
              valueLength: el.value.length,
            }, {
              plainEnterBehavior: shouldUseNativeInlineEditEnter(isListItem) ? "native" : "split-paragraph",
              listTabBehavior: isListItem ? "change-list-level" : "native",
            })

            if (decision.action === "native") return

            if (decision.action === "end-edit") {
              event.preventDefault()
              onEndEdit(fragment.nodeId, "keyboard")
              return
            }

            if (decision.action === "split-paragraph") {
              event.preventDefault()
              const snapshot = getInlineEditInputSnapshot(el, preText, postText)
              if (isListItem && snapshot.text.length === 0 && snapshot.isSelectionCollapsed) {
                onChange(fragment.nodeId, snapshot.text, 0)
                onExitListItem?.(fragment.nodeId, snapshot.text)
                return
              }
              const selectionStart = el.selectionStart ?? el.value.length
              const selectionEnd = el.selectionEnd ?? selectionStart
              const input = buildSplitEditInput(preText, el.value, selectionStart, selectionEnd, postText)
              if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                key: "Enter",
                operation: "split",
                nodeId: fragment.nodeId,
                caretIndex: input.splitIndex,
                isComposing: event.nativeEvent.isComposing,
                hasActiveComposition: isComposing,
                currentActiveNodeId: fragment.nodeId,
                expectedNodeExists: paragraphNode !== null,
                source: "paragraph-text-surface:legacy-textarea-enter",
              })) {
                return
              }
              onChange(fragment.nodeId, input.text, input.splitIndex)
              onSplitParagraph(fragment.nodeId, input.splitIndex, input.text)
              return
            }

            if (decision.action === "change-list-level") {
              event.preventDefault()
              const snapshot = getInlineEditInputSnapshot(el, preText, postText)
              onChangeListItemLevel?.(
                fragment.nodeId,
                decision.direction,
                snapshot.text,
                snapshot.caretOffset,
              )
              return
            }

            if (decision.action === "merge-or-boundary-backspace") {
              const continuationBackspace = buildContinuationBackspaceInput(preText, el.value, postText)
              if (continuationBackspace) {
                event.preventDefault()
                onChange(fragment.nodeId, continuationBackspace.text, continuationBackspace.caretIndex)
                return
              }

              if (isListItem) {
                event.preventDefault()
                const snapshot = getInlineEditInputSnapshot(el, preText, postText)
                if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                  key: "Backspace",
                  operation: snapshot.text.length === 0 ? "delete-empty" : "merge",
                  nodeId: fragment.nodeId,
                  caretIndex: snapshot.caretOffset,
                  isComposing: event.nativeEvent.isComposing,
                  hasActiveComposition: isComposing,
                  currentActiveNodeId: fragment.nodeId,
                  expectedNodeExists: paragraphNode !== null,
                  removedNodeStillExists: paragraphNode !== null,
                  source: "paragraph-text-surface:legacy-textarea-list-backspace",
                })) {
                  return
                }
                onChange(fragment.nodeId, snapshot.text, snapshot.caretOffset)
                onBackspaceListItemAtStart?.(fragment.nodeId, snapshot.text, snapshot.caretOffset)
                return
              }
              if (shouldUseNativeTableCellBoundaryBackspace(isTableCellParagraph, preText)) return
              event.preventDefault()
              const text = preText + el.value + postText
              if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                key: "Backspace",
                operation: text.length === 0 ? "delete-empty" : "merge",
                nodeId: fragment.nodeId,
                caretIndex: 0,
                isComposing: event.nativeEvent.isComposing,
                hasActiveComposition: isComposing,
                currentActiveNodeId: fragment.nodeId,
                expectedNodeExists: paragraphNode !== null,
                removedNodeStillExists: paragraphNode !== null,
                source: "paragraph-text-surface:legacy-textarea-backspace",
              })) {
                return
              }
              onChange(fragment.nodeId, text, 0)
              onMergeParagraph(fragment.nodeId, text)
            }
          }}
          onKeyUp={(event) => {
            if (event.nativeEvent.isComposing) return
            updateCaret(event.currentTarget)
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation()
            if (!wysiwygInlineEditEnabled || isComposing || event.button !== 0) return
            const offset = resolveLocalOffsetFromPointer(event)
            if (offset === null) return
            event.preventDefault()
            pointerSelectionAnchorRef.current = offset
            focusElementWithoutScroll(event.currentTarget)
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setTextareaPointerSelection(event.currentTarget, offset, offset)
          }}
          onPointerMove={(event) => {
            if (pointerSelectionAnchorRef.current === null || (event.buttons & 1) === 0) return
            const offset = resolveLocalOffsetFromPointer(event)
            if (offset === null) return
            event.preventDefault()
            event.stopPropagation()
            setTextareaPointerSelection(event.currentTarget, pointerSelectionAnchorRef.current, offset)
          }}
          onPointerUp={(event) => {
            if (pointerSelectionAnchorRef.current === null) return
            event.stopPropagation()
            event.currentTarget.releasePointerCapture?.(event.pointerId)
            pointerSelectionAnchorRef.current = null
          }}
          onPointerCancel={() => {
            pointerSelectionAnchorRef.current = null
          }}
          onCompositionStart={() => {
            setIsComposing(true)
            markUserEditInteraction()
          }}
          onCompositionEnd={(event) => {
            setIsComposing(false)
            updateCaret(event.currentTarget)
          }}
          data-inline-edit-node-id={fragment.nodeId}
          data-inline-edit-slice-key={editSliceKey}
          data-inline-edit-slice-start={continuationCharStart ?? 0}
          data-inline-edit-slice-end={continuationCharEnd ?? (fullText ?? "").length}
          data-wysiwyg-inline-edit-enabled={wysiwygInlineEditEnabled ? "true" : "false"}
          data-wysiwyg-text-engine-enabled={wysiwygTextEngineEnabled ? "true" : "false"}
          data-inline-edit-visual-mode={visualMode.useDocumentVisual ? "document" : "textarea"}
          data-inline-edit-fallback-reason={visualMode.fallbackReason ?? undefined}
        />
      </foreignObject>
      {customCaret}
    </>
  )
}
