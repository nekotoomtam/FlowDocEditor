import { resolveStyledParagraphProps, resolveTextRunStyle } from "@/document"
import { resolveParagraphBoxStyle } from "@/layout"
import type { DocumentNode, FlowTableNode, LayoutNode, ParagraphNode, TextRun } from "@/schema"
import type { PageFragment, PaginatedDocument, PaginatedLine, ParagraphBoxRenderProps, ParagraphRenderProps } from "@/pagination"
import type { EditorAction } from "./editorReducer"
import type { EditorActionClassification } from "./editorActionClassifier"
import type { EditorRenderInvalidationPlan } from "./operations/editorRenderInvalidation"

interface VisualOnlyPaginatedUpdateInput {
  action: EditorAction | null | undefined
  classification: EditorActionClassification | null | undefined
  renderInvalidationPlan?: EditorRenderInvalidationPlan | null | undefined
  currentPaginated: PaginatedDocument
  nextPreviewDoc: DocumentNode
}

export interface VisualOnlyPaginatedUpdate {
  paginated: PaginatedDocument
  changed: boolean
  reason: string
}

interface LocatedParagraph {
  paragraph: ParagraphNode
}

interface TextRunVisualStyle {
  textColor: string
  textDecoration: "none" | "underline"
  strikethrough: boolean
}

function paragraphBoxRenderPropsFromNode(
  paragraph: ParagraphNode,
  width: number,
): ParagraphBoxRenderProps | undefined {
  const box = resolveParagraphBoxStyle(paragraph.props.box, width)
  if (!box) return undefined
  return {
    fill: box.fill,
    padding: { ...box.padding },
    border: {
      top: box.border.top,
      right: box.border.right,
      bottom: box.border.bottom,
      left: box.border.left,
    },
  }
}

function visualRenderPropsFromParagraph(
  current: ParagraphRenderProps | undefined,
  paragraph: ParagraphNode,
  width: number,
): ParagraphRenderProps | undefined {
  if (!current) return undefined
  return {
    ...current,
    textColor: paragraph.props.textColor ?? "000000",
    textDecoration: paragraph.props.textDecoration ?? "none",
    strikethrough: paragraph.props.strikethrough ?? false,
    box: paragraphBoxRenderPropsFromNode(paragraph, width),
  }
}

function locateParagraph(doc: DocumentNode, nodeId: string): LocatedParagraph | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return { paragraph: node }

    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const table = candidate as unknown as FlowTableNode
      const inner = table.nodes[nodeId]
      if (inner?.type === "paragraph") return { paragraph: inner }
    }
  }
  return null
}

function collectParagraphIdsForStyle(doc: DocumentNode, styleId: string): Set<string> {
  const ids = new Set<string>()
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      if (node.type === "paragraph" && node.props.paragraphStyleId === styleId) {
        ids.add(node.id)
        continue
      }
      if (node.type !== "flow-table") continue
      const table = node as unknown as FlowTableNode
      for (const inner of Object.values(table.nodes)) {
        if (inner.type === "paragraph" && inner.props.paragraphStyleId === styleId) ids.add(inner.id)
      }
    }
  }
  return ids
}

function resolveVisualParagraph(doc: DocumentNode, nodeId: string): ParagraphNode | null {
  const located = locateParagraph(doc, nodeId)
  if (!located) return null
  return {
    ...located.paragraph,
    props: resolveStyledParagraphProps(doc.document.styles, located.paragraph),
  }
}

function defaultTextRunForParagraph(paragraph: ParagraphNode): TextRun {
  return {
    id: `${paragraph.id}:visual-default`,
    type: "text",
    text: "",
  }
}

function toTextRunVisualStyle(paragraph: ParagraphNode, run: TextRun): TextRunVisualStyle {
  const style = resolveTextRunStyle(paragraph, run)
  return {
    textColor: style.textColor,
    textDecoration: style.textDecoration,
    strikethrough: style.strikethrough,
  }
}

function collectTextRunVisualStyles(paragraph: ParagraphNode): {
  defaultVisualStyle: TextRunVisualStyle
  byRunId: Map<string, TextRunVisualStyle>
} {
  const byRunId = new Map<string, TextRunVisualStyle>()
  for (const child of paragraph.children) {
    if (child.type !== "text") continue
    byRunId.set(child.id, toTextRunVisualStyle(paragraph, child))
  }
  return {
    defaultVisualStyle: toTextRunVisualStyle(paragraph, defaultTextRunForParagraph(paragraph)),
    byRunId,
  }
}

function patchLineRunVisualStyle(
  line: PaginatedLine,
  paragraph: ParagraphNode,
): PaginatedLine {
  if (!line.runs?.length) return line
  const { byRunId, defaultVisualStyle } = collectTextRunVisualStyles(paragraph)
  let changed = false
  const runs = line.runs.map((run) => {
    const visualStyle = run.sourceType === "text" && run.sourceId
      ? byRunId.get(run.sourceId) ?? defaultVisualStyle
      : defaultVisualStyle
    if (
      run.style.textColor === visualStyle.textColor &&
      run.style.textDecoration === visualStyle.textDecoration &&
      run.style.strikethrough === visualStyle.strikethrough
    ) {
      return run
    }
    changed = true
    return {
      ...run,
      style: {
        ...run.style,
        textColor: visualStyle.textColor,
        textDecoration: visualStyle.textDecoration,
        strikethrough: visualStyle.strikethrough,
      },
    }
  })
  return changed ? { ...line, runs } : line
}

function patchParagraphFragmentVisuals(
  fragment: PageFragment,
  paragraph: ParagraphNode,
): PageFragment {
  const renderProps = visualRenderPropsFromParagraph(fragment.renderProps, paragraph, fragment.width)
  const lines = fragment.lines?.map((line) => patchLineRunVisualStyle(line, paragraph))
  const renderPropsChanged = renderProps !== fragment.renderProps &&
    JSON.stringify(renderProps ?? null) !== JSON.stringify(fragment.renderProps ?? null)
  const linesChanged = lines != null && lines.some((line, index) => line !== fragment.lines?.[index])
  if (!renderPropsChanged && !linesChanged) return fragment
  return {
    ...fragment,
    renderProps,
    lines: lines ?? fragment.lines,
  }
}

function collectAffectedParagraphIds(action: EditorAction, doc: DocumentNode): Set<string> | null {
  switch (action.type) {
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
      return new Set([action.nodeId])

    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
      return collectParagraphIdsForStyle(doc, action.styleId)

    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return new Set()

    default:
      return null
  }
}

function isSupportedVisualOnlyAction(action: EditorAction): boolean {
  switch (action.type) {
    case "UPDATE_PARAGRAPH_TEXT_STYLE":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDES":
    case "PATCH_PARAGRAPH_STYLE_OVERRIDE_BOX":
    case "UPDATE_PARAGRAPH_BOX_STYLE":
    case "PATCH_PARAGRAPH_STYLE_DEFINITION":
    case "RENAME_PARAGRAPH_STYLE_DEFINITION":
      return true
    default:
      return false
  }
}

export function tryApplyVisualOnlyPaginatedUpdate({
  action,
  classification,
  renderInvalidationPlan,
  currentPaginated,
  nextPreviewDoc,
}: VisualOnlyPaginatedUpdateInput): VisualOnlyPaginatedUpdate | null {
  if (!action || !classification) return null
  if (classification.uiImpact !== "visual" || classification.layoutScope !== "none") return null
  if (renderInvalidationPlan && (!renderInvalidationPlan.mayUseVisualFastLane || renderInvalidationPlan.invalidatesPagination)) {
    return null
  }
  if (!isSupportedVisualOnlyAction(action)) return null

  const affectedIds = collectAffectedParagraphIds(action, nextPreviewDoc)
  if (!affectedIds) return null
  if (affectedIds.size === 0) {
    return {
      paginated: currentPaginated,
      changed: false,
      reason: `${action.type}:no-fragment-visual-change`,
    }
  }

  const paragraphById = new Map<string, ParagraphNode>()
  for (const nodeId of affectedIds) {
    const paragraph = resolveVisualParagraph(nextPreviewDoc, nodeId)
    if (!paragraph) return null
    paragraphById.set(nodeId, paragraph)
  }

  let changed = false
  const sections = currentPaginated.sections.map((section) => {
    let sectionChanged = false
    const pages = section.pages.map((page) => {
      let pageChanged = false
      const fragments = page.fragments.map((fragment) => {
        if (fragment.nodeType !== "paragraph") return fragment
        const paragraph = paragraphById.get(fragment.nodeId)
        if (!paragraph) return fragment
        const nextFragment = patchParagraphFragmentVisuals(fragment, paragraph)
        if (nextFragment !== fragment) pageChanged = true
        return nextFragment
      })
      if (!pageChanged) return page
      sectionChanged = true
      return { ...page, fragments }
    })
    if (!sectionChanged) return section
    changed = true
    return { ...section, pages }
  })

  return {
    paginated: changed ? { ...currentPaginated, sections } : currentPaginated,
    changed,
    reason: `${action.type}:visual-only-paginated-update`,
  }
}
