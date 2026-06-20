import type { NodeId, SectionId } from "../graph/relationshipGraph.js"
import type { VNextOperationResult } from "../operations/documentOperations.js"

export type VNextTextMeasurementCacheStatus = "hit" | "miss" | "uncached"

export interface VNextTextMeasurementInput {
  documentId: string
  sectionId: SectionId
  nodeId: NodeId
  text: string
  availableWidthPt: number
  styleKey?: string
  measurementProfileId?: string
}

export interface VNextTextMeasurementLineBox {
  index: number
  text: string
  startOffset: number
  endOffset: number
  widthPt: number
  heightPt: number
  yOffsetPt: number
}

export interface VNextTextMeasurementDraft {
  lines: string[]
  lineHeightPt: number
  widthPt: number
  heightPt: number
  lineBoxes?: VNextTextMeasurementLineBox[]
}

export interface VNextTextMeasurement extends VNextTextMeasurementDraft {
  cacheKey: string
  cacheStatus: VNextTextMeasurementCacheStatus
  documentId: string
  sectionId: SectionId
  nodeId: NodeId
  textHash: string
  availableWidthPt: number
  styleKey: string
  measurementProfileId: string
  lineBoxes: VNextTextMeasurementLineBox[]
}

export interface VNextTextMeasurer {
  measure(input: VNextTextMeasurementInput & { cacheKey: string; textHash: string }): VNextTextMeasurementDraft
}

export interface VNextTextMeasurementInvalidation {
  status: "stale" | "unchanged"
  sourceOperationKind: string
  affectedSectionIds: SectionId[]
  affectedNodeIds: NodeId[]
  reason: string
}

export interface VNextTextMeasurementCache {
  get(cacheKey: string): VNextTextMeasurement | undefined
  set(measurement: VNextTextMeasurement): void
  delete(cacheKey: string): boolean
  clear(): void
  entries(): VNextTextMeasurement[]
  invalidate(invalidation: VNextTextMeasurementInvalidation): number
}

function hashText(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizeNumber(value: number): string {
  return Number(value.toFixed(4)).toString()
}

export function createVNextTextMeasurementCacheKey(input: VNextTextMeasurementInput): string {
  const textHash = hashText(input.text)
  const styleKey = input.styleKey ?? "default"
  const profileId = input.measurementProfileId ?? "default"

  return [
    "vnext-text-measurement",
    "v1",
    input.documentId,
    input.sectionId,
    input.nodeId,
    normalizeNumber(input.availableWidthPt),
    profileId,
    styleKey,
    input.text.length,
    textHash,
  ].join(":")
}

function buildLineBoxes(lines: readonly string[], lineHeightPt: number, availableWidthPt: number): VNextTextMeasurementLineBox[] {
  let offset = 0

  return lines.map((line, index) => {
    const startOffset = offset
    const endOffset = startOffset + line.length
    offset = endOffset + 1

    return {
      index,
      text: line,
      startOffset,
      endOffset,
      widthPt: Math.min(availableWidthPt, line.length === 0 ? 0 : availableWidthPt),
      heightPt: lineHeightPt,
      yOffsetPt: index * lineHeightPt,
    }
  })
}

function withCacheStatus(
  measurement: VNextTextMeasurement,
  cacheStatus: VNextTextMeasurementCacheStatus,
): VNextTextMeasurement {
  return {
    ...measurement,
    cacheStatus,
    lines: [...measurement.lines],
    lineBoxes: measurement.lineBoxes.map((line) => ({ ...line })),
  }
}

function normalizeMeasurement(
  input: VNextTextMeasurementInput,
  cacheKey: string,
  draft: VNextTextMeasurementDraft,
  cacheStatus: VNextTextMeasurementCacheStatus,
): VNextTextMeasurement {
  const lines = draft.lines.length > 0 ? [...draft.lines] : [""]
  const lineBoxes = draft.lineBoxes == null || draft.lineBoxes.length === 0
    ? buildLineBoxes(lines, draft.lineHeightPt, input.availableWidthPt)
    : draft.lineBoxes.map((line) => ({ ...line }))

  return {
    cacheKey,
    cacheStatus,
    documentId: input.documentId,
    sectionId: input.sectionId,
    nodeId: input.nodeId,
    textHash: hashText(input.text),
    availableWidthPt: input.availableWidthPt,
    styleKey: input.styleKey ?? "default",
    measurementProfileId: input.measurementProfileId ?? "default",
    lines,
    lineBoxes,
    lineHeightPt: draft.lineHeightPt,
    widthPt: draft.widthPt,
    heightPt: draft.heightPt,
  }
}

export function createVNextTextMeasurementCache(): VNextTextMeasurementCache {
  const byKey = new Map<string, VNextTextMeasurement>()

  return {
    get(cacheKey) {
      const measurement = byKey.get(cacheKey)
      return measurement == null ? undefined : withCacheStatus(measurement, "hit")
    },
    set(measurement) {
      byKey.set(measurement.cacheKey, withCacheStatus(measurement, "miss"))
    },
    delete(cacheKey) {
      return byKey.delete(cacheKey)
    },
    clear() {
      byKey.clear()
    },
    entries() {
      return [...byKey.values()].map((measurement) => withCacheStatus(measurement, measurement.cacheStatus))
    },
    invalidate(invalidation) {
      if (invalidation.status === "unchanged") return 0

      const affectedSections = new Set(invalidation.affectedSectionIds)
      const affectedNodes = new Set(invalidation.affectedNodeIds)
      let deletedCount = 0

      byKey.forEach((measurement, key) => {
        const sectionMatch = affectedSections.size === 0 || affectedSections.has(measurement.sectionId)
        const nodeMatch = affectedNodes.size === 0 || affectedNodes.has(measurement.nodeId)
        if (!sectionMatch || !nodeMatch) return

        byKey.delete(key)
        deletedCount += 1
      })

      return deletedCount
    },
  }
}

export function measureVNextText(
  input: VNextTextMeasurementInput,
  measurer: VNextTextMeasurer,
  cache?: VNextTextMeasurementCache,
): VNextTextMeasurement {
  const cacheKey = createVNextTextMeasurementCacheKey(input)
  const cached = cache?.get(cacheKey)
  if (cached != null) return cached

  const textHash = hashText(input.text)
  const measured = normalizeMeasurement(
    input,
    cacheKey,
    measurer.measure({ ...input, cacheKey, textHash }),
    cache == null ? "uncached" : "miss",
  )
  cache?.set(measured)
  return measured
}

export function resolveVNextTextMeasurementInvalidation(result: VNextOperationResult): VNextTextMeasurementInvalidation {
  if (!result.ok) {
    return {
      status: "unchanged",
      sourceOperationKind: result.command.kind,
      affectedSectionIds: [],
      affectedNodeIds: [],
      reason: result.reason,
    }
  }

  const affectedNodeIds = result.operation.scope.textBlockIds.length > 0
    ? result.operation.scope.textBlockIds
    : result.operation.renderInvalidation.lane === "text-content"
      ? result.operation.scope.nodeIds
      : []

  return {
    status: "stale",
    sourceOperationKind: result.operation.kind,
    affectedSectionIds: result.operation.scope.sectionIds,
    affectedNodeIds,
    reason: result.operation.renderInvalidation.lane,
  }
}

function splitTextToLines(text: string, maxCharsPerLine: number): string[] {
  const sourceLines = text.split("\n")
  const lines: string[] = []

  sourceLines.forEach((sourceLine) => {
    if (sourceLine.length === 0) {
      lines.push("")
      return
    }

    for (let index = 0; index < sourceLine.length; index += maxCharsPerLine) {
      lines.push(sourceLine.slice(index, index + maxCharsPerLine))
    }
  })

  return lines.length > 0 ? lines : [""]
}

export function createApproximateVNextTextMeasurer(options: {
  charWidthPt?: number
  lineHeightPt?: number
} = {}): VNextTextMeasurer {
  const charWidthPt = options.charWidthPt ?? 6
  const lineHeightPt = options.lineHeightPt ?? 14

  return {
    measure(input) {
      const maxCharsPerLine = Math.max(1, Math.floor(input.availableWidthPt / charWidthPt))
      const lines = splitTextToLines(input.text, maxCharsPerLine)
      const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0)
      const lineBoxes = lines.map((line, index) => ({
        index,
        text: line,
        startOffset: index === 0 ? 0 : lines.slice(0, index).join("\n").length + 1,
        endOffset: index === 0 ? line.length : lines.slice(0, index).join("\n").length + 1 + line.length,
        widthPt: Math.min(input.availableWidthPt, line.length * charWidthPt),
        heightPt: lineHeightPt,
        yOffsetPt: index * lineHeightPt,
      }))

      return {
        lines,
        lineBoxes,
        lineHeightPt,
        widthPt: Math.min(input.availableWidthPt, longestLineLength * charWidthPt),
        heightPt: lines.length * lineHeightPt,
      }
    },
  }
}
