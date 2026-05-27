import type { DocumentNode } from "../schema"
import type {
  PageFragment,
  PageFragmentWarningCode,
  PaginatedDocument,
  PaginatedSection,
  ParagraphSplitDecision,
} from "./types"
import type { TextMeasurer, WordBreaker } from "../layout"
import { paginateDocument } from "./paginator"

export interface PaginationTraceSectionSpan {
  sectionId: string
  firstPageIndex: number | null
  lastPageIndex: number | null
  pageCount: number
}

export interface PaginationTraceFragment {
  sectionId: string
  pageIndex: number
  fragmentOrder: number
  nodeId: string
  nodeType: PageFragment["nodeType"]
  parentNodeId?: string
  x: number
  y: number
  width: number
  height: number
  fragmentIndex?: number
  lineStart?: number
  lineEnd?: number
  continuesFrom?: boolean
  isContinued?: boolean
  warningCodes: PageFragmentWarningCode[]
}

export interface PaginationTraceNodeSpan {
  sectionId: string
  nodeId: string
  nodeType: PageFragment["nodeType"]
  parentNodeIds: string[]
  firstPageIndex: number
  lastPageIndex: number
  fragmentCount: number
  firstFragmentOrder: number
  lastFragmentOrder: number
  lineStart?: number
  lineEnd?: number
  hasContinuation: boolean
  warningCodes: PageFragmentWarningCode[]
}

export interface PaginationTraceBodyChildSpan {
  sectionId: string
  bodyNodeId: string
  childIndex: number
  nodeId: string
  nodeType: string
  hasFragments: boolean
  firstPageIndex: number | null
  lastPageIndex: number | null
  fragmentCount: number
  hasContinuation: boolean
  warningCodes: PageFragmentWarningCode[]
}

export interface PaginationTraceTocEntry {
  nodeId: string
  text: string
  level: number
  pageNumber: number
}

export interface PaginationTrace {
  pageCount: number
  sectionSpans: PaginationTraceSectionSpan[]
  fragments: PaginationTraceFragment[]
  nodeSpans: PaginationTraceNodeSpan[]
  bodyChildSpans: PaginationTraceBodyChildSpan[]
  tocEntries: PaginationTraceTocEntry[]
}

export interface PaginateDocumentWithTraceResult {
  paginated: PaginatedDocument
  trace: PaginationTrace
}

interface MutableNodeSpan {
  sectionId: string
  nodeId: string
  nodeType: PageFragment["nodeType"]
  parentNodeIds: string[]
  firstPageIndex: number
  lastPageIndex: number
  fragmentCount: number
  firstFragmentOrder: number
  lastFragmentOrder: number
  lineStart?: number
  lineEnd?: number
  hasContinuation: boolean
  warningCodes: PageFragmentWarningCode[]
}

function warningCodesForFragment(fragment: PageFragment): PageFragmentWarningCode[] {
  const warnings = fragment.warnings ?? []
  const codes: PageFragmentWarningCode[] = []
  for (const warning of warnings) {
    if (!codes.includes(warning.code)) codes.push(warning.code)
  }
  return codes
}

function pushUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) target.push(value)
}

function sectionSpan(section: PaginatedSection): PaginationTraceSectionSpan {
  if (section.pages.length === 0) {
    return {
      sectionId: section.sectionId,
      firstPageIndex: null,
      lastPageIndex: null,
      pageCount: 0,
    }
  }

  return {
    sectionId: section.sectionId,
    firstPageIndex: section.pages[0].index,
    lastPageIndex: section.pages[section.pages.length - 1].index,
    pageCount: section.pages.length,
  }
}

function mergeNodeSpan(
  spans: Map<string, MutableNodeSpan>,
  fragment: PaginationTraceFragment,
): void {
  const key = `${fragment.sectionId}\u0000${fragment.nodeId}`
  const existing = spans.get(key)
  if (!existing) {
    spans.set(key, {
      sectionId: fragment.sectionId,
      nodeId: fragment.nodeId,
      nodeType: fragment.nodeType,
      parentNodeIds: fragment.parentNodeId ? [fragment.parentNodeId] : [],
      firstPageIndex: fragment.pageIndex,
      lastPageIndex: fragment.pageIndex,
      fragmentCount: 1,
      firstFragmentOrder: fragment.fragmentOrder,
      lastFragmentOrder: fragment.fragmentOrder,
      lineStart: fragment.lineStart,
      lineEnd: fragment.lineEnd,
      hasContinuation: Boolean(fragment.continuesFrom || fragment.isContinued || (fragment.fragmentIndex ?? 0) > 0),
      warningCodes: [...fragment.warningCodes],
    })
    return
  }

  if (fragment.parentNodeId) pushUnique(existing.parentNodeIds, fragment.parentNodeId)
  existing.firstPageIndex = Math.min(existing.firstPageIndex, fragment.pageIndex)
  existing.lastPageIndex = Math.max(existing.lastPageIndex, fragment.pageIndex)
  existing.fragmentCount += 1
  existing.firstFragmentOrder = Math.min(existing.firstFragmentOrder, fragment.fragmentOrder)
  existing.lastFragmentOrder = Math.max(existing.lastFragmentOrder, fragment.fragmentOrder)
  if (fragment.lineStart != null) {
    existing.lineStart = existing.lineStart == null
      ? fragment.lineStart
      : Math.min(existing.lineStart, fragment.lineStart)
  }
  if (fragment.lineEnd != null) {
    existing.lineEnd = existing.lineEnd == null
      ? fragment.lineEnd
      : Math.max(existing.lineEnd, fragment.lineEnd)
  }
  existing.hasContinuation ||= Boolean(fragment.continuesFrom || fragment.isContinued || (fragment.fragmentIndex ?? 0) > 0)
  for (const code of fragment.warningCodes) pushUnique(existing.warningCodes, code)
}

function collectBodyChildSpans(
  doc: DocumentNode,
  nodeSpans: PaginationTraceNodeSpan[],
): PaginationTraceBodyChildSpan[] {
  const spanBySectionAndNode = new Map<string, PaginationTraceNodeSpan>()
  for (const span of nodeSpans) {
    spanBySectionAndNode.set(`${span.sectionId}\u0000${span.nodeId}`, span)
  }

  const result: PaginationTraceBodyChildSpan[] = []
  for (const section of doc.document.sections) {
    const body = section.nodes[section.bodyRootId]
    const childIds = body?.type === "body" ? body.childIds : []
    childIds.forEach((nodeId, childIndex) => {
      const node = section.nodes[nodeId]
      const span = spanBySectionAndNode.get(`${section.id}\u0000${nodeId}`)
      result.push({
        sectionId: section.id,
        bodyNodeId: section.bodyRootId,
        childIndex,
        nodeId,
        nodeType: node?.type ?? "missing",
        hasFragments: span != null,
        firstPageIndex: span?.firstPageIndex ?? null,
        lastPageIndex: span?.lastPageIndex ?? null,
        fragmentCount: span?.fragmentCount ?? 0,
        hasContinuation: span?.hasContinuation ?? false,
        warningCodes: span?.warningCodes ?? [],
      })
    })
  }
  return result
}

export function buildPaginationTrace(doc: DocumentNode, paginated: PaginatedDocument): PaginationTrace {
  const fragments: PaginationTraceFragment[] = []
  const spanMap = new Map<string, MutableNodeSpan>()
  let fragmentOrder = 0

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      for (const fragment of page.fragments) {
        const traceFragment: PaginationTraceFragment = {
          sectionId: section.sectionId,
          pageIndex: page.index,
          fragmentOrder,
          nodeId: fragment.nodeId,
          nodeType: fragment.nodeType,
          parentNodeId: fragment.parentNodeId,
          x: fragment.x,
          y: fragment.y,
          width: fragment.width,
          height: fragment.height,
          fragmentIndex: fragment.fragmentIndex,
          lineStart: fragment.lineStart,
          lineEnd: fragment.lineEnd,
          continuesFrom: fragment.continuesFrom,
          isContinued: fragment.isContinued,
          warningCodes: warningCodesForFragment(fragment),
        }
        fragments.push(traceFragment)
        mergeNodeSpan(spanMap, traceFragment)
        fragmentOrder += 1
      }
    }
  }

  const nodeSpans = [...spanMap.values()]
    .sort((a, b) => a.firstFragmentOrder - b.firstFragmentOrder)
    .map((span) => ({ ...span }))

  return {
    pageCount: paginated.sections.reduce((total, section) => total + section.pages.length, 0),
    sectionSpans: paginated.sections.map(sectionSpan),
    fragments,
    nodeSpans,
    bodyChildSpans: collectBodyChildSpans(doc, nodeSpans),
    tocEntries: paginated.tocEntries.map((entry) => ({ ...entry })),
  }
}

export function paginateDocumentWithTrace(
  doc: DocumentNode,
  measurer: TextMeasurer,
  wordBreaker?: WordBreaker,
  onSplitDecision?: (decision: ParagraphSplitDecision) => void,
): PaginateDocumentWithTraceResult {
  const paginated = paginateDocument(doc, measurer, wordBreaker, onSplitDecision)
  return {
    paginated,
    trace: buildPaginationTrace(doc, paginated),
  }
}
