import type { PageFragment, PaginatedDocument } from "@/pagination"

export type FragmentZone = "body" | "header" | "footer"

export interface FragmentDrift {
  nodeId: string
  zone: FragmentZone
  nodeType: string
  browserLineCount: number
  serverLineCount: number
  lineDelta: number         // positive = server has more lines, negative = server has fewer
  heightDelta: number
  pageMovement: boolean     // paragraph lands on different pages between browser and server
  browserFragmentCount: number  // how many fragments browser produced for this paragraph
  serverFragmentCount: number   // how many fragments server produced
  continuationChanged: boolean  // true if fragment count differs (split added or removed)
  splitBoundaryMoved: boolean   // true if same fragment count but split points differ
}

export interface GeometryDrift {
  nodeId: string
  zone: FragmentZone
  nodeType: string
  pageMovement: boolean
  heightDelta: number
}

export interface DriftReport {
  driftMap: Map<string, FragmentDrift>        // paragraph line-count + page drift
  geometryDriftMap: Map<string, GeometryDrift> // row / stack / table-row page + height drift
  driftCount: number
  totalParagraphs: number
  maxLineDelta: number
  pageBreakChanged: boolean         // true when any layout fragment (any type) moves pages
  continuationChangedCount: number  // how many paragraphs have a different split-fragment count
}

interface PageLocation {
  sectionIndex: number
  pageIndex: number
  zone: FragmentZone
}

interface FragmentSnapshot {
  zone: FragmentZone
  nodeType: string
  lineCount: number
  height: number
  pages: PageLocation[]     // all pages this paragraph spans, in order
  fragmentCount: number     // how many page fragments this paragraph produced
  splitBoundaries: number[] // lineStart of each continuation fragment (the split points)
}

interface LayoutSnapshot {
  zone: FragmentZone
  nodeType: string
  height: number
  pages: PageLocation[]
}

// Node types whose page movement and geometry drift should be tracked
const TRACKED_TEXT_TYPES = new Set(["paragraph", "toc"])
const TRACKED_LAYOUT_TYPES = new Set(["row", "stack", "table", "table-cell", "table-row", "toc", "spacer"])

function getPageZoneFragments(page: PaginatedDocument["sections"][number]["pages"][number]): Array<{
  fragment: PageFragment
  zone: FragmentZone
}> {
  return [
    ...page.headerFragments.map((fragment) => ({ fragment, zone: "header" as const })),
    ...page.fragments.map((fragment) => ({ fragment, zone: "body" as const })),
    ...page.footerFragments.map((fragment) => ({ fragment, zone: "footer" as const })),
  ]
}

function buildSnapshotMap(doc: PaginatedDocument): Map<string, FragmentSnapshot> {
  const map = new Map<string, FragmentSnapshot>()
  doc.sections.forEach((section, si) => {
    section.pages.forEach((page, pi) => {
      for (const { fragment: f, zone } of getPageZoneFragments(page)) {
        if (!TRACKED_TEXT_TYPES.has(f.nodeType)) continue
        const existing = map.get(f.nodeId)
        if (existing) {
          // lineStart of a continuation fragment is the split boundary
          const boundary = f.lineStart ?? existing.lineCount
          map.set(f.nodeId, {
            zone: existing.zone,
            nodeType: existing.nodeType,
            lineCount: existing.lineCount + (f.lines?.length ?? 0),
            height: existing.height + f.height,
            pages: [...existing.pages, { sectionIndex: si, pageIndex: pi, zone }],
            fragmentCount: existing.fragmentCount + 1,
            splitBoundaries: [...existing.splitBoundaries, boundary],
          })
        } else {
          map.set(f.nodeId, {
            zone,
            nodeType: f.nodeType,
            lineCount: f.lines?.length ?? 0,
            height: f.height,
            pages: [{ sectionIndex: si, pageIndex: pi, zone }],
            fragmentCount: 1,
            splitBoundaries: [],
          })
        }
      }
    })
  })
  return map
}

function buildLayoutSnapshotMap(doc: PaginatedDocument): Map<string, LayoutSnapshot> {
  const map = new Map<string, LayoutSnapshot>()
  doc.sections.forEach((section, si) => {
    section.pages.forEach((page, pi) => {
      for (const { fragment: f, zone } of getPageZoneFragments(page)) {
        if (!TRACKED_LAYOUT_TYPES.has(f.nodeType)) continue
        const existing = map.get(f.nodeId)
        if (existing) {
          map.set(f.nodeId, {
            zone: existing.zone,
            nodeType: existing.nodeType,
            height: existing.height + f.height,
            pages: [...existing.pages, { sectionIndex: si, pageIndex: pi, zone }],
          })
        } else {
          map.set(f.nodeId, {
            zone,
            nodeType: f.nodeType,
            height: f.height,
            pages: [{ sectionIndex: si, pageIndex: pi, zone }],
          })
        }
      }
    })
  })
  return map
}

function pagesMatch(a: PageLocation[], b: PageLocation[]): boolean {
  if (a.length !== b.length) return false
  return a.every((loc, i) => (
    loc.sectionIndex === b[i].sectionIndex &&
    loc.pageIndex === b[i].pageIndex &&
    loc.zone === b[i].zone
  ))
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function comparePagination(browser: PaginatedDocument, server: PaginatedDocument): DriftReport {
  const browserMap = buildSnapshotMap(browser)
  const serverMap = buildSnapshotMap(server)

  const driftMap = new Map<string, FragmentDrift>()
  let maxLineDelta = 0
  let pageBreakChanged = false
  let continuationChangedCount = 0

  for (const [nodeId, bSnap] of browserMap) {
    const sSnap = serverMap.get(nodeId)
    if (!sSnap) continue

    const pageMovement = !pagesMatch(bSnap.pages, sSnap.pages)
    if (pageMovement) pageBreakChanged = true

    const lineDelta = sSnap.lineCount - bSnap.lineCount
    const continuationChanged = bSnap.fragmentCount !== sSnap.fragmentCount
    const splitBoundaryMoved = !continuationChanged &&
      bSnap.fragmentCount > 1 &&
      !arraysEqual(bSnap.splitBoundaries, sSnap.splitBoundaries)

    if (continuationChanged) continuationChangedCount++

    if (lineDelta === 0 && !pageMovement && !continuationChanged && !splitBoundaryMoved) continue

    maxLineDelta = Math.max(maxLineDelta, Math.abs(lineDelta))
    driftMap.set(nodeId, {
      nodeId,
      zone: bSnap.zone,
      nodeType: bSnap.nodeType,
      browserLineCount: bSnap.lineCount,
      serverLineCount: sSnap.lineCount,
      lineDelta,
      heightDelta: sSnap.height - bSnap.height,
      pageMovement,
      browserFragmentCount: bSnap.fragmentCount,
      serverFragmentCount: sSnap.fragmentCount,
      continuationChanged,
      splitBoundaryMoved,
    })
  }

  // Geometry drift for row / stack / table-row
  const browserLayoutMap = buildLayoutSnapshotMap(browser)
  const serverLayoutMap = buildLayoutSnapshotMap(server)
  const geometryDriftMap = new Map<string, GeometryDrift>()

  for (const [nodeId, bSnap] of browserLayoutMap) {
    const sSnap = serverLayoutMap.get(nodeId)
    if (!sSnap) continue
    const pageMovement = !pagesMatch(bSnap.pages, sSnap.pages)
    const heightDelta = sSnap.height - bSnap.height
    if (!pageMovement && heightDelta === 0) continue
    if (pageMovement) pageBreakChanged = true
    geometryDriftMap.set(nodeId, { nodeId, zone: bSnap.zone, nodeType: bSnap.nodeType, pageMovement, heightDelta })
  }

  return {
    driftMap,
    geometryDriftMap,
    driftCount: driftMap.size,
    totalParagraphs: browserMap.size,
    maxLineDelta,
    pageBreakChanged,
    continuationChangedCount,
  }
}
