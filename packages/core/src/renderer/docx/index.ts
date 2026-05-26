import {
  Document,
  Header,
  Footer,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  HeightRule,
  TableLayoutType,
  WidthType,
  PageOrientation,
  SectionType,
  ShadingType,
  VerticalAlignTable,
  CharacterSet,
  UnderlineType,
  Tab,
  TabStopType,
} from "docx"
import JSZip from "jszip"
import type { PaginatedDocument, PageFragment, ResolvedBorderSide } from "../../pagination"
import type { ParagraphRenderProps } from "../../pagination"
import type { DocumentNode, FlowTableNode, LayoutNode, ParagraphNode, TextRunStyle, UnitValue } from "../../schema"
import { toAbstractUnit } from "../../layout"
import type { FontProvider, RenderResult, Renderer } from "../shared"
import { ptToTwips, ptToHalfPoints } from "../shared"
import { resolveDocxFontName, resolveFontEntry, resolveFontVariantKeyForStyle } from "../../font-registry"
import type { FontVariantKey } from "../../font-registry"

/**
 * DOCX Renderer
 *
 * แปลง PaginatedDocument → .docx buffer ด้วย docx library
 *
 * - paragraph       → Paragraph
 * - spacer          → empty Paragraph + spacingAfter
 * - row+stack       → layout Table (invisible borders)
 * - flow-table      → fixed data Table projected from paginated geometry
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
  | { kind: "divider"; fragment: PageFragment }
  | { kind: "page-break"; fragment: PageFragment }
  | { kind: "row"; group: RowGroup }
  | { kind: "table"; group: TableGroup }
  | { kind: "toc"; fragment: PageFragment }

type ParagraphBuildItem = Paragraph | Table

interface DocxRendererOptions {
  sourceDocument?: DocumentNode
  fontProvider?: FontProvider
}

interface DocxRenderContext {
  paragraphRunsById: Map<string, SourceParagraphRun[]>
  flowTablePropsById: Map<string, FlowTableNode["props"]>
}

type SourceNode = LayoutNode | FlowTableNode["nodes"][string]
type SourceParagraphRun = {
  text: string
  style?: TextRunStyle
}
type DocxTextRunSlice = {
  text: string
  style: DocxTextRunStyle
}
type DocxTextRunStyle = {
  fontSize: number
  fontFamilyKey: string
  textColor: string
  fontWeight: "normal" | "bold"
  fontStyle: "normal" | "italic"
  textDecoration: "none" | "underline"
  strikethrough: boolean
}
type DocxEmbeddedFont = {
  name: string
  characterSet: (typeof CharacterSet)[keyof typeof CharacterSet]
  variants: Partial<Record<FontVariantKey, DocxEmbeddedFontVariant>>
}

type DocxEmbeddedFontVariant = {
  data: Uint8Array
  fontKey: string
  relationshipId: string
  target: string
}

const EMPTY_RENDER_CONTEXT: DocxRenderContext = { paragraphRunsById: new Map(), flowTablePropsById: new Map() }

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
      .filter((fragment) =>
        fragment.nodeType === "flow-table-cell" &&
        fragment.parentNodeId,
      )
      .map((fragment) => fragment.parentNodeId!),
  )

  for (const fragment of fragments) {
    if (fragment.nodeType === "flow-table") {
      const group: TableGroup = { tableFragment: fragment, rows: [] }
      tableMap.set(fragment.nodeId, group)
      items.push({ kind: "table", group })
    } else if (fragment.nodeType === "row" || fragment.nodeType === "flow-row" || fragment.nodeType === "flow-table-row") {
      if (fragment.parentNodeId && tableRowIds.has(fragment.nodeId)) {
        if (!tableMap.has(fragment.parentNodeId)) {
          const group: TableGroup = {
            tableFragment: { ...fragment, nodeId: fragment.parentNodeId, nodeType: "flow-table", parentNodeId: undefined },
            rows: [],
          }
          tableMap.set(fragment.parentNodeId, group)
          items.push({ kind: "table", group })
        }
        const rowGroup: TableRowGroup = { rowFragment: fragment, cells: [] }
        tableRowMap.set(fragment.nodeId, rowGroup)
        tableMap.get(fragment.parentNodeId)!.rows.push(rowGroup)
      } else if (fragment.nodeType !== "flow-table-row") {
        const group: RowGroup = { rowFragment: fragment, stacks: [] }
        rowMap.set(fragment.nodeId, group)
        items.push({ kind: "row", group })
      }
    } else if (fragment.nodeType === "flow-table-cell") {
      if (fragment.parentNodeId && tableRowMap.has(fragment.parentNodeId)) {
        const cellGroup: TableCellGroup = { cellFragment: fragment, children: [] }
        tableCellMap.set(fragment.nodeId, cellGroup)
        tableRowMap.get(fragment.parentNodeId)!.cells.push(cellGroup)
      }
    } else if (fragment.nodeType === "stack" || fragment.nodeType === "flow-stack") {
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
    } else if (fragment.nodeType === "divider") {
      const parentCell = fragment.parentNodeId ? tableCellMap.get(fragment.parentNodeId) : undefined
      const parentStack = fragment.parentNodeId ? stackMap.get(fragment.parentNodeId) : undefined
      if (parentCell) parentCell.children.push(fragment)
      else if (parentStack) parentStack.children.push(fragment)
      else items.push({ kind: "divider", fragment })
    } else if (fragment.nodeType === "page-break") {
      items.push({ kind: "page-break", fragment })
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

const TABLE_ALIGNMENT: Record<NonNullable<FlowTableNode["props"]["align"]>, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }

const INVISIBLE_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER,
  left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
}

function sourceParagraphRuns(node: ParagraphNode): SourceParagraphRun[] | null {
  const runs: SourceParagraphRun[] = []
  for (const child of node.children) {
    if (child.type === "text") {
      runs.push({ text: child.text.replace(/\r\n?/g, "\n"), style: child.style })
    } else if (child.type === "fieldRef") {
      runs.push({ text: child.label ?? child.fallback ?? `{${child.key}}` })
    } else if (child.type === "pageNumber") {
      return null
    }
  }
  return runs
}

function collectSourceParagraphRunsFromNode(
  node: SourceNode,
  paragraphRunsById: Map<string, SourceParagraphRun[]>,
  flowTablePropsById: Map<string, FlowTableNode["props"]>,
): void {
  if (node.type === "paragraph") {
    const runs = sourceParagraphRuns(node)
    if (runs !== null) paragraphRunsById.set(node.id, runs)
    return
  }

  if (node.type === "flow-table") {
    flowTablePropsById.set(node.id, node.props)
    for (const child of Object.values(node.nodes)) {
      collectSourceParagraphRunsFromNode(child as SourceNode, paragraphRunsById, flowTablePropsById)
    }
  }
}

function createRenderContext(sourceDocument: DocumentNode | undefined): DocxRenderContext {
  if (!sourceDocument) return EMPTY_RENDER_CONTEXT
  const paragraphRunsById = new Map<string, SourceParagraphRun[]>()
  const flowTablePropsById = new Map<string, FlowTableNode["props"]>()
  for (const section of sourceDocument.document.sections) {
    for (const node of Object.values(section.nodes)) {
      collectSourceParagraphRunsFromNode(node, paragraphRunsById, flowTablePropsById)
    }
  }
  return { paragraphRunsById, flowTablePropsById }
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

function buildFragmentBoxCellBorders(fragment: PageFragment) {
  const box = fragment.boxRenderProps
  if (!box) return INVISIBLE_BORDERS

  const isFirstFragment = fragment.continuesFrom !== true
  const isLastFragment = fragment.isContinued !== true
  const closesFlowTablePageSlice = fragment.nodeType === "flow-table-cell" && fragment.isContinued === true
  const shouldDrawBottomBorder = isLastFragment || closesFlowTablePageSlice
  return {
    top: isFirstFragment ? toBorderOpts(box.border.top) : NO_BORDER,
    right: toBorderOpts(box.border.right),
    bottom: shouldDrawBottomBorder ? toBorderOpts(box.border.bottom) : NO_BORDER,
    left: toBorderOpts(box.border.left),
    insideHorizontal: NO_BORDER,
    insideVertical: NO_BORDER,
  }
}

function buildFragmentBoxCellShading(fragment: PageFragment) {
  const fill = fragment.boxRenderProps?.fill
  return fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined
}

function buildFragmentBoxCellMargins(fragment: PageFragment) {
  const box = fragment.boxRenderProps
  if (!box) return undefined
  const isFirstFragment = fragment.continuesFrom !== true
  const isLastFragment = fragment.isContinued !== true
  return {
    top: ptToTwips(isFirstFragment ? box.padding.top : 0),
    right: ptToTwips(box.padding.right),
    bottom: ptToTwips(isLastFragment ? box.padding.bottom : 0),
    left: ptToTwips(box.padding.left),
  }
}

function buildFlowStackCellMargins(fragment: PageFragment) {
  return buildFragmentBoxCellMargins(fragment) ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function sortParagraphFragments(fragments: PageFragment[]): PageFragment[] {
  return [...fragments].sort((a, b) =>
    (a.fragmentIndex ?? a.pageIndex) - (b.fragmentIndex ?? b.pageIndex) ||
    (a.lineStart ?? 0) - (b.lineStart ?? 0) ||
    a.pageIndex - b.pageIndex ||
    a.y - b.y
  )
}

function buildParagraphTextFromSegments(fragments: PageFragment[]): string | null {
  const segments = sortParagraphFragments(fragments)
    .flatMap((fragment) => fragment.lines ?? [])
    .flatMap((line) => line.segments ?? [])
    .filter((segment) => segment.text.length > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  if (segments.length === 0) return null

  let text = ""
  let cursor = segments[0].start
  for (const segment of segments) {
    if (segment.end <= cursor) continue

    const sliceStart = Math.max(0, cursor - segment.start)
    const piece = segment.text.slice(sliceStart)
    if (piece.length === 0) {
      cursor = Math.max(cursor, segment.end)
      continue
    }

    if (segment.start > cursor && text.length > 0 && !/\s$/.test(text) && !/^\s/.test(piece)) {
      text += " "
    }
    text += piece
    cursor = Math.max(cursor, segment.end)
  }

  return text.trim()
}

function styleFromParagraphProps(props: ParagraphRenderProps): DocxTextRunStyle {
  return {
    fontSize: props.fontSize,
    fontFamilyKey: props.fontFamilyKey,
    textColor: props.textColor ?? "000000",
    fontWeight: props.fontWeight ?? "normal",
    fontStyle: props.fontStyle ?? "normal",
    textDecoration: props.textDecoration ?? "none",
    strikethrough: props.strikethrough ?? false,
  }
}

function styleFromTextRunStyle(props: ParagraphRenderProps, style: TextRunStyle | undefined): DocxTextRunStyle {
  const fallback = styleFromParagraphProps(props)
  return {
    fontSize: style?.fontSize ? toAbstractUnit(style.fontSize.value, style.fontSize.unit) : fallback.fontSize,
    fontFamilyKey: style?.fontFamilyKey ?? fallback.fontFamilyKey,
    textColor: style?.textColor ?? fallback.textColor,
    fontWeight: style?.fontWeight ?? fallback.fontWeight,
    fontStyle: style?.fontStyle ?? fallback.fontStyle,
    textDecoration: style?.textDecoration ?? fallback.textDecoration,
    strikethrough: style?.strikethrough ?? fallback.strikethrough,
  }
}

function styleFromLineRun(run: NonNullable<NonNullable<PageFragment["lines"]>[number]["runs"]>[number]): DocxTextRunStyle {
  return {
    fontSize: run.style.fontSize,
    fontFamilyKey: run.style.fontFamilyKey,
    textColor: run.style.textColor,
    fontWeight: run.style.fontWeight,
    fontStyle: run.style.fontStyle,
    textDecoration: run.style.textDecoration,
    strikethrough: run.style.strikethrough,
  }
}

function docxTextRunStyleKey(style: DocxTextRunStyle): string {
  return [
    style.fontSize,
    style.fontFamilyKey,
    style.textColor,
    style.fontWeight,
    style.fontStyle,
    style.textDecoration,
    style.strikethrough,
  ].join("|")
}

function pushDocxTextRunSlice(slices: DocxTextRunSlice[], next: DocxTextRunSlice): void {
  const previous = slices.at(-1)
  if (previous && docxTextRunStyleKey(previous.style) === docxTextRunStyleKey(next.style)) {
    slices[slices.length - 1] = {
      ...previous,
      text: previous.text + next.text,
    }
    return
  }
  slices.push(next)
}

function buildParagraphRunsFromPaginatedRuns(fragments: PageFragment[]): DocxTextRunSlice[] | null {
  const runs = sortParagraphFragments(fragments)
    .flatMap((fragment) => fragment.lines ?? [])
    .flatMap((line) => line.runs ?? [])
    .filter((run) => run.text.length > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  if (runs.length === 0) return null

  const slices: DocxTextRunSlice[] = []
  let cursor = runs[0].start
  for (const run of runs) {
    if (run.end <= cursor) continue

    const sliceStart = Math.max(0, cursor - run.start)
    const piece = run.text.slice(sliceStart)
    if (piece.length === 0) {
      cursor = Math.max(cursor, run.end)
      continue
    }

    if (run.start > cursor) {
      const previous = slices.at(-1)
      if (previous && !/\s$/.test(previous.text) && !/^\s/.test(piece)) {
        pushDocxTextRunSlice(slices, { text: " ", style: previous.style })
      }
    }
    pushDocxTextRunSlice(slices, { text: piece, style: styleFromLineRun(run) })
    cursor = Math.max(cursor, run.end)
  }

  return slices.length > 0 ? slices : null
}

function buildParagraphTextRunSlices(
  fragments: PageFragment[],
  context: DocxRenderContext,
  props: ParagraphRenderProps,
): DocxTextRunSlice[] {
  const sourceRuns = context.paragraphRunsById.get(fragments[0]?.nodeId ?? "")
  const canUseSourceRuns = fragments[0]?.continuesFrom !== true &&
    fragments[fragments.length - 1]?.isContinued !== true
  if (sourceRuns !== undefined && canUseSourceRuns) {
    return sourceRuns.map((run) => ({
      text: run.text,
      style: styleFromTextRunStyle(props, run.style),
    }))
  }

  const paginatedRuns = buildParagraphRunsFromPaginatedRuns(fragments)
  if (paginatedRuns !== null) return paginatedRuns

  const fromSegments = buildParagraphTextFromSegments(fragments)
  const text = fromSegments ?? sortParagraphFragments(fragments)
    .flatMap((fragment) => fragment.lines ?? [])
    .map((line) => line.text)
    .join(" ")
    .trim()
  return text ? [{ text, style: styleFromParagraphProps(props) }] : []
}

function buildTextRunsFromSlice(slice: DocxTextRunSlice): TextRun[] {
  const lines = slice.text.split("\n")
  const bold = slice.style.fontWeight === "bold" || undefined
  const italics = slice.style.fontStyle === "italic" || undefined
  const color = slice.style.textColor
  const underline = slice.style.textDecoration === "underline"
    ? { type: UnderlineType.SINGLE, color }
    : undefined
  return lines.map((line, index) => new TextRun({
    text: line,
    break: index > 0 ? 1 : undefined,
    size: ptToHalfPoints(slice.style.fontSize),
    font: resolveDocxFontName(slice.style.fontFamilyKey),
    bold,
    boldComplexScript: bold,
    italics,
    italicsComplexScript: italics,
    underline,
    strike: slice.style.strikethrough || undefined,
    color,
  }))
}

function buildListMarkerTextRuns(fragment: PageFragment, props: ParagraphRenderProps): TextRun[] {
  const marker = fragment.listMarker
  if (!marker) return []
  const style = styleFromParagraphProps(props)
  const bold = style.fontWeight === "bold" || undefined
  const italics = style.fontStyle === "italic" || undefined
  const color = style.textColor
  const underline = style.textDecoration === "underline"
    ? { type: UnderlineType.SINGLE, color }
    : undefined
  return [new TextRun({
    children: [marker.text, new Tab()],
    size: ptToHalfPoints(style.fontSize),
    font: resolveDocxFontName(style.fontFamilyKey),
    bold,
    boldComplexScript: bold,
    italics,
    italicsComplexScript: italics,
    underline,
    strike: style.strikethrough || undefined,
    color,
  })]
}

function buildTextRuns(slices: DocxTextRunSlice[], props: ParagraphRenderProps): TextRun[] {
  const content = slices.length > 0
    ? slices
    : [{ text: "", style: styleFromParagraphProps(props) }]
  return content.flatMap(buildTextRunsFromSlice)
}

function buildParagraphIndent(fragment: PageFragment, props: ParagraphRenderProps) {
  const marker = fragment.listMarker
  if (!marker) {
    return {
      left: ptToTwips(props.indentLeft),
      right: ptToTwips(props.indentRight),
      firstLine: ptToTwips(props.textIndent),
    }
  }

  const markerToBodyDelta = marker.bodyIndent - marker.markerIndent
  return {
    left: ptToTwips(marker.bodyIndent),
    right: ptToTwips(props.indentRight),
    hanging: markerToBodyDelta >= 0 ? ptToTwips(markerToBodyDelta) : undefined,
    firstLine: markerToBodyDelta < 0 ? ptToTwips(-markerToBodyDelta) : undefined,
  }
}

function buildParagraph(fragments: PageFragment | PageFragment[], context: DocxRenderContext = EMPTY_RENDER_CONTEXT): Paragraph | null {
  const paragraphFragments = sortParagraphFragments(Array.isArray(fragments) ? fragments : [fragments])
  const firstFragment = paragraphFragments[0]
  if (!firstFragment?.renderProps) return null
  const props = firstFragment.renderProps
  const textRuns = buildParagraphTextRunSlices(paragraphFragments, context, props)
  const listMarkerRuns = buildListMarkerTextRuns(firstFragment, props)
  const text = textRuns.map((run) => run.text).join("")
  if (!text && listMarkerRuns.length === 0 && !props.box) return null
  const boxFragment: PageFragment = {
    ...firstFragment,
    continuesFrom: firstFragment.continuesFrom,
    isContinued: paragraphFragments[paragraphFragments.length - 1]?.isContinued,
  }

  return new Paragraph({
    includeIfEmpty: Boolean(props.box),
    children: [...listMarkerRuns, ...buildTextRuns(textRuns, props)],
    alignment: ALIGNMENT[props.align] as any,
    spacing: {
      before: ptToTwips(props.spacingBefore),
      after: ptToTwips(props.spacingAfter),
      line: ptToTwips(props.lineHeight),
      lineRule: "exact" as const,
    },
    indent: buildParagraphIndent(firstFragment, props),
    tabStops: firstFragment.listMarker
      ? [{ type: TabStopType.LEFT, position: ptToTwips(firstFragment.listMarker.bodyIndent) }]
      : undefined,
    border: buildParagraphBorders(boxFragment),
    shading: buildParagraphShading(boxFragment),
  })
}

function buildSpacer(fragment: PageFragment): Paragraph {
  return new Paragraph({ children: [], spacing: { after: ptToTwips(fragment.height) } })
}

function buildDivider(fragment: PageFragment): Paragraph {
  const props = fragment.dividerRenderProps
  if (!props || props.thickness <= 0) return new Paragraph({ children: [] })
  return new Paragraph({
    children: [],
    spacing: {
      before: ptToTwips(props.marginBefore),
      after: ptToTwips(props.marginAfter),
    },
    border: {
      bottom: {
        style: props.style === "dashed"
          ? BorderStyle.DASHED
          : props.style === "dotted"
            ? BorderStyle.DOTTED
            : BorderStyle.SINGLE,
        size: Math.max(1, Math.round(props.thickness * 8)),
        color: props.color,
      },
    },
  })
}

function buildPageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] })
}

function unitValueToPt(value: UnitValue | undefined): number {
  return value ? Math.max(0, toAbstractUnit(value.value, value.unit)) : 0
}

function buildFlowTableBlockSpacer(height: number): Paragraph | null {
  if (height <= 0) return null
  return new Paragraph({ children: [], spacing: { after: ptToTwips(height) } })
}

function flushParagraphGroup(output: Paragraph[], group: PageFragment[], context: DocxRenderContext): PageFragment[] {
  if (group.length === 0) return []
  const paragraph = buildParagraph(group, context)
  if (paragraph) output.push(paragraph)
  return []
}

function buildCellChildren(children: PageFragment[], context: DocxRenderContext): Paragraph[] {
  const output: Paragraph[] = []
  let paragraphGroup: PageFragment[] = []

  for (const child of children) {
    if (child.nodeType === "paragraph") {
      if (paragraphGroup.length > 0 && paragraphGroup[0].nodeId !== child.nodeId) {
        paragraphGroup = flushParagraphGroup(output, paragraphGroup, context)
      }
      paragraphGroup.push(child)
      continue
    }

    paragraphGroup = flushParagraphGroup(output, paragraphGroup, context)
    if (child.nodeType === "spacer") output.push(buildSpacer(child))
    if (child.nodeType === "divider") output.push(buildDivider(child))
  }

  flushParagraphGroup(output, paragraphGroup, context)
  return output
}

function buildTableCellChildren(children: PageFragment[], context: DocxRenderContext): Paragraph[] {
  const built = buildCellChildren(children, context)
  return built.length > 0 ? built : [new Paragraph({ children: [] })]
}

function buildLayoutStackCell(stack: StackGroup, rowWidth: number, isFlowRow: boolean, context: DocxRenderContext): TableCell {
  return new TableCell({
    width: isFlowRow
      ? { size: ptToTwips(stack.stackFragment.width), type: WidthType.DXA }
      : { size: Math.round((stack.stackFragment.width / rowWidth) * 100), type: WidthType.PERCENTAGE },
    borders: buildFragmentBoxCellBorders(stack.stackFragment),
    shading: buildFragmentBoxCellShading(stack.stackFragment),
    margins: isFlowRow ? buildFlowStackCellMargins(stack.stackFragment) : buildFragmentBoxCellMargins(stack.stackFragment),
    verticalAlign: isFlowRow ? VerticalAlignTable.TOP : undefined,
    children: buildCellChildren(stack.children, context),
  })
}

function buildFlowGapCell(width: number): TableCell {
  return new TableCell({
    width: { size: ptToTwips(width), type: WidthType.DXA },
    borders: INVISIBLE_BORDERS,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    children: [new Paragraph({ children: [] })],
  })
}

function buildLayoutTableCells(group: RowGroup, rowWidth: number, isFlowRow: boolean, context: DocxRenderContext): { cells: TableCell[]; columnWidths?: number[] } {
  if (!isFlowRow) {
    return {
      cells: group.stacks.map((stack) => buildLayoutStackCell(stack, rowWidth, false, context)),
    }
  }

  const cells: TableCell[] = []
  const columnWidths: number[] = []
  group.stacks.forEach((stack, index) => {
    cells.push(buildLayoutStackCell(stack, rowWidth, true, context))
    columnWidths.push(ptToTwips(stack.stackFragment.width))

    const nextStack = group.stacks[index + 1]
    if (!nextStack) return
    const gap = Math.max(0, nextStack.stackFragment.x - (stack.stackFragment.x + stack.stackFragment.width))
    if (gap <= 0) return
    cells.push(buildFlowGapCell(gap))
    columnWidths.push(ptToTwips(gap))
  })

  return { cells, columnWidths }
}

function isContinuedFragment(fragment: PageFragment): boolean {
  return fragment.continuesFrom === true || fragment.isContinued === true
}

function collectRepeatedFullRowIds(rows: TableRowGroup[]): Set<string> {
  const seenFullRows = new Set<string>()
  const repeatedFullRows = new Set<string>()
  for (const row of rows) {
    if (isContinuedFragment(row.rowFragment)) continue
    const id = row.rowFragment.nodeId
    if (seenFullRows.has(id)) repeatedFullRows.add(id)
    else seenFullRows.add(id)
  }
  return repeatedFullRows
}

function buildLayoutTable(group: RowGroup, context: DocxRenderContext): Table {
  const rowWidth = group.rowFragment.width
  const isFlowRow = group.rowFragment.nodeType === "flow-row"
  const { cells, columnWidths } = buildLayoutTableCells(group, rowWidth, isFlowRow, context)
  return new Table({
    width: isFlowRow
      ? { size: ptToTwips(rowWidth), type: WidthType.DXA }
      : { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    layout: isFlowRow ? TableLayoutType.FIXED : undefined,
    rows: [new TableRow({
      children: cells,
      height: isFlowRow
        ? {
            value: ptToTwips(group.rowFragment.height),
            rule: HeightRule.ATLEAST,
          }
        : undefined,
    })],
  })
}

function buildFlowTableCell(cellGroup: TableCellGroup, context: DocxRenderContext): TableCell {
  const gridProps = cellGroup.cellFragment.flowTableCellGridProps
  return new TableCell({
    width: { size: ptToTwips(cellGroup.cellFragment.width), type: WidthType.DXA },
    columnSpan: gridProps && gridProps.colspan > 1 ? gridProps.colspan : undefined,
    rowSpan: gridProps && gridProps.rowspan > 1 && cellGroup.cellFragment.continuesFrom !== true
      ? gridProps.rowspan
      : undefined,
    borders: buildFragmentBoxCellBorders(cellGroup.cellFragment),
    shading: buildFragmentBoxCellShading(cellGroup.cellFragment),
    margins: buildFragmentBoxCellMargins(cellGroup.cellFragment) ?? { top: 0, right: 0, bottom: 0, left: 0 },
    verticalAlign: VerticalAlignTable.TOP,
    children: buildTableCellChildren(cellGroup.children, context),
  })
}

function buildFlowTableColumnWidths(group: TableGroup): number[] | undefined {
  const gridProps = group.tableFragment.flowTableGridProps ??
    group.rows.find((row) => row.rowFragment.flowTableGridProps)?.rowFragment.flowTableGridProps
  if (gridProps?.columnWidths.length) {
    return gridProps.columnWidths.map((width) => ptToTwips(width))
  }

  const left = group.tableFragment.x
  const right = left + group.tableFragment.width
  const edges = [left, right]

  for (const row of group.rows) {
    for (const cell of row.cells) {
      edges.push(cell.cellFragment.x, cell.cellFragment.x + cell.cellFragment.width)
    }
  }

  const sortedEdges = Array.from(new Set(edges.map((edge) => Math.round(edge * 1000) / 1000)))
    .sort((a, b) => a - b)
  if (sortedEdges.length < 2) return undefined

  return sortedEdges
    .slice(1)
    .map((edge, index) => Math.max(0, ptToTwips(edge - sortedEdges[index])))
    .filter((width) => width > 0)
}

function buildFlowDataTable(group: TableGroup, context: DocxRenderContext): Table {
  const sortedRows = [...group.rows]
    .sort((a, b) =>
      a.rowFragment.pageIndex - b.rowFragment.pageIndex ||
      a.rowFragment.y - b.rowFragment.y ||
      a.rowFragment.x - b.rowFragment.x
    )
  const repeatedFullRowIds = collectRepeatedFullRowIds(sortedRows)
  const emittedRepeatedRows = new Set<string>()
  const tableProps = context.flowTablePropsById.get(group.tableFragment.nodeId)
  const rows = sortedRows
    .flatMap((rowGroup) => {
      const isRepeatedHeaderRow = repeatedFullRowIds.has(rowGroup.rowFragment.nodeId) &&
        !isContinuedFragment(rowGroup.rowFragment)
      if (isRepeatedHeaderRow) {
        if (emittedRepeatedRows.has(rowGroup.rowFragment.nodeId)) return []
        emittedRepeatedRows.add(rowGroup.rowFragment.nodeId)
      }
      const cells = [...rowGroup.cells]
        .sort((a, b) => a.cellFragment.x - b.cellFragment.x || a.cellFragment.y - b.cellFragment.y)
        .map((cellGroup) => buildFlowTableCell(cellGroup, context))

      return [new TableRow({
        children: cells.length > 0 ? cells : [new TableCell({ children: [new Paragraph({ children: [] })] })],
        tableHeader: isRepeatedHeaderRow ? true : undefined,
        height: isContinuedFragment(rowGroup.rowFragment)
          ? undefined
          : {
              value: ptToTwips(rowGroup.rowFragment.height),
              rule: HeightRule.ATLEAST,
            },
      })]
    })

  return new Table({
    width: { size: ptToTwips(group.tableFragment.width), type: WidthType.DXA },
    columnWidths: buildFlowTableColumnWidths(group),
    layout: TableLayoutType.FIXED,
    alignment: tableProps?.align ? TABLE_ALIGNMENT[tableProps.align] : undefined,
    rows,
  })
}

function buildDataTable(group: TableGroup, context: DocxRenderContext): Table {
  return buildFlowDataTable(group, context)
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

function flushParagraphItems(output: ParagraphBuildItem[], group: PageFragment[], context: DocxRenderContext): PageFragment[] {
  if (group.length === 0) return []
  const paragraph = buildParagraph(group, context)
  if (paragraph) output.push(paragraph)
  return []
}

function buildItems(items: RenderItem[], context: DocxRenderContext): ParagraphBuildItem[] {
  const output: ParagraphBuildItem[] = []
  let paragraphGroup: PageFragment[] = []

  for (const item of items) {
    if (item.kind === "paragraph") {
      if (paragraphGroup.length > 0 && paragraphGroup[0].nodeId !== item.fragment.nodeId) {
        paragraphGroup = flushParagraphItems(output, paragraphGroup, context)
      }
      paragraphGroup.push(item.fragment)
      continue
    }

    paragraphGroup = flushParagraphItems(output, paragraphGroup, context)
    if (item.kind === "spacer") output.push(buildSpacer(item.fragment))
    else if (item.kind === "divider") output.push(buildDivider(item.fragment))
    else if (item.kind === "page-break") output.push(buildPageBreak())
    else if (item.kind === "row") output.push(buildLayoutTable(item.group, context))
    else if (item.kind === "table") {
      const props = context.flowTablePropsById.get(item.group.tableFragment.nodeId)
      const marginTop = buildFlowTableBlockSpacer(unitValueToPt(props?.marginTop))
      if (marginTop) output.push(marginTop)
      output.push(buildDataTable(item.group, context))
      const marginBottom = buildFlowTableBlockSpacer(unitValueToPt(props?.marginBottom))
      if (marginBottom) output.push(marginBottom)
    } else if (item.kind === "toc") output.push(...buildToc(item.fragment))
  }

  flushParagraphItems(output, paragraphGroup, context)
  return output
}

// ─── Zone Content ─────────────────────────────────────────────────────────────

function buildZoneContent(fragments: PageFragment[], context: DocxRenderContext): (Paragraph | Table)[] {
  if (fragments.length === 0) return []
  return buildItems(groupPageFragments(fragments), context)
}

function sameFragmentList(a: PageFragment[], b: PageFragment[]): boolean {
  return a.length === b.length && a.every((f, i) => f.nodeId === b[i].nodeId)
}

function buildHeaders(fragments: PageFragment[], context: DocxRenderContext) {
  const content = buildZoneContent(fragments, context)
  return content.length > 0 ? { default: new Header({ children: content }) } : undefined
}

function buildFooters(fragments: PageFragment[], context: DocxRenderContext) {
  const content = buildZoneContent(fragments, context)
  return content.length > 0 ? { default: new Footer({ children: content }) } : undefined
}

function buildSectionProperties(page: { width: number; height: number; contentBox: { x: number; y: number; width: number; height: number } }, isFirst: boolean) {
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

const DOCX_FONT_VARIANT_ORDER: FontVariantKey[] = ["regular", "bold", "italic", "boldItalic"]

const DOCX_FONT_VARIANT_EMBED_TAG: Record<FontVariantKey, string> = {
  regular: "w:embedRegular",
  bold: "w:embedBold",
  italic: "w:embedItalic",
  boldItalic: "w:embedBoldItalic",
}

const DOCX_FONT_VARIANT_PART_SUFFIX: Record<FontVariantKey, string> = {
  regular: "",
  bold: " Bold",
  italic: " Italic",
  boldItalic: " BoldItalic",
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sanitizeDocxFontPartName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_")
}

function createDocxFontKey(): string {
  const cryptoRef = globalThis.crypto
  if (typeof cryptoRef?.randomUUID === "function") return cryptoRef.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoRef?.getRandomValues === "function") {
    cryptoRef.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"))
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-")
}

function obfuscateDocxFont(data: Uint8Array, fontKey: string): Uint8Array {
  const guid = fontKey.replace(/-/g, "")
  if (guid.length !== 32) throw new Error(`Invalid DOCX font key: ${fontKey}`)
  const keyBytes = guid.match(/../g)!.map((hex) => Number.parseInt(hex, 16)).reverse()
  const output = new Uint8Array(data)
  const limit = Math.min(32, output.length)
  for (let index = 0; index < limit; index += 1) {
    output[index] = output[index] ^ keyBytes[index % keyBytes.length]
  }
  return output
}

function addVariantRequest(variants: Set<FontVariantKey>, key: string, requestedVariant: FontVariantKey): void {
  variants.add("regular")
  const entry = resolveFontEntry(key)
  if (entry.variants[requestedVariant]) {
    variants.add(requestedVariant)
    return
  }
  if ((requestedVariant === "bold" || requestedVariant === "boldItalic") && entry.variants.bold) {
    variants.add("bold")
  }
  if ((requestedVariant === "italic" || requestedVariant === "boldItalic") && entry.variants.italic) {
    variants.add("italic")
  }
}

function collectFontVariantRequestsFromFragments(fragments: PageFragment[], requests: Map<string, Set<FontVariantKey>>): void {
  for (const fragment of fragments) {
    if (fragment.renderProps?.fontFamilyKey) {
      const key = resolveFontEntry(fragment.renderProps.fontFamilyKey).key
      const variants = requests.get(key) ?? new Set<FontVariantKey>()
      const requestedVariant = resolveFontVariantKeyForStyle(fragment.renderProps.fontWeight, fragment.renderProps.fontStyle)
      addVariantRequest(variants, key, requestedVariant)
      requests.set(key, variants)
    }
    for (const run of fragment.lines?.flatMap((line) => line.runs ?? []) ?? []) {
      const key = resolveFontEntry(run.style.fontFamilyKey).key
      const variants = requests.get(key) ?? new Set<FontVariantKey>()
      addVariantRequest(variants, key, run.style.fontVariant)
      requests.set(key, variants)
    }
  }
}

function collectDocxFontVariantRequests(doc: PaginatedDocument): Map<string, Set<FontVariantKey>> {
  const requests = new Map<string, Set<FontVariantKey>>()
  for (const section of doc.sections) {
    for (const page of section.pages) {
      collectFontVariantRequestsFromFragments(page.fragments, requests)
      collectFontVariantRequestsFromFragments(page.headerFragments, requests)
      collectFontVariantRequestsFromFragments(page.footerFragments, requests)
    }
  }
  return requests
}

function resolveDocxFontTarget(name: string, variant: FontVariantKey): string {
  const partName = sanitizeDocxFontPartName(`${name}${DOCX_FONT_VARIANT_PART_SUFFIX[variant]}`)
  return `fonts/${partName}.odttf`
}

async function buildEmbeddedFonts(doc: PaginatedDocument, fontProvider: FontProvider | undefined): Promise<DocxEmbeddedFont[]> {
  if (!fontProvider) return []

  const embeddedByDocxName = new Map<string, DocxEmbeddedFont>()
  let relationshipIndex = 1
  for (const [key, variants] of collectDocxFontVariantRequests(doc)) {
    const name = resolveDocxFontName(key)
    const embedded = embeddedByDocxName.get(name) ?? {
      name,
      characterSet: CharacterSet.THAI,
      variants: {},
    }

    for (const variant of DOCX_FONT_VARIANT_ORDER) {
      if (!variants.has(variant) || embedded.variants[variant]) continue
      const fontBuffer = await fontProvider.getFont(key, variant)
      if (!fontBuffer) continue

      embedded.variants[variant] = {
        data: fontBuffer,
        fontKey: createDocxFontKey(),
        relationshipId: `rId${relationshipIndex}`,
        target: resolveDocxFontTarget(name, variant),
      }
      relationshipIndex += 1
    }

    if (Object.keys(embedded.variants).length > 0) {
      embeddedByDocxName.set(name, embedded)
    }
  }

  return [...embeddedByDocxName.values()]
}

function buildFontTableXml(fonts: DocxEmbeddedFont[]): string {
  const fontEntries = fonts.map((font) => {
    const variantEntries = DOCX_FONT_VARIANT_ORDER.flatMap((variant) => {
      const embedded = font.variants[variant]
      if (!embedded) return []
      const tag = DOCX_FONT_VARIANT_EMBED_TAG[variant]
      return `<${tag} r:id="${xmlEscape(embedded.relationshipId)}" w:fontKey="{${xmlEscape(embedded.fontKey)}}"/>`
    }).join("")
    return `<w:font w:name="${xmlEscape(font.name)}"><w:charset w:val="${xmlEscape(font.characterSet)}"/><w:family w:val="auto"/><w:pitch w:val="variable"/>${variantEntries}</w:font>`
  }).join("")

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${fontEntries}</w:fonts>`
}

function buildFontRelationshipsXml(fonts: DocxEmbeddedFont[]): string {
  const relationships = fonts.flatMap((font) =>
    DOCX_FONT_VARIANT_ORDER.flatMap((variant) => {
      const embedded = font.variants[variant]
      if (!embedded) return []
      return `<Relationship Id="${xmlEscape(embedded.relationshipId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${xmlEscape(embedded.target)}"/>`
    }),
  ).join("")
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`
}

async function injectEmbeddedFonts(buffer: Uint8Array, fonts: DocxEmbeddedFont[]): Promise<Uint8Array> {
  if (fonts.length === 0) return buffer
  const zip = await JSZip.loadAsync(buffer)
  zip.file("word/fontTable.xml", buildFontTableXml(fonts))
  zip.file("word/_rels/fontTable.xml.rels", buildFontRelationshipsXml(fonts))
  for (const font of fonts) {
    for (const variant of DOCX_FONT_VARIANT_ORDER) {
      const embedded = font.variants[variant]
      if (!embedded) continue
      zip.file(`word/${embedded.target}`, obfuscateDocxFont(embedded.data, embedded.fontKey))
    }
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class DocxRenderer implements Renderer {
  private readonly context: DocxRenderContext
  private readonly fontProvider?: FontProvider

  constructor(options: DocxRendererOptions = {}) {
    this.context = createRenderContext(options.sourceDocument)
    this.fontProvider = options.fontProvider
  }

  async render(doc: PaginatedDocument): Promise<RenderResult> {
    const sections = doc.sections.flatMap((section, index) => {
      const firstPage = section.pages[0]
      if (!firstPage) return []

      const fragments = section.pages.flatMap((page) => page.fragments)
      const children = buildItems(groupPageFragments(fragments), this.context)
      return {
        headers: buildHeaders(firstPage.headerFragments, this.context),
        footers: buildFooters(firstPage.footerFragments, this.context),
        properties: buildSectionProperties(firstPage, index === 0),
        children: children.length > 0 ? children : [new Paragraph({ children: [] })],
      }
    })

    const fonts = await buildEmbeddedFonts(doc, this.fontProvider)
    const wordDoc = new Document({
      sections: sections.length > 0
        ? sections
        : [{ children: [new Paragraph({ children: [] })] }],
    })

    const buffer = await Packer.toBuffer(wordDoc)
    const outputBuffer = await injectEmbeddedFonts(new Uint8Array(buffer), fonts)
    return {
      buffer: outputBuffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    }
  }
}
