process.env.OUTLINE_ACTIVE_EDIT_NODE_ID ??= "li_00035"
process.env.OUTLINE_ACTIVE_EDIT_MARKER ??= "OUTLINE_REORDER_ACTIVE_LIST_SOURCE_MARKER"
process.env.OUTLINE_REORDER_SOURCE_NODE_ID ??= "li_00035"
process.env.OUTLINE_REORDER_TARGET_NODE_ID ??= "li_00057"
process.env.OUTLINE_REORDER_POSITION ??= "after"

await import("./outline-panel-smoke.mjs")
