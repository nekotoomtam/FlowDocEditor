import type { PaginatedDocument } from "./types"

export interface PaginationViolation {
  rule: "negative-height" | "outside-content-box" | "wrong-y-order" | "split-fragment-order"
  sectionIndex: number
  pageIndex: number
  nodeId: string
  detail: string
}

const EPSILON = 0.5  // floating-point tolerance in pt

/**
 * Check a PaginatedDocument for layout invariant violations.
 * Returns an array of violations; empty array means the document is valid.
 *
 * Rules checked:
 * - negative-height: fragment.height < 0
 * - outside-content-box: fragment x or x+width outside the page content box
 * - wrong-y-order: consecutive fragments on the same page have decreasing Y
 * - split-fragment-order: fragments of the same nodeId appear on out-of-order pages
 *
 * Note: Y overflow below contentBottom is allowed and documented (whole-block move
 * can overflow when a node is taller than one page). Only the x/width and Y-start
 * position are checked against the content box.
 */
export function checkPaginatedDocument(paginated: PaginatedDocument): PaginationViolation[] {
  const violations: PaginationViolation[] = []

  // Track the last page index seen for each nodeId (for split-fragment-order check)
  const lastPageByNode = new Map<string, { sectionIndex: number; pageIndex: number }>()

  paginated.sections.forEach((section, si) => {
    section.pages.forEach((page, pi) => {
      const cb = page.contentBox
      let prevY = -Infinity

      page.fragments.forEach((f) => {
        // Rule 1: height must be non-negative
        if (f.height < 0) {
          violations.push({
            rule: "negative-height",
            sectionIndex: si,
            pageIndex: pi,
            nodeId: f.nodeId,
            detail: `height=${f.height}`,
          })
        }

        // Rule 2: x and x+width must be within content box (with epsilon tolerance)
        if (f.x < cb.x - EPSILON) {
          violations.push({
            rule: "outside-content-box",
            sectionIndex: si,
            pageIndex: pi,
            nodeId: f.nodeId,
            detail: `x=${f.x} < contentBox.x=${cb.x}`,
          })
        }
        if (f.x + f.width > cb.x + cb.width + EPSILON) {
          violations.push({
            rule: "outside-content-box",
            sectionIndex: si,
            pageIndex: pi,
            nodeId: f.nodeId,
            detail: `x+width=${f.x + f.width} > contentBox.x+width=${cb.x + cb.width}`,
          })
        }

        // Rule 3: Y must be non-decreasing within a page
        if (f.y < prevY - EPSILON) {
          violations.push({
            rule: "wrong-y-order",
            sectionIndex: si,
            pageIndex: pi,
            nodeId: f.nodeId,
            detail: `y=${f.y} < previous fragment y=${prevY}`,
          })
        }
        prevY = f.y

        // Rule 4: split fragments must appear in page order
        const last = lastPageByNode.get(f.nodeId)
        if (last) {
          const isAfter =
            si > last.sectionIndex ||
            (si === last.sectionIndex && pi >= last.pageIndex)
          if (!isAfter) {
            violations.push({
              rule: "split-fragment-order",
              sectionIndex: si,
              pageIndex: pi,
              nodeId: f.nodeId,
              detail: `fragment on section ${si} page ${pi} appears before earlier fragment on section ${last.sectionIndex} page ${last.pageIndex}`,
            })
          }
        }
        lastPageByNode.set(f.nodeId, { sectionIndex: si, pageIndex: pi })
      })
    })
  })

  return violations
}

/**
 * Assert that a PaginatedDocument has no layout violations.
 * Throws with a detailed message listing all violations if any are found.
 */
export function assertPaginatedDocument(paginated: PaginatedDocument): void {
  const violations = checkPaginatedDocument(paginated)
  if (violations.length === 0) return

  const lines = violations.map(
    (v) => `  [${v.rule}] section=${v.sectionIndex} page=${v.pageIndex} node=${v.nodeId}: ${v.detail}`,
  )
  throw new Error(
    `PaginatedDocument has ${violations.length} violation(s):\n${lines.join("\n")}`,
  )
}
