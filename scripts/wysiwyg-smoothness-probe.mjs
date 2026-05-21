import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser } from "./smoke-browser.mjs"

// Phase C smoothness probe. Types a controlled burst into the Stage 3
// boundary scenario and measures objective signals from the existing
// WYSIWYG perf trace plus keypress->paint latency. The probe writes a
// JSON report so smoothness can be compared across runs and against the
// threshold table in docs/WYSIWYG_SMOOTHNESS_PROBE.md.

const DEFAULT_PORT = 4017
const DEFAULT_TARGET_NODE_ID = "stage3-boundary-target"
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const TYPE_BURST_LENGTH = Number(process.env.PROBE_BURST_LENGTH ?? 400)
const TYPE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 30)
const PROBE_MODE = process.env.PROBE_MODE?.trim() || "typing"
const RESIZE_MOVE_COUNT = Number(process.env.PROBE_RESIZE_MOVE_COUNT ?? 70)
const RESIZE_MOVE_DISTANCE_PX = Number(process.env.PROBE_RESIZE_DISTANCE_PX ?? 180)
const FRAME_BUDGET_MS = 16
const JANK_BUDGET_MS = 100

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const probeFlowDocFile = process.env.FLOWDOC_PROBE_FILE?.trim() || null
const configuredTargetNodeId = process.env.PROBE_TARGET_NODE_ID?.trim() || null

const paragraphFragmentSelector = `[data-testid="editor-fragment"][data-node-type="paragraph"]`
const resizeHandleSelector = `[data-testid="column-resize-handle"]`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  if (!probeFlowDocFile) {
    url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  }
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
}

function readProbeFlowDocFile() {
  if (!probeFlowDocFile) return null
  const resolvedPath = path.resolve(probeFlowDocFile)
  return {
    path: resolvedPath,
    raw: fs.readFileSync(resolvedPath, "utf8"),
  }
}

function fragmentSelectorForNode(nodeId) {
  return `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
}

function bridgeSelectorForNode(nodeId) {
  return `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`
}

async function resolveTargetNodeId(page) {
  if (configuredTargetNodeId) return configuredTargetNodeId
  if (!probeFlowDocFile) return DEFAULT_TARGET_NODE_ID

  await page.locator(paragraphFragmentSelector).first().waitFor({ state: "attached", timeout: 15000 })
  const candidates = await page.locator(paragraphFragmentSelector).evaluateAll((nodes) => nodes
    .map((node) => {
      const element = node
      const rect = element.getBoundingClientRect()
      return {
        nodeId: element.getAttribute("data-node-id"),
        pageIndex: Number(element.getAttribute("data-page-index") ?? "0"),
        height: rect.height,
        width: rect.width,
        top: rect.top,
      }
    })
    .filter((item) => item.nodeId && item.width > 0 && item.height > 0)
    .sort((a, b) => {
      const areaDelta = (b.width * b.height) - (a.width * a.height)
      if (Math.abs(areaDelta) > 1) return areaDelta
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex
      return a.top - b.top
    }))
  const target = candidates[0]?.nodeId
  assert(target, "Could not find a paragraph fragment target in the loaded document")
  return target
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.floor(p * (sortedValues.length - 1)))
  return sortedValues[index]
}

function summarizePerfEvents(perfEvents) {
  const eventCounts = perfEvents.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1
    return acc
  }, {})
  const slowEvents = perfEvents.filter((e) => e.durationMs > FRAME_BUDGET_MS).length
  const jankEvents = perfEvents.filter((e) => e.durationMs > JANK_BUDGET_MS).length
  const longestEvent = perfEvents.reduce(
    (max, e) => (e.durationMs > max.durationMs ? e : max),
    { durationMs: 0 },
  )
  return {
    total: perfEvents.length,
    countByKind: eventCounts,
    overFrameBudget: slowEvents,
    jankCount: jankEvents,
    longestEvent: longestEvent.kind ? {
      kind: longestEvent.kind,
      durationMs: longestEvent.durationMs,
    } : null,
  }
}

async function waitForDoubleAnimationFrame(page) {
  return await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve(performance.now() - start)
    }))
  }))
}

async function waitForServer(url, server, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw new Error("Next dev server exited before probe URL was ready")
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`)
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
  child.stdout.on("data", () => {})
  child.stderr.on("data", () => {})
  return child
}

function stopServer(server) {
  if (!server || server.exitCode != null) return Promise.resolve()
  server.kill()
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => { clearTimeout(timeout); resolve() })
  })
}

async function runTypingProbe(page) {
  const targetNodeId = await resolveTargetNodeId(page)
  const fragmentSelector = fragmentSelectorForNode(targetNodeId)
  const bridgeSelector = bridgeSelectorForNode(targetNodeId)
  await page.locator(fragmentSelector).first().waitFor({ state: "attached", timeout: 15000 })

  // Click into target paragraph to enter the text-engine bridge.
  await page.locator(fragmentSelector).first().click()
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })

  // Reset perf events right before typing burst.
  await page.evaluate(() => { window.__flowDocWysiwygPerfEvents = [] })
  const startFragmentCount = await page.locator(fragmentSelector).count()

  // Type burst with per-keystroke latency capture. Each keystroke records
  // (1) the time before press, (2) the time after the next animation frame
  // settles. The diff is a paint-budget proxy that includes React render +
  // FlowDoc draft preview + layout.
  const keystrokes = []
  for (let i = 0; i < TYPE_BURST_LENGTH; i += 1) {
    const ch = i % 13 === 12 ? " " : String.fromCharCode(97 + (i % 26))
    const tBefore = await page.evaluate(() => performance.now())
    await page.keyboard.press(ch === " " ? "Space" : ch.toUpperCase())
    const paintLatency = await waitForDoubleAnimationFrame(page)
    const tAfter = await page.evaluate(() => performance.now())
    keystrokes.push({ index: i, paintLatencyMs: paintLatency, totalMs: tAfter - tBefore })
    await page.waitForTimeout(TYPE_INTERVAL_MS)
  }

  const endFragmentCount = await page.locator(fragmentSelector).count()
  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])

  const paintLatencies = keystrokes.map((k) => k.paintLatencyMs).sort((a, b) => a - b)
  const totalLatencies = keystrokes.map((k) => k.totalMs).sort((a, b) => a - b)
  return {
    targetNodeId,
    action: {
      mode: "typing",
      burstLength: TYPE_BURST_LENGTH,
      intervalMs: TYPE_INTERVAL_MS,
    },
    paintLatencyMs: {
      p50: percentile(paintLatencies, 0.5),
      p95: percentile(paintLatencies, 0.95),
      p99: percentile(paintLatencies, 0.99),
      max: paintLatencies[paintLatencies.length - 1] ?? null,
    },
    keystrokeTotalMs: {
      p50: percentile(totalLatencies, 0.5),
      p95: percentile(totalLatencies, 0.95),
      p99: percentile(totalLatencies, 0.99),
      max: totalLatencies[totalLatencies.length - 1] ?? null,
    },
    perfEvents: summarizePerfEvents(perfEvents),
    pageBoundary: {
      startFragmentCount,
      endFragmentCount,
      crossed: endFragmentCount > startFragmentCount,
    },
  }
}

async function runResizeProbe(page) {
  const handle = page.locator(resizeHandleSelector).first()
  await handle.waitFor({ state: "attached", timeout: 15000 })
  const handleCount = await page.locator(resizeHandleSelector).count()
  const box = await handle.boundingBox()
  assert(box, "Could not resolve resize handle bounding box")

  await page.evaluate(() => { window.__flowDocWysiwygPerfEvents = [] })
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  const moves = []
  let previewVisibleCount = 0
  for (let i = 1; i <= RESIZE_MOVE_COUNT; i += 1) {
    const progress = i / RESIZE_MOVE_COUNT
    const x = startX + RESIZE_MOVE_DISTANCE_PX * Math.sin(progress * Math.PI)
    const tBefore = await page.evaluate(() => performance.now())
    await page.mouse.move(x, startY, { steps: 1 })
    const tAfterDispatch = await page.evaluate(() => performance.now())
    const paintLatency = await waitForDoubleAnimationFrame(page)
    const tAfter = await page.evaluate(() => performance.now())
    const previewVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="column-resize-preview"]')
      if (!(el instanceof HTMLElement)) return false
      return getComputedStyle(el).display !== "none"
    })
    if (previewVisible) previewVisibleCount += 1
    moves.push({
      index: i,
      dispatchMs: tAfterDispatch - tBefore,
      paintLatencyMs: paintLatency,
      totalMs: tAfter - tBefore,
    })
  }

  await page.mouse.up()
  const previewVisibleAfterUp = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="column-resize-preview"]')
    if (!(el instanceof HTMLElement)) return false
    return getComputedStyle(el).display !== "none"
  })
  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])

  const paintLatencies = moves.map((move) => move.paintLatencyMs).sort((a, b) => a - b)
  const dispatchLatencies = moves.map((move) => move.dispatchMs).sort((a, b) => a - b)
  const totalLatencies = moves.map((move) => move.totalMs).sort((a, b) => a - b)
  return {
    targetNodeId: null,
    action: {
      mode: "resize",
      handleCount,
      moveCount: RESIZE_MOVE_COUNT,
      distancePx: RESIZE_MOVE_DISTANCE_PX,
      previewVisibleCount,
      previewVisibleAfterUp,
    },
    paintLatencyMs: {
      p50: percentile(paintLatencies, 0.5),
      p95: percentile(paintLatencies, 0.95),
      p99: percentile(paintLatencies, 0.99),
      max: paintLatencies[paintLatencies.length - 1] ?? null,
    },
    pointerMoveDispatchMs: {
      p50: percentile(dispatchLatencies, 0.5),
      p95: percentile(dispatchLatencies, 0.95),
      p99: percentile(dispatchLatencies, 0.99),
      max: dispatchLatencies[dispatchLatencies.length - 1] ?? null,
    },
    pointerMoveTotalMs: {
      p50: percentile(totalLatencies, 0.5),
      p95: percentile(totalLatencies, 0.95),
      p99: percentile(totalLatencies, 0.99),
      max: totalLatencies[totalLatencies.length - 1] ?? null,
    },
    perfEvents: summarizePerfEvents(perfEvents),
    pageBoundary: null,
  }
}

async function runProbe() {
  const server = shouldStartServer ? startNextDevServer() : null
  if (server) await waitForServer(baseEditorUrl, server)
  const probeDocument = readProbeFlowDocFile()

  const browser = await launchSmokeBrowser(smokeBrowser)
  const consoleErrors = []
  const pageErrors = []
  try {
    const page = await browser.newPage()
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()) })
    page.on("pageerror", (e) => pageErrors.push(e.message))
    if (probeDocument) {
      await page.addInitScript((rawDocument) => {
        window.localStorage.setItem("flowdoc_document", rawDocument)
      }, probeDocument.raw)
    }

    await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
    const probeResult = PROBE_MODE === "resize"
      ? await runResizeProbe(page)
      : await runTypingProbe(page)

    const report = {
      ok: consoleErrors.length === 0 && pageErrors.length === 0,
      probe: {
        mode: PROBE_MODE,
        ...probeResult.action,
        targetNodeId: probeResult.targetNodeId,
        flowDocFile: probeDocument?.path ?? null,
      },
      paintLatencyMs: probeResult.paintLatencyMs,
      ...(probeResult.keystrokeTotalMs ? { keystrokeTotalMs: probeResult.keystrokeTotalMs } : {}),
      ...(probeResult.pointerMoveDispatchMs ? { pointerMoveDispatchMs: probeResult.pointerMoveDispatchMs } : {}),
      ...(probeResult.pointerMoveTotalMs ? { pointerMoveTotalMs: probeResult.pointerMoveTotalMs } : {}),
      perfEvents: probeResult.perfEvents,
      pageBoundary: probeResult.pageBoundary,
      console: {
        errors: consoleErrors.length,
        pageErrors: pageErrors.length,
      },
    }

    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
    if (!report.ok) process.exitCode = 1
  } finally {
    await browser.close()
    if (server) await stopServer(server)
  }
}

runProbe().catch((err) => {
  console.error("[smoothness-probe] failed:", err.message)
  process.exitCode = 1
})
