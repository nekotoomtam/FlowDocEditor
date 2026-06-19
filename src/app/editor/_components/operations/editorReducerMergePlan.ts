import {
  deleteNode,
  mergeListItemWithPrevious,
  mergeParagraphWithPrevious,
} from "@/document"
import type { DocumentNode, LayoutNode } from "@/schema"
import {
  finishStructuralReducerAttribution,
} from "../editorReducerCommit"
import type { StructuralReducerAttribution } from "../editorReducerCommit"
import {
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"

export type EditorReducerMergeResult = {
  doc: DocumentNode
  prevNodeId?: string | null
  caretIndex?: number | null
}

export type EditorReducerMergeSelectionPatch = {
  selectedNodeId?: string | null
  selectionAnchorNodeId?: string | null
  mergeResult?: { prevNodeId: string; caretIndex: number } | null
}

export type EditorReducerMergePlan =
  | {
      status: "noop"
      attribution: StructuralReducerAttribution
      totalAttribution: StructuralReducerAttribution
      validationMode: "full"
    }
  | {
      status: "success"
      result: EditorReducerMergeResult & { prevNodeId: string; caretIndex: number }
      attribution: StructuralReducerAttribution
      totalAttribution: StructuralReducerAttribution
      validationPolicy: "full" | "prevalidated"
      selectionPatch?: EditorReducerMergeSelectionPatch
    }

export type EditorReducerMergePlanInput = {
  doc: DocumentNode
  nodeId: string
  text?: string | undefined
  precomputed?: EditorReducerMergeResult | undefined
  precomputedDocValidation?: "shell-optimistic-structural" | undefined
  isOptimistic?: boolean | undefined
  reducerStartedAt: number
}

function getLayoutChildIds(node: LayoutNode): string[] | null {
  if (!("childIds" in node)) return null
  return Array.isArray(node.childIds) ? node.childIds : null
}

function shouldDeleteEmptyUnlistedParagraph(doc: DocumentNode, nodeId: string): boolean {
  const paragraph = getEditableParagraphFromDocument(doc, nodeId)
  if (!paragraph || paragraph.props.list) return false
  const text = getEditableParagraphTextFromDocument(doc, nodeId)
  return text != null && text.trim().length === 0
}

function findPreviousEditableParagraphSibling(
  doc: DocumentNode,
  nodeId: string,
): { prevNodeId: string; caretIndex: number } | null {
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      const childIds = getLayoutChildIds(node)
      const index = childIds?.indexOf(nodeId) ?? -1
      if (index <= 0 || !childIds) continue

      const prevNodeId = childIds[index - 1]
      if (!prevNodeId) return null
      const prevNode = section.nodes[prevNodeId]
      if (prevNode?.type !== "paragraph") return null
      const prevText = getEditableParagraphTextFromDocument(doc, prevNodeId)
      return prevText == null ? null : { prevNodeId, caretIndex: prevText.length }
    }
  }
  return null
}

export function createEditorReducerMergePlan(input: EditorReducerMergePlanInput): EditorReducerMergePlan {
  const attributionBase: StructuralReducerAttribution = {
    operation: "merge",
    nodeId: input.precomputed?.prevNodeId ?? input.nodeId,
    previousNodeId: input.nodeId,
    sourceNodeId: input.nodeId,
    reducerPath: input.precomputed ? "precomputed" : "fallback",
  }

  const precomputed = input.precomputed
  if (
    precomputed &&
    precomputed.prevNodeId &&
    typeof precomputed.caretIndex === "number" &&
    Number.isFinite(precomputed.caretIndex) &&
    precomputed.caretIndex >= 0 &&
    getEditableParagraphFromDocument(precomputed.doc, precomputed.prevNodeId)
  ) {
    const canUseShellPrevalidatedDoc = Boolean(input.precomputedDocValidation === "shell-optimistic-structural" &&
      !getEditableParagraphFromDocument(precomputed.doc, input.nodeId))
    const attribution: StructuralReducerAttribution = {
      ...attributionBase,
      nodeId: precomputed.prevNodeId,
      reducerPath: canUseShellPrevalidatedDoc
        ? "precomputed-fast-path"
        : "precomputed-full-validation",
    }
    finishStructuralReducerAttribution(attribution, canUseShellPrevalidatedDoc
      ? "reducer-precomputed-merge-fast-path"
      : "reducer-precomputed-merge-full-validation",
    input.reducerStartedAt, {
      validationMode: canUseShellPrevalidatedDoc ? "prevalidated" : "full",
      active: true,
    })
    return {
      status: "success",
      result: {
        doc: precomputed.doc,
        prevNodeId: precomputed.prevNodeId,
        caretIndex: precomputed.caretIndex,
      },
      attribution,
      totalAttribution: attribution,
      validationPolicy: canUseShellPrevalidatedDoc ? "prevalidated" : "full",
      selectionPatch: input.isOptimistic ? undefined : {
        mergeResult: {
          prevNodeId: precomputed.prevNodeId,
          caretIndex: precomputed.caretIndex,
        },
      },
    }
  }

  let sourceDoc = input.doc
  if (input.text !== undefined) {
    const replaceStartedAt = startWysiwygPerfSpan()
    sourceDoc = replaceEditableParagraphTextInDocument(input.doc, input.nodeId, input.text)
    finishStructuralReducerAttribution(attributionBase, "replace-draft-text", replaceStartedAt, {
      textLength: input.text.length,
    })
  }

  if (shouldDeleteEmptyUnlistedParagraph(sourceDoc, input.nodeId)) {
    const previousSibling = findPreviousEditableParagraphSibling(sourceDoc, input.nodeId)
    const deleteStartedAt = startWysiwygPerfSpan()
    const nextDoc = deleteNode(sourceDoc, input.nodeId)
    finishStructuralReducerAttribution(attributionBase, "reducer-delete-empty-operation", deleteStartedAt, {
      active: nextDoc !== input.doc,
    })
    if (nextDoc !== input.doc) {
      const attribution: StructuralReducerAttribution = {
        ...attributionBase,
        nodeId: previousSibling?.prevNodeId ?? input.nodeId,
        reducerPath: "delete-empty-fallback",
      }
      return {
        status: "success",
        result: {
          doc: nextDoc,
          prevNodeId: previousSibling?.prevNodeId ?? input.nodeId,
          caretIndex: previousSibling?.caretIndex ?? 0,
        },
        attribution,
        totalAttribution: attributionBase,
        validationPolicy: "full",
        selectionPatch: {
          selectedNodeId: previousSibling?.prevNodeId ?? null,
          selectionAnchorNodeId: previousSibling?.prevNodeId ?? null,
          mergeResult: previousSibling,
        },
      }
    }
  }

  const listMergeStartedAt = startWysiwygPerfSpan()
  const listResult = mergeListItemWithPrevious(sourceDoc, input.nodeId)
  finishStructuralReducerAttribution(attributionBase, "reducer-merge-list-attempt", listMergeStartedAt, {
    active: Boolean(listResult),
  })
  let result = listResult
  if (!result) {
    const mergeStartedAt = startWysiwygPerfSpan()
    result = mergeParagraphWithPrevious(sourceDoc, input.nodeId)
    finishStructuralReducerAttribution(attributionBase, "reducer-merge-fallback-operation", mergeStartedAt, {
      active: Boolean(result),
    })
  }

  if (!result) {
    return {
      status: "noop",
      attribution: attributionBase,
      totalAttribution: attributionBase,
      validationMode: "full",
    }
  }

  const attribution: StructuralReducerAttribution = {
    ...attributionBase,
    nodeId: result.prevNodeId,
    reducerPath: "fallback",
  }

  return {
    status: "success",
    result,
    attribution,
    totalAttribution: attribution,
    validationPolicy: "full",
    selectionPatch: input.isOptimistic ? undefined : {
      mergeResult: { prevNodeId: result.prevNodeId, caretIndex: result.caretIndex },
    },
  }
}
