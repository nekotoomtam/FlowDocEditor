import { assertDocument, normalizeDocument, updateParagraphText } from "@/document"
import type { DocumentNode } from "@/schema"
import type { WysiwygTextSessionState } from "./useWysiwygTextSession"

export function resolvePersistableWysiwygDocument(
  doc: DocumentNode,
  session: Pick<WysiwygTextSessionState, "nodeId" | "draftText">,
  enabled: boolean,
): DocumentNode {
  if (!enabled || !session.nodeId) return doc

  const draftDoc = normalizeDocument(updateParagraphText(doc, session.nodeId, session.draftText))
  assertDocument(draftDoc)
  return draftDoc
}
