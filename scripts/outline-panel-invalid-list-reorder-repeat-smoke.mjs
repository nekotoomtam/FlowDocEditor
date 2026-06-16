process.env.OUTLINE_PANEL_REPEAT_CHILD_SCRIPT ??= "scripts/outline-panel-invalid-list-reorder-smoke.mjs"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_ACTIVE_NODE_ID ??= "li_00033"
process.env.OUTLINE_PANEL_REPEAT_EXPECT_NOOP ??= "1"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_DROP_BLOCKED_REASON ??= "source-subtree"
process.env.OUTLINE_PANEL_REPEAT_EXPECTED_SUBTREE_CHILD_COUNT ??= "1"
process.env.OUTLINE_PANEL_REPEAT_LABEL ??= "Outline panel invalid-list-reorder smoke repeat"

await import("./outline-panel-list-draft-repeat-smoke.mjs")
