process.env.OUTLINE_ACTIVE_EDIT_NODE_ID ??= "li_00033"
process.env.OUTLINE_ACTIVE_EDIT_MARKER ??= "OUTLINE_REORDER_LIST_DRAFT_MARKER"

await import("./outline-panel-smoke.mjs")
