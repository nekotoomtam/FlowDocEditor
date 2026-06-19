import {
  backspaceListItemAtStart,
  exitListItem,
  indentListItem,
  outdentListItem,
  toggleParagraphListPreset,
} from "@/document"
import type { FlowDocListStylePresetId } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import {
  replaceEditableParagraphInDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import type { ListLevelChangeDirection } from "../wysiwygTextInteraction"

export type EditorReducerListSelectionPatch = {
  selectedNodeId?: string | null
  selectionAnchorNodeId?: string | null
  listExitNodeId?: string | null
  listLevelChangeResult?: { nodeId: string; caretIndex: number | null } | null
}

export type EditorReducerListPlan = {
  nextDoc: DocumentNode
  noopBaselineDoc: DocumentNode
  reducerPath: string
  selectionPatch?: EditorReducerListSelectionPatch
}

function resolveTextSourceDoc(doc: DocumentNode, nodeId: string, text: string | undefined): DocumentNode {
  return text === undefined
    ? doc
    : replaceEditableParagraphTextInDocument(doc, nodeId, text)
}

export function createExitListItemPlan(input: {
  doc: DocumentNode
  nodeId: string
  text?: string | undefined
}): EditorReducerListPlan {
  const sourceDoc = resolveTextSourceDoc(input.doc, input.nodeId, input.text)
  return {
    nextDoc: exitListItem(sourceDoc, input.nodeId),
    noopBaselineDoc: input.doc,
    reducerPath: "EXIT_LIST_ITEM",
    selectionPatch: { listExitNodeId: input.nodeId },
  }
}

export function createChangeListItemLevelPlan(input: {
  doc: DocumentNode
  nodeId: string
  direction: ListLevelChangeDirection
  text?: string | undefined
  caretIndex?: number | null | undefined
  refocus?: boolean | undefined
}): EditorReducerListPlan {
  const sourceDoc = resolveTextSourceDoc(input.doc, input.nodeId, input.text)
  return {
    nextDoc: input.direction === "indent"
      ? indentListItem(sourceDoc, input.nodeId)
      : outdentListItem(sourceDoc, input.nodeId),
    noopBaselineDoc: sourceDoc,
    reducerPath: "CHANGE_LIST_ITEM_LEVEL",
    selectionPatch: {
      listLevelChangeResult: input.refocus === false ? null : {
        nodeId: input.nodeId,
        caretIndex: input.caretIndex ?? null,
      },
    },
  }
}

export function createBackspaceListItemAtStartPlan(input: {
  doc: DocumentNode
  nodeId: string
  text?: string | undefined
  caretIndex?: number | null | undefined
}): EditorReducerListPlan {
  const sourceDoc = resolveTextSourceDoc(input.doc, input.nodeId, input.text)
  return {
    nextDoc: backspaceListItemAtStart(sourceDoc, input.nodeId),
    noopBaselineDoc: sourceDoc,
    reducerPath: "BACKSPACE_LIST_ITEM_AT_START",
    selectionPatch: {
      listLevelChangeResult: {
        nodeId: input.nodeId,
        caretIndex: input.caretIndex ?? null,
      },
    },
  }
}

export function createToggleListPresetPlan(input: {
  doc: DocumentNode
  nodeId: string
  styleId: FlowDocListStylePresetId
  instanceId: string
  level?: number | undefined
  text?: string | undefined
  paragraph?: ParagraphNode | undefined
}): EditorReducerListPlan {
  const sourceDoc = input.paragraph
    ? replaceEditableParagraphInDocument(input.doc, input.nodeId, input.paragraph)
    : resolveTextSourceDoc(input.doc, input.nodeId, input.text)
  return {
    nextDoc: toggleParagraphListPreset(sourceDoc, input.nodeId, {
      styleId: input.styleId,
      instanceId: input.instanceId,
      level: input.level,
    }),
    noopBaselineDoc: sourceDoc,
    reducerPath: "TOGGLE_LIST_PRESET",
    selectionPatch: { selectedNodeId: input.nodeId, selectionAnchorNodeId: input.nodeId },
  }
}
