import type { EditorWorkflowNavItem } from "./EditorToolbar"

export function buildEditorWorkflowNavItems({
  fieldCount,
  fillIssueCount,
  canExport,
}: {
  fieldCount: number
  fillIssueCount: number
  canExport: boolean
}): EditorWorkflowNavItem[] {
  return [
    { mode: "design", label: "Design", description: "Outline / layout", icon: "D" },
    { mode: "fields", label: "Fields", description: "Variables", icon: "{}", badge: fieldCount > 0 ? String(fieldCount) : undefined },
    { mode: "fill", label: "Fill", description: "Data entry", icon: "F", badge: fillIssueCount > 0 ? String(fillIssueCount) : undefined },
    { mode: "render", label: "Render", description: canExport ? "Ready to export" : "Check export", icon: "R", badge: canExport ? undefined : "!" },
  ]
}
