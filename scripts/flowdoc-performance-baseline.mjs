import { spawn } from "node:child_process"
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { summarizeFlowDocStats, unwrapFlowDocDocument } from "./flowdoc-performance-stats.mjs"

const STORAGE_KEY = "flowdoc_document"
const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const PAGINATION_PROFILE_STORAGE_KEY = "flowdoc.profilePagination"
const EXPORT_PROFILE_HEADER = "x-flowdoc-export-profile"
const DEFAULT_BASELINE_FILE = "public/mock/flowdoc-stress-mock.flowdoc.json"
const DEFAULT_APP_URL = "http://localhost:3000"
const DEFAULT_OUTPUT_DIR = "reports/perf-baseline"
const DEFAULT_TIMEOUT_MS = 180000
const DEFAULT_EXPORT_TIMEOUT_MS = 300000
const SERVER_START_TIMEOUT_MS = 90000

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const runStartedAt = Date.now()

class BaselineError extends Error {
  constructor(stage, message, cause) {
    super(message)
    this.name = "BaselineError"
    this.stage = stage
    this.cause = cause
  }
}

function stageError(stage, message, cause) {
  return new BaselineError(stage, message, cause)
}

function originalErrorMessage(error) {
  if (error instanceof BaselineError && error.cause) {
    return originalErrorMessage(error.cause)
  }
  return String(error?.message ?? error)
}

function toBaselineError(stage, error) {
  if (error instanceof BaselineError) return error
  return stageError(stage, originalErrorMessage(error), error)
}

async function withStage(stage, action) {
  try {
    return await action()
  } catch (error) {
    throw toBaselineError(stage, error)
  }
}

function envFlag(name) {
  return process.env[name] === "1"
}

function envTruthy(name) {
  const value = process.env[name]
  if (value == null) return false
  return !["", "0", "false", "off", "no"].includes(value.trim().toLowerCase())
}

function finiteNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function roundMs(value) {
  return Math.round(value * 10) / 10
}

function timestampForFile(date) {
  const pad = (value) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

function displayPath(filePath) {
  const relative = path.relative(repoRoot, filePath)
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.replaceAll(path.sep, "/")
    : filePath
}

function editorUrlFromAppUrl(rawAppUrl, profilePagination = false) {
  const url = new URL(rawAppUrl)
  const normalizedPath = url.pathname.replace(/\/+$/, "")
  if (normalizedPath === "") {
    url.pathname = "/editor"
  }
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  if (profilePagination) url.searchParams.set("flowdocProfilePagination", "1")
  return url.toString()
}

function apiOrigin(rawAppUrl) {
  return new URL(rawAppUrl).origin
}

function portFromAppUrl(rawAppUrl) {
  const url = new URL(rawAppUrl)
  if (url.port) return Number(url.port)
  return url.protocol === "https:" ? 443 : 80
}

function createReport(config) {
  return {
    version: 1,
    generatedAt: config.generatedAt.toISOString(),
    fixture: {
      path: displayPath(config.fixturePath),
      sizeBytes: 0,
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      browserName: "chromium",
      appUrl: config.editorUrl,
      appUrlSource: config.appUrlSource,
      requestedAppUrl: config.requestedAppUrl,
      appServerMode: "pending",
      ci: envTruthy("CI"),
    },
    documentStats: null,
    timings: {},
    perfEvents: [],
    paginationProfiles: [],
    react: {
      commits: [],
    },
    console: {
      errors: [],
      warnings: [],
    },
    pageErrors: [],
    readinessBreakdown: null,
    prePaginationBreakdown: null,
    documentImportBreakdown: null,
    renderBreakdown: null,
    interactionBreakdown: {
      targetLookups: [],
      scrolls: [],
      clicks: [],
    },
    result: "fail",
  }
}

function addRunnerEvent(report, name, startedAt, durationMs, detail) {
  const event = {
    name,
    startMs: Math.max(0, startedAt - runStartedAt),
    durationMs: roundMs(durationMs),
  }
  if (detail && Object.keys(detail).length > 0) event.detail = detail
  report.perfEvents.push(event)
}

async function loadBaselineFixture(fixturePath, report) {
  const startedAt = Date.now()
  let fixtureStat
  try {
    fixtureStat = await stat(fixturePath)
  } catch (error) {
    throw stageError("read-file", `Fixture file does not exist or cannot be read: ${fixturePath}`, error)
  }
  if (!fixtureStat.isFile()) {
    throw stageError("read-file", `Fixture path is not a file: ${fixturePath}`)
  }
  report.fixture.sizeBytes = fixtureStat.size

  const raw = await withStage("read-file", () => readFile(fixturePath, "utf8"))
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw stageError("parse-json", originalErrorMessage(error), error)
  }

  let doc
  try {
    doc = unwrapFlowDocDocument(parsed)
  } catch (error) {
    throw stageError("parse-flowdoc", originalErrorMessage(error), error)
  }

  report.fixture.documentId = doc.document.id
  if (doc.document.meta?.title) report.fixture.title = doc.document.meta.title
  report.documentStats = await withStage("collect-document-stats", async () => summarizeFlowDocStats(doc))
  report.timings.fixtureLoadMs = Date.now() - startedAt
  addRunnerEvent(report, "fixture:load", startedAt, report.timings.fixtureLoadMs, {
    sizeBytes: fixtureStat.size,
  })

  return { raw, parsed, doc }
}

function startNextDevServer(appUrl) {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const port = portFromAppUrl(appUrl)
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER: "none",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  child.output = []
  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.BASELINE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.BASELINE_VERBOSE === "1") process.stderr.write(text)
  })
  return child
}

async function stopNextDevServer(server) {
  if (!server || server.exitCode != null) return
  server.kill()
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function waitForServer(url, server, timeoutMs) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw stageError("start-app", [
        `App server exited before ${url} was reachable.`,
        server.output?.join("") ?? "",
      ].filter(Boolean).join("\n"))
    }

    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw stageError(
    "start-app",
    `Timed out waiting for app server at ${url}${lastError ? `: ${originalErrorMessage(lastError)}` : ""}`,
    lastError,
  )
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.once("listening", () => {
      server.close(() => resolve(true))
    })
    server.listen(port, "127.0.0.1")
  })
}

async function findAvailablePort(startPort, maxAttempts = 20) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset
    if (await portAvailable(candidate)) return candidate
  }
  throw stageError("start-app", `No available port found from ${startPort} to ${startPort + maxAttempts - 1}`)
}

async function automaticAppUrl() {
  const url = new URL(DEFAULT_APP_URL)
  const port = await findAvailablePort(portFromAppUrl(DEFAULT_APP_URL))
  url.port = String(port)
  return url.toString()
}

function existingNextDevServerUrl(server) {
  const output = server?.output?.join("") ?? ""
  if (!output.includes("Another next dev server is already running")) return null
  const matches = [...output.matchAll(/Local:\s+(http:\/\/localhost:\d+)/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}

async function startOrReuseFlowDocDevServer(appUrl, timeoutMs) {
  const server = startNextDevServer(appUrl)
  try {
    await waitForServer(editorUrlFromAppUrl(appUrl), server, timeoutMs)
    return { appUrl, server, appServerMode: "started" }
  } catch (error) {
    const existingUrl = existingNextDevServerUrl(server)
    if (!existingUrl) throw error
    await stopNextDevServer(server)
    await waitForServer(editorUrlFromAppUrl(existingUrl), null, timeoutMs)
    return { appUrl: existingUrl, server: null, appServerMode: "reused-existing-next" }
  }
}

function isMissingChromiumError(error) {
  const message = originalErrorMessage(error).toLowerCase()
  return message.includes("executable doesn't exist") &&
    message.includes("playwright") &&
    message.includes("install")
}

async function launchBaselineBrowser(config) {
  try {
    return await chromium.launch({
      headless: !envFlag("BASELINE_HEADFUL"),
      slowMo: config.slowMo,
    })
  } catch (error) {
    if (isMissingChromiumError(error)) {
      throw stageError(
        "launch-browser",
        [
          "Playwright Chromium is not installed. Run: npx playwright install chromium",
          "",
          "Original Playwright error:",
          originalErrorMessage(error),
        ].join("\n"),
        error,
      )
    }
    throw stageError("launch-browser", originalErrorMessage(error), error)
  }
}

async function waitForDoubleAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

async function readPageClockMs(page) {
  return await page.evaluate(() => performance.now())
}

async function waitForImportedDocument(page, documentId, timeoutMs) {
  await page.waitForFunction((expectedDocumentId) => {
    const shell = document.querySelector('[data-testid="editor-shell"]')
    return shell?.getAttribute("data-document-id") === expectedDocumentId
  }, documentId, { timeout: timeoutMs })
}

async function readShellState(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="editor-shell"]')
    return {
      documentId: shell?.getAttribute("data-document-id") ?? null,
      title: shell?.getAttribute("data-document-title") ?? null,
      previewStatus: shell?.getAttribute("data-preview-layout-status") ?? null,
      previewBlocking: shell?.getAttribute("data-preview-layout-blocking") ?? null,
      initialLoadingVisible: !!document.querySelector('[data-testid="initial-layout-loading"]'),
      visiblePages: document.querySelectorAll('[data-testid="editor-page-frame"][data-page-rendered="true"]').length,
      paragraphSurfaces: document.querySelectorAll('[data-testid="editor-fragment"][data-node-type="paragraph"]').length,
      activeInlineEditNodeId: document.querySelector("[data-inline-edit-node-id]")?.getAttribute("data-inline-edit-node-id") ?? null,
    }
  })
}

async function readStorageState(page) {
  return await page.evaluate((storageKey) => ({
    storedLength: localStorage.getItem(storageKey)?.length ?? 0,
    storageError: window.__flowDocPerformanceBaselineStorageError ?? null,
  }), STORAGE_KEY)
}

function normalizePerfEvent(event) {
  if (event?.name) {
    const normalized = {
      name: String(event.name),
    }
    if (Number.isFinite(event.startMs)) normalized.startMs = roundMs(event.startMs)
    if (Number.isFinite(event.durationMs)) normalized.durationMs = roundMs(event.durationMs)
    if (event.detail && typeof event.detail === "object") normalized.detail = event.detail
    return normalized
  }

  if (!event?.kind) return null
  const detail = {}
  for (const [key, value] of Object.entries(event)) {
    if (key === "kind" || key === "startedAt" || key === "durationMs") continue
    if (value !== undefined) detail[key] = value
  }
  return {
    name: String(event.kind),
    ...(Number.isFinite(event.startedAt) ? { startMs: roundMs(event.startedAt) } : {}),
    ...(Number.isFinite(event.durationMs) ? { durationMs: roundMs(event.durationMs) } : {}),
    ...(Object.keys(detail).length > 0 ? { detail } : {}),
  }
}

async function readBrowserPerfEvents(page) {
  const rawEvents = await page.evaluate(() => {
    const canonical = window.__FLOWDOC_PERF_EVENTS__ ?? []
    const legacy = window.__flowDocWysiwygPerfEvents ?? []
    return canonical.length > 0 ? canonical : legacy
  })
  return rawEvents.map(normalizePerfEvent).filter(Boolean)
}

function normalizeLongTask(entry) {
  if (!entry || !Number.isFinite(entry.startMs) || !Number.isFinite(entry.durationMs)) return null
  const normalized = {
    name: String(entry.name ?? "longtask"),
    startMs: roundMs(entry.startMs),
    durationMs: roundMs(entry.durationMs),
  }
  if (Array.isArray(entry.attribution) && entry.attribution.length > 0) {
    normalized.attribution = entry.attribution
      .slice(0, 4)
      .map((item) => ({
        name: String(item?.name ?? ""),
        containerType: String(item?.containerType ?? ""),
        containerName: String(item?.containerName ?? ""),
        containerSrc: String(item?.containerSrc ?? ""),
      }))
  }
  return normalized
}

async function readBrowserLongTasks(page) {
  const raw = await page.evaluate(() => ({
    entries: window.__FLOWDOC_LONG_TASKS__ ?? [],
    unavailable: window.__FLOWDOC_LONG_TASKS_UNAVAILABLE__ ?? null,
    error: window.__FLOWDOC_LONG_TASKS_ERROR__ ?? null,
  }))
  return {
    entries: raw.entries.map(normalizeLongTask).filter(Boolean),
    unavailable: raw.unavailable,
    error: raw.error,
  }
}

function reactCommitsFromPerfEvents(perfEvents) {
  return perfEvents
    .filter((event) => event.name === "editor-canvas-react-commit" || event.name === "react:commit")
    .map((event) => ({
      phase: event.detail?.source,
      actualDuration: event.durationMs,
      commitTime: event.detail?.commitTime,
      label: event.name,
    }))
}

function firstDuration(perfEvents, names) {
  const event = perfEvents.find((item) => names.includes(item.name) && Number.isFinite(item.durationMs))
  return event?.durationMs
}

function isPaginationProfile(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isFinite(value.totalMs) &&
    Array.isArray(value.stages)
}

function flattenProfileStages(stages) {
  const flattened = []
  for (const stage of stages ?? []) {
    if (!stage || typeof stage !== "object") continue
    flattened.push(stage)
    flattened.push(...flattenProfileStages(stage.children))
  }
  return flattened
}

function recomputeTopStages(profile) {
  const totalMs = Number.isFinite(profile.totalMs) ? profile.totalMs : 0
  const aggregated = new Map()
  for (const stage of flattenProfileStages(profile.stages)) {
    if (stage.name === "total" || !Number.isFinite(stage.totalMs) || stage.totalMs <= 0) continue
    const name = String(stage.name)
    const current = aggregated.get(name) ?? { name, totalMs: 0, count: 0 }
    current.totalMs += stage.totalMs
    current.count += Number.isFinite(stage.count) ? stage.count : 0
    aggregated.set(name, current)
  }
  const topStages = [...aggregated.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 8)
    .map((stage) => ({
      name: stage.name,
      totalMs: roundMs(stage.totalMs),
      percentOfPagination: totalMs > 0 ? roundMs((stage.totalMs / totalMs) * 100) : 0,
      ...(stage.count > 0 ? { count: stage.count, avgMs: roundMs(stage.totalMs / stage.count) } : {}),
    }))
  if (topStages.length > 0) profile.topStages = topStages
}

function normalizePaginationProfile(profile, source, browserRoundtripMs) {
  if (!isPaginationProfile(profile)) return null
  const normalized = JSON.parse(JSON.stringify(profile))
  normalized.source = source ?? normalized.source ?? "unknown"
  normalized.totalMs = roundMs(normalized.totalMs)
  if (Number.isFinite(browserRoundtripMs) && normalized.source === "browser") {
    const computeMs = normalized.totalMs
    const overheadMs = Math.max(0, browserRoundtripMs - computeMs)
    normalized.totalMs = roundMs(browserRoundtripMs)
    if (overheadMs > 0) {
      normalized.stages = [
        ...(normalized.stages ?? []),
        {
          name: "worker-overhead",
          totalMs: roundMs(overheadMs),
          count: 1,
          avgMs: roundMs(overheadMs),
          maxMs: roundMs(overheadMs),
          minMs: roundMs(overheadMs),
        },
      ]
      normalized.notes = [
        ...(normalized.notes ?? []),
        "worker-overhead is derived from browser pagination roundtrip minus worker compute profile.",
        "worker-overhead includes request structured-clone/postMessage, worker queue/wait, worker setup outside profiled pagination, partial-response work when present, response structured-clone/onmessage dispatch, and main-thread pagination-event summarization before state commit.",
        "worker-overhead excludes the profiled pagination compute, React state apply/render commits after the pagination event, export rendering, and report writing.",
      ]
    }
  }
  recomputeTopStages(normalized)
  return normalized
}

function addPaginationProfile(report, profile, source, browserRoundtripMs) {
  const normalized = normalizePaginationProfile(profile, source, browserRoundtripMs)
  if (!normalized) return
  report.paginationProfiles.push(normalized)
}

function collectBrowserPaginationProfiles(report, perfEvents) {
  for (const event of perfEvents) {
    const profile = event.detail?.paginationProfile
    if (!profile) continue
    if (event.detail?.source !== "document-preview-worker") continue
    addPaginationProfile(report, profile, "browser", event.durationMs)
    return
  }
}

function buildReadinessBreakdown(readinessMarks, perfEvents) {
  const paginationEvent = perfEvents.find((event) =>
    event.name === "pagination:browser" &&
    event.detail?.source === "document-preview-worker" &&
    Number.isFinite(event.startMs) &&
    Number.isFinite(event.durationMs)
  )
  const browserClock = {
    navigationCompleteMs: readinessMarks.navigationCompletePageMs,
    documentImportedMs: readinessMarks.documentImportedPageMs,
    firstVisiblePageMs: readinessMarks.firstVisiblePagePageMs,
    editorReadyMs: readinessMarks.editorReadyPageMs,
    fullReadyMs: readinessMarks.fullReadyPageMs,
  }
  if (paginationEvent) {
    browserClock.firstPaginationStartMs = roundMs(paginationEvent.startMs)
    browserClock.firstPaginationEndMs = roundMs(paginationEvent.startMs + paginationEvent.durationMs)
    browserClock.firstPaginationDurationMs = roundMs(paginationEvent.durationMs)
  }

  const gaps = {}
  if (paginationEvent && Number.isFinite(readinessMarks.firstVisiblePagePageMs)) {
    gaps.firstVisiblePageToFirstPaginationStartMs = roundMs(paginationEvent.startMs - readinessMarks.firstVisiblePagePageMs)
  }
  if (paginationEvent && Number.isFinite(readinessMarks.editorReadyPageMs)) {
    gaps.postFirstPaginationToEditorReadyMs = roundMs(readinessMarks.editorReadyPageMs - (paginationEvent.startMs + paginationEvent.durationMs))
  }
  if (Number.isFinite(readinessMarks.editorReadyPageMs) && Number.isFinite(readinessMarks.fullReadyPageMs)) {
    gaps.editorReadyToFullReadyMs = roundMs(readinessMarks.fullReadyPageMs - readinessMarks.editorReadyPageMs)
  }

  return {
    note: "Browser-clock values use performance.now() and explain why firstPaginationMs is a duration while editorReadyMs is elapsed readiness time.",
    browserClock,
    gaps,
  }
}

function firstBrowserWorkerPaginationEvent(perfEvents) {
  return perfEvents.find((event) =>
    event.name === "pagination:browser" &&
    event.detail?.source === "document-preview-worker" &&
    Number.isFinite(event.startMs) &&
    Number.isFinite(event.durationMs)
  ) ?? null
}

function addStage(stages, name, totalMs, detail = {}, kind = "span") {
  if (!Number.isFinite(totalMs)) return
  const stage = {
    name,
    totalMs: roundMs(Math.max(0, totalMs)),
    kind,
  }
  if (Object.keys(detail).length > 0) stage.detail = detail
  stages.push(stage)
}

function aggregatePrePaginationEventStages(perfEvents, firstPaginationStartMs) {
  const stageNames = new Map([
    ["pre-pagination:storage-document-load", "fixture-storage-load/parse"],
    ["pre-pagination:document-import-storage-read", "document-import-storage-read"],
    ["pre-pagination:document-import-json-parse", "document-import-json-parse"],
    ["pre-pagination:document-import-normalize-assert", "document-import-normalize-assert"],
    ["pre-pagination:document-import-field-registry-parse", "document-import-field-registry-parse"],
    ["pre-pagination:document-import-field-registry-validate", "document-import-field-registry-validate"],
    ["pre-pagination:document-import-parse-persisted-value", "document-import-parse-persisted-value"],
    ["pre-pagination:initial-document-source", "initial-document-source"],
    ["pre-pagination:document-normalize-reserved", "document-normalize-reserved"],
    ["pre-pagination:document-normalize-base-style", "document-normalize-base-style"],
    ["pre-pagination:placeholder-pagination-create", "placeholder-pagination-create"],
    ["pre-pagination:initial-editor-state-create", "document-normalized-to-editor-state"],
    ["pre-pagination:data-snapshot-create", "data-snapshot-create"],
    ["pre-pagination:field-registry-create", "field-registry-create"],
    ["pre-pagination:preview-doc-create", "previewDoc-create"],
    ["pre-pagination:editor-shell-mounted", "initial-editor-shell-mount-effect"],
    ["pre-pagination:fontkit:main-font-buffers-load", "fontkit-main-font-buffers-load"],
    ["pre-pagination:fontkit:main-measurer-create", "fontkit-main-measurer-create"],
    ["pre-pagination:fontkit:main-measurer-promise-reuse", "fontkit-main-measurer-promise-reuse"],
    ["pre-pagination:font-readiness", "font-readiness/fontkit"],
    ["pre-pagination:browser-pagination-effect-start", "browser-pagination-effect-start"],
    ["pre-pagination:browser-pagination-deferred-for-font-readiness", "browser-pagination-deferred-for-font-readiness"],
    ["pre-pagination:browser-pagination-schedule-requested", "browser-pagination-schedule-requested"],
    ["pre-pagination:browser-pagination-debounce-delay", "browser-pagination-debounce/throttle-delay"],
    ["pre-pagination:worker-create", "worker-create"],
    ["pre-pagination:worker-request-payload-built", "pagination-request-payload-built"],
    ["pre-pagination:worker-request-posted", "pagination-request-posted-to-worker"],
    ["pre-pagination:worker-response-ignored", "worker-response-ignored/stale"],
    ["pre-pagination:server-pagination-deferred-for-browser-preview", "server-pagination-deferred-for-browser-preview"],
    ["pre-pagination:server-pagination-schedule-requested", "server-pagination-schedule-requested"],
    ["pre-pagination:server-pagination-debounce-delay", "server-pagination-debounce-delay"],
    ["pre-pagination:server-pagination-request-built", "server-pagination-request-payload-built"],
    ["pre-pagination:server-pagination-response", "server-pagination-response-wait"],
  ])
  const aggregated = new Map()
  for (const event of perfEvents) {
    const stageName = stageNames.get(event.name)
    if (!stageName) continue
    if (Number.isFinite(firstPaginationStartMs) && Number.isFinite(event.startMs) && event.startMs > firstPaginationStartMs) continue
    const current = aggregated.get(stageName) ?? {
      name: stageName,
      totalMs: 0,
      count: 0,
      firstStartMs: Number.POSITIVE_INFINITY,
      lastEndMs: 0,
      intervals: [],
      samples: [],
    }
    current.count += 1
    let preWindowDurationMs = Number.isFinite(event.durationMs) ? event.durationMs : 0
    if (Number.isFinite(event.startMs)) {
      current.firstStartMs = Math.min(current.firstStartMs, event.startMs)
      if (Number.isFinite(event.durationMs)) {
        current.lastEndMs = Math.max(current.lastEndMs, event.startMs + event.durationMs)
      } else {
        current.lastEndMs = Math.max(current.lastEndMs, event.startMs)
      }
      if (Number.isFinite(firstPaginationStartMs) && Number.isFinite(event.durationMs)) {
        preWindowDurationMs = Math.max(0, Math.min(event.startMs + event.durationMs, firstPaginationStartMs) - event.startMs)
      }
    }
    if (Number.isFinite(event.startMs) && preWindowDurationMs > 0) {
      current.intervals.push([event.startMs, event.startMs + preWindowDurationMs])
    } else {
      current.totalMs += preWindowDurationMs
    }
    if (current.samples.length < 3) {
      current.samples.push({
        ...(Number.isFinite(event.startMs) ? { startMs: roundMs(event.startMs) } : {}),
        ...(Number.isFinite(event.durationMs) ? { durationMs: roundMs(event.durationMs) } : {}),
        ...(Number.isFinite(preWindowDurationMs) ? { preWindowDurationMs: roundMs(preWindowDurationMs) } : {}),
        ...(event.detail ? { detail: event.detail } : {}),
      })
    }
    aggregated.set(stageName, current)
  }

  return [...aggregated.values()].map((stage) => {
    const intervalTotalMs = totalUnionDurationMs(stage.intervals)
    return {
      name: stage.name,
      totalMs: roundMs(stage.totalMs + intervalTotalMs),
      count: stage.count,
      ...(Number.isFinite(stage.firstStartMs) ? { firstStartMs: roundMs(stage.firstStartMs) } : {}),
      ...(stage.lastEndMs > 0 ? { lastEndMs: roundMs(stage.lastEndMs) } : {}),
      ...(stage.samples.length > 0 ? { samples: stage.samples } : {}),
      kind: "instrumented",
    }
  })
}

function totalUnionDurationMs(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let currentStart = null
  let currentEnd = null
  for (const [start, end] of sorted) {
    if (currentStart == null || currentEnd == null) {
      currentStart = start
      currentEnd = end
      continue
    }
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
      continue
    }
    total += currentEnd - currentStart
    currentStart = start
    currentEnd = end
  }
  if (currentStart != null && currentEnd != null) total += currentEnd - currentStart
  return total
}

function summarizeLongTasks(longTaskReadout, firstPaginationStartMs) {
  const entries = longTaskReadout?.entries ?? []
  const prePaginationEntries = entries
    .filter((entry) => !Number.isFinite(firstPaginationStartMs) || entry.startMs < firstPaginationStartMs)
    .map((entry) => {
      if (!Number.isFinite(firstPaginationStartMs)) return entry
      const endMs = entry.startMs + entry.durationMs
      if (endMs <= firstPaginationStartMs) return entry
      return { ...entry, durationMs: roundMs(firstPaginationStartMs - entry.startMs) }
    })
    .filter((entry) => entry.durationMs > 0)
  const totalMs = prePaginationEntries.reduce((sum, entry) => sum + entry.durationMs, 0)
  const top = [...prePaginationEntries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8)
  return {
    count: prePaginationEntries.length,
    totalMs: roundMs(totalMs),
    maxMs: top.length > 0 ? top[0].durationMs : 0,
    top,
    ...(longTaskReadout?.unavailable ? { unavailable: longTaskReadout.unavailable } : {}),
    ...(longTaskReadout?.error ? { error: longTaskReadout.error } : {}),
  }
}

function summarizeIgnoredWorkerResponses(perfEvents) {
  const events = perfEvents.filter((event) => event.name === "pre-pagination:worker-response-ignored")
  const byReason = {}
  for (const event of events) {
    const reason = String(event.detail?.reason ?? "unknown")
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }
  return {
    count: events.length,
    byReason,
    samples: events.slice(0, 6).map((event) => ({
      ...(Number.isFinite(event.startMs) ? { startMs: roundMs(event.startMs) } : {}),
      ...(event.detail ? { detail: event.detail } : {}),
    })),
  }
}

function buildPrePaginationBreakdown(readinessMarks, perfEvents, longTaskReadout, report) {
  const paginationEvent = firstBrowserWorkerPaginationEvent(perfEvents)
  const firstPaginationStartMs = paginationEvent?.startMs
  const firstWorkerRequestPost = perfEvents.find((event) =>
    event.name === "pre-pagination:worker-request-posted" &&
    Number.isFinite(event.startMs)
  )
  const stages = []
  const notes = [
    "Browser-clock values use performance.now(). Gap stages are elapsed windows and may contain instrumented child spans.",
    "Long tasks come from the browser PerformanceObserver longtask API when available.",
    "fixture-load is measured by the Node runner before browser navigation and is not on the browser performance.now() clock.",
  ]

  addStage(stages, "fixture-load", report?.timings?.fixtureLoadMs, {
    clock: "runner",
  }, "runner")

  if (Number.isFinite(firstPaginationStartMs)) {
    addStage(stages, "navigation-start-to-pagination-start", firstPaginationStartMs, {}, "gap")
    if (Number.isFinite(firstWorkerRequestPost?.startMs)) {
      addStage(
        stages,
        "first-worker-request-posted-to-committed-pagination-start",
        firstPaginationStartMs - firstWorkerRequestPost.startMs,
        {},
        "gap",
      )
    }
    if (Number.isFinite(readinessMarks.navigationCompletePageMs)) {
      addStage(
        stages,
        "navigation-complete-to-pagination-start",
        firstPaginationStartMs - readinessMarks.navigationCompletePageMs,
        {},
        "gap",
      )
    }
    if (Number.isFinite(readinessMarks.documentImportedPageMs)) {
      addStage(
        stages,
        "document-imported-to-pagination-start",
        firstPaginationStartMs - readinessMarks.documentImportedPageMs,
        {},
        "gap",
      )
    }
    if (Number.isFinite(readinessMarks.firstVisiblePagePageMs)) {
      addStage(
        stages,
        "first-visible-page-to-pagination-start",
        firstPaginationStartMs - readinessMarks.firstVisiblePagePageMs,
        {},
        "gap",
      )
    }
  }

  if (Number.isFinite(readinessMarks.navigationCompletePageMs) && Number.isFinite(readinessMarks.documentImportedPageMs)) {
    addStage(
      stages,
      "navigation-complete-to-document-imported",
      readinessMarks.documentImportedPageMs - readinessMarks.navigationCompletePageMs,
      {},
      "gap",
    )
  }
  if (Number.isFinite(readinessMarks.documentImportedPageMs) && Number.isFinite(readinessMarks.firstVisiblePagePageMs)) {
    addStage(
      stages,
      "document-imported-to-first-visible-page",
      readinessMarks.firstVisiblePagePageMs - readinessMarks.documentImportedPageMs,
      {},
      "gap",
    )
  }

  stages.push(...aggregatePrePaginationEventStages(perfEvents, firstPaginationStartMs))

  const workerTiming = paginationEvent?.detail?.workerTiming
  let workerBoundary = null
  if (workerTiming && typeof workerTiming === "object") {
    workerBoundary = {
      note: "Worker timing starts after the main thread posts the pagination request; these durations explain the pagination roundtrip, not the pre-request wait.",
      receivedAtMs: Number.isFinite(workerTiming.receivedAtMs) ? roundMs(workerTiming.receivedAtMs) : null,
      receiveToComputeStartMs: Number.isFinite(workerTiming.computeStartAfterReceiveMs)
        ? roundMs(workerTiming.computeStartAfterReceiveMs)
        : null,
      measurerFontkitResolveMs: Number.isFinite(workerTiming.resolveMeasurerMs)
        ? roundMs(workerTiming.resolveMeasurerMs)
        : null,
      partialResponseBuildMs: Number.isFinite(workerTiming.partialResponseMs)
        ? roundMs(workerTiming.partialResponseMs)
        : null,
      paginationComputeMs: Number.isFinite(workerTiming.computeMs) ? roundMs(workerTiming.computeMs) : null,
      successResponseBuildMs: Number.isFinite(workerTiming.responseBuildMs) ? roundMs(workerTiming.responseBuildMs) : null,
      totalBeforeSuccessPostMs: Number.isFinite(workerTiming.totalBeforeSuccessPostMs)
        ? roundMs(workerTiming.totalBeforeSuccessPostMs)
        : null,
    }
  } else {
    notes.push("Worker receive/compute boundary timing is unavailable for this run.")
  }

  const longTasks = summarizeLongTasks(longTaskReadout, firstPaginationStartMs)
  const ignoredWorkerResponses = summarizeIgnoredWorkerResponses(perfEvents)
  if (longTasks.unavailable) notes.push(longTasks.unavailable)
  if (longTasks.error) notes.push(`Long task observer error: ${longTasks.error}`)
  if (longTasks.totalMs > 0) {
    addStage(stages, "main-thread-long-tasks-before-pagination", longTasks.totalMs, {
      count: longTasks.count,
      maxMs: longTasks.maxMs,
    }, "longtask")
  }

  const topStages = stages
    .filter((stage) => Number.isFinite(stage.totalMs) && stage.totalMs > 0)
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10)
    .map((stage) => ({
      name: stage.name,
      totalMs: stage.totalMs,
      kind: stage.kind,
      ...(stage.count ? { count: stage.count } : {}),
      ...(Number.isFinite(firstPaginationStartMs) && firstPaginationStartMs > 0
        ? { percentOfPreNavigationToPaginationStart: roundMs((stage.totalMs / firstPaginationStartMs) * 100) }
        : {}),
    }))

  return {
    version: 1,
    preNavigationToPaginationStartMs: Number.isFinite(firstPaginationStartMs) ? roundMs(firstPaginationStartMs) : null,
    navigationCompleteToPaginationStartMs: (
      Number.isFinite(firstPaginationStartMs) && Number.isFinite(readinessMarks.navigationCompletePageMs)
    ) ? roundMs(firstPaginationStartMs - readinessMarks.navigationCompletePageMs) : null,
    documentImportedToPaginationStartMs: (
      Number.isFinite(firstPaginationStartMs) && Number.isFinite(readinessMarks.documentImportedPageMs)
    ) ? roundMs(firstPaginationStartMs - readinessMarks.documentImportedPageMs) : null,
    firstVisiblePageToPaginationStartMs: (
      Number.isFinite(firstPaginationStartMs) && Number.isFinite(readinessMarks.firstVisiblePagePageMs)
    ) ? roundMs(firstPaginationStartMs - readinessMarks.firstVisiblePagePageMs) : null,
    markers: {
      navigationCompleteMs: readinessMarks.navigationCompletePageMs ?? null,
      fixtureLoadedMs: Number.isFinite(report?.timings?.fixtureLoadMs) ? roundMs(report.timings.fixtureLoadMs) : null,
      documentImportedMs: readinessMarks.documentImportedPageMs ?? null,
      firstVisiblePageMs: readinessMarks.firstVisiblePagePageMs ?? null,
      firstWorkerRequestPostedMs: Number.isFinite(firstWorkerRequestPost?.startMs)
        ? roundMs(firstWorkerRequestPost.startMs)
        : null,
      paginationRequestStartMs: Number.isFinite(firstPaginationStartMs) ? roundMs(firstPaginationStartMs) : null,
      firstWorkerRequestPostedToCommittedPaginationStartMs: (
        Number.isFinite(firstPaginationStartMs) && Number.isFinite(firstWorkerRequestPost?.startMs)
      ) ? roundMs(firstPaginationStartMs - firstWorkerRequestPost.startMs) : null,
      workerComputeStartAfterReceiveMs: workerBoundary?.receiveToComputeStartMs ?? null,
    },
    stages,
    workerBoundary,
    topStages,
    longTasks,
    ignoredWorkerResponses,
    notes,
  }
}

function aggregateNamedEvents(perfEvents, eventNames) {
  const aggregated = new Map()
  for (const event of perfEvents) {
    if (!eventNames.has(event.name)) continue
    const current = aggregated.get(event.name) ?? {
      name: event.name,
      totalMs: 0,
      count: 0,
      maxMs: 0,
      samples: [],
    }
    current.count += 1
    if (Number.isFinite(event.durationMs)) {
      current.totalMs += event.durationMs
      current.maxMs = Math.max(current.maxMs, event.durationMs)
    }
    if (current.samples.length < 6) {
      current.samples.push({
        ...(Number.isFinite(event.startMs) ? { startMs: roundMs(event.startMs) } : {}),
        ...(Number.isFinite(event.durationMs) ? { durationMs: roundMs(event.durationMs) } : {}),
        ...(event.detail ? { detail: event.detail } : {}),
      })
    }
    aggregated.set(event.name, current)
  }
  return [...aggregated.values()]
    .map((item) => ({
      ...item,
      totalMs: roundMs(item.totalMs),
      avgMs: item.count > 0 ? roundMs(item.totalMs / item.count) : 0,
      maxMs: roundMs(item.maxMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

function buildDocumentImportBreakdown(perfEvents) {
  const names = new Set([
    "pre-pagination:document-import-storage-read",
    "pre-pagination:document-import-json-parse",
    "pre-pagination:document-import-normalize-assert",
    "pre-pagination:document-import-field-registry-parse",
    "pre-pagination:document-import-field-registry-validate",
    "pre-pagination:document-import-parse-persisted-value",
    "pre-pagination:storage-document-load",
    "pre-pagination:initial-editor-state-create",
    "pre-pagination:data-snapshot-create",
    "pre-pagination:field-registry-create",
    "pre-pagination:document-normalize-reserved",
    "pre-pagination:document-normalize-base-style",
    "pre-pagination:placeholder-pagination-create",
  ])
  const stages = aggregateNamedEvents(perfEvents, names)
  const countFor = (name) => stages.find((stage) => stage.name === name)?.count ?? 0
  const initialEditorStateRuns = countFor("pre-pagination:initial-editor-state-create")
  const dataSnapshotRuns = countFor("pre-pagination:data-snapshot-create")
  const fieldRegistryRuns = countFor("pre-pagination:field-registry-create")
  const storageParseRuns = countFor("pre-pagination:document-import-json-parse")
  const notes = [
    "Counts are from browser perf markers captured during the initial editor load.",
    "Repeated lazy-initializer work here indicates repeated render/init attempts before the first committed editor-ready path; the report records observed counts but does not change the document import model.",
  ]
  if (initialEditorStateRuns > 1 || dataSnapshotRuns > 1 || fieldRegistryRuns > 1) {
    notes.push("The editor currently has separate initial storage/parse paths for document state, data snapshot, and field registry; dev render replay can multiply those paths.")
  }

  return {
    version: 1,
    initialEditorStateRuns,
    dataSnapshotRuns,
    fieldRegistryRuns,
    storageParseRuns,
    stages,
    topStages: stages.slice(0, 8).map((stage) => ({
      name: stage.name,
      totalMs: stage.totalMs,
      count: stage.count,
      avgMs: stage.avgMs,
      maxMs: stage.maxMs,
    })),
    notes,
  }
}

function buildRenderBreakdown(perfEvents, firstPaginationStartMs) {
  const commits = perfEvents.filter((event) =>
    (event.name === "react:commit" || event.name === "react:subtree-commit") &&
    Number.isFinite(event.startMs)
  )
  const byId = new Map()
  for (const event of commits) {
    const id = event.name === "react:commit"
      ? "editor-canvas"
      : String(event.detail?.id ?? "unknown")
    const current = byId.get(id) ?? {
      id,
      totalMs: 0,
      count: 0,
      maxMs: 0,
      beforePaginationMs: 0,
      beforePaginationCount: 0,
      samples: [],
    }
    const durationMs = Number.isFinite(event.durationMs) ? event.durationMs : 0
    current.totalMs += durationMs
    current.count += 1
    current.maxMs = Math.max(current.maxMs, durationMs)
    if (Number.isFinite(firstPaginationStartMs) && event.startMs < firstPaginationStartMs) {
      current.beforePaginationMs += durationMs
      current.beforePaginationCount += 1
    }
    if (current.samples.length < 5) {
      current.samples.push({
        startMs: roundMs(event.startMs),
        durationMs: roundMs(durationMs),
        phase: event.detail?.source,
        commitTime: event.detail?.commitTime,
      })
    }
    byId.set(id, current)
  }
  const subtrees = [...byId.values()]
    .map((item) => ({
      id: item.id,
      totalMs: roundMs(item.totalMs),
      count: item.count,
      maxMs: roundMs(item.maxMs),
      beforePaginationMs: roundMs(item.beforePaginationMs),
      beforePaginationCount: item.beforePaginationCount,
      samples: item.samples,
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
  return {
    version: 1,
    subtrees,
    topBeforePagination: [...subtrees]
      .filter((item) => item.beforePaginationMs > 0)
      .sort((a, b) => b.beforePaginationMs - a.beforePaginationMs)
      .slice(0, 6),
  }
}

function intervalOverlapMs(startA, endA, startB, endB) {
  if (![startA, endA, startB, endB].every(Number.isFinite)) return 0
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))
}

function summarizeEventsInInterval(events, startMs, endMs) {
  const overlapped = events.filter((event) => {
    const eventStart = event.startMs
    const eventEnd = event.startMs + (Number.isFinite(event.durationMs) ? event.durationMs : 0)
    return intervalOverlapMs(startMs, endMs, eventStart, eventEnd || eventStart) > 0 ||
      (Number.isFinite(eventStart) && eventStart >= startMs && eventStart <= endMs)
  })
  const totalMs = overlapped.reduce((sum, event) => sum + (Number.isFinite(event.durationMs) ? event.durationMs : 0), 0)
  const sorted = [...overlapped]
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 6)
    .map((event) => ({
      name: event.name,
      startMs: event.startMs,
      durationMs: event.durationMs,
      detail: event.detail,
    }))
  return {
    count: overlapped.length,
    totalMs: roundMs(totalMs),
    top: sorted,
  }
}

function buildInteractionBreakdown(report, perfEvents, longTaskReadout) {
  const raw = report.interactionBreakdown ?? { targetLookups: [], scrolls: [], clicks: [] }
  const longTasks = longTaskReadout?.entries ?? []
  const reactEvents = perfEvents.filter((event) => event.name === "react:commit" || event.name === "react:subtree-commit")
  const inlineEvents = perfEvents.filter((event) => String(event.name).startsWith("inline-edit"))

  const withIntervalSummaries = (items) => items.map((item) => {
    const startMs = item.pageStartMs
    const endMs = item.pageEndMs
    return {
      ...item,
      ...(Number.isFinite(startMs) && Number.isFinite(endMs) ? {
        longTasks: summarizeEventsInInterval(longTasks, startMs, endMs),
        reactCommits: summarizeEventsInInterval(reactEvents, startMs, endMs),
        inlineEditEvents: summarizeEventsInInterval(inlineEvents, startMs, endMs),
      } : {}),
    }
  })

  const clicks = withIntervalSummaries(raw.clicks ?? [])
  const scrolls = withIntervalSummaries(raw.scrolls ?? [])
  const targetLookups = raw.targetLookups ?? []
  return {
    version: 1,
    targetLookups,
    scrolls,
    clicks,
    topInteractionCosts: [
      ...clicks.map((item) => ({ kind: "click", stage: item.stage, durationMs: item.durationMs })),
      ...scrolls.map((item) => ({ kind: "scroll", stage: item.stage, durationMs: item.durationMs })),
      ...targetLookups.map((item) => ({ kind: "target-lookup", stage: item.stage, durationMs: item.durationMs })),
    ]
      .filter((item) => Number.isFinite(item.durationMs))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 8),
    notes: [
      "Interaction intervals use browser performance.now() when possible so long tasks and React commits can be correlated with runner timings.",
    ],
  }
}

function metricPathValue(source, pathParts) {
  let current = source
  for (const part of pathParts) {
    if (current == null || typeof current !== "object") return null
    current = current[part]
  }
  return Number.isFinite(current) ? current : null
}

function compareMetric(before, after, path, label) {
  const pathParts = path.split(".")
  const beforeValue = metricPathValue(before, pathParts)
  const afterValue = metricPathValue(after, pathParts)
  return {
    label,
    before: beforeValue,
    after: afterValue,
    deltaMs: Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? roundMs(afterValue - beforeValue)
      : null,
    improvementMs: Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? roundMs(beforeValue - afterValue)
      : null,
  }
}

async function attachBaselineComparison(report, compareReportInput) {
  if (!compareReportInput) return
  const compareReportPath = path.resolve(repoRoot, compareReportInput)
  let before
  try {
    before = JSON.parse(await readFile(compareReportPath, "utf8"))
  } catch (error) {
    report.prePaginationComparison = {
      baselinePath: displayPath(compareReportPath),
      error: originalErrorMessage(error),
    }
    return
  }

  const beforeIgnored = before.prePaginationBreakdown?.ignoredWorkerResponses?.count
  const afterIgnored = report.prePaginationBreakdown?.ignoredWorkerResponses?.count
  report.prePaginationComparison = {
    baselinePath: displayPath(compareReportPath),
    metrics: [
      compareMetric(before, report, "timings.editorReadyMs", "editorReadyMs"),
      compareMetric(before, report, "timings.firstPaginationMs", "firstPaginationMs"),
      compareMetric(before, report, "prePaginationBreakdown.preNavigationToPaginationStartMs", "preNavigationToPaginationStartMs"),
      compareMetric(before, report, "prePaginationBreakdown.markers.firstWorkerRequestPostedToCommittedPaginationStartMs", "firstWorkerRequestPostedToCommittedPaginationStartMs"),
      compareMetric(before, report, "prePaginationBreakdown.markers.firstWorkerRequestPostedMs", "firstWorkerRequestPostedMs"),
      compareMetric(before, report, "prePaginationBreakdown.longTasks.totalMs", "longTaskTotalMs"),
    ],
    ignoredWorkerResponses: {
      before: Number.isFinite(beforeIgnored) ? beforeIgnored : null,
      after: Number.isFinite(afterIgnored) ? afterIgnored : null,
      delta: Number.isFinite(beforeIgnored) && Number.isFinite(afterIgnored)
        ? afterIgnored - beforeIgnored
        : null,
    },
    pageCount: {
      before: before.paginationProfiles?.find?.((profile) => profile.source === "browser")?.pageCount ?? null,
      after: report.paginationProfiles?.find?.((profile) => profile.source === "browser")?.pageCount ?? null,
    },
    fragmentCount: {
      before: before.paginationProfiles?.find?.((profile) => profile.source === "browser")?.fragmentCount ?? null,
      after: report.paginationProfiles?.find?.((profile) => profile.source === "browser")?.fragmentCount ?? null,
    },
  }
}

async function visibleParagraphTargets(page, excludeNodeId = null) {
  return await page.locator('[data-testid="editor-fragment"][data-node-type="paragraph"][data-inline-editable="true"]').evaluateAll((elements, excluded) => {
    const startedAt = performance.now()
    const seen = new Set()
    const targets = elements
      .map((element, index) => {
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 2, 4))
        const hit = document.elementFromPoint(x, y)
        return {
          index,
          nodeId: element.getAttribute("data-node-id"),
          pageIndex: element.getAttribute("data-page-index"),
          x,
          y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          hitTestId: hit?.getAttribute("data-testid") ?? null,
        }
      })
      .filter((item) => {
        if (!item.nodeId || item.nodeId === excluded || seen.has(item.nodeId)) return false
        seen.add(item.nodeId)
        return (
          item.width > 4 &&
          item.height > 4 &&
          item.top > 96 &&
          item.bottom < window.innerHeight - 24 &&
          item.hitTestId !== "list-toolbar"
        )
      })
      .slice(0, 8)
    return {
      pageStartMs: startedAt,
      pageEndMs: performance.now(),
      durationMs: performance.now() - startedAt,
      elementCount: elements.length,
      targetCount: targets.length,
      targets,
    }
  }, excludeNodeId)
}

async function waitForVisibleParagraphTargets(page, stage, count, timeoutMs, excludeNodeId = null, report = null) {
  const startedAt = Date.now()
  let result = { targets: [], durationMs: 0, elementCount: 0, targetCount: 0 }
  let attempts = 0
  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1
    result = await visibleParagraphTargets(page, excludeNodeId)
    if (result.targets.length >= count) {
      report?.interactionBreakdown?.targetLookups?.push({
        stage,
        attempts,
        durationMs: Date.now() - startedAt,
        pageDurationMs: roundMs(result.durationMs),
        pageStartMs: roundMs(result.pageStartMs),
        pageEndMs: roundMs(result.pageEndMs),
        elementCount: result.elementCount,
        targetCount: result.targetCount,
        excludeNodeId,
      })
      return result.targets
    }
    await page.waitForTimeout(250)
  }
  report?.interactionBreakdown?.targetLookups?.push({
    stage,
    attempts,
    durationMs: Date.now() - startedAt,
    pageDurationMs: roundMs(result.durationMs),
    elementCount: result.elementCount,
    targetCount: result.targetCount,
    excludeNodeId,
    failed: true,
  })
  throw stageError(stage, `Could not find ${count} visible paragraph surface(s). Found ${result.targets.length}.`)
}

async function scrollEditorToFraction(page, fraction) {
  return await page.evaluate(async (scrollFraction) => {
    const pageStartMs = performance.now()
    const canvas = document.querySelector('[data-testid="editor-canvas"]')
    if (!(canvas instanceof HTMLElement)) throw new Error("editor canvas not found")
    const before = {
      scrollTop: canvas.scrollTop,
      scrollHeight: canvas.scrollHeight,
      clientHeight: canvas.clientHeight,
    }
    canvas.scrollTop = Math.max(0, (canvas.scrollHeight - canvas.clientHeight) * scrollFraction)
    const afterSetMs = performance.now()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const pageEndMs = performance.now()
    return {
      fraction: scrollFraction,
      pageStartMs,
      pageEndMs,
      setScrollMs: afterSetMs - pageStartMs,
      doubleRafMs: pageEndMs - afterSetMs,
      before,
      after: {
        scrollTop: canvas.scrollTop,
        scrollHeight: canvas.scrollHeight,
        clientHeight: canvas.clientHeight,
      },
    }
  }, fraction)
}

async function waitForInlineEdit(page, nodeId, timeoutMs) {
  await page.waitForFunction((id) => (
    document.querySelector(`[data-inline-edit-node-id="${id}"]`) !== null
  ), nodeId, { timeout: timeoutMs })
}

async function clickInlineEditTarget(page, targets, stage, timeoutMs) {
  const perTargetTimeoutMs = Math.min(5000, timeoutMs)
  const failures = []
  for (const target of targets) {
    const startedAt = Date.now()
    const pageStartMs = await readPageClockMs(page)
    await withStage(stage, () => page.mouse.click(target.x, target.y))
    const afterClickMs = await readPageClockMs(page)
    try {
      await waitForInlineEdit(page, target.nodeId, perTargetTimeoutMs)
      const pageEndMs = await readPageClockMs(page)
      return {
        target,
        durationMs: Date.now() - startedAt,
        pageStartMs: roundMs(pageStartMs),
        pageEndMs: roundMs(pageEndMs),
        clickDispatchMs: roundMs(afterClickMs - pageStartMs),
        waitForInlineEditMs: roundMs(pageEndMs - afterClickMs),
      }
    } catch (error) {
      failures.push(`${target.nodeId}: ${originalErrorMessage(error)}`)
    }
  }

  throw stageError(
    stage,
    `Could not enter inline edit from ${targets.length} visible editable paragraph target(s).\n${failures.join("\n")}`,
  )
}

async function runInteractionScenario(page, report, timeoutMs) {
  const middleStartedAt = Date.now()
  const middleScroll = await withStage("scroll-to-middle", () => scrollEditorToFraction(page, 0.5))
  await waitForVisibleParagraphTargets(page, "scroll-to-middle", 2, timeoutMs, null, report)
  report.timings.scrollToMiddleMs = Date.now() - middleStartedAt
  report.interactionBreakdown.scrolls.push({
    stage: "scroll-to-middle",
    durationMs: report.timings.scrollToMiddleMs,
    ...middleScroll,
  })
  addRunnerEvent(report, "scroll:middle", middleStartedAt, report.timings.scrollToMiddleMs, {
    pageStartMs: roundMs(middleScroll.pageStartMs),
    pageEndMs: roundMs(middleScroll.pageEndMs),
    setScrollMs: roundMs(middleScroll.setScrollMs),
    doubleRafMs: roundMs(middleScroll.doubleRafMs),
  })

  const targets = await waitForVisibleParagraphTargets(page, "interaction-target", 4, timeoutMs, null, report)

  const firstClick = await clickInlineEditTarget(page, targets, "first-click-edit", timeoutMs)
  report.timings.firstClickEditMs = firstClick.durationMs
  report.interactionBreakdown.clicks.push({
    stage: "first-click-edit",
    ...firstClick,
  })
  addRunnerEvent(report, "inline-edit:enter", Date.now() - firstClick.durationMs, report.timings.firstClickEditMs, {
    nodeId: firstClick.target.nodeId,
    pageIndex: firstClick.target.pageIndex,
    pageStartMs: firstClick.pageStartMs,
    pageEndMs: firstClick.pageEndMs,
    clickDispatchMs: firstClick.clickDispatchMs,
    waitForInlineEditMs: firstClick.waitForInlineEditMs,
  })
  await waitForDoubleAnimationFrame(page)

  const switchTargets = await waitForVisibleParagraphTargets(page, "edit-switch-target", 4, timeoutMs, firstClick.target.nodeId, report)
  const editSwitch = await clickInlineEditTarget(page, switchTargets, "edit-switch", timeoutMs)
  report.timings.editSwitchMs = editSwitch.durationMs
  report.interactionBreakdown.clicks.push({
    stage: "edit-switch",
    ...editSwitch,
  })
  addRunnerEvent(report, "inline-edit:switch", Date.now() - editSwitch.durationMs, report.timings.editSwitchMs, {
    fromNodeId: firstClick.target.nodeId,
    toNodeId: editSwitch.target.nodeId,
    pageIndex: editSwitch.target.pageIndex,
    pageStartMs: editSwitch.pageStartMs,
    pageEndMs: editSwitch.pageEndMs,
    clickDispatchMs: editSwitch.clickDispatchMs,
    waitForInlineEditMs: editSwitch.waitForInlineEditMs,
  })
  await waitForDoubleAnimationFrame(page)

  const endStartedAt = Date.now()
  const endScroll = await withStage("scroll-to-end", () => scrollEditorToFraction(page, 0.98))
  await withStage("scroll-to-end", () => page.waitForSelector('[data-testid="editor-page-frame"]', { timeout: timeoutMs }))
  report.timings.scrollToEndMs = Date.now() - endStartedAt
  report.interactionBreakdown.scrolls.push({
    stage: "scroll-to-end",
    durationMs: report.timings.scrollToEndMs,
    ...endScroll,
  })
  addRunnerEvent(report, "scroll:end", endStartedAt, report.timings.scrollToEndMs, {
    pageStartMs: roundMs(endScroll.pageStartMs),
    pageEndMs: roundMs(endScroll.pageEndMs),
    setScrollMs: roundMs(endScroll.setScrollMs),
    doubleRafMs: roundMs(endScroll.doubleRafMs),
  })
}

async function runSingleExport(doc, format, report, timeoutMs, appUrl, profilePagination) {
  const startedAt = Date.now()
  addRunnerEvent(report, `export:${format}:start`, startedAt, 0)
  const response = await withStage(`export-${format}`, () => fetch(`${apiOrigin(appUrl)}/api/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doc, format, ...(profilePagination ? { profilePagination: true } : {}) }),
  }))
  const payload = await withStage(`export-${format}`, () => response.arrayBuffer())
  if (!response.ok) {
    throw stageError(
      `export-${format}`,
      `/api/export returned HTTP ${response.status}: ${Buffer.from(payload).toString("utf8").slice(0, 1000)}`,
    )
  }
  const durationMs = Date.now() - startedAt
  const profileHeader = response.headers.get(EXPORT_PROFILE_HEADER)
  let profile = null
  if (profileHeader) {
    try {
      profile = JSON.parse(profileHeader)
    } catch {
      profile = null
    }
  }
  addRunnerEvent(report, `export:${format}:end`, startedAt, durationMs, {
    byteLength: payload.byteLength,
    profile,
  })
  if (profile?.paginationProfile) addPaginationProfile(report, profile.paginationProfile, `export-${format}`)
  return { durationMs, profile }
}

async function runExportScenario(doc, report, timeoutMs, appUrl, profilePagination) {
  if (!envFlag("BASELINE_INCLUDE_EXPORT")) return
  const pdf = await runSingleExport(doc, "pdf", report, timeoutMs, appUrl, profilePagination)
  report.timings.exportPdfMs = pdf.durationMs
  const docx = await runSingleExport(doc, "docx", report, timeoutMs, appUrl, profilePagination)
  report.timings.exportDocxMs = docx.durationMs
}

function findProfileStage(profile, name) {
  return flattenProfileStages(profile?.stages).find((stage) => stage.name === name)
}

function formatStageLine(profile, stageName) {
  const stage = findProfileStage(profile, stageName)
  if (!stage) return `- ${stageName}: n/a`
  const count = Number.isFinite(stage.count) ? ` (${stage.count}x)` : ""
  return `- ${stageName}: ${stage.totalMs}ms${count}`
}

function paginationProfileSummaryLines(report) {
  const profiles = report.paginationProfiles ?? []
  if (profiles.length === 0) {
    return [
      "Pagination Profile:",
      "- unavailable (set BASELINE_PROFILE_PAGINATION=1)",
      "",
    ]
  }

  const browserProfile = profiles.find((profile) => profile.source === "browser") ?? profiles[0]
  const lines = [
    "Pagination Profile:",
    ...profiles.map((profile) => `- ${profile.source} total: ${profile.totalMs}ms${profile.pageCount ? `, pages: ${profile.pageCount}` : ""}${profile.fragmentCount ? `, fragments: ${profile.fragmentCount}` : ""}`),
    formatStageLine(browserProfile, "document-prepare"),
    formatStageLine(browserProfile, "flow-layout"),
    formatStageLine(browserProfile, "paragraph-measure"),
    formatStageLine(browserProfile, "table-measure"),
    formatStageLine(browserProfile, "page-packing"),
    formatStageLine(browserProfile, "fragment-generation"),
    formatStageLine(browserProfile, "worker-overhead"),
    "",
    "Top Pagination Costs:",
  ]
  const top = browserProfile.topStages ?? []
  if (top.length === 0) {
    lines.push("- unavailable")
  } else {
    top.slice(0, 3).forEach((stage, index) => {
      const count = Number.isFinite(stage.count) ? ` (${stage.count}x)` : ""
      lines.push(`${index + 1}. ${stage.name}: ${stage.totalMs}ms, ${stage.percentOfPagination}%${count}`)
    })
  }
  lines.push("")
  return lines
}

function readinessBreakdownSummaryLines(report) {
  const breakdown = report.readinessBreakdown
  if (!breakdown?.browserClock) return []
  const clock = breakdown.browserClock
  const gaps = breakdown.gaps ?? {}
  const line = (name, value) => `- ${name}: ${Number.isFinite(value) ? `${value}ms` : "n/a"}`
  return [
    "Readiness Breakdown:",
    line("firstPaginationStartMs", clock.firstPaginationStartMs),
    line("firstPaginationEndMs", clock.firstPaginationEndMs),
    line("postFirstPaginationToEditorReadyMs", gaps.postFirstPaginationToEditorReadyMs),
    line("editorReadyToFullReadyMs", gaps.editorReadyToFullReadyMs),
    "",
  ]
}

function prePaginationBreakdownSummaryLines(report) {
  const breakdown = report.prePaginationBreakdown
  if (!breakdown) {
    return [
      "Pre-Pagination Breakdown:",
      "- unavailable",
      "",
    ]
  }
  const line = (name, value) => `- ${name}: ${Number.isFinite(value) ? `${value}ms` : "n/a"}`
  const lines = [
    "Pre-Pagination Breakdown:",
    line("preNavigationToPaginationStartMs", breakdown.preNavigationToPaginationStartMs),
    line("navigationCompleteToPaginationStartMs", breakdown.navigationCompleteToPaginationStartMs),
    line("documentImportedToPaginationStartMs", breakdown.documentImportedToPaginationStartMs),
    line("firstVisiblePageToPaginationStartMs", breakdown.firstVisiblePageToPaginationStartMs),
    line("firstWorkerRequestPostedMs", breakdown.markers?.firstWorkerRequestPostedMs),
    line("firstWorkerRequestPostedToCommittedPaginationStartMs", breakdown.markers?.firstWorkerRequestPostedToCommittedPaginationStartMs),
    line("longTaskTotalMs", breakdown.longTasks?.totalMs),
    `- ignoredWorkerResponses: ${breakdown.ignoredWorkerResponses?.count ?? "n/a"}`,
    "",
    "Top Pre-Pagination Costs:",
  ]
  const top = breakdown.topStages ?? []
  if (top.length === 0) {
    lines.push("- unavailable")
  } else {
    top.slice(0, 5).forEach((stage, index) => {
      const count = Number.isFinite(stage.count) ? ` (${stage.count}x)` : ""
      lines.push(`${index + 1}. ${stage.name}: ${stage.totalMs}ms${count}`)
    })
  }
  lines.push("")
  return lines
}

function prePaginationComparisonSummaryLines(report) {
  const comparison = report.prePaginationComparison
  if (!comparison) return []
  if (comparison.error) {
    return [
      "Pre-Pagination Before/After:",
      `- baseline: ${comparison.baselinePath}`,
      `- comparison unavailable: ${comparison.error}`,
      "",
    ]
  }

  const metricLine = (metric) => {
    const before = Number.isFinite(metric.before) ? `${metric.before}ms` : "n/a"
    const after = Number.isFinite(metric.after) ? `${metric.after}ms` : "n/a"
    const improvement = Number.isFinite(metric.improvementMs)
      ? ` (${metric.improvementMs >= 0 ? "improved" : "regressed"} ${Math.abs(metric.improvementMs)}ms)`
      : ""
    return `- ${metric.label}: ${before} -> ${after}${improvement}`
  }
  const lines = [
    "Pre-Pagination Before/After:",
    `- baseline: ${comparison.baselinePath}`,
    ...(comparison.metrics ?? []).map(metricLine),
    `- ignoredWorkerResponses: ${comparison.ignoredWorkerResponses?.before ?? "n/a"} -> ${comparison.ignoredWorkerResponses?.after ?? "n/a"}`,
    `- pageCount: ${comparison.pageCount?.before ?? "n/a"} -> ${comparison.pageCount?.after ?? "n/a"}`,
    `- fragmentCount: ${comparison.fragmentCount?.before ?? "n/a"} -> ${comparison.fragmentCount?.after ?? "n/a"}`,
    "",
  ]
  return lines
}

function documentImportSummaryLines(report) {
  const breakdown = report.documentImportBreakdown
  if (!breakdown) return []
  const lines = [
    "Document Import / Init:",
    `- initialEditorStateRuns: ${breakdown.initialEditorStateRuns ?? "n/a"}`,
    `- dataSnapshotRuns: ${breakdown.dataSnapshotRuns ?? "n/a"}`,
    `- fieldRegistryRuns: ${breakdown.fieldRegistryRuns ?? "n/a"}`,
    `- storageParseRuns: ${breakdown.storageParseRuns ?? "n/a"}`,
    "Top Import Costs:",
  ]
  const top = breakdown.topStages ?? []
  if (top.length === 0) {
    lines.push("- unavailable")
  } else {
    top.slice(0, 5).forEach((stage, index) => {
      lines.push(`${index + 1}. ${stage.name}: ${stage.totalMs}ms (${stage.count}x)`)
    })
  }
  lines.push("")
  return lines
}

function renderBreakdownSummaryLines(report) {
  const breakdown = report.renderBreakdown
  if (!breakdown) return []
  const top = breakdown.topBeforePagination ?? []
  const lines = [
    "Render Breakdown:",
  ]
  if (top.length === 0) {
    lines.push("- before pagination: unavailable")
  } else {
    top.slice(0, 5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.id}: ${item.beforePaginationMs}ms before pagination (${item.beforePaginationCount} commits)`)
    })
  }
  lines.push("")
  return lines
}

function interactionBreakdownSummaryLines(report) {
  const breakdown = report.interactionBreakdown
  if (!breakdown) return []
  const lines = [
    "Interaction Breakdown:",
  ]
  const top = breakdown.topInteractionCosts ?? []
  if (top.length === 0) {
    lines.push("- unavailable")
  } else {
    top.slice(0, 6).forEach((item, index) => {
      lines.push(`${index + 1}. ${item.stage} (${item.kind}): ${item.durationMs}ms`)
    })
  }
  const firstClick = breakdown.clicks?.find((item) => item.stage === "first-click-edit")
  const editSwitch = breakdown.clicks?.find((item) => item.stage === "edit-switch")
  const endScroll = breakdown.scrolls?.find((item) => item.stage === "scroll-to-end")
  if (firstClick) lines.push(`- first-click waitForInlineEditMs: ${firstClick.waitForInlineEditMs ?? "n/a"}ms, reactCommitMs: ${firstClick.reactCommits?.totalMs ?? "n/a"}ms`)
  if (editSwitch) lines.push(`- edit-switch waitForInlineEditMs: ${editSwitch.waitForInlineEditMs ?? "n/a"}ms, reactCommitMs: ${editSwitch.reactCommits?.totalMs ?? "n/a"}ms`)
  if (endScroll) lines.push(`- scroll-to-end doubleRafMs: ${Number.isFinite(endScroll.doubleRafMs) ? roundMs(endScroll.doubleRafMs) : "n/a"}ms, longTaskMs: ${endScroll.longTasks?.totalMs ?? "n/a"}ms`)
  lines.push("")
  return lines
}

function summaryText(report) {
  const stats = report.documentStats ?? {}
  const timings = report.timings ?? {}
  const line = (name, value) => `- ${name}: ${value ?? "n/a"}`
  return [
    "FlowDoc Performance Baseline",
    "",
    `Fixture: ${path.basename(report.fixture.path)}`,
    `Result: ${report.result}`,
    "",
    "Document:",
    line("totalNodes", stats.totalNodes),
    line("paragraphs", stats.paragraphs),
    line("flowTables", stats.flowTables),
    line("flowTableRows", stats.flowTableRows),
    line("flowTableCells", stats.flowTableCells),
    "",
    "Timings:",
    line("editorReadyMs", timings.editorReadyMs),
    line("fullReadyMs", timings.fullReadyMs),
    line("firstClickEditMs", timings.firstClickEditMs),
    line("editSwitchMs", timings.editSwitchMs),
    line("scrollToMiddleMs", timings.scrollToMiddleMs),
    line("scrollToEndMs", timings.scrollToEndMs),
    "",
    ...documentImportSummaryLines(report),
    ...renderBreakdownSummaryLines(report),
    ...interactionBreakdownSummaryLines(report),
    ...prePaginationBreakdownSummaryLines(report),
    ...prePaginationComparisonSummaryLines(report),
    ...readinessBreakdownSummaryLines(report),
    ...paginationProfileSummaryLines(report),
    "Errors:",
    line("consoleErrors", report.console.errors.length),
    line("pageErrors", report.pageErrors.length),
    "",
  ].join("\n")
}

async function writeReports(report, outputDir, generatedAt) {
  const startedAt = Date.now()
  await mkdir(outputDir, { recursive: true })
  const timestampedPath = path.join(outputDir, `perf-baseline-${timestampForFile(generatedAt)}.json`)
  const latestPath = path.join(outputDir, "latest.json")
  const summaryPath = path.join(outputDir, "latest-summary.txt")
  const json = `${JSON.stringify(report, null, 2)}\n`
  await writeFile(timestampedPath, json, "utf8")
  await copyFile(timestampedPath, latestPath)
  await writeFile(summaryPath, summaryText(report), "utf8")
  addRunnerEvent(report, "report:write", startedAt, Date.now() - startedAt, {
    latestPath: displayPath(latestPath),
    timestampedPath: displayPath(timestampedPath),
  })
  const finalJson = `${JSON.stringify(report, null, 2)}\n`
  await writeFile(timestampedPath, finalJson, "utf8")
  await copyFile(timestampedPath, latestPath)
  await writeFile(summaryPath, summaryText(report), "utf8")
  return { latestPath, timestampedPath, summaryPath }
}

function formatFixtureFailure(error, fixturePath) {
  return [
    "Failed to load baseline fixture:",
    `path: ${fixturePath}`,
    `stage: ${error.stage}`,
    `error: ${originalErrorMessage(error)}`,
  ].join("\n")
}

function formatBaselineFailure(error, fixturePath) {
  if (["read-file", "parse-json", "parse-flowdoc", "collect-document-stats"].includes(error.stage)) {
    return formatFixtureFailure(error, fixturePath)
  }
  return [
    "FlowDoc performance baseline failed:",
    `stage: ${error.stage}`,
    `error: ${error.message}`,
  ].join("\n")
}

async function runBaseline() {
  const generatedAt = new Date()
  const fixtureInput = process.env.BASELINE_FLOWDOC_FILE ?? DEFAULT_BASELINE_FILE
  const fixturePath = path.resolve(repoRoot, fixtureInput)
  const baselineAppUrl = process.env.BASELINE_APP_URL
  let appUrl = baselineAppUrl ?? await automaticAppUrl()
  const appUrlSource = baselineAppUrl ? "env" : "automatic"
  const profilePagination = envFlag("BASELINE_PROFILE_PAGINATION")
  let editorUrl = editorUrlFromAppUrl(appUrl, profilePagination)
  const outputDir = path.resolve(repoRoot, process.env.BASELINE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR)
  const includeExport = envFlag("BASELINE_INCLUDE_EXPORT")
  const timeoutMs = finiteNumber(
    process.env.BASELINE_TIMEOUT_MS,
    includeExport ? DEFAULT_EXPORT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
  )
  const slowMo = finiteNumber(process.env.BASELINE_SLOW_MO, 0)
  const allowConsoleErrors = envFlag("BASELINE_ALLOW_CONSOLE_ERRORS")
  const compareReportInput = process.env.BASELINE_COMPARE_REPORT
  const report = createReport({
    generatedAt,
    fixturePath,
    editorUrl,
    appUrlSource,
    requestedAppUrl: appUrl,
  })
  let fixture = null
  let server = null
  let browser = null
  let reportPaths = null

  try {
    fixture = await loadBaselineFixture(fixturePath, report)

    if (baselineAppUrl) {
      await withStage("connect-existing-app", () => waitForServer(editorUrl, null, Math.min(timeoutMs, SERVER_START_TIMEOUT_MS)))
      report.environment.appServerMode = "external"
    } else {
      const started = await withStage("start-app", () => startOrReuseFlowDocDevServer(appUrl, SERVER_START_TIMEOUT_MS))
      appUrl = started.appUrl
      editorUrl = editorUrlFromAppUrl(appUrl, profilePagination)
      report.environment.appUrl = editorUrl
      report.environment.appServerMode = started.appServerMode
      server = started.server
    }

    browser = await launchBaselineBrowser({ slowMo })
    report.environment.browserVersion = browser.version()
    const readinessMarks = {}

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript(({ rawDocument, storageKey, perfTraceStorageKey, paginationProfileStorageKey, profilePaginationEnabled }) => {
      if (location.origin === "null") return
      try {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(storageKey, rawDocument)
        localStorage.setItem(perfTraceStorageKey, "1")
        if (profilePaginationEnabled) localStorage.setItem(paginationProfileStorageKey, "1")
        window.__flowDocWysiwygPerfTraceEnabled = true
        window.__flowDocPaginationProfileEnabled = profilePaginationEnabled
        window.__FLOWDOC_PERF_EVENTS__ = window.__FLOWDOC_PERF_EVENTS__ ?? []
        window.__FLOWDOC_LONG_TASKS__ = []
        try {
          const supported = Array.isArray(PerformanceObserver.supportedEntryTypes)
            ? PerformanceObserver.supportedEntryTypes.includes("longtask")
            : true
          if (!supported) {
            window.__FLOWDOC_LONG_TASKS_UNAVAILABLE__ = "Long Task API is not available in this browser context."
          } else {
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                window.__FLOWDOC_LONG_TASKS__.push({
                  name: entry.name,
                  startMs: entry.startTime,
                  durationMs: entry.duration,
                  attribution: Array.from(entry.attribution ?? []).map((item) => ({
                    name: item.name,
                    containerType: item.containerType,
                    containerName: item.containerName,
                    containerSrc: item.containerSrc,
                  })),
                })
              }
              if (window.__FLOWDOC_LONG_TASKS__.length > 200) {
                window.__FLOWDOC_LONG_TASKS__ = window.__FLOWDOC_LONG_TASKS__.slice(-200)
              }
            })
            observer.observe({ type: "longtask", buffered: true })
            window.__FLOWDOC_LONG_TASKS_OBSERVER__ = observer
          }
        } catch (error) {
          window.__FLOWDOC_LONG_TASKS_ERROR__ = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`
        }
      } catch (error) {
        window.__flowDocPerformanceBaselineStorageError = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`
      }
    }, {
      rawDocument: fixture.raw,
      storageKey: STORAGE_KEY,
      perfTraceStorageKey: PERF_TRACE_STORAGE_KEY,
      paginationProfileStorageKey: PAGINATION_PROFILE_STORAGE_KEY,
      profilePaginationEnabled: profilePagination,
    })

    const page = await context.newPage()
    page.on("pageerror", (error) => report.pageErrors.push(error.message))
    page.on("crash", () => report.pageErrors.push("page crashed"))
    page.on("console", (message) => {
      if (message.type() === "error") report.console.errors.push(message.text())
      if (message.type() === "warning") report.console.warnings.push(message.text())
    })

    const navigationStartedAt = Date.now()
    await withStage("navigation", () => page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs }))
    report.timings.navigationMs = Date.now() - navigationStartedAt
    readinessMarks.navigationCompletePageMs = roundMs(await readPageClockMs(page))
    addRunnerEvent(report, "navigation:complete", navigationStartedAt, report.timings.navigationMs)

    await withStage("editor-shell-rendered", () => page.waitForSelector('[data-testid="editor-shell"]', { timeout: timeoutMs }))

    const storageState = await withStage("fixture-storage", () => readStorageState(page))
    if (storageState.storageError) {
      throw stageError("fixture-storage", `Could not store baseline fixture in localStorage: ${storageState.storageError}`)
    }

    await withStage("import-editor", () => waitForImportedDocument(page, fixture.doc.document.id, timeoutMs))
    readinessMarks.documentImportedPageMs = roundMs(await readPageClockMs(page))
    addRunnerEvent(report, "document:imported", navigationStartedAt, Date.now() - navigationStartedAt, {
      documentId: fixture.doc.document.id,
      storedLength: storageState.storedLength,
    })

    await withStage("first-visible-page", () => page.waitForSelector('[data-testid="editor-page-frame"][data-page-rendered="true"]', { timeout: timeoutMs }))
    report.timings.firstVisiblePageMs = Date.now() - navigationStartedAt
    readinessMarks.firstVisiblePagePageMs = roundMs(await readPageClockMs(page))
    addRunnerEvent(report, "render:visible-pages:end", navigationStartedAt, report.timings.firstVisiblePageMs)

    await withStage("wait-editor-ready", () => page.waitForFunction(() => (
      document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-blocking") === "false"
    ), null, { timeout: timeoutMs }))
    report.timings.editorReadyMs = Date.now() - navigationStartedAt
    readinessMarks.editorReadyPageMs = roundMs(await readPageClockMs(page))
    addRunnerEvent(report, "editor:ready", navigationStartedAt, report.timings.editorReadyMs)

    await withStage("first-pagination", () => page.waitForFunction(() => (
      document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-status") === "full"
    ), null, { timeout: timeoutMs }))
    await waitForDoubleAnimationFrame(page)
    report.timings.fullReadyMs = Date.now() - navigationStartedAt
    readinessMarks.fullReadyPageMs = roundMs(await readPageClockMs(page))

    await runInteractionScenario(page, report, timeoutMs)
    await runExportScenario(fixture.doc, report, timeoutMs, appUrl, profilePagination)

    const shell = await readShellState(page)
    if (shell.previewStatus !== "full") {
      throw stageError("first-pagination", `Editor did not remain fully paginated. Current status: ${shell.previewStatus}`)
    }
    if (report.pageErrors.length > 0) {
      throw stageError("page-error", report.pageErrors.join("\n"))
    }
    if (report.console.errors.length > 0 && !allowConsoleErrors) {
      throw stageError("console-error", report.console.errors.join("\n"))
    }

    const browserPerfEvents = await readBrowserPerfEvents(page)
    const browserLongTasks = await readBrowserLongTasks(page)
    report.perfEvents.push(...browserPerfEvents)
    collectBrowserPaginationProfiles(report, browserPerfEvents)
    report.readinessBreakdown = buildReadinessBreakdown(readinessMarks, browserPerfEvents)
    report.prePaginationBreakdown = buildPrePaginationBreakdown(readinessMarks, browserPerfEvents, browserLongTasks, report)
    report.documentImportBreakdown = buildDocumentImportBreakdown(browserPerfEvents)
    report.renderBreakdown = buildRenderBreakdown(
      browserPerfEvents,
      firstBrowserWorkerPaginationEvent(browserPerfEvents)?.startMs,
    )
    report.interactionBreakdown = buildInteractionBreakdown(report, browserPerfEvents, browserLongTasks)
    report.react = {
      commits: reactCommitsFromPerfEvents(report.perfEvents),
    }
    const firstPaginationMs = firstDuration(report.perfEvents, [
      "browser-preview-pagination",
      "pagination:browser",
      "pagination:browser:end",
    ])
    if (firstPaginationMs != null) report.timings.firstPaginationMs = firstPaginationMs

    await attachBaselineComparison(report, compareReportInput)
    report.result = "pass"
  } catch (error) {
    const failure = toBaselineError("baseline", error)
    report.result = "fail"
    report.failure = {
      stage: failure.stage,
      message: failure.message,
      stack: failure.stack,
    }
    throw failure
  } finally {
    await browser?.close()
    await stopNextDevServer(server)
    try {
      reportPaths = await writeReports(report, outputDir, generatedAt)
    } catch (error) {
      const wrapped = toBaselineError("write-report", error)
      if (report.result === "pass") throw wrapped
      console.error(formatBaselineFailure(wrapped, fixturePath))
    }
  }

  return { report, reportPaths }
}

runBaseline()
  .then(({ report, reportPaths }) => {
    console.log(JSON.stringify({
      result: report.result,
      latestReport: displayPath(reportPaths.latestPath),
      timestampedReport: displayPath(reportPaths.timestampedPath),
      summary: displayPath(reportPaths.summaryPath),
      sample: {
        editorReadyMs: report.timings.editorReadyMs,
        fullReadyMs: report.timings.fullReadyMs,
        firstClickEditMs: report.timings.firstClickEditMs,
        editSwitchMs: report.timings.editSwitchMs,
      },
    }, null, 2))
  })
  .catch((error) => {
    const failure = toBaselineError("baseline", error)
    const fixtureInput = process.env.BASELINE_FLOWDOC_FILE ?? DEFAULT_BASELINE_FILE
    const fixturePath = path.resolve(repoRoot, fixtureInput)
    console.error(formatBaselineFailure(failure, fixturePath))
    process.exit(1)
  })
