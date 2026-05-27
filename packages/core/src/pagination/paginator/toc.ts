import {
  TOC_ENTRY_FS,
  TOC_ENTRY_LH,
  TOC_TITLE_AFTER,
  TOC_TITLE_FS,
  TOC_TITLE_LH,
} from "../../layout"
import { DEFAULT_FONT_KEY } from "../../font-registry"
import type { FlowBox } from "../../layout"
import type { DocumentNode, ParagraphNode, TocNode } from "../../schema"
import type { PageFlowCursor, PaginatedLine, PaginatedPage, PaginatedSection, TocEntry } from "../types"
import {
  advancePage,
  pushFragment,
  shouldMoveBlockToNextPage,
  shouldMoveToNextPage,
} from "./cursor"

type TocPaginationOptions = {
  isolateBefore?: boolean
  isolateAfter?: boolean
}

function getParagraphText(node: ParagraphNode): string {
  return node.children
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
}

export function collectTocEntries(sections: PaginatedSection[], doc: DocumentNode): TocEntry[] {
  const entries: TocEntry[] = []
  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    const sectionStartPageIndex = ps.pages[0]?.index ?? 0
    const pageNumberOffset = section.page.pageNumberStart !== undefined
      ? section.page.pageNumberStart - sectionStartPageIndex - 1
      : 0
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "paragraph") return
        if (frag.parentNodeId !== section.bodyRootId) return
        const node = section.nodes[frag.nodeId]
        if (node?.type !== "paragraph" || !node.props.headingLevel) return
        entries.push({
          nodeId: frag.nodeId,
          text: getParagraphText(node),
          level: node.props.headingLevel,
          pageNumber: frag.pageIndex + 1 + pageNumberOffset,
        })
      })
    })
  })
  return entries
}

export function fillTocFragments(sections: PaginatedSection[], doc: DocumentNode, tocEntries: TocEntry[]): void {
  const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
  const INDENT_PER_LEVEL = 12

  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "toc") return
        const node = section.nodes[frag.nodeId] as unknown as TocNode | undefined
        if (node?.type !== "toc") return

        const maxLevel = node.props.maxLevel ?? 3
        const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
        const filtered = tocEntries.filter((e) => e.level <= maxLevel)

        const lines: PaginatedLine[] = []
        let lineY = frag.y

        if (title) {
          const titleH = TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER
          lines.push({ text: title, x: frag.x, y: lineY, width: frag.width, height: titleH, fontSize: TOC_TITLE_FS })
          lineY += titleH
        }

        for (const entry of filtered) {
          const indent = (entry.level - 1) * INDENT_PER_LEVEL
          const availW = frag.width - indent
          const pageStr = String(entry.pageNumber)
          const approxCharsAvail = Math.floor(availW / (TOC_ENTRY_FS * 0.5))
          const dotCount = Math.max(3, approxCharsAvail - entry.text.length - pageStr.length - 2)
          const lineText = entry.text + " " + "·".repeat(dotCount) + " " + pageStr
          lines.push({ text: lineText, x: frag.x + indent, y: lineY, width: availW, height: entryH, fontSize: TOC_ENTRY_FS })
          lineY += entryH
        }

        frag.lines = lines
        frag.renderProps = {
          fontSize: TOC_ENTRY_FS, fontFamilyKey: DEFAULT_FONT_KEY, align: "left",
          lineHeight: TOC_ENTRY_LH, spacingBefore: 0, spacingAfter: 0,
          textIndent: 0, indentLeft: 0, indentRight: 0,
        }
      })
    })
  })
}

function computeTocActualHeight(entries: TocEntry[], node: TocNode): number {
  const maxLevel = node.props.maxLevel ?? 3
  const filtered = entries.filter((e) => e.level <= maxLevel)
  const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
  const titleH = title ? TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER : 0
  const entryH = TOC_ENTRY_FS * TOC_ENTRY_LH
  return titleH + filtered.length * entryH
}

export function computeTocOverrides(
  sections: PaginatedSection[],
  doc: DocumentNode,
  entries: TocEntry[],
): Map<string, number> {
  const overrides = new Map<string, number>()
  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "toc") return
        const node = section.nodes[frag.nodeId] as unknown as TocNode | undefined
        if (node?.type !== "toc") return
        const actual = computeTocActualHeight(entries, node)
        if (actual > frag.height) overrides.set(node.id, actual)
      })
    })
  })
  return overrides
}

export function paginateTocPlaceholder(
  box: FlowBox,
  pages: PaginatedPage[],
  template: PaginatedPage,
  contentTop: number,
  contentBottom: number,
  cursor: PageFlowCursor,
  parentNodeId?: string,
  options: TocPaginationOptions = {},
): PageFlowCursor {
  let current = cursor
  if (options.isolateBefore && current.cursorY > contentTop + 1) {
    current = advancePage(current, contentTop)
  }

  if (shouldMoveToNextPage(current.cursorY, contentBottom) ||
    shouldMoveBlockToNextPage(current.cursorY, box.height, contentTop, contentBottom)) {
    current = advancePage(current, contentTop)
  }

  pushFragment(pages, template, {
    nodeId: box.nodeId,
    nodeType: "toc",
    parentNodeId,
    pageIndex: current.pageIndex,
    x: box.x,
    y: current.cursorY,
    width: box.width,
    height: box.height,
    lines: [],
  })

  const afterToc = { ...current, cursorY: current.cursorY + box.height }
  return options.isolateAfter ? advancePage(afterToc, contentTop) : afterToc
}
