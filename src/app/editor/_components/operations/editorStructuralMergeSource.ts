import type { DocumentNode } from "@/schema"
import type { PendingOptimisticSplitRefocus } from "../shell/editorShellTypes"
import { getParagraphFromDoc } from "../shell/editorDocumentLookup"

export interface OptimisticMergeSourceDocumentInput {
  canTryOptimisticMerge: boolean
  nodeId: string
  currentDoc: DocumentNode
  optimisticLayoutDoc: DocumentNode | null
  pendingSplitRefocus: PendingOptimisticSplitRefocus | null
}

export function resolveOptimisticMergeSourceDocument({
  canTryOptimisticMerge,
  nodeId,
  currentDoc,
  optimisticLayoutDoc,
  pendingSplitRefocus,
}: OptimisticMergeSourceDocumentInput): DocumentNode | null {
  if (!canTryOptimisticMerge) return null

  const pendingSplitDoc = pendingSplitRefocus?.prestarted && pendingSplitRefocus.newNodeId === nodeId
    ? optimisticLayoutDoc
    : null
  if (pendingSplitDoc) return pendingSplitDoc

  if (!optimisticLayoutDoc) return null
  const currentDocContainsNode = getParagraphFromDoc(currentDoc, nodeId) !== null
  if (currentDocContainsNode) return null

  return getParagraphFromDoc(optimisticLayoutDoc, nodeId) !== null
    ? optimisticLayoutDoc
    : null
}
