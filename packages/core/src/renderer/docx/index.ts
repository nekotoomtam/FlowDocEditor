import {
  Document,
  Header,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  PageOrientation,
  SectionType,
  ShadingType,
} from "docx"
import type { PaginatedDocument, PageFragment, ResolvedBorderSide, ResolvedCellBorder } from "../../pagination"
import type { ParagraphRenderProps } from "../../pagination"
import type { RenderResult, Renderer } from "../shared"
import { ptToTwips, ptToHalfPoints } from "../shared"
import { resolveDocxFontName } from "../../font-registry"

/**
 * DOCX Renderer
 *
 * แปลง PaginatedDocument → .docx buffer ด้วย docx library
 *
 * - paragraph       → Paragraph
 * - spacer          → empty Paragraph + spacingAfter
 * - row+stack       → layout Table (invisible borders)
 * - table+row+stack → data Table (มี border จาก cellRenderProps)
 */

// ─── Group Types ──────────────────────────────────────────────────────────────

interface StackGroup { stackFragment: PageFragment; children: PageFragment[] }
interface RowGroup { rowFragment: PageFragment; stacks: StackGroup[] }

interface TableCellGroup { cellFragment: PageFragment; children: PageFragment[] }
interface TableRowGroup { rowFragment: PageFragment; cells: TableCellGroup[] }
interface TableGroup { tableFragment: PageFragment; rows: TableRowGroup[] }

type RenderItem =
  | { kind: "paragraph"; fragment: PageFragment }
  | { kind: "spacer"; fragment: PageFragment }
  | { kind: "row"; group: RowGroup }
  | { kind: "table"; group: TableGroup }
  | { kind: "toc"; fragment: PageFragment }

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupPageFragments(fragments: PageFragment[]): RenderItem[] {
  const items: RenderItem[] = []
  const tableMap = new Map<string, TableGroup>()
  const tableRowMap = new Map<string, TableRowGroup>()
  const tableCellMap = new Map<string, TableCellGroup>()
  const rowMap = new Map<string, RowGroup>()
  const stackMap = new Map<string, StackGroup>()
  const tableRowIds = new Set(
    fragments
      .filter((fragment) => fragment.nodeType === "table-cell" && fragment.parentNodeId)
      .map((fragment) => fragment.parentNodeId!),
  )

  for (const fragment of fragments) {
    if (fragment.nodeType === "table") {
      const group: TableGroup = { tableFragment: fragment, rows: [] }
      tableMap.set(fragment.nodeId, group)
      items.push({ kind: "table", group })
    } else if (fragment.nodeType === "row") {
      if (fragment.parentNodeId && tableRowIds.has(fragment.nodeId)) {
        if (!tableMap.has(fragment.parentNodeId)) {
          const group: TableGroup = {
            tableFragment: { ...fragment, nodeId: fragment.parentNodeId, nodeType: "table", parentNodeId: undefined },
            rows: [],
          }
          tableMap.set(fragment.parentNodeId, group)
          items.push({ kind: "table", group })
        }
        const rowGroup: TableRowGroup = { rowFragment: fragment, cells: [] }
        tableRowMap.set(fragment.nodeId, rowGroup)
        tableMap.get(fragment.parentNodeId)!.rows.push(rowGroup)
      } else {
        const group: RowGroup = { rowFragment: fragment, stacks: [] }
        rowMap.set(fragment.nodeId, group)
        items.push({ kind: "row", group })
      }
    } else if (fragment.nodeType === "table-cell") {
      if (fragment.parentNodeId && tableRowMap.has(fragment.parentNodeId)) {
        const cellGroup: TableCellGroup = { cellFragment: fragment, children: [] }
        tableCellMap.set(fragment.nodeId, cellGroup)
        tableRowMap.get(fragment.parentNodeId)!.cells.push(cellGroup)
      }
    } else if (fragment.nodeType === "stack") {
      if (fragment.parentNodeId && rowMap.has(fragment.parentNodeId)) {
        const stackGroup: StackGroup = { stackFragment: fragment, children: [] }
        stackMap.set(fragment.nodeId, stackGroup)
        rowMap.get(fragment.parentNodeId)!.stacks.push(stackGroup)
      }
    } else if (fragment.nodeType === "paragraph") {
      const parentCell = fragment.parentNodeId ? tableCellMap.get(fragment.parentNodeId) : undefined
      const parentStack = fragment.parentNodeId ? stackMap.get(fragment.parentNodeId) : undefined
      if (parentCell) parentCell.children.push(fragment)
      else if (parentStack) parentStack.children.push(fragment)
      else items.push({ kind: "paragraph", fragment })
    } else if (fragment.nodeType === "spacer") {
      const parentCell = fragment.parentNodeId ? tableCellMap.get(fragment.parentNodeId) : undefined
      const parentStack = fragment.parentNodeId ? stackMap.get(fragment.parentNodeId) : undefined
      if (parentCell) parentCell.children.push(fragment)
      else if (parentStack) parentStack.children.push(fragment)
      else items.push({ kind: "spacer", fragment })
    } else if (fragment.nodeType === "toc") {
      items.push({ kind: "toc", fragment })
    }
  }

  return items
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALIGNMENT: Record<ParagraphRenderProps["align"], string> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }

const INVISIBLE_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER,
  left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
}

function toBorderOpts(side: ResolvedBorderSide | undefined) {
  if (!side || side.style === "none") return NO_BORDER
  const styleMap: Record<string, string> = {
    solid: BorderStyle.SINGLE,
    dashed: BorderStyle.DASHED,
    dotted: BorderStyle.DOTTED,
  }
  return {
    style: (styleMap[side.style] ?? BorderStyle.SINGLE) as typeof BorderStyle.SINGLE,
    size: Math.max(1, Math.round(side.width * 8)),
    color: side.color,
  }
}

function buildCellBorders(border: ResolvedCellBorder) {
  return {
    top: toBorderOpts(border.top),
    right: toBorderOpts(border.right),
    bottom: toBorderOpts(border.bottom),
    left: toBorderOpts(border.left),
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
  }
}

function toParagraphBorderOpts(side: ResolvedBorderSide | undefined, space = 0) {
  const opts = toBorderOpts(side)
  return space > 0 ? { ...opts, space: Math.round(space) } : opts
}

function buildParagraphBorders(fragment: PageFragment) {
  const props = fragment.renderProps
  const box = props?.box
  if (!props || !box) return undefined

  const isFirstFragment = fragment.continuesFrom !== true
  const isLastFragment = fragment.isContinued !== true
  return {
    top: isFirstFragment ? toParagraphBorderOpts(box.border.top, box.padding.top) : NO_BORDER,
    right: toParagraphBorderOpts(box.border.right, box.padding.right),
    bottom: isLastFragment ? toParagraphBorderOpts(box.border.bottom, box.padding.bottom) : NO_BORDER,
    left: toParagraphBorderOpts(box.border.left, box.padding.left),
    between: NO_BORDER,
  }
}

function buildParagraphShading(fragment: PageFragment) {
  const fill = fragment.renderProps?.box?.fill
  return fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildParagraph(fragment: PageFragment): Paragraph | null {
  if (!fragment.lines?.length || !fragment.renderProps) return null
  const props = fragment.renderProps
  const text = fragment.lines.map((l) => l.text).join(" ").trim()
  if (!text && !props.box) return null

  return new Paragraph({
    includeIfEmpty: Boolean(props.box),
    children: [new TextRun({
      text,
      size: ptToHalfPoints(props.fontSize),
      font: resolveDocxFontName(props.fontFamilyKey),
    })],
    alignment: ALIGNMENT[props.align] as any,
    spacing: {
      before: ptToTwips(props.spacingBefore),
      after: ptToTwips(props.spacingAfter),
      line: ptToTwips(props.lineHeight),
      lineRule: "exact" as const,
    },
    indent: {
      left: ptToTwips(props.indentLeft),
      right: ptToTwips(props.indentRight),
      firstLine: ptToTwips(props.textIndent),
    },
    border: buildParagraphBorders(fragment),
    shading: buildParagraphShading(fragment),
  })
}

function buildSpacer(fragment: PageFragment): Paragraph {
  return new Paragraph({ children: [], spacing: { after: ptToTwips(fragment.height) } })
}

function buildCellChildren(children: PageFragment[]): Paragraph[] {
  return children.flatMap((child) => {
    if (child.nodeType === "paragraph") { const p = buildParagraph(child); return p ? [p] : [] }
    if (child.nodeType === "spacer") return [buildSpacer(child)]
    return []
  })
}

function buildLayoutTable(group: RowGroup): Table {
  const rowWidth = group.rowFragment.width
  const cells = group.stacks.map((stack) =>
    new TableCell({
      width: { size: Math.round((stack.stackFragment.width / rowWidth) * 100), type: WidthType.PERCENTAGE },
      borders: INVISIBLE_BORDERS,
      children: buildCellChildren(stack.children),
    }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: cells })],
  })
}

function buildDataTable(group: TableGroup): Table {
  const rows = group.rows.map((rowGroup) => {
    const cells = rowGroup.cells.map((cellGroup) => {
      const crp = cellGroup.cellFragment.cellRenderProps
      const rowWidth = rowGroup.rowFragment.width
      const widthPct = Math.round((cellGroup.cellFragment.width / rowWidth) * 100)
      return new TableCell({
        width: { size: widthPct, type: WidthType.PERCENTAGE },
        rowSpan: crp?.rowspan,
        columnSpan: crp?.colspan,
        borders: crp ? buildCellBorders(crp.border) : INVISIBLE_BORDERS,
        children: buildCellChildren(cellGroup.children),
      })
    })
    return new TableRow({ children: cells })
  })
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

function buildToc(fragment: PageFragment): Paragraph[] {
  if (!fragment.lines?.length || !fragment.renderProps) return []
  return fragment.lines
    .filter((line) => line.text.trim() !== "")
    .map((line) => {
      const size = ptToHalfPoints(line.fontSize ?? fragment.renderProps!.fontSize)
      const indentLeft = Math.max(0, line.x - fragment.x)
      return new Paragraph({
        children: [new TextRun({ text: line.text, size, font: resolveDocxFontName(fragment.renderProps!.fontFamilyKey) })],
        indent: { left: ptToTwips(indentLeft) },
        spacing: { after: ptToTwips(2) },
      })
    })
}

function buildItems(items: RenderItem[]): (Paragraph | Table)[] {
  return items.flatMap((item) => {
    if (item.kind === "paragraph") { const p = buildParagraph(item.fragment); return p ? [p] : [] }
    if (item.kind === "spacer") return [buildSpacer(item.fragment)]
    if (item.kind === "row") return [buildLayoutTable(item.group)]
    if (item.kind === "table") return [buildDataTable(item.group)]
    if (item.kind === "toc") return buildToc(item.fragment)
    return []
  })
}

// ─── Zone Content ─────────────────────────────────────────────────────────────

function buildZoneContent(fragments: PageFragment[]): (Paragraph | Table)[] {
  if (fragments.length === 0) return []
  return buildItems(groupPageFragments(fragments))
}

function sameFragmentList(a: PageFragment[], b: PageFragment[]): boolean {
  return a.length === b.length && a.every((f, i) => f.nodeId === b[i].nodeId)
}

function buildHeaders(fragments: PageFragment[]) {
  const content = buildZoneContent(fragments)
  return content.length > 0 ? { default: new Header({ children: content }) } : undefined
}

function buildFooters(fragments: PageFragment[]) {
  const content = buildZoneContent(fragments)
  return content.length > 0 ? { default: new Footer({ children: content }) } : undefined
}

function buildPageProperties(page: { width: number; height: number; contentBox: { x: number; y: number; width: number; height: number } }, isFirst: boolean) {
  return {
    ...(isFirst ? {} : { type: SectionType.NEXT_PAGE }),
    page: {
      size: {
        width: ptToTwips(page.width),
        height: ptToTwips(page.height),
        orientation: page.width > page.height
          ? PageOrientation.LANDSCAPE
          : PageOrientation.PORTRAIT,
      },
      margin: {
        top: ptToTwips(page.contentBox.y),
        right: ptToTwips(page.width - page.contentBox.x - page.contentBox.width),
        bottom: ptToTwips(page.height - page.contentBox.y - page.contentBox.height),
        left: ptToTwips(page.contentBox.x),
      },
    },
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class DocxRenderer implements Renderer {
  async render(doc: PaginatedDocument): Promise<RenderResult> {
    const pages = doc.sections.flatMap((section) => section.pages)
    const sections = pages.map((page, index) => {
      const children = buildItems(groupPageFragments(page.fragments))
      return {
        headers: buildHeaders(page.headerFragments),
        footers: buildFooters(page.footerFragments),
        properties: buildPageProperties(page, index === 0),
        children: children.length > 0 ? children : [new Paragraph({ children: [] })],
      }
    })

    const wordDoc = new Document({
      sections: sections.length > 0
        ? sections
        : [{ children: [new Paragraph({ children: [] })] }],
    })

    const buffer = await Packer.toBuffer(wordDoc)
    return {
      buffer: new Uint8Array(buffer),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    }
  }
}
