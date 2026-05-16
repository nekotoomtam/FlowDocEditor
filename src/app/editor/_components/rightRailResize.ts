export const RIGHT_RAIL_COLLAPSED_WIDTH = 36
export const RIGHT_RAIL_MIN_WIDTH = 260
export const RIGHT_RAIL_MAX_WIDTH = 320
export const RIGHT_RAIL_COLLAPSE_THRESHOLD = Math.round(RIGHT_RAIL_MIN_WIDTH / 2)
export const RIGHT_RAIL_CONTENT_HIDE_THRESHOLD = RIGHT_RAIL_MIN_WIDTH

export function clampRightRailWidth(width: number): number {
  return Math.min(RIGHT_RAIL_MAX_WIDTH, Math.max(RIGHT_RAIL_MIN_WIDTH, Math.round(width)))
}

export function resolveRightRailResize(width: number): { collapsed: boolean; width: number } {
  if (width < RIGHT_RAIL_COLLAPSE_THRESHOLD) {
    return { collapsed: true, width: RIGHT_RAIL_MIN_WIDTH }
  }
  return { collapsed: false, width: clampRightRailWidth(width) }
}

export function resolveRightRailPreviewWidth(width: number): number {
  const rounded = Math.round(width)
  if (rounded < RIGHT_RAIL_COLLAPSE_THRESHOLD) return RIGHT_RAIL_COLLAPSED_WIDTH
  if (rounded < RIGHT_RAIL_MIN_WIDTH) return RIGHT_RAIL_MIN_WIDTH
  return Math.min(RIGHT_RAIL_MAX_WIDTH, rounded)
}

export function resolveRightRailResizeStartWidth(input: { collapsed: boolean; width: number }): number {
  return input.collapsed ? RIGHT_RAIL_COLLAPSED_WIDTH : clampRightRailWidth(input.width)
}
