import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const DEFAULT_SMOKE_PORT = 4017
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const RESPONSIVE_PAGINATION_MAX_DELAY_MS = 300

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

const FLOW_TABLE_ROWSPAN_APPEND_TEXT = [
  "",
  "STAGE3_FLOW_TABLE_ROWSPAN_MARKER",
  ...Array.from({ length: 18 }, (_unused, index) => (
    `Flow Table rowspan responsive line ${index + 1} ไทยอังกฤษ ${"flowtablerowspanboundary".repeat(6)}`
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
    expectedCellNodeType: "table-cell",
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
const textareaSelector = "textarea[data-inline-edit-node-id]"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
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

async function expectNoTextarea(page) {
  const textareaCount = await page.locator(textareaSelector).count()
  assert(textareaCount === 0, `expected no inline textarea, found ${textareaCount}`)
}

async function resetWysiwygPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
  })
}

async function readTableCellPerf(page) {
  return page.evaluate((targetNodeId) => {
    const events = window.__flowDocWysiwygPerfEvents ?? []
    const draftUpdates = events.filter((event) =>
      event.kind === "inline-edit-draft-update" && event.nodeId === targetNodeId
    )
    const paginations = events.filter((event) =>
      event.kind === "browser-preview-pagination" && event.nodeId === targetNodeId
    )
    const lastDraftUpdate = draftUpdates[draftUpdates.length - 1] ?? null
    const firstPaginationAfterDraft = lastDraftUpdate
      ? paginations.find((event) => event.startedAt >= lastDraftUpdate.startedAt) ?? null
      : paginations[0] ?? null

    return {
      draftUpdates: draftUpdates.length,
      browserPreviewPaginations: paginations.length,
      firstPaginationDelayMs: lastDraftUpdate && firstPaginationAfterDraft
        ? firstPaginationAfterDraft.startedAt - lastDraftUpdate.startedAt
        : null,
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
  await expectNoTextarea(page)
}

async function assertTableCellBoundaryFlow(page) {
  await openTableTarget(page)
  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")
  await resetWysiwygPerfEvents(page)
  await page.keyboard.insertText(smokeTarget.appendText)

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
  await expectNoTextarea(page)
  await expectNoLayoutError(page)

  const state = await page.evaluate((input) => {
    const {
      targetNodeId,
      targetCellId,
      siblingNodeId,
      siblingNodeIds,
      siblingCellId,
    } = input
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
            width: box?.width ?? 0,
            height: box?.height ?? 0,
          }
        })
    }
    const fragments = Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${targetNodeId}"]`))
    const layer = document.querySelector(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${targetNodeId}"]`)
    const inputBridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${targetNodeId}"]`)
    return {
      fragmentCount: fragments.length,
      pages: fragments
        .map((fragment) => fragment.getAttribute("data-page-index"))
        .filter((pageIndex, index, all) => pageIndex !== null && all.indexOf(pageIndex) === index),
      pointerFragmentCount: Number(layer?.getAttribute("data-wysiwyg-pointer-fragment-count") ?? 0),
      previewCandidateCount: document.querySelectorAll('[data-wysiwyg-table-cell-preview-candidate="true"]').length,
      visualChromeCount: document.querySelectorAll('[data-wysiwyg-table-cell-visual-chrome="true"]').length,
      layerCount: document.querySelectorAll(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${targetNodeId}"]`).length,
      inputBridgeCaretColor: inputBridge ? getComputedStyle(inputBridge).caretColor : null,
      cellBoxes: readFragmentBoxes(targetCellId),
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

  assert(state.fragmentCount >= 2, `expected table-cell target to split, got ${state.fragmentCount}`)
  assert(state.pages.length >= 2, `expected table-cell target on multiple pages, got ${JSON.stringify(state.pages)}`)
  assert(state.layerCount === 1, `expected one active text-engine layer, found ${state.layerCount}`)
  assert(state.pointerFragmentCount >= 2, `expected pointer fragments for split table-cell edit, got ${state.pointerFragmentCount}`)
  assert(state.previewCandidateCount === 0, `temporary preview candidate remained after settled pagination: ${state.previewCandidateCount}`)
  assert(state.visualChromeCount === 0, `visual-only table-cell chrome remained after settled pagination: ${state.visualChromeCount}`)
  assert(state.inputBridgeCaretColor === "rgba(0, 0, 0, 0)", `expected hidden input bridge caret, got ${state.inputBridgeCaretColor}`)
  assert(perf.draftUpdates >= 1, "expected table-cell draft update perf event")
  assert(perf.browserPreviewPaginations >= 1, "expected responsive table-cell browser preview pagination")
  assert(
    perf.firstPaginationDelayMs !== null && perf.firstPaginationDelayMs <= RESPONSIVE_PAGINATION_MAX_DELAY_MS,
    `table-cell draft pagination was not responsive enough: ${perf.firstPaginationDelayMs}ms`,
  )
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
  }

  return {
    target: smokeTarget.id,
    marker: smokeTarget.marker,
    fragments: state.fragmentCount,
    pages: state.pages,
    pointerFragments: state.pointerFragmentCount,
    cellFragments: state.cellBoxes.length,
    siblingParagraphs: state.siblingParagraphCount,
    siblingParagraphCounts: state.siblingParagraphCounts,
    performanceTrace: {
      draftUpdates: perf.draftUpdates,
      browserPreviewPaginations: perf.browserPreviewPaginations,
      firstPaginationDelayMs: Math.round(perf.firstPaginationDelayMs),
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
  } finally {
    if (browser) await browser.close()
    await stopNextDevServer(server)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
