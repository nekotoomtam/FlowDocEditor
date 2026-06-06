import type * as React from "react"
import type { Dispatch, MutableRefObject, ReactNode, RefObject, SetStateAction } from "react"
import { createPortal } from "react-dom"
import type { PageFragment, ParagraphRenderProps } from "@/pagination"
import { WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID } from "./useWysiwygTextSession"
import type { WysiwygTextSelection } from "./useWysiwygTextSession"
import type { WysiwygTextReflowDecision } from "./wysiwygReflow"
import type { WysiwygCaretVisualMode } from "./WysiwygTextRenderPrimitives"
import {
  renderListMarker,
  renderSegmentDebug,
} from "./WysiwygTextRenderPrimitives"
import { renderSelectionOverlay } from "./WysiwygSelectionOverlayLayer"

interface WysiwygFlowdocDraftState {
  text: string
  caretOffset: number | null
  selection: WysiwygTextSelection | null | undefined
}

interface WysiwygFlowdocDraftLayerProps {
  activeCaretVisualMode: WysiwygCaretVisualMode
  activePointerFragmentCount: number
  activePointerIdRef: MutableRefObject<number | null>
  cancelScheduledPointerSelection: () => void
  clipPathId?: string
  finishPointerSelection: (clientX: number, clientY: number) => void
  flowdocDraftCaret: ReactNode
  flowdocDraftLineVisual: ReactNode
  flowdocDraftReflowKind?: WysiwygTextReflowDecision["kind"] | null
  flowdocDraftSelectionCollapsed: boolean
  flowdocDraftSelectionOverlayRects: Parameters<typeof renderSelectionOverlay>[3]
  flowdocDraftState: WysiwygFlowdocDraftState
  flowdocDraftVisualFragment: PageFragment
  fragment: PageFragment
  handleClick: (event: React.MouseEvent<SVGGElement>) => void
  handleDoubleClick: (event: React.MouseEvent<SVGGElement>) => void
  handleLayerBlur: (event: React.FocusEvent<SVGGElement>) => void
  handlePointerCancel: () => void
  handlePointerDown: (event: React.PointerEvent<SVGGElement>) => void
  handlePointerMove: (event: React.PointerEvent<SVGGElement>) => void
  handlePointerSelectionWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  handlePointerUp: (event: React.PointerEvent<SVGGElement>) => void
  inputBridgeRef: RefObject<HTMLDivElement | null>
  isPointerSelecting: boolean
  layerRef: RefObject<SVGGElement | null>
  localPointerSelectionPreview: WysiwygTextSelection | null
  nativeContentWidth: number
  nativeContentX: number
  nativeContentY: number
  nativeRenderedEditHeight: number
  pageKey: string
  pointerDragStartPointRef: MutableRefObject<{ x: number; y: number } | null>
  pointerSelectionAnchorRef: MutableRefObject<number | null>
  reflowKind?: WysiwygTextReflowDecision["kind"]
  relaxNativeEditClip: boolean
  renderProps: ParagraphRenderProps | undefined
  scale: number
  schedulePointerSelectionFromClientPoint: (clientX: number, clientY: number) => void
  setIsPointerSelecting: Dispatch<SetStateAction<boolean>>
  showTextSegments: boolean
}

export function WysiwygFlowdocDraftLayer({
  activeCaretVisualMode,
  activePointerFragmentCount,
  activePointerIdRef,
  cancelScheduledPointerSelection,
  clipPathId,
  finishPointerSelection,
  flowdocDraftCaret,
  flowdocDraftLineVisual,
  flowdocDraftReflowKind,
  flowdocDraftSelectionCollapsed,
  flowdocDraftSelectionOverlayRects,
  flowdocDraftState,
  flowdocDraftVisualFragment,
  fragment,
  handleClick,
  handleDoubleClick,
  handleLayerBlur,
  handlePointerCancel,
  handlePointerDown,
  handlePointerMove,
  handlePointerSelectionWheel,
  handlePointerUp,
  inputBridgeRef,
  isPointerSelecting,
  layerRef,
  localPointerSelectionPreview,
  nativeContentWidth,
  nativeContentX,
  nativeContentY,
  nativeRenderedEditHeight,
  pageKey,
  pointerDragStartPointRef,
  pointerSelectionAnchorRef,
  reflowKind,
  relaxNativeEditClip,
  renderProps,
  scale,
  schedulePointerSelectionFromClientPoint,
  setIsPointerSelecting,
  showTextSegments,
}: WysiwygFlowdocDraftLayerProps) {
  const pointerSelectionOverlay = isPointerSelecting && typeof document !== "undefined"
    ? createPortal(
      <div
        data-wysiwyg-pointer-selection-overlay="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483647,
          cursor: "text",
          background: "transparent",
          userSelect: "none",
        }}
        onMouseMove={(event) => {
          event.preventDefault()
          schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onMouseUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          event.preventDefault()
          schedulePointerSelectionFromClientPoint(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => {
          event.preventDefault()
          finishPointerSelection(event.clientX, event.clientY)
        }}
        onPointerCancel={() => {
          cancelScheduledPointerSelection()
          pointerSelectionAnchorRef.current = null
          activePointerIdRef.current = null
          pointerDragStartPointRef.current = null
          setIsPointerSelecting(false)
        }}
        onWheel={handlePointerSelectionWheel}
      />,
      document.body,
    )
    : null

  return (
    <>
      {pointerSelectionOverlay}
      <g
        ref={layerRef}
        data-wysiwyg-draft-editor-island="true"
        data-wysiwyg-text-engine-layer="true"
        data-wysiwyg-pointer-fragment-count={activePointerFragmentCount}
        data-wysiwyg-reflow-kind={reflowKind ?? flowdocDraftReflowKind}
        data-wysiwyg-caret-mode={activeCaretVisualMode}
        data-wysiwyg-active-visual-mode="flowdoc-draft-editor-island"
        data-wysiwyg-active-visual-detail="flowdoc-owned-draft-lines"
        data-wysiwyg-line-count={flowdocDraftVisualFragment.lines?.length ?? 0}
        data-wysiwyg-flowdoc-draft-line-count={flowdocDraftVisualFragment.lines?.length ?? 0}
        data-wysiwyg-flowdoc-draft-text-length={flowdocDraftState.text.length}
        data-wysiwyg-flowdoc-draft-caret-offset={flowdocDraftState.caretOffset ?? undefined}
        data-wysiwyg-flowdoc-draft-selection-start={flowdocDraftState.selection?.anchorOffset ?? flowdocDraftState.caretOffset ?? undefined}
        data-wysiwyg-flowdoc-draft-selection-end={flowdocDraftState.selection?.focusOffset ?? flowdocDraftState.caretOffset ?? undefined}
        data-wysiwyg-flowdoc-draft-selection-collapsed={String(flowdocDraftSelectionCollapsed)}
        data-wysiwyg-native-visible-text="false"
        data-wysiwyg-custom-caret-visible={flowdocDraftCaret ? "true" : undefined}
        data-wysiwyg-hidden-input-bridge="true"
        data-wysiwyg-visible-pointer-owner="flowdoc-draft-surface"
        data-wysiwyg-immediate-draft-layout={undefined}
        data-wysiwyg-local-selection-preview={localPointerSelectionPreview ? "true" : undefined}
        data-wysiwyg-table-cell-preview-candidate={undefined}
        data-wysiwyg-live-echo-suppressed="true"
        data-wysiwyg-draft-text-replacement-active={undefined}
        data-inline-edit-node-id={fragment.nodeId}
        data-inline-edit-visual-mode="flowdoc-draft-editor-island"
        clipPath={relaxNativeEditClip ? undefined : `url(#${clipPathId ?? `cp-${pageKey}-${fragment.nodeId}`})`}
        tabIndex={0}
        focusable="true"
        role="textbox"
        aria-multiline="true"
        aria-describedby={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
        onBlur={handleLayerBlur}
      >
        <foreignObject
          data-wysiwyg-hidden-input-bridge-host="true"
          x={nativeContentX * scale}
          y={nativeContentY * scale}
          width={1}
          height={1}
          style={{ overflow: "hidden", pointerEvents: "none" }}
        >
          <div
            ref={inputBridgeRef}
            data-wysiwyg-input-bridge="true"
            data-wysiwyg-input-bridge-mode="hidden-flowdoc-draft-editor-island"
            data-wysiwyg-visible-area-pointer-target="false"
            data-inline-edit-node-id={fragment.nodeId}
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            spellCheck={false}
            aria-label="WYSIWYG text input"
            aria-describedby={WYSIWYG_TEXT_ACCESSIBILITY_STATUS_ID}
            role="textbox"
            style={{
              width: 1,
              height: 1,
              opacity: 0,
              border: 0,
              padding: 0,
              margin: 0,
              outline: "none",
              background: "transparent",
              color: "transparent",
              caretColor: "transparent",
              pointerEvents: "none",
              overflow: "hidden",
              whiteSpace: "pre",
            }}
          />
        </foreignObject>
        <rect
          data-wysiwyg-hit-area="true"
          data-wysiwyg-draft-editor-island-hit-area="true"
          x={flowdocDraftVisualFragment.x * scale}
          y={flowdocDraftVisualFragment.y * scale}
          width={flowdocDraftVisualFragment.width * scale}
          height={Math.max(flowdocDraftVisualFragment.height * scale, 1)}
          fill="transparent"
          pointerEvents="all"
        />
        <rect
          data-wysiwyg-draft-editor-island-outline="true"
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
        {renderSelectionOverlay(flowdocDraftVisualFragment, pageKey, scale, flowdocDraftSelectionOverlayRects, relaxNativeEditClip ? undefined : clipPathId)}
        {renderListMarker(flowdocDraftVisualFragment, renderProps, pageKey, scale, clipPathId)}
        {flowdocDraftLineVisual}
        {showTextSegments && renderSegmentDebug(flowdocDraftVisualFragment.lines, flowdocDraftVisualFragment, renderProps, scale)}
        {flowdocDraftCaret}
      </g>
    </>
  )
}
