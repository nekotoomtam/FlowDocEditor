import type { PaginationProfile, PaginationStageTiming } from "@/pagination"

export const FLOWDOC_EXPORT_PROFILE_HEADER = "X-FlowDoc-Export-Profile"
export const FLOWDOC_LARGE_EXPORT_PAGE_THRESHOLD = 100
export const FLOWDOC_VERY_LARGE_EXPORT_PAGE_THRESHOLD = 300

export type FlowDocExportFormat = "pdf" | "docx"
export type FlowDocExportScaleTier = "standard" | "large" | "very-large"

export interface FlowDocExportProfile {
  format: FlowDocExportFormat
  pageCount: number
  fragmentCount: number
  paginateMs: number
  assertMs: number
  renderMs: number
  totalMs: number
  pdfPageRenderMs?: number
  pdfFinalizeMs?: number
  pdfPageBatchSize?: number
  paginationProfile?: PaginationProfile
}

const requiredNumberFields = [
  "pageCount",
  "fragmentCount",
  "paginateMs",
  "assertMs",
  "renderMs",
  "totalMs",
] as const

const optionalNumberFields = [
  "pdfPageRenderMs",
  "pdfFinalizeMs",
  "pdfPageBatchSize",
] as const

function isFlowDocExportFormat(value: unknown): value is FlowDocExportFormat {
  return value === "pdf" || value === "docx"
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function assignOptionalFiniteNumber(
  profile: FlowDocExportProfile,
  record: Record<string, unknown>,
  key: (typeof optionalNumberFields)[number],
) {
  const value = readFiniteNumber(record, key)
  if (value !== null) profile[key] = value
}

function isStageTiming(value: unknown): value is PaginationStageTiming {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== "string") return false
  if (typeof record.totalMs !== "number" || !Number.isFinite(record.totalMs)) return false
  if (record.count !== undefined && (typeof record.count !== "number" || !Number.isFinite(record.count))) return false
  if (record.avgMs !== undefined && (typeof record.avgMs !== "number" || !Number.isFinite(record.avgMs))) return false
  if (record.maxMs !== undefined && (typeof record.maxMs !== "number" || !Number.isFinite(record.maxMs))) return false
  if (record.minMs !== undefined && (typeof record.minMs !== "number" || !Number.isFinite(record.minMs))) return false
  if (record.children !== undefined) {
    if (!Array.isArray(record.children)) return false
    if (!record.children.every(isStageTiming)) return false
  }
  return true
}

function isPaginationProfile(value: unknown): value is PaginationProfile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.version !== "number") return false
  if (typeof record.source !== "string") return false
  if (typeof record.totalMs !== "number" || !Number.isFinite(record.totalMs)) return false
  if (!Array.isArray(record.stages) || !record.stages.every(isStageTiming)) return false
  return true
}

export function serializeFlowDocExportProfile(profile: FlowDocExportProfile): string {
  return JSON.stringify(profile)
}

export function parseFlowDocExportProfileHeader(value: string | null): FlowDocExportProfile | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    if (!isFlowDocExportFormat(record.format)) return null

    const requiredNumbers = requiredNumberFields.map((key) => readFiniteNumber(record, key))
    if (requiredNumbers.some((entry) => entry === null)) return null

    const profile: FlowDocExportProfile = {
      format: record.format,
      pageCount: requiredNumbers[0] ?? 0,
      fragmentCount: requiredNumbers[1] ?? 0,
      paginateMs: requiredNumbers[2] ?? 0,
      assertMs: requiredNumbers[3] ?? 0,
      renderMs: requiredNumbers[4] ?? 0,
      totalMs: requiredNumbers[5] ?? 0,
    }
    for (const key of optionalNumberFields) assignOptionalFiniteNumber(profile, record, key)
    if (isPaginationProfile(record.paginationProfile)) profile.paginationProfile = record.paginationProfile
    return profile
  } catch {
    return null
  }
}

function formatDuration(ms: number): string {
  if (ms >= 10_000) return `${Math.round(ms / 1000)}s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}

function formatPageCount(pageCount: number): string {
  return `${pageCount} ${pageCount === 1 ? "page" : "pages"}`
}

export function classifyFlowDocExportScale(profile: FlowDocExportProfile | null): FlowDocExportScaleTier | null {
  if (!profile) return null
  if (profile.pageCount >= FLOWDOC_VERY_LARGE_EXPORT_PAGE_THRESHOLD) return "very-large"
  if (profile.pageCount >= FLOWDOC_LARGE_EXPORT_PAGE_THRESHOLD) return "large"
  return "standard"
}

export function formatFlowDocExportScaleNote(profile: FlowDocExportProfile | null): string | null {
  const scale = classifyFlowDocExportScale(profile)
  if (!profile || scale === null || scale === "standard") return null
  const formatLabel = profile.format.toUpperCase()
  if (scale === "very-large") {
    return `Very large ${formatLabel} profile captured; use this timing before choosing background or chunked export.`
  }
  return `Large ${formatLabel} profile captured; watch total, page-render, and finalize time.`
}

export function formatFlowDocExportProfileSummary(profile: FlowDocExportProfile | null): string | null {
  if (!profile) return null
  const formatLabel = profile.format.toUpperCase()
  const timingParts = [`${formatDuration(profile.totalMs)} total`]
  if (profile.pdfPageRenderMs !== undefined) {
    timingParts.push(`${formatDuration(profile.pdfPageRenderMs)} page render`)
  } else {
    timingParts.push(`${formatDuration(profile.renderMs)} render`)
  }
  if (profile.pdfFinalizeMs !== undefined) timingParts.push(`${formatDuration(profile.pdfFinalizeMs)} finalize`)
  if (profile.format === "pdf" && profile.pdfPageBatchSize !== undefined) {
    timingParts.push(`batches of ${profile.pdfPageBatchSize}`)
  }
  const scaleNote = formatFlowDocExportScaleNote(profile)
  const baseSummary = `${formatLabel} export ready: ${formatPageCount(profile.pageCount)}, ${timingParts.join(", ")}.`
  return scaleNote ? `${baseSummary} ${scaleNote}` : baseSummary
}
