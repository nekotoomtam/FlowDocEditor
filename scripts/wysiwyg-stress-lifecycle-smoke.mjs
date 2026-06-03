import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const DEFAULT_SMOKE_PORT = 4023
const DEFAULT_STRESS_FILE = "public/mock/flowdoc-stress-mock.flowdoc.json"
const DEFAULT_PAGE_INDEX = 14
const DEFAULT_MAX_CLICK_SWITCH_MS = 2000
const DEFAULT_MAX_EXIT_MS = 2000
const DEFAULT_MAX_RESPONSIVE_FINALIZE_MS = 1000

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const stressFilePath = path.resolve(repoRoot, process.env.FLOWDOC_STRESS_FILE ?? process.env.FLOWDOC_PROBE_FILE ?? DEFAULT_STRESS_FILE)
const targetPageIndex = Number(process.env.STRESS_PAGE_INDEX ?? process.env.PROBE_TARGET_PAGE_INDEX ?? DEFAULT_PAGE_INDEX)
const maxClickSwitchMs = Number(process.env.MAX_CLICK_SWITCH_MS ?? DEFAULT_MAX_CLICK_SWITCH_MS)
const maxExitMs = Number(process.env.MAX_EXIT_MS ?? DEFAULT_MAX_EXIT_MS)
const maxResponsiveFinalizeMs = Number(process.env.MAX_RESPONSIVE_FINALIZE_MS ?? DEFAULT_MAX_RESPONSIVE_FINALIZE_MS)
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function now() {
  return Date.now()
}

function editorUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
}

function startNextDevServer() {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(smokePort)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(smokePort),
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
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stderr.write(text)
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

async function waitForServer(url, server, timeoutMs = 90000) {
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

function pageFrameSelector(pageIndex) {
  return `[data-testid="editor-page-frame"][data-page-index="${pageIndex}"]`
}

function paragraphSelectorForPage(pageIndex) {
  return `${pageFrameSelector(pageIndex)} [data-testid="editor-fragment"][data-node-type="paragraph"]`
}

function bridgeSelectorForNode(nodeId) {
  return `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`
}

function inlineEditSelectorForNode(nodeId) {
  return `[data-inline-edit-node-id="${nodeId}"]`
}

async function waitForDoubleAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

async function waitForReadyEditor(page) {
  await page.waitForSelector('[data-testid="editor-shell"]', { timeout: 30000 })
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-blocking") === "false"
  ), null, { timeout: 180000 })
}

async function scrollTargetPageIntoView(page) {
  await page.waitForSelector(pageFrameSelector(targetPageIndex), { timeout: 180000 })
  await page.evaluate((selector) => {
    document.querySelector(selector)?.scrollIntoView({ block: "start" })
  }, pageFrameSelector(targetPageIndex))
  await page.waitForFunction((selector) => (
    document.querySelectorAll(selector).length >= 2
  ), paragraphSelectorForPage(targetPageIndex), { timeout: 30000 })
  await waitForDoubleAnimationFrame(page)
}

async function visibleParagraphTargets(page) {
  return await page.locator(paragraphSelectorForPage(targetPageIndex)).evaluateAll((elements) => {
    const seen = new Set()
    return elements
      .map((element, index) => {
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + Math.min(Math.max(rect.height / 2, 4), rect.height - 2)
        const hit = document.elementFromPoint(x, y)
        return {
          index,
          nodeId: element.getAttribute("data-node-id"),
          lineStart: element.getAttribute("data-line-start"),
          inlineEditable: element.getAttribute("data-inline-editable") === "true",
          x,
          y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          hitTestId: hit?.getAttribute("data-testid") ?? null,
        }
      })
      .filter((item) => {
        if (!item.nodeId || seen.has(item.nodeId)) return false
        seen.add(item.nodeId)
        return (
          item.width > 4 &&
          item.height > 4 &&
          item.inlineEditable &&
          item.nodeId.startsWith("p_") &&
          (item.lineStart == null || item.lineStart === "0") &&
          item.top > 220 &&
          item.top < window.innerHeight - 40 &&
          item.hitTestId !== "list-toolbar"
        )
      })
      .slice(0, 4)
  })
}

async function clickParagraph(page, target) {
  await page.mouse.click(target.x, target.y)
}

async function waitForInlineEdit(page, nodeId, timeoutMs = 5000) {
  try {
    await page.waitForFunction((id) => (
      document.querySelector(`[data-inline-edit-node-id="${id}"]`) !== null
    ), nodeId, { timeout: timeoutMs })
  } catch (error) {
    const diagnostics = await page.evaluate((id) => {
      const fragment = document.querySelector(`[data-testid="editor-fragment"][data-node-id="${CSS.escape(id)}"]`)
      const rect = fragment instanceof Element ? fragment.getBoundingClientRect() : null
      const hit = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(Math.max(rect.height / 2, 4), rect.height - 2))
        : null
      return {
        nodeId: id,
        fragmentAttached: Boolean(fragment),
        fragmentInlineEditable: fragment?.getAttribute("data-inline-editable") ?? null,
        fragmentNodeType: fragment?.getAttribute("data-node-type") ?? null,
        fragmentParentNodeId: fragment?.getAttribute("data-parent-node-id") ?? null,
        fragmentLineStart: fragment?.getAttribute("data-line-start") ?? null,
        fragmentLineEnd: fragment?.getAttribute("data-line-end") ?? null,
        hitTag: hit?.tagName ?? null,
        hitTestId: hit instanceof Element ? hit.getAttribute("data-testid") : null,
        hitNodeId: hit instanceof Element ? hit.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null : null,
        activeInlineEditNodeId: document.querySelector("[data-inline-edit-node-id]")?.getAttribute("data-inline-edit-node-id") ?? null,
        inputBridgeCount: document.querySelectorAll('[data-wysiwyg-input-bridge="true"]').length,
        activeIslandCount: document.querySelectorAll('[data-wysiwyg-active-visual-mode="flowdoc-draft-editor-island"]').length,
        lastPerfEvents: (window.__flowDocWysiwygPerfEvents ?? []).slice(-8),
      }
    }, nodeId)
    throw new Error(`Timed out waiting for inline edit on ${nodeId}: ${JSON.stringify(diagnostics)}`)
  }
}

async function dispatchBridgeEscape(page, nodeId) {
  await page.evaluate((id) => {
    const bridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${id}"]`)
    bridge?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  }, nodeId)
}

async function clearPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
  })
}

async function startLayoutMonitor(page) {
  await page.evaluate(() => {
    const state = {
      loadingAppeared: !!document.querySelector('[data-testid="initial-layout-loading"]'),
      blockingTrue: document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-blocking") === "true",
      statuses: [],
    }
    const record = () => {
      const shell = document.querySelector('[data-testid="editor-shell"]')
      if (document.querySelector('[data-testid="initial-layout-loading"]')) state.loadingAppeared = true
      if (shell?.getAttribute("data-preview-layout-blocking") === "true") state.blockingTrue = true
      const status = shell?.getAttribute("data-preview-layout-status")
      if (status && state.statuses[state.statuses.length - 1] !== status) state.statuses.push(status)
    }
    const observer = new MutationObserver(record)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-preview-layout-blocking", "data-preview-layout-status"],
    })
    window.__flowDocStressLifecycleSmoke = { state, observer }
    record()
  })
}

async function readSmokeState(page, targetNodeId) {
  return await page.evaluate((nodeId) => {
    const smoke = window.__flowDocStressLifecycleSmoke
    smoke?.observer?.disconnect?.()
    const shell = document.querySelector('[data-testid="editor-shell"]')
    const perfEvents = (window.__flowDocWysiwygPerfEvents ?? []).map((event) => ({
      kind: event.kind,
      startedAt: event.startedAt == null ? null : Math.round(event.startedAt * 10) / 10,
      durationMs: Math.round(event.durationMs * 10) / 10,
      source: event.source,
      action: event.action,
      active: event.active,
      nodeId: event.nodeId,
      pageIndex: event.pageIndex,
      pageCount: event.pageCount,
      fragmentCount: event.fragmentCount,
    }))
    return {
      shell: {
        blocking: shell?.getAttribute("data-preview-layout-blocking"),
        status: shell?.getAttribute("data-preview-layout-status"),
        wysiwyg: shell?.getAttribute("data-wysiwyg-text-engine-enabled"),
        rich: shell?.getAttribute("data-wysiwyg-rich-text-draft-enabled"),
      },
      loadingVisible: !!document.querySelector('[data-testid="initial-layout-loading"]'),
      monitor: smoke?.state ?? null,
      activeInlineEditNodeId: document.querySelector("[data-inline-edit-node-id]")?.getAttribute("data-inline-edit-node-id") ?? null,
      targetFragmentPresent: !!document.querySelector(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`),
      undoDisabled: document.querySelector('button[title="Undo (Ctrl+Z)"]')?.hasAttribute("disabled") ?? null,
      redoDisabled: document.querySelector('button[title="Redo (Ctrl+Y)"]')?.hasAttribute("disabled") ?? null,
      perfEvents,
    }
  }, targetNodeId)
}

function percentile(values, percentileRank) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarizeDurations(events, kind) {
  const values = events
    .filter((event) => event.kind === kind && Number.isFinite(event.durationMs))
    .map((event) => event.durationMs)
  return {
    count: values.length,
    totalMs: Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: values.length > 0 ? Math.max(...values) : null,
  }
}

function summarizeLifecyclePerf(state) {
  const events = state.perfEvents
  return {
    inlineEditStart: summarizeDurations(events, "inline-edit-start"),
    inlineEditFinalize: summarizeDurations(events, "inline-edit-finalize"),
    inlineEditEnd: summarizeDurations(events, "inline-edit-end"),
    flowdocIslandReactCommit: summarizeDurations(events, "flowdoc-island-react-commit"),
    editorCanvasReactCommit: summarizeDurations(events, "editor-canvas-react-commit"),
    flowdocIslandParentSync: summarizeDurations(events, "flowdoc-island-parent-sync"),
    flowdocIslandBlurHandoff: summarizeDurations(events, "flowdoc-island-blur-handoff"),
    browserPreviewPagination: summarizeDurations(events, "browser-preview-pagination"),
    countByKind: events.reduce((acc, event) => {
      acc[event.kind] = (acc[event.kind] ?? 0) + 1
      return acc
    }, {}),
    firstEvents: events.slice(0, 12),
    lastEvents: events.slice(-12),
  }
}

function assertNoBlocking(state, label) {
  assert(state.shell.blocking !== "true", `${label}: preview layout is blocking`)
  assert(!state.loadingVisible, `${label}: initial layout loading overlay is visible`)
  assert(!state.monitor?.loadingAppeared, `${label}: initial layout loading overlay appeared`)
  assert(!state.monitor?.blockingTrue, `${label}: preview layout blocking became true`)
}

function assertResponsivePerf(state, label) {
  const finalizeEvents = state.perfEvents.filter((event) => event.kind === "inline-edit-finalize")
  assert(finalizeEvents.length > 0, `${label}: expected at least one inline-edit-finalize event`)
  const settledEvents = finalizeEvents.filter((event) => event.source === "settled-preview")
  assert(settledEvents.length === 0, `${label}: found settled-preview finalize event`)
  const slowEvents = finalizeEvents.filter((event) => event.durationMs > maxResponsiveFinalizeMs)
  assert(
    slowEvents.length === 0,
    `${label}: responsive finalize exceeded ${maxResponsiveFinalizeMs}ms (${slowEvents.map((event) => event.durationMs).join(", ")})`,
  )
  assert(
    state.perfEvents.every((event) => event.kind !== "inline-edit-exit-pagination"),
    `${label}: synchronous inline-edit-exit-pagination event was recorded`,
  )
}

async function runSmoke() {
  const rawStressDoc = await readFile(stressFilePath, "utf8")
  let server = null
  let browser = null
  const pageErrors = []
  const consoleErrors = []

  try {
    if (shouldStartServer) {
      server = startNextDevServer()
      await waitForServer(baseEditorUrl, server)
    }

    browser = await launchSmokeBrowser(smokeBrowser)
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript(({ rawDocument }) => {
      if (location.origin === "null") return
      try {
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem("flowdoc_document", rawDocument)
        localStorage.setItem("flowdoc.wysiwygPerfTrace", "1")
      } catch (error) {
        window.__flowDocStressLifecycleStorageError = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`
      }
    }, { rawDocument: rawStressDoc })

    const page = await context.newPage()
    page.on("pageerror", (error) => pageErrors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })

    const loadStartedAt = now()
    await page.goto(editorUrl(), { waitUntil: "domcontentloaded", timeout: 180000 })
    await waitForReadyEditor(page)
    await scrollTargetPageIntoView(page)

    const storageState = await page.evaluate(() => ({
      storedLength: localStorage.getItem("flowdoc_document")?.length ?? 0,
      storageError: window.__flowDocStressLifecycleStorageError ?? null,
    }))
    assert(storageState.storageError == null, `Could not store stress document: ${storageState.storageError}`)

    const targets = await visibleParagraphTargets(page)
    assert(targets.length >= 2, `Need at least 2 visible paragraph targets on page ${targetPageIndex + 1}`)

    const [firstTarget, secondTarget] = targets

    await clearPerfEvents(page)
    await clickParagraph(page, firstTarget)
    await waitForInlineEdit(page, firstTarget.nodeId)
    await waitForDoubleAnimationFrame(page)

    await clearPerfEvents(page)
    await startLayoutMonitor(page)
    const clickSwitchStartedAt = now()
    await clickParagraph(page, secondTarget)
    await waitForInlineEdit(page, secondTarget.nodeId)
    const clickSwitchMs = now() - clickSwitchStartedAt
    await page.waitForTimeout(800)
    const clickSwitchState = await readSmokeState(page, secondTarget.nodeId)
    assert(clickSwitchMs <= maxClickSwitchMs, `Click switch took ${clickSwitchMs}ms, expected <= ${maxClickSwitchMs}ms`)
    assertNoBlocking(clickSwitchState, "click-switch")
    assertResponsivePerf(clickSwitchState, "click-switch")

    await clearPerfEvents(page)
    await startLayoutMonitor(page)
    const exitStartedAt = now()
    await dispatchBridgeEscape(page, secondTarget.nodeId)
    await page.waitForFunction(() => document.querySelectorAll("[data-inline-edit-node-id]").length === 0, null, { timeout: 10000 })
    const exitMs = now() - exitStartedAt
    await page.waitForTimeout(800)
    const exitState = await readSmokeState(page, secondTarget.nodeId)
    assert(exitMs <= maxExitMs, `WYSIWYG exit took ${exitMs}ms, expected <= ${maxExitMs}ms`)
    assertNoBlocking(exitState, "exit")
    assertResponsivePerf(exitState, "exit")

    await page.keyboard.press("Delete")
    await page.waitForSelector('button[title="Undo (Ctrl+Z)"]:not([disabled])', { timeout: 10000 })
    await page.waitForTimeout(200)

    await clearPerfEvents(page)
    await startLayoutMonitor(page)
    const undoStartedAt = now()
    await page.keyboard.press(`${platformShortcut}+Z`)
    await page.waitForTimeout(1000)
    const undoState = await readSmokeState(page, secondTarget.nodeId)
    assertNoBlocking(undoState, "undo")
    assert(undoState.targetFragmentPresent, "Undo did not restore the deleted paragraph fragment")
    assert(undoState.redoDisabled === false, "Redo button did not become enabled after undo")

    assert(pageErrors.length === 0, `Page errors:\n${pageErrors.join("\n")}`)
    assert(consoleErrors.length === 0, `Console errors:\n${consoleErrors.join("\n")}`)

    const summary = {
      ok: true,
      browser: smokeBrowserLabel(smokeBrowser),
      url: editorUrl(),
      stressFile: path.relative(repoRoot, stressFilePath),
      storedLength: storageState.storedLength,
      loadMs: now() - loadStartedAt,
      targetPageIndex,
      targets: {
        first: firstTarget.nodeId,
        second: secondTarget.nodeId,
      },
      clickSwitchMs,
      exitMs,
      undoObservedMs: now() - undoStartedAt,
      clickSwitchStartEvents: clickSwitchState.perfEvents.filter((event) => event.kind === "inline-edit-start"),
      clickSwitchFinalizeEvents: clickSwitchState.perfEvents.filter((event) => event.kind === "inline-edit-finalize"),
      exitStartEvents: exitState.perfEvents.filter((event) => event.kind === "inline-edit-start"),
      exitFinalizeEvents: exitState.perfEvents.filter((event) => event.kind === "inline-edit-finalize"),
      clickSwitchPerf: summarizeLifecyclePerf(clickSwitchState),
      exitPerf: summarizeLifecyclePerf(exitState),
      undoPerf: summarizeLifecyclePerf(undoState),
      undoStatus: undoState.shell.status,
    }

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await browser?.close()
    await stopNextDevServer(server)
  }
}

runSmoke().catch((error) => {
  console.error(error)
  process.exit(1)
})
