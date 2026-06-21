import type {
  EditorVNextBridgeHostIssueSummary,
  EditorVNextBridgeHostSnapshotStatus,
  EditorVNextPreviewArtifactCommand,
  EditorVNextPreviewArtifactSnapshot,
} from "./editorVNextBridgeHost"

export type EditorVNextSvgPreviewProofStatus = "pass" | "risk" | "blocked"
export type EditorVNextSvgPreviewProofIssueSeverity = "risk" | "blocking"

export interface EditorVNextSvgPreviewProofOptions {
  pageStart?: number
  pageCount?: number
  maxPages?: number
  maxPageSvgBytes?: number
  maxWindowSvgBytes?: number
  maxCommandsPerPage?: number
}

export interface EditorVNextSvgPreviewProofIssue {
  severity: EditorVNextSvgPreviewProofIssueSeverity
  code: string
  message: string
  pageIndex?: number
}

export interface EditorVNextSvgPreviewProofPage {
  pageIndex: number
  pageNumber: number
  sectionId: string
  widthPt: number
  heightPt: number
  commandCount: number
  svgBytes: number
  status: "rendered" | "risk"
  svg: string
}

export interface EditorVNextSvgPreviewProofSnapshot {
  source: "editor-vnext-svg-preview-proof"
  milestone: "svg-preview-proof"
  jobItem: "S3"
  mode: "svg-preview-proof"
  input: "editor-vnext-preview-artifact"
  status: EditorVNextSvgPreviewProofStatus
  documentId: string | null
  packageVersion: 2 | null
  documentVersion: 3 | null
  artifact: {
    sourceStatus: EditorVNextBridgeHostSnapshotStatus
    commandCount: number
    returnedCommandCount: number
    truncated: boolean
    generatedDocumentReturned: false
    paginatedDocumentReturned: false
    pdfRendered: false
    docxRendered: false
  }
  rendererContract: {
    consumes: "measured-pagination-fragments"
    mayRelayout: false
    requiresAuthoredDocumentForLayout: false
  }
  pageWindow: {
    pageStart: number
    requestedPageCount: number
    renderedPageCount: number
    availablePageCount: number
    clamped: boolean
  }
  budgets: {
    maxPages: number
    maxPageSvgBytes: number
    maxWindowSvgBytes: number
    maxCommandsPerPage: number
  }
  metrics: {
    totalCommandCount: number
    renderedCommandCount: number
    totalSvgBytes: number
    maxPageSvgBytes: number
    renderMs: number
  }
  pages: EditorVNextSvgPreviewProofPage[]
  sideEffects: {
    editorState: false
    history: false
    selection: false
    paginatedPreview: false
    canvasRendering: false
    persistence: false
    apiRoutesReplaced: false
    pdfRendered: false
    docxRendered: false
  }
  issues: EditorVNextSvgPreviewProofIssue[]
  sourceIssues: EditorVNextBridgeHostIssueSummary[]
}

export type EditorVNextSvgPreviewProofResult =
  | { ok: true; snapshot: EditorVNextSvgPreviewProofSnapshot }
  | { ok: false; reason: string; snapshot: EditorVNextSvgPreviewProofSnapshot }

const DEFAULT_MAX_PAGES = 5
const DEFAULT_MAX_PAGE_SVG_BYTES = 250_000
const DEFAULT_MAX_WINDOW_SVG_BYTES = 1_000_000
const DEFAULT_MAX_COMMANDS_PER_PAGE = 500

function sideEffects(): EditorVNextSvgPreviewProofSnapshot["sideEffects"] {
  return {
    editorState: false,
    history: false,
    selection: false,
    paginatedPreview: false,
    canvasRendering: false,
    persistence: false,
    apiRoutesReplaced: false,
    pdfRendered: false,
    docxRendered: false,
  }
}

function positiveInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function nonNegativeInt(value: number | undefined, fallback: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(max, Math.floor(value)))
}

function pageNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function pt(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return Number(value.toFixed(3)).toString()
}

function svgEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

function commandLabel(command: EditorVNextPreviewArtifactCommand): string {
  return `${command.kind}:${command.nodeType}:${command.nodeId}`
}

function commandStroke(command: EditorVNextPreviewArtifactCommand): string {
  if (command.kind === "text") return "#1f2937"
  if (command.nodeType === "table" || command.nodeType === "table-row" || command.nodeType === "table-cell") return "#2563eb"
  if (command.kind === "container") return "#64748b"
  return "#94a3b8"
}

function renderTextCommand(command: EditorVNextPreviewArtifactCommand): string {
  const x = command.bounds.xPt
  const y = command.bounds.yPt
  const fontSize = Math.max(6, Math.min(16, command.bounds.heightPt > 0 ? command.bounds.heightPt * 0.72 : 10))
  const lines = (command.text ?? "").split(/\r?\n/)
  const tspans = lines.length === 0
    ? ""
    : lines.map((line, index) => {
      const dy = index === 0 ? 0 : fontSize * 1.2
      return `<tspan x="${pt(x)}" dy="${pt(dy)}">${svgEscape(line)}</tspan>`
    }).join("")

  return `<text x="${pt(x)}" y="${pt(y + fontSize)}" font-family="Arial, sans-serif" font-size="${pt(fontSize)}" fill="#111827">${tspans}</text>`
}

function renderBoxCommand(command: EditorVNextPreviewArtifactCommand): string {
  const stroke = commandStroke(command)
  const label = svgEscape(commandLabel(command))
  return `<g data-command-id="${svgEscape(command.id)}" data-node-id="${svgEscape(command.nodeId)}" data-label="${label}"><rect x="${pt(command.bounds.xPt)}" y="${pt(command.bounds.yPt)}" width="${pt(command.bounds.widthPt)}" height="${pt(command.bounds.heightPt)}" fill="none" stroke="${stroke}" stroke-width="0.5" stroke-dasharray="2 3"/></g>`
}

function renderCommand(command: EditorVNextPreviewArtifactCommand): string {
  if (command.kind === "text" && command.text != null) {
    return renderTextCommand(command)
  }
  return renderBoxCommand(command)
}

function renderPageSvg(
  page: EditorVNextPreviewArtifactSnapshot["pages"][number],
  commands: EditorVNextPreviewArtifactCommand[],
): string {
  const width = page.widthPt > 0 ? page.widthPt : 595
  const height = page.heightPt > 0 ? page.heightPt : 842
  const renderedCommands = commands.map(renderCommand).join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pt(width)} ${pt(height)}" width="${pt(width)}pt" height="${pt(height)}pt" role="img" data-page-index="${page.pageIndex}" data-page-number="${page.pageNumber}" data-section-id="${svgEscape(page.sectionId)}">`,
    `<rect x="0" y="0" width="${pt(width)}" height="${pt(height)}" fill="#ffffff"/>`,
    renderedCommands,
    "</svg>",
  ].join("")
}

function emptySnapshot(
  artifact: EditorVNextPreviewArtifactSnapshot,
  issues: EditorVNextSvgPreviewProofIssue[],
  budgets: EditorVNextSvgPreviewProofSnapshot["budgets"],
  pageWindow: EditorVNextSvgPreviewProofSnapshot["pageWindow"],
): EditorVNextSvgPreviewProofSnapshot {
  return {
    source: "editor-vnext-svg-preview-proof",
    milestone: "svg-preview-proof",
    jobItem: "S3",
    mode: "svg-preview-proof",
    input: "editor-vnext-preview-artifact",
    status: "blocked",
    documentId: artifact.documentId,
    packageVersion: artifact.packageVersion,
    documentVersion: artifact.documentVersion,
    artifact: {
      sourceStatus: artifact.status,
      commandCount: artifact.artifact.commandCount,
      returnedCommandCount: artifact.artifact.returnedCommandCount,
      truncated: artifact.artifact.truncated,
      generatedDocumentReturned: false,
      paginatedDocumentReturned: false,
      pdfRendered: false,
      docxRendered: false,
    },
    rendererContract: artifact.rendererContract,
    pageWindow,
    budgets,
    metrics: {
      totalCommandCount: artifact.artifact.commandCount,
      renderedCommandCount: 0,
      totalSvgBytes: 0,
      maxPageSvgBytes: 0,
      renderMs: 0,
    },
    pages: [],
    sideEffects: sideEffects(),
    issues,
    sourceIssues: artifact.issues,
  }
}

function statusFromIssues(issues: EditorVNextSvgPreviewProofIssue[]): EditorVNextSvgPreviewProofStatus {
  if (issues.some((issue) => issue.severity === "blocking")) return "blocked"
  if (issues.length > 0) return "risk"
  return "pass"
}

export function createEditorVNextSvgPreviewProofSnapshot(
  artifact: EditorVNextPreviewArtifactSnapshot,
  options: EditorVNextSvgPreviewProofOptions = {},
): EditorVNextSvgPreviewProofResult {
  const maxPages = positiveInt(options.maxPages, DEFAULT_MAX_PAGES, 1, 50)
  const requestedPageCount = positiveInt(options.pageCount, 1, 1, 10_000)
  const pageStart = nonNegativeInt(options.pageStart, 0, Math.max(0, artifact.pages.length))
  const renderPageCount = Math.min(requestedPageCount, maxPages, Math.max(0, artifact.pages.length - pageStart))
  const maxPageSvgBytes = positiveInt(options.maxPageSvgBytes, DEFAULT_MAX_PAGE_SVG_BYTES, 1, 20_000_000)
  const maxWindowSvgBytes = positiveInt(options.maxWindowSvgBytes, DEFAULT_MAX_WINDOW_SVG_BYTES, 1, 100_000_000)
  const maxCommandsPerPage = positiveInt(options.maxCommandsPerPage, DEFAULT_MAX_COMMANDS_PER_PAGE, 1, 50_000)
  const pageWindow = {
    pageStart,
    requestedPageCount,
    renderedPageCount: renderPageCount,
    availablePageCount: artifact.pages.length,
    clamped: renderPageCount < requestedPageCount,
  }
  const budgets = {
    maxPages,
    maxPageSvgBytes,
    maxWindowSvgBytes,
    maxCommandsPerPage,
  }
  const issues: EditorVNextSvgPreviewProofIssue[] = []

  if (artifact.status === "blocked") {
    issues.push({
      severity: "blocking",
      code: "source-artifact-blocked",
      message: "The source preview artifact is blocked, so SVG proof cannot render.",
    })
    return {
      ok: false,
      reason: "source-artifact-blocked",
      snapshot: emptySnapshot(artifact, issues, budgets, pageWindow),
    }
  }

  if (renderPageCount <= 0) {
    issues.push({
      severity: "blocking",
      code: "no-renderable-pages",
      message: "The requested page window does not contain any renderable pages.",
    })
    return {
      ok: false,
      reason: "no-renderable-pages",
      snapshot: emptySnapshot(artifact, issues, budgets, pageWindow),
    }
  }

  if (artifact.status === "ready-with-warnings" || artifact.issues.length > 0) {
    issues.push({
      severity: "risk",
      code: "source-artifact-has-warnings",
      message: "The source preview artifact has warnings that the SVG proof must surface.",
    })
  }

  if (artifact.artifact.truncated) {
    issues.push({
      severity: "risk",
      code: "source-artifact-truncated",
      message: "The source preview artifact returned a truncated command list.",
    })
  }

  if (pageWindow.clamped) {
    issues.push({
      severity: "risk",
      code: "page-window-clamped",
      message: "The requested page window was clamped by the proof page budget or available page count.",
    })
  }

  const startedAt = Date.now()
  const selectedPages = artifact.pages.slice(pageStart, pageStart + renderPageCount)
  const renderedPages = selectedPages.map((page) => {
    const pageCommands = artifact.commands.filter((command) => command.pageIndex === page.pageIndex)
    const commands = pageCommands.slice(0, maxCommandsPerPage)
    if (commands.length < pageCommands.length) {
      issues.push({
        severity: "risk",
        code: "page-command-budget-exceeded",
        message: "A page contained more commands than the proof command budget.",
        pageIndex: page.pageIndex,
      })
    }

    const svg = renderPageSvg(page, commands)
    const svgBytes = utf8ByteLength(svg)
    if (svgBytes > maxPageSvgBytes) {
      issues.push({
        severity: "risk",
        code: "page-svg-budget-exceeded",
        message: "A rendered SVG page exceeded the per-page byte budget.",
        pageIndex: page.pageIndex,
      })
    }

    return {
      pageIndex: page.pageIndex,
      pageNumber: pageNumber(page.pageNumber, page.pageIndex + 1),
      sectionId: page.sectionId,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      commandCount: commands.length,
      svgBytes,
      status: svgBytes > maxPageSvgBytes || commands.length < pageCommands.length ? "risk" as const : "rendered" as const,
      svg,
    }
  })
  const totalSvgBytes = renderedPages.reduce((total, page) => total + page.svgBytes, 0)

  if (totalSvgBytes > maxWindowSvgBytes) {
    issues.push({
      severity: "risk",
      code: "window-svg-budget-exceeded",
      message: "The rendered SVG page window exceeded the total byte budget.",
    })
  }

  const status = statusFromIssues(issues)
  const snapshot: EditorVNextSvgPreviewProofSnapshot = {
    source: "editor-vnext-svg-preview-proof",
    milestone: "svg-preview-proof",
    jobItem: "S3",
    mode: "svg-preview-proof",
    input: "editor-vnext-preview-artifact",
    status,
    documentId: artifact.documentId,
    packageVersion: artifact.packageVersion,
    documentVersion: artifact.documentVersion,
    artifact: {
      sourceStatus: artifact.status,
      commandCount: artifact.artifact.commandCount,
      returnedCommandCount: artifact.artifact.returnedCommandCount,
      truncated: artifact.artifact.truncated,
      generatedDocumentReturned: false,
      paginatedDocumentReturned: false,
      pdfRendered: false,
      docxRendered: false,
    },
    rendererContract: artifact.rendererContract,
    pageWindow,
    budgets,
    metrics: {
      totalCommandCount: artifact.artifact.commandCount,
      renderedCommandCount: renderedPages.reduce((total, page) => total + page.commandCount, 0),
      totalSvgBytes,
      maxPageSvgBytes: renderedPages.reduce((max, page) => Math.max(max, page.svgBytes), 0),
      renderMs: Math.max(0, Date.now() - startedAt),
    },
    pages: renderedPages,
    sideEffects: sideEffects(),
    issues,
    sourceIssues: artifact.issues,
  }

  if (status === "blocked") {
    return {
      ok: false,
      reason: "svg-preview-proof-blocked",
      snapshot,
    }
  }

  return {
    ok: true,
    snapshot,
  }
}
