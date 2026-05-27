import {
  TOC_ENTRY_FS,
  TOC_ENTRY_LH,
  TOC_TITLE_AFTER,
  TOC_TITLE_FS,
  TOC_TITLE_LH,
  type TextMeasurer,
  type TextRunLayoutStyle,
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
  node?: TocNode
}

const TOC_INDENT_PER_LEVEL = 12
const TOC_LEADER_CHAR = "·"
const TOC_MIN_LEADER_DOTS = 3
const TOC_PAGE_NUMBER_GAP = 6

type TocLineTemplate = Omit<PaginatedLine, "y">
type TocMeasureText = (text: string, fontSize: number) => number

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

function tocTitleHeight(node: TocNode): number {
  const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
  return title ? TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER : 0
}

function tocEntryHeight(): number {
  return TOC_ENTRY_FS * TOC_ENTRY_LH
}

function tocRunStyle(fontSize: number, lineHeight: number): TextRunLayoutStyle {
  return {
    fontSize,
    fontFamilyKey: DEFAULT_FONT_KEY,
    textColor: "000000",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    strikethrough: false,
    fontVariant: "regular",
    lineHeight,
  }
}

function buildTocEntryLineTemplate(
  entry: TocEntry,
  fragment: PageFragmentLike,
  measureText: TocMeasureText,
): TocLineTemplate {
  const indent = (entry.level - 1) * TOC_INDENT_PER_LEVEL
  const lineX = fragment.x + indent
  const lineWidth = Math.max(0, fragment.width - indent)
  const pageStr = String(entry.pageNumber)
  const style = tocRunStyle(TOC_ENTRY_FS, TOC_ENTRY_LH)
  const textWidth = measureText(entry.text, TOC_ENTRY_FS)
  const spaceWidth = measureText(" ", TOC_ENTRY_FS)
  const pageWidth = measureText(pageStr, TOC_ENTRY_FS)
  const dotWidth = Math.max(measureText(TOC_LEADER_CHAR, TOC_ENTRY_FS), 0.01)
  const pageRunX = Math.max(0, lineWidth - pageWidth)
  const leaderStartX = textWidth + spaceWidth
  const leaderAvailable = Math.max(0, pageRunX - leaderStartX - TOC_PAGE_NUMBER_GAP)
  const leaderDotCount = Math.floor(leaderAvailable / dotWidth)
  const leaderText = leaderDotCount >= TOC_MIN_LEADER_DOTS
    ? TOC_LEADER_CHAR.repeat(leaderDotCount)
    : ""
  const leaderWidth = leaderText ? dotWidth * leaderDotCount : 0
  const pageStart = entry.text.length + (leaderText ? 1 + leaderText.length + 1 : 1)
  const lineText = leaderText
    ? `${entry.text} ${leaderText} ${pageStr}`
    : `${entry.text} ${pageStr}`

  return {
    text: lineText,
    x: lineX,
    width: lineWidth,
    height: tocEntryHeight(),
    fontSize: TOC_ENTRY_FS,
    runs: [
      {
        text: entry.text,
        start: 0,
        end: entry.text.length,
        x: 0,
        width: textWidth,
        sourceType: "text",
        style,
      },
      ...(leaderText ? [{
        text: leaderText,
        start: entry.text.length + 1,
        end: entry.text.length + 1 + leaderText.length,
        x: leaderStartX,
        width: leaderWidth,
        sourceType: "text" as const,
        style,
      }] : []),
      {
        text: pageStr,
        start: pageStart,
        end: pageStart + pageStr.length,
        x: pageRunX,
        width: pageWidth,
        sourceType: "pageNumber",
        style,
      },
    ],
  }
}

type PageFragmentLike = {
  x: number
  width: number
}

function buildTocLineTemplates(node: TocNode, fragment: PageFragmentLike, entries: TocEntry[], measurer: TextMeasurer): TocLineTemplate[] {
  const maxLevel = node.props.maxLevel ?? 3
  const title = node.props.title !== undefined ? node.props.title : "สารบัญ"
  const filtered = entries.filter((e) => e.level <= maxLevel)
  const widthCache = new Map<string, number>()
  const measureText = (text: string, fontSize: number): number => {
    const key = `${fontSize}:${text}`
    const cached = widthCache.get(key)
    if (cached !== undefined) return cached
    const width = measurer.measureText(text, DEFAULT_FONT_KEY, fontSize, "regular").width
    widthCache.set(key, width)
    return width
  }

  const lines: TocLineTemplate[] = []
  if (title) {
    lines.push({
      text: title,
      x: fragment.x,
      width: fragment.width,
      height: tocTitleHeight(node),
      fontSize: TOC_TITLE_FS,
    })
  }

  for (const entry of filtered) {
    lines.push(buildTocEntryLineTemplate(entry, fragment, measureText))
  }

  return lines
}

function materializeTocLines(fragment: { y: number }, templates: TocLineTemplate[]): PaginatedLine[] {
  let y = fragment.y
  return templates.map((line) => {
    const materialized = { ...line, y }
    y += line.height
    return materialized
  })
}

function resolveTocRenderProps() {
  return {
    fontSize: TOC_ENTRY_FS,
    fontFamilyKey: DEFAULT_FONT_KEY,
    align: "left" as const,
    lineHeight: TOC_ENTRY_LH,
    spacingBefore: 0,
    spacingAfter: 0,
    textIndent: 0,
    indentLeft: 0,
    indentRight: 0,
  }
}

export function fillTocFragments(
  sections: PaginatedSection[],
  doc: DocumentNode,
  tocEntries: TocEntry[],
  measurer: TextMeasurer,
): void {
  sections.forEach((ps, si) => {
    const section = doc.document.sections[si]
    if (!section) return
    const templateCache = new Map<string, TocLineTemplate[]>()
    ps.pages.forEach((page) => {
      page.fragments.forEach((frag) => {
        if (frag.nodeType !== "toc") return
        const node = section.nodes[frag.nodeId] as unknown as TocNode | undefined
        if (node?.type !== "toc") return

        const templateKey = `${frag.nodeId}:${frag.x}:${frag.width}`
        const cachedTemplates = templateCache.get(templateKey)
        const templates = cachedTemplates ?? buildTocLineTemplates(node, frag, tocEntries, measurer)
        if (!cachedTemplates) templateCache.set(templateKey, templates)
        const start = Math.max(0, frag.lineStart ?? 0)
        const end = Math.min(templates.length, frag.lineEnd ?? templates.length)
        frag.lines = materializeTocLines(frag, templates.slice(start, end))
        frag.renderProps = resolveTocRenderProps()
      })
    })
  })
}

function computeTocActualHeight(entries: TocEntry[], node: TocNode): number {
  const maxLevel = node.props.maxLevel ?? 3
  const filtered = entries.filter((e) => e.level <= maxLevel)
  return tocTitleHeight(node) + filtered.length * tocEntryHeight()
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

function buildTocPlaceholderLineHeights(totalHeight: number, node: TocNode | undefined): number[] {
  if (totalHeight <= 0) return []

  const titleH = node ? tocTitleHeight(node) : TOC_TITLE_FS * TOC_TITLE_LH + TOC_TITLE_AFTER
  const entryH = tocEntryHeight()
  const remaining = Math.max(0, totalHeight - titleH)
  const entryCount = Math.max(0, Math.round(remaining / entryH))
  const heights: number[] = []
  if (titleH > 0) heights.push(titleH)
  for (let i = 0; i < entryCount; i++) heights.push(entryH)
  return heights.length > 0 ? heights : [totalHeight]
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

  const lineHeights = buildTocPlaceholderLineHeights(box.height, options.node)
  let lineIndex = 0
  let fragmentIndex = 0

  while (lineIndex < lineHeights.length) {
    if (shouldMoveToNextPage(current.cursorY, contentBottom)) {
      current = advancePage(current, contentTop)
    }

    const lineStart = lineIndex
    const availableHeight = Math.max(0, contentBottom - current.cursorY)
    let fragmentHeight = 0

    while (lineIndex < lineHeights.length) {
      const lineHeight = lineHeights[lineIndex]
      const fits = fragmentHeight + lineHeight <= availableHeight + 0.01
      if (!fits && fragmentHeight > 0) break

      fragmentHeight += lineHeight
      lineIndex += 1

      if (!fits) break
    }

    const isContinued = lineIndex < lineHeights.length
    pushFragment(pages, template, {
      nodeId: box.nodeId,
      nodeType: "toc",
      parentNodeId,
      pageIndex: current.pageIndex,
      x: box.x,
      y: current.cursorY,
      width: box.width,
      height: Math.max(fragmentHeight, 1),
      lines: [],
      fragmentIndex,
      lineStart,
      lineEnd: lineIndex,
      continuesFrom: fragmentIndex > 0,
      isContinued,
    })

    current = { ...current, cursorY: current.cursorY + fragmentHeight }
    fragmentIndex += 1
    if (isContinued) current = advancePage(current, contentTop)
  }

  return options.isolateAfter ? advancePage(current, contentTop) : current
}
