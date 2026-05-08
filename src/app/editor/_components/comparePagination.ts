import type { PaginatedDocument } from "@/pagination"

export interface FragmentDrift {
  nodeId: string
  browserLineCount: number
  serverLineCount: number
  lineDelta: number   // positive = server has more lines, negative = server has fewer
  heightDelta: number
  pageMovement: boolean  // paragraph lands on different pages between browser and server
}

export interface DriftReport {
  driftMap: Map<string, FragmentDrift>
  driftCount: number
  totalParagraphs: number
  maxLineDelta: number
  pageBreakChanged: boolean
}

interface PageLocation {
  sectionIndex: number
  pageIndex: number
}

interface FragmentSnapshot {
  lineCount: number
  height: number
  pages: PageLocation[]  // all pages this paragraph spans, in order
}

function buildSnapshotMap(doc: PaginatedDocument): Map<string, FragmentSnapshot> {
  const map = new Map<string, FragmentSnapshot>()
  doc.sections.forEach((section, si) => {
    section.pages.forEach((page, pi) => {
      for (const f of page.fragments) {
        if (f.nodeType !== "paragraph") continue
        const existing = map.get(f.nodeId)
        if (existing) {
          // Aggregate across fragments — paragraph can span multiple pages
          map.set(f.nodeId, {
            lineCount: existing.lineCount + (f.lines?.length ?? 0),
            height: existing.height + f.height,
            pages: [...existing.pages, { sectionIndex: si, pageIndex: pi }],
          })
        } else {
          map.set(f.nodeId, {
            lineCount: f.lines?.length ?? 0,
            height: f.height,
            pages: [{ sectionIndex: si, pageIndex: pi }],
          })
        }
      }
    })
  })
  return map
}

function pagesMatch(a: PageLocation[], b: PageLocation[]): boolean {
  if (a.length !== b.length) return false
  return a.every((loc, i) => loc.sectionIndex === b[i].sectionIndex && loc.pageIndex === b[i].pageIndex)
}

export function comparePagination(browser: PaginatedDocument, server: PaginatedDocument): DriftReport {
  const browserMap = buildSnapshotMap(browser)
  const serverMap = buildSnapshotMap(server)

  const driftMap = new Map<string, FragmentDrift>()
  let maxLineDelta = 0
  let pageBreakChanged = false

  for (const [nodeId, bSnap] of browserMap) {
    const sSnap = serverMap.get(nodeId)
    if (!sSnap) continue

    const pageMovement = !pagesMatch(bSnap.pages, sSnap.pages)
    if (pageMovement) pageBreakChanged = true

    const lineDelta = sSnap.lineCount - bSnap.lineCount
    if (lineDelta === 0 && !pageMovement) continue

    maxLineDelta = Math.max(maxLineDelta, Math.abs(lineDelta))
    driftMap.set(nodeId, {
      nodeId,
      browserLineCount: bSnap.lineCount,
      serverLineCount: sSnap.lineCount,
      lineDelta,
      heightDelta: sSnap.height - bSnap.height,
      pageMovement,
    })
  }

  return {
    driftMap,
    driftCount: driftMap.size,
    totalParagraphs: browserMap.size,
    maxLineDelta,
    pageBreakChanged,
  }
}
