import type * as React from "react"
import type { MutableRefObject, ReactNode, RefObject } from "react"
import type { PageFragment, ParagraphRenderProps } from "@/pagination"
import { resolveFontCssFamily } from "@/font-registry"
import { buildSplitEditInput } from "./inlineEditSurfaceState"
import type { ListLevelChangeDirection } from "./wysiwygTextInteraction"
import {
  normalizeWysiwygTextInputKey,
  WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID,
} from "./useWysiwygTextSession"
import type { WysiwygTextInputKey, WysiwygTextSelection } from "./useWysiwygTextSession"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import type { WysiwygDraftSyncPayload } from "./wysiwygDraftSyncState"
import type { ParagraphTextSurfaceStructuralEditGuard } from "./structuralEdit/paragraphTextSurfaceFallbackBridge"
import { canStartParagraphTextSurfaceStructuralEdit } from "./paragraphTextSurfaceStructuralEdit"
import {
  INLINE_EDIT_TEXT_COLOR,
  fontStyleForRenderProps,
  fontWeightForRenderProps,
  renderListMarker,
  textAlignForParagraph,
  textDecorationForRenderProps,
} from "./WysiwygTextRenderPrimitives"

interface WysiwygNativeDraftState {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null | undefined
}

interface WysiwygNativeEditLayerProps {
  activePointerFragmentCount: number
  applyNativeTextareaDraft: (textarea: HTMLTextAreaElement, options?: { defer?: boolean }) => void
  clipPathId?: string
  draftStateRef: MutableRefObject<WysiwygNativeDraftState>
  flowdocDraftCaret: ReactNode
  flowdocDraftLineVisual: ReactNode
  flowdocDraftReflowKind?: WysiwygTextReflowDecision["kind"] | null
  flowdocDraftSelectionCollapsed: boolean
  flowdocDraftState: WysiwygNativeDraftState
  flowdocDraftVisualFragment: PageFragment | null
  flushPendingDraftSyncImmediately: () => boolean
  fragment: PageFragment
  hasNativeHeightHandoff: boolean
  isComposingTextEngineRef: MutableRefObject<boolean>
  isListItem: boolean
  layerRef: RefObject<SVGGElement | null>
  nativeContentWidth: number
  nativeContentX: number
  nativeContentY: number
  nativeEditHeight: number
  nativeFirstLineY: number | undefined
  nativeFontSize: number
  nativeForeignObjectRef: RefObject<SVGForeignObjectElement | null>
  nativeHitAreaRef: RefObject<SVGRectElement | null>
  nativeLineHeight: number
  nativeMeasuredTextBlockHeight: number
  nativeOutlineRef: RefObject<SVGRectElement | null>
  nativeRenderedEditHeight: number
  nativeTextareaRef: RefObject<HTMLTextAreaElement | null>
  nativeTextColor: string
  nativeVisualFragment: PageFragment
  onBackspaceListItemAtStart?: (nodeId: string, text?: string, caretIndex?: number | null) => void
  onCanStartStructuralEdit?: ParagraphTextSurfaceStructuralEditGuard
  onChangeListItemLevel?: (nodeId: string, direction: ListLevelChangeDirection, text?: string, caretIndex?: number | null) => void
  onEndEdit?: (nodeId: string, reason?: "blur" | "keyboard") => void
  onExitListItem?: (nodeId: string, text?: string) => void
  onMergeParagraph?: (nodeId: string, text?: string) => void
  onRichTextShortcut?: (nodeId: string, input: WysiwygTextInputKey) => boolean
  onSplitParagraph?: (nodeId: string, splitIndex: number, text?: string) => void
  pageKey: string
  relaxNativeEditClip: boolean
  renderProps: ParagraphRenderProps | undefined
  reflowKind?: WysiwygTextReflowDecision["kind"]
  scale: number
  scheduleBlurEndEdit: () => void
  scheduleDraftSync: (payload: WysiwygDraftSyncPayload, options?: {
    defer?: boolean
    quietWindowMs?: number
    maxLagMs?: number
  }) => boolean
  scheduleNativeTextareaGeometrySync: (textarea?: HTMLTextAreaElement | null, source?: string) => void
  setFlowdocDraftSnapshot: (next: WysiwygDraftSyncPayload) => void
  shouldUseFlowdocDraftLines: boolean
  syncNativeTextareaGeometry: (textarea?: HTMLTextAreaElement | null, source?: string) => void
}

export function WysiwygNativeEditLayer({
  activePointerFragmentCount,
  applyNativeTextareaDraft,
  clipPathId,
  draftStateRef,
  flowdocDraftCaret,
  flowdocDraftLineVisual,
  flowdocDraftReflowKind,
  flowdocDraftSelectionCollapsed,
  flowdocDraftState,
  flowdocDraftVisualFragment,
  flushPendingDraftSyncImmediately,
  fragment,
  hasNativeHeightHandoff,
  isComposingTextEngineRef,
  isListItem,
  layerRef,
  nativeContentWidth,
  nativeContentX,
  nativeContentY,
  nativeEditHeight,
  nativeFirstLineY,
  nativeFontSize,
  nativeForeignObjectRef,
  nativeHitAreaRef,
  nativeLineHeight,
  nativeMeasuredTextBlockHeight,
  nativeOutlineRef,
  nativeRenderedEditHeight,
  nativeTextareaRef,
  nativeTextColor,
  nativeVisualFragment,
  onBackspaceListItemAtStart,
  onCanStartStructuralEdit,
  onChangeListItemLevel,
  onEndEdit,
  onExitListItem,
  onMergeParagraph,
  onRichTextShortcut,
  onSplitParagraph,
  pageKey,
  relaxNativeEditClip,
  renderProps,
  reflowKind,
  scale,
  scheduleBlurEndEdit,
  scheduleDraftSync,
  scheduleNativeTextareaGeometrySync,
  setFlowdocDraftSnapshot,
  shouldUseFlowdocDraftLines,
  syncNativeTextareaGeometry,
}: WysiwygNativeEditLayerProps) {
  return (
    <g
      ref={layerRef}
      data-wysiwyg-text-engine-layer="true"
      data-wysiwyg-pointer-fragment-count={activePointerFragmentCount}
      data-wysiwyg-reflow-kind={reflowKind ?? flowdocDraftReflowKind}
      data-wysiwyg-active-visual-mode={shouldUseFlowdocDraftLines ? "flowdoc-draft-lines" : "native-edit-layer"}
      data-wysiwyg-active-visual-detail={shouldUseFlowdocDraftLines ? "flowdoc-measured-draft" : "native-textarea"}
      data-wysiwyg-line-count={nativeVisualFragment.lines?.length ?? 0}
      data-wysiwyg-flowdoc-draft-line-count={flowdocDraftVisualFragment?.lines?.length ?? 0}
      data-wysiwyg-flowdoc-draft-text-length={shouldUseFlowdocDraftLines ? flowdocDraftState.text.length : undefined}
      data-wysiwyg-flowdoc-draft-caret-offset={shouldUseFlowdocDraftLines ? flowdocDraftState.caretOffset ?? undefined : undefined}
      data-wysiwyg-flowdoc-draft-selection-start={shouldUseFlowdocDraftLines
        ? flowdocDraftState.selection?.anchorOffset ?? flowdocDraftState.caretOffset ?? undefined
        : undefined}
      data-wysiwyg-flowdoc-draft-selection-end={shouldUseFlowdocDraftLines
        ? flowdocDraftState.selection?.focusOffset ?? flowdocDraftState.caretOffset ?? undefined
        : undefined}
      data-wysiwyg-flowdoc-draft-selection-collapsed={shouldUseFlowdocDraftLines ? String(flowdocDraftSelectionCollapsed) : undefined}
      data-wysiwyg-native-visible-text={shouldUseFlowdocDraftLines ? "false" : "true"}
      data-wysiwyg-custom-caret-visible={flowdocDraftCaret ? "true" : undefined}
      data-wysiwyg-native-edit-layer="true"
      data-wysiwyg-native-edit-x={nativeContentX}
      data-wysiwyg-native-edit-y={nativeContentY}
      data-wysiwyg-native-edit-fragment-y={nativeVisualFragment.y}
      data-wysiwyg-native-edit-first-line-y={nativeFirstLineY}
      data-wysiwyg-native-edit-measured-text-block-height={nativeMeasuredTextBlockHeight}
      data-wysiwyg-native-edit-width={nativeContentWidth}
      data-wysiwyg-native-edit-height={nativeRenderedEditHeight / scale}
      data-wysiwyg-native-height-handoff={hasNativeHeightHandoff ? "true" : "false"}
      data-wysiwyg-native-edit-clip-mode={relaxNativeEditClip ? "relaxed" : "fragment"}
      data-inline-edit-node-id={fragment.nodeId}
      data-inline-edit-visual-mode={shouldUseFlowdocDraftLines ? "flowdoc-draft-lines" : "native-edit-layer"}
      clipPath={relaxNativeEditClip ? undefined : `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
      role="presentation"
    >
      {renderListMarker(nativeVisualFragment, renderProps, pageKey, scale, clipPathId)}
      {flowdocDraftLineVisual}
      {flowdocDraftCaret}
      <rect
        ref={nativeHitAreaRef}
        data-wysiwyg-hit-area="true"
        x={nativeContentX * scale}
        y={nativeContentY * scale}
        width={nativeContentWidth * scale}
        height={nativeRenderedEditHeight}
        fill="transparent"
        pointerEvents="none"
      />
      <rect
        ref={nativeOutlineRef}
        data-wysiwyg-native-edit-outline="true"
        x={nativeContentX * scale}
        y={nativeContentY * scale}
        width={nativeContentWidth * scale}
        height={nativeRenderedEditHeight}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1}
        opacity={0.35}
        pointerEvents="none"
      />
      <foreignObject
        ref={nativeForeignObjectRef}
        data-wysiwyg-native-edit-foreign-object="true"
        x={nativeContentX * scale}
        y={nativeContentY * scale}
        width={nativeContentWidth * scale}
        height={nativeRenderedEditHeight}
        style={{ overflow: "visible" }}
      >
        <textarea
          ref={nativeTextareaRef}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...{ xmlns: "http://www.w3.org/1999/xhtml" } as any}
          data-wysiwyg-input-bridge="true"
          data-wysiwyg-native-edit-textarea="true"
          data-wysiwyg-native-visible-text={shouldUseFlowdocDraftLines ? "false" : "true"}
          data-inline-edit-node-id={fragment.nodeId}
          data-inline-edit-visual-mode={shouldUseFlowdocDraftLines ? "flowdoc-draft-lines-input-bridge" : "native-edit-layer"}
          aria-label="WYSIWYG text input"
          aria-describedby={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
          role="textbox"
          defaultValue={draftStateRef.current.text}
          spellCheck={false}
          rows={1}
          style={{
            width: "100%",
            height: nativeRenderedEditHeight,
            minHeight: nativeEditHeight,
            display: "block",
            boxSizing: "border-box",
            padding: 0,
            margin: 0,
            border: "none",
            outline: "1px solid rgba(37, 99, 235, 0.35)",
            outlineOffset: 0,
            resize: "none",
            overflow: "hidden",
            background: "transparent",
            color: shouldUseFlowdocDraftLines ? "transparent" : nativeTextColor,
            caretColor: shouldUseFlowdocDraftLines ? "transparent" : INLINE_EDIT_TEXT_COLOR,
            ...({ fieldSizing: "content" } as React.CSSProperties),
            fontFamily: resolveFontCssFamily(renderProps?.fontFamilyKey),
            fontWeight: fontWeightForRenderProps(renderProps),
            fontStyle: fontStyleForRenderProps(renderProps),
            textDecoration: textDecorationForRenderProps(renderProps),
            fontSize: nativeFontSize,
            lineHeight: `${nativeLineHeight}px`,
            textAlign: textAlignForParagraph(renderProps?.align),
            textIndent: `${(renderProps?.textIndent ?? 0) * scale}px`,
            letterSpacing: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            wordBreak: "normal",
          }}
          onInput={(event) => {
            const textarea = event.currentTarget
            syncNativeTextareaGeometry(textarea, "input-sync")
            applyNativeTextareaDraft(textarea, { defer: true })
            scheduleNativeTextareaGeometrySync(textarea, "input-after-paint")
          }}
          onSelect={(event) => {
            const textarea = event.currentTarget
            const selectionStart = textarea.selectionStart ?? textarea.value.length
            const selectionEnd = textarea.selectionEnd ?? selectionStart
            draftStateRef.current = {
              text: textarea.value,
              caretOffset: selectionEnd,
              selection: selectionStart === selectionEnd
                ? null
                : { anchorOffset: selectionStart, focusOffset: selectionEnd },
            }
            if (shouldUseFlowdocDraftLines) {
              setFlowdocDraftSnapshot({
                text: textarea.value,
                caretOffset: selectionEnd,
                selection: selectionStart === selectionEnd
                  ? null
                  : { anchorOffset: selectionStart, focusOffset: selectionEnd },
              })
            }
          }}
          onBlur={() => {
            scheduleBlurEndEdit()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            const textarea = event.currentTarget
            const keyInput = {
              key: normalizeWysiwygTextInputKey(event.key),
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              isComposing: event.nativeEvent.isComposing,
            }
            if (onRichTextShortcut?.(fragment.nodeId, keyInput)) {
              event.preventDefault()
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              applyNativeTextareaDraft(textarea, { defer: false })
              flushPendingDraftSyncImmediately()
              onEndEdit?.(fragment.nodeId, "keyboard")
              return
            }
            if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              const selectionStart = textarea.selectionStart ?? textarea.value.length
              const selectionEnd = textarea.selectionEnd ?? selectionStart
              const input = buildSplitEditInput("", textarea.value, selectionStart, selectionEnd)
              if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                key: "Enter",
                operation: "split",
                nodeId: fragment.nodeId,
                caretIndex: input.splitIndex,
                isComposing: event.nativeEvent.isComposing,
                hasActiveComposition: isComposingTextEngineRef.current,
                currentActiveNodeId: fragment.nodeId,
                expectedNodeExists: true,
                source: "paragraph-text-surface:native-edit-layer-enter",
              })) {
                return
              }
              draftStateRef.current = { text: input.text, caretOffset: input.splitIndex, selection: null }
              scheduleDraftSync({ text: input.text, caretOffset: input.splitIndex, selection: null }, { defer: false })
              if (isListItem && input.text.length === 0) {
                onExitListItem?.(fragment.nodeId, input.text)
                return
              }
              onSplitParagraph?.(fragment.nodeId, input.splitIndex, input.text)
              return
            }
            if (event.key === "Tab" && isListItem && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault()
              applyNativeTextareaDraft(textarea, { defer: false })
              onChangeListItemLevel?.(
                fragment.nodeId,
                event.shiftKey ? "outdent" : "indent",
                textarea.value,
                textarea.selectionEnd ?? textarea.value.length,
              )
              return
            }
            if (
              event.key === "Backspace" &&
              !event.shiftKey &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.nativeEvent.isComposing &&
              (textarea.selectionStart ?? 0) === 0 &&
              (textarea.selectionEnd ?? 0) === 0
            ) {
              if (isListItem) {
                event.preventDefault()
                if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                  key: "Backspace",
                  operation: textarea.value.length === 0 ? "delete-empty" : "merge",
                  nodeId: fragment.nodeId,
                  caretIndex: 0,
                  isComposing: event.nativeEvent.isComposing,
                  hasActiveComposition: isComposingTextEngineRef.current,
                  currentActiveNodeId: fragment.nodeId,
                  expectedNodeExists: true,
                  removedNodeStillExists: true,
                  source: "paragraph-text-surface:native-edit-layer-list-backspace",
                })) {
                  return
                }
                applyNativeTextareaDraft(textarea, { defer: false })
                onBackspaceListItemAtStart?.(fragment.nodeId, textarea.value, 0)
                return
              }
              event.preventDefault()
              if (!canStartParagraphTextSurfaceStructuralEdit(onCanStartStructuralEdit, {
                key: "Backspace",
                operation: textarea.value.length === 0 ? "delete-empty" : "merge",
                nodeId: fragment.nodeId,
                caretIndex: 0,
                isComposing: event.nativeEvent.isComposing,
                hasActiveComposition: isComposingTextEngineRef.current,
                currentActiveNodeId: fragment.nodeId,
                expectedNodeExists: true,
                removedNodeStillExists: true,
                source: "paragraph-text-surface:native-edit-layer-backspace",
              })) {
                return
              }
              applyNativeTextareaDraft(textarea, { defer: false })
              onMergeParagraph?.(fragment.nodeId, textarea.value)
            }
          }}
          onCompositionStart={() => {
            isComposingTextEngineRef.current = true
          }}
          onCompositionEnd={(event) => {
            isComposingTextEngineRef.current = false
            syncNativeTextareaGeometry(event.currentTarget, "composition-sync")
            applyNativeTextareaDraft(event.currentTarget, { defer: true })
            scheduleNativeTextareaGeometrySync(event.currentTarget, "composition-after-paint")
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </foreignObject>
    </g>
  )
}
