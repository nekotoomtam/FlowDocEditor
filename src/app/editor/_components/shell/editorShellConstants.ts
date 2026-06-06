export const STRUCTURAL_PANEL_RELEASE_MIN_DELAY_MS = 180
export const STRUCTURAL_PANEL_RELEASE_IDLE_TIMEOUT_MS = 1000
export const STRUCTURAL_PANEL_RELEASE_INPUT_QUIET_MS = 140

export const SCREEN_READER_ONLY_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const

export const MIN_SCALE = 0.3
export const MAX_SCALE = 4
export const ZOOM_STEP = 0.25
export const OUTLINE_SELECTION_IDLE_TIMEOUT_MS = 1500
export const INLINE_EDIT_PREVIEW_DEBOUNCE_MS = 0
export const OPTIMISTIC_STRUCTURAL_PREVIEW_SETTLE_DEBOUNCE_MS = 1500
export const BROWSER_PREVIEW_VISIBLE_WINDOW_MARGIN_PAGES = 4
// Keep hard reflow from settling between real key-repeat events; the local
// text-engine draft replacement carries immediate feedback until the burst pauses.
export const WYSIWYG_DRAFT_PAGINATION_DEBOUNCE_MS = 450
// Flow-stack page-boundary edits do not have a safe same-page local preview.
// Keep the authoritative draft pagination close to the input frame instead.
export const FLOW_STACK_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS = 16
export const WYSIWYG_PLAIN_BOUNDARY_DRAFT_PAGINATION_DEBOUNCE_MS = 450
export const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_QUIET_MS = 48
export const WYSIWYG_RESPONSIVE_DRAFT_PAGINATION_MAX_LAG_MS = 160
export const FLOWDOC_FONT_HEADER = "X-FlowDoc-Font"
export const FLOWDOC_FONT_FALLBACK_VALUE = "fallback"
