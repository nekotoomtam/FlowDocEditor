import {
  splitListItemAtIndex,
  splitParagraphAtIndex,
} from "@/document"
import type { DocumentNode, LayoutNode } from "@/schema"
import {
  finishStructuralReducerAttribution,
} from "../editorReducerCommit"
import type { StructuralReducerAttribution } from "../editorReducerCommit"
import {
  getEditableParagraphFromDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import { startWysiwygPerfSpan } from "../wysiwygPerformance"

export type EditorReducerSplitResult = {
  doc: DocumentNode
  newNodeId?: string | null
}

export type EditorReducerSplitPlan =
  | {
      status: "noop"
      attribution: StructuralReducerAttribution
      validationMode: "full" | "mixed"
    }
  | {
      status: "success"
      result: EditorReducerSplitResult & { newNodeId: string }
      attribution: StructuralReducerAttribution
      validationPolicy: "full" | "prevalidated"
    }

export type EditorReducerSplitPlanInput = {
  doc: DocumentNode
  nodeId: string
  splitIndex: number
  text?: string | undefined
  newNodeId?: string | undefined
  precomputed?: EditorReducerSplitResult | undefined
  precomputedDocValidation?: "shell-optimistic-structural" | undefined
  reducerStartedAt: number
}

function getLayoutChildIds(node: LayoutNode): string[] | null {
  if (!("childIds" in node)) return null
  return Array.isArray(node.childIds) ? node.childIds : null
}

function hasImmediateSiblingOrder(doc: DocumentNode, previousNodeId: string, nextNodeId: string): boolean {
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      const childIds = getLayoutChildIds(node)
      const index = childIds?.indexOf(previousNodeId) ?? -1
      if (index < 0 || !childIds) continue
      return childIds[index + 1] === nextNodeId
    }
  }
  return false
}

export function createEditorReducerSplitPlan(input: EditorReducerSplitPlanInput): EditorReducerSplitPlan {
  const attributionBase: StructuralReducerAttribution = {
    operation: "split",
    nodeId: input.precomputed?.newNodeId ?? input.newNodeId ?? input.nodeId,
    previousNodeId: input.nodeId,
    sourceNodeId: input.nodeId,
    reducerPath: input.precomputed ? "precomputed" : "fallback",
  }

  let result = input.precomputed
  if (!result) {
    let sourceDoc = input.doc
    if (input.text !== undefined) {
      const replaceStartedAt = startWysiwygPerfSpan()
      sourceDoc = replaceEditableParagraphTextInDocument(input.doc, input.nodeId, input.text)
      finishStructuralReducerAttribution(attributionBase, "replace-draft-text", replaceStartedAt, {
        textLength: input.text.length,
      })
    }

    const listSplitStartedAt = startWysiwygPerfSpan()
    const listResult = splitListItemAtIndex(sourceDoc, input.nodeId, input.splitIndex)
    finishStructuralReducerAttribution(attributionBase, "reducer-split-list-attempt", listSplitStartedAt, {
      active: Boolean(listResult.newNodeId),
    })
    if (!listResult.newNodeId) {
      const splitStartedAt = startWysiwygPerfSpan()
      result = splitParagraphAtIndex(sourceDoc, input.nodeId, input.splitIndex, {
        newNodeId: input.newNodeId,
      })
      finishStructuralReducerAttribution(attributionBase, "reducer-split-fallback-operation", splitStartedAt, {
        active: Boolean(result.newNodeId),
      })
    } else {
      result = listResult
    }
  }

  if (!result?.newNodeId) {
    return {
      status: "noop",
      attribution: attributionBase,
      validationMode: input.precomputed ? "mixed" : "full",
    }
  }

  const canUseShellPrevalidatedDoc = Boolean(input.precomputedDocValidation === "shell-optimistic-structural" &&
    input.precomputed === result &&
    getEditableParagraphFromDocument(result.doc, input.nodeId) &&
    getEditableParagraphFromDocument(result.doc, result.newNodeId) &&
    hasImmediateSiblingOrder(result.doc, input.nodeId, result.newNodeId))

  const attribution: StructuralReducerAttribution = {
    ...attributionBase,
    nodeId: result.newNodeId,
    reducerPath: canUseShellPrevalidatedDoc
      ? "precomputed-fast-path"
      : input.precomputed
        ? "precomputed-full-validation"
        : "fallback",
  }

  finishStructuralReducerAttribution(attribution, canUseShellPrevalidatedDoc
    ? "reducer-precomputed-split-fast-path"
    : input.precomputed
      ? "reducer-precomputed-split-full-validation"
      : "reducer-split-fallback-path",
  input.reducerStartedAt, {
    validationMode: canUseShellPrevalidatedDoc ? "prevalidated" : "full",
    active: true,
  })

  return {
    status: "success",
    result: result as EditorReducerSplitResult & { newNodeId: string },
    attribution,
    validationPolicy: canUseShellPrevalidatedDoc ? "prevalidated" : "full",
  }
}
