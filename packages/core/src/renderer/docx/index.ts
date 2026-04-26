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
} from "docx"
import type { PaginatedDocument, PageFragment, ResolvedBorderSide, ResolvedCellBorder } from "../../pagination"
import type { ParagraphRenderProps } from "../../pagination"
import type { RenderResult, Renderer } from "../shared"
import { ptToTwips, ptToHalfPoints } from "../shared"

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

// ─── Grouping ─────────────────────────────────────────────────────────────────

function groupPageFragments(fragments: PageFragment[]): RenderItem[] {
  const items: RenderItem[] = []
  const tableMap = new Map<string, TableGroup>()
  const tableRowMap = new Map<string, TableRowGroup>()
  const tableCellMap = new Map<string, TableCellGroup>()
  const rowMap = new Map<string, RowGroup>()
  const stackMap = new Map<string, StackGroup>()

  for (const fragment of fragments) {
    if (fragment.nodeType === "table") {
      const group: TableGroup = { tableFragment: fragment, rows: [] }
      tableMap.set(fragment.nodeId, group)
      items.push({ kind: "table", group })
    } else if (fragment.nodeType === "row") {
      if (fragment.parentNodeId && tableMap.has(fragment.parentNodeId)) {
        const rowGroup: TableRowGroup = { rowFragment: fragment, cells: [] }
        tableRowMap.set(fragment.nodeId, rowGroup)
        tableMap.get(fragment.parentNodeId)!.rows.push(rowGroup)
      } else {
        const group: RowGroup = { rowFragment: fragment, stacks: [] }
        rowMap.set(fragment.nodeId, group)
        items.push({ kind: "row", group })
      }
    } else if (fragment.nodeType === "stack") {
      if (fragment.parentNodeId && tableRowMap.has(fragment.parentNodeId)) {
        const cellGroup: TableCellGroup = { cellFragment: fragment, children: [] }
        tableCellMap.set(fragment.nodeId, cellGroup)
        tableRowMap.get(fragment.parentNodeId)!.cells.push(cellGroup)
      } else if (fragment.parentNodeId && rowMap.has(fragment.parentNodeId)) {
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

function resolveFontName(fontFamilyKey: string): string {
  if (fontFamilyKey === "default") return "TH Sarabun New"
  return fontFamilyKey
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

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildParagraph(fragment: PageFragment): Paragraph | null {
  if (!fragment.lines?.length || !fragment.renderProps) return null
  const props = fragment.renderProps
  const text = fragment.lines.map((l) => l.text).join(" ").trim()
  if (!text) return null

  return new Paragraph({
    children: [new TextRun({
      text,
      size: ptToHalfPoints(props.fontSize),
      font: resolveFontName(props.fontFamilyKey),
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

function buildItems(items: RenderItem[]): (Paragraph | Table)[] {
  return items.flatMap((item) => {
    if (item.kind === "paragraph") { const p = buildParagraph(item.fragment); return p ? [p] : [] }
    if (item.kind === "spacer") return [buildSpacer(item.fragment)]
    if (item.kind === "row") return [buildLayoutTable(item.group)]
    if (item.kind === "table") return [buildDataTable(item.group)]
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

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class DocxRenderer implements Renderer {
  async render(doc: PaginatedDocument): Promise<RenderResult> {
    const allPages = doc.sections.flatMap((s) => s.pages)
    const firstPage = allPages[0]
    const secondPage = allPages[1]

    const allFragments = doc.sections.flatMap((s) => s.pages.flatMap((p) => p.fragments))
    const items = groupPageFragments(allFragments)
    const children = buildItems(items)

    // header/footer: default = หน้า 2+ (หรือหน้าแรกถ้ามีหน้าเดียว)
    const defaultHeaderFrags = (secondPage ?? firstPage)?.headerFragments ?? []
    const defaultFooterFrags = (secondPage ?? firstPage)?.footerFragments ?? []
    const firstPageHeaderFrags = firstPage?.headerFragments ?? []
    const firstPageFooterFrags = firstPage?.footerFragments ?? []

    const hasDifferentFirstPage =
      secondPage != null &&
      (!sameFragmentList(firstPageHeaderFrags, defaultHeaderFrags) ||
        !sameFragmentList(firstPageFooterFrags, defaultFooterFrags))

    const defaultHeaderContent = buildZoneContent(defaultHeaderFrags)
    const defaultFooterContent = buildZoneContent(defaultFooterFrags)
    const firstHeaderContent = buildZoneContent(firstPageHeaderFrags)
    const firstFooterContent = buildZoneContent(firstPageFooterFrags)

    const wordDoc = new Document({
      sections: [{
        headers: {
          ...(defaultHeaderContent.length > 0 ? { default: new Header({ children: defaultHeaderContent }) } : {}),
          ...(hasDifferentFirstPage && firstHeaderContent.length > 0
            ? { first: new Header({ children: firstHeaderContent }) }
            : {}),
        },
        footers: {
          ...(defaultFooterContent.length > 0 ? { default: new Footer({ children: defaultFooterContent }) } : {}),
          ...(hasDifferentFirstPage && firstFooterContent.length > 0
            ? { first: new Footer({ children: firstFooterContent }) }
            : {}),
        },
        properties: firstPage ? {
          ...(hasDifferentFirstPage ? { titlePage: true } : {}),
          page: {
            size: {
              width: ptToTwips(firstPage.width),
              height: ptToTwips(firstPage.height),
              orientation: firstPage.width > firstPage.height
                ? PageOrientation.LANDSCAPE
                : PageOrientation.PORTRAIT,
            },
            margin: {
              top: ptToTwips(firstPage.contentBox.y),
              right: ptToTwips(firstPage.width - firstPage.contentBox.x - firstPage.contentBox.width),
              bottom: ptToTwips(firstPage.height - firstPage.contentBox.y - firstPage.contentBox.height),
              left: ptToTwips(firstPage.contentBox.x),
            },
          },
        } : undefined,
        children,
      }],
    })

    const buffer = await Packer.toBuffer(wordDoc)
    return {
      buffer: new Uint8Array(buffer),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    }
  }
}
