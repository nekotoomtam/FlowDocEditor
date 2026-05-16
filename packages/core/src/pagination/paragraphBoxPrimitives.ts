import type { PageFragment, ResolvedBorderSide } from "./types"

export interface ParagraphBoxRectPrimitive {
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface ParagraphBoxLinePrimitive {
  side: "top" | "right" | "bottom" | "left"
  border: ResolvedBorderSide
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ParagraphBoxLayoutPrimitives {
  fill?: ParagraphBoxRectPrimitive
  borders: ParagraphBoxLinePrimitive[]
}

export function resolveFragmentBoxLayoutPrimitives(fragment: PageFragment): ParagraphBoxLayoutPrimitives | null {
  const props = fragment.renderProps
  const box = fragment.nodeType === "paragraph" ? props?.box : fragment.boxRenderProps
  if (!box) return null

  const isFirstFragment = fragment.continuesFrom !== true
  const isLastFragment = fragment.isContinued !== true
  const spacingBefore = fragment.nodeType === "paragraph" && props ? props.spacingBefore : 0
  const spacingAfter = fragment.nodeType === "paragraph" && props ? props.spacingAfter : 0
  const boxY = fragment.y + (isFirstFragment ? spacingBefore : 0)
  const boxHeight = Math.max(
    0,
    fragment.height -
      (isFirstFragment ? spacingBefore : 0) -
      (isLastFragment ? spacingAfter : 0),
  )
  if (boxHeight <= 0 || fragment.width <= 0) return null

  const x = fragment.x
  const yTop = boxY
  const yBottom = boxY + boxHeight
  const borders: ParagraphBoxLinePrimitive[] = []

  if (isFirstFragment && box.border.top) {
    borders.push({ side: "top", border: box.border.top, x1: x, y1: yTop, x2: x + fragment.width, y2: yTop })
  }
  if (isLastFragment && box.border.bottom) {
    borders.push({ side: "bottom", border: box.border.bottom, x1: x, y1: yBottom, x2: x + fragment.width, y2: yBottom })
  }
  if (box.border.left) {
    borders.push({ side: "left", border: box.border.left, x1: x, y1: yTop, x2: x, y2: yBottom })
  }
  if (box.border.right) {
    borders.push({ side: "right", border: box.border.right, x1: x + fragment.width, y1: yTop, x2: x + fragment.width, y2: yBottom })
  }

  return {
    fill: box.fill ? { x, y: yTop, width: fragment.width, height: boxHeight, color: box.fill } : undefined,
    borders,
  }
}

export function resolveParagraphBoxLayoutPrimitives(fragment: PageFragment): ParagraphBoxLayoutPrimitives | null {
  if (fragment.nodeType !== "paragraph") return null
  return resolveFragmentBoxLayoutPrimitives(fragment)
}
