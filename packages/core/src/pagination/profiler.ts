import type { DocumentNode, LayoutNode } from "../schema"
import type { FontVariantKey } from "../font-registry"
import type { TextMeasurer, WordBreaker } from "../layout"

export type PaginationProfileSource =
  | "browser"
  | "server"
  | "export-pdf"
  | "export-docx"
  | "unknown"

export interface PaginationStageTiming {
  name: string
  totalMs: number
  count?: number
  avgMs?: number
  maxMs?: number
  minMs?: number
  children?: PaginationStageTiming[]
}

export interface PaginationCounters {
  measuredParagraphs?: number
  measuredTextRuns?: number
  segmentedTexts?: number
  measuredTables?: number
  measuredTableRows?: number
  measuredTableCells?: number
  packedPages?: number
  generatedFragments?: number
  cacheHits?: Record<string, number>
  cacheMisses?: Record<string, number>
}

export interface PaginationTopStage {
  name: string
  totalMs: number
  percentOfPagination: number
  count?: number
  avgMs?: number
}

export interface PaginationProfile {
  version: number
  source: PaginationProfileSource
  totalMs: number
  pageCount?: number
  fragmentCount?: number
  nodeCount?: number
  paragraphCount?: number
  tableCount?: number
  tableRowCount?: number
  tableCellCount?: number
  stages: PaginationStageTiming[]
  counters?: PaginationCounters
  notes?: string[]
  topStages?: PaginationTopStage[]
  profilingOverheadNote?: string
}

export interface PaginationProfilerFlushSummary {
  totalMs?: number
  pageCount?: number
  fragmentCount?: number
  nodeCount?: number
  paragraphCount?: number
  tableCount?: number
  tableRowCount?: number
  tableCellCount?: number
}

export interface PaginationProfiler {
  enabled: boolean
  start(name: string, detail?: Record<string, unknown>): () => void
  measure<T>(name: string, fn: () => T, detail?: Record<string, unknown>): T
  measureAsync<T>(name: string, fn: () => Promise<T>, detail?: Record<string, unknown>): Promise<T>
  count(name: string, amount?: number): void
  note(note: string): void
  flush(summary?: PaginationProfilerFlushSummary): PaginationProfile
}

interface InternalStage {
  name: string
  totalMs: number
  count: number
  minMs: number
  maxMs: number
  children: InternalStage[]
  childByName: Map<string, InternalStage>
}

interface ActiveStage {
  stage: InternalStage
  startedAt: number
}

const NOOP_END = () => undefined
const PROFILE_VERSION = 1
const WORD_SEGMENT_CACHE_LIMIT = 8192

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000
}

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 1000
}

function createStage(name: string): InternalStage {
  return {
    name,
    totalMs: 0,
    count: 0,
    minMs: Number.POSITIVE_INFINITY,
    maxMs: 0,
    children: [],
    childByName: new Map(),
  }
}

function stageToTiming(stage: InternalStage): PaginationStageTiming {
  const timing: PaginationStageTiming = {
    name: stage.name,
    totalMs: roundMs(stage.totalMs),
  }
  if (stage.count > 0) {
    timing.count = stage.count
    timing.avgMs = roundMs(stage.totalMs / stage.count)
    timing.maxMs = roundMs(stage.maxMs)
    timing.minMs = roundMs(stage.minMs)
  }
  if (stage.children.length > 0) {
    timing.children = stage.children.map(stageToTiming)
  }
  return timing
}

function flattenStages(stages: PaginationStageTiming[]): PaginationStageTiming[] {
  const flattened: PaginationStageTiming[] = []
  for (const stage of stages) {
    flattened.push(stage)
    if (stage.children) flattened.push(...flattenStages(stage.children))
  }
  return flattened
}

function aggregateTopStages(stages: PaginationStageTiming[], totalMs: number): PaginationTopStage[] {
  const aggregated = new Map<string, { name: string; totalMs: number; count: number }>()
  for (const stage of flattenStages(stages)) {
    if (stage.name === "total" || stage.totalMs <= 0) continue
    const current = aggregated.get(stage.name) ?? { name: stage.name, totalMs: 0, count: 0 }
    current.totalMs += stage.totalMs
    current.count += stage.count ?? 0
    aggregated.set(stage.name, current)
  }
  return [...aggregated.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 8)
    .map((stage) => ({
      name: stage.name,
      totalMs: roundMs(stage.totalMs),
      percentOfPagination: totalMs > 0 ? roundPercent((stage.totalMs / totalMs) * 100) : 0,
      count: stage.count > 0 ? stage.count : undefined,
      avgMs: stage.count > 0 ? roundMs(stage.totalMs / stage.count) : undefined,
    }))
}

function assignCounter(counters: PaginationCounters, name: string, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  if (name.startsWith("cache-hit:")) {
    const key = name.slice("cache-hit:".length)
    if (!key) return
    counters.cacheHits = counters.cacheHits ?? {}
    counters.cacheHits[key] = (counters.cacheHits[key] ?? 0) + amount
    return
  }
  if (name.startsWith("cache-miss:")) {
    const key = name.slice("cache-miss:".length)
    if (!key) return
    counters.cacheMisses = counters.cacheMisses ?? {}
    counters.cacheMisses[key] = (counters.cacheMisses[key] ?? 0) + amount
    return
  }
  switch (name) {
    case "measuredParagraphs":
    case "paragraph-measure":
      counters.measuredParagraphs = (counters.measuredParagraphs ?? 0) + amount
      return
    case "measuredTextRuns":
    case "text-width-measure":
      counters.measuredTextRuns = (counters.measuredTextRuns ?? 0) + amount
      return
    case "segmentedTexts":
    case "text-segmentation":
      counters.segmentedTexts = (counters.segmentedTexts ?? 0) + amount
      return
    case "measuredTables":
    case "table-measure":
      counters.measuredTables = (counters.measuredTables ?? 0) + amount
      return
    case "measuredTableRows":
    case "table-row-measure":
      counters.measuredTableRows = (counters.measuredTableRows ?? 0) + amount
      return
    case "measuredTableCells":
    case "table-cell-measure":
      counters.measuredTableCells = (counters.measuredTableCells ?? 0) + amount
      return
    case "packedPages":
    case "page-packing":
      counters.packedPages = (counters.packedPages ?? 0) + amount
      return
    case "generatedFragments":
    case "fragment-generation":
      counters.generatedFragments = (counters.generatedFragments ?? 0) + amount
      return
  }
}

function pruneCounters(counters: PaginationCounters): PaginationCounters | undefined {
  const compact: PaginationCounters = {}
  for (const [key, value] of Object.entries(counters)) {
    if (value == null) continue
    if (typeof value === "number" && value > 0) {
      ;(compact as Record<string, number>)[key] = value
    } else if (typeof value === "object" && Object.keys(value).length > 0) {
      ;(compact as Record<string, Record<string, number>>)[key] = value as Record<string, number>
    }
  }
  return Object.keys(compact).length > 0 ? compact : undefined
}

export function createNoopPaginationProfiler(source: PaginationProfileSource = "unknown"): PaginationProfiler {
  return {
    enabled: false,
    start: () => NOOP_END,
    measure: (_name, fn) => fn(),
    measureAsync: (_name, fn) => fn(),
    count: () => undefined,
    note: () => undefined,
    flush: (summary = {}) => ({
      version: PROFILE_VERSION,
      source,
      totalMs: roundMs(summary.totalMs ?? 0),
      pageCount: summary.pageCount,
      fragmentCount: summary.fragmentCount,
      nodeCount: summary.nodeCount,
      paragraphCount: summary.paragraphCount,
      tableCount: summary.tableCount,
      tableRowCount: summary.tableRowCount,
      tableCellCount: summary.tableCellCount,
      stages: [],
      profilingOverheadNote: "Pagination profiling was disabled.",
    }),
  }
}

export function createPaginationProfiler(options: {
  enabled?: boolean
  source?: PaginationProfileSource
  now?: () => number
} = {}): PaginationProfiler {
  if (!options.enabled) return createNoopPaginationProfiler(options.source ?? "unknown")

  const source = options.source ?? "unknown"
  const now = options.now ?? defaultNow
  const roots: InternalStage[] = []
  const rootByName = new Map<string, InternalStage>()
  const activeStages: ActiveStage[] = []
  const counters: PaginationCounters = {}
  const notes: string[] = []

  const getStage = (name: string): InternalStage => {
    const parent = activeStages.at(-1)?.stage
    const stageMap = parent?.childByName ?? rootByName
    const stageList = parent?.children ?? roots
    const existing = stageMap.get(name)
    if (existing) return existing
    const created = createStage(name)
    stageMap.set(name, created)
    stageList.push(created)
    return created
  }

  const profiler: PaginationProfiler = {
    enabled: true,
    start(name: string) {
      const stage = getStage(name)
      const active: ActiveStage = { stage, startedAt: now() }
      activeStages.push(active)
      let ended = false
      return () => {
        if (ended) return
        ended = true
        const durationMs = Math.max(0, now() - active.startedAt)
        const stackIndex = activeStages.lastIndexOf(active)
        if (stackIndex >= 0) activeStages.splice(stackIndex, 1)
        stage.totalMs += durationMs
        stage.count += 1
        stage.minMs = Math.min(stage.minMs, durationMs)
        stage.maxMs = Math.max(stage.maxMs, durationMs)
      }
    },
    measure(name, fn) {
      const end = profiler.start(name)
      try {
        return fn()
      } finally {
        end()
      }
    },
    async measureAsync(name, fn) {
      const end = profiler.start(name)
      try {
        return await fn()
      } finally {
        end()
      }
    },
    count(name, amount = 1) {
      assignCounter(counters, name, amount)
    },
    note(note) {
      if (!notes.includes(note)) notes.push(note)
    },
    flush(summary = {}) {
      const stages = roots.map(stageToTiming)
      const totalStage = stages.find((stage) => stage.name === "total")
      const totalMs = roundMs(summary.totalMs ?? totalStage?.totalMs ?? stages.reduce((sum, stage) => sum + stage.totalMs, 0))
      if (summary.pageCount != null && counters.packedPages == null) counters.packedPages = summary.pageCount
      if (summary.fragmentCount != null && counters.generatedFragments == null) counters.generatedFragments = summary.fragmentCount

      const topStages = aggregateTopStages(stages, totalMs)

      return {
        version: PROFILE_VERSION,
        source,
        totalMs,
        pageCount: summary.pageCount,
        fragmentCount: summary.fragmentCount,
        nodeCount: summary.nodeCount,
        paragraphCount: summary.paragraphCount,
        tableCount: summary.tableCount,
        tableRowCount: summary.tableRowCount,
        tableCellCount: summary.tableCellCount,
        stages,
        counters: pruneCounters(counters),
        notes: notes.length > 0 ? notes.slice() : undefined,
        topStages: topStages.length > 0 ? topStages : undefined,
        profilingOverheadNote: "Profiling overhead is included in measured totals; exact overhead is unknown.",
      }
    },
  }

  return profiler
}

export function isPaginationProfilerEnabled(profiler: PaginationProfiler | undefined): profiler is PaginationProfiler {
  return profiler?.enabled === true
}

export function profileTextMeasurer(measurer: TextMeasurer, profiler: PaginationProfiler): TextMeasurer {
  if (!isPaginationProfilerEnabled(profiler)) return measurer
  return {
    measureText(text: string, fontFamilyKey: string, fontSize: number, fontVariant?: FontVariantKey) {
      profiler.count("measuredTextRuns")
      return profiler.measure("text-width-measure", () => measurer.measureText(text, fontFamilyKey, fontSize, fontVariant))
    },
    measureLineHeight(fontFamilyKey: string, fontSize: number, lineHeightRatio: number) {
      return measurer.measureLineHeight(fontFamilyKey, fontSize, lineHeightRatio)
    },
  }
}

export function createCachedWordBreaker(
  wordBreaker: WordBreaker,
  profiler?: PaginationProfiler,
): WordBreaker {
  const segmentsByText = new Map<string, string[]>()

  return {
    segment(text: string) {
      const cached = segmentsByText.get(text)
      if (cached) {
        profiler?.count("cache-hit:text-segmentation")
        return cached.slice()
      }

      profiler?.count("cache-miss:text-segmentation")
      const segments = wordBreaker.segment(text)
      if (segmentsByText.size < WORD_SEGMENT_CACHE_LIMIT) {
        segmentsByText.set(text, segments.slice())
      }
      return segments
    },
  }
}

export function profileWordBreaker(wordBreaker: WordBreaker, profiler: PaginationProfiler): WordBreaker {
  if (!isPaginationProfilerEnabled(profiler)) return wordBreaker
  return {
    segment(text: string) {
      profiler.count("segmentedTexts")
      return profiler.measure("text-segmentation", () => wordBreaker.segment(text))
    },
  }
}

export function measureWithPaginationProfile<T>(
  profiler: PaginationProfiler | undefined,
  name: string,
  fn: () => T,
): T {
  return isPaginationProfilerEnabled(profiler) ? profiler.measure(name, fn) : fn()
}

export function countPaginatedPagesAndFragments(paginated: {
  sections: Array<{ pages: Array<{ fragments: unknown[]; headerFragments: unknown[]; footerFragments: unknown[] }> }>
}): { pageCount: number; fragmentCount: number } {
  let pageCount = 0
  let fragmentCount = 0
  for (const section of paginated.sections) {
    pageCount += section.pages.length
    for (const page of section.pages) {
      fragmentCount += page.headerFragments.length + page.fragments.length + page.footerFragments.length
    }
  }
  return { pageCount, fragmentCount }
}

function collectLayoutNodeCounts(node: LayoutNode, counts: {
  totalNodes: number
  paragraphs: number
  flowTables: number
  flowTableRows: number
  flowTableCells: number
}): void {
  counts.totalNodes += 1
  if (node.type === "paragraph") counts.paragraphs += 1
  if (node.type !== "flow-table") return

  counts.flowTables += 1
  for (const tableNode of Object.values(node.nodes)) {
    counts.totalNodes += 1
    if (tableNode.type === "paragraph") counts.paragraphs += 1
    if (tableNode.type === "flow-table-row") counts.flowTableRows += 1
    if (tableNode.type === "flow-table-cell") counts.flowTableCells += 1
  }
}

export function collectPaginationDocumentCounts(doc: DocumentNode): Pick<
  PaginationProfilerFlushSummary,
  "nodeCount" | "paragraphCount" | "tableCount" | "tableRowCount" | "tableCellCount"
> {
  const counts = {
    totalNodes: 0,
    paragraphs: 0,
    flowTables: 0,
    flowTableRows: 0,
    flowTableCells: 0,
  }
  for (const section of doc.document.sections) {
    for (const node of Object.values(section.nodes)) {
      collectLayoutNodeCounts(node, counts)
    }
  }
  return {
    nodeCount: counts.totalNodes,
    paragraphCount: counts.paragraphs,
    tableCount: counts.flowTables,
    tableRowCount: counts.flowTableRows,
    tableCellCount: counts.flowTableCells,
  }
}
