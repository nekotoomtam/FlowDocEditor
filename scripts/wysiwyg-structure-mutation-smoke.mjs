import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveFlowDocFixtureTarget } from "./flowdoc-fixture-targets.mjs"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const DEFAULT_SMOKE_PORT = 4025
const DEFAULT_STRESS_FILE = "public/mock/stress-long-v2.flowdoc.json"
const DEFAULT_TABLE_ALIAS = "table.primaryTable"
const DEFAULT_FLOW_ROW_ALIAS = "flowRow.resizeTarget"
const DEFAULT_FLOW_LEFT_STACK_ALIAS = "flowRow.leftStack"
const DEFAULT_FLOW_RIGHT_STACK_ALIAS = "flowRow.rightStack"
const DEFAULT_READY_TIMEOUT_MS = 240000
const DEFAULT_MAX_MUTATION_MS = 8000
const DEFAULT_MAX_PREVIEW_FULL_WAIT_MS = 15000

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const stressFilePath = path.resolve(
  repoRoot,
  process.env.FLOWDOC_STRUCTURE_FILE ??
    process.env.FLOWDOC_MUTATION_FILE ??
    process.env.FLOWDOC_STRESS_FILE ??
    process.env.FLOWDOC_PROBE_FILE ??
    DEFAULT_STRESS_FILE,
)
const tableAlias = process.env.STRUCTURE_TABLE_ALIAS?.trim() || DEFAULT_TABLE_ALIAS
const flowRowAlias = process.env.STRUCTURE_FLOW_ROW_ALIAS?.trim() || DEFAULT_FLOW_ROW_ALIAS
const flowLeftStackAlias = process.env.STRUCTURE_FLOW_LEFT_STACK_ALIAS?.trim() || DEFAULT_FLOW_LEFT_STACK_ALIAS
const flowRightStackAlias = process.env.STRUCTURE_FLOW_RIGHT_STACK_ALIAS?.trim() || DEFAULT_FLOW_RIGHT_STACK_ALIAS
const readyTimeoutMs = readIntegerOption(
  "ready-timeout-ms",
  ["STRUCTURE_READY_TIMEOUT_MS", "MUTATION_READY_TIMEOUT_MS", "PROBE_READY_TIMEOUT_MS"],
  DEFAULT_READY_TIMEOUT_MS,
  1,
)
const maxMutationMs = readIntegerOption(
  "max-mutation-ms",
  ["STRUCTURE_MAX_MS", "MUTATION_MAX_MS"],
  DEFAULT_MAX_MUTATION_MS,
  1,
)
const maxPreviewFullWaitMs = readIntegerOption(
  "max-preview-full-wait-ms",
  ["STRUCTURE_MAX_PREVIEW_FULL_WAIT_MS", "MUTATION_MAX_PREVIEW_FULL_WAIT_MS"],
  DEFAULT_MAX_PREVIEW_FULL_WAIT_MS,
  1,
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readCliOption(name) {
  const exact = `--${name}`
  const prefix = `${exact}=`
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (arg === exact) return process.argv[index + 1]
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function readIntegerOption(name, envNames, defaultValue, minValue) {
  const envValue = envNames
    .map((envName) => process.env[envName])
    .find((value) => value != null && value !== "")
  const rawValue = readCliOption(name) ?? envValue
  if (rawValue == null || rawValue === "") return defaultValue
  const value = Number(rawValue)
  assert(
    Number.isInteger(value) && value >= minValue,
    `${name} must be an integer >= ${minValue}; received ${JSON.stringify(rawValue)}`,
  )
  return value
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

function cssAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function fragmentSelectorForNode(nodeId) {
  return `[data-testid="editor-fragment"][data-node-id="${cssAttributeValue(nodeId)}"]`
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
  ), null, { timeout: readyTimeoutMs })
  await waitForPreviewLayoutFull(page, "initial", readyTimeoutMs)
}

async function waitForPreviewLayoutFull(page, label, timeoutMs) {
  const startedAt = now()
  try {
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-status") === "full"
    ), null, { timeout: timeoutMs })
  } catch (error) {
    const status = await page.evaluate(() => (
      document.querySelector('[data-testid="editor-shell"]')?.getAttribute("data-preview-layout-status") ?? null
    ))
    throw new Error(`${label}: preview layout did not settle to full within ${timeoutMs}ms; last status=${status}`)
  }
  return now() - startedAt
}

async function clearPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
    window.__flowDocWysiwygPerfAttributionEvents = []
  })
}

async function revealFragmentForNode(page, nodeId) {
  const selector = fragmentSelectorForNode(nodeId)
  if (await page.locator(selector).first().count() > 0) return true

  const pageFrameSelector = '[data-testid="editor-page-frame"]'
  await page.locator(pageFrameSelector).first().waitFor({ state: "attached", timeout: 30000 })
  const pageIndexes = await page.locator(pageFrameSelector).evaluateAll((frames) => (
    frames
      .map((frame) => Number(frame.getAttribute("data-page-index")))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
  ))

  for (const pageIndex of pageIndexes) {
    await page.evaluate((index) => {
      document.querySelector(`[data-testid="editor-page-frame"][data-page-index="${index}"]`)
        ?.scrollIntoView({ block: "center" })
    }, pageIndex)
    await waitForDoubleAnimationFrame(page)
    if (await page.locator(selector).first().count() > 0) return true
  }

  return false
}

async function fragmentTargetForNode(page, nodeId) {
  assert(await revealFragmentForNode(page, nodeId), `Could not reveal fragment for node ${nodeId}`)
  await page.waitForFunction((id) => (
    document.querySelector(`[data-testid="editor-fragment"][data-node-id="${CSS.escape(id)}"]`) !== null
  ), nodeId, { timeout: 30000 })
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="editor-fragment"][data-node-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "center" })
  }, nodeId)
  await waitForDoubleAnimationFrame(page)

  const target = await page.evaluate((id) => {
    const elements = Array.from(document.querySelectorAll(
      `[data-testid="editor-fragment"][data-node-id="${CSS.escape(id)}"]`,
    ))
    const element = elements.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      return rect.width > 4 && rect.height > 4 && (
        candidate.getAttribute("data-line-start") == null ||
        candidate.getAttribute("data-line-start") === "0"
      )
    }) ?? elements.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      return rect.width > 4 && rect.height > 4
    })
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      nodeId: id,
      nodeType: element.getAttribute("data-node-type"),
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(Math.max(rect.height / 2, 4), rect.height - 2),
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
    }
  }, nodeId)

  assert(target, `Could not resolve visible target rect for node ${nodeId}`)
  return target
}

function summarizePerfEvents(events) {
  const byKind = {}
  for (const event of events) {
    const key = event?.kind ?? "unknown"
    byKind[key] = (byKind[key] ?? 0) + 1
  }
  return {
    count: events.length,
    byKind,
    browserPreviewPagination: events.filter((event) => event?.kind === "browser-preview-pagination").length,
    editorCanvasCommit: events.filter((event) => event?.kind === "editor-canvas-react-commit").length,
    previewSettleRuntime: events.filter((event) => event?.kind === "flowdoc-preview-settle-runtime").length,
  }
}

function unitWidthValue(width) {
  if (typeof width === "number") return width
  if (width && typeof width === "object" && Number.isFinite(width.value)) return width.value
  return null
}

function collectDocumentNodes(editorDocument) {
  const nodes = {}
  for (const section of editorDocument?.document?.sections ?? []) {
    for (const [nodeId, node] of Object.entries(section.nodes ?? {})) {
      nodes[nodeId] = node
      if (node?.type === "flow-table") {
        for (const [innerId, inner] of Object.entries(node.nodes ?? {})) {
          nodes[innerId] = inner
        }
      }
    }
  }
  return nodes
}

function summarizeDocument(editorDocument) {
  const nodes = collectDocumentNodes(editorDocument)
  const layoutNodeIds = Object.keys(nodes)
  const bodyChildIds = []
  for (const section of editorDocument?.document?.sections ?? []) {
    const body = section.nodes?.[section.bodyRootId]
    if (body?.type === "body" && Array.isArray(body.childIds)) {
      bodyChildIds.push(...body.childIds)
    }
  }

  const tables = {}
  const flowRows = {}
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node?.type === "flow-table") {
      tables[nodeId] = {
        rowIds: [...(node.rowIds ?? [])],
        rowCount: node.rowIds?.length ?? 0,
        columnCount: node.columns?.length ?? 0,
        columnWidths: (node.columns ?? []).map((column) => unitWidthValue(column.width)),
        rowCellCounts: (node.rowIds ?? []).map((rowId) => nodes[rowId]?.cellIds?.length ?? null),
      }
    }
    if (node?.type === "flow-row") {
      flowRows[nodeId] = {
        childIds: [...(node.childIds ?? [])],
        childCount: node.childIds?.length ?? 0,
        stackWidths: (node.childIds ?? []).map((childId) => {
          const stack = nodes[childId]
          return stack?.type === "flow-stack" ? stack.props?.widthShare ?? null : null
        }),
      }
    }
  }

  return {
    layoutNodeIds,
    layoutNodeCount: layoutNodeIds.length,
    bodyChildIds,
    bodyChildCount: bodyChildIds.length,
    tables,
    flowRows,
  }
}

async function readStructureState(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="editor-shell"]')
    const smoke = window.__flowDocEditorSmokeState ?? {}
    const perfEvents = [
      ...(window.__flowDocWysiwygPerfEvents ?? []),
      ...(window.__flowDocWysiwygPerfAttributionEvents ?? []),
    ]
    const unitWidthValue = (width) => {
      if (typeof width === "number") return width
      if (width && typeof width === "object" && Number.isFinite(width.value)) return width.value
      return null
    }
    const collectDocumentNodes = (editorDocument) => {
      const nodes = {}
      for (const section of editorDocument?.document?.sections ?? []) {
        for (const [nodeId, node] of Object.entries(section.nodes ?? {})) {
          nodes[nodeId] = node
          if (node?.type === "flow-table") {
            for (const [innerId, inner] of Object.entries(node.nodes ?? {})) {
              nodes[innerId] = inner
            }
          }
        }
      }
      return nodes
    }
    const summarizeDocument = (editorDocument) => {
      const nodes = collectDocumentNodes(editorDocument)
      const layoutNodeIds = Object.keys(nodes)
      const bodyChildIds = []
      for (const section of editorDocument?.document?.sections ?? []) {
        const body = section.nodes?.[section.bodyRootId]
        if (body?.type === "body" && Array.isArray(body.childIds)) {
          bodyChildIds.push(...body.childIds)
        }
      }
      const tables = {}
      const flowRows = {}
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node?.type === "flow-table") {
          tables[nodeId] = {
            rowIds: [...(node.rowIds ?? [])],
            rowCount: node.rowIds?.length ?? 0,
            columnCount: node.columns?.length ?? 0,
            columnWidths: (node.columns ?? []).map((column) => unitWidthValue(column.width)),
            rowCellCounts: (node.rowIds ?? []).map((rowId) => nodes[rowId]?.cellIds?.length ?? null),
          }
        }
        if (node?.type === "flow-row") {
          flowRows[nodeId] = {
            childIds: [...(node.childIds ?? [])],
            childCount: node.childIds?.length ?? 0,
            stackWidths: (node.childIds ?? []).map((childId) => {
              const stack = nodes[childId]
              return stack?.type === "flow-stack" ? stack.props?.widthShare ?? null : null
            }),
          }
        }
      }
      return {
        layoutNodeIds,
        layoutNodeCount: layoutNodeIds.length,
        bodyChildIds,
        bodyChildCount: bodyChildIds.length,
        tables,
        flowRows,
      }
    }
    return {
      shell: {
        status: shell?.getAttribute("data-preview-layout-status") ?? null,
        blocking: shell?.getAttribute("data-preview-layout-blocking") ?? null,
      },
      selectedNodeId: smoke.selectedNodeId ?? null,
      selectionAnchorNodeId: smoke.selectionAnchorNodeId ?? null,
      document: smoke.document ?? null,
      documentSummary: summarizeDocument(smoke.document),
      undoDisabled: document.querySelector('button[title="Undo (Ctrl+Z)"]')?.hasAttribute("disabled") ?? null,
      redoDisabled: document.querySelector('button[title="Redo (Ctrl+Y)"]')?.hasAttribute("disabled") ?? null,
      perfEvents,
    }
  })
}

function compactDocumentSummary(summary) {
  return {
    layoutNodeCount: summary.layoutNodeCount,
    bodyChildCount: summary.bodyChildCount,
    firstBodyChildIds: summary.bodyChildIds.slice(0, 5),
    lastBodyChildIds: summary.bodyChildIds.slice(-5),
    tables: summary.tables,
    flowRows: summary.flowRows,
  }
}

function stripDocumentFromState(state) {
  const { document, perfEvents, documentSummary, ...rest } = state
  return {
    ...rest,
    documentSummary: compactDocumentSummary(documentSummary),
    perfEventCount: perfEvents.length,
  }
}

function assertNoBlockingState(state, label) {
  assert(state.shell.blocking === "false", `${label}: editor shell is blocking preview layout`)
  assert(state.shell.status === "full", `${label}: preview layout status is ${state.shell.status}, expected full`)
}

async function waitForUndoEnabled(page) {
  await page.waitForSelector('button[title="Undo (Ctrl+Z)"]:not([disabled])', { timeout: 10000 })
}

async function waitForTableShape(page, tableId, expected, timeoutMs = 10000) {
  await page.waitForFunction(({ tableId, expected }) => {
    const editorDocument = window.__flowDocEditorSmokeState?.document
    const nodes = {}
    for (const section of editorDocument?.document?.sections ?? []) {
      for (const [nodeId, node] of Object.entries(section.nodes ?? {})) {
        nodes[nodeId] = node
        if (node?.type === "flow-table") {
          for (const [innerId, inner] of Object.entries(node.nodes ?? {})) nodes[innerId] = inner
        }
      }
    }
    const table = nodes[tableId]
    if (table?.type !== "flow-table") return false
    if (expected.rowCount != null && table.rowIds?.length !== expected.rowCount) return false
    if (expected.columnCount != null && table.columns?.length !== expected.columnCount) return false
    if (expected.columnWidths) {
      const widths = (table.columns ?? []).map((column) => {
        const width = column.width
        if (typeof width === "number") return width
        if (width && typeof width === "object" && Number.isFinite(width.value)) return width.value
        return null
      })
      if (widths.length !== expected.columnWidths.length) return false
      for (let index = 0; index < widths.length; index += 1) {
        if (Math.abs((widths[index] ?? NaN) - expected.columnWidths[index]) > 0.01) return false
      }
    }
    return true
  }, { tableId, expected }, { timeout: timeoutMs })
}

async function waitForFlowRowShape(page, rowId, expected, timeoutMs = 10000) {
  await page.waitForFunction(({ rowId, expected }) => {
    const editorDocument = window.__flowDocEditorSmokeState?.document
    const nodes = {}
    for (const section of editorDocument?.document?.sections ?? []) {
      for (const [nodeId, node] of Object.entries(section.nodes ?? {})) nodes[nodeId] = node
    }
    const row = nodes[rowId]
    if (row?.type !== "flow-row") return false
    if (expected.childCount != null && row.childIds?.length !== expected.childCount) return false
    if (expected.stackWidths) {
      const widths = (row.childIds ?? []).map((childId) => {
        const stack = nodes[childId]
        return stack?.type === "flow-stack" ? stack.props?.widthShare ?? null : null
      })
      if (widths.length !== expected.stackWidths.length) return false
      for (let index = 0; index < widths.length; index += 1) {
        if (Math.abs((widths[index] ?? NaN) - expected.stackWidths[index]) > 0.01) return false
      }
    }
    return true
  }, { rowId, expected }, { timeout: timeoutMs })
}

async function performUndo(page, beforeSummary, label, waitForRestore) {
  await clearPerfEvents(page)
  const startedAt = now()
  await page.locator('button[title="Undo (Ctrl+Z)"]').click()
  try {
    await waitForRestore()
  } catch (error) {
    const failureState = await readStructureState(page)
    throw new Error([
      `${label}: undo did not restore expected structure.`,
      `State: ${JSON.stringify(stripDocumentFromState(failureState))}`,
      `Perf: ${JSON.stringify(summarizePerfEvents(failureState.perfEvents))}`,
      String(error?.message ?? error),
    ].join("\n"))
  }
  const fullWaitMs = await waitForPreviewLayoutFull(page, `${label}-undo`, maxPreviewFullWaitMs)
  const state = await readStructureState(page)
  const undoMs = now() - startedAt
  assert(state.redoDisabled === false, `${label}: redo did not become enabled after undo`)
  assertNoBlockingState(state, `${label}-undo`)
  assert(
    state.documentSummary.layoutNodeCount === beforeSummary.layoutNodeCount,
    `${label}: undo restored shape but layout node count is ${state.documentSummary.layoutNodeCount}, expected ${beforeSummary.layoutNodeCount}`,
  )
  return {
    undoMs,
    fullWaitMs,
    state: stripDocumentFromState(state),
    perf: summarizePerfEvents(state.perfEvents),
  }
}

async function clickLocatorCenter(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 10000 })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  assert(box, `Could not read ${label} bounding box`)
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function dragLocatorBy(locator, deltaX, deltaY, label) {
  await locator.waitFor({ state: "visible", timeout: 10000 })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  assert(box, `Could not read ${label} bounding box`)
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const to = { x: from.x + deltaX, y: from.y + deltaY }
  await locator.page().mouse.move(from.x, from.y)
  await locator.page().mouse.down()
  await locator.page().mouse.move(to.x, to.y, { steps: 8 })
  await waitForDoubleAnimationFrame(locator.page())
  await locator.page().mouse.up()
  return { from, to }
}

async function selectNodeAndShowActionRail(page, nodeId) {
  const target = await fragmentTargetForNode(page, nodeId)
  const railSelector = `[data-testid="canvas-action-rail"][data-node-id="${cssAttributeValue(nodeId)}"]`
  const clickCandidates = [
    { label: "center", x: target.x, y: target.y },
    { label: "top-left", x: target.left + Math.min(8, Math.max(3, target.width / 20)), y: target.top + Math.min(8, Math.max(3, target.height / 20)) },
    { label: "left-mid", x: target.left + Math.min(8, Math.max(3, target.width / 20)), y: target.y },
    { label: "top-mid", x: target.x, y: target.top + Math.min(8, Math.max(3, target.height / 20)) },
    { label: "bottom-left", x: target.left + Math.min(8, Math.max(3, target.width / 20)), y: target.bottom - Math.min(8, Math.max(3, target.height / 20)) },
  ]
  const attempts = []

  for (const candidate of clickCandidates) {
    const hitBeforeClick = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      const closestNode = hit?.closest?.("[data-node-id]")
      return {
        hitTestId: hit?.getAttribute?.("data-testid") ?? null,
        hitNodeId: closestNode?.getAttribute?.("data-node-id") ?? null,
        hitNodeType: closestNode?.getAttribute?.("data-node-type") ?? null,
        tagName: hit?.tagName ?? null,
      }
    }, candidate)
    await page.mouse.click(candidate.x, candidate.y)
    await waitForDoubleAnimationFrame(page)
    if (await page.locator(`[data-inline-edit-node-id="${cssAttributeValue(nodeId)}"]`).first().count() > 0) {
      await page.keyboard.press("Escape")
      await page.waitForFunction(() => (
        document.querySelectorAll("[data-inline-edit-node-id]").length === 0
      ), null, { timeout: 10000 })
      await waitForDoubleAnimationFrame(page)
    }
    const state = await readStructureState(page)
    const railCount = await page.locator(railSelector).count()
    attempts.push({
      label: candidate.label,
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      hitBeforeClick,
      selectedNodeId: state.selectedNodeId,
      selectionAnchorNodeId: state.selectionAnchorNodeId,
      railCount,
    })
    if (railCount > 0) return
  }

  const state = await readStructureState(page)
  throw new Error([
    `Could not show action rail for node ${nodeId}.`,
    `Attempts: ${JSON.stringify(attempts)}`,
    `State: ${JSON.stringify(stripDocumentFromState(state))}`,
  ].join("\n"))
}

async function selectNodeFromOutline(page, nodeId, expectedSelector = null) {
  await page.locator('[data-testid="editor-left-rail-mode-outline"]').click()
  await page.locator('[data-testid="outline-panel-title"]').waitFor({ state: "visible", timeout: 30000 })
  await page.waitForFunction(() => {
    const title = document.querySelector('[data-testid="outline-panel-title"]')
    return title?.parentElement?.querySelector("[data-outline-row-count]") != null
  }, null, { timeout: 30000 })

  const rowSelector = `[data-testid="outline-node-row"][data-outline-node-id="${cssAttributeValue(nodeId)}"]`
  let previousScrollTop = -1
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const row = page.locator(rowSelector).first()
    if (await row.count() > 0) {
      await row.scrollIntoViewIfNeeded()
      await row.click()
      await page.waitForFunction((id) => (
        window.__flowDocEditorSmokeState?.selectedNodeId === id
      ), nodeId, { timeout: 10000 })
      if (expectedSelector) {
        await page.waitForSelector(expectedSelector, { timeout: 10000 })
      }
      return
    }

    const scrollState = await page.evaluate(() => {
      const title = document.querySelector('[data-testid="outline-panel-title"]')
      const root = title?.parentElement?.querySelector("[data-outline-row-count]")
      if (!(root instanceof HTMLElement)) return null
      const previous = root.scrollTop
      const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
      const step = Math.max(160, root.clientHeight * 0.85)
      root.scrollTop = Math.min(maxScrollTop, root.scrollTop + step)
      return {
        previous,
        next: root.scrollTop,
        maxScrollTop,
        rowCount: root.getAttribute("data-outline-row-count"),
        renderedRowCount: root.getAttribute("data-outline-rendered-row-count"),
      }
    })
    await waitForDoubleAnimationFrame(page)
    if (!scrollState) break
    if (scrollState.next === previousScrollTop || scrollState.next >= scrollState.maxScrollTop) {
      previousScrollTop = scrollState.next
      if (attempt > 0) break
    } else {
      previousScrollTop = scrollState.next
    }
  }

  const state = await readStructureState(page)
  throw new Error([
    `Could not reveal outline row for node ${nodeId}.`,
    `State: ${JSON.stringify(stripDocumentFromState(state))}`,
  ].join("\n"))
}

async function selectNodeForProperties(page, nodeId, expectedSelector) {
  const target = await fragmentTargetForNode(page, nodeId)
  await page.mouse.click(target.x, target.y)
  await waitForDoubleAnimationFrame(page)
  if (expectedSelector) {
    try {
      await page.waitForSelector(expectedSelector, { timeout: 3000 })
    } catch (error) {
      await selectNodeFromOutline(page, nodeId, expectedSelector)
    }
  }
}

async function runTableAddRowSmoke(page, tableId) {
  const before = await readStructureState(page)
  const beforeTable = before.documentSummary.tables[tableId]
  assert(beforeTable, `table-add-row: table ${tableId} not found before mutation`)

  await selectNodeFromOutline(page, tableId, '[data-testid="flow-table-add-row"]')
  await clearPerfEvents(page)
  const startedAt = now()
  await clickLocatorCenter(page.locator('[data-testid="flow-table-add-row"]').first(), "table add row action")
  await waitForUndoEnabled(page)
  await waitForTableShape(page, tableId, { rowCount: beforeTable.rowCount + 1, columnCount: beforeTable.columnCount })
  const fullWaitMs = await waitForPreviewLayoutFull(page, "table-add-row", maxPreviewFullWaitMs)
  const after = await readStructureState(page)
  const afterTable = after.documentSummary.tables[tableId]
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `table-add-row took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(afterTable.rowCount === beforeTable.rowCount + 1, "table-add-row did not add exactly one row")
  assert(afterTable.columnCount === beforeTable.columnCount, "table-add-row changed column count")
  assertNoBlockingState(after, "table-add-row")

  const undo = await performUndo(
    page,
    before.documentSummary,
    "table-add-row",
    () => waitForTableShape(page, tableId, { rowCount: beforeTable.rowCount, columnCount: beforeTable.columnCount }),
  )
  return {
    mutationMs,
    fullWaitMs,
    tableId,
    beforeTable,
    afterTable,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

async function runTableAddColumnSmoke(page, tableId) {
  const before = await readStructureState(page)
  const beforeTable = before.documentSummary.tables[tableId]
  assert(beforeTable, `table-add-column: table ${tableId} not found before mutation`)

  await selectNodeFromOutline(page, tableId, '[data-testid="flow-table-add-column"]')
  await clearPerfEvents(page)
  const startedAt = now()
  await clickLocatorCenter(page.locator('[data-testid="flow-table-add-column"]').first(), "table add column action")
  await waitForUndoEnabled(page)
  await waitForTableShape(page, tableId, { rowCount: beforeTable.rowCount, columnCount: beforeTable.columnCount + 1 })
  const fullWaitMs = await waitForPreviewLayoutFull(page, "table-add-column", maxPreviewFullWaitMs)
  const after = await readStructureState(page)
  const afterTable = after.documentSummary.tables[tableId]
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `table-add-column took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(afterTable.columnCount === beforeTable.columnCount + 1, "table-add-column did not add exactly one column")
  assert(afterTable.rowCount === beforeTable.rowCount, "table-add-column changed row count")
  assertNoBlockingState(after, "table-add-column")

  const undo = await performUndo(
    page,
    before.documentSummary,
    "table-add-column",
    () => waitForTableShape(page, tableId, { rowCount: beforeTable.rowCount, columnCount: beforeTable.columnCount }),
  )
  return {
    mutationMs,
    fullWaitMs,
    tableId,
    beforeTable,
    afterTable,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

function widthsChanged(beforeWidths, afterWidths) {
  if (beforeWidths.length !== afterWidths.length) return false
  return beforeWidths.some((width, index) => Math.abs((width ?? NaN) - (afterWidths[index] ?? NaN)) > 0.01)
}

async function runTableResizeSmoke(page, tableId) {
  const before = await readStructureState(page)
  const beforeTable = before.documentSummary.tables[tableId]
  assert(beforeTable, `table-resize: table ${tableId} not found before mutation`)
  assert(beforeTable.columnWidths.length >= 2, "table-resize needs at least two columns")

  await selectNodeFromOutline(page, tableId)
  await fragmentTargetForNode(page, tableId)
  const resizeHandle = page.locator(`[data-testid="table-column-resize-handle"][data-table-id="${cssAttributeValue(tableId)}"]`).first()
  await clearPerfEvents(page)
  const startedAt = now()
  const drag = await dragLocatorBy(resizeHandle, 48, 0, "table column resize handle")
  await waitForUndoEnabled(page)
  await page.waitForFunction(({ tableId, beforeWidths }) => {
    const editorDocument = window.__flowDocEditorSmokeState?.document
    for (const section of editorDocument?.document?.sections ?? []) {
      const table = section.nodes?.[tableId]
      if (table?.type !== "flow-table") continue
      const widths = (table.columns ?? []).map((column) => {
        const width = column.width
        if (typeof width === "number") return width
        if (width && typeof width === "object" && Number.isFinite(width.value)) return width.value
        return null
      })
      return widths.some((width, index) => Math.abs((width ?? NaN) - beforeWidths[index]) > 0.01)
    }
    return false
  }, { tableId, beforeWidths: beforeTable.columnWidths }, { timeout: 10000 })
  const fullWaitMs = await waitForPreviewLayoutFull(page, "table-resize", maxPreviewFullWaitMs)
  const after = await readStructureState(page)
  const afterTable = after.documentSummary.tables[tableId]
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `table-resize took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(widthsChanged(beforeTable.columnWidths, afterTable.columnWidths), "table-resize did not change column widths")
  assert(afterTable.rowCount === beforeTable.rowCount, "table-resize changed row count")
  assert(afterTable.columnCount === beforeTable.columnCount, "table-resize changed column count")
  assertNoBlockingState(after, "table-resize")

  const undo = await performUndo(
    page,
    before.documentSummary,
    "table-resize",
    () => waitForTableShape(page, tableId, {
      rowCount: beforeTable.rowCount,
      columnCount: beforeTable.columnCount,
      columnWidths: beforeTable.columnWidths,
    }),
  )
  return {
    mutationMs,
    fullWaitMs,
    tableId,
    drag,
    beforeTable,
    afterTable,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

async function runFlowStackAddColumnSmoke(page, rowId, leftStackId) {
  const before = await readStructureState(page)
  const beforeRow = before.documentSummary.flowRows[rowId]
  assert(beforeRow, `flow-stack-add-column: flow row ${rowId} not found before mutation`)

  await selectNodeForProperties(page, leftStackId, '[data-testid="flow-stack-add-after"]')
  await clearPerfEvents(page)
  const startedAt = now()
  await page.locator('[data-testid="flow-stack-add-after"]').click()
  await waitForUndoEnabled(page)
  await waitForFlowRowShape(page, rowId, { childCount: beforeRow.childCount + 1 })
  const fullWaitMs = await waitForPreviewLayoutFull(page, "flow-stack-add-column", maxPreviewFullWaitMs)
  const after = await readStructureState(page)
  const afterRow = after.documentSummary.flowRows[rowId]
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `flow-stack-add-column took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(afterRow.childCount === beforeRow.childCount + 1, "flow-stack-add-column did not add exactly one stack")
  assertNoBlockingState(after, "flow-stack-add-column")

  const undo = await performUndo(
    page,
    before.documentSummary,
    "flow-stack-add-column",
    () => waitForFlowRowShape(page, rowId, {
      childCount: beforeRow.childCount,
      stackWidths: beforeRow.stackWidths,
    }),
  )
  return {
    mutationMs,
    fullWaitMs,
    rowId,
    sourceStackId: leftStackId,
    beforeRow,
    afterRow,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

async function runFlowRowResizeSmoke(page, rowId, leftStackId, rightStackId) {
  const before = await readStructureState(page)
  const beforeRow = before.documentSummary.flowRows[rowId]
  assert(beforeRow, `flow-row-resize: flow row ${rowId} not found before mutation`)
  assert(beforeRow.stackWidths.length >= 2, "flow-row-resize needs at least two stacks")

  await fragmentTargetForNode(page, rowId)
  const resizeHandle = page.locator(
    `[data-testid="column-resize-handle"][data-row-type="flow-row"][data-row-id="${cssAttributeValue(rowId)}"][data-left-stack-id="${cssAttributeValue(leftStackId)}"][data-right-stack-id="${cssAttributeValue(rightStackId)}"]`,
  ).first()
  await clearPerfEvents(page)
  const startedAt = now()
  const drag = await dragLocatorBy(resizeHandle, 52, 0, "flow-row resize handle")
  await waitForUndoEnabled(page)
  await page.waitForFunction(({ rowId, beforeWidths }) => {
    const editorDocument = window.__flowDocEditorSmokeState?.document
    const nodes = {}
    for (const section of editorDocument?.document?.sections ?? []) {
      for (const [nodeId, node] of Object.entries(section.nodes ?? {})) nodes[nodeId] = node
    }
    const row = nodes[rowId]
    if (row?.type !== "flow-row") return false
    const widths = (row.childIds ?? []).map((childId) => {
      const stack = nodes[childId]
      return stack?.type === "flow-stack" ? stack.props?.widthShare ?? null : null
    })
    return widths.some((width, index) => Math.abs((width ?? NaN) - beforeWidths[index]) > 0.01)
  }, { rowId, beforeWidths: beforeRow.stackWidths }, { timeout: 10000 })
  const fullWaitMs = await waitForPreviewLayoutFull(page, "flow-row-resize", maxPreviewFullWaitMs)
  const after = await readStructureState(page)
  const afterRow = after.documentSummary.flowRows[rowId]
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `flow-row-resize took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(widthsChanged(beforeRow.stackWidths, afterRow.stackWidths), "flow-row-resize did not change stack widths")
  assert(afterRow.childCount === beforeRow.childCount, "flow-row-resize changed stack count")
  assertNoBlockingState(after, "flow-row-resize")

  const undo = await performUndo(
    page,
    before.documentSummary,
    "flow-row-resize",
    () => waitForFlowRowShape(page, rowId, {
      childCount: beforeRow.childCount,
      stackWidths: beforeRow.stackWidths,
    }),
  )
  return {
    mutationMs,
    fullWaitMs,
    rowId,
    leftStackId,
    rightStackId,
    drag,
    beforeRow,
    afterRow,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

function resolveRequiredAlias(rawDocument, alias, envName) {
  const nodeId = resolveFlowDocFixtureTarget(rawDocument, alias)
  assert(nodeId, `Could not resolve ${envName}=${alias} from fixture mockData.targets`)
  return nodeId
}

function summarizeConsoleErrorSignatures(consoleErrors) {
  const signatures = new Map()
  for (const error of consoleErrors) {
    const signature = String(error)
      .replace(/\d+/g, "#")
      .slice(0, 240)
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1)
  }
  return Array.from(signatures.entries()).map(([signature, count]) => ({ signature, count }))
}

async function runSmoke() {
  const rawStressDoc = await readFile(stressFilePath, "utf8")
  const tableId = resolveRequiredAlias(rawStressDoc, tableAlias, "STRUCTURE_TABLE_ALIAS")
  const flowRowId = resolveRequiredAlias(rawStressDoc, flowRowAlias, "STRUCTURE_FLOW_ROW_ALIAS")
  const flowLeftStackId = resolveRequiredAlias(rawStressDoc, flowLeftStackAlias, "STRUCTURE_FLOW_LEFT_STACK_ALIAS")
  const flowRightStackId = resolveRequiredAlias(rawStressDoc, flowRightStackAlias, "STRUCTURE_FLOW_RIGHT_STACK_ALIAS")
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
        window.__flowDocStructureMutationStorageError = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`
      }
    }, { rawDocument: rawStressDoc })

    const page = await context.newPage()
    page.on("pageerror", (error) => pageErrors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })

    const loadStartedAt = now()
    await page.goto(editorUrl(), { waitUntil: "domcontentloaded", timeout: readyTimeoutMs })
    await waitForReadyEditor(page)
    const storageState = await page.evaluate(() => ({
      storedLength: localStorage.getItem("flowdoc_document")?.length ?? 0,
      storageError: window.__flowDocStructureMutationStorageError ?? null,
    }))
    assert(storageState.storageError == null, `Could not store stress document: ${storageState.storageError}`)

    const tableAddRow = await runTableAddRowSmoke(page, tableId)
    const tableAddColumn = await runTableAddColumnSmoke(page, tableId)
    const tableResize = await runTableResizeSmoke(page, tableId)
    const flowStackAddColumn = await runFlowStackAddColumnSmoke(page, flowRowId, flowLeftStackId)
    const flowRowResize = await runFlowRowResizeSmoke(page, flowRowId, flowLeftStackId, flowRightStackId)

    const consoleErrorSignatures = summarizeConsoleErrorSignatures(consoleErrors)
    assert(pageErrors.length === 0, `Page errors:\n${pageErrors.join("\n")}`)
    assert(consoleErrors.length === 0, [
      "Console errors:",
      consoleErrors.join("\n"),
      `Console error signatures: ${JSON.stringify(consoleErrorSignatures)}`,
    ].join("\n"))

    const summary = {
      ok: true,
      browser: smokeBrowserLabel(smokeBrowser),
      url: editorUrl(),
      stressFile: path.relative(repoRoot, stressFilePath),
      storedLength: storageState.storedLength,
      loadMs: now() - loadStartedAt,
      aliases: {
        table: tableAlias,
        flowRow: flowRowAlias,
        flowLeftStack: flowLeftStackAlias,
        flowRightStack: flowRightStackAlias,
      },
      targets: {
        table: tableId,
        flowRow: flowRowId,
        flowLeftStack: flowLeftStackId,
        flowRightStack: flowRightStackId,
      },
      thresholds: {
        maxMutationMs,
        maxPreviewFullWaitMs,
      },
      tableAddRow,
      tableAddColumn,
      tableResize,
      flowStackAddColumn,
      flowRowResize,
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
      consoleErrorSignatures,
    }
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
  } finally {
    if (browser) await browser.close()
    if (server) await stopNextDevServer(server)
  }
}

runSmoke().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
