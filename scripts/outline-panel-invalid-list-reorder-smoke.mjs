process.env.OUTLINE_ACTIVE_EDIT_NODE_ID ??= "li_00033"
process.env.OUTLINE_ACTIVE_EDIT_MARKER ??= "OUTLINE_REORDER_INVALID_LIST_MARKER"
process.env.OUTLINE_REORDER_SOURCE_NODE_ID ??= "li_00033"
process.env.OUTLINE_REORDER_TARGET_NODE_ID ??= "li_00035"
process.env.OUTLINE_REORDER_POSITION ??= "after"
process.env.OUTLINE_REORDER_EXPECT_NOOP ??= "1"

await import("./outline-panel-smoke.mjs")
