process.env.OUTLINE_PANEL_REPEAT_CHILD_SCRIPT ??= "scripts/outline-panel-active-list-reorder-smoke.mjs"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_ACTIVE_NODE_ID ??= "li_00035"
process.env.OUTLINE_PANEL_REPEAT_LABEL ??= "Outline panel active-list-reorder smoke repeat"

await import("./outline-panel-list-draft-repeat-smoke.mjs")
