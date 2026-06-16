process.env.OUTLINE_PANEL_REPEAT_CHILD_SCRIPT ??= "scripts/outline-panel-list-subtree-reorder-smoke.mjs"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_ACTIVE_NODE_ID ??= "li_00033"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_SUBTREE_CHILD_COUNT ??= "1"
process.env.OUTLINE_PANEL_REPEAT_LABEL ??= "Outline panel list-subtree-reorder smoke repeat"

await import("./outline-panel-list-draft-repeat-smoke.mjs")
