import type { PageSettings } from "../schema"
import type { PageMetrics, PaginatedPage } from "./types"
import { toAbstractUnit } from "../layout"

/**
 * metrics — คำนวณขนาด page จาก PageSettings
 * แยกออกมาเพื่อให้ test ได้ง่าย
 */

// A4 dimensions ใน pt
const A4_PT = { width: 595, height: 842 }

export function getPageDimensions(settings: PageSettings): { width: number; height: number } {
  return settings.orientation === "landscape"
    ? { width: A4_PT.height, height: A4_PT.width }
    : { width: A4_PT.width, height: A4_PT.height }
}

export function getPageMetrics(settings: PageSettings): PageMetrics {
  const dim = getPageDimensions(settings)
  const marginTop = toAbstractUnit(settings.margin.top.value, settings.margin.top.unit)
  const marginRight = toAbstractUnit(settings.margin.right.value, settings.margin.right.unit)
  const marginBottom = toAbstractUnit(settings.margin.bottom.value, settings.margin.bottom.unit)
  const marginLeft = toAbstractUnit(settings.margin.left.value, settings.margin.left.unit)
  const headerReserved = Math.max(0, settings.headerReserved ?? 0)
  const footerReserved = Math.max(0, settings.footerReserved ?? 0)

  const contentX = marginLeft
  const contentY = marginTop + headerReserved
  const contentWidth = dim.width - marginLeft - marginRight
  const contentHeight = dim.height - marginTop - marginBottom - headerReserved - footerReserved

  return {
    pageWidth: dim.width,
    pageHeight: dim.height,
    contentBox: {
      x: contentX,
      y: contentY,
      width: Math.max(0, contentWidth),
      height: Math.max(0, contentHeight),
    },
  }
}

export function createEmptyPage(index: number, metrics: PageMetrics): PaginatedPage {
  return {
    index,
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    contentBox: { ...metrics.contentBox },
    fragments: [],
    headerFragments: [],
    footerFragments: [],
  }
}
