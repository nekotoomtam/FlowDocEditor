import {
  deleteEmptyFlowTableCellParagraph,
} from "@/document"
import type { DocumentNode } from "@/schema"
import { replaceEditableParagraphTextInDocument } from "../wysiwygTextCommit"

export type EditorReducerTableCellParagraphSelectionPatch = {
  selectedNodeId?: string | null
  selectionAnchorNodeId?: string | null
  mergeResult?: { prevNodeId: string; caretIndex: number } | null
}

export type EditorReducerDeleteEmptyTableCellParagraphPlan =
  | {
      status: "noop"
    }
  | {
      status: "success"
      nextDoc: DocumentNode
      selectionPatch: EditorReducerTableCellParagraphSelectionPatch
    }

export function createDeleteEmptyTableCellParagraphPlan(input: {
  doc: DocumentNode
  nodeId: string
  text?: string | undefined
}): EditorReducerDeleteEmptyTableCellParagraphPlan {
  const sourceDoc = input.text === undefined
    ? input.doc
    : replaceEditableParagraphTextInDocument(input.doc, input.nodeId, input.text)
  const result = deleteEmptyFlowTableCellParagraph(sourceDoc, input.nodeId)
  if (!result) return { status: "noop" }
  return {
    status: "success",
    nextDoc: result.doc,
    selectionPatch: {
      selectedNodeId: result.prevNodeId,
      selectionAnchorNodeId: result.prevNodeId,
      mergeResult: {
        prevNodeId: result.prevNodeId,
        caretIndex: result.caretIndex,
      },
    },
  }
}
