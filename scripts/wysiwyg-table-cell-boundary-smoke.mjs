import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const DEFAULT_SMOKE_PORT = 4017
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const RESPONSIVE_PAGINATION_MAX_DELAY_MS = 300
const ROWSPAN_FINAL_SLICE_MAX_EXTRA_PX = 8
const CARET_ALIGNMENT_TOLERANCE_PX = 4

const TABLE_CELL_APPEND_TEXT = [
  "",
  "STAGE3_TABLE_CELL_MARKER",
  ...Array.from({ length: 14 }, (_unused, index) => (
    `Table cell responsive line ${index + 1} ไทยอังกฤษ ${"tablecellboundary".repeat(8)}`
  )),
].join("\n")

const FLOW_TABLE_COLSPAN_APPEND_TEXT = [
  "",
  "STAGE3_FLOW_TABLE_COLSPAN_MARKER",
  ...Array.from({ length: 18 }, (_unused, index) => (
    `Flow Table colspan responsive line ${index + 1} ไทยอังกฤษ ${"flowtablecolspanboundary".repeat(6)}`
  )),
].join("\n")

const FLOW_TABLE_COLSPAN_OVERCASE_APPEND_TEXT = [
  "",
  "STAGE3_FLOW_TABLE_COLSPAN_OVERCASE_MARKER",
  ...Array.from({ length: 54 }, (_unused, index) => (
    [
      `รายการข้อมูลลูกค้า ${index + 1}`,
      `เลขที่เอกสาร ${String(index + 1).padStart(3, "0")}`,
      `รายละเอียดสินค้าและหมายเหตุยาวๆ สำหรับทดสอบการพิมพ์ข้ามหน้า`,
      `${"flowtableovercase".repeat(7)}`,
    ].join(" | ")
  )),
].join("\n")

const FLOW_TABLE_ROWSPAN_APPEND_TEXT = [
  "",
  "STAGE3_FLOW_TABLE_ROWSPAN_MARKER",
  ...Array.from({ length: 18 }, (_unused, index) => (
    `Flow Table rowspan responsive line ${index + 1} ไทยอังกฤษ ${"flowtablerowspanboundary".repeat(6)}`
  )),
].join("\n")

const FLOW_TABLE_MIXED_SPAN_APPEND_TEXT = [
  "",
  "STAGE3_FLOW_TABLE_MIXED_SPAN_MARKER",
  ...Array.from({ length: 30 }, (_unused, index) => (
    `Flow Table mixed span responsive line ${index + 1} ไทยอังกฤษ ${"flowtablemixedspanboundary".repeat(8)}`
  )),
].join("\n")

const SMOKE_TARGETS = {
  "table-cell": {
    id: "table-cell",
    label: "table-cell",
    nodeId: "stage3-table-cell-target",
    cellId: "stage3-table-cell-target-cell",
    marker: "STAGE3_TABLE_CELL_MARKER",
    appendText: TABLE_CELL_APPEND_TEXT,
    expectedCellNodeType: "flow-table-cell",
  },
  "flow-table-colspan": {
    id: "flow-table-colspan",
    label: "flow-table colspan-only cell",
    nodeId: "stage3-flow-table-colspan-target",
    cellId: "stage3-flow-table-colspan-target-cell",
    siblingNodeId: "stage3-flow-table-colspan-sibling",
    siblingCellId: "stage3-flow-table-colspan-sibling-cell",
    marker: "STAGE3_FLOW_TABLE_COLSPAN_MARKER",
    appendText: FLOW_TABLE_COLSPAN_APPEND_TEXT,
    expectedCellNodeType: "flow-table-cell",
    expectColspanWidth: true,
  },
  "flow-table-colspan-overcase": {
    id: "flow-table-colspan-overcase",
    label: "flow-table colspan-only over-case cell",
    nodeId: "stage3-flow-table-colspan-target",
    cellId: "stage3-flow-table-colspan-target-cell",
    siblingNodeId: "stage3-flow-table-colspan-sibling",
    siblingCellId: "stage3-flow-table-colspan-sibling-cell",
    marker: "STAGE3_FLOW_TABLE_COLSPAN_OVERCASE_MARKER",
    appendText: FLOW_TABLE_COLSPAN_OVERCASE_APPEND_TEXT,
    expectedCellNodeType: "flow-table-cell",
    expectedMinPages: 3,
    maxFirstPaginationDelayMs: 1200,
    maxDraftUpdateDurationMs: 800,
    maxPaginationDurationMs: 1600,
    expectColspanWidth: true,
    expectContinuationSingleClickReentry: true,
    reentryMarker: "STAGE3_FLOW_TABLE_COLSPAN_OVERCASE_REENTRY",
  },
  "flow-table-rowspan": {
    id: "flow-table-rowspan",
    label: "flow-table rowspan cell",
    nodeId: "stage3-flow-table-rowspan-target",
    cellId: "stage3-flow-table-rowspan-target-cell",
    siblingNodeIds: [
      "stage3-flow-table-rowspan-top-sibling",
      "stage3-flow-table-rowspan-bottom-sibling",
    ],
    marker: "STAGE3_FLOW_TABLE_ROWSPAN_MARKER",
    appendText: FLOW_TABLE_ROWSPAN_APPEND_TEXT,
    expectedCellNodeType: "flow-table-cell",
    expectRowspanContinuation: true,
  },
  "flow-table-mixed-span": {
    id: "flow-table-mixed-span",
    label: "flow-table mixed rowspan/colspan cell",
    nodeId: "stage3-flow-table-mixed-span-target",
    cellId: "stage3-flow-table-mixed-span-target-cell",
    siblingCellId: "stage3-flow-table-mixed-span-top-sibling-cell",
    siblingNodeIds: [
      "stage3-flow-table-mixed-span-top-sibling",
      "stage3-flow-table-mixed-span-middle-sibling",
      "stage3-flow-table-mixed-span-bottom-sibling",
    ],
    marker: "STAGE3_FLOW_TABLE_MIXED_SPAN_MARKER",
    appendText: FLOW_TABLE_MIXED_SPAN_APPEND_TEXT,
    expectedCellNodeType: "flow-table-cell",
    expectColspanWidth: true,
    expectRowspanContinuation: true,
    expectContinuationSingleClickReentry: true,
    reentryMarker: "STAGE3_FLOW_TABLE_MIXED_SPAN_REENTRY",
  },
}

function resolveSmokeTarget() {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="))
  const targetId = targetArg?.slice("--target=".length) ?? "table-cell"
  const target = SMOKE_TARGETS[targetId]
  if (!target) {
    throw new Error(`Unknown WYSIWYG table-cell smoke target "${targetId}". Expected one of: ${Object.keys(SMOKE_TARGETS).join(", ")}`)
  }
  return target
}

const smokeTarget = resolveSmokeTarget()

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })

const targetFragmentSelector = `[data-testid="editor-fragment"][data-node-id="${smokeTarget.nodeId}"]`
const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const textEngineLayerSelector = `[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const nativeEditLayerSelector = `[data-wysiwyg-native-edit-layer="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const nativeTextareaSelector = `textarea[data-wysiwyg-native-edit-textarea="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const legacyTextareaSelector = `textarea[data-inline-edit-node-id]:not([data-wysiwyg-native-edit-textarea="true"])`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function latestLineBox(boxes) {
  return boxes
    .filter((box) => Number.isFinite(box.lineEnd))
    .reduce((latest, box) => (
      !latest || box.lineEnd > latest.lineEnd ? box : latest
    ), null)
}

function findCoveringBox(boxes, target, tolerancePx = 1) {
  return boxes.find((box) =>
    box.pageIndex === target.pageIndex &&
    boxIntersectsVertically(box, target, tolerancePx)
  ) ?? null
}

function boxIntersectsVertically(box, target, tolerancePx = CARET_ALIGNMENT_TOLERANCE_PX) {
  return box.y + box.height >= target.y - tolerancePx &&
    box.y <= target.y + target.height + tolerancePx
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
}

function startNextDevServer() {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--port", String(smokePort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(smokePort),
        BROWSER: "none",
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT: "1",
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE: "1",
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  )
  child.output = []

  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stderr.write(text)
  })

  return child
}

function stopNextDevServer(server) {
  if (!server || server.exitCode != null) return Promise.resolve()
  server.kill()
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function waitForServer(url, server, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw new Error([
        `Next dev server exited before ${url} was ready.`,
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

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`)
}

function collectPageErrors(page, consoleErrors, pageErrors, resourceErrors) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({
        text: message.text(),
        location: message.location(),
      })
    }
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("response", (response) => {
    const status = response.status()
    if (status >= 400) resourceErrors.push({ status, url: response.url() })
  })
}

function isIgnoredResourceUrl(url) {
  try {
    return new URL(url).pathname === "/favicon.ico"
  } catch {
    return false
  }
}

function unexpectedResourceErrors(resourceErrors) {
  return resourceErrors.filter((error) => !(error.status === 404 && isIgnoredResourceUrl(error.url)))
}

async function expectNoLayoutError(page) {
  assert(await page.getByTestId("layout-error-badge").count() === 0, "layout error badge is visible")
}

async function expectNativeEditLayerOnly(page) {
  const layer = page.locator(textEngineLayerSelector)
  const nativeLayerCount = await page.locator(nativeEditLayerSelector).count()
  const nativeTextareaCount = await page.locator(nativeTextareaSelector).count()
  const legacyTextareaCount = await page.locator(legacyTextareaSelector).count()
  const liveEchoCount = await layer.locator('[data-wysiwyg-live-echo="true"]').count()
  const liveCaretCount = await layer.locator('[data-wysiwyg-live-caret="true"]').count()
  const draftReplacementCount = await layer.locator('[data-wysiwyg-draft-text-replacement="true"]').count()

  assert(await layer.count() === 1, `expected one active text-engine layer, found ${await layer.count()}`)
  assert(nativeLayerCount === 1, `expected one native edit layer, found ${nativeLayerCount}`)
  assert(nativeTextareaCount === 1, `expected one native edit textarea, found ${nativeTextareaCount}`)
  assert(legacyTextareaCount === 0, `legacy inline textarea leaked into active edit path: ${legacyTextareaCount}`)
  assert(liveEchoCount === 0, `live echo leaked into active native edit path: ${liveEchoCount}`)
  assert(liveCaretCount === 0, `live caret leaked into active native edit path: ${liveCaretCount}`)
  assert(draftReplacementCount === 0, `draft replacement leaked into active native edit path: ${draftReplacementCount}`)
  assert(
    await layer.first().getAttribute("data-wysiwyg-active-visual-mode") === "native-edit-layer",
    "expected native edit layer to own the active visual mode",
  )
}

async function resetWysiwygPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
  })
}

async function readTableCellPerf(page) {
  return page.evaluate((targetNodeId) => {
    const events = window.__flowDocWysiwygPerfEvents ?? []
    const round = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null)
    const summarizeEvent = (event) => event
      ? {
          kind: event.kind,
          startedAt: round(event.startedAt),
          durationMs: round(event.durationMs ?? 0),
          requestedDelayMs: event.requestedDelayMs ?? null,
          scheduledDelayMs: event.scheduledDelayMs ?? null,
          source: event.source ?? null,
          pageCount: event.pageCount ?? null,
          fragmentCount: event.fragmentCount ?? null,
          pageIndex: event.pageIndex ?? null,
          pageIndexes: event.pageIndexes ?? null,
          textLength: event.textLength ?? null,
          draftVersion: event.draftVersion ?? null,
          previousNodeId: event.previousNodeId ?? null,
          active: event.active ?? null,
          firstRequestedAtMs: round(event.firstRequestedAtMs ?? null),
          reflowKind: event.reflowKind ?? null,
          reflowReason: event.reflowReason ?? null,
          responsiveDraftPaginationRequested: event.responsiveDraftPaginationRequested ?? null,
          isTableCellParagraph: event.isTableCellParagraph ?? null,
          isFlowStackParagraph: event.isFlowStackParagraph ?? null,
          draftPaginationActive: event.draftPaginationActive ?? null,
          existingSplitActive: event.existingSplitActive ?? null,
          currentFragmentCount: event.currentFragmentCount ?? null,
          previewFragmentCount: event.previewFragmentCount ?? null,
          previewPageCount: event.previewPageCount ?? null,
          previewCandidateCount: event.previewCandidateCount ?? null,
          visualChromeCount: event.visualChromeCount ?? null,
          visualChromePageCount: event.visualChromePageCount ?? null,
          remainingVisualChromeCount: event.remainingVisualChromeCount ?? null,
        }
      : null
    const draftUpdates = events.filter((event) =>
      event.kind === "inline-edit-draft-update" && event.nodeId === targetNodeId
    )
    const paginations = events.filter((event) =>
      event.kind === "browser-preview-pagination" && event.nodeId === targetNodeId
    )
    const reflowDecisions = events.filter((event) =>
      event.kind === "table-cell-reflow-decision" && event.nodeId === targetNodeId
    )
    const draftPaginationSchedules = events.filter((event) =>
      event.kind === "draft-pagination-schedule" && event.nodeId === targetNodeId
    )
    const draftPaginationStates = events.filter((event) =>
      event.kind === "draft-pagination-state" && (event.nodeId === targetNodeId || event.previousNodeId === targetNodeId)
    )
    const visualPreviewEvents = events.filter((event) =>
      event.kind === "table-cell-visual-preview" && event.nodeId === targetNodeId
    )
    const visualChromeEvents = events.filter((event) =>
      event.kind === "table-cell-visual-chrome" && event.nodeId === targetNodeId
    )
    const firstDraftUpdate = draftUpdates[0] ?? null
    const lastDraftUpdate = draftUpdates[draftUpdates.length - 1] ?? null
    const firstPagination = paginations[0] ?? null
    const firstPaginationAfterDraft = lastDraftUpdate
      ? paginations.find((event) => event.startedAt >= lastDraftUpdate.startedAt) ?? null
      : paginations[0] ?? null
    const maxDuration = (items) => items.reduce((max, event) => Math.max(max, event.durationMs ?? 0), 0)
    const lastPagination = paginations[paginations.length - 1] ?? null
    const fromStart = (from, to) => from && to ? round(to.startedAt - from.startedAt) : null
    const fromEnd = (from, to) => from && to ? round(to.startedAt - (from.startedAt + (from.durationMs ?? 0))) : null
    const eventsBefore = (items, beforeEvent) => beforeEvent
      ? items.filter((event) => event.startedAt <= beforeEvent.startedAt)
      : []
    const maxField = (items, field) => items.reduce((max, event) => Math.max(max, Number(event[field] ?? 0)), 0)
    const firstVisualPreviewCreated = visualPreviewEvents.find((event) => event.source === "created") ?? null
    const firstVisualPreviewCleared = visualPreviewEvents.find((event) => event.source === "cleared") ?? null
    const firstVisualChromeCreated = visualChromeEvents.find((event) => event.source === "created") ?? null
    const firstVisualChromeCleared = visualChromeEvents.find((event) => event.source === "cleared") ?? null
    const visualPreviewBeforePagination = eventsBefore(visualPreviewEvents, firstPaginationAfterDraft)
    const visualChromeBeforePagination = eventsBefore(visualChromeEvents, firstPaginationAfterDraft)
    const firstPaginationUsedLatestDraftVersion =
      Boolean(firstPaginationAfterDraft && lastDraftUpdate) &&
      firstPaginationAfterDraft.draftVersion === lastDraftUpdate.draftVersion

    return {
      draftUpdates: draftUpdates.length,
      browserPreviewPaginations: paginations.length,
      reflowDecisions: reflowDecisions.length,
      draftPaginationSchedules: draftPaginationSchedules.length,
      draftPaginationStates: draftPaginationStates.length,
      visualPreviewEvents: visualPreviewEvents.length,
      visualChromeEvents: visualChromeEvents.length,
      firstPaginationDelayMs: lastDraftUpdate && firstPaginationAfterDraft
        ? round(firstPaginationAfterDraft.startedAt - lastDraftUpdate.startedAt)
        : null,
      firstDraftToFirstPaginationStartMs: fromStart(firstDraftUpdate, firstPagination),
      lastDraftEndToFirstPaginationStartMs: fromEnd(lastDraftUpdate, firstPaginationAfterDraft),
      firstPaginationRequestedDelayMs: firstPaginationAfterDraft?.requestedDelayMs ?? null,
      firstPaginationScheduledDelayMs: firstPaginationAfterDraft?.scheduledDelayMs ?? null,
      firstPaginationSource: firstPaginationAfterDraft?.source ?? null,
      firstPaginationRevision: firstPaginationAfterDraft?.draftVersion ?? null,
      firstPaginationUsedLatestDraftVersion,
      firstPaginationDurationMs: round(firstPaginationAfterDraft?.durationMs ?? null),
      maxDraftUpdateDurationMs: maxDuration(draftUpdates),
      maxPaginationDurationMs: maxDuration(paginations),
      lastPaginationPageCount: lastPagination?.pageCount ?? null,
      lastPaginationFragmentCount: lastPagination?.fragmentCount ?? null,
      firstDraftUpdate: summarizeEvent(firstDraftUpdate),
      lastDraftUpdate: summarizeEvent(lastDraftUpdate),
      firstPagination: summarizeEvent(firstPaginationAfterDraft),
      firstReflowDecision: summarizeEvent(reflowDecisions[0] ?? null),
      firstDraftPaginationSchedule: summarizeEvent(draftPaginationSchedules[0] ?? null),
      lastDraftPaginationSchedule: summarizeEvent(draftPaginationSchedules[draftPaginationSchedules.length - 1] ?? null),
      firstDraftPaginationState: summarizeEvent(draftPaginationStates[0] ?? null),
      lastDraftPaginationState: summarizeEvent(draftPaginationStates[draftPaginationStates.length - 1] ?? null),
      firstVisualPreviewCreated: summarizeEvent(firstVisualPreviewCreated),
      firstVisualPreviewCleared: summarizeEvent(firstVisualPreviewCleared),
      lastVisualPreviewEvent: summarizeEvent(visualPreviewEvents[visualPreviewEvents.length - 1] ?? null),
      firstVisualChromeCreated: summarizeEvent(firstVisualChromeCreated),
      firstVisualChromeCleared: summarizeEvent(firstVisualChromeCleared),
      lastVisualChromeEvent: summarizeEvent(visualChromeEvents[visualChromeEvents.length - 1] ?? null),
      maxPreviewFragmentCountBeforePagination: maxField(visualPreviewBeforePagination, "previewFragmentCount"),
      maxVisualChromeCountBeforePagination: maxField(visualChromeBeforePagination, "visualChromeCount"),
      traceEvents: events
        .filter((event) =>
          event.kind === "editor-canvas-react-commit" ||
          event.kind === "text-engine-draft-measure" ||
          event.kind === "draft-pagination-schedule" ||
          event.kind === "draft-pagination-state" ||
          (event.nodeId === targetNodeId && (
            event.kind === "inline-edit-draft-update" ||
            event.kind === "browser-preview-pagination" ||
            event.kind === "table-cell-reflow-decision" ||
            event.kind === "table-cell-visual-preview" ||
            event.kind === "table-cell-visual-chrome"
          ))
        )
        .map(summarizeEvent),
    }
  }, smokeTarget.nodeId)
}

async function openTableTarget(page) {
  await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
  const shell = page.getByTestId("editor-shell")
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-editor-test-scenario") === SCENARIO_ID, "expected Stage 3 boundary scenario")
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  await expectNoLayoutError(page)

  await page.waitForFunction(
    ({ selector }) => document.querySelectorAll(selector).length === 1,
    { selector: targetFragmentSelector },
    { timeout: 15000 },
  )
  const target = page.locator(targetFragmentSelector).first()
  await target.scrollIntoViewIfNeeded()
  await target.dblclick()
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await expectNativeEditLayerOnly(page)
}

async function assertContinuationSingleClickReentry(page, pages) {
  const continuationPageIndex = pages[pages.length - 1]
  assert(continuationPageIndex != null, `expected continuation page for ${smokeTarget.nodeId}`)

  await page.keyboard.press("Escape")
  await page.waitForFunction(
    ({ selector }) => document.querySelector(selector) == null,
    { selector: bridgeSelector },
    { timeout: 10000 },
  )

  const continuationSelector =
    `[data-testid="editor-fragment"][data-node-id="${smokeTarget.nodeId}"][data-page-index="${continuationPageIndex}"]`
  const continuation = page.locator(continuationSelector).first()
  await continuation.scrollIntoViewIfNeeded()
  await continuation.click()
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await expectNativeEditLayerOnly(page)

  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")
  const reentryMarker = smokeTarget.reentryMarker ?? "STAGE3_TABLE_CELL_REENTRY"
  await page.keyboard.insertText(` ${reentryMarker}`)
  await page.waitForFunction(
    ({ marker }) => document.body.textContent?.includes(marker) === true,
    { marker: reentryMarker },
    { timeout: 10000 },
  )
  await expectNativeEditLayerOnly(page)
  await expectNoLayoutError(page)

  return {
    pageIndex: continuationPageIndex,
    marker: reentryMarker,
  }
}

async function assertTableCellBoundaryFlow(page) {
  await openTableTarget(page)
  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")
  await resetWysiwygPerfEvents(page)
  await page.keyboard.insertText(smokeTarget.appendText)

  try {
    await page.waitForFunction(
      ({ selector, targetNodeId, marker }) => {
        const fragmentCount = document.querySelectorAll(selector).length
        const hasMarker = document.body.textContent?.includes(marker) === true
        const hasPagination = (window.__flowDocWysiwygPerfEvents ?? []).some((event) =>
          event.kind === "browser-preview-pagination" && event.nodeId === targetNodeId
        )
        return fragmentCount >= 2 && hasMarker && hasPagination
      },
      { selector: targetFragmentSelector, targetNodeId: smokeTarget.nodeId, marker: smokeTarget.marker },
      { timeout: 15000 },
    )
  } catch (error) {
    const debugState = await page.evaluate(({ selector, targetNodeId, marker }) => ({
      fragmentCount: document.querySelectorAll(selector).length,
      hasMarker: document.body.textContent?.includes(marker) === true,
      perfEvents: (window.__flowDocWysiwygPerfEvents ?? [])
        .map((event) => ({ kind: event.kind, nodeId: event.nodeId })),
      visibleTextSample: document.body.textContent?.slice(0, 500) ?? "",
    }), { selector: targetFragmentSelector, targetNodeId: smokeTarget.nodeId, marker: smokeTarget.marker })
    throw new Error(`timed out waiting for ${smokeTarget.id} boundary split: ${JSON.stringify(debugState, null, 2)}`, {
      cause: error,
    })
  }
  await expectNativeEditLayerOnly(page)
  await expectNoLayoutError(page)

  const state = await page.evaluate((input) => {
    const {
      targetNodeId,
      targetCellId,
      siblingNodeId,
      siblingNodeIds,
      siblingCellId,
    } = input
    const readDomBox = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    }
    const readFragmentBoxes = (nodeId) => {
      if (!nodeId) return []
      return Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`))
        .map((fragment) => {
          const rect = fragment.querySelector("rect")
          const box = rect?.getBoundingClientRect()
          return {
            nodeType: fragment.getAttribute("data-node-type"),
            pageIndex: fragment.getAttribute("data-page-index"),
            parentNodeId: fragment.getAttribute("data-parent-node-id"),
            lineStart: Number(fragment.getAttribute("data-line-start") ?? Number.NaN),
            lineEnd: Number(fragment.getAttribute("data-line-end") ?? Number.NaN),
            x: box?.x ?? 0,
            y: box?.y ?? 0,
            width: box?.width ?? 0,
            height: box?.height ?? 0,
          }
        })
    }
    const fragments = Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${targetNodeId}"]`))
    const layer = document.querySelector(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${targetNodeId}"]`)
    const inputBridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${targetNodeId}"]`)
    const caret = layer?.querySelector('[data-wysiwyg-caret="true"], [data-wysiwyg-live-caret="true"]') ?? null
    const nativeTextarea = layer?.querySelector('[data-wysiwyg-native-edit-textarea="true"]') ?? null
    const cellBoxes = readFragmentBoxes(targetCellId)
    const rowIds = cellBoxes
      .map((box) => box.parentNodeId)
      .filter((rowId, index, all) => rowId && all.indexOf(rowId) === index)
    return {
      fragmentCount: fragments.length,
      pages: fragments
        .map((fragment) => fragment.getAttribute("data-page-index"))
        .filter((pageIndex, index, all) => pageIndex !== null && all.indexOf(pageIndex) === index),
      pointerFragmentCount: Number(layer?.getAttribute("data-wysiwyg-pointer-fragment-count") ?? 0),
      previewCandidateCount: document.querySelectorAll('[data-wysiwyg-table-cell-preview-candidate="true"]').length,
      visualChromeCount: document.querySelectorAll('[data-wysiwyg-table-cell-visual-chrome="true"]').length,
      layerCount: document.querySelectorAll(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${targetNodeId}"]`).length,
      activeVisualMode: layer?.getAttribute("data-wysiwyg-active-visual-mode") ?? null,
      activeVisualDetail: layer?.getAttribute("data-wysiwyg-active-visual-detail") ?? null,
      nativeTextareaCount: layer?.querySelectorAll('[data-wysiwyg-native-edit-textarea="true"]').length ?? 0,
      legacyTextareaCount: document.querySelectorAll(`textarea[data-inline-edit-node-id="${targetNodeId}"]:not([data-wysiwyg-native-edit-textarea="true"])`).length,
      liveEchoCount: layer?.querySelectorAll('[data-wysiwyg-live-echo="true"]').length ?? 0,
      liveCaretCount: layer?.querySelectorAll('[data-wysiwyg-live-caret="true"]').length ?? 0,
      draftReplacementCount: layer?.querySelectorAll('[data-wysiwyg-draft-text-replacement="true"]').length ?? 0,
      inputBridgeCaretColor: inputBridge ? getComputedStyle(inputBridge).caretColor : null,
      inputBridgeBox: readDomBox(inputBridge),
      nativeTextareaBox: readDomBox(nativeTextarea),
      caretBox: readDomBox(caret),
      targetBoxes: readFragmentBoxes(targetNodeId),
      cellBoxes,
      rowBoxes: rowIds.flatMap((rowId) => readFragmentBoxes(rowId)),
      siblingParagraphCount: siblingNodeId
        ? document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${siblingNodeId}"]`).length
        : null,
      siblingParagraphCounts: siblingNodeIds
        ? siblingNodeIds.map((nodeId) => ({
            nodeId,
            count: document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`).length,
          }))
        : [],
      siblingCellBoxes: readFragmentBoxes(siblingCellId),
    }
  }, {
    targetNodeId: smokeTarget.nodeId,
    targetCellId: smokeTarget.cellId,
    siblingNodeId: smokeTarget.siblingNodeId,
    siblingNodeIds: smokeTarget.siblingNodeIds,
    siblingCellId: smokeTarget.siblingCellId,
  })
  const perf = await readTableCellPerf(page)

  const expectedMinPages = smokeTarget.expectedMinPages ?? 2
  assert(state.fragmentCount >= expectedMinPages, `expected table-cell target to split into at least ${expectedMinPages} fragments, got ${state.fragmentCount}`)
  assert(state.pages.length >= expectedMinPages, `expected table-cell target on at least ${expectedMinPages} pages, got ${JSON.stringify(state.pages)}`)
  assert(state.layerCount === 1, `expected one active text-engine layer, found ${state.layerCount}`)
  assert(state.activeVisualMode === "native-edit-layer", `expected native-edit-layer visual mode, got ${state.activeVisualMode}`)
  assert(state.activeVisualDetail === "native-textarea", `expected native-textarea visual detail, got ${state.activeVisualDetail}`)
  assert(state.nativeTextareaCount === 1, `expected one native edit textarea, got ${state.nativeTextareaCount}`)
  assert(state.legacyTextareaCount === 0, `legacy inline textarea leaked into table-cell edit path: ${state.legacyTextareaCount}`)
  assert(state.liveEchoCount === 0, `live echo leaked into active table-cell edit path: ${state.liveEchoCount}`)
  assert(state.liveCaretCount === 0, `live caret leaked into active table-cell edit path: ${state.liveCaretCount}`)
  assert(state.draftReplacementCount === 0, `draft replacement leaked into active table-cell edit path: ${state.draftReplacementCount}`)
  assert(state.pointerFragmentCount >= 2, `expected pointer fragments for split table-cell edit, got ${state.pointerFragmentCount}`)
  assert(state.previewCandidateCount === 0, `temporary preview candidate remained after settled pagination: ${state.previewCandidateCount}`)
  assert(state.visualChromeCount === 0, `visual-only table-cell chrome remained after settled pagination: ${state.visualChromeCount}`)
  assert(perf.draftUpdates >= 1, "expected table-cell draft update perf event")
  assert(perf.browserPreviewPaginations >= 1, "expected responsive table-cell browser preview pagination")
  const maxFirstPaginationDelayMs = smokeTarget.maxFirstPaginationDelayMs ?? RESPONSIVE_PAGINATION_MAX_DELAY_MS
  assert(
    perf.firstPaginationDelayMs !== null && perf.firstPaginationDelayMs <= maxFirstPaginationDelayMs,
    `table-cell draft pagination was not responsive enough: ${perf.firstPaginationDelayMs}ms; breakdown: ${JSON.stringify({
      firstDraftToFirstPaginationStartMs: perf.firstDraftToFirstPaginationStartMs,
      lastDraftEndToFirstPaginationStartMs: perf.lastDraftEndToFirstPaginationStartMs,
      firstPaginationRequestedDelayMs: perf.firstPaginationRequestedDelayMs,
      firstPaginationScheduledDelayMs: perf.firstPaginationScheduledDelayMs,
      firstPaginationDurationMs: perf.firstPaginationDurationMs,
      firstPaginationRevision: perf.firstPaginationRevision,
      firstPaginationUsedLatestDraftVersion: perf.firstPaginationUsedLatestDraftVersion,
      reflowDecisions: perf.reflowDecisions,
      draftPaginationSchedules: perf.draftPaginationSchedules,
      visualPreviewEvents: perf.visualPreviewEvents,
      visualChromeEvents: perf.visualChromeEvents,
      firstDraftUpdate: perf.firstDraftUpdate,
      lastDraftUpdate: perf.lastDraftUpdate,
      firstPagination: perf.firstPagination,
      firstReflowDecision: perf.firstReflowDecision,
      firstDraftPaginationSchedule: perf.firstDraftPaginationSchedule,
      lastDraftPaginationSchedule: perf.lastDraftPaginationSchedule,
      firstVisualPreviewCreated: perf.firstVisualPreviewCreated,
      firstVisualPreviewCleared: perf.firstVisualPreviewCleared,
      lastVisualPreviewEvent: perf.lastVisualPreviewEvent,
      firstVisualChromeCreated: perf.firstVisualChromeCreated,
      firstVisualChromeCleared: perf.firstVisualChromeCleared,
      lastVisualChromeEvent: perf.lastVisualChromeEvent,
      maxPreviewFragmentCountBeforePagination: perf.maxPreviewFragmentCountBeforePagination,
      maxVisualChromeCountBeforePagination: perf.maxVisualChromeCountBeforePagination,
      traceEvents: perf.traceEvents,
    })}`,
  )
  if (smokeTarget.maxDraftUpdateDurationMs != null) {
    assert(
      perf.maxDraftUpdateDurationMs <= smokeTarget.maxDraftUpdateDurationMs,
      `draft update duration was too slow: ${perf.maxDraftUpdateDurationMs}ms`,
    )
  }
  if (smokeTarget.maxPaginationDurationMs != null) {
    assert(
      perf.maxPaginationDurationMs <= smokeTarget.maxPaginationDurationMs,
      `browser preview pagination duration was too slow: ${perf.maxPaginationDurationMs}ms`,
    )
  }
  if (smokeTarget.cellId) {
    assert(state.cellBoxes.length >= 2, `expected target cell chrome to split, got ${state.cellBoxes.length}`)
    assert(
      state.cellBoxes.every((box) => box.nodeType === smokeTarget.expectedCellNodeType && box.width > 0 && box.height > 0),
      `unexpected target cell boxes: ${JSON.stringify(state.cellBoxes)}`,
    )
  }
  if (smokeTarget.siblingNodeId) {
    assert(state.siblingParagraphCount === 1, `expected shorter sibling paragraph once, got ${state.siblingParagraphCount}`)
  }
  if (smokeTarget.siblingNodeIds) {
    for (const sibling of state.siblingParagraphCounts) {
      assert(sibling.count === 1, `expected sibling paragraph ${sibling.nodeId} once, got ${sibling.count}`)
    }
  }
  if (smokeTarget.expectColspanWidth) {
    const minTargetWidth = Math.min(...state.cellBoxes.map((box) => box.width))
    const maxSiblingWidth = Math.max(...state.siblingCellBoxes.map((box) => box.width))
    assert(Number.isFinite(minTargetWidth) && minTargetWidth > 0, `missing target colspan cell width: ${JSON.stringify(state.cellBoxes)}`)
    assert(Number.isFinite(maxSiblingWidth) && maxSiblingWidth > 0, `missing sibling cell width: ${JSON.stringify(state.siblingCellBoxes)}`)
    assert(
      minTargetWidth > maxSiblingWidth * 1.5,
      `expected colspan target width > sibling width, got target ${minTargetWidth} and sibling ${maxSiblingWidth}`,
    )
  }
  if (smokeTarget.expectRowspanContinuation) {
    const parentRowIds = state.cellBoxes
      .map((box) => box.parentNodeId)
      .filter((parentNodeId, index, all) => parentNodeId && all.indexOf(parentNodeId) === index)
    assert(parentRowIds.length >= 2, `expected rowspan continuation across row parents, got ${JSON.stringify(state.cellBoxes)}`)

    const finalTargetBox = latestLineBox(state.targetBoxes)
    assert(finalTargetBox, `expected line metadata for rowspan target fragments: ${JSON.stringify(state.targetBoxes)}`)
    const finalCellBox = findCoveringBox(state.cellBoxes, finalTargetBox)
    const finalRowBox = findCoveringBox(state.rowBoxes, finalTargetBox)
    assert(finalCellBox, `expected final rowspan cell chrome to cover final target fragment: ${JSON.stringify({ target: finalTargetBox, cells: state.cellBoxes })}`)
    assert(finalRowBox, `expected final rowspan row chrome to align with final target fragment: ${JSON.stringify({ target: finalTargetBox, rows: state.rowBoxes })}`)
    assert(
      finalCellBox.height <= finalTargetBox.height + ROWSPAN_FINAL_SLICE_MAX_EXTRA_PX,
      `final rowspan cell left a blank continuation slice: ${JSON.stringify({ target: finalTargetBox, cell: finalCellBox })}`,
    )
    assert(
      finalRowBox.height <= finalTargetBox.height + ROWSPAN_FINAL_SLICE_MAX_EXTRA_PX,
      `final rowspan row left a blank continuation slice: ${JSON.stringify({ target: finalTargetBox, row: finalRowBox })}`,
    )
    assert(state.inputBridgeBox, "expected active hidden input bridge box")
    assert(
      Math.abs(state.inputBridgeBox.x - finalTargetBox.x) <= CARET_ALIGNMENT_TOLERANCE_PX &&
        Math.abs(state.inputBridgeBox.y - finalTargetBox.y) <= CARET_ALIGNMENT_TOLERANCE_PX,
      `input bridge drifted away from final target fragment: ${JSON.stringify({ target: finalTargetBox, inputBridge: state.inputBridgeBox })}`,
    )
    assert(state.caretBox, "expected active WYSIWYG caret box")
    assert(
      boxIntersectsVertically(state.caretBox, finalTargetBox),
      `caret drifted away from final target fragment: ${JSON.stringify({ target: finalTargetBox, caret: state.caretBox })}`,
    )
  }
  const continuationReentry = smokeTarget.expectContinuationSingleClickReentry
    ? await assertContinuationSingleClickReentry(page, state.pages)
    : null

  return {
    target: smokeTarget.id,
    marker: smokeTarget.marker,
    fragments: state.fragmentCount,
    pages: state.pages,
    pointerFragments: state.pointerFragmentCount,
    cellFragments: state.cellBoxes.length,
    siblingParagraphs: state.siblingParagraphCount,
    siblingParagraphCounts: state.siblingParagraphCounts,
    continuationReentry,
    performanceTrace: {
      draftUpdates: perf.draftUpdates,
      browserPreviewPaginations: perf.browserPreviewPaginations,
      firstPaginationDelayMs: Math.round(perf.firstPaginationDelayMs),
      firstDraftToFirstPaginationStartMs: Math.round(perf.firstDraftToFirstPaginationStartMs),
      lastDraftEndToFirstPaginationStartMs: Math.round(perf.lastDraftEndToFirstPaginationStartMs),
      firstPaginationRequestedDelayMs: perf.firstPaginationRequestedDelayMs,
      firstPaginationScheduledDelayMs: perf.firstPaginationScheduledDelayMs,
      firstPaginationSource: perf.firstPaginationSource,
      firstPaginationRevision: perf.firstPaginationRevision,
      firstPaginationUsedLatestDraftVersion: perf.firstPaginationUsedLatestDraftVersion,
      maxDraftUpdateDurationMs: Math.round(perf.maxDraftUpdateDurationMs),
      maxPaginationDurationMs: Math.round(perf.maxPaginationDurationMs),
      lastPaginationPageCount: perf.lastPaginationPageCount,
      lastPaginationFragmentCount: perf.lastPaginationFragmentCount,
    },
    visualLifecycle: {
      reflowDecisions: perf.reflowDecisions,
      draftPaginationSchedules: perf.draftPaginationSchedules,
      draftPaginationStates: perf.draftPaginationStates,
      visualPreviewEvents: perf.visualPreviewEvents,
      visualChromeEvents: perf.visualChromeEvents,
      firstReflowDecision: perf.firstReflowDecision,
      firstDraftPaginationSchedule: perf.firstDraftPaginationSchedule,
      lastDraftPaginationSchedule: perf.lastDraftPaginationSchedule,
      firstDraftPaginationState: perf.firstDraftPaginationState,
      lastDraftPaginationState: perf.lastDraftPaginationState,
      firstVisualPreviewCreated: perf.firstVisualPreviewCreated,
      firstVisualPreviewCleared: perf.firstVisualPreviewCleared,
      lastVisualPreviewEvent: perf.lastVisualPreviewEvent,
      firstVisualChromeCreated: perf.firstVisualChromeCreated,
      firstVisualChromeCleared: perf.firstVisualChromeCleared,
      lastVisualChromeEvent: perf.lastVisualChromeEvent,
      maxPreviewFragmentCountBeforePagination: perf.maxPreviewFragmentCountBeforePagination,
      maxVisualChromeCountBeforePagination: perf.maxVisualChromeCountBeforePagination,
      afterSettledPagination: {
        previewCandidateCount: state.previewCandidateCount,
        visualChromeCount: state.visualChromeCount,
        activeVisualMode: state.activeVisualMode,
        activeVisualDetail: state.activeVisualDetail,
      },
    },
  }
}

async function main() {
  console.log(`wysiwyg ${smokeTarget.label} boundary smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null
  const consoleErrors = []
  const pageErrors = []
  const resourceErrors = []
  try {
    await waitForServer(scenarioUrl(), server)
    browser = await launchSmokeBrowser(smokeBrowser)
    const page = await browser.newPage()
    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)
    const result = await assertTableCellBoundaryFlow(page)
    const unignoredResourceErrors = unexpectedResourceErrors(resourceErrors)

    assert(consoleErrors.length === 0, `console errors:\n${JSON.stringify(consoleErrors, null, 2)}`)
    assert(pageErrors.length === 0, `page errors:\n${JSON.stringify(pageErrors, null, 2)}`)
    assert(unignoredResourceErrors.length === 0, `resource errors:\n${JSON.stringify(unignoredResourceErrors, null, 2)}`)

    console.log(JSON.stringify({
      ok: true,
      browser: {
        mode: smokeBrowserLabel(smokeBrowser),
        channel: smokeBrowser.channel ?? null,
        executablePath: smokeBrowser.executablePath ?? null,
        headless: smokeBrowser.headless,
      },
      tableCell: result,
      ignoredResourceErrors: resourceErrors.filter((error) => !unexpectedResourceErrors([error]).length),
    }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      console: {
        errors: consoleErrors,
        pageErrors,
      },
      resourceErrors,
      ignoredResourceErrors: resourceErrors.filter((resourceError) => !unexpectedResourceErrors([resourceError]).length),
      failure: error instanceof Error ? error.message : String(error),
    }, null, 2))
    throw error
  } finally {
    if (browser) await browser.close()
    await stopNextDevServer(server)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
