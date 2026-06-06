import type { FlowDocListStylePresetId, ParagraphTextStyleChanges } from "@/document"
import type { DocumentNode, ParagraphNode, TextRunStyle } from "@/schema"
import { ListToolbar } from "../ListToolbar"
import { RichTextToolbar } from "../RichTextToolbar"
import type { EditorAction } from "../editorReducer"
import type { RichTextToolbarSelectionSnapshot } from "../richTextToolbarSelection"
import type { ListLevelChangeDirection } from "../wysiwygTextInteraction"
import { EditorSubtreePerfProfiler, StructuralPaintDeferredSubtree } from "./EditorShellPerfChrome"
import { EditorToolbar, type EditorToolbarProps } from "./EditorToolbar"

type RichTextStyleCommand = {
  type: "setStyle"
  patch: ParagraphTextStyleChanges
}

interface EditorTopToolbarProps extends Omit<EditorToolbarProps, "children"> {
  doc: DocumentNode
  selectedNodeId: string | null
  selectionAnchorNodeId: string | null
  isTemplateMode: boolean
  deferNonCriticalPanelsForStructuralPaint: boolean
  wysiwygPerfTraceActive: boolean
  richTextDraftEnabled: boolean
  richDraftNodeId: string | null
  richDraftParagraph: ParagraphNode | null
  richDraftPendingStyle: TextRunStyle | null
  richTextToolbarSelection: RichTextToolbarSelectionSnapshot | null
  richTextToolbarLiveSelection: RichTextToolbarSelectionSnapshot | null
  onToggleListPreset: (nodeId: string, styleId: FlowDocListStylePresetId, instanceId: string, level: number) => void
  onChangeListItemLevel: (nodeId: string, direction: ListLevelChangeDirection) => void
  onApplyRichTextDraftCommand: (nodeId: string, command: RichTextStyleCommand) => boolean
  hasWysiwygTextSession: () => boolean
  finalizeInlineEditBeforeAction: () => boolean
  dispatchEditorAction: (action: EditorAction) => void
}

export function EditorTopToolbar({
  doc,
  selectedNodeId,
  selectionAnchorNodeId,
  isTemplateMode,
  deferNonCriticalPanelsForStructuralPaint,
  wysiwygPerfTraceActive,
  richTextDraftEnabled,
  richDraftNodeId,
  richDraftParagraph,
  richDraftPendingStyle,
  richTextToolbarSelection,
  richTextToolbarLiveSelection,
  onToggleListPreset,
  onChangeListItemLevel,
  onApplyRichTextDraftCommand,
  hasWysiwygTextSession,
  finalizeInlineEditBeforeAction,
  dispatchEditorAction,
  ...toolbarProps
}: EditorTopToolbarProps) {
  return (
    <div
      data-structural-panel-deferred={deferNonCriticalPanelsForStructuralPaint ? "true" : "false"}
      style={{ pointerEvents: deferNonCriticalPanelsForStructuralPaint ? "none" : "auto" }}
    >
      <StructuralPaintDeferredSubtree defer={deferNonCriticalPanelsForStructuralPaint}>
        <EditorSubtreePerfProfiler enabled={wysiwygPerfTraceActive} id="top-toolbar">
          <EditorToolbar {...toolbarProps}>
            {isTemplateMode && (
              <>
                <ListToolbar
                  doc={doc}
                  selectedNodeId={selectionAnchorNodeId ?? selectedNodeId}
                  editable={isTemplateMode}
                  onToggleListPreset={onToggleListPreset}
                  onChangeListItemLevel={onChangeListItemLevel}
                />
                <RichTextToolbar
                  doc={doc}
                  selectedNodeId={selectedNodeId}
                  draftParagraph={richTextDraftEnabled && richDraftNodeId === selectedNodeId
                    ? richDraftParagraph
                    : null}
                  pendingStyle={richTextDraftEnabled && richDraftNodeId === selectedNodeId
                    ? richDraftPendingStyle
                    : null}
                  textSelection={richTextToolbarSelection}
                  commandTextSelection={richTextToolbarLiveSelection}
                  editable={isTemplateMode}
                  onUpdateParagraphTextStyle={(nodeId, changes) => {
                    if (onApplyRichTextDraftCommand(nodeId, { type: "setStyle", patch: changes })) return
                    const hadWysiwygTextSession = hasWysiwygTextSession()
                    const finalized = finalizeInlineEditBeforeAction()
                    if (hadWysiwygTextSession && !finalized) return
                    dispatchEditorAction({ type: "UPDATE_PARAGRAPH_TEXT_STYLE", nodeId, changes })
                  }}
                  onUpdateTextRunStyleRange={(nodeId, start, end, changes) => {
                    if (onApplyRichTextDraftCommand(nodeId, { type: "setStyle", patch: changes })) return
                    const hadWysiwygTextSession = hasWysiwygTextSession()
                    const finalized = finalizeInlineEditBeforeAction()
                    if (hadWysiwygTextSession && !finalized) return
                    dispatchEditorAction({ type: "UPDATE_TEXT_RUN_STYLE_RANGE", nodeId, start, end, changes })
                  }}
                />
              </>
            )}
          </EditorToolbar>
        </EditorSubtreePerfProfiler>
      </StructuralPaintDeferredSubtree>
    </div>
  )
}
