import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveFlowDocFixtureTarget } from "./flowdoc-fixture-targets.mjs"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const DEFAULT_SMOKE_PORT = 4024
const DEFAULT_STRESS_FILE = "public/mock/stress-long-v2.flowdoc.json"
const DEFAULT_ADD_DROP_ALIAS = "node.reorderTarget"
const DEFAULT_COPY_SOURCE_ALIAS = "node.duplicate"
const DEFAULT_COPY_DROP_ALIAS = "node.reorderTarget"
const DEFAULT_READY_TIMEOUT_MS = 240000
const DEFAULT_MAX_MUTATION_MS = 5000
const DEFAULT_MAX_PREVIEW_FULL_WAIT_MS = 10000

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const stressFilePath = path.resolve(
  repoRoot,
  process.env.FLOWDOC_MUTATION_FILE ??
    process.env.FLOWDOC_STRESS_FILE ??
    process.env.FLOWDOC_PROBE_FILE ??
    DEFAULT_STRESS_FILE,
)
const addDropAlias = process.env.MUTATION_ADD_DROP_ALIAS?.trim() || DEFAULT_ADD_DROP_ALIAS
const copySourceAlias = process.env.MUTATION_COPY_SOURCE_ALIAS?.trim() || DEFAULT_COPY_SOURCE_ALIAS
const copyDropAlias = process.env.MUTATION_COPY_DROP_ALIAS?.trim() || DEFAULT_COPY_DROP_ALIAS
const readyTimeoutMs = readIntegerOption(
  "ready-timeout-ms",
  ["MUTATION_READY_TIMEOUT_MS", "PROBE_READY_TIMEOUT_MS"],
  DEFAULT_READY_TIMEOUT_MS,
  1,
)
const maxMutationMs = readIntegerOption(
  "max-mutation-ms",
  ["MUTATION_MAX_MS"],
  DEFAULT_MAX_MUTATION_MS,
  1,
)
const maxPreviewFullWaitMs = readIntegerOption(
  "max-preview-full-wait-ms",
  ["MUTATION_MAX_PREVIEW_FULL_WAIT_MS"],
  DEFAULT_MAX_PREVIEW_FULL_WAIT_MS,
  1,
)
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"

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
      bottomZoneY: rect.bottom - Math.min(3, Math.max(2, rect.height / 10)),
      topZoneY: rect.top + Math.min(3, Math.max(2, rect.height / 10)),
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
    }
  }, nodeId)

  assert(target, `Could not resolve visible target rect for node ${nodeId}`)
  return target
}

function summarizeDocument(document) {
  const layoutNodeIds = []
  const layoutNodeTypes = {}
  const bodyChildIds = []

  for (const section of document?.document?.sections ?? []) {
    const body = section.nodes?.[section.bodyRootId]
    if (body?.type === "body" && Array.isArray(body.childIds)) {
      bodyChildIds.push(...body.childIds)
    }
    for (const [nodeId, node] of Object.entries(section.nodes ?? {})) {
      layoutNodeIds.push(nodeId)
      layoutNodeTypes[nodeId] = node?.type ?? null
      if (node?.type === "flow-table") {
        for (const [innerId, inner] of Object.entries(node.nodes ?? {})) {
          layoutNodeIds.push(innerId)
          layoutNodeTypes[innerId] = inner?.type ?? null
        }
      }
    }
  }

  return {
    layoutNodeIds,
    layoutNodeCount: layoutNodeIds.length,
    layoutNodeTypes,
    bodyChildIds,
    bodyChildCount: bodyChildIds.length,
  }
}

function findDocumentNode(document, nodeId) {
  for (const section of document?.document?.sections ?? []) {
    const node = section.nodes?.[nodeId]
    if (node) return node
    for (const candidate of Object.values(section.nodes ?? {})) {
      if (candidate?.type !== "flow-table") continue
      const inner = candidate.nodes?.[nodeId]
      if (inner) return inner
    }
  }
  return null
}

function textOfNode(node) {
  if (!node) return ""
  if (node.type === "paragraph") {
    return (node.children ?? [])
      .map((child) => typeof child.text === "string" ? child.text : "")
      .join("")
  }
  return ""
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
  }
}

async function readMutationState(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="editor-shell"]')
    const smoke = window.__flowDocEditorSmokeState ?? {}
    const perfEvents = [
      ...(window.__flowDocWysiwygPerfEvents ?? []),
      ...(window.__flowDocWysiwygPerfAttributionEvents ?? []),
    ]
    const summarizeDocument = (editorDocument) => {
      const layoutNodeIds = []
      const layoutNodeTypes = {}
      const bodyChildIds = []
      for (const section of editorDocument?.document?.sections ?? []) {
        const body = section.nodes?.[section.bodyRootId]
        if (body?.type === "body" && Array.isArray(body.childIds)) {
          bodyChildIds.push(...body.childIds)
        }
        for (const [nodeId, node] of Object.entries(section.nodes ?? {})) {
          layoutNodeIds.push(nodeId)
          layoutNodeTypes[nodeId] = node?.type ?? null
          if (node?.type === "flow-table") {
            for (const [innerId, inner] of Object.entries(node.nodes ?? {})) {
              layoutNodeIds.push(innerId)
              layoutNodeTypes[innerId] = inner?.type ?? null
            }
          }
        }
      }
      return {
        layoutNodeIds,
        layoutNodeCount: layoutNodeIds.length,
        layoutNodeTypes,
        bodyChildIds,
        bodyChildCount: bodyChildIds.length,
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

async function waitForDocumentNodeCount(page, expectedCount, timeoutMs = 10000) {
  await page.waitForFunction((count) => {
    const editorDocument = window.__flowDocEditorSmokeState?.document
    let nodeCount = 0
    for (const section of editorDocument?.document?.sections ?? []) {
      nodeCount += Object.keys(section.nodes ?? {}).length
      for (const node of Object.values(section.nodes ?? {})) {
        if (node?.type === "flow-table") nodeCount += Object.keys(node.nodes ?? {}).length
      }
    }
    return nodeCount === count
  }, expectedCount, { timeout: timeoutMs })
}

async function waitForUndoEnabled(page) {
  await page.waitForSelector('button[title="Undo (Ctrl+Z)"]:not([disabled])', { timeout: 10000 })
}

async function performUndo(page, beforeSummary, label) {
  await clearPerfEvents(page)
  const startedAt = now()
  await page.keyboard.press(`${platformShortcut}+Z`)
  await waitForDocumentNodeCount(page, beforeSummary.layoutNodeCount, 10000)
  const fullWaitMs = await waitForPreviewLayoutFull(page, `${label}-undo`, maxPreviewFullWaitMs)
  const state = await readMutationState(page)
  const undoMs = now() - startedAt
  assert(state.redoDisabled === false, `${label}: redo did not become enabled after undo`)
  assertNoBlockingState(state, `${label}-undo`)
  return {
    undoMs,
    fullWaitMs,
    state: stripDocumentFromState(state),
    perf: summarizePerfEvents(state.perfEvents),
  }
}

function assertNoBlockingState(state, label) {
  assert(state.shell.blocking === "false", `${label}: editor shell is blocking preview layout`)
  assert(state.shell.status === "full", `${label}: preview layout status is ${state.shell.status}, expected full`)
}

function newLayoutNodes(beforeSummary, afterSummary) {
  const beforeIds = new Set(beforeSummary.layoutNodeIds)
  return afterSummary.layoutNodeIds
    .filter((nodeId) => !beforeIds.has(nodeId))
    .map((nodeId) => ({ nodeId, nodeType: afterSummary.layoutNodeTypes[nodeId] ?? null }))
}

function stripDocumentFromState(state) {
  const { document, perfEvents, documentSummary, ...rest } = state
  return {
    ...rest,
    documentSummary: compactDocumentSummary(documentSummary),
    perfEventCount: perfEvents.length,
  }
}

function compactDocumentSummary(summary) {
  return {
    layoutNodeCount: summary.layoutNodeCount,
    bodyChildCount: summary.bodyChildCount,
    firstBodyChildIds: summary.bodyChildIds.slice(0, 5),
    lastBodyChildIds: summary.bodyChildIds.slice(-5),
  }
}

async function dragMouse(page, from, to) {
  await page.mouse.move(from.x, from.y)
  const beforeStart = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)
    return {
      x,
      y,
      hitTestId: hit?.getAttribute("data-testid") ?? null,
      hitTagName: hit?.tagName ?? null,
      hitTitle: hit?.getAttribute("title") ?? null,
      hitText: hit?.textContent?.trim().slice(0, 80) ?? null,
    }
  }, from)
  await page.mouse.down()
  await page.mouse.move(from.x + 9, from.y + 9, { steps: 3 })
  await waitForDoubleAnimationFrame(page)
  const ghostAfterStart = await page.locator('[data-testid="editor-drag-ghost"]').count()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await waitForDoubleAnimationFrame(page)
  const beforeDrop = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)
    return {
      x,
      y,
      hitTestId: hit?.getAttribute("data-testid") ?? null,
      hitNodeId: hit?.getAttribute("data-node-id") ?? null,
      hitNodeType: hit?.getAttribute("data-node-type") ?? null,
      dragGhostCount: document.querySelectorAll('[data-testid="editor-drag-ghost"]').length,
      dropHighlightContainerCount: document.querySelectorAll('[data-testid="drop-highlight-container-insert"]').length,
      dropHighlightBlockedCount: document.querySelectorAll('[data-testid="drop-highlight-page-break-blocked"]').length,
    }
  }, to)
  await page.mouse.up()
  return { beforeStart, ghostAfterStart, beforeDrop }
}

function boxCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

async function runAddParagraphSmoke(page, targetNodeId) {
  const before = await readMutationState(page)

  await page.locator('[data-testid="editor-left-rail-mode-add"]').click()
  await page.waitForSelector('[data-testid="add-panel"]', { timeout: 10000 })
  const target = await fragmentTargetForNode(page, targetNodeId)
  const paletteItem = page.locator('[data-testid="palette-block-paragraph"]').first()
  await paletteItem.waitFor({ state: "visible", timeout: 10000 })
  await paletteItem.scrollIntoViewIfNeeded()
  const paletteBox = await paletteItem.boundingBox()
  assert(paletteBox, "Could not read paragraph palette item box")

  await clearPerfEvents(page)
  const startedAt = now()
  const dragDiagnostics = await dragMouse(
    page,
    boxCenter(paletteBox),
    { x: target.x, y: target.bottomZoneY },
  )
  try {
    await waitForUndoEnabled(page)
  } catch (error) {
    const failureState = await readMutationState(page)
    throw new Error([
      "add-paragraph did not enable undo after palette drop.",
      `Drag diagnostics: ${JSON.stringify(dragDiagnostics)}`,
      `State: ${JSON.stringify(stripDocumentFromState(failureState))}`,
      `Perf: ${JSON.stringify(summarizePerfEvents(failureState.perfEvents))}`,
      String(error?.message ?? error),
    ].join("\n"))
  }
  const fullWaitMs = await waitForPreviewLayoutFull(page, "add-paragraph", maxPreviewFullWaitMs)
  const after = await readMutationState(page)
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `add-paragraph took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(after.documentSummary.layoutNodeCount > before.documentSummary.layoutNodeCount, "add-paragraph did not add a layout node")
  const addedNodes = newLayoutNodes(before.documentSummary, after.documentSummary)
  assert(
    addedNodes.some((node) => node.nodeType === "paragraph"),
    `add-paragraph did not create a paragraph node; new nodes=${JSON.stringify(addedNodes)}`,
  )
  assertNoBlockingState(after, "add-paragraph")

  const undo = await performUndo(page, before.documentSummary, "add-paragraph")
  return {
    mutationMs,
    fullWaitMs,
    targetNodeId,
    dragDiagnostics,
    addedNodes,
    before: stripDocumentFromState(before),
    after: stripDocumentFromState(after),
    perf: summarizePerfEvents(after.perfEvents),
    undo,
  }
}

async function selectNodeAndShowActionRail(page, nodeId) {
  const target = await fragmentTargetForNode(page, nodeId)
  await page.mouse.click(target.x, target.y)
  await waitForDoubleAnimationFrame(page)
  if (await page.locator(`[data-inline-edit-node-id="${cssAttributeValue(nodeId)}"]`).first().count() > 0) {
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => (
      document.querySelectorAll("[data-inline-edit-node-id]").length === 0
    ), null, { timeout: 10000 })
    await waitForDoubleAnimationFrame(page)
  }
  await page.waitForSelector(`[data-testid="canvas-action-rail"][data-node-id="${cssAttributeValue(nodeId)}"]`, {
    timeout: 10000,
  })
}

async function runDragCopySmoke(page, sourceNodeId, dropTargetNodeId) {
  await selectNodeAndShowActionRail(page, sourceNodeId)
  const dropTarget = await fragmentTargetForNode(page, dropTargetNodeId)
  await selectNodeAndShowActionRail(page, sourceNodeId)
  const sourceState = await readMutationState(page)
  const sourceNode = findDocumentNode(sourceState.document, sourceNodeId)
  const sourceNodeType = sourceNode?.type ?? null
  const sourceText = textOfNode(sourceNode)
  const actionButton = page.locator('[data-testid="canvas-action-clone-drag"]').first()
  await actionButton.waitFor({ state: "visible", timeout: 10000 })
  await actionButton.scrollIntoViewIfNeeded()
  const actionBox = await actionButton.boundingBox()
  assert(actionBox, "Could not read Drag copy action button box")

  await clearPerfEvents(page)
  const startedAt = now()
  const dragDiagnostics = await dragMouse(
    page,
    boxCenter(actionBox),
    { x: dropTarget.x, y: dropTarget.bottomZoneY },
  )
  try {
    await waitForUndoEnabled(page)
  } catch (error) {
    const failureState = await readMutationState(page)
    throw new Error([
      "drag-copy did not enable undo after canvas drop.",
      `Drag diagnostics: ${JSON.stringify(dragDiagnostics)}`,
      `State: ${JSON.stringify(stripDocumentFromState(failureState))}`,
      `Perf: ${JSON.stringify(summarizePerfEvents(failureState.perfEvents))}`,
      String(error?.message ?? error),
    ].join("\n"))
  }
  const fullWaitMs = await waitForPreviewLayoutFull(page, "drag-copy", maxPreviewFullWaitMs)
  const after = await readMutationState(page)
  const mutationMs = now() - startedAt
  assert(mutationMs <= maxMutationMs, `drag-copy took ${mutationMs}ms, expected <= ${maxMutationMs}ms`)
  assert(after.documentSummary.layoutNodeCount > sourceState.documentSummary.layoutNodeCount, "drag-copy did not add a layout node")
  const copiedNodes = newLayoutNodes(sourceState.documentSummary, after.documentSummary)
  assert(
    copiedNodes.some((node) => node.nodeType === sourceNodeType),
    `drag-copy did not create a ${sourceNodeType} node; new nodes=${JSON.stringify(copiedNodes)}`,
  )
  if (sourceNodeType === "paragraph" && sourceText.length > 0) {
    const matchingCopy = copiedNodes.some((node) => (
      textOfNode(findDocumentNode(after.document, node.nodeId)) === sourceText
    ))
    assert(matchingCopy, "drag-copy did not preserve the copied paragraph text")
  }
  assertNoBlockingState(after, "drag-copy")

  const undo = await performUndo(page, sourceState.documentSummary, "drag-copy")
  return {
    mutationMs,
    fullWaitMs,
    sourceNodeId,
    dropTargetNodeId,
    sourceNodeType,
    dragDiagnostics,
    copiedNodes,
    before: stripDocumentFromState(sourceState),
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
  const addDropNodeId = resolveRequiredAlias(rawStressDoc, addDropAlias, "MUTATION_ADD_DROP_ALIAS")
  const copySourceNodeId = resolveRequiredAlias(rawStressDoc, copySourceAlias, "MUTATION_COPY_SOURCE_ALIAS")
  const copyDropNodeId = resolveRequiredAlias(rawStressDoc, copyDropAlias, "MUTATION_COPY_DROP_ALIAS")
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
        window.__flowDocNodeMutationStorageError = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`
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
      storageError: window.__flowDocNodeMutationStorageError ?? null,
    }))
    assert(storageState.storageError == null, `Could not store stress document: ${storageState.storageError}`)

    const addParagraph = await runAddParagraphSmoke(page, addDropNodeId)
    const dragCopy = await runDragCopySmoke(page, copySourceNodeId, copyDropNodeId)

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
        addDrop: addDropAlias,
        copySource: copySourceAlias,
        copyDrop: copyDropAlias,
      },
      targets: {
        addDrop: addDropNodeId,
        copySource: copySourceNodeId,
        copyDrop: copyDropNodeId,
      },
      thresholds: {
        maxMutationMs,
        maxPreviewFullWaitMs,
      },
      addParagraph,
      dragCopy,
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
