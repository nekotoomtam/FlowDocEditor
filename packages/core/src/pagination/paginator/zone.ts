import { measureParagraph } from "../../layout"
import type { FlowBox, TextMeasurer, WordBreaker } from "../../layout"
import type { DocumentSection } from "../../schema"
import type { PageFragment } from "../types"
import { toPageFragmentNodeType } from "./cursor"
import { buildPositionedParagraphLines, buildRenderProps, resolvePageNumbers } from "./paragraph"

function collectZoneFragments(
  box: FlowBox,
  section: DocumentSection,
  measurer: TextMeasurer,
  parentNodeId?: string,
  wordBreaker?: WordBreaker,
): PageFragment[] {
  const fragments: PageFragment[] = []

  const fragment: PageFragment = {
    nodeId: box.nodeId,
    nodeType: toPageFragmentNodeType(box.nodeType),
    parentNodeId,
    pageIndex: 0,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  }

  if (box.nodeType === "paragraph") {
    const node = section.nodes[box.nodeId]
    if (node?.type === "paragraph") {
      const measured = measureParagraph(node, box.width, measurer, wordBreaker)
      fragment.lines = buildPositionedParagraphLines(measured, measured.lines, box.x, box.y, 0, node.props.align)
      fragment.renderProps = buildRenderProps(node, measured.lineHeight, measured.box)
    }
  }

  fragments.push(fragment)
  box.children.forEach((child) => {
    fragments.push(...collectZoneFragments(child, section, measurer, box.nodeId, wordBreaker))
  })

  return fragments
}

export function buildZoneFragments(
  box: FlowBox | null,
  section: DocumentSection,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
): PageFragment[] {
  return box ? collectZoneFragments(box, section, measurer, undefined, wordBreaker) : []
}

export function cloneZoneFragmentsForPage(
  fragments: PageFragment[],
  pageIndex: number,
  pageNumberOffset: number,
): PageFragment[] {
  return fragments.map((fragment) => ({
    ...fragment,
    pageIndex,
    lines: fragment.lines
      ? resolvePageNumbers(fragment.lines, pageIndex + 1 + pageNumberOffset)
      : fragment.lines,
  }))
}
