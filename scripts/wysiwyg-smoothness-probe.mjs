import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser } from "./smoke-browser.mjs"

// Phase C smoothness probe. Types a controlled burst into the Stage 3
// boundary scenario and measures objective signals from the existing
// WYSIWYG perf trace plus keypress->paint latency. The probe writes a
// JSON report so smoothness can be compared across runs and against the
// threshold table in docs/WYSIWYG_SMOOTHNESS_PROBE.md.

const DEFAULT_PORT = 4017
const TARGET_NODE_ID = "stage3-boundary-target"
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const TYPE_BURST_LENGTH = Number(process.env.PROBE_BURST_LENGTH ?? 400)
const TYPE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 30)
const FRAME_BUDGET_MS = 16
const JANK_BUDGET_MS = 100

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })

const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${TARGET_NODE_ID}"]`
const fragmentSelector = `[data-testid="editor-fragment"][data-node-id="${TARGET_NODE_ID}"]`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  return url.toString()
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.floor(p * (sortedValues.length - 1)))
  return sortedValues[index]
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

async function runProbe() {
  const server = shouldStartServer ? startNextDevServer() : null
  if (server) await waitForServer(baseEditorUrl, server)

  const browser = await launchSmokeBrowser(smokeBrowser)
  const consoleErrors = []
  const pageErrors = []
  try {
    const page = await browser.newPage()
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()) })
    page.on("pageerror", (e) => pageErrors.push(e.message))

    await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
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
      const paintLatency = await page.evaluate(() => new Promise((resolve) => {
        const start = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve(performance.now() - start)
        }))
      }))
      const tAfter = await page.evaluate(() => performance.now())
      keystrokes.push({ index: i, paintLatencyMs: paintLatency, totalMs: tAfter - tBefore })
      await page.waitForTimeout(TYPE_INTERVAL_MS)
    }

    const endFragmentCount = await page.locator(fragmentSelector).count()
    const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])

    // Stats.
    const paintLatencies = keystrokes.map((k) => k.paintLatencyMs).sort((a, b) => a - b)
    const totalLatencies = keystrokes.map((k) => k.totalMs).sort((a, b) => a - b)
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

    const report = {
      ok: consoleErrors.length === 0 && pageErrors.length === 0,
      probe: {
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
      perfEvents: {
        total: perfEvents.length,
        countByKind: eventCounts,
        overFrameBudget: slowEvents,
        jankCount: jankEvents,
        longestEvent: longestEvent.kind ? {
          kind: longestEvent.kind,
          durationMs: longestEvent.durationMs,
        } : null,
      },
      pageBoundary: {
        startFragmentCount,
        endFragmentCount,
        crossed: endFragmentCount > startFragmentCount,
      },
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
