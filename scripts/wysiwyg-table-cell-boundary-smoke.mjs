import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const DEFAULT_SMOKE_PORT = 4017
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const STORAGE_KEY = "flowdoc_document"
const RESPONSIVE_PAGINATION_MAX_DELAY_MS = 300
const ROWSPAN_FINAL_SLICE_MAX_EXTRA_PX = 8
const CARET_ALIGNMENT_TOLERANCE_PX = 4
const TABLE_CELL_ENTER_SPLIT_MARKER = "STAGE3_TABLE_CELL_ENTER_SPLIT_MARKER"

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
    expectEnterSplit: true,
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
    expectEnterSplit: true,
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
    expectEnterSplit: true,
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
    expectEnterSplit: true,
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
const hiddenInputBridgeSelector = `textarea[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const draftIslandLayerSelector = `[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${smokeTarget.nodeId}"]`
const legacyTextareaSelector = `textarea[data-inline-edit-node-id]:not([data-wysiwyg-native-edit-textarea="true"]):not([data-wysiwyg-input-bridge="true"])`

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

async function clickToolbarButton(page, title) {
  const button = page.locator(`button[title="${title}"]`)
  await button.waitFor({ state: "visible", timeout: 10000 })
  await page.waitForFunction((buttonTitle) => {
    const button = document.querySelector(`button[title="${buttonTitle}"]`)
    return button instanceof HTMLButtonElement && !button.disabled
  }, title, { timeout: 10000 })
  await button.click()
}

function nodeEditSelectors(nodeId) {
  return {
    textEngineLayer: `[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${nodeId}"]`,
    nativeEditLayer: `[data-wysiwyg-native-edit-layer="true"][data-inline-edit-node-id="${nodeId}"]`,
    nativeTextarea: `textarea[data-wysiwyg-native-edit-textarea="true"][data-inline-edit-node-id="${nodeId}"]`,
    hiddenInputBridge: `textarea[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`,
    draftIslandLayer: `[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${nodeId}"]`,
  }
}

async function expectCurrentEditLayerForNode(page, nodeId) {
  const selectors = nodeEditSelectors(nodeId)
  const layer = page.locator(selectors.textEngineLayer)
  const bridgeCount = await page.locator(selectors.hiddenInputBridge).count()
  const draftIslandLayerCount = await page.locator(selectors.draftIslandLayer).count()
  const nativeLayerCount = await page.locator(selectors.nativeEditLayer).count()
  const nativeTextareaCount = await page.locator(selectors.nativeTextarea).count()
  const legacyTextareaCount = await page.locator(legacyTextareaSelector).count()
  const liveEchoCount = await layer.locator('[data-wysiwyg-live-echo="true"]').count()
  const liveCaretCount = await layer.locator('[data-wysiwyg-live-caret="true"]').count()
  const draftReplacementCount = await layer.locator('[data-wysiwyg-draft-text-replacement="true"]').count()

  assert(await layer.count() >= 1, `expected at least one active text-engine layer, found ${await layer.count()}`)
  assert(bridgeCount === 1, `expected one hidden input bridge, found ${bridgeCount}`)
  assert(draftIslandLayerCount >= 1, `expected at least one draft island layer, found ${draftIslandLayerCount}`)
  assert(nativeLayerCount === 0, `native edit layer leaked into current draft-island path: ${nativeLayerCount}`)
  assert(nativeTextareaCount === 0, `native edit textarea leaked into current draft-island path: ${nativeTextareaCount}`)
  assert(legacyTextareaCount === 0, `legacy inline textarea leaked into active edit path: ${legacyTextareaCount}`)
  assert(liveEchoCount === 0, `live echo leaked into active draft-island edit path: ${liveEchoCount}`)
  assert(liveCaretCount === 0, `live caret leaked into active draft-island edit path: ${liveCaretCount}`)
  assert(draftReplacementCount === 0, `draft replacement leaked into active draft-island edit path: ${draftReplacementCount}`)
  assert(
    await layer.first().getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island",
    "expected draft island to own the active visual mode",
  )
}

async function dblClickEditableFragment(page, nodeId) {
  const selector = `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
  const selectors = nodeEditSelectors(nodeId)
  const fragment = page.locator(selector).first()
  await fragment.waitFor({ state: "visible", timeout: 10000 })
  await fragment.scrollIntoViewIfNeeded()
  let lastError = null
  const waitForBridge = async (timeout = 1500) => {
    try {
      await page.locator(selectors.hiddenInputBridge).waitFor({ state: "attached", timeout })
      return true
    } catch {
      return false
    }
  }
  const tryDblClick = async (action) => {
    try {
      await action()
      return await waitForBridge()
    } catch (error) {
      lastError = error
      return false
    }
  }

  if (await tryDblClick(() => fragment.dblclick({ timeout: 5000 }))) return

  const text = fragment.locator("text").first()
  if (await text.count() > 0 && await tryDblClick(() => text.dblclick({ timeout: 5000 }))) return

  const box = await fragment.boundingBox()
  if (box) {
    const positionCandidates = [
      { x: box.width * 0.75, y: box.height * 0.25 },
      { x: box.width * 0.75, y: box.height * 0.5 },
      { x: box.width * 0.5, y: box.height * 0.25 },
    ].map((point) => ({
      x: Math.min(Math.max(point.x, 4), Math.max(4, box.width - 4)),
      y: Math.min(Math.max(point.y, 4), Math.max(4, box.height - 4)),
    }))
    for (const position of positionCandidates) {
      if (await tryDblClick(() => fragment.dblclick({ position, timeout: 3000 }))) return
    }
  }

  const clickPoint = await page.evaluate((fragmentSelector) => {
    const fragment = document.querySelector(fragmentSelector)
    if (!fragment) return null
    const candidates = [...fragment.querySelectorAll("text"), fragment]
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) continue
      const insetX = box.width > 16
        ? Math.min(Math.max(box.width * 0.5, 8), box.width - 8)
        : box.width / 2
      const insetY = box.height > 8
        ? Math.min(Math.max(box.height * 0.5, 4), box.height - 4)
        : box.height / 2
      return {
        x: box.left + insetX,
        y: box.top + insetY,
      }
    }
    return null
  }, selector)
  if (clickPoint) {
    if (await tryDblClick(() => page.mouse.dblclick(clickPoint.x, clickPoint.y))) return
    const dispatched = await page.evaluate(({ fragmentSelector, point }) => {
      const fragment = document.querySelector(fragmentSelector)
      if (!fragment) return false
      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
      }
      for (const [type, detail] of [
        ["mousedown", 1],
        ["mouseup", 1],
        ["click", 1],
        ["mousedown", 2],
        ["mouseup", 2],
        ["click", 2],
        ["dblclick", 2],
      ]) {
        fragment.dispatchEvent(new MouseEvent(type, { ...eventInit, detail }))
      }
      return true
    }, { fragmentSelector: selector, point: clickPoint })
    if (dispatched && await waitForBridge(3000)) return
  }

  throw new Error(`Could not open table-cell paragraph edit for ${nodeId}: ${lastError?.message ?? "no editable click target"}`)
}

async function openTableCellParagraphEdit(page, nodeId) {
  const selectors = nodeEditSelectors(nodeId)
  if (await page.locator(selectors.hiddenInputBridge).count() === 0) {
    await dblClickEditableFragment(page, nodeId)
  }
  await page.locator(selectors.hiddenInputBridge).waitFor({ state: "attached", timeout: 10000 })
  await expectCurrentEditLayerForNode(page, nodeId)
}

async function expectCurrentEditLayer(page) {
  return expectCurrentEditLayerForNode(page, smokeTarget.nodeId)
}

async function resetWysiwygPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
  })
}

function countSplitParagraphActions(events) {
  return events.filter((event) =>
    event.kind === "editor-action-dispatch" &&
    (event.command === "SPLIT_PARAGRAPH" || event.commandType === "SPLIT_PARAGRAPH")
  ).length
}

function countStructuralEnterSplits(events) {
  return events.filter((event) =>
    event.kind === "flowdoc-island-structural-edit" &&
    event.action === "split-paragraph" &&
    event.source === "key:Enter"
  ).length
}

function countMergeParagraphActions(events) {
  return events.filter((event) =>
    event.kind === "editor-action-dispatch" &&
    (event.command === "MERGE_PARAGRAPH" || event.commandType === "MERGE_PARAGRAPH")
  ).length
}

function countStructuralBackspaceMerges(events) {
  return events.filter((event) =>
    event.kind === "flowdoc-island-structural-edit" &&
    event.action === "merge-paragraph" &&
    event.source === "key:Backspace"
  ).length
}

function countTableCellBoundaryBackspaces(events) {
  return events.filter((event) =>
    event.kind === "flowdoc-island-structural-edit" &&
    event.action === "table-cell-boundary-backspace" &&
    event.source === "key:Backspace" &&
    event.isTableCellParagraph === true
  ).length
}

function countDeleteEmptyTableCellParagraphActions(events) {
  return events.filter((event) =>
    event.kind === "editor-action-dispatch" &&
    (event.command === "DELETE_EMPTY_TABLE_CELL_PARAGRAPH" || event.commandType === "DELETE_EMPTY_TABLE_CELL_PARAGRAPH")
  ).length
}

function countStructuralTableCellEmptyParagraphDeletes(events) {
  return events.filter((event) =>
    event.kind === "flowdoc-island-structural-edit" &&
    event.action === "delete-empty-table-cell-paragraph" &&
    event.source === "key:Backspace"
  ).length
}

function latestTableCellBoundaryBackspaceEvent(events, nodeId) {
  return events
    .filter((event) =>
      event.kind === "flowdoc-island-structural-edit" &&
      event.action === "table-cell-boundary-backspace" &&
      event.source === "key:Backspace" &&
      event.isTableCellParagraph === true &&
      event.nodeId === nodeId
    )
    .at(-1) ?? null
}

function latestTableCellEmptyParagraphDeleteEvent(events, nodeId) {
  return events
    .filter((event) =>
      event.kind === "flowdoc-island-structural-edit" &&
      event.action === "delete-empty-table-cell-paragraph" &&
      event.source === "key:Backspace" &&
      event.isTableCellParagraph === true &&
      event.nodeId === nodeId
    )
    .at(-1) ?? null
}

async function readStoredDocument(page) {
  return page.evaluate((key) => {
    const smokeDoc = window.__flowDocEditorSmokeState?.document
    if (smokeDoc?.document?.sections) return smokeDoc
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.packageVersion === 2 && parsed.document?.document?.sections) return parsed.document
    if (parsed?.kind === "document" && parsed.document?.document?.sections) return parsed.document
    return parsed
  }, STORAGE_KEY)
}

function paragraphText(paragraph) {
  return paragraph?.children?.map((child) => child.text ?? "").join("") ?? ""
}

function findTableCellParagraphLocation(doc, paragraphId) {
  for (const section of doc?.document?.sections ?? []) {
    for (const [tableId, table] of Object.entries(section.nodes ?? {})) {
      if (table?.type !== "flow-table") continue
      for (const [cellId, cell] of Object.entries(table.nodes ?? {})) {
        if (cell?.type !== "flow-table-cell") continue
        const index = cell.childIds.indexOf(paragraphId)
        if (index < 0) continue
        const paragraph = table.nodes[paragraphId]
        if (paragraph?.type !== "paragraph") return null
        return { tableId, table, cellId, cell, index, paragraph }
      }
    }
  }
  return null
}

function findFlowTableCellLocation(doc, tableId, cellId) {
  for (const section of doc?.document?.sections ?? []) {
    const table = section.nodes?.[tableId]
    const cell = table?.type === "flow-table" ? table.nodes?.[cellId] : null
    if (cell?.type === "flow-table-cell") {
      return { tableId, table, cellId, cell }
    }
  }
  return null
}

async function waitForTableCellEnterSplit(page, sourceNodeId) {
  try {
    await page.waitForFunction(
      ({ key, sourceNodeId }) => {
        const smokeDoc = window.__flowDocEditorSmokeState?.document
        const raw = smokeDoc?.document?.sections ? null : window.localStorage.getItem(key)
        const parsed = raw ? JSON.parse(raw) : null
        const doc = smokeDoc?.document?.sections
          ? smokeDoc
          : parsed?.packageVersion === 2 && parsed.document?.document?.sections
            ? parsed.document
            : parsed?.kind === "document" && parsed.document?.document?.sections
              ? parsed.document
              : parsed
        for (const section of doc?.document?.sections ?? []) {
          for (const table of Object.values(section.nodes ?? {})) {
            if (table?.type !== "flow-table") continue
            for (const cell of Object.values(table.nodes ?? {})) {
              if (cell?.type !== "flow-table-cell") continue
              const index = cell.childIds.indexOf(sourceNodeId)
              if (index < 0) continue
              const nextNodeId = cell.childIds[index + 1]
              const source = table.nodes[sourceNodeId]
              const next = table.nodes[nextNodeId]
              return source?.type === "paragraph" && next?.type === "paragraph"
            }
          }
        }
        return false
      },
      { key: STORAGE_KEY, sourceNodeId },
      { timeout: 15000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const location = doc ? findTableCellParagraphLocation(doc, sourceNodeId) : null
    throw new Error(`timed out waiting for table-cell Enter split: ${JSON.stringify({
      sourceNodeId,
      cellId: location?.cellId ?? null,
      childIds: location?.cell?.childIds ?? null,
    }, null, 2)}`, { cause: error })
  }

  const doc = await readStoredDocument(page)
  const source = findTableCellParagraphLocation(doc, sourceNodeId)
  assert(source, `missing source table-cell paragraph ${sourceNodeId} after Enter split`)
  const newNodeId = source.cell.childIds[source.index + 1]
  const newParagraph = source.table.nodes[newNodeId]
  assert(newParagraph?.type === "paragraph", `expected next cell child to be paragraph, got ${JSON.stringify(newParagraph)}`)
  return {
    sourceNodeId,
    newNodeId,
    tableId: source.tableId,
    cellId: source.cellId,
    childIds: source.cell.childIds,
    sourceText: paragraphText(source.paragraph),
    newText: paragraphText(newParagraph),
  }
}

async function waitForStoredTableParagraph(page, nodeId, predicate, label) {
  try {
    await page.waitForFunction(
      ({ key, nodeId, marker }) => {
        const smokeDoc = window.__flowDocEditorSmokeState?.document
        const raw = smokeDoc?.document?.sections ? null : window.localStorage.getItem(key)
        const parsed = raw ? JSON.parse(raw) : null
        const doc = smokeDoc?.document?.sections
          ? smokeDoc
          : parsed?.packageVersion === 2 && parsed.document?.document?.sections
            ? parsed.document
            : parsed?.kind === "document" && parsed.document?.document?.sections
              ? parsed.document
              : parsed
        for (const section of doc?.document?.sections ?? []) {
          for (const table of Object.values(section.nodes ?? {})) {
            if (table?.type !== "flow-table") continue
            const paragraph = table.nodes[nodeId]
            if (paragraph?.type !== "paragraph") continue
            const text = paragraph.children.map((child) => child.text ?? "").join("")
            return text.includes(marker)
          }
        }
        return false
      },
      { key: STORAGE_KEY, nodeId, marker: TABLE_CELL_ENTER_SPLIT_MARKER },
      { timeout: 10000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const location = doc ? findTableCellParagraphLocation(doc, nodeId) : null
    throw new Error(`${label} did not match. Last paragraph: ${JSON.stringify(location?.paragraph ?? null)}`, {
      cause: error,
    })
  }

  const doc = await readStoredDocument(page)
  const location = findTableCellParagraphLocation(doc, nodeId)
  assert(location && predicate(location.paragraph), `${label} failed for paragraph ${nodeId}: ${JSON.stringify(location?.paragraph ?? null)}`)
  return location.paragraph
}

async function waitForStoredTableCellChildIds(page, tableId, cellId, expectedChildIds, label) {
  try {
    await page.waitForFunction(
      ({ key, tableId, cellId, expectedChildIds }) => {
        const smokeDoc = window.__flowDocEditorSmokeState?.document
        const raw = smokeDoc?.document?.sections ? null : window.localStorage.getItem(key)
        const parsed = raw ? JSON.parse(raw) : null
        const doc = smokeDoc?.document?.sections
          ? smokeDoc
          : parsed?.packageVersion === 2 && parsed.document?.document?.sections
            ? parsed.document
            : parsed?.kind === "document" && parsed.document?.document?.sections
              ? parsed.document
              : parsed
        for (const section of doc?.document?.sections ?? []) {
          const table = section.nodes?.[tableId]
          const cell = table?.type === "flow-table" ? table.nodes?.[cellId] : null
          if (cell?.type !== "flow-table-cell") continue
          return JSON.stringify(cell.childIds) === JSON.stringify(expectedChildIds)
        }
        return false
      },
      { key: STORAGE_KEY, tableId, cellId, expectedChildIds },
      { timeout: 10000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const location = findFlowTableCellLocation(doc, tableId, cellId)
    throw new Error(`${label} did not reach expected childIds: ${JSON.stringify({
      expectedChildIds,
      actualChildIds: location?.cell?.childIds ?? null,
      tableId,
      cellId,
    }, null, 2)}`, { cause: error })
  }

  const doc = await readStoredDocument(page)
  const location = findFlowTableCellLocation(doc, tableId, cellId)
  assert(location, `${label} missing flow-table cell ${cellId}`)
  return [...location.cell.childIds]
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
    const textEngineDraftMeasures = events.filter((event) =>
      event.kind === "text-engine-draft-measure"
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
    const firstDraftPaginationSchedule = draftPaginationSchedules[0] ?? null
    const lastDraftPaginationSchedule = draftPaginationSchedules[draftPaginationSchedules.length - 1] ?? null
    const firstTextEngineDraftMeasure = textEngineDraftMeasures[0] ?? null
    const lastTextEngineDraftMeasure = textEngineDraftMeasures[textEngineDraftMeasures.length - 1] ?? null
    const firstDraftSignal = firstDraftUpdate ?? firstDraftPaginationSchedule ?? firstTextEngineDraftMeasure
    const lastDraftSignal = lastDraftUpdate ?? lastDraftPaginationSchedule ?? lastTextEngineDraftMeasure
    const firstPagination = paginations[0] ?? null
    const firstPaginationAfterDraft = lastDraftSignal
      ? paginations.find((event) => event.startedAt >= lastDraftSignal.startedAt) ?? null
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
      Boolean(firstPaginationAfterDraft && lastDraftSignal) &&
      firstPaginationAfterDraft.draftVersion === lastDraftSignal.draftVersion

    return {
      draftUpdates: draftUpdates.length,
      browserPreviewPaginations: paginations.length,
      textEngineDraftMeasures: textEngineDraftMeasures.length,
      reflowDecisions: reflowDecisions.length,
      draftPaginationSchedules: draftPaginationSchedules.length,
      draftPaginationStates: draftPaginationStates.length,
      visualPreviewEvents: visualPreviewEvents.length,
      visualChromeEvents: visualChromeEvents.length,
      firstDraftSignalKind: firstDraftSignal?.kind ?? null,
      lastDraftSignalKind: lastDraftSignal?.kind ?? null,
      firstPaginationDelayMs: lastDraftSignal && firstPaginationAfterDraft
        ? round(firstPaginationAfterDraft.startedAt - lastDraftSignal.startedAt)
        : null,
      firstDraftToFirstPaginationStartMs: fromStart(firstDraftSignal, firstPagination),
      lastDraftEndToFirstPaginationStartMs: fromEnd(lastDraftSignal, firstPaginationAfterDraft),
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
      firstDraftPaginationSchedule: summarizeEvent(firstDraftPaginationSchedule),
      lastDraftPaginationSchedule: summarizeEvent(lastDraftPaginationSchedule),
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
    ({ selector }) => document.querySelectorAll(selector).length >= 1,
    { selector: targetFragmentSelector },
    { timeout: 15000 },
  )
  await dblClickEditableFragment(page, smokeTarget.nodeId)
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await expectCurrentEditLayer(page)
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
  await expectCurrentEditLayer(page)

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
  await expectCurrentEditLayer(page)
  await expectNoLayoutError(page)

  return {
    pageIndex: continuationPageIndex,
    marker: reentryMarker,
  }
}

async function assertTableCellEnterSplit(page) {
  const beforeEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const splitActionCountBefore = countSplitParagraphActions(beforeEvents)
  const structuralEnterCountBefore = countStructuralEnterSplits(beforeEvents)

  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")

  const split = await waitForTableCellEnterSplit(page, smokeTarget.nodeId)
  const selectors = nodeEditSelectors(split.newNodeId)
  await page.locator(selectors.hiddenInputBridge).waitFor({ state: "attached", timeout: 15000 })
  await expectCurrentEditLayerForNode(page, split.newNodeId)

  const immediateEmptyDelete = await assertEmptyTableCellParagraphBackspaceDeletes(
    page,
    split.newNodeId,
    split.sourceNodeId,
    "table-cell Enter-split immediate Backspace",
  )

  const sourceSelectors = nodeEditSelectors(split.sourceNodeId)
  await page.locator(sourceSelectors.hiddenInputBridge).waitFor({ state: "attached", timeout: 15000 })
  await expectCurrentEditLayerForNode(page, split.sourceNodeId)
  await page.locator(sourceSelectors.hiddenInputBridge).focus()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")

  const markerSplit = await waitForTableCellEnterSplit(page, smokeTarget.nodeId)
  const markerSelectors = nodeEditSelectors(markerSplit.newNodeId)
  await page.locator(markerSelectors.hiddenInputBridge).waitFor({ state: "attached", timeout: 15000 })
  await expectCurrentEditLayerForNode(page, markerSplit.newNodeId)

  await page.keyboard.insertText(` ${TABLE_CELL_ENTER_SPLIT_MARKER} ข้อความหลัง Enter ในเซลล์`)
  await page.waitForFunction(
    ({ marker }) => document.body.textContent?.includes(marker) === true,
    { marker: TABLE_CELL_ENTER_SPLIT_MARKER },
    { timeout: 10000 },
  )
  await expectCurrentEditLayerForNode(page, markerSplit.newNodeId)
  await page.keyboard.press("Escape")
  await page.locator(markerSelectors.hiddenInputBridge).waitFor({ state: "detached", timeout: 10000 })

  const committed = await waitForStoredTableParagraph(
    page,
    markerSplit.newNodeId,
    (paragraph) => paragraphText(paragraph).includes(TABLE_CELL_ENTER_SPLIT_MARKER),
    "table-cell Enter split commits typed text into the new cell paragraph",
  )
  const afterEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const splitParagraphActionCount = countSplitParagraphActions(afterEvents)
  const structuralEnterSplitCount = countStructuralEnterSplits(afterEvents)
  assert(
    splitParagraphActionCount > splitActionCountBefore,
    `expected SPLIT_PARAGRAPH action after table-cell Enter, before=${splitActionCountBefore} after=${splitParagraphActionCount}`,
  )
  assert(
    structuralEnterSplitCount > structuralEnterCountBefore,
    `expected structural Enter split event after table-cell Enter, before=${structuralEnterCountBefore} after=${structuralEnterSplitCount}`,
  )
  await expectNoLayoutError(page)

  return {
    sourceNodeId: markerSplit.sourceNodeId,
    newNodeId: markerSplit.newNodeId,
    tableId: markerSplit.tableId,
    cellId: markerSplit.cellId,
    sameCell: markerSplit.childIds.includes(markerSplit.sourceNodeId) && markerSplit.childIds.includes(markerSplit.newNodeId),
    sourceTextLength: markerSplit.sourceText.length,
    newText: paragraphText(committed),
    immediateEmptyDelete,
    splitParagraphActionCountDelta: splitParagraphActionCount - splitActionCountBefore,
    structuralEnterSplitCountDelta: structuralEnterSplitCount - structuralEnterCountBefore,
  }
}

async function assertTableCellBoundaryBackspaceDoesNotMerge(
  page,
  nodeId = smokeTarget.nodeId,
  label = "table-cell true-start Backspace",
) {
  const selectors = nodeEditSelectors(nodeId)
  const beforeDoc = await readStoredDocument(page)
  const beforeLocation = findTableCellParagraphLocation(beforeDoc, nodeId)
  assert(beforeLocation, `missing table-cell paragraph ${nodeId} before boundary Backspace`)
  const beforeChildIds = [...beforeLocation.cell.childIds]
  const beforeText = paragraphText(beforeLocation.paragraph)
  const beforeEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const mergeActionCountBefore = countMergeParagraphActions(beforeEvents)
  const structuralMergeCountBefore = countStructuralBackspaceMerges(beforeEvents)
  const boundaryBackspaceCountBefore = countTableCellBoundaryBackspaces(beforeEvents)

  const bridge = page.locator(selectors.hiddenInputBridge)
  await bridge.focus()
  await page.keyboard.press("Home")
  await page.waitForFunction(
    ({ selector }) => {
      return Array.from(document.querySelectorAll(selector)).some((element) =>
        element.getAttribute("data-wysiwyg-flowdoc-draft-caret-offset") === "0" &&
        element.getAttribute("data-wysiwyg-flowdoc-draft-selection-start") === "0" &&
        element.getAttribute("data-wysiwyg-flowdoc-draft-selection-end") === "0"
      )
    },
    { selector: selectors.draftIslandLayer },
    { timeout: 5000 },
  )
  await page.keyboard.press("Backspace")
  await page.waitForTimeout(250)
  await expectCurrentEditLayerForNode(page, nodeId)
  await expectNoLayoutError(page)

  const afterEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const mergeActionCountAfter = countMergeParagraphActions(afterEvents)
  const structuralMergeCountAfter = countStructuralBackspaceMerges(afterEvents)
  const boundaryBackspaceCountAfter = countTableCellBoundaryBackspaces(afterEvents)
  const boundaryBackspaceEvent = latestTableCellBoundaryBackspaceEvent(afterEvents, nodeId)
  const expectedReason = beforeText.length === 0
    ? "empty-table-cell-paragraph-noop"
    : "table-cell-start-boundary-noop"
  const expectedAttemptedOperation = beforeText.length === 0 ? "delete-empty" : "merge"
  const afterDoc = await readStoredDocument(page)
  const afterLocation = findTableCellParagraphLocation(afterDoc, nodeId)
  assert(afterLocation, `missing table-cell paragraph ${nodeId} after boundary Backspace`)
  assert(
    JSON.stringify(afterLocation.cell.childIds) === JSON.stringify(beforeChildIds),
    `${label} changed table-cell childIds: before=${JSON.stringify(beforeChildIds)} after=${JSON.stringify(afterLocation.cell.childIds)}`,
  )
  assert(
    paragraphText(afterLocation.paragraph) === beforeText,
    `${label} changed table-cell paragraph text`,
  )
  assert(
    mergeActionCountAfter === mergeActionCountBefore,
    `${label} dispatched MERGE_PARAGRAPH: before=${mergeActionCountBefore} after=${mergeActionCountAfter}`,
  )
  assert(
    structuralMergeCountAfter === structuralMergeCountBefore,
    `${label} used island merge path: before=${structuralMergeCountBefore} after=${structuralMergeCountAfter}`,
  )
  assert(
    boundaryBackspaceCountAfter > boundaryBackspaceCountBefore,
    `expected ${label} boundary event, before=${boundaryBackspaceCountBefore} after=${boundaryBackspaceCountAfter}`,
  )
  assert(boundaryBackspaceEvent, `missing ${label} boundary event for ${nodeId}`)
  assert(
    boundaryBackspaceEvent.reason === expectedReason,
    `unexpected ${label} reason: expected=${expectedReason} actual=${boundaryBackspaceEvent.reason ?? null}`,
  )
  assert(
    boundaryBackspaceEvent.status === "blocked-table-cell-boundary",
    `unexpected ${label} status: ${boundaryBackspaceEvent.status ?? null}`,
  )
  assert(
    boundaryBackspaceEvent.attemptedOperation === expectedAttemptedOperation,
    `unexpected ${label} attemptedOperation: expected=${expectedAttemptedOperation} actual=${boundaryBackspaceEvent.attemptedOperation ?? null}`,
  )

  return {
    nodeId,
    cellId: beforeLocation.cellId,
    childIds: afterLocation.cell.childIds,
    textLength: beforeText.length,
    reason: boundaryBackspaceEvent.reason,
    status: boundaryBackspaceEvent.status,
    attemptedOperation: boundaryBackspaceEvent.attemptedOperation,
    mergeParagraphActionCountDelta: mergeActionCountAfter - mergeActionCountBefore,
    structuralMergeCountDelta: structuralMergeCountAfter - structuralMergeCountBefore,
    boundaryBackspaceCountDelta: boundaryBackspaceCountAfter - boundaryBackspaceCountBefore,
  }
}

async function assertEmptyTableCellParagraphBackspaceDeletes(page, nodeId, previousNodeId, label) {
  const selectors = nodeEditSelectors(nodeId)
  const beforeDoc = await readStoredDocument(page)
  const beforeLocation = findTableCellParagraphLocation(beforeDoc, nodeId)
  assert(beforeLocation, `missing empty table-cell paragraph ${nodeId} before delete Backspace`)
  const beforeChildIds = [...beforeLocation.cell.childIds]
  const expectedDeletedChildIds = beforeChildIds.filter((childId) => childId !== nodeId)
  const beforeText = paragraphText(beforeLocation.paragraph)
  assert(beforeText.length === 0, `${label} expected empty paragraph, got length ${beforeText.length}`)
  assert(beforeChildIds.includes(previousNodeId), `${label} missing previous paragraph ${previousNodeId}`)
  const beforeEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const mergeActionCountBefore = countMergeParagraphActions(beforeEvents)
  const structuralMergeCountBefore = countStructuralBackspaceMerges(beforeEvents)
  const deleteActionCountBefore = countDeleteEmptyTableCellParagraphActions(beforeEvents)
  const structuralDeleteCountBefore = countStructuralTableCellEmptyParagraphDeletes(beforeEvents)

  const bridge = page.locator(selectors.hiddenInputBridge)
  await bridge.focus()
  await page.keyboard.press("Home")
  await page.waitForFunction(
    ({ selector }) => {
      return Array.from(document.querySelectorAll(selector)).some((element) =>
        element.getAttribute("data-wysiwyg-flowdoc-draft-caret-offset") === "0" &&
        element.getAttribute("data-wysiwyg-flowdoc-draft-selection-start") === "0" &&
        element.getAttribute("data-wysiwyg-flowdoc-draft-selection-end") === "0"
      )
    },
    { selector: selectors.draftIslandLayer },
    { timeout: 5000 },
  )
  await page.keyboard.press("Backspace")

  const previousSelectors = nodeEditSelectors(previousNodeId)
  await page.locator(previousSelectors.hiddenInputBridge).waitFor({ state: "attached", timeout: 15000 })
  await expectCurrentEditLayerForNode(page, previousNodeId)
  await expectNoLayoutError(page)

  const afterEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const mergeActionCountAfter = countMergeParagraphActions(afterEvents)
  const structuralMergeCountAfter = countStructuralBackspaceMerges(afterEvents)
  const deleteActionCountAfter = countDeleteEmptyTableCellParagraphActions(afterEvents)
  const structuralDeleteCountAfter = countStructuralTableCellEmptyParagraphDeletes(afterEvents)
  const deleteEvent = latestTableCellEmptyParagraphDeleteEvent(afterEvents, nodeId)
  const afterDoc = await readStoredDocument(page)
  const removedLocation = findTableCellParagraphLocation(afterDoc, nodeId)
  const previousLocation = findTableCellParagraphLocation(afterDoc, previousNodeId)
  assert(!removedLocation, `${label} did not remove ${nodeId}`)
  assert(previousLocation, `${label} removed previous paragraph ${previousNodeId}`)
  assert(
    JSON.stringify(previousLocation.cell.childIds) === JSON.stringify(expectedDeletedChildIds),
    `${label} changed childIds unexpectedly: before=${JSON.stringify(beforeChildIds)} after=${JSON.stringify(previousLocation.cell.childIds)}`,
  )
  assert(
    mergeActionCountAfter === mergeActionCountBefore,
    `${label} dispatched MERGE_PARAGRAPH: before=${mergeActionCountBefore} after=${mergeActionCountAfter}`,
  )
  assert(
    structuralMergeCountAfter === structuralMergeCountBefore,
    `${label} used island merge path: before=${structuralMergeCountBefore} after=${structuralMergeCountAfter}`,
  )
  assert(
    deleteActionCountAfter > deleteActionCountBefore,
    `${label} did not dispatch DELETE_EMPTY_TABLE_CELL_PARAGRAPH: before=${deleteActionCountBefore} after=${deleteActionCountAfter}`,
  )
  assert(
    structuralDeleteCountAfter > structuralDeleteCountBefore,
    `${label} missing structural delete event: before=${structuralDeleteCountBefore} after=${structuralDeleteCountAfter}`,
  )
  assert(deleteEvent, `${label} missing delete event for ${nodeId}`)
  assert(deleteEvent.reason === "empty-table-cell-paragraph-delete", `${label} unexpected reason ${deleteEvent.reason ?? null}`)
  assert(deleteEvent.status === "dispatched-table-cell-delete", `${label} unexpected status ${deleteEvent.status ?? null}`)
  assert(deleteEvent.attemptedOperation === "delete-empty", `${label} unexpected attemptedOperation ${deleteEvent.attemptedOperation ?? null}`)

  await clickToolbarButton(page, "Undo (Ctrl+Z)")
  const undoChildIds = await waitForStoredTableCellChildIds(
    page,
    beforeLocation.tableId,
    beforeLocation.cellId,
    beforeChildIds,
    `${label} undo`,
  )
  const undoDoc = await readStoredDocument(page)
  const undoLocation = findTableCellParagraphLocation(undoDoc, nodeId)
  assert(undoLocation, `${label} undo did not restore ${nodeId}`)
  assert(paragraphText(undoLocation.paragraph).length === 0, `${label} undo restored ${nodeId} with non-empty text`)

  await clickToolbarButton(page, "Redo (Ctrl+Y)")
  const redoChildIds = await waitForStoredTableCellChildIds(
    page,
    beforeLocation.tableId,
    beforeLocation.cellId,
    expectedDeletedChildIds,
    `${label} redo`,
  )
  const redoDoc = await readStoredDocument(page)
  const redoRemovedLocation = findTableCellParagraphLocation(redoDoc, nodeId)
  const redoPreviousLocation = findTableCellParagraphLocation(redoDoc, previousNodeId)
  assert(!redoRemovedLocation, `${label} redo did not remove ${nodeId}`)
  assert(redoPreviousLocation, `${label} redo removed previous paragraph ${previousNodeId}`)

  await openTableCellParagraphEdit(page, previousNodeId)

  return {
    nodeId,
    previousNodeId,
    cellId: beforeLocation.cellId,
    childIds: redoPreviousLocation.cell.childIds,
    reason: deleteEvent.reason,
    status: deleteEvent.status,
    attemptedOperation: deleteEvent.attemptedOperation,
    deleteActionCountDelta: deleteActionCountAfter - deleteActionCountBefore,
    structuralDeleteCountDelta: structuralDeleteCountAfter - structuralDeleteCountBefore,
    mergeParagraphActionCountDelta: mergeActionCountAfter - mergeActionCountBefore,
    structuralMergeCountDelta: structuralMergeCountAfter - structuralMergeCountBefore,
    undoRedo: {
      undoChildIds,
      redoChildIds,
      restoredNode: true,
      redoneNodeRemoved: true,
    },
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
  await expectCurrentEditLayer(page)
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
    const legacyTextareaSelector = `textarea[data-inline-edit-node-id="${targetNodeId}"]:not([data-wysiwyg-native-edit-textarea="true"]):not([data-wysiwyg-input-bridge="true"])`
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
      hiddenInputBridgeCount: document.querySelectorAll(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${targetNodeId}"]`).length,
      draftIslandLayerCount: document.querySelectorAll(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${targetNodeId}"]`).length,
      nativeLayerCount: document.querySelectorAll(`[data-wysiwyg-native-edit-layer="true"][data-inline-edit-node-id="${targetNodeId}"]`).length,
      activeVisualMode: layer?.getAttribute("data-wysiwyg-active-visual-mode") ?? null,
      activeVisualDetail: layer?.getAttribute("data-wysiwyg-active-visual-detail") ?? null,
      nativeTextareaCount: layer?.querySelectorAll('[data-wysiwyg-native-edit-textarea="true"]').length ?? 0,
      legacyTextareaCount: document.querySelectorAll(legacyTextareaSelector).length,
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
  assert(state.layerCount >= 1, `expected active text-engine layers, found ${state.layerCount}`)
  assert(state.hiddenInputBridgeCount === 1, `expected one hidden input bridge, got ${state.hiddenInputBridgeCount}`)
  assert(state.draftIslandLayerCount >= 1, `expected active draft island layers, got ${state.draftIslandLayerCount}`)
  assert(state.nativeLayerCount === 0, `native edit layer leaked into table-cell draft-island path: ${state.nativeLayerCount}`)
  assert(state.activeVisualMode === "flowdoc-draft-editor-island", `expected flowdoc-draft-editor-island visual mode, got ${state.activeVisualMode}`)
  assert(state.activeVisualDetail === "out-of-canvas-v2", `expected out-of-canvas-v2 visual detail, got ${state.activeVisualDetail}`)
  assert(state.nativeTextareaCount === 0, `native edit textarea leaked into table-cell draft-island path: ${state.nativeTextareaCount}`)
  assert(state.legacyTextareaCount === 0, `legacy inline textarea leaked into table-cell edit path: ${state.legacyTextareaCount}`)
  assert(state.liveEchoCount === 0, `live echo leaked into active table-cell edit path: ${state.liveEchoCount}`)
  assert(state.liveCaretCount === 0, `live caret leaked into active table-cell edit path: ${state.liveCaretCount}`)
  assert(state.draftReplacementCount === 0, `draft replacement leaked into active table-cell edit path: ${state.draftReplacementCount}`)
  assert(state.pointerFragmentCount >= 2, `expected pointer fragments for split table-cell edit, got ${state.pointerFragmentCount}`)
  assert(state.previewCandidateCount === 0, `temporary preview candidate remained after settled pagination: ${state.previewCandidateCount}`)
  assert(state.visualChromeCount === 0, `visual-only table-cell chrome remained after settled pagination: ${state.visualChromeCount}`)
  assert(
    perf.draftUpdates >= 1 || perf.draftPaginationSchedules >= 1 || perf.textEngineDraftMeasures >= 1,
    `expected table-cell draft update, draft pagination schedule, or text-engine draft measure event: ${JSON.stringify({
      draftUpdates: perf.draftUpdates,
      draftPaginationSchedules: perf.draftPaginationSchedules,
      textEngineDraftMeasures: perf.textEngineDraftMeasures,
      traceEvents: perf.traceEvents,
    })}`,
  )
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
    if (state.activeVisualMode !== "flowdoc-draft-editor-island") {
      assert(
        Math.abs(state.inputBridgeBox.x - finalTargetBox.x) <= CARET_ALIGNMENT_TOLERANCE_PX &&
          Math.abs(state.inputBridgeBox.y - finalTargetBox.y) <= CARET_ALIGNMENT_TOLERANCE_PX,
        `input bridge drifted away from final target fragment: ${JSON.stringify({ target: finalTargetBox, inputBridge: state.inputBridgeBox })}`,
      )
    }
    assert(state.caretBox, "expected active WYSIWYG caret box")
    if (state.activeVisualMode === "flowdoc-draft-editor-island") {
      const caretTargetBox = state.targetBoxes.find((box) => boxIntersectsVertically(state.caretBox, box)) ?? null
      assert(
        caretTargetBox,
        `caret drifted away from target fragments: ${JSON.stringify({ targets: state.targetBoxes, caret: state.caretBox })}`,
      )
    } else {
      assert(
        boxIntersectsVertically(state.caretBox, finalTargetBox),
        `caret drifted away from final target fragment: ${JSON.stringify({ target: finalTargetBox, caret: state.caretBox })}`,
      )
    }
  }
  const boundaryBackspace = await assertTableCellBoundaryBackspaceDoesNotMerge(page)
  const continuationReentry = smokeTarget.expectContinuationSingleClickReentry
    ? await assertContinuationSingleClickReentry(page, state.pages)
    : null
  const enterSplit = smokeTarget.expectEnterSplit
    ? await assertTableCellEnterSplit(page)
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
    boundaryBackspace,
    enterSplit,
    continuationReentry,
    performanceTrace: {
      draftUpdates: perf.draftUpdates,
      textEngineDraftMeasures: perf.textEngineDraftMeasures,
      browserPreviewPaginations: perf.browserPreviewPaginations,
      firstPaginationDelayMs: Math.round(perf.firstPaginationDelayMs),
      firstDraftSignalKind: perf.firstDraftSignalKind,
      lastDraftSignalKind: perf.lastDraftSignalKind,
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
