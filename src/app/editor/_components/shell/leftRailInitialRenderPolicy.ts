import type { DocumentNode } from "@/schema"
import type { EditorPreviewLayoutStatus } from "../editorPreviewLayoutStatus"
import type { EditorLeftRailMode } from "./EditorLeftRail"

export const LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT = 400

export function countDocumentBodyChildrenForLeftRailOutline(doc: DocumentNode): number {
  return doc.document.sections.reduce((count, section) => {
    const body = section.nodes[section.bodyRootId]
    return body?.type === "body" ? count + body.childIds.length : count
  }, 0)
}

export function shouldDeferInitialLeftRailOutline({
  doc,
  mode,
  previewLayoutStatus,
}: {
  doc: DocumentNode
  mode: EditorLeftRailMode
  previewLayoutStatus: EditorPreviewLayoutStatus
}): boolean {
  if (mode !== "outline") return false
  if (previewLayoutStatus === "full") return false
  return countDocumentBodyChildrenForLeftRailOutline(doc) > LEFT_RAIL_INITIAL_OUTLINE_BODY_CHILD_DEFER_LIMIT
}
