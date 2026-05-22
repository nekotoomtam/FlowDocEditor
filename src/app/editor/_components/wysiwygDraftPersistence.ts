import { assertDocument } from "@/document"
import type { DocumentNode } from "@/schema"
import type { WysiwygTextSessionState } from "./useWysiwygTextSession"
import { replaceEditableParagraphTextInDocument } from "./wysiwygTextCommit"

export function resolvePersistableWysiwygDocument(
  doc: DocumentNode,
  session: Pick<WysiwygTextSessionState, "nodeId" | "draftText">,
  enabled: boolean,
): DocumentNode {
  if (!enabled || !session.nodeId) return doc

  const draftDoc = replaceEditableParagraphTextInDocument(doc, session.nodeId, session.draftText)
  assertDocument(draftDoc)
  return draftDoc
}
